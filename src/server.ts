import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ReproError, type BrowserCaseExpectation } from './contracts.js';
import { createAuthoredManifest, createManifest } from './manifest.js';
import { createCaseManifest, listRegisteredCases } from './browser-case.js';
import { execFile } from 'node:child_process';
import { readFile as readText } from 'node:fs/promises';
import { join, relative, sep, isAbsolute } from 'node:path';
import { Coordinator, ReportCoordinator, publicError } from './service.js';
import { Ledger, type Operation } from './ledger.js';
import { executionScope, prepareReport, type ReportRequest } from './report-flow.js';
import { createExampleApp, EXAMPLE_DESCRIPTION } from './example-app.js';
import { inspectJobInput, inspectTrial } from './evidence-inspector.js';

const html = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Repro</title><link rel="stylesheet" href="/web.css"></head><body><div id="root"></div><script type="module" src="/web.js"></script></body></html>';
function json(response: ServerResponse, status: number, value: unknown) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
async function body(request: IncomingMessage, limit = 16_384): Promise<Record<string, unknown>> {
  if (request.headers['content-type'] !== 'application/json') throw new ReproError('input', 'CONTENT_TYPE', 'Use application/json.');
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk as Buffer);
    if (bytes > limit) throw new ReproError('input', 'BODY_TOO_LARGE', `Request exceeds ${Math.round(limit / 1024)} KB.`);
    chunks.push(Buffer.from(chunk as Buffer));
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (cause) { throw new ReproError('input', 'INVALID_JSON', 'Request body must be valid JSON.', { cause }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReproError('input', 'BODY', 'Expected a JSON object.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new ReproError('input', 'UNKNOWN_FIELD', 'Unknown request field; arbitrary origins, paths and commands are unsupported.'); }
function declaredManifest(input: unknown) {
  if (input && typeof input === 'object' && !Array.isArray(input) && Object.hasOwn(input, 'caseId')) {
    const declaration = input as Record<string, unknown>;
    keys(declaration, ['caseId', 'expectation']);
    if (typeof declaration.caseId !== 'string' || !Object.hasOwn(declaration, 'expectation') || !declaration.expectation || typeof declaration.expectation !== 'object' || Array.isArray(declaration.expectation)) {
      throw new ReproError('input', 'CASE_EXPECTATION_REQUIRED', 'Choose a registered case and explicitly review its expected behavior before starting capture.');
    }
    return createCaseManifest(declaration.caseId, declaration.expectation as BrowserCaseExpectation);
  }
  return createAuthoredManifest(input);
}
const string = (value: unknown, name: string, maximum: number): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > maximum) throw new ReproError('input', 'FIELD', `${name} must be text of at most ${maximum} characters.`);
  return value;
};
/** The one-page report request: app location, the two descriptions and optional answers to earlier questions. */
function reportRequest(input: Record<string, unknown>, confirmed: boolean): ReportRequest {
  keys(input, ['app', 'title', 'wentWrong', 'shouldHappen', 'confirmed', 'requestKey', 'checkSelectors', 'reportBlocked']);
  const app = input.app && typeof input.app === 'object' && !Array.isArray(input.app) ? input.app as Record<string, unknown> : {};
  keys(app, ['repository', 'url', 'start']);
  const selectors = input.checkSelectors && typeof input.checkSelectors === 'object' && !Array.isArray(input.checkSelectors) ? input.checkSelectors as Record<string, unknown> : {};
  if (Object.entries(selectors).some(([index, selector]) => !/^\d$/.test(index) || typeof selector !== 'string' || selector.length > 300)) throw new ReproError('input', 'FIELD', 'Choose an element for each unclear check.');
  const title = string(input.title, 'Title', 120);
  return {
    app: { repository: string(app.repository, 'App folder', 1000), url: string(app.url, 'URL', 500), start: string(app.start, 'Start command', 500) },
    ...(title ? { title } : {}),
    wentWrong: string(input.wentWrong, 'What went wrong', 6000) ?? '', shouldHappen: string(input.shouldHappen, 'What should happen', 6000) ?? '', confirmed,
    options: { checkSelectors: selectors as Record<number, string>, reportBlocked: input.reportBlocked === true },
  };
}
function appSummary(profile: Awaited<ReturnType<typeof prepareReport>>['profile']) {
  return { name: profile.name, directory: profile.directory, run: profile.plan ? { kind: profile.plan.kind, command: profile.plan.command, url: profile.plan.url, source: profile.plan.source } : null,
    install: profile.install, dependenciesInstalled: profile.dependenciesInstalled,
    source: profile.git ? { commit: profile.git.commit, branch: profile.git.branch, dirty: profile.git.dirty, changed: profile.git.changed.length + profile.git.untracked.length, remote: profile.git.remotes[0]?.url ?? null, pushed: profile.git.pushedTo.length > 0 } : null,
    missing: profile.missing, notes: profile.notes };
}
/** macOS only: the native folder chooser, run on this machine for the local workbench user. */
function chooseFolder(): Promise<string | null> {
  if (process.platform !== 'darwin') return Promise.reject(new ReproError('unsupported', 'CHOOSER_UNAVAILABLE', 'Type or paste the folder path on this platform.'));
  return new Promise((resolve, reject) => execFile('osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose your app folder for Repro")'], { timeout: 300_000 }, (error, stdout) => {
    if (error) { if (/User canceled|-128/.test(String(error.message) + String(stdout))) resolve(null); else reject(new ReproError('environment', 'CHOOSER_FAILED', 'The folder chooser could not open. Type or paste the path instead.')); return; }
    resolve(stdout.trim().replace(/\/$/, '') || null);
  }));
}
export async function serve(options: { port: number; root: string; reportDefaults?: NonNullable<ReportRequest['options']> }) {
  const ledger = new Ledger(options.root); const coordinator = new Coordinator(ledger); const reports = new ReportCoordinator(ledger, options.reportDefaults);
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
      if (path === '/api/config') {
        const cases = listRegisteredCases().map(registered => ({ id: registered.id, title: registered.title, expectation: registered.expectation, issue: registered.issue, contractUrls: registered.expectationUrls, repository: registered.repository }));
        json(response, 200, { token, cases, platform: process.platform, example: EXAMPLE_DESCRIPTION, scope: 'Your local web app, plus registered example cases. Every result comes from actual local runs; no AI service or upload is involved. Accessibility remains deferred and unverified.' }); return;
      }
      if (path === '/api/reports') { json(response, 200, { reports: ledger.reports().map(item => ({ id: item.id, createdAt: item.createdAt, status: item.status, title: (item.request as { title?: string | null }).title ?? null, summary: (item.result as { summary?: string } | null)?.summary ?? null })) }); return; }
      const reportMarkdown = /^\/api\/reports\/([a-zA-Z0-9_-]{1,100})\/markdown$/.exec(path);
      if (reportMarkdown?.[1]) {
        const report = ledger.getReport(reportMarkdown[1]);
        const location = (report.result as { path?: string | null } | null)?.path;
        const inside = location ? relative(join(ledger.root, 'reports', report.id), location) : '..';
        if (!location || inside !== 'REPRO.md' || isAbsolute(inside) || inside.startsWith(`..${sep}`)) throw new ReproError('input', 'NOT_FOUND', 'This report has no REPRO.md.');
        const markdown = await readText(location, 'utf8');
        response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', ...(url.searchParams.get('download') === '1' ? { 'Content-Disposition': 'attachment; filename="REPRO.md"' } : {}) });
        response.end(markdown); return;
      }
      const reportJob = /^\/api\/reports\/([a-zA-Z0-9_-]{1,100})$/.exec(path);
      // The request returns only to this same-origin local page, so "Edit and try again" survives a refresh.
      if (reportJob?.[1]) { const report = ledger.getReport(reportJob[1]); json(response, 200, { report: { ...report, title: (report.request as { title?: string | null }).title ?? null }, events: ledger.reportEvents(report.id) }); return; }
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
      const input = await body(request, path.startsWith('/api/reports') ? 65_536 : 16_384);
      if (path === '/api/app/inspect') {
        keys(input, ['repository', 'url', 'start']);
        const prepared = await prepareReport({ app: { repository: string(input.repository, 'App folder', 1000), url: string(input.url, 'URL', 500), start: string(input.start, 'Start command', 500) }, wentWrong: '', shouldHappen: '', confirmed: false });
        json(response, 200, { app: appSummary(prepared.profile), scope: executionScope(prepared.profile) }); return;
      }
      if (path === '/api/app/choose-folder') { keys(input, []); json(response, 200, { path: await chooseFolder() }); return; }
      if (path === '/api/examples/local-app') { keys(input, []); json(response, 201, await createExampleApp(ledger.root)); return; }
      if (path === '/api/reports/prepare') {
        const prepared = await prepareReport(reportRequest(input, false));
        json(response, 200, { questions: prepared.questions.filter(question => question.field !== 'confirm'), understood: prepared.understood, app: appSummary(prepared.profile), scope: executionScope(prepared.profile) }); return;
      }
      if (path === '/api/reports') {
        if (input.confirmed !== true) throw new ReproError('input', 'CONFIRM_REQUIRED', 'Confirm the steps, checks and what Repro will run first.');
        if (typeof input.requestKey !== 'string') throw new ReproError('input', 'OPERATION', 'Supply a request key.');
        json(response, 202, { report: reports.start(reportRequest(input, true), input.requestKey) }); return;
      }
      const reportCancel = /^\/api\/reports\/([a-zA-Z0-9_-]{1,100})\/cancel$/.exec(path);
      if (reportCancel?.[1]) { keys(input, []); json(response, 202, { report: reports.cancel(reportCancel[1]) }); return; }
      if (path === '/api/sessions') {
        keys(input, ['consent', 'experiment']);
        const manifest = Object.hasOwn(input, 'experiment') ? declaredManifest(input.experiment) : createManifest();
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
  return { url: origin, ledger, coordinator, reports, close: () => closing ??= (async () => {
    const stopped = new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); });
    await coordinator.close();
    await reports.close();
    await stopped;
    ledger.close();
  })() };
}
