import assert from 'node:assert/strict';
import test from 'node:test';
import type { Manifest, RunFunction, RunResult } from '../src/contracts.js';
import { createManifest, digest } from '../src/manifest.js';
import { reduce } from '../src/reducer.js';

// Model evidence isolates the reducer's execution-identity boundary. The real
// browser runner creates fresh IDs; a reused result must not count twice.
function targetFailure(manifest: Manifest, id: string): RunResult {
  return {
    id, outcome: 'target-failure', reason: 'Synthetic reducer identity regression',
    category: 'target-failure', manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest,
    harnessDigest: 'b'.repeat(64), appRevision: manifest.app.revision, appDigest: manifest.app.sourceDigest,
    adapterVersion: manifest.adapter.version, runnerVersion: manifest.runnerVersion, seed: manifest.environment.seed,
    startedAt: '2026-01-01T00:00:00.000Z', durationMs: 1, assertionCount: 1,
    observation: { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] },
    events: [], artifacts: [],
    environment: { platform: 'test', node: process.version, browser: 'unit-model', isolation: 'synthetic-unit-model' },
  };
}
const options = {
  artifactDir: '.repro-runs/release-candidate/review/reducer-identities',
  maxExecutions: 50, maxDurationMs: 10_000, repetitions: 2,
};

test('a repeated run ID cannot establish the reduction baseline repetition rule', async () => {
  const manifest = createManifest();
  const run: RunFunction = async candidate => targetFailure(candidate, 'same-run');
  const reduced = await reduce(manifest, run, options);
  assert.equal(reduced.status, 'inconclusive');
  assert.equal(reduced.executions, 2);
  assert.equal(reduced.trials[0]?.accepted, false);
  assert.equal(reduced.trials[0]?.outcome, 'inconclusive');
  assert.deepEqual(reduced.manifest, manifest);
  assert.equal(reduced.minimality, 'unverified');
});

test('a later candidate cannot reuse an earlier execution ID to accept a deletion', async () => {
  const manifest = createManifest(); let executions = 0;
  const run: RunFunction = async candidate => targetFailure(candidate, ++executions === 2 ? 'second-baseline-run' : 'first-baseline-run');
  const reduced = await reduce(manifest, run, options);
  assert.equal(reduced.trials[0]?.accepted, true, 'Distinct baseline executions remain valid');
  assert.ok(reduced.trials.length > 1);
  assert.ok(reduced.trials.slice(1).every(trial => !trial.accepted && trial.outcome === 'inconclusive'));
  assert.deepEqual(reduced.manifest, manifest, 'Retain the last independently repeated input');
  assert.equal(reduced.minimality, 'unverified');
});
