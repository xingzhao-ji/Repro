# WELCOME10 can be applied twice

| | |
|---|---|
| **Status** | **Reproduced** — the failure occurred in 4 of 4 conclusive runs from a fresh start (the capture and 3 repetitions). |
| **App** | `cafe-orders` at commit `14f58765676c` on `main` **with uncommitted changes** |
| **Fresh checkout** | Reproduced: in a clean clone of the commit with the local changes applied, the test failed with the same observed result. |
| **Regression test** | `node --test .repro/welcome10-can-be-applied-twice.test.mjs` — fails until the bug is fixed |
| **Generated** | 2026-10-18 05:00 UTC by Repro 0.2.0, locally, without an AI service |

## Summary

After the steps below, Repro expected that the element `#total` text is "$8.10", but observed `$7.29`; and that the element `#status` text is "Code already applied", but observed `WELCOME10 applied: 10% off.`.

In the reporter’s words:

> Open the app
> Type "barista@example.com" into "Email"
> Type "[redacted known-secret]" into "Password"
> Click "Sign in"
> Click "Add Latte" 2 times
> Hover over "Add Croissant"
> Type "WELCOME10" into "Discount code"
> Click "Apply"
> Click "Apply"
> The total drops to $7.29 and "Code already applied" never appears.

## Expected and observed behavior

The expected behavior below was confirmed by the reporter in Repro before any run. It is the exact check the regression test makes.

| Check | Expected | Observed | Result |
|---|---|---|---|
| the element `#total` text is "$8.10" | `$8.10` | `$7.29` | **not as expected** |
| the element `#status` text is "Code already applied" | `Code already applied` | `WELCOME10 applied: 10% off.` | **not as expected** |

What the reporter said should happen:

> The code works once per order.
> "#total" should show "$8.10"
> "#status" should show "Code already applied"

Observations in the reporter’s description that are not steps (Repro did not check them; its own observations are above):

- The total drops to $7.29 and "Code already applied" never appears

## Steps to reproduce

These are the reported steps. Repro did not shorten them: the expected value can depend on every step, so a shorter sequence might show the same value for a different reason. In Repro's runs, steps 2, 3, 7, 8 did not change a checked value; they may be unnecessary, but Repro has not verified that.

1. Open `/`
2. Type "barista@example.com" into the element with label "Email"
3. Type the value of $REPRO_SECRET_1 into the element with label "Password"
4. Click the button "Sign in"
5. Click the button "Add Latte"
6. Click the button "Add Latte"
7. Hover over the button "Add Croissant"
8. Type "WELCOME10" into the element with label "Discount code"
9. Click the button "Apply"
10. Click the button "Apply"

Values withheld from this report (set them as environment variables before running the test):

- `REPRO_SECRET_1`: the value typed into "Password" (a credential, withheld by Repro)

## Run the regression test

The test needs Node.js and npm; it does not need Repro, an account or an AI service. It contains only this bug’s steps and checks; it does not contain your application.

### 1. Get the exact source

```sh
git clone <repository URL or path> cafe-orders
cd cafe-orders
git checkout 14f58765676cae37f3740fb6bcff32e3c3c51219
```

The repository's origin remote is a path on the reporter’s machine (`~/Developer/repro-acceptance/remotes/cafe-orders.git`), so it is not reachable from elsewhere. Use any copy that contains this commit, for example a pushed branch or `git bundle`.

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

### 3. Apply the local changes

This bug was reproduced with uncommitted changes. The previous step wrote them to `.repro/local-changes.patch`; apply them before installing, because they may change dependencies.

```sh
git apply .repro/local-changes.patch
```

### 4. Install the app’s dependencies

```sh
npm ci
```

### 5. Run it

```sh
(cd .repro && npm ci && npx playwright install chromium --only-shell)
export REPRO_SECRET_1='…'   # the value typed into "Password" (a credential, withheld by Repro)
node --test .repro/welcome10-can-be-applied-twice.test.mjs
```

The test starts the app with `npm run dev` (package.json script "dev" (node --watch server.js)) on a free port. To use an app you already started, set `REPRO_BASE_URL`, for example `REPRO_BASE_URL=http://127.0.0.1:3000 node --test .repro/welcome10-can-be-applied-twice.test.mjs`.

Right now the test **fails** with `REPRO_EXPECTATION_FAILED` and says “This is the failure recorded in REPRO.md”. If it fails with `REPRO_STEP_FAILED` instead, the app no longer matches the recorded steps; that is not the reported bug.

## Checking a fix

A fix is done when, in the app folder:

- `node --test .repro/welcome10-can-be-applied-twice.test.mjs` passes (exit code 0) with the test files exactly as written in step 2;
- the checks in “Expected and observed behavior” are unchanged — do not edit the test’s expected values or steps to make it pass;
- the app’s own tests still pass.

Running the same command before and after the change is the comparison: it fails on the commit above and should pass on the fixed code.

## Test files

### `.repro/welcome10-can-be-applied-twice.test.mjs`

```js repro-file=.repro/welcome10-can-be-applied-twice.test.mjs sha256=2fa677ecbeeb14188190623e24fe8bb18e8adb4c65fa549f7fd271387c79236a
// Regression test for: WELCOME10 can be applied twice
// Generated by Repro 0.2.0 from REPRO.md. It needs only Node and Playwright; no Repro installation.
//
// Run from the app folder (the parent of .repro/):
//   (cd .repro && npm ci && npx playwright install chromium --only-shell)
//   node --test .repro/welcome10-can-be-applied-twice.test.mjs
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
const SECRETS = {
  "REPRO_SECRET_1": "the value typed into \"Password\" (a credential, withheld by Repro)"
};
const VIEWPORT = { width: 1280, height: 720 };
const SEED = 1729;
const CLOCK = null;
const SETTLE_MS = 250;
const ACTION_TIMEOUT_MS = 5000;
const CHECK_TIMEOUT_MS = 2000;
// What Repro observed when it reproduced the bug (see REPRO.md).
const REPORTED_FAILURE = {"exact":[true,true],"passed":[false,false],"values":["$7.29","WELCOME10 applied: 10% off."]};

test("WELCOME10 can be applied twice", { timeout: 180_000 }, async () => {
  for (const [name, purpose] of Object.entries(SECRETS)) {
    assert.ok(process.env[name] !== undefined, 'Set ' + name + ' to ' + purpose + ' before running. REPRO.md withholds this value.');
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

  // 2. Type "barista@example.com" into the element with label "Email"
  await act("step 2", page.getByLabel("Email", { exact: true }), element => element.fill("barista@example.com"));
  await settle(page);

  // 3. Type the value of $REPRO_SECRET_1 into the element with label "Password"
  await act("step 3", page.getByLabel("Password", { exact: true }), element => element.fill(process.env.REPRO_SECRET_1));
  await settle(page);

  // 4. Click the button "Sign in"
  await act("step 4", page.getByRole("button", { name: "Sign in", exact: true }), element => element.click());
  await settle(page);

  // 5. Click the button "Add Latte"
  await act("step 5", page.getByRole("button", { name: "Add Latte", exact: true }), element => element.click());
  await settle(page);

  // 6. Click the button "Add Latte"
  await act("step 6", page.getByRole("button", { name: "Add Latte", exact: true }), element => element.click());
  await settle(page);

  // 7. Hover over the button "Add Croissant"
  await act("step 7", page.getByRole("button", { name: "Add Croissant", exact: true }), element => element.hover());
  await settle(page);

  // 8. Type "WELCOME10" into the element with label "Discount code"
  await act("step 8", page.getByLabel("Discount code", { exact: true }), element => element.fill("WELCOME10"));
  await settle(page);

  // 9. Click the button "Apply"
  await act("step 9", page.getByRole("button", { name: "Apply", exact: true }), element => element.click());
  await settle(page);

  // 10. Click the button "Apply"
  await act("step 10", page.getByRole("button", { name: "Apply", exact: true }), element => element.click());
  await settle(page);

  const checks = [
    { text: "the element `#total` text is \"$8.10\"", property: "text", comparison: "equals", expected: "$8.10", target: page.locator("#total") },
    { text: "the element `#status` text is \"Code already applied\"", property: "text", comparison: "equals", expected: "Code already applied", target: page.locator("#status") },
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

```json repro-file=.repro/package.json sha256=d790d3657d2ff2bea4c954a7704a5dffdf9d5e658c5918165933d256fcdeb3e9
{
  "name": "repro-welcome10-can-be-applied-twice",
  "private": true,
  "type": "module",
  "description": "Regression test from REPRO.md: WELCOME10 can be applied twice",
  "scripts": {
    "test": "node --test welcome10-can-be-applied-twice.test.mjs"
  },
  "dependencies": {
    "playwright": "1.64.0"
  }
}
```

### `.repro/package-lock.json`

```json repro-file=.repro/package-lock.json sha256=a8edc84ffb6693e026728d3cf1cc14c58f7ebb5908231166fdef1764afe2ae57
{
  "name": "repro-welcome10-can-be-applied-twice",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "repro-welcome10-can-be-applied-twice",
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
| Capture | reproduced the failure | `$7.29`, `WELCOME10 applied: 10% off.` | 5.6 s |
| Reproduction 1 | reproduced the failure | `$7.29`, `WELCOME10 applied: 10% off.` | 5.5 s |
| Reproduction 2 | reproduced the failure | `$7.29`, `WELCOME10 applied: 10% off.` | 5.5 s |
| Reproduction 3 | reproduced the failure | `$7.29`, `WELCOME10 applied: 10% off.` | 5.5 s |

**Fresh checkout:** Reproduced: in a clean clone of the commit with the local changes applied, the test failed with the same observed result.

<details><summary>Fresh-checkout commands and output</summary>

```text
  $ git clone --quiet --no-hardlinks --no-checkout <your repository> checkout
  $ git -C checkout checkout --quiet 14f58765676cae37f3740fb6bcff32e3c3c51219
  $ node --input-type=module -e "<the extraction command above>" REPRO.md
  $ git apply .repro/local-changes.patch
  $ npm ci
  $ (cd .repro && npm ci)
  $ (cd .repro && npx playwright install chromium --only-shell)
  $ node --test .repro/welcome10-can-be-applied-twice.test.mjs
  wrote .repro/welcome10-can-be-applied-twice.test.mjs
  wrote .repro/package.json
  wrote .repro/package-lock.json
  wrote .repro/local-changes.patch
  added 65 packages, and audited 66 packages in 391ms
  28 packages are looking for funding
    run `npm fund` for details
  found 0 vulnerabilities
  added 2 packages in 239ms
  test at .repro/welcome10-can-be-applied-twice.test.mjs:35:1
  ✖ WELCOME10 can be applied twice (6009.322083ms)
    AssertionError [ERR_ASSERTION]: REPRO_EXPECTATION_FAILED: the expected behavior did not happen.
      Expected: the element `#total` text is "$8.10"
      Observed: "$7.29"
      Expected: the element `#status` text is "Code already applied"
      Observed: "WELCOME10 applied: 10% off."
    This is the failure recorded in REPRO.md.
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: false,
      expected: true,
      operator: '==',
      diff: 'simple'
    }
```

</details>

### Logs recorded during the runs (sanitized)

- **Uncaught page errors:** none
- **Console errors and warnings:** none
- **Failed local requests:** none
- **Blocked non-local hosts:** 
  - `fonts.googleapis.com`
- **Dialogs and downloads:** none

<details><summary>App server output (last 16 lines, sanitized)</summary>

```text
  > cafe-orders@0.1.0 dev
  > node --watch server.js
  Payment provider key: [redacted token]
  Cafe orders listening on http://127.0.0.1:64886
  2026-10-18T05:00:27.427Z GET / cookie=[redacted cookie]
  2026-10-18T05:00:27.815Z GET / cookie=[redacted cookie]
  2026-10-18T05:00:27.822Z GET /static/styles.css cookie=[redacted cookie]
  2026-10-18T05:00:28.673Z POST /login cookie=[redacted cookie]
  Sign-in attempt for barista@example.com
  2026-10-18T05:00:28.681Z GET /orders cookie=[redacted cookie]
  2026-10-18T05:00:28.690Z GET /static/app.js cookie=[redacted cookie]
  2026-10-18T05:00:28.691Z GET /static/styles.css cookie=[redacted cookie]
  2026-10-18T05:00:28.992Z POST /api/order/items cookie=[redacted cookie]
  2026-10-18T05:00:29.324Z POST /api/order/items cookie=[redacted cookie]
  2026-10-18T05:00:30.190Z POST /api/order/discounts cookie=[redacted cookie]
  2026-10-18T05:00:30.506Z POST /api/order/discounts cookie=[redacted cookie]
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
| Node.js | v26.7.0 (the app declares >=22) |
| Package manager | npm 11.19.0 |
| Browser | 156.0.8078.4 (pinned Chromium), fresh profile, viewport and locale as in the test |
| Start | npm run dev — package.json script "dev" (node --watch server.js) |
| Lockfile | `package-lock.json` sha256 `087b86c6b9f01606`… |

<details><summary>Declared dependencies (1)</summary>

| Package | Declared | Resolved | Kind |
|---|---|---|---|
| express | ^5.3.0 | 5.3.0 | dependency |

</details>

## Source revision and local changes

| | |
|---|---|
| Commit | `14f58765676cae37f3740fb6bcff32e3c3c51219` |
| Branch | `main` |
| Remote | `~/Developer/repro-acceptance/remotes/cafe-orders.git` (origin) — a path on the reporter’s machine, not reachable from elsewhere |
| On a remote branch | `origin/main` |
| App folder in repository | `.` |
| Local changes | yes — 2 changed tracked file(s), 1 untracked file(s) |

Repro reproduced the bug with these uncommitted changes in place:

- `lib/discounts.js` (M)
- `lib/orders.js` (M)
- `notes-private.txt` (untracked)

Not included in the patch below:

- `notes-private.txt`: untracked file that is not source code or configuration; not embedded

The patch is materialized with the test files as `.repro/local-changes.patch` and applied with `git apply .repro/local-changes.patch`.

```diff repro-file=.repro/local-changes.patch sha256=3bf7acfe72849be543b18008b84adfce15de6ff4bf2568bde290c9e20b275049
diff --git a/lib/discounts.js b/lib/discounts.js
index 958d48b..6cf0de5 100644
--- a/lib/discounts.js
+++ b/lib/discounts.js
@@ -13,4 +13,21 @@ function lookupDiscount(code) {
   return Object.hasOwn(DISCOUNT_CODES, code) ? DISCOUNT_CODES[code] : null;
 }
 
-module.exports = { normalizeCode, lookupDiscount };
+// Orders keep a snapshot of each applied discount ({ code, percentOff }) so that
+// editing DISCOUNT_CODES later does not silently re-price an open order.
+function snapshotDiscount(code, discount) {
+  return { code, percentOff: discount.percentOff };
+}
+
+function hasDiscount(discounts, code) {
+  return discounts.includes(code);
+}
+
+function applyDiscounts(subtotalCents, discounts) {
+  return discounts.reduce(
+    (totalCents, discount) => totalCents - Math.round((totalCents * discount.percentOff) / 100),
+    subtotalCents,
+  );
+}
+
+module.exports = { normalizeCode, lookupDiscount, snapshotDiscount, hasDiscount, applyDiscounts };
diff --git a/lib/orders.js b/lib/orders.js
index 05ab797..af4ab0a 100644
--- a/lib/orders.js
+++ b/lib/orders.js
@@ -1,11 +1,17 @@
 'use strict';
 
 const { findMenuItem } = require('./menu');
-const { normalizeCode, lookupDiscount } = require('./discounts');
+const {
+  normalizeCode,
+  lookupDiscount,
+  snapshotDiscount,
+  hasDiscount,
+  applyDiscounts,
+} = require('./discounts');
 const { formatMoney } = require('./money');
 
 function createOrder() {
-  return { items: [], appliedCodes: [] };
+  return { items: [], discounts: [] };
 }
 
 function addItem(order, itemId) {
@@ -20,8 +26,8 @@ function applyDiscountCode(order, rawCode) {
   if (!code) return { ok: false, message: 'Enter a discount code.' };
   const discount = lookupDiscount(code);
   if (!discount) return { ok: false, message: `${code} is not a valid code.` };
-  if (order.appliedCodes.includes(code)) return { ok: false, message: 'Code already applied' };
-  order.appliedCodes.push(code);
+  if (hasDiscount(order.discounts, code)) return { ok: false, message: 'Code already applied' };
+  order.discounts.push(snapshotDiscount(code, discount));
   return { ok: true, message: `${code} applied: ${discount.description}.` };
 }
 
@@ -44,15 +50,11 @@ function groupLines(itemIds) {
 function summarizeOrder(order) {
   const lines = groupLines(order.items);
   const subtotalCents = lines.reduce((sum, line) => sum + line.lineCents, 0);
-  let totalCents = subtotalCents;
-  for (const code of order.appliedCodes) {
-    const discount = lookupDiscount(code);
-    if (discount) totalCents -= Math.round((totalCents * discount.percentOff) / 100);
-  }
+  const totalCents = applyDiscounts(subtotalCents, order.discounts);
   const discountCents = subtotalCents - totalCents;
   return {
     lines,
-    appliedCodes: [...order.appliedCodes],
+    appliedCodes: order.discounts.map((discount) => discount.code),
     subtotalCents,
     discountCents,
     totalCents,
```

## Limits and missing information

- **Missing:** 1 local change(s) could not be embedded: notes-private.txt.
- Requests to non-local hosts were blocked during every run (`fonts.googleapis.com`). If the bug depends on them, this report cannot show it.
- State outside the browser and the app process (databases, files, other services) was not reset between runs.
- Only 156.0.8078.4 (pinned Chromium) in headless mode was used; other browsers were not tested.
- Runs used the real clock, a 1280×720 viewport, en-US locale, UTC time zone and a seeded Math.random.
- Repro stops the app’s own process group after each run. Processes the app detaches into another group are not tracked.
- 1 typed value(s) are withheld; the recipient must supply them as environment variables.

Redaction: Repro replaced 2 × withheld input value, 2 × access token or API key, 22 × cookie value with `[redacted …]` markers. Redaction is a safeguard, not a guarantee; review this file before sharing it outside your team.

<details><summary>Repro run details</summary>

| | |
|---|---|
| Report id | `cafe-orders` |
| Manifest digest | `c6629d830a1e338ebe8a2219883a228367b642fe27fb710bdfc9827ab9bc83c9` |
| Assertion digest | `316435d4239f4bbb20ccb39585ddb400a01642b622a109ecf35eaa6dd330ac9e` |
| Harness digest | `442757a99ea1c8264c29589fa8bf01f03f5c1e8a377db672278dc79c41757783` |
| Source digest | `1022c880aa88f73826e282fc4eca6a81abb2bb7ba04eef6cd35b7ad4d9c45c99` |
| Runs | `4` |
| Repro adapter | `local-web-app-v1 0.2.0` |

</details>
