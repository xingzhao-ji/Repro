import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Public offline analysis contract. Inputs declare synthetic test scope; labels do not authenticate provenance. */
export type Condition = 'P' | 'L';
export type Answer = 'yes' | 'no' | 'unsure';
export type Completion = 'independent' | 'assisted' | 'partial' | 'failed' | 'withdrawn' | 'technical-interruption';
export type EndingReason = 'completed' | 'time-limit' | 'withdrawn' | 'technical-interruption' | 'stopped-incomplete';
export interface TaskSlot { slotId: string; taskId: string; module: 'inspection' | 'formative-workflow'; limitSeconds: number }
export interface ClaimSlot { slotId: string; taskSlotId: string; claimId: string; keyId: string; order: number }
export interface HciBlock { blockId: string; condition: Condition; order: 1 | 2; caseSet: 'A' | 'B'; caseId: string; tasks: TaskSlot[]; claims: ClaimSlot[] }
export interface HciUnit { unitId: string; blocks: HciBlock[] }
export interface ClaimKey { keyId: string; caseId: string; claimId: string; supported: boolean }
export interface ClaimObservation { unitId: string; blockId: string; slotId: string; answer: Answer | null; supportProbabilityPercent: number | null }
export interface TaskObservation {
  unitId: string; blockId: string; slotId: string; completion: Completion;
  elapsedSeconds: number | null; censored: boolean; endingReason: EndingReason;
  firstCorrectEvidenceSeconds: number | null; recoverySuccess: boolean | null; recoverySeconds: number | null;
}
export interface HciAnalysisInput {
  schemaVersion: 1; classification: 'synthetic-analysis-test'; protocolVersion: string; keyVersion: string;
  units: HciUnit[]; claimKeys: ClaimKey[]; claimObservations: ClaimObservation[]; taskObservations: TaskObservation[];
}
export interface NumericSummary { count: number; mean: number | null; median: number | null; min: number | null; max: number | null }
export interface DecisionCounts { scheduled: number; answered: number; yes: number; no: number; unsure: number; missing: number }
export interface ProbabilityFrequency { percent: number; count: number }
export interface ClaimSummary {
  scheduled: number; observed: number; absentRows: number; blankAnswers: number; missingAnswers: number; missingProbabilities: number; probabilityWithoutAnswer: number;
  supported: DecisionCounts; unsupported: DecisionCounts;
  falseAcceptanceRate: number | null; falseRejectionRate: number | null; supportedWithheldRate: number | null; supportedAcceptanceRate: number | null;
  brier: { eligible: number; mean: number | null };
  judgmentConfidence: { correct: NumericSummary; incorrect: NumericSummary; unsureProbability: NumericSummary };
  supportProbabilityDistribution: { supported: ProbabilityFrequency[]; unsupported: ProbabilityFrequency[] };
  supportProbabilityByAnswer: { supported: Record<Answer | 'blank', ProbabilityFrequency[]>; unsupported: Record<Answer | 'blank', ProbabilityFrequency[]> };
}
export interface TaskRecord { slotId: string; taskId: string; limitSeconds: number; observation: TaskObservation | null }
export interface TaskSummary {
  scheduled: number; observed: number; absentRows: number; completionCounts: Record<Completion, number>; elapsedMissing: number;
  censoredCount: number; timeoutCount: number; endingReasonCounts: Record<EndingReason, number>;
  completedTime: NumericSummary; activeTime: NumericSummary; firstCorrectEvidenceTime: NumericSummary;
  recovery: { success: number; failure: number; unknown: number; time: NumericSummary }; records: TaskRecord[];
}
export interface BlockReport {
  blockId: string; condition: Condition; order: 1 | 2; caseSet: 'A' | 'B'; caseId: string;
  claims: ClaimSummary; tasks: { inspection: TaskSummary; formativeWorkflow: TaskSummary };
}
export type MetricName = 'falseAcceptanceRate' | 'falseRejectionRate' | 'supportedWithheldRate' | 'supportedAcceptanceRate' | 'brierMean';
export type MetricDistributions = Record<MetricName, NumericSummary>;
export interface PairedMetric {
  pairedCount: number; differences: { unitId: string; P: number; L: number; difference: number }[];
  unpaired: { unitId: string; reason: 'missing-P' | 'missing-L' | 'missing-both' }[]; summary: NumericSummary;
}
export interface HciAnalysisReport {
  schemaVersion: 1; classification: 'synthetic-analysis-test'; scope: 'offline-instrument-test';
  provenanceNotice: string; inputSha256: string; protocolVersion: string; keyVersion: string;
  unitReports: { unitId: string; blocks: BlockReport[] }[];
  byCondition: { condition: Condition; unitCount: number; metrics: MetricDistributions }[];
  byItem: { condition: Condition; caseId: string; claimId: string; claims: ClaimSummary }[];
  byBlockOrder: { condition: Condition; order: 1 | 2; unitCount: number; metrics: MetricDistributions }[];
  paired: Record<MetricName, PairedMetric>;
}

const completions: Completion[] = ['independent', 'assisted', 'partial', 'failed', 'withdrawn', 'technical-interruption'];
const endings: EndingReason[] = ['completed', 'time-limit', 'withdrawn', 'technical-interruption', 'stopped-incomplete'];
const metrics: MetricName[] = ['falseAcceptanceRate', 'falseRejectionRate', 'supportedWithheldRate', 'supportedAcceptanceRate', 'brierMean'];
const conditions: Condition[] = ['P', 'L'];
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SLOTS = 100_000;
const reportRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.repro-runs', 'hci-analysis');

export class HciAnalysisError extends Error {
  readonly category: 'input' | 'environment';
  readonly code: string;
  constructor(message: string, category: 'input' | 'environment' = 'input', code = 'HCI_ANALYSIS_INPUT', options?: ErrorOptions) {
    super(message, options); this.name = 'HciAnalysisError'; this.category = category; this.code = code;
  }
}
function invalid(path: string, message: string): never { throw new HciAnalysisError(`${path}: ${message}`); }
function record(value: unknown, path: string, fields: string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'expected an object');
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) invalid(path, 'expected a plain object');
  if (Object.getOwnPropertySymbols(value).length > 0) invalid(path, 'symbol properties are unsupported');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) {
    if (!fields.includes(key)) invalid(path, 'unknown field');
    const descriptor = descriptors[key];
    if (descriptor && (!('value' in descriptor) || !descriptor.enumerable)) invalid(path, 'non-data properties are unsupported');
  }
  for (const field of fields) if (!Object.hasOwn(value, field)) invalid(`${path}.${field}`, 'required field missing');
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid(path, `expected an array with at most ${max} entries`);
  if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0 || Object.getOwnPropertyNames(value).length !== value.length + 1) invalid(path, 'expected an ordinary dense array');
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid(path, 'sparse arrays, accessors or extra array properties are unsupported');
  }
  return value;
}
function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) invalid(path, 'expected a bounded identifier');
  return value;
}
function enumeration<T extends string>(value: unknown, choices: readonly T[], path: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) invalid(path, 'unsupported value');
  return value as T;
}
function number(value: unknown, path: string, min = 0, max = 86400): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(path, 'expected a finite number in range');
  return value;
}
function nullableNumber(value: unknown, path: string, max = 86400): number | null { return value === null ? null : number(value, path, 0, max); }
function bool(value: unknown, path: string): boolean { if (typeof value !== 'boolean') invalid(path, 'expected a boolean'); return value; }
function unique(seen: Set<string | number>, value: string | number, path: string): void {
  if (seen.has(value)) invalid(path, 'duplicate identity or order'); seen.add(value);
}
function address(unitId: string, blockId: string, slotId: string): string { return JSON.stringify([unitId, blockId, slotId]); }
interface ScheduledClaim { unitId: string; block: HciBlock; slot: ClaimSlot; supported: boolean }
interface ScheduledTask { unitId: string; block: HciBlock; slot: TaskSlot }
interface Validated { input: HciAnalysisInput; claims: Map<string, ScheduledClaim>; tasks: Map<string, ScheduledTask> }

function validate(input: unknown): Validated {
  const root = record(input, '$', ['schemaVersion', 'classification', 'protocolVersion', 'keyVersion', 'units', 'claimKeys', 'claimObservations', 'taskObservations']);
  if (root['schemaVersion'] !== 1) invalid('$.schemaVersion', 'unsupported version');
  if (root['classification'] !== 'synthetic-analysis-test') invalid('$.classification', 'only declared synthetic-analysis-test input is supported');
  id(root['protocolVersion'], '$.protocolVersion'); id(root['keyVersion'], '$.keyVersion');
  const keys = new Map<string, ClaimKey>(); const caseClaims = new Set<string | number>();
  array(root['claimKeys'], '$.claimKeys', MAX_SLOTS).forEach((value, index) => {
    const path = `$.claimKeys[${index}]`; const key = record(value, path, ['keyId', 'caseId', 'claimId', 'supported']);
    const keyId = id(key['keyId'], `${path}.keyId`); const caseId = id(key['caseId'], `${path}.caseId`); const claimId = id(key['claimId'], `${path}.claimId`);
    if (keys.has(keyId)) invalid(path, 'duplicate keyId');
    unique(caseClaims, JSON.stringify([caseId, claimId]), path);
    keys.set(keyId, { keyId, caseId, claimId, supported: bool(key['supported'], `${path}.supported`) });
  });
  const claims = new Map<string, ScheduledClaim>(); const tasks = new Map<string, ScheduledTask>(); const unitIds = new Set<string | number>();
  array(root['units'], '$.units', 1000).forEach((value, ui) => {
    const path = `$.units[${ui}]`; const unit = record(value, path, ['unitId', 'blocks']); const unitId = id(unit['unitId'], `${path}.unitId`); unique(unitIds, unitId, path);
    const blockValues = array(unit['blocks'], `${path}.blocks`, 2); if (blockValues.length === 0) invalid(`${path}.blocks`, 'at least one planned block is required');
    const blockIds = new Set<string | number>(); const usedConditions = new Set<string | number>(); const orders = new Set<string | number>(); const sets = new Set<string | number>();
    blockValues.forEach((blockValue, bi) => {
      const bp = `${path}.blocks[${bi}]`; const blockRecord = record(blockValue, bp, ['blockId', 'condition', 'order', 'caseSet', 'caseId', 'tasks', 'claims']);
      const blockId = id(blockRecord['blockId'], `${bp}.blockId`); unique(blockIds, blockId, bp);
      unique(usedConditions, enumeration(blockRecord['condition'], conditions, `${bp}.condition`), bp);
      if (blockRecord['order'] !== 1 && blockRecord['order'] !== 2) invalid(`${bp}.order`, 'expected block order 1 or 2'); unique(orders, blockRecord['order'], bp);
      unique(sets, enumeration(blockRecord['caseSet'], ['A', 'B'], `${bp}.caseSet`), bp); id(blockRecord['caseId'], `${bp}.caseId`);
      const block = blockValue as HciBlock; const taskIds = new Set<string | number>(); const taskNames = new Set<string | number>();
      array(blockRecord['tasks'], `${bp}.tasks`, 1000).forEach((taskValue, ti) => {
        const tp = `${bp}.tasks[${ti}]`; const task = record(taskValue, tp, ['slotId', 'taskId', 'module', 'limitSeconds']);
        const slotId = id(task['slotId'], `${tp}.slotId`); unique(taskIds, slotId, tp); unique(taskNames, id(task['taskId'], `${tp}.taskId`), tp);
        enumeration(task['module'], ['inspection', 'formative-workflow'], `${tp}.module`);
        if (number(task['limitSeconds'], `${tp}.limitSeconds`) === 0) invalid(`${tp}.limitSeconds`, 'limit must be positive');
        tasks.set(address(unitId, blockId, slotId), { unitId, block, slot: taskValue as TaskSlot });
      });
      const slotIds = new Set<string | number>(); const claimNames = new Set<string | number>(); const claimOrders = new Set<string | number>();
      array(blockRecord['claims'], `${bp}.claims`, 1000).forEach((claimValue, ci) => {
        const cp = `${bp}.claims[${ci}]`; const claim = record(claimValue, cp, ['slotId', 'taskSlotId', 'claimId', 'keyId', 'order']);
        const slotId = id(claim['slotId'], `${cp}.slotId`); unique(slotIds, slotId, cp); unique(claimNames, id(claim['claimId'], `${cp}.claimId`), cp);
        const order = number(claim['order'], `${cp}.order`, 1, 1_000_000); if (!Number.isSafeInteger(order)) invalid(`${cp}.order`, 'expected an integer'); unique(claimOrders, order, cp);
        const task = tasks.get(address(unitId, blockId, id(claim['taskSlotId'], `${cp}.taskSlotId`)));
        if (!task || task.slot.module !== 'inspection') invalid(cp, 'claim must reference a scheduled inspection task');
        const key = keys.get(id(claim['keyId'], `${cp}.keyId`));
        if (!key || key.caseId !== block.caseId || key.claimId !== claim['claimId']) invalid(cp, 'claim key missing or conflicts with scheduled case/claim');
        claims.set(address(unitId, blockId, slotId), { unitId, block, slot: claimValue as ClaimSlot, supported: key.supported });
      });
      if (tasks.size + claims.size > MAX_SLOTS) invalid('$.units', 'scheduled slot limit exceeded');
    });
  });
  const seenClaims = new Set<string | number>();
  array(root['claimObservations'], '$.claimObservations', MAX_SLOTS).forEach((value, index) => {
    const path = `$.claimObservations[${index}]`; const obs = record(value, path, ['unitId', 'blockId', 'slotId', 'answer', 'supportProbabilityPercent']);
    const key = observationAddress(obs, path); unique(seenClaims, key, path); if (!claims.has(key)) invalid(path, 'unknown scheduled claim slot');
    if (obs['answer'] !== null) enumeration(obs['answer'], ['yes', 'no', 'unsure'], `${path}.answer`);
    nullableNumber(obs['supportProbabilityPercent'], `${path}.supportProbabilityPercent`, 100);
  });
  const seenTasks = new Set<string | number>();
  array(root['taskObservations'], '$.taskObservations', MAX_SLOTS).forEach((value, index) => {
    const path = `$.taskObservations[${index}]`; const obs = record(value, path, ['unitId', 'blockId', 'slotId', 'completion', 'elapsedSeconds', 'censored', 'endingReason', 'firstCorrectEvidenceSeconds', 'recoverySuccess', 'recoverySeconds']);
    const key = observationAddress(obs, path); unique(seenTasks, key, path); const task = tasks.get(key); if (!task) invalid(path, 'unknown scheduled task slot');
    const completion = enumeration(obs['completion'], completions, `${path}.completion`); const ending = enumeration(obs['endingReason'], endings, `${path}.endingReason`);
    const censored = bool(obs['censored'], `${path}.censored`); if (censored !== (ending === 'time-limit')) invalid(path, 'censored must identify administrative time-limit only');
    const elapsed = nullableNumber(obs['elapsedSeconds'], `${path}.elapsedSeconds`, task.slot.limitSeconds);
    const complete = completion === 'independent' || completion === 'assisted';
    if (complete !== (ending === 'completed') || (completion === 'withdrawn') !== (ending === 'withdrawn') || (completion === 'technical-interruption') !== (ending === 'technical-interruption')) invalid(path, 'completion and endingReason conflict');
    if (ending === 'time-limit' && elapsed !== task.slot.limitSeconds) invalid(path, 'time-limit requires elapsedSeconds equal to frozen limit');
    if (ending === 'stopped-incomplete' && elapsed !== null && elapsed >= task.slot.limitSeconds) invalid(path, 'early incomplete stop must precede limit');
    const first = nullableNumber(obs['firstCorrectEvidenceSeconds'], `${path}.firstCorrectEvidenceSeconds`, task.slot.limitSeconds);
    const recovery = nullableNumber(obs['recoverySeconds'], `${path}.recoverySeconds`, task.slot.limitSeconds);
    if (obs['recoverySuccess'] !== null) bool(obs['recoverySuccess'], `${path}.recoverySuccess`);
    if (recovery !== null && obs['recoverySuccess'] !== true) invalid(path, 'recovery event time requires observed recovery success');
    if ((first !== null && (elapsed === null || first > elapsed)) || (recovery !== null && (elapsed === null || recovery > elapsed))) invalid(path, 'event time must fit measured active time');
  });
  return { input: input as HciAnalysisInput, claims, tasks };
}
function observationAddress(obs: Record<string, unknown>, path: string): string {
  return address(id(obs['unitId'], `${path}.unitId`), id(obs['blockId'], `${path}.blockId`), id(obs['slotId'], `${path}.slotId`));
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map(key => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function numeric(values: number[]): NumericSummary {
  const sorted = [...values].sort((a, b) => a - b); const count = sorted.length;
  if (count === 0) return { count: 0, mean: null, median: null, min: null, max: null };
  const middle = Math.floor(count / 2); const upper = sorted[middle] ?? 0;
  return { count, mean: sorted.reduce((sum, v) => sum + v, 0) / count, median: count % 2 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2, min: sorted[0] ?? null, max: sorted[count - 1] ?? null };
}
function frequency(values: number[]): ProbabilityFrequency[] {
  const counts = new Map<number, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a - b).map(([percent, count]) => ({ percent, count }));
}
function decisions(): DecisionCounts { return { scheduled: 0, answered: 0, yes: 0, no: 0, unsure: 0, missing: 0 }; }
function ratio(numerator: number, denominator: number): number | null { return denominator === 0 ? null : numerator / denominator; }
function probabilityGroups(): Record<Answer | 'blank', number[]> { return { yes: [], no: [], unsure: [], blank: [] }; }
function frequencyGroups(groups: Record<Answer | 'blank', number[]>): Record<Answer | 'blank', ProbabilityFrequency[]> {
  return { yes: frequency(groups.yes), no: frequency(groups.no), unsure: frequency(groups.unsure), blank: frequency(groups.blank) };
}
function summarizeClaims(slots: ScheduledClaim[], observations: Map<string, ClaimObservation>): ClaimSummary {
  const supported = decisions(); const unsupported = decisions(); const brier: number[] = []; const correct: number[] = []; const incorrect: number[] = []; const unsure: number[] = [];
  const probabilities = { supported: [] as number[], unsupported: [] as number[] }; const byAnswer = { supported: probabilityGroups(), unsupported: probabilityGroups() };
  let observed = 0; let blankAnswers = 0; let missingProbabilities = 0; let probabilityWithoutAnswer = 0;
  for (const scheduled of slots) {
    const obs = observations.get(address(scheduled.unitId, scheduled.block.blockId, scheduled.slot.slotId)); const side = scheduled.supported ? 'supported' : 'unsupported'; const counts = scheduled.supported ? supported : unsupported; counts.scheduled++;
    if (obs) observed++;
    if (obs?.answer === null) blankAnswers++;
    if (obs?.answer == null) counts.missing++; else { counts.answered++; counts[obs.answer]++; }
    const percent = obs?.supportProbabilityPercent;
    if (percent == null) { missingProbabilities++; continue; }
    probabilities[side].push(percent); byAnswer[side][obs?.answer ?? 'blank'].push(percent);
    if (obs?.answer == null) { probabilityWithoutAnswer++; continue; }
    const p = percent / 100; const y = scheduled.supported ? 1 : 0; brier.push((p - y) ** 2);
    if (obs.answer === 'unsure') unsure.push(percent);
    else { const confidence = obs.answer === 'yes' ? percent : 100 - percent; ((obs.answer === 'yes') === scheduled.supported ? correct : incorrect).push(confidence); }
  }
  const absentRows = slots.length - observed;
  return {
    scheduled: slots.length, observed, absentRows, blankAnswers, missingAnswers: absentRows + blankAnswers, missingProbabilities, probabilityWithoutAnswer,
    supported, unsupported, falseAcceptanceRate: ratio(unsupported.yes, unsupported.answered), falseRejectionRate: ratio(supported.no, supported.answered), supportedWithheldRate: ratio(supported.unsure, supported.answered), supportedAcceptanceRate: ratio(supported.yes, supported.answered),
    brier: { eligible: brier.length, mean: numeric(brier).mean }, judgmentConfidence: { correct: numeric(correct), incorrect: numeric(incorrect), unsureProbability: numeric(unsure) },
    supportProbabilityDistribution: { supported: frequency(probabilities.supported), unsupported: frequency(probabilities.unsupported) },
    supportProbabilityByAnswer: { supported: frequencyGroups(byAnswer.supported), unsupported: frequencyGroups(byAnswer.unsupported) },
  };
}
function summarizeTasks(slots: ScheduledTask[], observations: Map<string, TaskObservation>): TaskSummary {
  const completionCounts = Object.fromEntries(completions.map(c => [c, 0])) as Record<Completion, number>;
  const endingReasonCounts = Object.fromEntries(endings.map(e => [e, 0])) as Record<EndingReason, number>;
  const completed: number[] = []; const active: number[] = []; const first: number[] = []; const recovery: number[] = []; const records: TaskRecord[] = [];
  let observed = 0; let elapsedMissing = 0; let censoredCount = 0; let success = 0; let failure = 0; let unknown = 0;
  for (const scheduled of slots) {
    const obs = observations.get(address(scheduled.unitId, scheduled.block.blockId, scheduled.slot.slotId));
    records.push({ slotId: scheduled.slot.slotId, taskId: scheduled.slot.taskId, limitSeconds: scheduled.slot.limitSeconds, observation: obs ? { ...obs } : null });
    if (!obs) { elapsedMissing++; unknown++; continue; }
    observed++; completionCounts[obs.completion]++; endingReasonCounts[obs.endingReason]++; if (obs.censored) censoredCount++;
    if (obs.elapsedSeconds === null) elapsedMissing++; else { active.push(obs.elapsedSeconds); if (obs.endingReason === 'completed') completed.push(obs.elapsedSeconds); }
    if (obs.firstCorrectEvidenceSeconds !== null) first.push(obs.firstCorrectEvidenceSeconds);
    if (obs.recoverySuccess === true) success++; else if (obs.recoverySuccess === false) failure++; else unknown++;
    if (obs.recoverySeconds !== null) recovery.push(obs.recoverySeconds);
  }
  return { scheduled: slots.length, observed, absentRows: slots.length - observed, completionCounts, elapsedMissing, censoredCount, timeoutCount: endingReasonCounts['time-limit'], endingReasonCounts, completedTime: numeric(completed), activeTime: numeric(active), firstCorrectEvidenceTime: numeric(first), recovery: { success, failure, unknown, time: numeric(recovery) }, records };
}
function metricValue(claims: ClaimSummary, metric: MetricName): number | null { return metric === 'brierMean' ? claims.brier.mean : claims[metric]; }
function distributions(blocks: BlockReport[]): MetricDistributions {
  return Object.fromEntries(metrics.map(metric => [metric, numeric(blocks.flatMap(block => { const value = metricValue(block.claims, metric); return value === null ? [] : [value]; }))])) as MetricDistributions;
}

/** Analyze declared synthetic test input only; this function neither proves provenance nor authorizes data collection. */
export function analyzeHci(input: unknown): HciAnalysisReport {
  const validated = validate(input); const data = validated.input;
  const claimObservations = new Map(data.claimObservations.map(obs => [address(obs.unitId, obs.blockId, obs.slotId), obs]));
  const taskObservations = new Map(data.taskObservations.map(obs => [address(obs.unitId, obs.blockId, obs.slotId), obs]));
  const allClaims = [...validated.claims.values()]; const allTasks = [...validated.tasks.values()];
  const unitReports = data.units.map(unit => ({ unitId: unit.unitId, blocks: unit.blocks.map(block => {
    const claims = allClaims.filter(slot => slot.unitId === unit.unitId && slot.block === block); const tasks = allTasks.filter(slot => slot.unitId === unit.unitId && slot.block === block);
    return { blockId: block.blockId, condition: block.condition, order: block.order, caseSet: block.caseSet, caseId: block.caseId, claims: summarizeClaims(claims, claimObservations), tasks: { inspection: summarizeTasks(tasks.filter(t => t.slot.module === 'inspection'), taskObservations), formativeWorkflow: summarizeTasks(tasks.filter(t => t.slot.module === 'formative-workflow'), taskObservations) } };
  }) }));
  const allBlocks = unitReports.flatMap(unit => unit.blocks);
  const byCondition = conditions.map(condition => { const blocks = allBlocks.filter(block => block.condition === condition); return { condition, unitCount: blocks.length, metrics: distributions(blocks) }; });
  const byBlockOrder = conditions.flatMap(condition => ([1, 2] as const).map(order => { const blocks = allBlocks.filter(block => block.condition === condition && block.order === order); return { condition, order, unitCount: blocks.length, metrics: distributions(blocks) }; }));
  const itemGroups = new Map<string, ScheduledClaim[]>();
  for (const claim of allClaims) { const key = JSON.stringify([claim.block.condition, claim.block.caseId, claim.slot.claimId]); const group = itemGroups.get(key) ?? []; group.push(claim); itemGroups.set(key, group); }
  const byItem = [...itemGroups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, group]) => {
    const first = group[0]; if (!first) throw new HciAnalysisError('Internal empty item group', 'environment');
    return { condition: first.block.condition, caseId: first.block.caseId, claimId: first.slot.claimId, claims: summarizeClaims(group, claimObservations) };
  });
  const paired = Object.fromEntries(metrics.map(metric => {
    const differences: PairedMetric['differences'] = []; const unpaired: PairedMetric['unpaired'] = [];
    for (const unit of unitReports) {
      const p = unit.blocks.find(block => block.condition === 'P'); const l = unit.blocks.find(block => block.condition === 'L');
      const P = p ? metricValue(p.claims, metric) : null; const L = l ? metricValue(l.claims, metric) : null;
      if (P === null || L === null) unpaired.push({ unitId: unit.unitId, reason: P === null && L === null ? 'missing-both' : P === null ? 'missing-P' : 'missing-L' });
      else differences.push({ unitId: unit.unitId, P, L, difference: P - L });
    }
    return [metric, { pairedCount: differences.length, differences, unpaired, summary: numeric(differences.map(row => row.difference)) }];
  })) as Record<MetricName, PairedMetric>;
  return { schemaVersion: 1, classification: 'synthetic-analysis-test', scope: 'offline-instrument-test', provenanceNotice: 'Input declares nonparticipant synthetic analysis-test scope. This label and digest do not authenticate data origin. These descriptive instrument-test outputs establish no human-study result or interface effectiveness.', inputSha256: createHash('sha256').update(canonical(data), 'utf8').digest('hex'), protocolVersion: data.protocolVersion, keyVersion: data.keyVersion, unitReports, byCondition, byItem, byBlockOrder, paired };
}

function parseArguments(args: string[]): { input: string; output: string } {
  const values = new Map<string, string>();
  if (args.length !== 4) throw new HciAnalysisError('Usage: analyze-hci.ts --input <normalized.json> --output <new-report.json>', 'input', 'HCI_ANALYSIS_USAGE');
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]; const value = args[i + 1];
    if ((flag !== '--input' && flag !== '--output') || !value || value.startsWith('--') || values.has(flag)) throw new HciAnalysisError('Expected unique --input and --output arguments', 'input', 'HCI_ANALYSIS_USAGE');
    values.set(flag, value);
  }
  const input = values.get('--input'); const output = values.get('--output');
  if (!input || !output) throw new HciAnalysisError('Both --input and --output are required', 'input', 'HCI_ANALYSIS_USAGE');
  return { input: resolve(input), output: resolve(output) };
}
async function regularInput(path: string): Promise<string> {
  const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_FILE_BYTES) throw new HciAnalysisError('Input must be a bounded single-link regular file');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const current = await file.stat(); if (!current.isFile() || current.nlink !== 1 || current.size > MAX_FILE_BYTES) throw new HciAnalysisError('Input file changed or exceeds bounds'); const contents = await file.readFile(); if (contents.length > MAX_FILE_BYTES) throw new HciAnalysisError('Input file exceeds bounds'); try { return new TextDecoder('utf-8', { fatal: true }).decode(contents); } catch (cause) { throw new HciAnalysisError('Input is not valid UTF-8', 'input', 'HCI_ANALYSIS_INPUT', { cause }); } } finally { await file.close(); }
}
async function prepareOutput(path: string): Promise<void> {
  const rel = relative(reportRoot, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new HciAnalysisError('Output must be a new file under .repro-runs/hci-analysis/');
  const parent = dirname(path); const parsedRoot = resolve(sep); const components = relative(parsedRoot, parent).split(sep); let current = parsedRoot;
  for (const component of components) {
    current = join(current, component);
    try { const info = await lstat(current); if (!info.isDirectory() || info.isSymbolicLink()) throw new HciAnalysisError('Output ancestors must be ordinary directories'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await mkdir(current, { mode: 0o700 }); }
  }
  try { await lstat(path); throw new HciAnalysisError('Output already exists; refusing to overwrite it'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
async function writeReport(path: string, report: HciAnalysisReport): Promise<void> {
  await prepareOutput(path); const partial = join(dirname(path), `.hci-analysis-${randomUUID()}.partial`);
  try {
    const file = await open(partial, 'wx', 0o600); try { await file.writeFile(JSON.stringify(report, null, 2) + '\n', 'utf8'); await file.sync(); } finally { await file.close(); }
    await link(partial, path);
  } finally { await unlink(partial).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }); }
}
/** JSON syntax is validated first; this token walk only detects fields JSON.parse would silently overwrite. */
function rejectDuplicateJsonFields(text: string): void {
  const stack: ({ kind: 'object'; keys: Set<string>; keyExpected: boolean } | { kind: 'array' })[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '{') stack.push({ kind: 'object', keys: new Set(), keyExpected: true });
    else if (char === '[') stack.push({ kind: 'array' });
    else if (char === '}' || char === ']') stack.pop();
    else if (char === ',') { const frame = stack.at(-1); if (frame?.kind === 'object') frame.keyExpected = true; }
    else if (char === '"') {
      const start = i;
      for (i++; i < text.length; i++) { if (text[i] === '\\') i++; else if (text[i] === '"') break; }
      const frame = stack.at(-1);
      if (frame?.kind === 'object' && frame.keyExpected) {
        const key = JSON.parse(text.slice(start, i + 1)) as string;
        if (frame.keys.has(key)) throw new HciAnalysisError('Input JSON contains a duplicate object field');
        frame.keys.add(key); frame.keyExpected = false;
      }
    }
  }
}
async function main(): Promise<void> {
  try {
    const args = parseArguments(process.argv.slice(2)); const text = await regularInput(args.input); let input: unknown;
    try { input = JSON.parse(text) as unknown; } catch (cause) { throw new HciAnalysisError('Input is not valid JSON', 'input', 'HCI_ANALYSIS_INPUT', { cause }); }
    rejectDuplicateJsonFields(text);
    const report = analyzeHci(input); await writeReport(args.output, report);
    process.stdout.write(JSON.stringify({ status: 'written', classification: report.classification, scope: report.scope, inputSha256: report.inputSha256 }) + '\n');
  } catch (error) {
    const diagnostic = error instanceof HciAnalysisError ? error : new HciAnalysisError('Analysis file operation failed', 'environment', 'HCI_ANALYSIS_IO', { cause: error });
    process.stderr.write(JSON.stringify({ status: 'error', category: diagnostic.category, code: diagnostic.code, message: diagnostic.message }) + '\n');
    process.exitCode = diagnostic.category === 'input' ? 2 : 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
