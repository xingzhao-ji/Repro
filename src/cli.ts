#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, type Browser } from 'playwright';
import { ReproError, VERSION, type Manifest, type RunResult } from './contracts.js';
import { createManifest } from './manifest.js';
import { readManifest } from './input.js';
import { importCapsule, exportCapsule } from './capsule.js';
import { runBrowser } from './adapter.js';
import { reduce } from './reducer.js';
import { verify, publicError } from './service.js';
import { ownedDirectory, regularOwnedFile, writeOwnedFile } from './paths.js';

const help = `Repro ${VERSION} — local synthetic failure compiler

Commands:
  doctor                             Inspect browser and Linux container prerequisites
  record --consent                    Capture the registered synthetic browser scenario
  replay --manifest FILE              Replay a validated manifest
  replay --capsule DIRECTORY          Validate bundle integrity before replay
  reduce --manifest FILE              Reduce browser actions with a bounded budget
  verify --manifest FILE              Compare original and registered fixed revision
  export --manifest FILE              Export a validated, conventional test bundle
  inspect --manifest FILE             Inspect the declared execution boundary
  serve                              Open the local workbench (loopback only)

Options: --output DIRECTORY (under .repro-runs), --revision buggy|fixed,
         --budget COUNT (reduce), --port PORT (serve), --help
Each execution needs a new output directory; serve reopens its workbench state.
Browser install: PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx playwright install chromium --only-shell
Use the same PLAYWRIGHT_BROWSERS_PATH when invoking Repro.
Scope: trusted, explicitly registered synthetic frontend only. No human approval claimed.
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
  return { runnerVersion: VERSION, node: process.version, platform: `${process.platform}-${process.arch}`, browser, linuxContainer: container.status === 0 ? { available: true, version: container.stdout.trim() } : { available: false, reason: 'Docker engine unavailable; fresh Linux-container replay remains unverified.' }, scope: 'Trusted registered synthetic fixture; no arbitrary capsule execution, credentials, or LLM required.' };
}
async function main(): Promise<void> {
  const parsed = parseArgs({ allowPositionals: true, strict: true, options: {
    help: { type: 'boolean' }, consent: { type: 'boolean' }, manifest: { type: 'string' }, capsule: { type: 'string' }, output: { type: 'string' }, revision: { type: 'string' }, budget: { type: 'string' }, port: { type: 'string' }
  } });
  const command = parsed.positionals[0]; const options = parsed.values;
  if (options.help || !command) { console.log(help); return; }
  if (parsed.positionals.length !== 1) throw new ReproError('input', 'ARGUMENTS', 'Expected one command. Use --help.');
  if (command === 'doctor') { console.log(JSON.stringify(await doctor(), null, 2)); return; }
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
  if (command === 'record' && !options.consent) throw new ReproError('input', 'CONSENT_REQUIRED', 'Use --consent to opt in to capture of the registered synthetic fixture only.');
  if (options.manifest && options.capsule) throw new ReproError('input', 'ARGUMENTS', 'Choose either --manifest or --capsule.');
  let manifest: Manifest;
  if (options.capsule) manifest = await importCapsule(resolve(options.capsule));
  else if (options.manifest) {
    manifest = await readManifest(resolve(options.manifest));
  } else if (command === 'record') manifest = createManifest();
  else throw new ReproError('input', 'MANIFEST_REQUIRED', 'Provide --manifest FILE or --capsule DIRECTORY.');
  if (options.revision && !['buggy', 'fixed'].includes(options.revision)) throw new ReproError('unsupported', 'REVISION_UNSUPPORTED', 'Only registered buggy and fixed revisions are supported.');
  if (command === 'inspect') { console.log(JSON.stringify(manifest, null, 2)); return; }
  const budget = Number(options.budget ?? '50');
  if (command === 'reduce' && (!Number.isInteger(budget) || budget < 1 || budget > 200)) throw new ReproError('input', 'BUDGET', 'Execution budget must be 1–200.');
  const output = command === 'export' ? resolve(options.output ?? `.repro-runs/export-${Date.now()}`) : ownedDirectory(options.output ?? `.repro-runs/${command}-${Date.now()}`, { exclusive: true });
  const controller = new AbortController();
  const cancel = () => controller.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let result: unknown;
  try {
    if (command === 'export') result = await exportCapsule(manifest, output, { signal: controller.signal });
    else {
      await mkdir(output, { recursive: true, mode: 0o700 });
      for (const leaf of ['manifest.json', 'result.json', ...(command === 'reduce' ? ['reduced.manifest.json'] : [])]) regularOwnedFile(join(output, leaf));
      await writeOwnedFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
      if (command === 'reduce') {
        const reduced = await reduce(manifest, runBrowser, { artifactDir: output, maxExecutions: budget, maxDurationMs: 120_000, repetitions: 2, signal: controller.signal });
        result = reduced;
        await writeOwnedFile(join(output, 'reduced.manifest.json'), JSON.stringify(reduced.manifest, null, 2));
      } else if (command === 'verify') result = await verify(manifest, output, controller.signal);
      else result = await runBrowser(manifest, { artifactDir: output, signal: controller.signal, ...(options.revision ? { revision: options.revision as 'buggy' | 'fixed' } : {}) });
      await writeOwnedFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
    }
    console.log(JSON.stringify({ output, result }, null, 2));
    const verdict = result as Partial<RunResult> & { status?: string };
    process.exitCode = verdict.outcome === 'cancelled' || verdict.status === 'cancelled' ? 130 : verdict.outcome === 'inconclusive' || verdict.status === 'inconclusive' ? 2 : verdict.outcome === 'target-failure' ? 1 : 0;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
main().catch(error => {
  const failure = error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS')
    ? new ReproError('input', 'ARGUMENTS', 'Invalid command arguments. Use --help.', { cause: error }) : error;
  console.error(JSON.stringify(publicError(failure), null, 2)); process.exitCode = 2;
});
