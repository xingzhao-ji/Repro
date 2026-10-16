import { randomUUID, createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { VERSION, ReproError, type ManifestV3, type RunOptions, type RunResult, type TeardownEvent } from './contracts.js';
import { getRegisteredCase, BROWSER_CASE_ARTIFACT_DIGEST } from './browser-case.js';
import { digest, validateManifest } from './manifest.js';
import { caseWorkerArtifactDigest, runCaseWorker } from './case-worker-client.js';

const EXECUTABLE_DIGEST = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
export function caseHarnessDigest(manifest: ManifestV3): string {
  const definition = getRegisteredCase(manifest.caseId);
  return digest({ executable: EXECUTABLE_DIGEST, oracleExecutable: BROWSER_CASE_ARTIFACT_DIGEST,
    workerExecutable: caseWorkerArtifactDigest(), contract: definition.contractDigest, wrapper: definition.wrapperDigest, version: VERSION });
}

/** The parent alone authorizes profile deletion after a trusted worker join. */
export async function runCaseBrowser(input: ManifestV3, options: RunOptions): Promise<RunResult> {
  // Bind identities and callbacks before asynchronous bootstrap can expose a
  // caller mutation. The signal object itself remains live for cancellation.
  input = structuredClone(input);
  options = { ...options };
  const startedNs = process.hrtime.bigint();
  const startedAt = new Date().toISOString();
  const id = randomUUID();
  let result: RunResult = {
    id, outcome: 'inconclusive', reason: 'The frozen assertion has not executed.',
    manifestDigest: digest(input), assertionDigest: input.assertionDigest, harnessDigest: caseHarnessDigest(input),
    appRevision: options.revision ?? input.app.revision, appDigest: '', adapterVersion: VERSION, runnerVersion: VERSION,
    seed: input.environment.seed, startedAt, durationMs: 0, assertionCount: 0, observation: null, events: [], artifacts: [],
    environment: { platform: `${process.platform}-${process.arch}`, node: process.version, browser: 'not-launched',
      isolation: 'registered public browser library; fresh owned profile; Chromium sandbox enabled; loopback asset allowlist; not a hostile-code sandbox' },
  };
  let directory: string | undefined;
  let observer = options.onTeardown;
  let sequence = 0;
  const forward = (event: TeardownEvent) => {
    if (!observer) return;
    try { observer({ ...event, seq: ++sequence }); } catch { observer = undefined; }
  };
  const trace = (phase: TeardownEvent['phase'], event: TeardownEvent['event'], outcome?: TeardownEvent['outcome']) => {
    if (!observer) return;
    const now = process.hrtime.bigint();
    let profileState: TeardownEvent['profileState'] = 'not-created';
    if (directory) {
      try { lstatSync(join(directory, '.profile')); profileState = 'present'; }
      catch (cause) { profileState = (cause as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'unavailable'; }
    }
    forward({ phase, event, ...(outcome ? { outcome } : {}), seq: 0, runId: id, elapsedMs: Number(now - startedNs) / 1e6,
      monotonicNs: now.toString(), profileState, profileProbeCompletedMonotonicNs: process.hrtime.bigint().toString() });
  };
  try {
    validateManifest(input);
    if (options.signal?.aborted) throw new ReproError('cancelled', 'CANCELLED', 'The owner cancelled the run. Start a new run to retry.');
    const artifactDir = resolve(options.artifactDir);
    const completion = await runCaseWorker(input, { ...options, artifactDir, ...(observer ? { onTeardown: forward } : {}) },
      { id, harnessDigest: result.harnessDigest, startedAt, startedNs: startedNs.toString() });
    const receipt = completion.receipt;
    if (receipt) result = receipt.result;
    if (completion.ownedDirectory) directory = join(artifactDir, id);
    // A no-process receipt is usable only after creation was fenced and that
    // exact worker naturally completed. Any process attempt needs the acquired
    // context's close acknowledgement as well; exit alone is never sufficient.
    const completed = receipt && completion.closed && !completion.protocolFailed && completion.completedBeforeDeadline
      && receipt.workDrained && !receipt.cleanupTimedOut
      && (receipt.launchState === 'acquired' ? receipt.closeAcknowledged : completion.attempts === 0);
    if (options.signal?.aborted) {
      result.outcome = 'cancelled'; result.category = 'cancelled';
      result.reason = 'CANCELLED: The owner cancelled the run. Start a new run to retry.';
    }
    if (!completed) {
      result.outcome = options.signal?.aborted ? 'cancelled' : 'inconclusive'; result.category = 'environment';
      result.reason = receipt?.launchState === 'unacquired'
        ? `CLEANUP_FAILED: Browser launch failed without a shutdown acknowledgment. The owned .profile directory is retained; verify this run’s owned runtime has stopped before removing it or retrying. Previous outcome: ${result.reason}`
        : 'CLEANUP_FAILED: Browser shutdown or worker completion was not acknowledged within the cleanup budget. The owned .profile directory is retained; inspect this run and stop its owned runtime before retrying.';
      if (directory) trace('profile-cleanup', 'retained');
    } else if (directory) {
      trace('profile-cleanup', 'call');
      try { await rm(join(directory, '.profile'), { recursive: true, force: true }); trace('profile-cleanup', 'removed', 'resolved'); }
      catch {
        trace('profile-cleanup', 'retained', 'rejected');
        result.outcome = result.outcome === 'cancelled' ? 'cancelled' : 'inconclusive'; result.category = 'environment';
        result.reason = 'PROFILE_CLEANUP_FAILED: The owned temporary profile remains. Remove only this run’s .profile directory after inspecting it.';
      }
    }
  } catch (cause) {
    result.outcome = cause instanceof ReproError && cause.category === 'cancelled' ? 'cancelled' : 'inconclusive';
    result.category = cause instanceof ReproError ? cause.category : 'environment';
    result.reason = cause instanceof ReproError ? `${cause.code}: ${cause.message}` : 'RUNNER_ERROR: The owned worker could not execute. Check prerequisites and writable task output, then retry.';
  }
  result.durationMs = Number(process.hrtime.bigint() - startedNs) / 1e6;
  if (directory) {
    const content = Buffer.from(JSON.stringify(result, null, 2) + '\n');
    try {
      await writeFile(join(directory, 'evidence.json'), content, { flag: 'wx', mode: 0o600 });
      result.artifacts.push({ path: `${id}/evidence.json`, sha256: createHash('sha256').update(content).digest('hex'), bytes: content.length });
    } catch { result.outcome = 'inconclusive'; result.category = 'environment'; result.reason = 'EVIDENCE_FAILED: Evidence could not be saved. Check writable output and retry in a new directory.'; }
  }
  trace('run', 'return');
  return result;
}
