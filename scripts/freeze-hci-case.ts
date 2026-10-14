import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, open, rm, unlink, writeFile, type FileHandle } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { ReproError, type RunEvent, type RunResult, type Trial } from '../src/contracts.js';
import { inspectJobInput, inspectTrial, type ReadonlyEvidenceLedger } from '../src/evidence-inspector.js';
import type { Job, Session } from '../src/ledger.js';
import { canonicalJson, digest, validateManifest } from '../src/manifest.js';
import { assertObservation, EXPECTATION, TargetFailure } from '../src/oracle.js';
import { ownedDirectory } from '../src/paths.js';
import { createPacket, EXPORT_DOCUMENT_REFERENCES, HciCaseError, isPublicText, isWithheldText, parseCaseJson, WITHHELD_TEXT, type CaseJob, type CaseRedaction, type CaseRoles, type ExportDocument, type HciCase, type HciCasePacket, type SourceFile } from './hci-case.js';

export interface FreezeCaseOptions {
  sourceRoot: string; outputPath: string; sourceCommit: string; runtimeInventorySha256: string;
  roles: CaseRoles; caseId: string;
}
export interface FreezeCaseResult { path: string; sha256: string; packet: HciCasePacket }
export const REFERENCE_ROLES: CaseRoles = {
  record: 'b9cbaafd-60a6-4c37-a3f7-64bd11f365fa', reduction: '3c31f009-7301-45fa-acd8-b5239746588d',
  comparison: '2a742ba2-ea8f-46aa-b510-d5fad15ac411', export: '994638e6-5104-495e-b1cf-c76e93673afa',
  cancelled: 'ffcd1e28-c199-46df-ab94-c90971a950ba',
};
const MAX_DATABASE = 8 * 1024 * 1024, MAX_JSON = 512 * 1024, MAX_PACKET = 4 * 1024 * 1024;
function fail(message: string, code = 'HCI_CASE_INPUT'): never { throw new HciCaseError(message, code); }
function bytesHash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function isMissing(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }
function child(root: string, value: string): string {
  const target = resolve(value), local = relative(root, target);
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) fail('Path must stay inside its owned boundary.');
  return target;
}
async function directories(target: string): Promise<void> {
  let current = process.cwd();
  const local = relative(current, target);
  if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) fail('Source must remain in this project.');
  for (const component of local.split(sep).filter(Boolean)) { current = join(current, component); const stat = await lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Source path traverses a link or non-directory.'); }
}
async function readBounded(path: string, maximum: number): Promise<Buffer> {
  await directories(dirname(path));
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maximum) fail('Source must be a bounded regular single-link file.');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let operationFailure: { cause: unknown } | undefined;
  try {
    const current = await file.stat();
    if (!current.isFile() || current.nlink !== 1 || current.size > maximum || current.ino !== before.ino || current.dev !== before.dev) fail('Source file changed while opening.');
    const buffer = Buffer.alloc(maximum + 1); let offset = 0;
    while (offset < buffer.length) { const result = await file.read(buffer, offset, buffer.length - offset, null); if (!result.bytesRead) break; offset += result.bytesRead; }
    if (offset > maximum) fail('Source exceeds its byte limit.');
    return buffer.subarray(0, offset);
  } catch (cause) { operationFailure = { cause }; throw cause; }
  finally { await closeFile(file, operationFailure); }
}
async function closeFile(file: FileHandle, primaryFailure?: { cause: unknown }): Promise<void> {
  try { await file.close(); }
  catch (cause) {
    if (!primaryFailure) throw cause;
    const primary = freezeDiagnostic(primaryFailure.cause);
    throw new HciCaseError(primary.message, primary.code, primary.category, { cause: new AggregateError([primaryFailure.cause, cause]) });
  }
}
async function quiescent(root: string): Promise<void> {
  for (const name of ['owner.lock', 'ledger.sqlite-wal', 'ledger.sqlite-shm']) {
    try { await lstat(join(root, name)); } catch (error) { if (isMissing(error)) continue; throw error; }
    fail('Source ledger is not quiescent; no lock, WAL or SHM may exist.', 'HCI_CASE_SOURCE_BUSY');
  }
}
function plain(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Source JSON must be an object.'); return value as Record<string, unknown>; }
function parseJson(bytes: Buffer): unknown {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (cause) { throw new HciCaseError('Source JSON is not valid UTF-8.', 'HCI_CASE_INPUT', 'input', { cause }); }
  return parseCaseJson(text, MAX_JSON);
}
function freezeDiagnostic(cause: unknown): HciCaseError {
  if (cause instanceof HciCaseError) return cause;
  if (cause instanceof ReproError && ['input', 'unsupported', 'verification'].includes(cause.category)) return new HciCaseError('Source evidence is invalid or outside the supported frozen case.', 'HCI_CASE_INPUT', 'input', { cause });
  return new HciCaseError('Freeze failed; no completed packet is claimed.', 'HCI_CASE_FREEZE', 'environment', { cause });
}
function checkSourceObservation(value: unknown): void {
  const result = plain(value);
  if (result.observation === null) return;
  const observation = plain(result.observation);
  if (Object.keys(observation).length !== 3 || !['latestRequestId', 'query', 'results'].every(key => Object.hasOwn(observation, key))) fail('Source observation has unsupported fields.');
  try { assertObservation(observation as unknown as NonNullable<RunResult['observation']>, EXPECTATION); }
  catch (cause) { if (!(cause instanceof TargetFailure)) throw new HciCaseError('Source observation is outside the registered synthetic scope.', 'HCI_CASE_INPUT', 'input', { cause }); }
}
function string(value: unknown): string { if (typeof value !== 'string') fail('Source field must be text.'); return value; }
function safeId(value: unknown): string { const text = string(value); if (!/^[A-Za-z0-9_-]{1,100}$/.test(text)) fail('Source identifier is invalid.'); return text; }
function projectText(value: unknown, pointer: string, redactions: CaseRedaction[]): string {
  const text = string(value);
  const projected = isPublicText(text) ? text : WITHHELD_TEXT;
  if (isWithheldText(projected)) redactions.push({ pointer, kind: 'unregistered-text-withheld' });
  return projected;
}
function projectEvents(value: unknown, pointer: string, redactions: CaseRedaction[]): RunEvent[] {
  if (!Array.isArray(value) || value.length > 1024) fail('Source events exceed the supported scope.');
  return value.map((raw, index) => {
    const event = plain(raw); let message: string;
    if (event.type === 'trial') {
      const parsed = plain(parseJson(Buffer.from(string(event.message))));
      message = JSON.stringify(projectTrial(parsed, `${pointer}/${index}/message/reason`, redactions));
    } else message = projectText(event.message, `${pointer}/${index}/message`, redactions);
    return { seq: event.seq as number, at: string(event.at), type: string(event.type), message, ...(event.actionId !== undefined ? { actionId: safeId(event.actionId) } : {}) };
  });
}
function projectTrial(value: Record<string, unknown>, reasonPointer: string, redactions: CaseRedaction[]): Trial {
  return { index: value.index as number, inputDigest: string(value.inputDigest), seed: value.seed as number, removed: value.removed as string[], outcome: value.outcome as Trial['outcome'], reason: projectText(value.reason, reasonPointer, redactions), durationMs: value.durationMs as number, accepted: value.accepted as boolean, runIds: value.runIds as string[] };
}
function projectRun(value: unknown, jobId: string, pointer: string, redactions: CaseRedaction[], full = true): RunResult {
  const source = plain(value), runId = safeId(source.id);
  const result = {
    id: runId, outcome: source.outcome, reason: projectText(source.reason, `${pointer}/reason`, redactions),
    ...(source.category !== undefined ? { category: source.category } : {}),
    manifestDigest: source.manifestDigest, assertionDigest: source.assertionDigest, harnessDigest: source.harnessDigest,
    appRevision: source.appRevision, appDigest: source.appDigest, adapterVersion: source.adapterVersion, runnerVersion: source.runnerVersion,
    seed: source.seed, startedAt: source.startedAt, durationMs: source.durationMs, assertionCount: source.assertionCount,
    observation: source.observation, environment: source.environment,
  } as RunResult;
  if (full) {
    result.events = projectEvents(source.events, `${pointer}/events`, redactions);
    if (!Array.isArray(source.artifacts) || source.artifacts.length > 32) fail('Invalid source artifact inventory.');
    result.artifacts = source.artifacts.map((raw, index) => {
      const artifact = plain(raw); string(artifact.path);
      redactions.push({ pointer: `${pointer}/artifacts/${index}/path`, kind: 'host-path-replaced' });
      return { path: `evidence-artifact:${jobId}:${runId}:${index}`, sha256: string(artifact.sha256), bytes: artifact.bytes as number };
    });
  }
  return result;
}
function projectResult(value: unknown, job: Job, pointer: string, redactions: CaseRedaction[]): CaseJob['job']['result'] {
  const source = plain(value);
  if (job.operation === 'record') return projectRun(source, job.id, pointer, redactions);
  if (job.operation === 'verify') return {
    outcome: source.outcome as 'requirement-satisfied' | 'inconclusive' | 'cancelled', reason: projectText(source.reason, `${pointer}/reason`, redactions), manifestDigest: string(source.manifestDigest),
    original: projectRun(source.original, job.id, `${pointer}/original`, redactions), candidate: projectRun(source.candidate, job.id, `${pointer}/candidate`, redactions),
  };
  if (job.operation === 'export') {
    string(source.path); redactions.push({ pointer: `${pointer}/path`, kind: 'host-path-replaced' });
    return { path: `local-export:${job.id}`, manifestDigest: string(source.manifestDigest), files: source.files as number };
  }
  if (!Array.isArray(source.trials) || source.trials.length > 51) fail('Source trial history exceeds the supported bounds.');
  return {
    manifest: source.manifest as HciCase['session']['manifest'],
    trials: source.trials.map((raw, index) => projectTrial(plain(raw), `${pointer}/trials/${index}/reason`, redactions)),
    baseline: projectRun(source.baseline, job.id, `${pointer}/baseline`, redactions),
    status: source.status as 'complete' | 'budget-exhausted' | 'cancelled' | 'inconclusive', minimality: source.minimality as 'dependency-group-1-minimal' | 'unverified',
    reason: projectText(source.reason, `${pointer}/reason`, redactions), executions: source.executions as number, durationMs: source.durationMs as number,
  };
}

export async function freezeCase(options: FreezeCaseOptions): Promise<FreezeCaseResult> {
  const sourceRoot = child(resolve('.repro-runs'), options.sourceRoot);
  const outputRoot = resolve('.repro-runs/hci-comparator'), outputPath = child(outputRoot, options.outputPath);
  const withinSource = (path: string) => { const local = relative(sourceRoot, path); return !local || local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local); };
  if (withinSource(outputRoot) || withinSource(outputPath)) fail('Source, output and scratch scopes must not overlap.');
  if (!outputPath.endsWith('.json')) fail('Output must be a new JSON packet.');
  if (!/^[a-f0-9]{40}$/.test(options.sourceCommit) || !/^[a-f0-9]{64}$/.test(options.runtimeInventorySha256)) fail('Source provenance is invalid.');
  const roleIds = Object.values(options.roles).map(safeId); if (roleIds.length !== 5 || new Set(roleIds).size !== 5) fail('Five distinct job roles are required.'); safeId(options.caseId);
  await directories(sourceRoot); await quiescent(sourceRoot);
  try { await lstat(outputPath); fail('Output already exists; choose a new packet path.', 'HCI_CASE_EXISTS'); } catch (error) { if (!isMissing(error)) throw error; }
  const inventory = new Map<string, SourceFile>(), missing = new Set<string>();
  async function readSource(local: string, optional = false): Promise<Buffer | null> {
    if (inventory.size >= 256 && !inventory.has(local)) fail('Source inventory is too large.');
    let bytes: Buffer;
    const maximum = local === 'ledger.sqlite' ? MAX_DATABASE : /^exports\/[^/]+\/(README\.md|replay\.test\.mjs)$/.test(local) ? 65536 : MAX_JSON;
    try { bytes = await readBounded(join(sourceRoot, local), maximum); }
    catch (error) { if (optional && isMissing(error)) { missing.add(local); return null; } throw error; }
    const entry = { path: local, sha256: bytesHash(bytes), bytes: bytes.length }, previous = inventory.get(local);
    if (previous && (previous.sha256 !== entry.sha256 || previous.bytes !== entry.bytes)) fail('Source changed during freeze.', 'HCI_CASE_SOURCE_CHANGED');
    inventory.set(local, entry); return bytes;
  }
  const databaseBytes = (await readSource('ledger.sqlite'))!;
  ownedDirectory(outputRoot);
  const scratch = join(outputRoot, `.scratch-${randomUUID()}`);
  await mkdir(scratch, { mode: 0o700 });
  let database: DatabaseSync | undefined, primaryFailure: HciCaseError | undefined;
  const cleanupFailures: unknown[] = [];
  let prepared: { packet: HciCasePacket; content: Buffer } | undefined;
  try {
    const copiedDatabase = join(scratch, 'ledger.sqlite'); await writeFile(copiedDatabase, databaseBytes, { flag: 'wx', mode: 0o600 });
    database = new DatabaseSync(copiedDatabase, { readOnly: true }); database.exec('PRAGMA query_only=ON');
    const rawJobs = database.prepare('SELECT id, sessionId, operation, status, requestKey, startedAt, result FROM jobs ORDER BY startedAt, id').all();
    if (rawJobs.length !== 5 || rawJobs.some(row => !roleIds.includes(String(row.id)))) fail('Source must contain exactly the selected five jobs.');
    const jobs: Job[] = rawJobs.map(row => ({ id: safeId(row.id), sessionId: safeId(row.sessionId), operation: row.operation as Job['operation'], status: row.status as Job['status'], requestKey: string(row.requestKey), startedAt: string(row.startedAt), result: parseJson(Buffer.from(string(row.result))) }));
    if (jobs.some(job => job.status === 'running')) fail('A selected job is still running.');
    const sessionIds = [...new Set(jobs.map(job => job.sessionId))]; if (sessionIds.length !== 1) fail('Selected jobs must belong to one session.');
    const rawSessions = database.prepare('SELECT id, createdAt, state, manifest, consent FROM sessions').all();
    if (rawSessions.length !== 1 || rawSessions[0]?.id !== sessionIds[0] || rawSessions[0]?.consent !== 1) fail('Source session scope is inconsistent.');
    const row = rawSessions[0]!;
    const session: Session = { id: safeId(row.id), createdAt: string(row.createdAt), state: row.state as Session['state'], manifest: parseJson(Buffer.from(string(row.manifest))) as Session['manifest'], consent: true };
    const eventMap = new Map<string, RunEvent[]>();
    for (const job of jobs) {
      const rows = database.prepare('SELECT seq, at, type, message, actionId FROM events WHERE jobId=? ORDER BY seq').all(job.id);
      if (rows.length > 1024) fail('Source event history is too large.');
      eventMap.set(job.id, rows.map(row => ({ seq: Number(row.seq), at: string(row.at), type: string(row.type), message: string(row.message), ...(row.actionId === null ? {} : { actionId: safeId(row.actionId) }) })));
    }
    database.close(); database = undefined;
    const adapter: ReadonlyEvidenceLedger = {
      root: sourceRoot,
      getJob: id => { const job = jobs.find(job => job.id === id); if (!job) fail('Job is outside the frozen case.'); return structuredClone(job); },
      events: (id, after = 0) => { const events = eventMap.get(id); if (!events) fail('Events are outside the frozen case.'); return structuredClone(events.filter(event => event.seq > after)); },
    };
    const redactions: CaseRedaction[] = [], frozenJobs: CaseJob[] = [];
    const exportDocuments: ExportDocument[] = [];
    for (const [index, job] of jobs.entries()) {
      const base = `artifacts/${job.id}`;
      const manifestBytes = await readSource(`${base}/manifest.json`, true);
      if (manifestBytes) validateManifest(parseJson(manifestBytes));
      const resultBytes = (await readSource(`${base}/result.json`))!;
      if (digest(parseJson(resultBytes)) !== digest(job.result)) fail('Saved result and database result disagree.');
      const result = plain(job.result);
      if (job.id === options.roles.export) {
        const exportBase = `exports/${job.id}`, ownedExport = join(sourceRoot, exportBase);
        if (job.operation !== 'export' || result.path !== ownedExport) fail('Recorded export path does not match its fixed owned job directory.');
        const integrity = plain(parseJson((await readSource(`${exportBase}/integrity.json`))!));
        if (Object.keys(integrity).length !== 4 || !['format', 'schemaVersion', 'manifestDigest', 'files'].every(key => Object.hasOwn(integrity, key)) || integrity.format !== 'repro-directory-v1' || integrity.schemaVersion !== 1 || integrity.manifestDigest !== result.manifestDigest || !Array.isArray(integrity.files) || integrity.files.length < 2 || integrity.files.length > 32 || result.files !== integrity.files.length + 1) fail('Export reference integrity metadata is inconsistent.');
        const declarations = new Map<string, { sha256: string; bytes: number }>();
        for (const raw of integrity.files) {
          const file = plain(raw), path = string(file.path);
          if (Object.keys(file).length !== 3 || !['path', 'sha256', 'bytes'].every(key => Object.hasOwn(file, key)) || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) || path.split('/').some(part => part === '.' || part === '..') || path.length > 256 || declarations.has(path) || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.bytes !== 'number' || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 16 * 1024 * 1024) fail('Export integrity file metadata is unsafe or inconsistent.');
          declarations.set(path, { sha256: file.sha256, bytes: file.bytes });
        }
        for (const name of Object.keys(EXPORT_DOCUMENT_REFERENCES) as ExportDocument['name'][]) {
          const bytes = (await readSource(`${exportBase}/${name}`))!, declared = declarations.get(name);
          if (!declared || declared.sha256 !== bytesHash(bytes) || declared.bytes !== bytes.length) fail('Export reference document differs from its integrity declaration.');
          let text: string;
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
          catch (cause) { throw new HciCaseError('Export reference document is not valid UTF-8.', 'HCI_CASE_INPUT', 'input', { cause }); }
          exportDocuments.push({ name, sha256: declared.sha256, bytes: bytes.length, text });
        }
      }
      if (job.operation === 'record' || job.operation === 'verify') {
        const runs = job.operation === 'record' ? [result] : [plain(result.original), plain(result.candidate)];
        for (const run of runs) {
          const bytes = (await readSource(`${base}/${safeId(run.id)}/evidence.json`))!;
          const rawEvidence = plain(parseJson(bytes));
          checkSourceObservation(rawEvidence);
          // Adapter evidence.json intentionally omits its own final artifact inventory.
          const { artifacts: _artifacts, ...withoutArtifacts } = run;
          if (digest(rawEvidence) !== digest(withoutArtifacts) && digest(rawEvidence) !== digest(run)) fail('Recorded run and saved execution disagree.');
        }
      }
      if (job.operation === 'reduce') {
        if (!Array.isArray(result.trials) || result.trials.length > 51) fail('Source reduction trials invalid.');
        let execution = 0;
        for (const raw of result.trials) { const trial = plain(raw); if (!Array.isArray(trial.runIds) || trial.runIds.length > 2) fail('Source trial run IDs invalid.'); for (const runId of trial.runIds) { execution++; const bytes = await readSource(`${base}/execution-${String(execution).padStart(6, '0')}/${safeId(runId)}/evidence.json`, true); if (bytes) checkSourceObservation(parseJson(bytes)); } }
      }
      const input = await inspectJobInput(adapter, job.id);
      input.reason = projectText(input.reason, `/jobs/${index}/input/reason`, redactions);
      const trials = [];
      for (let trialIndex = 0; trialIndex < (job.operation === 'reduce' ? (result.trials as unknown[]).length : 0); trialIndex++) {
        const trial = await inspectTrial(adapter, job.id, trialIndex), pointer = `/jobs/${index}/trials/${trialIndex}`;
        trial.reason = projectText(trial.reason, `${pointer}/reason`, redactions);
        if (trial.trial) trial.trial.reason = projectText(trial.trial.reason, `${pointer}/trial/reason`, redactions);
        for (const [offset, linked] of trial.runs.entries()) {
          linked.reason = projectText(linked.reason, `${pointer}/runs/${offset}/reason`, redactions);
          if (linked.result) linked.result = projectRun(linked.result, job.id, `${pointer}/runs/${offset}/result`, redactions, false);
        }
        trials.push(trial);
      }
      redactions.push({ pointer: `/jobs/${index}/job/requestKey`, kind: 'request-key-omitted' });
      frozenJobs.push({ job: { id: job.id, sessionId: job.sessionId, operation: job.operation, status: job.status, startedAt: job.startedAt, result: projectResult(result, job, `/jobs/${index}/job/result`, redactions) }, events: projectEvents(eventMap.get(job.id)!, `/jobs/${index}/events`, redactions), input, trials });
    }
    await quiescent(sourceRoot);
    for (const entry of [...inventory.values()]) await readSource(entry.path);
    for (const local of missing) { try { await lstat(join(sourceRoot, local)); } catch (error) { if (isMissing(error)) continue; throw error; } fail('Missing source evidence appeared during freeze.', 'HCI_CASE_SOURCE_CHANGED'); }
    await quiescent(sourceRoot);
    const evidence: HciCase = { schemaVersion: 1, classification: 'real-synthetic-execution-evidence', mode: 'inspection-only', caseId: options.caseId, failureFamily: 'synthetic-search-stale-response', source: { commit: options.sourceCommit, runtimeInventorySha256: options.runtimeInventorySha256, databaseSha256: bytesHash(databaseBytes), files: [...inventory.values()].sort((a, b) => a.path.localeCompare(b.path)) }, session, roles: options.roles, defaultJobId: options.roles.record, jobs: frozenJobs, exportDocuments, redactions, excludedArtifacts: ['trace-bytes', 'screenshot-bytes', 'export-execution-bundle'] };
    const packet = createPacket(evidence), content = Buffer.from(`${canonicalJson(packet)}\n`);
    if (content.length > MAX_PACKET) fail('Packet exceeds 4 MiB.');
    prepared = { packet, content };
  } catch (error) {
    primaryFailure = freezeDiagnostic(error);
  } finally {
    try { database?.close(); } catch (error) { cleanupFailures.push(error); }
    try { await rm(scratch, { recursive: true, force: true }); } catch (error) { cleanupFailures.push(error); }
  }
  if (primaryFailure) throw cleanupFailures.length ? new HciCaseError(primaryFailure.message, primaryFailure.code, primaryFailure.category, { cause: new AggregateError([primaryFailure, ...cleanupFailures]) }) : primaryFailure;
  if (cleanupFailures.length) throw new HciCaseError('Owned freeze scratch cleanup failed.', 'HCI_CASE_CLEANUP', 'environment', { cause: new AggregateError(cleanupFailures) });
  if (!prepared) fail('No validated packet was prepared.');
  // Scratch cleanup succeeds before a packet can become visible at its final path.
  ownedDirectory(dirname(outputPath));
  const temporary = join(dirname(outputPath), `.packet-${randomUUID()}.partial`);
  let published = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    let operationFailure: { cause: unknown } | undefined;
    try { await file.writeFile(prepared.content); await file.sync(); }
    catch (cause) { operationFailure = { cause }; throw cause; }
    finally { await closeFile(file, operationFailure); }
    await chmod(temporary, 0o400);
    await link(temporary, outputPath); published = true;
    await unlink(temporary);
    return { path: outputPath, sha256: bytesHash(prepared.content), packet: prepared.packet };
  } catch (cause) {
    const errors: unknown[] = [cause];
    if (published) { try { await unlink(outputPath); } catch (error) { errors.push(error); } }
    try { await unlink(temporary); } catch (error) { if (!isMissing(error)) errors.push(error); }
    throw new HciCaseError('Packet publication did not complete; inspect owned output before retrying.', 'HCI_CASE_PUBLISH', 'environment', { cause: new AggregateError(errors) });
  }
}
export async function main(args: string[]): Promise<number> {
  try {
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) { const flag = args[index], value = args[index + 1]; if (!flag || !['--source', '--output', '--source-commit', '--runtime-inventory-sha256'].includes(flag) || !value || value.startsWith('--') || values.has(flag)) fail('Use each freeze argument at most once.'); values.set(flag, value); }
    if (['--source', '--output', '--source-commit', '--runtime-inventory-sha256'].some(flag => !values.has(flag))) fail('Required: --source --output --source-commit --runtime-inventory-sha256.');
    const result = await freezeCase({ sourceRoot: values.get('--source')!, outputPath: values.get('--output')!, sourceCommit: values.get('--source-commit')!, runtimeInventorySha256: values.get('--runtime-inventory-sha256')!, roles: REFERENCE_ROLES, caseId: 'synthetic-search-inspection-v1' });
    process.stdout.write(`${JSON.stringify({ status: 'frozen', caseSha256: result.packet.caseSha256, packetSha256: result.sha256, scope: 'inspection evidence only; P/L renderers and parity not verified' })}\n`); return 0;
  } catch (error) { const diagnostic = freezeDiagnostic(error); process.stderr.write(`${JSON.stringify({ status: 'failed', category: diagnostic.category, code: diagnostic.code, reason: diagnostic.message })}\n`); return diagnostic.category === 'input' ? 2 : 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
