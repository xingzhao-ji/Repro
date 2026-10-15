import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// These pins describe the sealed v3 input, never a smaller rewritten inventory.
export const FROZEN_MANIFEST_SHA256 = '9299adf0dcc84668d4c5410ae98be6929728b120c918736507f1467e9d998d37';
const statePins = [
  { stateId: 'P-reflow-390', stateSha256: 'a315770b1850b20bd794112945c42763a0e81b151647a339d78cde233078a8be', viewport: { width: 390, height: 900 }, nodeCount: 24 },
  { stateId: 'P-reflow-320', stateSha256: '531a68c2ac340e2759950637737f474d1eade186852ed3abe805fd866c7e02dd', viewport: { width: 320, height: 900 }, nodeCount: 33 },
];
const definitions = [
  { id: 'p390-00-11', stateIndex: 0, start: 0, end: 12 },
  { id: 'p390-12-23', stateIndex: 0, start: 12, end: 24 },
  { id: 'p320-00-10', stateIndex: 1, start: 0, end: 11 },
  { id: 'p320-11-21', stateIndex: 1, start: 11, end: 22 },
  { id: 'p320-22-32', stateIndex: 1, start: 22, end: 33 },
];
const executionOrder = ['p390-00-11', 'p320-00-10', 'p390-12-23', 'p320-11-21', 'p320-22-32'];
const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const descriptor = (state, node) => ({ stateId: state.id, sourceAuditNodeIndex: node.sourceAuditNodeIndex, nodeSha256: sha256(node) });

export function validateBatchPlan(manifest, plan) {
  assert.equal(plan.schemaVersion, 1, 'batch plan schema');
  assert.equal(plan.revision, 'p57-memory-batch-plan-v1', 'batch plan revision');
  assert.equal(plan.frozenManifestSha256, FROZEN_MANIFEST_SHA256, 'sealed full-manifest binding');
  assert.equal(plan.expectedOccurrenceCount, 57, 'full occurrence count stays 57');
  assert.equal(plan.maximumNodesPerBatch, 12, 'frozen maximum batch size');
  assert.equal(manifest.states.length, statePins.length, 'full state count');
  assert.deepEqual(plan.stateBindings, statePins, 'sealed state bindings');
  for (let index = 0; index < statePins.length; index++) {
    const state = manifest.states[index], pin = statePins[index];
    assert.equal(state.id, pin.stateId, 'full state identity and order');
    assert.deepEqual(state.viewport, pin.viewport, 'original viewport');
    assert.equal(state.nodes.length, pin.nodeCount, 'full original node count');
    assert.equal(sha256(state), pin.stateSha256, 'full original state and node identity');
  }
  assert.equal(plan.batches.length, definitions.length, 'exact five-batch partition');
  assert.equal(new Set(plan.batches.map(batch => batch.id)).size, definitions.length, 'unique batch IDs');
  for (let index = 0; index < definitions.length; index++) {
    const definition = definitions[index], batch = plan.batches[index], state = manifest.states[definition.stateIndex];
    assert.equal(batch.id, definition.id, 'canonical batch identity and order');
    assert.equal(batch.stateId, state.id, 'one original viewport state per batch');
    assert.ok(Array.isArray(batch.nodes) && batch.nodes.length > 0 && batch.nodes.length <= 12, 'nonempty batch within frozen bound');
    assert.equal(batch.expectedNodeCount, definition.end - definition.start, 'frozen batch occurrence count');
    assert.equal(batch.nodes.length, batch.expectedNodeCount, 'declared batch occurrence count');
    assert.deepEqual(batch.nodes, state.nodes.slice(definition.start, definition.end).map(node => descriptor(state, node)), 'exact original ordered occurrence references');
  }
  assert.deepEqual(plan.batches.flatMap(batch => batch.nodes), manifest.states.flatMap(state => state.nodes.map(node => descriptor(state, node))), 'exact ordered 57-occurrence union without omissions or duplicates');
  assert.deepEqual(plan.executionOrder, executionOrder, 'proposed unique execution order with separate P320 gate');
  assert.deepEqual(plan.perJobLimits, { internalMs: 90000, outerMs: 120000 }, 'unchanged per-job time limits');
  assert.deepEqual(plan.proposedAggregateLimits, { maximumJobs: 5, internalMs: 450000, outerMs: 600000, status: 'PROPOSED_NOT_AUTHORIZED' }, 'proposed five-job aggregate time budget');
  // Authorization and external cleanup are separate runtime review decisions.
  // Passing this pure validator does not authorize or establish any execution.
  return true;
}

export function selectBatch(manifest, plan, batchId) {
  validateBatchPlan(manifest, plan);
  const batch = plan.batches.find(candidate => candidate.id === batchId);
  assert.ok(batch, `unknown batch ID: ${batchId}`);
  const state = manifest.states.find(candidate => candidate.id === batch.stateId);
  const nodes = batch.nodes.map(reference => state.nodes.find(node => node.sourceAuditNodeIndex === reference.sourceAuditNodeIndex));
  assert.ok(nodes.every(Boolean), 'every selected occurrence resolves to its original object');
  return { batch, state, nodes };
}

function assertArtifactReference(reference, label) {
  assert.ok(reference && typeof reference.file === 'string' && reference.file.length > 0, `${label} file reference`);
  assert.ok(Number.isSafeInteger(reference.bytes) && reference.bytes > 0, `${label} byte count`);
  assert.match(reference.sha256, /^[a-f0-9]{64}$/, `${label} SHA-256 reference`);
}

// This checks the actual prepared source-finalization prerequisites. The caller
// invokes it after the unchanged DOM, stylesheet, and full-selection assertions.
// It checks references, not artifact contents; separate review must read them.
export function assertBatchSourceComplete(summary, selected) {
  const count = selected.nodes.length, batchId = selected.batch.id;
  assert.equal(summary.batch.id, batchId, 'exact assigned batch');
  assert.equal(summary.batch.expectedNodeCount, count, 'assigned occurrence count');
  assert.equal(summary.batch.fullManifestCount, 57, 'full inventory remains 57');
  assert.equal(summary.batch.globalCompletionClaim, false, 'one batch cannot claim full completion');
  assert.deepEqual(summary.batch.assigned, selected.batch.nodes, 'exact assigned occurrence hashes');
  assert.equal(summary.nodes.length, count, 'all assigned observations present');
  summary.nodes.forEach((row, index) => {
    assert.equal(row.state, selected.state.id, 'observed state identity');
    assert.equal(row.sourceAuditNodeIndex, selected.nodes[index].sourceAuditNodeIndex, 'observed occurrence identity and order');
    assert.ok(['measured-pass', 'measured-fail', 'unresolved'].includes(row.status), 'completed observation status');
    assert.equal(row.productChecksCompleted, true, 'original per-node checks completed');
    assert.ok(Number.isFinite(row.nodeDurationMs) && row.nodeDurationMs >= 0, 'completed observation timing');
    assert.equal(Object.hasOwn(row, 'error'), false, 'no node harness error');
    assertArtifactReference(row.artifact, 'complete node artifact');
    assert.equal(row.artifact.kind, 'p57-full-node-evidence');
    assert.equal(row.artifact.batchId, batchId);
    assert.equal(row.artifact.resultIndex, index);
  });
  assert.equal(new Set(summary.nodes.map(row => row.artifact.file)).size, count, 'distinct complete node artifact references');
  assert.equal(summary.states.length, 1, 'exactly one completed viewport state');
  assert.equal(summary.completedStateCount, 1, 'completed state count');
  const state = summary.states[0];
  assert.equal(state.id, selected.state.id);
  assert.deepEqual(state.viewport, selected.state.viewport);
  assert.equal(state.status, 'exact-dom-preserved', 'final original DOM and style checks completed');
  assert.deepEqual(state.nodes, selected.nodes.map((node, resultIndex) => ({ sourceAuditNodeIndex: node.sourceAuditNodeIndex, resultIndex })), 'complete state occurrence references');
  assertArtifactReference(state.bodyBeforeArtifact, 'body before');
  assertArtifactReference(state.bodyAfterArtifact, 'body after');
  assert.equal(state.bodyAfterArtifact.sha256, state.bodyBeforeArtifact.sha256, 'final body identity');
  assert.equal(state.bodyAfterArtifact.bytes, state.bodyBeforeArtifact.bytes, 'final body byte count');
  for (const selection of [state.selectionBefore, state.selectionAfter]) {
    assert.ok(selection, 'full selection check present before and after');
    assert.equal(selection.status, 'selection-identity-matched');
    assert.equal(selection.stateId, selected.state.id);
    assert.equal(selection.selectedTrial, selected.state.selectedTrial);
    assert.equal(selection.trialCount, 13, 'all thirteen trial controls checked');
    assert.equal(selection.snapshot?.trialButtonCount, 13);
    assert.equal(selection.snapshotSha256, sha256(selection.snapshot), 'full selection snapshot digest');
  }
  assert.deepEqual(state.selectionAfter, state.selectionBefore, 'final full selection identity');
  assert.equal(summary.browserControlsStatus, 'PASS');
  assert.deepEqual(summary.browserControlCounts, { screenshots: 2, sampler: 6, surface: 9, guards: 10, selection: 23, total: 50 });
  assertArtifactReference(summary.controlArtifact, 'complete controls artifact');
  assert.equal(summary.controlArtifact.kind, 'p57-full-control-evidence');
  assert.equal(summary.controlArtifact.batchId, batchId);
  for (const [key, expected] of Object.entries({ batchId, expectedNodeCount: count, started: count, completed: count, productChecksCompleted: count, remaining: 0, inProgress: 0, unattempted: 0 })) {
    assert.equal(summary.checkpointCounts[key], expected, `complete checkpoint ${key}`);
  }
  for (const field of ['pageErrors', 'unexpectedRequests', 'cleanupErrors']) assert.deepEqual(summary[field], [], `no ${field}`);
  assert.ok(!summary.internalBudgetExpired, 'internal budget did not expire');
  assert.equal(Object.hasOwn(summary, 'error'), false, 'no global harness error');
  assert.notEqual(summary.status, 'error');
  return true;
}

// This is a prerequisite schema, not proof of independent review or cleanup.
// The external verifier must separately validate the receipt bytes, provenance,
// artifact contents, resource evidence, and exact-owned cleanup. No execution is
// authorized by this helper or by a fabricated object matching its schema.
export function assertBatchAcceptanceReady(summary, selected, externalReview) {
  assertBatchSourceComplete(summary, selected);
  assert.equal(summary.sourceObservationComplete, true);
  assert.equal(externalReview?.batchId, selected.batch.id, 'independent review exact batch');
  for (const field of ['status', 'artifactClosure', 'resourceGate', 'exactOwnedCleanup']) assert.equal(externalReview[field], 'PASS', `independent review ${field}`);
  assertArtifactReference(externalReview.reviewReceipt, 'independent review receipt');
  return true;
}

export function assertCompleteAggregate(manifest, plan, summaries, externalReviews) {
  validateBatchPlan(manifest, plan);
  assert.equal(summaries.length, plan.batches.length, 'all five batch summaries required');
  assert.equal(externalReviews.length, plan.batches.length, 'all five independent reviews required');
  const summaryById = new Map(summaries.map(summary => [summary.batch.id, summary]));
  const reviewById = new Map(externalReviews.map(review => [review.batchId, review]));
  assert.equal(summaryById.size, plan.batches.length, 'unique batch summaries');
  assert.equal(reviewById.size, plan.batches.length, 'unique independent reviews');
  const orderedRows = plan.batches.flatMap(batch => {
    const selected = selectBatch(manifest, plan, batch.id), summary = summaryById.get(batch.id);
    assert.ok(summary, 'every canonical batch summary present');
    assertBatchAcceptanceReady(summary, selected, reviewById.get(batch.id));
    return summary.nodes;
  });
  assert.deepEqual(orderedRows.map(row => [row.state, row.sourceAuditNodeIndex]), manifest.states.flatMap(state => state.nodes.map(node => [state.id, node.sourceAuditNodeIndex])), 'exact ordered 57-occurrence aggregate');
  const statusCounts = { 'measured-pass': 0, 'measured-fail': 0, unresolved: 0 };
  for (const row of orderedRows) statusCounts[row.status]++;
  return { count: orderedRows.length, statusCounts, allMeasuredPass: statusCounts['measured-pass'] === 57,
    verificationScope: 'prerequisite-schema-only; external review receipt contents and provenance require independent verification' };
}
