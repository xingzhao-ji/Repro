/**
 * A small, deterministic grammar for reproduction steps and expected behavior.
 * No language model is involved: a line is either understood exactly, kept as
 * a reporter note, or reported back with a concrete suggestion. Pure module,
 * shared by the CLI, the orchestrator and the browser UI preview.
 */
export type TargetStrategy = 'role' | 'label' | 'placeholder' | 'text' | 'testid' | 'css' | 'title' | 'alt';
/**
 * A resolved Playwright locator. Names match exactly, except a role target with match "contains":
 * Playwright's case-insensitive substring match, used only for steps and only when no exact name matched.
 */
export interface AppTarget { by: TargetStrategy; value: string; role?: string; match?: 'contains' }
export type ReferenceKind = 'button' | 'link' | 'checkbox' | 'radio' | 'field' | 'tab' | 'menuitem' | 'option' | 'heading' | 'combobox' | 'element';
/** What the reporter wrote; resolved against the live page during capture. */
export interface TargetReference { text?: string; kind?: ReferenceKind; css?: string; testid?: string }
export type AppActionKind = 'navigate' | 'reload' | 'click' | 'dblclick' | 'fill' | 'press' | 'check' | 'uncheck' | 'select' | 'hover' | 'wait-for';
export type CheckProperty = 'text' | 'value' | 'checked' | 'visible' | 'count' | 'url' | 'page-errors';
export type Comparison = 'equals' | 'contains' | 'not-equals' | 'not-contains';
export interface DraftAction { kind: AppActionKind; reference: TargetReference | null; value: string; text: string; line: number }
export interface DraftCheck { reference: TargetReference | null; property: CheckProperty; comparison: Comparison; expected: string; text: string; line: number }
export interface ParseProblem { line: number; text: string; message: string; suggestion: string }
export interface ParsedSteps { actions: DraftAction[]; notes: string[]; problems: ParseProblem[] }
export interface ParsedExpectation { checks: DraftCheck[]; notes: string[]; problems: ParseProblem[] }

export const MAX_STEPS = 60;
export const MAX_CHECKS = 8;
const MAX_LINE = 400;
const KEYS: Record<string, string> = {
  enter: 'Enter', return: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape', backspace: 'Backspace', delete: 'Delete', del: 'Delete',
  space: 'Space', spacebar: 'Space', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
};
const MODIFIERS: Record<string, string> = { ctrl: 'Control', control: 'Control', cmd: 'Meta', command: 'Meta', meta: 'Meta', alt: 'Alt', option: 'Alt', shift: 'Shift' };
const KIND_WORDS: Record<string, ReferenceKind> = {
  button: 'button', link: 'link', checkbox: 'checkbox', 'check box': 'checkbox', radio: 'radio', 'radio button': 'radio',
  field: 'field', input: 'field', box: 'field', textbox: 'field', 'text box': 'field', 'text field': 'field', 'input field': 'field', textarea: 'field',
  tab: 'tab', 'menu item': 'menuitem', option: 'option', heading: 'heading', title: 'heading', dropdown: 'combobox', select: 'combobox',
  'select box': 'combobox', menu: 'combobox', element: 'element', label: 'element', text: 'element', message: 'element', counter: 'element',
  badge: 'element', total: 'element', item: 'element', row: 'element', cell: 'element', list: 'element', banner: 'element', area: 'element',
  output: 'element', value: 'element', price: 'element', amount: 'element', status: 'element', count: 'element', number: 'element',
  summary: 'element', notice: 'element', alert: 'element', toast: 'element', panel: 'element', section: 'element', card: 'element',
};
const KIND_PATTERN = Object.keys(KIND_WORDS).sort((a, b) => b.length - a.length).map(word => word.replace(' ', '\\s+')).join('|');
const COUNT_WORDS: Record<string, number> = { once: 1, twice: 2, thrice: 3, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const QUOTES: [string, string][] = [['"', '"'], ['“', '”'], ['‘', '’'], ['`', '`'], ["'", "'"]];

interface Tokenized { shape: string; quoted: string[] }
/** Replace quoted strings with ⟦n⟧ so the remaining words can be matched. */
function tokenize(line: string): Tokenized | { error: string } {
  const quoted: string[] = [];
  let shape = '', index = 0;
  while (index < line.length) {
    const character = line[index]!;
    const pair = QUOTES.find(([open]) => open === character);
    // An apostrophe inside a word (don't, item's) is not a quote.
    const apostrophe = character === "'" && index > 0 && /[A-Za-z0-9]/.test(line[index - 1]!) && /[A-Za-z]/.test(line[index + 1] ?? '');
    if (!pair || apostrophe) { shape += character; index++; continue; }
    const close = line.indexOf(pair[1], index + 1);
    if (close < 0) return { error: 'A quoted value is not closed.' };
    quoted.push(line.slice(index + 1, close));
    shape += `⟦${quoted.length - 1}⟧`;
    index = close + 1;
  }
  return { shape: shape.replace(/\s+/g, ' ').trim(), quoted };
}
function clean(line: string): string {
  return line.trim().replace(/^(?:[-*•]\s+|\d{1,3}[.)]\s+|step\s+\d{1,3}\s*[:.)-]\s*|then\s+|and\s+(?:then\s+)?|next,?\s+|finally,?\s+|first,?\s+)/i, '')
    .replace(/^(?:then|and)\s+/i, '').replace(/[.;]+$/, '').trim();
}
function cssReference(raw: string): TargetReference | null {
  const css = raw.trim();
  if (/^css\s*[:=]\s*/i.test(css)) return { css: css.replace(/^css\s*[:=]\s*/i, '') };
  if (/^testid\s*[:=]\s*/i.test(css)) return { testid: css.replace(/^testid\s*[:=]\s*/i, '') };
  if (/^(?:#[A-Za-z_][\w-]*|\.[A-Za-z_][\w-]*|\[[^\]]+\])(?:[\s>+~]*(?:[#.][A-Za-z_][\w-]*|\[[^\]]+\]|[a-z][\w-]*))*$/.test(css)) return { css };
  return null;
}
/** Parse a target reference made of quoted text, optional kind words, or a selector. */
function reference(fragment: string, quoted: string[]): TargetReference | null {
  const text = fragment.trim().replace(/^(?:on|at)\s+/i, '');
  const value = (token: string) => quoted[Number(/^⟦(\d+)⟧$/.exec(token)?.[1] ?? -1)];
  let match = new RegExp(`^(?:the\\s+|a\\s+|an\\s+)?(⟦\\d+⟧)(?:\\s+(${KIND_PATTERN}))?$`, 'i').exec(text);
  if (match) {
    const quote = value(match[1]!)!;
    const selector = cssReference(quote);
    if (selector) return selector;
    return { text: quote, ...(match[2] ? { kind: KIND_WORDS[match[2].toLowerCase().replace(/\s+/g, ' ')]! } : {}) };
  }
  match = new RegExp(`^(?:the\\s+|a\\s+|an\\s+)?(${KIND_PATTERN})\\s+(?:labelled\\s+|labeled\\s+|named\\s+|called\\s+|with\\s+text\\s+)?(⟦\\d+⟧)$`, 'i').exec(text);
  if (match) return { text: value(match[2]!)!, kind: KIND_WORDS[match[1]!.toLowerCase().replace(/\s+/g, ' ')]! };
  match = /^(?:the\s+)?element\s+with\s+(?:the\s+)?(id|test\s*id|testid|selector)\s+(⟦\d+⟧)$/i.exec(text);
  if (match) {
    const raw = value(match[2]!)!;
    const kind = match[1]!.toLowerCase().replace(/\s+/g, '');
    if (kind === 'id') return /^[A-Za-z_][\w-]*$/.test(raw) ? { css: `#${raw}` } : null;
    return kind === 'selector' ? { css: raw } : { testid: raw };
  }
  return cssReference(text);
}
function problem(line: number, text: string, message: string, suggestion: string): ParseProblem { return { line, text, message, suggestion }; }
function repetitions(word: string | undefined): number {
  if (!word) return 1;
  const normalized = word.toLowerCase().replace(/\s+times?$/, '');
  return COUNT_WORDS[normalized] ?? Number(normalized);
}
function key(raw: string): string | null {
  const parts = raw.split(/\s*\+\s*|\s+/).filter(Boolean);
  if (!parts.length || parts.length > 4) return null;
  const last = parts.pop()!;
  const main = KEYS[last.toLowerCase()] ?? (/^[a-z0-9]$/i.test(last) ? last.toUpperCase() : /^f(?:[1-9]|1[0-2])$/i.test(last) ? last.toUpperCase() : null);
  if (!main) return null;
  const modifiers = parts.map(part => MODIFIERS[part.toLowerCase()]);
  if (modifiers.some(modifier => !modifier)) return null;
  return [...modifiers, main].join('+');
}
function navigationTarget(raw: string): string | null {
  const value = raw.trim();
  if (/^(?:the\s+)?(?:app|application|site|home\s*page|homepage|start\s+page|main\s+page)$/i.test(value)) return '/';
  if (value.startsWith('/') && !value.startsWith('//') && value.length <= 512 && !/\s/.test(value)) return value;
  try {
    const url = new URL(value);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password) return `${url.pathname}${url.search}${url.hash}`;
  } catch { /* not an absolute URL */ }
  return null;
}

/** Parse "What went wrong?" text: understood actions, reporter notes and unclear lines. */
export function parseSteps(input: string): ParsedSteps {
  const actions: DraftAction[] = [], notes: string[] = [], problems: ParseProblem[] = [];
  const lines = input.split(/\r?\n/);
  lines.forEach((rawLine, offset) => {
    const lineNumber = offset + 1;
    const raw = rawLine.trim();
    if (!raw) return;
    if (raw.length > MAX_LINE) { problems.push(problem(lineNumber, raw.slice(0, 80), 'This line is too long to understand as a step.', 'Split it into one action per line.')); return; }
    const line = clean(raw);
    const tokens = tokenize(line);
    if ('error' in tokens) { problems.push(problem(lineNumber, raw, tokens.error, 'Close each quoted value, e.g. Click "Save".')); return; }
    const { shape, quoted } = tokens;
    const q = (token: string | undefined) => quoted[Number(/⟦(\d+)⟧/.exec(token ?? '')?.[1] ?? -1)];
    const add = (kind: AppActionKind, ref: TargetReference | null, value: string, count = 1) => {
      for (let index = 0; index < count; index++) actions.push({ kind, reference: ref, value, text: line, line: lineNumber });
    };
    let match: RegExpExecArray | null;
    if ((match = /^(?:open|go to|goto|visit|navigate to|load|browse to)\s+(?:the\s+)?(?:page\s+)?(.+?)(?:\s+page)?$/i.exec(shape))) {
      const target = navigationTarget(q(match[1]) ?? match[1]!);
      if (target === null) problems.push(problem(lineNumber, raw, 'Repro opens pages of your local app only.', 'Write a path such as Open /cart, or Open the app.'));
      else add('navigate', null, target);
      return;
    }
    if (/^(?:reload|refresh)(?:\s+the\s+page)?$/i.test(shape)) { add('reload', null, ''); return; }
    if ((match = /^press\s+(?:the\s+)?(.+?)(?:\s+key)?(?:\s+(?:in|on|inside)\s+(.+))?$/i.exec(shape)) && !/⟦/.test(match[1]!) && key(match[1]!)) {
      const ref = match[2] ? reference(match[2], quoted) : null;
      if (match[2] && !ref) { problems.push(problem(lineNumber, raw, 'The field to press the key in is unclear.', 'Quote its label, e.g. Press Enter in "New todo".')); return; }
      add('press', ref, key(match[1]!)!); return;
    }
    if ((match = /^(?:type|enter|input|write)\s+(⟦\d+⟧)\s+(?:into|in|in to)\s+(.+)$/i.exec(shape))
      || (match = /^(?:fill(?:\s+in)?|set|change)\s+(.+?)\s+(?:with|to)\s+(⟦\d+⟧)$/i.exec(shape))) {
      const valueFirst = /^(?:type|enter|input|write)/i.test(shape);
      const ref = reference(valueFirst ? match[2]! : match[1]!, quoted);
      const value = q(valueFirst ? match[1] : match[2])!;
      if (!ref) { problems.push(problem(lineNumber, raw, 'The field to type into is unclear.', 'Quote the field label or placeholder, e.g. Type "milk" into "Add an item".')); return; }
      add('fill', ref, value); return;
    }
    if ((match = /^(?:clear|empty)\s+(.+)$/i.exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'The field to clear is unclear.', 'Quote its label, e.g. Clear "Search".')); return; }
      add('fill', ref, ''); return;
    }
    if ((match = /^(?:select|choose|pick)\s+(⟦\d+⟧)\s+(?:in|from|on)\s+(.+)$/i.exec(shape))) {
      const ref = reference(match[2]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'The drop-down is unclear.', 'Quote its label, e.g. Select "Blue" from "Color".')); return; }
      add('select', ref, q(match[1])!); return;
    }
    if ((match = /^(check|tick|uncheck|untick)\s+(.+)$/i.exec(shape))) {
      const ref = reference(match[2]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'The checkbox is unclear.', 'Quote its label, e.g. Check "Remember me".')); return; }
      add(/^un/i.test(match[1]!) ? 'uncheck' : 'check', ref, ''); return;
    }
    if ((match = /^double[- ]?click\s+(?:on\s+)?(.+)$/i.exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'What to double-click is unclear.', 'Quote its visible text, e.g. Double-click "Milk".')); return; }
      add('dblclick', ref, ''); return;
    }
    if ((match = /^(?:hover(?:\s+over)?|mouse\s+over)\s+(.+)$/i.exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'What to hover over is unclear.', 'Quote its visible text, e.g. Hover over "Menu".')); return; }
      add('hover', ref, ''); return;
    }
    if ((match = /^wait\s+(?:for|until)\s+(.+?)(?:\s+(?:to\s+)?(?:appears?|is\s+visible|shows?\s+up|is\s+shown))?$/i.exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'What to wait for is unclear.', 'Quote the text that should appear, e.g. Wait for "Saved".')); return; }
      add('wait-for', ref, ''); return;
    }
    if ((match = /^(?:click|tap|press|hit|select|choose)\s+(?:on\s+)?(.+?)(?:\s+(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+times|\s+(once|twice|thrice))?(?:\s+again)?$/i.exec(shape))) {
      const ref = reference(match[1]!, quoted);
      const count = repetitions(match[2] ?? match[3]);
      if (!ref) { problems.push(problem(lineNumber, raw, 'What to click is unclear.', 'Quote its visible text or label, e.g. Click "Add to cart" or Click the "Delete Eggs" button.')); return; }
      if (!Number.isInteger(count) || count < 1 || count > 20) { problems.push(problem(lineNumber, raw, 'Repeat counts must be between 1 and 20.', 'Write e.g. Click "Add" 3 times.')); return; }
      add('click', ref, '', count); return;
    }
    // Statements of what was observed stay in the report as the reporter's words.
    notes.push(line);
  });
  if (actions.length > MAX_STEPS) problems.push(problem(0, '', `Repro supports at most ${MAX_STEPS} steps.`, 'Describe the shortest sequence you know.'));
  if (actions.length && actions[0]!.kind !== 'navigate') actions.unshift({ kind: 'navigate', reference: null, value: '/', text: 'Open the app', line: 0 });
  return { actions, notes, problems };
}

const SHOULD = String.raw`(?:should|must|needs to|ought to|is expected to)`;
/** Parse "What should happen?" text into explicit checks plus reporter notes. */
export function parseExpectation(input: string): ParsedExpectation {
  const checks: DraftCheck[] = [], notes: string[] = [], problems: ParseProblem[] = [];
  const sentences: { text: string; line: number }[] = [];
  input.split(/\r?\n/).forEach((rawLine, offset) => {
    for (const part of rawLine.split(/(?<=[.!?])\s+(?=[A-Z"“'])/)) if (part.trim()) sentences.push({ text: part.trim(), line: offset + 1 });
  });
  for (const { text: raw, line: lineNumber } of sentences) {
    if (raw.length > MAX_LINE) { problems.push(problem(lineNumber, raw.slice(0, 80), 'This sentence is too long to understand as a check.', 'Write one expected result per line.')); continue; }
    const line = clean(raw).replace(/[!]+$/, '');
    const tokens = tokenize(line);
    if ('error' in tokens) { problems.push(problem(lineNumber, raw, tokens.error, 'Close each quoted value, e.g. "Total" should show "$8.10".')); continue; }
    const { shape, quoted } = tokens;
    const q = (token: string | undefined) => quoted[Number(/⟦(\d+)⟧/.exec(token ?? '')?.[1] ?? -1)];
    const add = (ref: TargetReference | null, property: CheckProperty, comparison: Comparison, expected: string) =>
      checks.push({ reference: ref, property, comparison, expected, text: line, line: lineNumber });
    let match: RegExpExecArray | null;
    if (new RegExp(`^(?:there\\s+${SHOULD}\\s+be\\s+no|no)\\s+(?:javascript\\s+|js\\s+|page\\s+|uncaught\\s+|console\\s+)?(?:errors?|exceptions?)(?:\\s+(?:should\\s+)?(?:appear|occur|happen|be\\s+(?:thrown|raised|logged)))?(?:\\s+in\\s+the\\s+(?:page|console))?$`, 'i').test(shape)) { add(null, 'page-errors', 'equals', '0'); continue; }
    if ((match = new RegExp(`^(?:I|we|the\\s+user|you)\\s+${SHOULD}\\s+(not\\s+)?see\\s+(⟦\\d+⟧)(?:\\s+on\\s+the\\s+page)?$`, 'i').exec(shape))
      || (match = new RegExp(`^the\\s+page\\s+${SHOULD}\\s+(not\\s+)?(?:show|contain|display|include)\\s+(⟦\\d+⟧)$`, 'i').exec(shape))) {
      add({ css: 'body' }, 'text', match[1] ? 'not-contains' : 'contains', q(match[2])!); continue;
    }
    if ((match = new RegExp(`^the\\s+(?:url|address|path)\\s+${SHOULD}\\s+(not\\s+)?(be|equal|contain|include)\\s+(⟦\\d+⟧)$`, 'i').exec(shape))) {
      const contains = /contain|include/i.test(match[2]!);
      add(null, 'url', match[1] ? (contains ? 'not-contains' : 'not-equals') : (contains ? 'contains' : 'equals'), q(match[3])!); continue;
    }
    if ((match = new RegExp(`^(.+?)\\s+${SHOULD}\\s+(not\\s+)?(?:appear|be\\s+(?:visible|shown|displayed))(?:\\s+(\\d{1,3})\\s+times?)?$`, 'i').exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'The element is unclear.', 'Quote its text or label, e.g. "Saved" should appear.')); continue; }
      if (match[3]) add(ref, 'count', match[2] ? 'not-equals' : 'equals', String(Number(match[3])));
      else add(ref, 'visible', 'equals', match[2] ? 'false' : 'true');
      continue;
    }
    if ((match = new RegExp(`^(.+?)\\s+${SHOULD}\\s+(?:disappear|be\\s+(?:hidden|gone|removed))$`, 'i').exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'The element is unclear.', 'Quote its text or label, e.g. "Loading" should disappear.')); continue; }
      add(ref, 'visible', 'equals', 'false'); continue;
    }
    if ((match = new RegExp(`^(.+?)\\s+${SHOULD}\\s+(?:be\\s+|stay\\s+|remain\\s+)?(not\\s+)?(checked|ticked|selected|unchecked|unticked)$`, 'i').exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'The checkbox is unclear.', 'Quote its label, e.g. "Remember me" should be checked.')); continue; }
      const checked = !/^un/i.test(match[3]!) !== Boolean(match[2]);
      add(ref, 'checked', 'equals', String(checked)); continue;
    }
    if ((match = new RegExp(`^(.+?)\\s+${SHOULD}\\s+be\\s+empty$`, 'i').exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'The field is unclear.', 'Quote its label, e.g. "Search" should be empty.')); continue; }
      add(ref, 'value', 'equals', ''); continue;
    }
    if ((match = new RegExp(`^(.+?)\\s+${SHOULD}\\s+(?:still\\s+)?(not\\s+)?(?:have|contain)\\s+(?:the\\s+)?value\\s+(⟦\\d+⟧)$`, 'i').exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'The field is unclear.', 'Quote its label, e.g. "Quantity" should have value "2".')); continue; }
      add(ref, 'value', match[2] ? 'not-equals' : 'equals', q(match[3])!); continue;
    }
    if ((match = new RegExp(`^(.+?)\\s+${SHOULD}\\s+(?:still\\s+|now\\s+|then\\s+)?(not\\s+)?(contain|include|show|display|read|say|be|equal|have\\s+(?:the\\s+)?text|change\\s+to|update\\s+to|become)\\s+(?:the\\s+text\\s+)?(⟦\\d+⟧)$`, 'i').exec(shape))) {
      const ref = reference(match[1]!, quoted);
      if (!ref) { problems.push(problem(lineNumber, raw, 'The element is unclear.', 'Quote its label or use a CSS selector, e.g. "#total" should show "$8.10".')); continue; }
      const contains = /contain|include/i.test(match[3]!);
      add(ref, 'text', match[2] ? (contains ? 'not-contains' : 'not-equals') : (contains ? 'contains' : 'equals'), q(match[4])!); continue;
    }
    if (/⟦\d+⟧/.test(shape) && new RegExp(`\\b${SHOULD}\\b`, 'i').test(shape)) {
      problems.push(problem(lineNumber, raw, 'This looks like an expected result, but Repro could not tell which element to check.',
        'Quote the element as well as the value, e.g. "Items left" should show "2 items left", or "#items-left" should show "2 items left".'));
      continue;
    }
    notes.push(line);
  }
  if (checks.length > MAX_CHECKS) problems.push(problem(0, '', `Repro supports at most ${MAX_CHECKS} checks.`, 'Keep the checks that decide whether the bug is fixed.'));
  return { checks, notes, problems };
}

/** Human description of a reference for UI and report text. */
export function describeReference(ref: TargetReference | AppTarget | null): string {
  if (!ref) return 'the page';
  if ('by' in ref) {
    if (ref.by === 'role') return ref.match === 'contains' ? `the ${ref.role ?? 'element'} whose name contains "${ref.value}"` : `the ${ref.role ?? 'element'} "${ref.value}"`;
    if (ref.by === 'css') return ref.value === 'body' ? 'the page' : `the element \`${ref.value}\``;
    if (ref.by === 'testid') return `the element with test id "${ref.value}"`;
    return `the element with ${({ label: 'label', placeholder: 'placeholder', text: 'text', title: 'title', alt: 'alt text' } as Record<string, string>)[ref.by]} "${ref.value}"`;
  }
  if (ref.css) return ref.css === 'body' ? 'the page' : `the element \`${ref.css}\``;
  if (ref.testid) return `the element with test id "${ref.testid}"`;
  return `${ref.kind && ref.kind !== 'element' ? `the "${ref.text}" ${ref.kind === 'field' ? 'field' : ref.kind}` : `"${ref.text}"`}`;
}
export function describeAction(action: { kind: AppActionKind; value: string; secret?: string | null }, target: string): string {
  const value = action.secret ? `the value of $${action.secret}` : `"${action.value}"`;
  switch (action.kind) {
    case 'navigate': return `Open \`${action.value}\``;
    case 'reload': return 'Reload the page';
    case 'click': return `Click ${target}`;
    case 'dblclick': return `Double-click ${target}`;
    case 'fill': return action.value === '' && !action.secret ? `Clear ${target}` : `Type ${value} into ${target}`;
    case 'press': return `Press ${action.value}${target !== 'the page' ? ` in ${target}` : ''}`;
    case 'check': return `Check ${target}`;
    case 'uncheck': return `Uncheck ${target}`;
    case 'select': return `Select ${value} in ${target}`;
    case 'hover': return `Hover over ${target}`;
    case 'wait-for': return `Wait for ${target} to appear`;
  }
}
export function describeCheck(check: { property: CheckProperty; comparison: Comparison; expected: string }, target: string): string {
  const not = check.comparison.startsWith('not-');
  const verb = check.comparison.endsWith('contains') ? (not ? 'does not contain' : 'contains') : (not ? 'is not' : 'is');
  switch (check.property) {
    case 'text': return `${target} text ${verb} "${check.expected}"`;
    case 'value': return `${target} value ${verb} "${check.expected}"`;
    case 'checked': return `${target} is ${check.expected === 'true' ? 'checked' : 'not checked'}`;
    case 'visible': return `${target} is ${check.expected === 'true' ? 'visible' : 'not visible'}`;
    case 'count': return `${target} appears ${not ? 'other than ' : ''}${check.expected} time${check.expected === '1' ? '' : 's'}`;
    case 'url': return `the page URL ${verb} "${check.expected}"`;
    case 'page-errors': return 'no uncaught JavaScript errors occur';
  }
}
