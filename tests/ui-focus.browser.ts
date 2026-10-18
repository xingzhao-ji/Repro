import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium, type Locator } from 'playwright';
import { serve } from '../src/server.js';
import { createManifest } from '../src/manifest.js';

function contrast(first: string, second: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(value => Number(value) / 255);
    assert.equal(channels?.length, 3, `Expected computed RGB color, got ${color}`);
    const linear = channels!.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1]! + 0.05) / (values[0]! + 0.05);
}

test('keyboard focus remains distinguishable on the dark sidebar and light workspace', { timeout: 30_000 }, async () => {
  const root = resolve('.repro-runs/ui-focus', randomUUID());
  await mkdir(root, { recursive: true });
  const app = await serve({ port: 0, root: join(root, 'ledger') });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const samples: unknown[] = [];
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const session = app.ledger.createSession(createManifest(), true);
    await page.goto(`${app.url}/#/sessions/${session.id}/overview`);
    await page.getByRole('heading', { name: 'Older response replaces the latest search' }).waitFor();
    async function sample(name: string, target: Locator) {
      // Walk the actual tab order. A programmatic focus alone does not establish
      // that the keyboard-visible indicator is rendered.
      for (let count = 0; count < 30; count++) {
        await page.keyboard.press('Tab');
        if (await target.evaluate(element => element === document.activeElement)) break;
      }
      assert.equal(await target.evaluate(element => element === document.activeElement), true, `${name} must be keyboard reachable`);
      const colors = await target.evaluate(element => {
        let parent = element.parentElement;
        while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
        const style = getComputedStyle(element);
        return { outline: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth, background: parent ? getComputedStyle(parent).backgroundColor : '', focusVisible: element.matches(':focus-visible') };
      });
      const ratio = contrast(colors.outline, colors.background);
      samples.push({ name, ...colors, ratio });
      await page.screenshot({ path: join(root, `${name}.png`), fullPage: true });
      await writeFile(join(root, 'samples.json'), JSON.stringify(samples, null, 2));
      assert.equal(colors.focusVisible, true);
      assert.equal(colors.style, 'solid');
      assert.ok(Number.parseFloat(colors.width) >= 2);
      assert.ok(ratio >= 3, `${name} focus indicator contrast must be at least 3:1 against its surrounding background; observed ${ratio.toFixed(2)}:1`);
    }
    await sample('brand', page.getByRole('link', { name: 'Repro new capture' }));
    await sample('current-section', page.getByRole('link', { name: 'Overview', exact: true }));
    await sample('other-section', page.getByRole('link', { name: 'Event timeline', exact: true }));
    await sample('workspace-task', page.getByRole('link', { name: 'Establish failure', exact: true }));
  } finally {
    await browser?.close();
    await app.close();
  }
});

test('starting capture moves keyboard focus into the new evidence workspace', { timeout: 30_000 }, async () => {
  const root = resolve('.repro-runs/ui-focus', `capture-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  const app = await serve({ port: 0, root: join(root, 'ledger') });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage();
    await page.goto(`${app.url}/#/new`);
    await page.getByRole('checkbox').waitFor();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('combobox', { name: 'Expectation input', exact: true }).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('checkbox').evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Start synthetic capture', exact: true }).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector<HTMLSelectElement>('#job')?.selectedOptions[0]?.textContent?.startsWith('record · complete ·'));
    const job = app.ledger.getJob(await page.locator('#job').inputValue());
    assert.equal((job.result as { outcome: string }).outcome, 'target-failure');
    const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id }));
    await writeFile(join(root, 'capture-focus.json'), JSON.stringify({ jobId: job.id, focus }, null, 2));
    assert.equal(focus.id, 'main', 'Capture replaces the focused submit button; focus must continue inside its new evidence workspace');
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('link', { name: 'Establish failure', exact: true }).evaluate(element => element === document.activeElement), true, 'The next Tab should reach the first evidence task without restarting sidebar navigation');
    await page.screenshot({ path: join(root, 'first-evidence-task-focused.png'), fullPage: true });
  } finally {
    await browser?.close();
    await app.close();
  }
});
