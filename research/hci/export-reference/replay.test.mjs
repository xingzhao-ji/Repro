import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { importCapsule, runBrowser } from './dist/index.js';

test('frozen latest-search requirement distinguishes buggy and fixed revisions', async () => {
  const manifest = await importCapsule(fileURLToPath(new URL('.', import.meta.url)));
  const original = await runBrowser(manifest, { artifactDir: '.repro-runs/readable-buggy', revision: 'buggy' });
  const candidate = await runBrowser(manifest, { artifactDir: '.repro-runs/readable-fixed', revision: 'fixed' });
  assert.equal(original.assertionCount, 1, 'the original assertion must execute');
  assert.equal(candidate.assertionCount, 1, 'the same candidate assertion must execute');
  assert.equal(original.assertionDigest, manifest.assertionDigest);
  assert.equal(candidate.assertionDigest, manifest.assertionDigest);
  assert.equal(original.harnessDigest, candidate.harnessDigest);
  assert.equal(original.outcome, 'target-failure');
  assert.deepEqual(original.observation, { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] });
  assert.equal(candidate.outcome, 'requirement-satisfied');
  assert.deepEqual(candidate.observation, { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] });
});
