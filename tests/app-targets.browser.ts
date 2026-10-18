import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runExperiment } from '../src/runner.js';
import { startApp } from '../src/app-process.js';
import { createDraftManifest, validTarget } from '../src/app-contract.js';
import { locatorCode } from '../src/report-test.js';
import { describeReference, parseExpectation, parseSteps } from '../src/steps.js';
import type { AppResolution, RunResult } from '../src/contracts.js';

// A recipe list whose buttons carry more text than the reporter would quote, as real apps often do.
const PAGE = `<!doctype html><title>Recipes</title>
<ul>
  <li><button type="button" data-pick="pancakes">Buttermilk Pancakes <small>Serves 4 · 25 min</small></button></li>
  <li><button type="button" data-pick="waffles">Crisp Waffles <small>Serves 4 · 30 min</small></button></li>
  <li><button type="button" data-pick="bread">Banana Bread <small>Serves 8 · 70 min</small></button></li>
</ul>
<button type="button" id="add">Add</button> <button type="button">Add to shopping list</button>
<p>Showing <output id="shown">Buttermilk Pancakes</output></p>
<script>
  for (const button of document.querySelectorAll('[data-pick]')) button.addEventListener('click', () => { document.querySelector('#shown').textContent = button.firstChild.textContent.trim(); });
</script>`;

async function app(): Promise<string> {
  const directory = join(resolve('.repro-runs/app-target-tests'), randomUUID());
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.html'), PAGE);
  return directory;
}
async function capture(steps: string, expect: string): Promise<RunResult & { resolution?: AppResolution }> {
  const parsed = parseSteps(steps), expectation = parseExpectation(expect);
  assert.deepEqual([parsed.problems, expectation.problems], [[], []]);
  const manifest = createDraftManifest({ id: 'recipes', name: 'recipes', description: 'Picking a recipe shows it.', actions: parsed.actions, checks: expectation.checks,
    sourceDigest: 'a'.repeat(64), commit: null, dirty: false, approved: true, secrets: new Map() });
  const directory = await app();
  const server = await startApp({ kind: 'static', directory, command: null, url: null, env: {}, startTimeoutMs: 15_000, source: 'test' });
  let resolution: AppResolution | undefined;
  try {
    const result = await runExperiment(manifest, { artifactDir: join(directory, '.runs', randomUUID()), app: { origin: server.origin, secrets: {}, resolve: true }, onResolution: value => { resolution = value; } });
    return { ...result, ...(resolution ? { resolution } : {}) };
  } finally { assert.equal((await server.stop()).stopped, true); }
}

test('a quoted name that is the start of exactly one button’s name resolves to that button, recorded as a partial match', async () => {
  const result = await capture('Open the app\nClick "Crisp Waffles"', '"#shown" should show "Crisp Waffles"');
  assert.equal(result.outcome, 'requirement-satisfied', result.reason);
  const target = result.resolution!.actions[1]!.target!;
  assert.deepEqual(target, { by: 'role', role: 'button', value: 'Crisp Waffles', match: 'contains' });
  assert.deepEqual(validTarget(target), target, 'the manifest accepts a partial role target');
  assert.equal(locatorCode(target), 'page.getByRole("button", { name: "Crisp Waffles", exact: false })');
  assert.equal(describeReference(target), 'the button whose name contains "Crisp Waffles"');
});

test('an exact name always wins over a longer name that contains it', async () => {
  const result = await capture('Open the app\nClick "Add"', '"#shown" should show "Buttermilk Pancakes"');
  assert.equal(result.outcome, 'requirement-satisfied', result.reason);
  assert.deepEqual(result.resolution!.actions[1]!.target, { by: 'role', role: 'button', value: 'Add' });
});

test('a step that matches no element, or several by partial name, is blocked and offers the elements the reporter may mean', async () => {
  const missing = await capture('Open the app\nClick "Crispy Waffles"', '"#shown" should show "Crisp Waffles"');
  assert.notEqual(missing.outcome, 'requirement-satisfied');
  assert.match(missing.reason, /^STEP_TARGET_NOT_FOUND: step-2 /);
  assert.equal(missing.resolution!.candidates[0]!.text, 'button “Crisp Waffles Serves 4 · 30 min”', 'the closest name comes first');

  const several = await capture('Open the app\nClick "Serves 4"', '"#shown" should show "Crisp Waffles"');
  assert.match(several.reason, /^STEP_TARGET_AMBIGUOUS: step-2 /);
  assert.deepEqual(several.resolution!.candidates.slice(0, 2).map(candidate => candidate.text), ['button “Buttermilk Pancakes Serves 4 · 25 min”', 'button “Crisp Waffles Serves 4 · 30 min”']);
});

test('checks never match by partial name', async () => {
  // "Crisp" as a check target must not silently become the waffles button.
  const result = await capture('Open the app', '"Crisp" should show "x"');
  assert.match(result.reason, /^CHECK_TARGET_UNRESOLVED/);
});
