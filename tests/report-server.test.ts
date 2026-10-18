import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { serve } from '../src/server.js';
import { Ledger } from '../src/ledger.js';

async function root(prefix: string) { await mkdir('.repro-runs/tests', { recursive: true }); return mkdtemp(`.repro-runs/tests/${prefix}-`); }
async function app(): Promise<string> {
  const directory = resolve(await root('report-app'), 'shop');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'shop', scripts: { dev: 'node server.js' } }));
  execFileSync('git', ['init', '-q'], { cwd: directory });
  return directory;
}

test('report endpoints inspect and prepare without running, require confirmation and a token, and never serve files outside a report', async () => {
  const service = await serve({ port: 0, root: await root('report-server') });
  try {
    const config = await fetch(`${service.url}/api/config`).then(response => response.json()) as { token: string; platform: string; example: { wentWrong: string } };
    assert.match(config.example.wentWrong, /Uncheck "Done: Send invoice"/);
    const headers = { 'Content-Type': 'application/json', 'X-Repro-Token': config.token };
    const post = (path: string, body: unknown, extra: Record<string, string> = headers) => fetch(`${service.url}${path}`, { method: 'POST', headers: extra, body: JSON.stringify(body) });
    assert.equal((await post('/api/reports/prepare', {}, { 'Content-Type': 'application/json' })).status, 403, 'mutations and previews need the page token');
    const folder = await app();
    const inspected = await post('/api/app/inspect', { repository: folder }).then(response => response.json()) as { app: { run: { command: string } }; scope: string[] };
    assert.equal(inspected.app.run.command, 'npm run dev');
    assert.match(inspected.scope.join('\n'), /Run `npm run dev` in .*once per run[\s\S]*Nothing is uploaded/);
    const vague = await post('/api/reports/prepare', { app: { repository: folder }, wentWrong: 'It breaks sometimes.', shouldHappen: 'It should work.' }).then(response => response.json()) as { questions: { field: string }[]; understood: { notes: string[] } };
    assert.deepEqual(vague.questions.map(question => question.field), ['steps', 'expectation']);
    assert.deepEqual(vague.understood.notes, ['It breaks sometimes', 'It should work']);
    const clear = await post('/api/reports/prepare', { app: { repository: folder }, wentWrong: 'Click "Buy"', shouldHappen: '"#total" should show "$5.00"' }).then(response => response.json()) as { questions: unknown[]; understood: { steps: string[]; checks: string[] } };
    assert.deepEqual(clear.questions, []);
    assert.deepEqual(clear.understood.steps, ['Open `/`', 'Click "Buy"']);
    const unconfirmed = await post('/api/reports', { app: { repository: folder }, wentWrong: 'Click "Buy"', shouldHappen: '"#total" should show "$5.00"', requestKey: 'k1' });
    assert.equal(unconfirmed.status, 400);
    assert.match((await unconfirmed.json() as { error: { reason: string } }).error.reason, /Confirm/);
    assert.equal((await post('/api/reports/prepare', { app: { repository: folder }, wentWrong: 'x'.repeat(7000), shouldHappen: '' })).status, 400);
    assert.equal((await post('/api/reports/prepare', { app: { repository: folder, command: 'rm -rf /' }, wentWrong: '', shouldHappen: '' })).status, 400, 'unknown fields are rejected');
    assert.equal((await post('/api/app/inspect', { url: 'https://example.com' })).status, 400, 'non-local URLs are refused');
    assert.equal((await fetch(`${service.url}/api/reports/missing/markdown`)).status, 404);
    assert.equal((await fetch(`${service.url}/api/reports/..%2F..%2Fetc/markdown`)).status, 404);
    const example = await post('/api/examples/local-app', {}).then(response => response.json()) as { path: string; title: string };
    assert.match(example.path, /example-apps\/task-tally-/);
    assert.match(execFileSync('git', ['log', '--oneline'], { cwd: example.path, encoding: 'utf8' }), /Task tally example app/);
  } finally { await service.close(); }
});

test('a report that was running when the workbench stopped is marked interrupted, and only one report runs at a time', async () => {
  const directory = resolve(await root('report-ledger'));
  const ledger = new Ledger(directory);
  const report = ledger.createReport({ title: 'x' }, 'key-1');
  assert.equal(ledger.createReport({ title: 'x' }, 'key-1').id, report.id, 'the same request key returns the same report');
  assert.throws(() => ledger.createReport({ title: 'y' }, 'key-2'), /already being generated/);
  ledger.reportEvent(report.id, 'capture', 'Following your steps');
  ledger.close();
  const reopened = new Ledger(directory);
  try {
    assert.equal(reopened.getReport(report.id).status, 'interrupted');
    assert.deepEqual(reopened.reportEvents(report.id).map(event => event.stage), ['started', 'capture', 'interrupted']);
    assert.throws(() => reopened.finishReport(report.id, 'reproduced', {}), /finished report/);
  } finally { reopened.close(); }
});

test('the CLI asks before it runs anything and explains what is missing', async () => {
  const folder = await app();
  const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL', input: '' });
  const vague = cli('report', '--app', folder, '--went-wrong', 'The total is wrong', '--should-happen', 'It should be right');
  assert.equal(vague.status, 2);
  assert.deepEqual(JSON.parse(vague.stdout).questions.map((question: { field: string }) => question.field), ['steps', 'expectation']);
  const unconfirmed = cli('report', '--app', folder, '--went-wrong', 'Click "Buy"', '--should-happen', '"#total" should show "$5.00"');
  assert.equal(unconfirmed.status, 2);
  assert.match(unconfirmed.stderr, /Repro understood:\n {2}1\. Open `\/`\n {2}2\. Click "Buy"\nIt will check:\n {2}- the element `#total` text is "\$5\.00"\nIt will:\n {2}- Run `npm run dev`/);
  assert.match(JSON.parse(unconfirmed.stderr.slice(unconfirmed.stderr.indexOf('{'))).reason, /--yes/);
  const described = cli('app', '--app', folder);
  assert.equal(described.status, 0);
  assert.equal(JSON.parse(described.stdout).run.command, 'npm run dev');
  assert.equal(cli('record', '--went-wrong', 'x').status, 2, 'report options are refused by other commands');
});
