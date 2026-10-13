import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink, link, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createManifest } from '../src/manifest.js';
import { exportCapsule, importCapsule } from '../src/capsule.js';
import { ReproError } from '../src/contracts.js';

async function workspace() {
  const parent = resolve('.repro-runs/capsule-tests');
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, 'case-'));
}

test('capsule exports explicit dependencies and readable tests, then imports the exact manifest', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  const manifest = createManifest();
  const result = await exportCapsule(manifest, output);
  assert.equal(result.path, output);
  assert.deepEqual(await importCapsule(output), manifest);
  const conventional = await readFile(join(output, 'replay.test.mjs'), 'utf8');
  assert.match(conventional, /node:assert\/strict/);
  assert.match(conventional, /Beta synthetic result/);
  const files = await readdir(output);
  assert.ok(files.includes('package-lock.json'));
  assert.ok(files.includes('Dockerfile'));
  assert.ok(!files.some((file) => file.includes('.partial')));
  await assert.rejects(exportCapsule(manifest, output), ReproError);
});

test('secret-bearing capture is rejected before any bundle or partial output is created', async () => {
  const parent = await workspace();
  const source = { ...createManifest(), authorization: 'Bearer privacy-sentinel-do-not-export' };
  await assert.rejects(exportCapsule(source, join(parent, 'bundle')), ReproError);
  assert.deepEqual(await readdir(parent), []);
});

test('capsule carries the exact approved inert Linux policy in its integrity inventory', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  await exportCapsule(createManifest(), output);
  const path = 'security/repro-chromium-seccomp.json';
  const policy = await readFile(join(output, path));
  const expected = '949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b';
  assert.equal(createHash('sha256').update(policy).digest('hex'), expected);
  const index = JSON.parse(await readFile(join(output, 'integrity.json'), 'utf8'));
  assert.deepEqual(index.files.find((file: { path: string }) => file.path === path), { path, sha256: expected, bytes: policy.length });
  assert.deepEqual(await importCapsule(output), createManifest());
});

test('a broadened policy with recomputed integrity cannot pass trusted capsule validation', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  await exportCapsule(createManifest(), output);
  const path = 'security/repro-chromium-seccomp.json';
  const policy = JSON.parse(await readFile(join(output, path), 'utf8'));
  policy.defaultAction = 'SCMP_ACT_ALLOW';
  const bytes = Buffer.from(JSON.stringify(policy));
  await writeFile(join(output, path), bytes);
  const indexPath = join(output, 'integrity.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const artifact = index.files.find((file: { path: string }) => file.path === path);
  artifact.bytes = bytes.length; artifact.sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(indexPath, JSON.stringify(index));
  await assert.rejects(importCapsule(output), (error: unknown) => error instanceof ReproError && error.code === 'CAPSULE_TRUST');
});

test('cancelled export never finalizes and clears its owned partial directory', async () => {
  const parent = await workspace();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(exportCapsule(createManifest(), join(parent, 'bundle'), { signal: controller.signal }), (error: unknown) => error instanceof ReproError && error.category === 'cancelled');
  assert.deepEqual(await readdir(parent), []);
});

test('cancelling after staging begins removes only the owned partial output', async () => {
  const parent = await workspace(); const controller = new AbortController();
  await writeFile(join(parent, 'unrelated.txt'), 'preserve this neighboring file');
  let artifactsWritten = 0;
  await assert.rejects(exportCapsule(createManifest(), join(parent, 'bundle'), {
    signal: controller.signal,
    onProgress(event) {
      if (event.phase === 'artifact-written') { artifactsWritten = event.completed; controller.abort(); }
    },
  }), (error: unknown) => error instanceof ReproError && error.category === 'cancelled');
  assert.equal(artifactsWritten, 1);
  assert.deepEqual(await readdir(parent), ['unrelated.txt']);
  assert.equal(await readFile(join(parent, 'unrelated.txt'), 'utf8'), 'preserve this neighboring file');
});

test('concurrent exports to one destination have one completed owner and no partial residue', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  const results = await Promise.allSettled([exportCapsule(createManifest(), output), exportCapsule(createManifest(), output)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.deepEqual(await readdir(parent), ['bundle']);
  assert.deepEqual(await importCapsule(output), createManifest());
});

test('import rejects unsupported archives, traversal records and artifacts not in the export allowlist', async () => {
  const parent = await workspace();
  const archive = join(parent, 'hostile.zip'); await writeFile(archive, 'PK');
  await assert.rejects(importCapsule(archive), (error: unknown) => error instanceof ReproError && error.category === 'unsupported');
  const output = join(parent, 'bundle'); await exportCapsule(createManifest(), output);
  await writeFile(join(output, 'unknown.env'), 'privacy-sentinel');
  await assert.rejects(importCapsule(output), ReproError);
  await rm(join(output, 'unknown.env'));
  const indexPath = join(output, 'integrity.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  index.files[0].path = '../outside'; await writeFile(indexPath, JSON.stringify(index));
  await assert.rejects(importCapsule(output), ReproError);
});

test('import rejects symlinks, hardlinks and an artifact exceeding its size bound', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  await exportCapsule(createManifest(), output);
  const target = join(output, 'manifest.json'); const contents = await readFile(target);
  const external = join(parent, 'outside.json'); await writeFile(external, contents);
  await rm(target); await symlink(external, target);
  await assert.rejects(importCapsule(output), ReproError);
  await rm(target); await link(external, target);
  await assert.rejects(importCapsule(output), ReproError);
  await rm(target); await writeFile(target, Buffer.alloc(65_537));
  await assert.rejects(importCapsule(output), ReproError);
});

test('changing an executable and recomputing self-declared integrity still fails trusted-runner validation', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  await exportCapsule(createManifest(), output);
  const malicious = Buffer.from('throw new Error("capsule-code-must-not-run");');
  await writeFile(join(output, 'dist/index.js'), malicious);
  const indexPath = join(output, 'integrity.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const entry = index.files.find((file: { path: string }) => file.path === 'dist/index.js');
  entry.bytes = malicious.length; entry.sha256 = createHash('sha256').update(malicious).digest('hex');
  await writeFile(indexPath, JSON.stringify(index));
  await assert.rejects(importCapsule(output), (error: unknown) => error instanceof ReproError && error.category === 'verification' && !error.message.includes('capsule-code-must-not-run'));
});

test('incomplete capsule, duplicate integrity entries and tampered app identity are rejected', async () => {
  const parent = await workspace(); const incomplete = join(parent, 'incomplete');
  await mkdir(incomplete); await writeFile(join(incomplete, 'manifest.json'), JSON.stringify(createManifest()));
  await assert.rejects(importCapsule(incomplete), ReproError);
  const output = join(parent, 'bundle'); await exportCapsule(createManifest(), output);
  const indexPath = join(output, 'integrity.json'); const original = await readFile(indexPath, 'utf8');
  const duplicate = JSON.parse(original); duplicate.files.push(duplicate.files[0]);
  await writeFile(indexPath, JSON.stringify(duplicate)); await assert.rejects(importCapsule(output), ReproError);
  const manifest = createManifest(); manifest.app.sourceDigest = '0'.repeat(64);
  const bytes = Buffer.from(JSON.stringify(manifest)); await writeFile(join(output, 'manifest.json'), bytes);
  const index = JSON.parse(original); const entry = index.files.find((file: { path: string }) => file.path === 'manifest.json');
  entry.bytes = bytes.length; entry.sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(indexPath, JSON.stringify(index)); await assert.rejects(importCapsule(output), ReproError);
});

test('runtime generated directories are excluded explicitly, but generated-directory symlinks are forbidden', async () => {
  const parent = await workspace(); const output = join(parent, 'bundle');
  await exportCapsule(createManifest(), output);
  await mkdir(join(output, '.repro-runs')); await writeFile(join(output, '.repro-runs', 'result.json'), '{}');
  assert.deepEqual(await importCapsule(output), createManifest());
  await rm(join(output, '.repro-runs'), { recursive: true });
  await symlink(parent, join(output, '.repro-runs'));
  await assert.rejects(importCapsule(output), ReproError);
});
