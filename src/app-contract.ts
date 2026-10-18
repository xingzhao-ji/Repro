import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ReproError, VERSION, type AppObservation, type AppResolution, type ManifestV4, type AppAction, type AppCheck } from './contracts.js';
import { canonicalJson, digest } from './manifest.js';
import { MAX_CHECKS, MAX_STEPS, type AppTarget, type TargetReference, type DraftAction, type DraftCheck } from './steps.js';

export const APP_ADAPTER = 'local-web-app-v1';
export const APP_ISOLATION = 'user-owned local web app; fresh owned browser profile; Chromium sandbox enabled; non-loopback network blocked; app process group owned by Repro; not a hostile-code sandbox';
// Bound to the shipped executable bundle when built, or this module in source mode.
export const APP_CONTRACT_ARTIFACT_DIGEST = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const STRATEGIES = ['role', 'label', 'placeholder', 'text', 'testid', 'css', 'title', 'alt'] as const;
export const ROLES = ['button', 'link', 'checkbox', 'radio', 'textbox', 'searchbox', 'combobox', 'listbox', 'option', 'tab', 'menuitem', 'heading', 'switch', 'slider', 'spinbutton', 'status', 'alert', 'dialog', 'cell', 'row', 'listitem', 'img', 'region', 'navigation', 'article'] as const;
const KINDS = ['navigate', 'reload', 'click', 'dblclick', 'fill', 'press', 'check', 'uncheck', 'select', 'hover', 'wait-for'] as const;
const TARGETED = new Set(['click', 'dblclick', 'fill', 'check', 'uncheck', 'select', 'hover', 'wait-for']);
const PROPERTIES = ['text', 'value', 'checked', 'visible', 'count', 'url', 'page-errors'] as const;
const COMPARISONS = ['equals', 'contains', 'not-equals', 'not-contains'] as const;
/** Control characters other than tab, newline and carriage return. */
const hasControl = (value: string) => [...value].some(character => { const code = character.charCodeAt(0); return code === 127 || code < 32 && code !== 9 && code !== 10 && code !== 13; });
const SECRET_NAME = /^REPRO_(?:SECRET|INPUT)_\d{1,2}$/;
export const MAX_VALUE = 2000;
export const MAX_OBSERVED = 8192;

function invalid(code: string, message: string): never { throw new ReproError('input', code, message); }
function fields(value: unknown, required: readonly string[], code = 'APP_MANIFEST_FIELDS'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(code, 'Expected an object in the local-app manifest.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== required.length || Object.keys(record).some(key => !required.includes(key))) invalid(code, 'The local-app manifest contains missing or unapproved fields.');
  return record;
}
function text(value: unknown, maximum: number, code: string, allowEmpty = true): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.length) || hasControl(value)) invalid(code, 'A local-app manifest text value is missing, too long or contains control characters.');
}
function oneOf<T extends string>(value: unknown, options: readonly T[], code: string): asserts value is T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) invalid(code, 'A local-app manifest value is outside its supported vocabulary.');
}
function integer(value: unknown, minimum: number, maximum: number): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid('APP_MANIFEST_LIMIT', 'A local-app manifest number is outside its supported bounds.');
}
export function validTarget(value: unknown): AppTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('APP_TARGET', 'A step target must be an object.');
  const target = value as Record<string, unknown>;
  const keys = Object.keys(target).sort();
  if (!(keys.join() === 'by,value' || keys.join() === 'by,role,value')) invalid('APP_TARGET', 'A step target has unsupported fields.');
  oneOf(target['by'], STRATEGIES, 'APP_TARGET');
  text(target['value'], 512, 'APP_TARGET', false);
  if (target['by'] === 'role') oneOf(target['role'], ROLES, 'APP_TARGET_ROLE');
  else if ('role' in target) invalid('APP_TARGET', 'Only role targets name a role.');
  return target as unknown as AppTarget;
}
export function validReference(value: unknown): TargetReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('APP_REFERENCE', 'A step reference must be an object.');
  const reference = value as Record<string, unknown>;
  const keys = Object.keys(reference);
  if (!keys.length || keys.some(key => !['text', 'kind', 'css', 'testid'].includes(key))) invalid('APP_REFERENCE', 'A step reference has unsupported fields.');
  for (const key of ['text', 'css', 'testid'] as const) if (key in reference) text(reference[key], 512, 'APP_REFERENCE', false);
  if ('kind' in reference) oneOf(reference['kind'], ['button', 'link', 'checkbox', 'radio', 'field', 'tab', 'menuitem', 'option', 'heading', 'combobox', 'element'], 'APP_REFERENCE');
  if ([reference['text'], reference['css'], reference['testid']].filter(item => item !== undefined).length !== 1) invalid('APP_REFERENCE', 'A step reference names exactly one of text, CSS or test id.');
  return reference as TargetReference;
}
function navigationPath(value: string): void {
  if (!value.startsWith('/') || value.startsWith('//') || /\s/.test(value) || value.length > 512) invalid('APP_NAVIGATION', 'Navigation stays inside the local app: use a path such as /cart.');
}

export function appAssertionDigest(expectation: ManifestV4['expectation'], failure: ManifestV4['failure']): string {
  return digest({ expectation, failure });
}

/** Data validation only. A schema-4 manifest names no executable, folder or command. */
export function validateAppManifest(input: unknown): ManifestV4 {
  const encoded = canonicalJson(input);
  if (Buffer.byteLength(encoded) > 65_536) invalid('MANIFEST_SIZE', 'Manifest exceeds 64 KiB.');
  const value: unknown = JSON.parse(encoded);
  const manifest = fields(value, ['schemaVersion', 'id', 'classification', 'adapter', 'runnerVersion', 'resolution', 'expectation', 'assertionDigest', 'expectationBasis', 'humanApproval', 'failure', 'actions', 'responses', 'environment', 'boundary', 'app']);
  if (manifest['schemaVersion'] !== 4) invalid('SCHEMA_VERSION', 'Expected manifest schema version 4.');
  if (typeof manifest['id'] !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest['id'])) invalid('APP_MANIFEST_ID', 'The report identifier must be a short lowercase slug.');
  if (manifest['classification'] !== 'user-local-application') invalid('APP_MANIFEST_VALUE', 'Schema 4 describes a user-owned local application.');
  const adapter = fields(manifest['adapter'], ['id', 'version']);
  if (adapter['id'] !== APP_ADAPTER || adapter['version'] !== VERSION || manifest['runnerVersion'] !== VERSION) throw new ReproError('unsupported', 'IMPLEMENTATION_VERSION', 'The local-app adapter or runner version is unavailable.');
  oneOf(manifest['resolution'], ['draft', 'resolved'], 'APP_RESOLUTION');
  const resolved = manifest['resolution'] === 'resolved';
  const expectation = fields(manifest['expectation'], ['invariantId', 'description', 'checks']);
  if (expectation['invariantId'] !== 'REPORTED_EXPECTATION') invalid('APP_EXPECTATION', 'Unsupported expectation identifier.');
  text(expectation['description'], 4000, 'APP_EXPECTATION');
  const checks = expectation['checks'];
  if (!Array.isArray(checks) || checks.length < 1 || checks.length > MAX_CHECKS) invalid('APP_CHECKS', `State between 1 and ${MAX_CHECKS} explicit checks.`);
  for (const entry of checks) {
    const check = fields(entry, ['target', 'reference', 'property', 'comparison', 'expected', 'text'], 'APP_CHECK');
    oneOf(check['property'], PROPERTIES, 'APP_CHECK'); oneOf(check['comparison'], COMPARISONS, 'APP_CHECK');
    text(check['expected'], MAX_VALUE, 'APP_CHECK'); text(check['text'], 400, 'APP_CHECK');
    const needsTarget = !['url', 'page-errors'].includes(check['property'] as string);
    if (!needsTarget && (check['target'] !== null || check['reference'] !== null)) invalid('APP_CHECK', 'URL and page-error checks have no element target.');
    if (needsTarget) {
      if (check['reference'] !== null) validReference(check['reference']);
      if (check['target'] !== null) validTarget(check['target']);
      if (resolved ? check['target'] === null : check['reference'] === null) invalid('APP_CHECK_TARGET', resolved ? 'A resolved check needs an exact target.' : 'A draft check needs the reporter’s element reference.');
    }
    if (check['property'] === 'checked' || check['property'] === 'visible') oneOf(check['expected'], ['true', 'false'], 'APP_CHECK');
    if (check['property'] === 'checked' || check['property'] === 'visible' || check['property'] === 'page-errors') oneOf(check['comparison'], ['equals'], 'APP_CHECK');
    if (check['property'] === 'count' || check['property'] === 'page-errors') {
      if (!/^\d{1,4}$/.test(check['expected'] as string)) invalid('APP_CHECK', 'Counts are whole numbers.');
      oneOf(check['comparison'], ['equals', 'not-equals'], 'APP_CHECK');
    }
  }
  const failure = manifest['failure'];
  if (failure !== null) {
    const frozen = fields(failure, ['values', 'exact']);
    if (!Array.isArray(frozen['values']) || frozen['values'].length !== checks.length
      || frozen['values'].some(entry => entry !== null && (typeof entry !== 'string' || entry.length > MAX_VALUE))
      || !Array.isArray(frozen['exact']) || frozen['exact'].length !== checks.length || frozen['exact'].some(entry => typeof entry !== 'boolean')) invalid('APP_FAILURE', 'The frozen failure must record one observed value and comparison mode per check.');
    if (!resolved) invalid('APP_FAILURE', 'Only a resolved capture freezes an observed failure.');
  }
  if (manifest['assertionDigest'] !== appAssertionDigest(expectation as unknown as ManifestV4['expectation'], failure as ManifestV4['failure'])) {
    throw new ReproError('verification', 'ORACLE_CHANGED', 'The expectation or frozen failure differs from its recorded assertion identity.');
  }
  oneOf(manifest['expectationBasis'], ['reporter-approved', 'proposed-unconfirmed'], 'EXPECTATION_BASIS');
  oneOf(manifest['humanApproval'], ['reporter-confirmed', 'not-claimed'], 'EXPECTATION_BASIS');
  if ((manifest['expectationBasis'] === 'reporter-approved') !== (manifest['humanApproval'] === 'reporter-confirmed')) invalid('EXPECTATION_BASIS', 'Approval and expectation basis disagree.');

  const actions = manifest['actions'];
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > MAX_STEPS) invalid('APP_ACTIONS', `Provide between 1 and ${MAX_STEPS} steps.`);
  const seen = new Set<string>();
  actions.forEach((entry, index) => {
    const action = fields(entry, ['id', 'kind', 'target', 'reference', 'value', 'secret', 'text', 'dependsOn'], 'APP_ACTION');
    if (typeof action['id'] !== 'string' || !/^step-\d{1,3}$/.test(action['id']) || seen.has(action['id'])) invalid('APP_ACTION_ID', 'Step identifiers must be unique step-N values.');
    oneOf(action['kind'], KINDS, 'APP_ACTION');
    if (index === 0 && action['kind'] !== 'navigate') invalid('APP_ACTION', 'The first step opens a page of the app.');
    text(action['value'], MAX_VALUE, 'APP_ACTION'); text(action['text'], 400, 'APP_ACTION');
    if (action['secret'] !== null) {
      if (typeof action['secret'] !== 'string' || !SECRET_NAME.test(action['secret']) || action['value'] !== '' || !['fill', 'select'].includes(action['kind'] as string)) invalid('APP_SECRET', 'A withheld input names a REPRO_SECRET_N or REPRO_INPUT_N variable and stores no value.');
    }
    if (action['kind'] === 'navigate') navigationPath(action['value'] as string);
    if (action['kind'] === 'press' && !/^(?:(?:Control|Meta|Alt|Shift)\+){0,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Enter|Tab|Escape|Backspace|Delete|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/.test(action['value'] as string)) invalid('APP_ACTION', 'Unsupported key.');
    const targeted = TARGETED.has(action['kind'] as string) || action['kind'] === 'press';
    if (!targeted && (action['target'] !== null || action['reference'] !== null)) invalid('APP_ACTION', 'Navigation steps have no element target.');
    if (action['reference'] !== null) validReference(action['reference']);
    if (action['target'] !== null) validTarget(action['target']);
    if (TARGETED.has(action['kind'] as string) && (resolved ? action['target'] === null : action['reference'] === null)) invalid('APP_ACTION_TARGET', resolved ? 'A resolved step needs an exact target.' : 'A draft step needs the reporter’s element reference.');
    if (action['kind'] === 'press' && (action['reference'] === null) !== (action['target'] === null) && resolved) invalid('APP_ACTION_TARGET', 'A resolved key press keeps its field target.');
    const dependencies = action['dependsOn'];
    if (!Array.isArray(dependencies) || dependencies.length > 8 || dependencies.some(id => typeof id !== 'string' || !seen.has(id)) || new Set(dependencies).size !== dependencies.length) invalid('ACTION_DEPENDENCY', 'Dependencies must name distinct earlier steps.');
    if (index > 0 && !dependencies.length) invalid('ACTION_DEPENDENCY', 'Every later step depends on the page it runs in.');
    seen.add(action['id']);
  });
  if (!Array.isArray(manifest['responses']) || manifest['responses'].length) invalid('APP_MANIFEST_VALUE', 'Local apps use their own servers; recorded responses are unsupported.');
  const environment = fields(manifest['environment'], ['browser', 'viewport', 'locale', 'timezoneId', 'clock', 'seed', 'platform', 'timeoutMs', 'actionTimeoutMs', 'settleMs', 'checkTimeoutMs']);
  if (environment['browser'] !== 'chromium' || environment['locale'] !== 'en-US' || environment['timezoneId'] !== 'UTC' || environment['platform'] !== 'host') invalid('APP_ENVIRONMENT', 'Unsupported environment.');
  const viewport = fields(environment['viewport'], ['width', 'height']);
  integer(viewport['width'], 320, 3840); integer(viewport['height'], 320, 2160);
  integer(environment['seed'], 0, 0xffff_ffff); integer(environment['timeoutMs'], 5_000, 120_000);
  integer(environment['actionTimeoutMs'], 500, 30_000); integer(environment['settleMs'], 50, 2_000); integer(environment['checkTimeoutMs'], 0, 15_000);
  const clock = environment['clock'];
  if (clock !== null && (typeof clock !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(clock) || new Date(clock).toISOString() !== clock)) invalid('CLOCK_UNSUPPORTED', 'The clock is null (real time) or an explicit UTC ISO timestamp.');
  const boundary = fields(manifest['boundary'], ['behavior', 'network', 'database', 'externalDependencies']);
  if (canonicalJson(boundary) !== canonicalJson({ behavior: 'local-web-app', network: 'loopback-only', database: 'not-reset', externalDependencies: [] })) invalid('APP_BOUNDARY', 'Unsupported execution boundary.');
  const app = fields(manifest['app'], ['revision', 'sourceDigest', 'commit', 'dirty', 'name']);
  if (app['revision'] !== 'working-tree' || typeof app['sourceDigest'] !== 'string' || !/^[a-f0-9]{64}$/.test(app['sourceDigest'])
    || (app['commit'] !== null && (typeof app['commit'] !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(app['commit'])))
    || typeof app['dirty'] !== 'boolean' || typeof app['name'] !== 'string' || !/^[A-Za-z0-9@._/-]{1,100}$/.test(app['name'])) invalid('APP_SOURCE', 'The application source identity is invalid.');
  return value as ManifestV4;
}

export function appExpectationEstablished(manifest: ManifestV4): boolean {
  return validateAppManifest(manifest).expectationBasis === 'reporter-approved';
}

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
/** Whether one observed value satisfies one check. A missing element satisfies nothing. */
export function checkPasses(check: Pick<AppCheck, 'property' | 'comparison' | 'expected'>, observed: string | null): boolean {
  if (observed === null) return false;
  const [actual, expected] = check.property === 'text' ? [normalize(observed), normalize(check.expected)] : [observed, check.expected];
  switch (check.comparison) {
    case 'equals': return actual === expected;
    case 'not-equals': return actual !== expected;
    case 'contains': return actual.includes(expected);
    case 'not-contains': return !actual.includes(expected);
  }
}

export function validAppObservation(input: unknown, checks: number): AppObservation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ReproError('verification', 'APP_OBSERVATION', 'The complete declared observation is unavailable.');
  const observation = input as Record<string, unknown>;
  const keys = ['kind', 'values', 'url', 'pageErrors', 'console', 'failedRequests', 'blockedHosts', 'dialogs'];
  if (Object.keys(observation).length !== keys.length || keys.some(key => !(key in observation)) || observation['kind'] !== 'local-app'
    || !Array.isArray(observation['values']) || observation['values'].length !== checks
    || observation['values'].some(value => value !== null && (typeof value !== 'string' || value.length > MAX_OBSERVED))
    || typeof observation['url'] !== 'string' || observation['url'].length > 2048
    || ['pageErrors', 'console', 'failedRequests', 'blockedHosts', 'dialogs'].some(key => {
      const list = observation[key];
      return !Array.isArray(list) || list.length > 40 || list.some(item => typeof item !== 'string' || item.length > 600);
    })) throw new ReproError('verification', 'APP_OBSERVATION', 'The complete declared observation is unavailable.');
  return observation as unknown as AppObservation;
}

/**
 * Runs outside the page. The expectation decides satisfaction; the frozen
 * failure decides whether a failing run is the reported bug or another one.
 */
export function evaluateAppObservation(manifest: ManifestV4, input: unknown): 'target-failure' | 'requirement-satisfied' {
  const validated = validateAppManifest(manifest);
  if (validated.expectationBasis !== 'reporter-approved') throw new ReproError('verification', 'PROVISIONAL_EXPECTATION', 'Confirm the expected behavior before Repro reports a verdict.');
  const observation = validAppObservation(input, validated.expectation.checks.length);
  const checks = validated.expectation.checks;
  if (checks.every((check, index) => checkPasses(check, observation.values[index] ?? null))) return 'requirement-satisfied';
  const failure = validated.failure;
  if (failure === null || checks.every((check, index) => {
    const observed = observation.values[index] ?? null, frozen = failure.values[index] ?? null;
    return failure.exact[index] ? observed === frozen : checkPasses(check, observed) === checkPasses(check, frozen);
  })) return 'target-failure';
  throw new ReproError('verification', 'DIFFERENT_FAILURE', 'The expectation was not met, but the observed result differs from the reported failure.');
}

/**
 * The failure signature frozen from a capture. Equality-style checks keep the
 * exact observed value; containment checks (often whole-page text with dynamic
 * content) freeze only whether each check passed.
 */
export function failureSignature(checks: AppCheck[], values: (string | null)[]): NonNullable<ManifestV4['failure']> {
  const exact = checks.map((check, index) => !check.comparison.endsWith('contains') && (values[index] ?? '').length <= MAX_VALUE);
  return { values: values.map((value, index) => value === null ? null : exact[index] ? value : value.slice(0, 200)), exact };
}

/** Simple dependency groups: steps run in the page their latest navigation opened; a bare key press needs the step that focused its field. */
export function stepDependencies(kinds: { kind: string; targeted: boolean }[]): string[][] {
  let page = 'step-1';
  let focus: string | null = null;
  return kinds.map((step, index) => {
    const id = `step-${index + 1}`;
    if (index === 0) return [];
    const dependencies = [page];
    if (step.kind === 'press' && !step.targeted && focus && focus !== page) dependencies.push(focus);
    if (step.kind === 'navigate' || step.kind === 'reload') { page = id; focus = null; }
    else if (['fill', 'click', 'select', 'check', 'uncheck', 'dblclick'].includes(step.kind)) focus = id;
    return dependencies;
  });
}

export interface DraftInput {
  id: string; name: string; description: string; actions: DraftAction[]; checks: DraftCheck[];
  sourceDigest: string; commit: string | null; dirty: boolean; approved: boolean;
  secrets: Map<number, string>; environment?: Partial<Pick<ManifestV4['environment'], 'timeoutMs' | 'actionTimeoutMs' | 'settleMs' | 'checkTimeoutMs' | 'clock'>>;
}
/** Build a draft manifest from parsed steps. Sensitive typed values become named variables. */
export function createDraftManifest(input: DraftInput): ManifestV4 {
  const dependencies = stepDependencies(input.actions.map(action => ({ kind: action.kind, targeted: action.reference !== null })));
  const actions: AppAction[] = input.actions.map((action, index) => {
    const secret = input.secrets.get(index) ?? null;
    return { id: `step-${index + 1}`, kind: action.kind, target: null, reference: action.reference, value: secret ? '' : action.value,
      secret, text: action.text.slice(0, 400), dependsOn: dependencies[index]! };
  });
  const expectation: ManifestV4['expectation'] = { invariantId: 'REPORTED_EXPECTATION', description: input.description.slice(0, 4000),
    checks: input.checks.map(check => ({ target: null, reference: check.reference, property: check.property, comparison: check.comparison, expected: check.expected, text: check.text.slice(0, 400) })) };
  return validateAppManifest({
    schemaVersion: 4, id: input.id, classification: 'user-local-application', adapter: { id: APP_ADAPTER, version: VERSION }, runnerVersion: VERSION,
    resolution: 'draft', expectation, assertionDigest: appAssertionDigest(expectation, null),
    expectationBasis: input.approved ? 'reporter-approved' : 'proposed-unconfirmed', humanApproval: input.approved ? 'reporter-confirmed' : 'not-claimed',
    failure: null, actions, responses: [],
    environment: { browser: 'chromium', viewport: { width: 1280, height: 720 }, locale: 'en-US', timezoneId: 'UTC', clock: input.environment?.clock ?? null, seed: 1729, platform: 'host',
      timeoutMs: input.environment?.timeoutMs ?? 45_000, actionTimeoutMs: input.environment?.actionTimeoutMs ?? 5_000, settleMs: input.environment?.settleMs ?? 250, checkTimeoutMs: input.environment?.checkTimeoutMs ?? 2_000 },
    boundary: { behavior: 'local-web-app', network: 'loopback-only', database: 'not-reset', externalDependencies: [] },
    app: { revision: 'working-tree', sourceDigest: input.sourceDigest, commit: input.commit, dirty: input.dirty, name: input.name },
  });
}

/** Freeze capture-time target resolution and the first observed failure into a new resolved manifest. */
export function resolveManifest(draft: ManifestV4, resolution: Pick<AppResolution, 'actions' | 'checks'>, observedValues: (string | null)[] | null, secretFor: (actionIndex: number) => string | null): ManifestV4 {
  const manifest = validateAppManifest(draft);
  if (manifest.resolution !== 'draft') invalid('APP_RESOLUTION', 'Only a draft manifest is resolved.');
  const actions = manifest.actions.map((action, index) => {
    const resolved = resolution.actions[index];
    if (!resolved || resolved.id !== action.id) invalid('APP_RESOLUTION', 'Resolution does not match the captured steps.');
    const secret = action.secret ?? (resolved.sensitive && ['fill', 'select'].includes(action.kind) ? secretFor(index) : null);
    return { ...action, target: resolved.target, value: secret ? '' : action.value, secret };
  });
  const expectation = { ...manifest.expectation, checks: manifest.expectation.checks.map((check, index) => ({ ...check, target: resolution.checks[index] ?? null })) };
  const failure = observedValues ? failureSignature(expectation.checks, observedValues) : null;
  return validateAppManifest({ ...manifest, resolution: 'resolved', actions, expectation, failure, assertionDigest: appAssertionDigest(expectation, failure) });
}
