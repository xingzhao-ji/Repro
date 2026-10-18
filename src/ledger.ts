import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ReproError, type Manifest, type RunEvent, type WorkbenchManifest } from './contracts.js';
import { validateManifest } from './manifest.js';
import { ownedDirectory, regularOwnedFile } from './paths.js';

export type SessionState = 'ready' | 'running' | 'reducing' | 'exporting' | 'complete' | 'cancelled' | 'blocked';
export type Operation = 'record' | 'replay' | 'reduce' | 'verify' | 'export';
export interface Session { id: string; createdAt: string; state: SessionState; manifest: WorkbenchManifest; consent: true }
export interface Job { id: string; sessionId: string; operation: Operation; status: 'running' | 'complete' | 'cancelled' | 'failed' | 'interrupted'; requestKey: string; startedAt: string; result: unknown }
export type ReportJobStatus = 'running' | 'reproduced' | 'intermittent' | 'not-reproduced' | 'blocked' | 'needs-input' | 'cancelled' | 'failed' | 'interrupted';
/** A REPRO.md job from the one-page report flow. The request keeps the reporter's text as entered; REPRO.md is redacted. */
export interface ReportJob { id: string; createdAt: string; status: ReportJobStatus; requestKey: string; request: unknown; result: unknown }
export interface ReportEvent { seq: number; at: string; stage: string; message: string }

function workbenchManifest(value: unknown): WorkbenchManifest {
  const manifest = validateManifest(value);
  if (manifest.schemaVersion === 4) throw new ReproError('unsupported', 'SESSION_SCHEMA', 'Local-app reports are generated as REPRO.md report jobs, not capture sessions.');
  return manifest;
}
export function validId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new ReproError('input', 'INVALID_ID', 'Invalid identifier');
  return value;
}
export class Ledger {
  readonly root: string;
  private db!: DatabaseSync;
  private lock: string;
  constructor(root: string) {
    this.root = ownedDirectory(root); mkdirSync(this.root, { recursive: true, mode: 0o700 });
    for (const file of ['ledger.sqlite', 'ledger.sqlite-wal', 'ledger.sqlite-shm', 'owner.lock']) regularOwnedFile(join(this.root, file));
    this.lock = join(this.root, 'owner.lock');
    const acquire = () => writeFileSync(this.lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 });
    try { acquire(); }
    catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST')) throw cause;
      let owner: unknown;
      try { owner = JSON.parse(readFileSync(this.lock, 'utf8')); }
      catch { throw new ReproError('environment', 'LEDGER_LOCK', 'Ledger owner lock is unreadable. Inspect this task-owned directory before recovery.'); }
      const pid = (owner as { pid?: number }).pid;
      if (!Number.isInteger(pid) || !pid || pid <= 0) throw new ReproError('environment', 'LEDGER_LOCK', 'Ledger owner lock is invalid.');
      let alive = true;
      try { process.kill(pid, 0); }
      catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ESRCH') alive = false; }
      if (alive) throw new ReproError('environment', 'LEDGER_BUSY', 'Ledger is already open in a live coordinator. Use its workbench or a separate run directory.');
      unlinkSync(this.lock); acquire();
    }
    try {
    this.db = new DatabaseSync(join(this.root, 'ledger.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, state TEXT NOT NULL, manifest TEXT NOT NULL, consent INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), operation TEXT NOT NULL, status TEXT NOT NULL, requestKey TEXT NOT NULL, startedAt TEXT NOT NULL, result TEXT, UNIQUE(sessionId, requestKey));
      CREATE TABLE IF NOT EXISTS events(jobId TEXT NOT NULL REFERENCES jobs(id), seq INTEGER NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, actionId TEXT, PRIMARY KEY(jobId, seq));
      CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, status TEXT NOT NULL, requestKey TEXT NOT NULL UNIQUE, request TEXT NOT NULL, result TEXT);
      CREATE TABLE IF NOT EXISTS report_events(reportId TEXT NOT NULL REFERENCES reports(id), seq INTEGER NOT NULL, at TEXT NOT NULL, stage TEXT NOT NULL, message TEXT NOT NULL, PRIMARY KEY(reportId, seq));`);
    this.transaction(() => {
      for (const row of this.db.prepare("SELECT id, sessionId FROM jobs WHERE status = 'running'").all()) {
        this.db.prepare("UPDATE jobs SET status='interrupted', result=? WHERE id=?").run(JSON.stringify({ outcome: 'inconclusive', reason: 'Process interrupted before durable completion; retry creates fresh owned state.' }), row.id!);
        this.db.prepare("UPDATE sessions SET state='blocked' WHERE id=?").run(row.sessionId!);
        this.event(String(row.id), 'interrupted', 'Run interrupted before durable completion. Retry with a fresh run.');
      }
      for (const row of this.db.prepare("SELECT id FROM reports WHERE status = 'running'").all()) {
        this.db.prepare("UPDATE reports SET status='interrupted', result=? WHERE id=?").run(JSON.stringify({ status: 'interrupted', summary: 'Repro stopped before this report finished. No REPRO.md was written; start a new report.' }), String(row.id));
        this.reportEvent(String(row.id), 'interrupted', 'Repro stopped before this report finished.');
      }
    });
    } catch (error) {
      this.db?.close(); unlinkSync(this.lock); throw error;
    }
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  createSession(manifest: Manifest, consent: boolean): Session {
    if (!consent) throw new ReproError('input', 'CONSENT_REQUIRED', 'Capture consent is required for the registered synthetic origin.');
    const result: Session = { id: randomUUID(), createdAt: new Date().toISOString(), state: 'ready', manifest: workbenchManifest(manifest), consent: true };
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(result.id, result.createdAt, result.state, JSON.stringify(result.manifest), 1);
    return result;
  }
  sessions(): Session[] { return this.db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC').all().map(row => this.sessionRow(row)); }
  private sessionRow(row: Record<string, unknown>): Session {
    return { id: String(row.id), createdAt: String(row.createdAt), state: row.state as SessionState, manifest: workbenchManifest(JSON.parse(String(row.manifest))), consent: true };
  }
  getSession(id: string): Session {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(validId(id));
    if (!row) throw new ReproError('input', 'NOT_FOUND', 'Session not found');
    return this.sessionRow(row);
  }
  updateManifest(id: string, manifest: Manifest): void {
    const updated = workbenchManifest(manifest);
    const current = this.getSession(id).manifest;
    const frozen = (value: WorkbenchManifest) => ({
      schemaVersion: value.schemaVersion, expectation: value.expectation,
      assertionDigest: value.assertionDigest, expectationBasis: value.expectationBasis,
      humanApproval: value.humanApproval,
      ...(value.schemaVersion === 2 ? { scenario: value.scenario, expectationSource: value.expectationSource } : {}),
      ...(value.schemaVersion === 3 ? { caseId: value.caseId, expectationSource: value.expectationSource, app: value.app, boundary: value.boundary, environment: value.environment, adapter: value.adapter, runnerVersion: value.runnerVersion } : {}),
    });
    if (!isDeepStrictEqual(frozen(current), frozen(updated))) throw new ReproError('verification', 'FROZEN_EXPECTATION', 'The session expectation and scenario are frozen. Create a new session to declare different expected behavior.');
    this.db.prepare('UPDATE sessions SET manifest=? WHERE id=?').run(JSON.stringify(updated), validId(id));
  }
  startJob(sessionId: string, operation: Operation, requestKey: string): Job {
    validId(requestKey); this.getSession(sessionId);
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM jobs WHERE sessionId=? AND requestKey=?').get(sessionId, requestKey);
      if (previous) {
        if (previous.operation !== operation) throw new ReproError('input', 'IDEMPOTENCY_CONFLICT', 'Request key already used for another operation.');
        return this.jobRow(previous);
      }
      if (this.db.prepare("SELECT id FROM jobs WHERE sessionId=? AND status='running'").get(sessionId)) throw new ReproError('input', 'BUSY', 'A session job is already running. Cancel it or wait.');
      const job: Job = { id: randomUUID(), sessionId, operation, status: 'running', requestKey, startedAt: new Date().toISOString(), result: null };
      this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,NULL)').run(job.id, sessionId, operation, job.status, requestKey, job.startedAt);
      this.db.prepare('UPDATE sessions SET state=? WHERE id=?').run(operation === 'reduce' ? 'reducing' : operation === 'export' ? 'exporting' : 'running', sessionId);
      this.event(job.id, 'started', `${operation} started`); return job;
    });
  }
  private jobRow(row: Record<string, unknown>): Job {
    return { id: String(row.id), sessionId: String(row.sessionId), operation: row.operation as Operation, status: row.status as Job['status'], requestKey: String(row.requestKey), startedAt: String(row.startedAt), result: row.result ? JSON.parse(String(row.result)) : null };
  }
  getJob(id: string): Job {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(validId(id));
    if (!row) throw new ReproError('input', 'NOT_FOUND', 'Job not found');
    return this.jobRow(row);
  }
  jobs(sessionId: string): Job[] { return this.db.prepare('SELECT * FROM jobs WHERE sessionId=? ORDER BY startedAt DESC').all(validId(sessionId)).map(row => this.jobRow(row)); }
  event(jobId: string, type: string, message: string, actionId?: string): void {
    if (Buffer.byteLength(message, 'utf8') > 65_536) throw new ReproError('input', 'EVENT_SIZE', 'Event exceeds 64 KiB and cannot be persisted intact.');
    this.db.prepare('INSERT INTO events SELECT ?, COALESCE(MAX(seq),0)+1, ?, ?, ?, ? FROM events WHERE jobId=?').run(validId(jobId), new Date().toISOString(), type, message, actionId ?? null, jobId);
  }
  events(jobId: string, after = 0): RunEvent[] {
    return this.db.prepare('SELECT * FROM events WHERE jobId=? AND seq>? ORDER BY seq').all(validId(jobId), after).map(row => ({ seq: Number(row.seq), at: String(row.at), type: String(row.type), message: String(row.message), ...(row.actionId ? { actionId: String(row.actionId) } : {}) }));
  }
  finish(id: string, status: 'complete' | 'cancelled' | 'failed', result: unknown): void {
    this.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== 'running') throw new ReproError('verification', 'TERMINAL_JOB', 'Cannot change a terminal job.');
      this.db.prepare('UPDATE jobs SET status=?,result=? WHERE id=?').run(status, JSON.stringify(result), id);
      this.db.prepare('UPDATE sessions SET state=? WHERE id=?').run(status === 'failed' ? 'blocked' : status, job.sessionId);
      this.event(id, status, `${job.operation} ${status}`);
    });
  }
  createReport(request: unknown, requestKey: string): ReportJob {
    validId(requestKey);
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM reports WHERE requestKey=?').get(requestKey);
      if (previous) return this.reportRow(previous);
      if (this.db.prepare("SELECT id FROM reports WHERE status='running'").get()) throw new ReproError('input', 'BUSY', 'A report is already being generated. Cancel it or wait for it to finish.');
      const report: ReportJob = { id: randomUUID(), createdAt: new Date().toISOString(), status: 'running', requestKey, request, result: null };
      this.db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,NULL)').run(report.id, report.createdAt, report.status, requestKey, JSON.stringify(request));
      this.reportEvent(report.id, 'started', 'Report started');
      return report;
    });
  }
  private reportRow(row: Record<string, unknown>): ReportJob {
    return { id: String(row.id), createdAt: String(row.createdAt), status: row.status as ReportJobStatus, requestKey: String(row.requestKey), request: JSON.parse(String(row.request)), result: row.result ? JSON.parse(String(row.result)) : null };
  }
  getReport(id: string): ReportJob {
    const row = this.db.prepare('SELECT * FROM reports WHERE id=?').get(validId(id));
    if (!row) throw new ReproError('input', 'NOT_FOUND', 'Report not found');
    return this.reportRow(row);
  }
  reports(limit = 20): ReportJob[] { return this.db.prepare('SELECT * FROM reports ORDER BY createdAt DESC LIMIT ?').all(limit).map(row => this.reportRow(row)); }
  reportEvent(reportId: string, stage: string, message: string): void {
    if (Buffer.byteLength(message, 'utf8') > 4096) message = message.slice(0, 2000);
    this.db.prepare('INSERT INTO report_events SELECT ?, COALESCE(MAX(seq),0)+1, ?, ?, ? FROM report_events WHERE reportId=?').run(validId(reportId), new Date().toISOString(), stage, message, reportId);
  }
  reportEvents(reportId: string, after = 0): ReportEvent[] {
    return this.db.prepare('SELECT * FROM report_events WHERE reportId=? AND seq>? ORDER BY seq').all(validId(reportId), after).map(row => ({ seq: Number(row.seq), at: String(row.at), stage: String(row.stage), message: String(row.message) }));
  }
  finishReport(id: string, status: Exclude<ReportJobStatus, 'running' | 'interrupted'>, result: unknown): void {
    this.transaction(() => {
      if (this.getReport(id).status !== 'running') throw new ReproError('verification', 'TERMINAL_JOB', 'Cannot change a finished report.');
      this.db.prepare('UPDATE reports SET status=?, result=? WHERE id=?').run(status, JSON.stringify(result), id);
      this.reportEvent(id, 'finished', status);
    });
  }
  close(): void { this.db.close(); unlinkSync(this.lock); }
}
