import test from 'node:test';
import assert from 'node:assert/strict';
import * as manifests from '../src/manifest.js';
import { ReproError } from '../src/contracts.js';

function declaration(reverse = true) {
  return { searchOrder: reverse ? ['beta', 'alpha'] : ['alpha', 'beta'], expectation: { invariantId: 'LATEST_SEARCH_RESPONSE_WINS', latestRequestId: 2, latestQuery: reverse ? 'alpha' : 'beta', expectedResults: [reverse ? 'Alpha synthetic result' : 'Beta synthetic result'] }, expectationBasis: 'independent-contract' };
}
function authored(input: unknown) {
  assert.equal(typeof manifests.createAuthoredManifest, 'function', 'caller-supplied executable expectations need a manifest factory');
  return manifests.createAuthoredManifest(input);
}

test('caller supplies a reversed executable expectation with separate frozen identity and no human approval claim', () => {
  const manifest = authored(declaration());
  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(manifest.scenario.searchOrder, ['beta', 'alpha']);
  assert.deepEqual(manifest.expectation.expectedResults, ['Alpha synthetic result']);
  assert.equal(manifest.expectation.latestQuery, 'alpha');
  assert.equal(manifest.expectationBasis, 'independent-contract');
  assert.equal(manifest.humanApproval, 'not-claimed');
  assert.equal(manifest.expectationSource.kind, 'caller-supplied');
  assert.deepEqual(manifests.validateManifest(manifest), manifest);
  assert.notEqual(manifest.assertionDigest, authored(declaration(false)).assertionDigest);
  assert.equal(manifests.createManifest().assertionDigest, 'fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711');
});

test('missing, contradictory and unregistered declarations cannot be silently filled or corrected', () => {
  for (const input of [
    {}, { ...declaration(), expectation: undefined },
    { ...declaration(), searchOrder: ['alpha', 'alpha'] },
    { ...declaration(), searchOrder: ['alpha', 'gamma'] },
    { ...declaration(), expectation: { ...declaration().expectation, latestQuery: 'beta' } },
    { ...declaration(), expectation: { ...declaration().expectation, expectedResults: ['Beta synthetic result'] } },
    { ...declaration(), expectation: { ...declaration().expectation, latestRequestId: 1 } },
    { ...declaration(), humanApproval: 'approved' },
    { ...declaration(), expectationBasis: 'reporter-confirmed' },
  ]) assert.throws(() => authored(input), ReproError);
});

test('reducible action deletion never changes the scenario, response schedule or assertion', () => {
  const manifest = authored(declaration());
  const candidate = { ...manifest, actions: manifest.actions.filter(action => action.kind !== 'search') };
  const validated = manifests.validateManifest(candidate);
  assert.equal(validated.schemaVersion, 2);
  if (validated.schemaVersion !== 2) assert.fail('expected authored schema');
  assert.deepEqual(validated.scenario, manifest.scenario);
  assert.deepEqual(validated.expectation, manifest.expectation);
  assert.deepEqual(validated.responses, [{ requestId: 2, results: ['Alpha synthetic result'] }, { requestId: 1, results: ['Beta synthetic result'] }]);
  assert.equal(validated.assertionDigest, manifest.assertionDigest);
  for (const changed of [
    { ...manifest, assertionDigest: '0'.repeat(64) },
    { ...manifest, scenario: { searchOrder: ['alpha', 'beta'] } },
    { ...manifest, expectationSource: { ...manifest.expectationSource, contractDigest: '0'.repeat(64) } },
  ]) assert.throws(() => manifests.validateManifest(changed), ReproError);
});

test('the authored JSON Schema validates both explicit orders and rejects absent or extra execution fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { Ajv2020 } = await import('ajv/dist/2020.js');
  const schema = JSON.parse(await readFile(new URL('../schemas/manifest-v2.schema.json', import.meta.url), 'utf8'));
  const valid = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  for (const reverse of [false, true]) {
    const manifest = authored(declaration(reverse));
    assert.equal(valid(manifest), true, JSON.stringify(valid.errors));
    for (const key of Object.keys(manifest)) {
      const candidate = structuredClone(manifest) as unknown as Record<string, unknown>; delete candidate[key];
      assert.equal(valid(candidate), false, `missing ${key}`);
    }
    assert.equal(valid({ ...manifest, humanApproval: 'approved' }), false);
    assert.equal(valid({ ...manifest, scenario: { searchOrder: ['alpha', 'alpha'] } }), false);
    assert.equal(valid({ ...manifest, expectationSource: { ...manifest.expectationSource, author: 'human' } }), false);
  }
});

test('authored declarations reject active objects before reading getters or exposing their errors', () => {
  let accessed = false;
  const input = { ...declaration(), get expectation() { accessed = true; throw new Error('private sentinel'); } };
  assert.throws(() => authored(input), ReproError);
  assert.equal(accessed, false);
});

test('the dynamic oracle recognizes only the frozen stale signature and latest-query observation', async () => {
  const { searchContract, expectationEstablished } = await import('../src/search-contract.js');
  const { assertObservation, TargetFailure } = await import('../src/oracle.js');
  const manifest = authored(declaration()); const contract = searchContract(manifest);
  assert.doesNotThrow(() => assertObservation({ latestRequestId: 2, query: 'alpha', results: ['Alpha synthetic result'] }, manifest.expectation, contract));
  assert.throws(() => assertObservation({ latestRequestId: 2, query: 'alpha', results: ['Beta synthetic result'] }, manifest.expectation, contract), TargetFailure);
  for (const observation of [
    { latestRequestId: 2, query: 'alpha', results: [] },
    { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] },
    { latestRequestId: 1, query: 'alpha', results: ['Beta synthetic result'] },
    { latestRequestId: 2, query: 'alpha', results: ['Unrelated result'] },
  ]) assert.throws(() => assertObservation(observation, manifest.expectation, contract), error => error instanceof ReproError && !(error instanceof TargetFailure));
  assert.equal(expectationEstablished(manifest), true);
  assert.equal(expectationEstablished(authored({ ...declaration(), expectationBasis: 'proposed-unconfirmed' })), false);
});

test('schema dispatch keeps non-object manifests within structured input errors', () => {
  for (const value of [null, false, 2, 'manifest', []]) {
    assert.throws(() => manifests.validateManifest(value), ReproError);
  }
});

test('expectation provenance must be a literal JSON string at factory and manifest boundaries', () => {
  for (const expectationBasis of [['independent-contract'], ['proposed-unconfirmed']]) {
    assert.throws(() => authored({ ...declaration(), expectationBasis }), ReproError);
    assert.throws(() => manifests.validateManifest({ ...authored(declaration()), expectationBasis }), ReproError);
  }
  for (const expectationBasis of [['supplied-synthetic-specification'], ['proposed-unconfirmed']]) {
    assert.throws(() => manifests.validateManifest({ ...manifests.createManifest(), expectationBasis }), ReproError);
  }
});
