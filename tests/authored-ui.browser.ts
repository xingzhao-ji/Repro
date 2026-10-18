import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Locator } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { serve } from '../src/server.js';
import type { Manifest, ReductionResult, RunResult } from '../src/contracts.js';
import type { TrialEvidence } from '../src/evidence-inspector.js';

test('keyboard authoring freezes an explicit reversed expectation through capture reduction comparison export and history', { timeout: 180_000 }, async () => {
  const root = resolve('.repro-runs/authored-ui', randomUUID());
  await mkdir(root, { recursive: true });
  const app = await serve({ port: 0, root: join(root, 'ledger') });
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  async function tabTo(target: Locator) {
    for (let index = 0; index < 45; index++) {
      if (await target.evaluate(element => element === document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    assert.fail('Declared control must be reachable through the actual tab order');
  }
  async function terminal(operation: string) {
    await page.waitForFunction(op => {
      const text = document.querySelector<HTMLSelectElement>('#job')?.selectedOptions[0]?.textContent ?? '';
      return text.startsWith(`${op} · `) && !text.includes('· running ·');
    }, operation, { timeout: 130_000 });
    return app.ledger.getJob(await page.locator('#job').inputValue());
  }
  async function operate(name: string, operation: string) {
    await tabTo(page.getByRole('button', { name, exact: true }));
    await page.keyboard.press('Enter');
    return terminal(operation);
  }
  try {
    await page.goto(`${app.url}/#/new`);
    await page.getByRole('button', { name: 'Start synthetic capture', exact: true }).waitFor();
    const mode = page.getByRole('combobox', { name: 'Expectation input', exact: true });
    assert.equal(await mode.count(), 1, 'Capture must offer actual expected-behavior input');
    await tabTo(mode); await page.keyboard.press('s');
    assert.equal(await mode.inputValue(), 'authored');
    const order = page.getByRole('combobox', { name: 'Search order', exact: true });
    await tabTo(order); await page.keyboard.press('b');
    assert.equal(await order.inputValue(), 'beta-alpha');
    const query = page.getByRole('combobox', { name: 'Expected latest query', exact: true });
    await tabTo(query); await page.keyboard.press('a');
    assert.equal(await query.inputValue(), 'alpha');
    const results = page.getByRole('combobox', { name: 'Expected visible result', exact: true });
    await tabTo(results); await page.keyboard.press('b');
    assert.equal(await results.inputValue(), 'Beta synthetic result');
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /The expected query must be the second search/);
    assert.equal(await page.getByRole('button', { name: 'Start synthetic capture', exact: true }).isDisabled(), true);
    assert.equal(await query.inputValue(), 'alpha', 'Conflicting results must not silently rewrite the declared query');
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('a');
    assert.equal(await results.inputValue(), 'Alpha synthetic result');
    const consent = page.getByRole('checkbox', { name: 'I consent to this scripted synthetic capture in a fresh browser profile.' });
    await tabTo(consent); await page.keyboard.press('Space');
    await page.screenshot({ path: join(root, 'authored-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Record the search race.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: join(root, 'authored-mobile.png'), fullPage: true });
    const axe = await new AxeBuilder({ page }).analyze();
    await writeFile(join(root, 'axe.json'), JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete }, null, 2));
    assert.equal(axe.violations.length, 0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const captured = await operate('Start synthetic capture', 'record');
    const original = captured.result as RunResult;
    assert.equal(original.outcome, 'target-failure');
    assert.deepEqual(original.observation, { latestRequestId: 2, query: 'alpha', results: ['Beta synthetic result'] });
    const sessionId = captured.sessionId;
    const frozen = app.ledger.getSession(sessionId).manifest;
    assert.equal(frozen.schemaVersion, 2);
    assert.equal(frozen.expectation.latestQuery, 'alpha');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
    const reducedJob = await operate('Reduce', 'reduce');
    const reduced = reducedJob.result as ReductionResult;
    assert.equal(reduced.manifest.actions.length, 3);
    assert.equal(reduced.manifest.assertionDigest, frozen.assertionDigest);
    const accepted = reduced.trials.find(trial => trial.index > 0 && trial.accepted)!;
    assert.ok(accepted);
    const inspected = await fetch(`${app.url}/api/jobs/${reducedJob.id}/trials/${accepted.index}`).then(r => r.json()) as TrialEvidence;
    assert.equal(inspected.outcome, 'target-failure', JSON.stringify(inspected));
    assert.deepEqual(inspected.runs[0]!.result!.observation, original.observation);
    const checked = await operate('Verify fixed revision', 'verify');
    const comparison = checked.result as { outcome: string; original: RunResult; candidate: RunResult };
    assert.equal(comparison.outcome, 'requirement-satisfied');
    assert.deepEqual(comparison.candidate.observation, { latestRequestId: 2, query: 'alpha', results: ['Alpha synthetic result'] });
    assert.equal(comparison.candidate.assertionDigest, frozen.assertionDigest);
    const exported = await operate('Export capsule', 'export');
    assert.equal(exported.status, 'complete');
    // Each changed selection reloads its own evidence. Use native character
    // cycling and wait for that transition before choosing the next r entry.
    for (let attempt = 0; attempt < 4 && await page.locator('#job').inputValue() !== captured.id; attempt++) {
      await tabTo(page.locator('#job'));
      await page.keyboard.press('r');
      await page.waitForFunction(() => {
        const requested = new URLSearchParams(location.hash.split('?')[1]).get('run');
        return !document.querySelector('.loading') && document.querySelector<HTMLSelectElement>('#job')?.value === requested;
      });
    }
    assert.equal(await page.locator('#job').inputValue(), captured.id);
    await page.reload();
    await page.getByRole('region', { name: 'Selected run expectation' }).getByText('Alpha synthetic result', { exact: true }).waitFor();
    const earlier = await fetch(`${app.url}/api/jobs/${captured.id}/input`).then(r => r.json()) as { manifest: Manifest };
    assert.equal(earlier.manifest.actions.length, 5);
    assert.equal(earlier.manifest.assertionDigest, frozen.assertionDigest);
    await page.screenshot({ path: join(root, 'historical-authored-expectation.png'), fullPage: true });
    assert.deepEqual(errors, []);
    await writeFile(join(root, 'summary.json'), JSON.stringify({ outcome: 'passed', sessionId, captured: captured.id, reduced: reducedJob.id, verified: checked.id, exported: exported.id, assertionDigest: frozen.assertionDigest, original: original.observation, candidate: comparison.candidate.observation, nativeZoom: 'unverified', screenReader: 'unrun' }, null, 2));
  } finally { await browser.close(); await app.close(); }
});
