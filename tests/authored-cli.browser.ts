import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { digest } from '../src/manifest.js';
import { fixtureDigest } from '../src/fixture.js';
import type { Manifest, ReductionResult, RunResult } from '../src/contracts.js';

async function workspace() {
  const parent = resolve('.repro-runs/expectation-authoring/package');
  await mkdir(parent, { recursive: true }); return mkdtemp(join(parent, 'cli-'));
}
async function cli(root: string, name: string, args: string[], expectedStatus = 0) {
  await mkdir(join(root, 'tmp'), { recursive: true });
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, LANG: process.env.LANG ?? 'en_US.UTF-8', TMPDIR: join(root, 'tmp'),
    PLAYWRIGHT_BROWSERS_PATH: resolve(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '.repro-cache/browsers'),
    ...(process.env.REPRO_BROWSER_CHANNEL ? { REPRO_BROWSER_CHANNEL: process.env.REPRO_BROWSER_CHANNEL } : {}),
  };
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { env: environment, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', excessive = false;
  for (const [stream, append] of [[child.stdout, (chunk: string) => { stdout += chunk; }], [child.stderr, (chunk: string) => { stderr += chunk; }]] as const) {
    stream.on('data', (bytes: Buffer) => {
      if (stdout.length + stderr.length + bytes.length > 2 * 1024 * 1024) { excessive = true; child.kill('SIGTERM'); }
      else append(String(bytes));
    });
  }
  const status = await new Promise<number | null>((complete, reject) => { child.once('error', reject); child.once('close', complete); });
  await writeFile(join(root, `${name}.stdout.log`), stdout); await writeFile(join(root, `${name}.stderr.log`), stderr);
  await writeFile(join(root, `${name}.receipt.json`), JSON.stringify({ args, status, expectedStatus, excessive, startedAt, finishedAt: new Date().toISOString() }, null, 2));
  assert.equal(excessive, false); assert.equal(status, expectedStatus, `${name}: ${stderr || stdout}`);
  return JSON.parse(stdout) as unknown;
}
function checkRun(result: RunResult, manifest: Manifest, outcome: RunResult['outcome'], observation: RunResult['observation'], harnessDigest?: string) {
  assert.equal(result.outcome, outcome, result.reason); assert.equal(result.assertionCount, 1);
  assert.equal(result.manifestDigest, digest(manifest)); assert.equal(result.assertionDigest, manifest.assertionDigest);
  assert.equal(result.appDigest, fixtureDigest(result.appRevision as 'buggy' | 'fixed'));
  assert.deepEqual(result.observation, observation);
  if (harnessDigest) assert.equal(result.harnessDigest, harnessDigest);
}

test('CLI accepts an explicit reversed declaration and preserves it through reduction, comparison and capsule inspection', { timeout: 120000 }, async () => {
  const root = await workspace(); const input = join(root, 'experiment.json');
  await writeFile(input, JSON.stringify({ searchOrder: ['beta', 'alpha'], expectation: { invariantId: 'LATEST_SEARCH_RESPONSE_WINS', latestRequestId: 2, latestQuery: 'alpha', expectedResults: ['Alpha synthetic result'] }, expectationBasis: 'independent-contract' }));
  const record = await cli(root, 'record', ['record', '--consent', '--experiment', input, '--output', join(root, 'record')], 1) as { result: RunResult };
  const manifest = JSON.parse(await readFile(join(root, 'record/manifest.json'), 'utf8')) as Manifest;
  assert.equal(manifest.schemaVersion, 2); assert.equal(manifest.expectation.latestQuery, 'alpha');
  assert.deepEqual(manifest.expectation.expectedResults, ['Alpha synthetic result']); assert.equal(manifest.humanApproval, 'not-claimed');
  checkRun(record.result, manifest, 'target-failure', { latestRequestId: 2, query: 'alpha', results: ['Beta synthetic result'] });
  const reduced = await cli(root, 'reduce', ['reduce', '--manifest', join(root, 'record/manifest.json'), '--budget', '50', '--output', join(root, 'reduce')]) as { result: ReductionResult };
  assert.equal(reduced.result.status, 'complete', reduced.result.reason);
  assert.deepEqual(reduced.result.manifest.actions.map(action => action.id), ['navigate', 'search-beta', 'search-alpha']);
  assert.equal(reduced.result.manifest.assertionDigest, manifest.assertionDigest);
  assert.deepEqual(reduced.result.manifest.expectation, manifest.expectation);
  const verification = await cli(root, 'verify', ['verify', '--manifest', join(root, 'reduce/reduced.manifest.json'), '--output', join(root, 'verify')]) as { result: { outcome: string; original: RunResult; candidate: RunResult } };
  assert.equal(verification.result.outcome, 'requirement-satisfied');
  checkRun(verification.result.original, reduced.result.manifest, 'target-failure', { latestRequestId: 2, query: 'alpha', results: ['Beta synthetic result'] }, record.result.harnessDigest);
  checkRun(verification.result.candidate, reduced.result.manifest, 'requirement-satisfied', { latestRequestId: 2, query: 'alpha', results: ['Alpha synthetic result'] }, record.result.harnessDigest);
  assert.notEqual(verification.result.original.id, verification.result.candidate.id);
  await cli(root, 'export', ['export', '--manifest', join(root, 'reduce/reduced.manifest.json'), '--output', join(root, 'capsule')]);
  const inspected = await cli(root, 'inspect', ['inspect', '--capsule', join(root, 'capsule')]);
  assert.deepEqual(inspected, reduced.result.manifest);
});

test('CLI also executes a caller-authored forward declaration with its distinct frozen assertion', { timeout: 60000 }, async () => {
  const root = await workspace(); const input = join(root, 'experiment.json');
  await writeFile(input, JSON.stringify({ searchOrder: ['alpha', 'beta'], expectation: { invariantId: 'LATEST_SEARCH_RESPONSE_WINS', latestRequestId: 2, latestQuery: 'beta', expectedResults: ['Beta synthetic result'] }, expectationBasis: 'independent-contract' }));
  const record = await cli(root, 'record', ['record', '--consent', '--experiment', input, '--output', join(root, 'record')], 1) as { result: RunResult };
  const manifest = JSON.parse(await readFile(join(root, 'record/manifest.json'), 'utf8')) as Manifest;
  assert.equal(manifest.schemaVersion, 2); assert.notEqual(manifest.assertionDigest, 'fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711');
  checkRun(record.result, manifest, 'target-failure', { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] });
  const verification = await cli(root, 'verify', ['verify', '--manifest', join(root, 'record/manifest.json'), '--output', join(root, 'verify')]) as { result: { outcome: string; original: RunResult; candidate: RunResult } };
  assert.equal(verification.result.outcome, 'requirement-satisfied');
  checkRun(verification.result.original, manifest, 'target-failure', { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] }, record.result.harnessDigest);
  checkRun(verification.result.candidate, manifest, 'requirement-satisfied', { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] }, record.result.harnessDigest);
  assert.notEqual(verification.result.original.id, verification.result.candidate.id);
});
