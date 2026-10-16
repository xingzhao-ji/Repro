import test from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import crypto, { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { createCaseManifest } from '../src/browser-case.js';
import { runCaseBrowser } from '../src/case-adapter.js';

test('browser home and font caches stay owned when launch fails after creating files', async t => {
  const root = resolve('.repro-runs/practical-beta/browser-home', randomUUID());
  // The fake launch models inherited HOME with a task-owned directory. It never
  // reads or writes the real user's home, and never launches a browser.
  const callerHome = join(root, 'caller-home');
  const callerCache = join(callerHome, '.cache', 'fontconfig');
  await mkdir(callerCache, { recursive: true });
  await writeFile(join(callerHome, 'user-file.txt'), 'Keep the caller home.');
  await writeFile(join(callerCache, 'existing-cache'), 'Keep the caller cache.');
  const originalHome = process.env['HOME'], originalCache = process.env['XDG_CACHE_HOME'];
  let profile: string | undefined, environment: NodeJS.ProcessEnv | undefined, generated: string | undefined;
  t.mock.method(chromium, 'launchPersistentContext', async (directory: string, options: Parameters<typeof chromium.launchPersistentContext>[1]) => {
    profile = directory; environment = options?.env;
    const browserHome = environment?.['HOME'] ?? callerHome;
    const browserCache = environment?.['XDG_CACHE_HOME'] ?? join(browserHome, '.cache');
    assert.ok(browserHome.startsWith(`${root}${sep}`) && browserCache.startsWith(`${root}${sep}`), 'The fake may write only task-owned directories.');
    const fontCache = join(browserCache, 'fontconfig');
    await mkdir(fontCache, { recursive: true });
    generated = join(fontCache, 'generated-browser-cache');
    await writeFile(generated, 'Browser-created cache.');
    throw new Error('Simulated startup failure after font cache creation.');
  });
  const result = await runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: join(root, 'runs') });
  assert.ok(generated, 'The fake launch must actually create a cache file before failing.');
  assert.equal(result.outcome, 'inconclusive');
  assert.match(result.reason, /RUNNER_ERROR/);
  assert.deepEqual(await readdir(callerCache), ['existing-cache'], 'Browser-generated cache must not remain in the caller home.');
  assert.equal(await readFile(join(callerHome, 'user-file.txt'), 'utf8'), 'Keep the caller home.');
  assert.equal(await readFile(join(callerCache, 'existing-cache'), 'utf8'), 'Keep the caller cache.');
  assert.ok(profile && environment?.['HOME'] && environment['XDG_CACHE_HOME']);
  assert.ok(environment['HOME'] === profile || environment['HOME'].startsWith(`${profile}${sep}`));
  assert.ok(environment['XDG_CACHE_HOME'].startsWith(`${profile}${sep}`));
  await assert.rejects(access(generated), { code: 'ENOENT' });
  await assert.rejects(access(profile), { code: 'ENOENT' });
  for (const key of ['PATH', 'TMPDIR', 'PLAYWRIGHT_BROWSERS_PATH']) assert.ok(environment[key] === process.env[key], `Preserve the browser prerequisite ${key}.`);
  assert.equal(process.env['HOME'], originalHome);
  assert.equal(process.env['XDG_CACHE_HOME'], originalCache);
});

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
