import { randomUUID } from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright';
import { ReproError } from './contracts.js';
import { startApp, type LaunchPlan, type RunningApp } from './app-process.js';
import { isLoopbackUrl } from './app-execution.js';

/**
 * Guided demonstration: Repro starts the app and opens a visible browser; the
 * reporter performs the bug once. Each click, typed value, key press, select or
 * checkbox change becomes a line in the same plain-language step grammar, and
 * "Mark the wrong element" turns the clicked element into a draft check. The
 * text returns to the form for review; nothing is run from it until confirmed.
 */
export interface DemonstrationState {
  id: string; status: 'starting' | 'recording' | 'finished' | 'failed';
  steps: string[]; checks: string[]; notes: string[]; reason?: string; url?: string;
}
interface Session { state: DemonstrationState; app?: RunningApp; browser?: Browser; context?: BrowserContext; page?: Page; closing?: Promise<void> }
const sessions = new Map<string, Session>();
const MAX_LINES = 80;

/** Runs in the page. Plain JS only (no named inner functions that a transform could rename). */
const recorderScript = () => {
  const global = globalThis as unknown as { __reproRecorded?: boolean; __reproStep: (line: string) => Promise<void>; __reproCheck: (line: string) => Promise<void>; __reproDone: () => Promise<void> };
  if (global.__reproRecorded || window.top !== window) return;
  global.__reproRecorded = true;
  const quote = (value: string) => `"${value.replace(/"/g, '\'').replace(/\s+/g, ' ').trim().slice(0, 80)}"`;
  const labelOf = (element: Element): string | null => {
    const html = element as HTMLElement & { labels?: NodeListOf<HTMLLabelElement>; placeholder?: string };
    const aria = element.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelled = element.getAttribute('aria-labelledby');
    if (labelled) { const text = labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim(); if (text) return text; }
    if (html.labels && html.labels.length) { const text = (html.labels[0]!.textContent ?? '').trim(); if (text) return text; }
    if (html.placeholder && html.placeholder.trim()) return html.placeholder.trim();
    return null;
  };
  const nameOf = (element: Element): string | null => {
    const label = labelOf(element);
    if (label) return label;
    const tag = element.tagName.toLowerCase();
    if (['button', 'a', 'summary', 'option'].includes(tag) || ['button', 'link', 'tab', 'menuitem', 'option'].includes(element.getAttribute('role') ?? '')) {
      const text = ((element as HTMLElement).innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text && text.length <= 80) return text;
    }
    if (element.id && /^[A-Za-z][\w-]*$/.test(element.id)) return `#${element.id}`;
    const testid = element.getAttribute('data-testid');
    if (testid) return `testid:${testid}`;
    return null;
  };
  const actionable = (target: EventTarget | null): Element | null => {
    let element = target instanceof Element ? target : null;
    while (element && element !== document.body) {
      const tag = element.tagName.toLowerCase();
      if (['button', 'a', 'input', 'select', 'textarea', 'summary', 'label'].includes(tag) || element.hasAttribute('role') || element.hasAttribute('onclick') || element.id) return element;
      element = element.parentElement;
    }
    return target instanceof Element ? target : null;
  };
  let pending: { element: HTMLInputElement | HTMLTextAreaElement; name: string } | null = null;
  let marking = false;
  // Enter in a form field submits it by synthesizing a click on the form's default button; that is not a separate step.
  let enter: { at: number; form: HTMLFormElement | null } = { at: 0, form: null };
  const flush = () => {
    if (!pending) return;
    const { element, name } = pending; pending = null;
    void global.__reproStep(element.value === '' ? `Clear ${quote(name)}` : `Type ${quote(element.value)} into ${quote(name)}`);
  };
  document.addEventListener('input', event => {
    const element = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) || ['checkbox', 'radio', 'file', 'range', 'color'].includes((element as HTMLInputElement).type)) return;
    const name = nameOf(element);
    if (!name) { void global.__reproStep('# Typed into a field Repro could not name; describe this step yourself'); return; }
    if (pending && pending.element !== element) flush();
    pending = { element, name };
  }, true);
  document.addEventListener('keydown', event => {
    if (['Enter', 'Escape', 'Tab'].includes(event.key) && !event.isComposing) {
      if (event.key === 'Enter') enter = { at: performance.now(), form: (event.target as HTMLInputElement | null)?.form ?? null };
      flush();
      if (event.key !== 'Tab') void global.__reproStep(`Press ${event.key}`);
    }
  }, true);
  document.addEventListener('change', event => {
    const element = event.target;
    if (element instanceof HTMLSelectElement) {
      flush();
      const name = nameOf(element); const choice = element.selectedOptions[0]?.textContent?.trim() ?? element.value;
      void global.__reproStep(name ? `Select ${quote(choice)} from ${quote(name)}` : '# Changed a drop-down Repro could not name; describe this step yourself');
    }
  }, true);
  document.addEventListener('click', event => {
    if ((event.target as Element)?.closest?.('#repro-recorder-host')) return;
    const element = actionable(event.target);
    if (!element) return;
    const submitter = element as HTMLButtonElement;
    if (event.detail === 0 && enter.form && submitter.form === enter.form && performance.now() - enter.at < 500 && (submitter.type === 'submit' || element.tagName === 'INPUT')) return;
    if (marking) {
      event.preventDefault(); event.stopPropagation(); marking = false;
      document.documentElement.style.cursor = '';
      const name = nameOf(element) ?? (element.id ? `#${element.id}` : null);
      const text = ((element as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      // The page shows the wrong value now; the reporter must type what it should show.
      if (name) { void global.__reproCheck(`${quote(name)} should show "(expected value)"`); void global.__reproStep(`# ${quote(name)} showed ${quote(text || '(nothing)')} during the demonstration`); }
      else void global.__reproCheck('# Repro could not name the element you marked; write this check yourself');
      return;
    }
    if (element instanceof HTMLInputElement && ['text', 'email', 'password', 'search', 'number', 'tel', 'url'].includes(element.type) || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return;
    flush();
    const name = nameOf(element);
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
      void global.__reproStep(name ? `${element.checked ? 'Check' : 'Uncheck'} ${quote(name)}` : '# Toggled a checkbox Repro could not name; describe this step yourself');
      return;
    }
    if (element.tagName.toLowerCase() === 'label') return;
    void global.__reproStep(name ? `Click ${quote(name)}` : '# Clicked an element Repro could not name; describe this step yourself');
  }, true);
  const mount = () => {
    if (document.getElementById('repro-recorder-host') || !document.body) return;
    const host = document.createElement('div'); host.id = 'repro-recorder-host';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>div{font:13px system-ui,sans-serif;background:#172033;color:#fff;padding:10px 12px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;gap:8px;align-items:center}button{font:inherit;border:0;border-radius:6px;padding:7px 10px;cursor:pointer}.mark{background:#fff4d6;color:#7a4b00}.done{background:#2f5bea;color:#fff}</style><div role="toolbar" aria-label="Repro recorder"><span>Repro is recording</span><button class="mark" type="button">Mark the wrong element</button><button class="done" type="button">Done</button></div>';
    shadow.querySelector('.mark')!.addEventListener('click', event => { event.stopPropagation(); flush(); marking = true; document.documentElement.style.cursor = 'crosshair'; });
    shadow.querySelector('.done')!.addEventListener('click', event => { event.stopPropagation(); flush(); void global.__reproDone(); });
    document.body.append(host);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
};

export async function startDemonstration(plan: LaunchPlan, options: { headless?: boolean } = {}): Promise<DemonstrationState> {
  if ([...sessions.values()].some(session => session.state.status === 'recording' || session.state.status === 'starting')) throw new ReproError('input', 'BUSY', 'A demonstration is already open. Finish it first.');
  const id = randomUUID();
  const session: Session = { state: { id, status: 'starting', steps: ['Open the app'], checks: [], notes: [] } };
  sessions.set(id, session);
  try {
    session.app = await startApp(plan);
    const { chromium } = await import('playwright');
    session.browser = await chromium.launch({ headless: options.headless ?? false, chromiumSandbox: true });
    session.context = await session.browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' });
    await session.context.route('**/*', route => isLoopbackUrl(route.request().url()) ? route.continue() : route.abort('blockedbyclient'));
    const add = (list: string[], line: string) => { if (session.state.steps.length + session.state.checks.length < MAX_LINES) list.push(line); };
    await session.context.exposeBinding('__reproStep', (_source, line: unknown) => { if (typeof line === 'string') add(line.startsWith('#') ? session.state.notes : session.state.steps, line.replace(/^# /, '').slice(0, 300)); });
    await session.context.exposeBinding('__reproCheck', (_source, line: unknown) => { if (typeof line === 'string') add(line.startsWith('#') ? session.state.notes : session.state.checks, line.replace(/^# /, '').slice(0, 300)); });
    await session.context.exposeBinding('__reproDone', () => { void finishDemonstration(id); });
    // Source-mode transforms may wrap the recorder's inner functions with a __name helper the page lacks.
    await session.context.addInitScript('globalThis.__name ??= (target) => target;');
    await session.context.addInitScript(recorderScript);
    session.page = await session.context.newPage();
    session.page.on('close', () => { void finishDemonstration(id); });
    let lastPath = '';
    session.page.on('framenavigated', frame => {
      if (frame !== session.page?.mainFrame()) return;
      try { const url = new URL(frame.url()); const path = `${url.pathname}${url.search}`; if (lastPath && path !== lastPath) add(session.state.notes, `The page changed to ${path}`); lastPath = path; } catch { /* about:blank */ }
    });
    await session.page.goto(session.app.url, { waitUntil: 'load' });
    session.state.status = 'recording'; session.state.url = session.app.url;
  } catch (error) {
    session.state.status = 'failed';
    session.state.reason = error instanceof ReproError ? error.message : 'The app or the browser could not start for the demonstration.';
    await close(session);
  }
  return structuredClone(session.state);
}
async function close(session: Session) {
  session.closing ??= (async () => {
    await session.browser?.close().catch(() => undefined);
    await session.app?.stop().catch(() => undefined);
  })();
  await session.closing;
}
export function demonstration(id: string): DemonstrationState {
  const session = sessions.get(id);
  if (!session) throw new ReproError('input', 'NOT_FOUND', 'Demonstration not found.');
  return structuredClone(session.state);
}
export async function finishDemonstration(id: string): Promise<DemonstrationState> {
  const session = sessions.get(id);
  if (!session) throw new ReproError('input', 'NOT_FOUND', 'Demonstration not found.');
  if (session.state.status === 'recording' || session.state.status === 'starting') session.state.status = 'finished';
  await close(session);
  return structuredClone(session.state);
}
/** Test hook: the page Repro opened, for driving a headless demonstration. */
export function demonstrationPage(id: string): Page | undefined { return sessions.get(id)?.page; }
export async function closeDemonstrations(): Promise<void> { await Promise.all([...sessions.keys()].map(id => finishDemonstration(id).catch(() => undefined))); }
