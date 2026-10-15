import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ts from 'typescript';
import type { Manifest, RunResult } from '../src/contracts.js';
import { VERSION } from '../src/contracts.js';
import { createManifest, digest, validateManifest } from '../src/manifest.js';

type Schema = { properties?: Record<string, Schema>; required?: string[]; $defs?: Record<string, Schema>; [key: string]: unknown };
const manifestSchema = JSON.parse(await readFile(new URL('../schemas/manifest-v1.schema.json', import.meta.url), 'utf8')) as Schema;
const resultSchema = JSON.parse(await readFile(new URL('../schemas/run-result-v1.schema.json', import.meta.url), 'utf8')) as Schema;
const ajv = new Ajv2020({ strict: true, allErrors: true });
const manifestValid = ajv.compile<Manifest>(manifestSchema);
const resultValid = ajv.compile<RunResult>(resultSchema);
function structuralRun(): RunResult {
  const manifest = createManifest();
  // A typed structural test value, not an executed-browser result.
  return {
    id: 'schema-unit-run', outcome: 'target-failure', category: 'target-failure', reason: 'Synthetic schema shape only.',
    manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest, harnessDigest: 'a'.repeat(64),
    appRevision: 'buggy', appDigest: manifest.app.sourceDigest, adapterVersion: VERSION, runnerVersion: VERSION,
    seed: manifest.environment.seed, startedAt: '2026-01-01T00:00:00.000Z', durationMs: 1.5, assertionCount: 1,
    observation: { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] },
    events: [{ seq: 1, at: '2026-01-01T00:00:00.000Z', type: 'assertion', message: 'Synthetic schema event.' }],
    artifacts: [{ path: 'schema-unit-run/evidence.json', sha256: 'b'.repeat(64), bytes: 42 }],
    environment: { platform: 'schema-test', node: process.version, browser: 'not-executed', isolation: 'No browser execution in this structural test.' },
  };
}

test('v1 JSON Schema fields and required fields track the actual TypeScript interfaces', async () => {
  const source = ts.createSourceFile('contracts.ts', await readFile(new URL('../src/contracts.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const mappings = [
    ['ManifestV1', manifestSchema], ['Action', manifestSchema.$defs?.action], ['ExpectationV1', manifestSchema.properties?.expectation],
    ['RunResult', resultSchema], ['RunEvent', resultSchema.$defs?.event],
  ] as const;
  for (const [name, schema] of mappings) {
    const declaration = source.statements.find(statement => ts.isInterfaceDeclaration(statement) && statement.name.text === name);
    assert.ok(declaration && ts.isInterfaceDeclaration(declaration)); assert.ok(schema);
    const members = declaration.members.filter(ts.isPropertySignature);
    assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), members.map(member => member.name.getText(source)).sort(), `${name} field inventory`);
    assert.deepEqual((schema.required ?? []).toSorted(), members.filter(member => !member.questionToken).map(member => member.name.getText(source)).sort(), `${name} required fields`);
  }
});

test('manifest schema accepts actual registered defaults and structurally permitted subsets', () => {
  const manifest = createManifest();
  assert.equal(manifestValid(manifest), true, JSON.stringify(manifestValid.errors));
  manifest.actions = []; manifest.responses = []; manifest.expectationBasis = 'proposed-unconfirmed';
  manifest.environment.viewport = { width: 64, height: 4096 };
  assert.equal(manifestValid(manifest), true, JSON.stringify(manifestValid.errors));
  assert.deepEqual(validateManifest(manifest), manifest, 'Missing execution preconditions remain structurally representable.');
});

test('manifest schema rejects missing fields and unknown fields at every executable object boundary', () => {
  const original = createManifest();
  for (const key of Object.keys(original)) {
    const candidate = structuredClone(original) as unknown as Record<string, unknown>; delete candidate[key];
    assert.equal(manifestValid(candidate), false, `Required root field ${key}`);
  }
  const boundaries = [[], ['adapter'], ['expectation'], ['environment'], ['environment', 'viewport'], ['boundary'], ['app'], ['actions', 0], ['responses', 0]];
  for (const path of boundaries) {
    const candidate = structuredClone(original);
    let object: unknown = candidate;
    for (const segment of path) object = (object as Record<string | number, unknown>)[segment]!;
    (object as Record<string, unknown>)['unapproved'] = 'synthetic-extra-field';
    assert.equal(manifestValid(candidate), false, `Unknown property at ${path.join('.') || 'root'}`);
  }
});

test('manifest schema rejects unsupported versions, unsafe identifiers, action variants and exceeded bounds', () => {
  const cases: [string, (manifest: Record<string, unknown>) => void][] = [
    ['schema', value => { value['schemaVersion'] = 2; }],
    ['version', value => { value['runnerVersion'] = '9.9.9'; }],
    ['identifier', value => { value['id'] = '../outside'; }],
    ['privacy field', value => { value['id'] = 'contains-password'; }],
    ['unsupported action', value => { (value['actions'] as Record<string, unknown>[])[0]!['kind'] = 'execute-script'; }],
    ['wrong value', value => { (value['actions'] as Record<string, unknown>[])[0]!['value'] = 'https://outside.invalid'; }],
    ['clock syntax', value => { (value['environment'] as Record<string, unknown>)['clock'] = 'now'; }],
    ['seed range', value => { (value['environment'] as Record<string, unknown>)['seed'] = 2 ** 32; }],
    ['timeout', value => { (value['environment'] as Record<string, unknown>)['timeoutMs'] = 60_001; }],
    ['dependencies', value => { (value['actions'] as Record<string, unknown>[])[1]!['dependsOn'] = ['navigate', 'navigate']; }],
  ];
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(createManifest()) as unknown as Record<string, unknown>; mutate(candidate);
    assert.equal(manifestValid(candidate), false, name);
  }
});

test('schema acceptance does not replace semantic digest, dependency or calendar validation', () => {
  const changedDigest = createManifest(); changedDigest.assertionDigest = 'f'.repeat(64);
  const missingDependency = createManifest(); missingDependency.actions[1]!.dependsOn = ['absent'];
  const invalidCalendar = createManifest(); invalidCalendar.environment.clock = '2026-99-01T00:00:00.000Z';
  for (const manifest of [changedDigest, missingDependency, invalidCalendar]) {
    assert.equal(manifestValid(manifest), true, JSON.stringify(manifestValid.errors));
    assert.throws(() => validateManifest(manifest));
  }
});

test('run schema accepts actual typed conclusive and no-run shapes without pretending they prove execution', () => {
  const run = structuralRun(); assert.equal(resultValid(run), true, JSON.stringify(resultValid.errors));
  const cancelled: RunResult = { ...run, id: 'not-executed', outcome: 'cancelled', category: 'cancelled', assertionCount: 0, harnessDigest: '', observation: null, events: [], artifacts: [] };
  assert.equal(resultValid(cancelled), true, JSON.stringify(resultValid.errors));
  const inconclusive: RunResult = { ...cancelled, outcome: 'inconclusive', category: 'verification' };
  assert.equal(resultValid(inconclusive), true, JSON.stringify(resultValid.errors));
});

test('run schema rejects unknown fields, wrong outcomes, missing executed assertions and unsafe artifact paths', () => {
  for (const patch of [{ outcome: 'success' }, { assertionCount: 0 }, { harnessDigest: '' }, { observation: null }, { category: 'unrecognized' }, { invented: true }]) {
    assert.equal(resultValid({ ...structuralRun(), ...patch }), false, JSON.stringify(patch));
  }
  for (const path of ['../outside', '/absolute', 'a\\b', 'a//b', './a', 'a/../b']) {
    const run = structuralRun(); run.artifacts[0]!.path = path; assert.equal(resultValid(run), false, path);
  }
  const altered = structuralRun(); altered.observation!.results = ['Other results'];
  assert.equal(resultValid(altered), true, 'Schema structure is not the frozen semantic oracle.');
});
