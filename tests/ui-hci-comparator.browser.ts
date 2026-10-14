/** Frozen-view instrumentation; never execution of the target app or participant data. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { AxeBuilder } from '@axe-core/playwright';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { buildStudy } from '../scripts/build-hci-study.js';
import { createPacket, validatePacket, type CaseJob, type HciCasePacket } from '../scripts/hci-case.js';
import type { ReductionResult } from '../src/contracts.js';
import { caseFixture, SHA } from './helpers/hci-case-fixture.js';

function instrumentationPacket(): HciCasePacket {
  const value = caseFixture();
  value.caseId = 'constructed-browser-instrumentation';
  const reduction = value.jobs.find(row => row.job.id === value.roles.reduction)!;
  const result = reduction.job.result as ReductionResult;
  const source = reduction.trials[2]!;
  for (let index = 3; index < 13; index++) {
    const inspection = structuredClone(source), runId = `instrumented-incomplete-${index}`;
    inspection.trialIndex = index; inspection.trial!.index = index;
    inspection.trial!.runIds = [runId]; inspection.runs[0]!.runId = runId;
    inspection.runs[0]!.result!.id = runId;
    reduction.trials.push(inspection); result.trials.push(inspection.trial!);
    value.source.files.push({ path: `artifacts/${reduction.job.id}/execution-${String(index + 3).padStart(6, '0')}/${runId}/evidence.json`, sha256: SHA, bytes: 1024 });
  }
  result.executions += 10; result.durationMs += 100;
  return createPacket(value);
}

const sections = [
  ['overview', 'Overview'], ['timeline', 'Event timeline'], ['dependencies', 'Dependencies'],
  ['reduction', 'Reduction history'], ['comparison', 'Compare evidence'], ['export', 'Local export'],
] as const;

test('P and L preserve frozen facts, recovery, keyboard paths and accessible reflow', { timeout: 300_000 }, async () => {
  const actualPacketPath = process.env['REPRO_HCI_PACKET_PATH'];
  const root = resolve('.repro-runs/hci-comparator/verification', `${actualPacketPath ? 'actual' : 'constructed'}-${randomUUID()}`);
  let browser: Browser | undefined, activePage: Page | undefined, failure: unknown;
  const cleanupErrors: unknown[] = [], checks: unknown[] = [], keyboard: unknown[] = [], screenshots: unknown[] = [], audits: unknown[] = [];
  const unexpectedRequests: unknown[] = [], pageErrors: string[] = [];
  const summary: Record<string, unknown> = {
    status: 'started', root,
    scope: actualPacketPath ? 'Rendered fidelity to a separately frozen actual synthetic execution packet; no new target execution' : 'Constructed synthetic instrumentation; not captured target execution or participant evidence',
    checks, keyboard, screenshots, audits, unexpectedRequests, pageErrors,
    limitations: ['Headless pinned Chromium only; native Chrome and Codex CUA were not attempted.', 'Viewport reflow is not native 200% zoom.', 'Automated accessibility and keyboard tests are not a human screen-reader or usability study.'],
  };
  function check(name: string, actual: unknown, expected: unknown) { checks.push({ name, actual, expected }); assert.deepEqual(actual, expected, name); }
  try {
    await mkdir(root, { recursive: true });
    const packetBytes = actualPacketPath ? await readFile(resolve(actualPacketPath)) : Buffer.from(JSON.stringify(instrumentationPacket()));
    const packet = validatePacket(JSON.parse(packetBytes.toString('utf8')));
    const packetPath = join(root, 'packet.json');
    await writeFile(packetPath, packetBytes);
    summary['caseSha256'] = packet.caseSha256;
    summary['sourcePacketSha256'] = createHash('sha256').update(packetBytes).digest('hex');
    summary['sourcePacketBytes'] = packetBytes.length;
    const outputDir = join(root, 'study');
    const build = await buildStudy({ packetPath, outputDir });
    summary['build'] = build;
    check('Build source SHA-256 preserves original packet bytes', build.sourcePacketSha256, summary['sourcePacketSha256']);
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    summary['browser'] = browser.version();
    const rendered: Record<string, unknown> = {};
    for (const condition of ['P', 'L'] as const) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
      context.on('request', request => { if (/^https?:/.test(request.url()) || request.method() !== 'GET') unexpectedRequests.push({ condition, method: request.method(), url: request.url() }); });
      await context.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
      const page = await context.newPage(); activePage = page;
      page.setDefaultTimeout(7000);
      page.on('pageerror', error => pageErrors.push(`${condition}: ${error.message}`));
      const baseUrl = pathToFileURL(join(outputDir, `${condition}.html`)).href;
      async function tabTo(target: Locator, label: string, backwards = false) {
        await target.waitFor({ state: 'visible' });
        const keys: string[] = [];
        for (let index = 0; index < 250; index++) {
          if (await target.evaluate(element => element === document.activeElement)) {
            const focus = await target.evaluate(element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return { visible: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 || style.boxShadow !== 'none', onscreen: box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth }; });
            check(`${condition} visible keyboard focus ${label}`, focus, { visible: true, onscreen: true });
            keyboard.push({ condition, target: label, keys }); return;
          }
          const key = backwards ? 'Shift+Tab' : 'Tab'; await page.keyboard.press(key); keys.push(key);
        }
        assert.fail(`${condition}: keyboard navigation could not reach ${label}`);
      }
      async function activate(target: Locator, label: string, key = 'Enter') { await tabTo(target, label); await page.keyboard.press(key); }
      async function disclose(label: string | RegExp, open = true) {
        const target = page.locator('summary').filter({ hasText: label });
        check(`${condition} unique disclosure ${String(label)}`, await target.count(), 1);
        if (await target.evaluate(element => element.parentElement?.hasAttribute('open')) !== open) await activate(target, String(label), 'Space');
      }
      async function chooseJob(id: string) {
        const select = page.getByRole('combobox', { name: 'Evidence run', exact: true });
        await tabTo(select, 'Evidence run');
        const label = await select.locator('option:enabled').evaluateAll((items, requested) => items.find(item => (item as HTMLOptionElement).value === requested)?.textContent, id);
        assert.ok(label);
        for (let attempt = 0; attempt < 10 && await select.inputValue() !== id; attempt++) {
          await page.keyboard.press(label.trim()[0]!);
          await page.waitForFunction(() => document.querySelector<HTMLSelectElement>('#hci-job')?.value === new URLSearchParams(location.hash.split('?')[1]).get('run'));
        }
        await page.getByRole('region', { name: 'Selected job identity', exact: true }).getByText(id, { exact: true }).waitFor();
        check(`${condition} native character selection`, await select.inputValue(), id);
        check(`${condition} selection keeps focus`, await select.evaluate(element => element === document.activeElement), true);
      }
      async function section(name: string) {
        await activate(page.getByRole('navigation', { name: 'Evidence sections' }).getByRole('link', { name, exact: true }), name);
        await page.waitForFunction(expected => document.querySelector('nav[aria-label="Evidence sections"] a[aria-current="page"]')?.textContent === expected, name);
      }
      async function shot(state: string) {
        check(`${condition} no page overflow ${state}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        const file = `${condition}-${state}.png`, bytes = await page.screenshot({ path: join(root, file), fullPage: true });
        const dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
        check(`${condition} screenshot has pixels ${state}`, bytes.length > 1000 && dimensions.width > 0 && dimensions.height > 0, true);
        screenshots.push({ condition, state, file, bytes: bytes.length, viewport: page.viewportSize(), ...dimensions, visuallyReviewed: false });
      }
      async function audit(state: string) {
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const incomplete = [];
        for (const item of result.incomplete) {
          const nodes = [];
          for (const node of item.nodes.slice(0, 64)) {
            const selector = node.target.flat().join(' ');
            let rendering: unknown;
            try {
              rendering = await page.locator(selector).first().evaluate(element => {
                const style = getComputedStyle(element), rect = element.getBoundingClientRect();
                const scrollContainers = [];
                for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
                  const css = getComputedStyle(ancestor);
                  if (/(auto|scroll)/.test(`${css.overflowX} ${css.overflowY}`)) scrollContainers.push({ role: ancestor.getAttribute('role'), label: ancestor.getAttribute('aria-label'), scrollLeft: ancestor.scrollLeft, scrollTop: ancestor.scrollTop, scrollWidth: ancestor.scrollWidth, clientWidth: ancestor.clientWidth });
                }
                return { color: style.color, backgroundColor: style.backgroundColor, fontSize: style.fontSize, opacity: style.opacity, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport: { width: innerWidth, height: innerHeight }, scrollContainers };
              });
            } catch (error) { rendering = { unavailable: error instanceof Error ? error.message : String(error) }; }
            nodes.push({ target: node.target, html: node.html.slice(0, 1200), failureSummary: node.failureSummary, checks: [...node.any, ...node.all, ...node.none].map(check => ({ id: check.id, message: check.message, data: check.data })), rendering });
          }
          incomplete.push({ id: item.id, impact: item.impact, help: item.help, description: item.description, helpUrl: item.helpUrl, nodeCount: item.nodes.length, omittedNodes: Math.max(0, item.nodes.length - nodes.length), nodes });
        }
        audits.push({ condition, state, violations: result.violations, passes: result.passes.length, incomplete, interpretation: 'Zero violations is separate from incomplete checks; incomplete rules are not counted as passes.' });
        check(`${condition} Axe violations ${state}`, result.violations, []);
      }
      async function selectedFacts(row: CaseJob) {
        await disclose(/^Complete selected-job evidence$/);
        const region = page.getByRole('region', { name: 'Complete selected-job evidence JSON', exact: true });
        const text = await region.innerText();
        const actual: unknown = JSON.parse(text);
        check(`${condition} rendered exact selected job ${row.job.id}`, actual, row);
        rendered[`${condition}:${row.job.id}`] = actual;
        await tabTo(region, 'Complete selected-job evidence JSON', true);
        const before = await region.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft, height: element.scrollHeight, width: element.scrollWidth, clientHeight: element.clientHeight, clientWidth: element.clientWidth }));
        await page.keyboard.press('PageDown');
        if (before.height > before.clientHeight || before.width > before.clientWidth) await page.waitForFunction(({ top, left }) => Boolean(document.activeElement && (document.activeElement.scrollTop > top || document.activeElement.scrollLeft > left)), { top: before.top, left: before.left }, { timeout: 3000 });
        const after = await region.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft, focused: document.activeElement === element }));
        check(`${condition} long evidence preserves keyboard focus`, after.focused, true);
        check(`${condition} long evidence keyboard scroll`, before.height <= before.clientHeight && before.width <= before.clientWidth || after.top > before.top || after.left > before.left, true);
        await disclose(/^Complete selected-job evidence$/, false);
      }
      async function inspectTrial(row: CaseJob, index: number) {
        const rejected = page.locator('summary').filter({ hasText: /^Rejected and inconclusive trials/ });
        if (await rejected.count() && !await page.getByRole('button', { name: `Inspect trial ${index}`, exact: true }).isVisible()) await disclose(/^Rejected and inconclusive trials/);
        await activate(page.getByRole('button', { name: `Inspect trial ${index}`, exact: true }), `Inspect trial ${index}`);
        const inspector = page.getByRole('region', { name: 'Trial evidence', exact: true });
        await inspector.getByText(`Trial ${index} evidence`, { exact: false }).waitFor();
        const expected = row.trials[index]!;
        const text = await inspector.innerText();
        check(`${condition} trial decision reason ${index}`, text.includes(expected.trial!.reason), true);
        for (const run of expected.runs) {
          check(`${condition} trial run identity ${index}:${run.runId}`, text.includes(run.runId), true);
          check(`${condition} raw run reason ${index}:${run.runId}`, text.includes(run.reason), true);
          if (run.result) {
            check(`${condition} assertion count ${index}:${run.runId}`, new RegExp(String.raw`Assertions executed\s+${run.result.assertionCount}(?:\s|$)`).test(text), true);
            check(`${condition} observation ${index}:${run.runId}`, text.includes(run.result.observation?.results.join(', ') ?? 'Not observed'), true);
          }
        }
        check(`${condition} exact trial route`, new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('trial'), String(index));
      }
      await page.goto(baseUrl);
      await page.getByRole('combobox', { name: 'Evidence run', exact: true }).waitFor();
      check(`${condition} no execution controls in inspection-only view`, await page.getByRole('button', { name: /^(Start synthetic capture|Replay|Reduce|Verify fixed revision|Export capsule|Cancel active run)$/ }).count(), 0);
      check(`${condition} default selected job`, await page.getByRole('combobox', { name: 'Evidence run' }).inputValue(), packet.evidence.defaultJobId);
      check(`${condition} all five jobs available`, await page.getByRole('combobox', { name: 'Evidence run' }).locator('option:enabled').count(), 5);
      const record = packet.evidence.jobs.find(row => row.job.id === packet.evidence.roles.record)!;
      const reduction = packet.evidence.jobs.find(row => row.job.id === packet.evidence.roles.reduction)!;
      await chooseJob(record.job.id);
      await section('Overview');
      check(`${condition} historical record limit`, (await page.getByRole('main').innerText()).includes('10000 ms'), true);
      await selectedFacts(record);
      for (const [key, label] of sections) {
        await section(label);
        if (key === 'comparison') {
          const text = await page.getByRole('main').innerText();
          check(`${condition} original record does not acquire later comparison`, /no comparison evidence/i.test(text), true);
          const comparison = packet.evidence.jobs.find(row => row.job.id === packet.evidence.roles.comparison)!;
          check(`${condition} original record omits later run IDs`, text.includes((comparison.job.result as { candidate: { id: string } }).candidate.id), false);
        }
        await shot(`record-${key}-1440`);
      }
      await chooseJob(reduction.job.id); await section('Reduction history');
      check(`${condition} historical reduction limit`, (await page.getByRole('main').innerText()).includes('1500 ms'), true);
      if (await page.locator('summary').filter({ hasText: /^Rejected and inconclusive trials/ }).count()) await disclose(/^Rejected and inconclusive trials/);
      check(`${condition} complete trial controls`, await page.getByRole('button', { name: /^Inspect trial \d+$/ }).count(), reduction.trials.length);
      check(`${condition} retained history at least thirteen`, reduction.trials.length >= 13, true);
      check(`${condition} minimality stays unverified`, /Minimality:?[\s\S]*Unverified/i.test(await page.getByRole('main').innerText()), true);
      await inspectTrial(reduction, 0);
      check(`${condition} baseline has no deletion`, /No removal; this trial checks the baseline/.test(await page.getByRole('region', { name: 'Trial evidence', exact: true }).innerText()), true);
      const accepted = reduction.trials.find(item => item.trial?.index && item.trial.accepted)!;
      assert.ok(accepted); await inspectTrial(reduction, accepted.trialIndex);
      check(`${condition} accepted deletion semantic distinction`, (await page.getByRole('region', { name: 'Trial evidence', exact: true }).innerText()).includes('Removal accepted'), true);
      for (const removed of accepted.trial!.removed) check(`${condition} accepted removed action ${removed}`, (await page.getByRole('region', { name: 'Trial evidence', exact: true }).innerText()).includes(removed), true);
      const incomplete = reduction.trials.find(item => item.runs.some(run => run.result?.reason.startsWith('MISSING_STEPS:')))!;
      assert.ok(incomplete); await inspectTrial(reduction, incomplete.trialIndex);
      const incompleteText = await page.getByRole('region', { name: 'Trial evidence', exact: true }).innerText();
      check(`${condition} raw missing steps and decision mismatch stay distinct`, incompleteText.includes('MISSING_STEPS:') && incompleteText.includes('Run evidence does not match the frozen input, assertion, application, or execution identity.'), true);
      const savedUrl = page.url(); await page.reload();
      await page.getByRole('region', { name: 'Trial evidence', exact: true }).getByText(`Trial ${incomplete.trialIndex} evidence`, { exact: false }).waitFor();
      check(`${condition} refresh renders exact selected job`, await page.getByRole('combobox', { name: 'Evidence run' }).inputValue(), reduction.job.id);
      check(`${condition} refresh keeps exact job and trial`, page.url(), savedUrl);
      await inspectTrial(reduction, 0); await page.goBack();
      await page.getByRole('region', { name: 'Trial evidence', exact: true }).getByText(`Trial ${incomplete.trialIndex} evidence`, { exact: false }).waitFor();
      check(`${condition} browser Back keeps exact trial`, page.url(), savedUrl);
      await page.goForward();
      await page.getByRole('region', { name: 'Trial evidence', exact: true }).getByText('Trial 0 evidence', { exact: false }).waitFor();
      check(`${condition} browser Forward keeps exact trial`, new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('trial'), '0');
      for (const trial of reduction.trials) if (![0, accepted.trialIndex, incomplete.trialIndex].includes(trial.trialIndex)) await inspectTrial(reduction, trial.trialIndex);
      await inspectTrial(reduction, 0);
      await selectedFacts(reduction);
      await shot('reduction-baseline-1440'); await audit('reduction-1440');
      for (const row of packet.evidence.jobs.filter(item => ![record.job.id, reduction.job.id].includes(item.job.id))) {
        await chooseJob(row.job.id);
        await section(row.job.operation === 'verify' ? 'Compare evidence' : row.job.operation === 'export' ? 'Local export' : 'Reduction history');
        await selectedFacts(row);
        if (row.job.operation === 'reduce') { await inspectTrial(row, 0); check(`${condition} cancelled job remains cancelled`, /cancelled/i.test(await page.getByRole('main').innerText()), true); }
        if (row.job.operation === 'export') {
          check(`${condition} export does not claim Linux replay`, /(?:do not establish|does not establish|not established|unverified|separate check|not.*replay)/i.test(await page.getByRole('main').innerText()), true);
          await disclose(/^Recorded export instructions and readable test$/);
          const details = page.locator('summary').filter({ hasText: /^Recorded export instructions and readable test$/ }).locator('..');
          check(`${condition} both required export documents`, packet.evidence.exportDocuments.map(item => item.name).sort(), ['README.md', 'replay.test.mjs']);
          for (const document of packet.evidence.exportDocuments) {
            const reference = page.getByRole('region', { name: `Export reference ${document.name}`, exact: true });
            await reference.waitFor({ state: 'visible' });
            const text = await reference.textContent(); assert.ok(text);
            check(`${condition} visible exact export reference ${document.name}`, text, document.text);
            check(`${condition} export reference SHA-256 ${document.name}`, createHash('sha256').update(text).digest('hex'), document.sha256);
            check(`${condition} export reference bytes ${document.name}`, Buffer.byteLength(text), document.bytes);
            check(`${condition} visible export reference identity ${document.name}`, (await details.innerText()).includes(document.sha256) && (await details.innerText()).includes(String(document.bytes)), true);
            check(`${condition} export reference is inert text ${document.name}`, await reference.locator('script, iframe, form, button, a').count(), 0);
            await tabTo(reference, `Export reference ${document.name}`);
            rendered[`${condition}:export:${document.name}`] = text;
          }
          await shot('export-reference-open-1440');
          await disclose(/^Recorded export instructions and readable test$/, false);
        }
        await shot(`${row.job.operation}-${row.job.status}-1440`);
      }
      await disclose(/^Glossary and limitations$/);
      const glossary = await page.locator('summary').filter({ hasText: /^Glossary and limitations$/ }).locator('..').innerText();
      check(`${condition} glossary explains inspection limits`, /zero assertion count/.test(glossary) && /not verify a real backend fix/.test(glossary) && /does not establish clean-machine execution/.test(glossary), true);
      rendered[`${condition}:glossary`] = glossary;
      await disclose(/^Glossary and limitations$/, false);
      const search = page.getByRole('searchbox', { name: 'Search evidence', exact: true });
      await tabTo(search, 'Search evidence'); await page.keyboard.type('MISSING_STEPS');
      const resultLinks = page.getByRole('region', { name: 'Evidence search results', exact: true }).getByRole('link');
      await resultLinks.first().waitFor();
      const results = await resultLinks.evaluateAll(items => items.map(item => ({ text: item.textContent, hash: (item as HTMLAnchorElement).hash })));
      rendered[`${condition}:search`] = results;
      check(`${condition} search links point at exact trial`, results.some(item => new URLSearchParams(item.hash.split('?')[1]).get('trial') !== null), true);
      await activate(resultLinks.first(), 'Search result');
      await tabTo(search, 'Search evidence'); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('no-evidence-matches-this-string-8257');
      check(`${condition} no-result search states no match`, /No.*match|No.*results/i.test(await page.getByRole('region', { name: 'Evidence search results', exact: true }).innerText()), true);
      await activate(page.getByRole('button', { name: 'Clear search', exact: true }), 'Clear search', 'Space');
      check(`${condition} search clears`, await search.inputValue(), '');
      await tabTo(search, 'Search evidence reverse navigation', true);
      const downloadLink = page.getByRole('link', { name: 'Download evidence', exact: true });
      await tabTo(downloadLink, 'Download evidence');
      const downloadPromise = page.waitForEvent('download'); await page.keyboard.press('Enter');
      const download = await downloadPromise, downloadPath = join(root, `${condition}-download.json`); await download.saveAs(downloadPath);
      check(`${condition} downloaded evidence exact packet`, JSON.parse(await readFile(downloadPath, 'utf8')), packet);
      await chooseJob(packet.evidence.roles.comparison); await section('Compare evidence');
      await activate(page.getByRole('link', { name: 'Synthetic invalid evidence locator', exact: true }), 'Synthetic invalid evidence locator');
      await page.getByRole('alert').waitFor();
      const invalidText = await page.getByRole('main').innerText();
      check(`${condition} invalid locator explicit failure`, /INCONCLUSIVE/.test(invalidText) && /NOT_FOUND/.test(invalidText), true);
      check(`${condition} stale comparison content disappears`, invalidText.includes('Original failure reproduced; candidate satisfies the same bounded frontend assertion.'), false);
      check(`${condition} stale trial inspector disappears`, await page.getByRole('region', { name: 'Trial evidence', exact: true }).count(), 0);
      await shot('invalid-locator-1440'); await audit('invalid-locator');
      await chooseJob(record.job.id); await section('Overview');
      check(`${condition} keyboard recovery clears alert`, await page.getByRole('alert').count(), 0);
      for (const width of [390, 768, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await chooseJob(reduction.job.id); await section('Reduction history'); await inspectTrial(reduction, incomplete.trialIndex);
        if (width === 320) {
          const table = page.getByRole('region', { name: 'Reduction trials', exact: true }).last();
          await tabTo(table, 'Horizontally scrollable reduction trials');
          const scroll = await table.evaluate(element => ({ left: element.scrollLeft, width: element.scrollWidth, client: element.clientWidth }));
          check(`${condition} narrow reduction table requires contained scroll`, scroll.width > scroll.client, true);
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(left => document.activeElement!.scrollLeft > left, scroll.left);
          check(`${condition} horizontal keyboard scroll retains focus`, await table.evaluate(element => element === document.activeElement), true);
        }
        await shot(`reduction-inconclusive-${width}`); await audit(`reflow-${width}`);
      }
      await writeFile(join(root, `${condition}-accessible-snapshot.txt`), await page.locator('body').ariaSnapshot());
      await context.close();
    }
    for (const row of packet.evidence.jobs) check(`P/L equal rendered facts ${row.job.id}`, rendered[`P:${row.job.id}`], rendered[`L:${row.job.id}`]);
    for (const name of ['README.md', 'replay.test.mjs']) check(`P/L equal export reference ${name}`, rendered[`P:export:${name}`], rendered[`L:export:${name}`]);
    check('P/L equal glossary', rendered['P:glossary'], rendered['L:glossary']);
    check('P/L equal search result index', rendered['P:search'], rendered['L:search']);
    check('No external HTTP, POST, telemetry or runner request', unexpectedRequests, []);
    check('No page runtime errors', pageErrors, []);
    summary['status'] = 'passed';
  } catch (error) { failure = error; summary['status'] = 'failed'; summary['error'] = error instanceof Error ? error.stack : String(error); }
  finally {
    if (failure && activePage && !activePage.isClosed()) {
      try { await activePage.screenshot({ path: join(root, 'failure.png'), fullPage: true }); await writeFile(join(root, 'failure-accessible.txt'), await activePage.locator('body').ariaSnapshot()); } catch (error) { cleanupErrors.push(error); }
    }
    try { await browser?.close(); } catch (error) { cleanupErrors.push(error); }
    summary['cleanupErrors'] = cleanupErrors.map(error => error instanceof Error ? error.message : String(error));
    try { await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2)); } catch (error) { cleanupErrors.push(error); }
  }
  if (failure && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], 'Comparator verification and cleanup failed');
  if (failure) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Comparator cleanup failed');
});
