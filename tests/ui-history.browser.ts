import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import type { RunResult, ReductionResult } from '../src/contracts.js';
import type { Job, Operation } from '../src/ledger.js';
import { serve } from '../src/server.js';

test('historical Evidence run selection identifies the exact job across evidence views', { timeout: 180_000 }, async () => {
  const root = resolve('.repro-runs/ui-history', randomUUID());
  await mkdir(root, { recursive: true });
  let app: Awaited<ReturnType<typeof serve>> | undefined;
  let browser: Browser | undefined;
  let page: Page;
  let failed = false;
  let primaryFailure: unknown;
  const cleanupFailures: unknown[] = [];
  const summary: Record<string, unknown> = { status: 'started', root, classification: 'actual-registered-synthetic-browser-runs' };
  const errors: string[] = [];
  const checks: { name: string; expected: unknown; actual: unknown; passed: boolean }[] = [];
  function check(name: string, actual: unknown, expected: unknown) {
    checks.push({ name, actual, expected, passed: JSON.stringify(actual) === JSON.stringify(expected) });
  }
  async function terminal(operation: Operation, previous = ''): Promise<Job> {
    await page.waitForFunction(({ operation, previous }) => {
      const select = document.querySelector<HTMLSelectElement>('#job');
      const label = select?.selectedOptions[0]?.textContent ?? '';
      return select?.value !== previous && label.startsWith(`${operation} · `) && !label.includes('· running ·');
    }, { operation, previous }, { timeout: 130_000 });
    assert.ok(app);
    return app.ledger.getJob(await page.locator('#job').inputValue());
  }
  async function perform(operation: Operation, button: string) {
    const previous = await page.locator('#job').inputValue();
    await page.getByRole('button', { name: button, exact: true }).click();
    return terminal(operation, previous);
  }
  async function select(job: Job) {
    const fetched = page.waitForResponse(response => response.url().endsWith(`/api/jobs/${job.id}`) && response.status() === 200);
    await page.locator('#job').selectOption(job.id);
    await fetched;
    await page.waitForFunction(id => document.querySelector<HTMLSelectElement>('#job')?.value === id && !document.querySelector('.loading'), job.id);
  }
  async function section(name: string) {
    const fetched = page.waitForResponse(response => response.url().includes('/api/jobs/') && response.status() === 200);
    await page.getByRole('link', { name, exact: false }).click();
    await fetched;
    await page.waitForFunction(() => !document.querySelector('.loading') && !!document.querySelector('#job'));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  async function shot(name: string) {
    await page.screenshot({ path: join(root, `${name}.png`), fullPage: true });
  }
  try {
    app = await serve({ port: 0, root: join(root, 'ledger') });
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${app.url}/#/new`);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Start synthetic capture', exact: true }).click();
    const captured = await terminal('record');
    assert.equal((captured.result as RunResult).outcome, 'target-failure');
    const reduced = await perform('reduce', 'Reduce');
    assert.equal((reduced.result as ReductionResult).manifest.actions.length, 3);
    const verified = await perform('verify', 'Verify fixed revision');
    assert.equal((verified.result as { outcome: string }).outcome, 'requirement-satisfied');
    const exported = await perform('export', 'Export capsule');
    const laterVerified = await perform('verify', 'Verify fixed revision');
    const laterExported = await perform('export', 'Export capsule');
    const replayed = await perform('replay', 'Replay');
    assert.equal((replayed.result as RunResult).outcome, 'target-failure');

    await select(captured);
    const expectedEvents = app.ledger.events(captured.id);
    check('Historical timeline contains exactly the selected recorded event types', await page.locator('.event-row strong').allTextContents(), expectedEvents.map(event => event.type));
    check('Historical timeline contains exactly the selected recorded event messages', await page.locator('.event-row .event-message').allTextContents(), expectedEvents.map(event => event.message));
    await shot('historical-record-timeline');

    await page.reload();
    await page.getByRole('heading', { name: 'Event timeline', exact: true }).waitFor();
    check('Refresh restores the selected historical job', await page.locator('#job').inputValue(), captured.id);
    await select(captured);

    await section('Reduction history');
    check('Section navigation retains the selected historical job', await page.locator('#job').inputValue(), captured.id);
    await page.goBack();
    await page.getByRole('heading', { name: 'Event timeline', exact: true }).waitFor();
    check('Back navigation restores historical timeline selection', await page.locator('#job').inputValue(), captured.id);
    await page.goForward();
    await page.getByRole('heading', { name: 'Reduction history', exact: true }).waitFor();
    check('Forward navigation restores historical reduction-view selection', await page.locator('#job').inputValue(), captured.id);
    await select(reduced);
    check('Historical reduction displays its own complete trial count', await page.locator('.table-scroll tbody tr').count(), (reduced.result as ReductionResult).trials.length);
    await shot('historical-reduction');
    await select(captured);
    check('Record selection cannot silently display another job reduction trials', await page.locator('.table-scroll tbody tr').count(), 0);
    check('Non-matching reduction view explains the selected run has no evidence', await page.locator('.panel-body').innerText().then(value => /selected record run has no reduction evidence/i.test(value)), true);
    await shot('record-selected-reduction');

    await section('Compare evidence');
    await select(verified);
    const verification = verified.result as { original: RunResult; candidate: RunResult };
    check('Historical comparison shows its selected original run', await page.locator('.run-evidence').first().innerText().then(value => value.includes(verification.original.id)), true);
    check('Historical comparison shows its selected candidate run', await page.locator('.run-evidence').last().innerText().then(value => value.includes(verification.candidate.id)), true);
    const later = laterVerified.result as { original: RunResult; candidate: RunResult };
    check('Historical comparison does not silently switch to latest matching verification', await page.locator('.comparison').innerText().then(value => value.includes(later.original.id) || value.includes(later.candidate.id)), false);
    await shot('historical-comparison');
    await select(captured);
    check('Record selection cannot silently display another job comparison verdict', await page.locator('.comparison-verdict').count(), 0);
    check('Non-matching comparison view explains the selected run has no evidence', await page.locator('.panel-body').innerText().then(value => /selected record run has no comparison evidence/i.test(value)), true);
    await shot('record-selected-comparison');

    await section('Local export');
    await select(exported);
    const exportedPath = (exported.result as { path: string }).path;
    const latestExportPath = (laterExported.result as { path: string }).path;
    check('Historical export shows its own saved directory', await page.locator('.panel-body').innerText().then(value => value.includes(exportedPath)), true);
    check('Historical export does not silently switch to latest matching export', await page.locator('.panel-body').innerText().then(value => value.includes(latestExportPath)), false);
    await shot('historical-export');
    await select(captured);
    check('Record selection cannot silently display another job export directory', await page.getByText('Saved directory', { exact: true }).count(), 0);
    check('Non-matching export view explains the selected run has no evidence', await page.locator('.panel-body').innerText().then(value => /selected record run has no export evidence/i.test(value)), true);
    await shot('record-selected-export');
    await page.goto(`${app.url}/#/sessions/${captured.sessionId}/comparison?run=missing-historical-run`);
    await page.waitForResponse(response => response.url().endsWith('/api/sessions') && response.status() === 200);
    await page.waitForFunction(() => !document.querySelector('.loading'));
    check('Unknown explicit evidence run gives a visible error', await page.getByRole('alert').count(), 1);
    check('Unknown explicit evidence run cannot display another job comparison', await page.locator('.comparison-verdict').count(), 0);
    await shot('unknown-explicit-run');
    await select(captured);
    check('Unknown run can recover by selecting a valid historical run', await page.getByRole('alert').count(), 0);
    await section('Event timeline');
    check('Recovery restores exactly the chosen historical timeline', await page.locator('.event-row .event-message').allTextContents(), expectedEvents.map(event => event.message));
    await shot('unknown-run-recovered-timeline');
    check('No page errors', errors, []);
    Object.assign(summary, { browser: browser.version(), sessionId: captured.sessionId, jobs: [captured, reduced, verified, exported, laterVerified, laterExported, replayed].map(job => ({ id: job.id, operation: job.operation, status: job.status })) });
    assert.deepEqual(checks.filter(item => !item.passed), [], 'Evidence shown must belong to the selected historical job, or explicitly show that this operation has no evidence in the selected view.');
  } catch (error) { failed = true; primaryFailure = error; }
  finally {
    const cleanup = await Promise.allSettled([(async () => { await browser?.close(); })(), (async () => { await app?.close(); })()]);
    for (const result of cleanup) if (result.status === 'rejected') cleanupFailures.push(result.reason);
    summary['status'] = failed || cleanupFailures.length ? 'failed' : 'passed';
    summary['checks'] = checks;
    if (failed) summary['failure'] = primaryFailure instanceof Error ? primaryFailure.message : String(primaryFailure);
    summary['cleanupErrors'] = cleanupFailures.map(error => error instanceof Error ? error.message : String(error));
    try { await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2)); }
    catch (error) { cleanupFailures.push(error); }
  }
  if (failed && cleanupFailures.length) throw new AggregateError([primaryFailure, ...cleanupFailures], 'UI history test and cleanup failed', { cause: primaryFailure });
  if (failed) throw primaryFailure;
  if (cleanupFailures.length) throw new AggregateError(cleanupFailures, 'UI history cleanup failed');
});
