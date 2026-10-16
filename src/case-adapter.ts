import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { lstatSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { VERSION, ReproError, type ManifestV3, type RunOptions, type RunResult, type BrowserCaseObservation, type TeardownEvent } from './contracts.js';
import { getRegisteredCase, caseSource, caseRevisionDigest, evaluateCaseObservation, BROWSER_CASE_ARTIFACT_DIGEST } from './browser-case.js';
import { digest, validateManifest } from './manifest.js';
import { ownedDirectory } from './paths.js';

const EXECUTABLE_DIGEST = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
type WaitEvent = Pick<TeardownEvent, 'event' | 'outcome' | 'late' | 'budgetMs' | 'causeKind'>;
type DiagnosticClock = { performanceMs: number; monotonicNs: string };
async function settlesWithin(work: Promise<unknown>, timeoutMs: number, observe?: (event: WaitEvent, clock?: DiagnosticClock) => void): Promise<boolean> {
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
    return outcome === 'resolved';
  } finally { if (timer) clearTimeout(timer); }
}
export function caseHarnessDigest(manifest: ManifestV3): string {
  const definition = getRegisteredCase(manifest.caseId);
  return digest({ executable: EXECUTABLE_DIGEST, oracleExecutable: BROWSER_CASE_ARTIFACT_DIGEST, contract: definition.contractDigest, wrapper: definition.wrapperDigest, version: VERSION });
}

/** Registered public source in a fresh sandboxed browser; never an arbitrary host-code executor. */
export async function runCaseBrowser(input: ManifestV3, options: RunOptions): Promise<RunResult> {
  const started = performance.now();
  const id = randomUUID();
  const revision = options.revision ?? input.app.revision;
  const result: RunResult = {
    id, outcome: 'inconclusive', reason: 'The frozen assertion has not executed.',
    manifestDigest: digest(input), assertionDigest: input.assertionDigest, harnessDigest: caseHarnessDigest(input),
    appRevision: revision, appDigest: '', adapterVersion: VERSION, runnerVersion: VERSION,
    seed: input.environment.seed, startedAt: new Date().toISOString(), durationMs: 0, assertionCount: 0,
    observation: null, events: [], artifacts: [],
    environment: { platform: `${process.platform}-${process.arch}`, node: process.version, browser: 'not-launched',
      isolation: 'registered public browser library; fresh owned profile; Chromium sandbox enabled; loopback asset allowlist; not a hostile-code sandbox' },
  };
  let context: BrowserContext | undefined;
  let launching: Promise<BrowserContext> | undefined;
  let page: Page | undefined;
  let directory: string | undefined;
  let profile: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  let listening: Promise<void> | undefined;
  let stopped = false;
  let fault: ReproError | undefined;
  let cleanupFailed = false;
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
  const emit = (type: string, message: string, actionId?: string) => {
    const event = { seq: result.events.length + 1, at: new Date().toISOString(), type, message, ...(actionId ? { actionId } : {}) };
    result.events.push(event);
    try { options.onEvent?.(event); }
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
    if (manifest.schemaVersion !== 3) throw new ReproError('unsupported', 'CASE_SCHEMA', 'Use a schema 3 registered browser case.');
    const definition = getRegisteredCase(manifest.caseId);
    assets = caseSource(manifest, revision);
    result.appDigest = caseRevisionDigest(manifest, revision);
    const channel = process.env['REPRO_BROWSER_CHANNEL'];
    if (channel !== undefined && channel !== 'chrome') throw new ReproError('unsupported', 'BROWSER_CHANNEL', 'Omit REPRO_BROWSER_CHANNEL to use pinned Chromium, or explicitly select chrome.');
    directory = ownedDirectory(join(options.artifactDir, id), { exclusive: true });
    profile = join(directory, '.profile');
    await mkdir(profile, { mode: 0o700 });
    check();
    listening = new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    await listening;
    const address = server.address();
    if (!address || typeof address === 'string') throw new ReproError('harness', 'SERVER_ADDRESS', 'The owned case server did not bind. Retry using an available loopback environment.');
    origin = `http://127.0.0.1:${address.port}`;
    check();
    emit('reset', 'Starting a new owned browser profile and pinned local application.');
    // A five-second startup bound also limits cancellation while launch is pending.
    launching = chromium.launchPersistentContext(profile, { headless: true, chromiumSandbox: true, timeout: Math.min(5000, remaining()),
      // Chromium helpers (including fontconfig) also write outside userDataDir.
      // Keep their home/cache inside the same owned cleanup boundary.
      env: { ...process.env, HOME: profile, XDG_CACHE_HOME: join(profile, '.cache') },
      viewport: manifest.environment.viewport, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block', acceptDownloads: false,
      colorScheme: 'light', ...(channel === 'chrome' ? { channel: 'chrome' } : {}) });
    context = await launching;
    if (teardownObserver) {
      context.once('close', () => trace('context-close', { event: 'context-close-event' }));
      context.browser()?.once('disconnected', () => trace('context-close', { event: 'browser-disconnected' }));
    }
    check();
    result.environment.browser = `${context.browser()?.version() ?? 'unknown'} (${channel === 'chrome' ? 'explicit installed Chrome channel' : 'pinned Chromium'})`;
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
      check(); emit('action-executed', `Executed registered ${action.kind} action.`, action.id);
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
    emit('assertion', result.reason);
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
    trace('run', { event: 'start' });
    stopped = true; if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    if (!context && launching) context = await launching.catch(() => undefined);
    // Join acquisition even when cancellation wins before the listening event.
    await listening?.catch(() => undefined);
    trace('server-close', { event: 'call' });
    server.closeAllConnections();
    await new Promise<void>(resolve => { if (server.listening) server.close(() => resolve()); else resolve(); });
    trace('server-close', { event: 'wait-settled', outcome: 'resolved' });
    if (context) {
      trace('context-close', { event: 'call' });
      if (!await settlesWithin(context.close(), 2000, observeWait('context-close'))) cleanupFailed = true;
    }
    // The drain intentionally handles work rejection; execution-work above
    // observes its original settlement separately without changing that decision.
    if (executing && !await settlesWithin(executing.catch(() => undefined), 1000, observeWait('execution-drain'))) cleanupFailed = true;
    if (profile && !cleanupFailed) {
      trace('profile-cleanup', { event: 'call' });
      try { await rm(profile, { recursive: true, force: true }); trace('profile-cleanup', { event: 'removed', outcome: 'resolved' }); }
      catch { trace('profile-cleanup', { event: 'retained', outcome: 'rejected' }); result.outcome = result.outcome === 'cancelled' ? 'cancelled' : 'inconclusive'; result.category = 'environment'; result.reason = 'PROFILE_CLEANUP_FAILED: The owned temporary profile remains. Remove only this run’s .profile directory after inspecting it.'; }
    } else if (profile) {
      trace('profile-cleanup', { event: 'retained' });
    }
    if (fault && result.outcome !== 'cancelled') { result.outcome = 'inconclusive'; result.category = fault.category; result.reason = `${fault.code}: ${fault.message}`; }
    if (options.signal?.aborted) { result.outcome = 'cancelled'; result.category = 'cancelled'; result.reason = 'CANCELLED: The owner cancelled the run. Start a new run to retry.'; }
    if (cleanupFailed) { result.outcome = options.signal?.aborted ? 'cancelled' : 'inconclusive'; result.category = 'environment'; result.reason = 'CLEANUP_FAILED: Browser shutdown was not acknowledged within the cleanup budget. The owned .profile directory is retained; inspect this run and stop its owned runtime before retrying.'; }
    result.durationMs = performance.now() - started;
  }
  if (directory) {
    const content = Buffer.from(JSON.stringify(result, null, 2) + '\n');
    try {
      await writeFile(join(directory, 'evidence.json'), content, { flag: 'wx', mode: 0o600 });
      result.artifacts.push({ path: `${id}/evidence.json`, sha256: createHash('sha256').update(content).digest('hex'), bytes: content.length });
    } catch { result.outcome = 'inconclusive'; result.category = 'environment'; result.reason = 'EVIDENCE_FAILED: Evidence could not be saved. Check writable output and retry in a new directory.'; }
  }
  trace('run', { event: 'return' });
  return result;
}
