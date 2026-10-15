import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEvidenceStore } from './evidence-store.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));

function fullRow(index, extra = {}) {
  return {
    state: 'P390', sourceAuditNodeIndex: index, status: 'unresolved',
    originalStatus: 'axe-incomplete', target: [`#node-${index}`], originalHtml: '<span>long text</span>',
    identity: { text: `row-${index}`, attributes: [['class', 'duration']] },
    reasons: ['unsupported-paint'], text: `row-${index}`, totalCharacters: 3,
    characters: [{ offset: 0, witness: { stepIndex: 0 } }, { offset: 1, witness: null }],
    steps: Array.from({ length: 3 }, (_, step) => ({
      step, actualScrollLeft: step * 144,
      outsidePaint: Array.from({ length: 3 }, (_, effect) => ({
        owner: { id: `node-${index}-step-${step}-effect-${effect}` },
        supported: effect !== 2, detail: `${index}:${step}:${effect}:` + 'distinct-paint-data '.repeat(40),
        rects: [{ left: step + effect, right: step + effect + 10 }],
      })),
      possibleOccluders: [{ distinct: `${index}-${step}`, rects: [[step, index]] }],
      occluderEquivalence: { checked: true, equal: true, legacyOccluders: [{ step }] },
      paint: { issues: ['unknown-shadow'], layers: [{ color: [255, 255, step] }] },
    })),
    measurementDurationMs: 200 + index, nodeDurationMs: 250 + index,
    productChecksCompleted: true, error: 'Unknown blurred shadow remains unresolved',
    ...extra,
  };
}

function allControls() {
  const rows = (count, kind) => Array.from({ length: count }, (_, i) => ({
    id: `${kind}-${i}`, expected: i % 2 ? 'unresolved' : 'measured-pass',
    observed: { steps: [{ outsidePaint: [{ id: `${kind}-${i}-a` }] }, { outsidePaint: [{ id: `${kind}-${i}-b` }] }], extra: [kind, i] },
  }));
  return {
    controls: rows(6, 'sampler'), screenshotControls: rows(2, 'screenshot'),
    surfaceControls: rows(9, 'surface'), guardBrowserControls: rows(10, 'guard'),
    selectionBrowserControls: { status: 'synthetic-browser-selection-controls-passed', controls: rows(23, 'selection'), productObservation: 'UNRUN', originalMetadata: { preserve: true } },
  };
}

function resultWith(nodes = []) {
  return { status: 'started', browserControlsStatus: 'UNRUN', controls: [], nodes, states: [{ id: 'P390', nodes: nodes.map((_, i) => i), status: 'started' }] };
}

export async function runEvidenceStoreControls(outputRoot = source) {
  const resolvedOutputRoot = await realpath(resolve(outputRoot));
  const allowedRoots = await Promise.all([source, join(dirname(source), 'audit')].map(path => realpath(path)));
  if (!allowedRoots.some(path => resolvedOutputRoot === path || resolvedOutputRoot.startsWith(path + sep))) {
    throw new Error('Pure control output root must be owned by this task source or audit directory');
  }
  const root = await mkdtemp(join(resolvedOutputRoot, 'test-output-evidence-store-'));
  let assertions = 0;
  const passed = [];
  const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
  const ok = (value, message) => { assert.ok(value, message); assertions++; };
  const rejects = async (fn, expected) => { await assert.rejects(fn, expected); assertions++; };
  const caseDir = async name => { const path = join(root, name); await mkdir(path); return path; };
  const parse = async path => JSON.parse(await readFile(path, 'utf8'));
  const verifyRef = async (out, ref) => {
    const bytes = await readFile(join(out, ref.file));
    equal(ref.bytes, bytes.length); equal(ref.sha256, hash(bytes));
    equal(ref.acceptance, 'PROVISIONAL');
    equal(ref.acceptanceRequires, ['batch-final-body-style-selection-checks', 'external-exact-owned-cleanup-review']);
    return JSON.parse(bytes);
  };

  {
    const out = await caseDir('lossless-nodes');
    const original = fullRow(0), expected = clone(original), result = resultWith([original]);
    const store = createEvidenceStore(out, result, { batchId: 'p390-a', expectedNodeCount: 3 });
    await store.save();
    const compact = result.nodes[0], artifact = await verifyRef(out, compact.artifact);
    equal(artifact.row, expected); equal(artifact.batchId, 'p390-a'); equal(artifact.resultIndex, 0);
    equal(artifact.kind, 'p57-full-node-evidence'); equal(artifact.acceptance, 'PROVISIONAL');
    equal(compact.state, expected.state); equal(compact.sourceAuditNodeIndex, 0);
    equal(compact.nodeDurationMs, 250); equal(compact.measurementDurationMs, 200);
    equal(compact.error, expected.error); equal(compact.status, 'unresolved'); equal(compact.productChecksCompleted, true);
    equal(Object.keys(compact).sort(), ['artifact', 'error', 'measurementDurationMs', 'nodeDurationMs', 'productChecksCompleted', 'sourceAuditNodeIndex', 'state', 'status'].sort());
    equal(artifact.row.steps.map(step => step.outsidePaint), expected.steps.map(step => step.outsidePaint));
    ok(new Set(artifact.row.steps.flatMap(step => step.outsidePaint.map(paint => paint.owner.id))).size === 9);
    const firstBytes = await readFile(join(out, compact.artifact.file)), firstStat = await stat(join(out, compact.artifact.file));
    original.steps[0].outsidePaint[0].owner.id = 'mutated-former-row';
    const next = fullRow(1, { status: 'measured-pass', error: undefined });
    result.nodes.push(next); result.states[0].nodes.push(1);
    await store.save();
    equal(await readFile(join(out, compact.artifact.file)), firstBytes);
    equal((await stat(join(out, compact.artifact.file))).mtimeMs, firstStat.mtimeMs);
    equal((await verifyRef(out, result.nodes[1].artifact)).row, clone(next));
    equal(result.states[0].nodes, [0, 1]);
    equal(result.counts, { 'measured-pass': 1, 'measured-fail': 0, unresolved: 1, started: 2, completed: 2, inProgress: 0, remaining: 1, unattempted: 1 });
    equal(result.checkpointCounts, { ...result.counts, batchId: 'p390-a', expectedNodeCount: 3, productChecksCompleted: 2 });
    const summary = await parse(join(out, 'summary.json'));
    equal(summary, clone(result)); equal(summary.status, 'started');
    ok((await stat(join(out, 'summary.json'))).size < firstBytes.length);
    equal((await readdir(out)).filter(file => file.endsWith('.tmp')), []);
    passed.push('full distinct node evidence roundtrips; subsequent saves retain compact rows and immutable bytes');
  }

  {
    const out = await caseDir('partial-row');
    const complete = fullRow(0, { status: 'measured-fail', productChecksCompleted: false });
    const partial = fullRow(1); delete partial.nodeDurationMs; partial.status = 'measured-pass';
    const result = resultWith([complete, partial]);
    await createEvidenceStore(out, result, { batchId: 'partial', expectedNodeCount: 4 }).save();
    equal(result.nodes[1], partial); equal(Object.hasOwn(result.nodes[1], 'artifact'), false);
    equal((await parse(join(out, 'summary.json'))).nodes[1], clone(partial));
    equal(result.counts, { 'measured-pass': 0, 'measured-fail': 1, unresolved: 0, started: 2, completed: 1, inProgress: 1, remaining: 3, unattempted: 2 });
    equal(result.checkpointCounts.productChecksCompleted, 0);
    equal((await readdir(out)).filter(file => file.startsWith('node-')).length, 1);
    passed.push('partial rows stay full in checkpoints and are not counted completed or measured-pass');
  }

  {
    const out = await caseDir('node-collision'), row = fullRow(0), result = resultWith([row]);
    const orphan = join(out, 'node-collision-000.json');
    const prior = Buffer.from(JSON.stringify({ row, orphan: true }) + '\n'); await writeFile(orphan, prior, { flag: 'wx' });
    const store = createEvidenceStore(out, result, { batchId: 'collision', expectedNodeCount: 1 });
    await rejects(() => store.save(), error => error.code === 'EEXIST');
    equal(result.nodes[0], row); equal(Object.hasOwn(row, 'artifact'), false);
    equal(await readFile(orphan), prior); equal((await readdir(out)).includes('summary.json'), false);
    passed.push('existing node artifact is rejected and never adopted or overwritten');
  }

  {
    const out = await caseDir('invalid-output'); const blocked = join(out, 'file'); await writeFile(blocked, 'not a directory');
    const row = fullRow(0), result = resultWith([row]);
    await rejects(() => createEvidenceStore(join(blocked, 'child'), result, { batchId: 'invalid', expectedNodeCount: 1 }).save(), error => ['ENOTDIR', 'ENOENT'].includes(error.code));
    equal(result.nodes[0], row); equal(Object.hasOwn(row, 'artifact'), false);
    const controls = allControls(), controlled = { ...resultWith(), ...controls, browserControlsStatus: 'PASS', browserControlCounts: { screenshots: 2, sampler: 6, surface: 9, guards: 10, selection: 23, total: 50 } };
    await rejects(() => createEvidenceStore(join(blocked, 'child'), controlled, { batchId: 'invalid', expectedNodeCount: 0 }).archiveControls(), error => ['ENOTDIR', 'ENOENT'].includes(error.code));
    equal(Object.hasOwn(controlled, 'controlArtifact'), false);
    for (const field of Object.keys(controls)) equal(controlled[field], controls[field]);
    passed.push('failed immutable writes publish no references and preserve all full fields');
  }

  {
    const out = await caseDir('lossless-controls'), controls = allControls(), expected = clone(controls);
    const result = { ...resultWith(), ...controls, browserControlsStatus: 'PASS', browserControlCounts: { screenshots: 2, sampler: 6, surface: 9, guards: 10, selection: 23, total: 50 } };
    const store = createEvidenceStore(out, result, { batchId: 'controls', expectedNodeCount: 2 });
    await store.archiveControls();
    const artifact = await verifyRef(out, result.controlArtifact);
    for (const field of Object.keys(controls)) { equal(artifact[field], expected[field]); equal(Object.hasOwn(result, field), false); }
    equal(artifact.kind, 'p57-full-control-evidence'); equal(artifact.browserControlsStatus, 'PASS');
    equal(artifact.browserControlCounts, result.browserControlCounts);
    equal(artifact.batchId, 'controls'); equal(result.browserControlsStatus, 'PASS');
    equal((await parse(join(out, 'summary.json'))).controlArtifact, result.controlArtifact);
    equal(result.counts.remaining, 2); equal(result.counts.completed, 0);
    const bytes = await readFile(join(out, result.controlArtifact.file)); await store.save();
    equal(await readFile(join(out, result.controlArtifact.file)), bytes);
    await rejects(() => store.archiveControls(), /already archived/);
    passed.push('all five full control fields roundtrip exactly and compact reference is checkpointed');
  }

  {
    const out = await caseDir('control-collision'), controls = allControls();
    const result = { ...resultWith(), ...controls, browserControlsStatus: 'PASS', browserControlCounts: { screenshots: 2, sampler: 6, surface: 9, guards: 10, selection: 23, total: 50 } };
    const prior = Buffer.from('orphan controls\n'), file = join(out, 'controls-collision.json'); await writeFile(file, prior, { flag: 'wx' });
    await rejects(() => createEvidenceStore(out, result, { batchId: 'collision', expectedNodeCount: 0 }).archiveControls(), error => error.code === 'EEXIST');
    equal(Object.hasOwn(result, 'controlArtifact'), false); equal(await readFile(file), prior);
    for (const field of Object.keys(controls)) equal(result[field], controls[field]);
    passed.push('existing control artifact collision leaves full fields intact and publishes no reference');
  }

  {
    const out = await caseDir('control-gate');
    for (const variation of ['unrun', 'wrong-count', 'missing-full-field']) {
      const result = { ...resultWith(), ...allControls(), browserControlsStatus: 'PASS', browserControlCounts: { screenshots: 2, sampler: 6, surface: 9, guards: 10, selection: 23, total: 50 } };
      if (variation === 'unrun') result.browserControlsStatus = 'UNRUN';
      if (variation === 'wrong-count') result.browserControlCounts.total = 49;
      if (variation === 'missing-full-field') delete result.surfaceControls;
      await rejects(() => createEvidenceStore(out, result, { batchId: variation, expectedNodeCount: 0 }).archiveControls(), /50-control PASS gate/);
      equal(Object.hasOwn(result, 'controlArtifact'), false);
    }
    equal(await readdir(out), []);
    passed.push('control archive requires the exact original fifty-control gate and all full fields');
  }

  {
    const out = await caseDir('orphan-reference');
    const result = resultWith([{ state: 'P390', sourceAuditNodeIndex: 0, status: 'measured-pass', nodeDurationMs: 1, artifact: { file: 'orphan.json', bytes: 1, sha256: 'unverified' } }]);
    await writeFile(join(out, 'orphan.json'), '{}\n', { flag: 'wx' });
    await rejects(() => createEvidenceStore(out, result, { batchId: 'orphan', expectedNodeCount: 1 }).save(), /unpublished artifact reference/);
    equal((await readdir(out)).sort(), ['orphan.json']);
    passed.push('injected orphan reference is rejected without a summary');
  }

  {
    const out = await caseDir('empty-and-infinite'), result = resultWith();
    const store = createEvidenceStore(out, result, { batchId: 'initial', expectedNodeCount: 1 }); await store.save();
    equal(result.counts, { 'measured-pass': 0, 'measured-fail': 0, unresolved: 0, started: 0, completed: 0, inProgress: 0, remaining: 1, unattempted: 1 });
    result.nodes.push(fullRow(0, { nodeDurationMs: Infinity })); await store.save();
    equal(result.counts.completed, 0); equal(result.counts.inProgress, 1); equal(Object.hasOwn(result.nodes[0], 'artifact'), false);
    equal(result.status, 'started'); equal(Object.hasOwn(result, 'externalCleanup'), false);
    passed.push('empty checkpoint and nonfinite duration remain incomplete without acceptance or cleanup claims');
  }

  const report = { status: 'PURE_CONTROLS_PASSED', browserOrDockerExecuted: false, assertionCount: assertions, controlCount: passed.length, controls: passed, outputDirectory: root };
  await writeFile(join(root, 'test-report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await runEvidenceStoreControls(process.argv[2]), null, 2));
}
