import { createHash } from 'node:crypto';
import type { Manifest, ReductionResult, RunEvent, RunResult, Trial } from '../src/contracts.js';
import { canonicalJson, digest, validateManifest } from '../src/manifest.js';
import { assertObservation, EXPECTATION, TargetFailure } from '../src/oracle.js';
import type { JobInputEvidence, TrialEvidence } from '../src/evidence-inspector.js';
import type { Job, Session } from '../src/ledger.js';

export interface CaseRoles { record: string; reduction: string; comparison: string; export: string; cancelled: string }
export interface SourceFile { path: string; sha256: string; bytes: number }
export interface ExportDocument { name: 'README.md' | 'replay.test.mjs'; sha256: string; bytes: number; text: string }
/** Reviewed inert generator templates; changing these bytes requires a new explicit document review. */
export const EXPORT_DOCUMENT_REFERENCES = Object.freeze({
  'README.md': Object.freeze({ sha256: '0d8a36d407095b7d8eb8602172d93298c1370a441a922fc1b8ecbccc31e846d0', bytes: 7447 }),
  'replay.test.mjs': Object.freeze({ sha256: 'e3c1bbd15079c02cf99365a9a952887f0d085ccfbfea76a23b54daeb411a6ad8', bytes: 1310 }),
});
export interface CaseRedaction {
  pointer: string;
  kind: 'request-key-omitted' | 'host-path-replaced' | 'unregistered-text-withheld';
}
export type CaseRun = RunResult;
export type CaseResult = CaseRun | ReductionResult | {
  outcome: 'requirement-satisfied' | 'inconclusive' | 'cancelled'; reason: string; manifestDigest: string;
  original: CaseRun; candidate: CaseRun;
} | { path: string; manifestDigest: string; files: number };
export interface CaseJob {
  job: Omit<Job, 'requestKey' | 'result'> & { result: CaseResult };
  events: RunEvent[]; input: JobInputEvidence; trials: TrialEvidence[];
}
export interface HciCase {
  schemaVersion: 1;
  classification: 'real-synthetic-execution-evidence';
  mode: 'inspection-only';
  caseId: string;
  failureFamily: 'synthetic-search-stale-response';
  source: { commit: string; runtimeInventorySha256: string; databaseSha256: string; files: SourceFile[] };
  session: Session;
  roles: CaseRoles;
  defaultJobId: string;
  jobs: CaseJob[];
  exportDocuments: ExportDocument[];
  redactions: CaseRedaction[];
  excludedArtifacts: ['trace-bytes', 'screenshot-bytes', 'export-execution-bundle'];
}
export interface HciCasePacket { schemaVersion: 1; caseSha256: string; evidence: HciCase }
export class HciCaseError extends Error {
  constructor(message: string, readonly code = 'HCI_CASE_INPUT', readonly category: 'input' | 'environment' = 'input', options?: ErrorOptions) { super(message, options); this.name = 'HciCaseError'; }
}
export const WITHHELD_TEXT = 'Unregistered recorded text withheld.';
const INSPECTOR_WITHHELD_TEXT = 'Recorded explanation is withheld because it is outside the registered public evidence text.';
export function isWithheldText(value: string): boolean {
  return value === WITHHELD_TEXT || value === INSPECTOR_WITHHELD_TEXT;
}
const registeredText = new Set([
  WITHHELD_TEXT,
  'LATEST_SEARCH_RESPONSE_WINS: stale alpha results replaced the latest beta results.',
  'The frozen latest-response assertion passed after both controlled HTTP responses completed.',
  'MISSING_STEPS: The intended failure requires navigation and both ordered search requests; the proposed experiment is incomplete.',
  'The assertion has not executed.', 'Candidate has not executed.', 'Baseline has not executed.',
  'Reduction cancelled before the repetition rule was met.', 'Reduction budget exhausted before the repetition rule was met.',
  'Reduction cancelled during execution.', 'Reduction wall-time budget expired during execution.', 'Runner reported owned execution cancellation.',
  'Runner evidence was inconclusive; the target failure is not established.', 'Candidate was unstable across repetitions; failure preservation is unverified.',
  'Frozen requirement was satisfied; target failure was not reproduced.', 'Run outcome is unsupported; no failure claim is available.',
  'Run evidence does not match the frozen input, assertion, application, or execution identity.', 'Independent harness identity is missing or changed.',
  'Exactly one executed frozen assertion must establish this outcome.', 'No observation establishes the declared outcome.',
  'Observation does not establish the intended failure or requirement satisfaction.', 'Run label contradicts independent evaluation of its observation.',
  'Conclusive run has a contradictory error category.',
  'CANCELLED: The owner cancelled before run finalization.', 'CANCELLED: The owner cancelled this run.',
  'Frozen input matches the selected job’s recorded digest.',
  'Frozen input is readable; this job has no recorded digest to confirm its association yet.',
  'The exact owned evidence is missing, unreadable, unsafe, or invalid.',
  'One or more exact recorded runs are unavailable or inconsistent; this trial is INCONCLUSIVE.',
  'The exact selected trial is unavailable.',
  INSPECTOR_WITHHELD_TEXT,
  'Frozen input does not match the selected job’s recorded input identity.',
  'Run evidence does not match the selected trial’s input, assertion, harness, application, or execution identity.',
  'The observation does not establish the recorded outcome.',
  'The recorded run outcome contradicts its assertion observation or category.',
  'Recorded trial decision contradicts the exact run outcomes.',
  'Original failure reproduced; candidate satisfies the same bounded frontend assertion.',
  'Comparison did not establish original failure and candidate satisfaction with identical assertion and harness.',
  'Reduction stopped with the best verified candidate; final neighbors remain unverified.',
  'Search completed, but inconclusive or unstable final neighbors leave dependency-group minimality unverified.',
  'Every permitted single dependency-group deletion of the final candidate was tested and did not preserve the failure. This is not global minimality.',
  'All removable dependency groups tested under the configured budget.', 'Baseline did not preserve the target failure.',
  'Fresh owned HTTP service, browser process, and empty browser context requested.',
  'Observed registered frontend ready in a fresh context.', 'Focused the search input.',
  'Running original in fresh state', 'Running candidate in separate fresh state',
  'Validating and writing capsule into a temporary directory',
  'Cancellation requested; closing only this run’s browser and fixture.',
  'Run interrupted before durable completion. Retry with a fresh run.',
]);
export function isPublicText(value: string): boolean {
  if (value.length > 1024) return false;
  return registeredText.has(value)
    || /^Target failure preserved in [12]\/2 required repetitions\.$/.test(value)
    || /^(record|replay|reduce|verify|export) (started|complete|cancelled|failed|interrupted)$/.test(value)
    || /^Observed trusted (input|submit) event for synthetic query (alpha|beta)\.$/.test(value)
    || /^Observed HTTP search request [12] for (alpha|beta)\.$/.test(value)
    || /^HTTP response [12] completed in the frontend\.$/.test(value)
    || value.startsWith('Baseline was not established under the repetition rule. ') && isPublicText(value.slice('Baseline was not established under the repetition rule. '.length));
}
const outcomes = ['target-failure', 'requirement-satisfied', 'inconclusive', 'cancelled'];
const categories = ['input', 'unsupported', 'environment', 'harness', 'target-failure', 'cancelled', 'verification'];
const roleNames = ['record', 'reduction', 'comparison', 'export', 'cancelled'] as const;
function fail(message: string): never { throw new HciCaseError(message); }
function strictJson(value: unknown, ancestors = new Set<object>(), depth = 0, budget = { visits: 0 }): void {
  if (++budget.visits > 20000) fail('JSON exceeds its total node limit.');
  if (depth > 32) fail('JSON nesting exceeds the supported limit.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('Non-finite JSON number.'); return; }
  if (typeof value !== 'object') fail('Unsupported JSON value.');
  if (ancestors.has(value)) fail('Cyclic JSON value.');
  if (Object.getOwnPropertySymbols(value).length) fail('Symbol properties are unsupported.');
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail('Expected plain JSON data.');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors);
  if (keys.length > 10000 || array && (keys.length !== value.length + 1 || value.length > 10000)) fail('Invalid or excessive JSON array/object.');
  ancestors.add(value);
  for (const key of keys) {
    if (array && key === 'length') continue;
    const descriptor = descriptors[key]!;
    if (!('value' in descriptor) || !descriptor.enumerable || array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) fail('Accessors, sparse arrays and hidden properties are unsupported.');
    strictJson(descriptor.value, ancestors, depth + 1, budget);
  }
  ancestors.delete(value);
}
/** Parse bounded serialized evidence without silently discarding duplicate fields. */
export function parseCaseJson(text: string, maximumBytes = 4 * 1024 * 1024): unknown {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 4 * 1024 * 1024) fail('Invalid JSON byte limit.');
  if (typeof text !== 'string' || Buffer.byteLength(text) > maximumBytes) fail('JSON exceeds its byte limit.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (cause) { throw new HciCaseError('Evidence JSON is invalid.', 'HCI_CASE_INPUT', 'input', { cause }); }
  const stack: ({ keys: Set<string>; keyExpected: boolean } | null)[] = [];
  // Syntax is valid; decode only member-name tokens to detect escaped-equivalent keys at every depth.
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '{') stack.push({ keys: new Set(), keyExpected: true });
    else if (character === '[') stack.push(null);
    else if (character === '}' || character === ']') stack.pop();
    else if (character === ',') { const frame = stack.at(-1); if (frame) frame.keyExpected = true; }
    else if (character === '"') {
      const start = index;
      for (index++; index < text.length; index++) { if (text[index] === '\\') index++; else if (text[index] === '"') break; }
      const frame = stack.at(-1);
      if (frame?.keyExpected) { const key = JSON.parse(text.slice(start, index + 1)) as string; if (frame.keys.has(key)) fail('Evidence JSON contains a duplicate object field.'); frame.keys.add(key); frame.keyExpected = false; }
    }
    if (stack.length > 33) fail('JSON nesting exceeds the supported limit.');
  }
  strictJson(value); return value;
}
function object(value: unknown, fields: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object.');
  const keys = Object.keys(value);
  if (fields.some(key => !Object.hasOwn(value, key)) || keys.some(key => !fields.includes(key) && !optional.includes(key))) fail('Missing or unknown object field.');
  return value as Record<string, unknown>;
}
function list(value: unknown, maximum: number): unknown[] { if (!Array.isArray(value) || value.length > maximum) fail('Expected a bounded array.'); return value; }
function string(value: unknown, max = 1024): string { if (typeof value !== 'string' || value.length > max) fail('Expected bounded text.'); return value; }
function id(value: unknown): string { const text = string(value, 100); if (!/^[A-Za-z0-9_-]{1,100}$/.test(text)) fail('Invalid identity.'); return text; }
function hash(value: unknown): string { const text = string(value, 64); if (!/^[a-f0-9]{64}$/.test(text)) fail('Invalid SHA-256.'); return text; }
function number(value: unknown, max = Number.MAX_SAFE_INTEGER, integer = true): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || integer && !Number.isSafeInteger(value)) fail('Invalid bounded number.'); return value; }
function choice(value: unknown, choices: readonly string[]): string { const text = string(value); if (!choices.includes(text)) fail('Unsupported value.'); return text; }
function date(value: unknown): void { const text = string(value, 24); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) || new Date(text).toISOString() !== text) fail('Invalid timestamp.'); }
function explanation(value: unknown): void { if (!isPublicText(string(value))) fail('Unregistered public explanation.'); }
function unique(values: string[]): void { if (new Set(values).size !== values.length) fail('Duplicate identity.'); }
function same(left: unknown, right: unknown): void { if (digest(left) !== digest(right)) fail('Evidence association mismatch.'); }
function trial(value: unknown, index: number): Trial {
  const item = object(value, ['index', 'inputDigest', 'seed', 'removed', 'outcome', 'reason', 'durationMs', 'accepted', 'runIds']);
  if (number(item.index, 50) !== index) fail('Trial index must be contiguous.');
  hash(item.inputDigest); number(item.seed, 0xffffffff); choice(item.outcome, outcomes); explanation(item.reason); number(item.durationMs, Number.MAX_SAFE_INTEGER, false);
  const removed = list(item.removed, 256).map(id), runs = list(item.runIds, 2).map(id); unique(removed); unique(runs);
  if (typeof item.accepted !== 'boolean' || item.accepted && (item.outcome !== 'target-failure' || runs.length !== 2)) fail('Invalid recorded trial decision.');
  return value as Trial;
}
function events(value: unknown): void {
  let previous = 0;
  for (const raw of list(value, 1024)) {
    const event = object(raw, ['seq', 'at', 'type', 'message'], ['actionId']);
    const seq = number(event.seq); if (seq <= previous) fail('Event order is not strictly increasing.'); previous = seq; date(event.at);
    choice(event.type, ['started', 'complete', 'cancelled', 'failed', 'interrupted', 'progress', 'trial', 'reset', 'action-executed', 'browser-input', 'request-issued', 'response-completed', 'assertion', 'cancel-requested']);
    if (event.actionId !== undefined) id(event.actionId);
    if (event.type === 'trial') { const parsed = parseCaseJson(string(event.message, 65536), 65536); trial(parsed, Number((parsed as Trial | null)?.index)); }
    else explanation(event.message);
  }
}
function run(value: unknown, jobId: string, full: boolean): RunResult {
  const base = ['id', 'outcome', 'reason', 'manifestDigest', 'assertionDigest', 'harnessDigest', 'appRevision', 'appDigest', 'adapterVersion', 'runnerVersion', 'seed', 'startedAt', 'durationMs', 'assertionCount', 'observation', 'environment'];
  const item = object(value, full ? [...base, 'events', 'artifacts'] : base, ['category']);
  const runId = id(item.id); choice(item.outcome, outcomes); explanation(item.reason); hash(item.manifestDigest); hash(item.assertionDigest);
  if (item.harnessDigest !== '' || item.assertionCount !== 0) hash(item.harnessDigest);
  if (item.appDigest !== '' || item.assertionCount !== 0) hash(item.appDigest);
  choice(item.appRevision, ['buggy', 'fixed']);
  for (const key of ['adapterVersion', 'runnerVersion']) if (!/^\d+\.\d+\.\d+$/.test(string(item[key], 40))) fail('Invalid version.');
  number(item.seed, 0xffffffff); date(item.startedAt); number(item.durationMs, Number.MAX_SAFE_INTEGER, false); number(item.assertionCount, 1);
  if (item.category !== undefined) choice(item.category, categories);
  if (item.observation !== null) { const observed = object(item.observation, ['latestRequestId', 'query', 'results']); if (observed.latestRequestId !== 2 || observed.query !== 'beta') fail('Unsupported observation.'); const results = list(observed.results, 1); if (results.length !== 1) fail('Incomplete observation.'); choice(results[0], ['Alpha synthetic result', 'Beta synthetic result']); }
  if (['target-failure', 'requirement-satisfied'].includes(String(item.outcome)) && (item.assertionCount !== 1 || item.observation === null)) fail('Conclusive record lacks an assertion observation.');
  if (item.outcome === 'target-failure' || item.outcome === 'requirement-satisfied') {
    let observed = 'requirement-satisfied';
    try { assertObservation(item.observation as RunResult['observation'] & object, EXPECTATION); }
    catch (error) { if (error instanceof TargetFailure) observed = 'target-failure'; else fail('Unsupported assertion observation.'); }
    if (observed !== item.outcome || item.category !== undefined && item.category !== 'target-failure') fail('Conclusive outcome contradicts the frozen assertion.');
  }
  const environment = object(item.environment, ['platform', 'node', 'browser', 'isolation']);
  if (!/^(darwin|linux|win32)(-(arm64|x64))?$/.test(string(environment.platform)) || !/^v\d+\.\d+\.\d+$/.test(string(environment.node)) || !/^(not-run|not-launched|\d+\.\d+\.\d+\.\d+( \(pinned Chromium\)| \(explicit installed Chrome channel\))?)$/.test(string(environment.browser))) fail('Unsupported environment.');
  choice(environment.isolation, ['not-run', 'registered trusted synthetic fixture; fresh Chromium sandbox/context; loopback HTTP allowlist; not a hostile-code sandbox']);
  if (full) {
    events(item.events);
    const paths: string[] = [];
    for (const [index, raw] of list(item.artifacts, 32).entries()) { const artifact = object(raw, ['path', 'sha256', 'bytes']); if (artifact.path !== `evidence-artifact:${jobId}:${runId}:${index}`) fail('Raw or misbound artifact path.'); paths.push(String(artifact.path)); hash(artifact.sha256); number(artifact.bytes, 32 * 1024 * 1024); }
    unique(paths);
  }
  return value as RunResult;
}
function input(value: unknown, jobId: string, sessionId: string): JobInputEvidence {
  const item = object(value, ['jobId', 'sessionId', 'availability', 'outcome', 'reason', 'manifest', 'manifestDigest'], ['code']);
  if (item.jobId !== jobId || item.sessionId !== sessionId) fail('Cross-job input.');
  choice(item.availability, ['available', 'unavailable']); choice(item.outcome, ['verified-input', 'inconclusive']); explanation(item.reason);
  if (item.code !== undefined && !/^[A-Z][A-Z0-9_]{0,80}$/.test(string(item.code))) fail('Invalid evidence code.');
  if (item.availability === 'unavailable') { if (item.outcome !== 'inconclusive' || item.manifest !== null || item.manifestDigest !== null) fail('Unavailable input cannot supply a manifest.'); }
  else { const manifest = validateManifest(item.manifest); if (hash(item.manifestDigest) !== digest(manifest)) fail('Input digest mismatch.'); }
  return value as JobInputEvidence;
}
function inspect(value: unknown, row: CaseJob, index: number, recorded: Trial): TrialEvidence {
  const item = object(value, ['jobId', 'sessionId', 'trialIndex', 'availability', 'outcome', 'reason', 'trial', 'candidate', 'runs'], ['code']);
  if (item.jobId !== row.job.id || item.sessionId !== row.job.sessionId || item.trialIndex !== index) fail('Cross-job or noncontiguous trial.');
  choice(item.availability, ['available', 'unavailable']); choice(item.outcome, outcomes); explanation(item.reason);
  if (item.code !== undefined && !/^[A-Z][A-Z0-9_]{0,80}$/.test(string(item.code))) fail('Invalid evidence code.');
  if (item.trial !== null) same(trial(item.trial, index), recorded);
  if (item.candidate !== null && digest(validateManifest(item.candidate)) !== recorded.inputDigest) fail('Trial candidate digest mismatch.');
  if (item.availability === 'unavailable' && item.outcome !== 'inconclusive') fail('Unavailable trial must be inconclusive.');
  if (item.availability === 'available' && (item.trial === null || item.candidate === null || item.outcome !== recorded.outcome)) fail('Available trial lacks recorded association.');
  if (item.availability === 'available' && recorded.accepted !== (recorded.outcome === 'target-failure')) fail('Available trial decision contradicts its recorded outcome.');
  const runs = list(item.runs, 2);
  if (runs.length > recorded.runIds.length) fail('Unexpected linked runs.');
  for (const [offset, raw] of runs.entries()) {
    const linked = object(raw, ['runId', 'availability', 'outcome', 'reason', 'result'], ['code']);
    if (linked.runId !== recorded.runIds[offset]) fail('Run binding mismatch.'); choice(linked.availability, ['available', 'unavailable']); choice(linked.outcome, outcomes); explanation(linked.reason);
    if (linked.code !== undefined && !/^[A-Z][A-Z0-9_]{0,80}$/.test(string(linked.code))) fail('Invalid run evidence code.');
    if (linked.availability === 'unavailable') { if (linked.result !== null || linked.outcome !== 'inconclusive') fail('Unavailable run cannot establish an outcome.'); }
    else { const result = run(linked.result, row.job.id, false); if (result.id !== linked.runId || result.manifestDigest !== recorded.inputDigest || result.outcome !== linked.outcome || result.seed !== recorded.seed) fail('Linked run identity mismatch.'); if (item.candidate !== null) bindInput(result, item.candidate as Manifest); }
  }
  if (item.availability === 'available' && (runs.length !== recorded.runIds.length || !runs.length || runs.some(raw => (raw as Record<string, unknown>).availability !== 'available'))) fail('Available trial lacks linked evidence.');
  if (item.availability === 'available' && (recorded.accepted && runs.some(raw => (raw as Record<string, unknown>).outcome !== 'target-failure') || recorded.outcome === 'requirement-satisfied' && (runs.length !== 1 || (runs[0] as Record<string, unknown>).outcome !== 'requirement-satisfied'))) fail('Available trial contradicts linked observations.');
  return value as TrialEvidence;
}
function bindInput(result: Pick<RunResult, 'appRevision' | 'appDigest' | 'outcome' | 'assertionCount' | 'observation' | 'assertionDigest' | 'adapterVersion' | 'runnerVersion' | 'seed'>, manifest: Manifest, fixedCandidate = false): void {
  const unstarted = (result.outcome === 'inconclusive' || result.outcome === 'cancelled') && result.assertionCount === 0 && result.observation === null && result.appDigest === '';
  if (result.appRevision !== (fixedCandidate ? 'fixed' : manifest.app.revision) || result.assertionDigest !== manifest.assertionDigest || result.adapterVersion !== manifest.adapter.version || result.runnerVersion !== manifest.runnerVersion || result.seed !== manifest.environment.seed) fail('Run execution identity differs from its input.');
  if (!unstarted) {
    if (fixedCandidate) validateManifest({ ...manifest, app: { revision: 'fixed', sourceDigest: result.appDigest } });
    else if (result.appDigest !== manifest.app.sourceDigest) fail('Run application digest differs from its input.');
  }
  if ((result.outcome === 'target-failure' || result.outcome === 'requirement-satisfied') && manifest.expectationBasis !== 'supplied-synthetic-specification') fail('Conclusive evidence needs an established expectation.');
}
export function validateCase(value: unknown): HciCase {
  strictJson(value); canonicalJson(value);
  const data = object(value, ['schemaVersion', 'classification', 'mode', 'caseId', 'failureFamily', 'source', 'session', 'roles', 'defaultJobId', 'jobs', 'exportDocuments', 'redactions', 'excludedArtifacts']);
  if (data.schemaVersion !== 1 || data.classification !== 'real-synthetic-execution-evidence' || data.mode !== 'inspection-only' || data.failureFamily !== 'synthetic-search-stale-response') fail('Unsupported case contract.'); id(data.caseId);
  const source = object(data.source, ['commit', 'runtimeInventorySha256', 'databaseSha256', 'files']);
  if (!/^[a-f0-9]{40}$/.test(string(source.commit))) fail('Invalid source commit.'); hash(source.runtimeInventorySha256); hash(source.databaseSha256);
  const inventory = list(source.files, 256).map(raw => { const file = object(raw, ['path', 'sha256', 'bytes']); const path = string(file.path, 512); if (!/^(ledger\.sqlite|artifacts\/[A-Za-z0-9_-]{1,100}\/(manifest\.json|result\.json|(?:execution-\d{6}\/)?[A-Za-z0-9_-]{1,100}\/evidence\.json)|exports\/[A-Za-z0-9_-]{1,100}\/(README\.md|replay\.test\.mjs|integrity\.json))$/.test(path)) fail('Unsafe or unsupported source resource.'); hash(file.sha256); number(file.bytes, path === 'ledger.sqlite' ? 8 * 1024 * 1024 : 512 * 1024); return file as unknown as SourceFile; });
  unique(inventory.map(file => file.path)); if (inventory.find(file => file.path === 'ledger.sqlite')?.sha256 !== source.databaseSha256) fail('Database inventory mismatch.');
  const paths = new Set(inventory.map(file => file.path));
  const session = object(data.session, ['id', 'createdAt', 'state', 'manifest', 'consent']); const sessionId = id(session.id); date(session.createdAt); choice(session.state, ['ready', 'complete', 'cancelled', 'blocked']); validateManifest(session.manifest); if (session.consent !== true) fail('Recorded synthetic consent missing.');
  const roles = object(data.roles, [...roleNames]); const ids = roleNames.map(role => id(roles[role])); unique(ids); if (!ids.includes(id(data.defaultJobId))) fail('Default job is not in the case.');
  const documents = list(data.exportDocuments, 2);
  if (documents.length !== 2) fail('Both inert export reference documents are required.');
  const documentNames: string[] = [];
  for (const raw of documents) {
    const document = object(raw, ['name', 'sha256', 'bytes', 'text']);
    const name = choice(document.name, ['README.md', 'replay.test.mjs']) as ExportDocument['name']; documentNames.push(name);
    const text = string(document.text, 65536), bytes = Buffer.from(text, 'utf8');
    const approved = EXPORT_DOCUMENT_REFERENCES[name];
    if (number(document.bytes, 65536) !== bytes.length || document.bytes !== approved.bytes || hash(document.sha256) !== approved.sha256 || createHash('sha256').update(bytes).digest('hex') !== approved.sha256) fail('Export reference text differs from its reviewed template identity.');
    const original = inventory.find(file => file.path === `exports/${String(roles.export)}/${name}`);
    if (!original || original.sha256 !== document.sha256 || original.bytes !== document.bytes) fail('Export document source inventory does not match the displayed bytes.');
  }
  unique(documentNames);
  if (!paths.has(`exports/${String(roles.export)}/integrity.json`)) fail('Export document integrity source is missing.');
  const rows = list(data.jobs, 5); if (rows.length !== 5) fail('All five evidence roles are required.');
  const seenJobs: string[] = [], runOwners = new Map<string, string>();
  function claimRun(result: RunResult, jobId: string): void { const owner = runOwners.get(result.id); if (owner && owner !== jobId) fail('Run reused across jobs.'); runOwners.set(result.id, jobId); }
  for (const raw of rows) {
    const row = object(raw, ['job', 'events', 'input', 'trials']) as unknown as CaseJob;
    const job = object(row.job, ['id', 'sessionId', 'operation', 'status', 'startedAt', 'result']); const jobId = id(job.id); seenJobs.push(jobId);
    if (job.sessionId !== sessionId || !ids.includes(jobId)) fail('Cross-session or unlisted job.'); date(job.startedAt); choice(job.status, ['complete', 'cancelled', 'failed', 'interrupted']);
    const role = roleNames.find(name => roles[name] === jobId)!;
    if (job.operation !== ({ record: 'record', reduction: 'reduce', comparison: 'verify', export: 'export', cancelled: 'reduce' } as const)[role] || role === 'cancelled' && job.status !== 'cancelled') fail('Role operation/status mismatch.');
    const selectedInput = input(row.input, jobId, sessionId); events(row.events); if (!paths.has(`artifacts/${jobId}/result.json`) || selectedInput.availability === 'available' && !paths.has(`artifacts/${jobId}/manifest.json`)) fail('Required source resource missing.');
    const bind = (result: RunResult, fixedCandidate = false) => { claimRun(result, jobId); if (selectedInput.manifest) { if (result.manifestDigest !== selectedInput.manifestDigest) fail('Run and selected input differ.'); bindInput(result, selectedInput.manifest, fixedCandidate); } };
    const inspections = list(row.trials, 51);
    if (job.operation === 'record') { const result = run(job.result, jobId, true); bind(result); if (!paths.has(`artifacts/${jobId}/${result.id}/evidence.json`)) fail('Recorded run resource missing.'); }
    else if (job.operation === 'verify') {
      const result = object(job.result, ['outcome', 'reason', 'manifestDigest', 'original', 'candidate']); choice(result.outcome, ['requirement-satisfied', 'inconclusive', 'cancelled']); explanation(result.reason); hash(result.manifestDigest);
      const original = run(result.original, jobId, true), candidate = run(result.candidate, jobId, true); bind(original); bind(candidate, true);
      if (original.id === candidate.id || original.appRevision !== 'buggy' || candidate.appRevision !== 'fixed' || original.manifestDigest !== result.manifestDigest || candidate.manifestDigest !== result.manifestDigest || original.assertionDigest !== candidate.assertionDigest || original.harnessDigest !== candidate.harnessDigest) fail('Comparison identity mismatch.');
      if (result.outcome === 'requirement-satisfied' && (original.outcome !== 'target-failure' || candidate.outcome !== 'requirement-satisfied')) fail('Comparison outcome lacks the required original and candidate observations.');
      for (const run of [original, candidate]) if (!paths.has(`artifacts/${jobId}/${run.id}/evidence.json`)) fail('Comparison run resource missing.');
    } else if (job.operation === 'export') { const result = object(job.result, ['path', 'manifestDigest', 'files']); if (result.path !== `local-export:${jobId}`) fail('Export host path must be withheld.'); hash(result.manifestDigest); number(result.files, 256); if (selectedInput.manifestDigest && result.manifestDigest !== selectedInput.manifestDigest) fail('Export input mismatch.'); }
    else {
      const result = object(job.result, ['manifest', 'trials', 'baseline', 'status', 'minimality', 'reason', 'executions', 'durationMs']); validateManifest(result.manifest); choice(result.status, ['complete', 'budget-exhausted', 'cancelled', 'inconclusive']); choice(result.minimality, ['dependency-group-1-minimal', 'unverified']); explanation(result.reason); number(result.executions, 50); number(result.durationMs, Number.MAX_SAFE_INTEGER, false); bind(run(result.baseline, jobId, true));
      const trials = list(result.trials, 51).map((raw, index) => trial(raw, index)); if (inspections.length !== trials.length) fail('Every recorded trial requires an inspection resource.');
      const allRunIds = trials.flatMap(item => item.runIds); unique(allRunIds);
      const baseline = result.baseline as RunResult;
      if (trials.length && !trials[0]!.runIds.includes(baseline.id)) fail('Baseline identity is absent from its trial.');
      if (result.status === 'complete' && (!trials[0]?.accepted || trials[0]?.removed.length || Number(result.executions) < 2)) fail('Completed reduction lacks a repeated baseline.');
      const trialEvents = row.events.filter(event => event.type === 'trial').map(event => parseCaseJson(event.message, 65536));
      if (trialEvents.length > trials.length || trialEvents.some((event, index) => digest(event) !== digest(trials[index]))) fail('Trial events contradict the terminal history.');
      let execution = 0, best = selectedInput.manifest;
      for (const [index, recorded] of trials.entries()) {
        if (best) {
          if (index === 0 && recorded.removed.length || recorded.removed.some(id => !best!.actions.some(action => action.id === id))) fail('Trial removal does not belong to its preceding candidate.');
          const candidate = validateManifest({ ...best, actions: best.actions.filter(action => !recorded.removed.includes(action.id)) });
          if (digest(candidate) !== recorded.inputDigest) fail('Trial input differs from its accepted-history prefix.');
          if (recorded.accepted) best = candidate;
        }
        const inspected = inspect(inspections[index], row, index, recorded);
        for (const [offset, linked] of inspected.runs.entries()) if (linked.result) { claimRun(linked.result as RunResult, jobId); if (linked.result.harnessDigest !== baseline.harnessDigest) fail('Trial harness differs from recorded baseline.'); if (!paths.has(`artifacts/${jobId}/execution-${String(execution + offset + 1).padStart(6, '0')}/${linked.runId}/evidence.json`)) fail('Inspected execution resource missing.'); }
        execution += recorded.runIds.length;
      }
      if (result.executions !== execution) fail('Recorded execution count differs from linked execution identities.');
      if (best) same(best, result.manifest);
    }
    if (job.operation !== 'reduce' && inspections.length) fail('Non-reduction job cannot have trials.');
  }
  unique(seenJobs);
  for (const file of inventory) if (file.path !== 'ledger.sqlite' && (!ids.includes(file.path.split('/')[1]!) || file.path.startsWith('exports/') && file.path.split('/')[1] !== roles.export)) fail('Resource belongs to an unlisted job or the wrong export.');
  const redactions = list(data.redactions, 2048).map(raw => { const redaction = object(raw, ['pointer', 'kind']); const pointer = string(redaction.pointer, 512); if (!/^\/jobs\/[0-4]\/(job|events|input|trials)(\/[A-Za-z0-9_-]+)*$/.test(pointer)) fail('Invalid redaction pointer.'); choice(redaction.kind, ['request-key-omitted', 'host-path-replaced', 'unregistered-text-withheld']); return redaction as unknown as CaseRedaction; });
  unique(redactions.map(item => item.pointer));
  const byPointer = new Map(redactions.map(item => [item.pointer, item.kind]));
  const required = new Map<string, CaseRedaction['kind']>();
  function transformed(value: unknown, pointer: string): void {
    if (typeof value === 'string') {
      if (isWithheldText(value)) required.set(pointer, 'unregistered-text-withheld');
      if (value.startsWith('evidence-artifact:') || value.startsWith('local-export:')) required.set(pointer, 'host-path-replaced');
      // Trial event messages are serialized structured records, not arbitrary text.
      if (pointer.endsWith('/message') && value.trimStart().startsWith('{')) { let parsed: unknown; try { parsed = parseCaseJson(value, 65536); } catch { return; } transformed(parsed, pointer); }
    } else if (Array.isArray(value)) value.forEach((item, index) => transformed(item, `${pointer}/${index}`));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) transformed(item, `${pointer}/${key}`);
  }
  transformed(data.jobs, '/jobs');
  for (const [pointer, kind] of required) if (byPointer.get(pointer) !== kind) fail('Every withheld field requires its matching redaction record.');
  for (const item of redactions) if (item.kind !== 'request-key-omitted' && required.get(item.pointer) !== item.kind) fail('Redaction record does not describe a transformed field.');
  for (const [index] of rows.entries()) if (!redactions.some(item => item.pointer === `/jobs/${index}/job/requestKey` && item.kind === 'request-key-omitted')) fail('Request-key omission must be explicit.');
  const exportIndex = seenJobs.indexOf(String(roles.export)); if (!redactions.some(item => item.pointer === `/jobs/${exportIndex}/job/result/path` && item.kind === 'host-path-replaced')) fail('Export path withholding must be explicit.');
  same(data.excludedArtifacts, ['trace-bytes', 'screenshot-bytes', 'export-execution-bundle']);
  return structuredClone(value) as HciCase;
}
export function caseDigest(value: HciCase): string { return digest(validateCase(value)); }
export function createPacket(value: unknown): HciCasePacket { const evidence = validateCase(value); return { schemaVersion: 1, caseSha256: digest(evidence), evidence }; }
export function validatePacket(value: unknown): HciCasePacket {
  strictJson(value); canonicalJson(value); const packet = object(value, ['schemaVersion', 'caseSha256', 'evidence']); if (packet.schemaVersion !== 1) fail('Unsupported packet version.');
  const result = createPacket(packet.evidence); if (hash(packet.caseSha256) !== result.caseSha256) fail('Packet digest mismatch.'); return result;
}

// Preserve this import as part of the public type contract for consumers.
export type CaseManifest = Manifest;
