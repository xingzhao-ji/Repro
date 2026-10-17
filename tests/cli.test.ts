import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, link, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createManifest } from '../src/manifest.js';

async function fixtureRoot(): Promise<string> {
  await mkdir('.repro-runs/tests', { recursive: true });
  return mkdtemp('.repro-runs/tests/cli-');
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' });
}
test('CLI rejects malformed input, missing consent and unsupported commands with structured categories', async () => {
  await mkdir('.repro-runs/tests', { recursive: true }); const root = await mkdtemp('.repro-runs/tests/cli-');
  const malformed = join(root, 'broken.json'); await writeFile(malformed, '{broken');
  for (const [args, category] of [
    [['record'], 'input'], [['shell'], 'unsupported'], [['inspect', '--manifest', malformed], 'input'], [['inspect', '--unknown'], 'input'],
  ] as const) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stderr).category, category);
  }
});

test('CLI rejects oversized manifests before parsing or execution', async () => {
  const root = await fixtureRoot();
  const path = join(root, 'oversized.json');
  await writeFile(path, JSON.stringify(createManifest()) + ' '.repeat(65_537));
  const result = runCli(['inspect', '--manifest', path]);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).category, 'input');
  assert.equal(result.stdout, '');
});

test('CLI rejects a FIFO manifest promptly without waiting for a writer', async () => {
  const root = await fixtureRoot();
  const path = join(root, 'manifest.pipe');
  const created = spawnSync('mkfifo', [path], { encoding: 'utf8', timeout: 5000 });
  assert.equal(created.status, 0, created.stderr);
  const result = runCli(['inspect', '--manifest', path]);
  assert.equal(result.error, undefined, 'Nonregular input must be rejected without blocking at open');
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).category, 'input');
  assert.equal(result.stdout, '');
});

for (const filename of ['manifest.json', 'result.json', 'reduced.manifest.json']) {
  for (const kind of ['symbolic', 'hard'] as const) {
    test(`CLI refuses an existing ${kind} link at output ${filename} without changing its target`, async () => {
      const root = await fixtureRoot();
      const output = join(root, 'output');
      await mkdir(output);
      const sentinel = join(root, 'sentinel.txt');
      const content = 'UNCHANGED_TASK_OWNED_SENTINEL';
      await writeFile(sentinel, content);
      if (kind === 'symbolic') await symlink(resolve(sentinel), join(output, filename));
      else await link(sentinel, join(output, filename));
      const input = join(root, 'input.json');
      // A valid action subset lacks execution prerequisites, so this regression
      // exercises CLI persistence without launching a browser on the old path.
      await writeFile(input, JSON.stringify({ ...createManifest(), actions: [] }));
      const result = runCli(['reduce', '--manifest', input, '--budget', '1', '--output', output]);
      assert.equal(result.error, undefined);
      assert.equal(await readFile(sentinel, 'utf8'), content, 'CLI must not follow or truncate an output link');
      assert.equal(result.status, 2);
      assert.equal(JSON.parse(result.stderr).category, 'input');
      assert.equal(result.stdout, '');
    });
  }
}

test('CLI validates the reduction budget before creating output or writing a manifest', async () => {
  const root = await fixtureRoot();
  const input = join(root, 'input.json');
  const output = join(root, 'not-created');
  await writeFile(input, JSON.stringify(createManifest()));
  const result = runCli(['reduce', '--manifest', input, '--budget', '0', '--output', output]);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).category, 'input');
  await assert.rejects(access(output), { code: 'ENOENT' });
});

test('an export interrupted while staging exits as an owner cancellation and finalizes nothing', { timeout: 30_000 }, async () => {
  const root = await fixtureRoot();
  const input = join(root, 'input.json');
  await writeFile(input, JSON.stringify(createManifest()));
  const output = join(root, 'capsule');
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'export', '--manifest', input, '--output', output], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.resume();
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(accept => child.once('exit', (code, signal) => accept({ code, signal })));
  let staged = false;
  const began = Date.now();
  while (!staged && child.exitCode === null && Date.now() - began < 20_000) {
    staged = (await readdir(root)).some(name => name.startsWith('.capsule.partial-'));
    if (!staged) await new Promise(accept => setTimeout(accept, 1));
  }
  assert.equal(staged, true, 'The export must be interrupted while its staging directory exists');
  child.kill('SIGINT');
  assert.deepEqual(await exited, { code: 130, signal: null }, 'An owner interrupt is a cancellation, not an invalid or inconclusive run');
  const reported = JSON.parse(stderr) as { outcome: string; category: string; code: string };
  assert.deepEqual([reported.outcome, reported.category, reported.code], ['cancelled', 'cancelled', 'EXPORT_CANCELLED']);
  await assert.rejects(access(output), { code: 'ENOENT' });
  assert.deepEqual((await readdir(root)).filter(name => name.includes('capsule')), [], 'Staging and lock must be removed');
});
