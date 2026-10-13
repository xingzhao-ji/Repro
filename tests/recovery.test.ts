import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Ledger } from '../src/ledger.js';

async function directory() { await mkdir('.repro-runs/recovery-tests', { recursive: true }); return mkdtemp('.repro-runs/recovery-tests/ledger-'); }

test('failed database initialization releases its owner lock so an explicit repair can be retried', async () => {
  const root = await directory();
  await writeFile(join(root, 'ledger.sqlite'), 'corrupt owned SQLite test fixture');
  assert.throws(() => new Ledger(root), /database/);
  await assert.rejects(access(join(root, 'owner.lock')));
  await unlink(join(root, 'ledger.sqlite'));
  const recovered = new Ledger(root);
  try { assert.deepEqual(recovered.sessions(), []); }
  finally { recovered.close(); }
});

test('actual killed process leaves running record, reduce, and export ledger jobs interrupted after recovery', { timeout: 15000 }, async () => {
  const root = await directory();
  const script = `import {Ledger} from './src/ledger.ts'; import {createManifest} from './src/manifest.ts';
    const ledger = new Ledger(process.env.REPRO_TEST_LEDGER_ROOT);
    const jobs = ['record','reduce','export'].map(operation => {
      const session = ledger.createSession(createManifest(), true);
      const job = ledger.startJob(session.id, operation, operation + '-request');
      ledger.event(job.id, 'boundary', 'Durable ' + operation + ' job began; completion has not been written.');
      return job;
    });
    console.log(JSON.stringify({jobs})); setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: { ...process.env, REPRO_TEST_LEDGER_ROOT: root }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errorOutput = ''; child.stderr.on('data', chunk => { errorOutput += String(chunk); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  try {
    const ready = new Promise<{ jobs: { id: string; sessionId: string; operation: string; requestKey: string }[] }>((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += String(chunk);
        if (output.includes('\n')) { try { resolve(JSON.parse(output.trim())); } catch (error) { reject(error); } }
      });
      child.once('exit', () => reject(new Error(`Child exited before durable readiness: ${errorOutput}`)));
    });
    const { jobs } = await ready;
    assert.equal(jobs.length, 3);
    assert.equal(child.kill('SIGKILL'), true);
    const termination = await exited; assert.equal(termination.signal, 'SIGKILL');
    const recovered = new Ledger(root);
    try {
      for (const job of jobs) {
        const stored = recovered.getJob(job.id);
        assert.equal(stored.status, 'interrupted');
        assert.equal(recovered.getSession(job.sessionId).state, 'blocked');
        assert.deepEqual(recovered.events(job.id).map(event => event.seq), [1, 2, 3]);
        assert.equal(recovered.startJob(job.sessionId, job.operation as 'record' | 'reduce' | 'export', job.requestKey).status, 'interrupted', 'same request key must not silently rerun');
        const retry = recovered.startJob(job.sessionId, job.operation as 'record' | 'reduce' | 'export', `${job.requestKey}-retry`);
        assert.notEqual(retry.id, job.id);
        recovered.finish(retry.id, 'cancelled', { outcome: 'cancelled', reason: 'Recovery test complete.' });
      }
    } finally { recovered.close(); }
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; } }
});
