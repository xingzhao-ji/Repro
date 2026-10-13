import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
// This frozen baseline is intentionally separate from the candidate implementation.
// In a real evaluation it must be held outside the implementation's write permissions.
const baseline = {
  invariantId: 'LATEST_SEARCH_RESPONSE_WINS',
  description: 'A response belonging to an older search request must not replace results for the most recently issued request.',
  latestRequestId: 2,
  latestQuery: 'beta',
  expectedResults: ['Beta synthetic result']
};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const baselineDigest = digest(baseline);
export class OracleIntegrityError extends Error {
  constructor() { super('The expected-behavior oracle differs from the fixture baseline.'); this.name = 'OracleIntegrityError'; this.code = 'ORACLE_CHANGED'; }
}
export class InvariantViolation extends Error {
  constructor(actual) {
    super('LATEST_SEARCH_RESPONSE_WINS: results do not match the latest issued request.');
    this.name = 'InvariantViolation';
    this.code = 'LATEST_SEARCH_RESPONSE_WINS';
    this.actual = actual;
  }
}
export function assertOracleIntegrity(expectedBehavior) {
  if (digest(expectedBehavior) !== baselineDigest) throw new OracleIntegrityError();
}
export function assertInvariant(actual, expectedBehavior) {
  assertOracleIntegrity(expectedBehavior);
  if (actual.latestRequestId !== expectedBehavior.latestRequestId ||
      actual.query !== expectedBehavior.latestQuery ||
      !isDeepStrictEqual(actual.results, expectedBehavior.expectedResults)) throw new InvariantViolation(actual);
}
export function isTargetFailure(error) {
  return error instanceof InvariantViolation && error.code === 'LATEST_SEARCH_RESPONSE_WINS';
}
export function assertHumanApproved(manifest) {
  if (manifest.approval.status !== 'approved' || !manifest.approval.approvedBy || !manifest.approval.approvedAt) {
    throw new Error('HUMAN_APPROVAL_REQUIRED: this fixture is a demonstration until a human reviews and approves its expected behavior.');
  }
  assertOracleIntegrity(manifest.expectedBehavior);
}
