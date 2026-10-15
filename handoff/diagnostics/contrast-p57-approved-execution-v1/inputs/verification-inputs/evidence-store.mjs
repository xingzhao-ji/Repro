import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const controlFields = ['controls', 'screenshotControls', 'surfaceControls', 'guardBrowserControls', 'selectionBrowserControls'];
const expectedControlCounts = { screenshots: 2, sampler: 6, surface: 9, guards: 10, selection: 23, total: 50 };
const acceptanceRequires = ['batch-final-body-style-selection-checks', 'external-exact-owned-cleanup-review'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function fail(message, category = 'verification') {
  const error = new Error(message);
  error.name = 'EvidenceStoreError';
  error.category = category;
  return error;
}

// Only this call's bytes are retained while the exclusive write is verified.
// A collision, failed write, or failed readback leaves an unreferenced artifact;
// the store never adopts or retries an existing immutable evidence file.
async function writeVerified(out, file, payload, metadata) {
  const bytes = Buffer.from(JSON.stringify(payload) + '\n');
  const expectedHash = sha256(bytes);
  try {
    await writeFile(join(out, file), bytes, { flag: 'wx', mode: 0o600 });
    const recovered = await readFile(join(out, file));
    if (recovered.length !== bytes.length || sha256(recovered) !== expectedHash || !recovered.equals(bytes)) {
      throw fail(`Immutable evidence readback mismatch: ${file}`);
    }
    return { file, bytes: bytes.length, sha256: expectedHash, ...metadata, acceptance: 'PROVISIONAL', acceptanceRequires: [...acceptanceRequires] };
  } catch (error) {
    error.category ??= 'environment';
    throw error;
  }
}

/**
 * A single live P57 batch's lossless checkpoint writer. It does not resume old
 * output, accept a batch, review cleanup, or retain historical full observations.
 * The caller owns the result object and the already-created output directory.
 * Completed rows are replaced only after exclusive artifact write + readback.
 */
export function createEvidenceStore(outputDirectory, result, { batchId, expectedNodeCount }) {
  if (typeof batchId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(batchId)) {
    throw fail('Invalid P57 batch identifier', 'input');
  }
  if (!Number.isInteger(expectedNodeCount) || expectedNodeCount < 0 || expectedNodeCount > 57 || !result || !Array.isArray(result.nodes)) {
    throw fail('Invalid P57 result or expected node count', 'input');
  }
  if (Object.hasOwn(result, 'controlArtifact')) throw fail('Cannot adopt an unpublished control artifact reference', 'input');
  const out = resolve(outputDirectory);
  // Weak membership tracks only compact objects published by this invocation.
  // It holds neither full rows nor strong references to compact historical rows.
  const publishedNodes = new WeakSet();
  let controlsArchived = false;
  let busy = false;

  function counts() {
    if (result.nodes.length > expectedNodeCount) throw fail('Started node count exceeds this batch', 'input');
    const counters = { 'measured-pass': 0, 'measured-fail': 0, unresolved: 0, started: result.nodes.length, completed: 0, inProgress: 0, remaining: 0, unattempted: expectedNodeCount - result.nodes.length };
    let productChecksCompleted = 0;
    for (const row of result.nodes) {
      if (!row || typeof row !== 'object') throw fail('Invalid P57 node row', 'input');
      if (Object.hasOwn(row, 'artifact') && !publishedNodes.has(row)) throw fail('Cannot adopt an unpublished artifact reference', 'input');
      if (!Number.isFinite(row.nodeDurationMs)) continue;
      counters.completed++;
      if (['measured-pass', 'measured-fail', 'unresolved'].includes(row.status)) counters[row.status]++;
      else throw fail('Completed P57 node has an unknown status', 'input');
      if (row.productChecksCompleted === true) productChecksCompleted++;
    }
    counters.inProgress = counters.started - counters.completed;
    counters.remaining = expectedNodeCount - counters.completed;
    result.counts = counters;
    result.checkpointCounts = { ...counters, batchId, expectedNodeCount, productChecksCompleted };
  }

  async function writeSummary() {
    counts();
    const temporary = join(out, `.summary-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rename(temporary, join(out, 'summary.json'));
    } catch (error) {
      // A failed checkpoint never changes immutable evidence. Only its own temp
      // file may be removed; any cleanup failure is attached to the real cause.
      try { await unlink(temporary); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') error.summaryTemporaryCleanupError = { code: cleanupError.code, message: cleanupError.message };
      }
      error.category ??= 'environment';
      throw error;
    }
  }

  async function archiveNode(index) {
    const row = result.nodes[index];
    if (publishedNodes.has(row) || !Number.isFinite(row.nodeDurationMs)) return;
    const file = `node-${batchId}-${String(index).padStart(3, '0')}.json`;
    const metadata = { kind: 'p57-full-node-evidence', batchId, resultIndex: index };
    const artifact = await writeVerified(out, file, {
      schemaVersion: 1, ...metadata, acceptance: 'PROVISIONAL', acceptanceRequires: [...acceptanceRequires], row,
    }, metadata);
    const compact = {
      state: row.state, sourceAuditNodeIndex: row.sourceAuditNodeIndex, status: row.status,
      productChecksCompleted: row.productChecksCompleted === true, nodeDurationMs: row.nodeDurationMs,
    };
    for (const field of ['measurementDurationMs', 'error']) if (Object.hasOwn(row, field)) compact[field] = row[field];
    compact.artifact = artifact;
    publishedNodes.add(compact);
    result.nodes[index] = compact;
  }

  async function save() {
    if (busy) throw fail('Concurrent P57 evidence store operation', 'input');
    busy = true;
    try {
      counts();
      for (let index = 0; index < result.nodes.length; index++) await archiveNode(index);
      await writeSummary();
    } finally {
      busy = false;
    }
  }

  async function archiveControls() {
    if (busy) throw fail('Concurrent P57 evidence store operation', 'input');
    if (controlsArchived) throw fail('P57 controls already archived', 'input');
    busy = true;
    try {
      const observed = {
        screenshots: result.screenshotControls?.length,
        sampler: result.controls?.length,
        surface: result.surfaceControls?.length,
        guards: result.guardBrowserControls?.length,
        selection: result.selectionBrowserControls?.controls?.length,
      };
      const arraysPresent = ['controls', 'screenshotControls', 'surfaceControls', 'guardBrowserControls'].every(field => Array.isArray(result[field])) && Array.isArray(result.selectionBrowserControls?.controls);
      const exactCounts = Object.entries(expectedControlCounts).every(([field, expected]) => result.browserControlCounts?.[field] === expected && (field === 'total' || observed[field] === expected));
      if (result.browserControlsStatus !== 'PASS' || !arraysPresent || !exactCounts) throw fail('P57 control archive requires the original 50-control PASS gate', 'input');
      const metadata = { kind: 'p57-full-control-evidence', batchId };
      const payload = {
        schemaVersion: 1, ...metadata, acceptance: 'PROVISIONAL', acceptanceRequires: [...acceptanceRequires],
        browserControlsStatus: result.browserControlsStatus, browserControlCounts: result.browserControlCounts,
      };
      for (const field of controlFields) payload[field] = result[field];
      const artifact = await writeVerified(out, `controls-${batchId}.json`, payload, metadata);
      // Drop the temporary envelope's own references before checkpointing, too.
      for (const field of controlFields) { delete payload[field]; delete result[field]; }
      result.controlArtifact = artifact;
      controlsArchived = true;
      await writeSummary();
    } finally {
      busy = false;
    }
  }

  return { save, archiveControls };
}
