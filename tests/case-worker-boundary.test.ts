import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const fixture = fileURLToPath(new URL('./helpers/case-fence-fixture.ts', import.meta.url));

for (const mode of ['none', 'spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork', 'worker-thread'] as const) {
  test(`a sealed worker accounts for ${mode} before naturally closing`, async () => {
    const { stdout, stderr } = await execute(process.execPath, ['--import', import.meta.resolve('tsx'), fixture, mode], {
      timeout: 5000, maxBuffer: 65536, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR },
    });
    assert.equal(stderr, '');
    const result = JSON.parse(stdout);
    assert.equal(result.sealed, true);
    assert.equal(result.attempts === 0, mode === 'none');
    assert.equal(result.lateSpawnBlocked, true, 'Sealing must prevent a process created after the receipt.');
    assert.equal(result.lateSyncSpawnBlocked, true);
    assert.equal(result.lateReplacementBlocked, true);
  });
}

for (const mode of ['natural-close', 'late-close', 'missing-receipt', 'wrong-nonce', 'foreign-observation', 'extra-result-field', 'extra-environment-field', 'private-reason', 'foreign-run-id', 'private-event', 'extra-teardown-field'] as const) {
  test(`a worker ${mode} is independently checked against its terminal receipt`, { timeout: 6000 }, async t => {
    const childProcess = (await import('node:child_process')).default;
    const { randomUUID } = await import('node:crypto');
    const { createCaseManifest } = await import('../src/browser-case.js');
    const { runCaseWorker, caseWorkerArtifactDigest } = await import('../src/case-worker-client.js');
    const { once } = await import('node:events');
    const original = childProcess.spawn;
    const controlled = fileURLToPath(new URL('./helpers/case-worker-protocol-fixture.cjs', import.meta.url));
    let closed: Promise<unknown> | undefined;
    t.mock.method(childProcess, 'spawn', (...args: Parameters<typeof original>) => {
      const child = original(process.execPath, [controlled, mode], args[2]);
      closed = once(child, 'close');
      return child;
    });
    const forwarded: unknown[] = [];
    const result = await runCaseWorker(createCaseManifest('morphdom-textarea'), { artifactDir: '.repro-runs/worker-boundary/protocol', onEvent: event => forwarded.push(event), onTeardown: event => forwarded.push(event) }, {
      id: randomUUID(), startedAt: new Date().toISOString(), startedNs: process.hrtime.bigint().toString(), harnessDigest: caseWorkerArtifactDigest(),
    });
    assert.equal(result.completedBeforeDeadline && !result.protocolFailed && result.receipt !== undefined, mode === 'natural-close');
    if (mode === 'late-close') {
      assert.equal(result.closed, true, 'The real worker completed, but outside the owner cleanup deadline.');
      assert.equal(result.completedBeforeDeadline, false, 'The drain allowance must not extend owner completion.');
      assert.equal(result.protocolFailed, false);
      assert.equal(result.finishedBy, 'close'); assert.equal(result.cleanupStarted, true);
    }
    if (mode === 'missing-receipt') { assert.equal(result.finishedBy, 'close'); assert.equal(result.cleanupStarted, true); assert.equal(result.receipt, undefined); }
    if (mode !== 'natural-close' && mode !== 'late-close') assert.equal(result.protocolFailed, true);
    assert.equal(JSON.stringify({ result, forwarded }).includes('private-ipc-sentinel'), false);
    await closed;
  });
}
