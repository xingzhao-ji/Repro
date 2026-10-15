import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createAuthoredManifest, digest } from '../src/manifest.js';
import { runBrowser } from '../src/adapter.js';
import { verify } from '../src/service.js';
import { reduce } from '../src/reducer.js';
import { exportCapsule, importCapsule } from '../src/capsule.js';

const declaration = { searchOrder: ['beta', 'alpha'], expectation: { invariantId: 'LATEST_SEARCH_RESPONSE_WINS', latestRequestId: 2, latestQuery: 'alpha', expectedResults: ['Alpha synthetic result'] }, expectationBasis: 'independent-contract' };
const root = join('.repro-runs/expectation-authoring/core', randomUUID());

test('reversed caller declaration drives real buggy/fixed browser observations and preserves frozen inputs', { timeout: 60000 }, async () => {
  const manifest = createAuthoredManifest(declaration);
  const comparison = await verify(manifest, join(root, 'compare'));
  await mkdir(root, { recursive: true }); await writeFile(join(root, 'comparison.json'), JSON.stringify(comparison, null, 2));
  assert.equal(comparison.outcome, 'requirement-satisfied', comparison.reason);
  assert.deepEqual(comparison.original.observation, { latestRequestId: 2, query: 'alpha', results: ['Beta synthetic result'] });
  assert.deepEqual(comparison.candidate.observation, { latestRequestId: 2, query: 'alpha', results: ['Alpha synthetic result'] });
  for (const result of [comparison.original, comparison.candidate]) {
    assert.equal(result.assertionCount, 1); assert.equal(result.assertionDigest, manifest.assertionDigest); assert.equal(result.manifestDigest, digest(manifest));
  }
});

test('unconfirmed caller proposal and incomplete authored candidate remain inconclusive', { timeout: 60000 }, async () => {
  const provisional = createAuthoredManifest({ ...declaration, expectationBasis: 'proposed-unconfirmed' });
  const result = await runBrowser(provisional, { artifactDir: join(root, 'provisional'), revision: 'fixed' });
  assert.equal(result.outcome, 'inconclusive'); assert.equal(result.assertionCount, 0);
  const manifest = createAuthoredManifest(declaration);
  const incomplete = await runBrowser({ ...manifest, actions: manifest.actions.filter(action => action.value !== 'alpha') }, { artifactDir: join(root, 'incomplete') });
  assert.equal(incomplete.outcome, 'inconclusive'); assert.equal(incomplete.assertionCount, 0);
  assert.equal(incomplete.assertionDigest, manifest.assertionDigest);
});

test('authored failure reduces without editing its scenario then exports a real conventional test', { timeout: 180000 }, async () => {
  const manifest = createAuthoredManifest(declaration);
  const reduced = await reduce(manifest, runBrowser, { artifactDir: join(root, 'reduce'), maxExecutions: 40, maxDurationMs: 90000, repetitions: 2 });
  await mkdir(root, { recursive: true }); await writeFile(join(root, 'reduction.json'), JSON.stringify(reduced, null, 2));
  assert.equal(reduced.status, 'complete', reduced.reason);
  assert.deepEqual(reduced.manifest.actions.map(action => action.id), ['navigate', 'search-beta', 'search-alpha']);
  assert.deepEqual(reduced.manifest.expectation, manifest.expectation); assert.equal(reduced.manifest.assertionDigest, manifest.assertionDigest);
  const bundle = join(root, 'capsule'); await exportCapsule(reduced.manifest, bundle);
  assert.deepEqual(await importCapsule(bundle), reduced.manifest);
  const execution = await new Promise<{ code: number | null; stdout: string; stderr: string }>((complete, reject) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '.repro-cache/browsers') }; delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--test', 'replay.test.mjs'], { cwd: bundle, env: childEnv });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += String(chunk); }); child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', reject);
    child.on('close', code => complete({ code, stdout, stderr }));
  });
  await writeFile(join(root, 'conventional-test.json'), JSON.stringify(execution, null, 2));
  assert.equal(execution.code, 0, execution.stdout + execution.stderr);
  assert.match(execution.stdout, /pass 1/);
});

test('reversed network boundary admits only its exact request/query pairs', { timeout: 10000 }, async () => {
  const { createServer } = await import('node:http');
  const { chromium } = await import('playwright');
  const { installNetworkBoundary } = await import('../src/adapter.js');
  const hits: string[] = [];
  const server = createServer((request, response) => { hits.push(request.url ?? ''); response.end('registered response'); });
  await new Promise<void>(complete => server.listen(0, '127.0.0.1', complete));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env.REPRO_BROWSER_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}) });
  try {
    const origin = `http://127.0.0.1:${address.port}`;
    const context = await browser.newContext({ serviceWorkers: 'block' }); const rejected: string[] = [];
    await installNetworkBoundary(context, origin, error => { rejected.push(error.code); }, ['beta', 'alpha']);
    const page = await context.newPage(); await page.goto(origin);
    const observed = await page.evaluate(async () => {
      const paths = ['/api/search?requestId=1&query=beta', '/api/search?requestId=2&query=alpha', '/api/search?requestId=1&query=alpha', '/api/search?requestId=2&query=beta', '/api/search?requestId=1&query=beta&debug=1'];
      const outcomes: boolean[] = [];
      for (const path of paths) { try { outcomes.push((await fetch(path)).ok); } catch { outcomes.push(false); } }
      return outcomes;
    });
    assert.deepEqual(observed, [true, true, false, false, false]);
    assert.deepEqual(hits.filter(path => path.startsWith('/api/')), ['/api/search?requestId=1&query=beta', '/api/search?requestId=2&query=alpha']);
    assert.deepEqual(rejected, ['NETWORK_BOUNDARY', 'NETWORK_BOUNDARY', 'NETWORK_BOUNDARY']);
  } finally { await browser.close(); await new Promise<void>(complete => server.close(() => complete())); }
});
