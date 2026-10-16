import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const supervisor = resolve('scripts/measure-beta.mjs');
async function workspace() {
  const parent = resolve('.repro-runs/beta-measurement-tests');
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, 'case-'));
}
function launch(output: string, code: string, timeout = 40000, expected = 0, executable = process.execPath) {
  const child = spawn(process.execPath, [supervisor, '--output', output, '--timeout-ms', String(timeout), '--expect-exit', String(expected), '--', executable, '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += String(bytes); });
  child.stderr.on('data', bytes => { stderr += String(bytes); });
  const closed = new Promise<{ code: number | null; stdout: string; stderr: string }>((accept, reject) => {
    child.once('error', reject);
    child.once('close', code => accept({ code, stdout, stderr }));
  });
  return { child, closed };
}
async function ready(path: string, closed: Promise<unknown>) {
  await Promise.race([
    (async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        try { await readFile(path); return; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
      }
      throw new Error('Owned test command did not become ready');
    })(),
    closed.then(() => { throw new Error('Measurement supervisor exited before the owned command became ready'); }),
  ]);
}
async function withSentinel(run: () => Promise<void>) {
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const closed = new Promise<void>(resolve => sentinel.once('close', () => resolve()));
  try {
    await run();
    assert.equal(sentinel.exitCode, null, 'Unrelated process must remain alive');
    assert.ok(sentinel.pid); process.kill(sentinel.pid, 0);
  } finally { sentinel.kill(); await closed; }
}

test('native measurement records real descendant RSS and distinct cleanup censuses without changing user files', { timeout: 20000 }, async () => {
  await withSentinel(async () => {
    const root = await workspace(); const output = join(root, 'measurement');
    const userFile = join(root, 'user.txt'); await writeFile(userFile, 'preserve original user bytes');
    const before = createHash('sha256').update(await readFile(userFile)).digest('hex');
    const code = `const {spawn}=require('node:child_process'); const {writeFileSync,unlinkSync}=require('node:fs'); const p=require('node:path').join(process.env.TMPDIR,'owned.tmp'); writeFileSync(p,'temporary'); const child=spawn(process.execPath,['-e','const b=Buffer.alloc(8*1024*1024,1);setInterval(()=>b[0]++,1000)'],{stdio:'ignore'}); setTimeout(()=>{child.once('close',()=>{unlinkSync(p);console.log('owned output');process.exit(1)});child.kill()},400);`;
    const result = await launch(output, code, 40000, 1).closed;
    assert.equal(result.code, 0, result.stderr);
    const receipt = JSON.parse(await readFile(join(output, 'receipt.json'), 'utf8'));
    assert.equal(receipt.outcome, 'completed');
    assert.equal(receipt.command.exitCode, 1);
    assert.ok(receipt.durationMs > 0);
    assert.ok(receipt.memory.peakRssBytes > 0);
    assert.match(receipt.memory.method, /sampled.*RSS.*not.*kernel/i);
    assert.ok(receipt.processes.observed.length >= 2, 'The real owned grandchild must be observed');
    assert.ok(receipt.cleanup.terminal.elapsedMs - receipt.cleanup.first.elapsedMs >= 4900);
    assert.deepEqual(receipt.cleanup.terminal.owned, []);
    assert.equal(receipt.cleanup.passed, true);
    assert.equal(receipt.temporaryFiles.terminal.length, 0);
    assert.equal(receipt.interventions.length, 0);
    assert.equal(await readFile(join(output, 'stdout.log'), 'utf8'), 'owned output\n');
    assert.equal(createHash('sha256').update(await readFile(userFile)).digest('hex'), before);
    const refused = await launch(output, 'process.exit(0)').closed;
    assert.equal(refused.code, 2, 'Existing measurement evidence must be preserved');
    assert.equal(await readFile(join(output, 'stdout.log'), 'utf8'), 'owned output\n');
  });
});

test('owner cancellation stops only the measured process group and preserves cancellation as a non-success', { timeout: 20000 }, async () => {
  await withSentinel(async () => {
    const root = await workspace(); const output = join(root, 'measurement'); const marker = join(root, 'ready');
    const code = `const{spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(marker)},String(child.pid));process.on('SIGTERM',()=>{child.once('close',()=>process.exit(0));child.kill()});setInterval(()=>{},1000);`;
    const running = launch(output, code);
    await ready(marker, running.closed); running.child.kill('SIGTERM');
    const result = await running.closed;
    assert.equal(result.code, 130, result.stderr);
    const receipt = JSON.parse(await readFile(join(output, 'receipt.json'), 'utf8'));
    assert.equal(receipt.outcome, 'cancelled');
    assert.equal(receipt.stopReason, 'owner-cancelled');
    assert.equal(receipt.cleanup.passed, true);
    assert.deepEqual(receipt.cleanup.terminal.owned, []);
    assert.ok(receipt.cleanup.terminal.elapsedMs - receipt.stopAtMs >= 7900);
    assert.ok(receipt.interventions.some((event: { signal: string }) => event.signal === 'SIGTERM'));
  });
});

test('watchdog escalates an owned stubborn descendant and never relabels forced termination as success', { timeout: 20000 }, async () => {
  await withSentinel(async () => {
    const root = await workspace(); const output = join(root, 'measurement');
    const code = `const{spawn}=require('node:child_process');spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
    const result = await launch(output, code, 500).closed;
    assert.equal(result.code, 2, result.stderr);
    const receipt = JSON.parse(await readFile(join(output, 'receipt.json'), 'utf8'));
    assert.equal(receipt.outcome, 'failed');
    assert.equal(receipt.stopReason, 'timeout');
    assert.equal(receipt.command.exitSignal, 'SIGKILL');
    assert.ok(receipt.interventions.some((event: { signal: string }) => event.signal === 'SIGKILL'));
    assert.equal(receipt.cleanup.passed, true);
    assert.deepEqual(receipt.cleanup.terminal.owned, []);
  });
});

test('a reparented group survivor fails its original cleanup census even after supervisor cleanup', { timeout: 20000 }, async () => {
  await withSentinel(async () => {
    const root = await workspace(); const output = join(root, 'measurement');
    const code = `const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});child.unref();setTimeout(()=>process.exit(0),250);`;
    const result = await launch(output, code).closed;
    assert.equal(result.code, 2, result.stderr);
    const receipt = JSON.parse(await readFile(join(output, 'receipt.json'), 'utf8'));
    assert.equal(receipt.command.exitCode, 0);
    assert.equal(receipt.outcome, 'failed');
    assert.equal(receipt.cleanup.passed, false);
    assert.ok(receipt.cleanup.first.owned.length > 0);
    assert.ok(receipt.cleanup.terminal.owned.length > 0);
    assert.deepEqual(receipt.cleanup.afterIntervention.owned, []);
    assert.ok(receipt.interventions.length > 0);
  });
});

test('malformed options and linked output cannot execute commands or change neighboring user files', { timeout: 10000 }, async () => {
  const root = await workspace(); const outside = join(root, 'user'); await mkdir(outside);
  await writeFile(join(outside, 'original.txt'), 'original user bytes');
  const link = join(root, 'linked'); await symlink(outside, link);
  const source = `require('node:fs').writeFileSync(${JSON.stringify(join(outside, 'must-not-exist'))},'bad')`;
  const linked = await launch(join(link, 'measurement'), source).closed;
  assert.equal(linked.code, 2); assert.match(linked.stderr, /MEASUREMENT_LINK/);
  const malformed = await launch(join(root, 'invalid'), source, -1).closed;
  assert.equal(malformed.code, 2); assert.match(malformed.stderr, /MEASUREMENT_ARGUMENTS/);
  assert.deepEqual(await readdir(outside), ['original.txt']);
  assert.equal(await readFile(join(outside, 'original.txt'), 'utf8'), 'original user bytes');
});

test('an unavailable executable remains a launch failure and never becomes a watchdog or signaling attempt', { timeout: 15000 }, async () => {
  const root = await workspace(); const output = join(root, 'measurement');
  const result = await launch(output, '', 50, 0, join(root, 'unavailable-command')).closed;
  assert.equal(result.code, 2);
  const receipt = JSON.parse(await readFile(join(output, 'receipt.json'), 'utf8'));
  assert.equal(receipt.command.launchFailed, true);
  assert.equal(receipt.stopReason, null);
  assert.deepEqual(receipt.interventions, []);
  assert.deepEqual(receipt.measurementErrors, ['COMMAND_UNAVAILABLE']);
  assert.equal(receipt.cleanup.passed, true);
});
