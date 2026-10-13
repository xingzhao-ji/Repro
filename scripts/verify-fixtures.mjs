import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const files = [
  '../fixtures/search-stale-response/model.test.mjs',
  '../fixtures/search-stale-response/server.test.mjs'
].map(path => fileURLToPath(new URL(path, import.meta.url)));
const major = Number(process.versions.node.split('.')[0]);
if (major < 24) { console.error('Use Node.js 24 or newer for these synthetic fixtures.'); process.exit(2); }
console.log('Verifying synthetic training fixtures, not product benchmarks or real-browser replay.');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) { console.error(result.error.message); process.exit(2); }
process.exit(result.status ?? 2);
