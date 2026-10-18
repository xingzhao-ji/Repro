import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inspectApp } from '../src/app-inspect.js';
import { CANARY } from './helpers/canaries.js';

async function folder(files: Record<string, string>): Promise<string> {
  await mkdir('.repro-runs/tests', { recursive: true });
  const directory = await mkdtemp(resolve('.repro-runs/tests/app-inspect-'));
  for (const [name, content] of Object.entries(files)) { await mkdir(join(directory, name, '..'), { recursive: true }); await writeFile(join(directory, name), content); }
  return directory;
}
const gitIn = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, encoding: 'utf8' });
async function tree(directory: string): Promise<string> {
  const hash = createHash('sha256');
  async function walk(path: string) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name);
      hash.update(child); const info = await stat(child); hash.update(String(info.mtimeMs));
      if (entry.isDirectory()) await walk(child); else hash.update(await readFile(child));
    }
  }
  await walk(directory); return hash.digest('hex');
}

test('a git npm app is detected from package.json with its exact revision, local changes and withheld sensitive files', async () => {
  const directory = await folder({
    'package.json': JSON.stringify({ name: 'demo-shop', version: '1.2.3', scripts: { dev: 'vite --port 5173', test: 'node --test' }, dependencies: { react: '^19.0.0' }, devDependencies: { vite: '^7.0.0' } }),
    'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/react': { version: '19.3.1' }, 'node_modules/vite': { version: '7.3.7' } } }),
    'src/cart.js': 'export const total = items => items.reduce((sum, item) => sum + item.price, 0);\n',
    '.gitignore': 'node_modules/\n.env\n', 'node_modules/.keep': '',
  });
  gitIn(directory, 'init', '-q', '-b', 'main'); gitIn(directory, 'add', '.'); gitIn(directory, 'commit', '-qm', 'Initial cart');
  gitIn(directory, 'remote', 'add', 'origin', `https://shop-dev:${CANARY.github}@git.example.invalid/shop/demo.git`);
  await writeFile(join(directory, 'src/cart.js'), 'export const total = items => items.reduce((sum, item) => sum + item.price * item.qty, 0);\n');
  await writeFile(join(directory, 'src/discount.js'), 'export const discount = 0.1;\n');
  await writeFile(join(directory, '.env.local'), `STRIPE_SECRET=${CANARY.stripeLive}\n`);
  await writeFile(join(directory, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1, 2]));
  await writeFile(join(directory, 'notes-private.txt'), 'call jane about the release\n');
  const before = await tree(join(directory, '.git'));
  const profile = await inspectApp({ repository: directory });
  assert.equal(await tree(join(directory, '.git')), before, 'inspection never writes the repository');
  assert.deepEqual(profile.missing, []);
  assert.equal(profile.name, 'demo-shop');
  assert.deepEqual({ kind: profile.plan?.kind, command: profile.plan?.command }, { kind: 'command', command: 'npm run dev' });
  assert.match(profile.plan!.source, /package\.json script "dev"/);
  assert.equal(profile.install, 'npm ci');
  assert.equal(profile.dependenciesInstalled, true);
  assert.deepEqual(profile.packageFacts!.resolved, { react: '19.3.1', vite: '7.3.7' });
  assert.match(profile.packageFacts!.lockfile!.sha256, /^[a-f0-9]{64}$/);
  const git = profile.git!;
  assert.match(git.commit!, /^[a-f0-9]{40}$/);
  assert.equal(git.branch, 'main');
  assert.equal(git.dirty, true);
  assert.deepEqual(git.remotes, [{ name: 'origin', url: 'https://[redacted url-credentials]@git.example.invalid/shop/demo.git' }]);
  assert.deepEqual(git.pushedTo, []);
  assert.match(git.patch, /item\.price \* item\.qty/);
  assert.match(git.patch, /new file mode 100644\n[\s\S]*\+\+\+ b\/src\/discount\.js/);
  assert.equal(git.patch.includes(CANARY.stripeLive), false);
  assert.deepEqual(git.omitted.map(item => [item.path, item.reason.split(';')[0]]).sort(), [['.env.local', 'sensitive file name'], ['logo.png', 'untracked file that is not source code or configuration'], ['notes-private.txt', 'untracked file that is not source code or configuration']]);
  assert.equal(git.patch.includes('call jane'), false);
  assert.ok(profile.notes.some(note => /not on any remote-tracking branch/.test(note)));
  // The patch reproduces the developer's state in a separate clone.
  const clone = join(directory, '..', `${directory.split('/').pop()}-clone`);
  execFileSync('git', ['clone', '-q', directory, clone]);
  execFileSync('git', ['apply'], { cwd: clone, input: git.patch });
  assert.equal(await readFile(join(clone, 'src/cart.js'), 'utf8'), await readFile(join(directory, 'src/cart.js'), 'utf8'));
  assert.equal(await readFile(join(clone, 'src/discount.js'), 'utf8'), 'export const discount = 0.1;\n');
});

test('missing essentials become questions; static folders, URLs and config files are supported', async () => {
  const noStart = await folder({ 'package.json': JSON.stringify({ name: 'api-only', scripts: { test: 'node --test' } }) });
  assert.match((await inspectApp({ repository: noStart })).missing.map(item => item.field).join(), /start/);
  const noModules = await folder({ 'package.json': JSON.stringify({ name: 'fresh', scripts: { start: 'node server.js' }, dependencies: { express: '^5.0.0' } }), 'package-lock.json': '{}' });
  const fresh = await inspectApp({ repository: noModules });
  assert.deepEqual(fresh.missing.map(item => item.field), ['install']);
  assert.match(fresh.missing[0]!.question, /npm ci/);
  const site = await folder({ 'index.html': '<h1>Hi</h1>' });
  const staticProfile = await inspectApp({ repository: site });
  assert.equal(staticProfile.plan?.kind, 'static');
  assert.ok(staticProfile.notes.some(note => /not a git repository/.test(note)));
  const configured = await folder({ 'repro.config.json': JSON.stringify({ start: 'python3 -m http.server {port}', url: 'http://127.0.0.1:{port}/', env: { FEATURE_FLAG: 'on' } }) });
  const configuredProfile = await inspectApp({ repository: configured });
  assert.deepEqual([configuredProfile.plan?.command, configuredProfile.plan?.url, configuredProfile.plan?.env], ['python3 -m http.server {port}', 'http://127.0.0.1:{port}/', { FEATURE_FLAG: 'on' }]);
  await assert.rejects(inspectApp({ repository: await folder({ 'repro.config.json': JSON.stringify({ start: 'x', env: { API_TOKEN: 'abc' } }) }) }), /non-secret/);
  const urlOnly = await inspectApp({ url: 'http://localhost:5173/' });
  assert.equal(urlOnly.plan?.kind, 'external');
  assert.equal(urlOnly.startPlan, null);
  assert.ok(urlOnly.notes.some(note => /does not provide source code/.test(note)));
  await assert.rejects(inspectApp({ url: 'https://staging.example.com/' }), /on this machine/);
  await assert.rejects(inspectApp({ repository: 'relative/path' }), /full path/);
  assert.match((await inspectApp({})).missing[0]!.question, /Which app/);
});
