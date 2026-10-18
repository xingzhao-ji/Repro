import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExpectation, parseSteps, describeAction, describeCheck, describeReference } from '../src/steps.js';

test('steps grammar understands common reproduction lines and keeps observations as notes', () => {
  const parsed = parseSteps([
    '1. Open the app',
    '2. Type "Milk" into "Add an item"',
    '3. Press Enter',
    '- Type “Eggs” into the "Add an item" field and press Enter',
    'Then click the "All" button',
    'Check "Mark Eggs as bought"',
    'Click "Delete Eggs"',
    'Click "Add" 3 times',
    'Select "Large" from "Size"',
    'Fill "Quantity" with "2"',
    'Clear "Search"',
    'Press Control+A in "Notes"',
    'Hover over the "Help" link',
    'Wait for "Saved" to appear',
    'Double-click "Milk"',
    'Go to /cart',
    'Reload the page',
    'Click "#submit"',
    'Click the element with test id "save-button"',
    'The counter shows "1 item left"',
  ].join('\n'));
  assert.deepEqual(parsed.problems.map(item => item.line), [4]);
  assert.deepEqual(parsed.notes, ['The counter shows "1 item left"']);
  const summary = parsed.actions.map(action => [action.kind, action.reference, action.value]);
  assert.deepEqual(summary, [
    ['navigate', null, '/'],
    ['fill', { text: 'Add an item' }, 'Milk'],
    ['press', null, 'Enter'],
    ['click', { text: 'All', kind: 'button' }, ''],
    ['check', { text: 'Mark Eggs as bought' }, ''],
    ['click', { text: 'Delete Eggs' }, ''],
    ['click', { text: 'Add' }, ''], ['click', { text: 'Add' }, ''], ['click', { text: 'Add' }, ''],
    ['select', { text: 'Size' }, 'Large'],
    ['fill', { text: 'Quantity' }, '2'],
    ['fill', { text: 'Search' }, ''],
    ['press', { text: 'Notes' }, 'Control+A'],
    ['hover', { text: 'Help', kind: 'link' }, ''],
    ['wait-for', { text: 'Saved' }, ''],
    ['dblclick', { text: 'Milk' }, ''],
    ['navigate', null, '/cart'],
    ['reload', null, ''],
    ['click', { css: '#submit' }, ''],
    ['click', { testid: 'save-button' }, ''],
  ]);
  assert.match(parsed.problems[0]!.suggestion, /Type|one action/i);
});

test('steps gain an implicit first navigation and reject non-local pages', () => {
  const implicit = parseSteps('Click "Start"');
  assert.deepEqual(implicit.actions.map(action => action.kind), ['navigate', 'click']);
  const external = parseSteps('Open https://example.com/admin');
  assert.equal(external.actions.length, 0);
  assert.match(external.problems[0]!.message, /local app/);
  assert.deepEqual(parseSteps('Open http://localhost:5173/settings?tab=2').actions[0], { kind: 'navigate', reference: null, value: '/settings?tab=2', text: 'Open http://localhost:5173/settings?tab=2', line: 1 });
  assert.match(parseSteps('Type "x into "Name"').problems[0]!.message, /not closed/);
  assert.match(parseSteps('Click "Add" 50 times').problems[0]!.message, /between 1 and 20/);
});

test('expectation grammar produces explicit checks and asks for the element when only a value is quoted', () => {
  const parsed = parseExpectation([
    '"Items left" should show "2 items left".',
    'The "#total" output should still show "$8.10"',
    'The status should say "Code already applied".',
    '"Saved" should appear',
    '"Error" should not be visible',
    '"Remember me" should be checked',
    '"Search" should be empty',
    '"Quantity" should have value "2"',
    'I should see "Order placed"',
    'The page should not contain "NaN"',
    'The URL should contain "/orders"',
    'There should be no JavaScript errors',
    '".todo-item" should appear 2 times',
    'The total should be correct and nothing else should change.',
  ].join('\n'));
  assert.deepEqual(parsed.checks.map(check => [check.reference, check.property, check.comparison, check.expected]), [
    [{ text: 'Items left' }, 'text', 'equals', '2 items left'],
    [{ css: '#total' }, 'text', 'equals', '$8.10'],
    [{ text: 'Saved' }, 'visible', 'equals', 'true'],
    [{ text: 'Error' }, 'visible', 'equals', 'false'],
    [{ text: 'Remember me' }, 'checked', 'equals', 'true'],
    [{ text: 'Search' }, 'value', 'equals', ''],
    [{ text: 'Quantity' }, 'value', 'equals', '2'],
    [{ css: 'body' }, 'text', 'contains', 'Order placed'],
    [{ css: 'body' }, 'text', 'not-contains', 'NaN'],
    [null, 'url', 'contains', '/orders'],
    [null, 'page-errors', 'equals', '0'],
    [{ css: '.todo-item' }, 'count', 'equals', '2'],
  ]);
  assert.deepEqual(parsed.problems.map(item => item.text), ['The status should say "Code already applied".', '']);
  assert.match(parsed.problems[1]!.message, /at most 8 checks/);
  assert.match(parsed.problems[0]!.suggestion, /Quote its label or use a CSS selector/);
  const valueOnly = parseExpectation('It should show "2 items left"');
  assert.equal(valueOnly.checks.length, 0);
  assert.match(valueOnly.problems[0]!.suggestion, /Quote its label or use a CSS selector/);
  assert.deepEqual(parsed.notes, ['The total should be correct and nothing else should change']);
});

test('descriptions are readable and never print a withheld value', () => {
  assert.equal(describeAction({ kind: 'fill', value: '', secret: 'REPRO_SECRET_1' }, describeReference({ by: 'label', value: 'Password' })), 'Type the value of $REPRO_SECRET_1 into the element with label "Password"');
  assert.equal(describeAction({ kind: 'click', value: '' }, describeReference({ by: 'role', role: 'button', value: 'Add' })), 'Click the button "Add"');
  assert.equal(describeCheck({ property: 'text', comparison: 'equals', expected: '2 items left' }, describeReference({ by: 'css', value: '#items-left' })), 'the element `#items-left` text is "2 items left"');
  assert.equal(describeCheck({ property: 'page-errors', comparison: 'equals', expected: '0' }, 'the page'), 'no uncaught JavaScript errors occur');
});
