/** Constructed test instrumentation only; these values are not captured browser evidence or participant records. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createManifest, digest } from '../../src/manifest.js';
import { fixtureDigest } from '../../src/fixture.js';
import type { Manifest, RunResult, Trial } from '../../src/contracts.js';
import type { JobInputEvidence, TrialEvidence } from '../../src/evidence-inspector.js';
import type { CaseJob, HciCase, ExportDocument } from '../../scripts/hci-case.js';

export const SHA = 'a'.repeat(64);
const TIME = '2026-10-13T00:00:00.000Z';
export const IDS = { session: '11111111-1111-4111-8111-111111111111', record: '22222222-2222-4222-8222-222222222222', reduction: '33333333-3333-4333-8333-333333333333', comparison: '44444444-4444-4444-8444-444444444444', export: '55555555-5555-4555-8555-555555555555', cancelled: '66666666-6666-4666-8666-666666666666' };
function run(manifest: Manifest, id: string, outcome: RunResult['outcome'] = 'target-failure'): RunResult {
  const conclusive = outcome === 'target-failure' || outcome === 'requirement-satisfied';
  const revision = outcome === 'requirement-satisfied' ? 'fixed' : manifest.app.revision;
  return { id, outcome, reason: outcome === 'target-failure' ? 'LATEST_SEARCH_RESPONSE_WINS: stale alpha results replaced the latest beta results.' : outcome === 'requirement-satisfied' ? 'The frozen latest-response assertion passed after both controlled HTTP responses completed.' : 'The assertion has not executed.', ...(outcome === 'target-failure' ? { category: 'target-failure' as const } : {}), manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest, harnessDigest: SHA, appRevision: revision, appDigest: conclusive ? fixtureDigest(revision) : '', adapterVersion: manifest.adapter.version, runnerVersion: manifest.runnerVersion, seed: manifest.environment.seed, startedAt: TIME, durationMs: 10, assertionCount: conclusive ? 1 : 0, observation: conclusive ? { latestRequestId: 2, query: 'beta', results: [outcome === 'target-failure' ? 'Alpha synthetic result' : 'Beta synthetic result'] } : null, events: [], artifacts: [], environment: { platform: 'darwin-arm64', node: 'v26.7.0', browser: conclusive ? '156.0.8078.4 (pinned Chromium)' : 'not-launched', isolation: 'registered trusted synthetic fixture; fresh Chromium sandbox/context; loopback HTTP allowlist; not a hostile-code sandbox' } };
}
function input(jobId: string, manifest: Manifest): JobInputEvidence {
  return { jobId, sessionId: IDS.session, availability: 'available', outcome: 'verified-input', reason: 'Frozen input matches the selected job’s recorded digest.', manifest, manifestDigest: digest(manifest) };
}
function evidence(jobId: string, candidate: Manifest, trial: Trial, runs: RunResult[]): TrialEvidence {
  return { jobId, sessionId: IDS.session, trialIndex: trial.index, availability: 'available', outcome: trial.outcome, reason: trial.reason, trial, candidate, runs: runs.map(result => { const { events: _events, artifacts: _artifacts, ...publicResult } = result; return { runId: result.id, availability: 'available', outcome: result.outcome, reason: result.reason, result: publicResult }; }) };
}
export function exportReferenceDocuments(): ExportDocument[] {
  return (['README.md', 'replay.test.mjs'] as const).map(name => {
    const bytes = readFileSync(new URL(`../../research/hci/export-reference/${name}`, import.meta.url));
    return { name, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, text: bytes.toString('utf8') };
  });
}
export function caseFixture(): HciCase {
  const recorded = createManifest();
  const original = { ...recorded, environment: { ...recorded.environment, timeoutMs: 1500 } };
  const reduced = { ...original, actions: original.actions.filter(action => !['focus-before', 'focus-after'].includes(action.id)) };
  const baseline = [run(original, 'baseline-first'), run(original, 'baseline-second')];
  const accepted = [run(reduced, 'reduced-first'), run(reduced, 'reduced-second')];
  const incompleteInput = { ...reduced, actions: reduced.actions.filter(action => action.id !== 'search-beta') };
  const incomplete = run(incompleteInput, 'incomplete-run', 'inconclusive');
  incomplete.reason = 'MISSING_STEPS: The intended failure requires navigation and both ordered search requests; the proposed experiment is incomplete.';
  incomplete.category = 'input';
  const trials: Trial[] = [
    { index: 0, inputDigest: digest(original), seed: original.environment.seed, removed: [], outcome: 'target-failure', reason: 'Target failure preserved in 2/2 required repetitions.', durationMs: 20, accepted: true, runIds: baseline.map(item => item.id) },
    { index: 1, inputDigest: digest(reduced), seed: original.environment.seed, removed: ['focus-before', 'focus-after'], outcome: 'target-failure', reason: 'Target failure preserved in 2/2 required repetitions.', durationMs: 20, accepted: true, runIds: accepted.map(item => item.id) },
    { index: 2, inputDigest: digest(incompleteInput), seed: original.environment.seed, removed: ['search-beta'], outcome: 'inconclusive', reason: 'Run evidence does not match the frozen input, assertion, application, or execution identity.', durationMs: 10, accepted: false, runIds: [incomplete.id] },
  ];
  const cancelled = run(reduced, 'cancelled-baseline', 'cancelled');
  const cancelledTrial: Trial = { index: 0, inputDigest: digest(reduced), seed: reduced.environment.seed, removed: [], outcome: 'cancelled', reason: 'Reduction cancelled before the repetition rule was met.', durationMs: 0, accepted: false, runIds: [cancelled.id] };
  const cancelledEvidence: TrialEvidence = { jobId: IDS.cancelled, sessionId: IDS.session, trialIndex: 0, availability: 'unavailable', outcome: 'inconclusive', reason: 'One or more exact recorded runs are unavailable or inconsistent; this trial is INCONCLUSIVE.', code: 'TRIAL_EVIDENCE_UNAVAILABLE', trial: cancelledTrial, candidate: reduced, runs: [{ runId: cancelled.id, availability: 'unavailable', outcome: 'inconclusive', reason: 'The exact owned evidence is missing, unreadable, unsafe, or invalid.', code: 'EVIDENCE_UNAVAILABLE', result: null }] };
  const row = (id: string, operation: CaseJob['job']['operation'], manifest: Manifest, result: CaseJob['job']['result'], selectedTrials: TrialEvidence[] = [], status: CaseJob['job']['status'] = 'complete'): CaseJob => ({ job: { id, sessionId: IDS.session, operation, status, startedAt: TIME, result }, events: [{ seq: 1, at: TIME, type: 'started', message: `${operation} started` }, { seq: 2, at: TIME, type: status, message: `${operation} ${status}` }], input: input(id, manifest), trials: selectedTrials });
  const jobs: CaseJob[] = [
    row(IDS.record, 'record', recorded, run(recorded, 'record-run')),
    row(IDS.reduction, 'reduce', original, { manifest: reduced, trials, baseline: baseline[0]!, status: 'complete', minimality: 'unverified', reason: 'All removable dependency groups tested under the configured budget.', executions: 5, durationMs: 50 }, trials.map((trial, index) => evidence(IDS.reduction, index === 2 ? incompleteInput : index ? reduced : original, trial, index === 2 ? [incomplete] : index ? accepted : baseline))),
    row(IDS.comparison, 'verify', reduced, { outcome: 'requirement-satisfied', reason: 'Original failure reproduced; candidate satisfies the same bounded frontend assertion.', manifestDigest: digest(reduced), original: run(reduced, 'comparison-original'), candidate: run(reduced, 'comparison-candidate', 'requirement-satisfied') }),
    row(IDS.export, 'export', reduced, { path: `local-export:${IDS.export}`, manifestDigest: digest(reduced), files: 3 }),
    row(IDS.cancelled, 'reduce', reduced, { manifest: reduced, trials: [cancelledTrial], baseline: cancelled, status: 'cancelled', minimality: 'unverified', reason: 'Baseline did not preserve the target failure.', executions: 1, durationMs: 0 }, [cancelledEvidence], 'cancelled'),
  ];
  const files = [{ path: 'ledger.sqlite', sha256: SHA, bytes: 4096 }, ...jobs.flatMap(item => [{ path: `artifacts/${item.job.id}/manifest.json`, sha256: SHA, bytes: 2048 }, { path: `artifacts/${item.job.id}/result.json`, sha256: SHA, bytes: 1024 }])];
  for (const [index, result] of [...baseline, ...accepted, incomplete].entries()) files.push({ path: `artifacts/${IDS.reduction}/execution-${String(index + 1).padStart(6, '0')}/${result.id}/evidence.json`, sha256: SHA, bytes: 1024 });
  for (const [jobId, runIds] of [[IDS.record, ['record-run']], [IDS.comparison, ['comparison-original', 'comparison-candidate']]] as const) for (const runId of runIds) files.push({ path: `artifacts/${jobId}/${runId}/evidence.json`, sha256: SHA, bytes: 1024 });
  const exportDocuments = exportReferenceDocuments();
  for (const doc of exportDocuments) files.push({ path: `exports/${IDS.export}/${doc.name}`, sha256: doc.sha256, bytes: doc.bytes });
  files.push({ path: `exports/${IDS.export}/integrity.json`, sha256: SHA, bytes: 1024 });
  const fixture: HciCase = { schemaVersion: 1, classification: 'real-synthetic-execution-evidence', mode: 'inspection-only', caseId: 'independent-synthetic-test', failureFamily: 'synthetic-search-stale-response', source: { commit: 'b'.repeat(40), runtimeInventorySha256: SHA, databaseSha256: SHA, files }, session: { id: IDS.session, createdAt: TIME, state: 'cancelled', manifest: reduced, consent: true }, roles: { record: IDS.record, reduction: IDS.reduction, comparison: IDS.comparison, export: IDS.export, cancelled: IDS.cancelled }, defaultJobId: IDS.record, jobs, exportDocuments, redactions: [...jobs.map((_, index) => ({ pointer: `/jobs/${index}/job/requestKey`, kind: 'request-key-omitted' as const })), { pointer: '/jobs/3/job/result/path', kind: 'host-path-replaced' }], excludedArtifacts: ['trace-bytes', 'screenshot-bytes', 'export-execution-bundle'] };
  return JSON.parse(JSON.stringify(fixture)) as HciCase;
}
