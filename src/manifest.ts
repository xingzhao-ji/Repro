import { createHash } from 'node:crypto';
import { ADAPTER, VERSION, ReproError, type Manifest, type SyntheticManifest, type ManifestV1, type ManifestV2 } from './contracts.js';
import { EXPECTATION, ASSERTION_DIGEST } from './oracle.js';
import { fixtureDigest } from './fixture.js';
import { searchContract, SEARCH_CONTRACT_ID, SEARCH_CONTRACT_DIGEST } from './search-contract.js';
import { validateCaseManifest } from './browser-case.js';
import { validateAppManifest } from './app-contract.js';

const MAX_MANIFEST_BYTES = 64 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,127}$/;
const PRIVATE_IDENTIFIER = /(?:secret|password|authorization|cookie|private-key|privacy-sentinel|access-token)/i;

function invalid(code: string, message: string): never {
  throw new ReproError('input', code, message);
}

/** Canonical JSON identity: key order is irrelevant, array order is significant. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  function encode(item: unknown, depth: number): string {
    if (++nodes > 20_000 || depth > 32) invalid('JSON_LIMIT', 'JSON exceeds the supported structural limit.');
    if (item === null || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'string') {
      if (Buffer.byteLength(item) > 2 * 1024 * 1024) invalid('JSON_LIMIT', 'JSON string exceeds the supported size limit.');
      return JSON.stringify(item);
    }
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (typeof item !== 'object' || item === null) invalid('JSON_TYPE', 'Only finite JSON values are supported.');
    if (ancestors.has(item)) invalid('JSON_CYCLE', 'JSON must not contain cyclic references.');
    ancestors.add(item);
    let result: string;
    if (Array.isArray(item)) {
      if (item.length > 20_000 || Object.keys(item).length !== item.length) invalid('JSON_ARRAY', 'Sparse or oversized JSON arrays are unsupported.');
      result = `[${item.map((entry) => encode(entry, depth + 1)).join(',')}]`;
    } else {
      const prototype: unknown = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) invalid('JSON_TYPE', 'Only plain JSON objects are supported.');
      if (Reflect.ownKeys(item).some((key) => typeof key !== 'string')) invalid('JSON_TYPE', 'JSON symbol properties are unsupported.');
      result = `{${Object.keys(item).sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !('value' in descriptor)) invalid('JSON_TYPE', 'JSON accessors are unsupported.');
        return `${JSON.stringify(key)}:${encode(descriptor.value, depth + 1)}`;
      }).join(',')}}`;
    }
    ancestors.delete(item);
    if (Buffer.byteLength(result) > 4 * 1024 * 1024) invalid('JSON_LIMIT', 'JSON exceeds the supported size limit.');
    return result;
  }
  return encode(value, 0);
}

export function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('MANIFEST_TYPE', 'Expected a manifest object.');
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    invalid('MANIFEST_FIELDS', 'The manifest contains missing or unapproved fields.');
  }
  return record;
}

function equal(value: unknown, expected: unknown, code = 'MANIFEST_VALUE'): void {
  if (canonicalJson(value) !== canonicalJson(expected)) invalid(code, 'The manifest differs from the registered supported contract.');
}

function integer(value: unknown, minimum: number, maximum: number): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalid('MANIFEST_LIMIT', 'A manifest number is outside the supported bounds.');
  }
}

function identifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value) || PRIVATE_IDENTIFIER.test(value)) {
    invalid('MANIFEST_IDENTIFIER', 'A manifest identifier is unsafe or unsupported.');
  }
}

function array(value: unknown, maximum: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid('MANIFEST_LIMIT', 'A manifest list is outside the supported bounds.');
}

function hash(value: unknown, expected: string): void {
  if (typeof value !== 'string' || !HASH.test(value) || value !== expected) {
    throw new ReproError('verification', 'IDENTITY_MISMATCH', 'A manifest identity does not match the trusted registered implementation.');
  }
}

export function validateManifest(input: unknown): Manifest {
  const encoded = canonicalJson(input);
  if (Buffer.byteLength(encoded) > MAX_MANIFEST_BYTES) invalid('MANIFEST_SIZE', 'Manifest exceeds 64 KiB.');
  // Return an independent JSON value: mutations by a caller cannot change already validated input.
  const value: unknown = JSON.parse(encoded);
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('MANIFEST_TYPE', 'Expected a manifest object.');
  const version = (value as Record<string, unknown>)['schemaVersion'];
  if (version === 3) return validateCaseManifest(value);
  if (version === 4) return validateAppManifest(value);
  if (version !== 1 && version !== 2) throw new ReproError('unsupported', 'SCHEMA_VERSION', 'Only manifest schema versions 1, 2, 3 and 4 are supported.');
  const manifest = object(value, ['schemaVersion', 'id', 'classification', 'adapter', 'runnerVersion', 'expectation', 'assertionDigest', 'expectationBasis', 'humanApproval', 'actions', 'responses', 'environment', 'boundary', 'app', ...(version === 2 ? ['scenario', 'expectationSource'] : [])]);
  identifier(manifest['id']);
  equal(manifest['classification'], 'synthetic-training-fixture');
  const adapter = object(manifest['adapter'], ['id', 'version']);
  if (adapter['id'] !== ADAPTER || adapter['version'] !== VERSION || manifest['runnerVersion'] !== VERSION) {
    throw new ReproError('unsupported', 'IMPLEMENTATION_VERSION', 'The registered adapter or runner version is unavailable.');
  }
  if (version === 1) equal(manifest['expectation'], EXPECTATION, 'EXPECTATION_CHANGED');
  else {
    object(manifest['scenario'], ['searchOrder']);
    const source = object(manifest['expectationSource'], ['kind', 'contractId', 'contractDigest']);
    equal(source['kind'], 'caller-supplied'); equal(source['contractId'], SEARCH_CONTRACT_ID);
    hash(source['contractDigest'], SEARCH_CONTRACT_DIGEST);
  }
  const contract = searchContract(value as SyntheticManifest);
  hash(manifest['assertionDigest'], version === 1 ? ASSERTION_DIGEST : contract.assertionDigest);
  if (typeof manifest['expectationBasis'] !== 'string' || !(version === 1 ? ['supplied-synthetic-specification', 'proposed-unconfirmed'] : ['independent-contract', 'proposed-unconfirmed']).includes(manifest['expectationBasis'])) invalid('EXPECTATION_BASIS', 'Expectation provenance is unsupported.');
  equal(manifest['humanApproval'], 'not-claimed');

  const actions = manifest['actions']; array(actions, 256);
  const seen = new Set<string>();
  for (const entry of actions) {
    const action = object(entry, ['id', 'kind', 'value', 'dependsOn']);
    identifier(action['id']);
    if (seen.has(action['id'])) invalid('ACTION_ID', 'Action identifiers must be unique.');
    const supported = action['kind'] === 'navigate' && action['value'] === '/'
      || action['kind'] === 'search' && (action['value'] === 'alpha' || action['value'] === 'beta')
      || action['kind'] === 'noise' && action['value'] === 'focus';
    if (!supported) throw new ReproError('unsupported', 'ACTION_UNSUPPORTED', 'Only registered synthetic actions and inputs are supported.');
    const dependencies = action['dependsOn']; array(dependencies, 256);
    const unique = new Set<string>();
    for (const dependency of dependencies) {
      identifier(dependency);
      if (!seen.has(dependency) || unique.has(dependency)) invalid('ACTION_DEPENDENCY', 'Dependencies must name distinct earlier actions; missing, forward or cyclic references are invalid.');
      unique.add(dependency);
    }
    seen.add(action['id']);
  }

  const responses = manifest['responses']; array(responses, 2);
  const requests = new Set<number>();
  for (const entry of responses) {
    const response = object(entry, ['requestId', 'results']);
    integer(response['requestId'], 1, 2);
    const requestId = response['requestId'] as number;
    if (requests.has(requestId)) invalid('RESPONSE_DUPLICATE', 'Each supported response can appear only once.');
    equal(response['results'], contract.responses.find(response => response.requestId === requestId)?.results);
    requests.add(requestId);
  }
  const environment = object(manifest['environment'], ['browser', 'viewport', 'locale', 'timezoneId', 'clock', 'seed', 'platform', 'timeoutMs']);
  equal(environment['browser'], 'chromium');
  equal(environment['locale'], 'en-US'); equal(environment['timezoneId'], 'UTC'); equal(environment['platform'], 'linux-container');
  const viewport = object(environment['viewport'], ['width', 'height']);
  integer(viewport['width'], 64, 4096); integer(viewport['height'], 64, 4096);
  integer(environment['timeoutMs'], 100, 60_000); integer(environment['seed'], 0, 0xffff_ffff);
  if (typeof environment['clock'] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(environment['clock'])
      || !Number.isFinite(Date.parse(environment['clock'])) || new Date(environment['clock']).toISOString() !== environment['clock']) {
    invalid('CLOCK_UNSUPPORTED', 'The clock must be a valid explicit UTC ISO timestamp.');
  }
  const boundary = object(manifest['boundary'], ['behavior', 'network', 'database', 'externalDependencies']);
  equal(boundary, { behavior: 'frontend', network: 'controlled-http', database: 'none', externalDependencies: [] });
  const app = object(manifest['app'], ['revision', 'sourceDigest']);
  if (app['revision'] !== 'buggy' && app['revision'] !== 'fixed') throw new ReproError('unsupported', 'APP_REVISION', 'Only the registered synthetic app revisions are supported.');
  hash(app['sourceDigest'], fixtureDigest(app['revision']));
  return value as Manifest;
}

export function createManifest(): ManifestV1 {
  return validateManifest({
    schemaVersion: 1, id: 'synthetic-search-stale-response-v1', classification: 'synthetic-training-fixture',
    adapter: { id: ADAPTER, version: VERSION }, runnerVersion: VERSION,
    expectation: EXPECTATION, assertionDigest: ASSERTION_DIGEST,
    expectationBasis: 'supplied-synthetic-specification', humanApproval: 'not-claimed',
    actions: [
      { id: 'navigate', kind: 'navigate', value: '/', dependsOn: [] },
      { id: 'focus-before', kind: 'noise', value: 'focus', dependsOn: ['navigate'] },
      { id: 'search-alpha', kind: 'search', value: 'alpha', dependsOn: ['navigate'] },
      { id: 'search-beta', kind: 'search', value: 'beta', dependsOn: ['search-alpha'] },
      { id: 'focus-after', kind: 'noise', value: 'focus', dependsOn: ['navigate'] },
    ],
    responses: [{ requestId: 2, results: ['Beta synthetic result'] }, { requestId: 1, results: ['Alpha synthetic result'] }],
    environment: { browser: 'chromium', viewport: { width: 1280, height: 720 }, locale: 'en-US', timezoneId: 'UTC', clock: '2026-01-01T00:00:00.000Z', seed: 1729, platform: 'linux-container', timeoutMs: 10_000 },
    boundary: { behavior: 'frontend', network: 'controlled-http', database: 'none', externalDependencies: [] },
    app: { revision: 'buggy', sourceDigest: fixtureDigest('buggy') },
  }) as ManifestV1;
}

/** The caller must explicitly supply all observable expectation fields. */
export function createAuthoredManifest(input: unknown): ManifestV2 {
  const encoded = canonicalJson(input);
  if (Buffer.byteLength(encoded) > MAX_MANIFEST_BYTES) invalid('MANIFEST_SIZE', 'Declaration exceeds 64 KiB.');
  const declaration = object(JSON.parse(encoded), ['searchOrder', 'expectation', 'expectationBasis']);
  const expected = object(declaration['expectation'], ['invariantId', 'latestRequestId', 'latestQuery', 'expectedResults']);
  if (typeof declaration['expectationBasis'] !== 'string' || !['independent-contract', 'proposed-unconfirmed'].includes(declaration['expectationBasis'])) invalid('EXPECTATION_BASIS', 'Expectation provenance is unsupported.');
  const draft = { ...createManifest(), schemaVersion: 2,
    scenario: { searchOrder: declaration['searchOrder'] },
    expectation: { ...expected, description: EXPECTATION.description },
    expectationBasis: declaration['expectationBasis'],
    expectationSource: { kind: 'caller-supplied', contractId: SEARCH_CONTRACT_ID, contractDigest: SEARCH_CONTRACT_DIGEST },
  } as ManifestV2;
  const contract = searchContract(draft);
  draft.assertionDigest = contract.assertionDigest;
  draft.responses = contract.responses;
  const [first, last] = contract.searchOrder;
  draft.actions = [
    { id: 'navigate', kind: 'navigate', value: '/', dependsOn: [] },
    { id: 'focus-before', kind: 'noise', value: 'focus', dependsOn: ['navigate'] },
    { id: `search-${first}`, kind: 'search', value: first, dependsOn: ['navigate'] },
    { id: `search-${last}`, kind: 'search', value: last, dependsOn: [`search-${first}`] },
    { id: 'focus-after', kind: 'noise', value: 'focus', dependsOn: ['navigate'] },
  ];
  return validateManifest(draft) as ManifestV2;
}
