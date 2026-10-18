import childProcess from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReproError, VERSION, type ManifestV3, type ManifestV4, type RunOptions, type RunEvent, type TeardownEvent } from './contracts.js';
import { caseRevisionDigest, evaluateCaseObservation } from './browser-case.js';
import { APP_ISOLATION, evaluateAppObservation, validTarget } from './app-contract.js';
import { APP_FAILURE_REASON, APP_REASON_PATTERNS, APP_RESET_MESSAGE, APP_SATISFIED_REASON, appActionMessage, isLoopbackUrl } from './app-execution.js';
import { CASE_ISOLATION } from './case-execution-constants.js';
import { digest } from './manifest.js';
import { boundedFrame, CONTEXT_CLOSE_BASES, exactKeys, LAUNCH_JOIN_BASES, monotonicNs, WORKER_PROTOCOL, type CaseWorkerRequest, type ExecutionReceipt, type ParentFrame } from './case-worker-protocol.js';

const sourceMode = import.meta.url.endsWith('.ts');
const workerURL = new URL(sourceMode ? './case-worker.ts' : './case-worker.js', import.meta.url);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
/** Bind all external source execution bytes; bundled helpers are inside the worker. */
export function caseWorkerArtifactDigest(): string {
  if (!sourceMode) return hash(readFileSync(workerURL));
  const files = ['case-worker.ts', 'case-worker-client.ts', 'case-execution.ts', 'case-execution-constants.ts', 'case-worker-protocol.ts', 'case-process-fence.ts', 'browser-prerequisite.ts', 'app-execution.ts', 'app-contract.ts', 'redaction.ts', 'steps.ts'];
  return digest(Object.fromEntries(files.map(file => [file, hash(readFileSync(new URL(file, import.meta.url)))])));
}
export interface WorkerIdentity { id: string; harnessDigest: string; startedAt: string; startedNs: string }
export interface WorkerCompletion {
  receipt?: ExecutionReceipt;
  attempts?: number;
  ownedDirectory: boolean;
  closed: boolean;
  protocolFailed: boolean;
  completedBeforeDeadline: boolean;
  /** What ended the caller's wait: worker close, a receipt already proving failed cleanup, the deadline, or a protocol/spawn fault. */
  finishedBy: 'close' | 'failed-receipt' | 'deadline' | 'protocol';
  /** Whether the worker reported cleanup start; a close without it is an early exit, not a late cleanup. */
  cleanupStarted: boolean;
}
/** Keep runtime prerequisites, not arbitrary caller credentials or Node preloads. */
function workerEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'SystemRoot',
    'PLAYWRIGHT_BROWSERS_PATH', 'REPRO_BROWSER_CHANNEL', 'INIT_CWD', 'npm_config_init_cwd', 'npm_package_config_init_cwd',
    'npm_config_playwright_browsers_path', 'npm_package_config_playwright_browsers_path']) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return environment;
}
const APPROVED_REASONS = new Set<string>([
  "ADAPTER_TIMEOUT: A browser action did not complete. Inspect the registered setup and retry with a fresh output directory.",
  "BROWSER_CACHE_UNREADABLE: The configured browser cache could not be read. Check PLAYWRIGHT_BROWSERS_PATH points to a readable directory, then retry.",
  "BROWSER_CHANNEL: Omit REPRO_BROWSER_CHANNEL to use pinned Chromium, or explicitly select chrome.",
  "BROWSER_CRASH: Chromium crashed. Check memory/process limits and retry a fresh run.",
  "BROWSER_UNAVAILABLE: Install the pinned Chromium with PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx --no-install playwright install chromium --only-shell, then retry.",
  "CANCELLED: Capture was cancelled. Start a new run with a new output directory to retry.",
  "CANCELLED: The owner cancelled the run. Start a new run to retry.",
  "CANCELLED: The owner cancelled this run. Retry with a fresh output directory.",
  "CASE_OBSERVATION: The complete declared browser observation is unavailable. Check readiness and retry from fresh state.",
  "CASE_REVISION: Choose the registered buggy or fixed revision.",
  "CASE_SCHEMA: Use a schema 3 registered browser case.",
  "CASE_SOURCE_CHANGED: Registered application or wrapper bytes differ from their pinned identity. Restore the installed case files before replay.",
  "CASE_SOURCE_FILE: The registered case needs bounded regular source files without links.",
  "CASE_SOURCE_FILE: The registered case source changed during its safe read.",
  "CASE_SOURCE_UNAVAILABLE: A registered case asset is unavailable. Reinstall the complete Repro package or restore the exported case files before replay.",
  "CASE_UNAVAILABLE: This public repository case is not registered. Choose an installed case.",
  "CSP_BOUNDARY: The case attempted content outside its declared local assets. Register the dependency explicitly before replay.",
  "DEADLINE: The browser deadline expired. Check the registered setup and retry in a fresh output directory.",
  "DEADLINE: The declared replay deadline expired. Check setup and retry a new run.",
  "EVENT_OBSERVER_FAILED: Event recording failed. Retry with a working event observer.",
  "MISSING_OBSERVATION: An expected element or property was unavailable. Check the registered actions and application setup.",
  "NETWORK_BOUNDARY: The case requested an undeclared resource. Register the dependency explicitly before replay.",
  "NETWORK_BOUNDARY: The target requested an undeclared URL. Add an explicit supported dependency before retrying.",
  "OUTPUT_BOUNDARY: Generated output must be in a child directory of .repro-runs.",
  "OUTPUT_CREATE: Run output could not be created safely.",
  "OUTPUT_EXISTS: Run output already exists. Choose a new directory under .repro-runs to preserve earlier evidence.",
  "OUTPUT_FILE: Owned output must be a regular single-link file.",
  "OUTPUT_FILE: Owned state must be a regular single-link file.",
  "OUTPUT_LINK: Generated output cannot traverse a symbolic link or non-directory.",
  "OUTPUT_WRITE: Owned output could not be written safely.",
  "PROVISIONAL_EXPECTATION: Establish the independent expectation before reporting an assertion verdict.",
  "PROVISIONAL_EXPECTATION: The expectation remains provisional; establish its independent contract before claiming a behavioral verdict.",
  "RUNNER_ERROR: Browser or owned server setup failed. Check prerequisites and writable task output, then retry.",
  "SERVER_ADDRESS: The owned case server did not bind. Retry using an available loopback environment.",
  "TARGET_EXCEPTION: The application raised an unrelated JavaScript exception. Check the pinned setup; this is not the declared failure.",
  "The executed frozen assertion is satisfied by this revision.",
  "The frozen assertion has not executed.",
  "The frozen browser-case assertion observed the registered failure.",
  "UNEXPECTED_DIALOG: This registered case does not permit dialogs.",
  "UNEXPECTED_DOWNLOAD: This registered case does not permit downloads.",
  "WEBSOCKET_BOUNDARY: This case supports local static assets only; WebSockets require another adapter.",
  "WRONG_FAILURE: The observed values do not establish the registered target failure or expected behavior. Inspect setup and readiness before retrying.",
]);
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ASSERTION_MESSAGES = ['The frozen browser-case assertion observed the registered failure.', 'The executed frozen assertion is satisfied by this revision.'];
/** What a receipt may contain for each scenario; both share every lifecycle and cleanup predicate. */
interface ReceiptPolicy {
  revision: string; appDigest: string; isolation: string; resetMessage: string; assertionMessages: [string, string];
  actionMessage(action: { id: string; kind: string }): string;
  approvedReason(reason: string): boolean;
  /** Re-evaluate an observation outside the worker; DIFFERENT_FAILURE marks an observed but non-reproducing run. */
  evaluate(observation: unknown): 'target-failure' | 'requirement-satisfied' | 'different-failure';
}
function policyFor(request: CaseWorkerRequest): ReceiptPolicy {
  const input = request.input;
  if (input.schemaVersion === 4) return {
    revision: input.app.revision, appDigest: input.app.sourceDigest, isolation: APP_ISOLATION, resetMessage: APP_RESET_MESSAGE,
    assertionMessages: [APP_FAILURE_REASON, APP_SATISFIED_REASON], actionMessage: appActionMessage,
    approvedReason: reason => APPROVED_REASONS.has(reason) && !reason.startsWith('CASE_') || reason === APP_FAILURE_REASON || reason === APP_SATISFIED_REASON || APP_REASON_PATTERNS.some(pattern => pattern.test(reason)),
    evaluate: observation => {
      try { return evaluateAppObservation(input, observation); }
      catch (cause) { if (cause instanceof ReproError && cause.code === 'DIFFERENT_FAILURE') return 'different-failure'; throw cause; }
    },
  };
  const revision = request.revision ?? input.app.revision;
  return {
    revision, appDigest: caseRevisionDigest(input, revision), isolation: CASE_ISOLATION,
    resetMessage: 'Starting a new owned browser profile and pinned local application.', assertionMessages: [ASSERTION_MESSAGES[0]!, ASSERTION_MESSAGES[1]!],
    actionMessage: action => `Executed registered ${action.kind} action.`, approvedReason: reason => APPROVED_REASONS.has(reason),
    evaluate: observation => evaluateCaseObservation(input, observation),
  };
}
function validResolution(value: unknown, input: ManifestV4): boolean {
  if (!boundedFrame(value) || !exactKeys(value, ['actions', 'checks', 'candidates'])) return false;
  const { actions, checks, candidates } = value;
  const target = (entry: unknown) => { if (entry === null) return true; try { validTarget(entry); return true; } catch { return false; } };
  return Array.isArray(actions) && actions.length <= input.actions.length && actions.every((entry, index) => boundedFrame(entry) && exactKeys(entry, ['id', 'target', 'sensitive'])
      && entry.id === input.actions[index]?.id && typeof entry.sensitive === 'boolean' && target(entry.target))
    && Array.isArray(checks) && checks.length <= input.expectation.checks.length && checks.every(target)
    && Array.isArray(candidates) && candidates.length <= 8 && candidates.every(entry => boundedFrame(entry) && exactKeys(entry, ['selector', 'text'])
      && typeof entry.selector === 'string' && entry.selector.length <= 300 && typeof entry.text === 'string' && entry.text.length <= 120);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function validEvent(value: unknown, request: CaseWorkerRequest, index: number): value is RunEvent {
  if (!boundedFrame(value) || !exactKeys(value, ['seq', 'at', 'type', 'message'], ['actionId'])
    || !Number.isSafeInteger(value.seq) || Number(value.seq) <= 0 || typeof value.at !== 'string' || !ISO_TIME.test(value.at)) return false;
  const policy = policyFor(request);
  if (index === 0) return value.type === 'reset' && value.actionId === undefined && value.message === policy.resetMessage;
  const action = request.input.actions[index - 1];
  if (action) return value.type === 'action-executed' && value.actionId === action.id && value.message === policy.actionMessage(action);
  return index === request.input.actions.length + 1 && value.type === 'assertion' && value.actionId === undefined && policy.assertionMessages.includes(String(value.message));
}
/**
 * The explanatory basis must agree exactly with the flags that decide cleanup: the worker sets cleanupTimedOut
 * only for an expired join, an unacknowledged close or an incomplete drain, so a failure must name its predicate.
 */
function cleanupBasisConsistent(value: Record<string, unknown>): boolean {
  const close = value.contextClose, join = value.launchJoin;
  if (typeof close !== 'string' || typeof join !== 'string'
    || !(CONTEXT_CLOSE_BASES as readonly string[]).includes(close) || !(LAUNCH_JOIN_BASES as readonly string[]).includes(join)) return false;
  if ((value.launchState === 'acquired') === (close === 'not-applicable')) return false;
  if (value.closeAcknowledged !== (close === 'acknowledged')) return false;
  if (join !== 'not-needed' && value.launchState === 'not-attempted') return false;
  // no-budget exists only after a startup join; an acquisition observed past the join deadline has no close budget.
  if (close === 'no-budget' && join === 'not-needed') return false;
  if (join === 'expired' && value.launchState === 'acquired' && close !== 'no-budget') return false;
  const explained = join === 'expired' || !['not-applicable', 'acknowledged'].includes(close) || value.workDrained !== true;
  return value.cleanupTimedOut === explained;
}
function validReceipt(value: unknown, request: CaseWorkerRequest, acknowledged: RunEvent[]): value is ExecutionReceipt {
  const resolving = request.input.schemaVersion === 4 && request.app?.resolve === true;
  if (!boundedFrame(value) || !exactKeys(value, ['result', 'ownedDirectory', 'launchState', 'closeAcknowledged', 'workDrained', 'cleanupTimedOut', 'cleanupStartedNs', 'contextClose', 'launchJoin'], resolving ? ['resolution'] : [])
    || !boundedFrame(value.result) || !cleanupBasisConsistent(value)) return false;
  if (resolving && !validResolution(value.resolution, request.input as ManifestV4)) return false;
  const r = value.result;
  const policy = policyFor(request);
  if (!exactKeys(r, ['id', 'outcome', 'reason', 'manifestDigest', 'assertionDigest', 'harnessDigest', 'appRevision', 'appDigest', 'adapterVersion', 'runnerVersion',
    'seed', 'startedAt', 'durationMs', 'assertionCount', 'observation', 'events', 'artifacts', 'environment'], ['category'])) return false;
  const revision = policy.revision;
  if (r.id !== request.id || r.manifestDigest !== digest(request.input) || r.assertionDigest !== request.input.assertionDigest
    || r.harnessDigest !== request.harnessDigest || r.startedAt !== request.startedAt || r.appRevision !== revision
    || !['', policy.appDigest].includes(String(r.appDigest)) || r.adapterVersion !== VERSION || r.runnerVersion !== VERSION
    || r.seed !== request.input.environment.seed || !finite(r.durationMs) || ![0, 1].includes(Number(r.assertionCount)) || typeof r.assertionCount !== 'number'
    || typeof value.launchState !== 'string' || !['not-attempted', 'unacquired', 'acquired'].includes(value.launchState)
    || typeof value.ownedDirectory !== 'boolean' || typeof value.closeAcknowledged !== 'boolean'
    || typeof value.workDrained !== 'boolean' || typeof value.cleanupTimedOut !== 'boolean' || !monotonicNs(value.cleanupStartedNs)
    || value.closeAcknowledged && value.launchState !== 'acquired' || !value.ownedDirectory && value.launchState !== 'not-attempted'
    || !value.workDrained && !value.cleanupTimedOut
    || typeof r.reason !== 'string' || !policy.approvedReason(r.reason)
    || !['inconclusive', 'cancelled', 'target-failure', 'requirement-satisfied'].includes(String(r.outcome))
    || r.category !== undefined && !['input', 'unsupported', 'environment', 'harness', 'target-failure', 'cancelled', 'verification'].includes(String(r.category))
    || !Array.isArray(r.events) || r.events.length > request.input.actions.length + 2 || !r.events.every((event, index) => validEvent(event, request, index) && event.seq === index + 1)
    || digest(r.events) !== digest(acknowledged) || !Array.isArray(r.artifacts) || r.artifacts.length !== 0) return false;
  if (!boundedFrame(r.environment) || !exactKeys(r.environment, ['platform', 'node', 'browser', 'isolation'])
    || r.environment.platform !== `${process.platform}-${process.arch}` || r.environment.node !== process.version
    || r.environment.isolation !== policy.isolation
    || typeof r.environment.browser !== 'string' || !(r.environment.browser === 'not-launched'
      || /^(?:unknown|[0-9]{1,10}(?:\.[0-9]{1,10}){0,4}) \((?:pinned Chromium|explicit installed Chrome channel)\)$/.test(r.environment.browser))) return false;
  if (r.observation !== null) {
    if (r.assertionCount !== 1) return false;
    let evaluated: string;
    try { evaluated = policy.evaluate(r.observation); } catch { return false; }
    if (['target-failure', 'requirement-satisfied'].includes(String(r.outcome)) && evaluated !== r.outcome) return false;
    if (evaluated === 'different-failure' && !['inconclusive', 'cancelled'].includes(String(r.outcome))) return false;
  } else if (['target-failure', 'requirement-satisfied'].includes(String(r.outcome))) return false;
  if (r.outcome === 'target-failure' || r.outcome === 'requirement-satisfied') {
    const reason = r.outcome === 'target-failure' ? policy.assertionMessages[0] : policy.assertionMessages[1];
    // A declared value is insufficient without the matching acquired execution
    // and complete acknowledged action/assertion stream. Cleanup is checked
    // separately so an actual verdict followed by failed close stays reportable.
    if (value.ownedDirectory !== true || value.launchState !== 'acquired' || r.environment.browser === 'not-launched'
      || r.appDigest !== policy.appDigest || r.assertionCount !== 1
      || r.events.length !== request.input.actions.length + 2 || r.reason !== reason
      || r.events.at(-1)?.message !== reason) return false;
  }
  return !(r.outcome === 'target-failure' && r.category !== 'target-failure' || r.outcome === 'requirement-satisfied' && r.category !== undefined);
}
function validTeardown(value: unknown, id: string): value is TeardownEvent {
  return boundedFrame(value) && exactKeys(value, ['seq', 'runId', 'elapsedMs', 'monotonicNs', 'profileProbeCompletedMonotonicNs', 'profileState', 'phase', 'event'],
    ['outcome', 'late', 'budgetMs', 'deadlineElapsedMs', 'causeKind'])
    && value.runId === id && Number.isSafeInteger(value.seq) && Number(value.seq) > 0 && monotonicNs(value.monotonicNs)
    && monotonicNs(value.profileProbeCompletedMonotonicNs) && finite(value.elapsedMs)
    && ['not-created', 'present', 'absent', 'unavailable'].includes(String(value.profileState))
    && ['run', 'server-close', 'context-close', 'execution-work', 'execution-drain', 'profile-cleanup'].includes(String(value.phase))
    && ['start', 'call', 'wait-start', 'wait-settled', 'wait-timeout', 'wait-return', 'context-close-event', 'browser-disconnected', 'retained', 'removed', 'return'].includes(String(value.event))
    && (value.outcome === undefined || ['resolved', 'rejected', 'timeout'].includes(String(value.outcome)))
    && (value.late === undefined || typeof value.late === 'boolean')
    && (value.budgetMs === undefined || finite(value.budgetMs) && value.budgetMs <= 2000)
    && (value.deadlineElapsedMs === undefined || finite(value.deadlineElapsedMs))
    && (value.causeKind === undefined || ['error', 'non-error'].includes(String(value.causeKind)));
}

/** A fixed trusted worker; callers cannot provide executable paths or receipt flags. */
export function runCaseWorker(input: ManifestV3 | ManifestV4, options: RunOptions, identity: WorkerIdentity): Promise<WorkerCompletion> {
  input = structuredClone(input);
  options = { ...options };
  identity = { ...identity };
  const nonce = randomUUID();
  if (input.schemaVersion === 4 && (!options.app || !isLoopbackUrl(options.app.origin))) throw new ReproError('input', 'APP_ORIGIN', 'A local app run needs the loopback origin of its running app.');
  const request: CaseWorkerRequest = { input, artifactDir: resolve(options.artifactDir), ...identity,
    diagnostics: options.onTeardown !== undefined, ...(options.revision && input.schemaVersion === 3 ? { revision: options.revision } : {}),
    ...(input.schemaVersion === 4 ? { app: structuredClone(options.app!) } : {}) };
  const args = sourceMode ? ['--import', import.meta.resolve('tsx'), fileURLToPath(workerURL)] : [fileURLToPath(workerURL)];
  return new Promise(resolveCompletion => {
    let child: ReturnType<typeof childProcess.spawn>;
    let receipt: ExecutionReceipt | undefined, attempts: number | undefined;
    let ownedDirectory = false, closed = false, protocolFailed = false, returned = false, ready = false;
    let eventSequence = 0, diagnosticCount = 0, diagnosticSequence = 0;
    const acknowledgedEvents: RunEvent[] = [];
    let teardownObserver = options.onTeardown;
    let cleanupStartedNs: string | undefined;
    let closedAtNs: bigint | undefined, ownershipDeadlineNs: bigint | undefined;
    const absoluteDeadlineNs = BigInt(identity.startedNs) + BigInt(input.environment.timeoutMs + 3000) * 1_000_000n;
    let deadlineNs = absoluteDeadlineNs;
    let deadlineTimer: NodeJS.Timeout | undefined;
    const send = (frame: ParentFrame) => {
      if (!child?.connected || !boundedFrame(frame)) return;
      try { child.send(frame, error => { if (error && !returned) { protocolFailed = true; finish('protocol'); } }); }
      catch { if (!returned) { protocolFailed = true; finish('protocol'); } }
    };
    const cancel = () => { if (ready) send({ version: WORKER_PROTOCOL, type: 'cancel', nonce }); };
    const finish = (finishedBy: WorkerCompletion['finishedBy']) => {
      if (returned) return;
      returned = true;
      clearTimeout(deadlineTimer);
      options.signal?.removeEventListener('abort', cancel);
      if (!closed && child) {
        // Failure never certifies completion. Stop requesting new work, ask an
        // established worker to cancel, and let its exact handles stop pinning
        // the caller. Late diagnostics remain observable while the caller lives.
        if (ready) cancel();
        else if (child.connected) child.disconnect();
        child.unref(); child.channel?.unref();
      }
      resolveCompletion({ ...(receipt ? { receipt: structuredClone(receipt) } : {}), ...(attempts === undefined ? {} : { attempts }),
        ownedDirectory, closed, protocolFailed, completedBeforeDeadline: closedAtNs !== undefined && ownershipDeadlineNs !== undefined && closedAtNs <= ownershipDeadlineNs && closedAtNs <= absoluteDeadlineNs, finishedBy,
        cleanupStarted: cleanupStartedNs !== undefined });
      // A timed-out owned worker may finish its existing close later. Retained
      // diagnostics remain bounded; late receipt/exit cannot mutate this result.
    };
    const armDeadline = () => {
      clearTimeout(deadlineTimer);
      const remaining = Math.max(0, Number(deadlineNs - process.hrtime.bigint()) / 1e6);
      deadlineTimer = setTimeout(() => {
        if (process.hrtime.bigint() < deadlineNs) armDeadline(); else finish('deadline');
      }, Math.ceil(remaining));
    };
    const invalid = () => { protocolFailed = true; cancel(); finish('protocol'); };
    // Own process group: a terminal Ctrl-C signals the foreground group, and a
    // directly interrupted worker could never return a certifiable receipt.
    // Cancellation reaches the worker only through this parent's protocol.
    try { child = childProcess.spawn(process.execPath, args, { cwd: process.cwd(), env: workerEnvironment(), detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); }
    catch { protocolFailed = true; finish('protocol'); return; }
    child.on('error', () => { protocolFailed = true; finish('protocol'); });
    child.on('close', (code, signal) => {
      closed = true; closedAtNs = process.hrtime.bigint();
      if (code !== 0 || signal !== null || !receipt) protocolFailed = true;
      if (!returned) finish('close');
    });
    child.on('message', (value: unknown) => {
      if (!boundedFrame(value) || value.version !== WORKER_PROTOCOL) { invalid(); return; }
      if (!ready) {
        if (returned) { if (child.connected) child.disconnect(); return; }
        if (value.type !== 'ready' || !exactKeys(value, ['version', 'type'])) { invalid(); return; }
        ready = true;
        send({ version: WORKER_PROTOCOL, type: 'start', nonce, request });
        if (options.signal?.aborted) cancel();
        return;
      }
      if (value.nonce !== nonce) { invalid(); return; }
      if (value.type === 'owned' && exactKeys(value, ['version', 'type', 'nonce']) && !ownedDirectory && !receipt) { ownedDirectory = true; return; }
      if (value.type === 'cleanup-start' && exactKeys(value, ['version', 'type', 'nonce', 'cleanupStartedNs']) && cleanupStartedNs === undefined && monotonicNs(value.cleanupStartedNs)) {
        const point = BigInt(value.cleanupStartedNs);
        if (point < BigInt(identity.startedNs) || point > process.hrtime.bigint()) { invalid(); return; }
        cleanupStartedNs = value.cleanupStartedNs;
        ownershipDeadlineNs = point + 2_000_000_000n;
        const cleanupAndDrainDeadline = point + 3_000_000_000n;
        deadlineNs = cleanupAndDrainDeadline < absoluteDeadlineNs ? cleanupAndDrainDeadline : absoluteDeadlineNs;
        if (!returned) armDeadline();
        return;
      }
      if (value.type === 'event' && exactKeys(value, ['version', 'type', 'nonce', 'seq', 'event']) && !receipt && validEvent(value.event, request, eventSequence) && value.seq === eventSequence + 1 && value.event.seq === value.seq) {
        eventSequence++; acknowledgedEvents.push(structuredClone(value.event));
        let outcome: 'continue' | 'cancelled' | 'observer-failed' = 'continue';
        try { if (!returned) options.onEvent?.(value.event); } catch { outcome = 'observer-failed'; }
        if (returned || options.signal?.aborted) outcome = 'cancelled';
        send({ version: WORKER_PROTOCOL, type: 'event-ack', nonce, seq: eventSequence, outcome }); return;
      }
      if (value.type === 'teardown' && exactKeys(value, ['version', 'type', 'nonce', 'event']) && diagnosticCount++ < 128 && validTeardown(value.event, identity.id) && value.event.seq === diagnosticSequence + 1) {
        diagnosticSequence++;
        try { teardownObserver?.(value.event); } catch { teardownObserver = undefined; }
        return;
      }
      if (value.type === 'terminal' && exactKeys(value, ['version', 'type', 'nonce', 'receipt', 'attempts', 'sealed']) && !receipt && value.sealed === true && Number.isSafeInteger(value.attempts) && Number(value.attempts) >= 0
        && validReceipt(value.receipt, request, acknowledgedEvents) && value.receipt.ownedDirectory === ownedDirectory && value.receipt.cleanupStartedNs === cleanupStartedNs) {
        receipt = value.receipt; attempts = Number(value.attempts);
        // Missing close acknowledgment remains a bounded failure; its process
        // may continue cleanup and diagnostics after the caller returns.
        if (receipt.cleanupTimedOut || !receipt.workDrained || receipt.launchState === 'acquired' && !receipt.closeAcknowledged) finish('failed-receipt');
        return;
      }
      invalid();
    });
    options.signal?.addEventListener('abort', cancel, { once: true });
    armDeadline();
  });
}
