import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exportableTestFiles, freshVerdict, prepareReport } from '../src/report-flow.js';
import { EXTRACTOR, fileBlock, renderReport, type ReportData } from '../src/report-markdown.js';
import { generateTestFiles } from '../src/report-test.js';
import { createDraftManifest, resolveManifest } from '../src/app-contract.js';
import { parseExpectation, parseSteps } from '../src/steps.js';

// Regressions for the four findings of the independent cloud verification of v0.2.1-beta
// (October 18, 2026; see evidence/INDEPENDENT-VERIFICATION-0.2.1.md). Each failed before its fix.
const work = resolve('.repro-runs/independent-verification-tests');
const sha = (content: string) => createHash('sha256').update(content).digest('hex');

function manifestExpecting(expected: string, reference = '"#status"') {
  const draft = createDraftManifest({ id: 'proof', name: 'demo', description: 'proof', actions: parseSteps('Open the app').actions,
    checks: parseExpectation(`${reference} should show "${expected}"`).checks, sourceDigest: 'b'.repeat(64), commit: 'c'.repeat(40), dirty: false, approved: true, secrets: new Map() });
  return resolveManifest(draft, { actions: [{ id: 'step-1', target: null, sensitive: false }], checks: [{ by: 'css', value: '#status' }] }, ['wrong'], () => null);
}

test('1a: redaction never silently rewrites the exported test; a test that would change is refused instead', () => {
  const files = generateTestFiles({ manifest: manifestExpecting('synthetic-person@private-company.org'), title: 'proof', slug: 'proof', start: null, appDirectory: null, secretPurposes: {} });
  assert.throws(() => exportableTestFiles(files, []), (error: Error & { code?: string }) => error.code === 'SENSITIVE_TEST_DATA');
  const plain = generateTestFiles({ manifest: manifestExpecting('Order placed'), title: 'proof', slug: 'proof', start: null, appDirectory: null, secretPurposes: {} });
  assert.deepEqual(exportableTestFiles(plain, []), plain, 'ordinary tests pass through byte for byte');
});

test('1b: personal data or credentials in an expected value or an element name are asked about before anything runs', async () => {
  const app = join(work, randomUUID());
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, 'index.html'), '<!doctype html><p id="status">x</p>');
  const ask = async (wentWrong: string, shouldHappen: string) => (await prepareReport({ app: { repository: app }, wentWrong, shouldHappen, confirmed: true })).questions.map(question => question.question).join('\n');
  assert.match(await ask('Open the app', '"#status" should show "synthetic-person@private-company.org"'), /looks like a credential or personal data/);
  assert.match(await ask('Open the app\nClick "Email synthetic-person@private-company.org"', '"#status" should show "Sent"'), /names an element with what looks like a credential or personal data/);
  assert.match(await ask('Open the app', '"[data-owner=\'synthetic-person@private-company.org\']" should show "x"'), /names an element with what looks like a credential or personal data/);
  assert.equal(await ask('Open the app\nClick "Send"', '"#status" should show "Sent"'), '');
});

function reportData(extra: Partial<ReportData['app']>): ReportData {
  const content = 'x\n';
  return {
    title: 'T', slug: 'proof', generatedAt: 'now', reproVersion: '0', status: 'reproduced', statusDetail: 'd', failureRecorded: true,
    reporter: { wentWrong: '', shouldHappen: '', notes: [] }, expectation: { checks: [{ text: 'c', expected: 'e', observed: 'o', passed: false }], approval: 'reporter-confirmed' },
    observedFrom: 'capture run', steps: { final: [], original: [], reduction: '', secrets: [] }, runs: [], trials: [],
    app: { name: 'demo', folderNote: '', git: { commit: 'c'.repeat(40), branch: 'main', remotes: [{ name: 'origin', url: 'https://host.invalid/$(printf${IFS}INJECTED).git' }], pushedTo: [], appPath: 'app folder', dirty: false, changed: [], untracked: [], omitted: [] },
      patch: null, patchRedacted: false, start: null, install: null, packageManager: null, ...extra },
    environment: { os: 'o', node: 'n', packageManager: null, browser: 'b', nodeDeclared: null }, dependencies: { declared: {}, dev: {}, resolved: {}, lockfile: null },
    test: { files: [{ path: '.repro/proof.test.mjs', language: 'js', content, sha256: sha(content) }], testPath: '.repro/proof.test.mjs' },
    fresh: { status: 'not-run', summary: 'Not run.', observed: null, commands: [], durationMs: 0, output: [] },
    logs: { pageErrors: [], console: [], failedRequests: [], blockedHosts: [], dialogs: [], server: [] }, suspected: [], verified: [], limitations: [], missing: [], redactions: {}, details: {},
  };
}

test('2: repository data in REPRO.md commands is quoted: no shell substitution, spaces work, no option or parent-folder tricks', () => {
  for (const name of ['demo', '..', '-rf']) {
    const markdown = renderReport({ ...reportData({}), app: { ...reportData({}).app, name } });
    const block = /### 1\. Get the exact source\n\n```sh\n([\s\S]*?)```/.exec(markdown)![1]!;
    const sandbox = join(work, randomUUID());
    mkdirSync(sandbox, { recursive: true });
    // A stub git prints its arguments and, for clone, creates the target folder with the app subfolder.
    const stub = 'git() { printf "ARG:<%s>\\n" "$@"; if [ "$1" = clone ]; then eval "dir=\\${$#}"; mkdir -p -- "$dir/app folder"; fi; }; ';
    const run = spawnSync('/bin/sh', ['-c', stub + block], { cwd: sandbox, encoding: 'utf8' });
    assert.equal(run.status, 0, `${name}: ${run.stderr}\n${block}`);
    assert.match(run.stdout, /ARG:<https:\/\/host\.invalid\/\$\(printf\$\{IFS\}INJECTED\)\.git>/, 'the URL reaches git literally');
    assert.equal(run.stdout.includes('INJECTED.git>'), false, 'no substitution ran');
    assert.equal(readdirSync(sandbox).length, 1, 'exactly one folder was created, inside the sandbox');
    assert.equal(readdirSync(sandbox)[0]!.startsWith('-') || readdirSync(sandbox)[0] === '..', false);
  }
});

test('3: the extraction command refuses a .repro that is a link, and writes nothing outside the app folder', () => {
  const root = join(work, randomUUID());
  mkdirSync(join(root, 'recipient'), { recursive: true }); mkdirSync(join(root, 'elsewhere'));
  symlinkSync('../elsewhere', join(root, 'recipient', '.repro'));
  const content = '// harmless proof\n';
  writeFileSync(join(root, 'recipient', 'REPRO.md'), fileBlock({ path: '.repro/proof.test.mjs', content, language: 'js', sha256: sha(content) }));
  const run = spawnSync('/bin/sh', ['-c', `${EXTRACTOR} REPRO.md`], { cwd: join(root, 'recipient'), encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /\.repro must be a real folder/);
  assert.equal(existsSync(join(root, 'elsewhere', 'proof.test.mjs')), false);
  // A normal folder still works.
  const clean = join(root, 'clean');
  mkdirSync(clean);
  writeFileSync(join(clean, 'REPRO.md'), fileBlock({ path: '.repro/proof.test.mjs', content, language: 'js', sha256: sha(content) }));
  assert.equal(spawnSync('/bin/sh', ['-c', `${EXTRACTOR} REPRO.md`], { cwd: clean, encoding: 'utf8' }).status, 0);
  assert.equal(existsSync(join(clean, '.repro', 'proof.test.mjs')), true);
});

test('4: the fresh-checkout verdict needs both a matching observation and a consistent exit code', () => {
  const where = 'in a clean clone of the commit';
  const v = (status: 'reproduced' | 'intermittent' | 'not-reproduced', verdict: 'target-failure' | 'requirement-satisfied' | 'different', code: number) => freshVerdict({ status, verdict, code, where }).status;
  assert.equal(v('reproduced', 'target-failure', 1), 'reproduced');
  assert.equal(v('reproduced', 'target-failure', 0), 'failed');
  assert.equal(v('reproduced', 'requirement-satisfied', 0), 'not-reproduced');
  assert.equal(v('reproduced', 'requirement-satisfied', 1), 'failed', 'an observation followed by a failing exit (for example in teardown) is not a passing test');
  assert.equal(v('reproduced', 'different', 1), 'different');
  assert.equal(v('intermittent', 'different', 1), 'different', 'a different failure is never the recorded one');
  assert.equal(v('intermittent', 'target-failure', 1), 'reproduced');
  assert.equal(v('intermittent', 'requirement-satisfied', 0), 'passed');
  assert.equal(v('intermittent', 'requirement-satisfied', 1), 'failed');
  assert.equal(v('not-reproduced', 'requirement-satisfied', 0), 'passed');
  const teardown = freshVerdict({ status: 'not-reproduced', verdict: 'requirement-satisfied', code: 1, where });
  assert.equal(teardown.status, 'failed');
  assert.match(teardown.summary, /exited with code 1/);
  assert.equal(/did not hold/.test(teardown.summary), false, 'the expected behavior did hold; the exit code is what failed');
});
