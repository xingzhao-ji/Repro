import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, stat } from 'node:fs/promises';
import { homedir, platform, arch, release, tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ReproError } from './contracts.js';
import { digest } from './manifest.js';
import { isSensitiveFileName, sanitizeRemote } from './redaction.js';
import { isLoopbackUrl } from './app-execution.js';
import type { LaunchPlan } from './app-process.js';

/**
 * Read-only inspection of a user's local web app: how to start it, which exact
 * source it runs, and what a recipient needs. Git is only read, with optional
 * locks disabled, so inspection never writes the user's index or refs.
 */
export interface AppInput { repository?: string | undefined; url?: string | undefined; start?: string | undefined }
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export interface GitIdentity {
  root: string; appPath: string; commit: string | null; branch: string | null;
  remotes: { name: string; url: string }[];
  /** Remote-tracking branches that already contain HEAD, as of the last fetch. */
  pushedTo: string[];
  dirty: boolean;
  changed: { path: string; status: string }[];
  untracked: string[];
  /** Exact working-tree patch against HEAD for a fresh checkout; never embedded unredacted. */
  patch: string;
  omitted: { path: string; reason: string }[];
}
export interface PackageFacts {
  name: string | null; version: string | null; scripts: Record<string, string>;
  dependencies: Record<string, string>; devDependencies: Record<string, string>;
  engines: Record<string, string>; resolved: Record<string, string>;
  lockfile: { file: string; sha256: string } | null; nodeVersionFile: string | null;
}
export interface AppProfile {
  name: string;
  directory: string | null;
  /** How Repro runs the app during this report. */
  plan: LaunchPlan | null;
  /** How a fresh checkout and the exported test start the app; null when only a running URL is known. */
  startPlan: LaunchPlan | null;
  install: string | null;
  packageManager: PackageManager | null;
  dependenciesInstalled: boolean | null;
  git: GitIdentity | null;
  packageFacts: PackageFacts | null;
  environment: { os: string; node: string; packageManagerVersion: string | null };
  /** Questions Repro must ask before it can run; empty when ready. */
  missing: { field: 'repository' | 'start' | 'url' | 'install'; question: string }[];
  notes: string[];
  sourceDigest: string;
}

const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', LC_ALL: 'C' };
function run(command: string, args: string[], cwd: string, maxBuffer = 1024 * 1024, timeout = 15_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(accept => {
    execFile(command, args, { cwd, env: GIT_ENV, maxBuffer, timeout, encoding: 'utf8' }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : -1) : 0;
      accept({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}
const git = (cwd: string, args: string[], maxBuffer?: number) => run('git', ['-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false', ...args], cwd, maxBuffer);

/** An inline NAME=value assignment whose name suggests a credential, e.g. DB_PASSWORD=x npm run dev. */
export function inlineSecret(command: string): string | null {
  const match = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|CREDENTIAL)[A-Za-z0-9_]*)=\S/i.exec(command);
  return match ? match[1]! : null;
}
export function expandHome(path: string): string { return path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(), path.slice(2)) : path; }
async function readJsonFile(path: string, limit = 256 * 1024): Promise<unknown> {
  const info = await lstat(path);
  if (!info.isFile() || info.size > limit) throw new ReproError('input', 'APP_FILE', `${basename(path)} must be a regular file under ${Math.round(limit / 1024)} KiB.`);
  return JSON.parse(await readFile(path, 'utf8'));
}
async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
const strings = (value: unknown): Record<string, string> => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => typeof item === 'string').map(([key, item]) => [key, item as string])) : {};

interface ReproConfig { start?: string; url?: string; install?: string; env?: Record<string, string>; startTimeoutMs?: number; static?: string }
/** repro.config.json: the explicit, documented way to describe an app Repro cannot detect. */
async function readConfig(directory: string): Promise<ReproConfig | null> {
  const path = join(directory, 'repro.config.json');
  if (!(await exists(path))) return null;
  let value: unknown;
  try { value = await readJsonFile(path, 16 * 1024); }
  catch (cause) { throw new ReproError('input', 'APP_CONFIG', 'repro.config.json is not valid JSON.', { cause }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReproError('input', 'APP_CONFIG', 'repro.config.json must be a JSON object.');
  const config = value as Record<string, unknown>;
  const allowed = ['start', 'url', 'install', 'env', 'startTimeoutMs', 'static', '$schema', 'notes'];
  const unknown = Object.keys(config).filter(key => !allowed.includes(key));
  if (unknown.length) throw new ReproError('input', 'APP_CONFIG', `repro.config.json has unsupported fields: ${unknown.join(', ')}.`);
  for (const key of ['start', 'url', 'install', 'static'] as const) if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key] || (config[key] as string).length > 500 || /[\r\n]/.test(config[key] as string))) throw new ReproError('input', 'APP_CONFIG', `repro.config.json "${key}" must be a one-line string.`);
  for (const key of ['start', 'install'] as const) if (typeof config[key] === 'string' && inlineSecret(config[key] as string)) throw new ReproError('input', 'APP_CONFIG', `repro.config.json "${key}" sets ${inlineSecret(config[key] as string)} inline. Put secrets in your shell environment instead.`);
  if (config['startTimeoutMs'] !== undefined && (!Number.isSafeInteger(config['startTimeoutMs']) || (config['startTimeoutMs'] as number) < 1000 || (config['startTimeoutMs'] as number) > 300_000)) throw new ReproError('input', 'APP_CONFIG', 'startTimeoutMs must be between 1000 and 300000.');
  const env = config['env'] === undefined ? {} : config['env'];
  if (!env || typeof env !== 'object' || Array.isArray(env) || Object.entries(env).some(([key, item]) => !/^[A-Z_][A-Z0-9_]{0,63}$/.test(key) || typeof item !== 'string' || item.length > 500
    || /SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE/.test(key))) throw new ReproError('input', 'APP_CONFIG', 'repro.config.json "env" holds non-secret NAME: "value" pairs only; pass secrets through your shell instead.');
  if (config['url'] !== undefined && !isLoopbackUrl((config['url'] as string).replaceAll('{port}', '1'))) throw new ReproError('input', 'APP_URL', 'repro.config.json "url" must be a loopback http(s) URL.');
  return config as ReproConfig;
}
function packageManagerOf(files: Set<string>, manager: string | undefined): PackageManager {
  const declared = /^(npm|pnpm|yarn|bun)@/.exec(manager ?? '')?.[1] as PackageManager | undefined;
  if (declared) return declared;
  if (files.has('pnpm-lock.yaml')) return 'pnpm';
  if (files.has('yarn.lock')) return 'yarn';
  if (files.has('bun.lockb') || files.has('bun.lock')) return 'bun';
  return 'npm';
}
function installCommand(manager: PackageManager, files: Set<string>): string {
  switch (manager) {
    case 'npm': return files.has('package-lock.json') || files.has('npm-shrinkwrap.json') ? 'npm ci' : 'npm install';
    case 'pnpm': return 'pnpm install --frozen-lockfile';
    case 'yarn': return files.has('.yarnrc.yml') ? 'yarn install --immutable' : 'yarn install --frozen-lockfile';
    case 'bun': return 'bun install --frozen-lockfile';
  }
}
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];

async function packageFacts(directory: string, files: Set<string>): Promise<PackageFacts | null> {
  if (!files.has('package.json')) return null;
  let value: Record<string, unknown>;
  try { value = await readJsonFile(join(directory, 'package.json')) as Record<string, unknown>; }
  catch (cause) { throw new ReproError('input', 'APP_PACKAGE', 'package.json could not be read as JSON.', { cause }); }
  const lockName = LOCKFILES.find(name => files.has(name)) ?? null;
  let lockfile: PackageFacts['lockfile'] = null;
  const resolved: Record<string, string> = {};
  if (lockName) {
    const bytes = await readFile(join(directory, lockName));
    lockfile = { file: lockName, sha256: createHash('sha256').update(bytes).digest('hex') };
    if (lockName === 'package-lock.json' || lockName === 'npm-shrinkwrap.json') {
      try {
        const packages = (JSON.parse(bytes.toString('utf8')) as { packages?: Record<string, { version?: string }> }).packages ?? {};
        for (const name of [...Object.keys(strings(value['dependencies'])), ...Object.keys(strings(value['devDependencies']))]) {
          const version = packages[`node_modules/${name}`]?.version;
          if (version) resolved[name] = version;
        }
      } catch { /* an unreadable lockfile still has a digest; versions fall back to installed packages */ }
    }
  }
  for (const name of [...Object.keys(strings(value['dependencies'])), ...Object.keys(strings(value['devDependencies']))]) {
    if (resolved[name] || name.includes('..')) continue;
    try { const installed = await readJsonFile(join(directory, 'node_modules', name, 'package.json'), 1024 * 1024) as { version?: unknown }; if (typeof installed.version === 'string') resolved[name] = installed.version; }
    catch { /* not installed */ }
  }
  const nodeVersionFile = files.has('.nvmrc') ? '.nvmrc' : files.has('.node-version') ? '.node-version' : null;
  return { name: typeof value['name'] === 'string' ? value['name'] : null, version: typeof value['version'] === 'string' ? value['version'] : null,
    scripts: strings(value['scripts']), dependencies: strings(value['dependencies']), devDependencies: strings(value['devDependencies']),
    engines: strings(value['engines']), resolved, lockfile, nodeVersionFile };
}

const MAX_PATCH = 256 * 1024, MAX_UNTRACKED = 64 * 1024;
/** Untracked files are embedded only when they look like source or configuration; notes, logs and data are listed by name. */
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|css|scss|sass|less|html?|json|ya?ml|toml|graphql|gql|sql|py|rb|go|rs|java|kt|php|cs|swift|sh|svg)$|(?:^|\/)(?:Dockerfile|Makefile|Procfile)$/i;
async function isText(path: string, limit: number): Promise<boolean> {
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > limit) return false;
      const buffer = Buffer.alloc(Math.min(info.size, 8192));
      await handle.read(buffer, 0, buffer.length, 0);
      return !buffer.includes(0);
    } finally { await handle.close(); }
  } catch { return false; }
}
/** Git facts for the folder, or null if it is not inside a work tree. */
export async function gitIdentity(directory: string): Promise<GitIdentity | null> {
  const top = await git(directory, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0) return null;
  const root = await realpath(top.stdout.trim());
  const appPath = relative(root, directory).split(sep).join('/') || '.';
  // An ignored or never-added folder inside some other repository has no revision of its own.
  if (appPath !== '.' && !(await git(root, ['ls-files', '--cached', '--', appPath], 64 * 1024 * 1024)).stdout.trim()) return null;
  const head = await git(root, ['rev-parse', '--verify', '-q', 'HEAD']);
  const commit = head.code === 0 ? head.stdout.trim() : null;
  const branch = (await git(root, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim() || null;
  const remotes = [...new Map((await git(root, ['remote', '-v'])).stdout.split('\n').map(line => /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line))
    .filter(Boolean).map(match => [match![1]!, { name: match![1]!, url: sanitizeRemote(match![2]!).url }])).values()];
  const pushedTo = commit ? (await git(root, ['branch', '-r', '--contains', commit, '--format=%(refname:short)'])).stdout.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 10) : [];
  const status = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 4 * 1024 * 1024);
  const changed: GitIdentity['changed'] = [], untracked: string[] = [];
  const entries = status.stdout.split('\0').filter(Boolean);
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const code = entry.slice(0, 2), path = entry.slice(3);
    if (code === '??') untracked.push(path);
    else { changed.push({ path, status: code.trim() || 'M' }); if (code.startsWith('R') || code.startsWith('C')) index++; }
  }
  const omitted: GitIdentity['omitted'] = [];
  const tracked: string[] = [];
  if (commit) {
    const numstat = (await git(root, ['diff', 'HEAD', '--numstat', '--no-color', '--no-ext-diff', '--no-renames'], 4 * 1024 * 1024)).stdout.split('\n').filter(Boolean);
    for (const line of numstat) {
      const [added, removed, ...rest] = line.split('\t');
      const path = rest.join('\t');
      if (isSensitiveFileName(path)) omitted.push({ path, reason: 'sensitive file name; content withheld' });
      else if (added === '-' || removed === '-') omitted.push({ path, reason: 'binary change; not embedded' });
      else tracked.push(path);
    }
  }
  let patch = '';
  if (tracked.length) {
    const diff = await git(root, ['diff', 'HEAD', '--no-color', '--no-ext-diff', '--no-renames', '--', ...tracked], MAX_PATCH * 4);
    patch += diff.stdout;
  }
  for (const path of untracked) {
    if (isSensitiveFileName(path)) { omitted.push({ path, reason: 'sensitive file name; content withheld' }); continue; }
    if (!SOURCE_FILE.test(path)) { omitted.push({ path, reason: 'untracked file that is not source code or configuration; not embedded' }); continue; }
    if (!(await isText(join(root, path), MAX_UNTRACKED))) { omitted.push({ path, reason: 'untracked binary or large file; not embedded' }); continue; }
    const diff = await git(root, ['diff', '--no-index', '--no-color', '--no-ext-diff', '--', '/dev/null', path]);
    patch += diff.stdout;
  }
  if (patch.includes('\r')) {
    omitted.push({ path: '(all local changes)', reason: 'the changes contain CRLF line endings, which a Markdown code block cannot carry exactly; commit the changes and share the commit instead' });
    patch = '';
  }
  if (Buffer.byteLength(patch) > MAX_PATCH) {
    omitted.push({ path: '(all local changes)', reason: `patch larger than ${MAX_PATCH / 1024} KiB; commit the changes and share the commit instead` });
    patch = '';
  }
  return { root, appPath, commit, branch, remotes, pushedTo, dirty: changed.length > 0 || untracked.length > 0, changed, untracked, patch, omitted };
}

/** The globally installed package manager's version, probed from a neutral folder: inspection never executes the app's code or config. */
async function versionOf(command: string): Promise<string | null> {
  const result = await new Promise<{ code: number; stdout: string }>(accept => execFile(command, ['--version'], { cwd: tmpdir(), timeout: 10_000, maxBuffer: 64 * 1024, encoding: 'utf8',
    env: { ...process.env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', YARN_IGNORE_PATH: '1' } },
    (error, stdout) => accept({ code: error ? -1 : 0, stdout: String(stdout) })));
  return result.code === 0 ? result.stdout.trim().split('\n')[0]!.slice(0, 60) : null;
}

/** Inspect the app folder and URL. Never executes the app; never writes into the folder. */
export async function inspectApp(input: AppInput): Promise<AppProfile> {
  const missing: AppProfile['missing'] = [], notes: string[] = [];
  const url = input.url?.trim() || undefined;
  if (url && !isLoopbackUrl(url)) throw new ReproError('input', 'APP_URL', 'Use a running app on this machine: http://127.0.0.1:PORT, http://localhost:PORT or http://[::1]:PORT.');
  const start = input.start?.trim() || undefined;
  if (start && (start.length > 500 || /[\r\n]/.test(start))) throw new ReproError('input', 'APP_COMMAND', 'The start command must be a single line.');
  // REPRO.md and the exported test repeat the start command, so it must not carry credentials.
  if (start && inlineSecret(start)) throw new ReproError('input', 'APP_COMMAND_SECRET', `The start command sets ${inlineSecret(start)} inline. Put secrets in your shell environment instead; Repro passes your environment to the app but never writes it into the report.`);
  let directory: string | null = null;
  if (input.repository?.trim()) {
    const raw = expandHome(input.repository.trim());
    if (!isAbsolute(raw)) throw new ReproError('input', 'APP_FOLDER', 'Give the full path of your app folder, for example /Users/you/projects/my-app.');
    try { directory = await realpath(resolve(raw)); }
    catch { throw new ReproError('input', 'APP_FOLDER', 'That folder does not exist.'); }
    if (!(await stat(directory)).isDirectory()) throw new ReproError('input', 'APP_FOLDER', 'Choose a folder, not a file.');
  }
  if (!directory && !url) missing.push({ field: 'repository', question: 'Which app? Give the folder of your app (and, optionally, the URL where it is already running).' });
  const files = new Set<string>();
  if (directory) for (const name of ['package.json', 'index.html', 'repro.config.json', '.nvmrc', '.node-version', 'node_modules', '.yarnrc.yml', ...LOCKFILES]) if (await exists(join(directory, name))) files.add(name);
  const config = directory ? await readConfig(directory) : null;
  const facts = directory ? await packageFacts(directory, files) : null;
  const manager = facts ? packageManagerOf(files, strings(await readJsonFile(join(directory!, 'package.json')).catch(() => ({})))['packageManager']) : null;
  const install = config?.install ?? (facts && manager ? installCommand(manager, files) : null);
  const name = (facts?.name ?? (directory ? basename(directory) : url ? new URL(url).host : 'app')).replace(/[^A-Za-z0-9@._/-]/g, '-').slice(0, 100) || 'app';
  let startPlan: LaunchPlan | null = null;
  const env = config?.env ?? {};
  const startTimeoutMs = config?.startTimeoutMs ?? 60_000;
  if (directory) {
    if (start) startPlan = { kind: 'command', directory, command: start, url: config?.url ?? null, env, startTimeoutMs, source: 'the start command you entered' };
    else if (config?.start) startPlan = { kind: 'command', directory, command: config.start, url: config.url ?? null, env, startTimeoutMs, source: 'repro.config.json "start"' };
    else if (config?.static) {
      const folder = await realpath(resolve(directory, config.static)).catch(() => null);
      if (!folder || relative(directory, folder).startsWith('..')) throw new ReproError('input', 'APP_CONFIG', 'repro.config.json "static" must name a folder inside the app.');
      startPlan = { kind: 'static', directory: folder, command: null, url: null, env: {}, startTimeoutMs, source: `repro.config.json "static" (${config.static}) served by Repro` };
    } else if (facts) {
      const script = ['dev', 'start', 'serve', 'preview'].find(candidate => facts.scripts[candidate]);
      if (script && manager) startPlan = { kind: 'command', directory, command: `${manager} run ${script}`, url: config?.url ?? null, env, startTimeoutMs, source: `package.json script "${script}" (${inlineSecret(facts.scripts[script]!) ? 'it sets a secret inline, so it is not shown' : facts.scripts[script]!.slice(0, 120)})` };
    }
    if (!startPlan && files.has('index.html')) startPlan = { kind: 'static', directory, command: null, url: null, env: {}, startTimeoutMs, source: 'index.html served by Repro (no start script found)' };
    if (!startPlan && !url) missing.push({ field: 'start', question: 'How do you start this app? Enter the command you use, e.g. npm run dev, or add a repro.config.json.' });
  }
  const plan: LaunchPlan | null = url ? { kind: 'external', directory, command: null, url, env: {}, startTimeoutMs, source: 'the running app at the URL you entered' } : startPlan;
  let dependenciesInstalled: boolean | null = null;
  if (facts) {
    const declared = Object.keys(facts.dependencies).length + Object.keys(facts.devDependencies).length;
    dependenciesInstalled = declared === 0 || files.has('node_modules');
    if (!dependenciesInstalled && !url && startPlan?.kind === 'command') missing.push({ field: 'install', question: `Install the app's dependencies first: run ${install ?? 'npm install'} in the app folder, then try again. Repro does not modify your folder.` });
  }
  const gitFacts = directory ? await gitIdentity(directory) : null;
  if (directory && !gitFacts) notes.push('The folder is not a git repository, so the report cannot name an exact source revision and no fresh-checkout check is possible.');
  if (gitFacts && !gitFacts.commit) notes.push('The repository has no commits yet, so there is no revision a recipient can check out.');
  if (gitFacts?.commit && !gitFacts.remotes.length) notes.push('The repository has no remote. A recipient needs access to this repository, for example a pushed branch or a git bundle.');
  else if (gitFacts?.commit && !gitFacts.pushedTo.length) notes.push('The checked-out commit is not on any remote-tracking branch Repro knows about. Push it before sharing the report.');
  if (url) notes.push(directory ? 'Repro used the already-running app at the URL you gave. It could not restart it between runs, so server state may carry over, and it cannot prove the server is running the recorded source.'
    : 'Only a URL was given. A URL does not provide source code or a portable environment, so the report cannot name a revision, dependencies or setup.');
  const environment = { os: `${platform()} ${release()} (${arch()})`, node: process.version,
    packageManagerVersion: manager && directory ? await versionOf(manager) : null };
  const sourceDigest = digest({ commit: gitFacts?.commit ?? null, patch: createHash('sha256').update(gitFacts?.patch ?? '').digest('hex'),
    omitted: gitFacts?.omitted ?? [], lockfile: facts?.lockfile ?? null, command: plan?.command ?? null, kind: plan?.kind ?? null, appPath: gitFacts?.appPath ?? null });
  return { name, directory, plan, startPlan, install, packageManager: manager, dependenciesInstalled, git: gitFacts, packageFacts: facts, environment, missing, notes, sourceDigest };
}
