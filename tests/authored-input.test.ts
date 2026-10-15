import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { serve } from '../src/server.js';
import { Ledger, type Session } from '../src/ledger.js';
import { createAuthoredManifest, createManifest } from '../src/manifest.js';

const declaration = {
  searchOrder: ['beta', 'alpha'],
  expectation: { invariantId: 'LATEST_SEARCH_RESPONSE_WINS', latestRequestId: 2, latestQuery: 'alpha', expectedResults: ['Alpha synthetic result'] },
  expectationBasis: 'independent-contract',
};
async function directory() {
  await mkdir('.repro-runs/tests', { recursive: true });
  return mkdtemp('.repro-runs/tests/authored-input-');
}

test('API freezes caller-supplied expected observation in a new session and preserves the default', async () => {
  const app = await serve({ port: 0, root: await directory() });
  try {
    const { token } = await fetch(`${app.url}/api/config`).then(r => r.json()) as { token: string };
    const headers = { 'Content-Type': 'application/json', 'X-Repro-Token': token };
    const post = (input: unknown) => fetch(`${app.url}/api/sessions`, { method: 'POST', headers, body: JSON.stringify(input) });
    const response = await post({ consent: true, experiment: declaration });
    assert.equal(response.status, 201, await response.clone().text());
    const { session } = await response.json() as { session: Session };
    assert.equal(session.manifest.schemaVersion, 2);
    assert.equal(session.manifest.expectation.latestQuery, 'alpha');
    assert.deepEqual(session.manifest.expectation.expectedResults, ['Alpha synthetic result']);
    assert.equal(session.manifest.humanApproval, 'not-claimed');
    const previous = session.manifest.assertionDigest;
    for (const experiment of [
      { ...declaration, expectation: { latestQuery: 'alpha' } },
      { ...declaration, expectation: { ...declaration.expectation, expectedResults: ['Beta synthetic result'] } },
      { ...declaration, humanApproval: 'approved' },
    ]) assert.equal((await post({ consent: true, experiment })).status, 400);
    assert.equal(app.ledger.getSession(session.id).manifest.assertionDigest, previous);
    assert.equal(app.ledger.sessions().length, 1, 'Invalid declarations must not create sessions');
    const defaultResponse = await post({ consent: true });
    assert.equal(defaultResponse.status, 201);
    const original = await defaultResponse.json() as { session: Session };
    assert.equal(original.session.manifest.schemaVersion, 1);
    assert.equal(original.session.manifest.assertionDigest, 'fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711');
    assert.notEqual(original.session.manifest.assertionDigest, previous);
  } finally { await app.close(); }
});

test('session updates cannot replace frozen provenance while action reduction remains allowed', async () => {
  const ledger = new Ledger(await directory());
  try {
    const original = createManifest();
    const session = ledger.createSession(original, true);
    assert.throws(() => ledger.updateManifest(session.id, { ...original, expectationBasis: 'proposed-unconfirmed' }), { code: 'FROZEN_EXPECTATION' });
    assert.deepEqual(ledger.getSession(session.id).manifest, original);
    const reduced = { ...original, actions: original.actions.filter(action => action.kind !== 'noise') };
    ledger.updateManifest(session.id, reduced);
    assert.equal(ledger.getSession(session.id).manifest.actions.length, 3);
    assert.equal(ledger.getSession(session.id).manifest.assertionDigest, original.assertionDigest);
  } finally { ledger.close(); }
});

test('CLI experiment input rejects malformed and linked files before creating execution output', async () => {
  const root = await directory();
  const malformed = join(root, 'malformed.json');
  const source = join(root, 'declaration.json');
  const linked = join(root, 'linked.json');
  await writeFile(malformed, '{ invalid');
  await writeFile(source, JSON.stringify(declaration));
  await symlink(resolve(source), linked);
  for (const [input, code] of [[malformed, 'EXPERIMENT_JSON'], [linked, 'EXPERIMENT_FILE']] as const) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'record', '--consent', '--experiment', input, '--output', join(root, code)], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal((JSON.parse(result.stderr) as { code: string }).code, code);
  }
});

test('a different valid declaration must create a new session instead of rewriting frozen history', async () => {
  const ledger = new Ledger(await directory());
  try {
    const original = createAuthoredManifest(declaration);
    const session = ledger.createSession(original, true);
    const other = createAuthoredManifest({
      ...declaration, searchOrder: ['alpha', 'beta'],
      expectation: { ...declaration.expectation, latestQuery: 'beta', expectedResults: ['Beta synthetic result'] },
    });
    for (const replacement of [other, createManifest(), { ...original, expectationBasis: 'proposed-unconfirmed' as const }]) {
      assert.throws(() => ledger.updateManifest(session.id, replacement), { code: 'FROZEN_EXPECTATION' });
      assert.deepEqual(ledger.getSession(session.id).manifest, original);
    }
    ledger.updateManifest(session.id, { ...original, actions: original.actions.filter(action => action.kind !== 'noise') });
    const second = ledger.createSession(other, true);
    assert.notEqual(second.id, session.id);
    assert.equal(ledger.getSession(session.id).manifest.assertionDigest, original.assertionDigest);
  } finally { ledger.close(); }
});
