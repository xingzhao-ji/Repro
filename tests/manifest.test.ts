import test from 'node:test';
import assert from 'node:assert/strict';
import { createManifest, digest, validateManifest } from '../src/manifest.js';
import { ReproError } from '../src/contracts.js';

// Deliberately malformed data stays unknown instead of pretending to satisfy Manifest.
type MalformedManifest = Record<string, unknown> & {
  adapter: Record<string, unknown>;
  app: Record<string, unknown>;
  expectation: Record<string, unknown>;
  boundary: Record<string, unknown>;
  environment: Record<string, unknown> & { viewport: Record<string, unknown> };
  actions: [Record<string, unknown>, Record<string, unknown>, ...Record<string, unknown>[]];
  responses: [Record<string, unknown>, ...Record<string, unknown>[]];
};
function malformed(): MalformedManifest { return createManifest() as unknown as MalformedManifest; }

test('canonical digest is stable across object order, sensitive to arrays and rejects non-JSON inputs', () => {
  assert.equal(digest({ a: 1, b: [2, 3] }), digest({ b: [2, 3], a: 1 }));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
  assert.throws(() => digest({ unsupported: undefined }), ReproError);
  const cycle: Record<string, unknown> = {}; cycle['cycle'] = cycle;
  assert.throws(() => digest(cycle), ReproError);
});

test('manifest round trip is defensive and preserves synthetic expectation provenance', () => {
  const source = createManifest();
  const manifest = validateManifest(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(manifest, source);
  manifest.actions.pop();
  assert.notEqual(manifest.actions.length, source.actions.length);
  assert.equal(manifest.humanApproval, 'not-claimed');
  assert.equal(manifest.expectationBasis, 'supplied-synthetic-specification');
});

test('only supported schema, app, runner, adapter, oracle and boundary are accepted', () => {
  for (const mutate of [
    (m: MalformedManifest) => { m.schemaVersion = 2; },
    (m: MalformedManifest) => { m.runnerVersion = '999.0.0'; },
    (m: MalformedManifest) => { m.adapter.version = '999.0.0'; },
    (m: MalformedManifest) => { m.adapter.id = 'external'; },
    (m: MalformedManifest) => { m.app.sourceDigest = '0'.repeat(64); },
    (m: MalformedManifest) => { m.assertionDigest = '0'.repeat(64); },
    (m: MalformedManifest) => { m.expectation.expectedResults = ['Alpha synthetic result']; },
    (m: MalformedManifest) => { m.humanApproval = 'approved'; },
    (m: MalformedManifest) => { m.boundary.externalDependencies = ['http://169.254.169.254/']; },
    (m: MalformedManifest) => { m.environment.platform = 'host'; },
    (m: MalformedManifest) => { m.environment.clock = 'not-a-date'; },
  ]) {
    const manifest = malformed(); mutate(manifest);
    assert.throws(() => validateManifest(manifest), ReproError);
  }
});

test('manifest rejects traversal, secrets, unknown fields, excessive size and numeric limits', () => {
  for (const mutate of [
    (m: MalformedManifest) => { m.id = '../outside'; },
    (m: MalformedManifest) => { m.id = '/absolute'; },
    (m: MalformedManifest) => { m.id = 'privacy-sentinel-do-not-export'; },
    (m: MalformedManifest) => { m.authorization = 'Bearer privacy-sentinel'; },
    (m: MalformedManifest) => { m.actions[0].cookie = 'privacy-sentinel'; },
    (m: MalformedManifest) => { m.actions[0].value = 'http://127.0.0.1/admin'; },
    (m: MalformedManifest) => { m.actions[1].value = 'a'.repeat(100_000); },
    (m: MalformedManifest) => { m.environment.timeoutMs = 999_999; },
    (m: MalformedManifest) => { m.environment.seed = -1; },
    (m: MalformedManifest) => { m.environment.viewport.width = Infinity; },
    (m: MalformedManifest) => { m.responses[0].results = ['privacy-sentinel']; },
  ]) {
    const manifest = malformed(); mutate(manifest);
    assert.throws(() => validateManifest(manifest), (error: unknown) => {
      assert.ok(error instanceof ReproError);
      assert.ok(!error.message.includes('privacy-sentinel'));
      return true;
    });
  }
});

test('dependencies reject missing, repeated, forward and cyclic references; empty candidate is structurally valid', () => {
  for (const mutate of [
    (m: MalformedManifest) => { m.actions[1].dependsOn = ['missing']; },
    (m: MalformedManifest) => { m.actions[1].dependsOn = [m.actions[0].id, m.actions[0].id]; },
    (m: MalformedManifest) => { m.actions[0].dependsOn = [m.actions[1].id]; },
    (m: MalformedManifest) => { m.actions[1].id = m.actions[0].id; },
  ]) {
    const manifest = malformed(); mutate(manifest);
    assert.throws(() => validateManifest(manifest), ReproError);
  }
  const manifest = createManifest(); manifest.actions = [];
  assert.deepEqual(validateManifest(manifest).actions, []);
});
