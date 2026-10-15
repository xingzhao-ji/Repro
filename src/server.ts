import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ReproError } from './contracts.js';
import { createAuthoredManifest, createManifest } from './manifest.js';
import { Coordinator, publicError } from './service.js';
import { Ledger, type Operation } from './ledger.js';
import { inspectJobInput, inspectTrial } from './evidence-inspector.js';

const html = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Repro · Evidence workbench</title><link rel="stylesheet" href="/web.css"></head><body><div id="root"></div><script type="module" src="/web.js"></script></body></html>';
function json(response: ServerResponse, status: number, value: unknown) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers['content-type'] !== 'application/json') throw new ReproError('input', 'CONTENT_TYPE', 'Use application/json.');
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk as Buffer);
    if (bytes > 16_384) throw new ReproError('input', 'BODY_TOO_LARGE', 'Request exceeds 16 KB.');
    chunks.push(Buffer.from(chunk as Buffer));
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (cause) { throw new ReproError('input', 'INVALID_JSON', 'Request body must be valid JSON.', { cause }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReproError('input', 'BODY', 'Expected a JSON object.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new ReproError('input', 'UNKNOWN_FIELD', 'Unknown request field; arbitrary origins, paths and commands are unsupported.'); }
export async function serve(options: { port: number; root: string }) {
  const ledger = new Ledger(options.root); const coordinator = new Coordinator(ledger);
  const token = randomBytes(32).toString('hex'); let origin = '';
  let closing: Promise<void> | undefined;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    void handle(request, response).catch(error => {
      if (!response.headersSent) json(response, error instanceof ReproError && error.code === 'NOT_FOUND' ? 404 : error instanceof ReproError && error.code === 'BUSY' ? 409 : error instanceof ReproError && error.category === 'input' ? 400 : 500, { error: publicError(error) });
      else response.destroy();
    });
  });
  server.requestTimeout = 10_000; server.headersTimeout = 10_000; server.maxHeadersCount = 40;
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (closing) { json(response, 503, { error: { category: 'cancelled', code: 'SHUTDOWN', reason: 'Workbench is shutting down.' } }); return; }
    const expectedHost = new URL(origin).host;
    if (request.headers.host !== expectedHost || (request.headers.origin && request.headers.origin !== origin) || request.headers['sec-fetch-site'] === 'cross-site') {
      json(response, 403, { error: { category: 'input', code: 'ORIGIN_DENIED', reason: 'Use the workbench’s exact loopback URL.', outcome: 'inconclusive' } }); return;
    }
    if (request.method !== 'GET' && request.method !== 'POST') { json(response, 405, { error: { category: 'unsupported', code: 'METHOD', reason: 'Method not supported.' } }); return; }
    if (request.method === 'POST') {
      const supplied = request.headers['x-repro-token'];
      if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) {
        json(response, 403, { error: { category: 'input', code: 'TOKEN_REQUIRED', reason: 'Reload the local workbench to renew its request token.', outcome: 'inconclusive' } }); return;
      }
    }
    const url = new URL(request.url ?? '/', origin); const path = url.pathname;
    if (request.method === 'GET') {
      if (path === '/api/config') { json(response, 200, { token, scope: 'Registered synthetic search only. Scripted capture with a supplied or caller-declared expectation checked against the registered contract; no human approval claimed. Linux-container portability requires a separately verified run.' }); return; }
      if (path === '/api/sessions') { json(response, 200, { sessions: ledger.sessions() }); return; }
      const session = /^\/api\/sessions\/([a-zA-Z0-9_-]{1,100})$/.exec(path);
      if (session?.[1]) { json(response, 200, { session: ledger.getSession(session[1]), jobs: ledger.jobs(session[1]) }); return; }
      const input = /^\/api\/jobs\/([a-zA-Z0-9_-]{1,100})\/input$/.exec(path);
      if (input?.[1]) { json(response, 200, await inspectJobInput(ledger, input[1])); return; }
      const trial = /^\/api\/jobs\/([a-zA-Z0-9_-]{1,100})\/trials\/(0|[1-9][0-9]{0,2})$/.exec(path);
      if (trial?.[1] && trial[2]) { json(response, 200, await inspectTrial(ledger, trial[1], Number(trial[2]))); return; }
      const job = /^\/api\/jobs\/([a-zA-Z0-9_-]{1,100})$/.exec(path);
      if (job?.[1]) { json(response, 200, { job: ledger.getJob(job[1]), events: ledger.events(job[1]) }); return; }
      if (path === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); return; }
      if (path === '/web.js' || path === '/web.css') {
        let file: Buffer;
        try { file = await readFile(new URL(`../dist${path}`, import.meta.url)); }
        catch (cause) { throw new ReproError('environment', 'UI_BUILD_MISSING', 'Run npm run build before starting the workbench.', { cause }); }
        response.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : 'text/css' }); response.end(file); return;
      }
    } else {
      const input = await body(request);
      if (path === '/api/sessions') {
        keys(input, ['consent', 'experiment']);
        const manifest = Object.hasOwn(input, 'experiment') ? createAuthoredManifest(input.experiment) : createManifest();
        const session = ledger.createSession(manifest, input.consent === true);
        json(response, 201, { session }); return;
      }
      const jobs = /^\/api\/sessions\/([a-zA-Z0-9_-]{1,100})\/jobs$/.exec(path);
      if (jobs?.[1]) {
        keys(input, ['operation', 'requestKey']);
        if (!['record', 'replay', 'reduce', 'verify', 'export'].includes(String(input.operation)) || typeof input.requestKey !== 'string') throw new ReproError('input', 'OPERATION', 'Choose a supported operation and supply a request key.');
        json(response, 202, { job: coordinator.start(jobs[1], input.operation as Operation, input.requestKey) }); return;
      }
      const cancel = /^\/api\/jobs\/([a-zA-Z0-9_-]{1,100})\/cancel$/.exec(path);
      if (cancel?.[1]) { keys(input, []); json(response, 202, { job: coordinator.cancel(cancel[1]) }); return; }
    }
    throw new ReproError('input', 'NOT_FOUND', 'Resource not found.');
  }
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port, '127.0.0.1', resolve); });
  } catch (error) { ledger.close(); throw error; }
  const address = server.address();
  if (!address || typeof address === 'string') throw new ReproError('environment', 'LISTEN_FAILED', 'Cannot resolve workbench address.');
  origin = `http://127.0.0.1:${address.port}`;
  return { url: origin, ledger, coordinator, close: () => closing ??= (async () => {
    const stopped = new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); });
    await coordinator.close();
    await stopped;
    ledger.close();
  })() };
}
