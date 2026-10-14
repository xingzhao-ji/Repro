import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A fresh local npm install check, not a claim of clean Linux-container execution.
const repository = process.cwd();
await mkdir('.repro-runs/package-smoke', { recursive: true });
const directory = await mkdtemp(resolve('.repro-runs/package-smoke/run-'));
const install = join(directory, 'install');
await mkdir(install);
await writeFile(join(directory, 'user.npmrc'), '');
await writeFile(join(directory, 'global.npmrc'), '');
const environment = {
  PATH: process.env.PATH,
  LANG: process.env.LANG ?? 'en_US.UTF-8',
  // Preserve the host's configured route and Node CA trust without unrelated credentials.
  ...Object.fromEntries(
    ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS']
      .flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]]]),
  ),
  NPM_CONFIG_USERCONFIG: join(directory, 'user.npmrc'),
  NPM_CONFIG_GLOBALCONFIG: join(directory, 'global.npmrc'),
  NPM_CONFIG_CACHE: resolve('.repro-cache/npm'),
  NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH
    ? resolve(process.env.PLAYWRIGHT_BROWSERS_PATH) : resolve('.repro-cache/browsers'),
};
const checks = [];
async function command(name, executable, args, cwd) {
  console.log(`Package smoke: ${name}`);
  const child = spawn(executable, args, { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; let overLimit = false;
  for (const [stream, append] of [[child.stdout, chunk => { stdout += chunk; }], [child.stderr, chunk => { stderr += chunk; }]]) {
    stream.on('data', bytes => {
      if (stdout.length + stderr.length + bytes.length > 2 * 1024 * 1024) { overLimit = true; child.kill('SIGTERM'); }
      else append(String(bytes));
    });
  }
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 120_000);
  const status = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept); }).finally(() => clearTimeout(timeout));
  await writeFile(join(directory, `${name}.stdout.log`), stdout);
  await writeFile(join(directory, `${name}.stderr.log`), stderr);
  checks.push({ name, executable, args, cwd, status, timedOut, overLimit });
  assert.equal(timedOut, false, `${name} exceeded its deadline`);
  assert.equal(overLimit, false, `${name} exceeded its output bound`);
  assert.equal(status, 0, `${name} failed; see ${directory}`);
  return stdout;
}

try {
  await command('build', 'npm', ['run', 'build'], repository);
  const packed = JSON.parse(await command('pack', 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], repository));
  assert.equal(packed.length, 1);
  assert.ok(packed[0].files.some(file => file.path === 'dist/package-lock.json'), 'npm tarball must contain the build copy of the lockfile');
  assert.ok(packed[0].files.some(file => file.path === 'fixtures/browser-search/page.html'));
  assert.equal(packed[0].files.some(file => file.path.startsWith('src/')), false, 'runtime must not depend on TypeScript source');
  await writeFile(join(install, 'package.json'), JSON.stringify({ name: 'repro-owned-install-smoke', private: true, type: 'module' }));
  await command('install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, packed[0].filename)], install);
  const installedPackage = join(install, 'node_modules/repro-local');
  const cli = join(installedPackage, 'dist/cli.js');
  assert.equal(await readFile(join(installedPackage, 'dist/package-lock.json'), 'utf8'), await readFile(join(repository, 'package-lock.json'), 'utf8'));
  await command('installed-help', process.execPath, [cli, '--help'], install);
  await command('installed-bin', join(install, 'node_modules/.bin/repro'), ['--help'], install);
  const create = `import {mkdir,writeFile} from 'node:fs/promises'; import {createManifest} from ${JSON.stringify(pathToFileURL(join(installedPackage, 'dist/index.js')).href)}; await mkdir('.repro-runs',{recursive:true}); await writeFile('.repro-runs/input.json',JSON.stringify(createManifest()));`;
  await command('installed-manifest', process.execPath, ['--input-type=module', '-e', create], install);
  await command('installed-export', process.execPath, [cli, 'export', '--manifest', '.repro-runs/input.json', '--output', '.repro-runs/capsule'], install);
  await command('installed-inspect', process.execPath, [cli, 'inspect', '--capsule', '.repro-runs/capsule'], install);
  // The exported conventional test resolves pinned dependencies from this fresh
  // installation. Chromium is an explicitly shared, already installed tool asset.
  await command('exported-readable-test', process.execPath, ['--test', '.repro-runs/capsule/replay.test.mjs'], install);
  await writeFile(join(directory, 'summary.json'), JSON.stringify({ outcome: 'passed', scope: 'Fresh local npm install, installed export/import, exported real-browser conventional test; host Chromium asset explicitly reused; Linux portability is a separate gate.', node: process.version, platform: `${process.platform}-${process.arch}`, directory, checks }, null, 2));
  console.log(`Package smoke passed; evidence: ${directory}`);
} catch (error) {
  await writeFile(join(directory, 'summary.json'), JSON.stringify({ outcome: 'failed', reason: error instanceof Error ? error.message : 'Package smoke failed', directory, checks }, null, 2));
  throw error;
}
