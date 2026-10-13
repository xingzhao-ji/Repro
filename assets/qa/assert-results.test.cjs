'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectFailures } = require('./assert-results.cjs');
function valid() {
  return {
    checks: ['desktop', 'mobile'].map(viewport => ({ viewport, h1: 1, overflow: false, disabledRun: true, prototypeLabel: true, labelsPresent: true, anchorsValid: true, skipFirstFocus: true, disclosureOpens: true })),
    errors: [], requests: [{ url: '/prototype.html', status: 200 }]
  };
}
test('valid desktop and mobile results pass', () => assert.deepEqual(collectFailures(valid()), []));
for (const field of ['disabledRun', 'prototypeLabel', 'labelsPresent', 'anchorsValid', 'skipFirstFocus', 'disclosureOpens']) {
  test(`${field} false and missing both fail`, () => {
    const results = valid(); results.checks[0][field] = false;
    assert.ok(collectFailures(results).some(message => message.includes(field)));
    delete results.checks[0][field];
    assert.ok(collectFailures(results).some(message => message.includes(field)));
  });
}
test('aggregates overflow, headings, runtime errors, and HTTP failures', () => {
  const results = valid(); results.checks[0].overflow = true; results.checks[1].h1 = 0;
  results.errors.push('Console error: failure', 'Page error: failure', 'Request failed: failure');
  results.requests.push({ url: '/missing.svg', status: 404 });
  const failures = collectFailures(results);
  assert.equal(failures.length, 6);
  assert.ok(failures.some(message => message.includes('404 /missing.svg')));
});
test('missing viewports and no observed HTTP responses fail', () => {
  const failures = collectFailures({ checks: [], errors: [], requests: [] });
  assert.equal(failures.length, 3);
});
test('missing overflow measurement fails', () => {
  const results = valid(); delete results.checks[0].overflow;
  assert.ok(collectFailures(results).some(message => message.includes('overflow')));
});
