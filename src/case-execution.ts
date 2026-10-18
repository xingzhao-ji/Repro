import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { lstatSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
// Preserve the bootstrap fence ordering when esbuild bundles this module.
const { chromium } = await import('playwright');
import { VERSION, ReproError, type RunResult, type BrowserCaseObservation, type TeardownEvent, type AppResolution } from './contracts.js';
import { getRegisteredCase, caseSource, caseRevisionDigest, evaluateCaseObservation } from './browser-case.js';
import { APP_ISOLATION, evaluateAppObservation } from './app-contract.js';
import { CASE_ISOLATION } from './case-execution-constants.js';
import { APP_FAILURE_REASON, APP_RESET_MESSAGE, APP_SATISFIED_REASON, isLoopbackUrl, observePage, prepareAppContext, runAppSteps, type AppDiagnostics } from './app-execution.js';
import { digest, validateManifest } from './manifest.js';
import { ownedDirectory } from './paths.js';
import { assertExplicitBrowserCacheAvailable } from './browser-prerequisite.js';

import type { CaseWorkerRequest, ExecutionBridge, ExecutionReceipt } from './case-worker-protocol.js';
type WaitEvent = Pick<TeardownEvent, 'event' | 'outcome' | 'late' | 'budgetMs' | 'causeKind'>;
type DiagnosticClock = { performanceMs: number; monotonicNs: string };
type WaitOutcome = 'resolved' | 'rejected' | 'timeout';
async function settlesWithin(work: Promise<unknown>, timeoutMs: number, observe?: (event: WaitEvent, clock?: DiagnosticClock) => void): Promise<WaitOutcome> {
  let timer: NodeJS.Timeout | undefined;
  let returned = false;
  try {
    const outcome = await Promise.race([
      work.then(() => {
        observe?.({ event: 'wait-settled', outcome: 'resolved', late: returned });
        return 'resolved' as const;
      }, cause => {
        observe?.({ event: 'wait-settled', outcome: 'rejected', late: returned, causeKind: cause instanceof Error ? 'error' : 'non-error' });
        return 'rejected' as const;
      }),
      new Promise<'timeout'>(resolve => {
        const clock = observe ? { performanceMs: performance.now(), monotonicNs: process.hrtime.bigint().toString() } : undefined;
        timer = setTimeout(() => {
          observe?.({ event: 'wait-timeout', outcome: 'timeout' }); resolve('timeout');
        }, timeoutMs);
        // Start the existing timer before filesystem observation or the sink.
        observe?.({ event: 'wait-start', budgetMs: timeoutMs }, clock);
      }),
    ]);
    returned = true;
    observe?.({ event: 'wait-return', outcome });
    return outcome;
  } finally { if (timer) clearTimeout(timer); }
}
/**
 * One certified browser lifecycle for two scenarios: a registered public case
 * served from pinned assets (schema 3), or a user's local app already running
 * on a loopback origin owned by the parent (schema 4). Launch, close, drain and
 * receipt rules are identical for both.
 */
export async function executeCaseBrowser(request: CaseWorkerRequest, bridge: ExecutionBridge): Promise<ExecutionReceipt> {
  const { input, id } = request;
  const app = input.schemaVersion === 4 ? request.app : undefined;
  const diagnostics: AppDiagnostics = { pageErrors: [], console: [], failedRequests: [], blockedHosts: new Set(), dialogs: [], inflight: 0 };
  const resolution: AppResolution = { actions: [], checks: [], candidates: [] };
  const options = { artifactDir: request.artifactDir, signal: bridge.signal, revision: request.revision, onTeardown: bridge.onTeardown };
  const elapsedBeforeExecution = Number(process.hrtime.bigint() - BigInt(request.startedNs)) / 1e6;
  const started = performance.now() - elapsedBeforeExecution;
  const revision = input.schemaVersion === 4 ? input.app.revision : options.revision ?? input.app.revision;
  const result: RunResult = {
    id, outcome: 'inconclusive', reason: 'The frozen assertion has not executed.',
    manifestDigest: digest(input), assertionDigest: input.assertionDigest, harnessDigest: request.harnessDigest,
    appRevision: revision, appDigest: '', adapterVersion: VERSION, runnerVersion: VERSION,
    seed: input.environment.seed, startedAt: request.startedAt, durationMs: 0, assertionCount: 0,
    observation: null, events: [], artifacts: [],
    environment: { platform: `${process.platform}-${process.arch}`, node: process.version, browser: 'not-launched',
      isolation: input.schemaVersion === 4 ? APP_ISOLATION : CASE_ISOLATION },
  };
  let context: BrowserContext | undefined;
  let launching: Promise<BrowserContext> | undefined;
  let launchAttempted = false;
  let launchJoinExpired = false;
  let closing: Promise<void> | undefined;
  let closeRequested = false, freshCloseRequested = false;
  let contextClosedBeforeRequest = false, browserDisconnectedBeforeRequest = false;
  const closeOwned = (owned: BrowserContext) => {
    if (closing) return closing;
    // Pinned public close() is idempotent: an already closed/disconnected
    // context can resolve without requesting any new browser shutdown.
    try {
      freshCloseRequested = !contextClosedBeforeRequest && !browserDisconnectedBeforeRequest
        && !owned.isClosed() && owned.browser()?.isConnected() === true;
    } catch { freshCloseRequested = false; }
    closeRequested = true;
    try { closing = owned.close(); } catch (cause) { closing = Promise.reject(cause); }
    return closing;
  };
  let page: Page | undefined;
  let directory: string | undefined;
  let profile: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  let listening: Promise<void> | undefined;
  let stopped = false;
  let fault: ReproError | undefined;
  let cleanupFailed = false;
  let closeAcknowledged = false;
  let contextClose: ExecutionReceipt['contextClose'] = 'not-applicable';
  let launchJoin: ExecutionReceipt['launchJoin'] = 'not-needed';
  let workDrained: boolean;
  let cleanupStartedNs: string;
  let origin = '';
  let assets = new Map<string, Buffer>();
  let teardownObserver = options.onTeardown;
  let teardownSequence = 0;
  const trace = (phase: TeardownEvent['phase'], event: WaitEvent, clock?: DiagnosticClock) => {
    if (!teardownObserver) return;
    const monotonicNs = clock?.monotonicNs ?? process.hrtime.bigint().toString();
    const elapsedMs = (clock?.performanceMs ?? performance.now()) - started;
    let profileState: TeardownEvent['profileState'] = 'not-created';
    if (profile) {
      try { lstatSync(profile); profileState = 'present'; }
      catch (cause) { profileState = (cause as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'unavailable'; }
    }
    const diagnostic: TeardownEvent = { ...event, seq: ++teardownSequence, runId: id, phase, elapsedMs, monotonicNs,
      profileState, profileProbeCompletedMonotonicNs: process.hrtime.bigint().toString(),
      ...(event.event === 'wait-start' && event.budgetMs !== undefined ? { deadlineElapsedMs: elapsedMs + event.budgetMs } : {}) };
    // Diagnostics cannot change an assertion verdict or expose the sink's exception.
    try { teardownObserver(diagnostic); } catch { teardownObserver = undefined; }
  };
  const observeWait = (phase: TeardownEvent['phase']) => teardownObserver ? (event: WaitEvent, clock?: DiagnosticClock) => trace(phase, event, clock) : undefined;
  const remaining = () => Math.max(1, input.environment.timeoutMs - (performance.now() - started));
  const check = () => {
    if (options.signal?.aborted) throw new ReproError('cancelled', 'CANCELLED', 'Capture was cancelled. Start a new run with a new output directory to retry.');
    if (stopped || performance.now() - started >= input.environment.timeoutMs) throw new ReproError('environment', 'DEADLINE', 'The browser deadline expired. Check the registered setup and retry in a fresh output directory.');
    if (fault) throw fault;
  };
  const emit = async (type: string, message: string, actionId?: string) => {
    const event = { seq: result.events.length + 1, at: new Date().toISOString(), type, message, ...(actionId ? { actionId } : {}) };
    result.events.push(event);
    try { if (await bridge.onEvent(event) === 'observer-failed') throw new Error('EVENT_OBSERVER_FAILED'); }
    catch (cause) { fault = new ReproError('harness', 'EVENT_OBSERVER_FAILED', 'Event recording failed. Retry with a working event observer.', { cause }); }
  };
  const allowed = (url: string, method: string) => {
    try { const parsed = new URL(url); return method === 'GET' && parsed.origin === origin && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && (assets.has(parsed.pathname) || parsed.pathname === '/favicon.ico'); }
    catch { return false; }
  };
  const server = createServer((request, response) => {
    const url = `${origin}${request.url ?? ''}`;
    if (request.headers.host !== new URL(origin).host || !allowed(url, request.method ?? '')) {
      fault = new ReproError('unsupported', 'NETWORK_BOUNDARY', 'The case requested an undeclared resource. Register the dependency explicitly before replay.');
      response.writeHead(403); response.end(); return;
    }
    const path = new URL(url).pathname;
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const body = assets.get(path)!;
    const scriptHashes = path === '/' ? [...body.toString('utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .filter(match => match[1]?.trim()).map(match => `'sha256-${createHash('sha256').update(match[1]!).digest('base64')}'`).join(' ') : '';
    response.writeHead(200, { 'content-type': path === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'none'; script-src 'self' ${scriptHashes}; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` });
    response.end(body);
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxHeadersCount = 40;
  let rejectAbort: ((error: ReproError) => void) | undefined;
  const cancellation = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = () => rejectAbort?.(new ReproError('cancelled', 'CANCELLED', 'The owner cancelled this run. Retry with a fresh output directory.'));
  options.signal?.addEventListener('abort', abort, { once: true });
  let executing: Promise<void> | undefined;
  const work = async () => {
    check();
    const manifest = validateManifest(input);
    if (manifest.schemaVersion === 4) {
      if (!app || !isLoopbackUrl(app.origin)) throw new ReproError('input', 'APP_ORIGIN', 'A local app run needs the loopback origin of its running app.');
      return workApp(manifest);
    }
    if (manifest.schemaVersion !== 3) throw new ReproError('unsupported', 'CASE_SCHEMA', 'Use a schema 3 registered browser case.');
    const definition = getRegisteredCase(manifest.caseId);
    const caseRevision = revision as 'buggy' | 'fixed';
    assets = caseSource(manifest, caseRevision);
    result.appDigest = caseRevisionDigest(manifest, caseRevision);
    const channel = process.env['REPRO_BROWSER_CHANNEL'];
    if (channel !== undefined && channel !== 'chrome') throw new ReproError('unsupported', 'BROWSER_CHANNEL', 'Omit REPRO_BROWSER_CHANNEL to use pinned Chromium, or explicitly select chrome.');
    await assertExplicitBrowserCacheAvailable(channel);
    check();
    directory = ownedDirectory(join(options.artifactDir, id), { exclusive: true });
    bridge.onOwned();
    profile = join(directory, '.profile');
    await mkdir(profile, { mode: 0o700 });
    check();
    listening = new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    await listening;
    const address = server.address();
    if (!address || typeof address === 'string') throw new ReproError('harness', 'SERVER_ADDRESS', 'The owned case server did not bind. Retry using an available loopback environment.');
    origin = `http://127.0.0.1:${address.port}`;
    check();
    await emit('reset', 'Starting a new owned browser profile and pinned local application.');
    check();
    context = await launchOwned(manifest.environment.viewport, channel);
    await context.route('**/*', async route => {
      if (!allowed(route.request().url(), route.request().method())) {
        fault = new ReproError('unsupported', 'NETWORK_BOUNDARY', 'The target requested an undeclared URL. Add an explicit supported dependency before retrying.');
        await route.abort('blockedbyclient'); return;
      }
      await route.continue();
    });
    await context.routeWebSocket('**/*', socket => {
      fault = new ReproError('unsupported', 'WEBSOCKET_BOUNDARY', 'This case supports local static assets only; WebSockets require another adapter.'); socket.close();
    });
    // CSP can reject a dependency before Playwright's request route sees it.
    // Carry only the fact of a violation across the boundary, never its URL/data.
    await context.exposeBinding('__reproBoundaryViolation', () => {
      fault = new ReproError('unsupported', 'CSP_BOUNDARY', 'The case attempted content outside its declared local assets. Register the dependency explicitly before replay.');
    });
    await context.addInitScript(({ seed }) => {
      document.addEventListener('securitypolicyviolation', () => {
        void (globalThis as unknown as { __reproBoundaryViolation: () => Promise<void> }).__reproBoundaryViolation();
      });
      let state = seed >>> 0;
      Math.random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    }, { seed: manifest.environment.seed });
    check();
    page = context.pages()[0] ?? await context.newPage(); check();
    page.on('pageerror', () => { fault = new ReproError('verification', 'TARGET_EXCEPTION', 'The application raised an unrelated JavaScript exception. Check the pinned setup; this is not the declared failure.'); });
    page.on('crash', () => { fault = new ReproError('environment', 'BROWSER_CRASH', 'Chromium crashed. Check memory/process limits and retry a fresh run.'); });
    page.on('dialog', dialog => { fault = new ReproError('unsupported', 'UNEXPECTED_DIALOG', 'This registered case does not permit dialogs.'); void dialog.dismiss(); });
    page.on('download', download => { fault = new ReproError('unsupported', 'UNEXPECTED_DOWNLOAD', 'This registered case does not permit downloads.'); void download.cancel(); });
    await page.clock.setFixedTime(new Date(manifest.environment.clock));
    for (const action of manifest.actions) {
      check();
      if (action.kind === 'navigate') {
        await page.goto(origin, { waitUntil: 'load', timeout: remaining() });
        await page.waitForFunction(({ selector, value }) => document.querySelector(selector)?.textContent === value, definition.ready, { timeout: remaining() });
      } else {
        const target = page.locator(action.target);
        if (action.kind === 'fill') await target.fill(action.value, { timeout: remaining() });
        else if (action.kind === 'click') await target.click({ timeout: remaining() });
        else await target.focus({ timeout: remaining() });
      }
      check(); await emit('action-executed', `Executed registered ${action.kind} action.`, action.id);
    }
    check();
    // Read the small approved projection once. Raw DOM, console, screenshots,
    // traces and unexpected observed strings never enter retained evidence.
    const actual = await page.evaluate(checks => checks.map(({ selector, property }) => {
      const elements = document.querySelectorAll(selector);
      if (elements.length !== 1) return null;
      const element = elements[0]!;
      if (property === 'value') return 'value' in element ? String(element.value) : null;
      if (property === 'checked') return 'checked' in element ? String(element.checked) : null;
      return property === 'innerHTML' ? element.innerHTML : element.textContent;
    }), manifest.expectation.checks);
    check();
    if (actual.some(value => value === null)) throw new ReproError('verification', 'MISSING_OBSERVATION', 'An expected element or property was unavailable. Check the registered actions and application setup.');
    const observation: BrowserCaseObservation = { kind: 'browser-case', values: actual as string[] };
    if (manifest.expectationBasis !== 'independent-contract') throw new ReproError('verification', 'PROVISIONAL_EXPECTATION', 'Establish the independent expectation before reporting an assertion verdict.');
    result.assertionCount = 1;
    const outcome = evaluateCaseObservation(manifest, observation);
    check();
    // The evaluator only returns for allowlisted expected/intended-failure values.
    result.observation = observation;
    result.outcome = outcome;
    if (outcome === 'target-failure') result.category = 'target-failure';
    result.reason = outcome === 'target-failure' ? 'The frozen browser-case assertion observed the registered failure.' : 'The executed frozen assertion is satisfied by this revision.';
    await emit('assertion', result.reason);
  };
  // Shared by both scenarios. Keep acquisition alive through the existing
  // cleanup window so a short operation deadline can still acquire its owner
  // and acknowledge shutdown; check() prevents browser work after the deadline.
  const launchOwned = async (viewport: { width: number; height: number }, channel: string | undefined): Promise<BrowserContext> => {
    launchAttempted = true;
    launching = chromium.launchPersistentContext(profile!, { headless: true, chromiumSandbox: true, timeout: Math.min(5000, remaining() + 2000),
      // Chromium helpers (including fontconfig) also write outside userDataDir.
      // Keep their home/cache inside the same owned cleanup boundary.
      env: { ...process.env, HOME: profile!, XDG_CACHE_HOME: join(profile!, '.cache') },
      viewport, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block', acceptDownloads: false,
      colorScheme: 'light', ...(channel === 'chrome' ? { channel: 'chrome' } : {}) });
    const acquired = await launching;
    if (launchJoinExpired) {
      // A late owner still needs a close request, but cannot authorize deletion
      // or revise the already returned cleanup failure.
      void closeOwned(acquired).catch(() => undefined);
      check();
    }
    context = acquired;
    acquired.once('close', () => {
      if (!closeRequested) contextClosedBeforeRequest = true;
      trace('context-close', { event: 'context-close-event' });
    });
    acquired.browser()?.once('disconnected', () => {
      if (!closeRequested) browserDisconnectedBeforeRequest = true;
      trace('context-close', { event: 'browser-disconnected' });
    });
    check();
    result.environment.browser = `${acquired.browser()?.version() ?? 'unknown'} (${channel === 'chrome' ? 'explicit installed Chrome channel' : 'pinned Chromium'})`;
    return acquired;
  };
  // Schema 4: the parent started the app; this worker only browses its loopback origin.
  const workApp = async (manifest: import('./contracts.js').ManifestV4) => {
    result.appDigest = manifest.app.sourceDigest;
    origin = new URL(app!.origin).origin;
    const channel = process.env['REPRO_BROWSER_CHANNEL'];
    if (channel !== undefined && channel !== 'chrome') throw new ReproError('unsupported', 'BROWSER_CHANNEL', 'Omit REPRO_BROWSER_CHANNEL to use pinned Chromium, or explicitly select chrome.');
    await assertExplicitBrowserCacheAvailable(channel);
    check();
    directory = ownedDirectory(join(options.artifactDir, id), { exclusive: true });
    bridge.onOwned();
    profile = join(directory, '.profile');
    await mkdir(profile, { mode: 0o700 });
    check();
    await emit('reset', APP_RESET_MESSAGE);
    check();
    context = await launchOwned(manifest.environment.viewport, channel);
    await prepareAppContext(context, diagnostics, manifest.environment.seed);
    check();
    page = context.pages()[0] ?? await context.newPage(); check();
    observePage(page, origin, diagnostics);
    page.on('crash', () => { fault = new ReproError('environment', 'BROWSER_CRASH', 'Chromium crashed. Check memory/process limits and retry a fresh run.'); });
    if (manifest.environment.clock) await page.clock.setFixedTime(new Date(manifest.environment.clock));
    const observation = await runAppSteps({ page, manifest, origin, secrets: app!.secrets, resolve: app!.resolve, trace: app!.trace === true, diagnostics, resolution,
      clock: { remaining, check }, emit: (type, message, actionId) => emit(type, message, actionId) });
    check();
    if (manifest.expectationBasis !== 'reporter-approved') throw new ReproError('verification', 'PROVISIONAL_EXPECTATION', 'Establish the independent expectation before reporting an assertion verdict.');
    result.assertionCount = 1;
    result.observation = observation;
    // A different failure throws DIFFERENT_FAILURE: inconclusive, with its observation retained as evidence.
    const outcome = evaluateAppObservation(manifest, observation);
    check();
    result.outcome = outcome;
    if (outcome === 'target-failure') result.category = 'target-failure';
    result.reason = outcome === 'target-failure' ? APP_FAILURE_REASON : APP_SATISFIED_REASON;
    await emit('assertion', result.reason);
  };
  try {
    executing = work();
    if (teardownObserver) void executing.then(
      () => trace('execution-work', { event: 'wait-settled', outcome: 'resolved' }),
      cause => trace('execution-work', { event: 'wait-settled', outcome: 'rejected', causeKind: cause instanceof Error ? 'error' : 'non-error' }),
    );
    const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ReproError('environment', 'DEADLINE', 'The declared replay deadline expired. Check setup and retry a new run.')), remaining()); });
    await Promise.race([executing, cancellation, deadline]);
  } catch (cause) {
    if (cause instanceof ReproError) {
      result.outcome = cause.category === 'cancelled' ? 'cancelled' : 'inconclusive'; result.category = cause.category; result.reason = `${cause.code}: ${cause.message}`;
    } else {
      result.outcome = 'inconclusive'; result.category = 'environment';
      result.reason = cause instanceof Error && /Executable doesn't exist|distribution.*not found/i.test(cause.message)
        ? 'BROWSER_UNAVAILABLE: Install the pinned Chromium with PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx --no-install playwright install chromium --only-shell, then retry.'
        : cause instanceof Error && cause.name === 'TimeoutError' ? 'ADAPTER_TIMEOUT: A browser action did not complete. Inspect the registered setup and retry with a fresh output directory.'
        : 'RUNNER_ERROR: Browser or owned server setup failed. Check prerequisites and writable task output, then retry.';
    }
  } finally {
    cleanupStartedNs = process.hrtime.bigint().toString();
    bridge.onCleanupStart(cleanupStartedNs);
    trace('run', { event: 'start' });
    stopped = true; if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    let startupCleanupDeadline: number | undefined;
    if (!context && launching) {
      startupCleanupDeadline = performance.now() + 2000;
      const joined = await settlesWithin(launching.then(acquired => { if (!launchJoinExpired) context = acquired; }, () => undefined), 2000) === 'resolved';
      if (!joined || performance.now() > startupCleanupDeadline) { launchJoinExpired = true; cleanupFailed = true; launchJoin = 'expired'; }
      else launchJoin = 'joined';
    }
    // Rejected acquisition is classified by the parent only after the sealed
    // process receipt and actual worker close. It is never itself a certificate.
    // Join acquisition even when cancellation wins before the listening event.
    await listening?.catch(() => undefined);
    trace('server-close', { event: 'call' });
    server.closeAllConnections();
    await new Promise<void>(resolve => { if (server.listening) server.close(() => resolve()); else resolve(); });
    trace('server-close', { event: 'wait-settled', outcome: 'resolved' });
    if (context) {
      trace('context-close', { event: 'call' });
      const closeDeadline = startupCleanupDeadline ?? performance.now() + 2000;
      const closeBudget = startupCleanupDeadline === undefined ? 2000 : Math.max(0, closeDeadline - performance.now());
      const close = closeOwned(context);
      if (closeBudget <= 0) { cleanupFailed = true; contextClose = 'no-budget'; void close.catch(() => undefined); }
      else {
        const settled = await settlesWithin(close, closeBudget, observeWait('context-close'));
        const inTime = performance.now() <= closeDeadline;
        closeAcknowledged = freshCloseRequested && settled === 'resolved' && inTime;
        contextClose = settled !== 'resolved' ? settled : !freshCloseRequested ? 'stale' : inTime ? 'acknowledged' : 'late';
        if (!closeAcknowledged) cleanupFailed = true;
      }
    }
    // The drain intentionally handles work rejection; execution-work above
    // observes its original settlement separately without changing that decision.
    workDrained = !executing || await settlesWithin(executing.catch(() => undefined), 1000, observeWait('execution-drain')) === 'resolved';
    if (!workDrained) cleanupFailed = true;
    if (fault && result.outcome !== 'cancelled') { result.outcome = 'inconclusive'; result.category = fault.category; result.reason = `${fault.code}: ${fault.message}`; }
    if (options.signal?.aborted) { result.outcome = 'cancelled'; result.category = 'cancelled'; result.reason = 'CANCELLED: The owner cancelled the run. Start a new run to retry.'; }
    result.durationMs = performance.now() - started;
  }
  return {
    ...(app?.resolve ? { resolution } : {}),
    result, ownedDirectory: directory !== undefined,
    launchState: context ? 'acquired' : launchAttempted ? 'unacquired' : 'not-attempted',
    closeAcknowledged, workDrained, cleanupTimedOut: cleanupFailed, cleanupStartedNs, contextClose, launchJoin,
  };
}
