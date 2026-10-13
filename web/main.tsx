import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Manifest, ReductionResult, RunEvent, RunResult, Trial } from '../src/contracts.js';
import type { Job, Operation, Session } from '../src/ledger.js';
import './style.css';

const sections = ['overview', 'timeline', 'dependencies', 'reduction', 'comparison', 'export'] as const;
type Section = typeof sections[number];
const titles: Record<Section, string> = { overview: 'Overview', timeline: 'Event timeline', dependencies: 'Dependencies', reduction: 'Reduction history', comparison: 'Compare evidence', export: 'Local export' };
const operations: { key: Operation; label: string }[] = [{ key: 'record', label: 'Record again' }, { key: 'replay', label: 'Replay' }, { key: 'reduce', label: 'Reduce' }, { key: 'verify', label: 'Verify fixed revision' }, { key: 'export', label: 'Export capsule' }];
interface Route { sessionId: string | null; section: Section }
interface Snapshot { sessions: Session[]; session: Session | null; jobs: Job[]; job: Job | null; events: RunEvent[] }
interface ApiFailure { error?: { category?: string; code?: string; reason?: string } }
function route(): Route {
  const match = /^#\/sessions\/([a-zA-Z0-9_-]+)(?:\/([a-z-]+))?$/.exec(location.hash);
  return { sessionId: match?.[1] ?? null, section: sections.includes(match?.[2] as Section) ? match![2] as Section : 'overview' };
}
function href(sessionId: string | null, section: Section = 'overview'): string { return sessionId ? `#/sessions/${sessionId}/${section}` : '#/new'; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function text(value: unknown, fallback = 'Not available'): string { return typeof value === 'string' ? value : fallback; }
function asRun(value: unknown): RunResult | null { return typeof record(value)['assertionCount'] === 'number' ? value as RunResult : null; }
function asReduction(value: unknown): ReductionResult | null { return Array.isArray(record(value)['trials']) ? value as ReductionResult : null; }
function isTrial(value: unknown): value is Trial {
  const item = record(value);
  const strings = (input: unknown): input is string[] => Array.isArray(input) && input.every(entry => typeof entry === 'string');
  return Number.isSafeInteger(item['index']) && Number(item['index']) >= 0
    && typeof item['inputDigest'] === 'string' && /^[a-f0-9]{64}$/.test(item['inputDigest'])
    && Number.isSafeInteger(item['seed']) && strings(item['removed']) && strings(item['runIds'])
    && ['target-failure', 'requirement-satisfied', 'inconclusive', 'cancelled'].includes(String(item['outcome']))
    && typeof item['reason'] === 'string' && typeof item['durationMs'] === 'number'
    && Number.isFinite(item['durationMs']) && item['durationMs'] >= 0 && typeof item['accepted'] === 'boolean';
}
function readTrial(event: RunEvent): { trial: Trial } | { unreadable: RunEvent } {
  try {
    const value: unknown = JSON.parse(event.message);
    return isTrial(value) ? { trial: value } : { unreadable: event };
  } catch { return { unreadable: event }; }
}
function label(value: string): string {
  return ({ 'target-failure': 'Original failure reproduced', 'requirement-satisfied': 'Requirement satisfied', inconclusive: 'INCONCLUSIVE', cancelled: 'Cancelled', running: 'Running', complete: 'Complete', failed: 'Run failed', interrupted: 'Interrupted', ready: 'Ready' } as Record<string, string>)[value] ?? value;
}
function Badge({ value }: { value: string }) { return <span className={`badge outcome-${value}`}>{label(value)}</span>; }
function Panel({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return <section className="panel"><header className="panel-head"><h2>{title}</h2>{meta && <span className="muted small">{meta}</span>}</header><div className="panel-body">{children}</div></section>;
}
function KeyValue({ name, value }: { name: string; value: ReactNode }) { return <div className="key-value"><dt>{name}</dt><dd>{value}</dd></div>; }
function Json({ value, name = 'Evidence JSON' }: { value: unknown; name?: string }) { return <pre className="codeblock" role="region" tabIndex={0} aria-label={name}>{JSON.stringify(value, null, 2)}</pre>; }

async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Repro-Token': token ?? '' }, body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const failure = (data as ApiFailure).error;
    throw new Error(`${failure?.category ?? 'environment'} · ${failure?.code ?? 'REQUEST_FAILED'}: ${failure?.reason ?? 'The local service could not complete this request.'}`);
  }
  return data as T;
}

function useWorkspace(selected: string | null, jobId: string | null, refreshKey: number) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ sessions: [], session: null, jobs: [], job: null, events: [] });
  const [connectionError, setConnectionError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setSnapshot(previous => ({ ...previous, session: null, jobs: [], job: null, events: [] }));
    async function refresh() {
      try {
        const { sessions } = await api<{ sessions: Session[] }>('/api/sessions');
        // Keep local-session navigation available even if the selected route no
        // longer exists or its detail request fails.
        if (!disposed) setSnapshot(previous => ({ ...previous, sessions }));
        const detail = selected ? await api<{ session: Session; jobs: Job[] }>(`/api/sessions/${selected}`) : null;
        const current = detail?.jobs.find(job => job.id === jobId) ?? detail?.jobs[0];
        const job = current ? await api<{ job: Job; events: RunEvent[] }>(`/api/jobs/${current.id}`) : null;
        if (!disposed) {
          setSnapshot({ sessions, session: detail?.session ?? null, jobs: detail?.jobs ?? [], job: job?.job ?? null, events: job?.events ?? [] });
          setConnectionError(''); setLoading(false);
        }
      } catch (error) {
        if (!disposed) { setConnectionError(error instanceof Error ? error.message : 'Local service unavailable.'); setLoading(false); }
      } finally { if (!disposed) timer = setTimeout(() => { void refresh(); }, 1000); }
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [selected, jobId, refreshKey]);
  return { ...snapshot, connectionError, loading };
}

function Capture({ busy, ready, onCapture }: { busy: boolean; ready: boolean; onCapture: () => void }) {
  const [consent, setConsent] = useState(false);
  function submit(event: FormEvent) { event.preventDefault(); if (consent && ready && !busy) onCapture(); }
  return <div className="capture-layout"><section className="capture-intro"><p className="eyebrow">REGISTERED LOCAL ADAPTER</p><h1>Record the<br />search race.</h1><p>Record the synthetic search race, keep its expected behavior fixed, and carry the evidence into a smaller capsule.</p><ol className="journey"><li><strong>Record</strong><span>Fresh Chromium state and controlled responses.</span></li><li><strong>Reduce</strong><span>Keep only actions that retain the same failure.</span></li><li><strong>Verify & export</strong><span>Compare the fixed revision and save a readable local bundle.</span></li></ol></section>
    <Panel title="Start a synthetic capture" meta="Opt-in required"><form onSubmit={submit} className="capture-form"><Badge value="synthetic-training-fixture" /><h3>Latest search response wins</h3><p>The scripted session searches for “alpha”, then “beta”. The API replies to beta first. The buggy frontend displays the stale alpha result.</p><dl><KeyValue name="Capture surface" value="Registered loopback fixture only; browser actions, response schedule, screenshots and trace." /><KeyValue name="Storage" value="Local task-owned run directory. No upload or personal browser profile." /><KeyValue name="Duration & control" value="Bounded runner deadline; cancel the owned run at any time." /></dl><label className="consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I consent to this scripted synthetic capture in a fresh browser profile.</span></label><button className="primary" disabled={!consent || busy || !ready} type="submit">{busy ? 'Starting capture…' : 'Start synthetic capture'}</button>{!ready && <p role="status" className="small muted">Connecting to the local workbench before capture is available.</p>}<p className="small muted">Expectation basis: supplied synthetic specification. Human approval is not claimed. Other applications, authentication and production data are unsupported.</p></form></Panel></div>;
}

function RunEvidence({ run, heading }: { run: RunResult; heading: string }) {
  return <section className="run-evidence"><h3>{heading}</h3><Badge value={run.outcome} /><p>{run.reason}</p><dl><KeyValue name="Run" value={<code>{run.id}</code>} /><KeyValue name="Assertions executed" value={run.assertionCount} /><KeyValue name="App revision" value={run.appRevision} /><KeyValue name="Duration" value={`${run.durationMs} ms`} /><KeyValue name="Execution boundary" value={run.environment.isolation} /></dl>{run.observation && <Json value={run.observation} name={`${heading} observation`} />}<details><summary>Inspect identity and artifacts</summary><dl><KeyValue name="Manifest digest" value={<code>{run.manifestDigest}</code>} /><KeyValue name="Assertion digest" value={<code>{run.assertionDigest}</code>} /><KeyValue name="Harness digest" value={<code>{run.harnessDigest}</code>} /><KeyValue name="Application digest" value={<code>{run.appDigest}</code>} /></dl><Json value={run.artifacts} name={`${heading} artifact inventory`} /></details></section>;
}
function Overview({ session, job }: { session: Session; job: Job | null }) {
  const run = asRun(job?.result), reduction = asReduction(job?.result), result = record(job?.result);
  return <div className="evidence-grid"><div><Panel title="Frozen expectation" meta="Independent assertion"><p className="invariant">{session.manifest.expectation.description}</p><p className="muted">The latest query is <code>beta</code>. Its results must remain visible after the older response arrives.</p><Json value={session.manifest.expectation} name="Frozen expected behavior" /><dl><KeyValue name="Assertion digest" value={<code>{session.manifest.assertionDigest}</code>} /><KeyValue name="Expectation basis" value={session.manifest.expectationBasis} /><KeyValue name="Human approval" value="Not claimed" /></dl></Panel>{job && <Panel title="Selected run evidence" meta={job.operation}>{run ? <RunEvidence run={run} heading="Observed browser run" /> : reduction ? <><Badge value={reduction.status} /><p>{reduction.reason}</p><p>{reduction.executions} executions · {reduction.manifest.actions.length} retained actions</p></> : Object.keys(result).length ? <><Badge value={text(result['outcome'], job.status)} /><p>{text(result['reason'], 'Local operation completed. Open its evidence section for details.')}</p></> : <p className="muted">Waiting for the runner to persist evidence. No behavioral outcome is established yet.</p>}</Panel>}</div><Boundary manifest={session.manifest} /></div>;
}
function Boundary({ manifest }: { manifest: Manifest }) {
  return <Panel title="Replay boundary" meta="Declared inputs"><dl><KeyValue name="Behavior executed" value="Real Chromium frontend" /><KeyValue name="HTTP dependency" value="Controlled synthetic API responses" /><KeyValue name="Reset" value="Fresh browser and owned local fixture per execution" /><KeyValue name="Database" value="None required by this adapter" /><KeyValue name="App revision" value={manifest.app.revision} /><KeyValue name="Adapter" value={`${manifest.adapter.id} · ${manifest.adapter.version}`} /><KeyValue name="Runner" value={manifest.runnerVersion} /><KeyValue name="Clock" value={<code>{manifest.environment.clock}</code>} /><KeyValue name="Seed" value={manifest.environment.seed} /><KeyValue name="Per-run limit" value={`${manifest.environment.timeoutMs} ms`} /></dl><p className="notice">The HTTP boundary tests frontend response handling. It does not verify a backend fix. Clean Linux-container portability is a separate check; a local browser run does not establish it.</p></Panel>;
}

function Timeline({ events, job }: { events: RunEvent[]; job: Job | null }) {
  const [filter, setFilter] = useState(''), [selected, setSelected] = useState<number | null>(null);
  useEffect(() => { setSelected(null); setFilter(''); }, [job?.id]);
  const filtered = events.filter(event => `${event.type} ${event.message} ${event.actionId ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  const event = events.find(event => event.seq === selected);
  return <div className="evidence-grid"><Panel title="Event timeline" meta={`${events.length} persisted events`}><label className="field">Filter events<input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Action, message, or event type" /></label>{filtered.length ? <ol className="timeline">{filtered.map(item => <li key={item.seq}><button className={selected === item.seq ? 'event-row selected' : 'event-row'} onClick={() => setSelected(item.seq)} aria-pressed={selected === item.seq}><span className="sequence">{String(item.seq).padStart(2, '0')}</span><span><strong>{item.type}</strong><span className="event-message">{item.type === 'trial' ? 'Reduction candidate evaluated — inspect evidence' : item.message}</span><time dateTime={item.at}>{new Date(item.at).toLocaleTimeString()}</time></span></button></li>)}</ol> : <p className="empty">{events.length ? 'No events match this filter.' : 'No recorded events yet. Start a capture or replay to collect evidence.'}</p>}</Panel><Panel title="Event inspector" meta={event ? `Sequence ${event.seq}` : 'Select an event'}>{event ? <><dl><KeyValue name="Time" value={<code>{event.at}</code>} /><KeyValue name="Type" value={event.type} /><KeyValue name="Action" value={event.actionId ?? 'Not action-specific'} /></dl><pre className="codeblock wrap" tabIndex={0}>{event.message}</pre></> : <p className="muted">Select a timeline row to inspect its persisted message and action identity. Sequence represents execution order, not dependency edges.</p>}</Panel></div>;
}
function Dependencies({ manifest }: { manifest: Manifest }) {
  return <div className="evidence-grid"><Panel title="Current capsule dependencies" meta={`${manifest.actions.length} retained actions`}><p className="muted">These actions belong to the current capsule. Earlier runs retain their original input manifest in their run artifacts. Removing a prerequisite also removes its dependent actions; this list preserves execution order.</p><ol className="dependencies">{manifest.actions.map(action => <li key={action.id}><div><code>{action.id}</code><span className="badge">{action.kind}</span></div><p>Input: <code>{action.value}</code></p><p className="small muted">Requires: {action.dependsOn.length ? action.dependsOn.join(', ') : 'No prerequisite action'}</p></li>)}</ol><details><summary>Inspect the complete manifest</summary><Json value={manifest} name="Capsule manifest" /></details></Panel><div><Panel title="Controlled response schedule" meta="Mocked HTTP dependency"><ol className="response-order">{manifest.responses.map(response => <li key={response.requestId}><strong>Request {response.requestId}</strong><span>{response.results.join(', ')}</span></li>)}</ol><p className="notice">Response order and payloads stay frozen during action reduction and buggy/fixed comparison.</p></Panel><Boundary manifest={manifest} /></div></div>;
}
function Reduction({ jobs, current, events }: { jobs: Job[]; current: Job | null; events: RunEvent[] }) {
  const job = current?.operation === 'reduce' ? current : jobs.find(job => job.operation === 'reduce');
  const reduced = asReduction(job?.result);
  const entries = job?.id === current?.id ? events.filter(event => event.type === 'trial').map(readTrial) : [];
  const liveTrials = entries.flatMap(entry => 'trial' in entry ? [entry.trial] : []);
  const unreadable = entries.flatMap(entry => 'unreadable' in entry ? [entry.unreadable] : []);
  const trials = reduced?.trials ?? liveTrials;
  return <Panel title="Reduction history" meta={job ? label(job.status) : 'Not run'}><p className="muted">Action-only dependency groups · 50 execution limit · 120 second wall-time limit · 2 required reproductions per accepted candidate.</p>{unreadable.length > 0 && <div className="error-banner" role="alert"><strong>INCONCLUSIVE · Unreadable reduction evidence</strong><p>{unreadable.length} persisted trial event(s) are incomplete or invalid. They cannot establish failure preservation.</p>{unreadable.map(event => <details key={event.seq}><summary>Inspect unreadable event {event.seq}</summary><pre className="codeblock wrap" tabIndex={0}>{event.message}</pre></details>)}</div>}{reduced && <div className="reduction-summary"><Badge value={reduced.status} /><strong>{reduced.manifest.actions.length} retained actions</strong><span>{reduced.executions}/50 executions used</span><span>{Math.round(reduced.durationMs)} ms elapsed</span><p>{reduced.reason}</p><p><strong>Minimality:</strong> {reduced.minimality === 'unverified' ? 'Unverified — final permitted neighbors were not all conclusively rejected.' : 'Dependency-group 1-minimal under the tested oracle. Not globally minimal.'}</p></div>}{trials.length ? <div className="table-scroll" role="region" aria-label="Reduction trials" tabIndex={0}><table><thead><tr><th scope="col">Trial</th><th scope="col">Removed actions</th><th scope="col">Evidence</th><th scope="col">Cost</th><th scope="col">Decision</th></tr></thead><tbody>{trials.map(trial => <tr key={trial.index}><td>{trial.index}</td><td><code>{trial.removed.join(', ') || 'Baseline'}</code></td><td><Badge value={trial.outcome} /><details><summary>Reason & identity</summary><p>{trial.reason}</p><p>Seed: {trial.seed}</p><code>{trial.inputDigest}</code><p>{trial.runIds.length} recorded run(s)</p></details></td><td>{Math.round(trial.durationMs)} ms</td><td>{trial.accepted ? 'Verified & kept' : 'Not accepted'}</td></tr>)}</tbody></table></div> : <p className="empty">{job?.status === 'running' ? 'Establishing a repeated baseline in fresh state. No completed trials have been recorded yet.' : 'No reduction trials have been recorded. Reproduce the original failure, then choose Reduce.'}</p>}</Panel>;
}
function Comparison({ jobs, current }: { jobs: Job[]; current: Job | null }) {
  const job = current?.operation === 'verify' ? current : jobs.find(job => job.operation === 'verify');
  const result = record(job?.result), original = asRun(result['original']), candidate = asRun(result['candidate']);
  return <Panel title="Buggy / fixed evidence" meta={job ? label(job.status) : 'Not run'}>{original && candidate ? <><div className="comparison-verdict"><Badge value={text(result['outcome'], 'inconclusive')} /><p>{text(result['reason'])}</p></div><div className="comparison"><RunEvidence run={original} heading="Original · buggy" /><RunEvidence run={candidate} heading="Candidate · fixed" /></div><p className="notice">Assertion identity: {original.assertionDigest === candidate.assertionDigest ? 'identical' : 'MISMATCH'}. Harness identity: {original.harnessDigest === candidate.harnessDigest ? 'identical' : 'MISMATCH'}. These bounded frontend checks do not certify arbitrary changes.</p></> : <p className="empty">{job?.status === 'running' ? 'Running each revision in separate fresh state. Comparison is not established yet.' : 'No comparison evidence yet. Choose Verify fixed revision to evaluate both registered revisions with the same frozen assertion.'}</p>}</Panel>;
}
function Export({ jobs, current }: { jobs: Job[]; current: Job | null }) {
  const job = current?.operation === 'export' ? current : jobs.find(job => job.operation === 'export');
  const result = record(job?.result);
  return <Panel title="Local capsule export" meta={job ? label(job.status) : 'Not exported'}><p>The capsule includes the registered application, explicit inputs, independent assertion, readable test and replay instructions. Export creates a local directory; it does not upload or publish.</p>{typeof result['path'] === 'string' ? <><dl><KeyValue name="Saved directory" value={<code>{result['path']}</code>} /><KeyValue name="Manifest digest" value={<code>{text(result['manifestDigest'])}</code>} /></dl><dl><KeyValue name="Files validated" value={typeof result['files'] === 'number' ? result['files'] : 'Not reported'} /></dl><div className="notice"><strong>Run the exported capsule</strong><p>Open <code>README.md</code> in the saved directory for isolated setup and replay commands. <code>replay.test.mjs</code> is the conventional readable test; <code>integrity.json</code> lists artifact hashes.</p></div><p className="notice">Integrity hashes identify bytes. They do not establish author trust or clean-environment portability. Follow the bundle instructions in a supported isolated environment.</p></> : <p className="empty">{job?.status === 'running' ? 'Writing and validating the temporary bundle. It is not complete until atomic finalization succeeds.' : 'No completed capsule is available. Choose Export capsule to create one from the current manifest.'}</p>}</Panel>;
}

function App() {
  const [selected, setSelected] = useState(route), [jobId, setJobId] = useState<string | null>(null), [refreshKey, setRefreshKey] = useState(0);
  const [token, setToken] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [cancelPending, setCancelPending] = useState(false);
  const pending = useRef(false), request = useRef<{ session: string; operation: Operation; key: string } | null>(null);
  const state = useWorkspace(selected.sessionId, jobId, refreshKey);
  const active = state.jobs.find(job => job.status === 'running');
  useEffect(() => { void api<{ token: string }>('/api/config').then(config => setToken(config.token)).catch(cause => setError(String(cause))); }, []);
  useEffect(() => { const changed = () => { setSelected(route()); setJobId(null); setError(''); }; addEventListener('hashchange', changed); return () => removeEventListener('hashchange', changed); }, []);
  useEffect(() => { if (!active) setCancelPending(false); }, [active]);
  const perform = useCallback(async (operation: Operation, sessionId = selected.sessionId) => {
    if (!sessionId || pending.current || !token) return;
    pending.current = true; setBusy(true); setError('');
    const prior = request.current;
    const key = prior?.session === sessionId && prior.operation === operation ? prior.key : crypto.randomUUID();
    request.current = { session: sessionId, operation, key };
    try {
      const { job } = await api<{ job: Job }>(`/api/sessions/${sessionId}/jobs`, token, { operation, requestKey: key });
      request.current = null; setJobId(job.id); setRefreshKey(value => value + 1);
      location.hash = href(sessionId, operation === 'reduce' ? 'reduction' : operation === 'verify' ? 'comparison' : operation === 'export' ? 'export' : 'timeline');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The operation could not start. Retry to reconcile its request identity.'); }
    finally { pending.current = false; setBusy(false); }
  }, [selected.sessionId, token]);
  async function capture() {
    if (pending.current || !token) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const { session } = await api<{ session: Session }>('/api/sessions', token, { consent: true });
      location.hash = href(session.id, 'timeline');
      pending.current = false;
      await perform('record', session.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture could not start.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function cancel() {
    if (!active || cancelPending) return;
    setCancelPending(true); setError('');
    try { await api(`/api/jobs/${active.id}/cancel`, token, {}); setRefreshKey(value => value + 1); }
    catch (cause) { setCancelPending(false); setError(cause instanceof Error ? cause.message : 'Cancellation request failed.'); }
  }
  async function reconnect() {
    try {
      const config = await api<{ token: string }>('/api/config');
      setToken(config.token); setError(''); setRefreshKey(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The local service is still unavailable.'); }
  }
  const session = state.session;
  const outcome = text(record(state.job?.result)['outcome'], state.job?.status ?? 'ready');
  return <><a className="skip" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to evidence</a><div className="shell"><aside className="sidebar"><a className="brand" href="#/new" aria-label="Repro new capture"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 9-5 9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10M7 5l9 5v5" /></svg><span>repro</span><small>LOCAL</small></a><p className="nav-label">EVIDENCE WORKSPACE</p><nav aria-label="Evidence sections">{sections.map(section => !selected.sessionId ? <span className="nav-disabled" aria-disabled="true" key={section}>{titles[section]}</span> : <a key={section} href={href(selected.sessionId, section)} aria-current={session && selected.section === section ? 'page' : undefined}><span className="nav-marker" aria-hidden="true">{String(sections.indexOf(section) + 1).padStart(2, '0')}</span>{titles[section]}</a>)}</nav>{!selected.sessionId && <p className="nav-hint">Evidence sections become available after capture.</p>}<div className="session-picker"><label htmlFor="session">Local sessions</label><select id="session" value={selected.sessionId ?? ''} onChange={event => { location.hash = href(event.target.value || null); }}><option value="">New capture</option>{state.sessions.map(item => <option key={item.id} value={item.id}>{item.id.slice(0, 8)} · {item.state}</option>)}</select><a className="new-session" href="#/new">+ New synthetic capture</a></div><p className="sidebar-foot">Local evidence. Explicit inputs.<br />No account or cloud service.<br /><span>Synthetic fixture · local alpha</span></p></aside><main id="main" tabIndex={-1} className="workspace"><header className="topbar"><span>Local workspace <span aria-hidden="true">/</span> <strong>{session ? session.id.slice(0, 8) : 'New capture'}</strong></span><span className="scope-label">Trusted synthetic fixture only</span></header>{error || state.connectionError ? <div className="error-banner" role="alert"><strong>INCONCLUSIVE · Request needs attention</strong><p>{error || state.connectionError}</p><button onClick={() => { void reconnect(); }}>Reconnect & refresh evidence</button></div> : null}{!selected.sessionId ? <Capture busy={busy} ready={Boolean(token)} onCapture={() => { void capture(); }} /> : state.loading ? <div className="loading" role="status">Loading persisted session evidence…</div> : session ? <><section className="intro"><div><p className="eyebrow">SYNTHETIC SEARCH / {session.id.slice(0, 8)}</p><h1>Older response replaces the latest search</h1><p className="muted">{titles[selected.section]} · Registered Chromium frontend · Supplied synthetic specification</p></div><div className="live-status" role="status" aria-live="polite"><Badge value={active ? 'running' : outcome} /><span className="small muted">{active ? `${active.operation} in progress` : 'Persisted local evidence'}</span></div></section><div className="actionbar" role="group" aria-label="Session operations">{operations.map(operation => <button key={operation.key} disabled={Boolean(active) || busy || !token} className={operation.key === 'replay' ? 'primary' : ''} onClick={() => { void perform(operation.key); }}>{operation.label}</button>)}{active && <button className="danger" disabled={cancelPending} onClick={() => { void cancel(); }}>{cancelPending ? 'Cancellation requested…' : 'Cancel active run'}</button>}</div>{active && <p className="operation-note">Other operations are unavailable while this owned run is active. Cancellation preserves completed evidence.</p>}<div className="history-bar"><label htmlFor="job">Evidence run</label><select id="job" value={state.job?.id ?? ''} onChange={event => setJobId(event.target.value)} disabled={!state.jobs.length}><option value="" disabled>No runs yet</option>{state.jobs.map(job => <option key={job.id} value={job.id}>{job.operation} · {job.status} · {job.id.slice(0, 8)}</option>)}</select><span className="small muted">{state.jobs.length} recorded job{state.jobs.length === 1 ? '' : 's'}</span></div>{selected.section === 'overview' ? <Overview session={session} job={state.job} /> : selected.section === 'timeline' ? <Timeline events={state.events} job={state.job} /> : selected.section === 'dependencies' ? <Dependencies manifest={session.manifest} /> : selected.section === 'reduction' ? <Reduction jobs={state.jobs} current={state.job} events={state.events} /> : selected.section === 'comparison' ? <Comparison jobs={state.jobs} current={state.job} /> : <Export jobs={state.jobs} current={state.job} />}</> : <p className="empty">This session could not be loaded. Select a local session or reconnect.</p>}<footer className="bottom"><span>Repro local alpha · synthetic training fixture</span><span>Capture ≠ verified portability · hashes establish integrity, not trust</span></footer></main></div></>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Repro root element is missing.');
createRoot(root).render(<App />);
