import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createCaseManifest } from '../src/browser-case.js';
import { runExperiment } from '../src/runner.js';
import type { RunEvent, RunResult } from '../src/contracts.js';
import { installCaseWorkerFixture } from './helpers/case-worker-control.js';

const root = resolve('.repro-runs/practical-beta/case-faults', randomUUID());
const execute = promisify(execFile);

async function workspace(name: string): Promise<string> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'user-file.txt'), 'preserve this user file');
  return directory;
}
async function assertOwnedCleanup(directory: string, result: RunResult): Promise<void> {
  assert.equal(await readFile(join(directory, 'user-file.txt'), 'utf8'), 'preserve this user file');
  if (result.artifacts.length) assert.deepEqual(await readdir(join(directory, result.id)), ['evidence.json'], 'Owned temporary profile must be removed while retained evidence survives.');
}
async function childResult(cwd: string, script: string, environment: NodeJS.ProcessEnv): Promise<RunResult> {
  const { stdout, stderr } = await execute(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', script], {
    cwd, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(stderr, '', 'The child must return a structured result without unrelated stderr failures.');
  return JSON.parse(stdout) as RunResult;
}
function childEnvironment(temporary: string, browsers: string): NodeJS.ProcessEnv {
  // These tests never pass ambient credentials, NODE_OPTIONS or a browser-channel fallback.
  return { PATH: process.env.PATH ?? '', TMPDIR: temporary, LANG: 'en_US.UTF-8', PLAYWRIGHT_BROWSERS_PATH: browsers };
}

test('cancellation after real navigation closes only the owned browser and fresh replay recovers', { timeout: 20_000 }, async t => {
  const directory = await workspace('cancel');
  const unrelated = await chromium.launch({ headless: true, chromiumSandbox: true });
  const fixture = installCaseWorkerFixture(t, { suite: 'browser', mode: 'observe-lifecycle', directory });
  try {
    const sentinelPage = await unrelated.newPage();
    assert.equal(await sentinelPage.evaluate(() => 6 * 7), 42);
    const controller = new AbortController();
    let navigationCompleted = false;
    const result = await runExperiment(createCaseManifest('morphdom-textarea'), {
      artifactDir: directory, signal: controller.signal,
      onEvent(event) {
        if (event.type === 'action-executed' && event.actionId === 'navigate') { navigationCompleted = true; controller.abort(); }
      },
    });
    assert.equal(navigationCompleted, true, 'Cancellation must follow actual application navigation and readiness.');
    assert.equal(result.outcome, 'cancelled', result.reason);
    assert.equal(result.assertionCount, 0);
    assert.equal(result.observation, null);
    assert.match(result.reason, /new run|fresh output/i);
    let lifecycle = await fixture.observations();
    assert.equal(lifecycle.contextsOpened.length, 1);
    assert.equal(lifecycle.contextsClosed.includes(lifecycle.contextsOpened[0]!), true);
    assert.equal(await sentinelPage.evaluate(() => 6 * 7), 42, 'Unrelated Chromium remains alive.');
    await assertOwnedCleanup(directory, result);
    const recovered = await runExperiment(createCaseManifest('morphdom-textarea'), { artifactDir: directory });
    assert.equal(recovered.outcome, 'target-failure', recovered.reason);
    assert.equal(recovered.assertionCount, 1);
    assert.notEqual(result.id, recovered.id);
    lifecycle = await fixture.observations();
    assert.equal(lifecycle.contextsOpened.length, 2);
    assert.equal(lifecycle.contextsClosed.includes(lifecycle.contextsOpened[1]!), true);
    assert.equal(await sentinelPage.evaluate(() => 6 * 7), 42);
    await assertOwnedCleanup(directory, recovered);
  } finally {
    try { await fixture.dispose(); }
    finally { fixture.restore(); await unrelated.close(); }
  }
});

test('a 100 ms repository deadline remains inconclusive and removes its owned temporary profile', { timeout: 10_000 }, async () => {
  const directory = await workspace('deadline');
  const manifest = createCaseManifest('morphdom-textarea'); manifest.environment.timeoutMs = 100;
  const started = performance.now();
  const result = await runExperiment(manifest, { artifactDir: directory });
  assert.equal(result.outcome, 'inconclusive', result.reason);
  assert.equal(result.category, 'environment');
  assert.equal(result.assertionCount, 0);
  assert.equal(result.observation, null);
  assert.match(result.reason, /DEADLINE|ADAPTER_TIMEOUT/);
  assert.match(result.reason, /retry|setup/i);
  assert.ok(performance.now() - started < 5000, 'The short deadline plus bounded startup/cleanup must return within five seconds.');
  await assertOwnedCleanup(directory, result);
});

test('an unavailable pinned browser in a fresh child reports setup recovery without treating it as the bug', { timeout: 15_000 }, async () => {
  const directory = await workspace('missing-browser');
  const temporary = join(directory, 'tmp'); const browsers = join(directory, 'empty-browser-install');
  await mkdir(temporary); await mkdir(browsers);
  const script = `import {createCaseManifest} from ${JSON.stringify(pathToFileURL(resolve('src/browser-case.ts')).href)}; import {runExperiment} from ${JSON.stringify(pathToFileURL(resolve('src/runner.ts')).href)}; console.log(JSON.stringify(await runExperiment(createCaseManifest('morphdom-textarea'),{artifactDir:${JSON.stringify(directory)}})));`;
  const result = await childResult(process.cwd(), script, childEnvironment(temporary, browsers));
  assert.equal(result.outcome, 'inconclusive', result.reason);
  assert.equal(result.category, 'environment');
  assert.equal(result.assertionCount, 0);
  assert.equal(result.observation, null);
  assert.equal(result.environment.browser, 'not-launched');
  assert.match(result.reason, /BROWSER_UNAVAILABLE/);
  assert.match(result.reason, /playwright install chromium/);
  await assertOwnedCleanup(directory, result);
});

test('an isolated source copy missing its application asset reports the exact setup blocker and preserves user files', { timeout: 15_000 }, async () => {
  const directory = await workspace('missing-application');
  const isolated = join(directory, 'isolated');
  await mkdir(isolated);
  await cp(resolve('src'), join(isolated, 'src'), { recursive: true });
  await cp(resolve('fixtures/browser-search'), join(isolated, 'fixtures/browser-search'), { recursive: true });
  const caseDirectory = join(isolated, 'fixtures/repository-cases/morphdom-textarea');
  await mkdir(caseDirectory, { recursive: true });
  await cp(resolve('fixtures/repository-cases/morphdom-textarea/page.html'), join(caseDirectory, 'page.html'));
  const temporary = join(isolated, 'tmp'); await mkdir(temporary);
  const output = join(isolated, '.repro-runs/result'); await mkdir(output, { recursive: true });
  await writeFile(join(output, 'user-file.txt'), 'preserve this user file');
  const script = `import {createCaseManifest} from './src/browser-case.ts'; import {runExperiment} from './src/runner.ts'; console.log(JSON.stringify(await runExperiment(createCaseManifest('morphdom-textarea'),{artifactDir:'.repro-runs/result'})));`;
  const result = await childResult(isolated, script, childEnvironment(temporary, resolve('.repro-cache/browsers')));
  assert.equal(result.outcome, 'inconclusive', result.reason);
  assert.equal(result.category, 'environment');
  assert.equal(result.assertionCount, 0);
  assert.equal(result.observation, null);
  assert.equal(result.environment.browser, 'not-launched');
  assert.match(result.reason, /CASE_SOURCE_UNAVAILABLE/);
  assert.match(result.reason, /restore|reinstall/i);
  assert.deepEqual(await readdir(output), ['user-file.txt'], 'Setup failure must not create a misleading run or remove existing data.');
  await assertOwnedCleanup(output, result);
});

test('a CSP-blocked unexpected fetch with fake URL header and body secrets is inconclusive and leaves no secret evidence', { timeout: 15_000 }, async t => {
  const directory = await workspace('network-secrets');
  const secret = 'privacy-sentinel-fake-network-secret';
  let hits = 0;
  const server = createServer((_request, response) => { hits++; response.writeHead(204); response.end(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const destination = `http://127.0.0.1:${address.port}/capture?token=${secret}`;
  const events: RunEvent[] = [];
  const fixture = installCaseWorkerFixture(t, { suite: 'browser', mode: 'network-secrets', directory, destination, secret });
  try {
    const result = await runExperiment(createCaseManifest('morphdom-textarea'), { artifactDir: directory, onEvent: event => events.push(event) });
    const { violations } = await fixture.observations();
    await writeFile(join(directory, 'injection.json'), JSON.stringify({ hits, violations, outcome: result.outcome, category: result.category, assertionCount: result.assertionCount }, null, 2));
    assert.equal(hits, 0, 'The owned unrelated endpoint must receive no attempted request.');
    assert.ok(violations.includes('connect-src'), 'The browser must actually report the injected fetch blocked by CSP.');
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(events).includes(secret), false, 'Live event consumers must not receive the secret either.');
    await assertOwnedCleanup(directory, result);
    for (const artifact of result.artifacts) assert.equal((await readFile(join(directory, artifact.path))).includes(Buffer.from(secret)), false, 'Unexpected URL/header/body strings must not enter retained artifacts.');
    assert.equal(result.outcome, 'inconclusive', 'Blocked undeclared network activity must not retain a conclusive target verdict.');
    assert.equal(result.category, 'unsupported');
    assert.match(result.reason, /NETWORK_BOUNDARY|CONTENT_SECURITY_POLICY|CSP_BOUNDARY/);
  } finally {
    try { await fixture.dispose(); }
    finally { fixture.restore(); await new Promise<void>(resolve => server.close(() => resolve())); }
  }
});

for (const phase of ['final-action', 'observation-read'] as const) {
  test(`a CSP violation during ${phase} cannot disappear during verdict finalization`, { timeout: 20_000 }, async t => {
    const directory = await workspace(`csp-${phase}`);
    let hits = 0;
    const server = createServer((_request, response) => { hits++; response.writeHead(204); response.end(); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const destination = `http://127.0.0.1:${address.port}/undeclared`;
    const fixture = installCaseWorkerFixture(t, { suite: 'browser', mode: `csp-${phase}`, directory, destination });
    try {
      for (let repetition = 0; repetition < 5; repetition++) {
        const before = await fixture.observations();
        const priorAttempts = before.attempts; const priorViolations = before.violations.length;
        const result = await runExperiment(createCaseManifest('morphdom-textarea'), { artifactDir: directory });
        const observed = await fixture.observations();
        const attempts = observed.attempts; const violations = observed.violations.length;
        await writeFile(join(directory, `timing-${repetition}.json`), JSON.stringify({ phase, repetition, hits, attempts: attempts - priorAttempts, violations: violations - priorViolations, outcome: result.outcome, category: result.category, assertionCount: result.assertionCount }, null, 2));
        assert.equal(hits, 0);
        assert.ok(attempts > priorAttempts, 'The real browser must execute the injected fetch at the selected phase.');
        assert.ok(violations > priorViolations, 'The actual CSP violation must be observed.');
        assert.equal(result.outcome, 'inconclusive', 'Late boundary violations must not finalize as a target failure.');
        assert.equal(result.category, 'unsupported');
        assert.match(result.reason, /CSP_BOUNDARY/);
        await assertOwnedCleanup(directory, result);
      }
    } finally {
      try { await fixture.dispose(); }
      finally { fixture.restore(); await new Promise<void>(resolve => server.close(() => resolve())); }
    }
  });
}
