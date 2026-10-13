import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium, type Browser } from 'playwright';
import { createManifest } from '../src/manifest.js';
import { serve } from '../src/server.js';

test('untrusted log and inspector text stays literal without script execution or injected requests', { timeout: 30_000 }, async () => {
  const root = resolve('.repro-runs/ui-security', randomUUID());
  await mkdir(root, { recursive: true });
  let app: Awaited<ReturnType<typeof serve>> | undefined;
  let browser: Browser | undefined;
  let failed = false;
  let primaryFailure: unknown;
  const cleanupFailures: unknown[] = [];
  const summary: Record<string, unknown> = { status: 'started', classification: 'synthetic-malicious-log-fixture', root };
  const payload = 'UI SECURITY SENTINEL <img src="/__repro_xss_probe__" onerror="window.__reproXss = 1"><script>window.__reproXss = 2</script><svg onload="window.__reproXss = 3"></svg>';
  const requests: string[] = [];
  const errors: string[] = [];
  try {
    app = await serve({ port: 0, root: join(root, 'ledger') });
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('request', request => { if (request.url().includes('__repro_xss_probe__')) requests.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { (window as unknown as { __reproXss: number }).__reproXss = 0; });
    // Owned UI fault-injection fixture, not a claim of a recorded target run.
    const session = app.ledger.createSession(createManifest(), true);
    const job = app.ledger.startJob(session.id, 'record', 'ui-security-fixture');
    app.ledger.event(job.id, 'ui-security-sentinel', payload);
    app.ledger.finish(job.id, 'failed', { outcome: 'inconclusive', reason: 'Explicit synthetic malicious-log rendering fixture; no target assertion executed.' });
    await page.goto(`${app.url}/#/sessions/${session.id}/timeline`);
    const row = page.locator('.event-row').filter({ hasText: 'UI SECURITY SENTINEL' });
    await row.click();
    const inspector = page.locator('.codeblock.wrap');
    assert.equal(await inspector.textContent(), payload, 'Inspector preserves exact untrusted text for review');
    assert.equal(await row.locator('.event-message').textContent(), payload);
    assert.equal(await page.locator('main img, main script, main svg').count(), 0, 'Untrusted markup must never become active DOM');
    assert.equal(await page.evaluate(() => (window as unknown as { __reproXss: number }).__reproXss), 0);
    assert.deepEqual(requests, [], 'No request from the injected img may be issued');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(root, 'literal-log-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: join(root, 'literal-log-390.png'), fullPage: true });
    Object.assign(summary, { browser: browser.version(), checks: ['Exact literal text in timeline and inspector', 'No injected markup nodes', 'No sentinel execution', 'No injected HTTP request', 'No page errors', '390px reflow'], limits: 'Tests React rendering of owned persisted text; not arbitrary capsule-code containment.' });
  } catch (error) { failed = true; primaryFailure = error; }
  finally {
    const cleanup = await Promise.allSettled([(async () => { await browser?.close(); })(), (async () => { await app?.close(); })()]);
    for (const result of cleanup) if (result.status === 'rejected') cleanupFailures.push(result.reason);
    summary['status'] = failed || cleanupFailures.length ? 'failed' : 'passed';
    if (failed) summary['failure'] = primaryFailure instanceof Error ? primaryFailure.message : String(primaryFailure);
    summary['cleanupErrors'] = cleanupFailures.map(error => error instanceof Error ? error.message : String(error));
    try { await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2)); }
    catch (error) { cleanupFailures.push(error); }
  }
  if (failed && cleanupFailures.length) throw new AggregateError([primaryFailure, ...cleanupFailures], 'UI security test and cleanup failed', { cause: primaryFailure });
  if (failed) throw primaryFailure;
  if (cleanupFailures.length) throw new AggregateError(cleanupFailures, 'UI security cleanup failed');
});
