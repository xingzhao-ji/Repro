import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testRuntime } from './helpers/test-runtime.js';
import { runSyntheticBenchmark } from '../scripts/benchmark.js';

interface ChildReport {
  pid: number;
  value: string;
  moduleUrl: string;
  execArgv: string[];
  args?: string[];
}

test('unsupported test module formats cannot silently select a worker runtime', () => {
  assert.throws(() => testRuntime(pathToFileURL(resolve('test.browser.txt')).href), /Unsupported test module format/);
});

test('a cancelled benchmark records the actual module format without executing a browser attempt', async () => {
  const parent = resolve('.repro-runs/test-runtime');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'benchmark-'));
  try {
    const controller = new AbortController(); controller.abort();
    const report = await runSyntheticBenchmark(root, controller.signal);
    const expected = fileURLToPath(import.meta.url).endsWith('.ts') ? 'TypeScript source module' : 'JavaScript module';
    assert.equal(report.runner, expected);
    assert.equal(report.status, 'cancelled');
    assert.deepEqual(report.counts, { planned: 40, executed: 0, matchedExpected: 0, unexpected: 0, skipped: 0, unrun: 40 });
    assert.deepEqual(report.runs, []);
    const specification = JSON.parse(await readFile(join(root, 'specification.json'), 'utf8')) as { runner: string };
    const persisted = JSON.parse(await readFile(join(root, 'summary.json'), 'utf8')) as { runner: string };
    assert.equal(specification.runner, expected);
    assert.equal(persisted.runner, expected);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const extension of ['ts', 'js'] as const) {
  test(`${extension} inline workers load their own module artifact in a fresh process`, async () => {
    const parent = resolve('.repro-runs/test-runtime');
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, 'inline # '));
    try {
      await mkdir(join(root, 'other-cwd'));
      await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
      const moduleUrl = pathToFileURL(join(root, `fixture.${extension}`)).href;
      const annotation = extension === 'ts' ? ': string' : '';
      await writeFile(fileURLToPath(moduleUrl), `export const value${annotation} = 'owned-${extension}'; export const moduleUrl = import.meta.url;`);
      const runtime = testRuntime(pathToFileURL(join(root, `parent.browser.${extension}`)).href);
      const script = `import { value, moduleUrl } from ${JSON.stringify(runtime.moduleUrl('./fixture.js'))}; console.log(JSON.stringify({ value, moduleUrl, pid: process.pid, execArgv: process.execArgv }));`;
      const child = spawnSync(process.execPath, [...runtime.execArgv, '--input-type=module', '-e', script], { cwd: join(root, 'other-cwd'), encoding: 'utf8', timeout: 10_000 });
      assert.equal(child.status, 0, child.stderr);
      const report = JSON.parse(child.stdout) as ChildReport;
      assert.equal(report.value, `owned-${extension}`);
      assert.equal(report.moduleUrl, moduleUrl);
      assert.notEqual(report.pid, process.pid);
      assert.equal(report.execArgv.includes('tsx'), extension === 'ts');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test(`${extension} file workers preserve operation arguments and subprocess isolation`, async () => {
    const parent = resolve('.repro-runs/test-runtime');
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, 'file # '));
    try {
      await mkdir(join(root, 'other-cwd'));
      await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
      const moduleUrl = pathToFileURL(join(root, `worker.${extension}`)).href;
      const annotation = extension === 'ts' ? ': string' : '';
      await writeFile(fileURLToPath(moduleUrl), `const value${annotation} = 'owned-${extension}'; console.log(JSON.stringify({ value, moduleUrl: import.meta.url, pid: process.pid, execArgv: process.execArgv, args: process.argv.slice(2) }));`);
      const runtime = testRuntime(pathToFileURL(join(root, `parent.browser.${extension}`)).href);
      const child = spawnSync(process.execPath, [...runtime.execArgv, fileURLToPath(runtime.moduleUrl('./worker.js')), 'record', root], { cwd: join(root, 'other-cwd'), encoding: 'utf8', timeout: 10_000 });
      assert.equal(child.status, 0, child.stderr);
      const report = JSON.parse(child.stdout) as ChildReport;
      assert.equal(report.value, `owned-${extension}`);
      assert.equal(report.moduleUrl, moduleUrl);
      assert.notEqual(report.pid, process.pid);
      assert.deepEqual(report.args, ['record', root]);
      assert.deepEqual(report.execArgv, extension === 'ts' ? ['--import', 'tsx'] : []);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
