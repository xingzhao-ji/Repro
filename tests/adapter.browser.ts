import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, symlink, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { ADAPTER, VERSION, type Manifest } from '../src/contracts.js';
import { runBrowser, installNetworkBoundary } from '../src/adapter.js';
import { EXPECTATION, ASSERTION_DIGEST, assertObservation, TargetFailure } from '../src/oracle.js';
import { fixtureDigest } from '../src/fixture.js';

const artifactDir = '.repro-runs/adapter-tests';
function manifest(): Manifest {
  return {
    schemaVersion: 1, id: 'browser-test', classification: 'synthetic-training-fixture',
    adapter: { id: ADAPTER, version: VERSION }, runnerVersion: VERSION,
    expectation: structuredClone(EXPECTATION), assertionDigest: ASSERTION_DIGEST,
    expectationBasis: 'supplied-synthetic-specification', humanApproval: 'not-claimed',
    actions: [
      { id: 'open', kind: 'navigate', value: '/', dependsOn: [] },
      { id: 'noise', kind: 'noise', value: 'focus', dependsOn: ['open'] },
      { id: 'alpha', kind: 'search', value: 'alpha', dependsOn: ['open'] },
      { id: 'beta', kind: 'search', value: 'beta', dependsOn: ['alpha'] },
    ],
    responses: [{ requestId: 2, results: ['Beta synthetic result'] }, { requestId: 1, results: ['Alpha synthetic result'] }],
    environment: { browser: 'chromium', viewport: { width: 960, height: 640 }, locale: 'en-US', timezoneId: 'UTC', clock: '2026-01-01T00:00:00.000Z', seed: 42, platform: 'linux-container', timeoutMs: 15000 },
    boundary: { behavior: 'frontend', network: 'controlled-http', database: 'none', externalDependencies: [] },
    app: { revision: 'buggy', sourceDigest: fixtureDigest('buggy') },
  };
}

test('the oracle retains the supplied baseline and recognizes only the exact stale-result failure', () => {
  assert.equal(ASSERTION_DIGEST, 'fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711');
  assert.throws(() => assertObservation({ latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] }, EXPECTATION), TargetFailure);
  assert.throws(() => assertObservation({ latestRequestId: 2, query: 'beta', results: [] }, EXPECTATION), error => !(error instanceof TargetFailure));
  assert.throws(() => assertObservation({ latestRequestId: 1, query: 'alpha', results: ['Alpha synthetic result'] }, EXPECTATION), error => !(error instanceof TargetFailure));
});

test('real HTTP browser execution distinguishes buggy and fixed using the same frozen assertion', async () => {
  await mkdir(artifactDir, { recursive: true });
  const input = manifest();
  const buggy = await runBrowser(input, { artifactDir });
  const fixed = await runBrowser(input, { artifactDir, revision: 'fixed' });
  assert.equal(buggy.outcome, 'target-failure', buggy.reason);
  assert.equal(fixed.outcome, 'requirement-satisfied', fixed.reason);
  assert.equal(buggy.assertionCount, 1);
  assert.equal(fixed.assertionCount, 1);
  assert.equal(buggy.assertionDigest, fixed.assertionDigest);
  assert.equal(buggy.harnessDigest, fixed.harnessDigest);
  assert.equal(buggy.manifestDigest, fixed.manifestDigest);
  assert.notEqual(buggy.appDigest, fixed.appDigest);
  assert.deepEqual(buggy.observation, { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] });
  assert.deepEqual(fixed.observation, { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] });
  for (const result of [buggy, fixed]) {
    assert.deepEqual(result.events.filter(event => event.type === 'response-completed').map(event => event.message), ['HTTP response 2 completed in the frontend.', 'HTTP response 1 completed in the frontend.']);
    assert.ok(result.artifacts.some(artifact => artifact.path.endsWith('/trace.zip')));
    assert.ok(result.artifacts.some(artifact => artifact.path.endsWith('/observation.png')));
    for (const artifact of result.artifacts) {
      const bytes = await readFile(join(artifactDir, artifact.path));
      assert.equal(bytes.length, artifact.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
    }
  }
});

test('missing steps, altered assertion, undeclared services, and invalid time remain inconclusive', async () => {
  for (const mutate of [
    (m: Manifest) => { m.actions = []; },
    (m: Manifest) => { m.actions = m.actions.filter(action => action.id !== 'beta'); },
    (m: Manifest) => { m.assertionDigest = '0'.repeat(64); },
    (m: Manifest) => { m.boundary.externalDependencies = ['https://example.invalid']; },
    (m: Manifest) => { m.environment.clock = 'not-a-clock'; },
    (m: Manifest) => { m.actions[0]!.value = 'http://127.0.0.1:1/'; },
    (m: Manifest) => { m.responses[0]!.results = ['wrong response']; },
  ]) {
    const input = manifest(); mutate(input);
    const result = await runBrowser(input, { artifactDir });
    assert.equal(result.outcome, 'inconclusive', result.reason);
    assert.equal(result.assertionCount, 0);
  }
});

test('provisional expectation and expired deadlines cannot produce a passing result', async () => {
  const provisional = manifest(); provisional.expectationBasis = 'proposed-unconfirmed';
  const proposed = await runBrowser(provisional, { artifactDir, revision: 'fixed' });
  assert.equal(proposed.outcome, 'inconclusive');
  const timeout = manifest(); timeout.environment.timeoutMs = 100;
  const timedOut = await runBrowser(timeout, { artifactDir });
  assert.equal(timedOut.outcome, 'inconclusive');
  assert.match(timedOut.reason, /deadline|timeout/i);
});

test('cancellation terminates only the owned run and the next fresh replay works', async () => {
  const unrelated = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
  try {
    const unrelatedPage = await unrelated.newPage();
    const controller = new AbortController();
    const cancelled = await runBrowser(manifest(), { artifactDir, signal: controller.signal, onEvent(event) { if (event.type === 'request-issued') controller.abort(); } });
    assert.equal(cancelled.outcome, 'cancelled', cancelled.reason);
    assert.equal(cancelled.assertionCount, 0);
    assert.equal(await unrelatedPage.evaluate(() => 6 * 7), 42, 'cancellation must not close an unrelated browser');
    const next = await runBrowser(manifest(), { artifactDir });
    assert.equal(next.outcome, 'target-failure', next.reason);
  } finally { await unrelated.close(); }
});

test('an unrelated observer exception is inconclusive and never the target failure', async () => {
  const result = await runBrowser(manifest(), { artifactDir, onEvent() { throw new Error('unrelated test observer exception'); } });
  assert.equal(result.outcome, 'inconclusive');
  assert.equal(result.assertionCount, 0);
});

test('cancellation before evidence finalization remains cancelled even after an assertion observation', async () => {
  const controller = new AbortController();
  const result = await runBrowser(manifest(), { artifactDir, signal: controller.signal, onEvent(event) { if (event.type === 'assertion') controller.abort(); } });
  assert.equal(result.outcome, 'cancelled'); assert.equal(result.assertionCount, 1);
});

test('direct runner API rejects an output symlink without writing outside its owned path', async () => {
  const target = join(artifactDir, `unrelated-${randomUUID()}`);
  const link = join(artifactDir, `link-${randomUUID()}`);
  await mkdir(target, { recursive: true }); await symlink(resolve(target), link);
  const result = await runBrowser(manifest(), { artifactDir: link });
  assert.equal(result.outcome, 'inconclusive'); assert.match(result.reason, /OUTPUT_LINK/);
  assert.equal(result.assertionCount, 0); assert.deepEqual(result.artifacts, []);
  assert.deepEqual(await readdir(target), []);
});

test('missing browser dependency is inconclusive with an actionable reason', async () => {
  const channel = process.env['REPRO_BROWSER_CHANNEL'];
  const browsers = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  try {
    delete process.env['REPRO_BROWSER_CHANNEL'];
    process.env['PLAYWRIGHT_BROWSERS_PATH'] = join(artifactDir, 'missing-browser');
    // Playwright resolves registry paths at module load, so a deliberately absent
    // executable is tested in a fresh Node child instead of mutating its registry.
    const { spawn } = await import('node:child_process');
    const script = `import {runBrowser} from './src/adapter.ts'; import {createManifest} from './src/manifest.ts'; console.log(JSON.stringify(await runBrowser(createManifest(), {artifactDir:'.repro-runs/adapter-tests/missing-browser-run'})));`;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let errors = '';
    child.stdout.on('data', chunk => { output += String(chunk); }); child.stderr.on('data', chunk => { errors += String(chunk); });
    const exit = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(exit, 0, errors);
    const result = JSON.parse(output) as { outcome: string; assertionCount: number; reason: string };
    assert.equal(result.outcome, 'inconclusive'); assert.equal(result.assertionCount, 0); assert.match(result.reason, /BROWSER_UNAVAILABLE/);
  } finally {
    if (channel === undefined) delete process.env['REPRO_BROWSER_CHANNEL']; else process.env['REPRO_BROWSER_CHANNEL'] = channel;
    if (browsers === undefined) delete process.env['PLAYWRIGHT_BROWSERS_PATH']; else process.env['PLAYWRIGHT_BROWSERS_PATH'] = browsers;
  }
});

test('actual browser egress to an undeclared owned test service is aborted before any request reaches it', async () => {
  let hits = 0;
  const server = createServer((_request, response) => { hits++; response.end('This service must never receive a browser request.'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const violations: string[] = [];
    await installNetworkBoundary(context, 'http://127.0.0.1:1', error => { violations.push(error.code); });
    const page = await context.newPage();
    await assert.rejects(page.goto(`http://127.0.0.1:${address.port}/latest/meta-data`, { timeout: 2000 }));
    assert.deepEqual(violations, ['NETWORK_BOUNDARY']); assert.equal(hits, 0);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
