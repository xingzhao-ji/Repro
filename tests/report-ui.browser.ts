import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium, type Page } from 'playwright';
import { serve } from '../src/server.js';

const npmCache = resolve('.repro-cache/npm');
const gitIn = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, encoding: 'utf8' });
async function repository(root: string): Promise<string> {
  const directory = join(root, 'apps', 'task-tally');
  await mkdir(directory, { recursive: true });
  await cp('fixtures/local-apps/task-tally', directory, { recursive: true });
  await rm(join(directory, 'fix.patch'));
  gitIn(directory, 'init', '-q', '-b', 'main'); gitIn(directory, 'add', '.'); gitIn(directory, 'commit', '-qm', 'Task tally');
  return directory;
}
async function noOverflow(page: Page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'the page reflows without horizontal overflow');
}
const STEPS = 'Open the app\nType "Write report" into "New task"\nClick "Add task"\nType "Send invoice" into "New task"\nPress Enter\nCheck "Done: Send invoice"\nUncheck "Done: Send invoice"\nThe counter says "0 tasks remaining".';

test('the one-page flow: app folder and description in, progress and cancellation, then a REPRO.md preview and download', { timeout: 600_000 }, async () => {
  const root = resolve('.repro-runs', 'report-ui', `ui-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  const folder = await repository(root);
  const app = await serve({ port: 0, root: join(root, 'ledger'), reportDefaults: { npmCache, offline: true, budget: 20 } });
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const shot = async (name: string) => { await noOverflow(page); await page.screenshot({ path: join(root, `${name}.png`), fullPage: true }); };
  try {
    await page.goto(app.url);
    await page.getByRole('heading', { name: 'Turn a bug into one REPRO.md' }).waitFor();
    const generate = page.getByRole('button', { name: 'Generate report' });
    assert.equal(await generate.isDisabled(), true, 'nothing can run before the essentials exist');
    await page.getByRole('link', { name: 'Built-in examples' }).waitFor();
    await shot('01-empty');

    await page.getByLabel('App folder').fill(folder);
    await page.getByText('Starts with').waitFor();
    assert.match(await page.locator('.facts').innerText(), /npm run start[\s\S]*Git commit [a-f0-9]{10} on main/);
    await page.getByLabel('What went wrong?').fill(STEPS);
    await page.getByLabel('What should happen?').fill('"Tasks left" should show "2 tasks remaining"');
    const understood = page.locator('.understood');
    await understood.getByText('Type "Write report" into "New task"').waitFor();
    assert.match(await understood.innerText(), /Uncheck "Done: Send invoice"[\s\S]*It will check that:[\s\S]*"Tasks left" text is "2 tasks remaining"/);
    assert.match(await understood.innerText(), /Kept as your notes: “The counter says "0 tasks remaining"”/);
    assert.match(await page.locator('.scope').innerText(), /Run npm run start in [\s\S]*block every request to a host other than this machine[\s\S]*Nothing is uploaded/);
    assert.equal(await page.locator('.scope code', { hasText: 'npm run start' }).count(), 1, 'commands are shown as code');
    assert.equal(await generate.isDisabled(), false);
    await generate.click();
    await page.getByText('Confirm what Repro will run, then generate the report.').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'checkbox', 'focus moves to the missing confirmation');
    await shot('02-filled');

    // "Tasks left" matches no element: Repro asks which one, offering what it saw on the page.
    await page.getByLabel('The steps and checks above are right').check();
    await generate.click();
    await page.waitForURL(/#\/reports\//);
    await page.locator('.stages').getByText('Checking your app').waitFor();
    await shot('03-progress');
    await page.locator('.badge.large', { hasText: 'Needs your input' }).waitFor({ timeout: 120_000 });
    await page.getByText('Repro could not tell which element').waitFor();
    await shot('04-needs-input');
    await page.getByRole('radio', { name: /#remaining/ }).check();
    await page.getByRole('button', { name: 'Use this element and try again' }).click();
    await page.getByRole('heading', { name: 'Turn a bug into one REPRO.md' }).waitFor();
    assert.equal(await page.getByLabel('What went wrong?').inputValue(), STEPS, 'the description is restored for the retry');
    await page.getByText('Starts with').waitFor();
    await page.locator('.understood').getByText('(the element you chose)').waitFor();
    await page.getByLabel('The steps and checks above are right').check();
    await page.getByRole('button', { name: 'Generate report' }).click();
    await page.waitForURL(/#\/reports\//);
    const reportUrl = page.url();
    await page.locator('.badge.large', { hasText: 'Reproduced' }).waitFor({ timeout: 420_000 });
    await page.getByRole('link', { name: 'Download REPRO.md' }).waitFor();
    const preview = page.locator('.markdown-preview');
    for (const heading of ['Summary', 'Expected and observed behavior', 'Steps to reproduce', 'Run the regression test', 'Checking a fix', 'Test files', 'Evidence'])
      await preview.getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.match(await page.locator('.result-summary').innerText(), /^Reproduced: the failure occurred/);
    // "X should show Y" depends on the steps, so Repro does not shorten them and says why.
    await preview.getByText(/Repro did not shorten them: the expected value can depend on every step/).waitFor();
    // The chosen element keeps the reporter's own name in the report.
    await preview.locator('p', { hasText: /After the steps below, Repro expected that "Tasks left" \(the element #remaining the reporter chose for it\) text is "2 tasks remaining", but observed/ }).waitFor();
    await shot('05-result');
    const download = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download REPRO.md' }).click()]).then(([item]) => item);
    assert.equal(download.suggestedFilename(), 'REPRO.md');
    await page.getByRole('button', { name: 'Markdown' }).click();
    assert.match(await page.locator('.markdown-source').innerText(), /```js repro-file=\.repro\//);
    // Refresh reconnects to the persisted result.
    await page.reload();
    await page.locator('.badge.large', { hasText: 'Reproduced' }).waitFor();
    assert.equal(page.url(), reportUrl);
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('06-result-mobile');

    // Cancellation from the page stops the report and writes nothing.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${app.url}/#/`);
    await page.getByLabel('App folder').fill(folder);
    await page.getByLabel('What went wrong?').fill(STEPS);
    await page.getByLabel('What should happen?').fill('"#remaining" should show "2 tasks remaining"');
    await page.getByText('Starts with').waitFor();
    await page.getByLabel('The steps and checks above are right').check();
    await page.getByRole('button', { name: 'Generate report' }).click();
    await page.waitForURL(/#\/reports\//);
    await page.locator('.live').getByText(/Reproducing from a fresh start \(run 1 of 3\)/).waitFor({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('.badge.large', { hasText: 'Cancelled' }).waitFor({ timeout: 60_000 });
    assert.match(await page.locator('.result-summary').innerText(), /No report was written/);
    assert.equal(await page.getByRole('link', { name: 'Download REPRO.md' }).count(), 0);
    await shot('07-cancelled');
    const leftovers = execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' }).split('\n').filter(line => line.includes(folder));
    assert.deepEqual(leftovers, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await app.close();
  }
});
