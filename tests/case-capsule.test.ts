import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createCaseManifest, getRegisteredCase } from '../src/browser-case.js';
import { exportCapsule, importCapsule } from '../src/capsule.js';
import { ReproError } from '../src/contracts.js';

const CASE_ID = 'morphdom-textarea';
async function workspace() {
  const parent = resolve('.repro-runs/case-capsule-tests');
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, 'case-'));
}

for (const caseId of [CASE_ID, 'htmx-checkbox', 'marked-empty-heading']) test(`${caseId} capsule preserves the exact registered upstream files and independent harness`, async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  const manifest = createCaseManifest(caseId);
  await exportCapsule(manifest, output);
  assert.deepEqual(await importCapsule(output), manifest);
  for (const path of getRegisteredCase(caseId).assetPaths) {
    assert.deepEqual(await readFile(join(output, path)), await readFile(path), path);
  }
  const conventional = await readFile(join(output, 'replay.test.mjs'), 'utf8');
  assert.match(conventional, /REPRO_REVISION/);
  assert.match(conventional, /runExperiment/);
  assert.doesNotMatch(conventional, /runBrowser/);
  const readme = await readFile(join(output, 'README.md'), 'utf8');
  assert.match(readme, /REPRO_REVISION=buggy node --test replay\.test\.mjs/);
  assert.match(readme, /REPRO_REVISION=fixed node --test replay\.test\.mjs/);
  assert.match(readme, /scoped approval/);
  assert.match(readme, /--init/);
  assert.match(readme, /no existing workspace or caches/i);
  assert.deepEqual(await readdir(join(output, 'fixtures/repository-cases')), [caseId], 'Only the selected real case is exported');
});

test('repository capsule rejects changed registered bytes even after recomputed self-integrity', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  await exportCapsule(createCaseManifest(CASE_ID), output);
  const path = getRegisteredCase(CASE_ID).assetPaths.find(path => path.endsWith('buggy.js'))!;
  assert.ok(path);
  const bytes = Buffer.from('throw new Error("changed-public-target");');
  await writeFile(join(output, path), bytes);
  const indexPath = join(output, 'integrity.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const entry = index.files.find((entry: { path: string }) => entry.path === path);
  entry.bytes = bytes.length; entry.sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(indexPath, JSON.stringify(index));
  await assert.rejects(importCapsule(output), (error: unknown) => error instanceof ReproError && error.code === 'CAPSULE_TRUST');
});

test('repository capsule keeps its exact path allowlist and cancellation preserves neighboring files', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  await writeFile(join(parent, 'user.txt'), 'original user file');
  const controller = new AbortController();
  await assert.rejects(exportCapsule(createCaseManifest(CASE_ID), output, {
    signal: controller.signal,
    onProgress(event) { if (event.phase === 'artifact-written') controller.abort(); },
  }), (error: unknown) => error instanceof ReproError && error.category === 'cancelled');
  assert.deepEqual(await readdir(parent), ['user.txt']);
  assert.equal(await readFile(join(parent, 'user.txt'), 'utf8'), 'original user file');
  await exportCapsule(createCaseManifest(CASE_ID), output);
  await writeFile(join(output, 'fixtures/repository-cases', CASE_ID, 'unregistered.js'), 'unregistered');
  await assert.rejects(importCapsule(output), (error: unknown) => error instanceof ReproError && error.code === 'CAPSULE_PATH');
});

test('readable repository test requires an executed unchanged assertion and fails buggy without exposing raw values', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  const manifest = createCaseManifest(CASE_ID);
  await exportCapsule(manifest, output);
  const testSource = await readFile(join(output, 'replay.test.mjs'));
  const sentinel = 'SECRET_SENTINEL_MUST_NOT_APPEAR_7492';
  const expected = manifest.expectation.checks.map(check => check.expected);
  const target = expected.map((value, index) => index === 0 ? 'registered-target-failure' : value);
  // This is a unit check of the emitted test's verdict/diagnostic contract. It
  // executes no browser or repository case and is not portability evidence.
  for (const scenario of ['fixed', 'buggy', 'unavailable', 'missing-assertion', 'changed-harness', 'unknown-observation', 'missing-revision'] as const) {
    const directory = join(parent, scenario); await mkdir(join(directory, 'dist'), { recursive: true });
    await writeFile(join(directory, 'replay.test.mjs'), testSource);
    const run = {
      id: 'owned-unit-run', manifestDigest: 'manifest-digest', assertionDigest: manifest.assertionDigest,
      appDigest: 'revision-digest', appRevision: scenario === 'buggy' ? 'buggy' : 'fixed',
      adapterVersion: manifest.adapter.version, runnerVersion: manifest.runnerVersion, seed: manifest.environment.seed,
      harnessDigest: scenario === 'changed-harness' ? sentinel : 'harness-digest',
      assertionCount: scenario === 'missing-assertion' || scenario === 'unavailable' ? 0 : 1,
      outcome: scenario === 'unavailable' ? 'inconclusive' : scenario === 'buggy' ? 'target-failure' : 'requirement-satisfied',
      category: scenario === 'unavailable' ? 'environment' : scenario === 'buggy' ? 'target-failure' : undefined,
      reason: sentinel,
      observation: scenario === 'unavailable' ? null : { kind: 'browser-case', values: scenario === 'buggy' ? target : scenario === 'unknown-observation' ? expected.map(() => sentinel) : expected },
    };
    await writeFile(join(directory, 'dist/index.js'), `export async function importCapsule() { return ${JSON.stringify(manifest)}; }
export async function runExperiment() { return ${JSON.stringify(run)}; }
export function digest() { return 'manifest-digest'; }
export function revisionDigest() { return 'revision-digest'; }
export function experimentHarnessDigest() { return 'harness-digest'; }
export function evaluateObservation(_manifest, observation) {
  if (JSON.stringify(observation.values) === ${JSON.stringify(JSON.stringify(expected))}) return 'requirement-satisfied';
  if (JSON.stringify(observation.values) === ${JSON.stringify(JSON.stringify(target))}) return 'target-failure';
  throw new Error(${JSON.stringify(sentinel)});
}
`);
    const result = spawnSync(process.execPath, ['--test', 'replay.test.mjs'], {
      cwd: directory,
      env: { PATH: process.env['PATH'], ...(scenario === 'missing-revision' ? {} : { REPRO_REVISION: scenario === 'buggy' ? 'buggy' : 'fixed' }) },
      encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, scenario === 'fixed' ? 0 : 1, `${scenario}: ${result.stdout}${result.stderr}`);
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false, scenario);
    if (scenario === 'buggy') assert.match(result.stdout, /TARGET_ASSERTION/);
    if (scenario === 'unavailable' || scenario === 'unknown-observation') assert.doesNotMatch(result.stdout, /TARGET_ASSERTION/);
  }
});
