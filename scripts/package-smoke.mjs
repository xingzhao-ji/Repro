import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Fresh local installations, not a claim of clean Linux-container execution.
const repository = process.cwd();
const outputRoot = resolve(process.env.REPRO_PACKAGE_SMOKE_ROOT ?? '.repro-runs/package-smoke');
const owned = relative(resolve('.repro-runs'), outputRoot);
assert.ok(owned && owned !== '..' && !owned.startsWith(`..${sep}`) && !isAbsolute(owned), 'Package smoke evidence must stay beneath .repro-runs');
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
  const paths = ['package.json', 'package-lock.json', 'scripts/build.mjs'];
  for (const folder of ['src', 'web', 'fixtures/browser-search', 'security']) {
    for (const path of await readdir(folder, { recursive: true })) {
      const local = join(folder, path);
      if ((await lstat(local)).isFile()) paths.push(local);
    }
  }
  return Object.fromEntries(await Promise.all(paths.sort().map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
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
  console.log(`Package smoke: ${name}`);
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
function checkRun(name, result, manifest, revision, harnessDigest) {
  assert.equal(result.outcome, revision === 'buggy' ? 'target-failure' : 'requirement-satisfied', name);
  assert.equal(result.assertionCount, 1, `${name}: frozen assertion must execute exactly once`);
  assert.equal(result.manifestDigest, trustedIdentity.digest(manifest), name);
  assert.equal(result.assertionDigest, manifest.assertionDigest, name);
  assert.equal(result.appRevision, revision, name);
  assert.equal(result.appDigest, trustedIdentity.fixtureDigest(revision), name);
  assert.equal(result.runnerVersion, manifest.runnerVersion, name);
  assert.equal(result.adapterVersion, manifest.adapter.version, name);
  assert.match(result.harnessDigest, /^[a-f0-9]{64}$/, name);
  assert.equal(result.seed, manifest.environment.seed, name);
  if (harnessDigest) assert.equal(result.harnessDigest, harnessDigest, name);
  assert.deepEqual(result.observation, { latestRequestId: 2, query: 'beta', results: [revision === 'buggy' ? 'Alpha synthetic result' : 'Beta synthetic result'] }, name);
  assert.deepEqual(result.events.filter(event => event.type === 'response-completed').map(event => event.message), ['HTTP response 2 completed in the frontend.', 'HTTP response 1 completed in the frontend.'], name);
  observations.push({ name, id: result.id, outcome: result.outcome, manifestDigest: result.manifestDigest, assertionDigest: result.assertionDigest, harnessDigest: result.harnessDigest, assertionCount: result.assertionCount, appRevision: result.appRevision, observation: result.observation, environment: result.environment });
}
try {
  sourceHashes = await inputHashes();
  await writeFile(join(directory, 'source-hashes.json'), JSON.stringify(sourceHashes, null, 2));
  await command('build', 'npm', ['run', 'build'], repository);
  const packed = JSON.parse(await command('pack', 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], repository));
  assert.equal(packed.length, 1);
  assert.ok(packed[0].files.some(file => file.path === 'dist/package-lock.json'), 'npm tarball must contain the build copy of the lockfile');
  for (const path of ['fixtures/browser-search/page.html', 'dist/web.js', 'dist/web.css']) assert.ok(packed[0].files.some(file => file.path === path), `Package must include ${path}`);
  assert.equal(packed[0].files.some(file => file.path.startsWith('src/')), false, 'runtime must not depend on TypeScript source');
  await writeFile(join(install, 'package.json'), JSON.stringify({ name: 'repro-owned-install-smoke', private: true, type: 'module' }));
  await command('install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, packed[0].filename)], install);
  const installedPackage = join(install, 'node_modules/repro-local');
  const cli = join(installedPackage, 'dist/cli.js');
  trustedIdentity = await import(pathToFileURL(join(installedPackage, 'dist/index.js')).href);
  assert.equal(await readFile(join(installedPackage, 'dist/package-lock.json'), 'utf8'), await readFile(join(repository, 'package-lock.json'), 'utf8'));
  await command('installed-help', process.execPath, [cli, '--help'], install);
  await command('installed-bin', join(install, 'node_modules/.bin/repro'), ['--help'], install);
  const recorded = JSON.parse(await command('installed-record', process.execPath, [cli, 'record', '--consent', '--output', '.repro-runs/record'], install, 1));
  const manifest = JSON.parse(await readFile(join(install, '.repro-runs/record/manifest.json'), 'utf8'));
  checkRun('installed-record', recorded.result, manifest, 'buggy');
  await command('installed-export', process.execPath, [cli, 'export', '--manifest', '.repro-runs/record/manifest.json', '--output', '.repro-runs/capsule'], install);
  const inspected = JSON.parse(await command('installed-inspect', process.execPath, [cli, 'inspect', '--capsule', '.repro-runs/capsule'], install));
  assert.deepEqual(inspected, manifest);
  const replayed = JSON.parse(await command('installed-replay', process.execPath, [cli, 'replay', '--capsule', '.repro-runs/capsule', '--output', '.repro-runs/replay'], install, 1));
  checkRun('installed-replay', replayed.result, manifest, 'buggy', recorded.result.harnessDigest);
  const verified = JSON.parse(await command('installed-verify', process.execPath, [cli, 'verify', '--capsule', '.repro-runs/capsule', '--output', '.repro-runs/verify'], install));
  assert.equal(verified.result.outcome, 'requirement-satisfied');
  checkRun('installed-verify-original', verified.result.original, manifest, 'buggy', recorded.result.harnessDigest);
  checkRun('installed-verify-candidate', verified.result.candidate, manifest, 'fixed', recorded.result.harnessDigest);
  assert.notEqual(verified.result.original.id, verified.result.candidate.id, 'Revisions require separate fresh runs');
  // Install a separate capsule with its own runtime dependencies. Offline
  // acquisition deliberately uses the cache populated by setup: this is not a
  // self-contained clean-host offline bundle.
  const capsule = join(directory, 'standalone-capsule');
  await command('standalone-export', process.execPath, [cli, 'export', '--manifest', join(install, '.repro-runs/record/manifest.json'), '--output', capsule], repository);
  await command('cached-offline-install', 'npm', ['ci', '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], capsule);
  const resolution = JSON.parse(await command('capsule-dependency-resolution', process.execPath, ['--input-type=module', '-e', 'console.log(JSON.stringify(Object.fromEntries(["playwright", "react", "react-dom"].map(name => [name, import.meta.resolve(name)]))))'], capsule));
  for (const location of Object.values(resolution)) assert.ok(location.startsWith(`${pathToFileURL(join(capsule, 'node_modules')).href}/`), 'Capsule runtime dependencies must resolve from its own installation');
  const offlineVerified = JSON.parse(await command('cached-offline-verify', process.execPath, ['dist/cli.js', 'verify', '--capsule', '.', '--output', '.repro-runs/verify'], capsule));
  assert.equal(offlineVerified.result.outcome, 'requirement-satisfied');
  checkRun('cached-offline-original', offlineVerified.result.original, manifest, 'buggy', recorded.result.harnessDigest);
  checkRun('cached-offline-candidate', offlineVerified.result.candidate, manifest, 'fixed', recorded.result.harnessDigest);
  await command('exported-readable-test', process.execPath, ['--test', 'replay.test.mjs'], capsule);
  assert.deepEqual(await inputHashes(), sourceHashes, 'Runtime inputs changed while the package smoke was executing; rerun against a stable source snapshot');
  await writeFile(join(directory, 'summary.json'), JSON.stringify({ outcome: 'passed', scope: 'Fresh local npm package install; installed record/export/inspect/replay/verify; separate capsule npm ci --offline using populated cache; standalone real-browser conventional test. Host Chromium asset explicitly reused. No clean-host offline bundle or Linux portability claim.', startedAt, finishedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, directory, package: { filename: packed[0].filename, integrity: packed[0].integrity }, checks, observations }, null, 2));
  console.log(`Package smoke passed; evidence: ${directory}`);
} catch (error) {
  await writeFile(join(directory, 'summary.json'), JSON.stringify({ outcome: 'failed', reason: error instanceof Error ? error.message : 'Package smoke failed', startedAt, finishedAt: new Date().toISOString(), directory, checks, observations }, null, 2));
  throw error;
}
