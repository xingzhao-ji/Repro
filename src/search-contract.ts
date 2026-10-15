import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { ReproError, type Manifest, type SearchOrder } from './contracts.js';
import { ASSERTION_DIGEST, EXPECTATION, type Observation } from './oracle.js';

export const SEARCH_CONTRACT_ARTIFACT_DIGEST = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
export const SEARCH_CONTRACT_ID = 'registered-search-latest-response-v1';
const resultByQuery = Object.freeze({ alpha: 'Alpha synthetic result', beta: 'Beta synthetic result' });
export const SEARCH_CONTRACT_DIGEST = createHash('sha256').update(JSON.stringify({
  id: SEARCH_CONTRACT_ID, invariantId: 'LATEST_SEARCH_RESPONSE_WINS',
  description: EXPECTATION.description, results: resultByQuery,
  responseOrder: [2, 1], observable: 'latest issued request and query remain visible; latest response results win',
})).digest('hex');
export interface FrozenSearchContract {
  searchOrder: SearchOrder;
  expected: Observation;
  stale: Observation;
  responses: Manifest['responses'];
  assertionDigest: string;
}

/** Derive only from the immutable scenario, never from reducible actions. */
export function searchContract(manifest: Manifest): FrozenSearchContract {
  const order: SearchOrder = manifest.schemaVersion === 1 ? ['alpha', 'beta'] : manifest.scenario?.searchOrder;
  if (!isDeepStrictEqual(order, ['alpha', 'beta']) && !isDeepStrictEqual(order, ['beta', 'alpha'])) {
    throw new ReproError('input', 'SEARCH_ORDER', 'The frozen scenario requires the two distinct registered queries.');
  }
  const [first, last] = order;
  const expected: Observation = { latestRequestId: 2, query: last, results: [resultByQuery[last]] };
  const stale: Observation = { latestRequestId: 2, query: last, results: [resultByQuery[first]] };
  if (!isDeepStrictEqual(manifest.expectation, { invariantId: EXPECTATION.invariantId, description: EXPECTATION.description, latestRequestId: 2, latestQuery: last, expectedResults: expected.results })) {
    throw new ReproError('input', 'EXPECTATION_CHANGED', 'The explicit expectation must match the registered latest-response contract and frozen final query.');
  }
  const assertionDigest = manifest.schemaVersion === 1 ? ASSERTION_DIGEST : createHash('sha256').update(JSON.stringify({
    format: 'repro-assertion-v2', contractId: SEARCH_CONTRACT_ID, contractDigest: SEARCH_CONTRACT_DIGEST,
    searchOrder: [first, last], expectation: { invariantId: EXPECTATION.invariantId, description: EXPECTATION.description, ...expected }, intendedFailure: stale,
  })).digest('hex');
  return { searchOrder: [first, last] as SearchOrder, expected, stale,
    responses: [{ requestId: 2, results: [...expected.results] }, { requestId: 1, results: [resultByQuery[first]] }], assertionDigest };
}
export function expectationEstablished(manifest: Manifest): boolean {
  return manifest.schemaVersion === 1 ? manifest.expectationBasis === 'supplied-synthetic-specification' : manifest.expectationBasis === 'independent-contract';
}
