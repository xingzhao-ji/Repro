import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Manifest, ReductionResult, RunEvent, RunResult, Trial } from '../src/contracts.js';
import type { Job, Operation, Session } from '../src/ledger.js';
import type { JobInputEvidence, TrialEvidence } from '../src/evidence-inspector.js';
import type { TrialReader } from './evidence-source.js';
import './style.css';

declare const __HCI_STUDY__: boolean;
type EvidenceJob = Omit<Job, 'requestKey'>;

const sections = ['overview', 'timeline', 'dependencies', 'reduction', 'comparison', 'export'] as const;
type Section = typeof sections[number];
const titles: Record<Section, string> = { overview: 'Overview', timeline: 'Event timeline', dependencies: 'Dependencies', reduction: 'Reduction history', comparison: 'Compare evidence', export: 'Local export' };
const operations: { key: Operation; label: string }[] = [{ key: 'record', label: 'Record again' }, { key: 'replay', label: 'Replay' }, { key: 'reduce', label: 'Reduce' }, { key: 'verify', label: 'Verify fixed revision' }, { key: 'export', label: 'Export capsule' }];
interface Route { sessionId: string | null; section: Section; jobId: string | null; trialIndex: number | null }
interface Snapshot { sessions: Session[]; session: Session | null; jobs: Job[]; job: Job | null; events: RunEvent[]; input: JobInputEvidence | null; inputError: string }
interface ApiFailure { error?: { category?: string; code?: string; reason?: string } }
function route(): Route {
  const match = /^#\/sessions\/([a-zA-Z0-9_-]+)(?:\/([a-z-]+))?(?:\?run=([a-zA-Z0-9_-]{1,100})(?:&trial=(\d{1,6}))?)?$/.exec(location.hash);
  return { sessionId: match?.[1] ?? null, section: sections.includes(match?.[2] as Section) ? match![2] as Section : 'overview', jobId: match?.[3] ?? null, trialIndex: match?.[4] === undefined ? null : Number(match[4]) };
}
function href(sessionId: string | null, section: Section = 'overview', jobId: string | null = null, trialIndex: number | null = null): string { return sessionId ? `#/sessions/${sessionId}/${section}${jobId ? `?run=${jobId}${trialIndex === null ? '' : `&trial=${trialIndex}`}` : ''}` : '#/new'; }

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function text(value: unknown, fallback = 'Not available'): string { return typeof value === 'string' ? value : fallback; }
function asRun(value: unknown): RunResult | null { return typeof record(value)['assertionCount'] === 'number' ? value as RunResult : null; }
function asReduction(value: unknown): ReductionResult | null {
  const item = record(value), manifest = record(item['manifest']);
  return Array.isArray(item['trials']) && Array.isArray(manifest['actions'])
    && typeof item['status'] === 'string' && ['complete', 'budget-exhausted', 'cancelled', 'inconclusive'].includes(item['status'])
    && typeof item['minimality'] === 'string' && ['dependency-group-1-minimal', 'unverified'].includes(item['minimality'])
    && typeof item['reason'] === 'string' && Number.isSafeInteger(item['executions']) && Number(item['executions']) >= 0
    && typeof item['durationMs'] === 'number' && Number.isFinite(item['durationMs']) && item['durationMs'] >= 0
    ? value as ReductionResult : null;
}
function isTrial(value: unknown): value is Trial {
  const item = record(value);
  const strings = (input: unknown): input is string[] => Array.isArray(input) && input.every(entry => typeof entry === 'string');
  return Number.isSafeInteger(item['index']) && Number(item['index']) >= 0
    && typeof item['inputDigest'] === 'string' && /^[a-f0-9]{64}$/.test(item['inputDigest'])
    && Number.isSafeInteger(item['seed']) && strings(item['removed']) && strings(item['runIds'])
    && typeof item['outcome'] === 'string' && ['target-failure', 'requirement-satisfied', 'inconclusive', 'cancelled'].includes(item['outcome'])
    && typeof item['reason'] === 'string' && typeof item['durationMs'] === 'number'
    && Number.isFinite(item['durationMs']) && item['durationMs'] >= 0 && typeof item['accepted'] === 'boolean';
}
function readTrialEvent(event: RunEvent): { trial: Trial } | { unreadable: RunEvent } {
  try {
    const value: unknown = JSON.parse(event.message);
    return isTrial(value) ? { trial: value } : { unreadable: event };
  } catch { return { unreadable: event }; }
}
function label(value: string): string {
  return ({ 'target-failure': 'Original failure reproduced', 'requirement-satisfied': 'Requirement satisfied', inconclusive: 'INCONCLUSIVE', cancelled: 'Cancelled', running: 'Running', complete: 'Operation complete', failed: 'Run failed', interrupted: 'Interrupted', ready: 'Ready' } as Record<string, string>)[value] ?? value;
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
  const [snapshot, setSnapshot] = useState<Snapshot>({ sessions: [], session: null, jobs: [], job: null, events: [], input: null, inputError: '' });
  const [connectionError, setConnectionError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setConnectionError('');
    setSnapshot(previous => ({ ...previous,
      session: previous.session?.id === selected ? previous.session : null,
      jobs: previous.session?.id === selected ? previous.jobs : [],
      job: null, events: [], input: null, inputError: '',
    }));
    async function refresh() {
      try {
        const { sessions } = await api<{ sessions: Session[] }>('/api/sessions');
        // Keep local-session navigation available even if the selected route no
        // longer exists or its detail request fails.
        if (!disposed) setSnapshot(previous => ({ ...previous, sessions }));
        const detail = selected ? await api<{ session: Session; jobs: Job[] }>(`/api/sessions/${selected}`) : null;
        const current = jobId ? detail?.jobs.find(job => job.id === jobId) : detail?.jobs[0];
        if (jobId && detail && !current) {
          if (!disposed) setSnapshot({ sessions, session: detail.session, jobs: detail.jobs, job: null, events: [], input: null, inputError: '' });
          throw new Error('input · NOT_FOUND: The requested evidence run does not belong to this session. Select another evidence run.');
        }
        const job = current ? await api<{ job: Job; events: RunEvent[] }>(`/api/jobs/${current.id}`) : null;
        let input: JobInputEvidence | null = null, inputError = '';
        if (current) {
          try { input = await api<JobInputEvidence>(`/api/jobs/${current.id}/input`); }
          catch (cause) { inputError = cause instanceof Error ? cause.message : 'The selected input could not be inspected.'; }
        }
        if (!disposed) {
          setSnapshot({ sessions, session: detail?.session ?? null, jobs: detail?.jobs ?? [], job: job?.job ?? null, events: job?.events ?? [], input, inputError });
          setConnectionError(''); setLoading(false);
        }
      } catch (error) {
        if (!disposed) { setConnectionError(error instanceof Error ? error.message : 'Local service unavailable.'); setLoading(false); }
      } finally { if (!disposed) timer = setTimeout(() => { void refresh(); }, 1000); }
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [selected, jobId, refreshKey]);
  // The route changes before the effect starts. Clear old evidence in that
  // render too, while preserving the same-session navigation and its focus.
  const sameSession = snapshot.session?.id === selected;
  const sameEvidence = sameSession && (jobId === null || snapshot.job?.id === jobId);
  return { ...snapshot,
    session: sameSession ? snapshot.session : null,
    jobs: sameSession ? snapshot.jobs : [],
    job: sameEvidence ? snapshot.job : null,
    events: sameEvidence ? snapshot.events : [],
    input: sameEvidence ? snapshot.input : null,
    inputError: sameEvidence ? snapshot.inputError : '',
    connectionError, loading,
  };
}

function Capture({ busy, ready, onCapture }: { busy: boolean; ready: boolean; onCapture: () => void }) {
  const [consent, setConsent] = useState(false);
  function submit(event: FormEvent) { event.preventDefault(); if (consent && ready && !busy) onCapture(); }
  return <div className="capture-layout"><section className="capture-intro"><p className="eyebrow">REGISTERED LOCAL ADAPTER</p><h1>Record the<br />search race.</h1><p>Record the synthetic search race, keep its expected behavior fixed, and carry the evidence into a smaller capsule.</p><ol className="journey"><li><strong>Record</strong><span>Fresh Chromium state and controlled responses.</span></li><li><strong>Reduce</strong><span>Keep only actions that retain the same failure.</span></li><li><strong>Verify & export</strong><span>Compare the fixed revision and save a readable local bundle.</span></li></ol></section>
    <Panel title="Start a synthetic capture" meta="Opt-in required"><form onSubmit={submit} className="capture-form"><Badge value="synthetic-training-fixture" /><h3>Latest search response wins</h3><p>The scripted session searches for “alpha”, then “beta”. The API replies to beta first. The buggy frontend displays the stale alpha result.</p><dl><KeyValue name="Capture surface" value="Registered loopback fixture only; browser actions, response schedule, screenshots and trace." /><KeyValue name="Storage" value="Local task-owned run directory. No upload or personal browser profile." /><KeyValue name="Duration & control" value="Bounded runner deadline; cancel the owned run at any time." /></dl><label className="consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I consent to this scripted synthetic capture in a fresh browser profile.</span></label><button className="primary" disabled={!consent || busy || !ready} type="submit">{busy ? 'Starting capture…' : 'Start synthetic capture'}</button>{!ready && <p role="status" className="small muted">Connecting to the local workbench before capture is available.</p>}<p className="small muted">Expectation basis: supplied synthetic specification. Human approval is not claimed. Other applications, authentication and production data are unsupported.</p></form></Panel></div>;
}

function RunEvidence({ run, heading }: { run: RunResult; heading: string }) {
  return <section className="run-evidence"><h3>{heading}</h3><Badge value={run.outcome} /><p>{run.reason}</p><dl><KeyValue name="Run" value={<code>{run.id}</code>} /><KeyValue name="Assertions executed" value={run.assertionCount} /><KeyValue name="App revision" value={run.appRevision} /><KeyValue name="Duration" value={`${run.durationMs} ms`} /><KeyValue name="Execution boundary" value={run.environment.isolation} /></dl>{run.observation && <dl className="observation"><KeyValue name="Observed query" value={<code>{run.observation.query}</code>} /><KeyValue name="Observed results" value={run.observation.results.join(', ')} /></dl>}<details><summary>Inspect identity and artifacts</summary>{run.observation && <Json value={run.observation} name={`${heading} observation`} />}<dl><KeyValue name="Manifest digest" value={<code>{run.manifestDigest}</code>} /><KeyValue name="Assertion digest" value={<code>{run.assertionDigest}</code>} /><KeyValue name="Harness digest" value={<code>{run.harnessDigest}</code>} /><KeyValue name="Application digest" value={<code>{run.appDigest}</code>} /></dl><Json value={run.artifacts} name={`${heading} artifact inventory`} /></details></section>;
}
export function SelectedExpectation({ job, input, error, loading }: { job: EvidenceJob | null; input: JobInputEvidence | null; error: string; loading: boolean }) {
  if (loading) return <section className="experiment-summary" aria-label="Selected run expectation"><h2>Frozen expectation</h2><p className="small muted" role="status">Loading the selected run’s persisted input…</p></section>;
  const manifest = input?.availability === 'available' ? input.manifest : null;
  return <section className="experiment-summary" aria-label="Selected run expectation"><div className="experiment-heading"><h2>Frozen expectation</h2><span className="small muted">{job ? `Selected ${job.operation} input` : 'Select an evidence run'}</span></div>{manifest ? <><p className="invariant">{manifest.expectation.description}</p>{input?.outcome === 'inconclusive' && <p className="input-uncertainty"><Badge value="inconclusive" /> {input.reason}</p>}<p className="small">Latest query: <code>{manifest.expectation.latestQuery}</code> · Expected results: <code>{manifest.expectation.expectedResults.join(', ')}</code></p><p className="experiment-boundary"><strong>Mocked HTTP dependency:</strong> controlled synthetic API responses. Real Chromium frontend executes; backend behavior and clean-machine portability are not established by this local run.</p><details><summary>Inspect selected input identity</summary><dl><KeyValue name="Selected job" value={<code>{job?.id}</code>} /><KeyValue name="Input manifest digest" value={<code>{input?.manifestDigest}</code>} /><KeyValue name="Assertion digest" value={<code>{manifest.assertionDigest}</code>} /><KeyValue name="Expectation basis" value={manifest.expectationBasis} /><KeyValue name="Human approval" value="Not claimed" /><KeyValue name="App revision" value={manifest.app.revision} /><KeyValue name="Adapter / runner" value={`${manifest.adapter.id} ${manifest.adapter.version} / ${manifest.runnerVersion}`} /><KeyValue name="Reset" value="Fresh browser and owned local fixture per execution" /><KeyValue name="Selected input actions" value={manifest.actions.length} /></dl><Json value={manifest.expectation} name="Frozen expected behavior" /></details></> : <><Badge value="inconclusive" /><p className="small">{error || input?.reason || (job ? 'Reading the selected job’s persisted input. No expectation is established yet.' : 'No evidence run is selected. Select a recorded job to inspect its expectation.')}</p><p className="small muted">The current session manifest cannot establish the input of this selected run.</p></>}</section>;
}
export function InvestigationTasks({ selected }: { selected: Route }) {
  const tasks: { title: string; section: Section; sections: Section[] }[] = [
    { title: 'Establish failure', section: 'overview', sections: ['overview', 'timeline', 'dependencies'] },
    { title: 'Reduce steps', section: 'reduction', sections: ['reduction'] },
    { title: 'Check fix', section: 'comparison', sections: ['comparison'] },
  ];
  return <nav className="task-nav" aria-label="Investigation tasks">{tasks.map((task, index) => <a key={task.section} href={href(selected.sessionId, task.section, selected.jobId, selected.trialIndex)} aria-current={task.sections.includes(selected.section) ? 'step' : undefined}><span aria-hidden="true">{index + 1}</span>{task.title}</a>)}</nav>;
}
export function Overview({ job, input }: { job: EvidenceJob | null; input: JobInputEvidence | null }) {
  const run = asRun(job?.result), reduction = asReduction(job?.result), result = record(job?.result);
  const manifest = input?.availability === 'available' ? input.manifest : null;
  return <div className="evidence-grid"><Panel title="Selected run evidence" meta={job?.operation ?? 'Not run'}>{run ? <RunEvidence run={run} heading="Observed browser run" /> : reduction ? <><Badge value={reduction.status} /><p>{reduction.reason}</p><p>{reduction.executions} executions · {reduction.manifest.actions.length} retained actions</p><p className="notice">Reduction completion does not establish global minimality or a verified fix. Inspect the trials and remaining uncertainty in Reduction history.</p></> : Object.keys(result).length ? <><Badge value={text(result['outcome'], job?.status ?? 'ready')} /><p>{text(result['reason'], 'Local operation completed. Open its evidence section for details.')}</p></> : <p className="muted">Waiting for the runner to persist evidence. No behavioral outcome is established yet.</p>}</Panel>{manifest ? <Boundary manifest={manifest} /> : <Panel title="Replay boundary"><p className="muted">The selected run’s declared boundary is unavailable. Its current session cannot substitute for persisted input evidence.</p></Panel>}</div>;
}

function Boundary({ manifest }: { manifest: Manifest }) {
  return <Panel title="Replay boundary" meta="Declared inputs"><dl><KeyValue name="Behavior executed" value="Real Chromium frontend" /><KeyValue name="HTTP dependency" value="Controlled synthetic API responses" /><KeyValue name="Reset" value="Fresh browser and owned local fixture per execution" /><KeyValue name="Database" value="None required by this adapter" /><KeyValue name="App revision" value={manifest.app.revision} /><KeyValue name="Adapter" value={`${manifest.adapter.id} · ${manifest.adapter.version}`} /><KeyValue name="Runner" value={manifest.runnerVersion} /><KeyValue name="Clock" value={<code>{manifest.environment.clock}</code>} /><KeyValue name="Seed" value={manifest.environment.seed} /><KeyValue name="Per-run limit" value={`${manifest.environment.timeoutMs} ms`} /></dl><p className="notice">The HTTP boundary tests frontend response handling. It does not verify a backend fix. Clean Linux-container portability is a separate check; a local browser run does not establish it.</p></Panel>;
}

export function Timeline({ events, job }: { events: RunEvent[]; job: EvidenceJob | null }) {
  const [filter, setFilter] = useState(''), [selected, setSelected] = useState<number | null>(null);
  useEffect(() => { setSelected(null); setFilter(''); }, [job?.id]);
  const filtered = events.filter(event => `${event.type} ${event.message} ${event.actionId ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  const event = events.find(event => event.seq === selected);
  return <div className="evidence-grid"><Panel title="Event timeline" meta={`${events.length} persisted events`}><label className="field">Filter events<input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Action, message, or event type" /></label>{filtered.length ? <ol className="timeline">{filtered.map(item => <li key={item.seq}><button className={selected === item.seq ? 'event-row selected' : 'event-row'} onClick={() => setSelected(item.seq)} aria-pressed={selected === item.seq}><span className="sequence">{String(item.seq).padStart(2, '0')}</span><span><strong>{item.type}</strong><span className="event-message">{item.type === 'trial' ? 'Reduction candidate evaluated — inspect evidence' : item.message}</span><time dateTime={item.at}>{new Date(item.at).toLocaleTimeString()}</time></span></button></li>)}</ol> : <p className="empty">{events.length ? 'No events match this filter.' : 'No recorded events yet. Start a capture or replay to collect evidence.'}</p>}</Panel><Panel title="Event inspector" meta={event ? `Sequence ${event.seq}` : 'Select an event'}>{event ? <><dl><KeyValue name="Time" value={<code>{event.at}</code>} /><KeyValue name="Type" value={event.type} /><KeyValue name="Action" value={event.actionId ?? 'Not action-specific'} /></dl><pre className="codeblock wrap" tabIndex={0}>{event.message}</pre></> : <p className="muted">Select a timeline row to inspect its persisted message and action identity. Sequence represents execution order, not dependency edges.</p>}</Panel></div>;
}
export function Dependencies({ input }: { input: JobInputEvidence | null }) {
  const manifest = input?.availability === 'available' ? input.manifest : null;
  if (!manifest) return <Panel title="Selected run dependencies"><Badge value="inconclusive" /><p>{input?.reason ?? 'The selected run input is not available. Select an evidence run with persisted input.'}</p></Panel>;
  return <div className="evidence-grid"><Panel title="Selected run dependencies" meta={`${manifest.actions.length} input actions`}><p className="muted">These actions are the persisted input of the selected job. Removing a prerequisite also removes its dependent actions; this list preserves execution order.</p><ActionList actions={manifest.actions} /><details><summary>Inspect the complete manifest</summary><Json value={manifest} name="Capsule manifest" /></details></Panel><div><Panel title="Controlled response schedule" meta="Mocked HTTP dependency"><ol className="response-order">{manifest.responses.map(response => <li key={response.requestId}><strong>Request {response.requestId}</strong><span>{response.results.join(', ')}</span></li>)}</ol><p className="notice">Response order and payloads stay frozen during action reduction and buggy/fixed comparison.</p></Panel><Boundary manifest={manifest} /></div></div>;
}
function ActionList({ actions }: { actions: Manifest['actions'] }) {
  return <ol className="dependencies">{actions.map(action => <li key={action.id}><div><code>{action.id}</code><span className="badge">{action.kind}</span></div><p>Input: <code>{action.value}</code></p><p className="small muted">Requires: {action.dependsOn.length ? action.dependsOn.join(', ') : 'No prerequisite action'}</p></li>)}</ol>;
}
export function TrialInspector({ job, trialIndex, input, readTrial }: { job: EvidenceJob; trialIndex: number | null; input: JobInputEvidence | null; readTrial?: TrialReader }) {
  const [state, setState] = useState<{ key: string; evidence: TrialEvidence | null; error: string } | null>(null);
  const key = `${job.id}/${trialIndex}`;
  useEffect(() => {
    if (trialIndex === null) return;
    let disposed = false;
    const request = readTrial ? readTrial(job.id, trialIndex)
      : typeof __HCI_STUDY__ !== 'undefined' && __HCI_STUDY__
        ? Promise.reject(new Error('INCONCLUSIVE: A frozen trial source is required.'))
        : api<TrialEvidence>(`/api/jobs/${job.id}/trials/${trialIndex}`);
    void request.then(evidence => {
      if (!disposed) setState({ key, evidence, error: '' });
    }).catch(cause => {
      if (!disposed) setState({ key, evidence: null, error: cause instanceof Error ? cause.message : 'Trial evidence could not be inspected.' });
    });
    return () => { disposed = true; };
  }, [job.id, job.status, key, trialIndex, readTrial]);
  const current = state?.key === key ? state : null, evidence = current?.evidence, trial = evidence?.trial;
  const manifest = input?.availability === 'available' ? input.manifest : null;
  return <section className="panel trial-inspector" aria-label="Trial evidence"><header className="panel-head"><h2>Trial inspector</h2><span className="small muted">{trialIndex === null ? 'Select a recorded trial' : `Trial ${trialIndex}`}</span></header><div className="panel-body"><p className="small muted" role="status">{trialIndex === null ? 'Select Inspect trial to connect an input change with its recorded runs.' : !current ? `Loading evidence for trial ${trialIndex}…` : `Trial ${trialIndex} evidence ${evidence?.availability ?? 'unavailable'}.`}</p>{current?.error && <div className="notice"><Badge value="inconclusive" /><p>{current.error}</p></div>}{evidence && <><div className="trial-verdict"><Badge value={evidence.outcome} /><p>{evidence.reason}</p></div>{readTrial && <p className="small">Inspector availability: <strong>{evidence.availability}</strong>{evidence.code && <> · <code>{evidence.code}</code></>}</p>}{trial && <><h3>Recorded decision</h3><p>{trial.index === 0 ? 'Baseline check' : trial.accepted ? 'Removal accepted' : 'Removal not accepted · previous actions restored'}</p><p className="small">{trial.reason}</p>{readTrial && <p className="small">Recorded accepted: <strong>{String(trial.accepted)}</strong>. This recorded decision is separate from inspector availability.</p>}<div className="trial-changes"><section><h3>Removed in this trial</h3>{trial.removed.length ? <ul className="removed-actions">{trial.removed.map(id => { const action = manifest?.actions.find(item => item.id === id); return <li key={id}><code>{id}</code>{action && <span> · {action.kind}: {action.value}<br />Requires: {action.dependsOn.join(', ') || 'No prerequisite action'}</span>}</li>; })}</ul> : <p className="small muted">No removal; this trial checks the baseline.</p>}</section><section><h3>Retained candidate actions</h3>{evidence.candidate ? <ActionList actions={evidence.candidate.actions} /> : <p className="small muted">Candidate input could not be established from this trial’s evidence.</p>}</section></div><p className="notice">Dependent actions are removed with their prerequisite. Retained actions are not established causes or individually necessary steps. An inconclusive deletion cannot establish necessity.</p><details><summary>Inspect trial identity</summary><dl><KeyValue name="Job" value={<code>{evidence.jobId}</code>} /><KeyValue name="Candidate input digest" value={<code>{trial.inputDigest}</code>} /><KeyValue name="Assertion digest" value={<code>{evidence.candidate?.assertionDigest ?? 'Unavailable'}</code>} /><KeyValue name="Seed" value={trial.seed} /></dl></details></>}{evidence.runs.length > 0 ? <div className="trial-runs"><h3>Linked browser runs</h3>{evidence.runs.map(run => <section key={run.runId} className="linked-run"><h4>Run <code>{run.runId}</code></h4><Badge value={run.outcome} /><p className="small">{run.reason}</p>{run.result && <>{readTrial && <p className="small"><strong>Recorded run reason:</strong> {run.result.reason}{run.result.observation === null && <><br />Observation: null — no observation was recorded.</>}</p>}<dl><KeyValue name="Assertions executed" value={run.result.assertionCount} /><KeyValue name="App revision" value={run.result.appRevision} /><KeyValue name="Observed query" value={run.result.observation?.query ?? 'Not observed'} /><KeyValue name="Observed results" value={run.result.observation?.results.join(', ') ?? 'Not observed'} /></dl><details><summary>Inspect run identity</summary><dl><KeyValue name="Run" value={<code>{run.runId}</code>} /><KeyValue name="Manifest digest" value={<code>{run.result.manifestDigest}</code>} /><KeyValue name="Assertion digest" value={<code>{run.result.assertionDigest}</code>} /><KeyValue name="Harness digest" value={<code>{run.result.harnessDigest}</code>} /><KeyValue name="Application digest" value={<code>{run.result.appDigest}</code>} /><KeyValue name="Execution boundary" value={run.result.environment.isolation} /></dl>{run.result.observation && <Json value={run.result.observation} name={`Trial ${trialIndex} run ${run.runId} observation`} />}</details></>}</section>)}</div> : <p className="notice">No linked browser run evidence is available for this trial.</p>}</>}</div></section>;
}
export function TrialTable({ trials, selected, onSelect }: { trials: Trial[]; selected: number | null; onSelect: (index: number) => void }) {
  return <div className="table-scroll" role="region" aria-label="Reduction trials" tabIndex={0}><table><thead><tr><th scope="col">Trial</th><th scope="col">Removed actions</th><th scope="col">Recorded evidence</th><th scope="col">Decision</th></tr></thead><tbody>{trials.map(trial => <tr key={trial.index} className={selected === trial.index ? 'selected-trial' : undefined}><td><button className="trial-select" aria-pressed={selected === trial.index} onClick={() => onSelect(trial.index)}>Inspect trial {trial.index}</button><span className="small muted trial-cost">{Math.round(trial.durationMs)} ms</span></td><td><code>{trial.removed.join(', ') || 'Baseline'}</code></td><td><Badge value={trial.outcome} /><p className="trial-reason">{trial.reason}</p></td><td>{trial.index === 0 ? 'Baseline' : trial.accepted ? 'Removal accepted' : 'Restored'}</td></tr>)}</tbody></table></div>;
}

export function Reduction({ current, events, input, trialIndex, onSelect, readTrial }: { current: EvidenceJob | null; events: RunEvent[]; input: JobInputEvidence | null; trialIndex: number | null; onSelect: (index: number) => void; readTrial?: TrialReader }) {
  const job = current?.operation === 'reduce' ? current : null;
  const reduced = asReduction(job?.result);
  const entries = job?.id === current?.id ? events.filter(event => event.type === 'trial').map(readTrialEvent) : [];
  const liveTrials = entries.flatMap(entry => 'trial' in entry ? [entry.trial] : []);
  const unreadable = entries.flatMap(entry => 'unreadable' in entry ? [entry.unreadable] : []);
  const rawTrials = record(job?.result)['trials'];
  const completedTrials: unknown[] | null = Array.isArray(rawTrials) ? rawTrials : null;
  const malformedCompleted = completedTrials?.filter(trial => !isTrial(trial)).length ?? 0;
  const trials = completedTrials?.filter(isTrial) ?? liveTrials;
  const baselineTrial = trials[0], baselineRun = asRun(reduced?.baseline);
  const hasRecordedBaseline = baselineTrial?.index === 0 && baselineTrial.removed.length === 0
    && baselineTrial.accepted && baselineTrial.outcome === 'target-failure'
    && baselineTrial.runIds.length === 2 && new Set(baselineTrial.runIds).size === 2
    && baselineRun?.outcome === 'target-failure' && baselineRun.assertionCount > 0
    && typeof baselineRun.id === 'string' && baselineTrial.runIds.includes(baselineRun.id);
  const matchingInput = input?.availability === 'available' && input.outcome === 'verified-input'
    && input.jobId === job?.id && input.manifest !== null && input.manifestDigest !== null
    && baselineTrial?.inputDigest === input.manifestDigest && baselineRun?.manifestDigest === input.manifestDigest
    && baselineRun.assertionDigest === input.manifest.assertionDigest;
  const recordedExecutions = trials.reduce((total, trial) => total + trial.runIds.length, 0);
  const consistentExecutionCount = reduced !== null && reduced.executions >= 2 && reduced.executions === recordedExecutions;
  // These prerequisites permit attribution of the reducer's stored claim;
  // they do not independently verify its entire search history.
  const summarySupported = hasRecordedBaseline && matchingInput && consistentExecutionCount;
  // Empty cancelled/inconclusive histories keep their unverified status/reason.
  const unsupportedSummary = reduced !== null && (
    ((reduced.status === 'complete' || reduced.minimality === 'dependency-group-1-minimal') && !summarySupported)
    || (reduced.minimality === 'dependency-group-1-minimal' && reduced.status !== 'complete')
  );
  const incompleteEvidence = unreadable.length + malformedCompleted > 0 || unsupportedSummary;
  const kept = trials.filter(trial => trial.accepted), rejected = trials.filter(trial => !trial.accepted);
  const selectedIndex = trialIndex ?? kept[0]?.index ?? trials[0]?.index ?? null;
  if (current && !job) return <Panel title="Reduction history" meta={`Selected ${current.operation} run`}><p className="empty">The selected {current.operation} run has no reduction evidence. Choose a reduce run from Evidence run{readTrial ? '.' : ', or start a new reduction.'}</p></Panel>;
  return <div className="reduction-workspace"><Panel title="Reduction history" meta={job ? label(job.status) : 'Not run'}><p className="muted">Action-only dependency groups · 50 execution limit · 120 second wall-time limit · 2 required reproductions per accepted candidate.</p>{unreadable.length + malformedCompleted > 0 && <div className="error-banner" role="alert"><strong>INCONCLUSIVE · Unreadable reduction evidence</strong><p>{unreadable.length} persisted trial event(s) and {malformedCompleted} completed trial record(s) are incomplete or invalid. They cannot establish failure preservation.</p>{unreadable.map(event => <details key={event.seq}><summary>Inspect unreadable event {event.seq}</summary><pre className="codeblock wrap" tabIndex={0}>{event.message}</pre></details>)}</div>}{reduced ? <div className="reduction-summary"><Badge value={incompleteEvidence ? 'inconclusive' : reduced.status} /><strong>{reduced.manifest.actions.length} retained actions</strong><span>{reduced.executions}/50 executions used</span><span>{Math.round(reduced.durationMs)} ms elapsed</span><p>{incompleteEvidence ? (unsupportedSummary ? 'Supporting input, baseline repetitions, or execution accounting are unavailable or inconsistent; this recorded reduction summary cannot be confirmed.' : 'The recorded reduction summary cannot be confirmed from incomplete trial evidence.') : reduced.reason}</p><p><strong>Minimality:</strong> {incompleteEvidence ? 'Unverified — incomplete trial evidence cannot establish a tested neighborhood.' : reduced.minimality === 'unverified' ? 'Unverified — final permitted neighbors were not all conclusively rejected.' : 'Recorded reducer claim: dependency-group 1-minimal under its tested oracle. This inspector validates the selected trial. It has not independently verified the entire reduction history; global minimality is not established.'}</p></div> : <p className="notice">Minimality remains unverified while the reduction evidence is incomplete.</p>}{trials.length ? <><p className="small muted">Select a trial to inspect changed inputs and actual linked runs. {rejected.length} rejected or inconclusive trial{rejected.length === 1 ? '' : 's'} remain available below; inconclusive outcomes do not establish necessity.</p>{kept.length > 0 && <TrialTable trials={kept} selected={selectedIndex} onSelect={onSelect} />}{rejected.length > 0 && <details className="rejected-trials" open={rejected.some(trial => trial.index === selectedIndex) || undefined}><summary>Rejected and inconclusive trials ({rejected.length})</summary><TrialTable trials={rejected} selected={selectedIndex} onSelect={onSelect} /></details>}</> : <p className="empty">{job?.status === 'running' ? 'Establishing a repeated baseline in fresh state. No completed trials have been recorded yet.' : 'No reduction trials have been recorded. Reproduce the original failure, then choose Reduce.'}</p>}</Panel>{job && <TrialInspector key={job.id} job={job} trialIndex={selectedIndex} input={input} {...(readTrial ? { readTrial } : {})} />}</div>;
}

export function Comparison({ current, inspectionOnly = false }: { current: EvidenceJob | null; inspectionOnly?: boolean }) {
  const job = current?.operation === 'verify' ? current : null;
  const result = record(job?.result), original = asRun(result['original']), candidate = asRun(result['candidate']);
  if (current && !job) return <Panel title="Buggy / fixed evidence" meta={`Selected ${current.operation} run`}><p className="empty">The selected {current.operation} run has no comparison evidence. Choose a verify run from Evidence run{inspectionOnly ? '.' : ', or verify the fixed revision.'}</p></Panel>;
  return <Panel title="Buggy / fixed evidence" meta={job ? label(job.status) : 'Not run'}>{original && candidate ? <><div className="comparison-verdict"><Badge value={text(result['outcome'], 'inconclusive')} /><p>{text(result['reason'])}</p></div><div className="comparison"><RunEvidence run={original} heading="Original · buggy" /><RunEvidence run={candidate} heading="Candidate · fixed" /></div><p className="notice">Assertion identity: {original.assertionDigest === candidate.assertionDigest ? 'identical' : 'MISMATCH'}. Harness identity: {original.harnessDigest === candidate.harnessDigest ? 'identical' : 'MISMATCH'}. These bounded frontend checks do not certify arbitrary changes.</p></> : <p className="empty">{job?.status === 'running' ? 'Running each revision in separate fresh state. Comparison is not established yet.' : 'No comparison evidence yet. Choose Verify fixed revision to evaluate both registered revisions with the same frozen assertion.'}</p>}</Panel>;
}
export function Export({ current, inspectionOnly = false }: { current: EvidenceJob | null; inspectionOnly?: boolean }) {
  const job = current?.operation === 'export' ? current : null;
  const result = record(job?.result);
  if (current && !job) return <Panel title="Local capsule export" meta={`Selected ${current.operation} run`}><p className="empty">The selected {current.operation} run has no export evidence. Choose an export run from Evidence run{inspectionOnly ? '.' : ', or export the current capsule.'}</p></Panel>;
  return <Panel title="Local capsule export" meta={job ? label(job.status) : 'Not exported'}><p>The capsule includes the registered application, explicit inputs, independent assertion, readable test and replay instructions. Export creates a local directory; it does not upload or publish.</p>{typeof result['path'] === 'string' ? <><dl><KeyValue name={inspectionOnly ? "Saved directory locator (host path withheld)" : "Saved directory"} value={<code>{result['path']}</code>} /><KeyValue name="Manifest digest" value={<code>{text(result['manifestDigest'])}</code>} /></dl><dl><KeyValue name="Files validated" value={typeof result['files'] === 'number' ? result['files'] : 'Not reported'} /></dl><div className="notice"><strong>{inspectionOnly ? "Recorded capsule contents" : "Run the exported capsule"}</strong>{inspectionOnly && <p>The executable capsule is excluded from this inspection packet. The displayed locator cannot be opened as a filesystem path.</p>}<p>{inspectionOnly ? <>Inspect the recorded <code>README.md</code> instructions and <code>replay.test.mjs</code> text below. These references perform no replay.</> : <>Open <code>README.md</code> in the saved directory for isolated setup and replay commands. <code>replay.test.mjs</code> is the conventional readable test; <code>integrity.json</code> lists artifact hashes.</>}</p></div><p className="notice">Integrity hashes identify bytes. They do not establish author trust or clean-environment portability. {inspectionOnly ? 'A separate actual supported-environment execution bound to the capsule is required to establish clean-machine replay.' : 'Follow the bundle instructions in a supported isolated environment.'}</p></> : <p className="empty">{job?.status === 'running' ? 'Writing and validating the temporary bundle. It is not complete until atomic finalization succeeds.' : 'No completed capsule is available. Choose Export capsule to create one from the current manifest.'}</p>}</Panel>;
}

function App() {
  const [selected, setSelected] = useState(route), [refreshKey, setRefreshKey] = useState(0);
  const [token, setToken] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [cancelPending, setCancelPending] = useState(false);
  const pending = useRef(false), request = useRef<{ session: string; operation: Operation; key: string } | null>(null);
  const state = useWorkspace(selected.sessionId, selected.jobId, refreshKey);
  const active = state.jobs.find(job => job.status === 'running');
  useEffect(() => { void api<{ token: string }>('/api/config').then(config => setToken(config.token)).catch(cause => setError(String(cause))); }, []);
  useEffect(() => { const changed = () => { setSelected(route()); setError(''); }; addEventListener('hashchange', changed); return () => removeEventListener('hashchange', changed); }, []);
  useEffect(() => { if (!active) setCancelPending(false); }, [active]);
  const perform = useCallback(async (operation: Operation, sessionId = selected.sessionId) => {
    if (!sessionId || pending.current || !token) return;
    pending.current = true; setBusy(true); setError('');
    const prior = request.current;
    const key = prior?.session === sessionId && prior.operation === operation ? prior.key : crypto.randomUUID();
    request.current = { session: sessionId, operation, key };
    try {
      const { job } = await api<{ job: Job }>(`/api/sessions/${sessionId}/jobs`, token, { operation, requestKey: key });
      request.current = null; setRefreshKey(value => value + 1);
      location.hash = href(sessionId, operation === 'reduce' ? 'reduction' : operation === 'verify' ? 'comparison' : operation === 'export' ? 'export' : 'timeline', job.id);
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
  return <><a className="skip" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to evidence</a><div className="shell"><aside className="sidebar"><a className="brand" href="#/new" aria-label="Repro new capture"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 9-5 9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10M7 5l9 5v5" /></svg><span>repro</span><small>LOCAL</small></a><p className="nav-label">EVIDENCE WORKSPACE</p><nav aria-label="Evidence sections">{sections.map(section => !selected.sessionId ? <span className="nav-disabled" aria-disabled="true" key={section}>{titles[section]}</span> : <a key={section} href={href(selected.sessionId, section, selected.jobId, selected.trialIndex)} aria-current={session && selected.section === section ? 'page' : undefined}><span className="nav-marker" aria-hidden="true">{String(sections.indexOf(section) + 1).padStart(2, '0')}</span>{titles[section]}</a>)}</nav>{!selected.sessionId && <p className="nav-hint">Evidence sections become available after capture.</p>}<div className="session-picker"><label htmlFor="session">Local sessions</label><select id="session" value={selected.sessionId ?? ''} onChange={event => { location.hash = href(event.target.value || null); }}><option value="">New capture</option>{state.sessions.map(item => <option key={item.id} value={item.id}>{item.id.slice(0, 8)}</option>)}</select>{session && <p className="session-state">Session state: {session.state}</p>}<a className="new-session" href="#/new">+ New synthetic capture</a></div><p className="sidebar-foot">Local evidence. Explicit inputs.<br />No account or cloud service.<br /><span>Synthetic fixture · local alpha</span></p></aside><main id="main" tabIndex={-1} className="workspace"><header className="topbar"><span>Local workspace <span aria-hidden="true">/</span> <strong>{session ? session.id.slice(0, 8) : 'New capture'}</strong></span><span className="scope-label">Trusted synthetic fixture only</span></header>{error || state.connectionError ? <div className="error-banner" role="alert"><strong>INCONCLUSIVE · Request needs attention</strong><p>{error || state.connectionError}</p><button onClick={() => { void reconnect(); }}>Reconnect & refresh evidence</button></div> : null}{!selected.sessionId ? <Capture busy={busy} ready={Boolean(token)} onCapture={() => { void capture(); }} /> : state.loading && !session ? <div className="loading" role="status">Loading persisted session evidence…</div> : session ? <><section className="intro"><div><p className="eyebrow">SYNTHETIC SEARCH / {session.id.slice(0, 8)}</p><h1>Older response replaces the latest search</h1><p className="muted">{titles[selected.section]} · Registered Chromium frontend · Supplied synthetic specification</p></div><div className="live-status" role="status" aria-live="polite"><Badge value={active ? 'running' : outcome} /><span className="small muted">{active ? `${active.operation} in progress` : state.job ? `${state.job.operation} · ${label(state.job.status)}` : 'No selected evidence'}</span></div></section><InvestigationTasks selected={selected} /><div className="actionbar" role="group" aria-label="Session operations">{operations.map(operation => <button key={operation.key} disabled={Boolean(active) || busy || !token} className={operation.key === 'replay' ? 'primary' : ''} onClick={() => { void perform(operation.key); }}>{operation.label}</button>)}{active && <button className="danger" disabled={cancelPending} onClick={() => { void cancel(); }}>{cancelPending ? 'Cancellation requested…' : 'Cancel active run'}</button>}</div><p className="operation-note">New operations use the current capsule ({session.manifest.actions.length} actions).</p>{active && <p className="operation-note">Other operations are unavailable while this owned run is active. Cancellation preserves completed evidence.</p>}<div className="history-bar"><label htmlFor="job">Evidence run</label><select id="job" value={selected.jobId ?? state.job?.id ?? ''} onChange={event => { location.hash = href(selected.sessionId, selected.section, event.target.value); }} disabled={!state.jobs.length}><option value="" disabled>{state.jobs.length ? 'Select an evidence run' : 'No runs yet'}</option>{state.jobs.map(job => <option key={job.id} value={job.id}>{job.operation} · {job.status} · {job.id.slice(0, 8)}</option>)}</select><span className="small muted">{state.jobs.length} recorded job{state.jobs.length === 1 ? '' : 's'}</span></div><SelectedExpectation job={state.job} input={state.input} error={state.inputError} loading={state.loading} />{state.loading ? <div className="loading" role="status">Loading selected run evidence…</div> : selected.section === 'overview' ? <Overview job={state.job} input={state.input} /> : selected.section === 'timeline' ? <Timeline events={state.events} job={state.job} /> : selected.section === 'dependencies' ? <Dependencies input={state.input} /> : selected.section === 'reduction' ? <Reduction current={state.job} events={state.events} input={state.input} trialIndex={selected.trialIndex} onSelect={index => { location.hash = href(selected.sessionId, 'reduction', state.job?.id ?? null, index); }} /> : selected.section === 'comparison' ? <Comparison current={state.job} /> : <Export current={state.job} />}</> : <p className="empty">This session could not be loaded. Select a local session or reconnect.</p>}<footer className="bottom"><span>Repro local alpha · synthetic training fixture</span><span>Capture ≠ verified portability · hashes establish integrity, not trust</span></footer></main></div></>;
}

// The standalone study builder removes this branch and every live operation.
// Ordinary product builds retain the existing live entry point unchanged.
if (typeof __HCI_STUDY__ === 'undefined' || !__HCI_STUDY__) {
  const root = document.getElementById('root');
  if (!root) throw new Error('Repro root element is missing.');
  createRoot(root).render(<App />);
}
