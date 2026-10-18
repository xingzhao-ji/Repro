import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { serve } from '../src/server.js';
import { createManifest } from '../src/manifest.js';

test('independent UI review: keyboard consent, automated accessibility, reflow, and service restart recovery', { timeout: 180_000 }, async () => {
  const root = resolve('.repro-runs/ui-review', randomUUID());
  await mkdir(root, { recursive: true });
  let app = await serve({ port: 0, root: join(root, 'ledger') });
  let appClosed = false;
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const reports: unknown[] = [];
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  async function audit(state: string, activePage: Page = page) {
    const result = await new AxeBuilder({ page: activePage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    reports.push({ state, violations: result.violations, incomplete: result.incomplete });
    await writeFile(join(root, 'accessibility.json'), JSON.stringify(reports, null, 2));
    await activePage.screenshot({ path: join(root, `${state}.png`), fullPage: true });
    assert.deepEqual(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), [], `Accessibility violations in ${state}`);
    assert.deepEqual(result.incomplete.filter(item => item.id === 'aria-prohibited-attr').map(item => item.nodes.map(node => node.target)), [], `Unsupported ARIA labeling requires repair in ${state}`);
    assert.equal(await activePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Global horizontal overflow in ${state}`);
  }
  async function terminal(operation: string) {
    await page.waitForFunction(value => {
      const selected = document.querySelector<HTMLSelectElement>('#job')?.selectedOptions[0]?.textContent ?? '';
      return selected.startsWith(`${value} · `) && !selected.includes('· running ·');
    }, operation, { timeout: 60_000 });
    return app.ledger.getJob(await page.locator('#job').inputValue());
  }
  try {
    await page.goto(`${app.url}/#/new`);
    await page.getByRole('checkbox').waitFor();
    await audit('empty-desktop');
    assert.equal(await page.getByRole('button', { name: 'Start synthetic capture', exact: true }).isDisabled(), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Skip to evidence');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('combobox', { name: 'Expectation input', exact: true }).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement).type), 'checkbox');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Start synthetic capture');
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle), 'solid');
    await page.keyboard.press('Enter');
    const captured = await terminal('record');
    assert.equal((captured.result as { outcome: string }).outcome, 'target-failure');
    await audit('timeline-desktop');
    await page.getByRole('link', { name: 'Compare evidence' }).click();
    await page.getByRole('button', { name: 'Verify fixed revision', exact: true }).click();
    const verified = await terminal('verify');
    assert.equal((verified.result as { outcome: string }).outcome, 'requirement-satisfied');
    await page.getByRole('heading', { name: 'Candidate · fixed' }).waitFor();
    await audit('comparison-desktop');
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await audit(`comparison-${width}`);
    }
    // A service restart rotates the request token. Existing persisted evidence
    // must remain inspectable, and the explicit reconnect action must restore writes.
    await page.setViewportSize({ width: 1440, height: 900 });
    const url = app.url; const port = Number(new URL(url).port);
    await app.close(); appClosed = true;
    await page.getByRole('alert').waitFor({ timeout: 10_000 });
    assert.equal(await page.getByRole('heading', { name: 'Candidate · fixed' }).count(), 1);
    await audit('disconnected-evidence');
    app = await serve({ port, root: join(root, 'ledger') }); appClosed = false;
    await page.getByRole('button', { name: 'Reconnect & refresh evidence' }).click();
    await page.getByRole('alert').waitFor({ state: 'hidden', timeout: 10_000 });
    const count = app.ledger.jobs(captured.sessionId).length;
    await page.getByRole('button', { name: 'Replay', exact: true }).click();
    const replayed = await terminal('replay');
    assert.equal((replayed.result as { outcome: string }).outcome, 'target-failure');
    assert.equal(app.ledger.jobs(captured.sessionId).length, count + 1);
    await audit('reconnected-timeline');
    assert.deepEqual(errors, []);
    await writeFile(join(root, 'summary.json'), JSON.stringify({ outcome: 'passed', browser: browser.version(), platform: process.platform, root, checks: ['Keyboard-only initial capture', 'Observed buggy/fixed browser evidence', 'Axe WCAG-tagged checks with incomplete checks recorded', 'Desktop/768/390/320 layout bounds', 'Persisted evidence while disconnected', 'Service restart and request-token renewal', 'Post-reconnect real replay'], limitations: ['Automated axe plus keyboard inspection is not a full WCAG conformance or screen-reader usability audit.', 'Native zoom is outside this suite; a separately denied CUA navigation is preserved and must not be bypassed.'] }, null, 2));
  } finally { await browser.close(); if (!appClosed) await app.close(); }
});

test('independent UI review: corrupt trial evidence is visible and cannot crash the workbench', { timeout: 45_000 }, async () => {
  const root = resolve('.repro-runs/ui-review', `corrupt-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  const app = await serve({ port: 0, root: join(root, 'ledger') });
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
  const page = await browser.newPage();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    for (const [name, message] of [['truncated-json', '{"index":0'], ['missing-trial-fields', '{"index":0}']] as const) {
      // Fault injection into an owned ledger; these are explicitly synthetic UI
      // recovery fixtures and do not represent actual reduction measurements.
      const session = app.ledger.createSession(createManifest(), true);
      const job = app.ledger.startJob(session.id, 'reduce', `review-${name}`);
      app.ledger.event(job.id, 'trial', message);
      await page.goto(`${app.url}/#/sessions/${session.id}/reduction`);
      await page.getByRole('heading', { name: 'Reduction history', exact: true }).waitFor();
      await page.screenshot({ path: join(root, `${name}.png`), fullPage: true });
      assert.equal(await page.getByRole('alert').count(), 1, 'Unreadable persisted trial evidence needs an explicit alert');
      assert.match(await page.getByRole('alert').innerText(), /trial|evidence/i);
      assert.deepEqual(errors, [], 'Corrupt evidence must not cause a render exception');
      app.ledger.finish(job.id, 'failed', { outcome: 'inconclusive', reason: 'Explicit synthetic corrupt-ledger UI review fixture.' });
    }
  } finally { await browser.close(); await app.close(); }
});
