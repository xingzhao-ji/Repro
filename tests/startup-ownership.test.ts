import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { runCaseBrowser } from '../src/case-adapter.js';
import { createCaseManifest } from '../src/browser-case.js';

/** A controlled real process owns the profile; no browser or exit-order inference. */
async function profileOwner(profile: string) {
  const child = spawn(process.execPath, ['-e', `
    const fs = require('node:fs'), path = require('node:path');
    const directory = process.argv[1];
    const file = path.join(directory, 'owned-use');
    const handle = fs.openSync(file, 'w');
    process.on('message', message => {
      if (message === 'probe') {
        try { fs.writeFileSync(file, 'owner remains able to use this profile'); process.send('used'); }
        catch { process.send('unavailable'); }
      }
      if (message === 'stop') { fs.closeSync(handle); process.exit(0); }
    });
    process.send('ready');
  `, profile], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const closed = new Promise<void>((accept, reject) => { child.once('error', reject); child.once('close', () => accept()); });
  assert.deepEqual(await once(child, 'message'), ['ready', undefined]);
  return { child, closed, async probe() {
    const reply = once(child, 'message'); child.send('probe'); return (await reply)[0];
  }, async stop() { if (child.connected) child.send('stop'); await closed; } };
}

for (const cancelled of [false, true]) test(`launch rejection cannot authorize profile deletion while an owner is live (cancelled=${cancelled})`, { timeout: 8000 }, async t => {
  const root = resolve('.repro-runs/startup-cleanup-ownership/tests', randomUUID());
  await fs.mkdir(root, { recursive: true }); await fs.writeFile(join(root, 'user.txt'), 'preserve user data');
  let owner: Awaited<ReturnType<typeof profileOwner>> | undefined;
  let profile = '', deletedWhileOwnerCouldUse = false;
  const controller = new AbortController();
  t.mock.method(chromium, 'launchPersistentContext', async (directory: string) => {
    profile = directory; owner = await profileOwner(profile);
    if (cancelled) controller.abort();
    // Models the pinned API rejecting while its internal cleanup is pending.
    throw new Error('private simulated launch cleanup failure');
  });
  const remove = fs.rm;
  t.mock.method(fs, 'rm', async (...args: Parameters<typeof fs.rm>) => {
    if (args[0] === profile && owner) deletedWhileOwnerCouldUse = await owner.probe() === 'used';
    return remove(...args);
  });
  syncBuiltinESMExports();
  try {
    const result = await runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: root, signal: controller.signal });
    assert.ok(owner); assert.equal(deletedWhileOwnerCouldUse, false, 'A settled launch promise is not an owner-completion acknowledgment.');
    assert.equal(await owner.probe(), 'used');
    assert.equal(result.outcome, cancelled ? 'cancelled' : 'inconclusive');
    assert.match(result.reason, /CLEANUP_FAILED/); assert.equal(result.assertionCount, 0);
    assert.equal(JSON.stringify(result).includes('private simulated'), false);
    const before = JSON.stringify(result); await owner.stop();
    await fs.access(profile);
    assert.equal(JSON.stringify(result), before, 'Late termination cannot erase the cleanup failure or remove retained evidence.');
    assert.equal(await fs.readFile(join(root, 'user.txt'), 'utf8'), 'preserve user data');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await owner?.stop(); }
});

for (const mode of ['delayed-launch', 'close-rejected', 'late-termination'] as const) test(`owned lifecycle preserves cleanup ordering for ${mode}`, { timeout: 8000 }, async t => {
  const root = resolve('.repro-runs/startup-cleanup-ownership/tests', randomUUID());
  let owner: Awaited<ReturnType<typeof profileOwner>> | undefined;
  let profile = '', closeCalled = false, deletedWhileOwnerCouldUse = false;
  const controller = new AbortController();
  let releaseLaunch!: () => void;
  const acquired = new Promise<void>(accept => { releaseLaunch = accept; });
  let launchReady!: () => void;
  const ready = new Promise<void>(accept => { launchReady = accept; });
  const context = Object.assign(new EventEmitter(), {
    browser: () => null,
    route: async () => { throw new Error('controlled setup failure'); },
    close: async () => {
      closeCalled = true;
      if (mode === 'close-rejected') throw new Error('private cleanup failure');
      if (mode === 'late-termination') await owner!.closed;
      else await owner!.stop();
    },
  });
  t.mock.method(chromium, 'launchPersistentContext', async (directory: string) => {
    profile = directory; owner = await profileOwner(profile); launchReady();
    if (mode === 'delayed-launch') await acquired;
    return context;
  });
  const remove = fs.rm;
  t.mock.method(fs, 'rm', async (...args: Parameters<typeof fs.rm>) => {
    if (args[0] === profile && owner?.child.connected) deletedWhileOwnerCouldUse = await owner.probe() === 'used';
    return remove(...args);
  });
  syncBuiltinESMExports();
  try {
    const pending = runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: root, signal: controller.signal });
    await ready; assert.ok(owner);
    if (mode === 'delayed-launch') {
      controller.abort(); await new Promise<void>(accept => setImmediate(accept));
      assert.equal(closeCalled, false); assert.equal(await owner.probe(), 'used'); await fs.access(profile);
      releaseLaunch();
    }
    const result = await pending;
    assert.equal(closeCalled, true); assert.equal(deletedWhileOwnerCouldUse, false);
    if (mode === 'delayed-launch') {
      assert.equal(result.outcome, 'cancelled'); await assert.rejects(fs.access(profile), { code: 'ENOENT' });
    } else {
      assert.equal(result.outcome, 'inconclusive'); assert.match(result.reason, /CLEANUP_FAILED/);
      assert.equal(await owner.probe(), 'used'); const before = JSON.stringify(result);
      await owner.stop(); await new Promise<void>(accept => setImmediate(accept));
      await fs.access(profile); assert.equal(JSON.stringify(result), before);
    }
  } finally { releaseLaunch(); t.mock.restoreAll(); syncBuiltinESMExports(); await owner?.stop(); }
});
