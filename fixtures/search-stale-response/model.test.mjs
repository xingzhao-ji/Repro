import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { replay, createSearchModel } from './model.mjs';
import { assertInvariant, assertOracleIntegrity, isTargetFailure, assertHumanApproved } from './oracle.mjs';
const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
test('identical synthetic response order produces target failure only in buggy model', () => {
  const inputs = structuredClone(manifest.inputs);
  assert.throws(() => assertInvariant(replay(inputs, 'buggy'), manifest.expectedBehavior), isTargetFailure);
  assert.doesNotThrow(() => assertInvariant(replay(inputs, 'fixed'), manifest.expectedBehavior));
  assert.deepEqual(inputs, manifest.inputs);
});
test('altered oracle is rejected instead of converting the buggy model into a pass', () => {
  const changed = structuredClone(manifest.expectedBehavior);
  changed.expectedResults = ['Alpha synthetic result'];
  assert.throws(() => assertInvariant(replay(manifest.inputs, 'buggy'), changed), { code: 'ORACLE_CHANGED' });
  assert.throws(() => assertOracleIntegrity({ ...changed, invariantId: 'ALWAYS_PASS' }), { code: 'ORACLE_CHANGED' });
});
test('unrelated or forged errors are not accepted as the target bug', () => {
  assert.equal(isTargetFailure(new TypeError('Cannot read properties of undefined')), false);
  assert.equal(isTargetFailure(Object.assign(new Error('fake'), { code: 'LATEST_SEARCH_RESPONSE_WINS' })), false);
  assert.throws(() => createSearchModel({ mode: 'crash' }), error => !isTargetFailure(error));
});
test('fixed model ignores old responses and still accepts its current response', () => {
  const model = createSearchModel({ mode: 'fixed' });
  model.issue({ id: 1, query: 'alpha' });
  model.receive({ requestId: 1, results: ['first'] });
  assert.deepEqual(model.snapshot().results, ['first']);
  model.issue({ id: 2, query: 'beta' });
  model.receive({ requestId: 1, results: ['stale'] });
  assert.deepEqual(model.snapshot().results, ['first']);
  model.receive({ requestId: 2, results: ['second'] });
  assert.deepEqual(model.snapshot().results, ['second']);
});
test('CLI really exits nonzero for buggy invariant and zero for fixed', () => {
  const file = new URL('./check.mjs', import.meta.url);
  for (const [mode, status, result] of [['buggy', 1, 'target-invariant-failure'], ['fixed', 0, 'pass'], ['unknown', 2, 'other-error']]) {
    const run = spawnSync(process.execPath, [file.pathname, mode], { encoding: 'utf8' });
    assert.equal(run.status, status, run.stderr);
    assert.equal(JSON.parse((status ? run.stderr : run.stdout).trim()).result, result);
  }
});
test('approval gate does not claim synthetic specification has human approval', () => {
  const pending = structuredClone(manifest);
  pending.approval = { status: 'pending-human-approval' };
  assert.throws(() => assertHumanApproved(pending), /HUMAN_APPROVAL_REQUIRED/);
});
