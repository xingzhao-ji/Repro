import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, cp, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createCaseManifest } from '../src/browser-case.js';
import { runCaseWorker, caseWorkerArtifactDigest } from '../src/case-worker-client.js';

test('the built worker installs its fence before a dependency captures a synchronous creator', { timeout: 10_000 }, async t => {
  const root = resolve('.repro-runs/worker-boundary/build-order', randomUUID());
  const runtime = join(root, 'runtime');
  const entry = join(runtime, 'dist/case-worker.js');
  await mkdir(join(runtime, 'node_modules/playwright'), { recursive: true });
  await writeFile(join(runtime, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(join(runtime, 'node_modules/playwright/package.json'), JSON.stringify({ name: 'playwright', type: 'module', exports: './index.js' }));
  await writeFile(join(runtime, 'node_modules/playwright/index.js'), `
    import childProcess from 'node:child_process';
    const capturedSpawnSync = childProcess.spawnSync;
    export const chromium = { async launchPersistentContext() {
      const child = capturedSpawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' });
      if (child.status !== 0) throw new Error('The controlled child did not finish.');
      throw new Error('Controlled rejection after a real synchronous process.');
    } };
  `);
  await cp(resolve('fixtures/browser-search'), join(runtime, 'fixtures/browser-search'), { recursive: true });
  await cp(resolve('fixtures/repository-cases/morphdom-textarea'), join(runtime, 'fixtures/repository-cases/morphdom-textarea'), { recursive: true });
  await build({ entryPoints: [resolve('src/case-worker.ts')], outfile: entry, bundle: true, platform: 'node', target: 'node24', format: 'esm', packages: 'external' });
  const original = childProcess.spawn;
  const source = fileURLToPath(new URL('../src/case-worker.ts', import.meta.url));
  t.mock.method(childProcess, 'spawn', (...args: Parameters<typeof original>) => {
    assert.ok(Array.isArray(args[1]) && args[1].includes(source), 'Substitute only the fixed owned worker invocation.');
    return original(process.execPath, [entry], { ...args[2], cwd: runtime });
  });
  const id = randomUUID();
  const completion = await runCaseWorker(createCaseManifest('morphdom-textarea'), { artifactDir: join(runtime, '.repro-runs/result') }, {
    id, startedAt: new Date().toISOString(), startedNs: process.hrtime.bigint().toString(), harnessDigest: caseWorkerArtifactDigest(),
  });
  assert.equal(completion.closed, true);
  assert.equal(completion.protocolFailed, false);
  assert.equal(completion.receipt?.launchState, 'unacquired');
  assert.ok((completion.attempts ?? 0) > 0, 'A dependency captured before the fence must not turn a real spawn into a zero-process receipt.');
  await access(join(runtime, '.repro-runs/result', id, '.profile'));
});
