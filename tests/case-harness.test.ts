import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, cp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

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
