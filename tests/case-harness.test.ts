import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createCaseManifest, getRegisteredCase } from '../src/browser-case.js';
import { digest } from '../src/manifest.js';
import { VERSION } from '../src/contracts.js';

test('changing the independent oracle executable in an isolated source copy changes the reported harness identity', async () => {
  const root = resolve('.repro-runs/practical-beta/harness-tests', randomUUID());
  await mkdir(root, { recursive: true });
  await cp('src', join(root, 'src'), { recursive: true });
  await cp('fixtures/browser-search', join(root, 'fixtures/browser-search'), { recursive: true });
  const code = `import {caseHarnessDigest} from './src/case-adapter.ts'; import {createCaseManifest} from './src/browser-case.ts'; console.log(caseHarnessDigest(createCaseManifest('morphdom-textarea')));`;
  const identity = () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr); assert.match(run.stdout.trim(), /^[a-f0-9]{64}$/); return run.stdout.trim();
  };
  const before = identity();
  await appendFile(join(root, 'src/browser-case.ts'), '\n// Different independent oracle executable artifact.\n');
  assert.notEqual(identity(), before, 'Oracle executable changes must invalidate retained harness evidence.');
});

for (const artifact of ['case-worker.ts', 'case-worker-client.ts', 'case-execution.ts', 'case-worker-protocol.ts', 'case-process-fence.ts', 'browser-prerequisite.ts']) {
  test(`changing browser worker source ${artifact} changes the reported harness identity`, async () => {
    const root = resolve('.repro-runs/practical-beta/harness-tests', randomUUID());
    await mkdir(root, { recursive: true });
    await cp('src', join(root, 'src'), { recursive: true });
    await cp('fixtures/browser-search', join(root, 'fixtures/browser-search'), { recursive: true });
    const code = `import {caseHarnessDigest} from './src/case-adapter.ts'; import {createCaseManifest} from './src/browser-case.ts'; console.log(caseHarnessDigest(createCaseManifest('morphdom-textarea')));`;
    const identity = () => {
      const run = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', timeout: 10000 });
      assert.equal(run.status, 0, run.stderr); assert.match(run.stdout.trim(), /^[a-f0-9]{64}$/); return run.stdout.trim();
    };
    await readFile(join(root, 'src', artifact));
    const before = identity();
    await appendFile(join(root, 'src', artifact), '\n// Different browser worker executable artifact.\n');
    assert.notEqual(identity(), before, `${artifact} changes must invalidate retained harness evidence.`);
  });
}

test('the separately shipped browser worker changes bundled harness identity without changing the parent artifact', async () => {
  const root = resolve('.repro-runs/practical-beta/harness-tests', randomUUID());
  await mkdir(join(root, 'dist'), { recursive: true });
  await cp('dist/index.js', join(root, 'dist/index.js'));
  await cp('dist/case-worker.js', join(root, 'dist/case-worker.js'));
  await cp('fixtures/browser-search', join(root, 'fixtures/browser-search'), { recursive: true });
  const parentBytes = await readFile(join(root, 'dist/index.js'));
  const code = `import {experimentHarnessDigest,createCaseManifest} from './dist/index.js'; console.log(experimentHarnessDigest(createCaseManifest('morphdom-textarea')));`;
  const identity = () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr); assert.match(run.stdout.trim(), /^[a-f0-9]{64}$/); return run.stdout.trim();
  };
  const before = identity();
  const driver = await import(new URL('../scripts/verify-beta-isolated.mjs', import.meta.url).href);
  const manifest = createCaseManifest('morphdom-textarea');
  const trusted = { digest, getRegisteredCase, VERSION };
  assert.equal(before, driver.harnessForArtifact(manifest, parentBytes, trusted, await readFile(join(root, 'dist/case-worker.js'))),
    'Independent reconstruction must match the actual bundled runner identity.');
  await appendFile(join(root, 'dist/case-worker.js'), '\n// Different shipped worker executable artifact.\n');
  const after = identity();
  assert.notEqual(after, before, 'A separately shipped worker is part of the executed harness.');
  assert.equal(after, driver.harnessForArtifact(manifest, parentBytes, trusted, await readFile(join(root, 'dist/case-worker.js'))));
  assert.deepEqual(await readFile(join(root, 'dist/index.js')), parentBytes);
});
