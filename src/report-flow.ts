import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { ReproError, VERSION, type AppCheck, type AppObservation, type AppResolution, type ManifestV4, type RunResult, type Trial } from './contracts.js';
import { createDraftManifest, resolveManifest, checkPasses, evaluateAppObservation } from './app-contract.js';
import { inspectApp, type AppInput, type AppProfile } from './app-inspect.js';
import { childEnvironment, startApp, type RunningApp, type StopReceipt } from './app-process.js';
import { classifyInput, createRedactor, type RedactionKind } from './redaction.js';
import { parseExpectation, parseSteps, describeAction, describeCheck, describeReference, type DraftAction } from './steps.js';
import { runExperiment } from './runner.js';
import { reduce } from './reducer.js';
import { digest } from './manifest.js';
import { ownedDirectory, writeOwnedFile } from './paths.js';
import { generateTestFiles, type GeneratedFile } from './report-test.js';
import { EXTRACTOR, extractReproFiles, renderReport, type FreshCheck, type ReportData, type ReportStatus, type RunLine } from './report-markdown.js';

/**
 * Application + issue description → one REPRO.md. Every status and observation
 * comes from executed runs; questions are returned instead of guesses when an
 * essential is missing; a cancelled report writes no REPRO.md.
 */
export interface ReportRequest {
  app: AppInput;
  title?: string;
  wentWrong: string;
  shouldHappen: string;
  /** The reporter reviewed the parsed checks and the execution scope. */
  confirmed: boolean;
  options?: {
    repetitions?: number; budget?: number; freshCheck?: boolean; reportBlocked?: boolean;
    /** npm cache and offline install for the fresh checkout's .repro dependencies (tests use Repro's own cache). */
    npmCache?: string; offline?: boolean;
    /** Override the selector of a check whose element could not be identified (from the candidates Repro offered). */
    checkSelectors?: Record<number, string>;
    /** The reporter declares that the expected values do not depend on which of the steps ran, which permits shortening. */
    stepsIndependent?: boolean;
  };
}
export type ReportStage = 'inspect' | 'capture' | 'reproduce' | 'reduce' | 'confirm' | 'test' | 'fresh-check' | 'write';
export interface ReportProgress { stage: ReportStage; message: string; at: string }
export interface Question { field: 'repository' | 'start' | 'url' | 'install' | 'steps' | 'expectation' | 'confirm' | 'check-target'; question: string; line?: number; suggestion?: string; candidates?: { selector: string; text: string }[]; check?: number }
export interface ReportOutcome {
  status: ReportStatus | 'cancelled' | 'needs-input';
  questions: Question[];
  markdown: string | null; path: string | null; evidenceDir: string;
  summary: string;
  /** A preview of what Repro understood, for confirmation in the UI and CLI. */
  understood: { steps: string[]; checks: string[]; notes: string[] };
  /** The report title, given or derived from the description. */
  title?: string;
}
interface RunRecord { label: string; result: RunResult; serverLogs: string[]; stopped: boolean }

const MAX_TEXT = 6000;
/** Written by a guided demonstration where only the reporter knows the expected value. */
export const EXPECTED_PLACEHOLDER = '(expected value)';
const now = () => new Date().toISOString();
export function slugify(text: string): string {
  const slug = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length <= 48) return slug || 'bug';
  // Cut at a word boundary so file names stay readable.
  const cut = slug.slice(0, 49);
  return (cut.lastIndexOf('-') > 20 ? cut.slice(0, cut.lastIndexOf('-')) : slug.slice(0, 48)).replace(/-+$/, '');
}
function titleFrom(request: ReportRequest, profile: AppProfile): string {
  const explicit = request.title?.trim();
  if (explicit) return explicit.slice(0, 120);
  const firstNote = parseSteps(request.wentWrong).notes[0] ?? request.wentWrong.split(/\r?\n/).find(line => line.trim())?.trim() ?? 'Unexpected behavior';
  return `${profile.name}: ${firstNote.replace(/^[-*\d.)\s]+/, '').slice(0, 100)}`;
}
const opensApp = (action: DraftAction) => action.kind === 'navigate' && (action.line === 0 || /^(?:open|go to|visit|load)\s+(?:the\s+)?(?:app|application|site|home\s*page|homepage|start page|main page)\b/i.test(action.text));

export interface PreparedReport {
  profile: AppProfile; steps: ReturnType<typeof parseSteps>; expectation: ReturnType<typeof parseExpectation>;
  questions: Question[]; understood: ReportOutcome['understood'];
}
/** Read-only first stage: inspect the app, parse the description and list what is missing. Runs nothing, writes nothing. */
export async function prepareReport(request: ReportRequest): Promise<PreparedReport> {
  if ((request.wentWrong?.length ?? 0) > MAX_TEXT || (request.shouldHappen?.length ?? 0) > MAX_TEXT) throw new ReproError('input', 'TEXT_TOO_LONG', `Keep each description under ${MAX_TEXT} characters.`);
  const profile = await inspectApp(request.app);
  const steps = parseSteps(request.wentWrong ?? '');
  const expectation = parseExpectation(request.shouldHappen ?? '');
  for (const [index, selector] of Object.entries(request.options?.checkSelectors ?? {})) {
    const check = expectation.checks[Number(index)];
    if (check && typeof selector === 'string' && selector.length <= 300) check.reference = { css: selector };
  }
  const understood: ReportOutcome['understood'] = {
    steps: steps.actions.map(action => describeAction({ ...action, secret: null }, describeReference(action.reference))),
    checks: expectation.checks.map(check => describeCheck(check, describeReference(check.reference))),
    notes: [...steps.notes, ...expectation.notes],
  };
  const questions: Question[] = profile.missing.map(item => ({ field: item.field, question: item.question }));
  if (!steps.actions.length) questions.push({ field: 'steps', question: 'What did you do? Write the steps one per line, for example: Type "milk" into "Add an item", then Press Enter.' });
  for (const problem of steps.problems) questions.push({ field: 'steps', question: `${problem.message}${problem.text ? ` (“${problem.text.slice(0, 80)}”)` : ''}`, line: problem.line, suggestion: problem.suggestion });
  if (!expectation.checks.length) questions.push({ field: 'expectation', question: 'What exactly should happen? Name the element and the value, for example: "Total" should show "$8.10", or "#items-left" should show "2 items left".' });
  for (const problem of expectation.problems) questions.push({ field: 'expectation', question: `${problem.message}${problem.text ? ` (“${problem.text.slice(0, 80)}”)` : ''}`, line: problem.line, suggestion: problem.suggestion });
  for (const check of expectation.checks) if (check.expected === EXPECTED_PLACEHOLDER) questions.push({ field: 'expectation', question: `Replace "${EXPECTED_PLACEHOLDER}" in “${check.text.slice(0, 60)}” with the value the element should show.` });
  for (const check of expectation.checks) if (classifyInput(check.expected) !== 'plain') questions.push({ field: 'expectation', question: `The expected value for “${check.text.slice(0, 60)}” looks like a credential or personal data. Use test data instead; Repro does not put such values in reports.` });
  if (!request.confirmed && !questions.length) questions.push({ field: 'confirm', question: 'Review what Repro understood and confirm it before Repro starts your app.' });
  return { profile, steps, expectation, questions, understood };
}

/** Plain statement of what Repro will execute, shown for confirmation before anything runs. */
export function executionScope(profile: AppProfile, freshCheck = true): string[] {
  const plan = profile.plan;
  return [
    !plan ? 'Nothing yet: Repro still needs to know how to start the app.'
      : plan.kind === 'external' ? `Use the app already running at ${plan.url} (Repro cannot restart it between runs).`
      : plan.kind === 'static' ? `Serve the folder ${plan.directory} with Repro's own read-only file server, once per run.`
      : `Run \`${plan.command}\` in ${plan.directory} (${plan.source}), once per run, on a free local port, and stop it after each run.`,
    'Open the app in a fresh, headless Chromium profile and block every request to a host other than this machine.',
    ...(freshCheck && profile.git?.commit && profile.startPlan ? [`Test the finished report in a separate clone of commit ${profile.git.commit.slice(0, 12)}${profile.install ? `, running \`${profile.install}\` there` : ''}.`] : []),
    'Keep everything on this machine. Nothing is uploaded, and your app folder is not changed.',
  ];
}

export async function generateReport(request: ReportRequest, context: { output: string; signal?: AbortSignal; onProgress?: (progress: ReportProgress) => void }): Promise<ReportOutcome> {
  const signal = context.signal;
  const progress = (stage: ReportStage, message: string) => { try { context.onProgress?.({ stage, message, at: now() }); } catch { /* observers cannot change the report */ } };
  const cancelled = () => signal?.aborted === true;
  progress('inspect', 'Checking your app and reading the description');
  const { profile, steps, expectation, questions, understood } = await prepareReport(request);
  const outcomeWithout = (status: ReportOutcome['status'], summary: string, extra: Partial<ReportOutcome> = {}): ReportOutcome =>
    ({ status, questions: [], markdown: null, path: null, evidenceDir: '', summary, understood, ...extra });
  if (questions.length) return outcomeWithout('needs-input', 'Repro needs a little more information before it can run.', { questions });
  if (cancelled()) return outcomeWithout('cancelled', 'Cancelled before any run. No report was written.');
  const evidenceDir = ownedDirectory(context.output, { exclusive: true });
  const title = titleFrom(request, profile);
  const slug = slugify(title.replace(/^[^:]+:\s*/, '') || title);
  const outcome = (status: ReportOutcome['status'], summary: string, extra: Partial<ReportOutcome> = {}): ReportOutcome =>
    ({ status, questions: [], markdown: null, path: null, evidenceDir, summary, understood, title, ...extra });

  // Withheld inputs: values typed into password-like fields or that look like credentials or personal data.
  const secrets: Record<string, string> = {};
  const secretPurposes: Record<string, string> = {};
  const secretIndex = new Map<number, string>();
  let secretCount = 0, personalCount = 0;
  const withhold = (index: number, action: { value: string; reference: DraftAction['reference'] }, sensitivity: 'secret' | 'personal') => {
    const name = sensitivity === 'secret' ? `REPRO_SECRET_${++secretCount}` : `REPRO_INPUT_${++personalCount}`;
    secrets[name] = action.value;
    secretPurposes[name] = `the value typed into ${describeReference(action.reference)} (${sensitivity === 'secret' ? 'a credential' : 'personal data'}, withheld by Repro)`;
    secretIndex.set(index, name);
    return name;
  };
  steps.actions.forEach((action, index) => {
    if (action.kind !== 'fill' && action.kind !== 'select') return;
    const sensitivity = classifyInput(action.value, { label: action.reference?.text ?? '' });
    if (sensitivity !== 'plain') withhold(index, action, sensitivity);
  });
  const draft = createDraftManifest({ id: slug, name: profile.name, description: (request.shouldHappen ?? '').slice(0, 4000), actions: steps.actions, checks: expectation.checks,
    sourceDigest: profile.sourceDigest, commit: profile.git?.commit ?? null, dirty: profile.git?.dirty ?? false, approved: request.confirmed, secrets: secretIndex });
  await writeOwnedFile(join(evidenceDir, 'request.json'), JSON.stringify({ app: { ...request.app }, title, wentWrong: request.wentWrong, shouldHappen: request.shouldHappen, understood }, null, 2));

  const runs: RunRecord[] = [];
  const serverLogs: string[] = [];
  let basePath = '/';
  const runOnce = async (manifest: ManifestV4, label: string, artifactDir: string, options: { resolve: boolean; trace?: boolean; onResolution?: (resolution: AppResolution) => void; signal?: AbortSignal }): Promise<RunResult> => {
    let app: RunningApp;
    try { app = await startApp(profile.plan!, options.signal ? { signal: options.signal } : {}); }
    catch (error) {
      const logs = (error as { logs?: string[] }).logs ?? [];
      if (logs.length) serverLogs.splice(0, serverLogs.length, ...logs.slice(-60));
      throw error;
    }
    let result: RunResult;
    let receipt: StopReceipt;
    try {
      result = await runExperiment(manifest, { artifactDir, ...(options.signal ? { signal: options.signal } : {}), app: { origin: app.origin, secrets, resolve: options.resolve, ...(options.trace ? { trace: true } : {}) },
        ...(options.onResolution ? { onResolution: options.onResolution } : {}) });
    } finally {
      receipt = await app.stop();
      if (!serverLogs.length || label === 'Capture') serverLogs.splice(0, serverLogs.length, ...app.logs().slice(-60));
    }
    // A surviving app process means this run's cleanup is not certified, whatever the browser observed.
    if (!receipt.stopped) result = { ...result, outcome: 'inconclusive', category: 'environment', reason: 'APP_CLEANUP_FAILED: The app process group or its port was still alive after the stop deadline.' };
    runs.push({ label, result, serverLogs: app.logs(), stopped: receipt.stopped });
    return result;
  };

  // Capture: resolve each reporter reference on the live page and freeze the first observed failure.
  progress('capture', 'Starting your app and following your steps in a fresh browser');
  let resolution: AppResolution | undefined;
  let capture: RunResult;
  try {
    if (profile.plan?.kind === 'external' && profile.plan.url) basePath = new URL(profile.plan.url).pathname;
    const firstApp = profile.plan && profile.plan.kind !== 'external' ? profile.plan : null;
    if (firstApp) {
      // Discover the base path the app prints (for example a Vite base) once, then stop it.
      const probe = await startApp(firstApp, signal ? { signal } : {});
      basePath = new URL(probe.url).pathname;
      const receipt = await probe.stop();
      if (!receipt.stopped) throw new ReproError('environment', 'APP_CLEANUP_FAILED', 'The app process group or its port was still alive after the stop deadline, so no run can start from a fresh app.');
    }
    const based = basePath !== '/' ? { ...draft, actions: draft.actions.map((action, index) => opensApp(steps.actions[index]!) ? { ...action, value: basePath } : action) } as ManifestV4 : draft;
    capture = await runOnce(based, 'Capture', join(evidenceDir, 'capture'), { resolve: true, onResolution: value => { resolution = value; }, ...(signal ? { signal } : {}) });
  } catch (error) {
    if (cancelled() || (error instanceof ReproError && error.category === 'cancelled')) return outcome('cancelled', 'Cancelled while starting the app. No report was written; the app was stopped.');
    if (!(error instanceof ReproError)) throw error;
    return blockedOrAsk(error.code, error.message);
  }
  if (cancelled() || capture.outcome === 'cancelled') return outcome('cancelled', 'Cancelled during the first run. No report was written; the app and browser were stopped.');
  function blockedOrAsk(code: string, rawReason: string): ReportOutcome | Promise<ReportOutcome> {
    // "step-3" is the worker's id; people read "Step 3 (Click "Add")", from the draft so withheld values stay withheld.
    const reason = rawReason.replace(/\bstep-(\d+)\b/, (_, number: string) => { const action = draft.actions[Number(number) - 1]; return action ? `Step ${number} (${action.text})` : `Step ${number}`; });
    const checkIndex = Number(/check (\d+)/.exec(reason)?.[1] ?? 1) - 1;
    const checkReference = expectation.checks[checkIndex]?.reference ?? null;
    const question: Question = code === 'CHECK_TARGET_UNRESOLVED'
      ? { field: 'check-target', check: checkIndex, question: `Repro could not tell which element ${describeReference(checkReference)} refers to (check ${checkIndex + 1}). Choose one of the elements below, or quote a CSS selector such as "#total". On the command line, answer with --check-element ${checkIndex + 1}=SELECTOR.`, candidates: resolution?.candidates ?? [] }
      : /^STEP_/.test(code) ? { field: 'steps', line: Number(/step-(\d+)/.exec(rawReason)?.[1] ?? 0), candidates: resolution?.candidates ?? [],
        question: `${reason.replace(/^[A-Z_]+: /, '')} ${resolution?.candidates.length ? 'Reword that step with one of the names below, exactly as shown or its beginning.' : 'Check the wording of that step against the page.'}` }
      : { field: 'start', question: reason.replace(/^[A-Z_]+: /, '') };
    if (!request.options?.reportBlocked) return outcome('needs-input', `Repro could not complete the first run: ${reason.replace(/^[A-Z_]+: /, '')}`, { questions: [question] });
    return finish('blocked', `Repro could not complete the reported steps: ${reason.replace(/^[A-Z_]+: /, '')}`, null, draft, null, []);
  }
  // Only a conclusive capture can freeze a failure or count as meeting the expectation; anything else
  // (including an observation followed by uncertified cleanup) blocks the report.
  if (capture.outcome !== 'target-failure' && capture.outcome !== 'requirement-satisfied') return blockedOrAsk(/^([A-Z_]+):/.exec(capture.reason)?.[1] ?? 'BLOCKED', capture.reason);

  const observed = capture.observation as AppObservation | null;
  const captureFailed = capture.outcome === 'target-failure';
  let resolved: ManifestV4;
  try {
    resolved = resolveManifest(basePath !== '/' ? { ...draft, actions: draft.actions.map((action, index) => opensApp(steps.actions[index]!) ? { ...action, value: basePath } : action) } as ManifestV4 : draft,
      resolution!, captureFailed ? observed!.values : null, index => withhold(index, steps.actions[index]!, 'secret'));
  } catch (error) {
    if (error instanceof ReproError) return blockedOrAsk(error.code, `${error.code}: ${error.message}`);
    throw error;
  }
  await writeOwnedFile(join(evidenceDir, 'manifest.resolved.json'), JSON.stringify(resolved, null, 2));

  // Reproduce from fresh state with the frozen steps and failure.
  const repetitions = Math.min(5, Math.max(2, request.options?.repetitions ?? 3));
  const reproductions: RunResult[] = [];
  for (let index = 1; index <= repetitions; index++) {
    if (cancelled()) return outcome('cancelled', 'Cancelled while reproducing. No report was written; the app and browser were stopped.');
    progress('reproduce', `Reproducing from a fresh start (run ${index} of ${repetitions})`);
    try { reproductions.push(await runOnce(resolved, `Reproduction ${index}`, join(evidenceDir, `reproduce-${index}`), { resolve: false, trace: index === 1, ...(signal ? { signal } : {}) })); }
    catch (error) {
      if (cancelled()) return outcome('cancelled', 'Cancelled while reproducing. No report was written; the app and browser were stopped.');
      if (!(error instanceof ReproError)) throw error;
      reproductions.push({ ...capture, id: `not-run-${index}`, outcome: 'inconclusive', reason: `${error.code}: ${error.message}`, observation: null, assertionCount: 0, durationMs: 0 });
    }
  }
  if (cancelled() || reproductions.some(run => run.outcome === 'cancelled')) return outcome('cancelled', 'Cancelled while reproducing. No report was written; the app and browser were stopped.');
  const failures = reproductions.filter(run => run.outcome === 'target-failure').length;
  const satisfied = reproductions.filter(run => run.outcome === 'requirement-satisfied').length;
  const different = reproductions.filter(run => /^DIFFERENT_FAILURE/.test(run.reason)).length;
  const conclusive = failures + satisfied + different;
  let status: ReportStatus;
  let statusDetail: string;
  // An app that was already running was not restarted between runs; only the browser profile was fresh.
  const freshStart = profile.plan?.kind === 'external' ? 'from a fresh browser profile against the already-running app' : 'from a fresh start';
  if (captureFailed && failures === conclusive && failures >= 2) {
    status = 'reproduced';
    statusDetail = `the failure occurred in ${failures + 1} of ${failures + 1} conclusive runs ${freshStart} (the capture and ${failures} repetitions)${conclusive < repetitions ? `; ${repetitions - conclusive} more run(s) were inconclusive` : ''}.`;
  } else if (!captureFailed && capture.outcome === 'requirement-satisfied' && satisfied === conclusive && satisfied >= 2) {
    status = 'not-reproduced';
    statusDetail = `the expected behavior happened in all ${satisfied + 1} conclusive runs ${freshStart}.`;
  } else if ((captureFailed ? failures + 1 : failures) > 0 && conclusive > 0) {
    status = 'intermittent';
    statusDetail = `the failure occurred in ${(captureFailed ? 1 : 0) + failures} of ${conclusive + 1} runs; ${satisfied + (captureFailed ? 0 : 1)} met the expectation${different ? ` and ${different} failed differently` : ''}.`;
  } else {
    status = 'blocked';
    statusDetail = `too few runs were conclusive to decide (${conclusive} of ${repetitions + 1}). ${reproductions.find(run => run.outcome === 'inconclusive')?.reason.replace(/^[A-Z_]+: /, '') ?? ''}`.trim();
  }

  // Reduce the steps while the reported failure stays the same.
  let final = resolved;
  let reductionNote = 'Repro did not shorten these steps.';
  let trials: Trial[] = [];
  const confirmations: RunResult[] = [];
  // Steps that changed a checked value in the traced run are kept: the expected value may depend on them,
  // so removing them could reach the same wrong-looking value through correct behavior.
  const traced = (reproductions[0]?.observation as AppObservation | null | undefined)?.trace;
  const pinned = traced && traced.length === resolved.actions.length
    ? resolved.actions.filter((_action, index) => index === 0 || JSON.stringify(traced[index]) !== JSON.stringify(traced[index - 1])).map(action => action.id) : resolved.actions.map(action => action.id);
  // Shortening is sound only when the expected values cannot depend on which steps ran: invariant checks
  // ("no errors", "should not show …", "should not be visible"), or the reporter declares it. Otherwise a
  // removed step may be the one that should have changed the value ("clicking does nothing" bugs).
  const invariant = resolved.expectation.checks.every(check => check.property === 'page-errors' || check.comparison === 'not-equals' || check.comparison === 'not-contains' || (check.property === 'visible' && check.expected === 'false'));
  const mayShorten = invariant || request.options?.stepsIndependent === true;
  const neutral = resolved.actions.filter(action => !pinned.includes(action.id)).map(action => resolved.actions.indexOf(action) + 1);
  if (status === 'reproduced' && resolved.actions.length > 2 && !mayShorten) {
    reductionNote = `These are the reported steps. Repro did not shorten them: the expected value can depend on every step, so a shorter sequence might show the same value for a different reason.${neutral.length ? ` In Repro's runs, step${neutral.length === 1 ? '' : 's'} ${neutral.join(', ')} did not change a checked value; they may be unnecessary, but Repro has not verified that.` : ''}`;
  } else if (status === 'reproduced' && resolved.actions.length > 2 && pinned.length < resolved.actions.length) {
    progress('reduce', 'Looking for the shortest steps that still show the bug');
    const budget = Math.min(120, Math.max(8, request.options?.budget ?? 40));
    let executions = 0;
    const reduction = await reduce(resolved, async (candidate, options) => {
      executions++;
      progress('reduce', `Trying shorter step sequences (run ${executions} of at most ${budget})`);
      return runOnce(candidate as ManifestV4, `Reduction run ${executions}`, options.artifactDir, { resolve: false, ...(options.signal ? { signal: options.signal } : {}) });
    }, { artifactDir: join(evidenceDir, 'reduction'), maxExecutions: budget, maxDurationMs: 20 * 60_000, repetitions: 2, pinned, ...(signal ? { signal } : {}) });
    trials = reduction.trials;
    await writeOwnedFile(join(evidenceDir, 'reduction.json'), JSON.stringify(reduction, null, 2));
    if (cancelled() || reduction.status === 'cancelled') return outcome('cancelled', 'Cancelled while shortening the steps. No report was written; the app and browser were stopped.');
    const reduced = reduction.manifest as ManifestV4;
    const removed = resolved.actions.length - reduced.actions.length;
    if (removed > 0) {
      for (let index = 1; index <= repetitions; index++) {
        if (cancelled()) return outcome('cancelled', 'Cancelled while confirming the shorter steps. No report was written.');
        progress('confirm', `Confirming the shorter steps (run ${index} of ${repetitions})`);
        try { confirmations.push(await runOnce(reduced, `Shorter steps ${index}`, join(evidenceDir, `confirm-${index}`), { resolve: false, ...(signal ? { signal } : {}) })); }
        catch (error) {
          if (cancelled()) return outcome('cancelled', 'Cancelled while confirming the shorter steps. No report was written; the app and browser were stopped.');
          if (!(error instanceof ReproError)) throw error;
          // An app that fails to start is an inconclusive confirmation: the full reported steps are used.
          confirmations.push({ ...capture, id: `not-run-confirm-${index}`, outcome: 'inconclusive', reason: `${error.code}: ${error.message}`, observation: null, assertionCount: 0, durationMs: 0 });
        }
      }
      if (cancelled() || confirmations.some(run => run.outcome === 'cancelled')) return outcome('cancelled', 'Cancelled while confirming the shorter steps. No report was written; the app and browser were stopped.');
      if (confirmations.every(run => run.outcome === 'target-failure')) {
        final = reduced;
        reductionNote = `This is the shortest sequence Repro verified within its search budget: ${reduced.actions.length} of ${resolved.actions.length} reported steps, confirmed in ${repetitions} more fresh runs. ${invariant ? 'The expected behavior does not depend on which steps ran' : 'The reporter declared that the expected values do not depend on which steps ran'}, and Repro kept every step that changed a checked value. ${reduction.minimality === 'dependency-group-1-minimal' ? 'Removing any other single remaining step stopped the failure; shorter sequences might still exist.' : 'Minimality is not established: some neighbouring sequences were inconclusive or untested.'}`;
      } else reductionNote = `Repro found a shorter sequence (${reduced.actions.length} steps), but it did not fail in all ${repetitions} confirmation runs, so the full reported steps are used.`;
    } else if (reduction.trials.length <= 1 && reduction.status === 'complete') reductionNote = 'These are the reported steps. Every step changed a checked value or prepared a step that did, so Repro removed none.';
    else reductionNote = reduction.status === 'complete' ? `Repro tried removing steps (${reduction.trials.length - 1} trials); none kept the same failure, so these are the reported steps.` : `Repro could not shorten the steps within its budget (${reduction.reason})`;
  } else if (status === 'reproduced' && resolved.actions.length > 2) reductionNote = 'These are the reported steps. Every step changed a checked value or prepared one that did, so Repro removed none.';
  else if (status === 'reproduced') reductionNote = 'These are the reported steps; they were already short.';
  else if (status !== 'blocked') reductionNote = `These are the reported steps. Repro shortens steps only when the failure reproduces consistently.`;

  if (cancelled()) return outcome('cancelled', 'Cancelled. No report was written; the app and browser were stopped.');
  return finish(status, statusDetail, capture, final, observed, reproductions, { trials, confirmations, reductionNote, resolved });

  async function finish(statusValue: ReportStatus, detail: string, captureRun: RunResult | null, manifest: ManifestV4, observation: AppObservation | null, repeats: RunResult[],
    extra: { trials?: Trial[]; confirmations?: RunResult[]; reductionNote?: string; resolved?: ManifestV4 } = {}): Promise<ReportOutcome> {
    if (cancelled()) return outcome('cancelled', 'Cancelled. No report was written; the app and browser were stopped.');
    progress('test', 'Writing the regression test');
    const knownSecrets = [...Object.values(secrets)];
    const redactor = createRedactor({ knownSecrets });
    const codeRedactor = createRedactor({ knownSecrets, mode: 'code' });
    // Observed values inside the test are sanitized like every other observation; credentials never reach a file block.
    // A frozen value that had to be redacted can no longer be compared exactly; the test then compares pass/fail only.
    const testManifest = manifest.failure ? { ...manifest, failure: { ...manifest.failure,
      values: manifest.failure.values.map(value => value === null ? null : redactor.redact(value)),
      exact: manifest.failure.exact.map((exact, index) => exact && (manifest.failure!.values[index] === null || createRedactor({ knownSecrets }).redact(manifest.failure!.values[index]!) === manifest.failure!.values[index])) } } : manifest;
    const testFiles = statusValue === 'blocked' && manifest.resolution === 'draft' ? [] : generateTestFiles({ manifest: testManifest, title, slug, start: profile.startPlan, appDirectory: profile.directory, secretPurposes })
      .map(file => { const content = codeRedactor.redact(file.content); return content === file.content ? file : { ...file, content, sha256: createHash('sha256').update(content).digest('hex') }; });
    let patchFile: GeneratedFile | null = null, patchRedacted = false;
    const rawPatch = profile.git?.patch ?? '';
    if (rawPatch) {
      const content = codeRedactor.redact(rawPatch);
      patchRedacted = content !== rawPatch;
      patchFile = { path: '.repro/local-changes.patch', language: 'diff', content: content.endsWith('\n') ? content : `${content}\n`, sha256: createHash('sha256').update(content.endsWith('\n') ? content : `${content}\n`).digest('hex') };
    }
    const testPath = testFiles[0]?.path ?? `.repro/${slug}.test.mjs`;
    // Reduction runs are summarized per trial below; the table lists capture, repetitions and confirmations.
    const runLines: RunLine[] = runs.filter(run => !run.label.startsWith('Reduction run')).map(run => ({ label: run.label, outcome: describeOutcome(run.result),
      values: (run.result.observation as AppObservation | null)?.values?.map(value => value === null ? null : redactor.redact(value)) ?? null,
      note: ['target-failure', 'requirement-satisfied'].includes(run.result.outcome) ? '' : run.result.reason.replace(/^[A-Z_]+: /, '').slice(0, 160), durationMs: run.result.durationMs }));
    const stepNumber = new Map((extra.resolved ?? manifest).actions.map((action, index) => [action.id, `${index + 1}. ${redactor.redact(describeAction(action, describeReference(action.target ?? action.reference)))}`]));
    // An element the reporter picked from Repro's list keeps the name they used for it.
    const named = parseExpectation(request.shouldHappen ?? '').checks.map(check => check.reference?.text ?? null);
    const chosen = request.options?.checkSelectors ?? {};
    const checkTarget = (check: AppCheck, index: number) => named[index] && chosen[index] && check.target?.by === 'css' && check.target.value === chosen[index]
      ? `"${redactor.redact(named[index]!)}" (the element \`${check.target.value}\` the reporter chose for it)` : describeReference(check.target ?? check.reference);
    const checks = manifest.expectation.checks.map((check, index) => ({ text: describeCheck(check, checkTarget(check, index)), expected: check.expected,
      observed: observation ? redact(observation.values[index] ?? null) : null, passed: observation ? checkPasses(check, observation.values[index] ?? null) : false }));
    function redact(value: string | null) { return value === null ? null : redactor.redact(value); }
    // Logs come from a run of exactly the final steps, preferring one that reproduced the failure.
    const finalDigest = digest(manifest);
    const finalRuns = runs.filter(run => run.result.manifestDigest === finalDigest);
    const logRun = finalRuns.filter(run => run.result.outcome === 'target-failure').at(-1) ?? finalRuns.at(-1) ?? runs.at(-1);
    const logSource = logRun?.result.observation as AppObservation | null | undefined;
    const logServer = logRun?.serverLogs.length ? logRun.serverLogs.slice(-60) : serverLogs;
    const suspected: string[] = [];
    if (logSource) {
      for (const error of logSource.pageErrors.slice(0, 5)) suspected.push(`An uncaught JavaScript error occurred during a run that reproduced the bug: \`${redactor.redact(error).replace(/`/g, "'")}\`. It may be related; Repro did not verify that.`);
      for (const request of logSource.failedRequests.slice(0, 5)) suspected.push(`A local request failed during a run that reproduced the bug: \`${redactor.redact(request).replace(/`/g, "'")}\`. It may be related.`);
    }
    if (statusValue === 'reproduced' && extra.trials?.length && extra.resolved && manifest.actions.length < extra.resolved.actions.length) suspected.push('The failure needs only the steps listed above; steps Repro removed did not affect it. This narrows where to look; it is not a diagnosis.');
    const limitations = [...profile.notes];
    if (logSource?.blockedHosts.length) limitations.push(`Requests to non-local hosts were blocked during every run (${logSource.blockedHosts.slice(0, 8).map(host => `\`${host}\``).join(', ')}). If the bug depends on them, this report cannot show it.`);
    limitations.push('State outside the browser and the app process (databases, files, other services) was not reset between runs.');
    limitations.push(`Only ${captureRun?.environment.browser ?? 'pinned Chromium'} in headless mode was used; other browsers were not tested.`);
    limitations.push(`Runs used ${manifest.environment.clock ? `a fixed clock (${manifest.environment.clock})` : 'the real clock'}, a ${manifest.environment.viewport.width}×${manifest.environment.viewport.height} viewport, en-US locale, UTC time zone and a seeded Math.random.`);
    limitations.push('Repro stops the app’s own process group after each run. Processes the app detaches into another group are not tracked.');
    if (Object.keys(secretPurposes).length) limitations.push(`${Object.keys(secretPurposes).length} typed value(s) are withheld; the recipient must supply them as environment variables.`);
    const missing: string[] = [];
    if (!profile.git) missing.push('An exact source revision (the app folder is not tracked by git).');
    else if (!profile.git.remotes.length) missing.push('A shared location for the repository (no git remote is configured).');
    else if (!profile.git.pushedTo.length) missing.push('The commit is not on any remote branch yet; push it so the recipient can check it out.');
    if (profile.git?.omitted.length) missing.push(`${profile.git.omitted.length} local change(s) could not be embedded: ${profile.git.omitted.map(item => item.path).join(', ')}.`);
    if (!profile.startPlan) missing.push('How to start the app from source (only a running URL was given).');
    // Fresh checkout: follow this report's own instructions in a separate clone.
    let fresh: FreshCheck = { status: 'not-run', summary: 'Not run.', observed: null, commands: [], durationMs: 0, output: [] };
    const draftData = (freshCheck: FreshCheck): ReportData => ({
      title, slug, generatedAt: now().slice(0, 16).replace('T', ' ') + ' UTC', reproVersion: VERSION, status: statusValue, statusDetail: detail,
      reporter: { wentWrong: redactor.redact(request.wentWrong ?? ''), shouldHappen: redactor.redact(request.shouldHappen ?? ''), notes: steps.notes.map(note => redactor.redact(note)) },
      expectation: { checks, approval: manifest.humanApproval },
      observedFrom: captureRun ? 'capture run' : 'not observed',
      steps: { final: manifest.actions.map(action => redactor.redact(describeAction(action, describeReference(action.target ?? action.reference)))),
        original: (extra.resolved ?? manifest).actions.map(action => redactor.redact(describeAction(action, describeReference(action.target ?? action.reference)))),
        reduction: extra.reductionNote ?? 'These are the reported steps.', secrets: Object.entries(secretPurposes).map(([name, purpose]) => ({ name, purpose })) },
      runs: runLines, trials: (extra.trials ?? []).map(trial => ({ removed: trial.removed.map(id => stepNumber.get(id) ?? id), outcome: trial.accepted ? 'reproduced the failure in both runs' : trial.reason.replace(/^[A-Z_]+: /, ''), accepted: trial.accepted, runs: trial.runIds.length })),
      app: { name: profile.name, folderNote: '', git: profile.git?.commit ? { commit: profile.git.commit, branch: profile.git.branch, remotes: profile.git.remotes, pushedTo: profile.git.pushedTo, appPath: profile.git.appPath,
        dirty: profile.git.dirty, changed: profile.git.changed.map(change => ({ path: redactor.redact(change.path), status: change.status })), untracked: profile.git.untracked.map(path => redactor.redact(path)), omitted: profile.git.omitted.map(item => ({ path: redactor.redact(item.path), reason: item.reason })) } : null,
        patch: patchFile, patchRedacted,
        start: profile.startPlan ? { command: profile.startPlan.command, source: profile.startPlan.source, url: profile.startPlan.url, kind: profile.startPlan.kind } : profile.plan ? { command: null, source: profile.plan.source, url: profile.plan.url, kind: profile.plan.kind } : null,
        install: profile.install, packageManager: profile.packageManager },
      environment: { os: profile.environment.os, node: profile.environment.node, packageManager: profile.packageManager ? `${profile.packageManager} ${profile.environment.packageManagerVersion ?? ''}`.trim() : null,
        browser: captureRun?.environment.browser ?? 'pinned Chromium', nodeDeclared: profile.packageFacts?.engines['node'] ?? null },
      dependencies: { declared: profile.packageFacts?.dependencies ?? {}, dev: profile.packageFacts?.devDependencies ?? {}, resolved: profile.packageFacts?.resolved ?? {}, lockfile: profile.packageFacts?.lockfile ?? null },
      test: { files: testFiles, testPath }, fresh: freshCheck,
      logs: { pageErrors: (logSource?.pageErrors ?? []).map(entry => redactor.redact(entry)), console: (logSource?.console ?? []).map(entry => redactor.redact(entry)),
        failedRequests: (logSource?.failedRequests ?? []).map(entry => redactor.redact(entry)), blockedHosts: logSource?.blockedHosts ?? [], dialogs: (logSource?.dialogs ?? []).map(entry => redactor.redact(entry)),
        server: logServer.map(line => redactor.redact(line)).slice(-40) },
      suspected, verified: [], limitations, missing, redactions: { ...redactor.counts() },
      details: { 'Report id': evidenceDir.split('/').pop()!, 'Manifest digest': digest(manifest), 'Assertion digest': manifest.assertionDigest, 'Harness digest': captureRun?.harnessDigest ?? '—',
        'Source digest': manifest.app.sourceDigest, 'Runs': String(runs.length), 'Repro adapter': `${manifest.adapter.id} ${manifest.adapter.version}` },
    });
    if (statusValue !== 'blocked' && request.options?.freshCheck !== false && testFiles.length) {
      progress('fresh-check', 'Checking the report in a fresh checkout of your app');
      fresh = await freshCheck(profile, renderReport(draftData({ ...fresh, summary: 'Pending.' })), testPath, statusValue, manifest, {
        dir: join(evidenceDir, 'fresh-checkout'), secrets, rawPatch, patchRedacted, ...(signal ? { signal } : {}), ...(request.options?.npmCache ? { npmCache: request.options.npmCache } : {}), offline: request.options?.offline === true,
      }, redactor);
      if (cancelled()) return outcome('cancelled', 'Cancelled during the fresh-checkout check. No report was written; its processes were stopped.');
    } else if (statusValue === 'blocked') fresh = { ...fresh, summary: 'Not run, because the steps could not be completed.' };
    else if (request.options?.freshCheck === false) fresh = { ...fresh, summary: 'Not run (disabled for this report).' };
    if (fresh.status === 'not-run' && profile.git?.commit && !profile.startPlan) fresh = { ...fresh, summary: 'Not run: Repro does not know how to start the app from source.' };
    progress('write', 'Writing REPRO.md');
    let markdown = renderReport(draftData(fresh));
    // Defense in depth: no withheld value or unambiguous credential may survive anywhere in the file.
    // File blocks were sanitized before hashing, so this scan can only change narrative text.
    const scan = createRedactor({ knownSecrets, mode: 'credentials' });
    if (scan.redact(markdown) !== markdown) {
      markdown = createRedactor({ knownSecrets, mode: 'credentials' }).redact(renderReport({ ...draftData(fresh), redactions: mergeCounts(redactor.counts(), scan.counts()) }));
      if (extractReproFiles(markdown).some(file => !file.valid)) throw new ReproError('harness', 'REPORT_REDACTION', 'A credential reached a generated file; the report was not written.');
    }
    const path = join(evidenceDir, 'REPRO.md');
    await writeOwnedFile(path, markdown);
    await writeOwnedFile(join(evidenceDir, 'report.json'), JSON.stringify({ status: statusValue, detail, title, slug, manifest, runs: runs.map(run => ({ label: run.label, result: run.result, stopped: run.stopped })),
      trials: extra.trials ?? [], fresh, profile: { ...profile, git: profile.git ? { ...profile.git, patch: `(sha256 ${createHash('sha256').update(profile.git.patch).digest('hex')})` } : null } }, null, 2));
    return outcome(statusValue, `${({ reproduced: 'Reproduced', intermittent: 'Intermittent', 'not-reproduced': 'Not reproduced', blocked: 'Blocked' } as const)[statusValue]}: ${detail}`, { markdown, path });
  }
}

function mergeCounts(a: Partial<Record<RedactionKind, number>>, b: Partial<Record<RedactionKind, number>>) {
  const merged: Partial<Record<RedactionKind, number>> = { ...a };
  for (const [kind, count] of Object.entries(b)) merged[kind as RedactionKind] = (merged[kind as RedactionKind] ?? 0) + (count ?? 0);
  return merged;
}
function describeOutcome(result: RunResult): string {
  if (result.outcome === 'target-failure') return 'reproduced the failure';
  if (result.outcome === 'requirement-satisfied') return 'expected behavior';
  if (/^DIFFERENT_FAILURE/.test(result.reason)) return 'failed differently';
  return result.outcome === 'cancelled' ? 'cancelled' : 'inconclusive';
}

interface Command { label: string; command: string; args: string[]; cwd: string; env?: NodeJS.ProcessEnv; timeoutMs: number }
/** Run one owned command in its own process group; cancellation stops that group. */
function execute(step: Command, signal?: AbortSignal): Promise<{ code: number | null; output: string; timedOut: boolean; cancelled: boolean }> {
  // An already cancelled report never starts another command.
  if (signal?.aborted) return Promise.resolve({ code: null, output: '', timedOut: false, cancelled: true });
  return new Promise(resolveRun => {
    const child = spawn(step.command, step.args, { cwd: step.cwd, env: step.env ?? childEnvironment(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false;
    const append = (chunk: Buffer) => { output += chunk.toString('utf8'); if (output.length > 200_000) output = output.slice(-150_000); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const kill = () => { try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* exited */ } setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* exited */ } }, 3000).unref(); };
    const timer = setTimeout(() => { timedOut = true; kill(); }, step.timeoutMs);
    signal?.addEventListener('abort', kill, { once: true });
    child.on('error', () => { clearTimeout(timer); resolveRun({ code: -1, output: `${output}\n${step.command} could not start`, timedOut, cancelled: signal?.aborted === true }); });
    child.on('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', kill); resolveRun({ code, output, timedOut, cancelled: signal?.aborted === true }); });
  });
}
const failed = (label: string, result: { code: number | null; timedOut: boolean; cancelled: boolean }, timeoutMs: number) => result.cancelled ? 'Cancelled.'
  : result.timedOut ? `Failed: \`${label}\` did not finish within ${Math.round(timeoutMs / 1000)} s, so Repro stopped it.` : `Failed: \`${label}\` exited with code ${result.code}; see the output below.`;
async function freshCheck(profile: AppProfile, markdown: string, testPath: string, status: ReportStatus, manifest: ManifestV4,
  options: { dir: string; secrets: Record<string, string>; rawPatch: string; patchRedacted: boolean; signal?: AbortSignal; npmCache?: string; offline: boolean },
  redactor: ReturnType<typeof createRedactor>): Promise<FreshCheck> {
  const started = performance.now();
  const git = profile.git;
  if (!git?.commit) return { status: 'not-run', summary: 'Not run: there is no git commit to check out.', observed: null, commands: [], durationMs: 0, output: [] };
  if (!profile.startPlan) return { status: 'not-run', summary: 'Not run: Repro does not know how to start the app from source.', observed: null, commands: [], durationMs: 0, output: [] };
  const work = ownedDirectory(options.dir, { exclusive: true });
  const clone = join(work, 'checkout');
  const app = git.appPath === '.' ? clone : join(clone, git.appPath);
  const commands: string[] = [], output: string[] = [];
  const record = (shown: string, text: string) => { commands.push(shown); output.push(...redactor.redact(text).split('\n').filter(line => line.trim() && !/^\s+at\s/.test(line)).slice(-15)); };
  const npm = (args: string[]) => [...args, ...(options.npmCache ? ['--cache', options.npmCache] : []), ...(options.offline ? ['--offline'] : [])];
  const plan: Command[] = [
    { label: 'clone', command: 'git', args: ['clone', '--quiet', '--no-hardlinks', '--no-checkout', git.root, clone], cwd: work, timeoutMs: 120_000 },
    { label: 'checkout', command: 'git', args: ['-C', clone, 'checkout', '--quiet', git.commit], cwd: work, timeoutMs: 60_000 },
  ];
  const finish = async (result: Omit<FreshCheck, 'commands' | 'output' | 'durationMs'>): Promise<FreshCheck> => {
    // Keep the commands and output; remove the checkout and its installed dependencies.
    await rm(clone, { recursive: true, force: true }).catch(() => undefined);
    await writeFile(join(work, 'fresh-check.json'), JSON.stringify({ ...result, commands, output }, null, 2)).catch(() => undefined);
    return { ...result, commands, output: output.slice(-60), durationMs: performance.now() - started };
  };
  for (const step of plan) {
    const result = await execute(step, options.signal);
    record(`${step.command} ${step.args.map(arg => arg === git.root ? '<your repository>' : arg.startsWith(work) ? relative(work, arg) || '.' : arg).join(' ')}`, result.output);
    if (result.code !== 0) return finish({ status: 'failed', summary: failed(step.label, result, step.timeoutMs), observed: null });
  }
  await writeFile(join(app, 'REPRO.md'), markdown);
  const extract = await execute({ label: 'extract', command: '/bin/sh', args: ['-c', `${EXTRACTOR} REPRO.md`], cwd: app, timeoutMs: 30_000 }, options.signal);
  record('node --input-type=module -e "<the extraction command above>" REPRO.md', extract.output);
  if (extract.code !== 0) return finish({ status: 'failed', summary: 'Failed: the extraction command in this report did not write the test files.', observed: null });
  const files = extractReproFiles(markdown);
  if (files.some(file => !file.valid)) return finish({ status: 'failed', summary: 'Failed: a test file did not match its SHA-256.', observed: null });
  if (git.dirty && options.rawPatch) {
    // Applied from the repository root, as REPRO.md instructs, so changes outside an app subfolder are not skipped.
    // The embedded copy is applied when it is unredacted; otherwise the exact local changes are, and the report says so.
    const apply = options.patchRedacted
      ? await new Promise<{ code: number | null; output: string; timedOut: boolean; cancelled: boolean }>(resolveApply => {
        const child = spawn('git', ['apply', '-'], { cwd: clone, env: childEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] });
        let text = ''; child.stdout.on('data', chunk => { text += chunk; }); child.stderr.on('data', chunk => { text += chunk; });
        child.on('close', code => resolveApply({ code, output: text, timedOut: false, cancelled: false })); child.stdin.end(options.rawPatch);
      })
      : await execute({ label: 'apply', command: 'git', args: ['apply', join(app, '.repro/local-changes.patch')], cwd: clone, timeoutMs: 30_000 }, options.signal);
    record(options.patchRedacted ? 'git apply (the exact local changes; the report copy is redacted)' : git.appPath === '.' ? 'git apply .repro/local-changes.patch' : 'git -C "$(git rev-parse --show-toplevel)" apply "$PWD/.repro/local-changes.patch"', apply.output);
    if (apply.code !== 0) return finish({ status: 'failed', summary: apply.cancelled ? 'Cancelled.' : 'Failed: the local-changes patch did not apply to the checked-out commit.', observed: null });
  }
  // Child processes run in the checkout, so a relative browser cache path must be made absolute first.
  const browsers = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  const base = childEnvironment(browsers && browsers !== '0' ? { PLAYWRIGHT_BROWSERS_PATH: resolve(browsers) } : {});
  const environment = { ...base, ...options.secrets };
  const steps: Command[] = [
    ...(profile.install ? [{ label: 'install', command: '/bin/sh', args: ['-c', profile.install + (options.npmCache && profile.install.startsWith('npm ') ? ` --cache ${JSON.stringify(options.npmCache)}` : '') + (options.offline && profile.install.startsWith('npm ') ? ' --offline' : '')], cwd: app, timeoutMs: 600_000 }] : []),
    { label: 'test dependencies', command: 'npm', args: npm(['ci', '--no-audit', '--no-fund']), cwd: join(app, '.repro'), env: base, timeoutMs: 600_000 },
    { label: 'browser', command: 'npx', args: ['--no-install', 'playwright', 'install', 'chromium', '--only-shell'], cwd: join(app, '.repro'), env: base, timeoutMs: 600_000 },
  ];
  const shownCommands: Record<string, string> = { install: profile.install ?? '', 'test dependencies': '(cd .repro && npm ci)', browser: '(cd .repro && npx playwright install chromium --only-shell)' };
  for (const step of steps) {
    const result = await execute(step, options.signal);
    record(shownCommands[step.label] ?? step.label, result.output);
    if (result.code !== 0 || result.cancelled) return finish({ status: 'failed', summary: failed(step.label, result, step.timeoutMs), observed: null });
  }
  // The test starts the app in its own process group and names it here, so Repro can stop it if the test is stopped.
  const pgidFile = join(work, 'app-pgid');
  const test = await execute({ label: 'test', command: process.execPath, args: ['--test', testPath], cwd: app, env: { ...environment, REPRO_APP_PGID_FILE: pgidFile }, timeoutMs: 300_000 }, options.signal);
  await stopRecordedGroup(pgidFile);
  record(`node --test ${testPath}`, test.output);
  if (test.cancelled || test.timedOut) return finish({ status: 'failed', summary: failed('node --test', test, 300_000), observed: null });
  const line = /REPRO_OBSERVATION (\{.*\})/.exec(test.output)?.[1];
  let observation: { values: (string | null)[]; satisfied: boolean } | null;
  try { observation = line ? JSON.parse(line) : null; } catch { observation = null; }
  if (!observation || !Array.isArray(observation.values) || observation.values.length !== manifest.expectation.checks.length) return finish({ status: 'failed', summary: `Failed: the test exited with code ${test.code} before reporting an observation; see the output below.`, observed: null });
  // Classified here from the raw observation and the unredacted frozen failure, not from the test's own label.
  let verdict: 'target-failure' | 'requirement-satisfied' | 'different';
  try { verdict = evaluateAppObservation(manifest, { kind: 'local-app', values: observation.values, url: '', pageErrors: [], console: [], failedRequests: [], blockedHosts: [], dialogs: [] }); }
  catch { verdict = 'different'; }
  const values = observation.values.map(value => value === null ? null : redactor.redact(value));
  const where = `in a clean clone of the commit${git.dirty ? ' with the local changes applied' : ''}`;
  if (status === 'not-reproduced') return finish(verdict === 'requirement-satisfied' && test.code === 0
    ? { status: 'passed', summary: `Passed: ${where}, the test ran and the expected behavior held, as in Repro’s runs.`, observed: values }
    : { status: 'failed', summary: `In a clean clone the expected behavior did not hold, unlike Repro’s runs in the working copy (one run). The difference may be in the local environment or state.`, observed: values });
  if (status === 'intermittent') return finish({ status: verdict === 'requirement-satisfied' ? 'passed' : 'reproduced',
    summary: `One run ${where}: the test ${verdict === 'requirement-satisfied' ? 'passed' : verdict === 'target-failure' ? 'failed in the recorded way' : 'failed with a different result'}. The bug is intermittent, so one run decides nothing.`, observed: values });
  if (verdict === 'target-failure' && test.code !== 0) return finish({ status: 'reproduced', summary: `Reproduced: ${where}, the test failed with the same observed result.`, observed: values });
  if (verdict === 'requirement-satisfied') return finish({ status: 'not-reproduced', summary: `**Not reproduced in a clean clone:** the test passed ${where} (one run). Something outside the commit and patch may matter (local state, untracked files or environment).`, observed: values });
  return finish({ status: 'not-reproduced', summary: '**Different in a clean clone:** the test failed, but with a different observed result than in Repro’s runs.', observed: values });
}
/** Stop an app process group a generated test recorded, if it outlived the test. */
async function stopRecordedGroup(file: string): Promise<void> {
  let pgid: number;
  try { pgid = Number((await readFile(file, 'utf8')).trim()); } catch { return; }
  if (!Number.isSafeInteger(pgid) || pgid <= 1) return;
  const alive = () => { try { process.kill(-pgid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } };
  if (!alive()) return;
  try { process.kill(-pgid, 'SIGTERM'); } catch { /* exited */ }
  for (let waited = 0; alive() && waited < 5000; waited += 100) await new Promise(resolveTimer => setTimeout(resolveTimer, 100));
  if (alive()) try { process.kill(-pgid, 'SIGKILL'); } catch { /* exited */ }
}

