import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium, type Page } from 'playwright';
import { serve } from '../src/server.js';

async function noOverflow(page: Page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Document must reflow without global horizontal overflow');
}

test('real workbench capture, reduction, comparison, export, recovery and responsive evidence', { timeout: 240_000 }, async () => {
  const root = resolve('.repro-runs', 'ui', `browser-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  const app = await serve({ port: 0, root: join(root, 'ledger') });
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [], shots: { file: string; width: number; height: number; section: string; zoom: string }[] = [];
  page.on('pageerror', error => errors.push(error.message));
  async function capture(name: string, section: string, zoom = '100%') {
    await noOverflow(page);
    await page.evaluate(() => { scrollTo(0, 0); });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const file = join(root, `${name}.png`); await page.screenshot({ path: file, fullPage: true });
    shots.push({ file, ...page.viewportSize()!, section, zoom });
  }
  async function terminal(operation: string) {
    await page.waitForFunction(op => {
      const select = document.querySelector<HTMLSelectElement>('#job');
      const current = select?.selectedOptions[0]?.textContent ?? '';
      return current.startsWith(`${op} · `) && !current.includes('· running ·');
    }, operation, { timeout: 150_000 });
    const jobId = await page.locator('#job').inputValue();
    return app.ledger.getJob(jobId);
  }
  try {
    await page.goto(app.url);
    const start = page.getByRole('button', { name: 'Start synthetic capture', exact: true });
    await start.waitFor(); assert.equal(await start.isDisabled(), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Skip to evidence');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('main').evaluate(element => element === document.activeElement), true);
    await capture('empty-desktop', 'new capture');
    const consent = page.getByRole('checkbox', { name: 'I consent to this scripted synthetic capture in a fresh browser profile.' });
    await consent.focus(); await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    assert.equal(await start.evaluate(element => element === document.activeElement), true);
    assert.equal(await start.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
    await page.keyboard.press('Enter');
    const captured = await terminal('record');
    assert.equal((captured.result as { outcome: string }).outcome, 'target-failure');
    assert.equal(app.ledger.sessions().length, 1);
    const sessionId = captured.sessionId;
    await page.getByRole('heading', { name: 'Event timeline', exact: true }).waitFor();
    assert.ok(await page.locator('.timeline li').count() > 0);
    await page.locator('.event-row').first().click();
    await page.getByText('Sequence 1', { exact: true }).waitFor();
    await capture('timeline-desktop', 'timeline');
    await page.getByRole('link', { name: 'Overview', exact: false }).click();
    await page.getByRole('heading', { name: 'Frozen expectation' }).waitFor();
    await capture('overview-desktop', 'overview');
    await page.getByRole('link', { name: 'Dependencies', exact: false }).click();
    await page.getByRole('heading', { name: 'Current capsule dependencies' }).waitFor();
    const dependencyUrl = page.url();
    await page.reload(); await page.getByRole('heading', { name: 'Current capsule dependencies' }).waitFor();
    assert.equal(page.url(), dependencyUrl);
    await page.goBack(); await page.getByRole('heading', { name: 'Frozen expectation' }).waitFor();
    await page.goForward(); await page.getByRole('heading', { name: 'Current capsule dependencies' }).waitFor();
    await capture('dependencies-desktop', 'dependencies');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('dependencies-390', 'dependencies');
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByRole('button', { name: 'Reduce', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel active run', exact: true }).waitFor();
    await capture('reduction-active-desktop', 'active reduction');
    const reduced = await terminal('reduce');
    assert.equal((reduced.result as { manifest: { actions: unknown[] } }).manifest.actions.length, 3);
    assert.ok(await page.getByRole('table').count());
    await capture('reduction-desktop', 'reduction');
    await page.getByRole('button', { name: 'Verify fixed revision', exact: true }).click();
    const verified = await terminal('verify');
    assert.equal((verified.result as { outcome: string }).outcome, 'requirement-satisfied');
    await page.getByRole('heading', { name: 'Original · buggy' }).waitFor();
    await page.getByRole('heading', { name: 'Candidate · fixed' }).waitFor();
    await capture('comparison-desktop', 'comparison');
    await page.getByText('Inspect identity and artifacts', { exact: true }).first().click();
    await capture('identity-expanded-desktop', 'expanded identity and artifacts');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('identity-expanded-390', 'expanded identity and artifacts');
    await page.getByText('Inspect identity and artifacts', { exact: true }).first().click();

    for (const [width, height] of [[1024, 768], [768, 1024], [390, 844], [320, 844]] as const) {
      await page.setViewportSize({ width, height });
      await capture(`comparison-${width}`, 'comparison');
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await capture('comparison-zoom-200', 'comparison', '200% CSS layout zoom');
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await page.getByRole('button', { name: 'Export capsule', exact: true }).click();
    const exported = await terminal('export');
    assert.equal(typeof (exported.result as { path: string }).path, 'string');
    await page.getByText('Saved directory', { exact: true }).waitFor();
    assert.equal(await page.getByText('Files validated', { exact: true }).count(), 1);
    await capture('export-desktop', 'export');

    const beforeReplay = app.ledger.jobs(sessionId).length;
    await page.getByRole('button', { name: 'Replay', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await terminal('replay');
    assert.equal(app.ledger.jobs(sessionId).length, beforeReplay + 1, 'Repeated synchronous clicks create exactly one job');
    await page.getByRole('button', { name: 'Reduce', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel active run', exact: true }).click();
    const cancelled = await terminal('reduce');
    assert.equal(cancelled.status, 'cancelled');
    await capture('cancelled-desktop', 'reduction');
    assert.equal(app.ledger.getSession(sessionId).manifest.actions.length, 3);

    await page.goto(`${app.url}/#/sessions/missing-session/overview`);
    await page.getByRole('alert').waitFor();
    await capture('missing-session-error', 'error');
    await page.locator('#session').selectOption(sessionId);
    await page.getByRole('heading', { name: 'Frozen expectation' }).waitFor();
    await page.getByRole('button', { name: 'Replay', exact: true }).click();
    await terminal('replay');
    const populated = app.ledger.jobs(sessionId)[0]!;
    for (let index = 0; index < 105; index++) app.ledger.event(populated.id, 'ui-qa-long-event', `UI QA event ${index}: ${'long-identifier-'.repeat(12)}`);
    await page.waitForFunction(() => (document.querySelectorAll('.timeline li').length > 100));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('searchbox', { name: 'Filter events' }).fill('UI QA event 104');
    assert.equal(await page.locator('.timeline li').count(), 1);
    await page.locator('.event-row').click();
    await capture('long-event-mobile', 'timeline with explicitly labeled QA events');
    const semantic = await page.locator('main').ariaSnapshot();
    assert.match(semantic, /heading.*Event timeline/);
    assert.match(semantic, /searchbox "Filter events"/);
    await writeFile(join(root, 'accessibility-tree.txt'), semantic);
    assert.deepEqual(errors, []);
    await writeFile(join(root, 'screenshots.json'), JSON.stringify({ screenshots: shots, runtime: process.version, browser: browser.version(), notes: ['QA-added timeline events are labeled UI QA. Screenshot files require independent visual review.', '200% sampling uses CSS layout zoom; no screen-reader usability or full WCAG conformance claim.'] }, null, 2));
  } finally { await browser.close(); await app.close(); }
});
