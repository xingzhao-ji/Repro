import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createCaseManifest } from '../src/browser-case.js';
import { runExperiment } from '../src/runner.js';
import { installCaseWorkerFixture } from './helpers/case-worker-control.js';

const root = '.repro-runs/practical-beta/adapter-tests';

test('pinned morphdom actual source executes the same declared textarea requirement in separate fresh browser state', async () => {
  const directory = join(root, randomUUID()); await mkdir(directory, { recursive: true });
  const manifest = createCaseManifest('morphdom-textarea');
  // Freeze before either target executes; never derive expectation from fixed output.
  await writeFile(join(directory, 'frozen-input.json'), JSON.stringify(manifest, null, 2));
  const original = await runExperiment(manifest, { artifactDir: directory });
  assert.equal(original.outcome, 'target-failure', original.reason);
  assert.equal(original.assertionCount, 1);
  assert.ok(original.observation && 'kind' in original.observation && original.observation.kind === 'browser-case');
  const candidate = await runExperiment(manifest, { artifactDir: directory, revision: 'fixed' });
  assert.equal(candidate.outcome, 'requirement-satisfied', candidate.reason);
  assert.equal(candidate.assertionCount, 1);
  assert.equal(original.assertionDigest, candidate.assertionDigest);
  assert.equal(original.harnessDigest, candidate.harnessDigest);
  assert.notEqual(original.appDigest, candidate.appDigest);
  assert.notEqual(original.id, candidate.id);
  for (const result of [original, candidate]) {
    assert.deepEqual((await readdir(join(directory, result.id))).sort(), ['evidence.json']);
    assert.equal(JSON.parse(await readFile(join(directory, result.id, 'evidence.json'), 'utf8')).outcome, result.outcome);
  }
});

test('pre-cancelled repository execution never launches or reports a target failure and preserves neighboring files', async () => {
  const directory = join(root, randomUUID()); await mkdir(directory, { recursive: true });
  const sentinel = join(directory, 'user-data.txt'); await writeFile(sentinel, 'keep this file');
  const controller = new AbortController(); controller.abort();
  const result = await runExperiment(createCaseManifest('morphdom-textarea'), { artifactDir: directory, signal: controller.signal });
  assert.equal(result.outcome, 'cancelled'); assert.equal(result.assertionCount, 0);
  assert.equal(await readFile(sentinel, 'utf8'), 'keep this file');
});

for (const caseId of ['htmx-checkbox', 'marked-empty-heading']) {
  test(`pinned ${caseId} rejects buggy and accepts fixed through the identical frozen DOM assertion`, async () => {
    const directory = join(root, randomUUID()); await mkdir(directory, { recursive: true });
    const manifest = createCaseManifest(caseId);
    await writeFile(join(directory, 'frozen-input.json'), JSON.stringify(manifest, null, 2));
    const original = await runExperiment(manifest, { artifactDir: directory });
    const candidate = await runExperiment(manifest, { artifactDir: directory, revision: 'fixed' });
    assert.equal(original.outcome, 'target-failure', original.reason);
    assert.equal(candidate.outcome, 'requirement-satisfied', candidate.reason);
    assert.equal(original.assertionCount, 1); assert.equal(candidate.assertionCount, 1);
    assert.equal(original.assertionDigest, candidate.assertionDigest);
    assert.equal(original.harnessDigest, candidate.harnessDigest);
    assert.notEqual(original.appDigest, candidate.appDigest);
    assert.deepEqual(candidate.observation, { kind: 'browser-case', values: manifest.expectation.checks.map(check => check.expected) });
    for (const result of [original, candidate]) assert.deepEqual((await readdir(join(directory, result.id))).sort(), ['evidence.json']);
  });
}

test('a lost browser close acknowledgement returns an actionable inconclusive result within the cleanup budget', { timeout: 8000 }, async t => {
  const directory = join(root, randomUUID());
  const fixture = installCaseWorkerFixture(t, { suite: 'browser', mode: 'lost-close-ack', directory });
  t.after(async () => { try { await fixture.dispose(); } finally { fixture.restore(); } });
  const began = performance.now();
  const result = await runExperiment(createCaseManifest('morphdom-textarea'), { artifactDir: directory });
  assert.equal(result.outcome, 'inconclusive');
  assert.match(result.reason, /CLEANUP_FAILED/);
  assert.ok(performance.now() - began < 8000, 'Missing close acknowledgement must not hang the caller.');
  const lifecycle = await fixture.observations();
  assert.equal(lifecycle.contextsOpened.length, 1, 'The actual owned browser must reach the injected close path.');
  assert.equal(lifecycle.contextsClosed.includes(lifecycle.contextsOpened[0]!), true, 'Only the close acknowledgement is lost; the actual browser closes.');
});

for (const mode of ['unrelated-dom', 'wrong-observation', 'exception'] as const) {
  test(`secret sentinel in ${mode} never reaches recorded browser-case evidence`, async t => {
    const secret = 'privacy-sentinel-fake-bearer-do-not-persist';
    const directory = join(root, randomUUID());
    const fixture = installCaseWorkerFixture(t, { suite: 'browser', mode: `privacy-${mode}`, directory, secret });
    t.after(async () => { try { await fixture.dispose(); } finally { fixture.restore(); } });
    const result = await runExperiment(createCaseManifest('morphdom-textarea'), { artifactDir: directory });
    assert.equal(result.outcome, mode === 'unrelated-dom' ? 'target-failure' : 'inconclusive');
    if (mode === 'wrong-observation') assert.equal(result.assertionCount, 1, 'The executed but unrelated assertion failure must retain its execution count.');
    const evidence = await readFile(join(directory, result.id, 'evidence.json'), 'utf8');
    assert.equal(evidence.includes(secret), false); assert.equal(JSON.stringify(result).includes(secret), false);
    assert.deepEqual(await readdir(join(directory, result.id)), ['evidence.json']);
    if (mode !== 'unrelated-dom') assert.equal(result.observation, null);
  });
}
