import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import ts from 'typescript';
import { createWorkloadLifecycleCapture } from '../verification-inputs/contrast-p57-approved-batch-probe.mjs';

const budget = Object.freeze({ sourceMaxBytes: 16384, samplerMetadataMaxBytes: 114688,
  samplerCombinedMaxBytes: 4177920, failure: null });
const validProbe = Object.freeze({ selected: true, intendedTest: true, ppid: 1,
  entrypoint: '/work/verification-inputs/contrast-p57-approved-batch-probe.mjs',
  runnerMode: 'single-script-bounded-pools', nodePools: Object.freeze({ v8: 1, libuv: 1 }), sourceSummaryBudget: budget });
const completeSource = Object.freeze({ status: 'incomplete', sourceObservationComplete: true,
  internalBudgetExpired: false, cleanupErrorCount: 0, expectedExitCode: 1,
  browserVersion: 'fixture-browser-1.0', batchId: 'p390-00-11' });

function fixture(options = {}) {
  const marks = [], closes = [], writes = [];
  let tick = 0n;
  const lifecycle = {
    mark: (...args) => { marks.push(args); },
    async observeClose(label, operation, count) {
      closes.push({ label, count });
      return await operation();
    },
    summary: () => {
      if (options.snapshotThrows) throw new Error('PRIVATE_SNAPSHOT_DETAIL');
      return options.diagnostics ?? { status: 'complete', issues: [] };
    },
  };
  const capture = createWorkloadLifecycleCapture({
    lifecycle, resourceProbe: Object.hasOwn(options, 'resourceProbe') ? options.resourceProbe : validProbe,
    batchId: Object.hasOwn(options,'batchId')?options.batchId:'p390-00-11',
    callerSha256: options.callerSha256 ?? 'a'.repeat(64),
    writeSidecar: async text => {
      assert.equal(typeof text, 'string');
      assert.ok(Buffer.byteLength(text, 'utf8') <= 16384);
      writes.push(text);
      if (options.writeFailure) throw options.writeFailure;
    },
    clock: () => {
      if (options.clockThrows) throw new Error('PRIVATE_CLOCK_DETAIL');
      return { utc: '2026-10-15T04:10:00.000Z', monoNs: ++tick * 1000000n };
    },
    runtimeVersions: { node: 'fixture-node', kernelRelease: 'fixture-kernel' },
  });
  return { capture, marks, closes, writes };
}

function incomplete(result) {
  assert.equal(result.complete, false);
  assert.equal(result.status, 'diagnostic-capture-incomplete');
  assert.ok(Array.isArray(result.errors));
}

test('valid exact preload validates without claiming capture before finish', () => {
  const f = fixture();
  assert.equal(f.capture.captureComplete, false);
  assert.equal(f.capture.validate(), undefined);
  assert.equal(f.capture.captureComplete, false);
  assert.deepEqual(f.writes, []);
});

for (const [name, resourceProbe] of [
  ['missing', undefined], ['null', null], ['unselected', { ...validProbe, selected: false }],
  ['unintended', { ...validProbe, intendedTest: false }], ['parent', { ...validProbe, ppid: 12 }],
  ['entrypoint', { ...validProbe, entrypoint: '/work/verification-inputs/lifecycle-diagnostic.mjs' }],
  ['runner', { ...validProbe, runnerMode: 'unbounded' }], ['pools', { ...validProbe, nodePools: { v8: 2, libuv: 1 } }],
  ['unreserved', { ...validProbe, sourceSummaryBudget: undefined }],
  ['metadata-reserve', { ...validProbe, sourceSummaryBudget: { ...budget, samplerMetadataMaxBytes: 131072 } }],
  ['shared-reserve', { ...validProbe, sourceSummaryBudget: { ...budget, samplerCombinedMaxBytes: 4194304 } }],
  ['source-reserve', { ...validProbe, sourceSummaryBudget: { ...budget, sourceMaxBytes: 16385 } }],
]) {
  test(`invalid ${name} preload is rejected before any capture operation`, () => {
    const f = fixture({ resourceProbe });
    assert.throws(() => f.capture.validate(), { message: 'LIFECYCLE_PRELOAD_INVALID' });
    assert.equal(f.capture.captureComplete, false);
    assert.deepEqual(f.closes, []); assert.deepEqual(f.writes, []);
  });
}

for (const callerSha256 of ['', 'a'.repeat(63), 'a'.repeat(65), 'z'.repeat(64)]) {
  test(`invalid caller digest ${callerSha256.length} characters is rejected`, () => {
    const f = fixture({ callerSha256 });
    assert.throws(() => f.capture.validate(), { message: 'LIFECYCLE_PRELOAD_INVALID' });
  });
}

test('mark forwards only the caller supplied label and event', () => {
  const f = fixture(); f.capture.validate();
  const before = f.marks.length;
  f.capture.mark('workload.fixture', 'start');
  assert.deepEqual(f.marks.slice(before), [['workload.fixture', 'start']]);
});

test('close wrapper preserves operation value, context-count callback and original call order', async () => {
  const f = fixture(); f.capture.validate();
  const trace = [], value = Object.freeze({ originalValue: true });
  const count = () => 1;
  for (const label of ['controls.context.close', 'product.context.close', 'final.browser.close']) {
    assert.strictEqual(await f.capture.observeClose(label, () => { trace.push(label); return value; }, count), value);
  }
  assert.deepEqual(trace, ['controls.context.close', 'product.context.close', 'final.browser.close']);
  assert.deepEqual(f.closes.map(item => item.label), trace);
  assert.ok(f.closes.every(item => item.count === count));
});

for (const asynchronous of [false, true]) {
  test(`close wrapper preserves exact ${asynchronous ? 'async' : 'sync'} primary error object`, async () => {
    const f = fixture(); f.capture.validate();
    const primary = Object.freeze({ originalSourceFailure: true });
    let calls = 0;
    const operation = asynchronous ? async () => { calls++; throw primary; } : () => { calls++; throw primary; };
    await assert.rejects(async () => await f.capture.observeClose('final.browser.close', operation, () => 1), error => error === primary);
    assert.equal(calls, 1); assert.equal(f.closes.length, 1);
  });
}

test('deadline and final wrappers do not introduce caching or suppress either original call', async () => {
  const f = fixture(); f.capture.validate();
  const trace = [];
  const close = () => { trace.push('original browser.close'); return Promise.resolve(); };
  await f.capture.observeClose('deadline.browser.close', close, () => 1);
  await f.capture.observeClose('final.browser.close', close, () => 0);
  assert.deepEqual(trace, ['original browser.close', 'original browser.close']);
  assert.deepEqual(f.closes.map(item => item.label), ['deadline.browser.close', 'final.browser.close']);
});

test('honest completed incomplete-status exit1 can complete diagnostic capture without changing source snapshot', async () => {
  const f = fixture(); f.capture.validate();
  const before = JSON.stringify(completeSource);
  const result = await f.capture.finish(completeSource);
  assert.equal(result.complete, true); assert.equal(result.status, 'diagnostic-capture-complete');
  assert.deepEqual(result.errors, []); assert.equal(f.capture.captureComplete, true);
  assert.equal(JSON.stringify(completeSource), before);
  assert.equal(f.writes.length, 1); assert.ok(f.writes[0].endsWith('\n'));
  const stored = JSON.parse(f.writes[0]);
  assert.equal(stored.observationsComplete, true);
  assert.equal(stored.closure, 'PROVISIONAL_PENDING_SIDECAR_AND_TELEMETRY_IO_AND_EXTERNAL_GATES');
  assert.ok(!f.writes[0].includes('acceptance-pass'));
});

for (const patch of [
  { sourceObservationComplete: false }, { status: 'error' }, { internalBudgetExpired: true },
  { cleanupErrorCount: 1 }, { expectedExitCode: 86 }, { expectedExitCode: 0 }, { batchId: 'p390-12-23' },
]) {
  test(`invalid or partial source snapshot ${JSON.stringify(patch)} cannot complete capture`, async () => {
    const f = fixture(); f.capture.validate();
    const source = Object.freeze({ ...completeSource, ...patch });
    const before = JSON.stringify(source);
    incomplete(await f.capture.finish(source));
    assert.equal(f.capture.captureComplete, false);
    assert.equal(JSON.stringify(source), before);
    assert.equal(f.writes.length, 1);
  });
}

test('completed measured-pass exit0 remains eligible for diagnostic capture, without acceptance promotion', async () => {
  const f = fixture(); f.capture.validate();
  const result = await f.capture.finish(Object.freeze({ ...completeSource,
    status: 'all-batch-requested-nodes-measured-pass', expectedExitCode: 0 }));
  assert.equal(result.complete, true);
  assert.equal(JSON.parse(f.writes[0]).closure, 'PROVISIONAL_PENDING_SIDECAR_AND_TELEMETRY_IO_AND_EXTERNAL_GATES');
});

for (const options of [{ diagnostics: { status: 'incomplete', issues: ['FIXTURE_METADATA_LOSS'] } }, { snapshotThrows: true }, { clockThrows: true }]) {
  test(`diagnostic loss ${JSON.stringify(options)} does not replace original close errors or mutate source`, async () => {
    const f = fixture(options); f.capture.validate();
    const primary = Object.freeze({ originalCleanupFailure: true });
    await assert.rejects(async () => await f.capture.observeClose('final.browser.close', () => { throw primary; }, () => 1), error => error === primary);
    const before = JSON.stringify(completeSource);
    incomplete(await f.capture.finish(completeSource));
    assert.equal(JSON.stringify(completeSource), before);
    assert.ok(!f.writes.join('').includes('PRIVATE_'));
  });
}

test('sidecar write failure returns fixed secondary error without throwing or altering source', async () => {
  const f = fixture({ writeFailure: Object.freeze({ privateIOFailure: 'DO_NOT_SERIALIZE' }) }); f.capture.validate();
  const before = JSON.stringify(completeSource);
  const result = await f.capture.finish(completeSource);
  incomplete(result); assert.ok(result.errors.includes('SIDECAR_WRITE_FAILED'));
  assert.equal(f.capture.captureComplete, false); assert.equal(f.writes.length, 1);
  assert.equal(JSON.stringify(completeSource), before);
  assert.ok(!f.writes[0].includes('DO_NOT_SERIALIZE'));
});

test('repeated finish cannot write a second sidecar or be reported complete', async () => {
  const f = fixture(); f.capture.validate();
  await f.capture.finish(completeSource);
  const repeated = await f.capture.finish(completeSource);
  incomplete(repeated); assert.ok(repeated.errors.includes('ISSUE_FINISH_REPEATED'));
  assert.equal(f.writes.length, 1);
});

test('actual UTF-8 sidecar bytes include newline; oversized diagnostics fail closed before write', async () => {
  const f = fixture({ diagnostics: { status: 'complete', issues: [], fixturePadding: '😀'.repeat(16384) } });
  f.capture.validate();
  const result = await f.capture.finish(completeSource);
  incomplete(result); assert.ok(result.errors.includes('SIDECAR_BYTE_CAP'));
  assert.deepEqual(f.writes, []); assert.equal(f.capture.captureComplete, false);
});

test('actual four caller wrappers retain original operations, await/void semantics and failure handlers', async () => {
  const candidatePath = new URL('../verification-inputs/contrast-p57-approved-batch-probe.mjs', import.meta.url);
  const originalPath = new URL('../../../contrast-p57-memory-execution-v1/runtime/p390-00-11/input/verification-inputs/contrast-p57-memory-batch-probe.mjs', import.meta.url);
  const candidate = readFileSync(candidatePath, 'utf8'), original = readFileSync(originalPath, 'utf8');
  assert.equal(createHash('sha256').update(original).digest('hex'), '9b8f407a554434f793bd93b7cf50cf145adfba828d6660c6b49896fe82da7053');
  const tree = ts.createSourceFile('candidate.mjs', candidate, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const labels = new Map([
    ['controls.context.close', 'context'], ['product.context.close', 'product'],
    ['final.browser.close', 'browser'], ['deadline.browser.close', 'browser'],
  ]);
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'observeClose' && ts.isStringLiteral(node.arguments[0])
      && labels.has(node.arguments[0].text)) calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls.map(call => call.arguments[0].text)).size, 4);
  for (const call of calls) {
    const label = call.arguments[0].text, owner = labels.get(label);
    assert.equal(call.arguments.length, 3);
    assert.ok(ts.isArrowFunction(call.arguments[1]));
    assert.equal(call.arguments[1].parameters.length, 0);
    assert.equal(call.arguments[1].body.getText(tree).replaceAll(/\s/g, ''), `${owner}.close()`);
    assert.ok(ts.isArrowFunction(call.arguments[2]));
    assert.equal(call.arguments[2].body.getText(tree).replaceAll(/\s/g, ''), 'browser.contexts().length');
    let statement = call;
    while (statement.parent && !ts.isExpressionStatement(statement)) statement = statement.parent;
    const wrapped = statement.getText(tree);
    const restored = wrapped.replace(call.getText(tree), `${owner}.close()`);
    assert.ok(original.includes(restored), `${label} retains exact original statement after removing only wrapper`);
    if (label === 'deadline.browser.close') assert.match(restored, /^void browser\.close\(\)\.catch\(/);
    else assert.match(restored, new RegExp(`^await ${owner}\\.close\\(\\)`));
    const captureName = call.expression.expression.getText(tree);
    const trace = [], sentinel = Object.freeze({ fixtureCloseError: label });
    const f = fixture(); f.capture.validate();
    const value = {};
    for (const throwing of [false, true]) {
      const browser = { contexts: () => ['fixture-context'], close: () => { trace.push(owner); if (throwing) throw sentinel; return value; } };
      const local = { browser, context: { close: browser.close }, product: { close: browser.close }, [captureName]: f.capture };
      const invoke = () => new Script(call.getText(tree)).runInNewContext(local);
      if (throwing) await assert.rejects(async () => await invoke(), error => error === sentinel);
      else assert.strictEqual(await invoke(), value);
    }
    assert.deepEqual(trace, [owner, owner]);
  }
});

test('actual caller snapshot normalizes absent deadline flag to false and retains true without mutating original result', async () => {
  const candidate = readFileSync(new URL('../verification-inputs/contrast-p57-approved-batch-probe.mjs', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('candidate.mjs', candidate, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const snapshots = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'finish' && node.expression.expression.getText(tree) === 'lifecycleCapture') {
      assert.equal(node.arguments.length, 1);
      assert.ok(ts.isObjectLiteralExpression(node.arguments[0]));
      snapshots.push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(snapshots.length, 1);
  const snapshotText = snapshots[0].getText(tree);
  for (const mode of ['absent', 'undefined', 'true']) {
    const original = { status: 'incomplete', sourceObservationComplete: true,
      cleanupErrors: Object.freeze([]), browserVersion: 'fixture-browser' };
    if (mode !== 'absent') original.internalBudgetExpired = mode === 'true' ? true : undefined;
    const result = Object.freeze(original);
    const before = Object.getOwnPropertyDescriptors(result);
    const snapshot = new Script(`(${snapshotText})`).runInNewContext({ result, batchId: 'p390-00-11' });
    assert.equal(snapshot.internalBudgetExpired, mode === 'true');
    assert.deepEqual(Object.getOwnPropertyDescriptors(result), before);
    assert.equal(Object.hasOwn(result, 'internalBudgetExpired'), mode !== 'absent');
    const f = fixture(); f.capture.validate();
    const outcome = await f.capture.finish(snapshot);
    assert.equal(outcome.complete, mode !== 'true');
    assert.equal(f.writes.length, 1);
  }
});

for(const batchId of ['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32']) {
 test('exact assigned batch completes sidecar '+batchId,async()=>{
  const f=fixture({batchId}); f.capture.validate();
  assert.equal((await f.capture.finish({...completeSource,batchId})).complete,true);
  assert.equal(JSON.parse(f.writes[0]).source.batchId,batchId);
  assert.equal(JSON.parse(f.writes[0]).scope,'prospective-corrected-css-p57-batch');
 });
 test('other authorized ID cannot impersonate assigned batch '+batchId,async()=>{
  const f=fixture({batchId});f.capture.validate();
  const wrong=batchId==='p390-00-11'?'p320-00-10':'p390-00-11';
  assert.equal((await f.capture.finish({...completeSource,batchId:wrong})).complete,false);
 });
}
for(const batchId of [undefined,null,'p390-00-10','p320-33-43','../p390-00-11'])test('unknown batch rejected '+batchId,()=>{
 const f=fixture({batchId});assert.throws(()=>f.capture.validate(),{message:'LIFECYCLE_PRELOAD_INVALID'});
});
