import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Server } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setImmediate as nextTurn } from 'node:timers/promises';

const task = dirname(dirname(fileURLToPath(import.meta.url)));
const root = join(task, 'baseline');
const output = join(task, 'regression-review', 'execution-v2');
const expected = {
  'src/adapter.ts': '2727f237d460b98d620d5e2620547305d6d6e4d6e1c3c093f56419b2d475ee60',
  'src/reducer.ts': 'cc2597b309f315750a1894b916784f0e859ff8156dcbeb563898d4be01a2193e',
  'src/oracle.ts': 'f69cf7d3585975ceaf289088c3b5ca9ffc5fa43a71ed4b4e3af88a14ac1fb4c7',
  'src/manifest.ts': '8a2de336c676db5ee1decfd74ea7299583282676ab6681c879931e7e8f6e8e14',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function verifySources() {
  const identities = {};
  for (const [local, wanted] of Object.entries(expected)) {
    identities[local] = sha(await readFile(join(root, local)));
    assert.equal(identities[local], wanted, `Preserved source identity: ${local}`);
  }
  return identities;
}
await assert.rejects(lstat(output), error => error.code === 'ENOENT', 'Never overwrite prior execution evidence');
await mkdir(output, { recursive: false });
const sourcesBefore = await verifySources();
const adapterPath = join(root, 'src', 'adapter.ts');
const require = createRequire(adapterPath);
const { chromium } = await import(pathToFileURL(join(dirname(require.resolve('playwright')), 'index.mjs')).href);
assert.equal(chromium, require('playwright').chromium, 'Guard the exact Playwright singleton loaded by the adapter');
const { runBrowser, harnessDigest } = await import(pathToFileURL(adapterPath).href);
const { createManifest, digest, validateManifest } = await import(pathToFileURL(join(root, 'src', 'manifest.ts')).href);
const { reduce } = await import(pathToFileURL(join(root, 'src', 'reducer.ts')).href);
const { ReproError } = await import(pathToFileURL(join(root, 'src', 'contracts.ts')).href);
const beforeLaunch = Object.getOwnPropertyDescriptor(chromium, 'launch');
const beforeListen = Object.getOwnPropertyDescriptor(Server.prototype, 'listen');
let launchCalls = 0;
let listenCalls = 0;
let adapterCalls = 0;
const launchGuard = async () => { launchCalls++; throw new Error('Forbidden browser launch reached by preflight diagnosis'); };
const listenGuard = function () { listenCalls++; throw new Error('Forbidden listener reached by preflight diagnosis'); };
const installGuard = (target, key, original, guard) => Object.defineProperty(target, key, { ...(original ?? { configurable: true, enumerable: false, writable: true }), value: guard });
const restore = (target, key, original) => {
  if (original) Object.defineProperty(target, key, original);
  else Reflect.deleteProperty(target, key);
};
installGuard(chromium, 'launch', beforeLaunch, launchGuard);
installGuard(Server.prototype, 'listen', beforeListen, listenGuard);
const harnessBefore = harnessDigest();
const original = createManifest();
const core = { ...structuredClone(original), actions: original.actions.filter(action => action.kind !== 'noise') };
const originalSnapshot = JSON.stringify(original);
const coreSnapshot = JSON.stringify(core);
const fullIds = core.actions.map(action => action.id);
assert.deepEqual(fullIds, ['navigate', 'search-alpha', 'search-beta']);
const cases = [
  { id: 'delete-navigate-closure', removed: ['navigate', 'search-alpha', 'search-beta'], remain: [] },
  { id: 'delete-alpha-closure', removed: ['search-alpha', 'search-beta'], remain: ['navigate'] },
  { id: 'delete-beta', removed: ['search-beta'], remain: ['navigate', 'search-alpha'] },
];
const records = [];
const actualRuns = [];
let resultStatus = 'failed';
let failure;
const startedAt = new Date().toISOString();
const missingSteps = 'MISSING_STEPS: The intended failure requires navigation and both ordered search requests; the proposed experiment is incomplete.';
const currentIdentityReason = 'Run evidence does not match the frozen input, assertion, application, or execution identity.';
const run = async (input, options) => {
  assert.equal(chromium.launch, launchGuard);
  assert.equal(Server.prototype.listen, listenGuard);
  const before = JSON.stringify(input);
  const result = await runBrowser(input, options);
  adapterCalls++;
  const entry = { index: adapterCalls, input: structuredClone(input), options: { artifactDir: options.artifactDir }, result: structuredClone(result) };
  actualRuns.push(entry);
  await writeFile(join(output, `actual-run-${adapterCalls}.json`), JSON.stringify(entry, null, 2) + '\n');
  assert.equal(JSON.stringify(input), before, 'Actual adapter must not mutate input');
  const returned = JSON.stringify(result);
  await nextTurn();
  await nextTurn();
  assert.equal(JSON.stringify(result), returned, 'Returned actual evidence remains settled');
  assert.equal(launchCalls, 0);
  assert.equal(listenCalls, 0);
  assert.equal(result.outcome, 'inconclusive');
  assert.equal(result.category, 'verification');
  assert.equal(result.reason, missingSteps);
  assert.equal(result.manifestDigest, digest(input));
  assert.equal(result.assertionDigest, original.assertionDigest);
  assert.equal(result.harnessDigest, harnessBefore);
  assert.equal(result.appRevision, input.app.revision);
  assert.equal(result.appDigest, '');
  assert.equal(result.adapterVersion, input.adapter.version);
  assert.equal(result.runnerVersion, input.runnerVersion);
  assert.equal(result.seed, input.environment.seed);
  assert.equal(result.assertionCount, 0);
  assert.equal(result.observation, null);
  assert.deepEqual(result.events, []);
  assert.equal(result.environment.browser, 'not-launched');
  assert.equal(result.artifacts.length, 1);
  assert.match(result.id, /^[a-f0-9-]{36}$/);
  const artifact = result.artifacts[0];
  assert.equal(artifact.path, `${result.id}/evidence.json`);
  const artifactPath = resolve(options.artifactDir, artifact.path);
  assert.equal(dirname(artifactPath), resolve(options.artifactDir, result.id));
  const metadata = await lstat(artifactPath);
  assert.equal(metadata.isSymbolicLink(), false);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.nlink, 1);
  const bytes = await readFile(artifactPath);
  assert.equal(metadata.size, bytes.length);
  assert.equal(artifact.bytes, bytes.length);
  assert.equal(artifact.sha256, sha(bytes));
  assert.deepEqual(await readdir(dirname(artifactPath)), ['evidence.json']);
  const persistedExpected = { ...result };
  Reflect.deleteProperty(persistedExpected, 'artifacts');
  assert.deepEqual(JSON.parse(bytes), persistedExpected);
  return result;
};

try {
  for (const scenario of cases) {
    const input = { ...structuredClone(core), actions: core.actions.filter(action => scenario.remain.includes(action.id)) };
    const snapshot = JSON.stringify(input);
    assert.deepEqual(validateManifest(input), input);
    assert.deepEqual(input.actions.flatMap(action => action.dependsOn).filter(id => !scenario.remain.includes(id)), []);
    assert.deepEqual(input.expectation, original.expectation);
    assert.equal(input.assertionDigest, original.assertionDigest);
    assert.deepEqual(input.responses, original.responses);
    assert.deepEqual(input.environment, original.environment);
    assert.deepEqual(input.app, original.app);
    const callsBefore = adapterCalls;
    const reduced = await reduce(input, run, { artifactDir: join(output, scenario.id), maxExecutions: 8, maxDurationMs: 5000, repetitions: 2 });
    await writeFile(join(output, `${scenario.id}.json`), JSON.stringify(reduced, null, 2) + '\n');
    assert.equal(adapterCalls - callsBefore, 1);
    assert.equal(JSON.stringify(input), snapshot);
    assert.equal(reduced.executions, 1);
    assert.equal(reduced.status, 'inconclusive');
    assert.equal(reduced.minimality, 'unverified');
    assert.deepEqual(reduced.manifest, input);
    assert.equal(reduced.trials.length, 1);
    assert.equal(reduced.trials[0].accepted, false);
    assert.equal(reduced.trials[0].outcome, 'inconclusive');
    assert.deepEqual(reduced.trials[0].removed, []);
    assert.deepEqual(reduced.trials[0].runIds, [reduced.baseline.id]);
    assert.equal(reduced.baseline.reason, missingSteps);
    assert.equal(reduced.trials[0].reason, currentIdentityReason, 'Record the unchanged conservative original reducer diagnostic');
    records.push({ id: scenario.id, removedFromCore: scenario.removed, remaining: scenario.remain, inputDigest: digest(input), structuralValidity: 'valid', adapterBoundary: 'incomplete', rawReason: reduced.baseline.reason, trialReason: reduced.trials[0].reason, reducerOutcome: 'inconclusive', minimality: 'unverified', actualRunId: reduced.baseline.id });
  }
  const invalid = { ...structuredClone(core), actions: core.actions.filter(action => action.id !== 'search-alpha') };
  let invalidError;
  const callsBefore = adapterCalls;
  await assert.rejects(reduce(invalid, run, { artifactDir: join(output, 'invalid-dependency'), maxExecutions: 8, maxDurationMs: 5000, repetitions: 2 }), error => {
    assert.ok(error instanceof ReproError);
    assert.equal(error.category, 'input');
    assert.equal(error.code, 'ACTION_DEPENDENCY');
    invalidError = { name: error.name, category: error.category, code: error.code, message: error.message };
    return true;
  });
  assert.equal(adapterCalls, callsBefore, 'Invalid dependency never reaches the adapter');
  records.push({ id: 'invalid-dangling-beta-dependency', structuralValidity: 'invalid', error: invalidError, actualAdapterCalls: 0 });
  assert.equal(adapterCalls, 3);
  assert.equal(new Set(actualRuns.map(item => item.result.id)).size, 3);
  assert.equal(JSON.stringify(original), originalSnapshot);
  assert.equal(JSON.stringify(core), coreSnapshot);
  assert.equal(harnessDigest(), harnessBefore);
  await verifySources();
  resultStatus = 'passed';
} catch (error) {
  failure = { name: error.name, message: error.message };
  throw error;
} finally {
  restore(chromium, 'launch', beforeLaunch);
  restore(Server.prototype, 'listen', beforeListen);
  assert.deepEqual(Object.getOwnPropertyDescriptor(chromium, 'launch'), beforeLaunch);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Server.prototype, 'listen'), beforeListen);
  const summary = { status: resultStatus, startedAt, finishedAt: new Date().toISOString(), sourcesBefore, sourcesAfter: await verifySources(), driverSha256: sha(await readFile(fileURLToPath(import.meta.url))), harnessDigest: harnessBefore, actualAdapterCalls: adapterCalls, browserLaunchCalls: launchCalls, listenerCalls: listenCalls, syntheticTargetFailureCalls: 0, caseCount: records.length, records, ...(failure ? { failure } : {}), claim: 'Actual nonbrowser adapter evidence and conservative reducer diagnosis only; no browser or executed frozen assertion; minimality remains unverified.' };
  await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ status: resultStatus, actualAdapterCalls: adapterCalls, browserLaunchCalls: launchCalls, listenerCalls: listenCalls, caseCount: records.length, summary: join(output, 'summary.json') }) + '\n');
}
