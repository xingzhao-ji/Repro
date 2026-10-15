import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ReproError } from './contracts.js';
import type { Manifest, Outcome, ReductionOptions, ReductionResult, RunFunction, RunResult, Trial } from './contracts.js';
import { digest, validateManifest } from './manifest.js';
import { assertObservation, TargetFailure } from './oracle.js';
import { searchContract, expectationEstablished } from './search-contract.js';

type Stop = 'budget-exhausted' | 'cancelled';
interface Evaluation { trial: Trial; results: RunResult[]; conclusive: boolean; stop?: Stop }

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Removing a prerequisite also removes its transitive dependents. */
function without(manifest: Manifest, selected: string[]): { candidate: Manifest; removed: string[] } {
  const removed = new Set(selected);
  // Manifest validation requires prerequisites to precede dependents.
  for (const action of manifest.actions) if (action.dependsOn.some(id => removed.has(id))) removed.add(action.id);
  return {
    candidate: { ...manifest, actions: manifest.actions.filter(action => !removed.has(action.id)) },
    removed: manifest.actions.filter(action => removed.has(action.id)).map(action => action.id),
  };
}

function noRun(manifest: Manifest, outcome: 'inconclusive' | 'cancelled', reason: string): RunResult {
  return {
    id: 'not-executed', outcome, reason, category: outcome === 'cancelled' ? 'cancelled' : 'verification',
    manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest, harnessDigest: '',
    appRevision: manifest.app.revision, appDigest: manifest.app.sourceDigest,
    adapterVersion: manifest.adapter.version, runnerVersion: manifest.runnerVersion,
    seed: manifest.environment.seed, startedAt: new Date().toISOString(), durationMs: 0, assertionCount: 0,
    observation: null, events: [], artifacts: [],
    environment: { platform: process.platform, node: process.version, browser: 'not-run', isolation: 'not-run' },
  };
}

function evidenceProblem(result: RunResult, manifest: Manifest, inputDigest: string, harnessDigest?: string): string | undefined {
  if (!['target-failure', 'requirement-satisfied', 'inconclusive', 'cancelled'].includes(result.outcome)) return 'Run outcome is unsupported; no failure claim is available.';
  if (result.manifestDigest !== inputDigest || result.assertionDigest !== manifest.assertionDigest
    || result.appRevision !== manifest.app.revision || result.appDigest !== manifest.app.sourceDigest
    || result.adapterVersion !== manifest.adapter.version || result.runnerVersion !== manifest.runnerVersion
    || result.seed !== manifest.environment.seed) return 'Run evidence does not match the frozen input, assertion, application, or execution identity.';
  if (!/^[a-f0-9]{64}$/.test(result.harnessDigest) || (harnessDigest !== undefined && result.harnessDigest !== harnessDigest)) {
    return 'Independent harness identity is missing or changed.';
  }
  if ((result.outcome === 'target-failure' || result.outcome === 'requirement-satisfied')
    && result.assertionCount !== 1) return 'Exactly one executed frozen assertion must establish this outcome.';
  if (result.outcome === 'target-failure' || result.outcome === 'requirement-satisfied') {
    if (!result.observation) return 'No observation establishes the declared outcome.';
    let observedOutcome: Outcome = 'requirement-satisfied';
    try { assertObservation(result.observation, manifest.expectation, searchContract(manifest)); }
    catch (error) {
      if (error instanceof TargetFailure) observedOutcome = 'target-failure';
      else return 'Observation does not establish the intended failure or requirement satisfaction.';
    }
    if (observedOutcome !== result.outcome) return 'Run label contradicts independent evaluation of its observation.';
    if (result.category && result.category !== 'target-failure') return 'Conclusive run has a contradictory error category.';
  }
  return undefined;
}

/**
 * Bounded action-only reduction. Every invocation of run must reset its owned
 * browser/state; no observations from earlier candidates are used as a cache.
 * All executions, including baseline repetitions and failed trials, spend the
 * same budget. Only fully repeated target failures become the best manifest.
 */
export async function reduce(manifest: Manifest, run: RunFunction, options: ReductionOptions): Promise<ReductionResult> {
  for (const [name, value] of Object.entries({ maxExecutions: options.maxExecutions, maxDurationMs: options.maxDurationMs, repetitions: options.repetitions })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new ReproError('input', 'INVALID_REDUCTION_BUDGET', `${name} must be a positive safe integer.`);
  }
  const original = freeze(structuredClone(validateManifest(manifest)));
  const started = performance.now();
  const deadline = started + options.maxDurationMs;
  const controller = new AbortController();
  const cancel = () => controller.abort(new ReproError('cancelled', 'REDUCTION_CANCELLED', 'Reduction was cancelled by its owner.'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new ReproError('cancelled', 'REDUCTION_DEADLINE', 'Reduction wall-time budget expired.')), Math.min(options.maxDurationMs, 2_147_483_647));
  let executions = 0;
  let best = original;
  let baseline = noRun(original, options.signal?.aborted ? 'cancelled' : 'inconclusive', 'Baseline has not executed.');
  let harnessDigest: string | undefined;
  const trials: Trial[] = [];
  const runIds = new Set<string>();

  const stopped = (): Stop | undefined => {
    if (options.signal?.aborted) return 'cancelled';
    if (performance.now() >= deadline || controller.signal.aborted || executions >= options.maxExecutions) return 'budget-exhausted';
    return undefined;
  };
  const finish = (status: ReductionResult['status'], reason: string, minimality: ReductionResult['minimality'] = 'unverified'): ReductionResult => ({
    manifest: structuredClone(best), trials, baseline, status, minimality, reason,
    executions, durationMs: Math.max(0, performance.now() - started),
  });

  const evaluate = async (candidate: Manifest, removed: string[]): Promise<Evaluation> => {
    const began = performance.now();
    const input = freeze(structuredClone(candidate));
    const inputDigest = digest(input);
    const results: RunResult[] = [];
    let outcome: Outcome = 'inconclusive';
    let reason = 'Candidate has not executed.';
    let conclusive = false;
    let stop: Stop | undefined;
    let preserved = 0;
    for (let repetition = 0; repetition < options.repetitions; repetition++) {
      stop = stopped();
      if (stop) {
        outcome = stop === 'cancelled' ? 'cancelled' : 'inconclusive';
        reason = stop === 'cancelled' ? 'Reduction cancelled before the repetition rule was met.' : 'Reduction budget exhausted before the repetition rule was met.';
        break;
      }
      executions++;
      let observed: RunResult;
      try {
        observed = await run(input, {
          artifactDir: join(options.artifactDir, `execution-${String(executions).padStart(6, '0')}`),
          signal: controller.signal,
        });
      } catch (cause) {
        // Preserve the original cause without copying arbitrary exception text
        // (which can contain target secrets) into the public reduction ledger.
        const error = new ReproError('harness', 'REDUCTION_RUN_ERROR', 'Runner failed before verified evidence was available.', { cause });
        observed = { ...noRun(input, controller.signal.aborted ? 'cancelled' : 'inconclusive', error.message),
          id: `execution-${String(executions).padStart(6, '0')}-no-evidence`, category: 'harness' };
      }
      results.push(observed);
      // Reaching maxExecutions after a completed last repetition is allowed.
      // Deadlines/cancellation, however, cannot produce a newly accepted result.
      if (options.signal?.aborted || controller.signal.aborted || performance.now() >= deadline) {
        stop = options.signal?.aborted ? 'cancelled' : 'budget-exhausted';
        outcome = stop === 'cancelled' ? 'cancelled' : 'inconclusive';
        reason = stop === 'cancelled' ? 'Reduction cancelled during execution.' : 'Reduction wall-time budget expired during execution.';
        break;
      }
      const repeatedRun = runIds.has(observed.id);
      runIds.add(observed.id);
      const invalid = repeatedRun ? 'A run identifier was reused; independent executions are not established.'
        : evidenceProblem(observed, input, inputDigest, harnessDigest);
      if (invalid) { outcome = 'inconclusive'; reason = invalid; break; }
      if (harnessDigest === undefined) harnessDigest = observed.harnessDigest;
      if (observed.outcome === 'cancelled') {
        stop = 'cancelled'; outcome = 'cancelled'; reason = 'Runner reported owned execution cancellation.'; break;
      }
      if (observed.outcome === 'inconclusive') {
        outcome = 'inconclusive'; reason = 'Runner evidence was inconclusive; the target failure is not established.'; break;
      }
      if (observed.outcome === 'requirement-satisfied') {
        outcome = preserved > 0 ? 'inconclusive' : 'requirement-satisfied';
        reason = preserved > 0 ? 'Candidate was unstable across repetitions; failure preservation is unverified.' : 'Frozen requirement was satisfied; target failure was not reproduced.';
        conclusive = preserved === 0;
        break;
      }
      preserved++;
      outcome = 'target-failure';
      reason = `Target failure preserved in ${preserved}/${options.repetitions} required repetitions.`;
    }
    const accepted = !stop && preserved === options.repetitions;
    const trial: Trial = {
      index: trials.length, inputDigest, seed: input.environment.seed, removed, outcome, reason,
      durationMs: Math.max(0, performance.now() - began), accepted, runIds: results.map(result => result.id),
    };
    trials.push(trial);
    options.onTrial?.(structuredClone(trial));
    return { trial, results, conclusive: conclusive || accepted, ...(stop ? { stop } : {}) };
  };

  try {
    if (!expectationEstablished(original)) {
      baseline = noRun(original, 'inconclusive', 'An independently established expectation is required before reduction.');
      return finish('inconclusive', baseline.reason);
    }
    const initial = await evaluate(original, []);
    baseline = initial.results[0] ?? noRun(original, initial.stop === 'cancelled' ? 'cancelled' : 'inconclusive', initial.trial.reason);
    if (!initial.trial.accepted) return finish(initial.stop ?? 'inconclusive', `Baseline was not established under the repetition rule. ${initial.trial.reason}`);

    // Chunk deletions can preserve non-monotonic failures even when every
    // individual action is necessary in an ancestor candidate.
    let granularity = 2;
    while (best.actions.length > 1) {
      const stop = stopped();
      if (stop) return finish(stop, 'Reduction stopped with the best verified candidate; final neighbors remain unverified.');
      const chunkSize = Math.ceil(best.actions.length / granularity);
      if (chunkSize <= 1) break;
      let changed = false;
      const tested = new Set<string>();
      for (let offset = 0; offset < best.actions.length; offset += chunkSize) {
        const next = without(best, best.actions.slice(offset, offset + chunkSize).map(action => action.id));
        const key = digest(next.candidate);
        if (tested.has(key)) continue;
        tested.add(key);
        const evaluation = await evaluate(next.candidate, next.removed);
        if (evaluation.stop) return finish(evaluation.stop, 'Reduction stopped with the best verified candidate; final neighbors remain unverified.');
        // Repartition from coarse chunks after acceptance: non-monotonic
        // candidates may need a newly adjacent pair deleted together.
        if (evaluation.trial.accepted) { best = freeze(next.candidate); granularity = 2; changed = true; break; }
      }
      if (changed) continue;
      if (granularity >= best.actions.length) break;
      granularity = Math.min(best.actions.length, granularity * 2);
    }

    // A changed candidate invalidates all neighbor conclusions about its parent.
    // Retest the complete final neighborhood; never reuse ancestor outcomes.
    for (;;) {
      let changed = false;
      let allConclusive = true;
      const tested = new Set<string>();
      for (const action of best.actions) {
        const next = without(best, [action.id]);
        const key = digest(next.candidate);
        if (tested.has(key)) continue;
        tested.add(key);
        const evaluation = await evaluate(next.candidate, next.removed);
        if (evaluation.stop) return finish(evaluation.stop, 'Reduction stopped with the best verified candidate; final neighbors remain unverified.');
        if (evaluation.trial.accepted) { best = freeze(next.candidate); changed = true; break; }
        if (!evaluation.conclusive) allConclusive = false;
      }
      if (changed) continue;
      return allConclusive
        ? finish('complete', 'Every permitted single dependency-group deletion of the final candidate was tested and did not preserve the failure. This is not global minimality.', 'dependency-group-1-minimal')
        : finish('complete', 'Search completed, but inconclusive or unstable final neighbors leave dependency-group minimality unverified.');
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
