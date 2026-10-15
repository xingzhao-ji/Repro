import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { chromium, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { loadProjectedCase, renderCondition, assertFactParity, type FrozenFact } from '../scripts/hci-fidelity.js';

async function tabTo(page: Page, selector: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (await page.locator(selector).evaluate(el => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  assert.fail(`Keyboard could not reach ${selector}`);
}

test('frozen P/L contain identical accessible evidence and support keyboard inspection and unavailable-record recovery', { timeout: 60_000 }, async () => {
  const root = resolve('.repro-runs/hci-fidelity', `browser-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  const value = await loadProjectedCase();
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const summary: Record<string, unknown> = { classification: 'synthetic-technical-fidelity', status: 'started', browser: browser.version(), participantSessions: 0 };
  const observations: unknown[] = [];
  try {
    for (const condition of ['P', 'L'] as const) {
      const file = join(root, `${condition}.html`);
      await writeFile(file, renderCondition(value, condition));
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const external: string[] = [], errors: string[] = [];
      page.on('request', request => { if (!request.url().startsWith('file:')) external.push(request.url()); });
      page.on('pageerror', error => errors.push(error.message));
      await page.route(/^https?:/, route => route.abort());
      await page.goto(pathToFileURL(file).href);
      const facts: FrozenFact[] = await page.locator('[data-fact]').evaluateAll(elements => elements.map(el => ({
        id: el.getAttribute('data-id')!, recordId: el.getAttribute('data-record')!, section: el.getAttribute('data-section')!,
        label: el.querySelector('[data-label]')!.textContent!, text: el.querySelector('[data-value]')!.textContent!,
        source: { fileId: el.getAttribute('data-file')!, pointer: el.getAttribute('data-pointer')! }
      })));
      assertFactParity(value.facts, facts);
      await page.screenshot({ path: join(root, `${condition}-initial-1440.png`) });
      await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'evidence');
      await tabTo(page, '#search'); await page.keyboard.type('completion order');
      assert.equal(await page.locator('[data-fact]:visible').count(), 1);
      assert.match(await page.locator('[data-fact]:visible').innerText(), /2.*1/);
      await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace');
      const reduce = value.records.find(r => r.name === 'reduction')!;
      await tabTo(page, `nav a[href="#${reduce.id}"]`); await page.keyboard.press('Enter');
      await page.locator(`[data-panel="${reduce.id}"]`).waitFor({ state: 'visible' });
      if (condition === 'P') {
        await tabTo(page, '[data-panel]:visible details[data-group="reduction"] summary'); await page.keyboard.press('Space');
      }
      assert.match(await page.locator('#evidence').innerText(), /Minimality: unverified/);
      await tabTo(page, '#search'); await page.keyboard.type('repetition');
      assert.ok(await page.locator('[data-fact]:visible').count() > 0);
      await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace');
      await page.screenshot({ path: join(root, `${condition}-reduction-1440.png`), fullPage: true });
      await page.screenshot({ path: join(root, `${condition}-viewport-1440.png`) });
      const audits: unknown[] = [];
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        assert.deepEqual(axe.violations.map(v => v.id), []);
        audits.push({ width, violations: axe.violations, incomplete: axe.incomplete.map(v => v.id) });
        if (width === 390) { await page.screenshot({ path: join(root, `${condition}-reduction-390.png`), fullPage: true }); await page.screenshot({ path: join(root, `${condition}-viewport-390.png`) }); }
      }
      for (const name of ['comparison', 'cancelled', 'record', 'export']) {
        const record = value.records.find(r => r.name === name)!;
        await tabTo(page, `nav a[href="#${record.id}"]`); await page.keyboard.press('Enter');
        await page.locator(`[data-panel="${record.id}"]`).waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-panel]:visible').getAttribute('data-panel'), record.id);
        if (name === 'comparison') { await page.goBack(); await page.locator(`[data-panel="${reduce.id}"]`).waitFor({ state: 'visible' }); await page.goForward(); await page.locator(`[data-panel="${record.id}"]`).waitFor({ state: 'visible' }); }
        await page.reload();
        if (condition === 'P') {
          for (const section of new Set(value.facts.filter(f => f.recordId === record.id).map(f => f.section))) {
            const details = `[data-panel="${record.id}"] details[data-group="${section}"]`;
            if (!await page.locator(details).evaluate(el => (el as HTMLDetailsElement).open)) { await tabTo(page, details + ' > summary'); await page.keyboard.press('Space'); }
          }
        }
        assert.equal(await page.locator('[data-panel]:visible [data-fact]:visible').count(), value.facts.filter(f => f.recordId === record.id).length);
        assert.equal(await page.locator('[data-panel]:visible').getAttribute('data-panel'), record.id);
      }
      await page.evaluate(() => { location.hash = 'unknown-record'; });
      await page.getByRole('heading', { name: 'INCONCLUSIVE: record unavailable' }).waitFor();
      await tabTo(page, '#recover'); await page.keyboard.press('Enter');
      await page.locator(`[data-panel="${value.records[0]!.id}"]`).waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-panel]:visible').getAttribute('data-panel'), value.records[0]!.id);
      assert.deepEqual(external, []); assert.deepEqual(errors, []);
      observations.push({ condition, accessibleFacts: facts.length, audits, externalRequests: external, pageErrors: errors, keyboardRecovery: 'passed' });
      await context.close();
    }
    summary['status'] = 'passed';
  } catch (error) { summary['status'] = 'failed'; summary['error'] = error instanceof Error ? error.message : 'Unknown error'; throw error; }
  finally { await browser.close(); summary['observations'] = observations; await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2)); }
});
