import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Ledger, type Job, type Operation, type Session } from '../src/ledger.js';
import { Coordinator } from '../src/service.js';
import { importCapsule } from '../src/capsule.js';
import { digest } from '../src/manifest.js';

interface Boundary {
  pid: number;
  operation: Operation;
  job: Job;
  session: Session;
  boundary: { kind: string; path?: string; bytes?: number; trial?: { accepted: boolean; runIds: string[] } };
}
interface OwnedProcess { pid: number; ppid: number; identity: string }
interface ProcessInspection { status: number | null; stdout: string | null; stderr: string | null; signal?: NodeJS.Signals | null; error?: Error }

function identity(pid: number, inspect = (value: number): ProcessInspection => spawnSync('ps', ['-p', String(value), '-o', 'lstart=', '-o', 'comm='], { encoding: 'utf8', timeout: 2000 })): string | undefined {
  const result = inspect(pid);
  if (result.error || result.signal || typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
    throw new Error('Process inspection failed; owned process absence is not established.', { cause: result.error });
  }
  const value = result.stdout.trim();
  if (!result.stderr.trim()) {
    if (result.status === 0 && value) return value;
    if (result.status === 1 && !value) return undefined;
  }
  throw new Error('Process inspection failed; owned process absence is not established.', { cause: result.error });
}

test('process identity inspection errors cannot establish absence', () => {
  const failures: ProcessInspection[] = [
    { status: null, stdout: '', stderr: '', signal: 'SIGTERM', error: new Error('Owned test inspection timed out') },
    { status: null, stdout: null, stderr: null, error: new Error('Owned test ps executable unavailable') },
    { status: 1, stdout: '', stderr: 'Owned test permission failure' },
    { status: 2, stdout: '', stderr: '' },
    { status: 0, stdout: '', stderr: '' },
    { status: 1, stdout: 'unexpected output', stderr: '' },
  ];
  for (const result of failures) assert.throws(() => identity(12345, () => result), /Process inspection failed/);
  const cause = new Error('Owned ps spawn failure');
  assert.throws(() => identity(12345, () => ({ status: null, stdout: null, stderr: null, error: cause })), error => error instanceof Error && error.cause === cause);
});

test('process identity recognizes only successful identity or explicit no-PID output', () => {
  assert.equal(identity(12345, () => ({ status: 0, stdout: '  owned-process-start owned-executable\n', stderr: '' })), 'owned-process-start owned-executable');
  assert.equal(identity(12345, () => ({ status: 1, stdout: '', stderr: '' })), undefined);
});

function descendants(owner: number): OwnedProcess[] {
  // The host-wide table contains only numeric relationships. Command/start
  // identity is read only for descendants of this exact owned worker.
  const table = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', timeout: 2000 });
  assert.equal(table.status, 0, table.stderr);
  const rows = table.stdout.trim().split('\n').map(row => row.trim().split(/\s+/).map(Number));
  const owned = new Set([owner]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows) if (pid && ppid && owned.has(ppid) && !owned.has(pid)) { owned.add(pid); changed = true; }
  }
  return rows.flatMap(([pid, ppid]) => {
    if (!pid || !ppid || pid === owner || !owned.has(pid)) return [];
    const value = identity(pid);
    return value ? [{ pid, ppid, identity: value }] : [];
  });
}

async function boundary(path: string, exited: () => boolean): Promise<Boundary> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(path, 'utf8')) as Boundary; }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    assert.equal(exited(), false, 'Worker exited before reaching the actual operation boundary');
    await delay(25);
  }
  throw new Error('Actual operation did not reach its interruption boundary within 30 seconds');
}

for (const operation of ['record', 'reduce', 'export'] as const) {
  test(`abrupt ${operation} interruption recovers actual work and retries in fresh owned state`, { timeout: 180_000 }, async () => {
    const root = resolve('.repro-runs/recovery-browser', `${operation}-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/helpers/recovery-worker.ts', operation, root], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((accept, reject) => {
      child.once('error', reject); child.once('exit', (code, signal) => accept({ code, signal }));
    });
    let owned: OwnedProcess[] = [];
    let ledger: Ledger | undefined;
    let coordinator: Coordinator | undefined;
    let failed = false;
    let primaryFailure: unknown;
    const cleanupFailures: Error[] = [];
    const cleanup = async (description: string, action: () => void | Promise<void>): Promise<void> => {
      try { await action(); }
      catch (cause) { cleanupFailures.push(new Error(description, { cause })); }
    };
    const report: Record<string, unknown> = { operation, root, classification: 'actual-operation-interruption', status: 'started' };
    try {
      const captured = await boundary(join(root, 'boundary.json'), () => child.exitCode !== null || child.signalCode !== null);
      assert.equal(captured.pid, child.pid);
      assert.equal(captured.job.status, 'running');
      owned = descendants(captured.pid);
      report['boundary'] = captured; report['ownedDescendantsAtBoundary'] = owned;
      const snapshot = JSON.parse(await readFile(join(root, 'ledger', 'artifacts', captured.job.id, 'manifest.json'), 'utf8')) as unknown;
      assert.deepEqual(snapshot, captured.session.manifest);
      if (operation === 'record') assert.ok(owned.some(process => /chrome|chromium/i.test(process.identity)), 'Capture interruption must include a live owned browser');
      if (operation === 'reduce') {
        assert.equal(captured.boundary.trial?.accepted, true);
        assert.equal(captured.boundary.trial?.runIds.length, 2, 'The real baseline completed two preserved-failure runs');
        const evidence = [];
        for (const [index, id] of captured.boundary.trial.runIds.entries()) {
          const path = join(root, 'ledger', 'artifacts', captured.job.id, `execution-${String(index + 1).padStart(6, '0')}`, id, 'evidence.json');
          const run = JSON.parse(await readFile(path, 'utf8')) as { id: string; outcome: string; assertionCount: number; assertionDigest: string; manifestDigest: string; observation: unknown };
          assert.equal(run.id, id); assert.equal(run.outcome, 'target-failure'); assert.equal(run.assertionCount, 1);
          assert.equal(run.assertionDigest, captured.session.manifest.assertionDigest);
          assert.equal(run.manifestDigest, digest(captured.session.manifest));
          assert.deepEqual(run.observation, { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] });
          evidence.push({ path, id, assertionCount: run.assertionCount, observation: run.observation });
        }
        report['persistedBaselineEvidence'] = evidence;
      }
      if (operation === 'export') {
        assert.ok(captured.boundary.path?.includes('.partial-'));
        assert.ok((captured.boundary.bytes ?? 0) > 0, 'A real staged artifact must have been written');
      }
      assert.equal(child.kill('SIGKILL'), true);
      report['termination'] = await exited;
      assert.equal((report['termination'] as { signal: string }).signal, 'SIGKILL');
      const until = Date.now() + 10_000;
      let remaining = owned.filter(process => identity(process.pid) === process.identity);
      while (remaining.length && Date.now() < until) { await delay(100); remaining = owned.filter(process => identity(process.pid) === process.identity); }
      report['survivingOwnedProcessesBeforeTestCleanup'] = remaining;
      assert.deepEqual(remaining, [], 'Product/browser transport must not leave owned browser processes after abrupt worker exit');

      ledger = new Ledger(join(root, 'ledger')); coordinator = new Coordinator(ledger);
      const recovered = ledger.getJob(captured.job.id);
      assert.equal(recovered.status, 'interrupted');
      assert.equal(ledger.getSession(captured.session.id).state, 'blocked');
      assert.deepEqual(ledger.getSession(captured.session.id).manifest, captured.session.manifest);
      const repeated = coordinator.start(captured.session.id, operation, 'interrupted-request');
      assert.equal(repeated.id, captured.job.id); assert.equal(repeated.status, 'interrupted');
      assert.equal(ledger.jobs(captured.session.id).length, 1);
      report['recoveredJob'] = recovered;

      if (operation === 'export') {
        assert.ok(captured.boundary.path);
        const partial = dirname(captured.boundary.path);
        await assert.rejects(importCapsule(partial), /partial capsule/i);
        await assert.rejects(importCapsule(join(ledger.root, 'exports', captured.job.id)));
        report['incompleteExport'] = { path: partial, files: await readdir(partial), importRejected: true };
      }
      const retry = coordinator.start(captured.session.id, operation, 'fresh-retry');
      assert.notEqual(retry.id, captured.job.id);
      const completed = await coordinator.wait(retry.id);
      assert.equal(completed.status, 'complete', JSON.stringify(completed.result));
      const result = completed.result as { outcome?: string; manifest?: { actions: unknown[] }; path?: string };
      if (operation === 'record') assert.equal(result.outcome, 'target-failure');
      if (operation === 'reduce') assert.equal(result.manifest?.actions.length, 3);
      if (operation === 'export') { assert.ok(result.path); await importCapsule(result.path); }
      assert.equal(ledger.getJob(captured.job.id).status, 'interrupted');
      assert.equal(ledger.jobs(captured.session.id).length, 2);
      report['retryJob'] = completed; report['status'] = 'passed';
    } catch (error) {
      failed = true; primaryFailure = error;
      report['status'] = 'failed'; report['failure'] = error instanceof Error ? error.message : 'Unknown recovery failure';
    } finally {
      await cleanup('Owned worker cleanup failed', async () => {
        if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
      });
      await cleanup('Retry coordinator cleanup failed', async () => { await coordinator?.close(); });
      await cleanup('Recovery ledger cleanup failed', () => { ledger?.close(); });
      // Cleanup is separately reported and cannot turn a failed residue check
      // into product success. Check the recorded start/executable identity again.
      const cleaned: number[] = [];
      for (const process of owned) {
        await cleanup(`Recorded owned process ${process.pid} inspection or cleanup failed`, () => {
          if (identity(process.pid) !== process.identity) return;
          try { globalThis.process.kill(process.pid, 'SIGKILL'); cleaned.push(process.pid); }
          catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
        });
      }
      report['testCleanupPids'] = cleaned;
      await cleanup('Worker stdout evidence write failed', () => writeFile(join(root, 'worker.stdout.log'), stdout));
      await cleanup('Worker stderr evidence write failed', () => writeFile(join(root, 'worker.stderr.log'), stderr));
      if (cleanupFailures.length) report['status'] = 'failed';
      report['cleanupErrors'] = cleanupFailures.map(error => ({ reason: error.message, cause: error.cause instanceof Error ? error.cause.message : String(error.cause) }));
      await cleanup('Recovery summary write failed', () => writeFile(join(root, 'summary.json'), JSON.stringify(report, null, 2)));
    }
    if (failed && cleanupFailures.length) throw new AggregateError([primaryFailure, ...cleanupFailures], 'Recovery assertion failed and cleanup reported additional errors', { cause: primaryFailure });
    if (failed) throw primaryFailure;
    if (cleanupFailures.length) throw new AggregateError(cleanupFailures, 'Recovery cleanup failed');
  });
}
