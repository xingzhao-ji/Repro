import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { ReproError, type Expectation } from './contracts.js';

// Frozen before candidate execution. This is the unchanged supplied synthetic
// specification, not a claim that a real reporter or a human approved it.
export const EXPECTATION: Expectation = Object.freeze({
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
  constructor() { super('target-failure', 'LATEST_SEARCH_RESPONSE_WINS', 'LATEST_SEARCH_RESPONSE_WINS: stale alpha results replaced the latest beta results.'); }
}
export function assertObservation(actual: Observation, expectation: Expectation): void {
  if (!isDeepStrictEqual(expectation, EXPECTATION)) {
    throw new ReproError('verification', 'ORACLE_CHANGED', 'The expected-behavior oracle differs from the supplied frozen baseline.');
  }
  // Wrong state, empty output, and unrelated failures are not this target bug.
  if (actual.latestRequestId !== expectation.latestRequestId || actual.query !== expectation.latestQuery) {
    throw new ReproError('verification', 'WRONG_OBSERVATION', 'The latest issued request or visible query is not the expected beta request.');
  }
  if (isDeepStrictEqual(actual.results, expectation.expectedResults)) return;
  if (isDeepStrictEqual(actual.results, ['Alpha synthetic result'])) throw new TargetFailure();
  throw new ReproError('verification', 'WRONG_FAILURE', 'The observed results do not match either the expected results or the exact stale-response failure.');
}
