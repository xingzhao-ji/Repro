import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateReport, type ReportProgress } from '../src/report-flow.js';
import { EXTRACTOR, extractReproFiles } from '../src/report-markdown.js';
import { childEnvironment } from '../src/app-process.js';

const root = resolve('.repro-runs/report-flow-tests');
const npmCache = resolve('.repro-cache/npm');
const gitIn = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, encoding: 'utf8' });
async function repository(fixed = false): Promise<string> {
  const directory = join(root, randomUUID(), 'task-tally');
  await mkdir(directory, { recursive: true });
  await cp('fixtures/local-apps/task-tally', directory, { recursive: true });
  await rm(join(directory, 'fix.patch'));
  if (fixed) execFileSync('git', ['apply', resolve('fixtures/local-apps/task-tally/fix.patch')], { cwd: directory });
  gitIn(directory, 'init', '-q', '-b', 'main'); gitIn(directory, 'add', '.'); gitIn(directory, 'commit', '-qm', 'Task tally');
  return directory;
}
const STEPS = `Open the app
Click "Add task"
Type "Write report" into "New task"
Click "Add task"
Hover over "Task tally"
Type "Send invoice" into "New task"
Press Enter
Type "Call bank" into "New task"
Press Enter
Check "Done: Send invoice"
Uncheck "Done: Send invoice"
The counter then says "1 task remaining".`;
const EXPECT = 'Unchecking a task should put it back in the count.\n"#remaining" should show "3 tasks remaining"';
// Step-independent: the counter must never read "1 task remaining" after these steps, whichever of them ran.
const INVARIANT = '"#remaining" should not show "1 task remaining"';
const CANARIES = ['tt_live_0f1e2d3c4b5a69788796a5b4', 'maria.gonzalez@gmail.com', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0YWxseSJ9', '7c1d55aa93b04e12'];
const browsers = resolve(process.env['PLAYWRIGHT_BROWSERS_PATH'] ?? '.repro-cache/browsers');

test('a reproduced local-app bug becomes one REPRO.md whose test fails in a fresh checkout and passes after the controlled fix', { timeout: 600_000 }, async () => {
  const app = await repository();
  const events: ReportProgress[] = [];
  const output = join(root, `report-${randomUUID()}`);
  const outcome = await generateReport({ app: { repository: app }, title: 'Unchecking a task drops the remaining count', wentWrong: STEPS, shouldHappen: INVARIANT, confirmed: true,
    options: { budget: 40, npmCache, offline: true } }, { output, onProgress: event => events.push(event) });
  assert.equal(outcome.status, 'reproduced', outcome.summary);
  assert.deepEqual([...new Set(events.map(event => event.stage))], ['inspect', 'capture', 'reproduce', 'reduce', 'confirm', 'test', 'fresh-check', 'write']);
  const markdown = await readFile(outcome.path!, 'utf8');
  assert.equal(markdown, outcome.markdown);
  for (const heading of ['## Summary', '## Expected and observed behavior', '## Steps to reproduce', '## Run the regression test', '## Checking a fix', '## Test files', '## Evidence',
    '### Observed facts', '### Suspected causes (not verified)', '### Verified causes', '## Environment and dependencies', '## Source revision and local changes', '## Limits and missing information'])
    assert.ok(markdown.includes(heading), `missing ${heading}`);
  assert.match(markdown, /\*\*Reproduced\*\* — the failure occurred in 4 of 4 conclusive runs/);
  assert.match(markdown, /`1 task remaining`/);
  assert.match(markdown, /### 2\. Create the test files[\s\S]*### 3\. Install the app’s dependencies[\s\S]*### 4\. Run it/);
  assert.match(markdown, /\*\*Fresh checkout\*\* \| Reproduced: in a clean clone of the commit, the test failed with the same observed result/);
  assert.match(markdown, /Blocked non-local hosts:\*\* \n {2}- `fonts\.googleapis\.com`/);
  for (const canary of CANARIES) assert.equal(markdown.includes(canary), false, `canary ${canary} leaked into REPRO.md`);
  assert.match(markdown, /Redaction: Repro replaced .*email address/);
  // The noise steps are gone; the remaining steps still show the frozen failure.
  const finalSteps = markdown.slice(markdown.indexOf('## Steps to reproduce'), markdown.indexOf('<details><summary>Steps as originally reported'));
  assert.equal(finalSteps.includes('Hover over'), false);
  assert.match(finalSteps, /9\. Uncheck the checkbox "Done: Send invoice"/);
  assert.match(finalSteps, /shortest sequence Repro verified within its search budget: 9 of 11 reported steps.*The expected behavior does not depend on which steps ran/);
  const files = extractReproFiles(markdown);
  assert.deepEqual(files.map(file => [file.path, file.valid]), [['.repro/unchecking-a-task-drops-the-remaining-count.test.mjs', true], ['.repro/package.json', true], ['.repro/package-lock.json', true]]);

  // A recipient: clean clone, the report's own extraction command, the test before and after the controlled fix.
  const recipient = join(root, `recipient-${randomUUID()}`);
  execFileSync('git', ['clone', '-q', app, recipient]);
  await writeFile(join(recipient, 'REPRO.md'), markdown);
  // A recipient's shell: no npm/npx wrapper variables and no outer test-runner context.
  const environment = childEnvironment({ PLAYWRIGHT_BROWSERS_PATH: browsers });
  execFileSync('/bin/sh', ['-c', `${EXTRACTOR} REPRO.md`], { cwd: recipient, env: environment });
  execFileSync('npm', ['ci', '--offline', '--cache', npmCache, '--no-audit', '--no-fund'], { cwd: join(recipient, '.repro'), env: environment });
  const testFile = files[0]!.path;
  const before = spawnSync(process.execPath, ['--test', testFile], { cwd: recipient, env: environment, encoding: 'utf8', timeout: 180_000 });
  assert.equal(before.status, 1, before.stdout + before.stderr);
  assert.match(before.stdout, /REPRO_EXPECTATION_FAILED/);
  assert.match(before.stdout, /This is the failure recorded in REPRO\.md/);
  execFileSync('git', ['apply', resolve('fixtures/local-apps/task-tally/fix.patch')], { cwd: recipient });
  const after = spawnSync(process.execPath, ['--test', testFile], { cwd: recipient, env: environment, encoding: 'utf8', timeout: 180_000 });
  assert.equal(after.status, 0, after.stdout + after.stderr);
  assert.match(after.stdout, /"satisfied":true/);
  // Nothing of Repro's or the app's is left running.
  const leftovers = execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' }).split('\n').filter(line => line.includes(app) || line.includes(recipient));
  assert.deepEqual(leftovers, []);
});

test('behavior that already meets the expectation is reported as not reproduced, and the test passes in the fresh checkout', { timeout: 300_000 }, async () => {
  const app = await repository(true);
  const outcome = await generateReport({ app: { repository: app }, wentWrong: STEPS, shouldHappen: EXPECT, confirmed: true, options: { npmCache, offline: true } }, { output: join(root, `report-${randomUUID()}`) });
  assert.equal(outcome.status, 'not-reproduced', outcome.summary);
  assert.match(outcome.markdown!, /\*\*Not reproduced\*\* — the expected behavior happened in all 4 conclusive runs/);
  assert.match(outcome.markdown!, /Passed: in a clean clone of the commit/);
  assert.match(outcome.markdown!, /Right now the test \*\*passes\*\*/);
});

test('missing essentials are asked for before anything runs, and a cancelled report writes nothing and leaves nothing running', { timeout: 300_000 }, async () => {
  const app = await repository();
  const vague = await generateReport({ app: { repository: app }, wentWrong: 'The counter is wrong after I uncheck something.', shouldHappen: 'It should be correct.', confirmed: true }, { output: join(root, `report-${randomUUID()}`) });
  assert.equal(vague.status, 'needs-input');
  assert.deepEqual(vague.questions.map(question => question.field), ['steps', 'expectation']);
  assert.equal(vague.markdown, null);
  const unconfirmed = await generateReport({ app: { repository: app }, wentWrong: STEPS, shouldHappen: EXPECT, confirmed: false }, { output: join(root, `report-${randomUUID()}`) });
  assert.deepEqual(unconfirmed.questions.map(question => question.field), ['confirm']);
  assert.equal(unconfirmed.understood.checks[0], 'the element `#remaining` text is "3 tasks remaining"');

  const controller = new AbortController();
  const output = join(root, `report-${randomUUID()}`);
  const pending = generateReport({ app: { repository: app }, wentWrong: STEPS, shouldHappen: EXPECT, confirmed: true }, { output, signal: controller.signal,
    onProgress: event => { if (event.stage === 'reproduce') controller.abort(); } });
  const cancelled = await pending;
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.markdown, null);
  assert.equal((await readdir(output)).includes('REPRO.md'), false);
  const leftovers = execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' }).split('\n').filter(line => line.includes(app));
  assert.deepEqual(leftovers, []);
});

test('a step that finds no element asks a readable question with the controls the reporter may mean, or writes a Blocked report on request', { timeout: 300_000 }, async () => {
  const app = await repository();
  const misspelled = 'Open the app\nType "Write report" into "New task"\nClick "Add tsk"';
  const asked = await generateReport({ app: { repository: app }, wentWrong: misspelled, shouldHappen: EXPECT, confirmed: true }, { output: join(root, `report-${randomUUID()}`) });
  assert.equal(asked.status, 'needs-input');
  assert.equal(asked.path, null);
  const question = asked.questions[0]!;
  assert.equal(question.field, 'steps');
  assert.match(question.question, /^Step 3 \(Click "Add tsk"\) could not find its element on the page\. Reword that step with one of the names below/);
  assert.equal(question.candidates?.[0]?.text, 'button “Add task”');

  const blocked = await generateReport({ app: { repository: app }, wentWrong: misspelled, shouldHappen: EXPECT, confirmed: true, options: { reportBlocked: true } }, { output: join(root, `report-${randomUUID()}`) });
  assert.equal(blocked.status, 'blocked');
  const markdown = await readFile(blocked.path!, 'utf8');
  assert.match(markdown, /\*\*Blocked\*\* — Repro could not complete the reported steps: Step 3 \(Click "Add tsk"\) could not find its element on the page\./);
});
