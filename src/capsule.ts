import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReproError, VERSION, type Manifest } from './contracts.js';
import { canonicalJson, digest, validateManifest } from './manifest.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LIMIT = 16 * 1024 * 1024;
const TOTAL_LIMIT = 32 * 1024 * 1024;
const GENERATED = new Set(['node_modules', '.repro-runs', '.repro-cache']);
const POLICY_PATH = 'security/repro-chromium-seccomp.json';
const POLICY_SHA256 = '949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b';
const FILES = ['.dockerignore', 'Dockerfile', 'README.md', 'dist/cli.js', 'dist/index.js', 'fixtures/browser-search/page.html', 'fixtures/browser-search/buggy.js', 'fixtures/browser-search/fixed.js', 'manifest.json', 'package-lock.json', 'package.json', 'replay.test.mjs', POLICY_PATH] as const;
type Artifact = { path: string; sha256: string; bytes: number };
type Integrity = { format: 'repro-directory-v1'; schemaVersion: 1; manifestDigest: string; files: Artifact[] };
export interface ExportProgress { phase: 'staging' | 'artifact-written' | 'validated'; completed: number; total: number; path?: string }
type ExportOptions = { signal?: AbortSignal; onProgress?: (event: ExportProgress) => void };

function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReproError('cancelled', 'EXPORT_CANCELLED', 'Capsule export was cancelled before finalization.');
}

function hash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

function safeArtifactPath(path: unknown): asserts path is typeof FILES[number] {
  if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\') || path.includes('\0')
      || path.split('/').some((part) => part === '.' || part === '..' || part === '') || !FILES.includes(path as typeof FILES[number])) {
    throw new ReproError('input', 'CAPSULE_PATH', 'Capsule contains an unsafe or unapproved artifact path.');
  }
}

async function readBounded(path: string, maximum = LIMIT): Promise<Buffer> {
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maximum) {
      throw new ReproError('input', 'CAPSULE_FILE', 'Capsule files must be bounded regular files without symbolic or hard links.');
    }
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximum || before.ino !== stat.ino || before.dev !== stat.dev) {
        throw new ReproError('input', 'CAPSULE_FILE_CHANGED', 'Capsule file changed during validation.');
      }
      const chunks: Buffer[] = []; let bytes = 0;
      while (true) {
        const buffer = Buffer.alloc(Math.min(65_536, maximum + 1 - bytes));
        const result = await file.read(buffer);
        if (!result.bytesRead) break;
        bytes += result.bytesRead;
        if (bytes > maximum) throw new ReproError('input', 'CAPSULE_SIZE', 'Capsule artifact exceeds its size limit.');
        chunks.push(buffer.subarray(0, result.bytesRead));
      }
      return Buffer.concat(chunks, bytes);
    } finally { await file.close(); }
  } catch (cause) {
    if (cause instanceof ReproError) throw cause;
    throw new ReproError('input', 'CAPSULE_READ', 'A required capsule artifact could not be read safely.', { cause });
  }
}

function parseJson(bytes: Buffer): unknown {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (cause) { throw new ReproError('input', 'CAPSULE_JSON', 'A capsule JSON artifact is malformed.', { cause }); }
}

function integrity(input: unknown): Integrity {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ReproError('input', 'CAPSULE_INTEGRITY', 'Capsule integrity metadata is malformed.');
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 4 || keys.some((key) => !['format', 'schemaVersion', 'manifestDigest', 'files'].includes(key))
      || record['format'] !== 'repro-directory-v1' || record['schemaVersion'] !== 1
      || typeof record['manifestDigest'] !== 'string' || !/^[a-f0-9]{64}$/.test(record['manifestDigest'])
      || !Array.isArray(record['files']) || record['files'].length !== FILES.length) {
    throw new ReproError('input', 'CAPSULE_INTEGRITY', 'Capsule integrity metadata is incompatible or incomplete.');
  }
  const seen = new Set<string>(); let total = 0;
  for (const value of record['files']) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReproError('input', 'CAPSULE_INTEGRITY', 'Capsule artifact metadata is malformed.');
    const artifact = value as Record<string, unknown>;
    if (Object.keys(artifact).length !== 3 || Object.keys(artifact).some((key) => !['path', 'sha256', 'bytes'].includes(key))) throw new ReproError('input', 'CAPSULE_INTEGRITY', 'Capsule artifact metadata has unapproved fields.');
    safeArtifactPath(artifact['path']);
    if (seen.has(artifact['path']) || typeof artifact['sha256'] !== 'string' || !/^[a-f0-9]{64}$/.test(artifact['sha256'])
        || typeof artifact['bytes'] !== 'number' || !Number.isSafeInteger(artifact['bytes']) || artifact['bytes'] < 0 || artifact['bytes'] > LIMIT) {
      throw new ReproError('input', 'CAPSULE_INTEGRITY', 'Capsule artifact metadata has duplicate, invalid or oversized entries.');
    }
    total += artifact['bytes']; seen.add(artifact['path']);
  }
  if (total > TOTAL_LIMIT) throw new ReproError('input', 'CAPSULE_SIZE', 'Capsule exceeds the 32 MiB total size limit.');
  return input as Integrity;
}

const README = `# Repro portable synthetic failure capsule

This is a trusted local synthetic training fixture, not a recording of a user or an independently discovered historical bug. Its expectation comes from the supplied synthetic specification; human approval is not claimed. Only the registered stale-response frontend adapter is supported. No database, credentials, original application service, proprietary viewer or LLM is required.

## Inspect and replay

Use an independently obtained trusted Repro runner to inspect this directory before execution: \`repro inspect --capsule /path/to/capsule\`. SHA-256 establishes integrity, not trust in an author. Do not execute an unknown bundle on your host. Repro only supports explicitly trusted local fixtures; public or hostile capsule execution is unsupported.

The declared runner is Repro ${VERSION}; Node >=24, npm, the exact package-lock.json dependencies, Chromium and Chromium's Linux system libraries are required. The package and lockfile declare all npm dependencies. Dependency installation and Chromium acquisition need access to their official registries/CDN; replay itself uses controlled local HTTP only.

On a fresh supported Linux environment, install and run:

\`\`\`sh
npm ci --ignore-scripts --omit=dev
npx --no-install playwright install --with-deps chromium
node dist/cli.js inspect --capsule .
node dist/cli.js replay --capsule . --output .repro-runs/buggy
node dist/cli.js verify --capsule . --output .repro-runs/verification
node --test replay.test.mjs
\`\`\`

The readable test runs separate fresh browser state for buggy and fixed revisions, requires an executed frozen assertion, checks the intended buggy observation, and independently checks the fixed visible result. A missing dependency, timeout, wrong failure or assertion mismatch fails this test. The original response schedule and assertion identity remain unchanged between revisions.

## Container boundary

The supported container recipe is Linux arm64 with Docker, the pinned Node 26.7.0 Debian image, Playwright 1.64.0 and Chromium 156.0.8078.4. It was tested using Docker daemon 29.5.2 in an owned Colima 0.10.3 vz VM (2 CPUs, 3 GiB RAM, 12 GiB data disk, 8 GiB root disk), with no host directory mounts, SSH-agent forwarding, SSH-config updates, active-context changes or application port forwarding. Other architectures and runtimes are unverified. Build acquisition requires the network; replay uses only container loopback.

The inert file \`${POLICY_PATH}\` is included in integrity validation and has SHA-256 \`${POLICY_SHA256}\`. Import/export does not apply it or change Docker, Codex or browser settings. It preserves the inspected Docker all-capabilities-dropped arm64 default policy and adds unfiltered clone, setns, unshare and chroot calls for Chromium's enabled sandbox. These allowances cover all container processes and cannot restrict chroot's pathname. They expand the kernel interface even though parent capabilities are dropped; nested user namespaces may hold their own capabilities. Use only with this explicitly trusted synthetic fixture after specific approval of this exact profile and boundary. No privileged mode, additional capability or disabled Chromium sandbox is needed.

After reviewing and explicitly approving that policy, use these commands from the capsule directory with Docker pointing to your isolated owned runtime. Set \`REPRO_APPROVED_POLICY_SHA256\` to the exact hash above as a deliberate opt-in. The guard below checks both the opt-in and file bytes before any container is created:

\`\`\`sh
# Export REPRO_APPROVED_POLICY_SHA256 only after specific approval.
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),assert=require("node:assert/strict"); const expected="${POLICY_SHA256}"; assert.equal(process.env.REPRO_APPROVED_POLICY_SHA256,expected,"Explicit policy opt-in required"); assert.equal(crypto.createHash("sha256").update(fs.readFileSync("${POLICY_PATH}")).digest("hex"),expected,"Policy hash mismatch");' && (
  set -eu
  repro_run="repro-$(node -e 'console.log(require("node:crypto").randomUUID())')"
  repro_volume="$repro_run-evidence"
  mkdir -p ".repro-runs/$repro_run"
  docker build --iidfile ".repro-runs/$repro_run/image-id" .
  repro_image="$(cat ".repro-runs/$repro_run/image-id")"
  docker volume create "$repro_volume"
  docker create --name "$repro_run" --network none --read-only --cap-drop ALL --security-opt no-new-privileges --security-opt "seccomp=$(pwd)/${POLICY_PATH}" --pids-limit 128 --memory 1g --cpus 2 --tmpfs /tmp:rw,nosuid,size=256m --shm-size 256m --mount "type=volume,src=$repro_volume,dst=/work/.repro-runs" "$repro_image"
  docker inspect "$repro_run" > ".repro-runs/$repro_run/container-before.json"
  repro_exit=0
  docker start --attach "$repro_run" || repro_exit=$?
  docker inspect "$repro_run" > ".repro-runs/$repro_run/container-after.json"
  docker cp "$repro_run:/work/.repro-runs/." ".repro-runs/$repro_run/"
  exit "$repro_exit"
)
\`\`\`

The image runs as unprivileged USER node. Each invocation has a fresh named evidence volume, no host bind mounts, Docker socket, credentials, public ports or external network, a read-only root, all capabilities dropped, no-new-privileges, and the resource bounds shown above. The adapter deadline is declared by environment.timeoutMs in manifest.json (10 seconds in the supplied default fixture). Retain the exited container and volume until evidence is reviewed; stop only your owned runtime afterward. If another permission is required, stop and obtain a new specific decision instead of broadening this policy.

Ordinary containers are a development boundary, not a hostile-code sandbox. A build recipe is not evidence that the portability gate passed. Consult the originating project's release evidence for actual Linux executions. The base image digest is pinned. System dependency acquisition remains explicit but is not a snapshot of the Debian package repository, so the OS build is not byte-for-byte reproducible.

## Included data and validation

Only the approved manifest, registered synthetic frontend sources, trusted runner files, locked npm metadata, the exact inert container policy, this documentation and the readable test are exported. Browser profiles, cookies, authorization headers, raw user data, unrelated source files, capture logs, screenshots and traces are excluded. No redaction is claimed: supported inputs are synthetic from their origin. Older exports without the policy must be re-exported using this trusted build; the exact artifact allowlist and trusted-runner identity deliberately reject incompatible bundles.

Import validates schema, app/runner/adapter/assertion identity, artifact allowlists, sizes and hashes before replay. Paths, symlinks, hardlinks, archives and extra artifacts are rejected. Top-level node_modules, .repro-runs and .repro-cache are explicitly excluded generated runtime directories; import does not attest to their contents or installed dependency integrity. Acquire dependencies with npm ci from the lockfile in a clean environment. Empty/incomplete exports do not have a finalized integrity record. Artifact hashes are self-consistency evidence; the trusted importing runner additionally compares executable artifacts against its own installed implementation.
`;

const READABLE_TEST = `import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { importCapsule, runBrowser } from './dist/index.js';

test('frozen latest-search requirement distinguishes buggy and fixed revisions', async () => {
  const manifest = await importCapsule(fileURLToPath(new URL('.', import.meta.url)));
  const original = await runBrowser(manifest, { artifactDir: '.repro-runs/readable-buggy', revision: 'buggy' });
  const candidate = await runBrowser(manifest, { artifactDir: '.repro-runs/readable-fixed', revision: 'fixed' });
  assert.equal(original.assertionCount, 1, 'the original assertion must execute');
  assert.equal(candidate.assertionCount, 1, 'the same candidate assertion must execute');
  assert.equal(original.assertionDigest, manifest.assertionDigest);
  assert.equal(candidate.assertionDigest, manifest.assertionDigest);
  assert.equal(original.harnessDigest, candidate.harnessDigest);
  assert.equal(original.outcome, 'target-failure');
  assert.deepEqual(original.observation, { latestRequestId: 2, query: 'beta', results: ['Alpha synthetic result'] });
  assert.equal(candidate.outcome, 'requirement-satisfied');
  assert.deepEqual(candidate.observation, { latestRequestId: 2, query: 'beta', results: ['Beta synthetic result'] });
});
`;

const DOCKERFILE = `# Linux portability recipe; execution evidence is tracked separately.
FROM node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32
WORKDIR /work
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev && npx --no-install playwright install --with-deps chromium
COPY --chown=node:node . .
RUN mkdir -p /work/.repro-runs && chown node:node /work/.repro-runs
USER node
CMD ["node", "--test", "replay.test.mjs"]
`;

async function trustedArtifacts(): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>([
    ['.dockerignore', Buffer.from('node_modules\n.repro-runs\n.repro-cache\n')],
    ['README.md', Buffer.from(README)], ['Dockerfile', Buffer.from(DOCKERFILE)],
    ['replay.test.mjs', Buffer.from(READABLE_TEST)],
  ]);
  for (const file of ['dist/cli.js', 'dist/index.js', 'package.json', 'package-lock.json', 'fixtures/browser-search/page.html', 'fixtures/browser-search/buggy.js', 'fixtures/browser-search/fixed.js', POLICY_PATH]) {
    try {
      let source = join(ROOT, file);
      if (file === 'package-lock.json') {
        // npm intentionally omits a package's root lockfile from its tarball.
        // The build includes an exact copy beneath dist for installed CLI export.
        try { await lstat(source); }
        catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
          source = join(ROOT, 'dist/package-lock.json');
        }
      }
      const content = await readBounded(source);
      if (file === POLICY_PATH && hash(content) !== POLICY_SHA256) throw new ReproError('verification', 'CAPSULE_POLICY', 'The installed container policy differs from the specifically approved profile.');
      files.set(file, content);
    }
    catch (cause) {
      if (cause instanceof ReproError && cause.code === 'CAPSULE_POLICY') throw cause;
      throw new ReproError('environment', 'CAPSULE_BUILD_REQUIRED', 'Build the trusted runner and install its lockfile before importing or exporting capsules.', { cause });
    }
  }
  return files;
}

async function scanDirectory(directory: string, prefix = ''): Promise<Set<string>> {
  const result = new Set<string>();
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length > 32) throw new ReproError('input', 'CAPSULE_FILES', 'Capsule contains excessive directory entries.');
  for (const entry of entries) {
    const path = join(directory, entry.name); const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new ReproError('input', 'CAPSULE_LINK', 'Capsule symbolic links are unsupported.');
    if (!prefix && GENERATED.has(entry.name) && stat.isDirectory()) continue;
    const local = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (stat.isDirectory()) {
      if (!['dist', 'fixtures', 'fixtures/browser-search', 'security'].includes(local)) throw new ReproError('input', 'CAPSULE_DIRECTORY', 'Capsule contains an unapproved directory.');
      for (const child of await scanDirectory(path, local)) result.add(child);
    } else {
      if (local !== 'integrity.json') safeArtifactPath(local);
      if (!stat.isFile() || stat.nlink !== 1) throw new ReproError('input', 'CAPSULE_LINK', 'Only regular single-link artifact files are supported.');
      result.add(local);
    }
  }
  return result;
}

async function validateDirectory(directory: string, allowPartial: boolean): Promise<Manifest> {
  const fullPath = resolve(directory);
  try {
    const stat = await lstat(fullPath);
    if (stat.isSymbolicLink()) throw new ReproError('input', 'CAPSULE_LINK', 'Capsule directory must not be a symbolic link.');
    if (!stat.isDirectory()) throw new ReproError('unsupported', 'CAPSULE_FORMAT', 'Only unpacked capsule directories are supported; archives are never extracted.');
    if (!allowPartial && basename(fullPath).includes('.partial-')) throw new ReproError('input', 'CAPSULE_INCOMPLETE', 'A partial capsule cannot be imported.');
    if (await realpath(fullPath) !== fullPath) throw new ReproError('input', 'CAPSULE_LINK', 'Capsule path must not traverse a symbolic link.');
    const actual = await scanDirectory(fullPath);
    if (actual.size !== FILES.length + 1 || !actual.has('integrity.json') || FILES.some((file) => !actual.has(file))) throw new ReproError('input', 'CAPSULE_INCOMPLETE', 'Capsule is missing finalized artifacts.');
    const index = integrity(parseJson(await readBounded(join(fullPath, 'integrity.json'), 32_768)));
    const trusted = await trustedArtifacts();
    let manifest: Manifest | undefined;
    for (const artifact of index.files) {
      const content = await readBounded(join(fullPath, artifact.path), artifact.path === 'manifest.json' ? 65_536 : LIMIT);
      if (content.length !== artifact.bytes || hash(content) !== artifact.sha256) throw new ReproError('verification', 'CAPSULE_HASH', 'Capsule artifact integrity verification failed.');
      if (artifact.path === 'manifest.json') manifest = validateManifest(parseJson(content));
      else {
        const expected = trusted.get(artifact.path);
        if (!expected || hash(expected) !== artifact.sha256) throw new ReproError('verification', 'CAPSULE_TRUST', 'Capsule artifact differs from the installed trusted runner or registered fixture.');
      }
    }
    if (!manifest || digest(manifest) !== index.manifestDigest) throw new ReproError('verification', 'CAPSULE_MANIFEST_HASH', 'Capsule manifest identity verification failed.');
    return manifest;
  } catch (cause) {
    if (cause instanceof ReproError) throw cause;
    throw new ReproError('input', 'CAPSULE_IMPORT', 'Capsule directory could not be safely imported.', { cause });
  }
}

/** This reads data only. No capsule-provided code is imported or executed. */
export async function importCapsule(directory: string): Promise<Manifest> {
  return validateDirectory(directory, false);
}

async function ownedOutput(output: string): Promise<string> {
  const fullPath = resolve(output); const taskRoot = resolve('.repro-runs');
  const local = relative(taskRoot, fullPath);
  if (!local || local.startsWith(`..${sep}`) || local === '..' || isAbsolute(local)) throw new ReproError('input', 'EXPORT_LOCATION', 'Generated capsules must be written beneath the current project .repro-runs directory.');
  let current = process.cwd();
  for (const part of relative(current, dirname(fullPath)).split(sep)) {
    current = join(current, part);
    try { await mkdir(current); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error; }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ReproError('input', 'EXPORT_LINK', 'Export output must not traverse a symbolic link.');
  }
  return fullPath;
}

export async function exportCapsule(input: unknown, outputDirectory: string, options: ExportOptions = {}): Promise<{ path: string; manifestDigest: string; files: number }> {
  const manifest = validateManifest(input); cancelled(options.signal);
  const artifacts = await trustedArtifacts(); cancelled(options.signal);
  artifacts.set('manifest.json', Buffer.from(`${canonicalJson(manifest)}\n`));
  const output = await ownedOutput(outputDirectory);
  const lock = `${output}.export-lock`; const temporary = join(dirname(output), `.${basename(output)}.partial-${randomUUID()}`);
  let locked = false; let staged = false;
  const progress = (event: ExportProgress): void => {
    try { options.onProgress?.(event); }
    catch (cause) { throw new ReproError('harness', 'EXPORT_OBSERVER', 'Export progress observer failed before finalization.', { cause }); }
  };
  try {
    await mkdir(lock); locked = true;
    try { await lstat(output); throw new ReproError('input', 'EXPORT_EXISTS', 'Capsule destination already exists; choose a new output directory.'); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
    cancelled(options.signal); await mkdir(temporary); staged = true;
    const files: Artifact[] = [];
    progress({ phase: 'staging', completed: 0, total: artifacts.size });
    for (const [path, content] of [...artifacts].sort(([a], [b]) => a.localeCompare(b))) {
      cancelled(options.signal); safeArtifactPath(path);
      await mkdir(dirname(join(temporary, path)), { recursive: true });
      await writeFile(join(temporary, path), content, { flag: 'wx', mode: 0o600 });
      files.push({ path, sha256: hash(content), bytes: content.length });
      progress({ phase: 'artifact-written', completed: files.length, total: artifacts.size, path });
    }
    const index: Integrity = { format: 'repro-directory-v1', schemaVersion: 1, manifestDigest: digest(manifest), files };
    cancelled(options.signal);
    await writeFile(join(temporary, 'integrity.json'), `${canonicalJson(index)}\n`, { flag: 'wx', mode: 0o600 });
    await validateDirectory(temporary, true);
    progress({ phase: 'validated', completed: files.length, total: artifacts.size });
    cancelled(options.signal);
    await rename(temporary, output); staged = false;
    return { path: output, manifestDigest: index.manifestDigest, files: files.length + 1 };
  } catch (cause) {
    if (cause instanceof ReproError) throw cause;
    throw new ReproError('input', 'CAPSULE_EXPORT', 'Capsule export could not be completed; no completion is claimed.', { cause });
  } finally {
    if (staged) await rm(temporary, { recursive: true, force: true });
    if (locked) await rm(lock, { recursive: true, force: true });
  }
}
