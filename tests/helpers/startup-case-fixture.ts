import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { request } from 'node:http';
import { mock } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { CaseWorkerRequest, WorkerFrame } from '../../src/case-worker-protocol.js';
import type { FixtureChannel, FixtureConfig } from './case-worker-control.js';

const ownerFixture = fileURLToPath(new URL('./startup-owner-fixture.cjs', import.meta.url));

function exists(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return false; throw cause; }
}

async function controlledOwner(profile: string, detached: boolean, channel: FixtureChannel) {
  const token = randomUUID();
  const child = spawn(process.execPath, [ownerFixture, detached ? 'launcher' : 'owner', profile, token], {
    detached, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const closed = new Promise<void>(accept => child.once('close', (code, signal) => {
    channel.publish({ type: 'owner-launcher-closed', code, signal }); accept();
  }));
  const ready = new Promise<{ pid: number; port: number }>((accept, reject) => {
    child.once('message', message => accept(message as { pid: number; port: number }));
    child.once('error', reject);
    child.once('close', () => reject(new Error('Controlled startup owner closed before readiness.')));
  });
  const { pid, port } = await ready;
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && Number.isSafeInteger(port) && port > 0);
  if (detached) await closed;
  const call = (route: 'stop') => new Promise<string>((accept, reject) => {
    const operation = request({ hostname: '127.0.0.1', port, path: `/${route}`, method: 'POST', agent: false,
      signal: AbortSignal.timeout(1000), headers: { authorization: `Bearer ${token}` } }, response => {
      let body = ''; response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.once('error', reject); response.once('end', () => accept(body));
    });
    operation.once('error', reject); operation.end();
  });
  const join = async () => {
    const deadline = performance.now() + 20_000;
    while (exists(pid) && performance.now() < deadline) await delay(10);
    assert.equal(exists(pid), false, 'The controlled process must actually finish.');
    if (!detached) await closed;
  };
  let stopped: Promise<void> | undefined;
  return { join, stop: () => stopped ??= (async () => {
    if (exists(pid)) assert.equal(await call('stop'), 'stopping');
    await join();
  })(), metadata: { profile, pid, port, token, launcherPid: child.pid, launcherExitCode: child.exitCode,
    launcherGroupAbsent: detached && child.pid !== undefined ? !exists(-child.pid) : false } };
}

/** Controlled child-side mocks; all result/cleanup logic remains the real worker. */
export function installFixture(config: FixtureConfig, channel: FixtureChannel) {
  let owner: Awaited<ReturnType<typeof controlledOwner>> | undefined;
  let closes = 0, actions = 0, offset = 0;
  let disposing = false;
  let request: CaseWorkerRequest | undefined;
  let resetSequence: number | undefined;
  let operationTimer: { handle: NodeJS.Timeout; invoke: () => void; budgetMs: number; replacement?: NodeJS.Timeout } | undefined;
  const nativeSetTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
  if (config.mode === 'pending-acquisition') {
    process.on('message', (frame: { type?: string; request?: CaseWorkerRequest; seq?: number }) => {
      if (frame.type === 'start') request = frame.request;
      if (frame.type === 'event-ack' && frame.seq === resetSequence) {
        assert.ok(request && operationTimer, 'Rebase only the acknowledged reset of this exact run.');
        nativeClearTimeout(operationTimer.handle);
        offset = request.input.environment.timeoutMs - Number(process.hrtime.bigint() - BigInt(request.startedNs)) / 1e6 - 100;
      }
    });
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      const handle = nativeSetTimeout(...args);
      // Intercept only the real operation-deadline callback, identified by its
      // fixed public error, after this worker has received the exact run metadata.
      if (request && typeof args[0] === 'function' && args[0].toString().includes('The declared replay deadline expired. Check setup and retry a new run.')) {
        assert.equal(operationTimer, undefined, 'Exactly one product operation timer must be captured.');
        operationTimer = { handle, invoke: () => Reflect.apply(args[0], globalThis, args.slice(2)), budgetMs: args[1]! };
        channel.publish({ type: 'operation-timer-captured', budgetMs: args[1] });
      }
      return handle;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((handle: Parameters<typeof clearTimeout>[0]) => {
      if (operationTimer && operationTimer.handle === handle) nativeClearTimeout(operationTimer.replacement);
      nativeClearTimeout(handle);
    }) as typeof clearTimeout;
  }
  if (config.mode === 'detached-deadline') mock.timers.enable({ apis: ['setTimeout'] });
  const now = performance.now.bind(performance);
  mock.method(performance, 'now', () => now() + offset);
  channel.onCommand(async message => {
    if (message.type === 'advance-clock' && typeof message.ms === 'number') offset += message.ms;
    if (message.type === 'expire-deadline' && typeof message.ms === 'number' && config.mode === 'detached-deadline') {
      mock.timers.tick(message.ms);
      await new Promise<void>(accept => setImmediate(accept));
      channel.publish({ type: 'deadline-expired' });
    }
    if (message.type === 'fixture-dispose') { disposing = true; await owner?.stop(); }
  });
  if (config.mode === 'budget-exhausted' || config.mode === 'pending-acquisition') {
    const send = process.send!;
    process.send = ((...args: unknown[]) => {
      const frame = args[0] as WorkerFrame;
      if (config.mode === 'budget-exhausted' && frame.type === 'teardown' && frame.event.phase === 'server-close' && frame.event.event === 'call') offset += 2100;
      if (config.mode === 'pending-acquisition' && frame.type === 'event' && frame.event.type === 'reset') {
        assert.ok(request && operationTimer, 'Rebase only after the known operation timer and run identity exist.');
        resetSequence = frame.seq;
      }
      return Reflect.apply(send, process, args) as boolean;
    }) as typeof send;
  }
  let connected = true, contextClosed = false;
  const browser = Object.assign(new EventEmitter(), { version: () => '123.0.0.0', isConnected: () => connected });
  const markClosed = () => {
    contextClosed = true; connected = false;
    context.emit('close'); browser.emit('disconnected');
  };
  const context = Object.assign(new EventEmitter(), {
    browser: () => browser,
    isClosed: () => contextClosed,
    route: async () => {
      channel.publish({ type: 'setup-called', count: ++actions });
      if (config.mode === 'acquired-disconnected') {
        markClosed(); channel.publish({ type: 'context-disconnected' });
      }
      throw new Error('controlled setup failure');
    },
    close: async () => {
      channel.publish({ type: 'close-called', count: ++closes });
      // Pinned Playwright's public close() returns immediately if already closed.
      if (contextClosed) return;
      if (config.mode === 'close-rejected') throw new Error('private cleanup failure');
      if (config.mode === 'late-termination') await owner!.join();
      else await owner!.stop();
      markClosed();
    },
  });
  mock.method(chromium, 'launchPersistentContext', async (profile: string, options: Parameters<typeof chromium.launchPersistentContext>[1]) => {
    const launchStartedNs = process.hrtime.bigint();
    let pendingAcquisition: Promise<typeof context> | undefined;
    let acquireTimer: NodeJS.Timeout | undefined, abortTimer: NodeJS.Timeout | undefined;
    if (config.mode === 'pending-acquisition') {
      assert.ok(request && operationTimer);
      const remainingMs = request.input.environment.timeoutMs - Number(launchStartedNs - BigInt(request.startedNs)) / 1e6 - offset;
      channel.publish({ type: 'pending-launch-started', remainingMs, launchTimeout: options!.timeout });
      let acquired = false;
      const expireOperation = () => {
        const elapsedMs = Number(process.hrtime.bigint() - launchStartedNs) / 1e6;
        if (elapsedMs < 100) { operationTimer!.replacement = nativeSetTimeout(expireOperation, Math.ceil(100 - elapsedMs)); return; }
        channel.publish({ type: 'operation-deadline-fired', acquired, elapsedMs });
        operationTimer!.invoke();
      };
      operationTimer.replacement = nativeSetTimeout(expireOperation, 100);
      pendingAcquisition = Promise.race([
        new Promise<typeof context>(accept => {
          const acquire = () => {
            const elapsedMs = Number(process.hrtime.bigint() - launchStartedNs) / 1e6;
            if (elapsedMs < 180) { acquireTimer = nativeSetTimeout(acquire, Math.ceil(180 - elapsedMs)); return; }
            acquired = true;
            channel.publish({ type: 'acquisition-resolved', elapsedMs }); accept(context);
          };
          acquireTimer = nativeSetTimeout(acquire, 180);
        }),
        new Promise<never>((_accept, reject) => { abortTimer = nativeSetTimeout(() => reject(new Error('Launch timed out before returning its owner.')), options!.timeout); }),
      ]);
      // Readiness may arrive after a timer under host load; keep a rejection
      // handled until the actual controlled owner has been acquired below.
      void pendingAcquisition.catch(() => undefined);
    }
    const detached = ['live-rejection', 'detached-rejection', 'detached-deadline', 'close-rejected', 'late-termination', 'acquired-disconnected'].includes(config.mode);
    owner = await controlledOwner(profile, detached, channel);
    if (disposing) await owner.stop();
    channel.publish({ type: 'profile-ready', ...owner.metadata, launchTimeout: options?.timeout });
    if (config.mode === 'pending-acquisition') {
      try { return await pendingAcquisition!; }
      finally { nativeClearTimeout(acquireTimer); nativeClearTimeout(abortTimer); }
    }
    channel.ref();
    try { await Promise.race([channel.waitForCommand('release-launch'), channel.waitForCommand('fixture-dispose')]); }
    finally { channel.unref(); }
    if (config.mode === 'live-rejection') throw new Error('private simulated launch cleanup failure');
    if (config.mode === 'detached-rejection' || config.mode === 'detached-deadline') throw new Error('controlled rejected launch');
    if (config.mode === 'budget-exhausted') { await owner.stop(); await delay(10); }
    return context;
  });
}
