import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runBrowser, harnessDigest } from './adapter.js';
import { fixtureDigest } from './fixture.js';
import { exportCapsule } from './capsule.js';
import { ReproError, type Manifest, type RunResult } from './contracts.js';
import { Ledger, type Job, type Operation } from './ledger.js';
import { digest } from './manifest.js';
import { reduce } from './reducer.js';
import { ownedDirectory } from './paths.js';

export async function verify(manifest: Manifest, artifactDir: string, signal?: AbortSignal, onEvent?: (message: string) => void) {
  onEvent?.('Running original in fresh state');
  const original = await runBrowser(manifest, { artifactDir, ...(signal ? { signal } : {}) });
  onEvent?.('Running candidate in separate fresh state');
  const candidate = await runBrowser(manifest, { artifactDir, revision: 'fixed', ...(signal ? { signal } : {}) });
  const identity = [original, candidate].every(result => result.manifestDigest === digest(manifest) && result.assertionDigest === manifest.assertionDigest && result.harnessDigest === harnessDigest() && result.seed === manifest.environment.seed && result.assertionCount === 1 && result.runnerVersion === manifest.runnerVersion && result.adapterVersion === manifest.adapter.version)
    && original.appRevision === manifest.app.revision && original.appDigest === manifest.app.sourceDigest && candidate.appRevision === 'fixed' && candidate.appDigest === fixtureDigest('fixed') && original.id !== candidate.id;
  const confirmed = identity && original.outcome === 'target-failure' && candidate.outcome === 'requirement-satisfied';
  return { outcome: signal?.aborted ? 'cancelled' : confirmed ? 'requirement-satisfied' : 'inconclusive', reason: confirmed ? 'Original failure reproduced; candidate satisfies the same bounded frontend assertion.' : 'Comparison did not establish original failure and candidate satisfaction with identical assertion and harness.', manifestDigest: digest(manifest), original, candidate };
}
export function publicError(error: unknown): { outcome: 'inconclusive' | 'cancelled'; category: string; code: string; reason: string } {
  if (error instanceof ReproError) return { outcome: error.category === 'cancelled' ? 'cancelled' : 'inconclusive', category: error.category, code: error.code, reason: error.message };
  return { outcome: 'inconclusive', category: 'environment', code: 'OPERATION_FAILED', reason: 'Operation failed before reliable completion. Check local prerequisites and retry.' };
}
export class Coordinator {
  private active = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  constructor(readonly ledger: Ledger) {}
  start(sessionId: string, operation: Operation, requestKey: string): Job {
    const job = this.ledger.startJob(sessionId, operation, requestKey);
    if (job.status !== 'running' || this.active.has(job.id)) return job;
    const controller = new AbortController();
    const promise = this.execute(job, controller.signal).finally(() => this.active.delete(job.id));
    this.active.set(job.id, { controller, promise }); return job;
  }
  cancel(id: string): Job {
    const job = this.ledger.getJob(id);
    const running = this.active.get(id);
    if (running && !running.controller.signal.aborted) {
      this.ledger.event(id, 'cancel-requested', 'Cancellation requested; closing only this run’s browser and fixture.');
      running.controller.abort();
    }
    return job;
  }
  async wait(id: string): Promise<Job> { await this.active.get(id)?.promise; return this.ledger.getJob(id); }
  async close(): Promise<void> { for (const active of this.active.values()) active.controller.abort(); await Promise.all([...this.active.values()].map(a => a.promise)); }
  private async execute(job: Job, signal: AbortSignal): Promise<void> {
    try {
      const manifest = this.ledger.getSession(job.sessionId).manifest;
      const artifactDir = ownedDirectory(join(this.ledger.root, 'artifacts', job.id));
      await mkdir(artifactDir, { recursive: true, mode: 0o700 });
      await writeFile(join(artifactDir, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
      const event = (message: string) => this.ledger.event(job.id, 'progress', message);
      let result: unknown;
      if (job.operation === 'record' || job.operation === 'replay') {
        result = await runBrowser(manifest, { artifactDir, signal, onEvent: e => this.ledger.event(job.id, e.type, e.message, e.actionId) });
      } else if (job.operation === 'verify') {
        result = await verify(manifest, artifactDir, signal, event);
      } else if (job.operation === 'reduce') {
        const reduction = await reduce(manifest, runBrowser, { artifactDir, signal, maxExecutions: 50, maxDurationMs: 120_000, repetitions: 2, onTrial: trial => this.ledger.event(job.id, 'trial', JSON.stringify(trial)) });
        if (reduction.status !== 'inconclusive') this.ledger.updateManifest(job.sessionId, reduction.manifest);
        result = reduction;
      } else {
        event('Validating and writing capsule into a temporary directory');
        result = await exportCapsule(manifest, join(this.ledger.root, 'exports', job.id), { signal });
      }
      await writeFile(join(artifactDir, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
      const record = result as Partial<RunResult> & { status?: string };
      this.ledger.finish(job.id, signal.aborted || record.outcome === 'cancelled' || record.status === 'cancelled' ? 'cancelled' : record.outcome === 'inconclusive' || record.status === 'inconclusive' ? 'failed' : 'complete', result);
    } catch (error) {
      this.ledger.finish(job.id, signal.aborted ? 'cancelled' : 'failed', signal.aborted ? { outcome: 'cancelled', reason: 'Cancelled by owner.' } : publicError(error));
    }
  }
}
