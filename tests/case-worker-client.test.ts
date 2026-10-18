import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCaseManifest } from '../src/browser-case.js';
import { runCaseBrowser } from '../src/case-adapter.js';
import { runCaseWorker, type WorkerIdentity } from '../src/case-worker-client.js';
import type { RunOptions } from '../src/contracts.js';

// This controlled protocol peer creates no browser, profile, file or descendant.
// It is substituted at the spawn boundary; production accepts no custom entry.
const peer = String.raw`
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[1];
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
let frame, events, index = 0;
process.on('disconnect', () => process.exit(0));
setTimeout(() => process.send({ version: 1, type: 'ready' }), 20);
function finish() {
  const { request, nonce } = frame;
  const cleanupStartedNs = process.hrtime.bigint().toString();
  process.send({ version: 1, type: 'cleanup-start', nonce, cleanupStartedNs });
  const conclusive = mode !== 'snapshot' && mode !== 'callbacks' && !mode.startsWith('inconclusive-');
  const result = {
    id: request.id, outcome: conclusive ? 'requirement-satisfied' : 'inconclusive',
    reason: conclusive ? 'The executed frozen assertion is satisfied by this revision.' : 'RUNNER_ERROR: Browser or owned server setup failed. Check prerequisites and writable task output, then retry.',
    manifestDigest: crypto.createHash('sha256').update(canonical(request.input)).digest('hex'),
    assertionDigest: request.input.assertionDigest, harnessDigest: request.harnessDigest,
    appRevision: request.revision ?? request.input.app.revision, appDigest: conclusive ? request.input.app.sourceDigest : '',
    adapterVersion: '0.2.2', runnerVersion: '0.2.2', seed: request.input.environment.seed,
    startedAt: request.startedAt, durationMs: 0, assertionCount: conclusive ? 1 : 0,
    observation: conclusive ? { kind: 'browser-case', values: request.input.expectation.checks.map(c => c.expected) } : null,
    events, artifacts: [], environment: { platform: process.platform + '-' + process.arch, node: process.version,
      browser: conclusive ? '0.0.0 (pinned Chromium)' : 'not-launched',
      isolation: 'registered public browser library; fresh owned profile; Chromium sandbox enabled; loopback asset allowlist; not a hostile-code sandbox' },
  };
  const receipt = { result, ownedDirectory: mode !== 'snapshot', launchState: conclusive ? 'acquired' : 'not-attempted',
    closeAcknowledged: conclusive, workDrained: true, cleanupTimedOut: false, cleanupStartedNs,
    contextClose: conclusive ? 'acknowledged' : 'not-applicable', launchJoin: 'not-needed' };
  if (mode === 'no-acquisition') { receipt.launchState = 'not-attempted'; receipt.closeAcknowledged = false; receipt.contextClose = 'not-applicable'; result.environment.browser = 'not-launched'; }
  if (mode === 'acknowledged-close-timeout') receipt.contextClose = 'timeout';
  if (mode === 'acquired-without-close-basis') receipt.contextClose = 'not-applicable';
  if (mode === 'failed-close-without-cleanup-failure') { receipt.closeAcknowledged = false; receipt.contextClose = 'rejected'; }
  if (mode === 'expired-join-without-cleanup-failure') receipt.launchJoin = 'expired';
  if (mode === 'unknown-close-basis') receipt.contextClose = 'closed-eventually';
  if (mode === 'failed-close-with-cleanup-failure') { receipt.closeAcknowledged = false; receipt.contextClose = 'rejected'; receipt.cleanupTimedOut = true; }
  // Each rule-* mode violates exactly one consistency rule while satisfying all others.
  if (mode === 'rule-vocabulary-close') { receipt.closeAcknowledged = false; receipt.cleanupTimedOut = true; receipt.contextClose = '/private/basis-path-sentinel'; }
  if (mode === 'rule-vocabulary-join') receipt.launchJoin = 'private-join-sentinel';
  if (mode === 'rule-acquired-without-close') { receipt.closeAcknowledged = false; receipt.contextClose = 'not-applicable'; receipt.cleanupTimedOut = true; receipt.workDrained = false; }
  if (mode === 'inconclusive-close-without-acquisition') { receipt.contextClose = 'rejected'; receipt.cleanupTimedOut = true; }
  if (mode === 'rule-acknowledgement-mismatch') { receipt.closeAcknowledged = false; receipt.cleanupTimedOut = true; receipt.workDrained = false; }
  if (mode === 'inconclusive-join-without-launch') receipt.launchJoin = 'joined';
  if (mode === 'rule-unexplained-cleanup-failure') receipt.cleanupTimedOut = true;
  if (mode === 'rule-no-budget-without-join') { receipt.closeAcknowledged = false; receipt.contextClose = 'no-budget'; receipt.cleanupTimedOut = true; }
  if (mode === 'rule-expired-acquired-close') { receipt.closeAcknowledged = false; receipt.contextClose = 'timeout'; receipt.launchJoin = 'expired'; receipt.cleanupTimedOut = true; }
  if (mode === 'rule-array-close-basis') { receipt.closeAcknowledged = false; receipt.cleanupTimedOut = true; receipt.contextClose = ['timeout']; }
  if (mode === 'rule-object-close-basis') { receipt.closeAcknowledged = false; receipt.cleanupTimedOut = true; receipt.contextClose = { toString: 1 }; }
  if (mode === 'inconclusive-array-launch-state') receipt.launchState = ['not-attempted'];
  if (mode === 'empty-app-digest') result.appDigest = '';
  if (mode === 'wrong-success-reason') result.reason = 'The frozen browser-case assertion observed the registered failure.';
  process.send({ version: 1, type: 'terminal', nonce, receipt, attempts: 0, sealed: true }, () => process.disconnect());
}
function next() {
  if (index === events.length) { finish(); return; }
  const event = events[index++];
  process.send({ version: 1, type: 'event', nonce: frame.nonce, seq: event.seq, event });
}
process.on('message', message => {
  if (message.type === 'cancel') { process.disconnect(); return; }
  if (message.type === 'event-ack') { next(); return; }
  if (message.type !== 'start') return;
  frame = message;
  if (mode === 'exit-before-cleanup') process.exit(1);
  const { request, nonce } = frame;
  events = [];
  if (mode !== 'snapshot') {
    // The end-to-end vocabulary mode owns a real run directory so evidence finalization keeps the decided reason.
    if (mode === 'rule-vocabulary-close') fs.mkdirSync(path.join(request.artifactDir, request.id), { recursive: true, mode: 0o700 });
    process.send({ version: 1, type: 'owned', nonce });
    events.push({ type: 'reset', message: 'Starting a new owned browser profile and pinned local application.' });
    if (mode !== 'callbacks' && !mode.startsWith('inconclusive-')) {
      const actions = mode === 'reordered-actions' ? [...request.input.actions].reverse() : request.input.actions;
      for (const action of actions) events.push({ type: 'action-executed', message: 'Executed registered ' + action.kind + ' action.', actionId: action.id });
      if (mode !== 'missing-assertion-event') events.push({ type: 'assertion', message: mode === 'wrong-assertion-message' ? 'The frozen browser-case assertion observed the registered failure.' : 'The executed frozen assertion is satisfied by this revision.' });
    }
    events = events.map((event, i) => ({ seq: i + 1, at: new Date().toISOString(), ...event }));
  }
  next();
});
`;

function installPeer(t: TestContext, mode: string) {
  const original = childProcess.spawn;
  const children: { child: ChildProcess; closed: Promise<unknown> }[] = [];
  const requests: Record<string, unknown>[] = [];
  const worker = fileURLToPath(new URL('../src/case-worker.ts', import.meta.url));
  const mocked = t.mock.method(childProcess, 'spawn', (...args: Parameters<typeof original>) => {
    const [command, workerArgs, workerOptions] = args;
    if (command !== process.execPath || !Array.isArray(workerArgs) || workerArgs.length !== 3
      || workerArgs[0] !== '--import' || workerArgs[1] !== import.meta.resolve('tsx') || workerArgs[2] !== worker) {
      return Reflect.apply(original, childProcess, args) as ChildProcess;
    }
    assert.ok(Array.isArray(workerOptions?.stdio) && workerOptions.stdio[3] === 'ipc');
    const child = original(process.execPath, ['-e', peer, mode], workerOptions);
    children.push({ child, closed: once(child, 'close') });
    const send = child.send;
    child.send = ((message: unknown, ...sendArgs: unknown[]) => {
      if (message && typeof message === 'object' && Reflect.get(message, 'type') === 'start') requests.push(structuredClone(Reflect.get(message, 'request')));
      return Reflect.apply(send, child, [message, ...sendArgs]);
    }) as typeof child.send;
    return child;
  });
  t.after(async () => {
    mocked.mock.restore();
    for (const { child, closed } of children) {
      child.ref(); child.channel?.ref();
      await closed;
    }
  });
  return { requests };
}
function identity(): WorkerIdentity {
  return { id: randomUUID(), startedAt: new Date().toISOString(), startedNs: process.hrtime.bigint().toString(), harnessDigest: '0'.repeat(64) };
}

test('browser execution retains the manifest selected before worker bootstrap', async t => {
  const fixture = installPeer(t, 'snapshot');
  const input = createCaseManifest('morphdom-textarea');
  const original = structuredClone(input);
  const pending = runCaseBrowser(input, { artifactDir: '.repro-runs/worker-client/snapshot' });
  input.environment.seed++;
  const result = await pending;
  assert.deepEqual(fixture.requests[0]?.input, original);
  assert.equal(result.seed, original.environment.seed);
  assert.match(result.reason, /RUNNER_ERROR/);
  assert.doesNotMatch(result.reason, /CLEANUP_FAILED/);
});

test('worker validation and callbacks retain their initial input, options and identity', async t => {
  const fixture = installPeer(t, 'callbacks');
  const input = createCaseManifest('morphdom-textarea');
  const original = structuredClone(input);
  const selectedIdentity = identity(), originalIdentity = { ...selectedIdentity };
  let originalCalls = 0, replacementCalls = 0;
  const signal = new AbortController().signal;
  const options: RunOptions = { artifactDir: '.repro-runs/worker-client/original', revision: 'buggy', signal,
    onEvent: () => { originalCalls++; } };
  const pending = runCaseWorker(input, options, selectedIdentity);
  input.environment.seed++;
  selectedIdentity.id = randomUUID();
  options.artifactDir = '.repro-runs/worker-client/replacement';
  options.revision = 'fixed'; options.signal = AbortSignal.abort();
  options.onEvent = () => { replacementCalls++; };
  const completion = await pending;
  assert.deepEqual(fixture.requests[0]?.input, original);
  assert.equal(fixture.requests[0]?.artifactDir, resolve('.repro-runs/worker-client/original'));
  assert.equal(fixture.requests[0]?.revision, 'buggy');
  assert.equal(fixture.requests[0]?.id, originalIdentity.id);
  assert.equal(originalCalls, 1); assert.equal(replacementCalls, 0);
  assert.equal(completion.protocolFailed, false); assert.equal(completion.closed, true);
  assert.equal(completion.receipt?.result.seed, original.environment.seed);
});

for (const mode of ['no-acquisition', 'empty-app-digest', 'wrong-success-reason', 'missing-assertion-event', 'wrong-assertion-message', 'reordered-actions']) {
  test(`a conclusive receipt cannot omit causal execution evidence: ${mode}`, async t => {
    installPeer(t, mode);
    const completion = await runCaseWorker(createCaseManifest('morphdom-textarea'), { artifactDir: '.repro-runs/worker-client/invalid' }, identity());
    assert.equal(completion.protocolFailed, true, 'A matching observation alone cannot establish that the registered browser execution occurred.');
    assert.equal(completion.receipt, undefined);
  });
}

for (const mode of ['acknowledged-close-timeout', 'acquired-without-close-basis', 'failed-close-without-cleanup-failure', 'expired-join-without-cleanup-failure', 'unknown-close-basis',
  'rule-vocabulary-close', 'rule-vocabulary-join', 'rule-acquired-without-close', 'inconclusive-close-without-acquisition', 'rule-acknowledgement-mismatch',
  'inconclusive-join-without-launch', 'rule-unexplained-cleanup-failure', 'rule-no-budget-without-join', 'rule-expired-acquired-close', 'rule-array-close-basis', 'rule-object-close-basis',
  'inconclusive-array-launch-state']) {
  test(`a receipt cannot misstate its cleanup basis: ${mode}`, async t => {
    installPeer(t, mode);
    const completion = await runCaseWorker(createCaseManifest('morphdom-textarea'), { artifactDir: '.repro-runs/worker-client/basis' }, identity());
    assert.equal(completion.protocolFailed, true, 'The cleanup basis must agree with the acknowledgement and failure flags it explains.');
    assert.equal(completion.receipt, undefined); assert.equal(completion.finishedBy, 'protocol');
  });
}

test('a basis outside the vocabulary cannot reach the public reason', async t => {
  installPeer(t, 'rule-vocabulary-close');
  const result = await runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: '.repro-runs/worker-client/basis-vocabulary' });
  assert.equal(result.outcome, 'inconclusive');
  assert.match(result.reason, /^CLEANUP_FAILED: .*Cleanup basis: receipt=absent; protocol=failed; wait-ended=protocol; /);
  assert.equal(JSON.stringify(result).includes('basis-path-sentinel'), false);
  const evidence = await readFile(join(resolve('.repro-runs/worker-client/basis-vocabulary'), result.id, 'evidence.json'), 'utf8');
  assert.equal(JSON.parse(evidence).reason, result.reason);
  assert.equal(evidence.includes('basis-path-sentinel'), false);
});

test('a worker that exits before cleanup starts is not reported as a late close', async t => {
  installPeer(t, 'exit-before-cleanup');
  const completion = await runCaseWorker(createCaseManifest('morphdom-textarea'), { artifactDir: '.repro-runs/worker-client/early-exit' }, identity());
  assert.equal(completion.closed, true); assert.equal(completion.protocolFailed, true);
  assert.equal(completion.cleanupStarted, false); assert.equal(completion.finishedBy, 'close');
});

test('the cleanup basis names an early worker exit without inventing receipt fields', async t => {
  installPeer(t, 'exit-before-cleanup');
  const result = await runCaseBrowser(createCaseManifest('morphdom-textarea'), { artifactDir: '.repro-runs/worker-client/early-exit-basis' });
  assert.match(result.reason, /Cleanup basis: receipt=absent; protocol=failed; wait-ended=close; worker=closed-before-cleanup\. /);
});

test('an actual verdict followed by a rejected close keeps its consistent cleanup basis', async t => {
  installPeer(t, 'failed-close-with-cleanup-failure');
  const completion = await runCaseWorker(createCaseManifest('morphdom-textarea'), { artifactDir: '.repro-runs/worker-client/basis' }, identity());
  assert.equal(completion.protocolFailed, false);
  assert.equal(completion.receipt?.contextClose, 'rejected');
  assert.equal(completion.receipt?.cleanupTimedOut, true);
});

test('a complete acquired execution receipt still passes independent validation', async t => {
  installPeer(t, 'complete');
  const completion = await runCaseWorker(createCaseManifest('morphdom-textarea'), { artifactDir: '.repro-runs/worker-client/complete' }, identity());
  assert.equal(completion.protocolFailed, false); assert.equal(completion.closed, true);
  assert.equal(completion.completedBeforeDeadline, true);
  assert.equal(completion.receipt?.result.outcome, 'requirement-satisfied');
});

const execute = promisify(childProcess.execFile);
for (const mode of ['never-ready', 'late-ready']) {
  test(`a ${mode} worker cannot pin its caller or start work after the deadline`, { timeout: 7000 }, async () => {
    const script = `
      import childProcess from 'node:child_process';
      import { randomUUID } from 'node:crypto';
      import { createCaseManifest } from ${JSON.stringify(new URL('../src/browser-case.ts', import.meta.url).href)};
      import { runCaseWorker } from ${JSON.stringify(new URL('../src/case-worker-client.ts', import.meta.url).href)};
      const original = childProcess.spawn;
      const mode = ${JSON.stringify(mode)};
      childProcess.spawn = (command, args, options) => original(process.execPath, ['-e',
        "process.on('disconnect', () => process.exit(0)); process.on('message', m => { if (m.type === 'start') { console.log('LATE_START'); process.disconnect(); } }); " +
        (mode === 'late-ready' ? "setTimeout(() => process.send({version:1,type:'ready'}), 3400);" : "setInterval(() => {}, 1000);")
      ], { ...options, stdio: ['ignore', 'inherit', 'ignore', 'ipc'] });
      const input = createCaseManifest('morphdom-textarea'); input.environment.timeoutMs = 100;
      const result = await runCaseWorker(input, { artifactDir: '.repro-runs/worker-client/no-profile-created' }, {
        id: randomUUID(), startedAt: new Date().toISOString(), startedNs: process.hrtime.bigint().toString(), harnessDigest: '0'.repeat(64),
      });
      console.log(JSON.stringify(result));
    `;
    const { stdout } = await execute(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', script], {
      timeout: 4500, maxBuffer: 65536, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR },
    });
    assert.equal(stdout.includes('LATE_START'), false, 'No run identity may reach a worker after its caller has returned failure.');
    const result = JSON.parse(stdout.trim());
    assert.equal(result.ownedDirectory, false); assert.equal(result.closed, false);
    assert.equal(result.completedBeforeDeadline, false); assert.equal(result.receipt, undefined);
    assert.equal(result.finishedBy, 'deadline');
  });
}
