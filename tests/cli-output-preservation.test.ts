import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link, lstat, mkdir, mkdtemp, readFile, readdir, readlink, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createManifest, digest } from '../src/manifest.js';
import { ReproError } from '../src/contracts.js';
import { writeOwnedFile } from '../src/paths.js';

const GENERATED = '.repro-runs/tests/output-preservation';

async function workspace(): Promise<string> {
  await mkdir(GENERATED, { recursive: true });
  return mkdtemp(join(GENERATED, 'cli-test-'));
}

async function inputFile(root: string, name: string, seed: number, timeoutMs = 10000): Promise<string> {
  const manifest = createManifest();
  // Missing required actions return MISSING_STEPS before HTTP listen or browser launch.
  manifest.actions = [];
  manifest.environment.seed = seed;
  manifest.environment.timeoutMs = timeoutMs;
  const path = join(root, name);
  await writeFile(path, JSON.stringify(manifest));
  return path;
}

function args(command: string, input: string, output: string): string[] {
  return ['--import', 'tsx', 'src/cli.ts', command, '--manifest', input, '--output', output,
    ...(command === 'record' ? ['--consent'] : []), ...(command === 'reduce' ? ['--budget', '1'] : [])];
}

function run(command: string, input: string, output: string) {
  return spawnSync(process.execPath, args(command, input, output), {
    encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL',
  });
}

function runConcurrent(input: string, output: string): Promise<{ status: number | null; signal: string | null; stdout: string; stderr: string }> {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args('reduce', input, output), {
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, killSignal: 'SIGKILL',
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (status, signal) => accept({ status, signal, stdout, stderr }));
  });
}

async function snapshot(root: string): Promise<unknown[]> {
  const entries: unknown[] = [];
  async function visit(path: string, local: string): Promise<void> {
    const info = await lstat(path);
    if (info.isSymbolicLink()) entries.push({ path: local, kind: 'symlink', target: await readlink(path) });
    else if (info.isDirectory()) {
      entries.push({ path: local, kind: 'directory', mode: info.mode });
      for (const name of (await readdir(path)).sort()) await visit(join(path, name), local ? `${local}/${name}` : name);
    } else {
      assert.ok(info.isFile(), 'Test output must contain regular files');
      entries.push({ path: local, kind: 'file', mode: info.mode, links: info.nlink,
        bytes: info.size, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
    }
  }
  await visit(root, '');
  return entries;
}

test('repeating reduction with another manifest preserves every prior output byte and directory', async () => {
  const root = await workspace(); const output = join(root, 'recorded-run');
  const firstInput = await inputFile(root, 'first.json', 111, 10000);
  const secondInput = await inputFile(root, 'second.json', 222, 1500);
  const first = run('reduce', firstInput, output);
  assert.equal(first.error, undefined);
  assert.equal(first.status, 2);
  const firstReport = JSON.parse(first.stdout);
  assert.equal(firstReport.result.status, 'inconclusive');
  assert.equal(firstReport.result.baseline.environment.browser, 'not-launched');
  assert.match(firstReport.result.baseline.reason, /MISSING_STEPS/);
  const before = await snapshot(output);
  const second = run('reduce', secondInput, output);
  assert.equal(second.error, undefined);
  assert.deepEqual(await snapshot(output), before, 'A second command must leave the first run intact');
  assert.equal(second.status, 2);
  assert.equal(second.stdout, '');
  assert.equal(JSON.parse(second.stderr).category, 'input');
  assert.equal(JSON.parse(second.stderr).code, 'OUTPUT_EXISTS');
});

for (const command of ['record', 'replay', 'reduce', 'verify']) {
  test(`${command} refuses an existing output before replacing evidence or creating run artifacts`, async () => {
    const root = await workspace(); const output = join(root, 'existing');
    await mkdir(join(output, 'prior-run'), { recursive: true });
    for (const name of ['manifest.json', 'result.json', 'reduced.manifest.json', 'prior-run/evidence.json']) {
      await writeFile(join(output, name), JSON.stringify({ preserved: name }));
    }
    const input = await inputFile(root, 'input.json', 333);
    const before = await snapshot(output);
    const result = run(command, input, output);
    assert.equal(result.error, undefined);
    assert.deepEqual(await snapshot(output), before);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).category, 'input');
    assert.equal(JSON.parse(result.stderr).code, 'OUTPUT_EXISTS');
  });
}

test('an existing empty output is also reserved and must not be reused', async () => {
  const root = await workspace(); const output = join(root, 'reserved');
  await mkdir(output);
  const input = await inputFile(root, 'input.json', 444);
  const result = run('reduce', input, output);
  assert.equal(result.error, undefined);
  assert.deepEqual(await readdir(output), []);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).code, 'OUTPUT_EXISTS');
});

test('a fresh nested output still persists the exact manifest and honest no-browser result', async () => {
  const root = await workspace(); const output = join(root, 'new-parent', 'fresh-run');
  const input = await inputFile(root, 'input.json', 555);
  const result = run('reduce', input, output);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  const expected = JSON.parse(await readFile(input, 'utf8'));
  assert.deepEqual(JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')), expected);
  assert.deepEqual(JSON.parse(await readFile(join(output, 'reduced.manifest.json'), 'utf8')), expected);
  const recorded = JSON.parse(await readFile(join(output, 'result.json'), 'utf8'));
  assert.equal(recorded.status, 'inconclusive');
  assert.equal(recorded.baseline.environment.browser, 'not-launched');
  assert.equal(recorded.baseline.manifestDigest, digest(expected));
  assert.equal(recorded.baseline.assertionCount, 0);
});

test('racing reductions have one output owner and cannot mix distinct input evidence', async () => {
  const root = await workspace(); const output = join(root, 'racing-run');
  const inputs = [await inputFile(root, 'one.json', 666), await inputFile(root, 'two.json', 777, 1500)];
  const results = await Promise.all(inputs.map(input => runConcurrent(input, output)));
  assert.ok(results.every(result => result.status === 2 && result.signal === null));
  const completed = results.filter(result => result.stdout !== '');
  const rejected = results.filter(result => result.stdout === '');
  assert.equal(completed.length, 1, 'Only one command may execute into the reserved directory');
  assert.equal(rejected.length, 1);
  assert.equal(JSON.parse(rejected[0]!.stderr).category, 'input');
  assert.equal(JSON.parse(rejected[0]!.stderr).code, 'OUTPUT_EXISTS');
  const winner = JSON.parse(completed[0]!.stdout).result;
  const recordedInput = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  assert.deepEqual(recordedInput, winner.manifest);
  assert.deepEqual(JSON.parse(await readFile(join(output, 'reduced.manifest.json'), 'utf8')), winner.manifest);
  assert.deepEqual(JSON.parse(await readFile(join(output, 'result.json'), 'utf8')), winner);
  assert.equal(winner.baseline.manifestDigest, digest(recordedInput));
  assert.equal(winner.baseline.seed, recordedInput.environment.seed);
  assert.equal(winner.baseline.environment.browser, 'not-launched');
  const execution = join(output, 'execution-000001');
  assert.deepEqual(await readdir(execution), [winner.baseline.id], 'The losing command must not add a second run');
});

test('an output directory symlink cannot redirect creation or modify its target', async () => {
  const root = await workspace(); const target = join(root, 'preserved-target'); const output = join(root, 'linked-output');
  await mkdir(target); await writeFile(join(target, 'sentinel'), 'KEEP');
  await symlink(resolve(target), output);
  const input = await inputFile(root, 'input.json', 888);
  const before = await snapshot(target);
  const result = run('reduce', input, output);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).category, 'input');
  assert.deepEqual(await snapshot(target), before);
  assert.equal(await readlink(output), resolve(target));
});

test('a hardlinked prior manifest is preserved along with its neighboring output files', async () => {
  const root = await workspace(); const output = join(root, 'existing'); const target = join(root, 'sentinel.json');
  await mkdir(output); await writeFile(target, '{"preserve":"linked evidence"}');
  await link(target, join(output, 'manifest.json'));
  await writeFile(join(output, 'result.json'), '{"preserve":"prior result"}');
  const input = await inputFile(root, 'input.json', 999);
  const before = await snapshot(output);
  const result = run('reduce', input, output);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).category, 'input');
  assert.deepEqual(await snapshot(output), before);
  assert.equal(await readFile(target, 'utf8'), '{"preserve":"linked evidence"}');
});

test('writing an owned evidence file refuses an existing regular file without truncation', async () => {
  const root = await workspace(); const output = join(root, 'result.json');
  const original = '{"preserve":"recorded outcome and provenance"}\n';
  await writeFile(output, original);
  let failure: unknown;
  try { await writeOwnedFile(output, '{"replacement":"must not be written"}'); }
  catch (error) { failure = error; }
  assert.equal(await readFile(output, 'utf8'), original);
  assert.ok(failure instanceof ReproError);
  assert.equal(failure.category, 'input');
  assert.equal(failure.code, 'OUTPUT_FILE_EXISTS');
});
