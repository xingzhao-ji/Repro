import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, writeFile, unlink, symlink, link, rename, readlink } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Ledger } from '../src/ledger.js';
import { freezeCase, REFERENCE_ROLES, type FreezeCaseOptions } from '../scripts/freeze-hci-case.js';
import { digest } from '../src/manifest.js';
import { caseFixture, exportReferenceDocuments, IDS, SHA } from './helpers/hci-case-fixture.js';
import { caseDigest, parseCaseJson, WITHHELD_TEXT, createPacket, validateCase, validatePacket, type HciCase } from '../scripts/hci-case.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

test('frozen case retains exact historical input, null missing-run evidence and distinct recorded cancellation', () => {
  const value = caseFixture(); const validated = validateCase(value);
  assert.deepEqual(validated, value);
  assert.notEqual(validated.jobs[0]!.input.manifestDigest, digest(validated.session.manifest));
  assert.equal(validated.jobs[4]!.trials[0]!.runs[0]!.result, null);
  assert.equal(validated.jobs[4]!.trials[0]!.outcome, 'inconclusive');
  assert.equal(validated.jobs[4]!.trials[0]!.trial!.outcome, 'cancelled');
  assert.equal(validated.jobs[4]!.job.status, 'cancelled');
});
test('trial decision and raw incomplete execution retain separate reasons, null observation and zero assertion count', () => {
  const value = validateCase(caseFixture()); const trial = value.jobs[1]!.trials[2]!;
  assert.equal(value.jobs[0]!.input.manifest!.environment.timeoutMs, 10_000);
  assert.equal(value.jobs[1]!.input.manifest!.environment.timeoutMs, 1500);
  assert.equal(value.jobs[2]!.input.manifest!.actions.length, 3);
  assert.equal(trial.outcome, 'inconclusive'); assert.equal(trial.trial!.accepted, false);
  assert.match(trial.reason, /identity/); assert.match(trial.runs[0]!.result!.reason, /^MISSING_STEPS:/);
  assert.equal(trial.runs[0]!.result!.assertionCount, 0); assert.equal(trial.runs[0]!.result!.observation, null);
  assert.equal(trial.runs[0]!.result!.appDigest, '');
});
test('packet digest is independently calculated over canonical full case and verified before either condition consumes it', () => {
  const value = caseFixture(); const expected = createHash('sha256').update(canonical(value)).digest('hex');
  const packet = createPacket(value);
  assert.equal(caseDigest(value), expected); assert.equal(packet.caseSha256, expected);
  assert.deepEqual(validatePacket(packet).evidence, value);
  assert.deepEqual(validatePacket(packet).evidence, validatePacket(structuredClone(packet)).evidence);
  const corrupted = structuredClone(packet); corrupted.evidence.defaultJobId = IDS.reduction;
  assert.throws(() => validatePacket(corrupted));
});

const invalidCases: [string, (value: HciCase) => void][] = [
  ['unknown case property', value => { Object.assign(value, { privateNotes: 'forbidden' }); }],
  ['missing case property', value => { Reflect.deleteProperty(value, 'mode'); }],
  ['unsupported schema', value => { Object.assign(value, { schemaVersion: 2 }); }],
  ['participant classification', value => { Object.assign(value, { classification: 'participant-results' }); }],
  ['live execution mode', value => { Object.assign(value, { mode: 'live' }); }],
  ['unsupported failure family', value => { Object.assign(value, { failureFamily: 'other' }); }],
  ['empty case identity', value => { value.caseId = ''; }],
  ['invalid source commit', value => { value.source.commit = 'HEAD'; }],
  ['invalid runtime digest', value => { value.source.runtimeInventorySha256 = 'xyz'; }],
  ['database digest conflict', value => { value.source.databaseSha256 = 'c'.repeat(64); }],
  ['missing database resource', value => { value.source.files.shift(); }],
  ['duplicate resource', value => { value.source.files.push(structuredClone(value.source.files[0]!)); }],
  ['absolute resource path', value => { value.source.files[1]!.path = '/tmp/host-private.json'; }],
  ['resource path traversal', value => { value.source.files[1]!.path = '../private.json'; }],
  ['resource dot path traversal', value => { value.source.files[1]!.path = 'artifacts/../private.json'; }],
  ['resource backslash traversal', value => { value.source.files[1]!.path = 'artifacts\\..\\private.json'; }],
  ['negative resource length', value => { value.source.files[1]!.bytes = -1; }],
  ['fractional resource length', value => { value.source.files[1]!.bytes = 1.5; }],
  ['nonfinite resource length', value => { value.source.files[1]!.bytes = Infinity; }],
  ['invalid resource digest', value => { value.source.files[1]!.sha256 = 'g'.repeat(64); }],
  ['unknown source property', value => { Object.assign(value.source, { root: '/Users/private/source' }); }],
  ['unknown resource property', value => { Object.assign(value.source.files[0]!, { localPath: '/Users/private/source' }); }],
  ['missing saved input resource', value => { value.source.files = value.source.files.filter(file => file.path !== `artifacts/${IDS.record}/manifest.json`); }],
  ['missing available trial resource', value => { value.source.files = value.source.files.filter(file => !file.path.endsWith('/reduced-first/evidence.json')); }],
  ['duplicate job', value => { value.jobs.push(structuredClone(value.jobs[0]!)); }],
  ['missing role job', value => { value.jobs.pop(); }],
  ['cross-session job', value => { value.jobs[0]!.job.sessionId = 'another-session'; }],
  ['cross-session input', value => { value.jobs[0]!.input.sessionId = 'another-session'; }],
  ['cross-job input', value => { value.jobs[0]!.input.jobId = IDS.comparison; }],
  ['cross-session trial', value => { value.jobs[1]!.trials[0]!.sessionId = 'another-session'; }],
  ['cross-job trial', value => { value.jobs[1]!.trials[0]!.jobId = IDS.cancelled; }],
  ['duplicate trial', value => { value.jobs[1]!.trials.push(structuredClone(value.jobs[1]!.trials[0]!)); }],
  ['missing trial', value => { value.jobs[1]!.trials.pop(); }],
  ['unknown trial index', value => { value.jobs[1]!.trials[1]!.trialIndex = 2; }],
  ['input digest conflict', value => { value.jobs[0]!.input.manifestDigest = 'c'.repeat(64); }],
  ['invalid saved manifest', value => { value.jobs[0]!.input.manifest!.actions[0]!.dependsOn = ['missing']; }],
  ['missing input instead of unavailable', value => { Reflect.deleteProperty(value.jobs[0]!, 'input'); }],
  ['available input with null manifest', value => { value.jobs[0]!.input.manifest = null; }],
  ['available input with null digest', value => { value.jobs[0]!.input.manifestDigest = null; }],
  ['unavailable input with conclusive outcome', value => { value.jobs[0]!.input.availability = 'unavailable'; }],
  ['available trial with null trial', value => { value.jobs[1]!.trials[0]!.trial = null; }],
  ['available trial with null candidate', value => { value.jobs[1]!.trials[0]!.candidate = null; }],
  ['available run with null result', value => { value.jobs[1]!.trials[0]!.runs[0]!.result = null; }],
  ['unavailable run with nonnull result', value => { value.jobs[1]!.trials[0]!.runs[0]!.availability = 'unavailable'; }],
  ['null run result property omitted', value => { Reflect.deleteProperty(value.jobs[4]!.trials[0]!.runs[0]!, 'result'); }],
  ['null terminal job result', value => { Object.assign(value.jobs[0]!.job, { result: null }); }],
  ['execution count contradicts trial runs', value => { Object.assign(value.jobs[4]!.job.result, { executions: 0 }); }],
  ['unknown role', value => { Object.assign(value.roles, { replay: IDS.record }); }],
  ['duplicate role binding', value => { value.roles.reduction = IDS.record; }],
  ['missing role binding', value => { value.roles.record = 'missing-job'; }],
  ['role operation conflict', value => { value.jobs[0]!.job.operation = 'verify'; }],
  ['nonterminal job', value => { value.jobs[0]!.job.status = 'running'; }],
  ['unknown default selection', value => { value.defaultJobId = 'missing-job'; }],
  ['request key leaked', value => { Object.assign(value.jobs[0]!.job, { requestKey: 'private-request-key' }); }],
  ['export host path leaked', value => { Object.assign(value.jobs[3]!.job.result, { path: '/Users/private/export' }); }],
  ['export locator belongs to another job', value => { Object.assign(value.jobs[3]!.job.result, { path: `local-export:${IDS.record}` }); }],
  ['unknown event field', value => { Object.assign(value.jobs[0]!.events[0]!, { rawPath: '/Users/private/file' }); }],
  ['duplicate event sequence', value => { value.jobs[0]!.events[1]!.seq = 1; }],
  ['unknown trial property', value => { Object.assign(value.jobs[1]!.trials[0]!, { debug: 'not allowed' }); }],
  ['unknown inspected run field', value => { Object.assign(value.jobs[1]!.trials[0]!.runs[0]!.result!, { artifacts: [] }); }],
  ['candidate digest conflict', value => { value.jobs[1]!.trials[1]!.candidate!.environment.timeoutMs = 100; }],
  ['trial run identity conflict', value => { value.jobs[1]!.trials[0]!.runs[0]!.runId = 'different-run'; }],
  ['trial run ordering conflict', value => { value.jobs[1]!.trials[0]!.runs.reverse(); }],
  ['recorded trial identity conflict', value => { value.jobs[1]!.trials[0]!.trial!.inputDigest = 'c'.repeat(64); }],
  ['duplicate redaction pointer', value => { value.redactions.push(structuredClone(value.redactions[0]!)); }],
  ['missing request-key omission declaration', value => { value.redactions.shift(); }],
  ['unknown redaction kind', value => { Object.assign(value.redactions[0]!, { kind: 'ignored' }); }],
  ['missing result inventory resource', value => { value.source.files = value.source.files.filter(file => file.path !== `artifacts/${IDS.record}/result.json`); }],
  ['missing record run resource', value => { value.source.files = value.source.files.filter(file => !file.path.endsWith('/record-run/evidence.json')); }],
  ['missing comparison run resource', value => { value.source.files = value.source.files.filter(file => !file.path.endsWith('/comparison-candidate/evidence.json')); }],
  ['foreign job resource', value => { value.source.files.push({ path: 'artifacts/unrelated-job/manifest.json', bytes: 100, sha256: SHA }); }],
  ['session consent false', value => { Object.assign(value.session, { consent: false }); }],
  ['session manifest invalid', value => { value.session.manifest.assertionDigest = SHA; }],
  ['unknown job input field', value => { Object.assign(value.jobs[0]!.input, { sourcePath: '/Users/private/input' }); }],
  ['available target-failure trial records rejection', value => {
    const row = value.jobs[1]!;
    if ('trials' in row.job.result) {
      row.trials = row.trials.slice(0, 2); row.job.result.trials = row.job.result.trials.slice(0, 2);
      row.trials[1]!.trial!.accepted = false; row.job.result.trials[1]!.accepted = false;
      row.job.result.manifest = structuredClone(row.input.manifest!); row.job.result.executions = 4;
    }
  }],
  ['accepted inconclusive trial', value => { value.jobs[1]!.trials[2]!.trial!.accepted = true; }],
  ['trial falsely claims conclusive result', value => { value.jobs[1]!.trials[2]!.outcome = 'target-failure'; }],
  ['record conclusive outcome has zero assertions', value => { Object.assign(value.jobs[0]!.job.result, { assertionCount: 0 }); }],
  ['record conclusive outcome has null observation', value => { Object.assign(value.jobs[0]!.job.result, { observation: null }); }],
  ['record observation contradicts failure', value => { Object.assign(value.jobs[0]!.job.result, { observation: { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] } }); }],
  ['record assertion identity mismatch', value => { Object.assign(value.jobs[0]!.job.result, { assertionDigest: SHA }); }],
  ['record input identity mismatch', value => { Object.assign(value.jobs[0]!.job.result, { manifestDigest: SHA }); }],
  ['record raw host artifact path', value => { Object.assign(value.jobs[0]!.job.result, { artifacts: [{ path: '/Users/private/trace.zip', bytes: 3, sha256: SHA }] }); }],
  ['record cross-job artifact locator', value => { Object.assign(value.jobs[0]!.job.result, { artifacts: [{ path: `evidence-artifact:${IDS.comparison}:record-run:0`, bytes: 3, sha256: SHA }] }); }],
  ['record private environment field', value => { const result = value.jobs[0]!.job.result; if ('environment' in result) Object.assign(result.environment, { hostname: 'private-host' }); }],
  ['comparison candidate satisfaction contradicts Alpha observation', value => { const result = value.jobs[2]!.job.result; if ('candidate' in result) result.candidate.observation = { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] }; }],
  ['available accepted trial contradicts two satisfied runs', value => {
    const trial = value.jobs[1]!.trials[1]!;
    for (const item of trial.runs) { item.outcome = 'requirement-satisfied'; item.reason = 'The frozen latest-response assertion passed after both controlled HTTP responses completed.'; const result = item.result!; result.outcome = item.outcome; result.reason = item.reason; Reflect.deleteProperty(result, 'category'); result.observation = { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] }; }
  }],
  ['comparison outer satisfaction has inconclusive child runs', value => {
    const result = value.jobs[2]!.job.result;
    if ('candidate' in result) for (const item of [result.original, result.candidate]) { item.outcome = 'inconclusive'; item.reason = 'The assertion has not executed.'; item.assertionCount = 0; item.observation = null; item.appDigest = ''; item.environment.browser = 'not-launched'; Reflect.deleteProperty(item, 'category'); }
  }],
  ['final reduction manifest ignores accepted removals', value => { const result = value.jobs[1]!.job.result; if ('trials' in result) result.manifest = structuredClone(value.jobs[1]!.input.manifest!); }],
  ['completed reduction has no trials or executions', value => { const row = value.jobs[1]!; if ('trials' in row.job.result) { row.job.result.trials = []; row.job.result.executions = 0; row.trials = []; } }],
  ['persisted trial event disagrees with result', value => { const row = value.jobs[1]!; row.events = [{ seq: 1, at: '2026-10-13T00:00:00.000Z', type: 'trial', message: JSON.stringify({ ...row.trials[0]!.trial!, accepted: false }) }]; }],
  ['record application digest mismatch', value => { Object.assign(value.jobs[0]!.job.result, { appDigest: 'c'.repeat(64) }); }],
  ['record adapter version mismatch', value => { Object.assign(value.jobs[0]!.job.result, { adapterVersion: '999.0.0' }); }],
  ['record runner version mismatch', value => { Object.assign(value.jobs[0]!.job.result, { runnerVersion: '999.0.0' }); }],
  ['accepted trial run input mismatch', value => { value.jobs[1]!.trials[1]!.runs[0]!.result!.manifestDigest = 'c'.repeat(64); }],
  ['accepted trial run baseline harness mismatch', value => { value.jobs[1]!.trials[1]!.runs[0]!.result!.harnessDigest = 'c'.repeat(64); }],
  ['comparison reuses original run identity', value => { const result = value.jobs[2]!.job.result; if ('candidate' in result) result.candidate.id = result.original.id; }],
  ['comparison harness identity mismatch', value => { const result = value.jobs[2]!.job.result; if ('candidate' in result) result.candidate.harnessDigest = 'c'.repeat(64); }],
  ['comparison assertion identity mismatch', value => { const result = value.jobs[2]!.job.result; if ('candidate' in result) result.candidate.assertionDigest = 'c'.repeat(64); }],
  ['comparison candidate revision mismatch', value => { const result = value.jobs[2]!.job.result; if ('candidate' in result) result.candidate.appRevision = 'buggy'; }],
  ['comparison candidate input identity mismatch', value => { const result = value.jobs[2]!.job.result; if ('candidate' in result) result.candidate.manifestDigest = 'c'.repeat(64); }],
  ['redaction pointer to unrelated field', value => { value.redactions.push({ pointer: '/session/id', kind: 'host-path-replaced' }); }],
  ['unknown excluded artifact declaration', value => { Object.assign(value, { excludedArtifacts: ['trace-bytes'] }); }],
];
for (const [label, change] of invalidCases) test(`frozen case rejects ${label}`, () => {
  const value = caseFixture(); change(value); assert.throws(() => validateCase(value));
});

for (const [label, change] of [
  ['unknown envelope property', (packet: Record<string, unknown>) => { packet['notes'] = 'extra'; }],
  ['missing digest', (packet: Record<string, unknown>) => { Reflect.deleteProperty(packet, 'caseSha256'); }],
  ['invalid digest', (packet: Record<string, unknown>) => { packet['caseSha256'] = SHA.toUpperCase(); }],
  ['digest mismatch', (packet: Record<string, unknown>) => { packet['caseSha256'] = '0'.repeat(64); }],
  ['unsupported envelope version', (packet: Record<string, unknown>) => { packet['schemaVersion'] = 2; }],
] as const) test(`frozen packet rejects ${label}`, () => {
  const packet = { schemaVersion: 1, caseSha256: createHash('sha256').update(canonical(caseFixture())).digest('hex'), evidence: caseFixture() };
  change(packet); assert.throws(() => validatePacket(packet));
});

test('unavailable frozen input preserves explicit nulls and does not select the current manifest', () => {
  const value = caseFixture(); const row = value.jobs[0]!;
  row.input = { jobId: row.job.id, sessionId: IDS.session, availability: 'unavailable', outcome: 'inconclusive', reason: 'The exact owned evidence is missing, unreadable, unsafe, or invalid.', code: 'EVIDENCE_UNAVAILABLE', manifest: null, manifestDigest: null };
  value.source.files = value.source.files.filter(file => file.path !== `artifacts/${row.job.id}/manifest.json`);
  const packet = createPacket(value); assert.equal(packet.evidence.jobs[0]!.input.manifest, null);
  assert.equal(packet.evidence.jobs[0]!.input.manifestDigest, null);
  assert.equal(packet.evidence.jobs[0]!.input.outcome, 'inconclusive');
  assert.deepEqual(packet.evidence.session.manifest, value.session.manifest);
});
test('unavailable trial preserves explicit null trial and candidate instead of dropping its history slot', () => {
  const value = caseFixture(); const row = value.jobs[4]!;
  row.trials[0] = { jobId: row.job.id, sessionId: IDS.session, trialIndex: 0, availability: 'unavailable', outcome: 'inconclusive', reason: 'The exact selected trial is unavailable.', code: 'TRIAL_INPUT_MISMATCH', trial: null, candidate: null, runs: [] };
  const result = validateCase(value).jobs[4]!.trials;
  assert.equal(result.length, 1); assert.equal(result[0]!.trial, null); assert.equal(result[0]!.candidate, null);
});
test('missing accepted-trial evidence preserves recorded acceptance but makes inspection inconclusive', () => {
  const value = caseFixture(); const trial = value.jobs[1]!.trials[1]!; const missing = trial.runs[0]!;
  trial.availability = 'unavailable'; trial.outcome = 'inconclusive'; trial.code = 'TRIAL_EVIDENCE_UNAVAILABLE';
  trial.reason = 'One or more exact recorded runs are unavailable or inconsistent; this trial is INCONCLUSIVE.';
  missing.availability = 'unavailable'; missing.outcome = 'inconclusive'; missing.result = null; missing.code = 'EVIDENCE_UNAVAILABLE';
  missing.reason = 'The exact owned evidence is missing, unreadable, unsafe, or invalid.';
  value.source.files = value.source.files.filter(file => !file.path.endsWith(`/${missing.runId}/evidence.json`));
  const inspected = validateCase(value).jobs[1]!.trials[1]!;
  assert.equal(inspected.trial!.accepted, true); assert.equal(inspected.trial!.outcome, 'target-failure');
  assert.equal(inspected.outcome, 'inconclusive'); assert.equal(inspected.runs[0]!.result, null);
});
test('validated packet copies caller data and keeps canonical identity independent of object key order', () => {
  const value = caseFixture(); const packet = createPacket(value);
  const before = canonical(packet); value.session.manifest.environment.timeoutMs = 100;
  assert.equal(canonical(packet), before);
  const reordered = Object.fromEntries(Object.entries(packet.evidence).reverse());
  assert.equal(createPacket(reordered).caseSha256, packet.caseSha256);
});
for (const kind of ['sparse', 'extra-property', 'accessor'] as const) test(`frozen case rejects ${kind} arrays without invoking input code`, () => {
  const value = caseFixture(); let reads = 0;
  if (kind === 'sparse') Reflect.deleteProperty(value.jobs, '0');
  if (kind === 'extra-property') Object.assign(value.jobs, { extra: 'forbidden' });
  if (kind === 'accessor') { const row = value.jobs[0]; Object.defineProperty(value.jobs, '0', { enumerable: true, get: () => { reads++; return row; } }); }
  assert.throws(() => validateCase(value)); assert.equal(reads, 0);
});

async function testDirectory(): Promise<string> {
  await mkdir('.repro-runs/hci-comparator', { recursive: true });
  return mkdtemp('.repro-runs/hci-comparator/independent-');
}
async function tree(root: string, allowLinks = false): Promise<Record<string, { bytes: number; sha256: string }>> {
  const result: Record<string, { bytes: number; sha256: string }> = {};
  async function visit(directory: string): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      const full = join(directory, name); const stat = await lstat(full);
      if (stat.isSymbolicLink() && allowLinks) { const target = await readlink(full); result[relative(root, full)] = { bytes: Buffer.byteLength(target), sha256: createHash('sha256').update(`symbolic-link:${target}`).digest('hex') }; continue; }
      assert.equal(stat.isSymbolicLink(), false, 'fixture inventory should never traverse symbolic links');
      if (stat.isDirectory()) await visit(full);
      else { const bytes = await readFile(full); result[relative(root, full)] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; }
    }
  }
  await visit(root); return result;
}
async function sourceFixture(referenceRoles = false) {
  const root = await testDirectory(); const sourceRoot = join(root, 'source');
  const db = new Ledger(sourceRoot); const example = caseFixture();
  const session = db.createSession(example.jobs[0]!.input.manifest!, true);
  const roles = {} as FreezeCaseOptions['roles'];
  const sourceFiles: string[] = [];
  const roleNames = ['record', 'reduction', 'comparison', 'export', 'cancelled'] as const;
  let cancellationEvidencePath = '';
  try {
    for (const [index, row] of example.jobs.entries()) {
      const job = db.startJob(session.id, row.job.operation, `private-request-${index}`);
      roles[roleNames[index]!] = job.id;
      const dir = join(sourceRoot, 'artifacts', job.id); await mkdir(dir, { recursive: true });
      const save = async (path: string, value: unknown) => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(value)); sourceFiles.push(relative(sourceRoot, path)); };
      await save(join(dir, 'manifest.json'), row.input.manifest);
      const result = structuredClone(row.job.result);
      if (row.job.operation === 'export') {
        const exportRoot = resolve(sourceRoot, 'exports', job.id);
        Object.assign(result, { path: exportRoot }); await mkdir(exportRoot, { recursive: true });
        const documents = exportReferenceDocuments();
        for (const doc of documents) { await writeFile(join(exportRoot, doc.name), doc.text); sourceFiles.push(relative(sourceRoot, join(exportRoot, doc.name))); }
        await save(join(exportRoot, 'integrity.json'), { format: 'repro-directory-v1', schemaVersion: 1, manifestDigest: row.input.manifestDigest, files: documents.map(doc => ({ path: doc.name, bytes: doc.bytes, sha256: doc.sha256 })) });
      }
      if ('id' in result) {
        result.artifacts = [{ path: `${result.id}/trace.zip`, sha256: SHA, bytes: 5 }];
        await save(join(dir, result.id, 'evidence.json'), { ...result, artifacts: undefined });
      }
      if ('original' in result) for (const item of [result.original, result.candidate]) await save(join(dir, item.id, 'evidence.json'), { ...item, artifacts: undefined });
      if ('trials' in result) {
        let execution = 0;
        for (const inspected of row.trials) for (const item of inspected.runs) {
          const path = join(dir, `execution-${String(++execution).padStart(6, '0')}`, item.runId, 'evidence.json');
          if (item.result) await save(path, { ...item.result, events: [] });
          else cancellationEvidencePath = path;
        }
        for (const trial of result.trials) db.event(job.id, 'trial', JSON.stringify(trial));
      }
      db.event(job.id, 'progress', '/Users/private/host-location PRIVATE_EVENT_SENTINEL');
      await save(join(dir, 'result.json'), result);
      db.finish(job.id, row.job.status === 'cancelled' ? 'cancelled' : 'complete', result);
    }
    db.updateManifest(session.id, example.session.manifest);
  } finally { db.close(); }
  if (referenceRoles) {
    // This rewrite is confined to a freshly created test-owned database, never a retained run.
    const database = new DatabaseSync(join(sourceRoot, 'ledger.sqlite'));
    try {
      database.exec('BEGIN; PRAGMA defer_foreign_keys=ON;');
      for (const role of roleNames) {
        const previous = roles[role]; const next = REFERENCE_ROLES[role];
        database.prepare('UPDATE jobs SET id=? WHERE id=?').run(next, previous);
        database.prepare('UPDATE events SET jobId=? WHERE jobId=?').run(next, previous);
        await rename(join(sourceRoot, 'artifacts', previous), join(sourceRoot, 'artifacts', next));
        if (role === 'export') {
          await rename(join(sourceRoot, 'exports', previous), join(sourceRoot, 'exports', next));
          const resultFile = join(sourceRoot, 'artifacts', next, 'result.json');
          const result = JSON.parse(await readFile(resultFile, 'utf8')) as { path: string };
          result.path = resolve(sourceRoot, 'exports', next);
          database.prepare('UPDATE jobs SET result=? WHERE id=?').run(JSON.stringify(result), next);
          await writeFile(resultFile, JSON.stringify(result));
        }
        roles[role] = next;
      }
      database.exec('COMMIT');
    } finally { database.close(); }
  }
  const options: FreezeCaseOptions = { sourceRoot, outputPath: join(root, 'packet.json'), sourceCommit: 'b'.repeat(40), runtimeInventorySha256: SHA, roles, caseId: 'independent-synthetic-test' };
  return { root, sourceRoot, options, sourceFiles, cancellationEvidencePath };
}
function cli(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/freeze-hci-case.ts', ...args], { encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL' });
}
function cliArgs(fixture: Awaited<ReturnType<typeof sourceFixture>>): string[] {
  return ['--source', fixture.sourceRoot, '--output', fixture.options.outputPath, '--source-commit', fixture.options.sourceCommit, '--runtime-inventory-sha256', fixture.options.runtimeInventorySha256];
}

test('freezer reads only closed synthetic source, preserves every file, and projects exact jobs with sanitized locators', async () => {
  const f = await sourceFixture(); const before = await tree(f.sourceRoot);
  const result = await freezeCase(f.options);
  assert.deepEqual(await tree(f.sourceRoot), before);
  for (const suffix of ['-wal', '-shm']) await assert.rejects(access(join(f.sourceRoot, `ledger.sqlite${suffix}`)), { code: 'ENOENT' });
  await assert.rejects(access(join(f.sourceRoot, 'owner.lock')), { code: 'ENOENT' });
  const written = await readFile(f.options.outputPath);
  assert.equal(result.sha256, createHash('sha256').update(written).digest('hex'));
  const stored = JSON.parse(written.toString('utf8')) as unknown;
  assert.deepEqual(validatePacket(stored), result.packet);
  assert.equal(result.packet.evidence.source.databaseSha256, before['ledger.sqlite']!.sha256);
  assert.equal(result.packet.evidence.jobs.length, 5);
  assert.deepEqual(new Set(result.packet.evidence.jobs.map(row => row.job.id)), new Set(Object.values(f.options.roles)));
  assert.equal(result.packet.evidence.jobs.find(row => row.job.id === f.options.roles.reduction)!.trials.length, 3);
  assert.equal(result.packet.evidence.jobs.find(row => row.job.id === f.options.roles.cancelled)!.trials.length, 1);
  const projection = JSON.stringify(result.packet);
  for (const privateText of [f.sourceRoot, '/Users/', 'PRIVATE_EVENT_SENTINEL', 'private-request-']) assert.equal(projection.includes(privateText), false, privateText);
  assert.ok(projection.includes(`local-export:${f.options.roles.export}`));
  assert.ok(projection.includes(`evidence-artifact:${f.options.roles.record}:record-run:0`));
  assert.ok(result.packet.evidence.redactions.some(row => row.kind === 'unregistered-text-withheld'));
  assert.ok(result.packet.evidence.redactions.some(row => row.kind === 'host-path-replaced'));
  assert.equal(result.packet.evidence.source.files.length, Object.keys(before).length);
  for (const resource of result.packet.evidence.source.files) assert.deepEqual({ bytes: resource.bytes, sha256: resource.sha256 }, before[resource.path]);
});
test('freezer preserves missing saved input as unavailable and does not recreate it or substitute session input', async () => {
  const f = await sourceFixture(); const missing = join(f.sourceRoot, 'artifacts', f.options.roles.record, 'manifest.json'); await unlink(missing);
  const before = await tree(f.sourceRoot); const result = await freezeCase(f.options);
  const row = result.packet.evidence.jobs.find(row => row.job.id === f.options.roles.record)!;
  assert.equal(row.input.availability, 'unavailable'); assert.equal(row.input.outcome, 'inconclusive');
  assert.equal(row.input.manifest, null); assert.equal(row.input.manifestDigest, null);
  assert.deepEqual(await tree(f.sourceRoot), before); await assert.rejects(access(missing), { code: 'ENOENT' });
});
test('freezer writes a new packet atomically and refuses to overwrite it', async () => {
  const f = await sourceFixture(); await freezeCase(f.options); const first = await readFile(f.options.outputPath);
  await assert.rejects(freezeCase(f.options)); assert.deepEqual(await readFile(f.options.outputPath), first);
  assert.deepEqual((await readdir(f.root)).sort(), ['packet.json', 'source']);
});
test('freezer CLI emits an actual validated packet without source mutation', async () => {
  const f = await sourceFixture(true); const before = await tree(f.sourceRoot); const result = cli(cliArgs(f));
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  const packet = validatePacket(JSON.parse(await readFile(f.options.outputPath, 'utf8')));
  assert.equal(packet.evidence.jobs.length, 5); assert.deepEqual(await tree(f.sourceRoot), before);
  const repeated = cli(cliArgs(f)); assert.equal(repeated.status, 2); assert.equal(repeated.stdout, '');
});
test('freezer module import does not execute CLI, exit, or write output even with process arguments', async () => {
  const f = await sourceFixture(); const before = await tree(f.root);
  const script = `process.argv = ['node', 'independent-importer', ...${JSON.stringify(cliArgs(f))}]; await import(${JSON.stringify(pathToFileURL(resolve('scripts/freeze-hci-case.ts')).href)}); console.log('IMPORT_SAFE');`;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, 'IMPORT_SAFE\n');
  assert.deepEqual(await tree(f.root), before);
});
for (const failure of ['missing-arguments', 'unknown-argument', 'outside-output', 'inside-source-output', 'unknown-role', 'source-lock', 'source-wal', 'source-shm', 'duplicate-argument', 'invalid-utf8', 'malformed-json', 'duplicate-json', 'missing-database', 'source-leaf-link', 'source-ancestor-link', 'hardlinked-json', 'oversized-json'] as const) test(`freezer rejects ${failure} without a partial packet`, async () => {
  const f = await sourceFixture(); const manifestPath = join(f.sourceRoot, 'artifacts', f.options.roles.record, 'manifest.json');
  let args = cliArgs(f);
  if (failure === 'missing-arguments') args = [];
  if (failure === 'unknown-argument') args.push('--unexpected');
  if (failure === 'duplicate-argument') args.push('--source', f.sourceRoot);
  if (failure === 'outside-output') f.options.outputPath = join(f.root, '..', '..', 'outside-packet.json');
  if (failure === 'inside-source-output') f.options.outputPath = join(f.sourceRoot, 'nested-packet.json');
  if (failure === 'unknown-role') f.options.roles.record = 'unrelated-job';
  if (failure === 'source-lock') await writeFile(join(f.sourceRoot, 'owner.lock'), JSON.stringify({ pid: process.pid }));
  if (failure === 'source-wal') await writeFile(join(f.sourceRoot, 'ledger.sqlite-wal'), 'incomplete');
  if (failure === 'source-shm') await writeFile(join(f.sourceRoot, 'ledger.sqlite-shm'), 'incomplete');
  if (failure === 'invalid-utf8') await writeFile(manifestPath, Buffer.from([0xff, 0xfe, 0x7b, 0x7d]));
  if (failure === 'malformed-json') await writeFile(manifestPath, '{invalid');
  if (failure === 'duplicate-json') { const raw = await readFile(manifestPath, 'utf8'); await writeFile(manifestPath, raw.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')); }
  if (failure === 'missing-database') await unlink(join(f.sourceRoot, 'ledger.sqlite'));
  if (failure === 'source-leaf-link') { const target = join(f.root, 'linked-manifest.json'); await writeFile(target, await readFile(manifestPath)); await unlink(manifestPath); await symlink(target, manifestPath); }
  if (failure === 'source-ancestor-link') { const alias = join(f.root, 'source-alias'); await symlink(resolve(f.sourceRoot), alias); f.options.sourceRoot = alias; }
  if (failure === 'hardlinked-json') await link(manifestPath, join(f.root, 'hardlink.json'));
  if (failure === 'oversized-json') await writeFile(manifestPath, ' '.repeat(512 * 1024 + 1));
  const before = await tree(f.sourceRoot, true);
  if (failure === 'missing-arguments' || failure === 'unknown-argument' || failure === 'duplicate-argument') { const result = cli(args); assert.equal(result.error, undefined); assert.equal(result.status, 2); assert.equal(result.stdout, ''); }
  else await assert.rejects(freezeCase(f.options));
  await assert.rejects(access(f.options.outputPath), { code: 'ENOENT' });
  assert.deepEqual(await tree(f.sourceRoot, true), before);
  assert.equal((await readdir(f.root)).some(name => name.startsWith('.packet') || name.endsWith('.tmp')), false);
});

test('packet input traversal bounds a shared-reference graph before exponential work', () => {
  const script = `import { validateCase } from './scripts/hci-case.ts'; import { caseFixture } from './tests/helpers/hci-case-fixture.ts'; let graph = [null]; for (let index = 0; index < 28; index++) graph = [graph, graph]; const value = caseFixture(); value.jobs[0].events[0].message = graph; try { validateCase(value); process.exitCode = 3; } catch { console.log('BOUNDED_REJECTION'); }`;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL', maxBuffer: 65_536 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, 'BOUNDED_REJECTION\n');
});

test('freezer rejects present unsupported private execution data rather than calling it missing evidence', async () => {
  const f = await sourceFixture();
  const path = join(f.sourceRoot, 'artifacts', f.options.roles.reduction, 'execution-000003', 'reduced-first', 'evidence.json');
  const run = JSON.parse(await readFile(path, 'utf8')) as { observation: { query: string } };
  run.observation.query = 'PRIVATE_UNSUPPORTED_QUERY_SENTINEL'; await writeFile(path, JSON.stringify(run));
  const before = await tree(f.sourceRoot);
  await assert.rejects(freezeCase(f.options));
  await assert.rejects(access(f.options.outputPath), { code: 'ENOENT' });
  assert.deepEqual(await tree(f.sourceRoot), before);
  assert.deepEqual(await readdir(f.root), ['source']);
});

test('freezer preserves a genuinely missing accepted run as unavailable without changing recorded acceptance', async () => {
  const f = await sourceFixture();
  const path = join(f.sourceRoot, 'artifacts', f.options.roles.reduction, 'execution-000003', 'reduced-first', 'evidence.json');
  await unlink(path); const before = await tree(f.sourceRoot);
  const result = await freezeCase(f.options);
  const row = result.packet.evidence.jobs.find(item => item.job.id === f.options.roles.reduction)!;
  assert.equal(row.trials[1]!.availability, 'unavailable'); assert.equal(row.trials[1]!.outcome, 'inconclusive');
  assert.equal(row.trials[1]!.trial!.accepted, true); assert.equal(row.trials[1]!.trial!.outcome, 'target-failure');
  assert.equal(row.trials[1]!.runs[0]!.result, null); assert.equal(row.trials[1]!.runs[0]!.availability, 'unavailable');
  assert.deepEqual(await tree(f.sourceRoot), before); await assert.rejects(access(path), { code: 'ENOENT' });
});

test('T6 packet requires readable export documents instead of an export count alone', () => {
  const value = caseFixture(); Reflect.deleteProperty(value, 'exportDocuments');
  assert.throws(() => validateCase(value));
});


test('T6 validated packet exposes the two exact inert reference documents with independently checked byte identities', () => {
  const value = caseFixture(); const packet = createPacket(value);
  assert.deepEqual(packet.evidence.exportDocuments, exportReferenceDocuments());
  assert.deepEqual(new Set(packet.evidence.exportDocuments.map(doc => doc.name)), new Set(['README.md', 'replay.test.mjs']));
  for (const doc of packet.evidence.exportDocuments) {
    assert.equal(doc.bytes, Buffer.byteLength(doc.text, 'utf8'));
    assert.equal(doc.sha256, createHash('sha256').update(doc.text, 'utf8').digest('hex'));
    const resource = packet.evidence.source.files.find(file => file.path === `exports/${IDS.export}/${doc.name}`)!;
    assert.equal(resource.sha256, doc.sha256); assert.equal(resource.bytes, doc.bytes);
  }
  assert.ok(packet.evidence.source.files.some(file => file.path === `exports/${IDS.export}/integrity.json`));
});
const invalidExportDocuments: [string, (value: HciCase) => void][] = [
  ['empty list', value => { value.exportDocuments = []; }],
  ['missing one document', value => { value.exportDocuments.pop(); }],
  ['duplicate document name', value => { value.exportDocuments[1]!.name = 'README.md'; }],
  ['unknown document', value => { Object.assign(value.exportDocuments[0]!, { name: 'package.json' }); }],
  ['unsafe document name', value => { Object.assign(value.exportDocuments[0]!, { name: '../README.md' }); }],
  ['missing document text', value => { Reflect.deleteProperty(value.exportDocuments[0]!, 'text'); }],
  ['null document text', value => { Object.assign(value.exportDocuments[0]!, { text: null }); }],
  ['unknown document property', value => { Object.assign(value.exportDocuments[0]!, { rawPath: '/Users/private/README.md' }); }],
  ['document byte mismatch', value => { value.exportDocuments[0]!.bytes++; }],
  ['negative document byte count', value => { value.exportDocuments[0]!.bytes = -1; }],
  ['nonfinite document byte count', value => { value.exportDocuments[0]!.bytes = Infinity; }],
  ['document hash mismatch', value => { value.exportDocuments[0]!.sha256 = 'c'.repeat(64); }],
  ['noncanonical document hash', value => { value.exportDocuments[0]!.sha256 = value.exportDocuments[0]!.sha256.toUpperCase(); }],
  ['changed document text', value => { value.exportDocuments[0]!.text += '\nChanged instruction'; }],
  ['rehash cannot authorize unknown document text', value => {
    const doc = value.exportDocuments[0]!; doc.text += '\nPRIVATE_DOC_SENTINEL'; doc.bytes = Buffer.byteLength(doc.text); doc.sha256 = createHash('sha256').update(doc.text).digest('hex');
    Object.assign(value.source.files.find(file => file.path === `exports/${IDS.export}/${doc.name}`)!, { bytes: doc.bytes, sha256: doc.sha256 });
  }],
  ['wrong approved text for filename', value => { const first = value.exportDocuments[0]!; const second = value.exportDocuments[1]!; Object.assign(first, { text: second.text, bytes: second.bytes, sha256: second.sha256 }); Object.assign(value.source.files.find(file => file.path === `exports/${IDS.export}/${first.name}`)!, { bytes: first.bytes, sha256: first.sha256 }); }],
  ['oversized document', value => { const doc = value.exportDocuments[0]!; doc.text = 'x'.repeat(65_537); doc.bytes = 65_537; doc.sha256 = createHash('sha256').update(doc.text).digest('hex'); }],
  ['missing document inventory resource', value => { value.source.files = value.source.files.filter(file => file.path !== `exports/${IDS.export}/README.md`); }],
  ['missing export integrity resource', value => { value.source.files = value.source.files.filter(file => file.path !== `exports/${IDS.export}/integrity.json`); }],
  ['document resource hash mismatch', value => { value.source.files.find(file => file.path === `exports/${IDS.export}/README.md`)!.sha256 = 'c'.repeat(64); }],
  ['document resource byte mismatch', value => { value.source.files.find(file => file.path === `exports/${IDS.export}/README.md`)!.bytes++; }],
  ['document resource belongs to another job', value => { value.source.files.find(file => file.path === `exports/${IDS.export}/README.md`)!.path = `exports/${IDS.record}/README.md`; }],
];
for (const [label, change] of invalidExportDocuments) test(`T6 rejects ${label}`, () => { const value = caseFixture(); change(value); assert.throws(() => validateCase(value)); });

test('T6 freezer reads fixed owned export resources and preserves their exact text, inventory and source bytes', async () => {
  const f = await sourceFixture(); const before = await tree(f.sourceRoot);
  const result = await freezeCase(f.options); assert.deepEqual(result.packet.evidence.exportDocuments, exportReferenceDocuments());
  for (const doc of result.packet.evidence.exportDocuments) {
    assert.equal(doc.text, await readFile(join(f.sourceRoot, 'exports', f.options.roles.export, doc.name), 'utf8'));
    const source = result.packet.evidence.source.files.find(file => file.path === `exports/${f.options.roles.export}/${doc.name}`)!;
    assert.deepEqual({ bytes: source.bytes, sha256: source.sha256 }, before[source.path]);
  }
  assert.ok(result.packet.evidence.source.files.some(file => file.path === `exports/${f.options.roles.export}/integrity.json`));
  assert.deepEqual(await tree(f.sourceRoot), before);
});

for (const failure of ['missing-readme', 'missing-readable-test', 'missing-integrity', 'changed-doc', 'rehashed-unknown-doc', 'oversized-doc', 'invalid-doc-utf8', 'doc-symlink', 'doc-hardlink', 'export-directory-link', 'integrity-malformed', 'integrity-duplicate-json', 'integrity-unknown-property', 'integrity-missing-doc', 'integrity-duplicate-doc', 'integrity-unsafe-path', 'integrity-wrong-hash', 'integrity-wrong-bytes', 'integrity-wrong-manifest', 'integrity-wrong-version', 'integrity-wrong-format', 'integrity-count-mismatch', 'recorded-export-path-mismatch'] as const) test(`T6 freezer rejects ${failure} without publishing or changing source`, async () => {
  const f = await sourceFixture(); const exportRoot = join(f.sourceRoot, 'exports', f.options.roles.export);
  const readme = join(exportRoot, 'README.md'); const integrityFile = join(exportRoot, 'integrity.json');
  const integrity = JSON.parse(await readFile(integrityFile, 'utf8')) as { format: string; schemaVersion: number; manifestDigest: string; files: { path: string; bytes: number; sha256: string }[] };
  if (failure === 'missing-readme') await unlink(readme);
  if (failure === 'missing-readable-test') await unlink(join(exportRoot, 'replay.test.mjs'));
  if (failure === 'missing-integrity') await unlink(integrityFile);
  if (failure === 'changed-doc' || failure === 'rehashed-unknown-doc') {
    const text = `${await readFile(readme, 'utf8')}\nPRIVATE_DOC_SENTINEL\n`;
    await writeFile(readme, text);
    if (failure === 'rehashed-unknown-doc') { Object.assign(integrity.files.find(item => item.path === 'README.md')!, { bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') }); await writeFile(integrityFile, JSON.stringify(integrity)); }
  }
  if (failure === 'oversized-doc') await writeFile(readme, 'x'.repeat(65_537));
  if (failure === 'invalid-doc-utf8') await writeFile(readme, Buffer.from([0xff, 0xfe, 0x41]));
  if (failure === 'doc-symlink') { const target = join(f.root, 'linked-readme.txt'); await writeFile(target, await readFile(readme)); await unlink(readme); await symlink(resolve(target), readme); }
  if (failure === 'doc-hardlink') await link(readme, join(f.root, 'hardlink-readme.txt'));
  if (failure === 'export-directory-link') { const target = join(f.root, 'linked-export'); await rename(exportRoot, target); await symlink(resolve(target), exportRoot); }
  if (failure === 'integrity-malformed') await writeFile(integrityFile, '{invalid');
  if (failure === 'integrity-duplicate-json') await writeFile(integrityFile, JSON.stringify(integrity).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'));
  if (failure === 'integrity-unknown-property') Object.assign(integrity, { sourcePath: '/Users/private/export' });
  if (failure === 'integrity-missing-doc') integrity.files.pop();
  if (failure === 'integrity-duplicate-doc') integrity.files.push(structuredClone(integrity.files[0]!));
  if (failure === 'integrity-unsafe-path') integrity.files[0]!.path = '../README.md';
  if (failure === 'integrity-wrong-hash') integrity.files[0]!.sha256 = 'c'.repeat(64);
  if (failure === 'integrity-wrong-bytes') integrity.files[0]!.bytes++;
  if (failure === 'integrity-wrong-manifest') integrity.manifestDigest = 'c'.repeat(64);
  if (failure === 'integrity-wrong-version') integrity.schemaVersion = 2;
  if (failure === 'integrity-wrong-format') integrity.format = 'unknown';
  if (failure === 'integrity-count-mismatch') integrity.files.push({ path: 'extra.txt', bytes: 10, sha256: SHA });
  if (failure.startsWith('integrity-') && failure !== 'integrity-malformed' && failure !== 'integrity-duplicate-json') await writeFile(integrityFile, JSON.stringify(integrity));
  if (failure === 'recorded-export-path-mismatch') {
    const resultFile = join(f.sourceRoot, 'artifacts', f.options.roles.export, 'result.json');
    const result = JSON.parse(await readFile(resultFile, 'utf8')) as { path: string }; result.path = resolve(f.root, 'different-export');
    await writeFile(resultFile, JSON.stringify(result));
    const database = new DatabaseSync(join(f.sourceRoot, 'ledger.sqlite'));
    try { database.prepare('UPDATE jobs SET result=? WHERE id=?').run(JSON.stringify(result), f.options.roles.export); } finally { database.close(); }
  }
  const before = await tree(f.root, true);
  await assert.rejects(freezeCase(f.options));
  await assert.rejects(access(f.options.outputPath), { code: 'ENOENT' });
  assert.deepEqual(await tree(f.root, true), before);
});

for (const escaped of [false, true]) test(`T6 packet rejects duplicated ${escaped ? 'escaped' : 'plain'} keys inside serialized trial messages`, () => {
  const value = caseFixture(); const row = value.jobs[1]!;
  const original = JSON.stringify(row.trials[0]!.trial);
  const secondKey = escaped ? '"\\u0072eason":' : '"reason":';
  const duplicated = original.replace('"reason":', `"reason":"PRIVATE_TEST_SENTINEL",${secondKey}`);
  assert.equal(JSON.parse(duplicated).reason, row.trials[0]!.trial!.reason);
  row.events = [{ seq: 1, at: '2026-10-13T00:00:00.000Z', type: 'trial', message: duplicated }];
  assert.throws(() => createPacket(value));
  const packet = { schemaVersion: 1, evidence: value, caseSha256: createHash('sha256').update(canonical(value)).digest('hex') };
  assert.throws(() => validatePacket(packet));
});

for (const change of ['schema-version', 'changed-expectation'] as const) test(`T6 CLI classifies ${change} manifest rejection as input without source changes or disclosure`, async () => {
  const f = await sourceFixture(true); const path = join(f.sourceRoot, 'artifacts', f.options.roles.record, 'manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8')) as { schemaVersion: number; expectation: { description: string } };
  if (change === 'schema-version') manifest.schemaVersion = 2;
  else manifest.expectation.description = 'PRIVATE_EXPECTATION_SENTINEL';
  await writeFile(path, JSON.stringify(manifest)); const before = await tree(f.root);
  const result = cli(cliArgs(f));
  assert.equal(result.error, undefined); assert.equal(result.status, 2, result.stderr); assert.equal(result.stdout, '');
  assert.equal((JSON.parse(result.stderr) as { category: string }).category, 'input');
  assert.equal(result.stderr.includes('PRIVATE_EXPECTATION_SENTINEL'), false);
  assert.equal(result.stderr.includes(f.sourceRoot), false);
  assert.deepEqual(await tree(f.root), before);
});

for (const mode of ['scratch-cleanup', 'post-link-temp-unlink', 'failed-owned-target-rollback'] as const) test(`T6 freezer preserves failure truth under ${mode}`, async () => {
  const f = await sourceFixture(); const before = await tree(f.sourceRoot);
  const script = `
    import filesystem from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import { basename, resolve } from 'node:path';
    const options = ${JSON.stringify(f.options)}; const mode = ${JSON.stringify(mode)};
    const original = { rm: filesystem.rm, link: filesystem.link, unlink: filesystem.unlink };
    const calls = []; let published = false; let tempFailed = false; let rollbackFailed = false;
    const injected = (code) => Object.assign(new Error('PRIVATE_FAULT_SENTINEL'), { code });
    filesystem.rm = async (...args) => { const path = String(args[0]); calls.push({ operation: 'rm', path }); if (mode === 'scratch-cleanup' && basename(path).startsWith('.scratch-')) throw injected('TEST_SCRATCH_CLEANUP'); return original.rm(...args); };
    filesystem.link = async (...args) => { calls.push({ operation: 'link', path: String(args[1]) }); await original.link(...args); published = true; };
    filesystem.unlink = async (...args) => {
      const path = String(args[0]); calls.push({ operation: 'unlink', path });
      if (published && basename(path).startsWith('.packet-') && path.endsWith('.partial') && !tempFailed) { tempFailed = true; throw injected('TEST_TEMP_UNLINK'); }
      if (mode === 'failed-owned-target-rollback' && published && resolve(path) === resolve(options.outputPath)) { rollbackFailed = true; throw injected('TEST_TARGET_ROLLBACK'); }
      return original.unlink(...args);
    };
    syncBuiltinESMExports();
    const { freezeCase } = await import('./scripts/freeze-hci-case.ts');
    const codes = (error, depth = 0) => depth > 8 || !error || typeof error !== 'object' ? [] : [error.code, ...codes(error.cause, depth + 1), ...(error instanceof AggregateError ? error.errors.flatMap(item => codes(item, depth + 1)) : [])].filter(value => typeof value === 'string');
    try { await freezeCase(options); console.log(JSON.stringify({ succeeded: true, calls })); }
    catch (error) { console.log(JSON.stringify({ succeeded: false, code: error.code, category: error.category, message: error.message, causeCodes: codes(error), published, tempFailed, rollbackFailed, calls })); }
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL', maxBuffer: 65_536 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout) as { succeeded: boolean; code: string; category: string; message: string; causeCodes: string[]; published: boolean; tempFailed: boolean; rollbackFailed: boolean; calls: { operation: string; path: string }[] };
  assert.equal(report.succeeded, false); assert.equal(report.category, 'environment');
  assert.equal(report.message.includes('PRIVATE_FAULT_SENTINEL'), false); assert.equal(report.message.includes(f.sourceRoot), false);
  assert.deepEqual(await tree(f.sourceRoot), before);
  if (mode === 'scratch-cleanup') {
    assert.ok(report.causeCodes.includes('TEST_SCRATCH_CLEANUP')); assert.equal(report.published, false);
    assert.equal(report.calls.some(call => call.operation === 'link'), false);
    await assert.rejects(access(f.options.outputPath), { code: 'ENOENT' });
  } else {
    assert.equal(report.code, 'HCI_CASE_PUBLISH'); assert.equal(report.published, true); assert.equal(report.tempFailed, true);
    assert.ok(report.causeCodes.includes('TEST_TEMP_UNLINK'));
    if (mode === 'failed-owned-target-rollback') {
      assert.equal(report.rollbackFailed, true); assert.ok(report.causeCodes.includes('TEST_TARGET_ROLLBACK'));
      assert.match(report.message, /inspect/i); validatePacket(JSON.parse(await readFile(f.options.outputPath, 'utf8')));
    } else await assert.rejects(access(f.options.outputPath), { code: 'ENOENT' });
    assert.equal((await readdir(f.root)).some(name => name.startsWith('.packet-')), false);
  }
});


test('T6 strict embedded JSON parsing rejects nested duplicate and escaped-equivalent member keys', () => {
  for (const text of ['{"outer":{"reason":"PRIVATE_TEST_SENTINEL","reason":"safe"}}', '{"outer":{"reason":"PRIVATE_TEST_SENTINEL","\\u0072eason":"safe"}}']) {
    assert.deepEqual(JSON.parse(text), { outer: { reason: 'safe' } }); assert.throws(() => parseCaseJson(text));
  }
  assert.deepEqual(parseCaseJson(' { "outer": [{"reason":"safe"}, null, true, 1] } '), { outer: [{ reason: 'safe' }, null, true, 1] });
});
test('T6 strict embedded JSON parsing enforces finite values, depth, node and UTF8 byte bounds', () => {
  for (const text of ['1e309', '['.repeat(35) + 'null' + ']'.repeat(35), '[' + Array.from({ length: 25_000 }, () => '0').join(',') + ']']) assert.throws(() => parseCaseJson(text));
  assert.throws(() => parseCaseJson('"éééé"', 8));
});
test('T6 leading-whitespace serialized trial messages still require exact withheld-reason redaction', () => {
  const value = caseFixture(); const row = value.jobs[1]!;
  if (!('trials' in row.job.result)) throw new Error('Synthetic reduction fixture missing');
  row.job.result.trials[0]!.reason = WITHHELD_TEXT;
  row.trials[0]!.trial!.reason = WITHHELD_TEXT; row.trials[0]!.reason = WITHHELD_TEXT;
  row.events = [{ seq: 1, at: '2026-10-13T00:00:00.000Z', type: 'trial', message: ' \n\t' + JSON.stringify(row.job.result.trials[0]) }];
  for (const pointer of ['/jobs/1/job/result/trials/0/reason', '/jobs/1/trials/0/trial/reason', '/jobs/1/trials/0/reason']) value.redactions.push({ pointer, kind: 'unregistered-text-withheld' });
  assert.throws(() => createPacket(value));
  value.redactions.push({ pointer: '/jobs/1/events/0/message/reason', kind: 'unregistered-text-withheld' });
  assert.deepEqual(createPacket(value).evidence, value);
});

const INSPECTOR_WITHHELD_REASON = 'Recorded explanation is withheld because it is outside the registered public evidence text.';
const CANCELLED_REASON_POINTERS = ['/jobs/4/trials/0/runs/0/reason', '/jobs/4/trials/0/runs/0/result/reason'] as const;
function availableCancelledCase(reason: string): HciCase {
  const value = caseFixture(), row = value.jobs[4]!, inspected = row.trials[0]!;
  if (!('baseline' in row.job.result)) throw new Error('Constructed cancellation fixture missing');
  const { events: _events, artifacts: _artifacts, ...result } = structuredClone(row.job.result.baseline);
  result.reason = reason;
  inspected.availability = 'available'; inspected.outcome = 'cancelled'; inspected.reason = inspected.trial!.reason;
  Reflect.deleteProperty(inspected, 'code');
  inspected.runs = [{ runId: result.id, availability: 'available', outcome: 'cancelled', reason, result }];
  value.source.files.push({ path: `artifacts/${row.job.id}/execution-000001/${result.id}/evidence.json`, sha256: SHA, bytes: 1024 });
  return value;
}

for (const omitted of ['both', ...CANCELLED_REASON_POINTERS] as const) test(`redaction accounting rejects inspector-withheld cancellation with ${omitted} declaration missing`, () => {
  const value = availableCancelledCase(INSPECTOR_WITHHELD_REASON);
  for (const pointer of CANCELLED_REASON_POINTERS) if (omitted !== 'both' && pointer !== omitted) value.redactions.push({ pointer, kind: 'unregistered-text-withheld' });
  assert.throws(() => createPacket(value), /Every withheld field requires its matching redaction record\./);
});

test('redaction accounting accepts both inspector-withheld cancellation declarations without changing recorded evidence', () => {
  const value = availableCancelledCase(INSPECTOR_WITHHELD_REASON);
  for (const pointer of CANCELLED_REASON_POINTERS) value.redactions.push({ pointer, kind: 'unregistered-text-withheld' });
  const packet = createPacket(value);
  assert.deepEqual(packet.evidence, value);
  assert.deepEqual(validatePacket(packet).evidence, value);
  const linked = packet.evidence.jobs[4]!.trials[0]!.runs[0]!;
  assert.equal(linked.outcome, 'cancelled'); assert.equal(linked.result!.assertionCount, 0); assert.equal(linked.result!.observation, null);
});

test('redaction accounting preserves ordinary cancellation explanations and rejects orphan withholding declarations', () => {
  const value = availableCancelledCase('The assertion has not executed.');
  assert.deepEqual(createPacket(value).evidence, value);
  for (const pointer of CANCELLED_REASON_POINTERS) {
    const orphan = structuredClone(value); orphan.redactions.push({ pointer, kind: 'unregistered-text-withheld' });
    assert.throws(() => createPacket(orphan), /Redaction record does not describe a transformed field\./);
  }
});

test('redaction accounting freezer declares both inspector-withheld cancellation reasons and preserves original source bytes', async () => {
  const f = await sourceFixture(); const value = caseFixture(); const cancellation = value.jobs[4]!.job.result;
  if (!('baseline' in cancellation)) throw new Error('Constructed cancellation fixture missing');
  const raw = { ...structuredClone(cancellation.baseline), reason: 'PRIVATE_CANCEL_REASON_TEST_SENTINEL' };
  await mkdir(join(f.cancellationEvidencePath, '..'), { recursive: true });
  await writeFile(f.cancellationEvidencePath, JSON.stringify(raw));
  const before = await tree(f.sourceRoot), result = await freezeCase(f.options);
  assert.deepEqual(await tree(f.sourceRoot), before);
  const index = result.packet.evidence.jobs.findIndex(row => row.job.id === f.options.roles.cancelled);
  const linked = result.packet.evidence.jobs[index]!.trials[0]!.runs[0]!;
  assert.equal(linked.availability, 'available'); assert.equal(linked.outcome, 'cancelled');
  assert.equal(linked.reason, INSPECTOR_WITHHELD_REASON); assert.equal(linked.result!.reason, INSPECTOR_WITHHELD_REASON);
  assert.equal(linked.result!.assertionCount, 0); assert.equal(linked.result!.observation, null);
  assert.equal(JSON.stringify(result.packet).includes(raw.reason), false);
  for (const suffix of ['/reason', '/result/reason']) assert.deepEqual(
    result.packet.evidence.redactions.filter(item => item.pointer === `/jobs/${index}/trials/0/runs/0${suffix}`),
    [{ pointer: `/jobs/${index}/trials/0/runs/0${suffix}`, kind: 'unregistered-text-withheld' }],
  );
  assert.deepEqual(validatePacket(result.packet), result.packet);
});

test('redaction accounting freezer preserves a pre-existing canonical withheld marker with its declaration', async () => {
  const f = await sourceFixture(); const database = new DatabaseSync(join(f.sourceRoot, 'ledger.sqlite'));
  try {
    const changed = database.prepare('UPDATE events SET message=? WHERE jobId=? AND type=?').run(WITHHELD_TEXT, f.options.roles.record, 'progress');
    assert.equal(changed.changes, 1);
  } finally { database.close(); }
  const before = await tree(f.sourceRoot), result = await freezeCase(f.options);
  assert.deepEqual(await tree(f.sourceRoot), before);
  const jobIndex = result.packet.evidence.jobs.findIndex(row => row.job.id === f.options.roles.record);
  const eventIndex = result.packet.evidence.jobs[jobIndex]!.events.findIndex(event => event.type === 'progress');
  assert.notEqual(eventIndex, -1);
  assert.equal(result.packet.evidence.jobs[jobIndex]!.events[eventIndex]!.message, WITHHELD_TEXT);
  const pointer = `/jobs/${jobIndex}/events/${eventIndex}/message`;
  assert.deepEqual(result.packet.evidence.redactions.filter(item => item.pointer === pointer), [{ pointer, kind: 'unregistered-text-withheld' }]);
  assert.deepEqual(validatePacket(result.packet), result.packet);
});

for (const mode of ['source-read-and-close', 'packet-write-and-close', 'packet-sync-and-close', 'packet-close-only'] as const) test(`T6 freezer preserves private causes for ${mode}`, async () => {
  const f = await sourceFixture(); const before = await tree(f.sourceRoot);
  const script = `
    import filesystem from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import { basename, resolve } from 'node:path';
    const options = ${JSON.stringify(f.options)}; const mode = ${JSON.stringify(mode)};
    const selectedInput = resolve(options.sourceRoot, 'artifacts', options.roles.record, 'manifest.json');
    const originalOpen = filesystem.open; const calls = [];
    const injected = (code) => Object.assign(new Error('PRIVATE_CLOSE_FAULT_SENTINEL'), { code });
    filesystem.open = async (...args) => {
      const handle = await originalOpen(...args); const path = String(args[0]);
      const selected = mode === 'source-read-and-close' ? resolve(path) === selectedInput : basename(path).startsWith('.packet-') && path.endsWith('.partial');
      if (!selected) return handle;
      calls.push('selected-open');
      return new Proxy(handle, { get(target, key) {
        if (key === 'close') return async () => { calls.push('close'); await target.close(); throw injected('TEST_HANDLE_CLOSE'); };
        if (key === 'read' && mode === 'source-read-and-close') return async () => { calls.push('read'); throw injected('TEST_SOURCE_READ'); };
        if (key === 'writeFile' && mode === 'packet-write-and-close') return async () => { calls.push('writeFile'); throw injected('TEST_PACKET_WRITE'); };
        if (key === 'sync' && mode === 'packet-sync-and-close') return async () => { calls.push('sync'); throw injected('TEST_PACKET_SYNC'); };
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
    };
    syncBuiltinESMExports();
    const { freezeCase } = await import('./scripts/freeze-hci-case.ts');
    const codes = (error, depth = 0) => depth > 8 || !error || typeof error !== 'object' ? [] : [error.code, ...codes(error.cause, depth + 1), ...(error instanceof AggregateError ? error.errors.flatMap(item => codes(item, depth + 1)) : [])].filter(value => typeof value === 'string');
    try { await freezeCase(options); console.log(JSON.stringify({ succeeded: true, calls })); }
    catch (error) { console.log(JSON.stringify({ succeeded: false, code: error.code, category: error.category, message: error.message, causeCodes: codes(error), calls })); }
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL', maxBuffer: 65_536 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout) as { succeeded: boolean; category: string; message: string; causeCodes: string[]; calls: string[] };
  assert.equal(report.succeeded, false); assert.equal(report.category, 'environment');
  assert.ok(report.calls.includes('selected-open')); assert.ok(report.calls.includes('close'));
  assert.ok(report.causeCodes.includes('TEST_HANDLE_CLOSE'), 'the private close failure must remain inspectable');
  if (mode === 'source-read-and-close') { assert.ok(report.calls.includes('read')); assert.ok(report.causeCodes.includes('TEST_SOURCE_READ'), 'the primary read failure must not be overwritten by close'); }
  if (mode === 'packet-write-and-close') { assert.ok(report.calls.includes('writeFile')); assert.ok(report.causeCodes.includes('TEST_PACKET_WRITE'), 'the primary write failure must not be overwritten by close'); }
  if (mode === 'packet-sync-and-close') { assert.ok(report.calls.includes('sync')); assert.ok(report.causeCodes.includes('TEST_PACKET_SYNC'), 'the primary sync failure must not be overwritten by close'); }
  assert.equal(report.message.includes('PRIVATE_CLOSE_FAULT_SENTINEL'), false); assert.equal(report.message.includes(f.sourceRoot), false);
  await assert.rejects(access(f.options.outputPath), { code: 'ENOENT' });
  assert.deepEqual(await tree(f.sourceRoot), before); assert.deepEqual(await readdir(f.root), ['source']);
});
