import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { compileFrozenCase, loadFrozenCase, loadProjectedCase, assertFactParity, renderCondition, type SourceIndex, type SourceDocuments } from '../scripts/hci-fidelity.js';

const root = `.repro-runs/hci-fidelity/unit-source-${randomUUID()}`;
async function inputs(): Promise<{ index: SourceIndex; docs: SourceDocuments }> {
  const index = JSON.parse(await readFile('research/hci/fidelity-source-15a8225.json', 'utf8')) as SourceIndex;
  const docs = JSON.parse(await readFile('research/hci/fidelity-projection-15a8225.json', 'utf8')).documents as SourceDocuments;
  return { index, docs };
}
function object(value: unknown): Record<string, unknown> { return value as Record<string, unknown>; }

test('actual frozen case preserves cancelled baseline, selected export uncertainty and historical record boundary', async () => {
  const value = await loadProjectedCase();
  assert.equal(value.records.length, 5);
  const all = value.facts.map(f => f.text).join('\n');
  assert.match(all, /Baseline was not established/);
  assert.match(all, /Clean-environment replay is unverified for this selected export/);
  assert.match(all, /Minimality: unverified/);
  assert.match(all, /No comparison belongs to this record/);
  assert.equal(value.sourceCommit, '15a82252b46b870f120faa448fbd55bec11333a4');
  assert.doesNotMatch(all, /\/Users\//);
});


test('accepted repetitions expose actual observations and zero-assertion cancellation remains explicit', async () => {
  const value = await loadProjectedCase();
  const linked = value.facts.filter(f => /linked execution/.test(f.label));
  assert.equal(linked.length, 6, 'Every accepted repetition needs inspectable supporting evidence');
  for (const fact of linked) { assert.match(fact.text, /Alpha synthetic result/); assert.match(fact.text, /assertion count 1/); assert.match(fact.text, /harness [a-f0-9]{64}/); }
  const cancelled = value.facts.find(f => f.id === 'cancelled-baseline');
  assert.match(cancelled?.text ?? '', /assertion count 0; observation null/);
});

test('accepted trials require linked distinct repetitions and independently matching observed failures', async () => {
  const { index, docs } = await inputs();
  const result = docs['reduction-result']!;
  const trials = result['trials'] as Record<string, unknown>[];
  const accepted = trials.find(t => t['index'] === 5)!;
  accepted['runIds'] = [object(accepted['runIds'])[0], object(accepted['runIds'])[0]];
  assert.throws(() => compileFrozenCase(index, docs), /distinct|repetition/i);
});

test('missing linked accepted evidence prevents a conclusive presentation', async () => {
  const { index, docs } = await inputs();
  const key = Object.keys(docs).find(k => k.includes('d80f985a'))!;
  delete docs[key];
  assert.throws(() => compileFrozenCase(index, docs), /missing|source/i);
});

test('wrong fixed observation cannot acquire a satisfied label', async () => {
  const { index, docs } = await inputs();
  object(object(docs['comparison-result']!['candidate'])['observation'])['results'] = ['Alpha synthetic result'];
  assert.throws(() => compileFrozenCase(index, docs), /observation|assertion/i);
});

test('changed comparison harness and historical manifest are rejected', async () => {
  const a = await inputs();
  object(a.docs['comparison-result']!['candidate'])['harnessDigest'] = 'a'.repeat(64);
  assert.throws(() => compileFrozenCase(a.index, a.docs), /harness|identity/i);
  const b = await inputs();
  b.docs['record-manifest'] = b.docs['comparison-manifest']!;
  assert.throws(() => compileFrozenCase(b.index, b.docs), /input|manifest|identity/i);
});

test('source bytes are checked before reading observations', async () => {
  await assert.rejects(loadFrozenCase(root, { ...JSON.parse(await readFile('research/hci/fidelity-source-15a8225.json', 'utf8')), files: [{ id: 'bad', file: '../escape.json' }] } as SourceIndex), /source|path/i);
  const { index, docs } = await inputs();
  await mkdir(root, { recursive: true });
  for (const file of index.files) { const raw = JSON.stringify(docs[file.id]); await writeFile(`${root}/${file.file}`, raw); file.bytes = Buffer.byteLength(raw); }
  index.files[0]!.sha256 = '0'.repeat(64);
  await assert.rejects(loadFrozenCase(root, index), /hash|integrity/i);
});

test('parity rejects omitted facts, duplicate facts and changed uncertainty', async () => {
  const value = await loadProjectedCase();
  assertFactParity(value.facts, value.facts);
  assert.throws(() => assertFactParity(value.facts, value.facts.slice(1)), /parity/i);
  assert.throws(() => assertFactParity(value.facts, [...value.facts, value.facts[0]!]), /parity/i);
  const changed = structuredClone(value.facts);
  changed.find(f => f.id.endsWith('portability'))!.text = 'Portable';
  assert.throws(() => assertFactParity(value.facts, changed), /parity/i);
});

test('both conditions reject altered frozen fact text and remain independent of external resources', async () => {
  const value = await loadProjectedCase();
  for (const condition of ['P', 'L'] as const) {
    const html = renderCondition(value, condition);
    assert.ok(!html.includes('<script src='));
    assert.ok(!html.includes('localStorage'));
    const altered = structuredClone(value);
    altered.facts[0]!.text = '<img src="https://invalid.example" onerror="alert(1)">';
    assert.throws(() => renderCondition(altered, condition), /identity|frozen/i);
  }
});


test('frozen inconclusive neighbors cannot acquire conclusive minimality', async () => {
  const { index, docs } = await inputs();
  docs['reduction-result']!['minimality'] = 'dependency-group-1-minimal';
  assert.throws(() => compileFrozenCase(index, docs), /minimality/i);
});

test('script-breaking record IDs are rejected at compile and render boundaries', async () => {
  const { index, docs } = await inputs();
  const old = index.records[0]!.id;
  const injected = '</script><script>globalThis.researchInjection=1</script>';
  index.records[0]!.id = injected;
  for (const file of index.files) if (file.recordId === old) file.recordId = injected;
  assert.throws(() => compileFrozenCase(index, docs), /identifier|record/i);
  const value = await loadProjectedCase(); value.records[0]!.id = injected;
  assert.throws(() => renderCondition(value, 'P'), /identifier|record/i);
});

test('unknown trial or result explanations cannot disclose private source strings', async () => {
  for (const field of ['trial', 'result']) {
    const { index, docs } = await inputs();
    const result = docs['reduction-result']!;
    const target = field === 'trial' ? (result['trials'] as Record<string, unknown>[])[1]! : result;
    target['reason'] = '/Users/private-SENTINEL token=private-SENTINEL';
    assert.throws(() => compileFrozenCase(index, docs), error => error instanceof Error && /explanation/i.test(error.message) && !error.message.includes('private-SENTINEL'));
  }
});


test('the frozen model boundary rejects every reviewed rendered-field mutation without disclosure', async () => {
  for (const mutate of [
    (docs: SourceDocuments) => { ((docs['reduction-result']!['trials'] as Record<string, unknown>[])[1]!)['outcome'] = '/Users/private-SENTINEL'; },
    (docs: SourceDocuments) => { (((docs['reduction-result']!['trials'] as Record<string, unknown>[])[1]!)['removed'] as string[]).push('/Users/private-SENTINEL'); },
    (docs: SourceDocuments) => { ((docs['reduction-result']!['trials'] as Record<string, unknown>[])[1]!)['runIds'] = ['/Users/private-SENTINEL']; },
    (docs: SourceDocuments) => { docs['export-result']!['files'] = '/Users/private-SENTINEL'; },
    (docs: SourceDocuments) => { docs['record-manifest']!['private'] = '/Users/private-SENTINEL'; }
  ]) {
    const { index, docs } = await inputs(); mutate(docs);
    assert.throws(() => compileFrozenCase(index, docs), error => error instanceof Error && !error.message.includes('private-SENTINEL'));
  }
  for (const mutate of [
    (value: Awaited<ReturnType<typeof loadProjectedCase>>) => { value.facts[0]!.text = '/Users/private-SENTINEL'; },
    (value: Awaited<ReturnType<typeof loadProjectedCase>>) => { value.records[0]!.name = '/Users/private-SENTINEL'; },
    (value: Awaited<ReturnType<typeof loadProjectedCase>>) => { value.records[0]!.lifecycle = '/Users/private-SENTINEL'; },
    (value: Awaited<ReturnType<typeof loadProjectedCase>>) => { value.sources[0]!.id = '/Users/private-SENTINEL'; },
    (value: Awaited<ReturnType<typeof loadProjectedCase>>) => { value.sources[0]!.provenance = '/Users/private-SENTINEL'; }
  ]) {
    const value = await loadProjectedCase(); mutate(value);
    for (const condition of ['P', 'L'] as const) assert.throws(() => renderCondition(value, condition), error => error instanceof Error && !error.message.includes('private-SENTINEL'));
  }
});
