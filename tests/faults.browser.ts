import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { runBrowser, harnessDigest } from '../src/adapter.js';
import { createManifest, digest } from '../src/manifest.js';
import { ASSERTION_DIGEST } from '../src/oracle.js';
import type { RunResult } from '../src/contracts.js';

type Fault = 'page-crash' | 'target-exception';
type ObservedEvent = { type: string; at: string; url?: string; message?: string };
const evidenceRoot = join('.repro-runs/fault-injection', randomUUID());
const marker = 'REPRO_SYNTHETIC_UNRELATED_TARGET_EXCEPTION';

async function exerciseFault(fault: Fault, t: TestContext): Promise<void> {
  const artifactDir = join(evidenceRoot, fault);
  await mkdir(artifactDir, { recursive: true });
  const input = createManifest(); input.environment.timeoutMs = 5_000;
  const expectedHarness = harnessDigest();
  const observed: ObservedEvent[] = [];
  const owned: Browser[] = [];
  const crashCommands: Promise<void>[] = [];
  let contexts = 0;
  let pages = 0;
  let result: RunResult | undefined;
  let assertionsPassed = false;
  const note = (event: Omit<ObservedEvent, 'at'>): void => { observed.push({ ...event, at: new Date().toISOString() }); };
  const realLaunch = chromium.launch;

  // Instrument only public Playwright methods in this test process. The actual
  // adapter, registered app source, response plan and Node oracle stay unchanged.
  t.mock.method(chromium, 'launch', async (options: Parameters<typeof chromium.launch>[0]) => {
    assert.equal(options?.chromiumSandbox, true, 'failure injection must retain Chromium sandboxing');
    const browser = await realLaunch.call(chromium, options);
    owned.push(browser);
    browser.on('disconnected', () => note({ type: 'owned-browser-disconnected' }));
    const realNewContext = browser.newContext;
    t.mock.method(browser, 'newContext', async (contextOptions: Parameters<Browser['newContext']>[0]) => {
      const context = await realNewContext.call(browser, contextOptions); contexts++;
      if (fault === 'target-exception') {
        await context.addInitScript((exceptionMarker: string) => {
          document.addEventListener('DOMContentLoaded', () => {
            if (location.protocol === 'http:' && location.hostname === '127.0.0.1') {
              throw new Error(exceptionMarker);
            }
          }, { once: true });
        }, marker);
      }
      const realNewPage = context.newPage;
      t.mock.method(context, 'newPage', async () => {
        const page = await realNewPage.call(context); pages++;
        page.on('crash', () => note({ type: 'page-crash', url: page.url() }));
        page.on('pageerror', error => note({ type: 'pageerror', url: page.url(), message: error.message }));
        if (fault === 'page-crash') {
          const realGoto = page.goto;
          t.mock.method(page, 'goto', async (...args: Parameters<Page['goto']>) => {
            const response = await realGoto.apply(page, args);
            assert.match(page.url(), /^http:\/\/127\.0\.0\.1:\d+\/$/);
            const session = await context.newCDPSession(page);
            const crashed = page.waitForEvent('crash', { timeout: 2_000 });
            note({ type: 'Page.crash-issued', url: page.url() });
            // Page.crash terminates its renderer and usually rejects its own CDP
            // response. The real page event, not this rejection, proves injection.
            crashCommands.push(session.send('Page.crash').then(
              () => note({ type: 'Page.crash-command-resolved' }),
              () => note({ type: 'Page.crash-command-rejected' }),
            ));
            await crashed;
            return response;
          });
        }
        return page;
      });
      return context;
    });
    return browser;
  });

  try {
    result = await runBrowser(input, { artifactDir, signal: AbortSignal.any([t.signal, AbortSignal.timeout(8_000)]) });
    assert.equal(owned.length, 1, 'the real browser must launch');
    assert.equal(contexts, 1, 'a fresh owned context must be created');
    assert.equal(pages, 1, 'the registered target page must execute');
    assert.equal(result.outcome, 'inconclusive', result.reason);
    assert.notEqual(result.category, 'target-failure');
    assert.equal(result.assertionCount, 0, 'an interrupted target cannot establish the behavioral assertion');
    assert.equal(result.observation, null);
    assert.equal(result.events.some(event => event.type === 'assertion'), false);
    assert.equal(result.assertionDigest, ASSERTION_DIGEST);
    assert.equal(result.appDigest, input.app.sourceDigest);
    assert.equal(result.harnessDigest, expectedHarness);
    assert.equal(harnessDigest(), expectedHarness);
    assert.equal(result.manifestDigest, digest(input));
    assert.ok(result.events.some(event => event.type === 'reset'));
    assert.ok(result.artifacts.some(artifact => artifact.path.endsWith('/evidence.json')));
    assert.equal(owned[0]!.isConnected(), false, 'runner cleanup must disconnect its owned browser');
    assert.ok(observed.some(event => event.type === 'owned-browser-disconnected'));
    if (fault === 'page-crash') {
      assert.equal(observed.filter(event => event.type === 'page-crash').length, 1, 'actual renderer crash event must be observed');
      assert.equal(result.category, 'environment');
      assert.match(result.reason, /^BROWSER_CRASH:/);
    } else {
      const exception = observed.find(event => event.type === 'pageerror' && event.message === marker);
      assert.ok(exception, 'actual uncaught target JavaScript exception must be observed');
      assert.match(exception.url ?? '', /^http:\/\/127\.0\.0\.1:\d+\/$/);
      assert.equal(result.category, 'verification');
      assert.match(result.reason, /^TARGET_EXCEPTION:/);
    }
    assertionsPassed = true;
  } finally {
    // No process-name cleanup: only browser handles acquired above are closed.
    await Promise.all(owned.map(browser => browser.close()));
    await Promise.all(crashCommands);
    t.mock.restoreAll();
    await writeFile(join(artifactDir, 'fault-injection.json'), JSON.stringify({
      kind: fault, marker: fault === 'target-exception' ? marker : null,
      assertionsPassed, observed, result: result ?? null,
      limits: { adapterDeadlineMs: 5_000, externalAbortMs: 8_000, testDeadlineMs: 15_000, crashEventMs: 2_000 },
      cleanup: { ownedBrowsers: owned.length, allDisconnected: owned.every(browser => !browser.isConnected()) },
      boundary: 'Test-only public Playwright instrumentation; real sandboxed owned browser and registered loopback frontend. No product source or oracle changes.',
    }, null, 2));
  }
}

test('actual renderer crash is observed and cannot become a target-failure verdict', { timeout: 15_000 }, async t => {
  await exerciseFault('page-crash', t);
});

test('actual unrelated target JavaScript exception is inconclusive under the unchanged assertion', { timeout: 15_000 }, async t => {
  await exerciseFault('target-exception', t);
});
