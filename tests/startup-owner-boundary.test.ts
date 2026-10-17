import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { runCaseBrowser } from '../src/case-adapter.js';
import { createCaseManifest } from '../src/browser-case.js';
import { installCaseWorkerFixture, type FixtureMessage } from './helpers/case-worker-control.js';

const fixture = fileURLToPath(new URL('./helpers/startup-owner-fixture.cjs', import.meta.url));

function exists(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return false; throw cause; }
}

async function untilAbsent(pid: number) {
  const deadline = performance.now() + 3000;
  while (exists(pid) && performance.now() < deadline) await delay(10);
  assert.equal(exists(pid), false, 'The controlled process must actually finish.');
}

async function bounded<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let expire!: () => void;
  try {
    return await Promise.race([work, new Promise<never>((_accept, reject) => {
      expire = () => reject(new Error(message)); timeout.addEventListener('abort', expire, { once: true });
    })]);
  } finally { timeout.removeEventListener('abort', expire); }
}

async function controlledOwner(directory: string, detachedDescendant: boolean, capture?: (child: ChildProcess) => void) {
  await fs.mkdir(directory, { recursive: true });
  const token = randomUUID();
  const child = spawn(process.execPath, [fixture, detachedDescendant ? 'launcher' : 'owner', directory, token], {
    detached: detachedDescendant, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const closed = new Promise<void>(accept => { child.once('close', () => accept()); });
  capture?.(child);
  let acceptReady!: (value: unknown) => void, rejectReady!: (cause: Error) => void;
  const ready = new Promise<unknown>((accept, reject) => { acceptReady = accept; rejectReady = reject; });
  const earlyClose = () => rejectReady(new Error('Controlled owner closed before readiness.'));
  child.once('message', acceptReady); child.once('error', rejectReady); child.once('close', earlyClose);
  let pid: number, port: number;
  try {
    const message = await bounded(ready, 3000, 'Controlled owner readiness deadline expired.');
    ({ pid, port } = message as { pid: number; port: number });
    assert.ok(Number.isSafeInteger(pid) && pid > 0 && Number.isSafeInteger(port) && port > 0);
  } catch (cause) {
    if (child.exitCode === null && child.signalCode === null) {
      const terminate = () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); };
      if (child.connected) child.send('stop', error => { if (error) terminate(); });
      else terminate();
    }
    await bounded(closed, 3000, 'The exact controlled child did not complete failed acquisition cleanup.');
    throw cause;
  } finally { child.off('message', acceptReady); child.off('error', rejectReady); child.off('close', earlyClose); }
  const call = (route: 'probe' | 'stop') => new Promise<string>((accept, reject) => {
    const operation = request({ hostname: '127.0.0.1', port, path: `/${route}`, method: 'POST', agent: false, signal: AbortSignal.timeout(1000),
      headers: { authorization: `Bearer ${token}` } }, response => {
      let body = ''; response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.once('error', reject); response.once('end', () => accept(body));
    });
    operation.once('error', reject); operation.end();
  });
  let stopped: Promise<void> | undefined;
  return { child, closed, pid, probe: () => call('probe'), stop: () => stopped ??= (async () => {
    if (exists(pid)) assert.equal(await call('stop'), 'stopping');
    if (!detachedDescendant) await closed;
    await untilAbsent(pid);
  })() };
}

function fixtureOwner(message: FixtureMessage) {
  const { pid, port, token, profile, launcherPid, launcherExitCode } = message as unknown as {
    pid: number; port: number; token: string; profile: string; launcherPid: number; launcherExitCode: number | null;
  };
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
  return { pid, profile, launcherPid, launcherExitCode, probe: () => call('probe'), stop: () => stopped ??= (async () => {
    if (exists(pid)) assert.equal(await call('stop'), 'stopping');
    await untilAbsent(pid);
  })() };
}

for (const boundary of ['rejection', 'deadline'] as const) test(`launcher completion and absent process group do not authorize profile deletion after ${boundary}`, {
  timeout: 10_000, skip: process.platform === 'win32',
}, async t => {
  const root = resolve('.repro-runs/startup-owner-boundary/tests', randomUUID());
  const sentinel = await controlledOwner(join(root, 'unrelated'), false);
  const fixture = installCaseWorkerFixture(t, { suite: 'startup', mode: boundary === 'deadline' ? 'detached-deadline' : 'detached-rejection', directory: root });
  let owner: ReturnType<typeof fixtureOwner> | undefined;
  let profile: string;
  const manifest = createCaseManifest('morphdom-textarea');
  try {
    const pending = runCaseBrowser(manifest, { artifactDir: join(root, 'artifacts') });
    owner = fixtureOwner(await fixture.waitFor('profile-ready')); profile = owner.profile;
    assert.equal(owner.launcherExitCode, 0); assert.ok(owner.launcherPid);
    assert.equal(exists(-owner.launcherPid), false, 'The original launcher process group has no remaining members.');
    assert.equal(await owner.probe(), 'used', 'A detached descendant still actively uses the profile.');
    if (boundary === 'deadline') {
      fixture.command('expire-deadline', { ms: manifest.environment.timeoutMs + 1 });
      await fixture.waitFor('deadline-expired');
    }
    fixture.command('release-launch');
    const result = await pending;
    assert.ok(owner); assert.equal(result.outcome, 'inconclusive'); assert.match(result.reason, /CLEANUP_FAILED/);
    if (boundary === 'deadline') assert.match(result.reason, /DEADLINE/);
    else assert.match(result.reason, /launch=unacquired; launch-join=joined; context-close=not-applicable;/);
    assert.equal(result.assertionCount, 0);
    await fs.access(profile); assert.equal(await owner.probe(), 'used'); assert.equal(await sentinel.probe(), 'used');
    const original = JSON.stringify(result);
    await owner.stop();
    await fs.access(profile);
    assert.equal(JSON.stringify(result), original, 'Late descendant completion must not revise the returned failure.');
    assert.equal(await sentinel.probe(), 'used');
  } finally {
    try { fixture.command('release-launch'); } catch { /* The completed worker has closed its test channel. */ }
    try { await owner?.stop(); await fixture.dispose(); }
    finally { fixture.restore(); t.mock.restoreAll(); await sentinel.stop(); }
  }
});

test('confirmed controlled owner completion permits profile deletion without stopping an unrelated owner', { timeout: 10_000 }, async t => {
  const root = resolve('.repro-runs/startup-owner-boundary/tests', randomUUID());
  const sentinel = await controlledOwner(join(root, 'unrelated'), false);
  const fixture = installCaseWorkerFixture(t, { suite: 'startup', mode: 'confirmed', directory: root });
  let owner: ReturnType<typeof fixtureOwner> | undefined;
  let profile = '', ownerWasAliveAtRemoval = false;
  const controller = new AbortController();
  const remove = fs.rm;
  t.mock.method(fs, 'rm', async (...args: Parameters<typeof fs.rm>) => {
    if (args[0] === profile && owner) ownerWasAliveAtRemoval = exists(owner.pid);
    return remove(...args);
  });
  syncBuiltinESMExports();
  try {
    const pending = runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: join(root, 'artifacts'), signal: controller.signal });
    owner = fixtureOwner(await fixture.waitFor('profile-ready')); profile = owner.profile;
    controller.abort(); fixture.command('release-launch');
    const result = await pending;
    assert.ok(owner); assert.equal((await fixture.waitFor('owner-launcher-closed')).code, 0); assert.equal(ownerWasAliveAtRemoval, false);
    assert.equal(result.outcome, 'cancelled'); assert.doesNotMatch(result.reason, /CLEANUP_FAILED/);
    await assert.rejects(fs.access(profile), { code: 'ENOENT' }); assert.equal(await sentinel.probe(), 'used');
  } finally {
    controller.abort();
    try { await owner?.stop(); await fixture.dispose(); }
    finally { fixture.restore(); t.mock.restoreAll(); syncBuiltinESMExports(); await sentinel.stop(); }
  }
});

test('an acquired disconnected context cannot certify a detached writer has stopped', { timeout: 10_000, skip: process.platform === 'win32' }, async t => {
  const root = resolve('.repro-runs/startup-owner-boundary/tests', randomUUID());
  const sentinel = await controlledOwner(join(root, 'unrelated'), false);
  const fixture = installCaseWorkerFixture(t, { suite: 'startup', mode: 'acquired-disconnected', directory: root });
  let owner: ReturnType<typeof fixtureOwner> | undefined;
  let ownerWasAliveAtRemoval = false;
  const remove = fs.rm;
  t.mock.method(fs, 'rm', async (...args: Parameters<typeof fs.rm>) => {
    if (owner && args[0] === owner.profile) ownerWasAliveAtRemoval = exists(owner.pid);
    return remove(...args);
  });
  syncBuiltinESMExports();
  try {
    const pending = runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: join(root, 'artifacts') });
    owner = fixtureOwner(await fixture.waitFor('profile-ready'));
    assert.equal(owner.launcherExitCode, 0);
    assert.equal(exists(-owner.launcherPid), false, 'The original launcher group has already disappeared.');
    assert.equal(await owner.probe(), 'used');
    fixture.command('release-launch');
    const result = await pending;
    await fixture.waitFor('context-disconnected');
    assert.equal(result.environment.browser, '123.0.0.0 (pinned Chromium)', 'The accepted worker receipt must reach the cleanup decision; a protocol rejection cannot satisfy this regression.');
    assert.equal(fixture.messages.filter(message => message.type === 'close-called').length, 1,
      'Still make one scoped close request even when the context already reports closed.');
    assert.equal(ownerWasAliveAtRemoval, false, 'An idempotent close after disconnection must not delete a live detached writer’s profile.');
    assert.equal(result.outcome, 'inconclusive'); assert.match(result.reason, /CLEANUP_FAILED/); assert.equal(result.assertionCount, 0);
    assert.match(result.reason, /launch=acquired; launch-join=[a-z-]+; context-close=stale;/, 'An already-disconnected context is reported as stale, not acknowledged.');
    await fs.access(owner.profile); assert.equal(await owner.probe(), 'used'); assert.equal(await sentinel.probe(), 'used');
    const original = JSON.stringify(result);
    await owner.stop(); await fs.access(owner.profile);
    assert.equal(JSON.stringify(result), original, 'Late descendant completion cannot rewrite an unacknowledged cleanup failure.');
    assert.equal(await sentinel.probe(), 'used');
  } finally {
    try { await owner?.stop(); await fixture.dispose(); }
    finally { fixture.restore(); t.mock.restoreAll(); syncBuiltinESMExports(); await sentinel.stop(); }
  }
});

test('fixture owner setup failure closes its launcher and preserves an unrelated owner', { timeout: 10_000 }, async () => {
  const root = resolve('.repro-runs/startup-owner-boundary/tests', randomUUID());
  const sentinel = await controlledOwner(join(root, 'unrelated'), false);
  const invalid = join(root, 'invalid-owner');
  await fs.mkdir(join(invalid, 'owned-use'), { recursive: true });
  await fs.writeFile(join(invalid, 'user.txt'), 'preserve this file');
  let launcher: ChildProcess | undefined, closed: Promise<void> | undefined;
  try {
    await assert.rejects(bounded(controlledOwner(invalid, true, child => {
      launcher = child; closed = new Promise<void>(accept => { child.once('close', () => accept()); });
    }), 1500, 'Acquisition did not reject promptly after close-before-ready.'), /closed before readiness/);
    assert.ok(launcher); assert.ok(closed); await closed;
    assert.equal(launcher.exitCode, 1); assert.equal(await sentinel.probe(), 'used');
    assert.equal(await fs.readFile(join(invalid, 'user.txt'), 'utf8'), 'preserve this file');
  } finally {
    try {
      if (launcher?.exitCode === null && launcher.signalCode === null) launcher.kill('SIGTERM');
      if (closed) await bounded(closed, 3000, 'The exact test launcher did not terminate.');
    } finally { await sentinel.stop(); }
  }
});
