import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { classifyRuns, pinnedSteps, reportTitle, shorteningPolicy, slugify } from '../src/report-flow.js';
import { extractReproFiles, renderReport, type ReportData } from '../src/report-markdown.js';
import { generateTestFiles, type GeneratedFile } from '../src/report-test.js';
import { createDraftManifest, resolveManifest } from '../src/app-contract.js';
import { parseExpectation, parseSteps } from '../src/steps.js';

// Regressions for the 2026-10-17 foreground review of the diff against main (see evidence/FOREGROUND-REVIEW-0.2.0.md).

const runs = (counts: { captureFailed: boolean; failures: number; satisfied: number; different?: number }) =>
  classifyRuns({ different: 0, repetitions: 3, freshStart: 'from a fresh start', inconclusiveReason: 'APP_START_TIMEOUT', ...counts });

test('B: intermittent needs both outcomes; failures with too few conclusive runs are blocked, never intermittent', () => {
  assert.equal(runs({ captureFailed: true, failures: 3, satisfied: 0 }).status, 'reproduced');
  assert.equal(runs({ captureFailed: true, failures: 2, satisfied: 0 }).status, 'reproduced', 'two failing repetitions and one inconclusive still reproduce');
  assert.equal(runs({ captureFailed: true, failures: 1, satisfied: 1 }).status, 'intermittent');
  assert.equal(runs({ captureFailed: false, failures: 1, satisfied: 2 }).status, 'intermittent');
  assert.equal(runs({ captureFailed: true, failures: 0, satisfied: 0, different: 3 }).status, 'intermittent', 'every run failed, but not always in the recorded way');
  const thin = runs({ captureFailed: true, failures: 1, satisfied: 0 });
  assert.equal(thin.status, 'blocked', 'the capture and one repetition failed, two were inconclusive: no run met the expectation');
  assert.match(thin.detail, /too few runs were conclusive/);
  assert.equal(runs({ captureFailed: false, failures: 0, satisfied: 1 }).status, 'blocked');
});

test('C: without a trace no step is known to have changed a checked value', () => {
  assert.deepEqual(pinnedSteps(['step-1', 'step-2', 'step-3'], undefined), { pinned: ['step-1', 'step-2', 'step-3'], traced: false });
  const traced = pinnedSteps(['step-1', 'step-2', 'step-3'], [['a'], ['a'], ['b']]);
  assert.deepEqual(traced, { pinned: ['step-1', 'step-3'], traced: true });
});

test('A: a negative check can depend on the steps ("the total should not be $0.00" after adding an item), so only "no errors" permits shortening by itself', () => {
  const check = (text: string) => parseExpectation(text).checks;
  assert.deepEqual(shorteningPolicy(check('"#total" should not show "$0.00"'), false), { invariant: false, mayShorten: false });
  assert.deepEqual(shorteningPolicy(check('The page should not contain "NaN"'), false), { invariant: false, mayShorten: false });
  assert.deepEqual(shorteningPolicy(check('"Empty cart" should not be visible'), false), { invariant: false, mayShorten: false });
  assert.deepEqual(shorteningPolicy(check('There should be no errors'), false), { invariant: true, mayShorten: true });
  assert.deepEqual(shorteningPolicy(check('"#total" should not show "$0.00"'), true), { invariant: false, mayShorten: true }, 'the reporter may declare it');
});

test('E: a derived title and file name never come from a step that types a value', () => {
  const login = 'Type "alice.walker@gmail.com" into "Email"\nType "Hunter2!x" into "Password"\nClick "Sign in"';
  const title = reportTitle({ wentWrong: login }, 'shop');
  for (const leaked of ['alice', 'walker', 'gmail', 'hunter2', 'Hunter2']) {
    assert.equal(title.toLowerCase().includes(leaked.toLowerCase()), false, `title "${title}" contains ${leaked}`);
    assert.equal(slugify(title.replace(/^[^:]+:\s*/, '')).includes(leaked.toLowerCase()), false);
  }
  assert.equal(reportTitle({ wentWrong: 'Open the app\nClick "Pay"\nThe total shows NaN' }, 'shop'), 'shop: The total shows NaN', 'a note still names the report');
  assert.equal(reportTitle({ title: 'Checkout total is NaN', wentWrong: login }, 'shop'), 'Checkout total is NaN');
});

const sha = (content: string) => createHash('sha256').update(content).digest('hex');
function data(status: ReportData['status'], extra: Partial<ReportData> = {}, appPath = 'apps/web'): ReportData {
  const testFile: GeneratedFile = { path: '.repro/case.test.mjs', language: 'js', content: 'x\n', sha256: sha('x\n') };
  const patch: GeneratedFile = { path: '.repro/local-changes.patch', language: 'diff', content: 'diff --git a/x b/x\n', sha256: sha('diff --git a/x b/x\n') };
  return {
    title: 'T', slug: 'case', generatedAt: 'now', reproVersion: '0.2.0', status, statusDetail: 'the failure occurred in 1 of 4 runs; 3 met the expectation.', failureRecorded: true,
    reporter: { wentWrong: '', shouldHappen: '', notes: [] }, expectation: { checks: [{ text: '"#total" text is "$5"', expected: '$5', observed: '$0', passed: false }], approval: 'reporter-confirmed' },
    observedFrom: 'capture run', steps: { final: ['Open `/`'], original: ['Open `/`'], reduction: '', secrets: [] }, runs: [], trials: [],
    app: { name: 'web', folderNote: '', git: { commit: 'c'.repeat(40), branch: 'main', remotes: [], pushedTo: [], appPath, dirty: true, changed: [{ path: 'packages/lib/x.js', status: 'M' }], untracked: [], omitted: [] },
      patch, patchRedacted: false, start: { command: 'npm run dev', source: 's', url: null, kind: 'command' }, install: 'npm ci', packageManager: 'npm' },
    environment: { os: 'o', node: 'n', packageManager: null, browser: 'b', nodeDeclared: null }, dependencies: { declared: {}, dev: {}, resolved: {}, lockfile: null },
    test: { files: [testFile], testPath: testFile.path }, fresh: { status: 'not-run', summary: 'Not run.', observed: null, commands: [], durationMs: 0, output: [] },
    logs: { pageErrors: [], console: [], failedRequests: [], blockedHosts: [], dialogs: [], server: [] },
    suspected: [], verified: [], limitations: [], missing: [], redactions: {}, details: {}, ...extra,
  };
}

test('F: every place REPRO.md shows the patch command uses the one that works from an app subfolder', () => {
  const markdown = renderReport(data('reproduced'));
  assert.equal(markdown.includes('applied with `git apply .repro/local-changes.patch`'), false);
  assert.equal([...markdown.matchAll(/git -C "\$\(git rev-parse --show-toplevel\)" apply "\$PWD\/\.repro\/local-changes\.patch"/g)].length, 2);
  assert.match(renderReport(data('reproduced', {}, '.')), /applied with `git apply \.repro\/local-changes\.patch`/);
});

test('G: an intermittent report without a recorded failure never promises one, and never prints an empty expectation', () => {
  const markdown = renderReport(data('intermittent', { failureRecorded: false, observedFrom: 'a failing repetition' }));
  assert.equal(markdown.includes('This is the failure recorded in REPRO.md'), false);
  assert.match(markdown, /When it fails, compare what it prints with “Expected and observed behavior”/);
  const empty = renderReport(data('intermittent', { failureRecorded: false, expectation: { checks: [{ text: 'c', expected: 'e', observed: 'e', passed: true }], approval: 'reporter-confirmed' } }));
  assert.equal(/expected that \./.test(empty), false);
  assert.match(renderReport(data('intermittent')), /This is the failure recorded in REPRO\.md/);
});

test('H: logged text with backtick runs stays inside its code span', () => {
  const markdown = renderReport(data('reproduced', { logs: { pageErrors: ['TypeError: a``b`c [click](https://evil.example)'], console: [], failedRequests: [], blockedHosts: [], dialogs: [], server: [] } }));
  const line = markdown.split('\n').find(entry => entry.includes('evil.example'))!;
  assert.match(line, /^ {2}- (`{3,}) TypeError: a``b`c \[click\]\(https:\/\/evil\.example\) \1$/);
  assert.equal(extractReproFiles(markdown).length, 2);
});

test('J: the generated test refuses the "…" placeholder REPRO.md shows for a withheld value', () => {
  const parsed = parseSteps('Open the app\nType "pw-value-123" into "Password"\nClick "Sign in"');
  const draft = createDraftManifest({ id: 'login', name: 'app', description: '', actions: parsed.actions, checks: parseExpectation('"#status" should show "Welcome"').checks,
    sourceDigest: 'a'.repeat(64), commit: null, dirty: false, approved: true, secrets: new Map([[1, 'REPRO_SECRET_1']]) });
  const resolved = resolveManifest(draft, { actions: draft.actions.map(action => ({ id: action.id, target: action.reference ? { by: 'text', value: 'x' } : null, sensitive: false })), checks: [{ by: 'css', value: '#status' }] }, ['Denied'], () => null);
  const [file] = generateTestFiles({ manifest: resolved, title: 'Login', slug: 'login', start: null, appDirectory: null, secretPurposes: { REPRO_SECRET_1: 'the password' } });
  assert.match(file!.content, /process\.env\[name\] !== '…'/);
});
