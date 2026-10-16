import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createCaseManifest } from '../src/browser-case.js';
import { runCaseBrowser } from '../src/case-adapter.js';

type Event = { phase: string; event: string; outcome?: string; late?: boolean; seq: number; runId: string;
  elapsedMs: number; monotonicNs: string; profileProbeCompletedMonotonicNs: string; profileState: string; budgetMs?: number; deadlineElapsedMs?: number };

for (const mode of ['resolve', 'reject', 'late-resolve', 'late-reject'] as const) {
  test(`teardown diagnostics distinguish ${mode} and preserve the original cleanup decision`, { timeout: 6000 }, async t => {
    const root = resolve('.repro-runs/htmx-cleanup-investigation/instrumentation-tests', randomUUID());
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'user.txt'), 'Keep user bytes');
    const events: Event[] = [];
    const browser = Object.assign(new EventEmitter(), { version: () => 'test-browser' });
    let finish!: () => void;
    const lifecycle = () => { context.emit('close'); browser.emit('disconnected'); };
    const lateWork = new Promise<void>((resolve, reject) => { finish = () => {
      lifecycle();
      if (mode === 'late-reject') reject(new Error('fake-private-rejection-secret')); else resolve();
    }; });
    const context = Object.assign(new EventEmitter(), {
      browser: () => browser,
      // Stop before page execution, but exercise real owned server/profile
      // acquisition and the production teardown state machine.
      route: async () => { throw new Error('fake-private-setup-secret'); },
      close: () => {
        if (mode.startsWith('late-')) return lateWork;
        lifecycle();
        return mode === 'reject' ? Promise.reject(new Error('fake-private-rejection-secret')) : Promise.resolve();
      },
    });
    t.mock.method(chromium, 'launchPersistentContext', async () => context);
    const options = { artifactDir: root, onTeardown: (event: Event) => events.push(event) };
    const result = await runCaseBrowser(createCaseManifest('htmx-checkbox'), options);
    const beforeLate = JSON.stringify(result);
    if (mode.startsWith('late-')) { finish(); await lateWork.catch(() => undefined); await new Promise<void>(resolve => setImmediate(resolve)); }
    assert.ok(events.length > 0, 'The requested diagnostic must observe the actual teardown branches.');
    const start = events.find(e => e.phase === 'context-close' && e.event === 'wait-start');
    const returned = events.find(e => e.phase === 'context-close' && e.event === 'wait-return');
    const settlement = events.find(e => e.phase === 'context-close' && e.event === 'wait-settled');
    assert.ok(start && returned && settlement);
    assert.equal(start.budgetMs, 2000, 'Diagnostics may not broaden the existing acknowledgement window.');
    assert.equal(start.deadlineElapsedMs, start.elapsedMs + 2000);
    assert.equal(returned.outcome, mode.startsWith('late-') ? 'timeout' : mode === 'reject' ? 'rejected' : 'resolved');
    assert.equal(settlement.outcome, mode.endsWith('reject') ? 'rejected' : 'resolved');
    assert.equal(settlement.late, mode.startsWith('late-'));
    const contextEvent = events.find(e => e.event === 'context-close-event');
    const disconnect = events.find(e => e.event === 'browser-disconnected');
    assert.ok(contextEvent && disconnect && contextEvent.seq < disconnect.seq && disconnect.seq < settlement.seq);
    if (mode.startsWith('late-')) assert.ok(returned.seq < contextEvent.seq);
    assert.equal(events.find(e => e.phase === 'execution-work' && e.event === 'wait-settled')?.outcome, 'rejected');
    assert.equal(events.find(e => e.phase === 'execution-drain' && e.event === 'wait-settled')?.outcome, 'resolved', 'The existing drain handles the work rejection.');
    assert.equal(events.filter(e => e.event === 'wait-timeout' && e.phase === 'context-close').length, mode.startsWith('late-') ? 1 : 0);
    assert.equal(JSON.stringify(result), beforeLate, 'Eventual settlement cannot turn a timeout into success.');
    assert.equal(result.outcome, 'inconclusive');
    if (mode === 'resolve') {
      assert.match(result.reason, /RUNNER_ERROR/);
      await assert.rejects(access(join(root, result.id, '.profile')), { code: 'ENOENT' });
    } else {
      assert.match(result.reason, /CLEANUP_FAILED/);
      await access(join(root, result.id, '.profile'));
      assert.equal(returned.profileState, 'present');
    }
    assert.equal(events.find(e => e.phase === 'run' && e.event === 'return')?.profileState, mode === 'resolve' ? 'absent' : 'present');
    for (let i = 0; i < events.length; i++) {
      const event = events[i]!;
      assert.equal(event.seq, i + 1); assert.equal(event.runId, result.id);
      assert.ok(BigInt(event.profileProbeCompletedMonotonicNs) >= BigInt(event.monotonicNs));
      if (i) assert.ok(BigInt(event.monotonicNs) >= BigInt(events[i - 1]!.monotonicNs));
    }
    assert.equal(JSON.stringify(events).includes('fake-private-'), false);
    assert.equal((await readFile(join(root, result.id, 'evidence.json'), 'utf8')).includes('fake-private-'), false);
    assert.equal(await readFile(join(root, 'user.txt'), 'utf8'), 'Keep user bytes');
  });
}

test('a throwing teardown observer cannot alter the product outcome or expose observer text', async t => {
  const root = resolve('.repro-runs/htmx-cleanup-investigation/instrumentation-tests', randomUUID());
  const context = Object.assign(new EventEmitter(), {
    browser: () => Object.assign(new EventEmitter(), { version: () => 'test-browser' }),
    route: async () => { throw new Error('setup'); }, close: async () => {},
  });
  t.mock.method(chromium, 'launchPersistentContext', async () => context);
  let calls = 0;
  const result = await runCaseBrowser(createCaseManifest('htmx-checkbox'), { artifactDir: root,
    ...{ onTeardown: () => { calls++; throw new Error('fake-private-observer-secret'); } } });
  assert.equal(calls, 1, 'Disable a broken optional observer without repeatedly invoking it.');
  assert.equal(result.outcome, 'inconclusive'); assert.match(result.reason, /RUNNER_ERROR/);
  assert.equal(JSON.stringify(result).includes('fake-private-observer-secret'), false);
  await assert.rejects(access(join(root, result.id, '.profile')), { code: 'ENOENT' });
});

test('the cleanup timer is registered before a diagnostic sink can delay its start', async t => {
  const root = resolve('.repro-runs/htmx-cleanup-investigation/instrumentation-tests', randomUUID());
  const context = Object.assign(new EventEmitter(), {
    browser: () => Object.assign(new EventEmitter(), { version: () => 'test-browser' }),
    route: async () => { throw new Error('setup'); }, close: async () => {},
  });
  t.mock.method(chromium, 'launchPersistentContext', async () => context);
  const original = globalThis.setTimeout;
  let registered = false, registeredBeforeObservation = false;
  t.mock.method(globalThis, 'setTimeout', (...args: Parameters<typeof setTimeout>) => {
    if (args[1] === 2000) registered = true;
    return original(...args);
  });
  await runCaseBrowser(createCaseManifest('htmx-checkbox'), { artifactDir: root, onTeardown: event => {
    if (event.phase === 'context-close' && event.event === 'wait-start') registeredBeforeObservation = registered;
  } });
  assert.equal(registeredBeforeObservation, true, 'The sink must run inside the unchanged cleanup window, not postpone it.');
});
