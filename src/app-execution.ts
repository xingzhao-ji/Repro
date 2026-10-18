import type { BrowserContext, Locator, Page } from 'playwright';
import { ReproError, type AppObservation, type AppResolution, type ManifestV4, type AppAction, type AppCheck } from './contracts.js';
import { checkPasses, MAX_OBSERVED } from './app-contract.js';
import { classifyInput, createRedactor, reportUrl } from './redaction.js';
import type { AppTarget, TargetReference } from './steps.js';

/**
 * Step execution for a user's local web app inside the fixed case worker. The
 * worker owns the browser lifecycle and cleanup certification; this module
 * owns only what happens in the page: network policy, diagnostics, steps and
 * the bounded observation.
 */
export const APP_RESET_MESSAGE = 'Starting a new owned browser profile for the local app.';
export const APP_FAILURE_REASON = 'The reported expectation was not met; the observed result matches the reported failure.';
export const APP_SATISFIED_REASON = 'The reported expectation was met in this run.';
export const appActionMessage = (action: Pick<AppAction, 'id' | 'kind'>) => `Executed ${action.id}: ${action.kind}.`;
/** Templated reasons only; the worker never forwards page text or exception messages as a reason. */
export const APP_REASON_PATTERNS: RegExp[] = [
  /^STEP_TARGET_NOT_FOUND: step-\d{1,3} could not find its element on the page\.$/,
  /^STEP_TARGET_AMBIGUOUS: step-\d{1,3} matched more than one element; name it more specifically\.$/,
  /^STEP_FAILED: step-\d{1,3} could not be completed within its time limit\.$/,
  /^NAVIGATION_FAILED: step-\d{1,3} could not load the page\.$/,
  /^NAVIGATION_LEFT_APP: step-\d{1,3} left the local app\.$/,
  /^CHECK_TARGET_UNRESOLVED: check \d{1,2} could not be matched to exactly one element\.$/,
  /^SECRET_MISSING: step-\d{1,3} needs a withheld value that was not supplied\.$/,
  /^APP_UNREACHABLE: The app did not respond at its local address\. Check that it starts, then retry\.$/,
  /^DIFFERENT_FAILURE: The expectation was not met, but the observed result differs from the reported failure\.$/,
];

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
export function isLoopbackUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') && LOOPBACK.has(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
function host(raw: string): string { try { return new URL(raw).host || '(no host)'; } catch { return '(unparseable)'; } }

export interface AppDiagnostics { pageErrors: string[]; console: string[]; failedRequests: string[]; blockedHosts: Set<string>; dialogs: string[]; inflight: number }
const LIMIT = 40, LENGTH = 300;
function push(list: string[], value: string) { if (list.length < LIMIT) list.push(value.length > LENGTH ? `${value.slice(0, LENGTH)}…` : value); }

/** Install loopback-only network policy and diagnostics on a fresh context. */
export async function prepareAppContext(context: BrowserContext, diagnostics: AppDiagnostics, seed: number): Promise<void> {
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (isLoopbackUrl(url)) { await route.continue(); return; }
    diagnostics.blockedHosts.add(host(url));
    await route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, socket => {
    if (isLoopbackUrl(socket.url())) socket.connectToServer();
    else { diagnostics.blockedHosts.add(host(socket.url())); void socket.close(); }
  });
  await context.addInitScript(({ seed: initial }) => {
    let state = initial >>> 0;
    Math.random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    const global = globalThis as unknown as { __reproMutations: number };
    global.__reproMutations = 0;
    new MutationObserver(() => { global.__reproMutations++; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  }, { seed });
}
export function observePage(page: Page, origin: string, diagnostics: AppDiagnostics): void {
  const redactor = createRedactor();
  const clean = (text: string) => redactor.redact(text.replace(new RegExp(origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ''));
  page.on('pageerror', error => push(diagnostics.pageErrors, clean(`${error.name}: ${error.message}`)));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') push(diagnostics.console, clean(`${message.type()}: ${message.text()}`));
  });
  page.on('request', request => { if (!['websocket', 'eventsource'].includes(request.resourceType())) diagnostics.inflight++; });
  const settled = (request: import('playwright').Request) => { if (!['websocket', 'eventsource'].includes(request.resourceType())) diagnostics.inflight = Math.max(0, diagnostics.inflight - 1); };
  page.on('requestfinished', settled);
  page.on('requestfailed', request => {
    settled(request);
    if (!isLoopbackUrl(request.url())) return;
    push(diagnostics.failedRequests, clean(`${request.method()} ${reportUrl(request.url())} failed: ${request.failure()?.errorText ?? 'unknown error'}`));
  });
  page.on('response', response => {
    if (response.status() >= 400 && isLoopbackUrl(response.url())) push(diagnostics.failedRequests, clean(`${response.request().method()} ${reportUrl(response.url())} → ${response.status()}`));
  });
  page.on('dialog', dialog => { push(diagnostics.dialogs, clean(`${dialog.type()}: ${dialog.message()} (accepted)`)); void dialog.accept().catch(() => undefined); });
  page.on('download', download => { push(diagnostics.dialogs, 'download started (cancelled by Repro)'); void download.cancel().catch(() => undefined); });
}

/** Wait until the page has no in-flight requests and no DOM mutations for settleMs, bounded by maxMs. */
export async function settle(page: Page, diagnostics: AppDiagnostics, settleMs: number, maxMs: number): Promise<void> {
  const deadline = performance.now() + maxMs;
  let last = -1, quietSince = performance.now();
  while (performance.now() < deadline) {
    let mutations: number;
    try { mutations = await page.evaluate(() => (globalThis as unknown as { __reproMutations?: number }).__reproMutations ?? 0); }
    catch { mutations = -2; }
    if (mutations !== last || diagnostics.inflight > 0) { last = mutations; quietSince = performance.now(); }
    else if (performance.now() - quietSince >= settleMs) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

export function locatorFor(page: Page, target: AppTarget): Locator {
  switch (target.by) {
    case 'role': return page.getByRole(target.role as Parameters<Page['getByRole']>[0], { name: target.value, exact: true });
    case 'label': return page.getByLabel(target.value, { exact: true });
    case 'placeholder': return page.getByPlaceholder(target.value, { exact: true });
    case 'text': return page.getByText(target.value, { exact: true });
    case 'testid': return page.getByTestId(target.value);
    case 'css': return page.locator(target.value);
    case 'title': return page.getByTitle(target.value, { exact: true });
    case 'alt': return page.getByAltText(target.value, { exact: true });
  }
}
const cssString = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
type Purpose = 'click' | 'field' | 'select' | 'toggle' | 'wait' | 'check';
function purposeOf(kind: AppAction['kind']): Purpose {
  if (kind === 'fill' || kind === 'press') return 'field';
  if (kind === 'select') return 'select';
  if (kind === 'check' || kind === 'uncheck') return 'toggle';
  if (kind === 'wait-for') return 'wait';
  return 'click';
}
/** Ordered exact strategies for a reporter reference; the first unique match wins. */
export function candidateTargets(reference: TargetReference, purpose: Purpose): AppTarget[] {
  if (reference.css) return [{ by: 'css', value: reference.css }];
  if (reference.testid) return [{ by: 'testid', value: reference.testid }, ...['data-test', 'data-cy', 'data-qa'].map(attribute => ({ by: 'css' as const, value: `[${attribute}=${cssString(reference.testid!)}]` }))];
  const text = reference.text!;
  const role = (name: string): AppTarget => ({ by: 'role', role: name, value: text });
  const generic: AppTarget[] = [{ by: 'testid', value: text }, { by: 'css', value: `[aria-label=${cssString(text)}]` }, ...(slug(text) ? [{ by: 'css' as const, value: `#${slug(text)}` }] : [])];
  switch (reference.kind) {
    case 'button': return [role('button'), { by: 'text', value: text }];
    case 'link': return [role('link'), { by: 'text', value: text }];
    case 'checkbox': return [role('checkbox'), role('switch'), { by: 'label', value: text }];
    case 'radio': return [role('radio'), { by: 'label', value: text }];
    case 'field': return [{ by: 'label', value: text }, { by: 'placeholder', value: text }, role('textbox'), role('searchbox'), role('combobox'), role('spinbutton'), ...generic];
    case 'tab': case 'menuitem': case 'option': case 'heading': case 'combobox': return [role(reference.kind), { by: 'text', value: text }];
    default: break;
  }
  switch (purpose) {
    case 'field': return [{ by: 'label', value: text }, { by: 'placeholder', value: text }, role('textbox'), role('searchbox'), role('combobox'), role('spinbutton'), ...generic];
    case 'select': return [{ by: 'label', value: text }, role('combobox'), role('listbox'), ...generic];
    case 'toggle': return [role('checkbox'), role('radio'), role('switch'), { by: 'label', value: text }, ...generic];
    case 'wait': return [{ by: 'text', value: text }, role('status'), role('alert'), role('heading'), ...generic];
    case 'check': return [...generic, { by: 'label', value: text }, role('status'), role('heading'), role('textbox'), role('checkbox'), role('button'), role('link'), { by: 'text', value: text }, { by: 'title', value: text }, { by: 'placeholder', value: text }];
    case 'click': return [role('button'), role('link'), role('checkbox'), role('radio'), role('tab'), role('menuitem'), role('option'), role('switch'), { by: 'label', value: text }, { by: 'text', value: text }, { by: 'title', value: text }, { by: 'alt', value: text }, ...generic];
  }
}

type Clock = { remaining: () => number; check: () => void };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Poll until exactly one element matches; return the count seen last. */
async function waitUnique(locator: Locator, timeoutMs: number, clock: Clock): Promise<number> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    clock.check();
    let count: number;
    try { count = await locator.count(); } catch { count = 0; }
    if (count === 1 || performance.now() >= deadline) return count;
    await pause(100);
  }
}
async function resolveReference(page: Page, reference: TargetReference, purpose: Purpose, timeoutMs: number, clock: Clock): Promise<{ target: AppTarget | null; ambiguous: boolean }> {
  const options = candidateTargets(reference, purpose);
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    clock.check();
    let ambiguous = false;
    for (const target of options) {
      let count: number;
      try { count = await locatorFor(page, target).count(); } catch { count = 0; }
      if (count === 1) return { target, ambiguous: false };
      if (count > 1) ambiguous = true;
    }
    if (performance.now() >= deadline) return { target: null, ambiguous };
    await pause(100);
  }
}

/** The single readable projection a check needs. Missing or non-unique elements read as null. */
export async function readCheck(page: Page, check: Pick<AppCheck, 'property'> & { target: AppTarget | null }, diagnostics: AppDiagnostics, origin: string): Promise<string | null> {
  const bound = (value: string) => value.length > MAX_OBSERVED ? value.slice(0, MAX_OBSERVED) : value;
  if (check.property === 'url') {
    try { const url = new URL(page.url()); return url.origin === origin ? bound(`${url.pathname}${url.search}${url.hash}`) : bound(reportUrl(page.url())); }
    catch { return null; }
  }
  if (check.property === 'page-errors') return String(diagnostics.pageErrors.length);
  const locator = locatorFor(page, check.target!);
  try {
    if (check.property === 'count') return String(await locator.count());
    if (check.property === 'visible') return String(await locator.filter({ visible: true }).count() > 0);
    if (await locator.count() !== 1) return null;
    if (check.property === 'text') return bound(await locator.innerText({ timeout: 1000 }));
    if (check.property === 'value') return bound(await locator.inputValue({ timeout: 1000 }));
    return String(await locator.isChecked({ timeout: 1000 }));
  } catch { return null; }
}

async function fieldDescription(locator: Locator) {
  try {
    return await locator.evaluate(element => {
      const input = element as HTMLInputElement;
      const labels = 'labels' in input && input.labels ? Array.from(input.labels).map(label => label.textContent ?? '').join(' ') : '';
      return { type: input.type ?? '', autocomplete: input.autocomplete ?? element.getAttribute('autocomplete') ?? '', name: input.name ?? '', label: `${labels} ${element.getAttribute('aria-label') ?? ''} ${input.placeholder ?? ''}` };
    }, undefined, { timeout: 1000 });
  } catch { return {}; }
}

async function candidateElements(page: Page): Promise<{ selector: string; text: string }[]> {
  try {
    // No named inner functions: source-mode transforms would inject helpers the page does not have.
    return await page.evaluate(() => {
      const results: { selector: string; text: string }[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('body [id], body [data-testid], body [aria-label], body output, body [role=status]'))) {
        if (results.length >= 8) break;
        const text = (element.innerText ?? '').replace(/\s+/g, ' ').trim();
        const box = element.getBoundingClientRect();
        if (!text || text.length > 80 || !box.width || !box.height) continue;
        const attribute = element.dataset['testid'] ? ['data-testid', element.dataset['testid']] : element.getAttribute('aria-label') ? ['aria-label', element.getAttribute('aria-label')!] : null;
        const selector = element.id && /^[A-Za-z][\w-]*$/.test(element.id) ? `#${element.id}`
          : attribute ? `[${attribute[0]}="${attribute[1]!.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]` : null;
        if (selector && !results.some(result => result.selector === selector)) results.push({ selector, text });
      }
      return results;
    });
  } catch { return []; }
}

export interface AppStepContext {
  page: Page; manifest: ManifestV4; origin: string; secrets: Record<string, string>; resolve: boolean;
  diagnostics: AppDiagnostics; clock: Clock; emit: (type: string, message: string, actionId?: string) => Promise<void>;
  /** Filled as resolution proceeds, so a blocked capture still reports how far it resolved. */
  resolution: AppResolution;
}
// A step that cannot be performed means the steps and the app disagree: blocked, never a reproduction.
const fail = (code: string, message: string): never => { throw new ReproError(code === 'APP_UNREACHABLE' ? 'environment' : 'input', code, message); };

/** Execute the steps, then read the checks with settle-and-poll semantics shared with the exported test. */
export async function runAppSteps(context: AppStepContext): Promise<AppObservation> {
  const { page, manifest, origin, diagnostics, clock, resolution } = context;
  const environment = manifest.environment;
  const settleNow = () => settle(page, diagnostics, environment.settleMs, Math.min(3000, clock.remaining()));
  for (const action of manifest.actions) {
    clock.check();
    const step = action.id;
    const value = action.secret ? context.secrets[action.secret] : action.value;
    if (value === undefined) fail('SECRET_MISSING', `${step} needs a withheld value that was not supplied.`);
    let target = action.target;
    let sensitive = action.secret !== null;
    if (action.kind === 'navigate' || action.kind === 'reload') {
      try {
        if (action.kind === 'navigate') await page.goto(new URL(action.value, origin).href, { waitUntil: 'load', timeout: Math.min(clock.remaining(), Math.max(environment.actionTimeoutMs, 15_000)) });
        else await page.reload({ waitUntil: 'load', timeout: Math.min(clock.remaining(), Math.max(environment.actionTimeoutMs, 15_000)) });
      } catch (cause) {
        clock.check();
        if (step === 'step-1' && /ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET/.test(String(cause))) fail('APP_UNREACHABLE', 'The app did not respond at its local address. Check that it starts, then retry.');
        fail('NAVIGATION_FAILED', `${step} could not load the page.`);
      }
      if (!isLoopbackUrl(page.url())) fail('NAVIGATION_LEFT_APP', `${step} left the local app.`);
    } else if (action.kind === 'press' && action.reference === null) {
      await page.keyboard.press(action.value);
    } else {
      if (context.resolve) {
        const resolved = await resolveReference(page, action.reference!, purposeOf(action.kind), environment.actionTimeoutMs, clock);
        if (!resolved.target) fail(resolved.ambiguous ? 'STEP_TARGET_AMBIGUOUS' : 'STEP_TARGET_NOT_FOUND', resolved.ambiguous ? `${step} matched more than one element; name it more specifically.` : `${step} could not find its element on the page.`);
        target = resolved.target;
      }
      const locator = locatorFor(page, target!);
      const count = await waitUnique(locator, environment.actionTimeoutMs, clock);
      if (count !== 1) fail(count > 1 ? 'STEP_TARGET_AMBIGUOUS' : 'STEP_TARGET_NOT_FOUND', count > 1 ? `${step} matched more than one element; name it more specifically.` : `${step} could not find its element on the page.`);
      if (context.resolve && (action.kind === 'fill' || action.kind === 'select') && !sensitive) sensitive = classifyInput(value!, await fieldDescription(locator)) !== 'plain';
      const timeout = Math.min(clock.remaining(), environment.actionTimeoutMs);
      try {
        switch (action.kind) {
          case 'click': await locator.click({ timeout }); break;
          case 'dblclick': await locator.dblclick({ timeout }); break;
          case 'hover': await locator.hover({ timeout }); break;
          case 'fill': await locator.fill(value!, { timeout }); break;
          case 'press': await locator.press(action.value, { timeout }); break;
          case 'select': await locator.selectOption(value!, { timeout }); break;
          case 'wait-for': await locator.waitFor({ state: 'visible', timeout }); break;
          case 'check': case 'uncheck':
            // Click only when the state differs; whether the state then changed is for the checks to observe.
            if (await locator.isChecked({ timeout }) !== (action.kind === 'check')) await locator.click({ timeout });
            break;
        }
      } catch {
        clock.check();
        fail('STEP_FAILED', `${step} could not be completed within its time limit.`);
      }
    }
    resolution.actions.push({ id: action.id, target, sensitive });
    await settleNow();
    clock.check();
    await context.emit('action-executed', appActionMessage(action), action.id);
  }
  const checks = manifest.expectation.checks;
  const targets: (AppTarget | null)[] = [];
  for (const [index, check] of checks.entries()) {
    if (!context.resolve || check.reference === null) { targets.push(check.target); continue; }
    const resolved = await resolveReference(page, check.reference, 'check', Math.min(environment.actionTimeoutMs, clock.remaining()), clock);
    if (!resolved.target) {
      resolution.checks = targets; resolution.candidates = await candidateElements(page);
      fail('CHECK_TARGET_UNRESOLVED', `check ${index + 1} could not be matched to exactly one element.`);
    }
    targets.push(resolved.target);
  }
  resolution.checks = targets;
  const read = async () => Promise.all(checks.map((check, index) => readCheck(page, { property: check.property, target: targets[index] ?? null }, diagnostics, origin)));
  let values = await read();
  const satisfied = (observed: (string | null)[]) => checks.every((check, index) => checkPasses(check, observed[index] ?? null));
  // Give slow updates a bounded chance to reach the expected state; a failing value is the last one read.
  const pollUntil = performance.now() + Math.min(environment.checkTimeoutMs, Math.max(0, clock.remaining() - 1500));
  while (!satisfied(values) && performance.now() < pollUntil) { await pause(100); clock.check(); values = await read(); }
  return { kind: 'local-app', values, url: (await readCheck(page, { property: 'url', target: null }, diagnostics, origin)) ?? '',
    pageErrors: [...diagnostics.pageErrors], console: [...diagnostics.console], failedRequests: [...diagnostics.failedRequests],
    blockedHosts: [...diagnostics.blockedHosts].slice(0, 40), dialogs: [...diagnostics.dialogs] };
}
