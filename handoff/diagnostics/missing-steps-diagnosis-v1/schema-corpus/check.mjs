import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';

const here = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(here, 'PLAN.json'), 'utf8'));
const mode = process.argv[2];
assert(['baseline', 'candidate'].includes(mode));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const schemaPath = resolve(plan.repository, plan.schemas[mode]);
const schemaBytes = readFileSync(schemaPath);
if (mode === 'baseline') assert.equal(sha(schemaBytes), plan.baselineSchemaSha256);
const inventoryBytes = readFileSync(resolve(plan.repository, plan.inventory));
assert.equal(sha(inventoryBytes), plan.inventorySha256);
const inventory = JSON.parse(inventoryBytes);
assert.equal(inventory.length, 700);
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(schemaBytes));
const records = [];
for (const entry of inventory) {
  const path = resolve(plan.repository, plan.corpusRoot, entry.path);
  const raw = readFileSync(path);
  assert.equal(raw.length, entry.bytes);
  assert.equal(sha(raw), entry.sha256);
  const value = JSON.parse(raw);
  assert(['inconclusive', 'cancelled'].includes(value.outcome));
  assert.equal(value.appDigest, '');
  assert.equal(value.assertionCount, 0);
  assert.equal(value.observation, null);
  assert.equal(value.environment.browser, 'not-launched');
  const valid = validate(value);
  const errors = structuredClone(validate.errors);
  if (mode === 'baseline') {
    assert.equal(valid, false);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].instancePath, '/appDigest');
    assert.equal(errors[0].keyword, 'pattern');
  } else {
    assert.equal(valid, true, JSON.stringify({ path, errors }));
    assert.equal(errors, null);
  }
  assert.equal(sha(readFileSync(path)), entry.sha256);
  records.push({ path: entry.path, attempt: entry.attempt, sha256: entry.sha256, outcome: value.outcome, valid, errors });
}
assert.equal(sha(readFileSync(schemaPath)), sha(schemaBytes));
assert.equal(sha(readFileSync(resolve(plan.repository, plan.inventory))), plan.inventorySha256);
const result = { mode, scope: 'Read-only schema validation of retained actual adapter preflight results; no product or browser execution.', schemaPath, schemaSha256: sha(schemaBytes), inventorySha256: plan.inventorySha256, records: records.length, accepted: records.filter(r => r.valid).length, rejected: records.filter(r => !r.valid).length, inconclusive: records.filter(r => r.outcome === 'inconclusive').length, cancelled: records.filter(r => r.outcome === 'cancelled').length, allInputBytesUnchanged: true, details: records };
writeFileSync(join(here, `${mode}-results.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ mode, accepted: result.accepted, rejected: result.rejected, schemaSha256: result.schemaSha256, allInputBytesUnchanged: true }));
