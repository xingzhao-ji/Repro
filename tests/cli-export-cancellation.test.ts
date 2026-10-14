import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createManifest } from '../src/manifest.js';

async function fixture() {
  await mkdir('.repro-runs/tests', { recursive: true });
  const root = resolve(await mkdtemp('.repro-runs/tests/cli-export-cancellation-'));
  const outputs = join(root, 'outputs');
  await mkdir(outputs);
  const sentinel = 'UNRELATED_EXPORT_NEIGHBOR_MUST_SURVIVE';
  await writeFile(join(outputs, 'unrelated.txt'), sentinel);
  const input = join(root, 'manifest.json');
  await writeFile(input, JSON.stringify(createManifest()));
  return { root, outputs, sentinel, input, output: join(outputs, 'capsule') };
}

test('CLI owner SIGINT during a real staged export reports cancellation and removes only owned partial files', { timeout: 20_000 }, async t => {
  const f = await fixture();
  const preload = join(f.root, 'pause-staged-export.mjs');
  await writeFile(preload, `
    import filesystem from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import { basename, dirname } from 'node:path';
    const outputParent = ${JSON.stringify(f.outputs)};
    const originalWrite = filesystem.writeFile;
    let paused = false;
    filesystem.writeFile = async (...args) => {
      await originalWrite(...args);
      const path = args[0];
      if (paused || typeof path !== 'string' || dirname(dirname(path)) !== outputParent || !basename(dirname(path)).startsWith('.capsule.partial-')) return;
      paused = true;
      // The artifact is genuinely on disk. Delay only this owned write's
      // completion; the parent supplies the actual operating-system SIGINT.
      await new Promise((accept, reject) => {
        const expired = setTimeout(() => reject(new Error('Owned export cancellation fixture timed out')), 10_000);
        process.once('SIGINT', () => {
          clearTimeout(expired);
          process.disconnect();
          accept();
        });
        process.send({ type: 'staged-export', pid: process.pid, path });
      });
    };
    syncBuiltinESMExports();
  `);
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, '--import', 'tsx', 'src/cli.ts', 'export', '--manifest', f.input, '--output', f.output], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stdout = '', stderr = '', timedOut = false;
  child.stdout!.on('data', chunk => { stdout += String(chunk); });
  child.stderr!.on('data', chunk => { stderr += String(chunk); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((accept, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => accept({ code, signal }));
  });
  const ready = new Promise<unknown>(accept => child.once('message', accept));
  const deadline = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 12_000);
  try {
    const boundary = await Promise.race([ready, exited.then(result => { throw new Error(`CLI exited before staged export readiness: ${JSON.stringify(result)} ${stderr}`); })]) as { type: string; pid: number; path: string };
    assert.equal(boundary.type, 'staged-export');
    assert.equal(boundary.pid, child.pid);
    assert.equal(dirname(dirname(boundary.path)), f.outputs);
    assert.match(basename(dirname(boundary.path)), /^\.capsule\.partial-/);
    assert.ok((await stat(boundary.path)).size > 0, 'Cancellation must interrupt a genuinely written artifact');
    assert.ok((await stat(`${f.output}.export-lock`)).isDirectory(), 'Export must own its lock before cancellation');
    await assert.rejects(access(f.output), { code: 'ENOENT' });
    assert.equal(child.kill('SIGINT'), true, 'Send SIGINT only to the owned ready CLI process');
    const result = await exited;
    const observation = { ...result, timedOut, stdout, stderr, boundary };
    await writeFile(join(f.root, 'observation.json'), JSON.stringify(observation, null, 2));
    t.diagnostic(`Retained actual CLI export observation: ${join(f.root, 'observation.json')}`);
    assert.equal(timedOut, false);
    assert.equal(result.signal, null, 'The CLI must handle cancellation and exit normally');
    assert.equal(stdout, '', 'An interrupted export must not announce a completed capsule');
    assert.deepEqual(JSON.parse(stderr), {
      outcome: 'cancelled', category: 'cancelled', code: 'EXPORT_CANCELLED',
      reason: 'Capsule export was cancelled before finalization.',
    });
    assert.deepEqual(await readdir(f.outputs), ['unrelated.txt'], 'No finalized capsule, staging directory, or export lock may remain');
    assert.equal(await readFile(join(f.outputs, 'unrelated.txt'), 'utf8'), f.sentinel);
    assert.equal(result.code, 130, 'Documented owner cancellation exit must agree with its structured cancelled outcome');
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  }
});

test('CLI ordinary export failure remains exit 2 and preserves the existing destination', { timeout: 10_000 }, async () => {
  const f = await fixture();
  await mkdir(f.output);
  await writeFile(join(f.output, 'existing.txt'), 'PRESERVE_EXISTING_DESTINATION');
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'export', '--manifest', f.input, '--output', f.output], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), {
    outcome: 'inconclusive', category: 'input', code: 'EXPORT_EXISTS',
    reason: 'Capsule destination already exists; choose a new output directory.',
  });
  assert.deepEqual((await readdir(f.outputs)).sort(), ['capsule', 'unrelated.txt']);
  assert.deepEqual(await readdir(f.output), ['existing.txt']);
  assert.equal(await readFile(join(f.output, 'existing.txt'), 'utf8'), 'PRESERVE_EXISTING_DESTINATION');
  assert.equal(await readFile(join(f.outputs, 'unrelated.txt'), 'utf8'), f.sentinel);
});
