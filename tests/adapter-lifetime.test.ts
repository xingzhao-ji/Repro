import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http, { type Server } from 'node:http';
import { createConnection } from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { runBrowser } from '../src/adapter.js';
import { createManifest } from '../src/manifest.js';
import type { RunResult } from '../src/contracts.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function acceptsConnections(port: number): Promise<boolean> {
  const socket = createConnection({ host: '127.0.0.1', port });
  try {
    return await new Promise<boolean>((resolve, reject) => {
      socket.once('connect', () => resolve(true));
      socket.once('error', error => {
        if ('code' in error && error.code === 'ECONNREFUSED') resolve(false);
        else reject(error);
      });
    });
  } finally { socket.destroy(); }
}

interface StartupCase {
  stage: 'mkdir' | 'listen';
  stop: 'cancel' | 'deadline' | 'bind-failure';
  failBind?: boolean;
}

async function startupCase(t: TestContext, scenario: StartupCase): Promise<void> {
  const parent = resolve('.repro-runs/adapter-lifetime-tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'startup-'));
  const gate = deferred();
  const entered = deferred();
  const directoryCompleted = deferred();
  const bindingCompleted = deferred();
  const deadlineFired = deferred();
  const controller = new AbortController();
  const originalMkdir = fs.promises.mkdir;
  const originalWriteFile = fs.promises.writeFile;
  const originalCreateServer = http.createServer;
  const originalSetTimeout = globalThis.setTimeout;
  let ownedServer: Server | undefined;
  let occupied: Server | undefined;
  let occupiedPort: number | undefined;
  let ownedPort: number | undefined;
  let mkdirCalls = 0;
  let listenCalls = 0;
  let launchCalls = 0;
  let evidenceWritesBeforeRelease = 0;
  let gateReleased = false;
  let finalized = false;
  let finalizedSnapshot = '';
  let running: Promise<RunResult> | undefined;
  const observedEvents: string[] = [];
  const release = (): void => { gateReleased = true; gate.resolve(); };
  try {
    if (scenario.failBind) {
      occupied = originalCreateServer();
      await new Promise<void>(resolve => occupied!.listen(0, '127.0.0.1', resolve));
      const address = occupied.address(); assert.ok(address && typeof address !== 'string');
      occupiedPort = address.port;
    }
    t.mock.method(fs.promises, 'mkdir', async (...args: Parameters<typeof originalMkdir>) => {
      if (String(args[0]).startsWith(`${root}${sep}`)) {
        mkdirCalls++;
        if (scenario.stage === 'mkdir') { entered.resolve(); await gate.promise; }
        const value = await Reflect.apply(originalMkdir, fs.promises, args) as string | undefined;
        directoryCompleted.resolve();
        return value;
      }
      return Reflect.apply(originalMkdir, fs.promises, args) as Promise<string | undefined>;
    });
    t.mock.method(fs.promises, 'writeFile', (...args: Parameters<typeof originalWriteFile>) => {
      if (String(args[0]).startsWith(`${root}${sep}`) && !gateReleased) evidenceWritesBeforeRelease++;
      return Reflect.apply(originalWriteFile, fs.promises, args) as Promise<void>;
    });
    t.mock.method(http, 'createServer', (...args: unknown[]) => {
      const server = Reflect.apply(originalCreateServer, http, args) as Server;
      assert.equal(ownedServer, undefined, 'the run creates only one owned service');
      ownedServer = server;
      server.once('listening', () => {
        const address = server.address(); assert.ok(address && typeof address !== 'string');
        ownedPort = address.port; bindingCompleted.resolve();
      });
      server.once('error', () => { bindingCompleted.resolve(); });
      const originalListen = server.listen;
      t.mock.method(server, 'listen', (...listenArgs: unknown[]) => {
        listenCalls++;
        const bind = (): void => {
          if (occupiedPort !== undefined) listenArgs[0] = occupiedPort;
          Reflect.apply(originalListen, server, listenArgs);
        };
        if (scenario.stage === 'listen') {
          entered.resolve();
          void gate.promise.then(bind);
        } else bind();
        return server;
      });
      return server;
    });
    t.mock.method(chromium, 'launch', async () => {
      launchCalls++;
      throw new Error('A stopped startup must never launch a browser.');
    });
    if (scenario.stop === 'deadline') {
      t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay?: number) => originalSetTimeout(() => {
        callback(); deadlineFired.resolve();
      }, delay));
    }
    syncBuiltinESMExports();
    const manifest = createManifest();
    if (scenario.stop === 'deadline') manifest.environment.timeoutMs = 1000;
    running = runBrowser(manifest, { artifactDir: root, signal: controller.signal, onEvent(event) { observedEvents.push(event.type); } }).then(result => {
      finalized = true; finalizedSnapshot = JSON.stringify(result); return result;
    });
    await entered.promise;
    if (scenario.stop === 'cancel') controller.abort();
    else if (scenario.stop === 'deadline') await deadlineFired.promise;
    // Let the cancellation/deadline continuation reach cleanup while acquisition
    // remains explicitly gated. This is an event-loop barrier, not a timing race.
    await nextTurn();
    // If a broken implementation already began evidence writes, let it finish
    // before releasing startup so late result/event mutation is also observable.
    if (evidenceWritesBeforeRelease) await running;
    const finalizedBeforeRelease = finalized;
    const writesBeforeRelease = evidenceWritesBeforeRelease;
    release();
    await directoryCompleted.promise;
    await nextTurn();
    if (listenCalls) await bindingCompleted.promise;
    const result = await running;
    await nextTurn();
    assert.ok(ownedServer);
    const listeningAfterFinalization = ownedServer.listening;
    const connectsAfterFinalization = ownedPort === undefined ? false : await acceptsConnections(ownedPort);
    const evidencePath = join(root, result.id, 'evidence.json');
    const persisted = await readFile(evidencePath);
    const evidence = JSON.parse(persisted.toString()) as RunResult;
    t.diagnostic(JSON.stringify({ stage: scenario.stage, stop: scenario.stop, failBind: scenario.failBind ?? false, mkdirCalls, listenCalls, launchCalls, finalizedBeforeRelease, writesBeforeRelease, listeningAfterFinalization, connectsAfterFinalization, observedEvents, stableResult: JSON.stringify(result) === finalizedSnapshot, evidenceEventsMatch: JSON.stringify(evidence.events) === JSON.stringify(result.events), outcome: result.outcome, reason: result.reason }));
    assert.equal(finalizedBeforeRelease, false, 'pending acquisition must settle before the result is finalized');
    assert.equal(writesBeforeRelease, 0, 'evidence must follow settled acquisition and cleanup');
    assert.equal(mkdirCalls, 1);
    assert.equal(listenCalls, scenario.stage === 'mkdir' ? 0 : 1, 'stopping during mkdir must prevent later listen acquisition');
    assert.equal(launchCalls, 0);
    assert.equal(listeningAfterFinalization, false, 'the owned listener must be closed before finalization');
    assert.equal(connectsAfterFinalization, false, 'the closed listener must reject new loopback connections');
    assert.equal(ownedServer.address(), null);
    assert.deepEqual(observedEvents, []);
    assert.deepEqual(result.events, []);
    assert.equal(result.assertionCount, 0);
    assert.equal(JSON.stringify(result), finalizedSnapshot, 'the returned result must remain unchanged after finalization');
    assert.equal(result.outcome, scenario.stop === 'cancel' ? 'cancelled' : 'inconclusive');
    assert.match(result.reason, scenario.stop === 'cancel' ? /^CANCELLED:/ : scenario.stop === 'deadline' ? /^DEADLINE:/ : /^RUNNER_ERROR:/);
    assert.deepEqual(evidence.events, result.events);
    assert.equal(evidence.outcome, result.outcome);
    assert.equal(evidence.reason, result.reason);
    assert.deepEqual(result.artifacts, [{ path: `${result.id}/evidence.json`, bytes: persisted.length, sha256: createHash('sha256').update(persisted).digest('hex') }]);
    await nextTurn();
    assert.deepEqual(await readFile(evidencePath), persisted, 'persisted evidence must remain unchanged after finalization');
    if (occupied) {
      assert.equal(occupied.listening, true, 'run cleanup must preserve the unrelated service that caused the bind conflict');
      assert.ok(occupiedPort !== undefined && await acceptsConnections(occupiedPort));
    }
  } finally {
    release(); controller.abort();
    await running?.catch(() => undefined);
    await nextTurn();
    for (const server of [ownedServer, occupied]) {
      server?.closeAllConnections();
      if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
    t.mock.restoreAll(); syncBuiltinESMExports();
    await rm(root, { recursive: true, force: true });
  }
}

for (const stage of ['mkdir', 'listen'] as const) {
  for (const stop of ['cancel', 'deadline'] as const) {
    test(`${stop} during pending ${stage} settles startup before finalizing owned resources and evidence`, { timeout: 10_000 }, async t => {
      await startupCase(t, { stage, stop });
    });
  }
}

test('a real bind failure settles without browser launch and preserves the unrelated listener', { timeout: 10_000 }, async t => {
  await startupCase(t, { stage: 'listen', stop: 'bind-failure', failBind: true });
});

test('cancellation followed by a real bind failure remains cancelled without pending startup or late evidence', { timeout: 10_000 }, async t => {
  await startupCase(t, { stage: 'listen', stop: 'cancel', failBind: true });
});
