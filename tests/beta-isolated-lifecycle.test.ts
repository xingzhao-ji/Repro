import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(resolve('scripts/verify-beta-isolated.mjs')).href;
const driver = await import(moduleUrl);

test('owner cancellation during final cleanup prevents accepted completion', () => {
  for (const previous of ['passed', 'exploratory-completed', 'inconclusive']) {
    assert.equal(driver.finalBatchStatus(previous, [], true), 'cancelled');
    assert.equal(driver.finalBatchStatus(previous, ['OWNED_STOP_FAILED'], true), 'cancelled');
  }
  assert.equal(driver.finalBatchStatus('passed', [], false), 'passed');
  assert.equal(driver.finalBatchStatus('exploratory-completed', [], false), 'exploratory-completed');
  assert.equal(driver.finalBatchStatus('passed', ['OWNED_STOP_FAILED'], false), 'inconclusive');
  assert.equal(driver.finalBatchStatus('cancelled', ['OWNED_STOP_FAILED'], false), 'cancelled');
});

for (const trigger of ['timeout', 'cancel'] as const) {
  test(`${trigger}: a Docker client closing after SIGTERM receives no later escalation`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const signals: Array<{ pid: number; signal: string | number | undefined }> = [];
    t.mock.method(process, 'kill', (pid: number, signal?: string | number) => { signals.push({ pid, signal }); return true; });
    const child = Object.assign(new EventEmitter(), { pid: 7654321 });
    let cancelled = false;
    const completed = driver.watchDockerClient(child, { maximumMs: trigger === 'timeout' ? 100 : 40000, isCancelled: () => cancelled, cleanup: false, onSignalError: () => assert.fail('No real process may be signaled') });
    if (trigger === 'cancel') cancelled = true;
    t.mock.timers.tick(100);
    assert.deepEqual(signals, [{ pid: -7654321, signal: 'SIGTERM' }]);
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
    const result = await completed;
    t.mock.timers.tick(2000);
    assert.deepEqual(signals, [{ pid: -7654321, signal: 'SIGTERM' }], 'An exited client no longer owns its old process-group identity');
    assert.equal(result.timedOut, trigger === 'timeout');
    assert.equal(result.cancelled, trigger === 'cancel');
  });
}

test('client exit suppresses signaling even while its stdio has not closed', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const signals: unknown[] = [];
  t.mock.method(process, 'kill', (...args: unknown[]) => { signals.push(args); return true; });
  const child = Object.assign(new EventEmitter(), { pid: 7654321 });
  const completed = driver.watchDockerClient(child, { maximumMs: 500, isCancelled: () => false, cleanup: false, onSignalError: () => assert.fail('Unexpected signal failure') });
  child.emit('exit', 0, null);
  t.mock.timers.tick(2000);
  child.emit('close', 0, null);
  await completed;
  assert.deepEqual(signals, [], 'The exit event ends process-group signaling before the close event drains stdio');
});

test('a client that remains alive receives one bounded escalation and keeps its stop verdict', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const signals: unknown[] = [];
  t.mock.method(process, 'kill', (...args: unknown[]) => { signals.push(args); return true; });
  const child = Object.assign(new EventEmitter(), { pid: 7654321 });
  const completed = driver.watchDockerClient(child, { maximumMs: 100, isCancelled: () => false, cleanup: false, onSignalError: () => assert.fail('Unexpected signal failure') });
  t.mock.timers.tick(100); t.mock.timers.tick(1000);
  assert.deepEqual(signals, [[-7654321, 'SIGTERM'], [-7654321, 'SIGKILL']]);
  child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL');
  const result = await completed;
  assert.equal(result.timedOut, true); assert.equal(result.code, null); assert.equal(result.signal, 'SIGKILL');
});

test('an unavailable client never receives a signal or a late watchdog verdict', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const signals: unknown[] = [];
  t.mock.method(process, 'kill', (...args: unknown[]) => { signals.push(args); return true; });
  const child = new EventEmitter();
  const completed = driver.watchDockerClient(child, { maximumMs: 100, isCancelled: () => true, cleanup: false, onSignalError: () => assert.fail('Unexpected signal failure') });
  child.emit('error', new Error('simulated unavailable executable'));
  const result = await completed; t.mock.timers.tick(2000);
  assert.equal(result.launchFailed, true); assert.equal(result.timedOut, false); assert.equal(result.cancelled, false);
  assert.deepEqual(signals, []);
});

test('a client exiting after its watchdog cannot leave an unbounded stdio wait', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const signals: unknown[] = [];
  t.mock.method(process, 'kill', (...args: unknown[]) => { signals.push(args); return true; });
  const destroy = t.mock.fn();
  const child = Object.assign(new EventEmitter(), { pid: 7654321, stdout: { destroy }, stderr: { destroy } });
  let receipt: { timedOut: boolean; stdioIncomplete: boolean } | undefined;
  const completed = driver.watchDockerClient(child, { maximumMs: 100, isCancelled: () => false, cleanup: false, onSignalError: () => assert.fail('Unexpected signal failure') }).then((value: typeof receipt) => { receipt = value; });
  t.mock.timers.tick(100);
  child.emit('exit', 0, null);
  t.mock.timers.tick(2000);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.ok(receipt, 'The already-expired deadline must bound stdio waiting after process exit');
  await completed;
  assert.equal(receipt.timedOut, true); assert.equal(receipt.stdioIncomplete, true);
  assert.equal(destroy.mock.callCount(), 2);
  assert.deepEqual(signals, [[-7654321, 'SIGTERM']]);
});

test('early owner cancellation bounds stdio drain without becoming a later timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const signals: unknown[] = [];
  t.mock.method(process, 'kill', (...args: unknown[]) => { signals.push(args); return true; });
  const destroy = t.mock.fn();
  const child = Object.assign(new EventEmitter(), { pid: 7654321, stdout: { destroy }, stderr: { destroy } });
  let receipt: { timedOut: boolean; cancelled: boolean; stdioIncomplete: boolean } | undefined;
  const completed = driver.watchDockerClient(child, { maximumMs: 900000, isCancelled: () => true, cleanup: false, onSignalError: () => assert.fail('Unexpected signal failure') }).then((value: typeof receipt) => { receipt = value; });
  t.mock.timers.tick(100);
  child.emit('exit', 0, null);
  t.mock.timers.tick(2000);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.ok(receipt, 'Owner cancellation must not wait for the original 15-minute watchdog after client exit');
  await completed;
  assert.equal(receipt.cancelled, true); assert.equal(receipt.timedOut, false); assert.equal(receipt.stdioIncomplete, true);
  assert.equal(destroy.mock.callCount(), 2);
  assert.deepEqual(signals, [[-7654321, 'SIGTERM']]);
});

test('owner cancellation after normal client exit still interrupts stuck stdio without signaling', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const signals: unknown[] = [];
  t.mock.method(process, 'kill', (...args: unknown[]) => { signals.push(args); return true; });
  const destroy = t.mock.fn();
  const child = Object.assign(new EventEmitter(), { pid: 7654321, stdout: { destroy }, stderr: { destroy } });
  let cancelled = false;
  let receipt: { timedOut: boolean; cancelled: boolean; stdioIncomplete: boolean } | undefined;
  const completed = driver.watchDockerClient(child, { maximumMs: 900000, isCancelled: () => cancelled, cleanup: false, onSignalError: () => assert.fail('Unexpected signal failure') }).then((value: typeof receipt) => { receipt = value; });
  child.emit('exit', 0, null);
  cancelled = true;
  t.mock.timers.tick(100);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.ok(receipt, 'Cancellation observation must continue until stdio closes, even after normal process exit');
  await completed;
  assert.equal(receipt.cancelled, true); assert.equal(receipt.timedOut, false); assert.equal(receipt.stdioIncomplete, true);
  assert.equal(destroy.mock.callCount(), 2);
  assert.deepEqual(signals, []);
});

test('normal exit followed by close removes cancellation polling and the watchdog', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const signals: unknown[] = [];
  t.mock.method(process, 'kill', (...args: unknown[]) => { signals.push(args); return true; });
  const isCancelled = t.mock.fn(() => false);
  const child = Object.assign(new EventEmitter(), { pid: 7654321 });
  const completed = driver.watchDockerClient(child, { maximumMs: 1000, isCancelled, cleanup: false, onSignalError: () => assert.fail('Unexpected signal failure') });
  child.emit('exit', 0, null);
  t.mock.timers.tick(100);
  child.emit('close', 0, null);
  const receipt = await completed;
  const callsAtClose = isCancelled.mock.callCount();
  t.mock.timers.tick(2000);
  assert.equal(isCancelled.mock.callCount(), callsAtClose);
  assert.equal(receipt.code, 0); assert.equal(receipt.cancelled, false); assert.equal(receipt.timedOut, false);
  assert.deepEqual(signals, []);
});
