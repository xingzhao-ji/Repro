#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, type Browser } from 'playwright';
import { ReproError, VERSION, type Manifest, type RunResult } from './contracts.js';
import { createManifest } from './manifest.js';
import { readExperiment, readManifest } from './input.js';
import { importCapsule, exportCapsule } from './capsule.js';
import { runExperiment } from './runner.js';
import { getRegisteredCase, listRegisteredCases } from './browser-case.js';
import { reduce } from './reducer.js';
import { verify, publicError } from './service.js';
import { ownedDirectory, regularOwnedFile, writeOwnedFile } from './paths.js';

const help = `Repro ${VERSION} — turn a bug in your local web app into one REPRO.md

Your app:
  report --app DIR --went-wrong TEXT --should-happen TEXT [--url URL] [--start CMD]
         [--title TEXT] [--yes] [--budget RUNS] [--no-fresh-check] [--report-blocked] [--steps-independent]
                                     Reproduce the bug, shorten the steps and write REPRO.md
  report --issue FILE [--yes]        The same, from a JSON file {app, url, start, title, wentWrong, shouldHappen}
  app --app DIR [--url URL] [--start CMD]
                                     Show how Repro would run the app (read-only)

Built-in examples and registered cases:
  doctor                             Inspect browser and Linux container prerequisites
  cases [--case ID]                  Inspect registered public cases / explicit declaration
  record --consent                    Capture the registered synthetic browser scenario
  record --consent --experiment FILE  Freeze an explicit registered-case or search expectation
  replay --manifest FILE              Replay a validated manifest
  replay --capsule DIRECTORY          Validate bundle integrity before replay
  reduce --manifest FILE              Reduce browser actions with a bounded budget
  verify --manifest FILE              Compare original and registered fixed revision
  export --manifest FILE              Export a validated, conventional test bundle
  inspect --manifest FILE             Inspect the declared execution boundary
  serve                              Open the local workbench (loopback only)

Options: --output DIRECTORY (under .repro-runs), --revision buggy|fixed,
         --budget COUNT (reduce, report), --port PORT (serve), --help
In --went-wrong, write one step per line (Click "Add", Type "milk" into "Item", Press Enter);
in --should-happen, name the element and value ("Total" should show "$8.10"). See docs/QUICKSTART.md.
Each execution needs a new output directory; serve reopens its workbench state.
Browser install: PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx playwright install chromium --only-shell
Use the same PLAYWRIGHT_BROWSERS_PATH when invoking Repro.
Scope: registered public browser-library cases and the synthetic frontend. No human approval claimed.
`;
export async function doctor() {
  let browser: { available: boolean; version?: string; reason?: string };
  let instance: Browser | undefined;
  const channel = process.env.REPRO_BROWSER_CHANNEL;
  try {
    if (channel && channel !== 'chrome') throw new ReproError('unsupported', 'BROWSER_CHANNEL', 'Only explicit installed chrome or the default pinned Chromium is supported.');
    instance = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 5000, ...(channel ? { channel } : {}) });
    const context = await instance.newContext(); const page = await context.newPage();
    await page.setContent('<button onclick="this.textContent=\'Observed\'">Probe</button>');
    await page.getByRole('button', { name: 'Probe' }).click({ timeout: 3000 });
    await page.getByRole('button', { name: 'Observed' }).waitFor({ timeout: 3000 });
    await page.screenshot({ timeout: 3000 });
    browser = { available: true, version: `${instance.version()} (${channel ?? 'pinned chromium'})` };
  } catch { browser = { available: false, reason: 'Browser could not complete a sandboxed click and screenshot. Install the pinned browser, or explicitly select an installed Chrome with REPRO_BROWSER_CHANNEL=chrome for local development.' }; }
  finally { await instance?.close(); }
  const container = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 5000, maxBuffer: 4096 });
  return { runnerVersion: VERSION, node: process.version, platform: `${process.platform}-${process.arch}`, browser, linuxContainer: container.status === 0 ? { available: true, version: container.stdout.trim() } : { available: false, reason: 'Docker engine unavailable; fresh Linux-container replay remains unverified.' }, scope: 'Registered public browser-library cases and synthetic fixture; no arbitrary capsule execution, credentials, or LLM required.' };
}
// Set only by this process's own SIGINT/SIGTERM handler for an operation.
let ownerCancelled = false;
async function main(): Promise<void> {
  const parsed = parseArgs({ allowPositionals: true, strict: true, options: {
    help: { type: 'boolean' }, case: { type: 'string' }, consent: { type: 'boolean' }, manifest: { type: 'string' }, capsule: { type: 'string' }, experiment: { type: 'string' }, output: { type: 'string' }, revision: { type: 'string' }, budget: { type: 'string' }, port: { type: 'string' },
    app: { type: 'string' }, url: { type: 'string' }, start: { type: 'string' }, title: { type: 'string' }, 'went-wrong': { type: 'string' }, 'should-happen': { type: 'string' },
    issue: { type: 'string' }, yes: { type: 'boolean' }, 'no-fresh-check': { type: 'boolean' }, 'report-blocked': { type: 'boolean' }, 'steps-independent': { type: 'boolean' },
  } });
  const command = parsed.positionals[0]; const options = parsed.values;
  if (options.help || !command) { console.log(help); return; }
  if (parsed.positionals.length !== 1) throw new ReproError('input', 'ARGUMENTS', 'Expected one command. Use --help.');
  if (options.experiment !== undefined && (command !== 'record' || options.manifest !== undefined || options.capsule !== undefined)) throw new ReproError('input', 'ARGUMENTS', 'Use --experiment only with record, without --manifest or --capsule.');
  if (options.case !== undefined && command !== 'cases') throw new ReproError('input', 'ARGUMENTS', 'Use --case with cases to inspect a declaration; record with --experiment FILE.');
  if (command === 'cases') {
    const cases = options.case ? [getRegisteredCase(options.case)] : listRegisteredCases();
    const declarations = cases.map(item => ({ caseId: item.id, expectation: item.expectation }));
    console.log(JSON.stringify(options.case ? declarations[0] : declarations, null, 2)); return;
  }
  if (command === 'doctor') { console.log(JSON.stringify(await doctor(), null, 2)); return; }
  const reportOptions = ['app', 'url', 'start', 'title', 'went-wrong', 'should-happen', 'issue', 'yes', 'no-fresh-check', 'report-blocked', 'steps-independent'] as const;
  if (command !== 'report' && command !== 'app' && reportOptions.some(name => options[name] !== undefined)) throw new ReproError('input', 'ARGUMENTS', 'Use --app, --url, --went-wrong and the other report options with report or app.');
  if (command === 'app') {
    const { inspectApp } = await import('./app-inspect.js');
    const profile = await inspectApp({ repository: options.app, url: options.url, start: options.start });
    console.log(JSON.stringify({ name: profile.name, run: profile.plan ? { kind: profile.plan.kind, command: profile.plan.command, url: profile.plan.url, source: profile.plan.source } : null,
      install: profile.install, dependenciesInstalled: profile.dependenciesInstalled,
      source: profile.git ? { commit: profile.git.commit, branch: profile.git.branch, remotes: profile.git.remotes, pushedTo: profile.git.pushedTo, dirty: profile.git.dirty, changed: profile.git.changed.length, untracked: profile.git.untracked.length, omitted: profile.git.omitted } : null,
      missing: profile.missing, notes: profile.notes }, null, 2));
    process.exitCode = profile.missing.length ? 2 : 0; return;
  }
  if (command === 'report') { await report(options); return; }
  if (command === 'serve') {
    const port = Number(options.port ?? '4318');
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ReproError('input', 'PORT', 'Port must be between 0 and 65535.');
    const { serve } = await import('./server.js');
    const service = await serve({ port, root: ownedDirectory(options.output ?? '.repro-runs/workbench') });
    console.log(`Repro workbench: ${service.url}`);
    const shutdown = () => { void service.close().catch(() => { process.exitCode = 2; }); };
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); return;
  }
  if (!['record', 'replay', 'reduce', 'verify', 'export', 'inspect'].includes(command)) throw new ReproError('unsupported', 'COMMAND_UNSUPPORTED', `Unsupported command: ${command}`);
  if (command === 'record' && !options.consent) throw new ReproError('input', 'CONSENT_REQUIRED', 'Use --consent to opt in to the declared registered case capture.');
  if (options.manifest && options.capsule) throw new ReproError('input', 'ARGUMENTS', 'Choose either --manifest or --capsule.');
  let manifest: Manifest;
  if (options.experiment !== undefined) manifest = await readExperiment(resolve(options.experiment));
  else if (options.capsule) manifest = await importCapsule(resolve(options.capsule));
  else if (options.manifest) {
    manifest = await readManifest(resolve(options.manifest));
  } else if (command === 'record') manifest = createManifest();
  else throw new ReproError('input', 'MANIFEST_REQUIRED', 'Provide --manifest FILE or --capsule DIRECTORY.');
  if (options.revision && !['buggy', 'fixed'].includes(options.revision)) throw new ReproError('unsupported', 'REVISION_UNSUPPORTED', 'Only registered buggy and fixed revisions are supported.');
  if (command === 'inspect') { console.log(JSON.stringify(manifest, null, 2)); return; }
  const budget = Number(options.budget ?? (manifest.schemaVersion === 3 ? '80' : '50'));
  if (command === 'reduce' && (!Number.isInteger(budget) || budget < 1 || budget > 200)) throw new ReproError('input', 'BUDGET', 'Execution budget must be 1–200.');
  const output = command === 'export' ? resolve(options.output ?? `.repro-runs/export-${Date.now()}`) : ownedDirectory(options.output ?? `.repro-runs/${command}-${Date.now()}`, { exclusive: true });
  const controller = new AbortController();
  const cancel = () => { ownerCancelled = true; controller.abort(); }; process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let result: unknown;
  try {
    if (command === 'export') result = await exportCapsule(manifest, output, { signal: controller.signal });
    else {
      await mkdir(output, { recursive: true, mode: 0o700 });
      for (const leaf of ['manifest.json', 'result.json', ...(command === 'reduce' ? ['reduced.manifest.json'] : [])]) regularOwnedFile(join(output, leaf));
      await writeOwnedFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
      if (command === 'reduce') {
        const reduced = await reduce(manifest, runExperiment, { artifactDir: output, maxExecutions: budget, maxDurationMs: manifest.schemaVersion === 3 ? 300_000 : 120_000, repetitions: 2, signal: controller.signal });
        result = reduced;
        await writeOwnedFile(join(output, 'reduced.manifest.json'), JSON.stringify(reduced.manifest, null, 2));
      } else if (command === 'verify') result = await verify(manifest, output, controller.signal);
      else result = await runExperiment(manifest, { artifactDir: output, signal: controller.signal, ...(options.revision ? { revision: options.revision as 'buggy' | 'fixed' } : {}) });
      await writeOwnedFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
    }
    console.log(JSON.stringify({ output, result }, null, 2));
    const verdict = result as Partial<RunResult> & { status?: string };
    process.exitCode = verdict.outcome === 'cancelled' || verdict.status === 'cancelled' ? 130 : verdict.outcome === 'inconclusive' || verdict.status === 'inconclusive' ? 2 : verdict.outcome === 'target-failure' ? 1 : 0;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
type ReportCliOptions = { app?: string | undefined; url?: string | undefined; start?: string | undefined; title?: string | undefined; 'went-wrong'?: string | undefined; 'should-happen'?: string | undefined;
  issue?: string | undefined; yes?: boolean | undefined; 'no-fresh-check'?: boolean | undefined; 'report-blocked'?: boolean | undefined; 'steps-independent'?: boolean | undefined; budget?: string | undefined; output?: string | undefined };
async function report(options: ReportCliOptions): Promise<void> {
  const { generateReport, prepareReport, slugify } = await import('./report-flow.js');
  let input: Record<string, unknown> = {};
  if (options.issue) {
    const { readFile } = await import('node:fs/promises');
    try { input = JSON.parse(await readFile(resolve(options.issue), 'utf8')); }
    catch (cause) { throw new ReproError('input', 'ISSUE_FILE', 'The --issue file must be a JSON object with wentWrong and shouldHappen.', { cause }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ReproError('input', 'ISSUE_FILE', 'The --issue file must be a JSON object.');
  }
  const text = (value: unknown) => typeof value === 'string' ? value : undefined;
  const request = {
    app: { repository: options.app ?? text(input['app']), url: options.url ?? text(input['url']), start: options.start ?? text(input['start']) },
    ...((options.title ?? text(input['title'])) ? { title: (options.title ?? text(input['title']))! } : {}),
    wentWrong: options['went-wrong'] ?? text(input['wentWrong']) ?? '', shouldHappen: options['should-happen'] ?? text(input['shouldHappen']) ?? '',
    confirmed: false,
    options: { ...(options.budget ? { budget: Number(options.budget) } : {}), freshCheck: !options['no-fresh-check'], reportBlocked: options['report-blocked'] === true, stepsIndependent: options['steps-independent'] === true },
  };
  if (options.budget !== undefined && (!Number.isInteger(Number(options.budget)) || Number(options.budget) < 8 || Number(options.budget) > 120)) throw new ReproError('input', 'BUDGET', 'The report budget must be 8–120 runs.');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  const outputFor = () => options.output ?? `.repro-runs/reports/${stamp}-${slugify(request.title ?? request.wentWrong.split('\n')[0] ?? 'bug')}`;
  // First pass: understand and ask, never run. The reporter confirms the parsed checks and execution scope.
  const preview = await prepareReport({ ...request, confirmed: false });
  const blocking = preview.questions.filter(question => question.field !== 'confirm');
  if (blocking.length) { printReport({ status: 'needs-input', summary: 'Repro needs a little more information before it can run.', path: null, evidenceDir: '', questions: blocking }); process.exitCode = 2; return; }
  const profile = preview.profile;
  const { executionScope } = await import('./report-flow.js');
  const scope = executionScope(profile, request.options.freshCheck);
  process.stderr.write(['Repro understood:', ...preview.understood.steps.map((step, index) => `  ${index + 1}. ${step}`), 'It will check:', ...preview.understood.checks.map(check => `  - ${check}`),
    'It will:', ...scope.map(line => `  - ${line}`), ''].join('\n'));
  let confirmed = options.yes === true;
  if (!confirmed) {
    if (!process.stdin.isTTY) throw new ReproError('input', 'CONFIRM_REQUIRED', 'Review the steps, checks and scope above, then rerun with --yes to confirm them.');
    const { createInterface } = await import('node:readline/promises');
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try { confirmed = /^y(es)?$/i.test((await prompt.question('Is this right, and may Repro run it? [y/N] ')).trim()); }
    catch (error) {
      // Ctrl-C at the prompt cancels before anything ran.
      if ((error as { code?: string }).code !== 'ABORT_ERR') throw error;
      prompt.close();
      console.log(JSON.stringify({ status: 'cancelled', reason: 'Nothing was run.' }, null, 2)); ownerCancelled = true; process.exitCode = 130; return;
    }
    prompt.close();
    if (!confirmed) { console.log(JSON.stringify({ status: 'not-confirmed', reason: 'Nothing was run.' }, null, 2)); process.exitCode = 2; return; }
  }
  const controller = new AbortController();
  const cancel = () => { ownerCancelled = true; controller.abort(); };
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const outcome = await generateReport({ ...request, confirmed: true }, { output: outputFor(), signal: controller.signal,
      onProgress: progress => process.stderr.write(`[${progress.stage}] ${progress.message}\n`) });
    printReport(outcome);
    process.exitCode = outcome.status === 'cancelled' ? 130 : outcome.status === 'needs-input' ? 2 : 0;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
function printReport(outcome: { status: string; summary: string; path: string | null; evidenceDir: string; questions: { field: string; question: string; suggestion?: string; candidates?: { selector: string; text: string }[] }[] }) {
  console.log(JSON.stringify({ status: outcome.status, summary: outcome.summary, report: outcome.path, evidence: outcome.evidenceDir,
    ...(outcome.questions.length ? { questions: outcome.questions } : {}) }, null, 2));
  if (outcome.path) process.stderr.write(`\nREPRO.md written to ${outcome.path}\n`);
}
main().catch(error => {
  const failure = error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS')
    ? new ReproError('input', 'ARGUMENTS', 'Invalid command arguments. Use --help.', { cause: error }) : error;
  const reported = publicError(failure);
  console.error(JSON.stringify(reported, null, 2));
  // An owner interrupt that stops an operation before it returns a result (an
  // export) is still a cancellation, not an invalid or inconclusive run.
  process.exitCode = ownerCancelled && reported.outcome === 'cancelled' ? 130 : 2;
});
