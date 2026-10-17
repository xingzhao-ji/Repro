import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createCaseManifest } from '../src/browser-case.js';
import { runCaseBrowser } from '../src/case-adapter.js';
import { installCaseWorkerFixture } from './helpers/case-worker-control.js';

// Ordinary runs have no diagnostic observer. A CLEANUP_FAILED result must still
// say which cleanup predicate failed, using only a fixed vocabulary.
function closeFixture(t: TestContext, directory: string, mode: string) {
  t.mock.method(chromium, 'launchPersistentContext', async () => {
    throw new Error('Cleanup basis must be recorded by the controlled fixed worker.');
  });
  return installCaseWorkerFixture(t, { suite: 'diagnostics', mode, directory });
}

const BASIS = /Cleanup basis: ((?:[a-z-]+=[a-z0-9-]+)(?:; [a-z-]+=[a-z0-9-]+)*)\./;
function basis(reason: string): Record<string, string> {
  const match = BASIS.exec(reason);
  assert.ok(match, `CLEANUP_FAILED must include its allowlisted cleanup basis: ${reason}`);
  return Object.fromEntries(match[1]!.split('; ').map(part => part.split('=') as [string, string]));
}

for (const [mode, expected] of [['reject', 'rejected'], ['late-resolve', 'timeout'], ['late-reject', 'timeout']] as const) {
  test(`an ordinary run records context-close=${expected} when close ${mode === 'reject' ? 'rejects' : 'misses its budget'} (${mode})`, { timeout: 8000 }, async t => {
    const root = resolve('.repro-runs/cleanup-basis-tests', randomUUID());
    await mkdir(root, { recursive: true });
    const fixture = closeFixture(t, root, mode);
    const result = await runCaseBrowser(createCaseManifest('htmx-checkbox'), { artifactDir: root });
    if (mode.startsWith('late-')) {
      fixture.command('fixture-finish-close');
      await fixture.waitFor('fixture-close-settled');
    }
    await Promise.all(fixture.workers.map(worker => worker.closed));
    assert.equal(fixture.workers.length, 1, 'The production adapter must execute the controlled fixed worker.');
    assert.equal(result.outcome, 'inconclusive');
    assert.match(result.reason, /^CLEANUP_FAILED: /);
    const fields = basis(result.reason);
    assert.deepEqual(Object.keys(fields), ['receipt', 'protocol', 'wait-ended', 'worker', 'launch', 'launch-join', 'context-close', 'drain', 'creation-attempts']);
    assert.equal(fields['receipt'], 'present');
    assert.equal(fields['protocol'], 'ok');
    // The worker's own failure receipt decides before its later natural close.
    assert.equal(fields['wait-ended'], 'failed-receipt');
    assert.equal(fields['worker'], 'open');
    assert.equal(fields['launch'], 'acquired');
    assert.equal(fields['launch-join'], 'not-needed');
    assert.equal(fields['context-close'], expected);
    assert.equal(fields['drain'], 'complete', 'The rejected setup work drained; only the close predicate failed.');
    assert.match(fields['creation-attempts']!, /^[0-9]+$/);
    // The basis is evidence: retained bytes match, contain no target text and the profile stays retained.
    const evidence = JSON.parse(await readFile(join(root, result.id, 'evidence.json'), 'utf8')) as { reason: string };
    assert.equal(evidence.reason, result.reason);
    assert.equal(result.reason.includes('fake-private-'), false);
    await access(join(root, result.id, '.profile'));
  });
}

test('a certified cleanup does not add a cleanup basis to its unchanged reason', { timeout: 6000 }, async t => {
  const root = resolve('.repro-runs/cleanup-basis-tests', randomUUID());
  await mkdir(root, { recursive: true });
  const fixture = closeFixture(t, root, 'resolve');
  const result = await runCaseBrowser(createCaseManifest('htmx-checkbox'), { artifactDir: root });
  await Promise.all(fixture.workers.map(worker => worker.closed));
  assert.equal(result.outcome, 'inconclusive');
  assert.match(result.reason, /^RUNNER_ERROR: /);
  assert.doesNotMatch(result.reason, /Cleanup basis/);
  await assert.rejects(access(join(root, result.id, '.profile')), { code: 'ENOENT' });
});
