import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDemoServer } from './demo-server.mjs';
test('demo serves only its fixture assets over localhost', async () => {
  const server = createDemoServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    assert.equal(server.address().address, '127.0.0.1');
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /SYNTHETIC TRAINING FIXTURE/);
    const model = await fetch(`${base}/model.mjs`);
    assert.equal(model.status, 200);
    const manifest = await fetch(`${base}/manifest.json`).then(response => response.json());
    assert.equal(manifest.classification, 'synthetic-training-fixture');
    assert.equal((await fetch(`${base}/not-an-asset`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
