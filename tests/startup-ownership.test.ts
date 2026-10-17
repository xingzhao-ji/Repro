import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runCaseBrowser } from '../src/case-adapter.js';
import { createCaseManifest } from '../src/browser-case.js';
import { installCaseWorkerFixture, type FixtureMessage } from './helpers/case-worker-control.js';

function exists(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return false; throw cause; }
}

/** Probe the real owner independently of worker messages and result receipts. */
function profileOwner(message: FixtureMessage) {
  const { pid, port, token, profile } = message as unknown as { pid: number; port: number; token: string; profile: string };
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && Number.isSafeInteger(port) && port > 0);
  const call = (route: 'probe' | 'stop') => new Promise<string>((accept, reject) => {
    const operation = request({ hostname: '127.0.0.1', port, path: `/${route}`, method: 'POST', agent: false,
      signal: AbortSignal.timeout(1000), headers: { authorization: `Bearer ${token}` } }, response => {
      let body = ''; response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.once('error', reject); response.once('end', () => accept(body));
    });
    operation.once('error', reject); operation.end();
  });
  let stopped: Promise<void> | undefined;
  return { pid, profile, probe: () => call('probe'), stop: () => stopped ??= (async () => {
    if (exists(pid)) assert.equal(await call('stop'), 'stopping');
    const deadline = performance.now() + 3000;
    while (exists(pid) && performance.now() < deadline) await delay(10);
    assert.equal(exists(pid), false, 'The controlled process must actually finish.');
  })() };
}

for (const cancelled of [false, true]) test(`launch rejection cannot authorize profile deletion while an owner is live (cancelled=${cancelled})`, { timeout: 8000 }, async t => {
  const root = resolve('.repro-runs/startup-cleanup-ownership/tests', randomUUID());
  await fs.mkdir(root, { recursive: true }); await fs.writeFile(join(root, 'user.txt'), 'preserve user data');
  const fixture = installCaseWorkerFixture(t, { suite: 'startup', mode: 'live-rejection', directory: root });
  let owner: ReturnType<typeof profileOwner> | undefined;
  let profile = '', deletedWhileOwnerCouldUse = false;
  const controller = new AbortController();
  const remove = fs.rm;
  t.mock.method(fs, 'rm', async (...args: Parameters<typeof fs.rm>) => {
    if (args[0] === profile && owner) deletedWhileOwnerCouldUse = await owner.probe() === 'used';
    return remove(...args);
  });
  syncBuiltinESMExports();
  try {
    const pending = runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: root, signal: controller.signal });
    owner = profileOwner(await fixture.waitFor('profile-ready')); profile = owner.profile;
    if (cancelled) controller.abort();
    fixture.command('release-launch');
    const result = await pending;
    assert.ok(owner); assert.equal(deletedWhileOwnerCouldUse, false, 'A settled launch promise is not an owner-completion acknowledgment.');
    assert.equal(await owner.probe(), 'used');
    assert.equal(result.outcome, cancelled ? 'cancelled' : 'inconclusive');
    assert.match(result.reason, /CLEANUP_FAILED/); assert.equal(result.assertionCount, 0);
    assert.match(result.reason, /Cleanup basis: [^.]*launch=unacquired; launch-join=joined; context-close=not-applicable; [^.]*\. .* Previous outcome: /);
    assert.equal(JSON.stringify(result).includes('private simulated'), false);
    const before = JSON.stringify(result); await owner.stop();
    await fs.access(profile);
    assert.equal(JSON.stringify(result), before, 'Late termination cannot erase the cleanup failure or remove retained evidence.');
    assert.equal(await fs.readFile(join(root, 'user.txt'), 'utf8'), 'preserve user data');
  } finally { controller.abort(); await owner?.stop(); await fixture.dispose(); fixture.restore(); t.mock.restoreAll(); syncBuiltinESMExports(); }
});

for (const mode of ['delayed-launch', 'close-rejected', 'late-termination'] as const) test(`owned lifecycle preserves cleanup ordering for ${mode}`, { timeout: 8000 }, async t => {
  const root = resolve('.repro-runs/startup-cleanup-ownership/tests', randomUUID());
  const fixture = installCaseWorkerFixture(t, { suite: 'startup', mode, directory: root });
  let owner: ReturnType<typeof profileOwner> | undefined;
  let profile = '', deletedWhileOwnerCouldUse = false;
  const controller = new AbortController();
  const remove = fs.rm;
  t.mock.method(fs, 'rm', async (...args: Parameters<typeof fs.rm>) => {
    if (args[0] === profile && owner && exists(owner.pid)) deletedWhileOwnerCouldUse = await owner.probe() === 'used';
    return remove(...args);
  });
  syncBuiltinESMExports();
  try {
    const pending = runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: root, signal: controller.signal });
    owner = profileOwner(await fixture.waitFor('profile-ready')); profile = owner.profile; assert.ok(owner);
    if (mode === 'delayed-launch') {
      controller.abort(); await new Promise<void>(accept => setImmediate(accept));
      assert.equal(fixture.messages.some(message => message.type === 'close-called'), false);
      assert.equal(await owner.probe(), 'used'); await fs.access(profile);
    }
    fixture.command('release-launch');
    const result = await pending;
    assert.equal(fixture.messages.some(message => message.type === 'close-called'), true); assert.equal(deletedWhileOwnerCouldUse, false);
    if (mode === 'delayed-launch') {
      assert.equal(result.outcome, 'cancelled'); await assert.rejects(fs.access(profile), { code: 'ENOENT' });
    } else {
      assert.equal(result.outcome, 'inconclusive'); assert.match(result.reason, /CLEANUP_FAILED/);
      assert.match(result.reason, mode === 'close-rejected' ? /launch=acquired; launch-join=not-needed; context-close=rejected;/ : /launch=acquired; launch-join=not-needed; context-close=timeout;/);
      assert.equal(await owner.probe(), 'used'); const before = JSON.stringify(result);
      await owner.stop(); await new Promise<void>(accept => setImmediate(accept));
      await fs.access(profile); assert.equal(JSON.stringify(result), before);
    }
  } finally {
    controller.abort();
    try { fixture.command('release-launch'); } catch { /* The already-completed worker has closed its test channel. */ }
    await owner?.stop(); await fixture.dispose(); fixture.restore(); t.mock.restoreAll(); syncBuiltinESMExports();
  }
});

for (const cancelled of [false, true]) test(`pending acquisition shares the cleanup budget without executing after stop (cancelled=${cancelled})`, { timeout: 8000 }, async t => {
  const root = resolve('.repro-runs/startup-cleanup-ownership/tests', randomUUID());
  const fixture = installCaseWorkerFixture(t, { suite: 'startup', mode: 'pending-acquisition', directory: root });
  // The fixture rebases only the child clock after cold worker imports: 100 ms
  // of operation time remains, acquisition takes 180 ms, and cleanup stays 2000 ms.
  const manifest = createCaseManifest('morphdom-textarea');
  const controller = new AbortController();
  let owner: ReturnType<typeof profileOwner> | undefined;
  let cleanupStartedNs: bigint | undefined, workerClosedNs: bigint | undefined;
  try {
    const pending = runCaseBrowser(manifest, { artifactDir: root, signal: controller.signal, onTeardown(event) {
      if (event.phase === 'run' && event.event === 'start') cleanupStartedNs = BigInt(event.monotonicNs);
    } });
    fixture.workers[0]!.child.once('close', () => { workerClosedNs = process.hrtime.bigint(); });
    owner = profileOwner(await fixture.waitFor('profile-ready'));
    if (cancelled) controller.abort();
    const result = await pending;
    assert.equal(result.outcome, cancelled ? 'cancelled' : 'inconclusive');
    assert.match(result.reason, cancelled ? /CANCELLED/ : /DEADLINE/);
    assert.equal(fixture.messages.filter(message => message.type === 'setup-called').length, 0); assert.equal(result.assertionCount, 0);
    assert.equal(fixture.messages.filter(message => message.type === 'close-called').length, 1, 'Stop must join acquisition and request acknowledged shutdown.');
    const launch = await fixture.waitFor('pending-launch-started');
    assert.ok(typeof launch.remainingMs === 'number' && launch.remainingMs > 0 && launch.remainingMs <= 100);
    assert.ok(typeof launch.launchTimeout === 'number' && Math.abs(launch.launchTimeout - launch.remainingMs - 2000) < 5,
      'The actual public launch timeout must include the unchanged shared cleanup allowance.');
    const acquired = await fixture.waitFor('acquisition-resolved');
    assert.ok(typeof acquired.elapsedMs === 'number' && acquired.elapsedMs >= 180, 'The controlled acquisition timer must really remain pending for 180 ms.');
    if (!cancelled) {
      const expired = await fixture.waitFor('operation-deadline-fired');
      assert.equal(expired.acquired, false, 'The actual operation deadline callback must fire before acquisition resolves.');
      assert.ok(typeof expired.elapsedMs === 'number' && expired.elapsedMs >= 100 && expired.elapsedMs < acquired.elapsedMs);
    }
    assert.ok(cleanupStartedNs !== undefined && workerClosedNs !== undefined);
    assert.ok(workerClosedNs - cleanupStartedNs <= 2_000_000_000n, 'Actual worker completion must join within the unchanged 2000 ms cleanup budget.');
    await assert.rejects(fs.access(owner.profile), { code: 'ENOENT' });
  } finally { controller.abort(); await owner?.stop(); await fixture.dispose(); fixture.restore(); t.mock.restoreAll(); }
});

test('an exhausted acquisition cleanup window cannot accept an immediately resolved close', { timeout: 8000 }, async t => {
  const root = resolve('.repro-runs/startup-cleanup-ownership/tests', randomUUID());
  const fixture = installCaseWorkerFixture(t, { suite: 'startup', mode: 'budget-exhausted', directory: root });
  const controller = new AbortController();
  let owner: ReturnType<typeof profileOwner> | undefined;
  try {
    const pending = runCaseBrowser(createCaseManifest('morphdom-textarea'), {
      artifactDir: root, signal: controller.signal, onTeardown: () => {},
    });
    owner = profileOwner(await fixture.waitFor('profile-ready'));
    controller.abort(); fixture.command('release-launch');
    const result = await pending;
    assert.equal(result.outcome, 'cancelled'); assert.match(result.reason, /CLEANUP_FAILED/);
    assert.match(result.reason, /launch=acquired; launch-join=joined; context-close=no-budget;/, 'A timely join whose window was then consumed is reported as no-budget.');
    assert.equal(fixture.messages.filter(message => message.type === 'close-called').length, 1, 'Still request exactly one scoped best-effort shutdown.');
    await fs.access(owner.profile);
    const before = JSON.stringify(result); await owner.stop();
    await fs.access(owner.profile); assert.equal(JSON.stringify(result), before);
  } finally { controller.abort(); await owner?.stop(); await fixture.dispose(); fixture.restore(); t.mock.restoreAll(); }
});
