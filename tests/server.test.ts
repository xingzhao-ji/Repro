import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { get } from 'node:http';
import { serve } from '../src/server.js';

test('local API requires exact host, same origin and token for mutations; validates inputs', async () => {
  await mkdir('.repro-runs/tests', { recursive: true });
  const service = await serve({ port: 0, root: await mkdtemp('.repro-runs/tests/server-') });
  try {
    const rejectedHost = await new Promise<number | undefined>((resolve, reject) => {
      get(`${service.url}/api/config`, { headers: { Host: 'evil.invalid' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(rejectedHost, 403);
    assert.equal((await fetch(`${service.url}/api/config`, { headers: { Origin: 'https://evil.invalid' } })).status, 403);
    assert.equal((await fetch(`${service.url}/api/sessions`, { method: 'POST', body: '{}' })).status, 403);
    const { token } = await fetch(`${service.url}/api/config`).then(r => r.json()) as { token: string };
    const headers = { 'Content-Type': 'application/json', 'X-Repro-Token': token };
    assert.equal((await fetch(`${service.url}/api/sessions`, { method: 'POST', headers, body: JSON.stringify({ consent: false }) })).status, 400);
    assert.equal((await fetch(`${service.url}/api/sessions`, { method: 'POST', headers, body: JSON.stringify({ consent: true, origin: 'https://evil.invalid' }) })).status, 400);
    const response = await fetch(`${service.url}/api/sessions`, { method: 'POST', headers, body: JSON.stringify({ consent: true }) });
    assert.equal(response.status, 201);
    const { session } = await response.json() as { session: { id: string } };
    const read = await fetch(`${service.url}/api/sessions/${session.id}`).then(r => r.json()) as { jobs: unknown[] };
    assert.deepEqual(read.jobs, []);
    assert.equal((await fetch(`${service.url}/api/sessions/${session.id}/jobs`, { method: 'POST', headers, body: JSON.stringify({ operation: 'shell', requestKey: 'one' }) })).status, 400);
  } finally { await service.close(); }
});
