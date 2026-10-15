import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createManifest } from '../src/manifest.js';

async function setup() {
  await mkdir('.repro-runs/tests', { recursive: true });
  const root = await mkdtemp('.repro-runs/tests/cli-output-');
  const input = join(root, 'input.json');
  // This valid subset is missing the required steps: it finishes INCONCLUSIVE
  // without launching a browser, while exercising real CLI persistence.
  await writeFile(input, JSON.stringify({ ...createManifest(), actions: [] }));
  return { root, input, output: join(root, 'run') };
}

function replay(input: string, output: string) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((accept, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'replay', '--manifest', input, '--output', output], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', status => { clearTimeout(timeout); accept({ status, stdout, stderr }); });
  });
}

test('reusing CLI output preserves the previous input, result and artifact inventory', async () => {
  const { input, output } = await setup();
  const first = await replay(input, output);
  assert.equal(first.status, 2);
  assert.equal(JSON.parse(first.stdout).result.outcome, 'inconclusive');
  const manifestBefore = await readFile(join(output, 'manifest.json'), 'utf8');
  const resultBefore = await readFile(join(output, 'result.json'), 'utf8');
  const filesBefore = await readdir(output);
  await writeFile(input, JSON.stringify({ ...createManifest(), id: 'different-input', actions: [] }));
  const repeated = await replay(input, output);
  assert.equal(repeated.status, 2);
  assert.equal(repeated.stdout, '', 'Existing evidence must be rejected before a second run starts');
  assert.equal(JSON.parse(repeated.stderr).code, 'OUTPUT_EXISTS');
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), manifestBefore);
  assert.equal(await readFile(join(output, 'result.json'), 'utf8'), resultBefore);
  assert.deepEqual(await readdir(output), filesBefore);
});

test('concurrent CLI commands cannot both claim the same output directory', async () => {
  const { input, output } = await setup();
  const commands = await Promise.all([replay(input, output), replay(input, output)]);
  const completed = commands.filter(command => command.stdout !== '');
  assert.equal(completed.length, 1, 'Exactly one command may create evidence');
  const refused = commands.find(command => command.stdout === '');
  assert.equal(refused?.status, 2);
  assert.equal(JSON.parse(refused!.stderr).code, 'OUTPUT_EXISTS');
  assert.deepEqual(JSON.parse(await readFile(join(output, 'result.json'), 'utf8')), JSON.parse(completed[0]!.stdout).result);
});

test('a partially written CLI output directory remains preserved for investigation', async () => {
  const { input, output } = await setup();
  await mkdir(output);
  await writeFile(join(output, 'manifest.json'), 'partial evidence');
  const result = await replay(input, output);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).code, 'OUTPUT_EXISTS');
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), 'partial evidence');
  assert.deepEqual(await readdir(output), ['manifest.json']);
});
