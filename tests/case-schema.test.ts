import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ts from 'typescript';
import { createCaseManifest, evaluateCaseObservation, getRegisteredCase } from '../src/browser-case.js';
import { VERSION, type ManifestV3, type RunResult } from '../src/contracts.js';
import { digest, validateManifest } from '../src/manifest.js';

type Schema = { properties?: Record<string, Schema>; required?: string[]; $defs?: Record<string, Schema>; [key: string]: unknown };
async function schemas() {
  const manifest = JSON.parse(await readFile(new URL('../schemas/manifest-v3.schema.json', import.meta.url), 'utf8')) as Schema;
  const result = JSON.parse(await readFile(new URL('../schemas/run-result-v2.schema.json', import.meta.url), 'utf8')) as Schema;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  return { manifest, result, manifestValid: ajv.compile<ManifestV3>(manifest), resultValid: ajv.compile<RunResult>(result) };
}
const ids = ['morphdom-textarea', 'htmx-checkbox', 'marked-empty-heading'];
function structuralRun(id = 'morphdom-textarea'): RunResult {
  const manifest = createCaseManifest(id);
  return {
    id: 'case-schema-shape', outcome: 'target-failure', category: 'target-failure', reason: 'Structural test value; no browser executed.',
    manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest, harnessDigest: 'a'.repeat(64),
    appRevision: 'buggy', appDigest: manifest.app.sourceDigest, adapterVersion: VERSION, runnerVersion: VERSION,
    seed: manifest.environment.seed, startedAt: '2026-01-01T00:00:00.000Z', durationMs: 1, assertionCount: 1,
    observation: { kind: 'browser-case', values: getRegisteredCase(id).intendedFailures[0]! },
    events: [{ seq: 1, at: '2026-01-01T00:00:00.000Z', type: 'assertion', message: 'Structural test event.' }],
    artifacts: [{ path: 'case-schema-shape/evidence.json', sha256: 'b'.repeat(64), bytes: 42 }],
    environment: { platform: 'schema-test', node: process.version, browser: 'not-executed', isolation: 'Structural schema test only.' },
  };
}

test('current case schemas compile strictly offline and accept all three registered manifests and revisions', async () => {
  const { manifestValid, resultValid, manifest, result } = await schemas();
  function localReferences(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === '$ref') assert.match(String(entry), /^#\//, 'Schema references must not fetch external content.');
      else localReferences(entry);
    }
  }
  localReferences(manifest); localReferences(result);
  for (const id of ids) {
    for (const revision of ['buggy', 'fixed'] as const) {
      const candidate = createCaseManifest(id);
      candidate.app = { revision, repository: candidate.app.repository, ...getRegisteredCase(id).revisions[revision] };
      assert.equal(manifestValid(candidate), true, JSON.stringify(manifestValid.errors));
      assert.deepEqual(validateManifest(candidate), candidate);
    }
    assert.equal(resultValid(structuralRun(id)), true, JSON.stringify(resultValid.errors));
  }
});

test('case schema fields track the actual TypeScript interface inventories', async () => {
  const { manifest, result } = await schemas();
  const source = ts.createSourceFile('contracts.ts', await readFile(new URL('../src/contracts.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  for (const [name, schema] of [
    ['ManifestV3', manifest], ['BrowserCaseAction', manifest.$defs?.action],
    ['BrowserCaseExpectation', manifest.properties?.expectation],
    ['BrowserCaseObservation', result.$defs?.browserCaseObservation], ['RunResult', result],
  ] as const) {
    const declaration = source.statements.find(statement => ts.isInterfaceDeclaration(statement) && statement.name.text === name);
    assert.ok(declaration && ts.isInterfaceDeclaration(declaration)); assert.ok(schema);
    const members = declaration.members.filter(ts.isPropertySignature);
    assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), members.map(member => member.name.getText(source)).sort(), `${name} fields`);
    assert.deepEqual((schema.required ?? []).toSorted(), members.filter(member => !member.questionToken).map(member => member.name.getText(source)).sort(), `${name} required fields`);
  }
});

test('case schema rejects missing fields and undeclared secret fields at every object boundary', async () => {
  const { manifestValid } = await schemas();
  const original = createCaseManifest('marked-empty-heading');
  for (const key of Object.keys(original)) {
    const candidate = structuredClone(original) as unknown as Record<string, unknown>;
    delete candidate[key]; assert.equal(manifestValid(candidate), false, key);
  }
  for (const path of [[], ['adapter'], ['expectation'], ['expectation', 'checks', 0], ['expectationSource'], ['actions', 0], ['environment'], ['environment', 'viewport'], ['boundary'], ['app']]) {
    const candidate = structuredClone(original);
    let object: unknown = candidate;
    for (const segment of path) object = (object as Record<string | number, unknown>)[segment];
    (object as Record<string, unknown>)['authorization'] = 'Bearer schema-privacy-sentinel';
    assert.equal(manifestValid(candidate), false, path.join('.') || 'root');
  }
});

test('case schema rejects malformed DOM contracts, executable actions, source provenance and resource bounds', async () => {
  const { manifestValid } = await schemas();
  const mutations: ((value: ManifestV3) => void)[] = [
    value => { value.expectation.checks = []; },
    value => { Object.assign(value.expectation.checks[0]!, { property: 'outerHTML' }); },
    value => { Object.assign(value.actions[0]!, { kind: 'execute-script' }); },
    value => { value.actions[0]!.target = 'https://outside.invalid/'; },
    value => { value.actions[0]!.value = 'ignored navigation payload'; },
    value => { value.actions[1]!.dependsOn = ['open', 'open']; },
    value => { value.expectationSource.contractUrls = []; },
    value => { value.expectationSource.contractUrls = ['javascript:alert(1)']; },
    value => { value.app.repository = 'file:///private/source'; },
    value => { value.app.commit = 'branch-main'; },
    value => { value.app.sourceDigest = 'not-a-hash'; },
    value => { value.environment.timeoutMs = 60_001; },
    value => { value.environment.seed = -1; },
    value => { value.environment.viewport.width = 4097; },
    value => { Object.assign(value, { responses: [{ secret: 'not supported' }] }); },
  ];
  for (const mutate of mutations) {
    const value = createCaseManifest('marked-empty-heading'); mutate(value);
    assert.equal(manifestValid(value), false, mutate.toString());
  }
});

test('structural case acceptance never substitutes for frozen semantic validation or failure identity', async () => {
  const { manifestValid, resultValid } = await schemas();
  const changes = [
    (value: ManifestV3) => { value.assertionDigest = 'f'.repeat(64); },
    (value: ManifestV3) => { value.expectationSource.contractUrls = ['https://example.invalid/different-contract']; },
    (value: ManifestV3) => { value.environment.clock = '2026-99-01T00:00:00.000Z'; },
    (value: ManifestV3) => { value.actions[1]!.dependsOn = ['missing']; },
  ];
  for (const change of changes) {
    const value = createCaseManifest('marked-empty-heading'); change(value);
    assert.equal(manifestValid(value), true, JSON.stringify(manifestValid.errors));
    assert.throws(() => validateManifest(value));
  }
  const subset = createCaseManifest('htmx-checkbox'); subset.actions = [];
  assert.equal(manifestValid(subset), true);
  const run = structuralRun(); run.observation = { kind: 'browser-case', values: ['unrelated', 'rendered'] };
  assert.equal(resultValid(run), true, 'A schema cannot establish the target failure from an arbitrary well-formed value.');
  assert.throws(() => evaluateCaseObservation(createCaseManifest('morphdom-textarea'), run.observation));
});

test('run result v2 accepts synthetic observations and incomplete early-cancellation shapes', async () => {
  const { resultValid } = await schemas();
  const synthetic = structuralRun(); synthetic.observation = { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] };
  assert.equal(resultValid(synthetic), true, JSON.stringify(resultValid.errors));
  const cancelled: RunResult = { ...structuralRun(), outcome: 'cancelled', category: 'cancelled', assertionCount: 0, harnessDigest: '', appDigest: '', observation: null, events: [], artifacts: [] };
  assert.equal(resultValid(cancelled), true, JSON.stringify(resultValid.errors));
  assert.equal(resultValid({ ...cancelled, outcome: 'inconclusive', category: 'environment' }), true);
});

test('run result v2 rejects malformed observations, secrets and empty conclusive assertions', async () => {
  const { resultValid } = await schemas();
  for (const patch of [
    { assertionCount: 0 }, { harnessDigest: '' }, { appDigest: '' }, { observation: null }, { authorization: 'Bearer schema-privacy-sentinel' },
    { observation: { kind: 'browser-case', values: [] } },
    { observation: { kind: 'browser-case', values: [true, 'clicked'] } },
    { observation: { kind: 'browser-case', values: ['true', 'clicked'], secret: 'schema-privacy-sentinel' } },
    { observation: { kind: 'other', values: ['true', 'clicked'] } },
    { observation: { kind: 'browser-case', values: ['x'.repeat(8193)] } },
    { observation: { kind: 'browser-case', values: ['true'], results: ['mixed observation'] } },
  ]) assert.equal(resultValid({ ...structuralRun(), ...patch }), false, JSON.stringify(patch).slice(0, 200));
  for (const path of ['../outside', '/absolute', 'a\\b', 'a/../b']) {
    const run = structuralRun(); run.artifacts[0]!.path = path;
    assert.equal(resultValid(run), false, path);
  }
});
