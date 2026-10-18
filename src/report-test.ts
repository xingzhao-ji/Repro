import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { VERSION, type AppAction, type AppCheck, type ManifestV4 } from './contracts.js';
import { describeAction, describeCheck, describeReference, type AppTarget } from './steps.js';
import type { LaunchPlan } from './app-process.js';

/**
 * The exported regression test: one plain ES module plus a two-package
 * manifest and lockfile, written into .repro/ at the app root. It depends only
 * on Node and the pinned Playwright library, never on Repro, and mirrors the
 * runner's semantics: fresh profile, loopback-only network, seeded
 * Math.random, settle after every step, unique targets, bounded check polling.
 */
export interface GeneratedFile { path: string; language: string; content: string; sha256: string }
export interface TestSpecification {
  manifest: ManifestV4; title: string; slug: string;
  /** How the test starts the app; null means the recipient must provide REPRO_BASE_URL. */
  start: LaunchPlan | null;
  /** The app folder the test lives in; static folders are written relative to it, never as local absolute paths. */
  appDirectory: string | null;
  secretPurposes: Record<string, string>;
}
const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');
const literal = (value: string) => JSON.stringify(value);

export function locatorCode(target: AppTarget): string {
  switch (target.by) {
    case 'role': return `page.getByRole(${literal(target.role!)}, { name: ${literal(target.value)}, exact: ${target.match === 'contains' ? 'false' : 'true'} })`;
    case 'label': return `page.getByLabel(${literal(target.value)}, { exact: true })`;
    case 'placeholder': return `page.getByPlaceholder(${literal(target.value)}, { exact: true })`;
    case 'text': return `page.getByText(${literal(target.value)}, { exact: true })`;
    case 'testid': return `page.getByTestId(${literal(target.value)})`;
    case 'css': return `page.locator(${literal(target.value)})`;
    case 'title': return `page.getByTitle(${literal(target.value)}, { exact: true })`;
    case 'alt': return `page.getByAltText(${literal(target.value)}, { exact: true })`;
  }
}
function valueCode(action: AppAction): string { return action.secret ? `process.env.${action.secret}` : literal(action.value); }
function stepCode(action: AppAction, index: number): string {
  const description = describeAction(action, describeReference(action.target));
  const comment = `  // ${index + 1}. ${description.replace(/\n/g, ' ')}`;
  const step = literal(`step ${index + 1}`);
  const target = action.target ? locatorCode(action.target) : '';
  let body: string;
  switch (action.kind) {
    case 'navigate': body = `await page.goto(new URL(${literal(action.value)}, app.origin).href, { waitUntil: 'load' });`; break;
    case 'reload': body = `await page.reload({ waitUntil: 'load' });`; break;
    case 'click': body = `await act(${step}, ${target}, element => element.click());`; break;
    case 'dblclick': body = `await act(${step}, ${target}, element => element.dblclick());`; break;
    case 'hover': body = `await act(${step}, ${target}, element => element.hover());`; break;
    case 'fill': body = `await act(${step}, ${target}, element => element.fill(${valueCode(action)}));`; break;
    case 'select': body = `await act(${step}, ${target}, element => element.selectOption(${valueCode(action)}));`; break;
    case 'wait-for': body = `await act(${step}, ${target}, element => element.waitFor({ state: 'visible' }));`; break;
    case 'check': body = `await act(${step}, ${target}, element => setChecked(element, true));`; break;
    case 'uncheck': body = `await act(${step}, ${target}, element => setChecked(element, false));`; break;
    case 'press': body = action.target ? `await act(${step}, ${target}, element => element.press(${literal(action.value)}));` : `await page.keyboard.press(${literal(action.value)});`; break;
  }
  return `${comment}\n  ${body}\n  await settle(page);`;
}
function checkCode(check: AppCheck): string {
  const target = check.target ? locatorCode(check.target) : 'null';
  return `    { text: ${literal(describeCheck(check, describeReference(check.target)))}, property: ${literal(check.property)}, comparison: ${literal(check.comparison)}, expected: ${literal(check.expected)}, target: ${target} },`;
}

/** Files under .repro/ for the recipient, with content hashes for safe materialization. */
export function generateTestFiles(specification: TestSpecification): GeneratedFile[] {
  const { slug } = specification;
  const testName = `${slug}.test.mjs`;
  const packageJson = `${JSON.stringify({ name: `repro-${slug}`, private: true, type: 'module', description: `Regression test from REPRO.md: ${specification.title}`.slice(0, 200),
    scripts: { test: `node --test ${testName}` }, dependencies: { playwright: playwrightVersion() } }, null, 2)}\n`;
  const lock = `${JSON.stringify(lockfile(`repro-${slug}`), null, 2)}\n`;
  const content = testSource(specification, testName);
  return [
    { path: `.repro/${testName}`, language: 'js', content, sha256: sha256(content) },
    { path: '.repro/package.json', language: 'json', content: packageJson, sha256: sha256(packageJson) },
    { path: '.repro/package-lock.json', language: 'json', content: lock, sha256: sha256(lock) },
  ];
}

function reproLock(): { packages: Record<string, Record<string, unknown>> } {
  const sourceMode = import.meta.url.endsWith('.ts');
  return JSON.parse(readFileSync(new URL(sourceMode ? '../package-lock.json' : './package-lock.json', import.meta.url), 'utf8'));
}
export function playwrightVersion(): string { return String(reproLock().packages['node_modules/playwright']?.['version'] ?? '1.64.0'); }
function lockfile(name: string) {
  const packages = reproLock().packages;
  const entry = (key: string) => {
    const { dev: _dev, devOptional: _devOptional, peer: _peer, ...rest } = packages[key] as Record<string, unknown>;
    return rest;
  };
  return { name, lockfileVersion: 3, requires: true, packages: {
    '': { name, dependencies: { playwright: playwrightVersion() } },
    'node_modules/playwright': entry('node_modules/playwright'),
    'node_modules/playwright-core': entry('node_modules/playwright-core'),
  } };
}

function testSource(specification: TestSpecification, testName: string): string {
  const { manifest, start, title } = specification;
  const environment = manifest.environment;
  const staticFolder = start?.kind === 'static' && start.directory && specification.appDirectory ? relative(specification.appDirectory, start.directory) || '.' : '.';
  const startValue = start === null || start.kind === 'external' ? 'null' : start.kind === 'static'
    ? `{ kind: 'static', folder: ${literal(staticFolder)}, timeoutMs: ${start.startTimeoutMs} }`
    : `{ kind: 'command', command: ${literal(start.command ?? '')}, url: ${start.url === null ? 'null' : literal(start.url)}, env: ${JSON.stringify(start.env)}, timeoutMs: ${start.startTimeoutMs} }`;
  const secrets = Object.keys(specification.secretPurposes).length ? JSON.stringify(specification.secretPurposes, null, 2) : '{}';
  return `// Regression test for: ${title.replace(/\n/g, ' ')}
// Generated by Repro ${VERSION} from REPRO.md. It needs only Node and Playwright; no Repro installation.
//
// Run from the app folder (the parent of .repro/):
//   (cd .repro && npm ci && npx playwright install chromium --only-shell)
//   node --test .repro/${testName}
//
// It starts the app itself (or uses an app already running at REPRO_BASE_URL), repeats the
// steps below in a fresh Chromium profile with non-local network blocked, and checks the
// expected behavior. It fails until the bug is fixed; after a fix, the same command passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const START = ${startValue};
const SECRETS = ${secrets};
const VIEWPORT = { width: ${environment.viewport.width}, height: ${environment.viewport.height} };
const SEED = ${environment.seed};
const CLOCK = ${environment.clock === null ? 'null' : literal(environment.clock)};
const SETTLE_MS = ${environment.settleMs};
const ACTION_TIMEOUT_MS = ${environment.actionTimeoutMs};
const CHECK_TIMEOUT_MS = ${environment.checkTimeoutMs};
// What Repro observed when it reproduced the bug (see REPRO.md).
const REPORTED_FAILURE = ${JSON.stringify(manifest.failure)};

test(${literal(title)}, { timeout: 180_000 }, async () => {
  for (const [name, purpose] of Object.entries(SECRETS)) {
    assert.ok(process.env[name] !== undefined && process.env[name] !== '…', 'Set ' + name + ' to ' + purpose + ' before running. REPRO.md withholds this value.');
  }
  let app = null, browser = null;
  try {
    app = await startApp();
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEWPORT, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block', acceptDownloads: false, colorScheme: 'light' });
    context.setDefaultTimeout(ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(Math.max(ACTION_TIMEOUT_MS, 15_000));
    await prepare(context);
    const page = await context.newPage();
    watch(page);
    if (CLOCK) await page.clock.setFixedTime(new Date(CLOCK));

${manifest.actions.map(stepCode).join('\n\n')}

  const checks = [
${manifest.expectation.checks.map(checkCode).join('\n')}
  ];
  const observed = await observe(page, checks);
  const satisfied = checks.every((check, index) => passes(check, observed[index]));
  console.log('REPRO_OBSERVATION ' + JSON.stringify({ values: observed, satisfied, matchesReportedFailure: !satisfied && matchesReported(checks, observed) }));
  assert.ok(satisfied, explain(checks, observed));
  } finally {
    await browser?.close().catch(() => {});
    await app?.stop();
  }
});

// ---- Helpers. They mirror how Repro ran the steps; nothing below is specific to this bug. ----

const diagnostics = { pageErrors: [], inflight: 0 };
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
function isLoopback(raw) {
  try { const url = new URL(raw); return /^(https?|wss?):$/.test(url.protocol) && LOOPBACK.has(url.hostname); } catch { return false; }
}
async function prepare(context) {
  await context.route('**/*', route => isLoopback(route.request().url()) ? route.continue() : route.abort('blockedbyclient'));
  await context.routeWebSocket(/.*/, socket => { if (isLoopback(socket.url())) socket.connectToServer(); else socket.close(); });
  await context.addInitScript(({ seed }) => {
    let state = seed >>> 0;
    Math.random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    globalThis.__reproMutations = 0;
    new MutationObserver(() => { globalThis.__reproMutations++; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  }, { seed: SEED });
}
function watch(page) {
  const counted = request => !['websocket', 'eventsource'].includes(request.resourceType());
  page.on('pageerror', error => diagnostics.pageErrors.push(String(error && error.message)));
  page.on('request', request => { if (counted(request)) diagnostics.inflight++; });
  page.on('requestfinished', request => { if (counted(request)) diagnostics.inflight = Math.max(0, diagnostics.inflight - 1); });
  page.on('requestfailed', request => { if (counted(request)) diagnostics.inflight = Math.max(0, diagnostics.inflight - 1); });
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  page.on('download', download => download.cancel().catch(() => {}));
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Wait until no requests are in flight and the DOM has not changed for SETTLE_MS (at most 3 s). */
async function settle(page) {
  const deadline = Date.now() + 3000;
  let last = -1, quietSince = Date.now();
  while (Date.now() < deadline) {
    const mutations = await page.evaluate(() => globalThis.__reproMutations ?? 0).catch(() => -2);
    if (mutations !== last || diagnostics.inflight > 0) { last = mutations; quietSince = Date.now(); }
    else if (Date.now() - quietSince >= SETTLE_MS) return;
    await pause(50);
  }
}
/** Perform a step on exactly one matching element, waiting up to ACTION_TIMEOUT_MS for it. */
async function act(step, locator, action) {
  const deadline = Date.now() + ACTION_TIMEOUT_MS;
  let count = 0;
  while (true) {
    count = await locator.count().catch(() => 0);
    if (count === 1 || Date.now() >= deadline) break;
    await pause(100);
  }
  if (count !== 1) throw new Error('REPRO_STEP_FAILED: ' + step + (count > 1 ? ' matched ' + count + ' elements' : ' could not find its element') + '. The app no longer matches the recorded steps; this is not the reported failure.');
  try { await action(locator); }
  catch (error) { throw new Error('REPRO_STEP_FAILED: ' + step + ' could not be completed (' + String(error && error.message).split('\\n')[0] + ').'); }
}
async function setChecked(locator, checked) {
  // Click only when the state differs; whether it then changes is for the checks to observe.
  if (await locator.isChecked() !== checked) await locator.click();
}
async function read(page, check) {
  if (check.property === 'url') { const url = new URL(page.url()); return url.pathname + url.search + url.hash; }
  if (check.property === 'page-errors') return String(diagnostics.pageErrors.length);
  const locator = check.target;
  try {
    if (check.property === 'count') return String(await locator.count());
    if (check.property === 'visible') return String(await locator.filter({ visible: true }).count() > 0);
    if (await locator.count() !== 1) return null;
    const limit = value => value.length > 8192 ? value.slice(0, 8192) : value;
    if (check.property === 'text') return limit(await locator.innerText({ timeout: 1000 }));
    if (check.property === 'value') return limit(await locator.inputValue({ timeout: 1000 }));
    return String(await locator.isChecked({ timeout: 1000 }));
  } catch { return null; }
}
const normalize = value => value.replace(/\\s+/g, ' ').trim();
function passes(check, observed) {
  if (observed === null) return false;
  const actual = check.property === 'text' ? normalize(observed) : observed;
  const expected = check.property === 'text' ? normalize(check.expected) : check.expected;
  if (check.comparison === 'equals') return actual === expected;
  if (check.comparison === 'not-equals') return actual !== expected;
  if (check.comparison === 'contains') return actual.includes(expected);
  return !actual.includes(expected);
}
/** Settle, then give slow updates up to CHECK_TIMEOUT_MS to reach the expected state. */
async function observe(page, checks) {
  await settle(page);
  const readAll = () => Promise.all(checks.map(check => read(page, check)));
  let values = await readAll();
  const until = Date.now() + CHECK_TIMEOUT_MS;
  while (!checks.every((check, index) => passes(check, values[index])) && Date.now() < until) { await pause(100); values = await readAll(); }
  return values;
}
function matchesReported(checks, observed) {
  if (!REPORTED_FAILURE) return false;
  return checks.every((check, index) => REPORTED_FAILURE.exact[index]
    ? observed[index] === REPORTED_FAILURE.values[index]
    : passes(check, observed[index]) === REPORTED_FAILURE.passed[index]);
}
function explain(checks, observed) {
  const shown = value => value === null ? '(element not found)' : JSON.stringify(value.length > 300 ? value.slice(0, 300) + '…' : value);
  const lines = ['REPRO_EXPECTATION_FAILED: the expected behavior did not happen.'];
  checks.forEach((check, index) => { if (!passes(check, observed[index])) lines.push('  Expected: ' + check.text, '  Observed: ' + shown(observed[index])); });
  lines.push(matchesReported(checks, observed) ? 'This is the failure recorded in REPRO.md.' : 'This differs from the failure recorded in REPRO.md; compare with its "Observed" section.');
  return lines.join('\\n');
}

// ---- Starting and stopping the app, as Repro did. ----
async function startApp() {
  if (process.env.REPRO_BASE_URL) return { origin: new URL(process.env.REPRO_BASE_URL).origin, stop: async () => {} };
  if (!START) throw new Error('Start the app yourself and set REPRO_BASE_URL (for example http://127.0.0.1:3000). REPRO.md lists what is known about its setup.');
  const port = await freePort();
  if (START.kind === 'static') return serveStatic(join(APP_DIR, START.folder), port);
  const child = spawn('/bin/sh', ['-c', START.command.replaceAll('{port}', String(port))], {
    cwd: APP_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...START.env, PORT: String(port), HOST: '127.0.0.1', BROWSER: 'none', NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  const output = [];
  let exited = null;
  child.on('close', code => { exited = code; });
  // The app runs in its own process group: stop it if this test is interrupted, and tell a supervising runner where it is.
  if (process.env.REPRO_APP_PGID_FILE) await writeFile(process.env.REPRO_APP_PGID_FILE, String(child.pid));
  const interrupted = signal => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} process.exit(signal === 'SIGINT' ? 130 : 143); }, 2000).unref(); };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  process.once('exit', () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output.push(...String(chunk).replace(/\\u001b\\[[0-9;?]*[ -/]*[@-~]/g, '').split(/\\r?\\n/)); if (output.length > 300) output.splice(0, output.length - 300); });
  const stop = async () => {
    const alive = () => { try { process.kill(-child.pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
    if (alive()) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    for (let waited = 0; alive() && waited < 5000; waited += 50) await pause(50);
    if (alive()) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} for (let waited = 0; alive() && waited < 2000; waited += 50) await pause(50); }
  };
  const deadline = Date.now() + START.timeoutMs;
  while (Date.now() < deadline) {
    if (exited !== null) { await stop(); throw new Error('The app exited (code ' + exited + ') before it was ready:\\n' + output.slice(-20).join('\\n')); }
    const printed = output.map(line => /https?:\\/\\/(?:localhost|127\\.0\\.0\\.1|\\[::1\\]|0\\.0\\.0\\.0)(?::\\d{1,5})?(?:\\/[^\\s'"\\x60<>)]*)?/i.exec(line)?.[0]).find(Boolean);
    const candidates = START.url ? [START.url.replaceAll('{port}', String(port))] : [...(printed ? [printed.replace('0.0.0.0', '127.0.0.1')] : []), 'http://127.0.0.1:' + port + '/'];
    for (const candidate of candidates) if (await responds(candidate)) return { origin: new URL(candidate).origin, stop };
    await pause(200);
  }
  await stop();
  throw new Error('The app did not answer on a local address within ' + START.timeoutMs + ' ms:\\n' + output.slice(-20).join('\\n'));
}
function freePort() {
  return new Promise((resolve, reject) => { const server = createNetServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
}
function responds(url) {
  return new Promise(resolve => {
    const request = httpRequest(url, { timeout: 1000 }, response => { response.resume(); resolve(true); });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
    request.end();
  });
}
async function serveStatic(folder, port) {
  const root = await realpath(folder);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createHttpServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (path.split('/').some(part => part.startsWith('.') && part)) throw new Error('hidden');
      let file = join(root, path);
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const real = await realpath(file);
      if (relative(root, real).startsWith('..')) throw new Error('outside');
      response.writeHead(200, { 'content-type': types[extname(real)] ?? 'application/octet-stream' });
      response.end(await readFile(real));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { origin: 'http://127.0.0.1:' + port, stop: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
`;
}
