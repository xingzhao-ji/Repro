import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertCompleteAggregate, assertBatchAcceptanceReady, assertBatchSourceComplete, selectBatch, validateBatchPlan } from './batch-partition.mjs';

const frozenManifestUrl = new URL('../../contrast-comparator-diagnostics-v1/contrast/expansion-p57-v3/contrast-p57-v3-inputs.json', import.meta.url);
const manifestBytes = await readFile(process.argv[2] || fileURLToPath(frozenManifestUrl));
assert.equal(createHash('sha256').update(manifestBytes).digest('hex'), '9299adf0dcc84668d4c5410ae98be6929728b120c918736507f1467e9d998d37');
const manifest = JSON.parse(manifestBytes);
const plan = JSON.parse(await readFile(new URL('./batch-plan.json', import.meta.url)));
const results = [];
function check(name, body) { body(); results.push({ name, status: 'PASS' }); }
function rejects(name, mutate) {
  check(name, () => {
    const m = structuredClone(manifest), p = structuredClone(plan);
    mutate(m, p);
    assert.throws(() => validateBatchPlan(m, p));
  });
}

check('frozen exact 57 occurrences validate', () => assert.equal(validateBatchPlan(manifest, plan), true));
check('all five subsets preserve original object identities and canonical order', () => {
  const selected = plan.batches.map(batch => selectBatch(manifest, plan, batch.id));
  assert.deepEqual(selected.map(item => item.nodes.length), [12, 12, 11, 11, 11]);
  assert.deepEqual(selected.flatMap(item => item.nodes.map(node => [item.state.id, node.sourceAuditNodeIndex])),
    manifest.states.flatMap(state => state.nodes.map(node => [state.id, node.sourceAuditNodeIndex])));
  for (const item of selected) {
    assert.equal(item.state, manifest.states.find(state => state.id === item.batch.stateId));
    assert.equal(item.batch, plan.batches.find(batch => batch.id === item.batch.id));
    for (const node of item.nodes) assert.equal(node, item.state.nodes.find(candidate => candidate.sourceAuditNodeIndex === node.sourceAuditNodeIndex));
  }
});
check('selection leaves the full manifest and plan intact', () => {
  const before = JSON.stringify({ manifest, plan });
  selectBatch(manifest, plan, plan.executionOrder[0]);
  assert.equal(JSON.stringify({ manifest, plan }), before);
});
check('unknown batch cannot be selected', () => assert.throws(() => selectBatch(manifest, plan, 'foreign-batch')));
check('source revision and probe source additions do not rewrite frozen states', () => {
  const derived = structuredClone(manifest);
  derived.revision = 'p57-memory-batch-v1';
  derived.probeSources = [];
  assert.equal(validateBatchPlan(derived, plan), true);
});
rejects('duplicate occurrence rejected', (_m, p) => { p.batches[0].nodes[1] = structuredClone(p.batches[0].nodes[0]); });
rejects('missing occurrence rejected', (_m, p) => { p.batches[4].nodes.pop(); p.batches[4].expectedNodeCount--; });
rejects('foreign occurrence rejected', (_m, p) => { p.batches[0].nodes[0].sourceAuditNodeIndex = 999; });
rejects('altered node hash rejected', (_m, p) => { p.batches[0].nodes[0].nodeSha256 = '0'.repeat(64); });
rejects('altered original node identity rejected', (m) => { m.states[0].nodes[0].packetBinding.trialIndex++; });
rejects('altered original node text rejected', (m) => { m.states[0].nodes[0].expectedText += ' changed'; });
rejects('altered original viewport rejected', (m) => { m.states[0].viewport.width++; });
rejects('altered original state identity rejected', (m) => { m.states[0].id = 'P-foreign'; });
rejects('altered selected trial rejected', (m) => { m.states[0].selectedTrial = -1; });
rejects('jointly rewritten state and plan hash rejected', (m, p) => {
  m.states[0].viewport.width++;
  p.stateBindings[0].viewport.width++;
  p.stateBindings[0].stateSha256 = createHash('sha256').update(JSON.stringify(m.states[0])).digest('hex');
});
rejects('empty batch rejected', (_m, p) => { p.batches[0].nodes = []; p.batches[0].expectedNodeCount = 0; });
rejects('duplicate batch ID rejected', (_m, p) => { p.batches[1].id = p.batches[0].id; });
rejects('batch over frozen twelve-node bound rejected', (_m, p) => {
  p.batches[0].nodes.push(p.batches[1].nodes.shift());
  p.batches[0].expectedNodeCount++; p.batches[1].expectedNodeCount--;
});
rejects('rewritten maximum bound rejected', (_m, p) => { p.maximumNodesPerBatch = 13; });
rejects('mixed state batch rejected', (_m, p) => { p.batches[0].nodes[0] = structuredClone(p.batches[2].nodes[0]); });
rejects('occurrence order reversal rejected', (_m, p) => { p.batches[0].nodes.reverse(); });
rejects('batch order reversal rejected', (_m, p) => { p.batches.reverse(); });
rejects('state order reversal rejected', (m) => { m.states.reverse(); });
rejects('full count mismatch rejected', (_m, p) => { p.expectedOccurrenceCount = 56; });
rejects('declared batch count mismatch rejected', (_m, p) => { p.batches[0].expectedNodeCount--; });
rejects('foreign full-manifest binding rejected', (_m, p) => { p.frozenManifestSha256 = '0'.repeat(64); });
rejects('altered state binding viewport rejected', (_m, p) => { p.stateBindings[0].viewport.width++; });
rejects('missing batch rejected', (_m, p) => { p.batches.pop(); });
rejects('extra batch rejected', (_m, p) => { p.batches.push(structuredClone(p.batches[0])); });
rejects('changed proposed execution order rejected', (_m, p) => { p.executionOrder.reverse(); });
rejects('duplicate proposed execution job rejected', (_m, p) => { p.executionOrder[1] = p.executionOrder[0]; });
rejects('per-job limit change rejected', (_m, p) => { p.perJobLimits.internalMs++; });
rejects('aggregate budget cannot masquerade as one job', (_m, p) => { p.proposedAggregateLimits.internalMs = 90000; });
rejects('aggregate budget cannot claim authorization', (_m, p) => { p.proposedAggregateLimits.status = 'AUTHORIZED'; });

const selected = selectBatch(manifest, plan, plan.batches[0].id);
const artifact = (file, extra = {}) => ({ file, bytes: 123, sha256: 'a'.repeat(64), ...extra });
function completedSummary(batchSelection = selected) {
  // These synthetic receipts test closure requirements, not browser behavior.
  const snapshot = { trialButtonCount: 13, syntheticClosureFixture: true };
  const selection = { status: 'selection-identity-matched', stateId: batchSelection.state.id, selectedTrial: batchSelection.state.selectedTrial,
    trialCount: 13, snapshotSha256: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), snapshot };
  const count = batchSelection.nodes.length;
  const counts = { started: count, completed: count, productChecksCompleted: count, remaining: 0, inProgress: 0, unattempted: 0 };
  return {
    batch: { id: batchSelection.batch.id, assigned: structuredClone(batchSelection.batch.nodes), expectedNodeCount: count, fullManifestCount: 57, globalCompletionClaim: false },
    nodes: batchSelection.nodes.map((node, resultIndex) => ({ state: batchSelection.state.id, sourceAuditNodeIndex: node.sourceAuditNodeIndex,
      status: 'unresolved', productChecksCompleted: true, nodeDurationMs: 10,
      artifact: artifact(`node-${resultIndex}.json`, { kind: 'p57-full-node-evidence', batchId: batchSelection.batch.id, resultIndex }) })),
    states: [{ id: batchSelection.state.id, viewport: structuredClone(batchSelection.state.viewport), status: 'exact-dom-preserved',
      nodes: batchSelection.nodes.map((node, resultIndex) => ({ sourceAuditNodeIndex: node.sourceAuditNodeIndex, resultIndex })),
      bodyBeforeArtifact: artifact('body-before.html'), bodyAfterArtifact: artifact('body-after.html'),
      selectionBefore: selection, selectionAfter: structuredClone(selection) }],
    completedStateCount: 1, checkpointCounts: { ...counts, batchId: batchSelection.batch.id, expectedNodeCount: count },
    browserControlsStatus: 'PASS', browserControlCounts: { screenshots: 2, sampler: 6, surface: 9, guards: 10, selection: 23, total: 50 },
    controlArtifact: artifact('controls.json', { kind: 'p57-full-control-evidence', batchId: batchSelection.batch.id }),
    pageErrors: [], unexpectedRequests: [], cleanupErrors: [], sourceObservationComplete: false,
  };
}
const externalReview = (batchSelection = selected) => ({ batchId: batchSelection.batch.id, status: 'PASS', artifactClosure: 'PASS', resourceGate: 'PASS',
  exactOwnedCleanup: 'PASS', reviewReceipt: artifact('independent-review.json') });
function rejectsClosure(name, mutate) {
  check(name, () => { const summary = completedSummary(); mutate(summary); assert.throws(() => assertBatchSourceComplete(summary, selected)); });
}
function rejectsAcceptance(name, mutate) {
  check(name, () => { const summary = completedSummary(), review = externalReview(); summary.sourceObservationComplete = true;
    mutate(summary, review); assert.throws(() => assertBatchAcceptanceReady(summary, selected, review)); });
}
check('completed unresolved observations satisfy source closure without becoming measured pass', () => {
  const summary = completedSummary(); assert.equal(assertBatchSourceComplete(summary, selected), true);
  assert.equal(summary.sourceObservationComplete, false); assert.ok(summary.nodes.every(row => row.status === 'unresolved'));
});
rejectsClosure('missing final body artifact rejects batch closure', summary => { delete summary.states[0].bodyAfterArtifact; });
rejectsClosure('changed final body digest rejects batch closure', summary => { summary.states[0].bodyAfterArtifact.sha256 = 'b'.repeat(64); });
rejectsClosure('changed final body bytes reject batch closure', summary => { summary.states[0].bodyAfterArtifact.bytes++; });
rejectsClosure('missing final selection rejects batch closure', summary => { delete summary.states[0].selectionAfter; });
rejectsClosure('changed final selection rejects batch closure', summary => { summary.states[0].selectionAfter.selectedTrial++; });
rejectsClosure('selection snapshot digest mismatch rejects batch closure', summary => { summary.states[0].selectionBefore.snapshotSha256 = 'b'.repeat(64); summary.states[0].selectionAfter = structuredClone(summary.states[0].selectionBefore); });
rejectsClosure('started node without completed artifact rejects batch closure', summary => { delete summary.nodes[0].artifact; delete summary.nodes[0].nodeDurationMs; summary.nodes[0].productChecksCompleted = false; });
rejectsClosure('node harness error rejects batch closure', summary => { summary.nodes[0].error = 'identity mismatch'; });
rejectsClosure('uncompleted product checks reject batch closure', summary => { summary.nodes[0].productChecksCompleted = false; });
rejectsClosure('foreign completed row rejects batch closure', summary => { summary.nodes[0].sourceAuditNodeIndex = 999; });
rejectsClosure('duplicate completed row rejects batch closure', summary => { summary.nodes[1] = structuredClone(summary.nodes[0]); });
rejectsClosure('missing assigned node rejects batch closure', summary => { summary.nodes.pop(); });
rejectsClosure('incomplete final state rejects batch closure', summary => { summary.states[0].status = 'started'; });
rejectsClosure('second state rejects batch closure', summary => { summary.states.push(structuredClone(summary.states[0])); });
rejectsClosure('incomplete checkpoint counters reject batch closure', summary => { summary.checkpointCounts.completed--; summary.checkpointCounts.remaining++; });
rejectsClosure('missing control artifact rejects batch closure', summary => { delete summary.controlArtifact; });
rejectsClosure('missing browser control rejects batch closure', summary => { summary.browserControlCounts.selection--; summary.browserControlCounts.total--; });
rejectsClosure('incomplete browser controls reject batch closure', summary => { summary.browserControlsStatus = 'INCOMPLETE'; });
rejectsClosure('page error rejects batch closure', summary => { summary.pageErrors.push('page failure'); });
rejectsClosure('unexpected request rejects batch closure', summary => { summary.unexpectedRequests.push({ url: 'https://example.invalid' }); });
rejectsClosure('browser cleanup error rejects batch closure', summary => { summary.cleanupErrors.push('close failed'); });
rejectsClosure('internal budget expiry rejects batch closure', summary => { summary.internalBudgetExpired = true; });
rejectsClosure('global harness error rejects batch closure', summary => { summary.error = 'harness failure'; });
check('complete external review prerequisite schema allows completed unresolved observations', () => {
  const summary = completedSummary(); summary.sourceObservationComplete = true;
  assert.equal(assertBatchAcceptanceReady(summary, selected, externalReview()), true);
  assert.ok(summary.nodes.every(row => row.status === 'unresolved'));
});
rejectsAcceptance('source completion flag required for acceptance readiness', summary => { summary.sourceObservationComplete = false; });
rejectsAcceptance('external cleanup review required for acceptance readiness', (_summary, review) => { delete review.exactOwnedCleanup; });
rejectsAcceptance('partial external review rejects acceptance readiness', (_summary, review) => { review.status = 'PARTIAL'; });
rejectsAcceptance('foreign external review rejects acceptance readiness', (_summary, review) => { review.batchId = 'foreign-batch'; });
rejectsAcceptance('artifact closure review required for acceptance readiness', (_summary, review) => { review.artifactClosure = 'PARTIAL'; });
rejectsAcceptance('resource gate review required for acceptance readiness', (_summary, review) => { delete review.resourceGate; });
rejectsAcceptance('external review receipt required for acceptance readiness', (_summary, review) => { delete review.reviewReceipt; });
rejectsAcceptance('external review receipt hash required for acceptance readiness', (_summary, review) => { review.reviewReceipt.sha256 = 'invalid'; });

function completeAggregateFixture() {
  const selections = plan.batches.map(batch => selectBatch(manifest, plan, batch.id));
  return {
    summaries: selections.map(selection => { const summary = completedSummary(selection); summary.sourceObservationComplete = true; return summary; }),
    reviews: selections.map(selection => externalReview(selection)),
  };
}
function rejectsAggregate(name, mutate) {
  check(name, () => { const { summaries, reviews } = completeAggregateFixture(); mutate(summaries, reviews);
    assert.throws(() => assertCompleteAggregate(manifest, plan, summaries, reviews)); });
}
check('actual aggregate checker retains all 57 unresolved observations without claiming measured pass', () => {
  const { summaries, reviews } = completeAggregateFixture();
  const aggregate = assertCompleteAggregate(manifest, plan, summaries, reviews);
  assert.equal(aggregate.count, 57); assert.equal(aggregate.allMeasuredPass, false);
  assert.deepEqual(aggregate.statusCounts, { 'measured-pass': 0, 'measured-fail': 0, unresolved: 57 });
});
check('actual aggregate checker reports mixed observation outcomes without force-green', () => {
  const { summaries, reviews } = completeAggregateFixture();
  summaries[0].nodes[0].status = 'measured-pass'; summaries[1].nodes[0].status = 'measured-fail';
  const aggregate = assertCompleteAggregate(manifest, plan, summaries.reverse(), reviews.reverse());
  assert.equal(aggregate.count, 57); assert.equal(aggregate.allMeasuredPass, false);
  assert.deepEqual(aggregate.statusCounts, { 'measured-pass': 1, 'measured-fail': 1, unresolved: 55 });
});
rejectsAggregate('actual aggregate checker rejects missing batch', summaries => { summaries.pop(); });
rejectsAggregate('actual aggregate checker rejects duplicate batch', summaries => { summaries[1] = structuredClone(summaries[0]); });
rejectsAggregate('actual aggregate checker rejects unfinished final body', summaries => { delete summaries[4].states[0].bodyAfterArtifact; });
rejectsAggregate('actual aggregate checker rejects missing final selection', summaries => { delete summaries[4].states[0].selectionAfter; });
rejectsAggregate('actual aggregate checker rejects missing external cleanup', (_summaries, reviews) => { delete reviews[4].exactOwnedCleanup; });
rejectsAggregate('actual aggregate checker rejects partial external review', (_summaries, reviews) => { reviews[4].status = 'PARTIAL'; });
rejectsAggregate('actual aggregate checker rejects missing review', (_summaries, reviews) => { reviews.pop(); });
rejectsAggregate('actual aggregate checker rejects duplicate review', (_summaries, reviews) => { reviews[1] = structuredClone(reviews[0]); });

console.log(JSON.stringify({ schemaVersion: 1, status: 'PASS', scope: 'pure source partition only; browser and runtime UNRUN', frozenManifestSha256: plan.frozenManifestSha256, controlCount: results.length, controls: results }, null, 2));
