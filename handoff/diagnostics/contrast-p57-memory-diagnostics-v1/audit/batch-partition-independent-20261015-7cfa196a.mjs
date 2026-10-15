import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const source = new URL('../source/', import.meta.url);
const prior = new URL('../../contrast-comparator-diagnostics-v1/contrast/expansion-p57-v3/contrast-p57-v3-inputs.json', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const jsonSha = value => sha(JSON.stringify(value));
const names = ['batch-partition.mjs', 'batch-plan.json', 'batch-partition-controls.mjs'];
const sourceBytes = Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(new URL(name, source))])));
const hashes = Object.fromEntries(names.map(name => [name, sha(sourceBytes[name])]));
const frozenBytes = await readFile(prior);
assert.equal(sha(frozenBytes), '9299adf0dcc84668d4c5410ae98be6929728b120c918736507f1467e9d998d37');
const manifest = JSON.parse(frozenBytes), plan = JSON.parse(sourceBytes['batch-plan.json']);
const { validateBatchPlan, selectBatch } = await import(new URL('batch-partition.mjs', source));
const checks = [];
const check = (name, fn) => { fn(); checks.push({ name, status: 'PASS' }); };
const reject = (name, mutate) => check(name, () => {
  const m = structuredClone(manifest), p = structuredClone(plan);
  mutate(m, p);
  assert.throws(() => validateBatchPlan(m, p), name);
});

check('unaltered frozen manifest accepted', () => assert.equal(validateBatchPlan(manifest, plan), true));
check('independent canonical descriptor and state hashes', () => {
  const actual = plan.batches.flatMap(batch => batch.nodes);
  const expected = manifest.states.flatMap(state => state.nodes.map(node => ({ stateId: state.id, sourceAuditNodeIndex: node.sourceAuditNodeIndex, nodeSha256: jsonSha(node) })));
  assert.deepEqual(actual, expected);
  assert.equal(actual.length, 57);
  assert.equal(new Set(actual.map(ref => JSON.stringify([ref.stateId, ref.sourceAuditNodeIndex]))).size, 57);
  assert.deepEqual(plan.stateBindings.map(row => row.stateSha256), manifest.states.map(jsonSha));
});
for (const batch of plan.batches) check('select unchanged original objects ' + batch.id, () => {
  const selected = selectBatch(manifest, plan, batch.id);
  assert.equal(selected.batch, batch);
  assert.equal(selected.state, manifest.states.find(state => state.id === batch.stateId));
  assert.deepEqual(selected.nodes.map(node => node.sourceAuditNodeIndex), batch.nodes.map(ref => ref.sourceAuditNodeIndex));
  for (const node of selected.nodes) assert.equal(node, selected.state.nodes[node.sourceAuditNodeIndex]);
});

for (let b = 0; b < plan.batches.length; b++) {
  for (let n = 0; n < plan.batches[b].nodes.length; n++) {
    const id = plan.batches[b].id + ':' + plan.batches[b].nodes[n].sourceAuditNodeIndex;
    for (const [label, value] of [['string', String(plan.batches[b].nodes[n].sourceAuditNodeIndex)], ['fraction', 0.5], ['negative', -1], ['null', null], ['boolean', false], ['out-of-range', 999]]) {
      reject(id + ' rejects ' + label + ' index', (_m, p) => { p.batches[b].nodes[n].sourceAuditNodeIndex = value; });
    }
    reject(id + ' rejects state substitution', (_m, p) => { p.batches[b].nodes[n].stateId = p.batches[b].stateId === 'P-reflow-390' ? 'P-reflow-320' : 'P-reflow-390'; });
    reject(id + ' rejects zeroed descriptor hash', (_m, p) => { p.batches[b].nodes[n].nodeSha256 = '0'.repeat(64); });
    reject(id + ' rejects equal-count duplicate replacing node', (_m, p) => { p.batches[b].nodes[n] = structuredClone(p.batches[b].nodes[(n + 1) % p.batches[b].nodes.length]); });
    reject(id + ' rejects extra descriptor key', (_m, p) => { p.batches[b].nodes[n].foreign = true; });
  }
}

for (let s = 0; s < manifest.states.length; s++) {
  for (let n = 0; n < manifest.states[s].nodes.length; n++) {
    const id = manifest.states[s].id + ':' + n;
    for (const [label, mutateNode] of [
      ['target', node => { node.target[0] += ' .foreign'; }],
      ['HTML', node => { node.originalHtml += ' '; }],
      ['expected text', node => { node.expectedText += 'x'; }],
      ['expected hash', node => { node.expectedTextSha256 = '0'.repeat(64); }],
      ['packet binding', node => { node.packetBinding.arrayIndex++; }],
      ['printable coverage', node => { node.printableASCIICharacters--; }],
    ]) reject(id + ' rejects modified ' + label, (m) => mutateNode(m.states[s].nodes[n]));
    reject(id + ' rejects jointly rewritten node/state/plan hashes', (m, p) => {
      const state = m.states[s], node = state.nodes[n];
      node.expectedText += 'x'; node.expectedTextSha256 = sha(node.expectedText);
      for (const batch of p.batches) for (const ref of batch.nodes) if (ref.stateId === state.id && ref.sourceAuditNodeIndex === n) ref.nodeSha256 = jsonSha(node);
      p.stateBindings[s].stateSha256 = jsonSha(state);
    });
  }
}
for (let b = 0; b < plan.batches.length; b++) {
  reject('reject empty batch ' + b, (_m, p) => { p.batches[b].nodes = []; p.batches[b].expectedNodeCount = 0; });
  reject('reject reversed within-batch order ' + b, (_m, p) => { p.batches[b].nodes.reverse(); });
  reject('reject missing batch ' + b, (_m, p) => { p.batches.splice(b, 1); });
}
for (const id of [undefined, null, '', 0, {}, 'P-reflow-390', 'p390-00-12']) check('reject unknown batch ' + JSON.stringify(id), () => assert.throws(() => selectBatch(manifest, plan, id)));
reject('reject changed canonical batch order', (_m, p) => { [p.batches[0], p.batches[1]] = [p.batches[1], p.batches[0]]; });
reject('reject changed execution order', (_m, p) => { [p.executionOrder[0], p.executionOrder[1]] = [p.executionOrder[1], p.executionOrder[0]]; });
reject('reject falsely authorized aggregate', (_m, p) => { p.proposedAggregateLimits.status = 'AUTHORIZED'; });
check('selection does not mutate inputs', () => {
  const before = JSON.stringify({ manifest, plan });
  for (const batch of plan.batches) selectBatch(manifest, plan, batch.id);
  assert.equal(JSON.stringify({ manifest, plan }), before);
});
check('prepared input copies bind exact plan, module and frozen manifest', () => {
  assert.equal(plan.executionAuthorized, false);
  assert.equal(plan.newRuntimeStarted, false);
  assert.equal(plan.proposedAggregateLimits.status, 'PROPOSED_NOT_AUTHORIZED');
});
for (const [original, copy] of [['batch-partition.mjs', 'inputs/verification-inputs/batch-partition.mjs'], ['batch-plan.json', 'inputs/batch-plan.json']]) {
  const bytes = await readFile(new URL(copy, source));
  check('exact prepared copy ' + copy, () => assert.equal(sha(bytes), hashes[original]));
}
const frozenCopy = await readFile(new URL('inputs/frozen-v3-inputs.json', source));
check('exact frozen manifest prepared copy', () => assert.equal(sha(frozenCopy), sha(frozenBytes)));
const authorControls = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('batch-partition-controls.mjs', source))], { encoding: 'utf8' }));
check('supplied controls all pass', () => { assert.equal(authorControls.status, 'PASS'); assert.equal(authorControls.controlCount, 77); assert.ok(authorControls.controls.every(row => row.status === 'PASS')); });
for (const name of names) assert.equal(sha(await readFile(new URL(name, source))), hashes[name], 'source stayed steady during review: ' + name);
const receipt = {
  schemaVersion: 1, createdUtc: new Date().toISOString(), status: 'PASS_PARTITION_SOURCE_ONLY',
  authority: 'PREPARATION_ONLY_NO_RUNTIME_GO', sourceHashes: hashes,
  frozenManifestSha256: sha(frozenBytes), independentCheckCount: checks.length,
  suppliedControlCount: authorControls.controlCount, checks,
  priorAttempt: { receipt: 'batch-partition-independent-attempt-20261015-7cfa196a.json', sha256: 'fcf0009d0e6097bf726e51b214de6123d27f2c35cd032aaeb666b7f8831f5060', outcome: 'Failed during concurrent source update; no PASS receipt emitted. Author supplied steady expanded module/control hashes before this rerun; expected supplied-control count updated from 34 to 77.' },
  observations: [
    'Pinned full-state hashes and exact deep-equal descriptor slices reject malformed indices and every tested coordinated identity rewrite.',
    'Canonical partition order and proposed execution order are different, both explicitly frozen. Aggregate must restore canonical order before exact union verification.',
    'validateBatchPlan validates full state data; full frozen-manifest bytes and unchanged top-level fields are additionally checked in probe preflight before browser launch.',
    'Authorization and continuationPolicy are external decisions, not provided by a successful pure validator. Five jobs / 450s internal / 600s outer remain proposed and unauthorized.',
  ],
  limitations: ['No runtime, browser, staging or source mutation performed.', 'Evidence-store/finalization and eventual aggregate are separate parent review scopes.'],
};
const output = new URL('./batch-partition-independent-20261015-7cfa196a.json', import.meta.url);
const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
await writeFile(output, bytes, { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, independentCheckCount: checks.length, suppliedControlCount: authorControls.controlCount, receipt: fileURLToPath(output), sha256: sha(bytes), sourceHashes: hashes }, null, 2));
