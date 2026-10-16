import test from 'node:test';
import assert from 'node:assert/strict';
import crypto, { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { createCaseManifest } from '../src/browser-case.js';
import { runCaseBrowser } from '../src/case-adapter.js';
import type { RunOptions } from '../src/contracts.js';
import { installCaseWorkerFixture } from './helpers/case-worker-control.js';

test('worker finalization keeps its acquired output identity when caller options change', async t => {
  const root = resolve('.repro-runs/startup-prerequisites/finalizer', randomUUID());
  const originalOutput = join(root, 'original');
  const alternateOutput = join(root, 'alternate');
  const id = '13131313-1313-4313-8313-131313131313';
  const alternateRun = join(alternateOutput, id);
  const sentinel = Buffer.from('Keep the unrelated preexisting profile bytes.\n');
  await mkdir(join(alternateRun, '.profile'), { recursive: true });
  await writeFile(join(alternateRun, '.profile', 'user-profile.txt'), sentinel);
  await writeFile(join(alternateRun, 'user.txt'), 'Keep the unrelated output.\n');
  t.mock.method(crypto, 'randomUUID', () => id);
  syncBuiltinESMExports();
  const fixture = installCaseWorkerFixture(t, {
    suite: 'lifecycle', mode: 'cache-only-rejection', directory: root, callerHome: join(root, 'caller-home'),
  });
  let changedDuringRun = false;
  const options: RunOptions = {
    artifactDir: originalOutput,
    onEvent(event) {
      if (event.type === 'reset') { options.artifactDir = alternateOutput; changedDuringRun = true; }
    },
  };
  try {
    const result = await runCaseBrowser(createCaseManifest('morphdom-textarea'), options);
    assert.equal(changedDuringRun, true, 'Mutate caller options only after the worker acquired its original output.');
    assert.deepEqual(await readFile(join(alternateRun, '.profile', 'user-profile.txt')), sentinel,
      'Finalization must never remove a profile from the caller’s later output selection.');
    assert.equal(await readFile(join(alternateRun, 'user.txt'), 'utf8'), 'Keep the unrelated output.\n');
    assert.deepEqual((await readdir(alternateRun)).sort(), ['.profile', 'user.txt']);
    const originalRun = join(originalOutput, id);
    assert.equal(fixture.messages.find(message => message.type === 'cache-written')?.['profile'], join(originalRun, '.profile'));
    await assert.rejects(access(join(originalRun, '.profile')), { code: 'ENOENT' });
    assert.equal(result.outcome, 'inconclusive');
    assert.match(result.reason, /RUNNER_ERROR/);
    assert.doesNotMatch(result.reason, /CLEANUP_FAILED|EVIDENCE_FAILED/);
    const evidence = await readFile(join(originalRun, 'evidence.json'));
    assert.deepEqual(JSON.parse(evidence.toString('utf8')), { ...result, artifacts: [] });
    assert.deepEqual(result.artifacts, [{
      path: `${id}/evidence.json`, sha256: createHash('sha256').update(evidence).digest('hex'), bytes: evidence.length,
    }]);
    const snapshot = JSON.stringify(result);
    options.artifactDir = join(root, 'later');
    await Promise.all(fixture.workers.map(worker => worker.closed));
    assert.equal(JSON.stringify(result), snapshot, 'Later option changes cannot revise the returned result.');
  } finally {
    await fixture.dispose(); fixture.restore(); t.mock.restoreAll(); syncBuiltinESMExports();
  }
});
