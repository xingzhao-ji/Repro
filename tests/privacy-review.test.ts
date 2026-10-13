import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createManifest } from '../src/manifest.js';
import { exportCapsule } from '../src/capsule.js';
import { runBrowser } from '../src/adapter.js';
import { Ledger } from '../src/ledger.js';
import type { Manifest } from '../src/contracts.js';

const SENTINEL = 'SENSITIVE_FAKE_PERSON_4829_MUST_NEVER_EXPORT';
async function root() {
  const directory = resolve('.repro-runs/privacy-review');
  await mkdir(directory, { recursive: true }); return mkdtemp(join(directory, 'case-'));
}
async function scan(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else assert.equal((await readFile(path)).includes(Buffer.from(SENTINEL)), false, `forbidden sentinel persisted into ${entry.name}`);
  }
}

test('review: disallowed capture fields and synthetic values are rejected before browser launch without persisting their contents', async () => {
  const directory = await root();
  const mutations: ((manifest: Manifest) => unknown)[] = [
    manifest => ({ ...manifest, authorization: `Bearer ${SENTINEL}` }),
    manifest => ({ ...manifest, cookies: [{ name: 'session', value: SENTINEL }] }),
    manifest => ({ ...manifest, browserProfile: SENTINEL }),
    manifest => { manifest.actions[0]!.value = SENTINEL; return manifest; },
    manifest => { manifest.responses[0]!.results = [SENTINEL]; return manifest; },
    manifest => { manifest.boundary.externalDependencies = [SENTINEL]; return manifest; },
  ];
  for (const mutate of mutations) {
    const input = mutate(createManifest()) as Manifest;
    const result = await runBrowser(input, { artifactDir: directory });
    assert.equal(result.outcome, 'inconclusive');
    assert.equal(result.assertionCount, 0);
    assert.equal(result.environment.browser, 'not-launched');
    assert.equal(JSON.stringify(result).includes(SENTINEL), false);
    assert.ok(result.artifacts.every(artifact => artifact.path.endsWith('/evidence.json')));
  }
  await scan(directory);
});

test('review: an observer error does not copy arbitrary secret text into run evidence', async () => {
  const directory = await root();
  const result = await runBrowser(createManifest(), { artifactDir: directory, onEvent() { throw new Error(SENTINEL); } });
  assert.equal(result.outcome, 'inconclusive');
  assert.equal(result.assertionCount, 0);
  assert.equal(result.environment.browser, 'not-launched');
  assert.equal(JSON.stringify(result).includes(SENTINEL), false);
  await scan(directory);
});

test('review: opt-in is required and forbidden values never enter the session ledger', async () => {
  const directory = await root(); const ledger = new Ledger(directory);
  try {
    assert.throws(() => ledger.createSession(createManifest(), false));
    const input = { ...createManifest(), headers: { authorization: SENTINEL } };
    assert.throws(() => ledger.createSession(input, true));
    assert.deepEqual(ledger.sessions(), []);
  } finally { ledger.close(); }
  await scan(directory);
});

test('review: capsule export excludes neighboring private fixtures and scans every exported artifact', async () => {
  const directory = await root();
  await writeFile(join(directory, 'unrelated-private.env'), SENTINEL);
  const capsule = join(directory, 'bundle'); await exportCapsule(createManifest(), capsule);
  await scan(capsule);
  assert.equal(await readFile(join(directory, 'unrelated-private.env'), 'utf8'), SENTINEL);
});
