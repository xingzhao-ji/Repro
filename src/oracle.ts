import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { ReproError, type Expectation, type ExpectationV1 } from './contracts.js';
import type { FrozenSearchContract } from './search-contract.js';

// Frozen before candidate execution. This is the unchanged supplied synthetic
// specification, not a claim that a real reporter or a human approved it.
export const EXPECTATION: ExpectationV1 = Object.freeze({
  invariantId: 'LATEST_SEARCH_RESPONSE_WINS',
  description: 'A response belonging to an older search request must not replace results for the most recently issued request.',
  latestRequestId: 2,
  latestQuery: 'beta',
  expectedResults: Object.freeze(['Beta synthetic result']) as unknown as ['Beta synthetic result'],
});
export const ASSERTION_DIGEST = createHash('sha256').update(JSON.stringify(EXPECTATION)).digest('hex');
// When bundled, import.meta.url binds this to the shipped executable bundle.
export const ORACLE_ARTIFACT_DIGEST = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
export interface Observation { latestRequestId: number; query: string; results: string[] }
export class TargetFailure extends ReproError {
  constructor(first = 'alpha', last = 'beta') { super('target-failure', 'LATEST_SEARCH_RESPONSE_WINS', `LATEST_SEARCH_RESPONSE_WINS: stale ${first} results replaced the latest ${last} results.`); }
}
export function assertObservation(actual: Observation, expectation: Expectation, contract?: FrozenSearchContract): void {
  const frozenExpectation = contract ? { invariantId: EXPECTATION.invariantId, description: EXPECTATION.description, latestRequestId: contract.expected.latestRequestId, latestQuery: contract.expected.query, expectedResults: contract.expected.results } : EXPECTATION;
  if (!isDeepStrictEqual(expectation, frozenExpectation)) {
    throw new ReproError('verification', 'ORACLE_CHANGED', 'The expected-behavior oracle differs from the supplied frozen baseline.');
  }
  // Wrong state, empty output, and unrelated failures are not this target bug.
  if (actual.latestRequestId !== expectation.latestRequestId || actual.query !== expectation.latestQuery) {
    throw new ReproError('verification', 'WRONG_OBSERVATION', 'The latest issued request or visible query is not the frozen expected request.');
  }
  if (isDeepStrictEqual(actual.results, expectation.expectedResults)) return;
  if (isDeepStrictEqual(actual.results, contract?.stale.results ?? ['Alpha synthetic result'])) throw new TargetFailure(contract?.searchOrder[0], contract?.searchOrder[1]);
  throw new ReproError('verification', 'WRONG_FAILURE', 'The observed results do not match either the expected results or the exact stale-response failure.');
}
