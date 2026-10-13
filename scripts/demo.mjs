#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(project, 'dist/cli.js');
const limits = { totalDurationMs: 300_000, outputBytesPerCommand: 4 * 1024 * 1024, reductionExecutions: 50, cancellationGraceMs: 5000 };
if (process.argv.length > 2) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log('Run npm ci and npm run build first. Install the pinned Playwright Chromium, or explicitly select installed Chrome with REPRO_BROWSER_CHANNEL=chrome. Then run npm run demo. This executes the registered synthetic localhost record/reduce/verify/export/replay journey and writes bounded command receipts plus summary.json under .repro-runs/demo/<unique-id>. This local demo does not establish Linux-container portability.');
    process.exit(0);
  }
  console.error('The demo accepts only --help or no arguments.');
  process.exit(2);
}

async function ownedParent(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Demo output parent must be an owned directory without symbolic links.');
}
await ownedParent(join(project, '.repro-runs'));
await ownedParent(join(project, '.repro-runs/demo'));
const output = join(project, '.repro-runs/demo', randomUUID());
await mkdir(output, { mode: 0o700 });
const started = performance.now();
const summary = {
  status: 'incomplete', classification: 'synthetic-training-fixture', startedAt: new Date().toISOString(),
  environment: { platform: `${process.platform}-${process.arch}`, node: process.version, browserSelection: process.env.REPRO_BROWSER_CHANNEL ?? 'pinned chromium' },
  limits, steps: [], observations: {},
  limitations: ['Localhost execution only; this script does not establish fresh Linux-container portability.', 'One registered synthetic scenario; no historical-bug or arbitrary-app coverage.', 'Expectation is supplied synthetic specification; no human approval claimed.'],
};
let cancelRequested = false;
let stopActive;
const cancel = () => { cancelRequested = true; stopActive?.('cancelled'); };
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
const check = (condition, reason) => { if (!condition) throw new Error(reason); };
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function runCommand(name, args, timeoutMs) {
  const remaining = limits.totalDurationMs - (performance.now() - started);
  check(!cancelRequested, 'Demo cancelled before command execution.');
  check(remaining > 0, 'Demo total duration limit reached.');
  const began = performance.now();
  const stdoutPath = join(output, `${name}.stdout.json`);
  const stderrPath = join(output, `${name}.stderr.log`);
  const receipt = { name, args, timeoutMs: Math.min(timeoutMs, remaining), stdoutPath, stderrPath, exitCode: null, signal: null, stopReason: null, spawnError: null, outputBytesObserved: 0, outputTruncated: false, durationMs: 0 };
  const stdout = []; const stderr = [];
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: project, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(project, '.repro-cache/browsers') },
  });
  let escalation;
  const stop = reason => {
    if (receipt.stopReason !== null) return;
    receipt.stopReason = reason;
    child.kill('SIGTERM');
    escalation = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, limits.cancellationGraceMs);
  };
  stopActive = stop;
  const timeout = setTimeout(() => stop('duration-limit'), receipt.timeoutMs);
  function collect(target, chunk) {
    const available = Math.max(0, limits.outputBytesPerCommand - receipt.outputBytesObserved);
    receipt.outputBytesObserved += chunk.length;
    if (available) target.push(chunk.subarray(0, available));
    if (chunk.length > available) { receipt.outputTruncated = true; stop('output-limit'); }
  }
  child.stdout.on('data', chunk => collect(stdout, chunk));
  child.stderr.on('data', chunk => collect(stderr, chunk));
  await new Promise(resolveClose => {
    child.once('error', error => { receipt.spawnError = error.code ?? 'PROCESS_START_FAILED'; });
    child.once('close', (code, signal) => { receipt.exitCode = code; receipt.signal = signal; resolveClose(); });
  });
  clearTimeout(timeout); clearTimeout(escalation); stopActive = undefined;
  receipt.durationMs = performance.now() - began;
  const out = Buffer.concat(stdout).toString('utf8');
  await writeFile(stdoutPath, out, { mode: 0o600 });
  await writeFile(stderrPath, Buffer.concat(stderr), { mode: 0o600 });
  await writeFile(join(output, `${name}.receipt.json`), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  summary.steps.push(receipt);
  return { receipt, out };
}

async function step(name, args, expectedExit, timeoutMs) {
  const { receipt, out } = await runCommand(name, args, timeoutMs);
  check(!receipt.stopReason && !receipt.spawnError, `${name} did not finish within its execution boundary; inspect its command receipt.`);
  check(receipt.exitCode === expectedExit, `${name} exited ${receipt.exitCode}, expected ${expectedExit}; inspect its stdout and stderr.`);
  let value;
  try { value = JSON.parse(out); } catch { throw new Error(`${name} did not return a complete JSON value.`); }
  check(value && typeof value === 'object' && !Array.isArray(value), `${name} returned an invalid result envelope.`);
  return value;
}

try {
  await access(cli);
  const { digest, validateManifest, importCapsule, assertObservation, TargetFailure } = await import(pathToFileURL(join(project, 'dist/index.js')).href);
  summary.environment.cliDigest = sha256(await readFile(cli));
  summary.environment.lockfileDigest = sha256(await readFile(join(project, 'package-lock.json')));
  const doctor = await step('doctor', ['doctor'], 0, 15_000);
  summary.observations.doctor = doctor;
  check(doctor.browser?.available === true, 'Browser prerequisite did not pass its click and screenshot probe. See doctor output.');

  const recorded = await step('record', ['record', '--consent', '--output', join(output, 'record')], 1, 25_000);
  const originalPath = join(output, 'record/manifest.json');
  const original = validateManifest(JSON.parse(await readFile(originalPath, 'utf8')));
  check(recorded.result?.outcome === 'target-failure' && recorded.result.assertionCount === 1, 'Record did not execute and reproduce the intended assertion.');
  check(recorded.result.manifestDigest === digest(original) && recorded.result.assertionDigest === original.assertionDigest, 'Record identity differs from the saved manifest.');
  let targetObserved = false;
  try { assertObservation(recorded.result.observation, original.expectation); } catch (error) { if (error instanceof TargetFailure) targetObserved = true; else throw error; }
  check(targetObserved, 'Record observation did not independently reproduce the exact target failure.');

  const reduction = await step('reduce', ['reduce', '--manifest', originalPath, '--budget', String(limits.reductionExecutions), '--output', join(output, 'reduce')], 0, 130_000);
  const reducedPath = join(output, 'reduce/reduced.manifest.json');
  const reduced = validateManifest(JSON.parse(await readFile(reducedPath, 'utf8')));
  const reducedResult = reduction.result;
  check(reducedResult?.status === 'complete' && reducedResult.baseline?.outcome === 'target-failure', 'Reduction did not finish with a reproduced baseline.');
  check(reduced.assertionDigest === original.assertionDigest && digest(reduced.expectation) === digest(original.expectation), 'Reduction changed the frozen expectation.');
  check(digest(reducedResult.manifest) === digest(reduced), 'Saved reduced manifest differs from the reported reduction.');
  check(reduced.actions.length < original.actions.length, 'Reduction did not remove any action.');
  check(reducedResult.trials.some(trial => trial.accepted && trial.removed.length > 0 && trial.outcome === 'target-failure' && trial.runIds.length === 2), 'Reduction lacks a repeated accepted deletion.');

  const verification = await step('verify', ['verify', '--manifest', reducedPath, '--output', join(output, 'verify')], 0, 35_000);
  const comparison = verification.result;
  check(comparison?.outcome === 'requirement-satisfied' && comparison.original?.outcome === 'target-failure' && comparison.candidate?.outcome === 'requirement-satisfied', 'Verification did not distinguish buggy and fixed revisions.');
  for (const run of [comparison.original, comparison.candidate]) check(run.assertionCount === 1 && run.assertionDigest === original.assertionDigest, 'Verification did not execute the frozen assertion.');
  check(comparison.original.harnessDigest === comparison.candidate.harnessDigest, 'Verification changed the trusted harness identity.');
  assertObservation(comparison.candidate.observation, reduced.expectation);

  const capsulePath = join(output, 'capsule');
  const exported = await step('export', ['export', '--manifest', reducedPath, '--output', capsulePath], 0, 35_000);
  check(exported.result?.path === capsulePath && exported.result.manifestDigest === digest(reduced), 'Export does not identify the requested reduced capsule.');
  const imported = await importCapsule(capsulePath);
  check(digest(imported) === digest(reduced), 'Exported capsule does not validate against the reduced manifest.');

  const replay = await step('capsule-replay', ['replay', '--capsule', capsulePath, '--output', join(output, 'capsule-replay')], 1, 25_000);
  check(replay.result?.outcome === 'target-failure' && replay.result.assertionCount === 1 && replay.result.assertionDigest === original.assertionDigest, 'Validated exported capsule did not reproduce the frozen target assertion.');
  summary.status = 'passed';
  summary.observations = {
    ...summary.observations,
    originalRunId: recorded.result.id, originalActions: original.actions.map(action => action.id),
    retainedActions: reduced.actions.map(action => action.id), reductionExecutions: reducedResult.executions,
    testedMinimality: reducedResult.minimality, reductionReason: reducedResult.reason,
    assertionDigest: original.assertionDigest, reducedManifestDigest: digest(reduced),
    verification: { originalRunId: comparison.original.id, candidateRunId: comparison.candidate.id, outcome: comparison.outcome, harnessDigest: comparison.original.harnessDigest },
    capsulePath, validatedCapsuleFiles: exported.result.files, capsuleReplayRunId: replay.result.id,
  };
} catch (error) {
  summary.status = cancelRequested ? 'cancelled' : 'inconclusive';
  summary.reason = error instanceof Error ? error.message : 'Demo failed without a structured Error.';
  process.exitCode = cancelRequested ? 130 : 2;
} finally {
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  summary.durationMs = performance.now() - started;
  const summaryPath = join(output, 'summary.json');
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ output, summaryPath, ...summary }, null, 2));
}
