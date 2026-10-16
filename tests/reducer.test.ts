import assert from 'node:assert/strict';
import test from 'node:test';
import type { Action, Manifest, Outcome, ReductionOptions, RunFunction, RunResult } from '../src/contracts.js';
import { ReproError } from '../src/contracts.js';
import { createManifest, digest } from '../src/manifest.js';
import { reduce } from '../src/reducer.js';
import { createCaseManifest, getRegisteredCase } from '../src/browser-case.js';

const core: Action[] = [
  { id: 'navigate', kind: 'navigate', value: '/', dependsOn: [] },
  { id: 'alpha', kind: 'search', value: 'alpha', dependsOn: ['navigate'] },
  { id: 'beta', kind: 'search', value: 'beta', dependsOn: ['alpha'] },
];
function fixture(noise = ['one', 'two', 'three', 'four']): Manifest {
  return {
    ...createManifest(), id: 'synthetic-reducer-test',
    actions: [...structuredClone(core), ...noise.map(id => ({ id, kind: 'noise' as const, value: 'focus', dependsOn: ['navigate'] }))],
  };
}
const options: ReductionOptions = {
  artifactDir: '.repro-runs/reducer/unit', maxExecutions: 200, maxDurationMs: 10_000, repetitions: 2,
};
function result(manifest: Manifest, outcome: Outcome, count: number, overrides: Partial<RunResult> = {}): RunResult {
  return {
    id: `run-${count}`, outcome, reason: outcome, manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest,
    harnessDigest: 'b'.repeat(64), appRevision: manifest.app.revision, appDigest: manifest.app.sourceDigest,
    adapterVersion: manifest.adapter.version, runnerVersion: manifest.runnerVersion, seed: manifest.environment.seed,
    startedAt: new Date().toISOString(), durationMs: 1, assertionCount: outcome === 'inconclusive' ? 0 : 1,
    observation: outcome === 'target-failure' || outcome === 'requirement-satisfied' ? { latestRequestId: 2, query: 'beta', results: [outcome === 'target-failure' ? 'Alpha synthetic result' : 'Beta synthetic result'] } : null, events: [], artifacts: [],
    environment: { platform: 'test', node: process.version, browser: 'fake-unit-runner', isolation: 'synthetic-unit-model' },
    ...overrides,
  };
}
function hasCore(manifest: Manifest): boolean { return core.every(action => manifest.actions.some(item => item.id === action.id)); }
function fake(predicate: (manifest: Manifest, call: number) => Outcome): { run: RunFunction; calls: Manifest[]; directories: string[] } {
  const calls: Manifest[] = [], directories: string[] = [];
  return {
    calls, directories,
    run: async (manifest, runOptions) => {
      calls.push(structuredClone(manifest)); directories.push(runOptions.artifactDir);
      assert.ok(Object.isFrozen(manifest.expectation), 'frozen independent expectation');
      assert.ok(Object.isFrozen(manifest.actions), 'runner cannot mutate next candidate');
      return result(manifest, predicate(manifest, calls.length), calls.length);
    },
  };
}

test('dependency-closed chunk deletion reduces a non-monotonic failure and rechecks final neighbors', async () => {
  const input = fixture(); const before = structuredClone(input);
  const runner = fake(manifest => hasCore(manifest)
    && (manifest.actions.some(action => action.id === 'one') === manifest.actions.some(action => action.id === 'two'))
    ? 'target-failure' : 'requirement-satisfied');
  const reduced = await reduce(input, runner.run, options);
  assert.deepEqual(input, before);
  assert.deepEqual(reduced.manifest.actions, core);
  assert.equal(reduced.status, 'complete'); assert.equal(reduced.minimality, 'dependency-group-1-minimal');
  assert.equal(reduced.executions, runner.calls.length);
  assert.equal(new Set(runner.directories).size, runner.calls.length, 'each run owns isolated reset/artifact scope');
  for (const manifest of runner.calls) {
    assert.equal(manifest.assertionDigest, input.assertionDigest);
    assert.deepEqual(manifest.expectation, input.expectation);
    assert.deepEqual(manifest.responses, input.responses);
    const ids = new Set(manifest.actions.map(action => action.id));
    for (const action of manifest.actions) for (const prerequisite of action.dependsOn) assert.ok(ids.has(prerequisite));
  }
  for (const trial of reduced.trials.filter(trial => trial.accepted)) {
    assert.equal(trial.outcome, 'target-failure'); assert.equal(trial.runIds.length, options.repetitions);
    assert.equal(trial.seed, input.environment.seed); assert.match(trial.inputDigest, /^[a-f0-9]{64}$/);
  }
  const lastAccepted = reduced.trials.findLastIndex(trial => trial.accepted);
  const finalNeighbors = reduced.trials.slice(lastAccepted + 1);
  assert.ok(finalNeighbors.some(trial => trial.removed.join(',') === 'beta'));
  assert.ok(finalNeighbors.some(trial => trial.removed.join(',') === 'alpha,beta'));
  assert.ok(finalNeighbors.some(trial => trial.removed.join(',') === 'navigate,alpha,beta'));
});

test('accepted final-neighbor deletion restarts neighbor checks on the new final manifest', async () => {
  const input = fixture(['one', 'two', 'three']);
  const runner = fake(manifest => {
    const noise = manifest.actions.filter(action => action.kind === 'noise').map(action => action.id).join(',');
    return hasCore(manifest) && ['one,two,three', 'two,three', 'three'].includes(noise) ? 'target-failure' : 'requirement-satisfied';
  });
  const reduced = await reduce(input, runner.run, options);
  assert.deepEqual(reduced.manifest.actions.map(action => action.id), ['navigate', 'alpha', 'beta', 'three']);
  const lastAccepted = reduced.trials.findLastIndex(trial => trial.accepted);
  assert.ok(reduced.trials.slice(lastAccepted + 1).some(trial => trial.removed.join(',') === 'three'));
  assert.equal(reduced.minimality, 'dependency-group-1-minimal');
});

test('wrong failures and missing state never preserve the failure or establish minimality', async () => {
  const input = fixture(['one']);
  const runner = fake(manifest => manifest.actions.length === input.actions.length ? 'target-failure' : 'inconclusive');
  const reduced = await reduce(input, runner.run, options);
  assert.deepEqual(reduced.manifest, input); assert.equal(reduced.minimality, 'unverified');
  assert.ok(reduced.trials.filter(trial => trial.removed.length).every(trial => !trial.accepted));
  assert.match(reduced.reason, /inconclusive/i);
});

for (const caseId of ['synthetic', 'morphdom-textarea', 'htmx-checkbox', 'marked-empty-heading']) {
  test(`${caseId}: a satisfied neighbor carrying a target-failure category cannot establish minimality`, async () => {
    const input = caseId === 'synthetic' ? fixture([]) : createCaseManifest(caseId);
    const registered = input.schemaVersion === 3 ? getRegisteredCase(input.caseId) : undefined;
    let calls = 0;
    const run: RunFunction = async manifest => {
      const outcome = manifest.actions.length === input.actions.length ? 'target-failure' : 'requirement-satisfied';
      const observation = registered ? {
        kind: 'browser-case' as const,
        values: outcome === 'target-failure' ? registered.intendedFailures.at(-1)! : registered.expectation.checks.map(check => check.expected),
      } : undefined;
      return result(manifest, outcome, ++calls, {
        category: 'target-failure', ...(observation ? { observation } : {}),
      });
    };
    const reduced = await reduce(input, run, options);
    assert.equal(reduced.trials[0]!.accepted, true, 'A matching baseline category remains valid.');
    assert.deepEqual(reduced.manifest, input);
    assert.equal(reduced.minimality, 'unverified', 'Contradictory error categories cannot establish final-neighbor conclusions.');
    assert.ok(reduced.trials.slice(1).length > 0);
    assert.ok(reduced.trials.slice(1).every(trial => trial.outcome === 'inconclusive' && !trial.accepted));
    assert.ok(reduced.trials.slice(1).every(trial => /contradictory error category/.test(trial.reason)));
  });
}

test('an unstable candidate fails the baseline repeatability rule', async () => {
  const input = fixture(['one']); const occurrences = new Map<string, number>();
  const runner = fake(manifest => {
    if (!hasCore(manifest)) return 'requirement-satisfied';
    if (manifest.actions.length === input.actions.length) return 'target-failure';
    const key = digest(manifest), seen = (occurrences.get(key) ?? 0) + 1; occurrences.set(key, seen);
    return seen % 2 ? 'target-failure' : 'requirement-satisfied';
  });
  const reduced = await reduce(input, runner.run, options);
  assert.deepEqual(reduced.manifest, input); assert.equal(reduced.minimality, 'unverified');
  assert.ok(reduced.trials.some(trial => /unstable/i.test(trial.reason) && !trial.accepted));
});

test('an unstable baseline stops reduction without accepting any candidate', async () => {
  const input = fixture(); const runner = fake((_manifest, call) => call === 1 ? 'target-failure' : 'requirement-satisfied');
  const reduced = await reduce(input, runner.run, options);
  assert.equal(reduced.status, 'inconclusive'); assert.equal(reduced.executions, 2);
  assert.deepEqual(reduced.manifest, input); assert.ok(reduced.trials.every(trial => !trial.accepted));
});

test('execution budget includes repetitions and preserves the last verified candidate', async () => {
  const input = fixture(); const runner = fake(manifest => hasCore(manifest) ? 'target-failure' : 'requirement-satisfied');
  const reduced = await reduce(input, runner.run, { ...options, maxExecutions: 5 });
  assert.equal(reduced.status, 'budget-exhausted'); assert.equal(reduced.minimality, 'unverified');
  assert.equal(reduced.executions, 5); assert.equal(runner.calls.length, 5); assert.ok(hasCore(reduced.manifest));
  assert.ok(reduced.trials.filter(trial => trial.accepted).every(trial => trial.runIds.length === 2));
});

test('pre-cancelled work makes no runner call and reports no executed baseline assertion', async () => {
  const controller = new AbortController(); controller.abort(); const runner = fake(() => 'target-failure');
  const reduced = await reduce(fixture(), runner.run, { ...options, signal: controller.signal });
  assert.equal(reduced.status, 'cancelled'); assert.equal(reduced.executions, 0); assert.equal(runner.calls.length, 0);
  assert.equal(reduced.baseline.assertionCount, 0); assert.equal(reduced.minimality, 'unverified');
});

test('cancellation reaches the active runner and returns the verified baseline', async () => {
  const input = fixture(); const controller = new AbortController(); let calls = 0;
  const run: RunFunction = async (manifest, runOptions) => {
    calls++;
    if (calls <= 2) return result(manifest, 'target-failure', calls);
    controller.abort(); assert.equal(runOptions.signal?.aborted, true);
    return result(manifest, 'cancelled', calls, { assertionCount: 0 });
  };
  const reduced = await reduce(input, run, { ...options, signal: controller.signal });
  assert.equal(reduced.status, 'cancelled'); assert.equal(calls, 3); assert.deepEqual(reduced.manifest, input);
});

test('wall deadline aborts the active cooperative runner and cannot accept its late result', async () => {
  const input = fixture(); let calls = 0; let observedAbort = false;
  const run: RunFunction = async (manifest, runOptions) => {
    calls++;
    if (calls <= 2) return result(manifest, 'target-failure', calls);
    await new Promise<void>(resolve => runOptions.signal!.addEventListener('abort', () => { observedAbort = true; resolve(); }, { once: true }));
    return result(manifest, 'target-failure', calls);
  };
  const reduced = await reduce(input, run, { ...options, maxDurationMs: 35 });
  assert.equal(observedAbort, true); assert.equal(reduced.status, 'budget-exhausted');
  assert.equal(reduced.minimality, 'unverified'); assert.deepEqual(reduced.manifest, input);
  assert.ok(reduced.durationMs < 1000);
});

test('changed harness, empty assertions, and incorrect full input digest are inconclusive', async () => {
  for (const alteration of [{ harnessDigest: 'c'.repeat(64) }, { assertionCount: 0 }, { manifestDigest: 'd'.repeat(64) }]) {
    const input = fixture(['one']); let calls = 0;
    const run: RunFunction = async manifest => result(manifest, 'target-failure', ++calls, calls > 2 ? alteration : {});
    const reduced = await reduce(input, run, options);
    assert.deepEqual(reduced.manifest, input); assert.equal(reduced.minimality, 'unverified');
    assert.ok(reduced.trials.filter(trial => trial.removed.length).every(trial => trial.outcome === 'inconclusive'));
  }
});

test('runner exceptions are inconclusive and raw secrets are not copied into the trial ledger', async () => {
  const input = fixture(['one']); let calls = 0;
  const run: RunFunction = async manifest => {
    if (++calls <= 2) return result(manifest, 'target-failure', calls);
    throw new Error('password=fixture-secret-must-not-be-logged');
  };
  const reduced = await reduce(input, run, options);
  assert.deepEqual(reduced.manifest, input); assert.equal(reduced.minimality, 'unverified');
  assert.ok(!JSON.stringify(reduced).includes('fixture-secret-must-not-be-logged'));
});

test('unconfirmed expectations cannot establish a reduction baseline', async () => {
  const input = fixture(); input.expectationBasis = 'proposed-unconfirmed'; const runner = fake(() => 'target-failure');
  const reduced = await reduce(input, runner.run, options);
  assert.equal(reduced.status, 'inconclusive'); assert.equal(reduced.executions, 0); assert.equal(reduced.baseline.assertionCount, 0);
});

test('invalid budgets and dependencies are rejected before execution', async () => {
  const runner = fake(() => 'target-failure');
  for (const invalid of [{ maxExecutions: 0 }, { maxDurationMs: Infinity }, { repetitions: 0 }, { repetitions: 1.5 }]) {
    await assert.rejects(reduce(fixture(), runner.run, { ...options, ...invalid }), error => error instanceof ReproError && error.category === 'input');
  }
  const invalid = fixture(); invalid.actions[1]!.dependsOn = ['missing'];
  await assert.rejects(reduce(invalid, runner.run, options), error => error instanceof ReproError && error.category === 'input');
  assert.equal(runner.calls.length, 0);
});
