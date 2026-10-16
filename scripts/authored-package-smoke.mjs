import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageInputHashes } from './package-inputs.mjs';

// Authored-workflow receipt from already built artifacts. No build, Linux or clean-host claim.
const repository = process.cwd();
const outputRoot = resolve(process.env.REPRO_AUTHORED_PACKAGE_ROOT ?? '.repro-runs/expectation-authoring/package');
const owned = relative(resolve('.repro-runs'), outputRoot);
assert.ok(owned && owned !== '..' && !owned.startsWith(`..${sep}`) && !isAbsolute(owned), 'Authored package smoke evidence must stay beneath .repro-runs');
await mkdir(outputRoot, { recursive: true });
const directory = await mkdtemp(join(outputRoot, 'run-'));
const install = join(directory, 'install');
await mkdir(install);
await mkdir(join(directory, 'tmp'));
await writeFile(join(directory, 'user.npmrc'), '');
await writeFile(join(directory, 'global.npmrc'), '');
const environment = {
  PATH: process.env.PATH,
  LANG: process.env.LANG ?? 'en_US.UTF-8',
  TMPDIR: join(directory, 'tmp'),
  NPM_CONFIG_USERCONFIG: join(directory, 'user.npmrc'),
  NPM_CONFIG_GLOBALCONFIG: join(directory, 'global.npmrc'),
  NPM_CONFIG_CACHE: resolve('.repro-cache/npm'),
  NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH
    ? resolve(process.env.PLAYWRIGHT_BROWSERS_PATH) : resolve('.repro-cache/browsers'),
};
const checks = [];
const observations = [];
let trustedIdentity;
const startedAt = new Date().toISOString();
async function inputHashes() {
  return packageInputHashes(repository, true);
}
let sourceHashes;

// Retain numeric identities only, never other applications' command lines.
function processSnapshot() {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,pgid=,lstart='], { encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Owned-process census unavailable');
  return result.stdout.trim().split('\n').filter(Boolean).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    assert.ok(match, 'Unexpected process census row');
    return { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), startedAt: match[4] };
  });
}
async function command(name, executable, args, cwd, expectedStatus = 0) {
  console.log(`Authored package smoke: ${name}`);
  const child = spawn(executable, args, { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  const seen = new Map();
  let censusError;
  const sample = () => {
    try {
      const rows = processSnapshot();
      let changed;
      do {
        changed = false;
        for (const row of rows) {
          if (!seen.has(row.pid) && (row.pid === child.pid || seen.has(row.ppid))) { seen.set(row.pid, row); changed = true; }
        }
      } while (changed);
    } catch (error) { censusError ??= error; }
  };
  sample();
  const polling = setInterval(sample, 100);
  let forceClose;
  const stop = () => {
    child.kill('SIGTERM');
    forceClose ??= setTimeout(() => child.kill('SIGKILL'), 3000);
  };
  let stdout = ''; let stderr = ''; let overLimit = false;
  for (const [stream, append] of [[child.stdout, chunk => { stdout += chunk; }], [child.stderr, chunk => { stderr += chunk; }]]) {
    stream.on('data', bytes => {
      if (stdout.length + stderr.length + bytes.length > 2 * 1024 * 1024) { overLimit = true; stop(); }
      else append(String(bytes));
    });
  }
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; stop(); }, 120_000);
  let launchError;
  const status = await new Promise(accept => {
    child.once('error', error => { launchError = error.message; });
    child.once('close', accept);
  }).finally(() => { clearTimeout(timeout); clearTimeout(forceClose); clearInterval(polling); });
  const closedAt = new Date().toISOString();
  await writeFile(join(directory, `${name}.stdout.log`), stdout);
  await writeFile(join(directory, `${name}.stderr.log`), stderr);
  let postClose;
  try { postClose = processSnapshot().filter(row => seen.get(row.pid)?.startedAt === row.startedAt); }
  catch (error) { censusError ??= error; }
  const census = { closedAt, sampledAt: new Date().toISOString(), method: '100 ms ancestry samples with PID/start-time matching; distinct census after child close', observedOwned: [...seen.values()], postClose, error: censusError?.message };
  await writeFile(join(directory, `${name}.processes.json`), JSON.stringify(census, null, 2));
  checks.push({ name, executable, args, cwd, status, expectedStatus, timedOut, overLimit, launchError, postCloseOwnedCount: postClose?.length });
  assert.equal(launchError, undefined, `${name} could not launch`);
  assert.equal(censusError, undefined, `${name} census failed`);
  assert.equal(postClose.length, 0, `${name} left observed owned processes after close`);
  assert.equal(timedOut, false, `${name} exceeded its deadline`);
  assert.equal(overLimit, false, `${name} exceeded its output bound`);
  assert.equal(status, expectedStatus, `${name} failed; see ${directory}`);
  return stdout;
}
function checkRun(name, result, manifest, revision, harnessDigest, inputDigest = trustedIdentity.digest(manifest)) {
  assert.equal(result.outcome, revision === 'buggy' ? 'target-failure' : 'requirement-satisfied', name);
  assert.equal(result.assertionCount, 1, `${name}: frozen assertion must execute exactly once`);
  assert.equal(result.manifestDigest, inputDigest, name);
  assert.equal(result.assertionDigest, manifest.assertionDigest, name);
  assert.equal(result.appRevision, revision, name);
  assert.equal(result.appDigest, trustedIdentity.fixtureDigest(revision), name);
  assert.equal(result.runnerVersion, manifest.runnerVersion, name);
  assert.equal(result.adapterVersion, manifest.adapter.version, name);
  assert.match(result.harnessDigest, /^[a-f0-9]{64}$/, name);
  assert.equal(result.seed, manifest.environment.seed, name);
  if (harnessDigest) assert.equal(result.harnessDigest, harnessDigest, name);
  assert.deepEqual(result.observation, { latestRequestId: 2, query: 'alpha', results: [revision === 'buggy' ? 'Beta synthetic result' : 'Alpha synthetic result'] }, name);
  assert.deepEqual(result.events.filter(event => event.type === 'response-completed').map(event => event.message), ['HTTP response 2 completed in the frontend.', 'HTTP response 1 completed in the frontend.'], name);
  observations.push({ name, id: result.id, outcome: result.outcome, manifestDigest: result.manifestDigest, assertionDigest: result.assertionDigest, harnessDigest: result.harnessDigest, assertionCount: result.assertionCount, appRevision: result.appRevision, observation: result.observation, environment: result.environment });
}
const declaration = {
  searchOrder: ['beta', 'alpha'],
  expectation: { invariantId: 'LATEST_SEARCH_RESPONSE_WINS', latestRequestId: 2, latestQuery: 'alpha', expectedResults: ['Alpha synthetic result'] },
  expectationBasis: 'independent-contract',
};
try {
  sourceHashes = await inputHashes();
  await writeFile(join(directory, 'source-hashes.json'), JSON.stringify(sourceHashes, null, 2));
  const packed = JSON.parse(await command('pack-current-dist', 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], repository));
  assert.equal(packed.length, 1);
  for (const path of ['dist/cli.js', 'dist/index.js', 'dist/package-lock.json', 'fixtures/browser-search/page.html']) assert.ok(packed[0].files.some(file => file.path === path), `Package must include ${path}`);
  assert.equal(packed[0].files.some(file => file.path.startsWith('src/')), false, 'runtime must not depend on TypeScript source');
  await writeFile(join(install, 'package.json'), JSON.stringify({ name: 'repro-owned-authored-install', private: true, type: 'module' }));
  await command('install-cached-package', 'npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, packed[0].filename)], install);
  const installedPackage = join(install, 'node_modules/repro-local');
  const cli = join(installedPackage, 'dist/cli.js');
  trustedIdentity = await import(pathToFileURL(join(installedPackage, 'dist/index.js')).href);
  for (const path of ['dist/cli.js', 'dist/index.js', 'dist/package-lock.json']) assert.deepEqual(await readFile(join(installedPackage, path)), await readFile(join(repository, path)), `Installed ${path} must match the packed build`);
  await mkdir(join(install, '.repro-runs'));
  await writeFile(join(install, '.repro-runs/experiment.json'), JSON.stringify(declaration, null, 2));
  const recorded = JSON.parse(await command('installed-authored-record', process.execPath, [cli, 'record', '--consent', '--experiment', '.repro-runs/experiment.json', '--output', '.repro-runs/record'], install, 1));
  const manifest = JSON.parse(await readFile(join(install, '.repro-runs/record/manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(manifest.scenario.searchOrder, ['beta', 'alpha']);
  assert.deepEqual(manifest.expectation, { ...declaration.expectation, description: 'A response belonging to an older search request must not replace results for the most recently issued request.' });
  assert.equal(manifest.expectationBasis, 'independent-contract'); assert.equal(manifest.humanApproval, 'not-claimed');
  assert.equal(manifest.expectationSource.kind, 'caller-supplied');
  assert.notEqual(manifest.assertionDigest, 'fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711');
  checkRun('installed-authored-record', recorded.result, manifest, 'buggy');
  const reduced = JSON.parse(await command('installed-authored-reduce', process.execPath, [cli, 'reduce', '--manifest', '.repro-runs/record/manifest.json', '--budget', '50', '--output', '.repro-runs/reduce'], install));
  const reducedManifest = JSON.parse(await readFile(join(install, '.repro-runs/reduce/reduced.manifest.json'), 'utf8'));
  assert.equal(reduced.result.status, 'complete');
  assert.deepEqual(reduced.result.manifest, reducedManifest);
  assert.deepEqual(reducedManifest.actions.map(action => action.id), ['navigate', 'search-beta', 'search-alpha']);
  for (const field of ['scenario', 'expectation', 'expectationBasis', 'expectationSource', 'humanApproval', 'responses', 'assertionDigest']) assert.deepEqual(reducedManifest[field], manifest[field], `Reduction must preserve frozen ${field}`);
  checkRun('installed-reduction-baseline', reduced.result.baseline, manifest, 'buggy', recorded.result.harnessDigest);
  let execution = 0;
  for (const trial of reduced.result.trials) {
    assert.equal(trial.seed, manifest.environment.seed);
    if (trial.accepted) { assert.equal(trial.outcome, 'target-failure'); assert.equal(trial.runIds.length, 2); }
    for (const id of trial.runIds) {
      execution++;
      if (!trial.accepted) continue;
      const evidence = JSON.parse(await readFile(join(install, '.repro-runs/reduce', `execution-${String(execution).padStart(6, '0')}`, id, 'evidence.json'), 'utf8'));
      assert.equal(evidence.id, id);
      checkRun(`accepted-trial-${trial.index}-${execution}`, evidence, manifest, 'buggy', recorded.result.harnessDigest, trial.inputDigest);
    }
  }
  assert.equal(execution, reduced.result.executions);
  const verified = JSON.parse(await command('installed-authored-verify', process.execPath, [cli, 'verify', '--manifest', '.repro-runs/reduce/reduced.manifest.json', '--output', '.repro-runs/verify'], install));
  assert.equal(verified.result.outcome, 'requirement-satisfied');
  checkRun('installed-verify-original', verified.result.original, reducedManifest, 'buggy', recorded.result.harnessDigest);
  checkRun('installed-verify-candidate', verified.result.candidate, reducedManifest, 'fixed', recorded.result.harnessDigest);
  assert.notEqual(verified.result.original.id, verified.result.candidate.id);
  const capsule = join(install, '.repro-runs/standalone-capsule');
  await command('installed-authored-export', process.execPath, [cli, 'export', '--manifest', '.repro-runs/reduce/reduced.manifest.json', '--output', capsule], install);
  const inspected = JSON.parse(await command('installed-authored-inspect', process.execPath, [cli, 'inspect', '--capsule', capsule], install));
  assert.deepEqual(inspected, reducedManifest);
  const replayed = JSON.parse(await command('installed-authored-replay', process.execPath, [cli, 'replay', '--capsule', capsule, '--output', '.repro-runs/replay'], install, 1));
  checkRun('installed-authored-replay', replayed.result, reducedManifest, 'buggy', recorded.result.harnessDigest);
  await command('standalone-cached-install', 'npm', ['ci', '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], capsule);
  const resolution = JSON.parse(await command('standalone-dependency-resolution', process.execPath, ['--input-type=module', '-e', 'console.log(JSON.stringify(Object.fromEntries(["playwright", "react", "react-dom"].map(name => [name, import.meta.resolve(name)]))))'], capsule));
  for (const location of Object.values(resolution)) assert.ok(location.startsWith(`${pathToFileURL(join(capsule, 'node_modules')).href}/`), 'Capsule dependencies must resolve from its own installation');
  const conventional = await command('standalone-readable-test', process.execPath, ['--test', 'replay.test.mjs'], capsule);
  assert.match(conventional, /\bpass 1\b/, 'Conventional Node test must actually execute rather than exit without a test');
  let readableHarness;
  for (const revision of ['buggy', 'fixed']) {
    const location = join(capsule, '.repro-runs', `readable-${revision}`);
    const ids = await readdir(location); assert.equal(ids.length, 1);
    const evidence = JSON.parse(await readFile(join(location, ids[0], 'evidence.json'), 'utf8'));
    checkRun(`standalone-readable-${revision}`, evidence, reducedManifest, revision, readableHarness);
    readableHarness = evidence.harnessDigest;
  }
  assert.deepEqual(await inputHashes(), sourceHashes, 'Source or built artifacts changed during this sample; rerun against a stable final build');
  const summary = { outcome: 'passed', scope: 'Already-built artifacts packed and installed offline from populated npm cache; reversed caller-authored CLI record/reduce/verify/export/inspect/replay; separate capsule cached installation and actual conventional browser test. Existing host Chromium explicitly reused; no build-source equivalence, clean-host offline or Linux portability claim.', startedAt, finishedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, directory, package: { filename: packed[0].filename, integrity: packed[0].integrity }, declaration, reduction: { actionsBefore: manifest.actions.length, actionsAfter: reducedManifest.actions.length, executions: reduced.result.executions, status: reduced.result.status, minimality: reduced.result.minimality }, checks, observations };
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Authored package smoke passed; evidence: ${directory}`);
} catch (error) {
  await writeFile(join(directory, 'summary.json'), JSON.stringify({ outcome: 'failed', reason: error instanceof Error ? error.message : 'Authored package smoke failed', startedAt, finishedAt: new Date().toISOString(), directory, checks, observations }, null, 2));
  throw error;
}
