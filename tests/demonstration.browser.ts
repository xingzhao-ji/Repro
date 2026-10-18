import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { serve } from '../src/server.js';
import { demonstrationPage } from '../src/demonstration.js';
import { parseExpectation, parseSteps } from '../src/steps.js';

test('a guided demonstration turns clicks, typing and a marked element into steps and a draft check in the same grammar', { timeout: 120_000 }, async () => {
  const root = resolve('.repro-runs', 'demonstration', randomUUID());
  const folder = join(root, 'task-tally');
  await mkdir(folder, { recursive: true });
  await cp('fixtures/local-apps/task-tally', folder, { recursive: true });
  const app = await serve({ port: 0, root: join(root, 'ledger'), demonstrationHeadless: true });
  try {
    const { token } = await fetch(`${app.url}/api/config`).then(response => response.json()) as { token: string };
    const post = (path: string, body: unknown) => fetch(`${app.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Repro-Token': token }, body: JSON.stringify(body) });
    const started = await post('/api/demonstrations', { repository: folder }).then(response => response.json()) as { demonstration: { id: string; status: string } };
    assert.equal(started.demonstration.status, 'recording');
    assert.equal((await post('/api/demonstrations', { repository: folder })).status, 409, 'one demonstration at a time');
    const page = demonstrationPage(started.demonstration.id)!;
    // The reporter's own actions in the opened window.
    await page.getByLabel('New task').fill('Write report');
    await page.getByRole('button', { name: 'Add task' }).click();
    await page.getByLabel('New task').fill('Send invoice');
    await page.keyboard.press('Enter');
    await page.getByRole('checkbox', { name: 'Done: Send invoice' }).check();
    await page.getByRole('checkbox', { name: 'Done: Send invoice' }).uncheck();
    await page.getByRole('toolbar', { name: 'Repro recorder' }).getByRole('button', { name: 'Mark the wrong element' }).click();
    await page.locator('#remaining').click();
    await page.waitForTimeout(300);
    const finished = await post(`/api/demonstrations/${started.demonstration.id}/finish`, {}).then(response => response.json()) as { demonstration: { status: string; steps: string[]; checks: string[]; notes: string[] } };
    assert.equal(finished.demonstration.status, 'finished');
    assert.deepEqual(finished.demonstration.steps, ['Open the app', 'Type "Write report" into "New task"', 'Click "Add task"', 'Type "Send invoice" into "New task"', 'Press Enter', 'Check "Done: Send invoice"', 'Uncheck "Done: Send invoice"']);
    assert.deepEqual(finished.demonstration.checks, ['"#remaining" should show "0 tasks remaining"']);
    // The recorded text is valid input for the report grammar.
    const steps = parseSteps(finished.demonstration.steps.join('\n'));
    assert.deepEqual([steps.actions.length, steps.problems], [7, []]);
    assert.equal(parseExpectation(finished.demonstration.checks.join('\n')).checks.length, 1);
    assert.equal(page.isClosed(), true, 'the demonstration browser closed');
    assert.equal((await fetch(`${app.url}/api/demonstrations/${started.demonstration.id}`).then(response => response.json()) as { demonstration: { status: string } }).demonstration.status, 'finished');
  } finally { await app.close(); }
});
