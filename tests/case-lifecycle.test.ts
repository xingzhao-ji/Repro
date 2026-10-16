import test from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import crypto, { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCaseManifest } from '../src/browser-case.js';
import { runCaseBrowser } from '../src/case-adapter.js';

test('a run ID collision preserves the preexisting profile and user output', async t => {
  const root = `.repro-runs/practical-beta/lifecycle/${randomUUID()}`;
  const id = '12121212-1212-4212-8212-121212121212';
  const directory = join(root, id);
  await mkdir(join(directory, '.profile'), { recursive: true });
  await writeFile(join(directory, '.profile', 'user-file.txt'), 'preserve user bytes');
  t.mock.method(crypto, 'randomUUID', () => id);
  syncBuiltinESMExports();
  try {
    const result = await runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: root });
    assert.equal(await readFile(join(directory, '.profile', 'user-file.txt'), 'utf8'), 'preserve user bytes');
    assert.deepEqual(await readdir(directory), ['.profile']);
    assert.equal(result.outcome, 'inconclusive');
    assert.match(result.reason, /OUTPUT_EXISTS/);
    assert.equal(result.assertionCount, 0);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

test('cancelling while the owned HTTP server acquires its port closes the late acquired server', async t => {
  const controller = new AbortController();
  const nativeListen = Server.prototype.listen;
  const servers: Server[] = [];
  t.mock.method(Server.prototype, 'listen', function(this: Server, ...args: unknown[]) {
    servers.push(this);
    setTimeout(() => controller.abort(), 5);
    setTimeout(() => { Reflect.apply(nativeListen, this, args); }, 35);
    return this;
  });
  try {
    const result = await runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: `.repro-runs/practical-beta/lifecycle/${randomUUID()}`, signal: controller.signal });
    assert.equal(result.outcome, 'cancelled');
    assert.equal(result.assertionCount, 0);
    const owned = servers[0];
    assert.ok(owned, 'test must reach actual asynchronous server acquisition');
    assert.equal(owned.listening, false, 'Late server acquisition must not escape the owner cleanup boundary.');
  } finally {
    // The red regression must not leak its deliberately delayed owned server.
    const owned = servers[0];
    if (owned?.listening) await new Promise<void>(resolve => owned!.close(() => resolve()));
  }
});
