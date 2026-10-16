import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type BrowserContext } from 'playwright';
import { createCaseManifest } from '../src/browser-case.js';
import { runExperiment } from '../src/runner.js';
import type { RunEvent, RunResult } from '../src/contracts.js';

const root = resolve('.repro-runs/practical-beta/case-faults', randomUUID());
const execute = promisify(execFile);

async function workspace(name: string): Promise<string> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'user-file.txt'), 'preserve this user file');
  return directory;
}
async function assertOwnedCleanup(directory: string, result: RunResult): Promise<void> {
  assert.equal(await readFile(join(directory, 'user-file.txt'), 'utf8'), 'preserve this user file');
  if (result.artifacts.length) assert.deepEqual(await readdir(join(directory, result.id)), ['evidence.json'], 'Owned temporary profile must be removed while retained evidence survives.');
}
async function childResult(cwd: string, script: string, environment: NodeJS.ProcessEnv): Promise<RunResult> {
  const { stdout, stderr } = await execute(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', script], {
    cwd, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(stderr, '', 'The child must return a structured result without unrelated stderr failures.');
  return JSON.parse(stdout) as RunResult;
}
function childEnvironment(temporary: string, browsers: string): NodeJS.ProcessEnv {
  // These tests never pass ambient credentials, NODE_OPTIONS or a browser-channel fallback.
  return { PATH: process.env.PATH ?? '', TMPDIR: temporary, LANG: 'en_US.UTF-8', PLAYWRIGHT_BROWSERS_PATH: browsers };
}

test('cancellation after real navigation closes only the owned browser and fresh replay recovers', { timeout: 20_000 }, async t => {
  const directory = await workspace('cancel');
  const unrelated = await chromium.launch({ headless: true, chromiumSandbox: true });
  const owned: BrowserContext[] = [];
  const closed: BrowserContext[] = [];
  const launch = chromium.launchPersistentContext.bind(chromium);
  t.mock.method(chromium, 'launchPersistentContext', async (...args: Parameters<typeof launch>) => {
    const context = await launch(...args); owned.push(context);
    context.on('close', () => closed.push(context));
    return context;
  });
  try {
    const sentinelPage = await unrelated.newPage();
    assert.equal(await sentinelPage.evaluate(() => 6 * 7), 42);
    const controller = new AbortController();
    let navigationCompleted = false;
    const result = await runExperiment(createCaseManifest('morphdom-textarea'), {
      artifactDir: directory, signal: controller.signal,
      onEvent(event) {
        if (event.type === 'action-executed' && event.actionId === 'navigate') { navigationCompleted = true; controller.abort(); }
      },
    });
    assert.equal(navigationCompleted, true, 'Cancellation must follow actual application navigation and readiness.');
    assert.equal(result.outcome, 'cancelled', result.reason);
    assert.equal(result.assertionCount, 0);
    assert.equal(result.observation, null);
    assert.match(result.reason, /new run|fresh output/i);
    assert.equal(owned.length, 1);
    assert.equal(closed.includes(owned[0]!), true);
    assert.equal(await sentinelPage.evaluate(() => 6 * 7), 42, 'Unrelated Chromium remains alive.');
    await assertOwnedCleanup(directory, result);
    const recovered = await runExperiment(createCaseManifest('morphdom-textarea'), { artifactDir: directory });
    assert.equal(recovered.outcome, 'target-failure', recovered.reason);
    assert.equal(recovered.assertionCount, 1);
    assert.notEqual(result.id, recovered.id);
    assert.equal(owned.length, 2);
    assert.equal(closed.includes(owned[1]!), true);
    assert.equal(await sentinelPage.evaluate(() => 6 * 7), 42);
    await assertOwnedCleanup(directory, recovered);
  } finally {
    t.mock.restoreAll();
    await Promise.all(owned.map(context => context.close()));
    await unrelated.close();
  }
});

test('a 100 ms repository deadline remains inconclusive and removes its owned temporary profile', { timeout: 10_000 }, async () => {
  const directory = await workspace('deadline');
  const manifest = createCaseManifest('morphdom-textarea'); manifest.environment.timeoutMs = 100;
  const started = performance.now();
  const result = await runExperiment(manifest, { artifactDir: directory });
  assert.equal(result.outcome, 'inconclusive', result.reason);
  assert.equal(result.category, 'environment');
  assert.equal(result.assertionCount, 0);
  assert.equal(result.observation, null);
  assert.match(result.reason, /DEADLINE|ADAPTER_TIMEOUT/);
  assert.match(result.reason, /retry|setup/i);
  assert.ok(performance.now() - started < 5000, 'The short deadline plus bounded startup/cleanup must return within five seconds.');
  await assertOwnedCleanup(directory, result);
});

test('an unavailable pinned browser in a fresh child reports setup recovery without treating it as the bug', { timeout: 15_000 }, async () => {
  const directory = await workspace('missing-browser');
  const temporary = join(directory, 'tmp'); const browsers = join(directory, 'empty-browser-install');
  await mkdir(temporary); await mkdir(browsers);
  const script = `import {createCaseManifest} from ${JSON.stringify(pathToFileURL(resolve('src/browser-case.ts')).href)}; import {runExperiment} from ${JSON.stringify(pathToFileURL(resolve('src/runner.ts')).href)}; console.log(JSON.stringify(await runExperiment(createCaseManifest('morphdom-textarea'),{artifactDir:${JSON.stringify(directory)}})));`;
  const result = await childResult(process.cwd(), script, childEnvironment(temporary, browsers));
  assert.equal(result.outcome, 'inconclusive', result.reason);
  assert.equal(result.category, 'environment');
  assert.equal(result.assertionCount, 0);
  assert.equal(result.observation, null);
  assert.equal(result.environment.browser, 'not-launched');
  assert.match(result.reason, /BROWSER_UNAVAILABLE/);
  assert.match(result.reason, /playwright install chromium/);
  await assertOwnedCleanup(directory, result);
});

test('an isolated source copy missing its application asset reports the exact setup blocker and preserves user files', { timeout: 15_000 }, async () => {
  const directory = await workspace('missing-application');
  const isolated = join(directory, 'isolated');
  await mkdir(isolated);
  await cp(resolve('src'), join(isolated, 'src'), { recursive: true });
  await cp(resolve('fixtures/browser-search'), join(isolated, 'fixtures/browser-search'), { recursive: true });
  const caseDirectory = join(isolated, 'fixtures/repository-cases/morphdom-textarea');
  await mkdir(caseDirectory, { recursive: true });
  await cp(resolve('fixtures/repository-cases/morphdom-textarea/page.html'), join(caseDirectory, 'page.html'));
  const temporary = join(isolated, 'tmp'); await mkdir(temporary);
  const output = join(isolated, '.repro-runs/result'); await mkdir(output, { recursive: true });
  await writeFile(join(output, 'user-file.txt'), 'preserve this user file');
  const script = `import {createCaseManifest} from './src/browser-case.ts'; import {runExperiment} from './src/runner.ts'; console.log(JSON.stringify(await runExperiment(createCaseManifest('morphdom-textarea'),{artifactDir:'.repro-runs/result'})));`;
  const result = await childResult(isolated, script, childEnvironment(temporary, resolve('.repro-cache/browsers')));
  assert.equal(result.outcome, 'inconclusive', result.reason);
  assert.equal(result.category, 'environment');
  assert.equal(result.assertionCount, 0);
  assert.equal(result.observation, null);
  assert.equal(result.environment.browser, 'not-launched');
  assert.match(result.reason, /CASE_SOURCE_UNAVAILABLE/);
  assert.match(result.reason, /restore|reinstall/i);
  assert.deepEqual(await readdir(output), ['user-file.txt'], 'Setup failure must not create a misleading run or remove existing data.');
  await assertOwnedCleanup(output, result);
});

test('a CSP-blocked unexpected fetch with fake URL header and body secrets is inconclusive and leaves no secret evidence', { timeout: 15_000 }, async t => {
  const directory = await workspace('network-secrets');
  const secret = 'privacy-sentinel-fake-network-secret';
  let hits = 0;
  const server = createServer((_request, response) => { hits++; response.writeHead(204); response.end(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const destination = `http://127.0.0.1:${address.port}/capture?token=${secret}`;
  const violations: string[] = [];
  const events: RunEvent[] = [];
  const owned: BrowserContext[] = [];
  const launch = chromium.launchPersistentContext.bind(chromium);
  t.mock.method(chromium, 'launchPersistentContext', async (...args: Parameters<typeof launch>) => {
    const context = await launch(...args); owned.push(context);
    await context.exposeBinding('__reproTestCsp', (_source, directive: unknown) => { if (typeof directive === 'string') violations.push(directive); });
    await context.addInitScript(({ destination, secret }) => {
      document.addEventListener('securitypolicyviolation', event => {
        const report = (globalThis as unknown as { __reproTestCsp: (directive: string) => Promise<void> }).__reproTestCsp;
        void report(event.effectiveDirective);
      });
      document.addEventListener('DOMContentLoaded', () => {
        void fetch(destination, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ private: secret }) }).catch(() => undefined);
      });
    }, { destination, secret });
    return context;
  });
  try {
    const result = await runExperiment(createCaseManifest('morphdom-textarea'), { artifactDir: directory, onEvent: event => events.push(event) });
    await writeFile(join(directory, 'injection.json'), JSON.stringify({ hits, violations, outcome: result.outcome, category: result.category, assertionCount: result.assertionCount }, null, 2));
    assert.equal(hits, 0, 'The owned unrelated endpoint must receive no attempted request.');
    assert.ok(violations.includes('connect-src'), 'The browser must actually report the injected fetch blocked by CSP.');
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(events).includes(secret), false, 'Live event consumers must not receive the secret either.');
    await assertOwnedCleanup(directory, result);
    for (const artifact of result.artifacts) assert.equal((await readFile(join(directory, artifact.path))).includes(Buffer.from(secret)), false, 'Unexpected URL/header/body strings must not enter retained artifacts.');
    assert.equal(result.outcome, 'inconclusive', 'Blocked undeclared network activity must not retain a conclusive target verdict.');
    assert.equal(result.category, 'unsupported');
    assert.match(result.reason, /NETWORK_BOUNDARY|CONTENT_SECURITY_POLICY|CSP_BOUNDARY/);
  } finally {
    t.mock.restoreAll();
    await Promise.all(owned.map(context => context.close()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

for (const phase of ['final-action', 'observation-read'] as const) {
  test(`a CSP violation during ${phase} cannot disappear during verdict finalization`, { timeout: 20_000 }, async t => {
    const directory = await workspace(`csp-${phase}`);
    let hits = 0; let violations = 0; let attempts = 0;
    const server = createServer((_request, response) => { hits++; response.writeHead(204); response.end(); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const destination = `http://127.0.0.1:${address.port}/undeclared`;
    const owned: BrowserContext[] = [];
    const launch = chromium.launchPersistentContext.bind(chromium);
    t.mock.method(chromium, 'launchPersistentContext', async (...args: Parameters<typeof launch>) => {
      const context = await launch(...args); owned.push(context);
      await context.exposeBinding('__reproTimingViolation', () => { violations++; });
      await context.exposeBinding('__reproTimingAttempt', () => { attempts++; });
      await context.addInitScript(({ destination, phase }) => {
        const bindings = globalThis as unknown as { __reproTimingViolation: () => Promise<void>; __reproTimingAttempt: () => Promise<void> };
        document.addEventListener('securitypolicyviolation', () => { void bindings.__reproTimingViolation(); });
        if (phase === 'final-action') document.addEventListener('DOMContentLoaded', () => {
          document.querySelector('#editor')!.addEventListener('input', event => {
            if ((event.currentTarget as HTMLTextAreaElement).value !== 'second edit') return;
            void bindings.__reproTimingAttempt();
            void fetch(destination).catch(() => undefined);
          });
        });
      }, { destination, phase });
      if (phase === 'observation-read') {
        const page = context.pages()[0]!;
        const evaluate = page.evaluate.bind(page);
        t.mock.method(page, 'evaluate', async (...args: Parameters<typeof evaluate>) => {
          // Interpose only immediately before the real declared projection read.
          // Its getter still returns the actual native value; it also attempts a
          // forbidden fetch in that same browser task, without a timer or sleep.
          if (Array.isArray(args[1]) && args[1][0]?.selector === '#editor') {
            await evaluate(destination => {
              const editor = document.querySelector('#editor')!;
              const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
              Object.defineProperty(editor, 'value', {
                configurable: true,
                get() {
                  void (globalThis as unknown as { __reproTimingAttempt: () => Promise<void> }).__reproTimingAttempt();
                  void fetch(destination).catch(() => undefined);
                  return native.get!.call(this);
                },
                set(value: string) { native.set!.call(this, value); },
              });
            }, destination);
          }
          return evaluate(...args);
        });
      }
      return context;
    });
    try {
      for (let repetition = 0; repetition < 5; repetition++) {
        const priorAttempts = attempts; const priorViolations = violations;
        const result = await runExperiment(createCaseManifest('morphdom-textarea'), { artifactDir: directory });
        await writeFile(join(directory, `timing-${repetition}.json`), JSON.stringify({ phase, repetition, hits, attempts: attempts - priorAttempts, violations: violations - priorViolations, outcome: result.outcome, category: result.category, assertionCount: result.assertionCount }, null, 2));
        assert.equal(hits, 0);
        assert.ok(attempts > priorAttempts, 'The real browser must execute the injected fetch at the selected phase.');
        assert.ok(violations > priorViolations, 'The actual CSP violation must be observed.');
        assert.equal(result.outcome, 'inconclusive', 'Late boundary violations must not finalize as a target failure.');
        assert.equal(result.category, 'unsupported');
        assert.match(result.reason, /CSP_BOUNDARY/);
        await assertOwnedCleanup(directory, result);
      }
    } finally {
      t.mock.restoreAll();
      await Promise.all(owned.map(context => context.close()));
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
