import { randomUUID, createHash } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ADAPTER, VERSION, ReproError, type Manifest, type RunFunction, type RunResult, type SearchOrder } from './contracts.js';
import { fixtureSource, fixtureDigest } from './fixture.js';
import { ASSERTION_DIGEST, ORACLE_ARTIFACT_DIGEST, assertObservation, TargetFailure, type Observation } from './oracle.js';
import { digest, validateManifest } from './manifest.js';
import { ownedDirectory } from './paths.js';
import { searchContract, expectationEstablished, SEARCH_CONTRACT_ARTIFACT_DIGEST, SEARCH_CONTRACT_DIGEST } from './search-contract.js';

const EXECUTABLE_ARTIFACT_DIGEST = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');

async function collectArtifacts(directory: string, id: string, result: RunResult): Promise<void> {
  await writeFile(join(directory, 'evidence.json'), JSON.stringify({ ...result, artifacts: undefined }, null, 2) + '\n', { mode: 0o600 });
  for (const name of ['trace.zip', 'observation.png', 'evidence.json']) {
    try {
      const bytes = await readFile(join(directory, name));
      result.artifacts.push({ path: `${id}/${name}`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
    } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
}

/** Registered synthetic code only. Browser processes cannot write the Node oracle. */
function validateBoundary(manifest: Manifest): void {
  if ((manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) || manifest.adapter.id !== ADAPTER || manifest.adapter.version !== VERSION || manifest.runnerVersion !== VERSION) {
    throw new ReproError('unsupported', 'VERSION_MISMATCH', 'This runner requires schema 1 or 2 and the installed registered adapter and runner versions.');
  }
  const contract = searchContract(manifest);
  if (manifest.assertionDigest !== contract.assertionDigest) {
    throw new ReproError('verification', 'ORACLE_CHANGED', 'The assertion identity differs from the supplied frozen baseline.');
  }
  if (manifest.app.sourceDigest !== fixtureDigest(manifest.app.revision)) {
    throw new ReproError('verification', 'SOURCE_CHANGED', 'The registered frontend source digest does not match the manifest.');
  }
  if (manifest.boundary.behavior !== 'frontend' || manifest.boundary.network !== 'controlled-http' || manifest.boundary.database !== 'none' || manifest.boundary.externalDependencies.length !== 0) {
    throw new ReproError('unsupported', 'UNSUPPORTED_BOUNDARY', 'Only the registered frontend and owned controlled HTTP service are supported; no database, authentication, or external services.');
  }
  const environment = manifest.environment;
  if (environment.browser !== 'chromium' || environment.locale !== 'en-US' || environment.timezoneId !== 'UTC' || !Number.isFinite(Date.parse(environment.clock)) || !Number.isSafeInteger(environment.seed) || environment.seed < 0 || environment.seed > 0xffffffff || !Number.isInteger(environment.timeoutMs) || environment.timeoutMs < 1 || environment.timeoutMs > 60000) {
    throw new ReproError('unsupported', 'UNSUPPORTED_ENVIRONMENT', 'The registered adapter requires Chromium, en-US, UTC, a valid explicit clock and uint32 seed, and a 1–60000 ms deadline.');
  }
  const { width, height } = environment.viewport;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || width > 4096 || height < 64 || height > 4096) throw new ReproError('unsupported', 'UNSUPPORTED_VIEWPORT', 'Viewport dimensions are outside the registered bounds.');
  if (manifest.actions.length > 256) throw new ReproError('input', 'ACTION_LIMIT', 'The registered adapter allows at most 256 actions.');
  const completed = new Set<string>();
  const kinds: string[] = [];
  for (const action of manifest.actions) {
    if (completed.has(action.id) || action.dependsOn.some(id => !completed.has(id))) throw new ReproError('input', 'ACTION_DEPENDENCY', 'An action dependency is absent, duplicated, or ordered after its dependent.');
    if ((action.kind === 'navigate' && action.value === '/') || (action.kind === 'noise' && action.value === 'focus') || (action.kind === 'search' && ['alpha', 'beta'].includes(action.value))) {
      completed.add(action.id);
      if (action.kind !== 'noise') kinds.push(`${action.kind}:${action.value}`);
    } else throw new ReproError('unsupported', 'UNSUPPORTED_ACTION', 'The registered adapter accepts only local navigation, input focus, and synthetic alpha/beta searches.');
  }
  if (!isDeepStrictEqual(kinds, ['navigate:/', ...contract.searchOrder.map(query => `search:${query}`)])) throw new ReproError('verification', 'MISSING_STEPS', 'The intended failure requires navigation and both ordered search requests; the proposed experiment is incomplete.');
  if (!isDeepStrictEqual(manifest.responses, contract.responses)) throw new ReproError('verification', 'RESPONSE_SCHEDULE', 'The frozen scenario requires response 2 then 1 with its registered synthetic result bodies.');
}

function isAllowedRequest(rawUrl: string, origin: string, method: string, searchOrder: SearchOrder = ['alpha', 'beta']): boolean {
  const url = new URL(rawUrl);
  if (url.origin !== origin || method !== 'GET' || url.username || url.password || url.hash) return false;
  return url.pathname === '/' && !url.search || url.pathname === '/favicon.ico' && !url.search || url.pathname === '/api/search' &&
    (url.search === `?requestId=1&query=${searchOrder[0]}` || url.search === `?requestId=2&query=${searchOrder[1]}`);
}

export async function installNetworkBoundary(context: BrowserContext, origin: string, reject: (error: ReproError) => void, searchOrder: SearchOrder = ['alpha', 'beta']): Promise<void> {
  await context.route('**/*', async route => {
    if (!isAllowedRequest(route.request().url(), origin, route.request().method(), searchOrder)) {
      reject(new ReproError('unsupported', 'NETWORK_BOUNDARY', 'The browser attempted a request outside the declared origin and routes.'));
      await route.abort('blockedbyclient'); return;
    }
    await route.continue();
  });
  await context.routeWebSocket('**/*', route => {
    reject(new ReproError('unsupported', 'WEBSOCKET_BOUNDARY', 'WebSockets are outside this adapter boundary.'));
    route.close();
  });
}

export const runBrowser: RunFunction = async (manifest, options) => {
  const id = randomUUID();
  const started = Date.now();
  const revision = options.revision ?? manifest.app.revision;
  const result: RunResult = {
    id, outcome: 'inconclusive', reason: 'The assertion has not executed.',
    manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest, harnessDigest: harnessDigest(),
    appRevision: revision, appDigest: '', adapterVersion: VERSION, runnerVersion: VERSION,
    seed: manifest.environment.seed, startedAt: new Date(started).toISOString(), durationMs: 0,
    assertionCount: 0, observation: null, events: [], artifacts: [],
    environment: { platform: `${process.platform}-${process.arch}`, node: process.version, browser: 'not-launched', isolation: 'registered trusted synthetic fixture; fresh Chromium sandbox/context; loopback HTTP allowlist; not a hostile-code sandbox' },
  };
  let directory = '';
  let artifactWritable = false;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let launching: Promise<Browser> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let tracing = false;
  let fault: ReproError | undefined;
  const pending = new Map<number, ServerResponse>();
  const requestWaiters = new Map<number, () => void>();
  const emit = (type: string, message: string, actionId?: string): void => {
    const event = { seq: result.events.length + 1, at: new Date().toISOString(), type, message, ...(actionId === undefined ? {} : { actionId }) };
    result.events.push(event);
    try { options.onEvent?.(event); }
    catch (error) { fault = new ReproError('harness', 'EVENT_OBSERVER_FAILED', 'A run event observer failed; the evidence stream is incomplete.', { cause: error }); }
  };
  const check = (): void => {
    if (options.signal?.aborted) throw new ReproError('cancelled', 'CANCELLED', 'The owner cancelled this run.');
    if (stopped || Date.now() - started >= manifest.environment.timeoutMs) throw new ReproError('environment', 'DEADLINE', 'The adapter deadline expired before a complete assertion.');
    if (fault) throw fault;
  };
  const remaining = (): number => Math.max(1, manifest.environment.timeoutMs - (Date.now() - started));
  let origin = '';
  let source = '';
  let frozenOrder: SearchOrder = ['alpha', 'beta'];
  let scriptHash = '';
  const server = createServer((request, response) => {
    const rawUrl = `${origin}${request.url ?? ''}`;
    if (!isAllowedRequest(rawUrl, origin, request.method ?? '', frozenOrder)) {
      fault = new ReproError('unsupported', 'NETWORK_BOUNDARY', 'An HTTP request crossed the declared loopback allowlist.');
      response.writeHead(403); response.end('Undeclared request'); return;
    }
    const url = new URL(rawUrl);
    if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    if (url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'` });
      response.end(source); return;
    }
    const requestId = Number(url.searchParams.get('requestId'));
    if (pending.has(requestId)) {
      fault = new ReproError('harness', 'DUPLICATE_REQUEST', 'The frontend issued an unexpected duplicate search request.');
      response.writeHead(409); response.end('Duplicate request'); return;
    }
    pending.set(requestId, response);
    requestWaiters.get(requestId)?.();
  });
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = (): void => rejectAbort?.(new ReproError('cancelled', 'CANCELLED', 'The owner cancelled this run.'));
  options.signal?.addEventListener('abort', abort, { once: true });
  const work = async (): Promise<void> => {
    check();
    directory = ownedDirectory(join(ownedDirectory(options.artifactDir), id));
    artifactWritable = true;
    manifest = validateManifest(manifest);
    validateBoundary(manifest);
    const contract = searchContract(manifest);
    frozenOrder = contract.searchOrder;
    if (revision !== 'buggy' && revision !== 'fixed') throw new ReproError('unsupported', 'UNREGISTERED_REVISION', 'Only registered synthetic revisions can execute.');
    const channel = process.env['REPRO_BROWSER_CHANNEL'];
    if (channel !== undefined && channel !== 'chrome') throw new ReproError('unsupported', 'BROWSER_CHANNEL', 'REPRO_BROWSER_CHANNEL supports only the explicitly selected installed chrome channel; omit it for pinned Chromium.');
    source = fixtureSource(revision);
    result.appDigest = fixtureDigest(revision);
    scriptHash = createHash('sha256').update(/<script>([\s\S]*)<\/script>/.exec(source)?.[1] ?? '').digest('base64');
    await mkdir(directory, { recursive: true });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new ReproError('harness', 'SERVER_ADDRESS', 'Owned fixture did not bind to a loopback port.');
    origin = `http://127.0.0.1:${address.port}`;
    emit('reset', 'Fresh owned HTTP service, browser process, and empty browser context requested.');
    check();
    launching = chromium.launch({ headless: true, chromiumSandbox: true, timeout: remaining(), ...(channel === 'chrome' ? { channel: 'chrome' } : {}) });
    browser = await launching;
    check();
    result.environment.browser = `${browser.version()} (${channel === 'chrome' ? 'explicit installed Chrome channel' : 'pinned Chromium'})`;
    context = await browser.newContext({ viewport: manifest.environment.viewport, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block', acceptDownloads: false, colorScheme: 'light' });
    check();
    context.setDefaultTimeout(remaining());
    await installNetworkBoundary(context, origin, error => { fault = error; }, frozenOrder);
    await context.exposeBinding('__reproObservedInput', (_source, type: unknown, value: unknown) => {
      if ((type === 'input' || type === 'submit') && (value === 'alpha' || value === 'beta')) emit('browser-input', `Observed trusted ${type} event for synthetic query ${value}.`);
    });
    await context.addInitScript(({ seed }) => {
      let state = seed >>> 0;
      Math.random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
      for (const type of ['input', 'submit']) document.addEventListener(type, event => {
        if (!event.isTrusted) return;
        const value = (document.querySelector('#query') as HTMLInputElement | null)?.value;
        const observer = (globalThis as unknown as { __reproObservedInput: (type: string, value: unknown) => Promise<void> }).__reproObservedInput;
        void observer(type, value);
      }, true);
    }, { seed: manifest.environment.seed });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false }); tracing = true;
    page = await context.newPage();
    page.on('pageerror', () => { fault = new ReproError('verification', 'TARGET_EXCEPTION', 'The target raised an unrelated JavaScript exception.'); });
    page.on('crash', () => { fault = new ReproError('environment', 'BROWSER_CRASH', 'The target browser page crashed.'); });
    page.on('dialog', dialog => { fault = new ReproError('unsupported', 'UNEXPECTED_DIALOG', 'The target opened an unsupported browser dialog.'); void dialog.dismiss(); });
    page.on('download', download => { fault = new ReproError('unsupported', 'UNEXPECTED_DOWNLOAD', 'The target attempted an unsupported download.'); void download.cancel(); });
    // The registered app uses no timers or performance clock. Freeze Date while
    // retaining browser animation frames needed for real input actionability.
    await page.clock.setFixedTime(new Date(manifest.environment.clock));
    let issuedRequests = 0;
    for (const action of manifest.actions) {
      check();
      if (action.kind === 'navigate') {
        await page.goto(origin, { waitUntil: 'load', timeout: remaining() });
        await page.getByRole('heading', { name: 'Search response race' }).waitFor({ state: 'visible', timeout: remaining() });
        emit('action-executed', 'Observed registered frontend ready in a fresh context.', action.id);
      } else if (action.kind === 'noise') {
        await page.getByRole('textbox', { name: 'Search' }).focus({ timeout: remaining() });
        emit('action-executed', 'Focused the search input.', action.id);
      } else {
        const requestId = ++issuedRequests;
        const requested = new Promise<void>(resolve => { requestWaiters.set(requestId, resolve); });
        await page.getByRole('textbox', { name: 'Search' }).fill(action.value, { timeout: remaining() });
        await page.getByRole('button', { name: 'Search', exact: true }).click({ timeout: remaining() });
        await requested; check();
        emit('request-issued', `Observed HTTP search request ${requestId} for ${action.value}.`, action.id);
      }
    }
    for (const response of manifest.responses) {
      check();
      const destination = pending.get(response.requestId);
      if (!destination || destination.destroyed) throw new ReproError('verification', 'MISSING_REQUEST', 'A declared controlled response has no live issued request.');
      destination.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      destination.end(JSON.stringify({ results: response.results }));
      await page.waitForFunction(id => JSON.parse(document.querySelector<HTMLElement>('#search-state')?.dataset.completed ?? '[]').includes(id), response.requestId, { timeout: remaining(), polling: 'raf' });
      emit('response-completed', `HTTP response ${response.requestId} completed in the frontend.`);
    }
    check();
    const completed = await page.locator('#search-state').getAttribute('data-completed');
    if (completed !== '[2,1]' || await page.locator('#error').textContent()) throw new ReproError('verification', 'INCOMPLETE_EXECUTION', 'The frontend did not complete the exact declared response order without unrelated errors.');
    const observation: Observation = {
      latestRequestId: Number(await page.locator('#search-state').getAttribute('data-latest-request-id')),
      query: await page.locator('#latest-query').innerText(),
      results: await page.locator('#results li').allTextContents(),
    };
    result.observation = observation;
    await page.screenshot({ path: join(directory, 'observation.png'), fullPage: true, timeout: remaining() });
    check();
    if (!expectationEstablished(manifest)) throw new ReproError('verification', 'PROVISIONAL_EXPECTATION', 'The expectation is proposed and unconfirmed; no passing or failure-verification claim is available.');
    result.assertionCount = 1;
    assertObservation(observation, manifest.expectation, contract);
    result.outcome = 'requirement-satisfied'; result.reason = 'The frozen latest-response assertion passed after both controlled HTTP responses completed.';
    emit('assertion', result.reason);
  };
  let executing: Promise<void> | undefined;
  try {
    executing = work();
    const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ReproError('environment', 'DEADLINE', 'The adapter deadline expired before a complete assertion.')), remaining()); });
    await Promise.race([executing, aborted, deadline]);
  } catch (error) {
    if (error instanceof TargetFailure) { result.outcome = 'target-failure'; result.category = 'target-failure'; result.reason = error.message; emit('assertion', error.message); }
    else if (error instanceof ReproError) { result.outcome = error.category === 'cancelled' ? 'cancelled' : 'inconclusive'; result.category = error.category; result.reason = `${error.code}: ${error.message}`; }
    else {
      result.outcome = 'inconclusive'; result.category = 'environment';
      result.reason = error instanceof Error && error.name === 'TimeoutError' ? 'ADAPTER_TIMEOUT: Browser operation exceeded the declared deadline.'
        : error instanceof Error && /Executable doesn't exist|distribution.*not found/i.test(error.message) ? 'BROWSER_UNAVAILABLE: The selected browser is not installed. Install pinned Chromium or explicitly select the installed Chrome channel.'
        : 'RUNNER_ERROR: Browser or owned fixture operation failed; no behavioral verdict was established.';
    }
  } finally {
    stopped = true; if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    for (const response of pending.values()) response.destroy();
    server.closeAllConnections();
    await new Promise<void>(resolve => { if (!server.listening) resolve(); else server.close(() => resolve()); });
    if (!browser && launching) browser = await launching.catch(() => undefined);
    if (tracing && context) {
      try { await context.tracing.stop({ path: join(directory, 'trace.zip') }); }
      catch { result.outcome = result.outcome === 'cancelled' ? 'cancelled' : 'inconclusive'; result.category = 'environment'; result.reason = 'EVIDENCE_FAILED: The owned browser trace could not be finalized.'; }
    }
    if (browser) {
      try { await browser.close(); }
      catch { result.outcome = result.outcome === 'cancelled' ? 'cancelled' : 'inconclusive'; result.category = 'environment'; result.reason = 'CLEANUP_FAILED: The owned browser did not acknowledge shutdown.'; }
    }
    // Every browser await is bounded/closed above. A request waiter is intentionally
    // not awaited after owner cancellation; it holds no live process or file.
    void executing?.catch(() => undefined);
    if (fault && result.outcome !== 'cancelled') { result.outcome = 'inconclusive'; result.category = fault.category; result.reason = `${fault.code}: ${fault.message}`; }
    if (options.signal?.aborted) { result.outcome = 'cancelled'; result.category = 'cancelled'; result.reason = 'CANCELLED: The owner cancelled before run finalization.'; }
    result.durationMs = Date.now() - started;
  }
  if (artifactWritable) {
    try { await collectArtifacts(directory, id, result); }
    catch { result.outcome = result.outcome === 'cancelled' ? 'cancelled' : 'inconclusive'; result.category = 'environment'; result.reason = 'ARTIFACT_WRITE_FAILED: Evidence could not be persisted; no complete run is claimed.'; }
  }
  return result;
};

/** Binds the actually loaded executable functions, not merely a version label. */
export function harnessDigest(): string {
  return digest({ executableArtifact: EXECUTABLE_ARTIFACT_DIGEST, oracleArtifact: ORACLE_ARTIFACT_DIGEST, runner: runBrowser.toString(), boundary: validateBoundary.toString(), network: isAllowedRequest.toString(), networkInstallation: installNetworkBoundary.toString(), assertion: assertObservation.toString(), targetFailure: TargetFailure.toString(), assertionDigest: ASSERTION_DIGEST, searchContractArtifact: SEARCH_CONTRACT_ARTIFACT_DIGEST, registeredContract: SEARCH_CONTRACT_DIGEST, version: VERSION });
}
