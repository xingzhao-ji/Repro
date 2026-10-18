import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import { validateManifest } from '../src/manifest.js';
import { ReproError } from '../src/contracts.js';

// Independently frozen from the public issue, before running either revision.
const declaration = {
  schemaVersion: 3, id: 'morphdom-textarea', caseId: 'morphdom-textarea',
  classification: 'public-repository-development-case',
  adapter: { id: 'registered-browser-v1', version: '0.2.0' }, runnerVersion: '0.2.0',
  expectation: {
    invariantId: 'MORPHDOM_TEXTAREA_LIVE_VALUE',
    description: 'Morphing an edited textarea to Hello World updates its live value after each input.',
    checks: [
      { selector: '#editor', property: 'value', expected: 'Hello World' },
      { selector: '#status', property: 'textContent', expected: 'rendered' },
    ],
  },
  assertionDigest: '8ec0310e16a14eb7b0bdd530fce211881a7a3db2933705b18eb07ccce35f4aef',
  expectationBasis: 'independent-contract', humanApproval: 'not-claimed',
  expectationSource: { kind: 'public-issue', url: 'https://github.com/patrick-steele-idem/morphdom/issues/19', contractUrls: ['https://github.com/patrick-steele-idem/morphdom/issues/19'], contractDigest: 'b2843674ac78501f41c0c1a77bbef97b305b1b94bbb5006818adba4fff3f5351' },
  actions: [
    { id: 'navigate', kind: 'navigate', target: '/', value: '', dependsOn: [] },
    { id: 'first-edit', kind: 'fill', target: '#editor', value: 'first edit', dependsOn: ['navigate'] },
    { id: 'second-edit', kind: 'fill', target: '#editor', value: 'second edit', dependsOn: ['navigate'] },
  ],
  responses: [],
  environment: { browser: 'chromium', viewport: { width: 1280, height: 720 }, locale: 'en-US', timezoneId: 'UTC', clock: '2026-01-01T00:00:00.000Z', seed: 1729, platform: 'linux-container', timeoutMs: 10_000 },
  boundary: { behavior: 'frontend', network: 'local-assets-only', database: 'none', externalDependencies: [] },
  app: { revision: 'buggy', sourceDigest: '960acd3dbf500df2cd54341881f7b5a31c08ab4052b2608d7abb753a22a05011', repository: 'https://github.com/patrick-steele-idem/morphdom', commit: '8221ace412be8dc1f519f2dc77393f0940134648' },
};

test('public repository browser case accepts its frozen issue contract instead of rejecting schema 3', () => {
  assert.deepEqual(validateManifest(declaration), declaration);
});

test('registry declaration preserves the public expected behavior and is defensive against caller mutation', async () => {
  const { createCaseManifest, getRegisteredCase } = await import('../src/browser-case.js');
  const manifest = createCaseManifest('morphdom-textarea', declaration.expectation as Parameters<typeof createCaseManifest>[1]);
  assert.deepEqual(manifest, declaration);
  manifest.actions[0]!.value = 'modified';
  const registered = getRegisteredCase('morphdom-textarea');
  registered.actions[0]!.value = 'modified';
  registered.expectation.checks[0]!.expected = 'modified';
  assert.deepEqual(createCaseManifest('morphdom-textarea'), declaration);
});

test('manifest rejects transplanted source, assertion, public contract and injected action data without disclosing secrets', () => {
  const secret = 'Bearer privacy-sentinel-test-value';
  const changes = [
    (value: typeof declaration) => { value.caseId = 'unknown-case'; },
    (value: typeof declaration) => { value.app.commit = '0'.repeat(40); },
    (value: typeof declaration) => { value.app.sourceDigest = '0'.repeat(64); },
    (value: typeof declaration) => { value.app.repository = `https://example.invalid/${secret}`; },
    (value: typeof declaration) => { value.assertionDigest = '0'.repeat(64); },
    (value: typeof declaration) => { value.expectationSource.url = secret; },
    (value: typeof declaration) => { value.expectationSource.contractDigest = '0'.repeat(64); },
    (value: typeof declaration) => { value.expectation.checks[0]!.expected = secret; },
    (value: typeof declaration) => { value.actions[1]!.target = secret; },
    (value: typeof declaration) => { value.actions[1]!.value = secret; },
    (value: typeof declaration) => { value.actions[1]!.dependsOn = []; },
    (value: typeof declaration) => { value.actions.reverse(); },
    (value: typeof declaration) => { value.actions.push(value.actions[1]!); },
    (value: typeof declaration) => { Object.assign(value, { authorization: secret }); },
    (value: typeof declaration) => { value.id = secret; },
    (value: typeof declaration) => { value.environment.clock = '2026-02-30T00:00:00.000Z'; },
    (value: typeof declaration) => { value.environment.timeoutMs = 0; },
    (value: typeof declaration) => { value.environment.viewport.width = 100_000; },
  ];
  for (const change of changes) {
    const value = structuredClone(declaration); change(value);
    assert.throws(() => validateManifest(value), error => error instanceof ReproError && !error.message.includes(secret));
  }
});

test('registered actions can be deleted only with their declared dependencies and order preserved', () => {
  const value = structuredClone(declaration);
  value.actions.splice(1, 1);
  assert.deepEqual(validateManifest(value).actions.map(action => action.id), ['navigate', 'second-edit']);
  value.actions.shift();
  assert.throws(() => validateManifest(value), ReproError);
  value.actions = [];
  assert.deepEqual(validateManifest(value).actions, []);
});

test('independent oracle accepts only the declared live value or the exact target failure after rendering', async () => {
  const { createCaseManifest, evaluateCaseObservation, caseExpectationEstablished } = await import('../src/browser-case.js');
  const manifest = createCaseManifest('morphdom-textarea');
  assert.equal(evaluateCaseObservation(manifest, { kind: 'browser-case', values: ['Hello World', 'rendered'] }), 'requirement-satisfied');
  assert.equal(evaluateCaseObservation(manifest, { kind: 'browser-case', values: ['first edit', 'rendered'] }), 'target-failure');
  assert.equal(evaluateCaseObservation(manifest, { kind: 'browser-case', values: ['second edit', 'rendered'] }), 'target-failure');
  for (const observation of [null, { kind: 'browser-case', values: ['', 'ready'] }, { kind: 'browser-case', values: ['first edit', 'ready'] }, { kind: 'browser-case', values: ['unrelated', 'rendered'] }, { kind: 'browser-case', values: ['Hello World'] }, { kind: 'browser-case', values: ['Hello World', 'rendered'], secret: 'privacy-sentinel' }]) {
    assert.throws(() => evaluateCaseObservation(manifest, observation), ReproError);
  }
  assert.equal(caseExpectationEstablished(manifest), true);
  manifest.expectationBasis = 'proposed-unconfirmed';
  assert.equal(caseExpectationEstablished(manifest), false);
  assert.throws(() => evaluateCaseObservation(manifest, { kind: 'browser-case', values: ['Hello World', 'rendered'] }), (error: unknown) => error instanceof ReproError && error.code === 'PROVISIONAL_EXPECTATION');
});

test('served application bytes are pinned upstream files and wrapper identity is kept separate', async () => {
  const { createCaseManifest, caseSource, caseRevisionDigest } = await import('../src/browser-case.js');
  const manifest = createCaseManifest('morphdom-textarea');
  for (const [revision, expectedDigest] of [
    ['buggy', '960acd3dbf500df2cd54341881f7b5a31c08ab4052b2608d7abb753a22a05011'],
    ['fixed', 'aa9404d21525b61fe6b79489b2ad32fd9bae565d705aaf8067a83bbfd3da3b7f'],
  ] as const) {
    const files = caseSource(manifest, revision);
    assert.deepEqual([...files.keys()], ['/', '/app.js']);
    const app = files.get('/app.js'); assert.ok(app);
    assert.equal(createHash('sha256').update(app).digest('hex'), expectedDigest);
    assert.equal(caseRevisionDigest(manifest, revision), expectedDigest);
    assert.deepEqual(app, await readFile(new URL(`../fixtures/repository-cases/morphdom-textarea/${revision}.js`, import.meta.url)));
  }
  const first = caseSource(manifest, 'buggy'); first.get('/app.js')!.fill(0);
  assert.equal(createHash('sha256').update(caseSource(manifest, 'buggy').get('/app.js')!).digest('hex'), '960acd3dbf500df2cd54341881f7b5a31c08ab4052b2608d7abb753a22a05011');
});

test('caller expectations and source requests cannot change the frozen contract or select arbitrary revisions', async () => {
  const { createCaseManifest, caseSource, caseRevisionDigest } = await import('../src/browser-case.js');
  const expectation = structuredClone(declaration.expectation);
  expectation.checks[0]!.expected = 'second edit';
  assert.throws(() => createCaseManifest('morphdom-textarea', expectation as Parameters<typeof createCaseManifest>[1]), ReproError);
  assert.throws(() => createCaseManifest('unregistered'), ReproError);
  const manifest = createCaseManifest('morphdom-textarea');
  assert.throws(() => caseSource(manifest, 'other' as 'buggy'), ReproError);
  manifest.app.commit = '0'.repeat(40);
  assert.throws(() => caseRevisionDigest(manifest, 'fixed'), ReproError);
});

test('htmx and Marked preserve distinct public contracts and reject cross-case observations', async () => {
  const { createCaseManifest, evaluateCaseObservation, caseSource } = await import('../src/browser-case.js');
  const cases = [
    { id: 'htmx-checkbox', expected: ['true', 'clicked'], failure: ['false', 'clicked'], buggyDigest: '1e8bcfaf8ef91b5f5c96591b3a6262b74b8a736824c6c047332d4e131c9f365c' },
    { id: 'marked-empty-heading', expected: ['<p>Hashtags test</p>\n<h4></h4>\n<p>End of test</p>\n', 'rendered'], failure: ['<p>Hashtags test\n####\nEnd of test</p>\n', 'rendered'], buggyDigest: '193fcfd78cac1f95ac35e22608799fb9a727b7479e9c00b51fc67b2fe3d9c66c' },
  ];
  for (const registered of cases) {
    const manifest = createCaseManifest(registered.id);
    assert.equal(evaluateCaseObservation(manifest, { kind: 'browser-case', values: registered.expected }), 'requirement-satisfied');
    assert.equal(evaluateCaseObservation(manifest, { kind: 'browser-case', values: registered.failure }), 'target-failure');
    assert.throws(() => evaluateCaseObservation(manifest, { kind: 'browser-case', values: ['first edit', 'rendered'] }), ReproError);
    const files = caseSource(manifest, 'buggy');
    assert.equal(createHash('sha256').update(files.get('/app.js')!).digest('hex'), registered.buggyDigest);
    manifest.caseId = 'morphdom-textarea';
    assert.throws(() => validateManifest(manifest), ReproError);
  }
});

test('morphdom wrapper loads the original CommonJS source without colliding with its global declarations', async () => {
  const directory = new URL('../fixtures/repository-cases/morphdom-textarea/', import.meta.url);
  const html = await readFile(new URL('page.html', directory), 'utf8');
  const source = await readFile(new URL('buggy.js', directory), 'utf8');
  const status = { textContent: 'loading' };
  const listeners: string[] = [];
  const editor = { addEventListener: (name: string) => { listeners.push(name); } };
  const context = createContext({ document: { querySelector: (selector: string) => selector === '#editor' ? editor : selector === '#status' ? status : null } });
  // Initialization only: no DOM mutation, input action, assertion evaluation,
  // browser or fixed implementation is executed by this smoke regression.
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .map(script => script[1]?.includes('src="/app.js"') ? source : script[2]!);
  // Classic browser scripts share global declarations; compile their ordered
  // declarations together so the smoke check catches a lexical-name collision.
  new Script(scripts.join('\n')).runInContext(context, { timeout: 100 });
  assert.equal(status.textContent, 'ready');
  assert.deepEqual(listeners, ['input']);
});

test('browser-case oracle exposes its actual executable artifact identity', async () => {
  const module = await import('../src/browser-case.js');
  const source = await readFile(new URL('../src/browser-case.ts', import.meta.url));
  assert.equal((module as unknown as Record<string, unknown>)['BROWSER_CASE_ARTIFACT_DIGEST'], createHash('sha256').update(source).digest('hex'));
});

test('exported cases retain every provenance file and the explanatory expectation basis', async () => {
  const { createCaseManifest, getRegisteredCase } = await import('../src/browser-case.js');
  for (const id of ['morphdom-textarea', 'htmx-checkbox', 'marked-empty-heading']) {
    const registered = getRegisteredCase(id);
    const prefix = `fixtures/repository-cases/${id}/`;
    assert.ok(registered.assetPaths.includes(`${prefix}README.md`), `${id} must export its expectation explanation`);
    const provenance = JSON.parse(await readFile(new URL(`../${prefix}provenance.json`, import.meta.url), 'utf8')) as { files: { path: string; bytes: number; sha256: string }[] };
    for (const file of provenance.files) {
      assert.ok(registered.assetPaths.includes(prefix + file.path), `${id} must export ${file.path}`);
      const bytes = await readFile(new URL(`../${prefix}${file.path}`, import.meta.url));
      assert.equal(bytes.length, file.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
  }
  const manifest = createCaseManifest('marked-empty-heading');
  assert.deepEqual((manifest.expectationSource as unknown as Record<string, unknown>)['contractUrls'], ['https://spec.commonmark.org/0.30/#atx-headings']);
  const changed = structuredClone(manifest);
  Object.assign(changed.expectationSource, { contractUrls: ['https://example.invalid/changed-contract'] });
  assert.throws(() => validateManifest(changed), ReproError);
});

test('registered-case listing returns independent declarations', async () => {
  const module = await import('../src/browser-case.js');
  const list = (module as unknown as Record<string, unknown>)['listRegisteredCases'];
  assert.equal(typeof list, 'function');
  const first = (list as () => { id: string; expectation: { description: string } }[])();
  assert.deepEqual(first.map(entry => entry.id).sort(), ['htmx-checkbox', 'marked-empty-heading', 'morphdom-textarea']);
  first[0]!.expectation.description = 'changed';
  assert.notEqual((list as () => { expectation: { description: string } }[])()[0]!.expectation.description, 'changed');
});
