import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(HERE, 'PLAN-v2.json'), 'utf8'));
const [format, repetition] = process.argv.slice(2);
assert(plan.formats.includes(format));
assert(['1', '2'].includes(repetition));
const owned = join(HERE, `${format}-${repetition}`);
mkdirSync(owned, { recursive: false });
const artifactRoot = join(owned, 'model-owned-executions');
const rawPath = join(owned, 'raw-cases.ndjson');
const sha = data => createHash('sha256').update(data).digest('hex');
const modelHarnessDigest = sha(readFileSync(fileURLToPath(import.meta.url)));
const old = plan.priorEvidenceRoot;
const installed = join(old, 'nonbrowser-release/install/node_modules/repro-local');
const checks = [];
function checkFile(base, entry, provenance) {
  const path = join(base, entry.path);
  const data = readFileSync(path);
  assert.equal(data.length, entry.bytes, `byte length ${path}`);
  assert.equal(sha(data), entry.sha256, `digest ${path}`);
  checks.push({ path, bytes: data.length, sha256: entry.sha256, provenance });
}
function checkInputs() {
  checks.length = 0;
  const emission = JSON.parse(readFileSync(join(old, 'emission-manifest.json'), 'utf8'));
  for (const entry of emission.source_files) checkFile(plan.candidateRoot, entry, 'prior emission-manifest source_files');
  const emitted = JSON.parse(readFileSync(join(old, 'emitted-input-manifest.json'), 'utf8'));
  for (const entry of emitted.files) {
    checkFile(join(old, 'emitted'), entry, 'prior emitted-input-manifest');
    if (entry.path.startsWith('fixtures/')) checkFile(plan.candidateRoot, entry, 'current root fixture matches emitted frozen fixture');
  }
  const packaged = JSON.parse(readFileSync(join(old, 'nonbrowser-release/package-inventory.json'), 'utf8'));
  for (const entry of packaged.files) checkFile(installed, entry, 'prior package-inventory');
  return structuredClone(checks);
}
const before = checkInputs();
writeFileSync(join(owned, 'before-input-checks.json'), JSON.stringify(before, null, 2) + '\n');
const entry = format === 'source' ? join(plan.candidateRoot, 'src/reducer.ts')
  : format === 'emitted' ? join(old, 'emitted/src/reducer.js') : join(installed, 'dist/index.js');
const modules = format === 'installed' ? await import(pathToFileURL(entry))
  : { ...await import(pathToFileURL(entry)),
      ...await import(pathToFileURL(join(dirname(entry), format === 'source' ? 'manifest.ts' : 'manifest.js'))),
      ...await import(pathToFileURL(join(dirname(entry), format === 'source' ? 'oracle.ts' : 'oracle.js'))) };
const { reduce, createManifest, digest, ASSERTION_DIGEST } = modules;
const ASSERTION = 'fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711';
assert.equal(ASSERTION_DIGEST, ASSERTION);
const failureObservation = Object.freeze({ latestRequestId: 2, query: 'beta', results: Object.freeze(['Alpha synthetic result']) });
const satisfiedObservation = Object.freeze({ latestRequestId: 2, query: 'beta', results: Object.freeze(['Beta synthetic result']) });

// Independent finite reference: enumerate masks and check direct prerequisite
// membership; no production reducer implementation or helper is consulted.
function subsets(actions) {
  const result = [];
  for (let mask = 0; mask < 2 ** actions.length; mask++) {
    const ids = actions.filter((_, index) => mask & (1 << index)).map(action => action.id);
    const present = new Set(ids);
    if (actions.every(action => !present.has(action.id) || action.dependsOn.every(id => present.has(id)))) result.push(ids);
  }
  return result;
}
const key = ids => ids.join(',');

// Independent deletion: BFS over reverse edges rather than the production
// implementation's ordered forward sweep over actions.
function neighbors(actions) {
  const reverse = new Map(actions.map(action => [action.id, []]));
  for (const action of actions) for (const prerequisite of action.dependsOn) reverse.get(prerequisite).push(action.id);
  const unique = new Map();
  for (const action of actions) {
    const queue = [action.id], removed = new Set(queue);
    for (let index = 0; index < queue.length; index++) {
      for (const dependent of reverse.get(queue[index])) if (!removed.has(dependent)) { removed.add(dependent); queue.push(dependent); }
    }
    const ids = actions.filter(item => !removed.has(item.id)).map(item => item.id);
    const existing = unique.get(key(ids));
    if (existing) existing.selectedUnits.push(action.id);
    else unique.set(key(ids), { ids, selectedUnits: [action.id], removed: actions.filter(item => removed.has(item.id)).map(item => item.id) });
  }
  return [...unique.values()];
}
const manifestFor = graph => ({ ...createManifest(), id: `reference-${graph.id}`, actions: graph.actions.map((action, index) => ({ id: action.id, kind: index === 0 ? 'navigate' : 'noise', value: index === 0 ? '/' : 'focus', dependsOn: action.dependsOn })) });
function deepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([name]) => !['startedAt', 'durationMs'].includes(name)).map(([name, item]) => [name, normalize(item)]));
  if (typeof value === 'string') return value.replaceAll(artifactRoot, '<OWNED_ARTIFACT_ROOT>');
  return value;
}
let rawBytes = 0;
const summaries = [];
const processErrors = [];
const globallyOwnedPaths = new Set();
const transcriptHash = createHash('sha256');
const begin = new Date().toISOString();

async function oneCase(caseId, manifest, failureTable, control) {
  const runs = [], observedTrials = [], errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const base = structuredClone(manifest);
  const allowed = new Map(subsets(base.actions).map(ids => [key(ids), ids]));
  const ordinalForSubset = new Map();
  const controller = new AbortController();
  const options = { ...plan.defaultBudget, artifactDir: join(artifactRoot, caseId), signal: controller.signal, onTrial: trial => observedTrials.push(trial) };
  if (control && plan.controlOverrides[control]) Object.assign(options, plan.controlOverrides[control]);
  if (control === 'cancel-before') controller.abort();
  if (control === 'unconfirmed-expectation') manifest = { ...manifest, expectationBasis: 'proposed-unconfirmed' };
  const frozenInputBefore = structuredClone(manifest);
  const run = async (candidate, executionOptions) => {
    const ids = candidate.actions.map(action => action.id), subset = key(ids);
    check(allowed.has(subset), `dependency-invalid candidate ${subset}`);
    check(deepFrozen(candidate), 'candidate is not deeply frozen');
    check(isDeepStrictEqual({ ...candidate, actions: base.actions }, base), 'candidate changed non-action identity');
    check(candidate.actions.every(action => isDeepStrictEqual(action, base.actions.find(original => original.id === action.id))), 'candidate changed action content');
    check(!globallyOwnedPaths.has(executionOptions.artifactDir), 'execution artifact scope reused');
    globallyOwnedPaths.add(executionOptions.artifactDir);
    check(executionOptions.artifactDir === join(options.artifactDir, `execution-${String(runs.length + 1).padStart(6, '0')}`), 'execution artifact scope not owned/sequential');
    const ordinal = (ordinalForSubset.get(subset) ?? 0) + 1;
    ordinalForSubset.set(subset, ordinal);
    const baseline = ids.length === base.actions.length;
    let failing = failureTable ? failureTable.get(subset) : baseline;
    if (control === 'budget-incomplete-candidate' || control === 'cancel-during-candidate') failing = true;
    if (control === 'baseline-unstable' && baseline) failing = ordinal % 2 === 1;
    if (control === 'baseline-satisfied-then-failure' && baseline) failing = ordinal % 2 === 0;
    if (control === 'neighbor-unstable' && !baseline) failing = ordinal % 2 === 1;
    if (control === 'neighbor-satisfied-then-failure' && !baseline) failing = ordinal % 2 === 0;
    const evidence = {
      id: `${caseId}-execution-${String(runs.length + 1).padStart(6, '0')}`,
      outcome: failing ? 'target-failure' : 'requirement-satisfied',
      reason: 'Explicit synthetic unit-model table; not browser or application replay evidence.',
      manifestDigest: digest(candidate), assertionDigest: candidate.assertionDigest, harnessDigest: modelHarnessDigest,
      appRevision: candidate.app.revision, appDigest: candidate.app.sourceDigest, adapterVersion: candidate.adapter.version,
      runnerVersion: candidate.runnerVersion, seed: candidate.environment.seed,
      startedAt: new Date().toISOString(), durationMs: 0, assertionCount: 1,
      observation: structuredClone(failing ? failureObservation : satisfiedObservation),
      events: [{ type: 'synthetic-model-reset', index: runs.length + 1, independentScope: executionOptions.artifactDir }],
      artifacts: [], environment: { platform: process.platform, node: process.version, browser: 'not-browser-evidence', isolation: 'pure-unit-model-per-invocation-reset' },
    };
    const corrupt = baseline && control?.startsWith('baseline-');
    if (corrupt) {
      const altered = {
        'baseline-manifest-mismatch': ['manifestDigest', '0'.repeat(64)],
        'baseline-assertion-mismatch': ['assertionDigest', '0'.repeat(64)],
        'baseline-app-digest-mismatch': ['appDigest', '0'.repeat(64)],
        'baseline-revision-mismatch': ['appRevision', 'fixed'],
        'baseline-adapter-mismatch': ['adapterVersion', 'different'],
        'baseline-runner-mismatch': ['runnerVersion', 'different'],
        'baseline-seed-mismatch': ['seed', candidate.environment.seed + 1],
        'baseline-invalid-harness': ['harnessDigest', 'invalid'],
        'baseline-missing-observation': ['observation', null],
        'baseline-wrong-observation': ['observation', { latestRequestId: 1, query: 'alpha', results: ['Alpha synthetic result'] }],
        'baseline-contradictory-label': ['observation', structuredClone(satisfiedObservation)],
        'baseline-zero-assertions': ['assertionCount', 0],
        'baseline-unknown-outcome': ['outcome', 'unregistered'],
      }[control];
      if (altered) evidence[altered[0]] = altered[1];
      if (control === 'baseline-inconclusive') Object.assign(evidence, { outcome: 'inconclusive', assertionCount: 0, observation: null });
      if (control === 'baseline-changed-harness' && ordinal === 2) evidence.harnessDigest = '0'.repeat(64);
    }
    if (!baseline) {
      if (control === 'neighbor-inconclusive') Object.assign(evidence, { outcome: 'inconclusive', assertionCount: 0, observation: null });
      if (control === 'neighbor-changed-harness') evidence.harnessDigest = '0'.repeat(64);
      if (control === 'neighbor-manifest-mismatch') evidence.manifestDigest = '0'.repeat(64);
    }
    if (control === 'runner-reports-cancelled') Object.assign(evidence, { outcome: 'cancelled', assertionCount: 0, observation: null });
    const record = { candidate: structuredClone(candidate), subset, candidateRepetition: ordinal, artifactDir: executionOptions.artifactDir, evidence, signalAbortedOnEntry: executionOptions.signal.aborted };
    runs.push(record);
    if (control === 'runner-throws') { record.threw = 'intentional synthetic runner exception'; throw new Error('intentional synthetic runner exception'); }
    if (control === 'deadline-during-baseline') {
      await new Promise(resolve => {
        if (executionOptions.signal.aborted) return resolve();
        executionOptions.signal.addEventListener('abort', resolve, { once: true });
      });
      record.signalAbortedOnReturn = executionOptions.signal.aborted;
    }
    if (control === 'cancel-during-baseline' && baseline) controller.abort();
    if (control === 'cancel-during-candidate' && !baseline) controller.abort();
    return evidence;
  };
  let result;
  try { result = await reduce(manifest, run, options); }
  catch (error) { errors.push(`unexpected reduce exception: ${error.name}: ${error.message}`); }
  let audit;
  if (result) {
    check(JSON.stringify(manifest) === JSON.stringify(frozenInputBefore), 'caller input mutated');
    check(result.executions === runs.length, 'execution count disagrees with observed invocations');
    check(result.executions <= options.maxExecutions, 'execution budget exceeded');
    check(JSON.stringify(result.trials) === JSON.stringify(observedTrials), 'onTrial ledger differs from final ledger');
    const runById = new Map(runs.map(item => [item.evidence.id, item]));
    for (const trial of result.trials) {
      if (trial.accepted) {
        check(trial.runIds.length === options.repetitions, 'accepted trial has incomplete repetitions');
        for (const id of trial.runIds) {
          const item = runById.get(id);
          check(Boolean(item), 'accepted trial references nonexistent run');
          if (item) {
            check(item.evidence.outcome === 'target-failure' && item.evidence.assertionCount === 1, 'accepted trial lacks conclusive assertion');
            check(JSON.stringify(item.evidence.observation) === JSON.stringify(failureObservation), 'accepted trial lacks exact immutable failure observation');
            check(item.evidence.manifestDigest === trial.inputDigest && item.evidence.harnessDigest === modelHarnessDigest, 'accepted trial lacks matching identity');
          }
        }
      }
    }
    const finalIds = result.manifest.actions.map(action => action.id);
    const finalNeighbors = neighbors(result.manifest.actions);
    let lastAcceptance = -1;
    for (const trial of result.trials) if (trial.accepted) lastAcceptance = trial.index;
    const afterFinalAcceptance = result.trials.filter(trial => trial.index > lastAcceptance);
    const checkedNeighbors = finalNeighbors.map(neighbor => {
      const expectedDigest = digest({ ...result.manifest, actions: result.manifest.actions.filter(action => neighbor.ids.includes(action.id)) });
      const actualTrials = afterFinalAcceptance.filter(trial => trial.inputDigest === expectedDigest);
      return { ...neighbor, expectedDigest, oracleFailure: failureTable?.get(key(neighbor.ids)) ?? null,
        finalTrialIndices: actualTrials.map(trial => trial.index), outcomes: actualTrials.map(trial => trial.outcome),
        observedRepetitions: actualTrials.map(trial => trial.runIds.length) };
    });
    audit = { finalIds, lastAcceptance, finalNeighbors: checkedNeighbors, modelResetScopes: runs.length };
    if (!control) {
      check(result.status === 'complete', 'deterministic bounded table did not complete');
      check(result.minimality === 'dependency-group-1-minimal', 'deterministic bounded table did not establish group minimality');
      check(failureTable.get(key(finalIds)) === true, 'final best does not preserve oracle failure');
      for (const neighbor of checkedNeighbors) {
        check(neighbor.oracleFailure === false, 'final dependency-group neighbor still preserves failure');
        check(neighbor.finalTrialIndices.length > 0, 'final neighbor not tested after final acceptance');
        check(neighbor.outcomes.every(outcome => outcome === 'requirement-satisfied'), 'final neighbor evidence not satisfied');
      }
      const globalFailures = [...failureTable].filter(([, failing]) => failing).map(([subset]) => allowed.get(subset));
      const smallest = Math.min(...globalFailures.map(ids => ids.length));
      Object.assign(audit, { globalMinimumActionCount: smallest, globalMinimumSubsets: globalFailures.filter(ids => ids.length === smallest), finalActionCount: finalIds.length, globalMinimumGap: finalIds.length - smallest });
    } else {
      let expectedStatus = 'inconclusive', expectedMinimality = 'unverified';
      if (control.startsWith('neighbor-')) expectedStatus = 'complete';
      if (control === 'neighbor-satisfied-then-failure') expectedMinimality = 'dependency-group-1-minimal';
      if (control.startsWith('cancel-') || control === 'runner-reports-cancelled') expectedStatus = 'cancelled';
      if (control.startsWith('budget-incomplete-') || control === 'deadline-during-baseline') expectedStatus = 'budget-exhausted';
      if (control === 'budget-exact-complete') { expectedStatus = 'complete'; expectedMinimality = 'dependency-group-1-minimal'; }
      check(result.status === expectedStatus, `control status ${result.status} != ${expectedStatus}`);
      check(result.minimality === expectedMinimality, `control minimality ${result.minimality} != ${expectedMinimality}`);
      check(result.manifest.actions.length === base.actions.length, 'adversarial control changed last verified candidate');
      if (['cancel-before', 'unconfirmed-expectation'].includes(control)) check(runs.length === 0, 'pre-execution control invoked runner');
      if (control === 'budget-exact-complete') check(runs.length === 3, 'exact complete budget control should use all 3 executions');
      if (control === 'baseline-satisfied-then-failure') {
        check(runs.length === 1, 'satisfaction-first baseline should reject before second scheduled outcome');
        audit.unobservedScheduledFollowup = 'target-failure on repetition 2; never invoked';
      }
      if (control === 'neighbor-satisfied-then-failure') {
        check(runs.filter(item => item.subset !== key(base.actions.map(action => action.id))).length === 1, 'satisfaction-first final neighbor should stop after one satisfied execution');
        audit.unobservedScheduledFollowup = 'target-failure on final-neighbor repetition 2; never invoked';
        audit.scopeLimit = 'Reported 1-minimality follows the N-of-N failure-preservation rejection policy. Repeated neighbor stability and general stochastic minimality are not established.';
      }
    }
  }
  const record = { caseId, kind: control ? 'adversarial-control' : 'exhaustive-table', control: control ?? null,
    budget: { maxExecutions: options.maxExecutions, maxDurationMs: options.maxDurationMs, repetitions: options.repetitions },
    originalManifest: manifest, oracleTable: failureTable ? [...failureTable].map(([subset, failing]) => ({ subset, outcome: failing ? 'target-failure' : 'requirement-satisfied' })) : null,
    runs, result: result ?? null, audit: audit ?? null, errors };
  const line = JSON.stringify(record) + '\n';
  if (rawBytes + Buffer.byteLength(line) > plan.rawEvidenceLimitBytesPerProcess) throw new Error('Raw evidence limit would be exceeded; completed earlier records retained.');
  appendFileSync(rawPath, line);
  rawBytes += Buffer.byteLength(line);
  const semanticSha256 = sha(JSON.stringify(normalize(record)));
  transcriptHash.update(caseId + ':' + semanticSha256 + '\n');
  summaries.push({ caseId, semanticSha256, status: result?.status, minimality: result?.minimality,
    executions: result?.executions, trials: result?.trials.length, acceptedTrials: result?.trials.filter(trial => trial.accepted).length,
    finalActionCount: result?.manifest.actions.length, globalMinimumGap: audit?.globalMinimumGap ?? null, errors });
}

try {
  for (const graph of plan.graphs) {
    const manifest = manifestFor(graph), closed = subsets(manifest.actions);
    assert.equal(closed.length, graph.closedSubsetCount);
    assert.equal(2 ** (closed.length - 1), graph.outcomeTableCount);
    assert.equal(key(closed.at(-1)), key(manifest.actions.map(action => action.id)));
    for (let table = 0; table < graph.outcomeTableCount; table++) {
      const outcomes = new Map(closed.map((ids, index) => [key(ids), index === closed.length - 1 || Boolean(table & (1 << index))]));
      await oneCase(`${graph.id}-table-${String(table).padStart(3, '0')}`, manifest, outcomes);
    }
  }
  const controlManifest = manifestFor({ id: 'adversarial-controls', actions: [{ id: 'root', dependsOn: [] }] });
  for (const control of plan.controls) await oneCase(`control-${control}`, controlManifest, undefined, control);
} catch (error) {
  processErrors.push({ name: error.name, message: error.message, stack: error.stack });
}
const after = checkInputs();
assert.deepEqual(after, before, 'candidate inputs changed during verification');
writeFileSync(join(owned, 'after-input-checks.json'), JSON.stringify(after, null, 2) + '\n');
const summary = { format, repetition: Number(repetition), node: process.version, startedAt: begin, finishedAt: new Date().toISOString(),
  entry, entrySha256: sha(readFileSync(entry)), planSha256: sha(readFileSync(join(HERE, 'PLAN-v2.json'))), modelHarnessDigest,
  assertionDigest: ASSERTION_DIGEST, sourceAdapterSha256: sha(readFileSync(join(plan.candidateRoot, 'src/adapter.ts'))),
  inputChecks: before.length, completedCases: summaries.length, expectedCases: 320 + plan.controls.length,
  totalModelExecutions: summaries.reduce((sum, item) => sum + (item.executions ?? 0), 0),
  rawBytes, rawSha256: sha(readFileSync(rawPath)), transcriptSha256: transcriptHash.digest('hex'),
  tableGlobalMinimumGapCases: summaries.filter(item => item.globalMinimumGap > 0),
  caseFailures: summaries.filter(item => item.errors.length), processErrors, cases: summaries,
  scope: 'Pure synthetic unit-model verification of reducer decisions; no browser or application replay acceptance.' };
writeFileSync(join(owned, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ format, repetition, completedCases: summary.completedCases, totalModelExecutions: summary.totalModelExecutions,
  rawBytes, transcriptSha256: summary.transcriptSha256, globalMinimumGapCases: summary.tableGlobalMinimumGapCases.length,
  caseFailures: summary.caseFailures.length, processErrors: summary.processErrors }));
if (summary.completedCases !== summary.expectedCases || summary.caseFailures.length || summary.processErrors.length) process.exitCode = 1;
