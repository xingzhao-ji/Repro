import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { createManifest } from '../src/manifest.js';
import { runBrowser } from '../src/adapter.js';

const require = createRequire(import.meta.url);
const fsPromises = require('node:fs/promises') as typeof import('node:fs/promises');

// Owner cancellation can land while the synthetic run is still creating its
// directory, before the owned fixture server binds. Finalization then sees no
// listening server; the server the background work binds afterwards must still
// be closed, or its socket keeps the CLI process alive after it reports
// `cancelled`.
test('cancelling before the synthetic fixture server binds closes the late-bound server', { timeout: 10_000 }, async t => {
  const root = resolve('.repro-runs/tests/synthetic-cancellation', randomUUID());
  await fsPromises.mkdir(root, { recursive: true });
  const controller = new AbortController();
  const original = fsPromises.mkdir.bind(fsPromises);
  let intercepted = false;
  t.mock.method(fsPromises, 'mkdir', ((path: Parameters<typeof fsPromises.mkdir>[0], options?: Parameters<typeof fsPromises.mkdir>[1]) => {
    if (!intercepted && String(path).startsWith(join(root, '/'))) { intercepted = true; controller.abort(); }
    return original(path, options);
  }) as typeof fsPromises.mkdir);
  syncBuiltinESMExports();
  const servers = () => process.getActiveResourcesInfo().filter(resource => resource === 'TCPServerWrap').length;
  const before = servers();
  try {
    const result = await runBrowser(createManifest(), { artifactDir: root, signal: controller.signal });
    assert.equal(intercepted, true, 'Cancellation must land while the run directory is being created');
    assert.equal(result.outcome, 'cancelled', result.reason);
    assert.equal(result.assertionCount, 0);
    // Give the background work time to reach and pass its late bind.
    const until = Date.now() + 2000;
    let remaining = servers();
    while (Date.now() < until) { await new Promise(accept => setTimeout(accept, 50)); remaining = servers(); }
    assert.equal(remaining, before, 'A fixture server bound after cancellation must not outlive the run');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});
