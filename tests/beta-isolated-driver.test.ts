import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCaseManifest, getRegisteredCase } from '../src/browser-case.js';
import { exportCapsule } from '../src/capsule.js';
import { digest, validateManifest } from '../src/manifest.js';
import { VERSION } from '../src/contracts.js';
import { createHash, randomUUID } from 'node:crypto';

const moduleUrl = pathToFileURL(resolve('scripts/verify-beta-isolated.mjs')).href;
const driver = await import(moduleUrl);
const policy = await readFile('security/repro-chromium-seccomp.json');

test('isolated driver requires exact explicit policy approval before any Docker operation', () => {
  assert.throws(() => driver.assertPolicyApproval({}, policy), /BETA_POLICY_APPROVAL/);
  assert.throws(() => driver.assertPolicyApproval({ REPRO_APPROVED_BETA_POLICY_SHA256: 'f'.repeat(64) }, policy), /BETA_POLICY_APPROVAL/);
  assert.throws(() => driver.assertPolicyApproval({ REPRO_APPROVED_BETA_POLICY_SHA256: driver.POLICY_SHA256 }, Buffer.concat([policy, Buffer.from('\n')])), /BETA_POLICY_BYTES/);
  assert.doesNotThrow(() => driver.assertPolicyApproval({ REPRO_APPROVED_BETA_POLICY_SHA256: driver.POLICY_SHA256 }, policy));
});

test('container plan preserves the approved resource and security boundary without host access', () => {
  const args = driver.containerArguments({ name: 'repro-beta-test', owner: 'test', volume: 'repro-beta-data-test', image: `sha256:${'a'.repeat(64)}`, policyPath: '/reviewed/policy.json', worker: 'reviewed worker', operation: { name: 'readable-buggy', revision: 'buggy', kind: 'readable', watchdogMs: 40000, expectedExit: 1, maximumMs: 30000 } });
  for (const [flag, value] of [['--user', 'node'], ['--network', 'none'], ['--cap-drop', 'ALL'], ['--pids-limit', '128'], ['--memory', '1g'], ['--cpus', '2'], ['--shm-size', '256m'], ['--cgroupns', 'private']]) assert.equal(args[args.indexOf(flag) + 1], value);
  assert.ok(args.includes('--read-only'));
  assert.ok(args.includes('no-new-privileges'));
  assert.ok(args.includes('seccomp=/reviewed/policy.json'));
  assert.ok(args.includes('type=volume,source=repro-beta-data-test,target=/work/.repro-runs'));
  assert.ok(args.includes('/tmp:rw,nosuid,size=256m'));
  assert.ok(!args.some((value: string) => /^(--privileged|--pid|--publish|--volume|--device|--cap-add|--network=host)$/.test(value)));
  assert.ok(!args.some((value: string) => /type=bind|docker\.sock|--no-sandbox/.test(value)));
});

function receipt() {
  return { schemaVersion: 1, operation: 'readable-buggy', command: { exitCode: 1, exitSignal: null, launchFailed: false }, durationMs: 1500, stopReason: null, measurementErrors: [], logsTruncated: false, memory: { before: { peakBytes: 1000000, maxBytes: 1073741824, pidsMax: 128, cpuMax: '200000 100000', events: { oom: 0, oom_kill: 0 }, pidsEvents: { max: 0 } }, after: { peakBytes: 50000000, maxBytes: 1073741824, pidsMax: 128, cpuMax: '200000 100000', events: { oom: 0, oom_kill: 0 }, pidsEvents: { max: 0 } } }, cleanup: { initial: { elapsedMs: 0, owned: [] }, first: { elapsedMs: 1501, owned: [] }, terminal: { elapsedMs: 6502, owned: [] }, commandExitedAtMs: 1500, firstTemporaryFiles: [], firstProfiles: [], firstInventoryAtMs: 1505, temporaryFiles: [], profiles: [], terminalInventoryAtMs: 6505 } };
}

test('kernel and cleanup gates reject missing, forced, over-budget and infrastructure evidence', () => {
  const operation = { name: 'readable-buggy', expectedExit: 1, maximumMs: 30000 };
  assert.deepEqual(driver.receiptProblems(receipt(), operation), []);
  const mutations = [
    (r: ReturnType<typeof receipt>) => { r.memory.after.events.oom_kill = 1; },
    (r: ReturnType<typeof receipt>) => { r.memory.after.pidsEvents.max = 1; },
    (r: ReturnType<typeof receipt>) => { r.memory.after.peakBytes = 0; },
    (r: ReturnType<typeof receipt>) => { r.memory.after.maxBytes = 2 * 1073741824; },
    (r: ReturnType<typeof receipt>) => { r.cleanup.terminal.elapsedMs = 2000; },
    (r: ReturnType<typeof receipt>) => { r.durationMs = 30001; },
    (r: ReturnType<typeof receipt>) => { r.command.exitCode = 2; },
    (r: ReturnType<typeof receipt>) => { r.logsTruncated = true; },
  ];
  for (const mutate of mutations) { const value = receipt(); mutate(value); assert.ok(driver.receiptProblems(value, operation).length > 0); }
  const timeout = { ...receipt(), stopReason: 'timeout' }; assert.ok(driver.receiptProblems(timeout, operation).length > 0);
  const survivor = receipt(); Object.assign(survivor.cleanup.terminal, { owned: [{ pid: 10, ppid: 1, pgid: 10, startTicks: 100 }] });
  assert.ok(driver.receiptProblems(survivor, operation).includes('OWNED_SURVIVORS'));
});

test('all four isolated workflow operations precede alternating conventional regression tests', () => {
  const plan = driver.operationPlan(20);
  assert.deepEqual(plan.workflow.map((item: { name: string }) => item.name), ['capture', 'replay', 'reduce', 'export']);
  assert.deepEqual(plan.workflow.map((item: { maximumMs: number }) => item.maximumMs), [30000, 30000, 300000, 15000]);
  assert.equal(plan.stability.length, 40);
  assert.deepEqual(plan.stability.map((item: { revision: string }) => item.revision), Array.from({ length: 40 }, (_, i) => i % 2 ? 'fixed' : 'buggy'));
  assert.equal(driver.operationPlan(1).acceptanceEligible, false);
  assert.equal(plan.acceptanceEligible, true);
  assert.throws(() => driver.operationPlan(0));
});

test('observer source is valid Node syntax and measures actual cgroup files without command-line collection', () => {
  const source = driver.workerSource();
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  for (const file of ['memory.peak', 'memory.events', 'pids.events', 'cpu.max']) assert.ok(source.includes(file));
  assert.ok(!source.includes('/cmdline'));
  assert.ok(!source.includes('/environ'));
  assert.ok(source.includes('TARGET_ASSERTION') === false, 'Observer must not fabricate the target assertion result');
});

test('buggy test exit is insufficient without the exact frozen observation and assertion identity', () => {
  const manifest = { assertionDigest: 'assertion', adapter: { version: 'adapter' }, runnerVersion: 'runner', environment: { seed: 1 } };
  const trusted = { digest: () => 'manifest', revisionDigest: () => 'source', experimentHarnessDigest: () => 'harness', evaluateObservation: (_: unknown, observation: unknown) => observation === 'approved-failure' ? 'target-failure' : 'requirement-satisfied' };
  const result = { id: 'one', manifestDigest: 'manifest', assertionDigest: 'assertion', harnessDigest: 'harness', appRevision: 'buggy', appDigest: 'source', adapterVersion: 'adapter', runnerVersion: 'runner', seed: 1, assertionCount: 1, outcome: 'target-failure', category: 'target-failure', observation: 'approved-failure' };
  assert.deepEqual(driver.runEvidenceProblems(manifest, result, 'buggy', trusted), []);
  for (const difference of [{ assertionCount: 0 }, { assertionDigest: 'other' }, { observation: 'wrong' }, { category: 'environment' }, { outcome: 'inconclusive' }, { harnessDigest: 'other' }]) assert.ok(driver.runEvidenceProblems(manifest, { ...result, ...difference }, 'buggy', trusted).length > 0);
});

test('CLI and readable harness identities independently bind their actual distinct shipped entrypoints', () => {
  const manifest = createCaseManifest('morphdom-textarea');
  const definition = getRegisteredCase(manifest.caseId);
  const trusted = { digest, getRegisteredCase, VERSION };
  const bytes = Buffer.from('the CLI artifact');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(driver.harnessForArtifact(manifest, bytes, trusted), digest({ executable: sha256, oracleExecutable: sha256, contract: definition.contractDigest, wrapper: definition.wrapperDigest, version: VERSION }));
  assert.notEqual(driver.harnessForArtifact(manifest, bytes, trusted), driver.harnessForArtifact(manifest, Buffer.from('the index artifact'), trusted));
});

test('a late clean terminal census cannot erase a survivor present past the cleanup deadline', () => {
  const value = receipt();
  Object.assign(value.cleanup.first, { owned: [{ pid: 5 }] });
  Object.assign(value.cleanup.terminal, { elapsedMs: 7500 });
  Object.assign(value, { processes: { samples: [{ elapsedMs: 6400, owned: [{ pid: 5 }] }, { elapsedMs: 7000, owned: [] }] } });
  assert.ok(driver.receiptProblems(value, { name: 'readable-buggy', expectedExit: 1, maximumMs: 30000 }).includes('CLEANUP_CUTOFF_UNVERIFIED'));
});

test('late disappearance of profile and temporary files cannot pass the earlier cleanup cutoff', () => {
  const value = receipt();
  Object.assign(value.cleanup, { firstProfiles: [{ path: 'run/.profile' }], firstTemporaryFiles: [{ path: 'chromium-temp' }] });
  assert.ok(driver.receiptProblems(value, { name: 'readable-buggy', expectedExit: 1, maximumMs: 30000 }).includes('FILE_CLEANUP_CUTOFF_UNVERIFIED'));
});

test('prepare copies only the validated real capsule format and never needs Docker approval or execution', async () => {
  const root = `.repro-runs/beta-isolated-unit-${randomUUID()}`;
  const capsule = `${root}/capsule`;
  await exportCapsule(createCaseManifest('morphdom-textarea'), capsule);
  const result = await driver.verifyIsolated({ capsule, output: `${root}/prepared`, repetitions: 1, prepare: true });
  assert.equal(result.status, 'prepared-not-executed'); assert.equal(result.acceptance, false);
  const prepared = JSON.parse(await readFile(`${root}/prepared/plan.json`, 'utf8'));
  assert.equal(prepared.caseId, 'morphdom-textarea');
  assert.equal(prepared.context.files.some((file: { path: string }) => file.path === 'integrity.json'), true);
  assert.equal(validateManifest(JSON.parse(await readFile(`${root}/prepared/input-context/manifest.json`, 'utf8'))).assertionDigest, createCaseManifest('morphdom-textarea').assertionDigest);
});
