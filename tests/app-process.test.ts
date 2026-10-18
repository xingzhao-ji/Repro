import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startApp, responds, type LaunchPlan } from '../src/app-process.js';

async function folder(files: Record<string, string>): Promise<string> {
  await mkdir('.repro-runs/tests', { recursive: true });
  const directory = await mkdtemp(resolve('.repro-runs/tests/app-process-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(directory, name, '..'), { recursive: true });
    await writeFile(join(directory, name), content);
  }
  return directory;
}
const plan = (directory: string, command: string, extra: Partial<LaunchPlan> = {}): LaunchPlan =>
  ({ kind: 'command', directory, command, url: null, env: {}, startTimeoutMs: 15_000, source: 'test', ...extra });
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('an app honoring PORT is started in its own group on a free port and stopped completely, including its children', async () => {
  const directory = await folder({ 'server.mjs': `
    import { createServer } from 'node:http'; import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
    const helper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    writeFileSync('pids.json', JSON.stringify([process.pid, helper.pid]));
    createServer((q, r) => r.end('ok')).listen(Number(process.env.PORT), process.env.HOST, () => console.log('listening'));` });
  const app = await startApp(plan(directory, 'node server.mjs'));
  assert.match(app.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal(await responds(app.url), true);
  const pids: number[] = JSON.parse(await (await import('node:fs/promises')).readFile(join(directory, 'pids.json'), 'utf8'));
  assert.ok(pids.every(alive));
  const receipt = await app.stop();
  assert.deepEqual(receipt, { stopped: true, forced: false, survivors: false, portClosed: true, external: false });
  assert.ok(pids.every(pid => !alive(pid)), 'every process in the owned group exited');
  assert.equal(await responds(app.url, 500), false);
});

test('a printed URL is detected when the server ignores PORT, and a server ignoring SIGTERM is force-stopped', async () => {
  const directory = await folder({ 'server.mjs': `
    import { createServer } from 'node:http';
    process.on('SIGTERM', () => console.log('ignoring SIGTERM'));
    const server = createServer((q, r) => r.end('ok')).listen(0, '127.0.0.1', () => console.log('  ➜  Local:   \\u001b[36mhttp://localhost:' + server.address().port + '/app/\\u001b[39m'));` });
  const app = await startApp(plan(directory, 'exec node server.mjs'));
  assert.match(app.url, /^http:\/\/localhost:\d+\/app\/$/);
  assert.ok(app.logs().some(line => line.includes('Local:') && !line.includes('\u001b')), 'ANSI escapes are stripped from logs');
  const receipt = await app.stop();
  assert.equal(receipt.forced, true);
  assert.equal(receipt.stopped, true);
});

test('start failures are reported with the reason and leave nothing running', async () => {
  const directory = await folder({ 'crash.mjs': `console.error('missing module ./config'); process.exit(3);`, 'silent.mjs': `setInterval(() => {}, 1000);` });
  await assert.rejects(startApp(plan(directory, 'node crash.mjs')), (error: Error & { code?: string; logs?: string[] }) =>
    error.code === 'APP_START_FAILED' && /exit code 3/.test(error.message) && (error.logs ?? []).some(line => line.includes('missing module')));
  const started = performance.now();
  await assert.rejects(startApp(plan(directory, 'node silent.mjs', { startTimeoutMs: 1500 })), (error: Error & { code?: string }) => error.code === 'APP_START_TIMEOUT');
  assert.ok(performance.now() - started < 9000);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 300);
  await assert.rejects(startApp(plan(directory, 'node silent.mjs'), { signal: controller.signal }), (error: Error & { code?: string }) => error.code === 'CANCELLED');
});

test('the static plan serves only regular files inside the folder', async () => {
  const directory = await folder({ 'site/index.html': '<h1>Hello</h1>', 'site/app.js': 'console.log(1)', 'site/.env': 'SECRET=1', 'outside.txt': 'outside' });
  const app = await startApp({ kind: 'static', directory: join(directory, 'site'), command: null, url: null, env: {}, startTimeoutMs: 5000, source: 'test' });
  const text = async (path: string) => { const response = await fetch(new URL(path, app.url)); return [response.status, await response.text()] as const; };
  assert.deepEqual(await text('/'), [200, '<h1>Hello</h1>']);
  assert.equal((await text('/app.js'))[0], 200);
  assert.equal((await text('/.env'))[0], 404);
  assert.equal((await text('/%2e%2e/outside.txt'))[0], 404);
  assert.equal((await app.stop()).stopped, true);
});
