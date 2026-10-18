import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { parseExpectation, parseSteps, describeAction, describeCheck, describeReference } from '../src/steps.js';

/**
 * The primary experience: one page from "my app + what went wrong" to one
 * REPRO.md. Internal stages, digests and run ids stay behind <details>.
 */
interface Question { field: string; question: string; line?: number; suggestion?: string; candidates?: { selector: string; text: string }[]; check?: number }
interface AppSummary {
  name: string; directory: string | null;
  run: { kind: string; command: string | null; url: string | null; source: string } | null;
  install: string | null; dependenciesInstalled: boolean | null;
  source: { commit: string | null; branch: string | null; dirty: boolean; changed: number; remote: string | null; pushed: boolean } | null;
  missing: { field: string; question: string }[]; notes: string[];
}
interface ReportView {
  id: string; createdAt: string; status: string; title: string | null;
  request?: { app: { repository?: string; url?: string; start?: string }; title: string | null; wentWrong: string; shouldHappen: string; checkSelectors?: Record<number, string>; stepsIndependent?: boolean };
  result: { status: string; summary: string; title?: string; path: string | null; questions?: Question[]; understood?: { steps: string[]; checks: string[] } } | null;
}
interface ReportEvent { seq: number; at: string; stage: string; message: string }
/** checkSelectors apply only to the exact "What should happen?" text they were chosen for (selectorsFor). */
interface Draft { folder: string; url: string; start: string; title: string; wentWrong: string; shouldHappen: string; checkSelectors: Record<number, string>; selectorsFor: string; reportBlocked: boolean; stepsIndependent: boolean }
const EMPTY: Draft = { folder: '', url: '', start: '', title: '', wentWrong: '', shouldHappen: '', checkSelectors: {}, selectorsFor: '', reportBlocked: false, stepsIndependent: false };
const DRAFT_KEY = 'repro.report.draft';
const STAGES: { key: string; label: string }[] = [
  { key: 'inspect', label: 'Checking your app' },
  { key: 'capture', label: 'Following your steps in a fresh browser' },
  { key: 'reproduce', label: 'Reproducing from a fresh start' },
  { key: 'reduce', label: 'Looking for the shortest steps' },
  { key: 'confirm', label: 'Confirming the shorter steps' },
  { key: 'test', label: 'Writing the regression test' },
  { key: 'fresh-check', label: 'Checking the report in a fresh checkout' },
  { key: 'write', label: 'Writing REPRO.md' },
];
const STATUS_TEXT: Record<string, string> = { reproduced: 'Reproduced', intermittent: 'Intermittent', 'not-reproduced': 'Not reproduced', blocked: 'Blocked',
  'needs-input': 'Needs your input', cancelled: 'Cancelled', failed: 'Could not finish', interrupted: 'Interrupted', running: 'Working…' };
const STATUS_CLASS: Record<string, string> = { reproduced: 'outcome-target-failure', intermittent: 'outcome-inconclusive', 'not-reproduced': 'outcome-requirement-satisfied',
  blocked: 'outcome-inconclusive', 'needs-input': 'outcome-inconclusive', cancelled: 'outcome-cancelled', failed: 'outcome-failed', interrupted: 'outcome-interrupted', running: 'outcome-running' };

async function call<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Repro-Token': token ?? '' }, body: JSON.stringify(body) }) });
  const data = await response.json() as T & { error?: { reason?: string } };
  if (!response.ok) throw new Error(data.error?.reason ?? 'The local Repro service could not complete this request.');
  return data;
}
/** Show `code` spans from Repro's own descriptions as code; everything else is plain text. */
function rich(text: string): ReactNode[] { return text.split(/(`[^`]+`)/).map((part, index) => part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={index}>{part.slice(1, -1)}</code> : part); }
function loadDraft(): Draft {
  try { return { ...EMPTY, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Draft> }; } catch { return EMPTY; }
}
function saveDraft(draft: Draft) { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage is a convenience only */ } }

export function ReportPage({ reportId }: { reportId: string | null }) {
  const [token, setToken] = useState('');
  const [platform, setPlatform] = useState('');
  const [example, setExample] = useState<{ title: string; wentWrong: string; shouldHappen: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void call<{ token: string; platform: string; example: { title: string; wentWrong: string; shouldHappen: string } }>('/api/config')
      .then(config => { setToken(config.token); setPlatform(config.platform); setExample(config.example); })
      .catch(() => setError('Repro’s local service is not responding. Start it with `repro serve` and reload this page.'));
  }, []);
  return <div className="report-shell">
    <header className="report-top">
      <a className="report-brand" href="#/" aria-label="Repro: new report"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 9-5 9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10M7 5l9 5v5" /></svg><span>repro</span></a>
      <nav aria-label="Repro"><a href="#/" aria-current={reportId ? undefined : 'page'}>New report</a><a href="#/new">Built-in examples</a></nav>
    </header>
    <main id="main" className="report-page" tabIndex={-1}>
      {error && <p className="report-error" role="alert">{error}</p>}
      {reportId ? <ReportStatus id={reportId} token={token} /> : <ReportForm token={token} platform={platform} example={example} />}
    </main>
  </div>;
}

function ReportForm({ token, platform, example }: { token: string; platform: string; example: { title: string; wentWrong: string; shouldHappen: string } | null }) {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [app, setApp] = useState<{ app: AppSummary; scope: string[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [appError, setAppError] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [recent, setRecent] = useState<{ id: string; createdAt: string; status: string; title: string | null }[]>([]);
  const requestKey = useRef<string>('');
  const confirmBox = useRef<HTMLInputElement>(null);
  const expectField = useRef<HTMLTextAreaElement>(null);
  const [demoNote, setDemoNote] = useState('');
  const update = (patch: Partial<Draft>) => {
    // Any change to what will run invalidates the confirmation.
    if (['folder', 'url', 'start', 'wentWrong', 'shouldHappen', 'checkSelectors', 'stepsIndependent', 'reportBlocked'].some(key => key in patch)) setConfirmed(false);
    setDraft(current => {
      const next = { ...current, ...patch };
      // A changed expectation invalidates element choices made for the old one.
      if (next.shouldHappen !== next.selectorsFor) { next.checkSelectors = {}; next.selectorsFor = next.shouldHappen; }
      saveDraft(next); return next;
    });
  };
  const inspection = useRef(0);
  useEffect(() => { void call<{ reports: typeof recent }>('/api/reports').then(data => setRecent(data.reports.slice(0, 6))).catch(() => undefined); }, []);
  // Inspect the app (read-only) shortly after the location changes.
  useEffect(() => {
    if (!token || (!draft.folder.trim() && !draft.url.trim())) { setApp(null); setAppError(''); return; }
    // Until the new inspection answers, the old scope must not be confirmable or runnable.
    const sequence = ++inspection.current;
    setChecking(true); setConfirmed(false);
    const timer = setTimeout(() => {
      setAppError('');
      void call<{ app: AppSummary; scope: string[] }>('/api/app/inspect', token, { repository: draft.folder.trim() || undefined, url: draft.url.trim() || undefined, start: draft.start.trim() || undefined })
        .then(result => { if (sequence === inspection.current) setApp(result); })
        .catch(cause => { if (sequence === inspection.current) { setApp(null); setAppError(cause instanceof Error ? cause.message : String(cause)); } })
        .finally(() => { if (sequence === inspection.current) setChecking(false); });
    }, 450);
    return () => clearTimeout(timer);
  }, [draft.folder, draft.url, draft.start, token]);
  const steps = useMemo(() => parseSteps(draft.wentWrong), [draft.wentWrong]);
  const expected = useMemo(() => parseExpectation(draft.shouldHappen), [draft.shouldHappen]);
  const needsStart = app?.app.missing.some(item => item.field === 'start') ?? false;
  const placeholder = expected.checks.some(check => check.expected === '(expected value)');
  const ready = Boolean(app && !checking && !app.app.missing.length && steps.actions.length && expected.checks.length && !steps.problems.length && !expected.problems.length && !placeholder);
  const choose = async () => {
    setMessage('');
    try { const result = await call<{ path: string | null }>('/api/app/choose-folder', token, {}); if (result.path) update({ folder: result.path }); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
  };
  const tryExample = async () => {
    setBusy(true); setMessage('');
    try {
      const created = await call<{ path: string; title: string; wentWrong: string; shouldHappen: string }>('/api/examples/local-app', token, {});
      update({ ...EMPTY, folder: created.path, title: created.title, wentWrong: created.wentWrong, shouldHappen: created.shouldHappen });
      setMessage('An example app was copied into Repro’s workspace. Review the description, then generate a report.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  async function generate() {
    if (busy || !token || checking || !ready) return;
    setBusy(true); setMessage(''); setQuestions([]);
    const body = { app: { repository: draft.folder.trim() || undefined, url: draft.url.trim() || undefined, start: draft.start.trim() || undefined },
      title: draft.title.trim() || undefined, wentWrong: draft.wentWrong, shouldHappen: draft.shouldHappen,
      checkSelectors: draft.selectorsFor === draft.shouldHappen ? draft.checkSelectors : {}, reportBlocked: draft.reportBlocked, stepsIndependent: draft.stepsIndependent };
    try {
      const prepared = await call<{ questions: Question[] }>('/api/reports/prepare', token, body);
      if (prepared.questions.length) { setQuestions(prepared.questions); setMessage('Repro needs a little more information; see the questions below.'); return; }
      if (!confirmed) { setMessage('Confirm what Repro will run, then generate the report.'); confirmBox.current?.focus(); return; }
      requestKey.current ||= crypto.randomUUID();
      const { report } = await call<{ report: { id: string } }>('/api/reports', token, { ...body, confirmed: true, requestKey: requestKey.current });
      requestKey.current = '';
      location.hash = `#/reports/${report.id}`;
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  const questionsFor = (field: string) => questions.filter(question => question.field === field || (field === 'app' && ['repository', 'start', 'url', 'install'].includes(question.field)));
  return <form className="report-form" onSubmit={event => { event.preventDefault(); void generate(); }} noValidate>
    <div className="report-intro">
      <h1>Turn a bug into one REPRO.md</h1>
      <p className="muted">Point Repro at your app and describe the bug. Repro reproduces it in a fresh browser, shortens the steps, and writes one Markdown file with a regression test your teammate or coding agent can run. Everything stays on this machine.</p>
      {example && <p className="small"><button type="button" className="link-button" onClick={() => void tryExample()} disabled={busy || !token}>Try it with an example app</button></p>}
    </div>

    <section className="report-section" aria-labelledby="app-heading">
      <h2 id="app-heading"><span className="step-number">1</span>Your app</h2>
      <label className="report-field">App folder
        <span className="field-row">
          <input value={draft.folder} onChange={event => update({ folder: event.target.value })} placeholder="/Users/you/projects/my-app" autoComplete="off" spellCheck={false} aria-describedby="folder-hint" />
          {platform === 'darwin' && <button type="button" onClick={() => void choose()} disabled={!token}>Choose…</button>}
        </span>
      </label>
      <p id="folder-hint" className="field-hint">The folder of a web app you own or may test. Repro reads it but never changes it.</p>
      <label className="report-field"><span>Already running at <span className="optional">optional</span></span>
        <input value={draft.url} onChange={event => update({ url: event.target.value })} placeholder="http://localhost:5173" autoComplete="off" spellCheck={false} />
      </label>
      {(needsStart || draft.start) && <label className="report-field">How do you start it?
        <input value={draft.start} onChange={event => update({ start: event.target.value })} placeholder="npm run dev" autoComplete="off" spellCheck={false} />
      </label>}
      <div className="app-summary" aria-live="polite">
        {checking && <p className="muted small">Checking the app…</p>}
        {appError && <p className="question" role="alert">{appError}</p>}
        {app && !checking && <AppFacts app={app.app} />}
        {questionsFor('app').map((question, index) => <p key={index} className="question" role="alert">{question.question}</p>)}
      </div>
    </section>

    <section className="report-section" aria-labelledby="bug-heading">
      <h2 id="bug-heading"><span className="step-number">2</span>The bug</h2>
      <label className="report-field">What went wrong?
        <textarea value={draft.wentWrong} onChange={event => update({ wentWrong: event.target.value })} rows={8} spellCheck={false} aria-describedby="steps-hint"
          placeholder={'Write the steps you took, one per line, then what you saw:\nOpen the app\nType "Milk" into "Add an item"\nPress Enter\nClick "Delete Milk"\nThe counter shows "-1 items left"'} />
      </label>
      <p id="steps-hint" className="field-hint">Quote what you clicked or typed into, as it appears on the page. Lines that are not steps are kept as your notes.</p>
      <label className="report-field">What should happen?
        <textarea ref={expectField} value={draft.shouldHappen} onChange={event => update({ shouldHappen: event.target.value })} rows={3} spellCheck={false} aria-describedby="expect-hint"
          placeholder={'"#items-left" should show "0 items left"'} />
      </label>
      <p id="expect-hint" className="field-hint">Name the element and the value, e.g. <code>"Total" should show "$8.10"</code>, <code>"Saved" should appear</code>, <code>there should be no errors</code>.</p>
      {app && !app.app.missing.length && <Demonstration token={token} app={draft} onFinished={(recorded, checks) => {
        update({ wentWrong: recorded, ...(checks ? { shouldHappen: checks } : {}) });
        setDemoNote(checks ? 'Your steps were added. In “What should happen?”, replace (expected value) with what the marked element should show.' : 'Your steps were added. Now say what should happen.');
        requestAnimationFrame(() => { const field = expectField.current; if (!field) return; field.focus(); const at = field.value.indexOf('(expected value)'); if (at >= 0) field.setSelectionRange(at, at + '(expected value)'.length); });
      }} />}
      {demoNote && <p className="question" role="status">{demoNote}</p>}
      <Understood steps={steps} expected={expected} selectors={draft.checkSelectors} onClearSelectors={() => update({ checkSelectors: {} })} />
      {draft.reportBlocked && <p className="question">This report will be written even if a step cannot be performed (status <strong>Blocked</strong>). <button type="button" className="link-button" onClick={() => update({ reportBlocked: false })}>Undo</button></p>}
      {[...questionsFor('steps'), ...questionsFor('expectation')].map((question, index) => <p key={index} className="question" role="alert">{question.question}{question.suggestion ? ` ${question.suggestion}` : ''}</p>)}
      <details className="grammar"><summary>How to write steps and checks</summary><Grammar /></details>
      <details><summary>More options</summary>
        <label className="report-field"><span>Title <span className="optional">optional</span></span><input value={draft.title} onChange={event => update({ title: event.target.value })} placeholder="Deleting a bought item lowers the counter" /></label>
        {!needsStart && <label className="report-field"><span>Start command <span className="optional">overrides the detected one</span></span><input value={draft.start} onChange={event => update({ start: event.target.value })} placeholder="npm run dev" spellCheck={false} /></label>}
        <label className="consent"><input type="checkbox" checked={draft.stepsIndependent} onChange={event => update({ stepsIndependent: event.target.checked })} />
          <span>The expected values above stay the same whichever of my steps run. Repro may then remove steps that don’t affect the failure. Leave this off when, say, “3 items left” only makes sense after adding three items.</span></label>
      </details>
    </section>

    <section className="report-section" aria-labelledby="run-heading">
      <h2 id="run-heading"><span className="step-number">3</span>Generate</h2>
      {app && <><p className="small">Repro will:</p><ul className="scope">{app.scope.map((line, index) => <li key={index}>{rich(line)}</li>)}</ul></>}
      <label className="consent"><input ref={confirmBox} type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!app} />
        <span>The steps and checks above are right, and Repro may run them as described.</span></label>
      <button className="primary generate" type="submit" disabled={busy || !token || !ready}>{busy ? 'Starting…' : 'Generate report'}</button>
      {!ready && <p className="field-hint">{!app ? 'Add your app folder (or a running URL) first.' : !steps.actions.length ? 'Describe at least one step.' : !expected.checks.length ? 'Say what should happen, naming the element and the value.' : placeholder ? 'Replace (expected value) with what the element should show.' : 'Resolve the highlighted lines first.'}</p>}
      {message && <p className="question" role="status">{message}</p>}
    </section>
    {recent.length > 0 && <section className="recent" aria-labelledby="recent-heading"><h2 id="recent-heading">Recent reports</h2>
      <ul>{recent.map(item => <li key={item.id}><a href={`#/reports/${item.id}`}>{item.title ?? 'Untitled report'}</a> <span className={`badge ${STATUS_CLASS[item.status] ?? ''}`}>{STATUS_TEXT[item.status] ?? item.status}</span> <span className="muted small">{new Date(item.createdAt).toLocaleString()}</span></li>)}</ul></section>}
  </form>;
}

interface DemonstrationState { id: string; status: string; steps: string[]; checks: string[]; notes: string[]; reason?: string }
/** Guided demonstration: record the bug once in a real browser window; the text returns to the form for review. */
function Demonstration({ token, app, onFinished }: { token: string; app: Draft; onFinished: (steps: string, checks: string) => void }) {
  const [state, setState] = useState<DemonstrationState | null>(null);
  const [error, setError] = useState('');
  const finished = useRef(false);
  const apply = useCallback((demo: DemonstrationState) => {
    if (finished.current) return;
    finished.current = true;
    onFinished([...demo.steps, ...demo.notes].join('\n'), demo.checks.join('\n'));
  }, [onFinished]);
  useEffect(() => {
    if (!state || state.status !== 'recording') return;
    let failures = 0;
    const timer = setInterval(() => {
      void call<{ demonstration: DemonstrationState }>(`/api/demonstrations/${state.id}`).then(result => {
        failures = 0;
        setState(result.demonstration);
        if (result.demonstration.status === 'finished') apply(result.demonstration);
      }).catch(cause => {
        // A restarted workbench no longer knows this demonstration: stop waiting and say so.
        if (++failures >= 3) setState(current => current ? { ...current, status: 'failed', reason: `The demonstration was lost (${cause instanceof Error ? cause.message : String(cause)}). Start it again.` } : current);
      });
    }, 800);
    return () => clearInterval(timer);
  }, [state, apply]);
  const [asking, setAsking] = useState(false);
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setError(''); finished.current = false; setStarting(true);
    try { setState((await call<{ demonstration: DemonstrationState }>('/api/demonstrations', token, { repository: app.folder.trim() || undefined, url: app.url.trim() || undefined, start: app.start.trim() || undefined, confirmed: true })).demonstration); setAsking(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setStarting(false); }
  };
  const done = async () => {
    if (!state) return;
    try { const result = await call<{ demonstration: DemonstrationState }>(`/api/demonstrations/${state.id}/finish`, token, {}); setState(result.demonstration); apply(result.demonstration); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  if (!state || state.status === 'finished') return <div className="demonstrate">
    {!asking ? <><button type="button" onClick={() => setAsking(true)} disabled={!token}>Show me in a browser instead</button>
      <span className="field-hint"> Repro opens your app; do the steps once and it writes them down for you.</span></>
      : <div className="recording"><p>Repro will start your app as listed under “Repro will” below and open a browser window you can use. Requests to other hosts are blocked.</p>
        <p className="result-actions"><button type="button" className="primary" onClick={() => void start()} disabled={starting}>{starting ? 'Starting…' : 'Start the demonstration'}</button><button type="button" onClick={() => setAsking(false)} disabled={starting}>Cancel</button></p></div>}
    {error && <p className="question" role="alert">{error}</p>}</div>;
  if (state.status === 'failed') return <div className="demonstrate"><p className="question" role="alert">{state.reason}</p><button type="button" onClick={() => { setState(null); setAsking(false); }}>Back</button></div>;
  return <div className="demonstrate recording" aria-live="polite">
    <p><strong>A browser window opened with your app.</strong> Do the steps that show the bug. Use <em>Mark the wrong element</em> in the window’s toolbar on whatever shows the wrong result, then click <em>Done</em> there or here.</p>
    <ol>{state.steps.map((line, index) => <li key={index}><code>{line}</code></li>)}</ol>
    {state.checks.map((line, index) => <p key={index} className="small">Check: <code>{line}</code></p>)}
    <button type="button" className="primary" onClick={() => void done()}>Done</button>
    {error && <p className="question" role="alert">{error} <button type="button" className="link-button" onClick={() => { setState(null); setAsking(false); setError(''); }}>Close</button></p>}
  </div>;
}

function AppFacts({ app }: { app: AppSummary }) {
  const facts: ReactNode[] = [];
  if (app.run) facts.push(<>Starts with <code>{app.run.command ?? (app.run.kind === 'static' ? 'Repro’s file server' : app.run.url)}</code> <span className="muted">({app.run.source})</span></>);
  if (app.source?.commit) facts.push(<>Git commit <code>{app.source.commit.slice(0, 10)}</code>{app.source.branch ? <> on <code>{app.source.branch}</code></> : null}{app.source.dirty ? <> with {app.source.changed} uncommitted change{app.source.changed === 1 ? '' : 's'} (they go into the report)</> : null}</>);
  if (app.dependenciesInstalled === false) facts.push(<>Dependencies are not installed</>);
  return <div className="facts"><p className="facts-name"><strong>{app.name}</strong></p><ul>{facts.map((fact, index) => <li key={index}>{fact}</li>)}</ul>
    {app.notes.length > 0 && <ul className="notes">{app.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}</div>;
}

function Understood({ steps, expected, selectors, onClearSelectors }: { steps: ReturnType<typeof parseSteps>; expected: ReturnType<typeof parseExpectation>; selectors: Record<number, string>; onClearSelectors: () => void }) {
  if (!steps.actions.length && !expected.checks.length && !steps.problems.length && !expected.problems.length) return null;
  return <div className="understood" aria-live="polite"><h3>Repro understood</h3>
    {steps.actions.length > 0 && <ol>{steps.actions.map((action, index) => <li key={index}>{rich(describeAction({ ...action, secret: null }, describeReference(action.reference)))}{action.line === 0 ? <span className="muted"> (added: every report starts by opening the app)</span> : null}</li>)}</ol>}
    {expected.checks.length > 0 && <><p className="small">It will check that:</p><ul>{expected.checks.map((check, index) => <li key={index}>{rich(describeCheck(check, selectors[index] ? describeReference({ css: selectors[index] }) : describeReference(check.reference)))}{selectors[index] ? <span className="muted"> (the element you chose)</span> : null}</li>)}</ul>
      {Object.keys(selectors).length > 0 && <p className="small"><button type="button" className="link-button" onClick={onClearSelectors}>Forget the elements I chose</button></p>}</>}
    {[...steps.problems, ...expected.problems].map((problem, index) => <p key={`p${index}`} className="question">{problem.line ? `Line ${problem.line}: ` : ''}{problem.message} {problem.suggestion}</p>)}
    {steps.notes.length > 0 && <p className="small muted">Kept as your notes: {steps.notes.map(note => `“${note}”`).join(', ')}</p>}
  </div>;
}

function Grammar() {
  return <div className="small"><p>Steps, one per line:</p><ul>
    <li><code>Open the app</code>, <code>Go to /cart</code>, <code>Reload the page</code></li>
    <li><code>Click "Add to cart"</code>, <code>Click the "Save" button</code>, <code>Click "Add" 3 times</code>, <code>Double-click "Milk"</code></li>
    <li><code>Type "milk" into "New item"</code>, <code>Fill "Quantity" with "2"</code>, <code>Clear "Search"</code></li>
    <li><code>Press Enter</code>, <code>Press Escape in "Search"</code>, <code>Select "Large" from "Size"</code>, <code>Check "Remember me"</code></li>
    <li>Use a CSS selector when a label is ambiguous: <code>Click "#submit"</code></li></ul>
    <p>Checks:</p><ul>
    <li><code>"Total" should show "$8.10"</code>, <code>"#status" should contain "applied"</code></li>
    <li><code>"Saved" should appear</code>, <code>"Error" should not be visible</code>, <code>"Remember me" should be checked</code></li>
    <li><code>I should see "Order placed"</code>, <code>The URL should contain "/orders"</code>, <code>There should be no errors</code></li></ul>
    <p>Values typed into password fields, or that look like keys or personal data, are withheld from the report; the recipient supplies them as environment variables.</p></div>;
}

function ReportStatus({ id, token }: { id: string; token: string }) {
  const [report, setReport] = useState<ReportView | null>(null);
  const [events, setEvents] = useState<ReportEvent[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<'rendered' | 'markdown'>('rendered');
  const [copied, setCopied] = useState('');
  const load = useCallback(async () => {
    try {
      const data = await call<{ report: ReportView; events: ReportEvent[] }>(`/api/reports/${id}`);
      setReport(data.report); setEvents(data.events); setError('');
      if (data.report.status !== 'running' && data.report.result?.path) {
        const response = await fetch(`/api/reports/${id}/markdown`, { cache: 'no-store' });
        if (response.ok) setMarkdown(await response.text());
        else { setMarkdown(''); setError('The REPRO.md file for this report is missing on disk. Generate the report again.'); }
      }
      return data.report.status;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      return /not found/i.test(message) ? 'missing' : 'error';
    }
  }, [id]);
  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const tick = async () => {
      const status = await load();
      failures = status === 'error' ? failures + 1 : 0;
      // Poll while running; back off on transient errors; stop on a report that does not exist.
      if (!stopped && (status === 'running' || status === 'error')) timer = setTimeout(() => void tick(), status === 'error' ? Math.min(10_000, 700 * 2 ** failures) : 700);
    };
    void tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [load]);
  useEffect(() => { if (report?.status !== 'running') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [report?.status]);
  if (error && !report) return <div><p className="report-error" role="alert">{/not found/i.test(error) ? 'This report does not exist in this workspace.' : error}</p><a href="#/">Start a new report</a></div>;
  if (!report) return <p className="muted" role="status">Loading the report…</p>;
  const running = report.status === 'running';
  const reached = new Set(events.map(event => event.stage));
  const current = [...events].reverse().find(event => STAGES.some(stage => stage.key === event.stage));
  const cancel = async () => { setCancelling(true); try { await call(`/api/reports/${id}/cancel`, token, {}); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setCancelling(false); } };
  const editAgain = (selectors: Record<number, string> = {}, reportBlocked = false) => {
    const request = report.request;
    // Keep every element chosen so far for this expectation, plus the new choice.
    if (request) saveDraft({ folder: request.app.repository ?? '', url: request.app.url ?? '', start: request.app.start ?? '', title: request.title ?? '', wentWrong: request.wentWrong, shouldHappen: request.shouldHappen,
      checkSelectors: { ...(request.checkSelectors ?? {}), ...selectors }, selectorsFor: request.shouldHappen, reportBlocked, stepsIndependent: request.stepsIndependent === true });
    location.hash = '#/';
  };
  const copy = async () => { try { await navigator.clipboard.writeText(markdown); setCopied('Copied to the clipboard.'); } catch { setCopied('Copy failed; use Download instead.'); } };
  return <div className="report-status">
    <div className="status-head">
      <div><p className="eyebrow">REPORT · {new Date(report.createdAt).toLocaleString()}</p><h1>{report.result?.title ?? report.title ?? (running ? 'Generating your report' : 'Bug report')}</h1></div>
      <span className={`badge large ${STATUS_CLASS[report.status] ?? ''}`}>{STATUS_TEXT[report.status] ?? report.status}</span>
    </div>
    {running && <section className="progress" aria-labelledby="progress-heading">
      <h2 id="progress-heading" className="visually-hidden">Progress</h2>
      <ol className="stages">{STAGES.map(stage => {
        const state = current?.stage === stage.key ? 'current' : reached.has(stage.key) ? 'done' : 'pending';
        return <li key={stage.key} className={`stage-${state}`} aria-current={state === 'current' ? 'step' : undefined}><span className="stage-mark" aria-hidden="true">{state === 'done' ? '✓' : state === 'current' ? '●' : '○'}</span>{stage.label}{state === 'done' ? <span className="visually-hidden"> (done)</span> : null}</li>;
      })}</ol>
      <p className="live" role="status" aria-live="polite">{current?.message ?? 'Starting…'} <span className="muted">· {Math.max(0, Math.round((now - Date.parse(report.createdAt)) / 1000))} s</span></p>
      <p className="small muted">Stages that do not apply (for example shortening steps when the bug did not reproduce) are skipped.</p>
      <button type="button" className="danger" onClick={() => void cancel()} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel'}</button>
    </section>}
    {!running && report.result && <section className="result" aria-labelledby="result-heading">
      <h2 id="result-heading" className="visually-hidden">Result</h2>
      <p className="result-summary">{report.result.summary}</p>
      {report.status === 'needs-input' && <NeedsInput questions={report.result.questions ?? []} onRetry={editAgain} onBlocked={() => editAgain({}, true)} />}
      {['cancelled', 'failed', 'interrupted'].includes(report.status) && <p><button type="button" onClick={() => editAgain()}>Edit and try again</button></p>}
      {markdown && <>
        <div className="result-actions">
          <a className="button primary" href={`/api/reports/${id}/markdown?download=1`} download="REPRO.md">Download REPRO.md</a>
          <button type="button" onClick={() => void copy()}>Copy</button>
          <button type="button" onClick={() => editAgain()}>Start a new report from this one</button>
          <span className="small muted" role="status">{copied}</span>
        </div>
        <p className="small muted">Saved on this machine at <code>{report.result.path}</code>. Give the file to a teammate or a coding agent; they need only Node.js, npm and the app’s source.</p>
        <div className="preview-switch" role="group" aria-label="Preview format">
          <button type="button" aria-pressed={view === 'rendered'} onClick={() => setView('rendered')}>Preview</button>
          <button type="button" aria-pressed={view === 'markdown'} onClick={() => setView('markdown')}>Markdown</button>
        </div>
        {view === 'rendered' ? <article className="markdown-preview" aria-label="REPRO.md preview"><Markdown text={markdown} /></article>
          : <pre className="codeblock markdown-source" tabIndex={0} aria-label="REPRO.md source">{markdown}</pre>}
      </>}
    </section>}
    <details><summary>What Repro did ({events.length} events)</summary><ol className="event-log">{events.map(event => <li key={event.seq}><span className="muted small">{new Date(event.at).toLocaleTimeString()}</span> {event.message}</li>)}</ol></details>
    {error && <p className="report-error" role="alert">{error}</p>}
  </div>;
}

function NeedsInput({ questions, onRetry, onBlocked }: { questions: Question[]; onRetry: (selectors?: Record<number, string>) => void; onBlocked: () => void }) {
  const [choice, setChoice] = useState<Record<number, string>>({});
  return <div className="needs-input">{questions.map((question, index) => <div key={index} className="question-block">
    <p className="question">{question.question}</p>
    {question.field === 'steps' && question.candidates && question.candidates.length > 0 && <div><p className="small">Elements on the page you may mean:</p>
      <ul className="step-candidates">{question.candidates.map(candidate => <li key={candidate.selector}>{candidate.text}</li>)}</ul></div>}
    {question.field === 'check-target' && question.candidates && question.candidates.length > 0 && <fieldset><legend>Elements Repro found on the page</legend>
      {question.candidates.map(candidate => <label key={candidate.selector} className="candidate"><input type="radio" name={`check-${question.check}`} value={candidate.selector}
        checked={choice[question.check ?? 0] === candidate.selector} onChange={() => setChoice(current => ({ ...current, [question.check ?? 0]: candidate.selector }))} />
        <code>{candidate.selector}</code> <span>shows “{candidate.text}”</span></label>)}
    </fieldset>}
  </div>)}
    <p className="result-actions"><button type="button" className="primary" onClick={() => onRetry(choice)}>{Object.keys(choice).length ? 'Use this element and try again' : 'Edit the description and try again'}</button>
      {questions.some(question => question.field === 'steps' || question.field === 'start') && <button type="button" onClick={onBlocked}>Write a Blocked report anyway</button>}</p></div>;
}

/** A small renderer for the Markdown Repro itself writes. Text is always rendered as text, never as HTML. */
export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let index = 0, key = 0;
  const inline = (value: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    const pattern = /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([^*]+)\*\*|_([^_]+)_/g;
    let last = 0, match: RegExpExecArray | null;
    while ((match = pattern.exec(value))) {
      if (match.index > last) parts.push(value.slice(last, match.index));
      if (match[1]) parts.push(<code key={parts.length}>{match[2]!.trim()}</code>);
      else if (match[3]) parts.push(<strong key={parts.length}>{inline(match[3])}</strong>);
      else parts.push(<em key={parts.length}>{match[4]}</em>);
      last = match.index + match[0].length;
    }
    if (last < value.length) parts.push(value.slice(last));
    return parts;
  };
  const stack: { summary: string; children: ReactNode[] }[] = [];
  const push = (node: ReactNode) => (stack.at(-1)?.children ?? blocks).push(node);
  while (index < lines.length) {
    const line = lines[index]!;
    const fence = /^(`{3,})(.*)$/.exec(line);
    if (fence) {
      const close = lines.findIndex((candidate, at) => at > index && candidate === fence[1]);
      const end = close < 0 ? lines.length : close;
      push(<pre key={key++} className="codeblock">{fence[2]?.includes('repro-file=') ? <span className="file-label">{/repro-file=(\S+)/.exec(fence[2])?.[1]}{'\n'}</span> : null}{lines.slice(index + 1, end).join('\n')}</pre>);
      index = end + 1; continue;
    }
    const details = /^<details><summary>(.*)<\/summary>$/.exec(line);
    if (details) { stack.push({ summary: details[1]!, children: [] }); index++; continue; }
    if (line === '</details>') { const open = stack.pop(); if (open) push(<details key={key++}><summary>{open.summary}</summary>{open.children}</details>); index++; continue; }
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) { const Tag = (`h${heading[1]!.length + 1}`) as 'h2' | 'h3' | 'h4'; push(<Tag key={key++}>{inline(heading[2]!)}</Tag>); index++; continue; }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index]!.startsWith('|')) {
        const cells = lines[index]!.slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
        if (!cells.every(cell => /^-+$/.test(cell))) rows.push(cells);
        index++;
      }
      const [head, ...body] = rows;
      push(<div key={key++} className="table-scroll" tabIndex={0}><table>{head && head.some(Boolean) && <thead><tr>{head.map((cell, at) => <th key={at}>{inline(cell)}</th>)}</tr></thead>}<tbody>{body.map((row, at) => <tr key={at}>{row.map((cell, column) => <td key={column}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^(?:- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length && (/^(?:- |\d+\. )/.test(lines[index]!) || /^ {2}- /.test(lines[index]!))) {
        const item = lines[index]!;
        if (/^ {2}- /.test(item)) items.push(<li key={items.length} className="nested">{inline(item.replace(/^ {2}- /, ''))}</li>);
        else items.push(<li key={items.length}>{inline(item.replace(/^(?:- |\d+\. )/, ''))}</li>);
        index++;
      }
      push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      continue;
    }
    if (line.startsWith('> ')) {
      const quoted: string[] = [];
      while (index < lines.length && lines[index]!.startsWith('> ')) { quoted.push(lines[index]!.slice(2)); index++; }
      push(<blockquote key={key++}>{quoted.map((entry, at) => <Fragment key={at}>{inline(entry)}{at < quoted.length - 1 ? <br /> : null}</Fragment>)}</blockquote>);
      continue;
    }
    if (line.trim()) push(<p key={key++}>{inline(line)}</p>);
    index++;
  }
  return <>{blocks}</>;
}
