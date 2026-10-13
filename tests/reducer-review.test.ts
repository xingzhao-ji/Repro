import test from 'node:test';
import assert from 'node:assert/strict';
import { createManifest, digest } from '../src/manifest.js';
import { reduce } from '../src/reducer.js';
import type { Manifest, RunFunction, RunResult } from '../src/contracts.js';

function evidence(manifest: Manifest, overrides: Partial<RunResult> = {}): RunResult {
  return {
    id: 'review-run', outcome: 'target-failure', reason: 'synthetic review evidence',
    manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest, harnessDigest: 'a'.repeat(64),
    appRevision: manifest.app.revision, appDigest: manifest.app.sourceDigest,
    adapterVersion: manifest.adapter.version, runnerVersion: manifest.runnerVersion, seed: manifest.environment.seed,
    startedAt: new Date().toISOString(), durationMs: 1, assertionCount: 1,
    observation: { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] },
    events: [], artifacts: [], environment: { platform: 'review-model', node: process.version, browser: 'not-browser-evidence', isolation: 'unit-model' },
    ...overrides,
  };
}
const options = { artifactDir: '.repro-runs/reducer-review', maxExecutions: 25, maxDurationMs: 1000, repetitions: 2 };

test('review: an unknown runtime outcome cannot become an accepted target failure', async () => {
  const manifest = createManifest();
  const run: RunFunction = async input => evidence(input, { outcome: 'unrecognized-adapter-error' as RunResult['outcome'] });
  const result = await reduce(manifest, run, options);
  assert.equal(result.status, 'inconclusive');
  assert.ok(result.trials.every(trial => !trial.accepted));
  assert.deepEqual(result.manifest, manifest);
});

test('review: target-failure label with a satisfied observation cannot establish the baseline', async () => {
  const manifest = createManifest();
  const run: RunFunction = async input => evidence(input, { observation: { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] } });
  const result = await reduce(manifest, run, options);
  assert.equal(result.status, 'inconclusive');
  assert.ok(result.trials.every(trial => !trial.accepted));
});

test('review: missing observation cannot establish an executed target failure', async () => {
  const manifest = createManifest();
  const run: RunFunction = async input => evidence(input, { observation: null });
  const result = await reduce(manifest, run, options);
  assert.equal(result.status, 'inconclusive');
  assert.ok(result.trials.every(trial => !trial.accepted));
});
