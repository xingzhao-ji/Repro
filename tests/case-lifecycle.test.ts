import test from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createCaseManifest } from '../src/browser-case.js';
import { runCaseBrowser } from '../src/case-adapter.js';
import { installCaseWorkerFixture } from './helpers/case-worker-control.js';

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
  const fixture = installCaseWorkerFixture(t, { suite: 'lifecycle', mode: 'cache-only-rejection', directory: root, callerHome });
  const result = await runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: join(root, 'runs') });
  const written = fixture.messages.find(message => message.type === 'cache-written');
  const profile = written?.['profile'] as string | undefined;
  const environment = written?.['environment'] as NodeJS.ProcessEnv | undefined;
  const generated = written?.['generated'] as string | undefined;
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
  const root = resolve('.repro-runs/practical-beta/lifecycle', randomUUID());
  const fixture = installCaseWorkerFixture(t, { suite: 'lifecycle', mode: 'late-server', directory: root });
  try {
    const pending = runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: root, signal: controller.signal });
    // Source-worker bootstrap competes with the full suite; this readiness
    // bound is test coordination, not the product operation/cleanup deadline.
    await fixture.waitFor('cancel-server-startup', 1, 5000);
    controller.abort();
    const result = await pending;
    assert.equal(result.outcome, 'cancelled');
    assert.equal(result.assertionCount, 0);
    const owned = fixture.messages.find(message => message.type === 'server-closed');
    assert.ok(fixture.messages.some(message => message.type === 'server-created'), 'test must reach actual asynchronous server acquisition');
    assert.ok(owned, 'The worker must observe the owned server close.');
    assert.equal(owned['listening'], false, 'Late server acquisition must not escape the owner cleanup boundary.');
  } finally {
    controller.abort();
    fixture.restore();
  }
});


test('cancellation during reset acknowledgment stops before attempting browser acquisition', async t => {
  const root = resolve('.repro-runs/practical-beta/lifecycle', randomUUID());
  const callerHome = join(root, 'caller-home');
  const controller = new AbortController();
  const fixture = installCaseWorkerFixture(t, { suite: 'lifecycle', mode: 'cache-only-rejection', directory: root, callerHome });
  const result = await runCaseBrowser(createCaseManifest('morphdom-textarea'), {
    artifactDir: root,
    signal: controller.signal,
    onEvent(event) { if (event.type === 'reset') controller.abort(); },
  });
  assert.equal(result.outcome, 'cancelled');
  assert.equal(result.assertionCount, 0);
  assert.equal(fixture.messages.some(message => message.type === 'cache-written'), false,
    'The browser launch API must not be called after the reset callback cancels.');
  await assert.rejects(access(join(root, result.id, '.profile')), { code: 'ENOENT' });
});
