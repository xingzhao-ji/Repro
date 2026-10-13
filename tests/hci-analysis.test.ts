import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeHci, type Answer, type HciAnalysisInput, type TaskObservation } from '../scripts/analyze-hci.js';

const fixturePath = new URL('../research/hci/synthetic-analysis-test/calibration.json', import.meta.url);

async function fixture(): Promise<HciAnalysisInput> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as HciAnalysisInput;
}

function close(actual: number | null, expected: number): void {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < 1e-12, `expected ${expected}, received ${actual}`);
}

test('synthetic analysis: hand-calculated calibration preserves unsure and contradictory probabilities', async () => {
  const report = analyzeHci(await fixture());
  assert.equal(report.classification, 'synthetic-analysis-test');
  assert.equal(report.scope, 'offline-instrument-test');
  const claims = report.unitReports[0]!.blocks[0]!.claims;
  assert.deepEqual(claims.supported, { scheduled: 3, answered: 3, yes: 1, no: 1, unsure: 1, missing: 0 });
  assert.deepEqual(claims.unsupported, { scheduled: 3, answered: 3, yes: 1, no: 1, unsure: 1, missing: 0 });
  close(claims.falseAcceptanceRate, 1 / 3);
  close(claims.falseRejectionRate, 1 / 3);
  close(claims.supportedWithheldRate, 1 / 3);
  close(claims.supportedAcceptanceRate, 1 / 3);
  assert.equal(claims.brier.eligible, 6);
  // Unsupported: .64 + .01 + .25. Supported: .01 + .64 + .16.
  close(claims.brier.mean, 1.71 / 6);
  assert.deepEqual(claims.judgmentConfidence.correct, { count: 2, mean: 90, median: 90, min: 90, max: 90 });
  assert.deepEqual(claims.judgmentConfidence.incorrect, { count: 2, mean: 80, median: 80, min: 80, max: 80 });
  assert.deepEqual(claims.judgmentConfidence.unsureProbability, { count: 2, mean: 55, median: 55, min: 50, max: 60 });
  assert.equal(report.byItem.length, 6);
  assert.equal(report.byBlockOrder.find(row => row.condition === 'P' && row.order === 1)?.unitCount, 1);
  assert.deepEqual(claims.supportProbabilityByAnswer.unsupported.yes, [{ percent: 80, count: 1 }]);
  assert.deepEqual(claims.supportProbabilityByAnswer.supported.unsure, [{ percent: 60, count: 1 }]);
});

test('synthetic analysis: all-no answers expose false rejection despite zero false acceptance', async () => {
  const input = await fixture();
  for (const row of input.claimObservations) { row.answer = 'no'; row.supportProbabilityPercent = 0; }
  const claims = analyzeHci(input).unitReports[0]!.blocks[0]!.claims;
  assert.equal(claims.falseAcceptanceRate, 0);
  assert.equal(claims.falseRejectionRate, 1);
  assert.equal(claims.supportedWithheldRate, 0);
  assert.equal(claims.supportedAcceptanceRate, 0);
  assert.equal(claims.brier.mean, 0.5);
  assert.equal(claims.judgmentConfidence.incorrect.mean, 100);
});

test('synthetic analysis: absent and blank scheduled answers remain visible and orphan probabilities do not enter Brier', async () => {
  const input = await fixture();
  input.claimObservations.shift();
  input.claimObservations[0]!.supportProbabilityPercent = null;
  input.claimObservations[2]!.answer = null;
  input.claimObservations[3]!.answer = null;
  input.claimObservations[3]!.supportProbabilityPercent = null;
  const claims = analyzeHci(input).unitReports[0]!.blocks[0]!.claims;
  assert.deepEqual([claims.scheduled, claims.observed, claims.absentRows, claims.blankAnswers, claims.missingAnswers, claims.missingProbabilities, claims.probabilityWithoutAnswer], [6, 5, 1, 2, 3, 3, 1]);
  assert.deepEqual(claims.unsupported, { scheduled: 3, answered: 2, yes: 0, no: 1, unsure: 1, missing: 1 });
  assert.deepEqual(claims.supported, { scheduled: 3, answered: 1, yes: 0, no: 0, unsure: 1, missing: 2 });
  assert.equal(claims.falseAcceptanceRate, 0);
  assert.equal(claims.falseRejectionRate, 0);
  assert.equal(claims.supportedWithheldRate, 1);
  assert.equal(claims.brier.eligible, 2);
  close(claims.brier.mean, 0.205);
  assert.equal(claims.judgmentConfidence.correct.count, 0);
  assert.equal(claims.judgmentConfidence.correct.mean, null);
  assert.deepEqual(claims.supportProbabilityByAnswer.supported.blank, [{ percent: 90, count: 1 }]);
  assert.deepEqual(claims.supportProbabilityDistribution.supported, [{ percent: 60, count: 1 }, { percent: 90, count: 1 }]);
});

test('synthetic analysis: a wholly unobserved planned block has null denominators and no invented zero answers', async () => {
  const input = await fixture(); input.claimObservations = [];
  const report = analyzeHci(input);
  const claims = report.unitReports[0]!.blocks[0]!.claims;
  assert.deepEqual([claims.scheduled, claims.observed, claims.absentRows, claims.blankAnswers, claims.missingAnswers, claims.missingProbabilities], [6, 0, 6, 0, 6, 6]);
  for (const value of [claims.falseAcceptanceRate, claims.falseRejectionRate, claims.supportedWithheldRate, claims.supportedAcceptanceRate, claims.brier.mean]) assert.equal(value, null);
  assert.equal(report.paired.falseAcceptanceRate.pairedCount, 0);
  assert.equal(report.paired.falseAcceptanceRate.summary.mean, null);
  assert.deepEqual(report.paired.falseAcceptanceRate.unpaired, [{ unitId: 'synthetic-unit-01', reason: 'missing-both' }]);
});

test('synthetic analysis: contradictory yes and low support probability remain separate valid responses', async () => {
  const input = await fixture(); input.claimObservations[3]!.supportProbabilityPercent = 20;
  const claims = analyzeHci(input).unitReports[0]!.blocks[0]!.claims;
  close(claims.brier.mean, 2.34 / 6);
  assert.equal(claims.judgmentConfidence.correct.mean, 55);
  assert.equal(claims.supported.yes, 1);
});

type Judgment = readonly [supported: boolean, answer: Answer | null, probability: number | null];
function emptyInput(): HciAnalysisInput {
  return { schemaVersion: 1, classification: 'synthetic-analysis-test', protocolVersion: '0.1-test-only', keyVersion: 'synthetic-pairing-v1', units: [], claimKeys: [], claimObservations: [], taskObservations: [] };
}

function addBlock(input: HciAnalysisInput, unitId: string, condition: 'P' | 'L', order: 1 | 2, caseSet: 'A' | 'B', judgments: readonly Judgment[]) {
  let unit = input.units.find(row => row.unitId === unitId);
  if (!unit) { unit = { unitId, blocks: [] }; input.units.push(unit); }
  const caseId = `case-${caseSet}`;
  const block = { blockId: `${unitId}-${condition}`, condition, order, caseSet, caseId, tasks: [{ slotId: 'inspect', taskId: 'T2', module: 'inspection' as const, limitSeconds: 240 }], claims: judgments.map(([supported], index) => {
    const claimId = `C-${supported ? 'supported' : 'unsupported'}-${index}`;
    const keyId = `${caseSet}-${claimId}`;
    if (!input.claimKeys.some(key => key.keyId === keyId)) input.claimKeys.push({ keyId, caseId, claimId, supported });
    return { slotId: `claim-${index}`, taskSlotId: 'inspect', claimId, keyId, order: index + 1 };
  }) };
  unit.blocks.push(block);
  judgments.forEach(([, answer, probability], index) => input.claimObservations.push({ unitId, blockId: block.blockId, slotId: `claim-${index}`, answer, supportProbabilityPercent: probability }));
  return block;
}

test('synthetic analysis: differences are calculated per unit with equal weight and metric-specific pairing', () => {
  const input = emptyInput();
  addBlock(input, 'synthetic-1', 'P', 1, 'A', [[false, 'yes', 80]]);
  addBlock(input, 'synthetic-1', 'L', 2, 'B', Array.from({ length: 4 }, () => [false, 'no', 20] as const));
  addBlock(input, 'synthetic-2', 'P', 2, 'B', Array.from({ length: 3 }, () => [false, 'no', 10] as const));
  addBlock(input, 'synthetic-2', 'L', 1, 'A', [[false, 'yes', 80]]);
  addBlock(input, 'synthetic-3', 'P', 1, 'A', [[false, 'yes', 100]]);
  addBlock(input, 'synthetic-4', 'P', 1, 'A', [[false, 'no', 0]]);
  addBlock(input, 'synthetic-4', 'L', 2, 'B', [[true, 'yes', 100]]);
  addBlock(input, 'synthetic-5', 'P', 1, 'A', [[true, 'no', 0]]);
  addBlock(input, 'synthetic-5', 'L', 2, 'B', [[true, 'yes', 100]]);
  const report = analyzeHci(input);
  const fa = report.paired.falseAcceptanceRate;
  assert.equal(fa.pairedCount, 2);
  assert.deepEqual(fa.differences, [{ unitId: 'synthetic-1', P: 1, L: 0, difference: 1 }, { unitId: 'synthetic-2', P: 0, L: 1, difference: -1 }]);
  assert.deepEqual(fa.summary, { count: 2, mean: 0, median: 0, min: -1, max: 1 });
  assert.deepEqual(fa.unpaired, [{ unitId: 'synthetic-3', reason: 'missing-L' }, { unitId: 'synthetic-4', reason: 'missing-L' }, { unitId: 'synthetic-5', reason: 'missing-both' }]);
  const fr = report.paired.falseRejectionRate;
  assert.equal(fr.pairedCount, 1);
  assert.deepEqual(fr.differences, [{ unitId: 'synthetic-5', P: 1, L: 0, difference: 1 }]);
  assert.ok(fr.unpaired.some(row => row.unitId === 'synthetic-4' && row.reason === 'missing-P'));
  const brier = report.paired.brierMean;
  assert.equal(brier.pairedCount, 4);
  close(brier.summary.mean, 0.2425);
  close(brier.summary.median, 0.3);
  close(brier.summary.min, -0.63);
  close(brier.summary.max, 1);
  assert.equal(report.byCondition.find(row => row.condition === 'P')?.metrics.falseAcceptanceRate.mean, 0.5);
  assert.equal(report.byCondition.find(row => row.condition === 'L')?.metrics.falseAcceptanceRate.mean, 0.5);
  assert.equal(report.byBlockOrder.find(row => row.condition === 'P' && row.order === 2)?.metrics.falseAcceptanceRate.mean, 0);
  assert.ok(report.byItem.some(row => row.condition === 'P' && row.caseId === 'case-A' && row.claimId === 'C-unsupported-0' && row.claims.unsupported.answered === 3));
});

async function timingInput(): Promise<HciAnalysisInput> {
  const input = await fixture();
  const block = input.units[0]!.blocks[0]!;
  block.tasks = Array.from({ length: 8 }, (_, i) => ({ slotId: i === 0 ? 'inspect' : `task-${i}`, taskId: `T${i + 1}`, module: i === 7 ? 'formative-workflow' : 'inspection', limitSeconds: i === 7 ? 600 : 240 }));
  const records: [TaskObservation['completion'], number | null, TaskObservation['endingReason'], boolean][] = [
    ['independent', 60, 'completed', false], ['partial', 240, 'time-limit', true],
    ['withdrawn', 30, 'withdrawn', false], ['technical-interruption', 20, 'technical-interruption', false],
    ['failed', 100, 'stopped-incomplete', false], ['assisted', null, 'completed', false],
    ['independent', 500, 'completed', false],
  ];
  input.taskObservations = records.map(([completion, elapsedSeconds, endingReason, censored], i) => ({ unitId: 'synthetic-unit-01', blockId: 'block-P', slotId: i === 0 ? 'inspect' : `task-${i === 6 ? 7 : i}`, completion, elapsedSeconds, endingReason, censored, firstCorrectEvidenceSeconds: i === 0 ? 12 : null, recoverySuccess: i === 0 ? true : null, recoverySeconds: i === 0 ? 8 : null }));
  return input;
}

test('synthetic analysis: inspection timing separates exact-limit censoring, early endings, absent timing, and formative workflow', async () => {
  const report = analyzeHci(await timingInput());
  const tasks = report.unitReports[0]!.blocks[0]!.tasks;
  assert.deepEqual([tasks.inspection.scheduled, tasks.inspection.observed, tasks.inspection.absentRows, tasks.inspection.elapsedMissing], [7, 6, 1, 2]);
  assert.equal(tasks.inspection.censoredCount, 1);
  assert.equal(tasks.inspection.timeoutCount, 1);
  assert.deepEqual(tasks.inspection.endingReasonCounts, { completed: 2, 'time-limit': 1, withdrawn: 1, 'technical-interruption': 1, 'stopped-incomplete': 1 });
  assert.deepEqual(tasks.inspection.completedTime, { count: 1, mean: 60, median: 60, min: 60, max: 60 });
  assert.deepEqual(tasks.inspection.activeTime, { count: 5, mean: 90, median: 60, min: 20, max: 240 });
  assert.equal(tasks.inspection.firstCorrectEvidenceTime.mean, 12);
  assert.equal(tasks.inspection.recovery.success, 1);
  assert.equal(tasks.inspection.recovery.unknown, 6);
  assert.equal(tasks.inspection.recovery.time.mean, 8);
  assert.equal(tasks.inspection.records.find(row => row.slotId === 'task-6')?.observation, null);
  assert.deepEqual(tasks.formativeWorkflow.completedTime, { count: 1, mean: 500, median: 500, min: 500, max: 500 });
});

test('synthetic analysis: JSON serialization contains only finite measurements and stable canonical input identity', async () => {
  const input = await fixture();
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
    return JSON.stringify(value);
  };
  const report = analyzeHci(input);
  assert.equal(report.inputSha256, createHash('sha256').update(canonical(input)).digest('hex'));
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(analyzeHci(reordered).inputSha256, report.inputSha256);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  const altered = structuredClone(input); altered.claimObservations[0]!.answer = 'no';
  assert.notEqual(analyzeHci(altered).inputSha256, report.inputSha256);
});

const invalidInputs: [string, (input: HciAnalysisInput) => void][] = [
  ['wrong synthetic label', input => { Object.assign(input, { classification: 'participant-results' }); }],
  ['wrong schema', input => { Object.assign(input, { schemaVersion: 2 }); }],
  ['unknown top-level property', input => { Object.assign(input, { privateNotes: 'forbidden-field' }); }],
  ['unknown nested property', input => { Object.assign(input.units[0]!, { actualParticipant: true }); }],
  ['duplicate unit', input => { input.units.push(structuredClone(input.units[0]!)); }],
  ['duplicate block', input => { input.units[0]!.blocks.push(structuredClone(input.units[0]!.blocks[0]!)); }],
  ['duplicate claim key', input => { input.claimKeys.push(structuredClone(input.claimKeys[0]!)); }],
  ['duplicate case claim identity', input => { input.claimKeys.push({ ...input.claimKeys[0]!, keyId: 'different-key' }); }],
  ['nonboolean key', input => { Object.assign(input.claimKeys[0]!, { supported: 'yes' }); }],
  ['wrong key case', input => { input.claimKeys[0]!.caseId = 'other-case'; }],
  ['wrong key claim', input => { input.claimKeys[0]!.claimId = 'other-claim'; }],
  ['unknown claim key', input => { input.units[0]!.blocks[0]!.claims[0]!.keyId = 'unknown'; }],
  ['duplicate claim slot', input => { input.units[0]!.blocks[0]!.claims.push(structuredClone(input.units[0]!.blocks[0]!.claims[0]!)); }],
  ['duplicate claim order', input => { input.units[0]!.blocks[0]!.claims[1]!.order = 1; }],
  ['unknown task binding', input => { input.units[0]!.blocks[0]!.claims[0]!.taskSlotId = 'unknown'; }],
  ['claim attached to formative task', input => { input.units[0]!.blocks[0]!.tasks[0]!.module = 'formative-workflow'; }],
  ['unknown observation unit', input => { input.claimObservations[0]!.unitId = 'unknown'; }],
  ['unknown observation block', input => { input.claimObservations[0]!.blockId = 'unknown'; }],
  ['unknown observation slot', input => { input.claimObservations[0]!.slotId = 'unknown'; }],
  ['duplicate claim observation', input => { input.claimObservations.push(structuredClone(input.claimObservations[0]!)); }],
  ['empty answer string', input => { Object.assign(input.claimObservations[0]!, { answer: '' }); }],
  ['unknown answer', input => { Object.assign(input.claimObservations[0]!, { answer: 'maybe' }); }],
  ['negative probability', input => { input.claimObservations[0]!.supportProbabilityPercent = -1; }],
  ['above-range probability', input => { input.claimObservations[0]!.supportProbabilityPercent = 101; }],
  ['nonfinite probability', input => { input.claimObservations[0]!.supportProbabilityPercent = Infinity; }],
  ['NaN probability', input => { input.claimObservations[0]!.supportProbabilityPercent = NaN; }],
  ['numeric string probability', input => { Object.assign(input.claimObservations[0]!, { supportProbabilityPercent: '80' }); }],
  ['absent nullable field', input => { Reflect.deleteProperty(input.claimObservations[0]!, 'answer'); }],
  ['invalid condition', input => { Object.assign(input.units[0]!.blocks[0]!, { condition: 'X' }); }],
  ['invalid case set', input => { Object.assign(input.units[0]!.blocks[0]!, { caseSet: 'C' }); }],
  ['invalid block order', input => { Object.assign(input.units[0]!.blocks[0]!, { order: 0 }); }],
  ['duplicate task slot', input => { input.units[0]!.blocks[0]!.tasks.push(structuredClone(input.units[0]!.blocks[0]!.tasks[0]!)); }],
  ['invalid task module', input => { Object.assign(input.units[0]!.blocks[0]!.tasks[0]!, { module: 'live' }); }],
  ['nonpositive timing limit', input => { input.units[0]!.blocks[0]!.tasks[0]!.limitSeconds = 0; }],
];
for (const [label, mutate] of invalidInputs) test(`synthetic analysis rejects ${label}`, async () => {
  const input = await fixture(); mutate(input);
  assert.throws(() => analyzeHci(input));
});

const invalidTimings: [string, (rows: TaskObservation[]) => void][] = [
  ['unknown task identity', rows => { rows[0]!.slotId = 'unknown'; }],
  ['duplicate task observation', rows => { rows.push(structuredClone(rows[0]!)); }],
  ['unknown completion', rows => { Object.assign(rows[0]!, { completion: 'success' }); }],
  ['unknown ending reason', rows => { Object.assign(rows[0]!, { endingReason: 'abort' }); }],
  ['early timeout', rows => { rows[1]!.elapsedSeconds = 239; }],
  ['unknown timeout elapsed', rows => { rows[1]!.elapsedSeconds = null; }],
  ['uncensored timeout', rows => { rows[1]!.censored = false; }],
  ['censored completed task', rows => { rows[0]!.censored = true; }],
  ['censored early withdrawal', rows => { rows[2]!.censored = true; }],
  ['completed partial task', rows => { rows[0]!.completion = 'partial'; }],
  ['stopped independent task', rows => { rows[4]!.completion = 'independent'; }],
  ['mismatched withdrawal completion', rows => { rows[2]!.completion = 'failed'; }],
  ['over-limit elapsed', rows => { rows[0]!.elapsedSeconds = 241; }],
  ['negative elapsed', rows => { rows[0]!.elapsedSeconds = -1; }],
  ['nonfinite elapsed', rows => { rows[0]!.elapsedSeconds = Infinity; }],
  ['stopped incomplete at limit', rows => { rows[4]!.elapsedSeconds = 240; }],
  ['first evidence after elapsed', rows => { rows[0]!.firstCorrectEvidenceSeconds = 61; }],
  ['evidence time without elapsed', rows => { rows[5]!.firstCorrectEvidenceSeconds = 1; }],
  ['recovery time without successful recovery', rows => { rows[0]!.recoverySuccess = false; }],
  ['recovery after elapsed', rows => { rows[0]!.recoverySeconds = 61; }],
];
for (const [label, mutate] of invalidTimings) test(`synthetic analysis rejects ${label}`, async () => {
  const input = await timingInput(); mutate(input.taskObservations);
  assert.throws(() => analyzeHci(input));
});

function cli(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/analyze-hci.ts', ...args], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' });
}
async function runDirectory(): Promise<string> {
  await mkdir('.repro-runs/hci-analysis', { recursive: true });
  return mkdtemp('.repro-runs/hci-analysis/independent-');
}

test('synthetic analysis CLI writes the actual report and refuses to overwrite an existing report', async () => {
  const root = await runDirectory(); const input = join(root, 'input.json'); const output = join(root, 'report.json');
  const data = await fixture(); await writeFile(input, JSON.stringify(data));
  const run = cli(['--input', input, '--output', output]);
  assert.equal(run.error, undefined); assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), analyzeHci(data));
  const original = await readFile(output, 'utf8');
  const repeated = cli(['--input', input, '--output', output]);
  assert.equal(repeated.status, 2); assert.equal(repeated.stdout, '');
  assert.equal(await readFile(output, 'utf8'), original);
});

for (const [label, text] of [['malformed JSON', '{broken'], ['valid JSON with invalid schema', '{"classification":"synthetic-analysis-test"}'], ['nonfinite JSON probability', '{"supportProbabilityPercent":1e309}']] as const) {
  test(`synthetic analysis CLI rejects ${label} without writing a partial report`, async () => {
    const root = await runDirectory(); const input = join(root, 'input.json'); const output = join(root, 'report.json');
    const raw = label === 'nonfinite JSON probability'
      ? JSON.stringify(await fixture()).replace('"supportProbabilityPercent":80', '"supportProbabilityPercent":1e309')
      : text;
    await writeFile(input, raw);
    const run = cli(['--input', input, '--output', output]);
    assert.equal(run.error, undefined); assert.equal(run.status, 2); assert.equal(run.stdout, '');
    const error = JSON.parse(run.stderr) as { category: string };
    assert.equal(error.category, 'input');
    await assert.rejects(access(output), { code: 'ENOENT' });
    assert.deepEqual(await readdir(root), ['input.json']);
  });
}

test('synthetic analysis CLI rejects unknown arguments and unsupported output locations', async () => {
  const root = await runDirectory(); const input = join(root, 'input.json'); await writeFile(input, JSON.stringify(await fixture()));
  for (const args of [[], ['--input', input], ['--input', input, '--output', join(root, 'report.json'), '--unexpected'], ['--input', input, '--output', 'research/hci/synthetic-analysis-test/forbidden-output.json']]) {
    const run = cli(args);
    assert.equal(run.error, undefined); assert.equal(run.status, 2); assert.equal(run.stdout, '');
    assert.equal((JSON.parse(run.stderr) as { category: string }).category, 'input');
  }
  await assert.rejects(access('research/hci/synthetic-analysis-test/forbidden-output.json'), { code: 'ENOENT' });
});

for (const position of ['top-level', 'nested escaped property'] as const) test(`synthetic analysis CLI rejects duplicate ${position} JSON fields`, async () => {
  const root = await runDirectory(); const input = join(root, 'input.json'); const output = join(root, 'report.json');
  let raw = JSON.stringify(await fixture());
  raw = position === 'top-level'
    ? raw.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')
    : raw.replace('"answer":"yes"', '"answer":"yes","\\u0061nswer":"yes"');
  // This is valid JSON syntax; the second spelling resolves to the same key.
  assert.doesNotThrow(() => JSON.parse(raw));
  await writeFile(input, raw);
  const run = cli(['--input', input, '--output', output]);
  assert.equal(run.error, undefined); assert.equal(run.status, 2); assert.equal(run.stdout, '');
  assert.equal((JSON.parse(run.stderr) as { category: string }).category, 'input');
  await assert.rejects(access(output), { code: 'ENOENT' });
});

for (const kind of ['sparse', 'extra-property', 'accessor'] as const) test(`synthetic analysis rejects direct-JavaScript ${kind} arrays without evaluating accessors`, async () => {
  const input = await fixture(); let reads = 0;
  if (kind === 'sparse') Reflect.deleteProperty(input.units, '0');
  if (kind === 'extra-property') Object.assign(input.units, { extra: 'not-JSON' });
  if (kind === 'accessor') {
    const unit = input.units[0];
    Object.defineProperty(input.units, '0', { get: () => { reads += 1; return unit; }, enumerable: true });
  }
  assert.throws(() => analyzeHci(input));
  assert.equal(reads, 0, 'validation must reject accessor descriptors without executing input code');
});

test('synthetic analysis CLI classifies invalid UTF-8 as input failure without a partial report', async () => {
  const root = await runDirectory(); const input = join(root, 'invalid-utf8.json'); const output = join(root, 'report.json');
  await writeFile(input, Buffer.from([0xff, 0xfe, 0x7b, 0x7d]));
  const run = cli(['--input', input, '--output', output]);
  assert.equal(run.error, undefined); assert.equal(run.status, 2); assert.equal(run.stdout, '');
  assert.equal((JSON.parse(run.stderr) as { category: string }).category, 'input');
  await assert.rejects(access(output), { code: 'ENOENT' });
  assert.deepEqual(await readdir(root), ['invalid-utf8.json']);
});
