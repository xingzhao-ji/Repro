import { ReproError, type Manifest, type RunFunction } from './contracts.js';
import { runBrowser, harnessDigest } from './adapter.js';
import { fixtureDigest } from './fixture.js';
import { assertObservation, TargetFailure, type Observation } from './oracle.js';
import { searchContract, expectationEstablished } from './search-contract.js';
import { runCaseBrowser, caseHarnessDigest, appHarnessDigest } from './case-adapter.js';
import { caseRevisionDigest, evaluateCaseObservation, caseExpectationEstablished } from './browser-case.js';
import { appExpectationEstablished, evaluateAppObservation } from './app-contract.js';

export const runExperiment: RunFunction = (manifest, options) => manifest.schemaVersion === 3 || manifest.schemaVersion === 4
  ? runCaseBrowser(manifest, options) : runBrowser(manifest, options);
export function revisionDigest(manifest: Manifest, revision: 'buggy' | 'fixed'): string {
  if (manifest.schemaVersion === 4) return manifest.app.sourceDigest;
  return manifest.schemaVersion === 3 ? caseRevisionDigest(manifest, revision) : fixtureDigest(revision);
}
export function experimentHarnessDigest(manifest: Manifest): string {
  if (manifest.schemaVersion === 4) return appHarnessDigest();
  return manifest.schemaVersion === 3 ? caseHarnessDigest(manifest) : harnessDigest();
}
export function establishedExpectation(manifest: Manifest): boolean {
  if (manifest.schemaVersion === 4) return appExpectationEstablished(manifest);
  return manifest.schemaVersion === 3 ? caseExpectationEstablished(manifest) : expectationEstablished(manifest);
}
/** Independently re-evaluate evidence. An outcome label alone never establishes behavior. */
export function evaluateObservation(manifest: Manifest, observation: unknown): 'target-failure' | 'requirement-satisfied' {
  if (manifest.schemaVersion === 3) return evaluateCaseObservation(manifest, observation);
  if (manifest.schemaVersion === 4) return evaluateAppObservation(manifest, observation);
  if (!expectationEstablished(manifest)) throw new ReproError('verification', 'PROVISIONAL_EXPECTATION', 'An established expectation is required.');
  if (!observation || typeof observation !== 'object') throw new ReproError('verification', 'MISSING_OBSERVATION', 'No complete assertion observation is available.');
  try { assertObservation(observation as Observation, manifest.expectation, searchContract(manifest)); return 'requirement-satisfied'; }
  catch (error) { if (error instanceof TargetFailure) return 'target-failure'; throw error; }
}
