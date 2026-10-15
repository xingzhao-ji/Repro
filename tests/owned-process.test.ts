import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectOwnedProcess, remainingOwnedProcesses, type ProcessInspection } from './helpers/owned-process.js';

const identity = 'Wed Oct 14 16:44:20 2026 chrome-headless';
const observed = (stdout: string): ProcessInspection => ({ status: 0, stdout, stderr: '' });

test('owned process inspection records the current parent and process state', () => {
  assert.deepEqual(inspectOwnedProcess(54, () => observed(`  1 Z ${identity}\n`)), { pid: 54, ppid: 1, state: 'Z', identity });
  assert.deepEqual(inspectOwnedProcess(54, () => observed(`  34 Sl+ ${identity}\n`)), { pid: 54, ppid: 34, state: 'Sl+', identity });
});

test('inspection errors and malformed rows cannot establish owned process absence', () => {
  const failures: ProcessInspection[] = [
    { status: null, stdout: '', stderr: '', signal: 'SIGTERM', error: new Error('Owned test inspection timed out') },
    { status: null, stdout: null, stderr: null, error: new Error('Owned test ps executable unavailable') },
    { status: 1, stdout: '', stderr: 'Owned test permission failure' },
    { status: 2, stdout: '', stderr: '' },
    { status: 0, stdout: '', stderr: '' },
    { status: 1, stdout: 'unexpected output', stderr: '' },
    observed('not a process row'),
    observed(`-1 Z ${identity}`),
    observed(`9007199254740992 Z ${identity}`),
    observed(`1 0 ${identity}`),
    observed('1 Z'),
    observed(`1 Z ${identity}\n2 S ${identity}`),
  ];
  for (const result of failures) assert.throws(() => inspectOwnedProcess(54, () => result), /Process inspection failed/);
  const cause = new Error('Owned ps spawn failure');
  assert.throws(() => inspectOwnedProcess(54, () => ({ status: null, stdout: '', stderr: '', error: cause })), error => error instanceof Error && error.cause === cause);
});

test('only explicit successful no-PID output establishes absence', () => {
  assert.equal(inspectOwnedProcess(54, () => ({ status: 1, stdout: '', stderr: '' })), undefined);
  assert.equal(inspectOwnedProcess(54, () => ({ status: 1, stdout: '  \n', stderr: '' })), undefined);
});

test('invalid owned PID values cannot trigger a process inspection', () => {
  for (const pid of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    let calls = 0;
    assert.throws(() => inspectOwnedProcess(pid, () => { calls++; return observed(`1 S ${identity}`); }), /Invalid owned process PID/);
    assert.equal(calls, 0);
  }
});

test('matching zombies remain residue with refreshed parent and state', () => {
  const recorded = { pid: 54, ppid: 34, state: 'Ssl', identity };
  assert.deepEqual(remainingOwnedProcesses([recorded], () => observed(`1 Z ${identity}`)), [{ pid: 54, ppid: 1, state: 'Z', identity }]);
  assert.deepEqual(recorded, { pid: 54, ppid: 34, state: 'Ssl', identity }, 'The boundary snapshot must remain unchanged');
});

test('a reused PID is excluded from owned cleanup without inspecting unrelated identities', () => {
  const calls: number[] = [];
  const recorded = { pid: 54, ppid: 34, state: 'Ssl', identity };
  assert.deepEqual(remainingOwnedProcesses([recorded], pid => {
    calls.push(pid);
    return observed('1 S Wed Oct 14 16:45:20 2026 replacement-process');
  }), []);
  assert.deepEqual(calls, [54]);
});

test('post-cleanup residue and inspection failure remain explicit', () => {
  const recorded = { pid: 54, ppid: 34, state: 'Ssl', identity };
  assert.deepEqual(remainingOwnedProcesses([recorded], () => ({ status: 1, stdout: '', stderr: '' })), []);
  assert.equal(remainingOwnedProcesses([recorded], () => observed(`1 Z ${identity}`)).length, 1);
  assert.throws(() => remainingOwnedProcesses([recorded], () => ({ status: 1, stdout: '', stderr: 'inspection denied' })), /Process inspection failed/);
});

test('a missing ownership snapshot cannot be treated as an empty process set', () => {
  let calls = 0;
  assert.throws(() => remainingOwnedProcesses(undefined, () => { calls++; return observed(`1 S ${identity}`); }), /Owned descendant snapshot was not established/);
  assert.equal(calls, 0);
  assert.deepEqual(remainingOwnedProcesses([], () => { calls++; return observed(`1 S ${identity}`); }), []);
  assert.equal(calls, 0);
});
