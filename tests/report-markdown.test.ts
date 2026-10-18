import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { EXTRACTOR, extractReproFiles, fileBlock, renderReport, type ReportData } from '../src/report-markdown.js';
import { generateTestFiles, locatorCode } from '../src/report-test.js';
import { createDraftManifest, resolveManifest } from '../src/app-contract.js';
import { parseExpectation, parseSteps } from '../src/steps.js';
import type { GeneratedFile } from '../src/report-test.js';

const sha = (content: string) => createHash('sha256').update(content).digest('hex');
const file = (path: string, content: string, language = 'js'): GeneratedFile => ({ path, language, content, sha256: sha(content) });
function manifest() {
  const steps = parseSteps('Open the app\nType "secret-value" into "Password"\nClick "Sign in"');
  const draft = createDraftManifest({ id: 'login', name: 'demo', description: 'Signing in shows the dashboard.', actions: steps.actions, checks: parseExpectation('"#status" should show "Welcome"').checks,
    sourceDigest: 'b'.repeat(64), commit: 'c'.repeat(40), dirty: false, approved: true, secrets: new Map([[1, 'REPRO_SECRET_1']]) });
  return resolveManifest(draft, { actions: [{ id: 'step-1', target: null, sensitive: false }, { id: 'step-2', target: { by: 'label', value: 'Password' }, sensitive: true }, { id: 'step-3', target: { by: 'role', role: 'button', value: 'Sign in' }, sensitive: false }],
    checks: [{ by: 'css', value: '#status' }] }, ['Invalid password'], () => null);
}
function data(files: GeneratedFile[]): ReportData {
  return {
    title: 'Sign-in rejects a valid password', slug: 'login', generatedAt: '2026-10-18 00:00 UTC', reproVersion: '0.2.0', status: 'reproduced', statusDetail: 'the failure occurred in 4 of 4 conclusive runs.', failureRecorded: true,
    reporter: { wentWrong: 'Type the password, click Sign in', shouldHappen: 'It should say Welcome', notes: [] },
    expectation: { checks: [{ text: 'the element `#status` text is "Welcome"', expected: 'Welcome', observed: 'Invalid password', passed: false }], approval: 'reporter-confirmed' },
    observedFrom: 'capture run', steps: { final: ['Open `/`'], original: ['Open `/`'], reduction: 'These are the reported steps.', secrets: [{ name: 'REPRO_SECRET_1', purpose: 'the account password' }] },
    runs: [{ label: 'Capture', outcome: 'reproduced the failure', values: ['Invalid password'], note: '', durationMs: 1000 }], trials: [],
    app: { name: 'demo', folderNote: '', git: { commit: 'c'.repeat(40), branch: 'main', remotes: [{ name: 'origin', url: 'https://git.example.invalid/demo.git' }], pushedTo: ['origin/main'], appPath: '.', dirty: false, changed: [], untracked: [], omitted: [] },
      patch: null, patchRedacted: false, start: { command: 'npm run dev', source: 'package.json script "dev"', url: null, kind: 'command' }, install: 'npm ci', packageManager: 'npm' },
    environment: { os: 'darwin', node: 'v26.7.0', packageManager: 'npm 11', browser: 'Chromium', nodeDeclared: null },
    dependencies: { declared: { react: '^19.0.0' }, dev: {}, resolved: { react: '19.3.1' }, lockfile: { file: 'package-lock.json', sha256: 'd'.repeat(64) } },
    test: { files, testPath: files[0]!.path }, fresh: { status: 'reproduced', summary: 'Reproduced: in a clean clone of the commit, the test failed with the same observed result.', observed: ['Invalid password'], commands: [], durationMs: 0, output: [] },
    logs: { pageErrors: [], console: [], failedRequests: [], blockedHosts: [], dialogs: [], server: [] }, suspected: [], verified: [], limitations: ['Only Chromium was tested.'], missing: [],
    redactions: { email: 1 }, details: { 'Report id': 'report-1' },
  };
}

test('generated test files are valid modules that read withheld values from the environment and pin Repro’s Playwright lock entries', async () => {
  const files = generateTestFiles({ manifest: manifest(), title: 'Sign-in rejects a valid password', slug: 'login', start: { kind: 'command', directory: '/somewhere/app', command: 'npm run dev', url: null, env: {}, startTimeoutMs: 60000, source: 'x' },
    appDirectory: '/somewhere/app', secretPurposes: { REPRO_SECRET_1: 'the account password' } });
  assert.deepEqual(files.map(item => item.path), ['.repro/login.test.mjs', '.repro/package.json', '.repro/package-lock.json']);
  const test = files[0]!.content;
  assert.match(test, /element => element\.fill\(process\.env\.REPRO_SECRET_1\)/);
  assert.equal(test.includes('secret-value'), false, 'the typed secret never reaches the test file');
  assert.equal(test.includes('/somewhere/app'), false, 'no local absolute path in the test');
  assert.match(test, /page\.getByRole\("button", \{ name: "Sign in", exact: true \}\)/);
  assert.match(test, /const REPORTED_FAILURE = \{"exact":\[true\],"passed":\[false\],"values":\["Invalid password"\]\};/);
  const directory = await mkdtemp(resolve('.repro-runs/tests-report-test-'));
  await writeFile(join(directory, 'login.test.mjs'), test);
  const check = spawnSync(process.execPath, ['--check', join(directory, 'login.test.mjs')], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  const lock = JSON.parse(files[2]!.content);
  const repro = JSON.parse(await readFile('package-lock.json', 'utf8'));
  for (const name of ['node_modules/playwright', 'node_modules/playwright-core']) assert.equal(lock.packages[name].integrity, repro.packages[name].integrity);
  assert.deepEqual(JSON.parse(files[1]!.content).dependencies, { playwright: repro.packages['node_modules/playwright'].version });
  for (const [target, code] of [[{ by: 'testid', value: 'save' }, 'page.getByTestId("save")'], [{ by: 'css', value: '#a "b"' }, 'page.locator("#a \\"b\\"")'], [{ by: 'placeholder', value: 'Search' }, 'page.getByPlaceholder("Search", { exact: true })']] as const)
    assert.equal(locatorCode(target), code);
});

test('REPRO.md embeds every file as a hash-checked block that survives backticks, and the documented command materializes them safely', async () => {
  const tricky = file('.repro/demo.test.mjs', 'const template = `a ${"b"}`;\n// a fence inside the file:\n```\nconsole.log("```js not a block");\n');
  const json = file('.repro/package.json', '{\n  "name": "demo"\n}\n', 'json');
  const markdown = renderReport(data([tricky, json]));
  assert.match(fileBlock(tricky), /^````js repro-file=\.repro\/demo\.test\.mjs sha256=[0-9a-f]{64}\n/);
  assert.deepEqual(extractReproFiles(markdown).map(entry => [entry.path, entry.valid, entry.content === (entry.path.endsWith('.mjs') ? tricky.content : json.content)]), [['.repro/demo.test.mjs', true, true], ['.repro/package.json', true, true]]);
  for (const heading of ['## Summary', '## Expected and observed behavior', '## Steps to reproduce', '## Run the regression test', '## Checking a fix', '## Test files', '### Observed facts', '### Suspected causes (not verified)', '### Verified causes', '## Limits and missing information'])
    assert.ok(markdown.includes(heading), heading);
  assert.match(markdown, /export REPRO_SECRET_1='…' {3}# the account password/);
  assert.match(markdown, /git clone -- https:\/\/git\.example\.invalid\/demo\.git demo/);

  await mkdir('.repro-runs', { recursive: true });
  const directory = await mkdtemp(resolve('.repro-runs/tests-extract-'));
  await writeFile(join(directory, 'REPRO.md'), markdown.replace(/\n/g, '\r\n'));
  execFileSync('/bin/sh', ['-c', `${EXTRACTOR} REPRO.md`], { cwd: directory });
  assert.equal(await readFile(join(directory, '.repro/demo.test.mjs'), 'utf8'), tricky.content);
  const again = spawnSync('/bin/sh', ['-c', `${EXTRACTOR} REPRO.md`], { cwd: directory, encoding: 'utf8' });
  assert.notEqual(again.status, 0, 'existing files are never overwritten');
  assert.match(again.stderr, /EEXIST/);
  const tampered = await mkdtemp(resolve('.repro-runs/tests-extract-'));
  await writeFile(join(tampered, 'REPRO.md'), markdown.replace('const template', 'const changed'));
  const rejected = spawnSync('/bin/sh', ['-c', `${EXTRACTOR} REPRO.md`], { cwd: tampered, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /does not match its SHA-256/);
  const escape = await mkdtemp(resolve('.repro-runs/tests-extract-'));
  const hostile = `# x\n\n\`\`\`sh repro-file=../outside.sh sha256=${sha('echo pwned\n')}\necho pwned\n\`\`\`\n\n\`\`\`js repro-file=.repro/a/b.js sha256=${sha('x\n')}\nx\n\`\`\`\n`;
  await writeFile(join(escape, 'REPRO.md'), hostile);
  const none = spawnSync('/bin/sh', ['-c', `${EXTRACTOR} REPRO.md`], { cwd: escape, encoding: 'utf8' });
  assert.notEqual(none.status, 0, 'paths outside .repro/ and nested paths are not materialized');
  assert.match(none.stderr, /No \.repro files found/);
  assert.deepEqual(extractReproFiles(hostile), []);
});

test('only remotes another machine can reach are used in the clone command', async () => {
  const { shareableRemote } = await import('../src/report-markdown.js');
  for (const url of ['https://github.com/acme/shop.git', 'git@github.com:acme/shop.git', 'ssh://git@host/shop.git']) assert.equal(shareableRemote(url), true, url);
  for (const url of ['~/Developer/shop.git', '/srv/git/shop.git', 'file:///srv/shop.git', '../shop']) assert.equal(shareableRemote(url), false, url);
  const base = data([file('.repro/demo.test.mjs', 'x\n')]);
  const local = renderReport({ ...base, app: { ...base.app, git: { ...base.app.git!, remotes: [{ name: 'origin', url: '~/Developer/shop.git' }] } } });
  assert.match(local, /git clone -- <repository URL or path> demo/);
  assert.match(local, /origin remote is a folder on the reporter’s machine/);
  assert.equal(local.includes('~/Developer/shop.git'), false, 'the local path itself is not shown');
  const redacted = renderReport({ ...base, app: { ...base.app, git: { ...base.app.git!, remotes: [{ name: 'origin', url: 'https://[redacted url-credentials]@git.example.invalid/shop.git' }] } } });
  assert.match(redacted, /git clone -- https:\/\/git\.example\.invalid\/shop\.git demo/);
});
