# Deleting a bought item lowers the items-left counter

| | |
|---|---|
| **Status** | **Not reproduced** — the expected behavior happened in all 4 conclusive runs from a fresh start. |
| **App** | `shopping-list` at commit `8956d79b1651` on `main` |
| **Fresh checkout** | Passed: in a clean clone of the commit, the test ran and the expected behavior held, as in Repro’s runs. |
| **Regression test** | `node --test .repro/deleting-a-bought-item-lowers-the-items-left.test.mjs` — currently passes |
| **Generated** | 2026-10-18 06:21 UTC by Repro 0.2.1, locally, without an AI service |

## Summary

Repro followed the reported steps, and the expected behavior happened in every run. The bug did not reproduce under the conditions recorded here.

In the reporter’s words:

> Open the app
> Type "Milk" into "Add an item"
> Press Enter
> Type "Eggs" into "Add an item"
> Press Enter
> Type "Bread" into "Add an item"
> Press Enter
> Click "Active"
> Click "All"
> Check "Mark Eggs as bought"
> Click "Delete Eggs"
> The counter shows "1 item left".

## Expected and observed behavior

The expected behavior below was confirmed by the reporter in Repro before any run. It is the exact check the regression test makes.

| Check | Expected | Observed | Result |
|---|---|---|---|
| the element `#items-left` text is "2 items left" | `2 items left` | `2 items left` | as expected |

What the reporter said should happen:

> Deleting an item that is already bought should not change how many are left.
> "#items-left" should show "2 items left"

Observations in the reporter’s description that are not steps (Repro did not check them; its own observations are above):

- The counter shows "1 item left"

## Steps to reproduce

These are the reported steps. Repro shortens steps only when the failure reproduces consistently.

1. Open `/`
2. Type "Milk" into the element with placeholder "Add an item"
3. Press Enter
4. Type "Eggs" into the element with placeholder "Add an item"
5. Press Enter
6. Type "Bread" into the element with placeholder "Add an item"
7. Press Enter
8. Click the button "Active"
9. Click the button "All"
10. Check the checkbox "Mark Eggs as bought"
11. Click the button "Delete Eggs"

## Run the regression test

The test needs Node.js and npm; it does not need Repro, an account or an AI service. It contains only this bug’s steps and checks; it does not contain your application.

### 1. Get the exact source

```sh
git clone <repository URL or path> shopping-list
cd shopping-list
git checkout 8956d79b1651fc3f152c88129e96d279396924c2
```

The repository's origin remote is a path on the reporter’s machine (`~/Developer/repro-acceptance/apps/shopping-list`), so it is not reachable from elsewhere. Use any copy that contains this commit, for example a pushed branch or `git bundle`.

### 2. Create the test files

Save this REPRO.md in the app folder, then run this from the app folder. It writes only the `.repro/` files listed under “Test files”, refuses to overwrite existing files, and checks each file’s SHA-256. You can also copy the blocks by hand.

```sh
node --input-type=module -e '
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const markdown = readFileSync(process.argv[1], "utf8").replace(/\r\n/g, "\n");
const blocks = /^(`{3,})[a-z]+ repro-file=(\.repro\/(?:[a-z0-9][a-z0-9-]*\.test\.mjs|package\.json|package-lock\.json|local-changes\.patch)) sha256=([0-9a-f]{64})\n([\s\S]*?)^\1$/gm;
let written = 0;
for (const [, , path, sha256, content] of markdown.matchAll(blocks)) {
  if (createHash("sha256").update(content).digest("hex") !== sha256) throw new Error(path + " does not match its SHA-256; use an unmodified REPRO.md.");
  mkdirSync(".repro", { recursive: true });
  writeFileSync(path, content, { flag: "wx" });
  console.log("wrote " + path);
  written++;
}
if (!written) throw new Error("No .repro files found in this REPRO.md.");
' REPRO.md
```

### 3. Install the app’s dependencies

```sh
npm ci
```

### 4. Run it

```sh
(cd .repro && npm ci && npx playwright install chromium --only-shell)
node --test .repro/deleting-a-bought-item-lowers-the-items-left.test.mjs
```

The test starts the app with `npm run dev` (package.json script "dev" (vite)) on a free port. To use an app you already started, set `REPRO_BASE_URL`, for example `REPRO_BASE_URL=http://127.0.0.1:3000 node --test .repro/deleting-a-bought-item-lowers-the-items-left.test.mjs`.

Right now the test **passes**, because the bug did not reproduce in Repro’s runs. It still records exactly what was tried.

## Checking a fix

There is nothing to fix yet: the expected behavior happened in every run. If you can make the bug happen, add the missing steps or conditions and generate a new report.

## Test files

### `.repro/deleting-a-bought-item-lowers-the-items-left.test.mjs`

```js repro-file=.repro/deleting-a-bought-item-lowers-the-items-left.test.mjs sha256=7603b7f8ae31008a6a7de31cca927415e23f5b765e2a59a43e40e5936c9c3ffc
// Regression test for: Deleting a bought item lowers the items-left counter
// Generated by Repro 0.2.1 from REPRO.md. It needs only Node and Playwright; no Repro installation.
//
// Run from the app folder (the parent of .repro/):
//   (cd .repro && npm ci && npx playwright install chromium --only-shell)
//   node --test .repro/deleting-a-bought-item-lowers-the-items-left.test.mjs
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
const START = { kind: 'command', command: "npm run dev", url: null, env: {}, timeoutMs: 60000 };
const SECRETS = {};
const VIEWPORT = { width: 1280, height: 720 };
const SEED = 1729;
const CLOCK = null;
const SETTLE_MS = 250;
const ACTION_TIMEOUT_MS = 5000;
const CHECK_TIMEOUT_MS = 2000;
// What Repro observed when it reproduced the bug (see REPRO.md).
const REPORTED_FAILURE = null;

test("Deleting a bought item lowers the items-left counter", { timeout: 180_000 }, async () => {
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

  // 1. Open `/`
  await page.goto(new URL("/", app.origin).href, { waitUntil: 'load' });
  await settle(page);

  // 2. Type "Milk" into the element with placeholder "Add an item"
  await act("step 2", page.getByPlaceholder("Add an item", { exact: true }), element => element.fill("Milk"));
  await settle(page);

  // 3. Press Enter
  await page.keyboard.press("Enter");
  await settle(page);

  // 4. Type "Eggs" into the element with placeholder "Add an item"
  await act("step 4", page.getByPlaceholder("Add an item", { exact: true }), element => element.fill("Eggs"));
  await settle(page);

  // 5. Press Enter
  await page.keyboard.press("Enter");
  await settle(page);

  // 6. Type "Bread" into the element with placeholder "Add an item"
  await act("step 6", page.getByPlaceholder("Add an item", { exact: true }), element => element.fill("Bread"));
  await settle(page);

  // 7. Press Enter
  await page.keyboard.press("Enter");
  await settle(page);

  // 8. Click the button "Active"
  await act("step 8", page.getByRole("button", { name: "Active", exact: true }), element => element.click());
  await settle(page);

  // 9. Click the button "All"
  await act("step 9", page.getByRole("button", { name: "All", exact: true }), element => element.click());
  await settle(page);

  // 10. Check the checkbox "Mark Eggs as bought"
  await act("step 10", page.getByRole("checkbox", { name: "Mark Eggs as bought", exact: true }), element => setChecked(element, true));
  await settle(page);

  // 11. Click the button "Delete Eggs"
  await act("step 11", page.getByRole("button", { name: "Delete Eggs", exact: true }), element => element.click());
  await settle(page);

  const checks = [
    { text: "the element `#items-left` text is \"2 items left\"", property: "text", comparison: "equals", expected: "2 items left", target: page.locator("#items-left") },
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
  catch (error) { throw new Error('REPRO_STEP_FAILED: ' + step + ' could not be completed (' + String(error && error.message).split('\n')[0] + ').'); }
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
const normalize = value => value.replace(/\s+/g, ' ').trim();
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
  return lines.join('\n');
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
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output.push(...String(chunk).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').split(/\r?\n/)); if (output.length > 300) output.splice(0, output.length - 300); });
  const stop = async () => {
    const alive = () => { try { process.kill(-child.pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
    if (alive()) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    for (let waited = 0; alive() && waited < 5000; waited += 50) await pause(50);
    if (alive()) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} for (let waited = 0; alive() && waited < 2000; waited += 50) await pause(50); }
  };
  const deadline = Date.now() + START.timeoutMs;
  while (Date.now() < deadline) {
    if (exited !== null) { await stop(); throw new Error('The app exited (code ' + exited + ') before it was ready:\n' + output.slice(-20).join('\n')); }
    const printed = output.map(line => /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d{1,5})?(?:\/[^\s'"\x60<>)]*)?/i.exec(line)?.[0]).find(Boolean);
    const candidates = START.url ? [START.url.replaceAll('{port}', String(port))] : [...(printed ? [printed.replace('0.0.0.0', '127.0.0.1')] : []), 'http://127.0.0.1:' + port + '/'];
    for (const candidate of candidates) if (await responds(candidate)) return { origin: new URL(candidate).origin, stop };
    await pause(200);
  }
  await stop();
  throw new Error('The app did not answer on a local address within ' + START.timeoutMs + ' ms:\n' + output.slice(-20).join('\n'));
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
```

### `.repro/package.json`

```json repro-file=.repro/package.json sha256=648f5e49773f3cdac083295f6fc53c20b3d391845756cc86fd2e8875ce15d333
{
  "name": "repro-deleting-a-bought-item-lowers-the-items-left",
  "private": true,
  "type": "module",
  "description": "Regression test from REPRO.md: Deleting a bought item lowers the items-left counter",
  "scripts": {
    "test": "node --test deleting-a-bought-item-lowers-the-items-left.test.mjs"
  },
  "dependencies": {
    "playwright": "1.64.0"
  }
}
```

### `.repro/package-lock.json`

```json repro-file=.repro/package-lock.json sha256=d7ecb42f050e54da08a01b5def96797f51b1c4db82f5e3c35ba65f20d70c3760
{
  "name": "repro-deleting-a-bought-item-lowers-the-items-left",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "repro-deleting-a-bought-item-lowers-the-items-left",
      "dependencies": {
        "playwright": "1.64.0"
      }
    },
    "node_modules/playwright": {
      "version": "1.64.0",
      "resolved": "https://registry.npmjs.org/playwright/-/playwright-1.64.0.tgz",
      "integrity": "sha512-kVzTnYFYEyQ9RGzBjNCd2+yEqWmVbxl3AHPynv3qQ6JTjv4a+kwRcnqQwIpuP3NnrnIrE/Q6wWAIAvMfIE2/Yg==",
      "license": "Apache-2.0",
      "dependencies": {
        "playwright-core": "1.64.0"
      },
      "bin": {
        "playwright": "cli.js"
      },
      "engines": {
        "node": ">=20"
      }
    },
    "node_modules/playwright-core": {
      "version": "1.64.0",
      "resolved": "https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.0.tgz",
      "integrity": "sha512-T9r+MZkTECl2+oUcZ26YgZzTrYidTsIhYYkJix+6iDOymOb1FB2RLLSOxRGnZGv5DStt+aduIVbt+E8WygXYpg==",
      "license": "Apache-2.0",
      "bin": {
        "playwright-core": "cli.js"
      },
      "engines": {
        "node": ">=20"
      }
    }
  }
}
```

## Evidence

### Observed facts

Every row is an actual run from a fresh browser profile and a freshly started app.

| Run | Result | Observed | Time |
|---|---|---|---|
| Capture | expected behavior | `2 items left` | 3.8 s |
| Reproduction 1 | expected behavior | `2 items left` | 3.7 s |
| Reproduction 2 | expected behavior | `2 items left` | 3.7 s |
| Reproduction 3 | expected behavior | `2 items left` | 3.7 s |

**Fresh checkout:** Passed: in a clean clone of the commit, the test ran and the expected behavior held, as in Repro’s runs.

<details><summary>Fresh-checkout commands and output</summary>

```text
  $ git clone --quiet --no-hardlinks --no-checkout <your repository> checkout
  $ git -C checkout checkout --quiet 8956d79b1651fc3f152c88129e96d279396924c2
  $ node --input-type=module -e "<the extraction command above>" REPRO.md
  $ npm ci
  $ (cd .repro && npm ci)
  $ (cd .repro && npx playwright install chromium --only-shell)
  $ node --test .repro/deleting-a-bought-item-lowers-the-items-left.test.mjs
  wrote .repro/deleting-a-bought-item-lowers-the-items-left.test.mjs
  wrote .repro/package.json
  wrote .repro/package-lock.json
  added 65 packages, and audited 66 packages in 706ms
  9 packages are looking for funding
    run `npm fund` for details
  found 0 vulnerabilities
  npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
  npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
  npm warn install-scripts   fsevents@2.3.3 (install: (install scripts present))
  npm warn install-scripts
  npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
  added 2 packages in 223ms
  REPRO_OBSERVATION {"values":["2 items left"],"satisfied":true,"matchesReportedFailure":false}
  ✔ Deleting a bought item lowers the items-left counter (4412.682709ms)
  ℹ tests 1
  ℹ suites 0
  ℹ pass 1
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 4678.467375
```

</details>

### Logs recorded during the runs (sanitized)

- **Uncaught page errors:** none
- **Console errors and warnings:** none
- **Failed local requests:** none
- **Blocked non-local hosts:** none
- **Dialogs and downloads:** none

<details><summary>App server output (last 4 lines, sanitized)</summary>

```text
  > shopping-list@0.1.0 dev
  > vite
    VITE v7.3.7  ready in 109 ms
    ➜  Local:   http://127.0.0.1:5173/
```

</details>

### Suspected causes (not verified)

- None recorded.

### Verified causes

- None. Repro shows that the failure happens and with which steps; it does not determine why.

## Environment and dependencies

| | |
|---|---|
| Operating system | darwin 27.0.0 (arm64) |
| Node.js | v26.7.0 |
| Package manager | npm 11.19.0 |
| Browser | 156.0.8078.4 (pinned Chromium), fresh profile, viewport and locale as in the test |
| Start | npm run dev — package.json script "dev" (vite) |
| Lockfile | `package-lock.json` sha256 `6da404e584ec87d5`… |

<details><summary>Declared dependencies (4)</summary>

| Package | Declared | Resolved | Kind |
|---|---|---|---|
| react | ^19.3.1 | 19.3.1 | dependency |
| react-dom | ^19.3.1 | 19.3.1 | dependency |
| @vitejs/plugin-react | ^5.2.0 | 5.2.0 | dev |
| vite | ^7.3.7 | 7.3.7 | dev |

</details>

## Source revision and local changes

| | |
|---|---|
| Commit | `8956d79b1651fc3f152c88129e96d279396924c2` |
| Branch | `main` |
| Remote | `~/Developer/repro-acceptance/apps/shopping-list` (origin) — a path on the reporter’s machine, not reachable from elsewhere |
| On a remote branch | _no — push the commit before sharing this report_ |
| App folder in repository | `.` |
| Local changes | none (working tree clean) |

## Limits and missing information

- **Missing:** The commit is not on any remote branch yet; push it so the recipient can check it out.
- The checked-out commit is not on any remote-tracking branch Repro knows about. Push it before sharing the report.
- State outside the browser and the app process (databases, files, other services) was not reset between runs.
- Only 156.0.8078.4 (pinned Chromium) in headless mode was used; other browsers were not tested.
- Runs used the real clock, a 1280×720 viewport, en-US locale, UTC time zone and a seeded Math.random.
- Repro stops the app’s own process group after each run. Processes the app detaches into another group are not tracked.

Redaction: Repro found nothing to redact. Redaction is a safeguard, not a guarantee; review this file before sharing it outside your team.

<details><summary>Repro run details</summary>

| | |
|---|---|
| Report id | `not-reproduced` |
| Manifest digest | `d235225c530e3efec0694e1bedeafdc852d44dc52755c88c855bca4952501f75` |
| Assertion digest | `f14ee6fd838c78fed5534651c5f47f7d9bd8dcde3da5c29a10324a42c0b849b5` |
| Harness digest | `effdc78ae43313672b5204872fcc7d6e0e09931977fff4f938c721ff64df070a` |
| Source digest | `7af3e84322f75724df74e371223cce076f966c8d89a1fb4edb865f8e7ec32277` |
| Runs | `4` |
| Repro adapter | `local-web-app-v1 0.2.1` |

</details>
