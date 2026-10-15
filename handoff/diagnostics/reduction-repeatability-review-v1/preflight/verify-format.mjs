import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { Server } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setImmediate as nextTurn } from 'node:timers/promises';

const root = dirname(new URL(import.meta.url).pathname);
const planBytes = readFileSync(join(root, 'plan.json'));
const plan = JSON.parse(planBytes);
const format = plan.formats.find(item => item.id === process.argv[2]);
assert.ok(format, 'Exactly one declared format is required');
assert.equal(process.cwd(), plan.repo);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const save = (file, value) => writeFileSync(file, json(value), { flag: 'wx', mode: 0o600 });
function verifyInputs() {
  for (const input of plan.inputs) {
    const bytes = readFileSync(resolve(plan.repo, input.path));
    assert.equal(bytes.length, input.bytes, input.path);
    assert.equal(sha(bytes), input.sha256, input.path);
  }
}
verifyInputs();
const formatRoot = join(root, 'formats', format.id);
mkdirSync(formatRoot, { recursive: true, mode: 0o700 });
const adapterPath = resolve(plan.repo, format.adapter);
const manifestPath = resolve(plan.repo, format.manifest);
const adapter = await import(pathToFileURL(adapterPath).href);
const manifests = await import(pathToFileURL(manifestPath).href);
const requireHere = createRequire(pathToFileURL(adapterPath));
const playwrightRequireEntry = requireHere.resolve('playwright');
const chromium = requireHere('playwright').chromium;
const packageRoot = dirname(playwrightRequireEntry);
const playwrightImportEntry = join(packageRoot, 'index.mjs');
const importedPlaywright = await import(pathToFileURL(playwrightImportEntry).href);
assert.equal(chromium, importedPlaywright.chromium, 'ESM import and require resolve the identical chromium singleton used by this adapter');
assert.deepEqual(manifests.createManifest().actions.filter(action => action.kind !== 'noise'), plan.coreManifest.actions);
const currentCore = manifests.createManifest();
currentCore.actions = currentCore.actions.filter(action => action.kind !== 'noise');
assert.deepEqual(currentCore, plan.coreManifest, 'Retained reduced input equals current createManifest core');
assert.equal(manifests.digest(currentCore), plan.retainedReduction.coreManifestDigest);
const harnessDigest = adapter.harnessDigest();
assert.match(harnessDigest, /^[a-f0-9]{64}$/);

let launchCalls = 0;
let listenCalls = 0;
const launchDescriptor = Object.getOwnPropertyDescriptor(chromium, 'launch');
const originalLaunch = chromium.launch;
const listenDescriptor = Object.getOwnPropertyDescriptor(Server.prototype, 'listen');
const originalListen = Server.prototype.listen;
const launchSentinel = () => { launchCalls++; throw new Error('FORBIDDEN_BROWSER_LAUNCH'); };
const listenSentinel = () => { listenCalls++; throw new Error('FORBIDDEN_HTTP_LISTEN'); };
Object.defineProperty(chromium, 'launch', { configurable: true, writable: true, value: launchSentinel });
Object.defineProperty(Server.prototype, 'listen', { ...listenDescriptor, value: listenSentinel });
assert.equal(importedPlaywright.chromium.launch, launchSentinel);

const records = [];
const caseSummaries = [];
const runIds = new Set();
let restored = false;
let failure;
const startedAt = new Date().toISOString();
function normalizeEvidence(result) {
  const normalized = structuredClone(result);
  normalized.id = '<RUN_ID>';
  normalized.startedAt = '<TIMESTAMP>';
  normalized.durationMs = '<DURATION>';
  normalized.events = normalized.events.map(event => ({ ...event, at: '<TIMESTAMP>' }));
  return normalized;
}
function fileInventory(directory) {
  const found = [];
  try { lstatSync(directory); } catch (error) { if (error.code === 'ENOENT') return found; throw error; }
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false, path);
    if (stat.isDirectory()) found.push(...fileInventory(path));
    else { assert.ok(stat.isFile() && stat.nlink === 1, path); found.push(path); }
  }
  return found.sort();
}
try {
  for (const testCase of plan.cases) {
    let reference;
    const caseRecords = [];
    for (let repetition = 1; repetition <= plan.executionPolicy.repetitions; repetition++) {
      assert.equal(chromium.launch, launchSentinel);
      assert.equal(Server.prototype.listen, listenSentinel);
      const manifest = structuredClone(testCase.manifest);
      assert.equal(manifests.digest(manifest), testCase.manifestDigest);
      const inputSnapshot = json(manifest);
      if (testCase.kind === 'final-dependency-group-neighbor' || testCase.kind === 'missing-step-control') manifests.validateManifest(manifest);
      const runRoot = join(formatRoot, testCase.id, `run-${String(repetition).padStart(3, '0')}`);
      mkdirSync(runRoot, { recursive: true, mode: 0o700 });
      const artifactDir = join(runRoot, 'adapter-artifacts');
      const controller = new AbortController();
      if (testCase.preCancelled) controller.abort();
      const observedEvents = [];
      const result = await adapter.runBrowser(manifest, { artifactDir, signal: controller.signal, onEvent: event => observedEvents.push(structuredClone(event)) });
      const finalizedSnapshot = json(result);
      await nextTurn();
      await nextTurn();
      assert.equal(json(result), finalizedSnapshot, 'Result does not mutate after finalization');
      assert.equal(json(manifest), inputSnapshot, 'Caller input remains unchanged');
      assert.equal(launchCalls, 0);
      assert.equal(listenCalls, 0);
      assert.equal(result.outcome, testCase.expected.outcome);
      assert.equal(result.category, testCase.expected.category);
      assert.equal(result.reason.split(':')[0], testCase.expected.code);
      assert.equal(result.assertionCount, 0);
      assert.equal(result.observation, null);
      assert.deepEqual(result.events, []);
      assert.deepEqual(observedEvents, []);
      assert.equal(result.environment.browser, 'not-launched');
      assert.equal(result.appDigest, '', 'No application execution identity is fabricated by a preflight rejection');
      assert.equal(result.appRevision, testCase.manifest.app.revision);
      assert.equal(result.manifestDigest, testCase.manifestDigest);
      assert.equal(result.assertionDigest, plan.coreManifest.assertionDigest);
      assert.equal(result.harnessDigest, harnessDigest);
      assert.equal(result.adapterVersion, plan.coreManifest.adapter.version);
      assert.equal(result.runnerVersion, plan.coreManifest.runnerVersion);
      assert.equal(result.seed, testCase.manifest.environment.seed);
      assert.match(result.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.ok(!runIds.has(result.id)); runIds.add(result.id);
      assert.ok(Number.isFinite(Date.parse(result.startedAt)));
      assert.ok(Number.isSafeInteger(result.durationMs) && result.durationMs >= 0);
      assert.equal(result.artifacts.length, testCase.preCancelled ? 0 : 1);
      const normalized = normalizeEvidence(result);
      const verifiedArtifacts = [];
      normalized.artifacts = [];
      for (const artifact of result.artifacts) {
        assert.equal(artifact.path, `${result.id}/evidence.json`);
        const artifactPath = resolve(artifactDir, artifact.path);
        assert.ok(artifactPath.startsWith(artifactDir + sep));
        assert.equal(realpathSync(artifactPath), artifactPath);
        const stat = lstatSync(artifactPath);
        assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
        const bytes = readFileSync(artifactPath);
        assert.equal(bytes.length, artifact.bytes);
        assert.equal(sha(bytes), artifact.sha256);
        const persisted = JSON.parse(bytes);
        const { artifacts: omitted, ...withoutArtifacts } = result;
        assert.deepEqual(persisted, withoutArtifacts, 'Persisted evidence equals the actual returned result');
        const normalizedBytes = Buffer.from(json(normalizeEvidence(persisted)));
        const normalizedArtifact = { path: '<RUN_ID>/evidence.json', sha256: sha(normalizedBytes), bytes: normalizedBytes.length };
        normalized.artifacts.push(normalizedArtifact);
        verifiedArtifacts.push({ path: relative(root, artifactPath), sha256: artifact.sha256, bytes: artifact.bytes, normalized: normalizedArtifact });
      }
      assert.deepEqual(fileInventory(artifactDir), result.artifacts.map(artifact => resolve(artifactDir, artifact.path)).sort(), 'Only declared evidence artifacts exist');
      if (reference === undefined) reference = normalized;
      else assert.deepEqual(normalized, reference, 'Complete normalized outcomes and artifact contents repeat exactly');
      save(join(runRoot, 'result.json'), result);
      const record = { caseId: testCase.id, repetition, runId: result.id, outcome: result.outcome, category: result.category, reason: result.reason, manifestDigest: result.manifestDigest, harnessDigest, normalizedSha256: sha(json(normalized)), launchCalls, listenCalls, artifacts: verifiedArtifacts, resultPath: relative(root, join(runRoot, 'result.json')), resultSha256: sha(readFileSync(join(runRoot, 'result.json'))) };
      records.push(record); caseRecords.push(record);
    }
    caseSummaries.push({ caseId: testCase.id, kind: testCase.kind, executions: caseRecords.length, normalizedResult: reference, normalizedSha256: caseRecords[0].normalizedSha256, distinctRunIds: new Set(caseRecords.map(item => item.runId)).size, artifactsVerified: caseRecords.reduce((n, item) => n + item.artifacts.length, 0) });
  }
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack };
} finally {
  if (launchDescriptor) Object.defineProperty(chromium, 'launch', launchDescriptor); else delete chromium.launch;
  Object.defineProperty(Server.prototype, 'listen', listenDescriptor);
  assert.equal(chromium.launch, originalLaunch);
  assert.equal(Server.prototype.listen, originalListen);
  restored = true;
}
verifyInputs();
assert.equal(adapter.harnessDigest(), harnessDigest, 'Instrumentation did not change harness identity');
save(join(formatRoot, 'records.json'), records);
const summary = { format: format.id, status: failure ? 'FAIL' : 'PASS: nonbrowser preflight repeatability only', startedAt, finishedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, pid: process.pid, planSha256: sha(planBytes), actualModule: { path: format.adapter, sha256: sha(readFileSync(adapterPath)), harnessDigest }, playwrightSingleton: { importEntry: playwrightImportEntry, requireEntry: playwrightRequireEntry, identical: true }, launchCalls, listenCalls, exactOriginalDescriptorsRestored: restored, sourceInputsUnchanged: true, completedExecutions: records.length, artifactsVerified: records.reduce((n, item) => n + item.artifacts.length, 0), cases: caseSummaries, ...(failure ? { failure } : {}) };
save(join(formatRoot, 'summary.json'), summary);
console.log(JSON.stringify({ format: format.id, status: summary.status, completedExecutions: summary.completedExecutions, artifactsVerified: summary.artifactsVerified, launchCalls, listenCalls, harnessDigest, ...(failure ? { failure } : {}) }));
if (failure) process.exitCode = 1;
