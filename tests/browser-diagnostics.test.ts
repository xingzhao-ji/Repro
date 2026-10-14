import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserProbeFailure } from '../src/browser-diagnostics.js';

const PRIVATE_SENTINEL = 'TASK_OWNED_PRIVATE_ERROR_DETAIL';

for (const diagnostic of [
  'No usable sandbox!',
  'Chromium sandboxing failed!',
  '[pid=6165][err] [1013/235819.483866:FATAL:content/browser/zygote_host/zygote_host_impl_linux.cc:130] No usable sandbox!',
]) {
  test(`browser diagnostics identify the recorded sandbox failure: ${diagnostic}`, () => {
    const result = browserProbeFailure(new Error(`${diagnostic}\n${PRIVATE_SENTINEL}`));
    assert.equal(result.available, false);
    assert.equal(result.code, 'BROWSER_SANDBOX_UNAVAILABLE');
    assert.match(result.reason, /keep (?:the )?(?:browser )?sandbox enabled/i);
    assert.match(result.reason, /environment owner/i);
    assert.doesNotMatch(result.reason, /install|reinstall|channel|--no-sandbox|chromiumSandbox:\s*false/i);
    assert.ok(!JSON.stringify(result).includes(PRIVATE_SENTINEL));
  });
}

for (const diagnostic of [
  "browserType.launch: Executable doesn't exist at /task-owned/private/browser",
  "browserType.launch: Chromium distribution 'chrome' is not found at /task-owned/private/chrome",
]) {
  test(`browser diagnostics distinguish a missing browser: ${diagnostic}`, () => {
    const result = browserProbeFailure(new Error(`${diagnostic}\n${PRIVATE_SENTINEL}`));
    assert.equal(result.available, false);
    assert.equal(result.code, 'BROWSER_UNAVAILABLE');
    assert.match(result.reason, /install.*(?:pinned|browser)/i);
    assert.ok(!JSON.stringify(result).includes(PRIVATE_SENTINEL));
    assert.ok(!JSON.stringify(result).includes('/task-owned/private/'));
  });
}

for (const diagnostic of [
  'Host system is missing dependencies to run browsers.',
  '/task-owned/private/chrome: error while loading shared libraries: libMissing.so: cannot open shared object file: No such file or directory',
]) {
  test(`browser diagnostics distinguish missing system dependencies: ${diagnostic}`, () => {
    const result = browserProbeFailure(new Error(`${diagnostic}\n${PRIVATE_SENTINEL}`));
    assert.equal(result.available, false);
    assert.equal(result.code, 'BROWSER_DEPENDENCIES_UNAVAILABLE');
    assert.match(result.reason, /dependenc|librar/i);
    assert.ok(!JSON.stringify(result).includes(PRIVATE_SENTINEL));
    assert.ok(!JSON.stringify(result).includes('/task-owned/private/'));
  });
}

for (const diagnostic of [
  'Target page, context or browser has been closed',
  'browserType.launch: Timeout 5000ms exceeded.',
  'sandbox error: unknown cause',
  'The word sandbox appears in application output.',
  'No usable sandbox',
  'Chromium sandboxing failed',
  'Executable did not respond',
  'A dependency returned a malformed response',
]) {
  test(`browser diagnostics preserve uncertainty for an unrecognized failure: ${diagnostic}`, () => {
    const result = browserProbeFailure(new Error(`${diagnostic}\n${PRIVATE_SENTINEL}`));
    assert.equal(result.available, false);
    assert.equal(result.code, 'BROWSER_PROBE_FAILED');
    assert.ok(!JSON.stringify(result).includes(PRIVATE_SENTINEL));
  });
}

test('browser diagnostics accept a thrown diagnostic string without echoing it', () => {
  const result = browserProbeFailure(`No usable sandbox! ${PRIVATE_SENTINEL}`);
  assert.equal(result.code, 'BROWSER_SANDBOX_UNAVAILABLE');
  assert.ok(!JSON.stringify(result).includes(PRIVATE_SENTINEL));
});

test('browser diagnostics return fixed public text independent of private error suffixes', () => {
  for (const diagnostic of [
    'No usable sandbox!',
    "Executable doesn't exist at /task-owned/private/browser",
    'Host system is missing dependencies to run browsers.',
    'unrecognized launch failure',
  ]) {
    assert.deepEqual(browserProbeFailure(new Error(diagnostic)), browserProbeFailure(new Error(`${diagnostic}\n${PRIVATE_SENTINEL}`)));
  }
});

test('browser diagnostics safely preserve uncertainty for non-error thrown values', () => {
  for (const value of [undefined, null, 42, false, { detail: PRIVATE_SENTINEL }, Symbol(PRIVATE_SENTINEL)]) {
    const result = browserProbeFailure(value);
    assert.equal(result.available, false);
    assert.equal(result.code, 'BROWSER_PROBE_FAILED');
    assert.ok(!JSON.stringify(result).includes(PRIVATE_SENTINEL));
  }
});

for (const [diagnostic, code] of [
  ['No usable sandbox!', 'BROWSER_SANDBOX_UNAVAILABLE'],
  ['Target page, context or browser has been closed', 'BROWSER_PROBE_FAILED'],
] as const) {
  test(`CLI doctor presents ${code} from a controlled launch failure without launching browser or Docker`, async () => {
    const parent = '.repro-runs/cloud-continuation/release-triage-v1';
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, 'doctor-controlled-'));
    const emptyPath = resolve(root, 'empty-path');
    await mkdir(emptyPath);
    const launchRecord = resolve(root, 'launch-record.json');
    const preloader = resolve(root, 'controlled-launch.mjs');
    await writeFile(preloader, [
      "import assert from 'node:assert/strict';",
      "import { writeFileSync } from 'node:fs';",
      "import { chromium } from 'playwright';",
      'chromium.launch = async (options) => {',
      `  writeFileSync(${JSON.stringify(launchRecord)}, JSON.stringify({ chromiumSandbox: options.chromiumSandbox }));`,
      '  assert.equal(options.chromiumSandbox, true);',
      `  throw new Error(${JSON.stringify(`${diagnostic}\n${PRIVATE_SENTINEL}`)});`,
      '};',
    ].join('\n'));
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(preloader).href, 'src/cli.ts', 'doctor'], {
      encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL',
      env: { ...process.env, PATH: emptyPath, REPRO_BROWSER_CHANNEL: '' },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(await readFile(launchRecord, 'utf8')), { chromiumSandbox: true });
    const report = JSON.parse(result.stdout);
    assert.equal(report.browser.available, false);
    assert.equal(report.browser.code, code);
    assert.equal(report.linuxContainer.available, false);
    assert.ok(!result.stdout.includes(PRIVATE_SENTINEL));
    assert.ok(!result.stderr.includes(PRIVATE_SENTINEL));
    if (code === 'BROWSER_SANDBOX_UNAVAILABLE') {
      assert.match(report.browser.reason, /keep (?:the )?(?:browser )?sandbox enabled/i);
      assert.match(report.browser.reason, /environment owner/i);
      assert.doesNotMatch(report.browser.reason, /install|reinstall|channel|--no-sandbox|chromiumSandbox:\s*false/i);
    }
  });
}

test('browser diagnostics do not treat unrelated distribution metadata as a missing Chromium executable', () => {
  const result = browserProbeFailure(new Error(`Package distribution metadata not found\n${PRIVATE_SENTINEL}`));
  assert.equal(result.available, false);
  assert.equal(result.code, 'BROWSER_PROBE_FAILED');
  assert.ok(!JSON.stringify(result).includes(PRIVATE_SENTINEL));
});
