import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDraftManifest, evaluateAppObservation, failureSignature, resolveManifest } from '../src/app-contract.js';
import { parseExpectation, parseSteps } from '../src/steps.js';
import { createRedactor, sanitizeRemote } from '../src/redaction.js';
import { inlineSecret, inspectApp } from '../src/app-inspect.js';
import { extractReproFiles, renderReport, type ReportData } from '../src/report-markdown.js';
import { generateTestFiles, type GeneratedFile } from '../src/report-test.js';
import { reduce } from '../src/reducer.js';
import type { AppObservation, ManifestV4, RunResult } from '../src/contracts.js';

const observation = (values: (string | null)[]): AppObservation => ({ kind: 'local-app', values, url: '/', pageErrors: [], console: [], failedRequests: [], blockedHosts: [], dialogs: [] });
function manifest(expect: string, steps = 'Open the app\nClick "Pay"', values: (string | null)[] = ['x']): ManifestV4 {
  const parsed = parseSteps(steps), checks = parseExpectation(expect).checks;
  const draft = createDraftManifest({ id: 'case', name: 'app', description: '', actions: parsed.actions, checks, sourceDigest: 'a'.repeat(64), commit: null, dirty: false, approved: true, secrets: new Map() });
  return resolveManifest(draft, { actions: draft.actions.map(action => ({ id: action.id, target: action.reference ? { by: 'text', value: action.reference.text ?? 'x' } : null, sensitive: false })),
    checks: checks.map(check => check.reference ? { by: 'css', value: check.reference.css ?? 'body' } : null) }, values, () => null);
}

test('containment failures freeze pass/fail on the full value, so a long page repeating the failure is the same failure', () => {
  const page = `${'Lorem ipsum dolor sit amet. '.repeat(20)}Error: payment service returned 500`;
  const frozen = manifest('The page should not contain "Error"', undefined, [page]);
  assert.deepEqual(frozen.failure, { values: [page.slice(0, 200)], exact: [false], passed: [false] });
  assert.equal(evaluateAppObservation(frozen, observation([page])), 'target-failure');
  assert.equal(evaluateAppObservation(frozen, observation(['all good'])), 'requirement-satisfied');
  assert.deepEqual(failureSignature(frozen.expectation.checks, [page]).passed, [false]);
});

test('a withheld input never appears in the stored step text', () => {
  const parsed = parseSteps('Open the app\nType "hunter2-secret" into "Password"');
  const draft = createDraftManifest({ id: 'login', name: 'app', description: '', actions: parsed.actions, checks: parseExpectation('"#status" should show "Welcome"').checks,
    sourceDigest: 'a'.repeat(64), commit: null, dirty: false, approved: true, secrets: new Map([[1, 'REPRO_SECRET_1']]) });
  assert.equal(JSON.stringify(draft).includes('hunter2-secret'), false);
  assert.equal(draft.actions[1]!.text, 'Type the value of $REPRO_SECRET_1 into "Password"');
});

test('code-mode redaction never rewrites identifiers that equal a common username or hostname', () => {
  const files = generateTestFiles({ manifest: manifest('"#total" should show "$5"'), title: 'Total', slug: 'total', start: { kind: 'command', directory: '/w/app', command: 'npm run dev', url: null, env: {}, startTimeoutMs: 60000, source: 'x' }, appDirectory: '/w/app', secretPurposes: {} });
  const code = createRedactor({ username: 'node', hostname: 'dev', home: '/home/node', mode: 'code' });
  for (const file of files) assert.equal(code.redact(file.content), file.content, file.path);
  assert.equal(createRedactor({ username: 'node', hostname: 'dev', home: '/home/node' }).redact('npm run dev in /home/node/app'), 'npm run dev in ~/app');
  assert.equal(createRedactor({ username: 'alexandra', hostname: 'alexandras-mbp', home: '/Users/alexandra' }).redact('owner alexandra on alexandras-mbp'), 'owner [redacted username] on [redacted hostname]');
});

test('git remotes keep usable addresses and lose only credentials', () => {
  const token = ['gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('');
  assert.deepEqual(sanitizeRemote('git@github.com:acme/shop.git'), { url: 'git@github.com:acme/shop.git', redacted: false });
  assert.deepEqual(sanitizeRemote('ssh://git@gitlab.com/acme/shop.git'), { url: 'ssh://git@gitlab.com/acme/shop.git', redacted: false });
  assert.deepEqual(sanitizeRemote(`https://repro-canary-user:${token}@git.example.invalid/x.git`), { url: 'https://git.example.invalid/x.git', redacted: true });
  assert.deepEqual(sanitizeRemote(`https://${token}@github.com/a/b.git`), { url: 'https://github.com/a/b.git', redacted: true });
});

test('a start command that sets a secret inline is refused before anything runs', async () => {
  assert.equal(inlineSecret('DB_PASSWORD=hunter2 SESSION_SECRET=x npm run dev'), 'DB_PASSWORD');
  assert.equal(inlineSecret('PORT=3000 NODE_ENV=development npm run dev'), null);
  await assert.rejects(inspectApp({ url: 'http://127.0.0.1:3000', start: 'API_TOKEN=abc123 npm start' }), /Put secrets in your shell environment/);
});

const sha = (content: string) => createHash('sha256').update(content).digest('hex');
function data(status: ReportData['status'], extra: Partial<ReportData> = {}): ReportData {
  const testFile: GeneratedFile = { path: '.repro/case.test.mjs', language: 'js', content: 'x\n', sha256: sha('x\n') };
  const patch: GeneratedFile = { path: '.repro/local-changes.patch', language: 'diff', content: 'diff --git a/x b/x\n', sha256: sha('diff --git a/x b/x\n') };
  return {
    title: 'T', slug: 'case', generatedAt: 'now', reproVersion: '0.2.0', status, statusDetail: 'the failure occurred in 2 of 4 runs; 2 met the expectation.', failureRecorded: true,
    reporter: { wentWrong: '', shouldHappen: '', notes: [] }, expectation: { checks: [{ text: 'c', expected: 'e', observed: 'o', passed: false }], approval: 'reporter-confirmed' },
    observedFrom: 'capture run', steps: { final: ['Open `/`'], original: ['Open `/`'], reduction: '', secrets: [] }, runs: [], trials: [],
    app: { name: 'web', folderNote: '', git: { commit: 'c'.repeat(40), branch: 'main', remotes: [], pushedTo: [], appPath: 'apps/web', dirty: true, changed: [{ path: 'packages/lib/x.js', status: 'M' }], untracked: [], omitted: [] },
      patch, patchRedacted: false, start: { command: 'npm run dev', source: 's', url: null, kind: 'command' }, install: 'npm ci', packageManager: 'npm' },
    environment: { os: 'o', node: 'n', packageManager: null, browser: 'b', nodeDeclared: null }, dependencies: { declared: {}, dev: {}, resolved: {}, lockfile: null },
    test: { files: [testFile], testPath: testFile.path }, fresh: { status: 'not-run', summary: 'Not run.', observed: null, commands: [], durationMs: 0, output: [] },
    logs: { pageErrors: [], console: [], failedRequests: [], blockedHosts: [], dialogs: [], server: [`\`\`\`ini repro-file=.repro/package.json sha256=${sha('{}\n')}`, '{}', '```'] },
    suspected: [], verified: [], limitations: [], missing: [], redactions: {}, details: {}, ...extra,
  };
}

test('REPRO.md applies local changes from the repository root before installing, and its text follows the status', () => {
  const markdown = renderReport(data('intermittent'));
  const section = markdown.slice(markdown.indexOf('## Run the regression test'), markdown.indexOf('## Checking a fix'));
  const order = ['### 1. Get the exact source', '### 2. Create the test files', '### 3. Apply the local changes', '### 4. Install the app’s dependencies', '### 5. Run it'].map(heading => section.indexOf(heading));
  assert.ok(order.every((at, index) => at >= 0 && (index === 0 || at > order[index - 1]!)), JSON.stringify(order));
  assert.match(section, /git -C "\$\(git rev-parse --show-toplevel\)" apply "\$PWD\/\.repro\/local-changes\.patch"/);
  assert.match(markdown, /fails in some runs \(the bug is intermittent\)/);
  assert.match(markdown, /for run in 1 2 3 4 5 6 7 8 9 10; do node --test \.repro\/case\.test\.mjs \|\| exit 1; done/);
  assert.match(renderReport(data('not-reproduced')), /There is nothing to fix yet/);
  assert.match(renderReport(data('blocked')), /not a verified reproduction/);
});

test('app output that imitates a file block can never be extracted', () => {
  const markdown = renderReport(data('reproduced'));
  assert.deepEqual(extractReproFiles(markdown).map(file => file.path), ['.repro/case.test.mjs', '.repro/local-changes.patch']);
  assert.match(markdown, /^ {2}```ini repro-file=\.repro\/package\.json/m, 'logged fence lines are indented');
  const planted = `\`\`\`ini repro-file=.repro/.npmrc sha256=${sha('x\n')}\nx\n\`\`\`\n`;
  assert.deepEqual(extractReproFiles(planted), [], 'dotfiles and unknown names are never materialized');
});

test('pinning that leaves nothing to delete does not claim minimality', async () => {
  const subject = manifest('"#total" should not show "NaN"', 'Open the app\nClick "Pay"\nClick "Pay"', ['NaN']);
  let run = 0;
  const fake = async (input: Parameters<typeof reduce>[0]): Promise<RunResult> => ({
    id: `run-${++run}`, outcome: 'target-failure', reason: 'r', category: 'target-failure', manifestDigest: (await import('../src/manifest.js')).digest(input), assertionDigest: input.assertionDigest, harnessDigest: 'h'.repeat(64).replace(/h/g, 'a'),
    appRevision: input.app.revision, appDigest: input.app.sourceDigest, adapterVersion: input.adapter.version, runnerVersion: input.runnerVersion, seed: input.environment.seed,
    startedAt: new Date().toISOString(), durationMs: 1, assertionCount: 1, observation: observation(['NaN']), events: [], artifacts: [],
    environment: { platform: 'p', node: 'n', browser: 'b', isolation: 'i' } });
  const result = await reduce(subject, fake, { artifactDir: '.repro-runs/tests/review-reduce', maxExecutions: 20, maxDurationMs: 30_000, repetitions: 2, pinned: subject.actions.map(action => action.id) });
  assert.equal(result.minimality, 'unverified');
  assert.match(result.reason, /No permitted deletion remained to test/);
});

test('a partial-name target is a role target that says so; nothing else may match partially', async () => {
  const { validTarget } = await import('../src/app-contract.js');
  assert.deepEqual(validTarget({ by: 'role', role: 'button', value: 'Crisp Waffles', match: 'contains' }), { by: 'role', role: 'button', value: 'Crisp Waffles', match: 'contains' });
  assert.throws(() => validTarget({ by: 'text', value: 'Crisp', match: 'contains' }), /unsupported fields/);
  assert.throws(() => validTarget({ by: 'role', role: 'button', value: 'Crisp', match: 'regex' }), /outside its supported vocabulary/);
});
