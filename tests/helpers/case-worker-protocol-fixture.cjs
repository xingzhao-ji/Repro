'use strict';
const mode = process.argv[2];
process.send({ version: 1, type: 'ready' });
process.on('message', frame => {
  if (frame.type === 'cancel') { process.disconnect(); return; }
  if (frame.type !== 'start') return;
  const { request, nonce } = frame;
  const cleanupStartedNs = process.hrtime.bigint().toString();
  process.send({ version: 1, type: 'cleanup-start', nonce, cleanupStartedNs });
  if (mode === 'missing-receipt') { process.disconnect(); return; }
  const result = {
    id: request.id, outcome: 'inconclusive', reason: 'RUNNER_ERROR: Browser or owned server setup failed. Check prerequisites and writable task output, then retry.',
    manifestDigest: require('node:crypto').createHash('sha256').update(canonical(request.input)).digest('hex'),
    assertionDigest: request.input.assertionDigest, harnessDigest: request.harnessDigest,
    appRevision: request.revision ?? request.input.app.revision, appDigest: '', adapterVersion: '0.1.0', runnerVersion: '0.1.0',
    seed: request.input.environment.seed, startedAt: request.startedAt, durationMs: 0, assertionCount: 0,
    observation: null, events: [], artifacts: [], environment: { platform: `${process.platform}-${process.arch}`, node: process.version, browser: 'not-launched', isolation: 'registered public browser library; fresh owned profile; Chromium sandbox enabled; loopback asset allowlist; not a hostile-code sandbox' },
  };
  const receipt = { result, ownedDirectory: false, launchState: 'not-attempted', closeAcknowledged: false, workDrained: true, cleanupTimedOut: false, cleanupStartedNs,
    contextClose: 'not-applicable', launchJoin: 'not-needed' };
  const secret = 'private-ipc-sentinel-never-retain';
  if (mode === 'foreign-observation') { result.assertionCount = 1; result.observation = { kind: 'browser-case', values: [secret] }; }
  if (mode === 'extra-result-field') result.privateRaw = secret;
  if (mode === 'extra-environment-field') result.environment.privateRaw = secret;
  if (mode === 'private-reason') result.reason = secret;
  if (mode === 'foreign-run-id') result.id = '12121212-1212-4212-8212-121212121212';
  if (mode === 'private-event') process.send({ version: 1, type: 'event', nonce, seq: 1, event: { seq: 1, at: new Date().toISOString(), type: 'reset', message: secret } });
  if (mode === 'extra-teardown-field') process.send({ version: 1, type: 'teardown', nonce, event: {
    seq: 1, runId: request.id, elapsedMs: 0, monotonicNs: cleanupStartedNs, profileProbeCompletedMonotonicNs: cleanupStartedNs,
    profileState: 'not-created', phase: 'run', event: 'start', privateRaw: secret,
  } });
  process.send({ version: 1, type: 'terminal', nonce: mode === 'wrong-nonce' ? 'wrong' : nonce, receipt, attempts: 0, sealed: true }, () => {
    if (mode === 'late-close') setTimeout(() => process.disconnect(), 2150);
    else if (mode !== 'wrong-nonce') process.disconnect();
  });
});
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
