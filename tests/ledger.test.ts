import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { Ledger } from '../src/ledger.js';
import { createManifest } from '../src/manifest.js';

async function ledger() {
  await mkdir('.repro-runs/tests', { recursive: true });
  return new Ledger(await mkdtemp('.repro-runs/tests/ledger-'));
}
test('ledger deduplicates job requests, prevents overlapping session jobs, and survives restart', async () => {
  const db = await ledger();
  const session = db.createSession(createManifest(), true);
  const a = db.startJob(session.id, 'record', 'request-1');
  assert.equal(db.startJob(session.id, 'record', 'request-1').id, a.id);
  assert.throws(() => db.startJob(session.id, 'reduce', 'request-2'), /already running/);
  db.event(a.id, 'capture', 'Captured approved synthetic action');
  const dir = db.root; db.close();
  const recovered = new Ledger(dir);
  assert.equal(recovered.getSession(session.id).state, 'blocked');
  assert.equal(recovered.jobs(session.id)[0]?.status, 'interrupted');
  const events = recovered.events(a.id);
  assert.deepEqual(events.map(e => e.seq), [1, 2, 3]);
  assert.match(events.at(-1)!.message, /interrupted/);
  recovered.close();
});
test('capture requires opt-in and invalid session/job identifiers are rejected', async () => {
  const db = await ledger();
  assert.throws(() => db.createSession(createManifest(), false), /consent/);
  assert.throws(() => db.getSession('../outside'), /identifier/);
  assert.throws(() => db.getJob('../outside'), /identifier/);
  db.close();
});
test('a second live coordinator cannot recover or overwrite another owner’s ledger', async () => {
  const first = await ledger();
  assert.throws(() => new Ledger(first.root), /already open/);
  first.close();
  const second = new Ledger(first.root); second.close();
});
