import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaseManifest } from '../src/browser-case.js';
import { runCaseBrowser } from '../src/case-adapter.js';
import { runCaseWorker, type WorkerIdentity } from '../src/case-worker-client.js';
import type { RunOptions } from '../src/contracts.js';

// This controlled protocol peer creates no browser, profile, file or descendant.
// It is substituted at the spawn boundary; production accepts no custom entry.
const peer = String.raw`
const crypto = require('node:crypto');
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
  const conclusive = mode !== 'snapshot' && mode !== 'callbacks';
  const result = {
    id: request.id, outcome: conclusive ? 'requirement-satisfied' : 'inconclusive',
    reason: conclusive ? 'The executed frozen assertion is satisfied by this revision.' : 'RUNNER_ERROR: Browser or owned server setup failed. Check prerequisites and writable task output, then retry.',
    manifestDigest: crypto.createHash('sha256').update(canonical(request.input)).digest('hex'),
    assertionDigest: request.input.assertionDigest, harnessDigest: request.harnessDigest,
    appRevision: request.revision ?? request.input.app.revision, appDigest: conclusive ? request.input.app.sourceDigest : '',
    adapterVersion: '0.1.0', runnerVersion: '0.1.0', seed: request.input.environment.seed,
    startedAt: request.startedAt, durationMs: 0, assertionCount: conclusive ? 1 : 0,
    observation: conclusive ? { kind: 'browser-case', values: request.input.expectation.checks.map(c => c.expected) } : null,
    events, artifacts: [], environment: { platform: process.platform + '-' + process.arch, node: process.version,
      browser: conclusive ? '0.0.0 (pinned Chromium)' : 'not-launched',
      isolation: 'registered public browser library; fresh owned profile; Chromium sandbox enabled; loopback asset allowlist; not a hostile-code sandbox' },
  };
  const receipt = { result, ownedDirectory: mode !== 'snapshot', launchState: conclusive ? 'acquired' : 'not-attempted',
    closeAcknowledged: conclusive, workDrained: true, cleanupTimedOut: false, cleanupStartedNs };
  if (mode === 'no-acquisition') { receipt.launchState = 'not-attempted'; receipt.closeAcknowledged = false; result.environment.browser = 'not-launched'; }
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
  const { request, nonce } = frame;
  events = [];
  if (mode !== 'snapshot') {
    process.send({ version: 1, type: 'owned', nonce });
    events.push({ type: 'reset', message: 'Starting a new owned browser profile and pinned local application.' });
    if (mode !== 'callbacks') {
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
  });
}
