import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ReproError, type Manifest, type Outcome, type RunResult, type Trial, type WorkbenchManifest } from './contracts.js';
import { type Job, type Ledger, validId } from './ledger.js';
import { digest, validateManifest } from './manifest.js';
import { searchContract } from './search-contract.js';
import { evaluateObservation, establishedExpectation } from './runner.js';

export type PublicRun = Omit<RunResult, 'events' | 'artifacts'>;
export interface JobInputEvidence {
  jobId: string; sessionId: string; availability: 'available' | 'unavailable';
  outcome: 'verified-input' | 'inconclusive'; reason: string; code?: string;
  manifest: WorkbenchManifest | null; manifestDigest: string | null;
}
export interface InspectedRun {
  runId: string; availability: 'available' | 'unavailable'; outcome: Outcome;
  reason: string; code?: string; result: PublicRun | null;
}
export interface TrialEvidence {
  jobId: string; sessionId: string; trialIndex: number; availability: 'available' | 'unavailable';
  outcome: Outcome; reason: string; code?: string; trial: Trial | null;
  candidate: WorkbenchManifest | null; runs: InspectedRun[];
}
const hash = /^[a-f0-9]{64}$/;
const outcomes: Outcome[] = ['target-failure', 'requirement-satisfied', 'inconclusive', 'cancelled'];
const categories = ['input', 'unsupported', 'environment', 'harness', 'target-failure', 'cancelled', 'verification'];
function problem(code: string, reason: string): never { throw new ReproError('verification', code, reason); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) problem('EVIDENCE_SCHEMA', 'Evidence has an unsupported structure.');
  return value as Record<string, unknown>;
}
function boundedString(value: unknown, maximum = 1024): value is string { return typeof value === 'string' && value.length <= maximum; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function errorDetails(error: unknown): { code: string; reason: string } {
  return error instanceof ReproError && error.category === 'verification' ? { code: error.code, reason: error.message }
    : { code: 'EVIDENCE_UNAVAILABLE', reason: 'The exact owned evidence is missing, unreadable, unsafe, or invalid.' };
}

/** No directory creation, scans, caller-supplied paths, or following links. Like paths.ts, this trusts the local workspace against concurrent ancestor replacement. */
async function readOwnedJson(root: string, parts: string[], limit: number): Promise<unknown> {
  const boundary = resolve('.repro-runs');
  const target = join(root, ...parts);
  const local = relative(boundary, target);
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) problem('EVIDENCE_BOUNDARY', 'Evidence must belong to the selected job.');
  let current = process.cwd();
  for (const part of relative(current, dirname(target)).split(sep)) {
    current = join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) problem('EVIDENCE_FILE', 'Evidence cannot traverse a link or non-directory.');
  }
  const before = await lstat(target);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) problem('EVIDENCE_FILE', 'Evidence must be a bounded regular single-link file.');
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit || stat.ino !== before.ino || stat.dev !== before.dev) problem('EVIDENCE_FILE', 'Evidence must be a bounded regular single-link file.');
    const buffer = Buffer.alloc(limit + 1); let bytes = 0;
    while (bytes < buffer.length) {
      const read = await file.read(buffer, bytes, buffer.length - bytes, null);
      if (!read.bytesRead) break; bytes += read.bytesRead;
    }
    if (bytes > limit) problem('EVIDENCE_SIZE', 'Evidence exceeds the supported size limit.');
    try { return JSON.parse(buffer.subarray(0, bytes).toString('utf8')) as unknown; }
    catch { problem('EVIDENCE_JSON', 'Evidence is not valid JSON.'); }
  } finally { await file.close(); }
}
function inspectionExecutionLimit(manifest: Manifest): number { return manifest.schemaVersion === 3 ? 80 : 50; }
function trialRecords(ledger: Ledger, job: Job, manifest: Manifest): unknown[] {
  const result = job.result === null ? null : record(job.result);
  // The existing local ledger is trusted; fixed coordinator budgets bound normal histories.
  const historyLimit = inspectionExecutionLimit(manifest) + 1;
  const events = ledger.events(job.id).filter(event => event.type === 'trial');
  if (events.length > historyLimit) problem('EVIDENCE_LIMIT', 'Reduction history exceeds the supported inspection limit.');
  const recorded: unknown[] = events.map(event => {
    try { return JSON.parse(event.message) as unknown; }
    catch { problem('EVIDENCE_JSON', 'Recorded trial history is not valid JSON.'); }
  });
  if (result && Array.isArray(result['trials'])) {
    const completed = result['trials'];
    if (completed.length > historyLimit) problem('EVIDENCE_LIMIT', 'Reduction history exceeds the supported inspection limit.');
    if (recorded.length > completed.length || recorded.some((trial, index) => digest(trial) !== digest(completed[index]))) {
      problem('TRIAL_HISTORY_MISMATCH', 'Completed reduction and recorded trial events disagree; exact trial evidence is INCONCLUSIVE.');
    }
    return completed;
  }
  return recorded;
}

export async function inspectJobInput(ledger: Ledger, jobId: string): Promise<JobInputEvidence> {
  const job = ledger.getJob(jobId);
  const identity = { jobId: job.id, sessionId: job.sessionId };
  try {
    const manifest = validateManifest(await readOwnedJson(ledger.root, ['artifacts', validId(job.id), 'manifest.json'], 65_536));
    if (manifest.schemaVersion === 4) throw new ReproError('unsupported', 'SESSION_SCHEMA', 'Local-app reports are inspected in their REPRO.md report.');
    const manifestDigest = digest(manifest);
    const result = job.result === null ? null : record(job.result);
    const recordedDigests: unknown[] = [];
    if (result?.['manifestDigest'] !== undefined) recordedDigests.push(result['manifestDigest']);
    if (job.operation === 'reduce') {
      if (result?.['baseline']) recordedDigests.push(record(result['baseline'])['manifestDigest']);
      const first = trialRecords(ledger, job, manifest)[0];
      if (first) recordedDigests.push(record(first)['inputDigest']);
    }
    if (recordedDigests.some(value => value !== manifestDigest)) problem('INPUT_IDENTITY_MISMATCH', 'Frozen input does not match the selected job’s recorded input identity.');
    return { ...identity, availability: 'available', outcome: recordedDigests.length ? 'verified-input' : 'inconclusive',
      reason: recordedDigests.length ? 'Frozen input matches the selected job’s recorded digest.' : 'Frozen input is readable; this job has no recorded digest to confirm its association yet.', manifest, manifestDigest };
  } catch (error) { return { ...identity, availability: 'unavailable', outcome: 'inconclusive', ...errorDetails(error), manifest: null, manifestDigest: null }; }
}

function parseTrial(value: unknown, index: number): Trial {
  const item = record(value);
  const fields = ['index', 'inputDigest', 'seed', 'removed', 'outcome', 'reason', 'durationMs', 'accepted', 'runIds'];
  if (Object.keys(item).length !== fields.length || Object.keys(item).some(key => !fields.includes(key)) || item['index'] !== index
    || typeof item['inputDigest'] !== 'string' || !hash.test(item['inputDigest']) || !Number.isSafeInteger(item['seed'])
    || !Array.isArray(item['removed']) || item['removed'].length > 256 || !item['removed'].every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id))
    || !Array.isArray(item['runIds']) || item['runIds'].length > 2 || !item['runIds'].every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id))
    || !outcomes.includes(item['outcome'] as Outcome) || typeof item['accepted'] !== 'boolean' || !boundedString(item['reason']) || !finite(item['durationMs'])) {
    problem('TRIAL_SCHEMA', 'The selected trial history is malformed or outside the supported bounds.');
  }
  return structuredClone(item) as unknown as Trial;
}
// Only registered synthetic observations/environment are exposed. Arbitrary raw events and artifact paths are never returned.
function publicRun(value: unknown, id: string, candidate: Manifest, expectedHarness: string): PublicRun {
  const run = record(value);
  const unstarted = (run['outcome'] === 'inconclusive' || run['outcome'] === 'cancelled') && run['appDigest'] === '' && run['assertionCount'] === 0 && run['observation'] === null;
  if (run['id'] !== id || run['manifestDigest'] !== digest(candidate) || run['assertionDigest'] !== candidate.assertionDigest
    || run['harnessDigest'] !== expectedHarness || !hash.test(expectedHarness) || run['appRevision'] !== candidate.app.revision
    || !unstarted && run['appDigest'] !== candidate.app.sourceDigest || run['adapterVersion'] !== candidate.adapter.version || run['runnerVersion'] !== candidate.runnerVersion || run['seed'] !== candidate.environment.seed) {
    problem('RUN_IDENTITY_MISMATCH', 'Run evidence does not match the selected trial’s input, assertion, harness, application, or execution identity.');
  }
  if (!outcomes.includes(run['outcome'] as Outcome) || !boundedString(run['reason']) || !finite(run['durationMs'])
    || !Number.isSafeInteger(run['assertionCount']) || Number(run['assertionCount']) < 0 || Number(run['assertionCount']) > 1
    || typeof run['startedAt'] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(run['startedAt']) || !Number.isFinite(Date.parse(run['startedAt']))
    || run['category'] !== undefined && (typeof run['category'] !== 'string' || !categories.includes(run['category']))) problem('RUN_SCHEMA', 'Run evidence has an unsupported structure.');
  const environment = record(run['environment']);
  if (typeof environment['platform'] !== 'string' || !/^(darwin|linux|win32)-(arm64|x64)$/.test(environment['platform'])
    || typeof environment['node'] !== 'string' || !/^v\d+\.\d+\.\d+$/.test(environment['node'])
    || typeof environment['browser'] !== 'string' || !/^(not-launched|\d+\.\d+\.\d+\.\d+( \(pinned Chromium\)| \(explicit installed Chrome channel\))?)$/.test(environment['browser'])
    || environment['isolation'] !== (candidate.schemaVersion === 3 ? 'registered public browser library; fresh owned profile; Chromium sandbox enabled; loopback asset allowlist; not a hostile-code sandbox' : 'registered trusted synthetic fixture; fresh Chromium sandbox/context; loopback HTTP allowlist; not a hostile-code sandbox')) problem('RUN_ENVIRONMENT', 'Run environment is outside the registered public evidence contract.');
  let observation: RunResult['observation'] = null;
  if (run['observation'] !== null) {
    if (candidate.schemaVersion === 4) problem('RUN_SCHEMA', 'Local-app runs are reviewed in their REPRO.md report, not this inspector.');
    else if (candidate.schemaVersion === 3) {
      try { evaluateObservation(candidate, run['observation']); }
      catch { problem('RUN_OBSERVATION', 'Run observation is outside the registered browser-case evidence contract.'); }
      const observed = record(run['observation']);
      observation = { kind: 'browser-case', values: [...observed['values'] as string[]] };
    } else {
      const contract = searchContract(candidate);
      const observed = record(run['observation']);
      const projected = { latestRequestId: observed['latestRequestId'], query: observed['query'], results: observed['results'] };
      if (!isDeepStrictEqual(projected, contract.expected) && !isDeepStrictEqual(projected, contract.stale)) problem('RUN_OBSERVATION', 'Run observation is outside the registered synthetic evidence contract.');
      observation = { latestRequestId: 2, query: contract.expected.query, results: [...observed['results'] as string[]] };
    }
  }
  const outcome = run['outcome'] as Outcome;
  if (outcome === 'target-failure' || outcome === 'requirement-satisfied') {
    if (run['assertionCount'] !== 1 || !observation || !establishedExpectation(candidate)) problem('RUN_ASSERTION', 'A conclusive outcome requires exactly one frozen assertion and its observation.');
    let actual: Outcome = 'requirement-satisfied';
    try { actual = evaluateObservation(candidate, observation); }
    catch { problem('RUN_OBSERVATION', 'The observation does not establish the recorded outcome.'); }
    if (actual !== outcome || run['category'] !== undefined && (outcome !== 'target-failure' || run['category'] !== 'target-failure')) problem('RUN_OUTCOME_MISMATCH', 'The recorded run outcome contradicts its assertion observation or category.');
  }
  return { id, outcome, reason: publicReason(run['reason'] as string), ...(run['category'] ? { category: run['category'] as RunResult['category'] & string } : {}),
    manifestDigest: run['manifestDigest'] as string, assertionDigest: candidate.assertionDigest, harnessDigest: expectedHarness,
    appRevision: candidate.app.revision, appDigest: run['appDigest'] as string, adapterVersion: candidate.adapter.version, runnerVersion: candidate.runnerVersion,
    seed: candidate.environment.seed, startedAt: run['startedAt'] as string, durationMs: run['durationMs'] as number, assertionCount: run['assertionCount'] as number,
    observation, environment: { platform: environment['platform'], node: environment['node'], browser: environment['browser'], isolation: environment['isolation'] as string } };
}
function publicReason(reason: string): string {
  // Explanations are text, not proof. Suppress unfamiliar text before rendering rather than exposing arbitrary artifact strings.
  const known = [
    'LATEST_SEARCH_RESPONSE_WINS: stale alpha results replaced the latest beta results.',
    'LATEST_SEARCH_RESPONSE_WINS: stale beta results replaced the latest alpha results.',
    'The frozen latest-response assertion passed after both controlled HTTP responses completed.',
    'MISSING_STEPS: The intended failure requires navigation and both ordered search requests; the proposed experiment is incomplete.',
    'The executed frozen assertion is satisfied by this revision.',
    'The frozen browser-case assertion observed the registered failure.',
    'The assertion has not executed.', 'Candidate has not executed.',
    'Reduction cancelled before the repetition rule was met.', 'Reduction budget exhausted before the repetition rule was met.',
    'Reduction cancelled during execution.', 'Reduction wall-time budget expired during execution.', 'Runner reported owned execution cancellation.',
    'Runner evidence was inconclusive; the target failure is not established.', 'Candidate was unstable across repetitions; failure preservation is unverified.',
    'Frozen requirement was satisfied; target failure was not reproduced.', 'Run outcome is unsupported; no failure claim is available.',
    'Run evidence does not match the frozen input, assertion, application, or execution identity.', 'Independent harness identity is missing or changed.',
    'Exactly one executed frozen assertion must establish this outcome.', 'No observation establishes the declared outcome.',
    'Observation does not establish the intended failure or requirement satisfaction.', 'Run label contradicts independent evaluation of its observation.',
    'Conclusive run has a contradictory error category.',
  ];
  return known.includes(reason) || /^Target failure preserved in [12]\/2 required repetitions\.$/.test(reason) ? reason : 'Recorded explanation is withheld because it is outside the registered public evidence text.';
}

export async function inspectTrial(ledger: Ledger, jobId: string, trialIndex: number): Promise<TrialEvidence> {
  const job = ledger.getJob(jobId);
  if (job.operation !== 'reduce' || !Number.isSafeInteger(trialIndex) || trialIndex < 0 || trialIndex > 80) throw new ReproError('input', 'NOT_FOUND', 'Reduction trial not found.');
  const identity = { jobId: job.id, sessionId: job.sessionId, trialIndex };
  let trial: Trial | null = null; let candidate: WorkbenchManifest | null = null;
  const runs: InspectedRun[] = [];
  try {
    const input = await inspectJobInput(ledger, job.id);
    if (!input.manifest || input.outcome !== 'verified-input') problem(input.code ?? 'INPUT_UNCONFIRMED', input.reason);
    const executionLimit = inspectionExecutionLimit(input.manifest);
    if (trialIndex > executionLimit) throw new ReproError('input', 'NOT_FOUND', 'Reduction trial not found.');
    const records = trialRecords(ledger, job, input.manifest);
    if (trialIndex >= records.length) throw new ReproError('input', 'NOT_FOUND', 'Reduction trial not found.');
    let best: WorkbenchManifest = input.manifest;
    let executions = 0;
    const seenRuns = new Set<string>();
    for (let index = 0; index <= trialIndex; index++) {
      const current = parseTrial(records[index], index);
      const removed = new Set(current.removed);
      if (removed.size !== current.removed.length || index === 0 && removed.size !== 0
        || current.removed.some(id => !best.actions.some(action => action.id === id))
        || JSON.stringify(best.actions.filter(action => removed.has(action.id)).map(action => action.id)) !== JSON.stringify(current.removed)) problem('TRIAL_REMOVAL_MISMATCH', 'Recorded removals do not match the preceding accepted candidate.');
      const reconstructed = validateManifest({ ...best, actions: (best.actions as { id: string }[]).filter(action => !removed.has(action.id)) }) as WorkbenchManifest;
      if (digest(reconstructed) !== current.inputDigest || current.seed !== reconstructed.environment.seed) problem('TRIAL_INPUT_MISMATCH', 'The exact trial candidate cannot be reconstructed from the frozen input and recorded removals.');
      if (current.runIds.some(id => seenRuns.has(id)) || new Set(current.runIds).size !== current.runIds.length) problem('TRIAL_RUN_MISMATCH', 'A run identifier is reused across reduction executions.');
      current.runIds.forEach(id => seenRuns.add(id));
      if (executions + current.runIds.length > executionLimit || index < trialIndex && index === 0 && !current.accepted || current.accepted !== (current.outcome === 'target-failure') || current.accepted && current.runIds.length !== 2) problem('TRIAL_DECISION_MISMATCH', 'Recorded acceptance does not satisfy the workbench repetition contract.');
      if (index === trialIndex) { trial = { ...current, reason: publicReason(current.reason) }; candidate = reconstructed; break; }
      executions += current.runIds.length;
      if (current.accepted) best = reconstructed;
    }
    if (!trial || !candidate) problem('TRIAL_INPUT_MISMATCH', 'The exact selected trial is unavailable.');
    const result = job.result === null ? null : record(job.result);
    // Historical association uses the baseline's recorded harness, which can differ from a later executable build.
    let expectedHarness = result?.['baseline'] ? record(result['baseline'])['harnessDigest'] : undefined;
    if (expectedHarness === undefined) {
      const baseline = parseTrial(records[0], 0); const id = baseline.runIds[0];
      if (!id) problem('BASELINE_UNAVAILABLE', 'The baseline has no recorded execution identity.');
      expectedHarness = record(await readOwnedJson(ledger.root, ['artifacts', job.id, 'execution-000001', validId(id), 'evidence.json'], 262_144))['harnessDigest'];
    }
    if (typeof expectedHarness !== 'string' || !hash.test(expectedHarness)) problem('BASELINE_UNAVAILABLE', 'The baseline harness identity is missing or invalid.');
    for (const [offset, runId] of trial.runIds.entries()) {
      try {
        const raw = await readOwnedJson(ledger.root, ['artifacts', job.id, `execution-${String(executions + offset + 1).padStart(6, '0')}`, validId(runId), 'evidence.json'], 262_144);
        const result = publicRun(raw, runId, candidate, expectedHarness);
        runs.push({ runId, availability: 'available', outcome: result.outcome, reason: result.reason, result });
      } catch (error) { runs.push({ runId, availability: 'unavailable', outcome: 'inconclusive', ...errorDetails(error), result: null }); }
    }
    if (!runs.length || runs.some(run => run.availability === 'unavailable')) problem('TRIAL_EVIDENCE_UNAVAILABLE', 'One or more exact recorded runs are unavailable or inconsistent; this trial is INCONCLUSIVE.');
    if (trial.accepted && runs.some(run => run.outcome !== 'target-failure') || trial.outcome === 'requirement-satisfied' && (runs.length !== 1 || runs[0]?.outcome !== 'requirement-satisfied')) problem('TRIAL_OUTCOME_MISMATCH', 'Recorded trial decision contradicts the exact run outcomes.');
    return { ...identity, availability: 'available', outcome: trial.outcome, reason: trial.reason, trial, candidate, runs };
  } catch (error) {
    if (error instanceof ReproError && error.code === 'NOT_FOUND') throw error;
    return { ...identity, availability: 'unavailable', outcome: 'inconclusive', ...errorDetails(error), trial, candidate, runs };
  }
}
