import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { serve } from '../src/server.js';
import { AxeBuilder } from '@axe-core/playwright';
import type { ReductionResult, RunResult, Trial } from '../src/contracts.js';
import { createManifest, digest } from '../src/manifest.js';

test('selected run expectation persists alongside actual captured evidence', { timeout: 45_000 }, async () => {
  const root = resolve('.repro-runs/hci-increment', `inspector-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  let app: Awaited<ReturnType<typeof serve>> | undefined, browser: Browser | undefined;
  let failure: unknown; const cleanupErrors: unknown[] = [];
  const summary: Record<string, unknown> = { status: 'started', root, scope: 'Actual registered synthetic browser capture; keyboard input; persistent selected-run expectation regression' };
  try {
    app = await serve({ port: 0, root: join(root, 'ledger') });
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    summary['browser'] = browser.version();
    await page.goto(app.url);
    await page.getByRole('checkbox').waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Skip to evidence');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('combobox', { name: 'Application case', exact: true }).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('combobox', { name: 'Expectation input', exact: true }).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement).type), 'checkbox');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Start synthetic capture');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const label = document.querySelector<HTMLSelectElement>('#job')?.selectedOptions[0]?.textContent ?? '';
      return label.startsWith('record · complete ·');
    }, undefined, { timeout: 30_000 });
    const captured = app.ledger.getJob(await page.locator('#job').inputValue());
    assert.equal((captured.result as { outcome: string }).outcome, 'target-failure');
    summary['jobId'] = captured.id;
    await page.screenshot({ path: join(root, 'capture-timeline.png'), fullPage: true });
    const expectation = page.getByRole('region', { name: 'Selected run expectation', exact: true });
    assert.equal(await expectation.count(), 1, 'Timeline must keep the frozen expectation and replay boundary for its exact selected job visible');
    assert.match(await expectation.innerText(), /Beta/);
    assert.match(await expectation.innerText(), /frontend|Chromium/);
    assert.match(await expectation.innerText(), /HTTP|mock|controlled/i);
    summary['status'] = 'passed';
  } catch (error) {
    summary['status'] = 'failed'; summary['error'] = error instanceof Error ? error.message : String(error);
    failure = error;
  } finally {
    for (const result of await Promise.allSettled([browser?.close(), app?.close()])) if (result.status === 'rejected') cleanupErrors.push(result.reason);
    summary['cleanupErrors'] = cleanupErrors.map(error => error instanceof Error ? error.message : String(error));
    try { await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2)); } catch (error) { cleanupErrors.push(error); }
  }
  if (failure && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], 'UI regression and cleanup failed');
  if (failure) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'UI regression cleanup failed');
});

// The second test uses a real reducer with a shorter declared per-execution limit.
// Delays and missing-file probes below exercise presentation recovery only; no
// target observation or verdict is mocked.
test('keyboard investigation joins immutable job input and actual trial evidence without stale attribution', { timeout: 180_000 }, async () => {
  const root = resolve('.repro-runs/hci-increment', `investigation-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  let app!: Awaited<ReturnType<typeof serve>>, browser: Browser | undefined, page!: Page;
  const errors: string[] = [];
  const checks: { name: string; actual: unknown; expected: unknown }[] = [];
  const keyboard: { target: string; keys: string[] }[] = [];
  const screenshots: { file: string; width: number; height: number; state: string }[] = [];
  const audits: unknown[] = [];
  const releases: (() => void)[] = [];
  const restores: (() => Promise<void>)[] = [];
  const summary: Record<string, unknown> = { status: 'started', root, scope: 'Actual registered synthetic browser runs; keyboard interaction and automated accessibility, not human usability', checks, keyboard, screenshots, audits };
  let failure: unknown;
  const cleanupErrors: unknown[] = [];
  let expectation!: import('playwright').Locator, inspector!: import('playwright').Locator;
  function check(name: string, actual: unknown, expected: unknown) {
    checks.push({ name, actual, expected }); assert.deepEqual(actual, expected, name);
  }
  async function tabTo(target: import('playwright').Locator, name: string) {
    await target.waitFor({ state: 'visible' });
    const keys: string[] = [];
    for (let index = 0; index < 160; index++) {
      if (await target.evaluate(element => document.activeElement === element)) {
        const focus = await target.evaluate(element => {
          const style = getComputedStyle(element), rect = element.getBoundingClientRect();
          return { visible: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 || style.boxShadow !== 'none', onscreen: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth };
        });
        check(`Visible on-screen keyboard focus: ${name}`, focus, { visible: true, onscreen: true });
        keyboard.push({ target: name, keys }); return;
      }
      await page.keyboard.press('Tab'); keys.push('Tab');
    }
    assert.fail(`Keyboard Tab navigation did not reach ${name}`);
  }
  async function activate(target: import('playwright').Locator, name: string, key = 'Enter') {
    await tabTo(target, name); await page.keyboard.press(key); keyboard.at(-1)!.keys.push(key);
  }
  async function terminal(operation: string, previous = '') {
    await page.waitForFunction(({ operation, previous }) => {
      const select = document.querySelector<HTMLSelectElement>('#job'), label = select?.selectedOptions[0]?.textContent ?? '';
      return select?.value !== previous && label.startsWith(`${operation} · `) && !label.includes('· running ·');
    }, { operation, previous }, { timeout: 90_000 });
    return app.ledger.getJob(await page.locator('#job').inputValue());
  }
  async function chooseJob(id: string) {
    const select = page.locator('#job');
    await tabTo(select, 'Evidence run');
    const choice = await select.locator('option:enabled').evaluateAll((options, id) => options.find(option => (option as HTMLOptionElement).value === id)?.textContent, id);
    assert.ok(choice, 'Requested job must exist in the native selector');
    if (await select.inputValue() === id) return;
    // Pinned macOS headless Chromium's native popup ignored arrow/menu keys in
    // an isolated <select> probe. Native character typeahead changes selection.
    const key = choice.trim()[0]!;
    for (let attempt = 0; attempt < 10; attempt++) {
      await tabTo(select, 'Evidence run typeahead');
      await page.keyboard.press(key); keyboard.at(-1)!.keys.push(key);
      await page.waitForFunction(() => {
        const requested = new URLSearchParams(location.hash.split('?')[1]).get('run');
        return !document.querySelector('.loading') && document.querySelector<HTMLSelectElement>('#job')?.value === requested;
      });
      if (await select.inputValue() === id) return;
    }
    assert.fail(`Native typeahead did not reach job ${id}`);
  }
  async function inputReady(jobId: string) {
    await expectation.getByText('Inspect selected input identity', { exact: true }).waitFor();
    await disclosure(expectation, 'Inspect selected input identity');
    await expectation.getByText(jobId, { exact: true }).waitFor();
  }
  async function persistent(jobId: string) {
    await inputReady(jobId);
    check('Persistent expectation retains selected job identity', await expectation.innerText().then(text => text.includes(jobId)), true);
    check('Persistent expectation exposes frozen required result', await expectation.innerText().then(text => text.includes('Beta synthetic result')), true);
    check('Persistent expectation distinguishes real frontend and controlled dependency', await expectation.innerText().then(text => /frontend|Chromium/.test(text) && /HTTP|controlled|mock/i.test(text)), true);
  }
  async function shot(state: string) {
    check(`No page overflow: ${state}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: join(root, `${state}.png`), fullPage: true });
    screenshots.push({ file: `${state}.png`, ...page.viewportSize()!, state });
  }
  async function audit(state: string) {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    audits.push({ state, violations: result.violations, incomplete: result.incomplete });
    check(`Axe violations: ${state}`, result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), []);
    check(`Invalid ARIA requiring inspection: ${state}`, result.incomplete.filter(item => item.id === 'aria-prohibited-attr').map(item => item.nodes.map(node => node.target)), []);
  }
  async function disclosure(scope: import('playwright').Locator, name: string) {
    const control = scope.getByText(name, { exact: true });
    if (!await control.evaluate(element => element.closest('details')?.open)) await activate(control, name, 'Space');
  }
  try {
    app = await serve({ port: 0, root: join(root, 'ledger') });
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    expectation = page.getByRole('region', { name: 'Selected run expectation', exact: true });
    inspector = page.getByRole('region', { name: 'Trial evidence', exact: true });
    summary['browser'] = browser.version();
    await page.goto(app.url);
    await page.getByRole('checkbox').waitFor();
    await activate(page.getByRole('link', { name: 'Skip to evidence', exact: true }), 'Skip to evidence');
    await activate(page.getByRole('checkbox'), 'Capture consent', 'Space');
    await activate(page.getByRole('button', { name: 'Start synthetic capture', exact: true }), 'Start synthetic capture');
    const captured = await terminal('record');
    check('Real captured failure', (captured.result as RunResult).outcome, 'target-failure');
    await persistent(captured.id);
    await activate(page.locator('.event-row').first(), 'First captured event');
    await page.getByText('Sequence 1', { exact: true }).waitFor();
    check('Keyboard event inspector reveals selected event', await page.getByText('Sequence 1', { exact: true }).count(), 1);
    await audit('captured-timeline');

    const original = app.ledger.getSession(captured.sessionId).manifest;
    const bounded = { ...original, environment: { ...original.environment, timeoutMs: 1500 } };
    app.ledger.updateManifest(captured.sessionId, bounded);
    summary['fixtureAdjustment'] = { originalTimeoutMs: original.environment.timeoutMs, reductionTimeoutMs: bounded.environment.timeoutMs, reason: 'Owned synthetic UI fixture bound; actual browser, reducer, oracle and all outcomes preserved.' };
    await activate(page.getByRole('navigation', { name: 'Investigation tasks' }).getByRole('link', { name: 'Reduce steps' }), 'Reduce steps task');
    await persistent(captured.id);
    await activate(page.getByRole('button', { name: 'Reduce', exact: true }), 'Reduce');
    const reduced = await terminal('reduce', captured.id);
    const reduction = reduced.result as ReductionResult;
    check('Real reduction retains expected causal actions', reduction.manifest.actions.map(action => action.id), ['navigate', 'search-alpha', 'search-beta']);
    check('Real reduction preserves unverified minimality', reduction.minimality, 'unverified');
    summary['jobs'] = { captured: captured.id, reduced: reduced.id };
    summary['trials'] = reduction.trials;
    await persistent(reduced.id);
    check('All actual trials remain in the interface', await page.getByRole('button', { name: /^Inspect trial \d+$/, includeHidden: true }).count(), reduction.trials.length);
    const accepted = reduction.trials.filter(trial => trial.accepted && trial.removed.length).at(-1);
    const rejected = reduction.trials.find(trial => !trial.accepted && trial.outcome === 'inconclusive');
    assert.ok(accepted && rejected, 'The actual reduction must exercise accepted removal and inconclusive rejection');
    const storedRuns = new Map<string, RunResult>();
    const artifactPaths = new Map<string, string>();
    for (const entry of await readdir(join(root, 'ledger/artifacts', reduced.id))) {
      if (!/^execution-\d+$/.test(entry)) continue;
      for (const runId of await readdir(join(root, 'ledger/artifacts', reduced.id, entry))) {
        const path = join(root, 'ledger/artifacts', reduced.id, entry, runId, 'evidence.json');
        storedRuns.set(runId, JSON.parse(await readFile(path, 'utf8')) as RunResult); artifactPaths.set(runId, path);
      }
    }
    check('All executed trial runs have independent persisted evidence', reduction.trials.flatMap(trial => trial.runIds).every(id => storedRuns.has(id)), true);
    async function inspectTrial(trial: Trial) {
      if (!trial.accepted && !await page.getByRole('button', { name: `Inspect trial ${trial.index}`, exact: true }).isVisible()) await activate(page.locator('summary').filter({ hasText: /^Rejected and inconclusive trials \(/ }), 'Rejected and inconclusive trials', 'Space');
      await activate(page.getByRole('button', { name: `Inspect trial ${trial.index}`, exact: true }), `Inspect trial ${trial.index}`);
      await inspector.getByText(new RegExp(`^Trial ${trial.index} evidence (available|unavailable)\\.$`)).waitFor();
      await inspector.getByText(trial.reason, { exact: true }).first().waitFor();
      check(`Trial ${trial.index} reason is preserved`, await inspector.innerText().then(text => text.includes(trial.reason)), true);
      for (const runId of trial.runIds) {
        check(`Trial ${trial.index} links exact actual execution ${runId}`, await inspector.innerText().then(text => text.includes(runId)), true);
      }
    }
    await inspectTrial(accepted);
    check('Selected accepted trial is preserved in URL', new URLSearchParams(page.url().split('?')[1]).get('trial'), String(accepted.index));
    const acceptedUrl = page.url();
    await page.reload();
    await inspector.getByText(new RegExp(`^Trial ${accepted.index} evidence (available|unavailable)\\.$`)).waitFor();
    await inspector.getByText(accepted.reason, { exact: true }).first().waitFor();
    check('Refresh preserves exact selected trial', page.url(), acceptedUrl);
    await persistent(reduced.id);
    await disclosure(inspector, 'Inspect trial identity');
    for (const run of await inspector.locator('.linked-run').all()) await disclosure(run, 'Inspect run identity');
    const acceptedText = await inspector.innerText();
    for (const runId of accepted.runIds) {
      const actual = storedRuns.get(runId)!;
      assert.ok(actual.observation && 'results' in actual.observation);
      check(`Accepted execution ${runId} actual observation`, acceptedText.includes(actual.observation.results[0]!), true);
      check(`Accepted execution ${runId} frozen assertion identity`, acceptedText.includes(actual.assertionDigest), true);
      check(`Accepted execution ${runId} independent harness identity`, acceptedText.includes(actual.harnessDigest), true);
    }
    check('Accepted candidate input digest', acceptedText.includes(accepted.inputDigest), true);
    check('Accepted candidate retained actions shown', await inspector.locator('.dependencies li > div > code').allTextContents(), ['navigate', 'search-alpha', 'search-beta']);
    check('Accepted input is the independently retained result manifest', accepted.inputDigest, digest(reduction.manifest));
    check('Unverified minimality stays visible beside the selected trial', await page.locator('.reduction-summary').innerText().then(text => text.includes('Unverified')), true);
    for (const linked of await inspector.locator('.linked-run').all()) check('Accepted run shows exactly one executed assertion', await linked.locator('.key-value').filter({ has: page.getByText('Assertions executed', { exact: true }) }).locator('dd').textContent(), '1');
    await shot('accepted-trial-1440');
    await audit('accepted-trial');
    for (const [width, height] of [[390, 844], [768, 1024], [1024, 768]] as const) {
      await page.setViewportSize({ width, height }); await shot(`accepted-trial-${width}`);
    }
    await audit('accepted-trial-1024');
    await page.setViewportSize({ width: 1440, height: 900 });
    const rejectedSummary = page.locator('summary').filter({ hasText: /^Rejected and inconclusive trials \(/ });
    await activate(rejectedSummary, 'Rejected and inconclusive trials', 'Space');
    await inspectTrial(rejected);
    const rejectedText = await inspector.innerText();
    check('Rejected outcome is explicitly inconclusive', /INCONCLUSIVE/.test(rejectedText), true);
    check('Rejected removal is not accepted', /Not accepted|not accepted|Rejected/.test(rejectedText), true);
    for (const runId of rejected.runIds) {
      const actual = storedRuns.get(runId)!;
      assert.ok(actual.observation && 'results' in actual.observation);
      check(`Rejected execution ${runId} preserves the actual reason`, rejectedText.includes(actual.reason), true);
      check(`Rejected execution ${runId} did not execute the assertion`, actual.assertionCount, 0);
    }
    await shot('rejected-trial-1440'); await audit('rejected-trial');

    // Hold a real HTTP response for one rejected trial, select accepted evidence,
    // and release the old response last. This is a transport-order probe only.
    await inspectTrial(accepted);
    let signalHeld!: () => void, release!: () => void, signalDelivered!: () => void;
    const held = new Promise<void>(resolve => { signalHeld = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const delivered = new Promise<void>(resolve => { signalDelivered = resolve; });
    releases.push(release);
    const delayedPath = `**/api/jobs/${reduced.id}/trials/${rejected.index}`;
    await page.route(delayedPath, async route => {
      const response = await route.fetch(); signalHeld(); await released;
      try { await route.fulfill({ response }); } finally { signalDelivered(); }
    });
    if (!await page.getByRole('button', { name: `Inspect trial ${rejected.index}`, exact: true }).isVisible()) await activate(rejectedSummary, 'Rejected and inconclusive trials', 'Space');
    await activate(page.getByRole('button', { name: `Inspect trial ${rejected.index}`, exact: true }), 'Delayed rejected trial');
    await held;
    await inspectTrial(accepted);
    release(); await delivered;
    await page.unroute(delayedPath);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    check('Late rejected response cannot replace accepted trial identity', await inspector.innerText().then(text => accepted.runIds.every(id => text.includes(id)) && !rejected.runIds.some(id => text.includes(id))), true);

    // Remove exactly one owned evidence file after recording its bytes, keeping
    // a restorable sibling. No synthetic run outcome is fabricated.
    const missingId = accepted.runIds[0]!, missingPath = artifactPaths.get(missingId)!;
    await rename(missingPath, `${missingPath}.qa-retained`);
    const restore = () => rename(`${missingPath}.qa-retained`, missingPath); restores.push(restore);
    await inspectTrial(rejected); await inspectTrial(accepted);
    check('Unavailable linked evidence changes overall inspector verdict to inconclusive', await inspector.locator('.trial-verdict').innerText().then(text => text.includes('INCONCLUSIVE')), true);
    const unavailableRun = inspector.locator('.linked-run').filter({ has: page.getByRole('heading', { name: `Run ${missingId}`, exact: true }) });
    check('Unavailable execution cannot reuse a conclusive observation', await unavailableRun.innerText().then(text => text.includes('Alpha synthetic result')), false);
    check('Unavailable execution cannot claim an executed assertion', await unavailableRun.getByText('Assertions executed', { exact: true }).count(), 0);
    await shot('missing-linked-evidence-1440'); await audit('missing-linked-evidence');
    await restore(); restores.pop();
    await inspectTrial(rejected); await inspectTrial(accepted);
    check('Keyboard reselection recovers restored evidence', await inspector.locator('.trial-verdict').innerText().then(text => text.includes('Original failure reproduced')), true);
    summary['faultInjection'] = { kind: 'Temporary missing owned execution evidence file', runId: missingId, restored: true };

    await chooseJob(captured.id); await inputReady(captured.id);
    await activate(page.getByRole('link', { name: 'Dependencies', exact: false }), 'Historical Dependencies');
    await page.getByRole('heading', { name: 'Selected run dependencies', exact: true }).waitFor();
    await persistent(captured.id);
    const dependencyList = page.locator('.dependencies');
    check('Historical record retains original five inputs after reduction', await dependencyList.locator('li > div > code').allTextContents(), original.actions.map(action => action.id));
    await disclosure(expectation, 'Inspect selected input identity');
    check('Historical record retains original timeout', await page.getByText('10000 ms', { exact: true }).count(), 1);
    check('Historical record retains original immutable digest', await expectation.innerText().then(text => text.includes(digest(original))), true);
    await page.reload(); await inputReady(captured.id);
    check('Refresh preserves historical immutable input', await expectation.innerText().then(text => text.includes(digest(original))), true);
    await shot('historical-input-1440');
    await chooseJob(reduced.id); await inputReady(reduced.id);
    check('Selected reduction input is its original five-action candidate basis', await dependencyList.locator('li > div > code').allTextContents(), bounded.actions.map(action => action.id));
    await disclosure(expectation, 'Inspect selected input identity');
    check('Reduction input retains its declared shorter timeout', await page.getByText('1500 ms', { exact: true }).count(), 1);
    check('Reduction input has its own immutable digest', await expectation.innerText().then(text => text.includes(digest(bounded))), true);

    await activate(page.getByRole('navigation', { name: 'Investigation tasks' }).getByRole('link', { name: 'Check fix' }), 'Check fix task');
    await persistent(reduced.id);
    await activate(page.getByRole('button', { name: 'Verify fixed revision', exact: true }), 'Verify fixed revision');
    const verified = await terminal('verify', reduced.id);
    const comparison = verified.result as { outcome: string; original: RunResult; candidate: RunResult };
    check('Real fixed candidate satisfies unchanged requirement', comparison.outcome, 'requirement-satisfied');
    await persistent(verified.id);
    check('Comparison uses the same frozen assertion', comparison.original.assertionDigest, comparison.candidate.assertionDigest);
    check('Comparison shows its actual original and candidate executions', await page.locator('.comparison').innerText().then(text => text.includes(comparison.original.id) && text.includes(comparison.candidate.id)), true);
    await shot('comparison-keyboard-1440'); await audit('comparison-keyboard');
    await activate(page.getByRole('button', { name: 'Export capsule', exact: true }), 'Export capsule');
    const exported = await terminal('export', verified.id);
    await persistent(exported.id);
    check('Keyboard export has actual persisted directory', typeof (exported.result as { path: unknown }).path, 'string');
    await page.getByText('Saved directory', { exact: true }).waitFor();
    await shot('export-keyboard-1440');
    await activate(page.getByRole('button', { name: 'Reduce', exact: true }), 'Reduce for cancellation');
    await activate(page.getByRole('button', { name: 'Cancel active run', exact: true }), 'Cancel active run');
    const cancelled = await terminal('reduce', exported.id);
    check('Keyboard cancellation stops the selected owned operation', cancelled.status, 'cancelled');
    check('Cancellation preserves best known causal inputs', app.ledger.getSession(captured.sessionId).manifest.actions.map(action => action.id), ['navigate', 'search-alpha', 'search-beta']);
    await persistent(cancelled.id);
    await shot('cancelled-keyboard-1440'); await audit('cancelled-keyboard');
    check('No browser render errors', errors, []);
    summary['status'] = 'passed';
    summary['limitations'] = ['No human participants or screen-reader usability evaluation.', 'Pinned headless Chromium product harness only; native Chrome restriction was not retried. Native browser zoom remains unverified.', 'Axe and keyboard samples are bounded technical checks, not WCAG certification.', 'All trial records are retained; accepted and inconclusive trial deep inspection samples exercise the respective presentation paths.'];
  } catch (error) { failure = error; summary['status'] = 'failed'; summary['error'] = error instanceof Error ? error.message : String(error); }
  finally {
    releases.forEach(release => release());
    for (const result of await Promise.allSettled(restores.map(restore => restore()))) if (result.status === 'rejected') cleanupErrors.push(result.reason);
    for (const result of await Promise.allSettled([browser?.close(), app?.close()])) if (result.status === 'rejected') cleanupErrors.push(result.reason);
    summary['cleanupErrors'] = cleanupErrors.map(error => error instanceof Error ? error.message : String(error));
    try { await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2)); } catch (error) { cleanupErrors.push(error); }
  }
  if (failure && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], 'UI investigation and cleanup failed');
  if (failure) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Owned UI resources did not cleanly close');
});

test('corrupt completed reduction cannot retain a conclusive minimality claim', { timeout: 30_000 }, async () => {
  const root = resolve('.repro-runs/hci-increment', `corrupt-minimality-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  let app: Awaited<ReturnType<typeof serve>> | undefined, browser: Browser | undefined;
  let failure: unknown; const cleanupErrors: unknown[] = [];
  const summary: Record<string, unknown> = { status: 'started', root, scope: 'Explicit owned malformed completed-ledger UI fixture; no browser reduction or minimality result is claimed for this fixture.' };
  try {
    app = await serve({ port: 0, root: join(root, 'ledger') });
    const manifest = createManifest();
    const session = app.ledger.createSession(manifest, true);
    const job = app.ledger.startJob(session.id, 'reduce', 'corrupted-minimality-fixture');
    // This is deliberately inconsistent saved data. The regression asks whether
    // invalid evidence can still lend a conclusive label to the summary.
    app.ledger.finish(job.id, 'complete', {
      manifest, trials: [{ index: 0, inputDigest: digest(manifest), seed: 1729, removed: null, outcome: 'target-failure', reason: 'Explicit malformed UI fixture', durationMs: 0, accepted: true, runIds: [] }],
      status: 'complete', minimality: 'dependency-group-1-minimal', executions: 0, durationMs: 0,
      reason: 'Explicit malformed completed-ledger UI fixture, not measured reduction evidence.',
    });
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${app.url}/#/sessions/${session.id}/reduction?run=${job.id}`);
    await page.getByRole('heading', { name: 'Reduction history', exact: true }).waitFor();
    await page.getByRole('alert').waitFor();
    const actual = await page.locator('.reduction-summary').innerText();
    summary['actualSummary'] = actual;
    await page.screenshot({ path: join(root, 'corrupt-minimality.png'), fullPage: true });
    assert.doesNotMatch(actual, /Dependency-group 1-minimal under the tested oracle/, 'Malformed trial evidence cannot support a conclusive minimality claim');
    assert.match(actual, /INCONCLUSIVE/);
    assert.match(actual, /Unverified/i);
    summary['status'] = 'passed';
  } catch (error) { failure = error; summary['status'] = 'failed'; summary['error'] = error instanceof Error ? error.message : String(error); }
  finally {
    for (const result of await Promise.allSettled([browser?.close(), app?.close()])) if (result.status === 'rejected') cleanupErrors.push(result.reason);
    summary['cleanupErrors'] = cleanupErrors.map(error => error instanceof Error ? error.message : String(error));
    try { await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2)); } catch (error) { cleanupErrors.push(error); }
  }
  if (failure && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], 'Corrupt UI regression and cleanup failed');
  if (failure) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Corrupt UI regression cleanup failed');
});

test('native keyboard job selection retains focus while replacing historical input', { timeout: 30_000 }, async () => {
  const root = resolve('.repro-runs/hci-increment', `selection-focus-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  let app: Awaited<ReturnType<typeof serve>> | undefined, browser: Browser | undefined, page: Page | undefined;
  let failure: unknown, release: (() => void) | undefined, delivered: Promise<void> | undefined, heldReached = false;
  const cleanupErrors: unknown[] = [], keys: string[] = [];
  const summary: Record<string, unknown> = { status: 'started', root, scope: 'Actual native character typeahead between two real owned record jobs; delayed historical input response', keys };
  try {
    app = await serve({ port: 0, root: join(root, 'ledger') });
    const original = createManifest(); original.environment.timeoutMs = 1500;
    const session = app.ledger.createSession(original, true);
    const older = await app.coordinator.wait(app.coordinator.start(session.id, 'record', 'older-record').id);
    assert.equal((older.result as RunResult).outcome, 'target-failure');
    const newerInput = { ...original, actions: original.actions.filter(action => action.kind !== 'noise') };
    app.ledger.updateManifest(session.id, newerInput);
    const newer = await app.coordinator.wait(app.coordinator.start(session.id, 'record', 'newer-record').id);
    assert.equal((newer.result as RunResult).outcome, 'target-failure');
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${app.url}/#/sessions/${session.id}/timeline?run=${newer.id}`);
    await page.locator('#job').waitFor();
    const expectation = page.getByRole('region', { name: 'Selected run expectation' });
    assert.ok((await expectation.textContent())?.includes(digest(newerInput)));
    for (let index = 0; index < 100; index++) {
      if (await page.locator('#job').evaluate(element => element === document.activeElement)) break;
      await page.keyboard.press('Tab'); keys.push('Tab');
    }
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'job');
    let signalHeld!: () => void, signalDelivered!: () => void;
    const held = new Promise<void>(resolve => { signalHeld = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    delivered = new Promise<void>(resolve => { signalDelivered = resolve; });
    await page.route(`**/api/jobs/${older.id}/input`, async route => {
      const response = await route.fetch(); heldReached = true; signalHeld(); await released;
      try { await route.fulfill({ response }); } finally { signalDelivered(); }
    });
    await page.keyboard.press('r'); keys.push('r'); await held;
    summary['duringLoadFocus'] = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    await page.screenshot({ path: join(root, 'historical-selection-loading.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'job', 'Changing Evidence run must retain native keyboard focus while its input loads');
    assert.equal((await expectation.textContent())?.includes(digest(newerInput)), false, 'The previous selected input must clear while historical input loads');
    assert.equal(await page.locator('.event-row').count(), 0, 'Previous job events must clear while historical evidence loads');
    release!(); await delivered;
    await page.waitForFunction(value => document.querySelector('[aria-label="Selected run expectation"]')?.textContent?.includes(value), digest(original));
    assert.equal(await page.locator('#job').inputValue(), older.id);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'job', 'The loaded historical input must not reset keyboard focus');
    summary['loadedFocus'] = await page.evaluate(() => document.activeElement?.id);
    summary['olderJob'] = older.id; summary['newerJob'] = newer.id;
    await page.screenshot({ path: join(root, 'historical-selection-loaded.png'), fullPage: true });
    summary['status'] = 'passed';
  } catch (error) { failure = error; summary['status'] = 'failed'; summary['error'] = error instanceof Error ? error.message : String(error); }
  finally {
    release?.();
    if (heldReached && delivered) { try { await delivered; } catch (error) { cleanupErrors.push(error); } }
    for (const result of await Promise.allSettled([browser?.close(), app?.close()])) if (result.status === 'rejected') cleanupErrors.push(result.reason);
    summary['cleanupErrors'] = cleanupErrors.map(error => error instanceof Error ? error.message : String(error));
    try { await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2)); } catch (error) { cleanupErrors.push(error); }
  }
  if (failure && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], 'Selection focus regression and cleanup failed');
  if (failure) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Selection focus cleanup failed');
});

test('malformed reduction histories cannot establish an outcome or minimality', { timeout: 30_000 }, async () => {
  const root = resolve('.repro-runs/hci-increment', `enum-coercion-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  let app: Awaited<ReturnType<typeof serve>> | undefined, browser: Browser | undefined;
  let failure: unknown; const cleanupErrors: unknown[] = [], scenarios: unknown[] = [];
  const scenarioFailures: { scenario: string; error: string }[] = [];
  const summary: Record<string, unknown> = { status: 'started', root, scope: 'Explicit malformed enum-array and missing-history UI fixtures, with a legitimate inconclusive empty-history control; plus explicitly recorded-claim metadata; no measured outcome or minimality is claimed for fixtures', scenarios, scenarioFailures };
  try {
    app = await serve({ port: 0, root: join(root, 'ledger') });
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env['REPRO_BROWSER_CHANNEL'] === 'chrome' ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const manifest = createManifest();
    const validTrial = { index: 0, inputDigest: digest(manifest), seed: 1729, removed: [], outcome: 'target-failure', reason: 'Explicit malformed enum UI fixture', durationMs: 0, accepted: true, runIds: [] };
    // Schema-shaped saved metadata only: these are not executed browser runs.
    const baseline: RunResult = {
      id: 'explicit-ui-baseline-1', outcome: 'target-failure', category: 'target-failure', reason: 'Explicit UI fixture only.',
      manifestDigest: digest(manifest), assertionDigest: manifest.assertionDigest, harnessDigest: 'a'.repeat(64),
      appRevision: 'buggy', appDigest: manifest.app.sourceDigest, adapterVersion: manifest.adapter.version, runnerVersion: manifest.runnerVersion,
      seed: manifest.environment.seed, startedAt: '2026-01-01T00:00:00.000Z', durationMs: 0, assertionCount: 1,
      observation: { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] }, events: [], artifacts: [],
      environment: { platform: 'ui-fixture', node: process.version, browser: 'not-executed', isolation: 'Schema-shaped UI fixture, no browser run.' },
    };
    for (const scenario of ['minimality-array', 'status-array', 'trial-outcome-array', 'empty-completed-history', 'missing-baseline-history', 'empty-inconclusive-history', 'single-baseline-zero-executions', 'two-baseline-unavailable-input', 'qualified-recorded-claim'] as const) {
      const session = app.ledger.createSession(manifest, true);
      const job = app.ledger.startJob(session.id, 'reduce', scenario);
      const withBaseline = ['single-baseline-zero-executions', 'two-baseline-unavailable-input', 'qualified-recorded-claim'].includes(scenario);
      const persistedInput = scenario === 'single-baseline-zero-executions' || scenario === 'qualified-recorded-claim';
      if (persistedInput) {
        const artifactDir = join(root, 'ledger', 'artifacts', job.id);
        await mkdir(artifactDir, { recursive: true });
        await writeFile(join(artifactDir, 'manifest.json'), JSON.stringify(manifest));
      }
      app.ledger.finish(job.id, 'complete', {
        manifest,
        ...(withBaseline ? { baseline } : {}),
        trials: withBaseline ? [{ ...validTrial, runIds: scenario === 'single-baseline-zero-executions' ? [baseline.id] : [baseline.id, 'explicit-ui-baseline-2'] }] : scenario === 'trial-outcome-array' ? [{ ...validTrial, outcome: ['target-failure'] }] : scenario === 'missing-baseline-history' ? [{ ...validTrial, index: 1, runIds: ['explicit-ui-fixture-run'] }] : [],
        status: scenario === 'status-array' ? ['complete'] : scenario === 'empty-inconclusive-history' ? 'inconclusive' : 'complete',
        minimality: scenario === 'minimality-array' ? ['unverified'] : scenario === 'empty-inconclusive-history' ? 'unverified' : 'dependency-group-1-minimal',
        executions: scenario === 'two-baseline-unavailable-input' || scenario === 'qualified-recorded-claim' ? 2 : 0, durationMs: 0, reason: scenario === 'empty-inconclusive-history' ? 'Baseline has not executed: explicit inconclusive UI fixture.' : 'Explicit malformed history UI fixture, not measured reduction evidence.',
      });
      await page.goto(`${app.url}/#/sessions/${session.id}/reduction?run=${job.id}`);
      await page.getByRole('heading', { name: 'Reduction history', exact: true }).waitFor();
      await page.waitForFunction(({ inputDigest, hasInput }) => {
        const value = document.querySelector('[aria-label="Selected run expectation"]')?.textContent ?? '';
        return hasInput ? value.includes(inputDigest) : value.includes('The exact owned evidence is missing');
      }, { inputDigest: digest(manifest), hasInput: persistedInput });
      const actual = await page.locator('main').innerText();
      scenarios.push({ scenario, actual });
      await page.screenshot({ path: join(root, `${scenario}.png`), fullPage: true });
      try {
        const summaryText = await page.locator('.reduction-summary').count() ? await page.locator('.reduction-summary').innerText() : actual;
        if (scenario === 'qualified-recorded-claim') {
          assert.match(summaryText, /Recorded reducer claim/i, 'Stored minimality metadata must be explicitly attributed');
          assert.match(summaryText, /dependency-group 1-minimal/i);
          assert.match(summaryText, /not independently verified the (?:entire|whole)(?: reduction)? history/i, 'Selected-trial inspection is not an independent whole-history minimality proof');
        } else {
          assert.doesNotMatch(summaryText, /dependency-group 1-minimal/i, `${scenario} cannot support a conclusive minimality claim`);
          assert.match(summaryText, /[Uu]nverified/, `${scenario} leaves minimality unverified`);
        }
        if (['empty-completed-history', 'missing-baseline-history', 'single-baseline-zero-executions', 'two-baseline-unavailable-input'].includes(scenario)) {
          assert.match(summaryText, /INCONCLUSIVE/, `${scenario} must expose the incomplete evidence`);
        }
        if (scenario === 'empty-inconclusive-history') {
          assert.match(summaryText, /INCONCLUSIVE/);
          assert.match(summaryText, /Baseline has not executed: explicit inconclusive UI fixture\./, 'A legitimate unverified empty history keeps its inconclusive reason');
        }
        if (scenario === 'trial-outcome-array') {
          assert.match(await page.getByRole('alert').innerText(), /INCONCLUSIVE/);
          assert.equal(await page.getByRole('button', { name: 'Inspect trial 0', exact: true }).count(), 0, 'Malformed outcome cannot become a selectable accepted trial');
        }
      } catch (error) { scenarioFailures.push({ scenario, error: error instanceof Error ? error.message : String(error) }); }
    }
    assert.deepEqual(scenarioFailures, [], 'All malformed-history boundaries and the qualified recorded-claim control must pass');
    summary['status'] = 'passed';
  } catch (error) { failure = error; summary['status'] = 'failed'; summary['error'] = error instanceof Error ? error.message : String(error); }
  finally {
    for (const result of await Promise.allSettled([browser?.close(), app?.close()])) if (result.status === 'rejected') cleanupErrors.push(result.reason);
    summary['cleanupErrors'] = cleanupErrors.map(error => error instanceof Error ? error.message : String(error));
    try { await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2)); } catch (error) { cleanupErrors.push(error); }
  }
  if (failure && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], 'Enum coercion regression and cleanup failed');
  if (failure) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Enum coercion cleanup failed');
});
