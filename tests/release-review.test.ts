import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.js';
import { Coordinator } from '../src/service.js';
import { serve } from '../src/server.js';
import { createManifest, digest } from '../src/manifest.js';

async function directory() { await mkdir('.repro-runs/release-review', { recursive: true }); return mkdtemp('.repro-runs/release-review/case-'); }

test('review: each job keeps its exact input manifest after the session advances to reduced input', async () => {
  const ledger = new Ledger(await directory()); const coordinator = new Coordinator(ledger);
  try {
    const original = createManifest();
    const session = ledger.createSession(original, true);
    const started = coordinator.start(session.id, 'export', 'snapshot-review');
    const finished = await coordinator.wait(started.id);
    assert.equal(finished.status, 'complete', JSON.stringify(finished.result));
    const changed = structuredClone(original); changed.actions = changed.actions.filter(action => action.kind !== 'noise');
    ledger.updateManifest(session.id, changed);
    const preserved = JSON.parse(await readFile(join(ledger.root, 'artifacts', started.id, 'manifest.json'), 'utf8'));
    assert.deepEqual(preserved, original);
    assert.notEqual(digest(preserved), digest(ledger.getSession(session.id).manifest));
    assert.equal((finished.result as { manifestDigest: string }).manifestDigest, digest(preserved));
  } finally { await coordinator.close(); ledger.close(); }
});

test('review: bounded structured trial events remain valid JSON instead of silently truncating evidence', async () => {
  const ledger = new Ledger(await directory());
  try {
    const manifest = createManifest();
    const removed = Array.from({ length: 80 }, (_value, index) => `noise-${index}-${'x'.repeat(64)}`);
    manifest.actions.push(...removed.map(id => ({ id, kind: 'noise' as const, value: 'focus', dependsOn: ['navigate'] })));
    const session = ledger.createSession(manifest, true);
    const job = ledger.startJob(session.id, 'reduce', 'bounded-event-review');
    const trial = { index: 1, inputDigest: digest(manifest), seed: manifest.environment.seed, removed, outcome: 'target-failure', reason: 'Target failure preserved in 2/2 required repetitions.', durationMs: 100, accepted: true, runIds: ['one', 'two'] };
    const encoded = JSON.stringify(trial); assert.ok(encoded.length > 4000 && encoded.length < 65536);
    ledger.event(job.id, 'trial', encoded);
    const stored = ledger.events(job.id).find(event => event.type === 'trial'); assert.ok(stored);
    assert.deepEqual(JSON.parse(stored.message), trial);
    assert.throws(() => ledger.event(job.id, 'trial', 'x'.repeat(65_537)), /cannot be persisted intact/);
    assert.equal(ledger.events(job.id).length, 2, 'oversized evidence must not create a misleading truncated event');
    ledger.finish(job.id, 'cancelled', { outcome: 'cancelled', reason: 'Review complete.' });
  } finally { ledger.close(); }
});

test('review: a malformed non-ASCII request token receives a bounded input rejection', async () => {
  const app = await serve({ port: 0, root: await directory() });
  try {
    const { token } = await fetch(`${app.url}/api/config`).then(response => response.json()) as { token: string };
    const response = await fetch(`${app.url}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Repro-Token': '¢'.repeat(token.length) }, body: JSON.stringify({ consent: true }) });
    assert.equal(response.status, 403);
    assert.deepEqual(app.ledger.sessions(), []);
  } finally { await app.close(); }
});
