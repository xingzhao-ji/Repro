import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { Server } from 'node:http';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { chromium } from 'playwright';
import { harnessDigest, runBrowser } from '../src/adapter.js';
import type { Manifest, RunResult } from '../src/contracts.js';
import { createManifest, digest, validateManifest } from '../src/manifest.js';

const schemaBytes = await readFile(new URL('../schemas/run-result-v1.schema.json', import.meta.url));
const schemaValid = new Ajv2020({ strict: true, allErrors: true }).compile<RunResult>(JSON.parse(schemaBytes.toString()));
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const evidenceRoot = resolve(process.env['REPRO_SCHEMA_PREFLIGHT_EVIDENCE_DIR'] ?? '.repro-runs/schema-preflight-tests');
const save = async (path: string, value: unknown): Promise<void> => writeFile(path, JSON.stringify(value, null, 2) + '\n');

async function actualPreflight(manifest: Manifest, preCancelled: boolean, label: string): Promise<{ result: RunResult; directory: string }> {
  assert.deepEqual(validateManifest(manifest), manifest);
  const inputSnapshot = structuredClone(manifest);
  const originalHarnessDigest = harnessDigest();
  await mkdir(evidenceRoot, { recursive: true });
  const directory = await mkdtemp(join(evidenceRoot, `${label}-`));
  await save(join(directory, 'manifest.json'), manifest);
  const launchDescriptor = Object.getOwnPropertyDescriptor(chromium, 'launch');
  const listenDescriptor = Object.getOwnPropertyDescriptor(Server.prototype, 'listen');
  const originalLaunch = chromium.launch;
  const originalListen = Server.prototype.listen;
  let launchCalls = 0;
  let listenCalls = 0;
  const forbiddenLaunch = (): never => { launchCalls++; throw new Error('FORBIDDEN_BROWSER_LAUNCH'); };
  const forbiddenListen = (): never => { listenCalls++; throw new Error('FORBIDDEN_HTTP_LISTEN'); };
  Object.defineProperty(chromium, 'launch', { configurable: true, writable: true, value: forbiddenLaunch });
  Object.defineProperty(Server.prototype, 'listen', { configurable: true, writable: true, value: forbiddenListen });
  try {
    assert.equal(chromium.launch, forbiddenLaunch);
    assert.equal(Server.prototype.listen, forbiddenListen);
    const controller = new AbortController();
    if (preCancelled) controller.abort();
    const observedEvents: unknown[] = [];
    const artifactDir = join(directory, 'artifacts');
    const result = await runBrowser(manifest, { artifactDir, signal: controller.signal, onEvent: event => observedEvents.push(structuredClone(event)) });
    await save(join(directory, 'result.json'), result);
    const finalized = structuredClone(result);
    await nextTurn();
    await nextTurn();
    assert.deepEqual(result, finalized, 'The returned preflight result stays finalized.');
    assert.deepEqual(manifest, inputSnapshot, 'The caller input is unchanged.');
    assert.equal(result.outcome, preCancelled ? 'cancelled' : 'inconclusive');
    assert.equal(result.category, preCancelled ? 'cancelled' : 'verification');
    assert.match(result.reason, preCancelled ? /^CANCELLED:/ : /^MISSING_STEPS:/);
    assert.equal(result.appDigest, '');
    assert.equal(result.assertionCount, 0);
    assert.equal(result.observation, null);
    assert.deepEqual(result.events, []);
    assert.deepEqual(observedEvents, []);
    assert.equal(result.environment.browser, 'not-launched');
    assert.equal(result.manifestDigest, digest(manifest));
    assert.equal(result.assertionDigest, manifest.assertionDigest);
    assert.equal(result.harnessDigest, originalHarnessDigest);
    assert.equal(result.artifacts.length, preCancelled ? 0 : 1);
    for (const artifact of result.artifacts) {
      assert.equal(artifact.path, `${result.id}/evidence.json`);
      const bytes = await readFile(join(artifactDir, artifact.path));
      assert.equal(bytes.length, artifact.bytes);
      assert.equal(sha256(bytes), artifact.sha256);
      const { artifacts: _artifacts, ...withoutArtifacts } = result;
      assert.deepEqual(JSON.parse(bytes.toString()), withoutArtifacts);
    }
    return { result, directory };
  } finally {
    if (launchDescriptor) Object.defineProperty(chromium, 'launch', launchDescriptor);
    else assert.equal(Reflect.deleteProperty(chromium, 'launch'), true);
    if (listenDescriptor) Object.defineProperty(Server.prototype, 'listen', listenDescriptor);
    else assert.equal(Reflect.deleteProperty(Server.prototype, 'listen'), true);
    assert.equal(chromium.launch, originalLaunch);
    assert.equal(Server.prototype.listen, originalListen);
    assert.deepEqual(Object.getOwnPropertyDescriptor(chromium, 'launch'), launchDescriptor);
    assert.deepEqual(Object.getOwnPropertyDescriptor(Server.prototype, 'listen'), listenDescriptor);
    assert.equal(harnessDigest(), originalHarnessDigest);
    await save(join(directory, 'guards.json'), { launchCalls, listenCalls, exactDescriptorsRestored: true, harnessDigestUnchanged: true });
    assert.equal(launchCalls, 0, 'No browser launch was attempted.');
    assert.equal(listenCalls, 0, 'No HTTP listener was attempted.');
  }
}

const preflightCases = [
  { label: 'remove-navigate', retained: [], preCancelled: false },
  { label: 'remove-search-alpha', retained: ['navigate'], preCancelled: false },
  { label: 'remove-search-beta', retained: ['navigate', 'search-alpha'], preCancelled: false },
  { label: 'pre-cancelled-core', retained: ['navigate', 'search-alpha', 'search-beta'], preCancelled: true },
];
for (const scenario of preflightCases) {
  test(`run schema represents actual guarded adapter preflight: ${scenario.label}`, async () => {
    const manifest = createManifest();
    manifest.actions = manifest.actions.filter(action => action.kind !== 'noise');
    assert.deepEqual(manifest.actions.map(action => action.id), ['navigate', 'search-alpha', 'search-beta']);
    manifest.actions = manifest.actions.filter(action => scenario.retained.includes(action.id));
    assert.deepEqual(manifest.actions.map(action => action.id), scenario.retained);
    const { result, directory } = await actualPreflight(manifest, scenario.preCancelled, scenario.label);
    const valid = schemaValid(result);
    await save(join(directory, 'schema-validation.json'), { schemaSha256: sha256(schemaBytes), valid, errors: schemaValid.errors });
    assert.equal(valid, true, JSON.stringify(schemaValid.errors));
  });
}

function structuralRun(outcome: RunResult['outcome']): RunResult {
  const manifest = createManifest();
  // Structural controls only; this value is not evidence of browser execution.
  return {
    id: 'schema-control', outcome, reason: 'Synthetic structural control; no application executed.',
    manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest, harnessDigest: 'a'.repeat(64),
    appRevision: 'buggy', appDigest: manifest.app.sourceDigest, adapterVersion: manifest.adapter.version, runnerVersion: manifest.runnerVersion,
    seed: manifest.environment.seed, startedAt: '2026-01-01T00:00:00.000Z', durationMs: 0, assertionCount: 1,
    observation: { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] }, events: [], artifacts: [],
    environment: { platform: 'schema-test', node: process.version, browser: 'not-executed', isolation: 'Structural test only.' },
  };
}

test('run schema represents unknown application identity only for unstarted inconclusive or cancelled shapes', () => {
  for (const outcome of ['inconclusive', 'cancelled'] as const) {
    for (const harnessDigest of ['', 'a'.repeat(64)]) {
      const run = { ...structuralRun(outcome), appDigest: '', assertionCount: 0, observation: null, harnessDigest };
      assert.equal(schemaValid(run), true, JSON.stringify(schemaValid.errors));
    }
  }
});

test('run schema rejects unknown application identity for both conclusive outcomes', () => {
  for (const outcome of ['target-failure', 'requirement-satisfied'] as const) {
    assert.equal(schemaValid({ ...structuralRun(outcome), appDigest: '' }), false, outcome);
  }
});

test('run schema rejects blank application identity with any assertion or observation', () => {
  for (const outcome of ['inconclusive', 'cancelled'] as const) {
    const run = { ...structuralRun(outcome), appDigest: '', assertionCount: 0, observation: null };
    for (const patch of [{ assertionCount: 1 }, { observation: structuralRun(outcome).observation }]) {
      assert.equal(schemaValid({ ...run, ...patch }), false, JSON.stringify({ outcome, patch }));
    }
  }
});

test('run schema rejects malformed nonempty application digests for every outcome', () => {
  for (const outcome of ['target-failure', 'requirement-satisfied', 'inconclusive', 'cancelled'] as const) {
    const run = structuralRun(outcome);
    if (outcome === 'inconclusive' || outcome === 'cancelled') Object.assign(run, { assertionCount: 0, observation: null });
    for (const appDigest of ['a', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), ' '.repeat(64), null, 0]) {
      assert.equal(schemaValid({ ...run, appDigest }), false, JSON.stringify({ outcome, appDigest }));
    }
  }
});

test('run schema retains conclusive assertion, harness and observation requirements', () => {
  for (const outcome of ['target-failure', 'requirement-satisfied'] as const) {
    const run = structuralRun(outcome);
    assert.equal(schemaValid(run), true, JSON.stringify(schemaValid.errors));
    for (const patch of [{ assertionCount: 0 }, { harnessDigest: '' }, { observation: null }]) {
      assert.equal(schemaValid({ ...run, ...patch }), false, JSON.stringify({ outcome, patch }));
    }
  }
});
