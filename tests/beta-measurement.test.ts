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
function launch(output: string, code: string, timeout = 40000, expected = 0, executable = process.execPath, preload?: string) {
  const child = spawn(process.execPath, [...(preload ? ['--import', preload] : []), supervisor, '--output', output, '--timeout-ms', String(timeout), '--expect-exit', String(expected), '--', executable, '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
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

test('an early timer callback cannot end native cleanup observation before its absolute cutoff', { timeout: 15000 }, async () => {
  const root = await workspace(), output = join(root, 'measurement');
  const preload = join(root, 'early-timer.mjs'), marker = join(root, 'early-timer-fired');
  // Timer delivery is the only substituted boundary. The real supervisor,
  // monotonic clock, command, process census and receipt remain exercised.
  await writeFile(preload, `import { writeFileSync } from 'node:fs';
const schedule = globalThis.setTimeout;
let shortenNextTerminal = true;
globalThis.setTimeout = (callback, delay, ...args) => {
  if (shortenNextTerminal && delay >= 4000 && delay <= 5000) {
    shortenNextTerminal = false;
    return schedule(() => { writeFileSync(${JSON.stringify(marker)}, 'early callback'); callback(...args); }, delay - 100);
  }
  return schedule(callback, delay, ...args);
};
`);
  const result = await launch(output, 'process.exit(0)', 40000, 0, process.execPath, preload).closed;
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(marker, 'utf8'), 'early callback');
  const receipt = JSON.parse(await readFile(join(output, 'receipt.json'), 'utf8'));
  assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.cleanup.passed, true);
  assert.deepEqual(receipt.cleanup.first.owned, []);
  assert.deepEqual(receipt.cleanup.terminal.owned, []);
  assert.ok(receipt.cleanup.terminal.elapsedMs >= receipt.durationMs + 5000,
    `Terminal census at exit + ${receipt.cleanup.terminal.elapsedMs - receipt.durationMs} ms preceded the frozen 5000 ms cutoff`);
  assert.deepEqual(receipt.interventions, []);
});

for (const late of ['process', 'temporary-file', 'process-census'] as const) {
  test(`a late clean ${late} observation cannot pass the native cleanup cutoff`, { timeout: 15000 }, async () => {
    const root = await workspace(), output = join(root, 'measurement');
    const preload = join(root, 'late-observation.mjs');
    await writeFile(preload, `import fs from 'node:fs/promises';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
const schedule = globalThis.setTimeout;
let delayNextTerminal = true;
globalThis.setTimeout = (callback, delay, ...args) => {
  if (delayNextTerminal && delay >= 4000 && delay <= 5000) {
    delayNextTerminal = false;
    return schedule(callback, delay + 700, ...args);
  }
  return schedule(callback, delay, ...args);
};
if (${JSON.stringify(late)} === 'temporary-file') {
  const spawn = childProcess.spawn, readdir = fs.readdir;
  childProcess.spawn = (...args) => {
    const child = spawn(...args);
    child.once('exit', () => schedule(() => { void fs.unlink(join(${JSON.stringify(output)}, 'tmp', 'late.tmp')); }, 5100));
    return child;
  };
  let firstInventory = true;
  fs.readdir = async (...args) => {
    if (firstInventory && args[0] === join(${JSON.stringify(output)}, 'tmp')) {
      firstInventory = false;
      await new Promise(accept => schedule(accept, 5300));
    }
    return readdir(...args);
  };
  syncBuiltinESMExports();
}
if (${JSON.stringify(late)} === 'process-census') {
  const spawn = childProcess.spawn, spawnSync = childProcess.spawnSync;
  let commandExited = false, delayFirstPostExit = true;
  childProcess.spawn = (...args) => {
    const child = spawn(...args);
    child.once('exit', () => { commandExited = true; });
    return child;
  };
  childProcess.spawnSync = (...args) => {
    if (commandExited && delayFirstPostExit && args[0] === 'ps') {
      delayFirstPostExit = false;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5100);
    }
    return spawnSync(...args);
  };
  syncBuiltinESMExports();
}
`);
    const code = late === 'process'
      ? `const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),5300)'],{stdio:'ignore'});child.unref();setTimeout(()=>process.exit(0),100);`
      : late === 'temporary-file'
        ? `require('node:fs').writeFileSync(require('node:path').join(process.env.TMPDIR,'late.tmp'),'owned temporary bytes');`
        : 'process.exit(0)';
    const result = await launch(output, code, 40000, 0, process.execPath, preload).closed;
    const receipt = JSON.parse(await readFile(join(output, 'receipt.json'), 'utf8'));
    assert.equal(receipt.command.exitCode, 0);
    assert.deepEqual(receipt.cleanup.terminal.owned, []);
    assert.deepEqual(receipt.temporaryFiles.terminal, []);
    assert.ok(receipt.cleanup.terminal.elapsedMs > receipt.durationMs + 5000);
    if (late === 'process') {
      assert.ok(receipt.cleanup.first.owned.length > 0);
      assert.equal(receipt.memory.samples.some((sample: { elapsedMs: number; ownedCount: number; error: string | null }) =>
        sample.elapsedMs >= receipt.durationMs && sample.elapsedMs <= receipt.durationMs + 5000 && sample.error === null && sample.ownedCount === 0), false);
    } else {
      assert.deepEqual(receipt.cleanup.first.owned, []);
      assert.deepEqual(receipt.temporaryFiles.first, []);
    }
    assert.equal(result.code, 2, 'Clean observations obtained only after the deadline must not pass');
    assert.equal(receipt.cleanup.passed, false);
    assert.equal(receipt.outcome, 'failed');
    assert.deepEqual(receipt.interventions, []);
    if (late === 'process') {
      assert.equal(receipt.cleanup.processCleanByCutoff, false);
      assert.equal(receipt.cleanup.temporaryFilesCleanByCutoff, true);
    }
    if (late === 'temporary-file') {
      assert.ok(receipt.temporaryFiles.firstCompletedAtMs > receipt.durationMs + 5000);
      assert.equal(receipt.cleanup.processCleanByCutoff, true);
      assert.equal(receipt.cleanup.temporaryFilesCleanByCutoff, false);
    }
    if (late === 'process-census') {
      assert.ok(receipt.cleanup.first.elapsedMs <= receipt.durationMs + 5000);
      assert.ok(receipt.cleanup.first.completedAtMs > receipt.durationMs + 5000);
      assert.equal(receipt.cleanup.processCleanByCutoff, false);
    }
  });
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
    assert.ok(receipt.cleanup.terminal.elapsedMs >= receipt.durationMs + 5000);
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
    assert.ok(receipt.cleanup.terminal.elapsedMs >= receipt.stopAtMs + 8000);
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
    assert.ok(receipt.cleanup.terminal.elapsedMs >= receipt.stopAtMs + 8000);
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
