import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = process.cwd();
const task = resolve(root, '.repro-runs/cloud-continuation/missing-steps-diagnosis-v1/oracle-audit');
const plan = JSON.parse(readFileSync(resolve(task, 'PLAN.json'), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
function verifyInputs() {
  for (const input of plan.inputs) {
    const bytes = readFileSync(resolve(root, input.path));
    assert.equal(bytes.length, input.bytes, input.path);
    assert.equal(sha(bytes), input.sha256, input.path);
  }
}
verifyInputs();
const oracle = await import(pathToFileURL(resolve(root, 'src/oracle.ts')).href);
assert.equal(oracle.ASSERTION_DIGEST, 'fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711');
const source = readFileSync(resolve(root, 'fixtures/browser-search/buggy.js'), 'utf8');
const page = readFileSync(resolve(root, 'fixtures/browser-search/page.html'), 'utf8');
const initial = {
  requestId: /id="search-state" data-latest-request-id="([0-9]+)"/.exec(page)?.[1],
  completed: /data-completed="(\[[^\]]*\])"/.exec(page)?.[1],
  query: /id="latest-query">([^<]*)<\/strong>/.exec(page)?.[1],
};
assert.deepEqual(initial, { requestId: '0', completed: '[]', query: '—' });
assert.match(page, /<ul id="results"><\/ul>/);
assert.match(page, /<p id="error"><\/p>/);

// This deliberately small model executes the exact registered buggy source.
// It models only the DOM members and controlled fetch completions used there.
// It does not model browser event trust, actionability, rendering, network,
// navigation, CSP, browser scheduling, or any real-browser acceptance gate.
function createFixtureModel() {
  const transcript = [];
  const pending = new Map();
  const handlers = new Map();
  const submissions = new Map();
  const form = {
    addEventListener(type, callback) {
      assert.equal(type, 'submit');
      assert.equal(handlers.has(type), false);
      handlers.set(type, callback);
    },
  };
  const input = { value: '' };
  const state = { dataset: { latestRequestId: initial.requestId, completed: initial.completed } };
  const latestQuery = { textContent: initial.query };
  const results = {
    children: [],
    replaceChildren(...items) {
      assert.equal(items.every(item => item.tagName === 'li' && typeof item.textContent === 'string'), true);
      this.children = items;
      transcript.push({ event: 'results-replaced', results: items.map(item => item.textContent) });
    },
  };
  const error = { textContent: '' };
  const nodes = new Map([['#search', form], ['#query', input], ['#search-state', state], ['#latest-query', latestQuery], ['#results', results], ['#error', error]]);
  const document = {
    querySelector(selector) {
      assert.equal(nodes.has(selector), true, `Unexpected model selector ${selector}`);
      return nodes.get(selector);
    },
    createElement(tagName) { assert.equal(tagName, 'li'); return { tagName, textContent: '' }; },
  };
  const fetch = url => {
    assert.equal(typeof url, 'string');
    assert.match(url, /^\/api\/search\?requestId=[12]&query=(alpha|beta)$/);
    const parsed = new URL(url, 'http://model.invalid');
    const id = Number(parsed.searchParams.get('requestId'));
    assert.equal(pending.has(id), false);
    transcript.push({ event: 'fetch-issued', url, requestId: id, query: parsed.searchParams.get('query') });
    return new Promise(resolve => pending.set(id, resolve));
  };
  const context = vm.createContext({ document, fetch }, { name: 'registered-buggy-fixture-offline-model', codeGeneration: { strings: false, wasm: false } });
  new vm.Script(source, { filename: 'fixtures/browser-search/buggy.js' }).runInContext(context, { timeout: 1000 });
  assert.equal(handlers.size, 1);
  return {
    transcript,
    observe() {
      return { latestRequestId: Number(state.dataset.latestRequestId), query: latestQuery.textContent, results: results.children.map(item => item.textContent) };
    },
    completion() { return { completed: JSON.parse(state.dataset.completed), error: error.textContent }; },
    submit(query) {
      input.value = query;
      let prevented = false;
      const promise = handlers.get('submit')({ preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
      const requestId = Number(state.dataset.latestRequestId);
      assert.equal(pending.has(requestId), true);
      submissions.set(requestId, promise);
      transcript.push({ event: 'submit-returned', query, requestId });
    },
    async complete(requestId) {
      const complete = pending.get(requestId);
      assert.equal(typeof complete, 'function');
      pending.delete(requestId);
      const body = { results: [requestId === 1 ? 'Alpha synthetic result' : 'Beta synthetic result'] };
      transcript.push({ event: 'fetch-completed', requestId, body });
      complete({ ok: true, async json() { return structuredClone(body); } });
      await submissions.get(requestId);
      assert.equal(error.textContent, '');
      assert.equal(JSON.parse(state.dataset.completed).includes(requestId), true);
    },
  };
}

function evaluate(observation) {
  try {
    oracle.assertObservation(observation, oracle.EXPECTATION);
    return { kind: 'requirement-satisfied' };
  } catch (error) {
    if (error instanceof oracle.TargetFailure) return { kind: 'target-failure', category: error.category, code: error.code };
    assert.equal(error.category, 'verification');
    assert.equal(['WRONG_OBSERVATION', 'WRONG_FAILURE'].includes(error.code), true);
    return { kind: 'inconclusive', category: error.category, code: error.code };
  }
}

const expectations = {
  'navigation-only': { observation: { latestRequestId: 0, query: '—', results: [] }, completed: [], verdict: { kind: 'inconclusive', category: 'verification', code: 'WRONG_OBSERVATION' }, requests: [] },
  'alpha-pending': { observation: { latestRequestId: 1, query: 'alpha', results: [] }, completed: [], verdict: { kind: 'inconclusive', category: 'verification', code: 'WRONG_OBSERVATION' }, requests: ['/api/search?requestId=1&query=alpha'] },
  'alpha-completed': { observation: { latestRequestId: 1, query: 'alpha', results: ['Alpha synthetic result'] }, completed: [1], verdict: { kind: 'inconclusive', category: 'verification', code: 'WRONG_OBSERVATION' }, requests: ['/api/search?requestId=1&query=alpha'] },
  'full-before-responses': { observation: { latestRequestId: 2, query: 'beta', results: [] }, completed: [], verdict: { kind: 'inconclusive', category: 'verification', code: 'WRONG_FAILURE' }, requests: ['/api/search?requestId=1&query=alpha', '/api/search?requestId=2&query=beta'] },
  'full-after-beta': { observation: { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] }, completed: [2], verdict: { kind: 'requirement-satisfied' }, requests: ['/api/search?requestId=1&query=alpha', '/api/search?requestId=2&query=beta'] },
  'full-after-beta-then-alpha': { observation: { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] }, completed: [2,1], verdict: { kind: 'target-failure', category: 'target-failure', code: 'LATEST_SEARCH_RESPONSE_WINS' }, requests: ['/api/search?requestId=1&query=alpha', '/api/search?requestId=2&query=beta'] },
  'beta-without-alpha': { observation: { latestRequestId: 1, query: 'beta', results: [] }, completed: [], verdict: { kind: 'inconclusive', category: 'verification', code: 'WRONG_OBSERVATION' }, requests: ['/api/search?requestId=1&query=beta'] },
};
const records = [];
let oracleInvocations = 0;
for (const scenario of plan.proposedExecution.cases) {
  if (scenario.id === 'no-navigation') {
    assert.deepEqual(scenario.actions, []);
    records.push({ id: scenario.id, scope: 'model-only', fixtureInitialized: false, observation: null, oracleInvocations: 0, transcript: [], conclusion: 'No application state exists to observe; no oracle verdict is claimed.' });
    continue;
  }
  assert.equal(scenario.actions[0], 'navigate');
  const model = createFixtureModel();
  for (const action of scenario.actions.slice(1)) model.submit(action);
  for (const response of scenario.responses ?? []) await model.complete(response);
  const observation = model.observe();
  const completion = model.completion();
  const verdict = evaluate(observation);
  oracleInvocations++;
  const expected = expectations[scenario.id];
  assert.deepEqual(observation, expected.observation, scenario.id);
  assert.deepEqual(completion, { completed: expected.completed, error: '' }, scenario.id);
  assert.deepEqual(verdict, expected.verdict, scenario.id);
  assert.deepEqual(model.transcript.filter(event => event.event === 'fetch-issued').map(event => event.url), expected.requests, scenario.id);
  records.push({ id: scenario.id, scope: 'model-only', fixtureInitialized: true, observation, completion, verdict, oracleInvocations: 1, transcript: model.transcript });
}
assert.throws(() => oracle.assertObservation({ latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] }, { ...oracle.EXPECTATION, latestQuery: 'alpha' }), error => error.category === 'verification' && error.code === 'ORACLE_CHANGED');
oracleInvocations++;
verifyInputs();
assert.equal(records.length, 8);
assert.equal(oracleInvocations, 8);
process.stdout.write(JSON.stringify({
  scope: plan.scope,
  modelHash: sha(readFileSync(new URL(import.meta.url))),
  planHash: sha(readFileSync(resolve(task, 'PLAN.json'))),
  inputsVerifiedBeforeAndAfter: plan.inputs,
  fixtureHash: sha(source),
  assertionDigest: oracle.ASSERTION_DIGEST,
  oracleArtifactDigest: oracle.ORACLE_ARTIFACT_DIGEST,
  cases: records,
  controls: { changedExpectation: 'ORACLE_CHANGED', oracleInvocations },
  limits: ['This is a minimal Node VM DOM/fetch model, not a browser or live HTTP run.', 'No fixed implementation was inspected or executed.', 'Intermediate beta satisfaction occurs before the required final [2,1] completion checkpoint.', 'Incomplete experiment observations remain inconclusive under the unchanged oracle.', 'These checks establish no real-browser repeatability or capsule minimality.'],
  status: 'passed',
}, null, 2) + '\n');
