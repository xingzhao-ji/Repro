import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readFile, unlink, symlink, link, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { serve } from '../src/server.js';
import { createAuthoredManifest, createManifest, digest } from '../src/manifest.js';
import { createCaseManifest } from '../src/browser-case.js';
import { harnessDigest } from '../src/adapter.js';
import { type Manifest, type RunResult, type Trial } from '../src/contracts.js';
import { type JobInputEvidence, type TrialEvidence } from '../src/evidence-inspector.js';

async function fixture(change?: (trials: Trial[]) => void) {
  await mkdir('.repro-runs/tests', { recursive: true });
  const service = await serve({ port: 0, root: await mkdtemp('.repro-runs/tests/inspector-') });
  const manifest = createManifest();
  const session = service.ledger.createSession(manifest, true);
  const job = service.ledger.startJob(session.id, 'reduce', 'first');
  const directory = join(service.ledger.root, 'artifacts', job.id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  const candidate = { ...manifest, actions: manifest.actions.filter(action => action.id !== 'focus-before') };
  const runs: RunResult[] = [];
  const trials: Trial[] = [];
  for (const [index, input] of [manifest, candidate].entries()) {
    const runIds: string[] = [];
    for (let repetition = 0; repetition < 2; repetition++) {
      const run = makeRun(input); runs.push(run); runIds.push(run.id);
      const runDir = join(directory, `execution-${String(runs.length).padStart(6, '0')}`, run.id);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, 'evidence.json'), JSON.stringify({ ...run, artifacts: undefined }));
    }
    trials.push({ index, inputDigest: digest(input), seed: input.environment.seed, removed: index ? ['focus-before'] : [], outcome: 'target-failure', reason: 'Target failure preserved in 2/2 required repetitions.', durationMs: 10, accepted: true, runIds });
  }
  change?.(trials);
  const result = { manifest: candidate, trials, baseline: runs[0], status: 'complete', minimality: 'unverified', reason: 'test', executions: 4, durationMs: 40 };
  service.ledger.finish(job.id, 'complete', result);
  service.ledger.updateManifest(session.id, candidate);
  const inputUrl = `${service.url}/api/jobs/${job.id}/input`;
  const trialUrl = `${service.url}/api/jobs/${job.id}/trials/1`;
  const runPath = join(directory, 'execution-000003', runs[2]!.id, 'evidence.json');
  return { service, manifest, candidate, session, job, directory, runs, trials, inputUrl, trialUrl, runPath };
}
function makeRun(manifest: Manifest): RunResult {
  return { id: randomUUID(), outcome: 'target-failure', reason: 'LATEST_SEARCH_RESPONSE_WINS: stale alpha results replaced the latest beta results.', category: 'target-failure', manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest, harnessDigest: harnessDigest(), appRevision: manifest.app.revision, appDigest: manifest.app.sourceDigest, adapterVersion: manifest.adapter.version, runnerVersion: manifest.runnerVersion, seed: manifest.environment.seed, startedAt: new Date().toISOString(), durationMs: 10, assertionCount: 1, observation: { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] }, events: [], artifacts: [], environment: { platform: 'darwin-arm64', node: 'v26.7.0', browser: '156.0.8078.4 (pinned Chromium)', isolation: 'registered trusted synthetic fixture; fresh Chromium sandbox/context; loopback HTTP allowlist; not a hostile-code sandbox' } };
}
async function read<T>(url: string): Promise<T> { // JSON response boundary, asserted below.
  const response = await fetch(url); assert.equal(response.status, 200); return response.json() as Promise<T>;
}

// Constructed ledger evidence exercises inspection bounds, not browser behavior
// or a claim that a registered case actually needs this many reduction trials.
async function boundedHistory(manifest: Manifest, executions: number) {
  await mkdir('.repro-runs/tests', { recursive: true });
  const service = await serve({ port: 0, root: await mkdtemp('.repro-runs/tests/inspector-budget-') });
  const session = service.ledger.createSession(manifest, true);
  const job = service.ledger.startJob(session.id, 'reduce', 'budget');
  const directory = join(service.ledger.root, 'artifacts', job.id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  const candidate: Manifest = { ...manifest, actions: [] };
  const trials: Trial[] = [];
  const runs: RunResult[] = [];
  for (let index = 0; index < executions - 1; index++) {
    const input = index === 0 ? manifest : candidate;
    const runIds: string[] = [];
    for (let repetition = 0; repetition < (index === 0 ? 2 : 1); repetition++) {
      const run = makeRun(input);
      if (manifest.schemaVersion === 3) {
        run.harnessDigest = 'b'.repeat(64);
        run.observation = { kind: 'browser-case', values: ['second edit', 'rendered'] };
        run.reason = 'The frozen browser-case assertion observed the registered failure.';
        run.environment.isolation = 'registered public browser library; fresh owned profile; Chromium sandbox enabled; loopback asset allowlist; not a hostile-code sandbox';
      }
      if (index !== 0) {
        Object.assign(run, { outcome: 'inconclusive', category: 'verification', appDigest: '', assertionCount: 0, observation: null, reason: 'The assertion has not executed.' });
        run.environment.browser = 'not-launched';
      }
      runs.push(run); runIds.push(run.id);
      const runDirectory = join(directory, `execution-${String(runs.length).padStart(6, '0')}`, run.id);
      await mkdir(runDirectory, { recursive: true });
      await writeFile(join(runDirectory, 'evidence.json'), JSON.stringify(run));
    }
    const trial: Trial = { index, inputDigest: digest(input), seed: input.environment.seed,
      removed: index === 0 ? [] : manifest.actions.map(action => action.id),
      outcome: index === 0 ? 'target-failure' : 'inconclusive', accepted: index === 0,
      reason: index === 0 ? 'Target failure preserved in 2/2 required repetitions.' : 'Runner evidence was inconclusive; the target failure is not established.', durationMs: 10, runIds };
    trials.push(trial);
    service.ledger.event(job.id, 'trial', JSON.stringify(trial));
  }
  service.ledger.finish(job.id, 'complete', { manifest, trials, baseline: runs[0], status: 'budget-exhausted', minimality: 'unverified', reason: 'Constructed inspector fixture.', executions, durationMs: executions * 10 });
  return { service, session, job, trials, runs, baseUrl: `${service.url}/api/jobs/${job.id}` };
}

test('repository trial inspection reads later history through execution 80 using the frozen input budget', async () => {
  const f = await boundedHistory(createCaseManifest('morphdom-textarea'), 80);
  try {
    // A current session manifest must not substitute for this historical input.
    f.service.ledger.updateManifest(f.session.id, { ...createCaseManifest('morphdom-textarea'), actions: [] });
    const input = await read<JobInputEvidence>(`${f.baseUrl}/input`);
    assert.equal(input.outcome, 'verified-input');
    assert.equal(input.manifest?.schemaVersion, 3);
    const evidence = await read<TrialEvidence>(`${f.baseUrl}/trials/78`);
    assert.equal(evidence.availability, 'available');
    assert.equal(evidence.outcome, 'inconclusive');
    assert.equal(evidence.trial?.index, 78);
    assert.deepEqual(evidence.candidate?.actions, []);
    assert.deepEqual(evidence.runs.map(run => run.runId), [f.runs[79]!.id]);
    assert.equal(evidence.runs[0]!.result?.assertionCount, 0);
    assert.equal(evidence.runs[0]!.result?.observation, null);
    assert.equal((await fetch(`${f.baseUrl}/trials/81`)).status, 404);
  } finally { await f.service.close(); }
});

function historyManifest(version: 1 | 2 | 3): Manifest {
  if (version === 3) return createCaseManifest('morphdom-textarea');
  if (version === 1) return createManifest();
  return createAuthoredManifest({ searchOrder: ['alpha', 'beta'], expectationBasis: 'independent-contract',
    expectation: { invariantId: 'LATEST_SEARCH_RESPONSE_WINS', latestRequestId: 2, latestQuery: 'beta', expectedResults: ['Beta synthetic result'] } });
}

for (const [version, limit] of [[1, 50], [2, 50], [3, 80]] as const) {
  test(`v${version} trial inspection rejects execution ${limit + 1} without increasing its budget`, async () => {
    const f = await boundedHistory(historyManifest(version), limit + 1);
    try {
      const allowed = await read<TrialEvidence>(`${f.baseUrl}/trials/${limit - 2}`);
      assert.equal(allowed.availability, 'available');
      assert.deepEqual(allowed.runs.map(run => run.runId), [f.runs[limit - 1]!.id]);
      const rejected = await read<TrialEvidence>(`${f.baseUrl}/trials/${limit - 1}`);
      assert.equal(rejected.availability, 'unavailable');
      assert.equal(rejected.outcome, 'inconclusive');
      assert.equal(rejected.code, 'TRIAL_DECISION_MISMATCH');
      assert.equal(rejected.candidate, null);
      assert.deepEqual(rejected.runs, []);
      assert.equal((await fetch(`${f.baseUrl}/trials/${limit + 1}`)).status, 404);
    } finally { await f.service.close(); }
  });
}

for (const [version, limit] of [[1, 50], [2, 50], [3, 80]] as const) {
  test(`v${version} oversized trial history remains unavailable`, async () => {
    const f = await boundedHistory(historyManifest(version), limit + 3);
    try {
      const input = await read<JobInputEvidence>(`${f.baseUrl}/input`);
      assert.equal(input.availability, 'unavailable');
      assert.equal(input.code, 'EVIDENCE_LIMIT');
      const trial = await read<TrialEvidence>(`${f.baseUrl}/trials/0`);
      assert.equal(trial.availability, 'unavailable');
      assert.equal(trial.code, 'EVIDENCE_LIMIT');
    } finally { await f.service.close(); }
  });
}

test('selected job input stays frozen after session reduction, and exact trial exposes only its candidate and owned runs', async () => {
  const f = await fixture();
  try {
    const input = await read<JobInputEvidence>(f.inputUrl);
    assert.equal(input.jobId, f.job.id); assert.equal(input.sessionId, f.session.id);
    assert.equal(input.availability, 'available'); assert.deepEqual(input.manifest, f.manifest);
    assert.equal(input.manifest!.actions.length, 5); assert.equal(input.manifestDigest, digest(f.manifest));
    const trial = await read<TrialEvidence>(f.trialUrl);
    assert.equal(trial.availability, 'available'); assert.equal(trial.outcome, 'target-failure');
    assert.deepEqual(trial.candidate, f.candidate); assert.deepEqual(trial.trial, f.trials[1]);
    assert.deepEqual(trial.runs.map((run: { runId: string }) => run.runId), f.trials[1]!.runIds);
    assert.deepEqual(trial.runs[0]!.result!.observation, f.runs[2]!.observation);
    assert.equal(trial.runs[0]!.result!.harnessDigest, harnessDigest());
    assert.equal('artifacts' in trial.runs[0]!.result!, false); assert.equal('events' in trial.runs[0]!.result!, false);
    assert.equal(JSON.stringify(trial).includes(f.directory), false);
  } finally { await f.service.close(); }
});

test('missing frozen input never falls back to the current session and reads do not recreate it', async () => {
  const f = await fixture();
  try {
    await rename(f.directory, `${f.directory}-removed`);
    const input = await read<JobInputEvidence>(f.inputUrl); assert.equal(input.outcome, 'inconclusive'); assert.equal(input.manifest, null);
    await assert.rejects(readFile(join(f.directory, 'manifest.json')), { code: 'ENOENT' });
    const trial = await read<TrialEvidence>(f.trialUrl); assert.equal(trial.outcome, 'inconclusive'); assert.equal(trial.candidate, null);
  } finally { await f.service.close(); }
});

for (const kind of ['mismatched', 'corrupt', 'oversized', 'symlink', 'hardlink', 'ancestor-symlink'] as const) {
  test(`frozen input ${kind} evidence is unavailable without private content or path leakage`, async () => {
    const f = await fixture();
    try {
      const file = join(f.directory, 'manifest.json');
      if (kind === 'mismatched') await writeFile(file, JSON.stringify(f.candidate));
      if (kind === 'corrupt') await writeFile(file, '{ private_SENTINEL');
      if (kind === 'oversized') await writeFile(file, 'private_SENTINEL'.repeat(6000));
      if (kind === 'symlink' || kind === 'hardlink') {
        const other = join(f.service.ledger.root, 'private_SENTINEL.json'); await writeFile(other, JSON.stringify(f.manifest)); await unlink(file);
        if (kind === 'symlink') await symlink(other, file); else await link(other, file);
      }
      if (kind === 'ancestor-symlink') { await rename(f.directory, `${f.directory}-other`); await symlink(`${f.directory}-other`, f.directory); }
      const input = await read<JobInputEvidence>(f.inputUrl); assert.equal(input.outcome, 'inconclusive'); assert.equal(input.manifest, null);
      assert.equal(JSON.stringify(input).includes('private_SENTINEL'), false); assert.equal(JSON.stringify(input).includes(f.directory), false);
    } finally { await f.service.close(); }
  });
}

for (const kind of ['missing', 'cross-job', 'wrong-id', 'wrong-digest', 'wrong-harness', 'wrong-observation', 'corrupt', 'oversized', 'symlink', 'hardlink', 'ancestor-symlink'] as const) {
  test(`trial ${kind} run evidence cannot inherit a conclusive verdict`, async () => {
    const f = await fixture();
    try {
      if (kind === 'missing') await unlink(f.runPath);
      if (kind === 'cross-job') await writeFile(f.runPath, JSON.stringify(makeRun(f.candidate)));
      if (kind.startsWith('wrong-')) {
        const run = JSON.parse(await readFile(f.runPath, 'utf8')) as RunResult;
        if (kind === 'wrong-id') run.id = '../../private_SENTINEL';
        if (kind === 'wrong-digest') run.manifestDigest = digest(f.manifest);
        if (kind === 'wrong-harness') run.harnessDigest = 'a'.repeat(64);
        if (kind === 'wrong-observation') run.observation = { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] };
        await writeFile(f.runPath, JSON.stringify(run));
      }
      if (kind === 'corrupt') await writeFile(f.runPath, 'private_SENTINEL');
      if (kind === 'oversized') await writeFile(f.runPath, 'private_SENTINEL'.repeat(100000));
      if (kind === 'symlink' || kind === 'hardlink') {
        const other = join(f.service.ledger.root, 'private_SENTINEL.json'); await writeFile(other, await readFile(f.runPath)); await unlink(f.runPath);
        if (kind === 'symlink') await symlink(other, f.runPath); else await link(other, f.runPath);
      }
      if (kind === 'ancestor-symlink') {
        const execution = join(f.directory, 'execution-000003'); await rename(execution, `${execution}-other`); await symlink(`${execution}-other`, execution);
      }
      const trial = await read<TrialEvidence>(f.trialUrl); assert.equal(trial.outcome, 'inconclusive'); assert.equal(trial.availability, 'unavailable');
      assert.equal(trial.runs[0]!.result, null); assert.equal(trial.runs[0]!.availability, 'unavailable');
      assert.equal(JSON.stringify(trial).includes('private_SENTINEL'), false); assert.equal(JSON.stringify(trial).includes(f.directory), false);
    } finally { await f.service.close(); }
  });
}

test('unknown job/trial and traversal-like routes are not arbitrary file reads; origin guard remains enforced', async () => {
  const f = await fixture();
  try {
    for (const url of [f.trialUrl.replace('/trials/1', '/trials/999'), f.trialUrl.replace('/trials/1', '/trials/-1'), `${f.service.url}/api/jobs/unknown/input`, `${f.service.url}/api/jobs/%2e%2e%2fprivate/input`]) assert.equal((await fetch(url)).status, 404);
    assert.equal((await fetch(f.inputUrl, { headers: { Origin: 'https://evil.invalid' } })).status, 403);
  } finally { await f.service.close(); }
});

for (const kind of ['unknown-removal', 'duplicate-removal', 'missing-dependency', 'wrong-index', 'wrong-seed', 'wrong-digest', 'duplicate-run', 'unsafe-run-id', 'rejected-target-failure', 'accepted-inconclusive', 'baseline-not-accepted'] as const) {
  test(`trial history ${kind} cannot fabricate an exact candidate or conclusive outcome`, async () => {
    const f = await fixture(trials => {
      const trial = trials[1]!;
      if (kind === 'unknown-removal') trial.removed = ['private_SENTINEL'];
      if (kind === 'duplicate-removal') trial.removed.push('focus-before');
      if (kind === 'missing-dependency') trial.removed = ['search-alpha'];
      if (kind === 'wrong-index') trial.index = 9;
      if (kind === 'wrong-seed') trial.seed++;
      if (kind === 'wrong-digest') trial.inputDigest = 'a'.repeat(64);
      if (kind === 'duplicate-run') trial.runIds[0] = trials[0]!.runIds[0]!;
      if (kind === 'unsafe-run-id') trial.runIds[0] = '../../private_SENTINEL';
      if (kind === 'rejected-target-failure') trial.accepted = false;
      if (kind === 'accepted-inconclusive') trial.outcome = 'inconclusive';
      if (kind === 'baseline-not-accepted') { trials[0]!.accepted = false; trials[0]!.outcome = 'inconclusive'; }
    });
    try {
      const trial = await read<TrialEvidence>(f.trialUrl);
      assert.equal(trial.outcome, 'inconclusive'); assert.equal(trial.availability, 'unavailable'); assert.equal(trial.candidate, null);
      assert.equal(JSON.stringify(trial).includes('private_SENTINEL'), false);
    } finally { await f.service.close(); }
  });
}

test('contradictory terminal and event trial histories are INCONCLUSIVE', async () => {
  const f = await fixture();
  try {
    f.service.ledger.event(f.job.id, 'trial', JSON.stringify(f.trials[0]));
    f.service.ledger.event(f.job.id, 'trial', JSON.stringify({ ...f.trials[1], removed: ['focus-after'] }));
    const trial = await read<TrialEvidence>(f.trialUrl);
    assert.equal(trial.outcome, 'inconclusive'); assert.equal(trial.availability, 'unavailable'); assert.equal(trial.candidate, null);
  } finally { await f.service.close(); }
});

test('recorded inconclusive trial keeps its exact unstarted run and missing application identity', async () => {
  const f = await fixture(trials => {
    trials[1]!.outcome = 'inconclusive'; trials[1]!.accepted = false; trials[1]!.runIds = trials[1]!.runIds.slice(0, 1);
    trials[1]!.reason = 'Run evidence does not match the frozen input, assertion, application, or execution identity.';
  });
  try {
    const raw = JSON.parse(await readFile(f.runPath, 'utf8')) as RunResult;
    Object.assign(raw, { outcome: 'inconclusive', category: 'verification', appDigest: '', assertionCount: 0, observation: null, reason: 'MISSING_STEPS: The intended failure requires navigation and both ordered search requests; the proposed experiment is incomplete.' });
    raw.environment.browser = 'not-launched';
    await writeFile(f.runPath, JSON.stringify(raw));
    const trial = await read<TrialEvidence>(f.trialUrl);
    assert.equal(trial.availability, 'available'); assert.equal(trial.outcome, 'inconclusive'); assert.equal(trial.trial!.accepted, false);
    assert.equal(trial.runs[0]!.result!.appDigest, ''); assert.equal(trial.runs[0]!.result!.observation, null);
    assert.equal(trial.runs[0]!.result!.reason, raw.reason);
  } finally { await f.service.close(); }
});

test('a satisfied assertion with target-failure category cannot establish a conclusive trial', async () => {
  const f = await fixture(trials => {
    trials[1]!.outcome = 'requirement-satisfied';
    trials[1]!.accepted = false;
    trials[1]!.runIds = trials[1]!.runIds.slice(0, 1);
    trials[1]!.reason = 'Frozen requirement was satisfied; target failure was not reproduced.';
  });
  try {
    const run = JSON.parse(await readFile(f.runPath, 'utf8')) as RunResult;
    run.outcome = 'requirement-satisfied';
    run.observation = { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] };
    run.reason = 'The frozen latest-response assertion passed after both controlled HTTP responses completed.';
    assert.equal(run.category, 'target-failure');
    await writeFile(f.runPath, JSON.stringify(run));
    const evidence = await read<TrialEvidence>(f.trialUrl);
    assert.equal(evidence.availability, 'unavailable');
    assert.equal(evidence.outcome, 'inconclusive');
    assert.equal(evidence.runs[0]!.code, 'RUN_OUTCOME_MISMATCH');
    assert.equal(evidence.runs[0]!.result, null);
  } finally { await f.service.close(); }
});

test('public projection withholds arbitrary text and ignores raw private fields', async () => {
  const f = await fixture();
  try {
    const raw = JSON.parse(await readFile(f.runPath, 'utf8')) as Record<string, unknown>;
    raw['reason'] = 'private_SENTINEL'; raw['Authorization'] = 'private_SENTINEL';
    raw['events'] = [{ message: '/Users/private_SENTINEL' }]; raw['artifacts'] = [{ path: '/Users/private_SENTINEL' }];
    await writeFile(f.runPath, JSON.stringify(raw));
    const trial = await read<TrialEvidence>(f.trialUrl);
    assert.equal(trial.availability, 'available'); assert.equal(JSON.stringify(trial).includes('private_SENTINEL'), false);
    assert.match(trial.runs[0]!.result!.reason, /withheld/);
  } finally { await f.service.close(); }
});

for (const kind of ['nested-observation', 'array-category'] as const) {
  test(`malformed ${kind} cannot be normalized into valid evidence`, async () => {
    const f = await fixture(trials => {
      if (kind === 'array-category') { trials[1]!.outcome = 'inconclusive'; trials[1]!.accepted = false; trials[1]!.runIds = trials[1]!.runIds.slice(0, 1); }
    });
    try {
      const raw = JSON.parse(await readFile(f.runPath, 'utf8')) as Record<string, unknown>;
      if (kind === 'nested-observation') raw['observation'] = { latestRequestId: 2, query: 'beta', results: [['Alpha synthetic result']] };
      else { raw['category'] = ['environment']; raw['outcome'] = 'inconclusive'; }
      await writeFile(f.runPath, JSON.stringify(raw));
      const trial = await read<TrialEvidence>(f.trialUrl);
      assert.equal(trial.availability, 'unavailable'); assert.equal(trial.outcome, 'inconclusive'); assert.equal(trial.runs[0]!.result, null);
    } finally { await f.service.close(); }
  });
}

test('trial reconstruction advances only from accepted candidates across exact rejected and accepted runs', async () => {
  await mkdir('.repro-runs/tests', { recursive: true });
  const service = await serve({ port: 0, root: await mkdtemp('.repro-runs/tests/inspector-history-') });
  try {
    const manifest = createManifest(); const session = service.ledger.createSession(manifest, true);
    const job = service.ledger.startJob(session.id, 'reduce', 'history'); const directory = join(service.ledger.root, 'artifacts', job.id);
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
    const candidates = [manifest, { ...manifest, actions: manifest.actions.filter(action => action.id !== 'focus-before') },
      { ...manifest, actions: manifest.actions.filter(action => action.id !== 'focus-after') },
      { ...manifest, actions: manifest.actions.filter(action => !['focus-before', 'focus-after'].includes(action.id)) }];
    const trials: Trial[] = []; const runs: RunResult[] = [];
    for (const [index, candidate] of candidates.entries()) {
      const accepted = index !== 1; const runIds: string[] = [];
      for (let repetition = 0; repetition < (accepted ? 2 : 1); repetition++) {
        const run = makeRun(candidate);
        if (!accepted) { run.outcome = 'requirement-satisfied'; delete run.category; assert.ok(run.observation && 'results' in run.observation); run.observation.results = ['Beta synthetic result']; run.reason = 'The frozen latest-response assertion passed after both controlled HTTP responses completed.'; }
        runs.push(run); runIds.push(run.id);
        const runDir = join(directory, `execution-${String(runs.length).padStart(6, '0')}`, run.id);
        await mkdir(runDir, { recursive: true }); await writeFile(join(runDir, 'evidence.json'), JSON.stringify({ ...run, artifacts: undefined }));
      }
      const trial: Trial = { index, inputDigest: digest(candidate), seed: candidate.environment.seed,
        removed: index === 0 ? [] : index === 2 ? ['focus-after'] : ['focus-before'], outcome: accepted ? 'target-failure' : 'requirement-satisfied',
        reason: accepted ? 'Target failure preserved in 2/2 required repetitions.' : 'Frozen requirement was satisfied; target failure was not reproduced.', durationMs: 10, accepted, runIds };
      trials.push(trial); service.ledger.event(job.id, 'trial', JSON.stringify(trial));
    }
    service.ledger.finish(job.id, 'complete', { manifest: candidates[3], trials, baseline: runs[0], status: 'complete', minimality: 'unverified', reason: 'test', executions: 7, durationMs: 70 });
    service.ledger.updateManifest(session.id, candidates[3]!);
    for (const [index, candidate] of candidates.entries()) {
      const evidence = await read<TrialEvidence>(`${service.url}/api/jobs/${job.id}/trials/${index}`);
      assert.equal(evidence.availability, 'available'); assert.deepEqual(evidence.candidate, candidate); assert.equal(evidence.outcome, trials[index]!.outcome);
      assert.deepEqual(evidence.runs.map(run => run.runId), trials[index]!.runIds);
    }
  } finally { await service.close(); }
});
