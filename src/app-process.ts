import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createConnection, createServer as createNetServer } from 'node:net';
import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { extname, join, relative, sep, isAbsolute } from 'node:path';
import { ReproError } from './contracts.js';

/**
 * Owned lifecycle of a user's local web app server. Repro starts it in its own
 * process group, so a terminal interrupt reaches only Repro, and stopping it
 * signals that exact group. Processes the app deliberately detaches into
 * another group or session are outside this ownership and are disclosed.
 */
export interface LaunchPlan {
  kind: 'command' | 'static' | 'external';
  /** Absolute app directory for command and static plans. */
  directory: string | null;
  /** Shell command; {port} is replaced with the assigned free port. */
  command: string | null;
  /** Fixed or templated base URL; null lets Repro detect the URL the server prints or the PORT it was given. */
  url: string | null;
  env: Record<string, string>;
  startTimeoutMs: number;
  /** How the plan was chosen, for the report. */
  source: string;
}
export interface StopReceipt { stopped: boolean; forced: boolean; survivors: boolean; portClosed: boolean; external: boolean }
export interface RunningApp { url: string; origin: string; logs(): string[]; stop(): Promise<StopReceipt>; exited(): boolean }

const URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d{1,5})?(?:\/[^\s'"`<>)]*)?/i;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
const MAX_LINES = 300;

/**
 * The environment for the user's own commands: the user's environment without
 * what an npm/npx wrapper around Repro injected (npm_* settings, INIT_CWD) or
 * a Node loader Repro itself runs under. npm re-reads the user's config files.
 */
export function childEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  // NODE_TEST_CONTEXT would make a child `node --test` believe it runs inside Repro's own test runner.
  for (const [key, value] of Object.entries(process.env)) if (!/^npm_/i.test(key) && !['INIT_CWD', 'NODE_OPTIONS', 'NODE_TEST_CONTEXT'].includes(key)) environment[key] = value;
  return { ...environment, ...extra };
}
export async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('NO_PORT')));
    });
  });
}
/** Any HTTP response means the server is listening; status and body are the app's business. */
export function responds(url: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise(accept => {
    let request: ReturnType<typeof httpRequest>;
    try {
      const target = new URL(url);
      request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { method: 'GET', timeout: timeoutMs, rejectUnauthorized: false, headers: { 'user-agent': 'Repro readiness probe' } }, response => { response.resume(); accept(true); });
    } catch { accept(false); return; }
    request.on('timeout', () => { request.destroy(); accept(false); });
    request.on('error', () => accept(false));
    request.end();
  });
}
function portOpen(origin: string, timeoutMs = 500): Promise<boolean> {
  return new Promise(accept => {
    const url = new URL(origin);
    const socket = createConnection({ host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) });
    const done = (open: boolean) => { socket.destroy(); accept(open); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
const pause = (ms: number) => new Promise(resolveTimer => setTimeout(resolveTimer, ms));
function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
function normalizeUrl(raw: string): string {
  const url = new URL(raw.replace('0.0.0.0', '127.0.0.1'));
  return url.href;
}
function lineCollector() {
  const lines: string[] = [];
  let partial = '';
  return {
    lines,
    push(chunk: Buffer | string, stream: 'out' | 'err') {
      const text = (partial + chunk.toString('utf8')).replace(ANSI, '');
      const parts = text.split(/\r?\n/);
      partial = parts.pop() ?? '';
      if (partial.length > 4000) { parts.push(partial); partial = ''; }
      for (const line of parts) {
        if (!line.trim()) continue;
        lines.push(`${stream === 'err' ? '[stderr] ' : ''}${line.slice(0, 1000)}`);
        if (lines.length > MAX_LINES) lines.shift();
      }
    },
  };
}

/** Start one fresh instance of the app and resolve once it answers HTTP on loopback. */
export async function startApp(plan: LaunchPlan, options: { signal?: AbortSignal } = {}): Promise<RunningApp> {
  if (options.signal?.aborted) throw new ReproError('cancelled', 'CANCELLED', 'The owner cancelled the run. Start a new run to retry.');
  if (plan.kind === 'external') return external(plan);
  if (plan.kind === 'static') return serveStatic(plan, options.signal);
  if (!plan.command || !plan.directory) throw new ReproError('input', 'APP_COMMAND', 'Repro needs the command that starts your app.');
  const port = await freePort();
  const command = plan.command.replaceAll('{port}', String(port));
  const environment = childEnvironment({ ...plan.env, PORT: String(port), HOST: '127.0.0.1', BROWSER: 'none', NO_COLOR: '1', FORCE_COLOR: '0' });
  const collector = lineCollector();
  let child: ChildProcess;
  try { child = spawn('/bin/sh', ['-c', command], { cwd: plan.directory, env: environment, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (cause) { throw new ReproError('environment', 'APP_START_FAILED', 'The app start command could not be run.', { cause }); }
  const pgid = child.pid!;
  let exitCode: number | null = null, exitSignal: string | null = null, closed = false;
  const exitedPromise = new Promise<void>(resolveExit => child.once('close', (code, signal) => { closed = true; exitCode = code; exitSignal = signal; resolveExit(); }));
  child.once('error', () => { closed = true; });
  child.stdout!.on('data', chunk => collector.push(chunk, 'out'));
  child.stderr!.on('data', chunk => collector.push(chunk, 'err'));
  let stopping: Promise<StopReceipt> | undefined;
  let origin = `http://127.0.0.1:${port}`;
  const stop = () => stopping ??= (async () => {
    const forced = await terminate(pgid, exitedPromise);
    const survivors = groupAlive(pgid);
    const portClosed = !(await portOpen(origin));
    return { stopped: !survivors && portClosed, forced, survivors, portClosed, external: false };
  })();
  const deadline = performance.now() + plan.startTimeoutMs;
  const configured = plan.url ? normalizeUrl(plan.url.replaceAll('{port}', String(port))) : null;
  try {
    for (;;) {
      if (options.signal?.aborted) throw new ReproError('cancelled', 'CANCELLED', 'The owner cancelled the run. Start a new run to retry.');
      if (closed) throw new ReproError('environment', 'APP_START_FAILED', `The app exited before it was ready (${exitSignal ? `signal ${exitSignal}` : `exit code ${exitCode}`}). Check its start command and logs.`);
      const printed = collector.lines.map(line => URL_PATTERN.exec(line)?.[0]).find(Boolean);
      const candidates = configured ? [configured] : [...(printed ? [normalizeUrl(printed)] : []), `http://127.0.0.1:${port}/`];
      for (const candidate of candidates) {
        if (await responds(candidate, 1000)) {
          origin = new URL(candidate).origin;
          return { url: candidate, origin, logs: () => [...collector.lines], stop, exited: () => closed };
        }
      }
      if (performance.now() >= deadline) throw new ReproError('environment', 'APP_START_TIMEOUT', `The app did not answer on a local address within ${Math.round(plan.startTimeoutMs / 1000)} s. Check that its start command serves HTTP on 127.0.0.1 or localhost.`);
      await pause(200);
    }
  } catch (error) {
    await stop();
    if (error instanceof ReproError) Object.assign(error, { logs: [...collector.lines] });
    throw error;
  }
}

/** SIGTERM the owned group, wait, then SIGKILL; returns whether force was needed. */
async function terminate(pgid: number, exited: Promise<void>): Promise<boolean> {
  if (!groupAlive(pgid)) { await Promise.race([exited, pause(500)]); return false; }
  try { process.kill(-pgid, 'SIGTERM'); } catch { /* the group may have exited between the probe and the signal */ }
  const graceful = performance.now() + 5000;
  while (groupAlive(pgid) && performance.now() < graceful) await pause(50);
  if (!groupAlive(pgid)) { await Promise.race([exited, pause(1000)]); return false; }
  try { process.kill(-pgid, 'SIGKILL'); } catch { /* exited during the grace period */ }
  const forced = performance.now() + 2000;
  while (groupAlive(pgid) && performance.now() < forced) await pause(50);
  await Promise.race([exited, pause(1000)]);
  return true;
}

async function external(plan: LaunchPlan): Promise<RunningApp> {
  const url = normalizeUrl(plan.url ?? '');
  if (!(await responds(url))) throw new ReproError('environment', 'APP_UNREACHABLE', 'The app did not respond at its local address. Check that it starts, then retry.');
  return { url, origin: new URL(url).origin, logs: () => [], exited: () => false,
    stop: async () => ({ stopped: true, forced: false, survivors: false, portClosed: false, external: true }) };
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json', '.wasm': 'application/wasm' };
/** Repro's own read-only static server for a folder with an index.html and no start script. */
async function serveStatic(plan: LaunchPlan, signal?: AbortSignal): Promise<RunningApp> {
  const root = await realpath(plan.directory!);
  const lines: string[] = [];
  const server: Server = createServer((request, response) => {
    void (async () => {
      let path: string;
      try { path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname); }
      catch { response.writeHead(400); response.end(); return; }
      if (request.method !== 'GET' && request.method !== 'HEAD' || path.split('/').some(part => part.startsWith('.') && part.length > 0) || path.includes('\0')) {
        response.writeHead(404); response.end(); lines.push(`${request.method} ${path} 404`); return;
      }
      let file = join(root, path);
      try {
        if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
        const real = await realpath(file);
        const inside = relative(root, real);
        if (inside.startsWith(`..${sep}`) || inside === '..' || isAbsolute(inside)) throw new Error('OUTSIDE_ROOT');
        const handle = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const info = await handle.stat();
          if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new Error('NOT_A_FILE');
          response.writeHead(200, { 'content-type': TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store', 'content-length': info.size });
          if (request.method === 'HEAD') response.end(); else response.end(await handle.readFile());
          lines.push(`${request.method} ${path} 200`);
        } finally { await handle.close(); }
      } catch { response.writeHead(404); response.end(); lines.push(`${request.method} ${path} 404`); }
      if (lines.length > MAX_LINES) lines.shift();
    })();
  });
  if (signal?.aborted) throw new ReproError('cancelled', 'CANCELLED', 'The owner cancelled the run. Start a new run to retry.');
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new ReproError('environment', 'APP_START_FAILED', 'Repro could not serve the static folder.');
  const origin = `http://127.0.0.1:${address.port}`;
  let stopping: Promise<StopReceipt> | undefined;
  return { url: `${origin}/`, origin, logs: () => [...lines], exited: () => !server.listening,
    stop: () => stopping ??= (async () => {
      server.closeAllConnections();
      await new Promise<void>(resolveClose => server.close(() => resolveClose()));
      const portClosed = !(await portOpen(origin));
      return { stopped: portClosed, forced: false, survivors: false, portClosed, external: false };
    })() };
}
