'use strict';

// Pure aggregation: usable by the browser harness and unit tests without a browser.
function collectFailures(results) {
  const failures = [];
  for (const name of ['desktop', 'mobile']) {
    const check = results.checks.find(item => item.viewport === name);
    if (!check) {
      failures.push(`${name}: required viewport check missing`);
      continue;
    }
    if (check.overflow !== false) failures.push(`${name}: horizontal overflow or missing measurement`);
    if (check.h1 !== 1) failures.push(`${name}: expected exactly one H1`);
    for (const field of ['disabledRun', 'prototypeLabel', 'labelsPresent', 'anchorsValid', 'skipFirstFocus', 'disclosureOpens']) {
      if (check[field] !== true) failures.push(`${name}: ${field} failed or missing`);
    }
  }
  for (const error of results.errors) failures.push(`Runtime: ${error}`);
  for (const request of results.requests) {
    if (!Number.isInteger(request.status) || request.status < 200 || request.status >= 400) {
      failures.push(`HTTP: ${request.status} ${request.url}`);
    }
  }
  if (results.requests.length === 0) failures.push('No HTTP responses were observed');
  return failures;
}
module.exports = { collectFailures };
