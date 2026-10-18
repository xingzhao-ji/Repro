import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateReport } from '../src/report-flow.js';
import { EXTRACTOR, extractReproFiles } from '../src/report-markdown.js';
import { childEnvironment } from '../src/app-process.js';

// End-to-end regressions for the 2026-10-18 foreground review (see evidence/FOREGROUND-REVIEW-0.2.0.md).
const root = resolve('.repro-runs/foreground-review-tests');
const npmCache = resolve('.repro-cache/npm');
const browsers = resolve(process.env['PLAYWRIGHT_BROWSERS_PATH'] ?? '.repro-cache/browsers');
const gitIn = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, encoding: 'utf8' });
async function staticApp(name: string, html: string): Promise<string> {
  const directory = join(root, randomUUID(), name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.html'), html);
  gitIn(directory, 'init', '-q', '-b', 'main'); gitIn(directory, 'add', '.'); gitIn(directory, 'commit', '-qm', name);
  return directory;
}

// "Add to cart" never updates the total; the correct app shows $8.10 for two items.
const cart = (fixed: boolean) => `<!doctype html><title>Cart</title>
<label>Quantity <input id="qty" value="1"></label>
<button type="button" id="add">Add to cart</button>
<p>Total: <output id="total">$0.00</output></p>
<script>
  document.querySelector('#add').addEventListener('click', () => {
    ${fixed ? "document.querySelector('#total').textContent = '$' + (Number(document.querySelector('#qty').value) * 4.05).toFixed(2);" : '/* the bug: the total is never updated */'}
  });
</script>`;

test('A: a negative check that depends on the steps is not shortened, so the exported test passes on the fixed app', { timeout: 600_000 }, async () => {
  const app = await staticApp('cart', cart(false));
  const outcome = await generateReport({ app: { repository: app }, title: 'Adding to the cart leaves the total at zero', confirmed: true,
    wentWrong: 'Open the app\nType "2" into "Quantity"\nClick "Add to cart"\nThe total still says $0.00.',
    shouldHappen: '"#total" should not show "$0.00"', options: { freshCheck: false } }, { output: join(root, `report-${randomUUID()}`) });
  assert.equal(outcome.status, 'reproduced', outcome.summary);
  const markdown = outcome.markdown!;
  const steps = markdown.slice(markdown.indexOf('## Steps to reproduce'), markdown.indexOf('## Run the regression test'));
  assert.match(steps, /Repro did not shorten them/);
  assert.match(steps, /3\. Click the button "Add to cart"/);

  // A recipient follows REPRO.md, sees the failure, applies the correct fix to the app, and the unchanged test passes.
  const recipient = join(root, `recipient-${randomUUID()}`);
  execFileSync('git', ['clone', '-q', app, recipient]);
  await writeFile(join(recipient, 'REPRO.md'), markdown);
  const environment = childEnvironment({ PLAYWRIGHT_BROWSERS_PATH: browsers });
  execFileSync('/bin/sh', ['-c', `${EXTRACTOR} REPRO.md`], { cwd: recipient, env: environment });
  execFileSync('npm', ['ci', '--offline', '--cache', npmCache, '--no-audit', '--no-fund'], { cwd: join(recipient, '.repro'), env: environment });
  const testFile = extractReproFiles(markdown)[0]!.path;
  const before = spawnSync(process.execPath, ['--test', testFile], { cwd: recipient, env: environment, encoding: 'utf8', timeout: 180_000 });
  assert.equal(before.status, 1, before.stdout + before.stderr);
  assert.match(before.stdout, /This is the failure recorded in REPRO\.md/);
  await writeFile(join(recipient, 'index.html'), cart(true));
  const after = spawnSync(process.execPath, ['--test', testFile], { cwd: recipient, env: environment, encoding: 'utf8', timeout: 180_000 });
  assert.equal(after.status, 0, `the unchanged test must pass on the correct app:\n${after.stdout}${after.stderr}`);
});

// A password field whose label does not say so: only its type tells Repro the value is a credential.
const locked = `<!doctype html><title>Vault</title>
<input type="password" placeholder="Enter your code" id="code">
<button type="button" id="unlock">Unlock</button>
<p id="status">Locked</p>`;

test('D: a Blocked report never contains a value typed into a password field, even one Repro recognised only during the run', { timeout: 300_000 }, async () => {
  const app = await staticApp('vault', locked);
  const value = 'Zq7-unlock-9931';
  const request = { app: { repository: app }, title: 'Unlocking fails', confirmed: true,
    wentWrong: `Open the app\nType "${value}" into "Enter your code"\nClick "Unlock now"`, shouldHappen: '"#status" should show "Unlocked"' };
  const asked = await generateReport(request, { output: join(root, `report-${randomUUID()}`) });
  assert.equal(asked.status, 'needs-input');
  assert.match(asked.questions[0]!.question, /^Step 3 \(Click "Unlock now"\) could not find its element/);
  const blocked = await generateReport({ ...request, options: { reportBlocked: true } }, { output: join(root, `report-${randomUUID()}`) });
  assert.equal(blocked.status, 'blocked');
  const markdown = await readFile(blocked.path!, 'utf8');
  assert.equal(markdown.includes(value), false, 'the typed value reached REPRO.md');
  assert.match(markdown, /Type the value of \$REPRO_SECRET_1 into/);
  assert.match(markdown, /`REPRO_SECRET_1`: the value typed into/);
});
