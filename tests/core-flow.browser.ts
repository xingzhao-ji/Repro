import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { runSyntheticBenchmark } from '../scripts/benchmark.js';
import { runBrowser } from '../src/adapter.js';
import { createManifest } from '../src/manifest.js';
import { reduce } from '../src/reducer.js';
import type { RunResult } from '../src/contracts.js';

test('all 20 real-browser repetitions per synthetic revision preserve the frozen experiment', { timeout: 240000 }, async () => {
  const report = await runSyntheticBenchmark(join('.repro-runs', 'benchmark', randomUUID()));
  assert.equal(report.status, 'pass', `See every attempted run at ${report.root}/summary.json`);
  assert.deepEqual(report.counts, { planned: 40, executed: 40, matchedExpected: 40, unexpected: 0, skipped: 0, unrun: 0 });
});

test('real reduction removes noise with repeated original-failure evidence and fixed revision passes the reduced assertion', { timeout: 180000 }, async () => {
  const root = join('.repro-runs', 'core-flow', randomUUID());
  await mkdir(root, { recursive: true });
  const manifest = createManifest();
  const executions = new Map<string, RunResult>();
  const result = await reduce(manifest, async (input, options) => {
    const observed = await runBrowser(input, options); executions.set(observed.id, observed); return observed;
  }, { artifactDir: root, maxExecutions: 60, maxDurationMs: 120000, repetitions: 2 });
  await writeFile(join(root, 'reduction.json'), JSON.stringify({ result, executions: [...executions.values()] }, null, 2) + '\n');
  assert.equal(result.status, 'complete', result.reason);
  assert.equal(result.baseline.outcome, 'target-failure');
  assert.deepEqual(result.manifest.actions.map(action => action.id), ['navigate', 'search-alpha', 'search-beta']);
  assert.deepEqual(result.manifest.expectation, manifest.expectation);
  assert.equal(result.manifest.assertionDigest, manifest.assertionDigest);
  assert.deepEqual(result.manifest.responses, manifest.responses);
  for (const trial of result.trials.filter(trial => trial.accepted)) {
    assert.equal(trial.runIds.length, 2);
    for (const id of trial.runIds) { assert.equal(executions.get(id)?.outcome, 'target-failure'); assert.equal(executions.get(id)?.assertionCount, 1); }
  }
  const fixed = await runBrowser(result.manifest, { artifactDir: root, revision: 'fixed' });
  assert.equal(fixed.outcome, 'requirement-satisfied', fixed.reason);
  assert.equal(fixed.assertionDigest, result.baseline.assertionDigest);
  assert.equal(fixed.harnessDigest, result.baseline.harnessDigest);
});
