import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runExperiment } from '../src/runner.js';
import { startApp, type LaunchPlan } from '../src/app-process.js';
import { createDraftManifest, resolveManifest } from '../src/app-contract.js';
import { parseExpectation, parseSteps } from '../src/steps.js';
import type { AppObservation, AppResolution, ManifestV4, RunResult } from '../src/contracts.js';

const root = resolve('.repro-runs/app-run-tests');
async function fixture(fixed = false): Promise<string> {
  const directory = join(root, randomUUID());
  await mkdir(directory, { recursive: true });
  await cp('fixtures/local-apps/task-tally', directory, { recursive: true });
  if (fixed) execFileSync('git', ['apply', 'fix.patch'], { cwd: directory });
  return directory;
}
const plan = (directory: string): LaunchPlan => ({ kind: 'command', directory, command: 'node server.mjs', url: null, env: {}, startTimeoutMs: 15_000, source: 'test' });
const STEPS = ['Open the app', 'Type "Write report" into "New task"', 'Click "Add task"', 'Type "Send invoice" into "New task"', 'Press Enter', 'Check "Done: Write report"', 'Uncheck "Done: Write report"'].join('\n');
function draft(expect = '"#remaining" should show "2 tasks remaining"', approved = true): ManifestV4 {
  const steps = parseSteps(STEPS), expectation = parseExpectation(expect);
  assert.deepEqual([steps.problems, expectation.problems], [[], []]);
  return createDraftManifest({ id: 'task-tally-remaining', name: 'task-tally', description: 'Unchecking a task restores the remaining count.', actions: steps.actions, checks: expectation.checks,
    sourceDigest: 'a'.repeat(64), commit: null, dirty: false, approved, secrets: new Map() });
}
async function run(manifest: ManifestV4, directory: string, resolveTargets: boolean, signal?: AbortSignal): Promise<RunResult & { resolution?: AppResolution }> {
  const app = await startApp(plan(directory));
  let resolution: AppResolution | undefined;
  try {
    const result = await runExperiment(manifest, { artifactDir: join(directory, '.runs', randomUUID()), ...(signal ? { signal } : {}),
      app: { origin: app.origin, secrets: {}, resolve: resolveTargets }, onResolution: value => { resolution = value; } });
    return { ...result, ...(resolution ? { resolution } : {}) };
  } finally { assert.equal((await app.stop()).stopped, true, 'the owned app stopped completely'); }
}

test('capture resolves plain-language targets, observes the reported failure and freezes it; the fixed app satisfies the same check', async () => {
  const buggy = await fixture();
  const capture = await run(draft(), buggy, true);
  assert.equal(capture.outcome, 'target-failure', capture.reason);
  assert.equal(capture.assertionCount, 1);
  const observation = capture.observation as AppObservation;
  assert.deepEqual(observation.values, ['0 tasks remaining']);
  assert.ok(observation.blockedHosts.includes('fonts.googleapis.com'), 'non-loopback font request was blocked and recorded');
  assert.ok(observation.console.every(line => !line.includes('eyJhbGciOiJIUzI1NiJ9')), 'browser console JWT is redacted in the observation');
  assert.ok(capture.resolution, 'capture returns its resolution');
  assert.deepEqual(capture.resolution!.actions.map(action => action.target), [
    null,
    { by: 'label', value: 'New task' },
    { by: 'role', role: 'button', value: 'Add task' },
    { by: 'label', value: 'New task' },
    null,
    { by: 'role', role: 'checkbox', value: 'Done: Write report' },
    { by: 'role', role: 'checkbox', value: 'Done: Write report' },
  ]);
  assert.deepEqual(capture.resolution!.checks, [{ by: 'css', value: '#remaining' }]);
  const frozen = resolveManifest(draft(), capture.resolution!, observation.values, () => null);
  assert.deepEqual(frozen.failure, { values: ['0 tasks remaining'], exact: [true], passed: [false] });

  const replay = await run(frozen, buggy, false);
  assert.equal(replay.outcome, 'target-failure', replay.reason);
  assert.equal(replay.resolution, undefined);
  const fixed = await run(frozen, await fixture(true), false);
  assert.equal(fixed.outcome, 'requirement-satisfied', fixed.reason);
  assert.equal(fixed.assertionDigest, replay.assertionDigest);
  assert.equal(fixed.harnessDigest, replay.harnessDigest);
  for (const result of [capture, replay, fixed]) assert.match(result.environment.isolation, /non-loopback network blocked/);
});

test('a different failure, a missing step target and an unconfirmed expectation are never reported as the bug', async () => {
  const buggy = await fixture();
  const capture = await run(draft(), buggy, true);
  const frozen = resolveManifest(draft(), capture.resolution!, (capture.observation as AppObservation).values, () => null);
  // Removing the uncheck step leaves "0 tasks remaining" vs frozen... use a shorter prefix that fails differently.
  const different = { ...frozen, actions: frozen.actions.slice(0, 4) } as ManifestV4;
  const differentResult = await run(different, buggy, false);
  assert.equal(differentResult.outcome, 'inconclusive');
  assert.match(differentResult.reason, /^DIFFERENT_FAILURE:/);
  assert.deepEqual((differentResult.observation as AppObservation).values, ['1 task remaining']);

  const missing = parseSteps('Click "Archive everything"');
  const blocked = await run(createDraftManifest({ ...{ id: 'missing', name: 'task-tally', description: '', sourceDigest: 'a'.repeat(64), commit: null, dirty: false, approved: true, secrets: new Map() },
    actions: missing.actions, checks: parseExpectation('"#remaining" should show "0 tasks remaining"').checks }), buggy, true);
  assert.equal(blocked.outcome, 'inconclusive');
  assert.equal(blocked.reason, 'STEP_TARGET_NOT_FOUND: step-2 could not find its element on the page.');
  assert.equal(blocked.observation, null);

  const unconfirmed = await run(draft(undefined, false), buggy, true);
  assert.equal(unconfirmed.outcome, 'inconclusive');
  assert.match(unconfirmed.reason, /^PROVISIONAL_EXPECTATION:/);
});

test('an unresolvable check offers nearby elements for the reporter to choose; cancellation stops browser and app', async () => {
  const buggy = await fixture();
  const unresolved = await run(draft('"Remaining tasks" should show "2 tasks remaining"'), buggy, true);
  assert.equal(unresolved.outcome, 'inconclusive');
  assert.equal(unresolved.reason, 'CHECK_TARGET_UNRESOLVED: check 1 could not be matched to exactly one element.');
  assert.ok(unresolved.resolution!.candidates.some(candidate => candidate.selector === '#remaining' && candidate.text === '0 tasks remaining'));
  // Text that appears in several rows: Repro offers the elements beside it, each with an exact selector.
  const duplicate = parseSteps('Open the app\nType "Pay rent" into "New task"\nPress Enter\nType "Pay rent" into "New task"\nPress Enter');
  const rows = await run(createDraftManifest({ id: 'rows', name: 'task-tally', description: '', sourceDigest: 'a'.repeat(64), commit: null, dirty: false, approved: true, secrets: new Map(),
    actions: duplicate.actions, checks: parseExpectation('"Pay rent" should show "done"').checks }), buggy, true);
  assert.equal(rows.reason, 'CHECK_TARGET_UNRESOLVED: check 1 could not be matched to exactly one element.');
  const offered = rows.resolution!.candidates;
  for (const row of [1, 2]) {
    assert.ok(offered.some(candidate => candidate.selector === `#tasks > li:nth-of-type(${row}) > span` && candidate.text === 'Pay rent'), JSON.stringify(offered));
    assert.ok(offered.some(candidate => candidate.selector === `#tasks > li:nth-of-type(${row}) > button` && candidate.text === 'Remove Pay rent'), JSON.stringify(offered));
  }

  // Visibility checks need no existing element: "should not be visible" may observe nothing at all.
  const absent = await run(draft('"Archive" should not be visible\n"#saved" should not be visible'), buggy, true);
  assert.equal(absent.outcome, 'target-failure', absent.reason);
  assert.deepEqual((absent.observation as AppObservation).values, ['false', 'true']);
  assert.deepEqual(absent.resolution!.checks, [{ by: 'text', value: 'Archive' }, { by: 'css', value: '#saved' }]);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 1200);
  const cancelled = await run(draft(), buggy, true, controller.signal);
  assert.equal(cancelled.outcome, 'cancelled', cancelled.reason);
  const runs = join(buggy, '.runs');
  for (const directory of await readdir(runs)) for (const id of await readdir(join(runs, directory))) {
    const entries = await readdir(join(runs, directory, id));
    assert.equal(entries.includes('.profile'), false, `profile removed after certified cleanup: ${entries}`);
    assert.ok(JSON.parse(await readFile(join(runs, directory, id, 'evidence.json'), 'utf8')).outcome);
  }
});
