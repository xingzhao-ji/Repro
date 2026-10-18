import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { serve } from '../src/server.js';
import { getRegisteredCase } from '../src/browser-case.js';
import type { BrowserCaseExpectation, ReductionResult, RunResult } from '../src/contracts.js';

test('public case API lists contracts and requires an explicit expectation before creating a session', async () => {
  const root = resolve('.repro-runs/practical-beta/case-ui-api', randomUUID());
  await mkdir(root, { recursive: true });
  const app = await serve({ port: 0, root });
  try {
    const config = await fetch(`${app.url}/api/config`).then(response => response.json()) as { token: string; cases: { id: string; expectation: BrowserCaseExpectation; contractUrls: string[] }[] };
    assert.deepEqual(config.cases?.map(item => item.id).sort(), ['htmx-checkbox', 'marked-empty-heading', 'morphdom-textarea']);
    assert.deepEqual(config.cases.find(item => item.id === 'marked-empty-heading')?.contractUrls, ['https://spec.commonmark.org/0.30/#atx-headings']);
    const post = (experiment: unknown) => fetch(`${app.url}/api/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-repro-token': config.token },
      body: JSON.stringify({ consent: true, experiment }),
    });
    const missing = await post({ caseId: 'morphdom-textarea' });
    assert.equal(missing.status, 400);
    assert.equal(app.ledger.sessions().length, 0);
    const expectation = getRegisteredCase('morphdom-textarea').expectation;
    const created = await post({ caseId: 'morphdom-textarea', expectation });
    assert.equal(created.status, 201);
    const data = await created.json() as { session: { manifest: { schemaVersion: number; expectation: BrowserCaseExpectation } } };
    assert.equal(data.session.manifest.schemaVersion, 3);
    assert.deepEqual(data.session.manifest.expectation, expectation);
    const secret = 'privacy-sentinel-undeclared-authorization';
    const rejected = await post({ caseId: 'morphdom-textarea', expectation, authorization: secret });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.text()).includes(secret), false);
    assert.equal(app.ledger.sessions().length, 1);
  } finally { await app.close(); }
});

test('real repository journey freezes reviewed expectation through capture inspection reduction comparison export and mixed history', { timeout: 180_000 }, async () => {
  const root = resolve('.repro-runs/practical-beta/case-ui', randomUUID());
  await mkdir(root, { recursive: true });
  const app = await serve({ port: 0, root: join(root, 'ledger') });
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  async function terminal(operation: string) {
    await page.waitForFunction(op => {
      const selected = document.querySelector<HTMLSelectElement>('#job')?.selectedOptions[0]?.textContent ?? '';
      return selected.startsWith(`${op} · `) && !selected.includes('· running ·');
    }, operation, { timeout: 130_000 });
    return app.ledger.getJob(await page.locator('#job').inputValue());
  }
  async function operation(name: string, kind: string) {
    await page.getByRole('button', { name, exact: true }).click();
    return terminal(kind);
  }
  try {
    await page.goto(`${app.url}/#/new`);
    await page.getByRole('button', { name: 'Start synthetic capture', exact: true }).waitFor();
    const selector = page.getByRole('combobox', { name: 'Application case', exact: true });
    assert.equal(await selector.count(), 1, 'Capture must offer the registered repository cases.');
    await selector.selectOption('marked-empty-heading');
    assert.equal(await page.getByRole('link', { name: 'Expected-behavior source', exact: true }).getAttribute('href'), 'https://spec.commonmark.org/0.30/#atx-headings');
    const declaredHtml = page.locator('.expectation-fields .key-value').filter({ has: page.getByText('#result · innerHTML', { exact: true }) }).locator('dd');
    assert.equal(await declaredHtml.innerText(), '<p>Hashtags test</p>\n<h4></h4>\n<p>End of test</p>\n', 'Whitespace in the declared DOM value must remain visible before confirmation.');
    await selector.selectOption('morphdom-textarea');
    const start = page.getByRole('button', { name: 'Start repository capture', exact: true });
    assert.equal(await start.isDisabled(), true);
    await page.getByRole('checkbox', { name: 'I consent to this scripted repository capture in a fresh browser profile.', exact: true }).check();
    assert.equal(await start.isDisabled(), true, 'consent alone must not silently select an expectation');
    await page.getByRole('checkbox', { name: 'I reviewed these expected values and want to freeze them for this capture.', exact: true }).check();
    const declarationRequest = page.waitForRequest(request => request.url() === `${app.url}/api/sessions` && request.method() === 'POST');
    const captured = await operation('Start repository capture', 'record');
    assert.deepEqual((await declarationRequest).postDataJSON().experiment, { caseId: 'morphdom-textarea', expectation: getRegisteredCase('morphdom-textarea').expectation });
    const original = captured.result as RunResult;
    assert.equal(original.outcome, 'target-failure', original.reason);
    assert.deepEqual(original.observation, { kind: 'browser-case', values: ['second edit', 'rendered'] });
    const frozen = app.ledger.getSession(captured.sessionId).manifest;
    assert.equal(frozen.schemaVersion, 3);
    await page.locator('.sidebar nav').getByRole('link', { name: 'Overview', exact: true }).click();
    await page.getByText('Observed values', { exact: true }).waitFor();
    assert.match(await page.locator('.run-evidence').innerText(), /second edit/);
    assert.match(await page.getByRole('region', { name: 'Selected run expectation' }).innerText(), /Hello World/);
    assert.equal(await page.getByText('Controlled synthetic API responses', { exact: true }).count(), 0);
    const reducedJob = await operation('Reduce', 'reduce');
    const reduced = reducedJob.result as ReductionResult;
    assert.equal(reduced.status, 'complete', reduced.reason);
    assert.equal(reduced.manifest.actions.length, 2);
    assert.equal(reduced.manifest.assertionDigest, frozen.assertionDigest);
    const accepted = reduced.trials.find(trial => trial.index > 0 && trial.accepted);
    assert.ok(accepted);
    await page.getByRole('button', { name: `Inspect trial ${accepted.index}`, exact: true }).click();
    await page.locator('.linked-run').first().waitFor();
    assert.match(await page.locator('.trial-inspector').innerText(), /Observed values/);
    const verified = await operation('Verify fixed revision', 'verify');
    const comparison = verified.result as { outcome: string; original: RunResult; candidate: RunResult };
    assert.equal(comparison.outcome, 'requirement-satisfied');
    assert.deepEqual(comparison.candidate.observation, { kind: 'browser-case', values: ['Hello World', 'rendered'] });
    const exported = await operation('Export capsule', 'export');
    assert.equal(exported.status, 'complete');
    await page.getByText('Run the exported capsule', { exact: true }).waitFor();
    assert.match(await page.locator('.panel-body').innerText(), /REPRO_REVISION=buggy/);
    assert.match(await readFile(join((exported.result as { path: string }).path, 'replay.test.mjs'), 'utf8'), /REPRO_REVISION/);

    await page.locator('#job').selectOption(captured.id);
    await page.locator('.sidebar nav').getByRole('link', { name: 'Dependencies', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.dependencies li').length === 3);
    assert.match(await page.getByRole('region', { name: 'Selected run expectation' }).innerText(), /Hello World/);
    await page.getByRole('link', { name: '+ New capture', exact: true }).click();
    await page.getByRole('combobox', { name: 'Application case', exact: true }).selectOption('synthetic');
    await page.getByRole('checkbox', { name: 'I consent to this scripted synthetic capture in a fresh browser profile.', exact: true }).check();
    const synthetic = await operation('Start synthetic capture', 'record');
    assert.equal((synthetic.result as RunResult).outcome, 'target-failure');
    await page.locator('#session').selectOption(captured.sessionId);
    await page.locator('#job').selectOption(captured.id);
    await page.locator('.sidebar nav').getByRole('link', { name: 'Overview', exact: true }).click();
    await page.getByText('Observed values', { exact: true }).waitFor();
    assert.match(await page.locator('.run-evidence').innerText(), /second edit/);
    assert.equal(await page.getByText('Observed query', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await writeFile(join(root, 'summary.json'), JSON.stringify({ outcome: 'passed', captured: captured.id, reduced: reducedJob.id, verified: verified.id, exported: exported.id, synthetic: synthetic.id, assertionDigest: frozen.assertionDigest, accessibility: 'deferred and unverified' }, null, 2));
  } finally { await browser.close(); await app.close(); }
});

for (const scenario of [
  { caseId: 'htmx-checkbox', actionCount: 2, buggy: ['false', 'clicked'], fixed: ['true', 'clicked'] },
  { caseId: 'marked-empty-heading', actionCount: 3,
    buggy: ['<p>Hashtags test\n####\nEnd of test</p>\n', 'rendered'],
    fixed: ['<p>Hashtags test</p>\n<h4></h4>\n<p>End of test</p>\n', 'rendered'] },
]) {
  test(`${scenario.caseId} complete UI journey retains its natural actions and exact historical evidence`, { timeout: 180_000 }, async () => {
    const root = resolve('.repro-runs/practical-beta/case-ui', `${scenario.caseId}-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const app = await serve({ port: 0, root: join(root, 'ledger') });
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    async function operation(name: string, kind: string) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForFunction(op => {
        const selected = document.querySelector<HTMLSelectElement>('#job')?.selectedOptions[0]?.textContent ?? '';
        return selected.startsWith(`${op} · `) && !selected.includes('· running ·');
      }, kind, { timeout: 130_000 });
      return app.ledger.getJob(await page.locator('#job').inputValue());
    }
    async function history(jobId: string, section: string) {
      await page.locator('#job').selectOption(jobId);
      await page.waitForFunction(id => document.querySelector('.experiment-summary')?.textContent?.includes(id), jobId);
      await page.locator('.sidebar nav').getByRole('link', { name: section, exact: true }).click();
    }
    try {
      await page.goto(`${app.url}/#/new`);
      const selector = page.getByRole('combobox', { name: 'Application case', exact: true });
      await selector.selectOption(scenario.caseId);
      assert.deepEqual(await page.locator('.expectation-fields .key-value dd').allTextContents(), scenario.fixed);
      assert.equal(await page.locator('.expectation-fields h4').count(), 0, 'Expected HTML is shown as text, never inserted into the workbench DOM.');
      const start = page.getByRole('button', { name: 'Start repository capture', exact: true });
      assert.equal(await start.isDisabled(), true);
      await page.getByRole('checkbox', { name: 'I consent to this scripted repository capture in a fresh browser profile.', exact: true }).check();
      assert.equal(await start.isDisabled(), true);
      await page.getByRole('checkbox', { name: 'I reviewed these expected values and want to freeze them for this capture.', exact: true }).check();
      const declarationRequest = page.waitForRequest(request => request.url() === `${app.url}/api/sessions` && request.method() === 'POST');
      const captured = await operation('Start repository capture', 'record');
      assert.deepEqual((await declarationRequest).postDataJSON().experiment, { caseId: scenario.caseId, expectation: getRegisteredCase(scenario.caseId).expectation });
      assert.equal(captured.status, 'complete');
      const original = captured.result as RunResult;
      assert.equal(original.outcome, 'target-failure', original.reason);
      assert.equal(original.assertionCount, 1);
      assert.deepEqual(original.observation, { kind: 'browser-case', values: scenario.buggy });
      const frozen = app.ledger.getSession(captured.sessionId).manifest;
      assert.ok(frozen.schemaVersion === 3);
      assert.equal(frozen.actions.length, scenario.actionCount);
      assert.deepEqual(frozen.expectation.checks.map(check => check.expected), scenario.fixed);
      await page.locator('.sidebar nav').getByRole('link', { name: 'Overview', exact: true }).click();
      await page.getByText('Observed values', { exact: true }).waitFor();
      assert.deepEqual(await page.locator('.run-evidence .observation li').allTextContents(), scenario.buggy);
      assert.equal(await page.locator('.run-evidence .observation h4').count(), 0);

      const reducedJob = await operation('Reduce', 'reduce');
      const reduced = reducedJob.result as ReductionResult;
      assert.equal(reducedJob.status, 'complete');
      assert.equal(reduced.status, 'complete', reduced.reason);
      assert.deepEqual(reduced.manifest.actions, frozen.actions, 'These already-small cases must not manufacture a reduction gain.');
      assert.equal(reduced.manifest.assertionDigest, frozen.assertionDigest);
      assert.deepEqual(reduced.manifest.expectation, frozen.expectation);
      assert.ok(reduced.manifest.schemaVersion === 3);
      assert.deepEqual(reduced.manifest.expectationSource, frozen.expectationSource);
      assert.equal(reduced.minimality, 'unverified', 'Inconclusive deletion trials cannot establish necessity.');
      assert.ok(reduced.trials.length > 1);
      assert.ok(reduced.trials.slice(1).every(trial => !trial.accepted));
      await page.getByText(`${scenario.actionCount} retained actions`, { exact: true }).waitFor();
      assert.match(await page.locator('.reduction-summary').innerText(), /Unverified/);
      await page.locator('.rejected-trials summary').click();
      const rejected = reduced.trials.find(trial => trial.index > 0 && !trial.accepted)!;
      await page.getByRole('button', { name: `Inspect trial ${rejected.index}`, exact: true }).click();
      await page.getByText(`Trial ${rejected.index} evidence available.`, { exact: true }).waitFor();
      await page.locator('.linked-run').first().waitFor();
      assert.match(await page.locator('.trial-inspector').innerText(), /Removal not accepted/);
      assert.match(await page.locator('.trial-inspector').innerText(), /INCONCLUSIVE/);

      const verified = await operation('Verify fixed revision', 'verify');
      const comparison = verified.result as { outcome: string; original: RunResult; candidate: RunResult };
      assert.equal(verified.status, 'complete');
      assert.equal(comparison.outcome, 'requirement-satisfied');
      assert.equal(comparison.original.outcome, 'target-failure');
      assert.equal(comparison.candidate.outcome, 'requirement-satisfied');
      assert.deepEqual(comparison.original.observation, { kind: 'browser-case', values: scenario.buggy });
      assert.deepEqual(comparison.candidate.observation, { kind: 'browser-case', values: scenario.fixed });
      assert.equal(comparison.original.assertionDigest, frozen.assertionDigest);
      assert.equal(comparison.candidate.assertionDigest, frozen.assertionDigest);
      assert.equal(comparison.original.harnessDigest, comparison.candidate.harnessDigest);
      assert.equal(comparison.candidate.assertionCount, 1);
      await page.getByRole('heading', { name: 'Candidate · fixed', exact: true }).waitFor();
      assert.deepEqual(await page.locator('.comparison .run-evidence').nth(1).locator('.observation li').allTextContents(), scenario.fixed);

      const exported = await operation('Export capsule', 'export');
      assert.equal(exported.status, 'complete');
      await page.getByText('Run the exported capsule', { exact: true }).waitFor();
      assert.match(await page.locator('.panel-body').innerText(), /REPRO_REVISION=buggy node --test replay\.test\.mjs/);
      assert.match(await page.locator('.panel-body').innerText(), /REPRO_REVISION=fixed node --test replay\.test\.mjs/);
      const exportPath = (exported.result as { path: string }).path;
      const exportedManifest = JSON.parse(await readFile(join(exportPath, 'manifest.json'), 'utf8')) as typeof frozen;
      assert.deepEqual(exportedManifest, reduced.manifest);
      assert.match(await readFile(join(exportPath, 'replay.test.mjs'), 'utf8'), /REPRO_REVISION/);

      await history(captured.id, 'Dependencies');
      await page.waitForFunction(count => document.querySelectorAll('.dependencies li').length === count, scenario.actionCount);
      assert.deepEqual(await page.locator('.experiment-summary > dl .key-value dd').allTextContents(), scenario.fixed);
      await page.locator('.sidebar nav').getByRole('link', { name: 'Overview', exact: true }).click();
      await page.getByText('Observed values', { exact: true }).waitFor();
      assert.deepEqual(await page.locator('.run-evidence .observation li').allTextContents(), scenario.buggy);
      await history(reducedJob.id, 'Reduction history');
      await page.getByText(`${scenario.actionCount} retained actions`, { exact: true }).waitFor();
      assert.match(await page.locator('.reduction-summary').innerText(), /Unverified/);
      await history(verified.id, 'Compare evidence');
      await page.getByRole('heading', { name: 'Candidate · fixed', exact: true }).waitFor();
      assert.deepEqual(await page.locator('.comparison .run-evidence').nth(1).locator('.observation li').allTextContents(), scenario.fixed);
      assert.deepEqual(errors, []);
      await writeFile(join(root, 'summary.json'), JSON.stringify({ outcome: 'passed', caseId: scenario.caseId,
        captured: captured.id, reduced: reducedJob.id, verified: verified.id, exported: exported.id,
        originalActions: frozen.actions.length, retainedActions: reduced.manifest.actions.length,
        minimality: reduced.minimality, assertionDigest: frozen.assertionDigest, accessibility: 'deferred and unverified' }, null, 2));
    } finally { await browser.close(); await app.close(); }
  });
}
