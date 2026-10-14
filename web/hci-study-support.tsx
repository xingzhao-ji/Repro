import { useMemo, useState, type ReactNode } from 'react';
import type { CaseJob, HciCasePacket } from '../scripts/hci-case.js';
import { evidenceFacts, studyHref, SYNTHETIC_INVALID_JOB, type EvidenceFact, type StudyRoute } from './evidence-source.js';

export const sectionTitles = { overview: 'Overview', timeline: 'Event timeline', dependencies: 'Dependencies', reduction: 'Reduction history', comparison: 'Compare evidence', export: 'Local export' };

export function EvidenceValues({ values }: { values: [string, ReactNode][] }) {
  return <dl>{values.map(([name, value]) => <div className="key-value" key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>;
}
export function StudyNotice({ packet }: { packet: HciCasePacket }) {
  return <section className="study-notice" aria-label="Frozen evidence scope"><h2>Frozen synthetic evidence · inspection only</h2><p>This packet contains records for the registered synthetic fixture. These pages inspect frozen evidence; they do not execute the application or collect participant activity.</p><p>Host paths are withheld. Artifact locators are inventory references only. Trace bytes, screenshot bytes, and the full execution bundle are excluded. Recorded export instructions and readable test text are included as inert references.</p><details><summary>Packet identity</summary><EvidenceValues values={[
    ['Case', <code>{packet.evidence.caseId}</code>], ['Case SHA-256', <code>{packet.caseSha256}</code>],
    ['Source commit', <code>{packet.evidence.source.commit}</code>], ['Runtime inventory SHA-256', <code>{packet.evidence.source.runtimeInventorySha256}</code>],
    ['Recorded database SHA-256', <code>{packet.evidence.source.databaseSha256}</code>], ['Failure family', packet.evidence.failureFamily],
  ]} /></details></section>;
}
export function StudySelection({ packet, selected, row }: { packet: HciCasePacket; selected: StudyRoute; row: CaseJob | null }) {
  return <><div className="history-bar"><label htmlFor="hci-job">Evidence run</label><select id="hci-job" value={selected.jobId} onChange={event => { location.hash = studyHref({ ...selected, sessionId: packet.evidence.session.id, jobId: event.target.value, trialIndex: null }); }}>
    {!row && <option value={selected.jobId}>Unknown requested evidence · {selected.jobId || '(empty)'}</option>}
    {packet.evidence.jobs.map(item => <option key={item.job.id} value={item.job.id}>{item.job.operation} · {item.job.status} · {item.job.id}</option>)}
  </select><span>{packet.evidence.jobs.length} recorded jobs</span></div>
    <p className="small"><a href={studyHref({ ...selected, sessionId: packet.evidence.session.id, jobId: SYNTHETIC_INVALID_JOB, trialIndex: null })}>Synthetic invalid evidence locator</a> · Deliberately invalid navigation example; this is not an executed or recorded job.</p>
    {!row && <div className="error-banner" role="alert"><strong>INCONCLUSIVE · NOT_FOUND</strong><p>The requested evidence run is not in this frozen case. Select a recorded Evidence run to recover. No other job has been substituted.</p><code>{selected.jobId}</code></div>}
  </>;
}
export function SelectedIdentity({ row }: { row: CaseJob }) {
  return <section className="study-identity" aria-label="Selected job identity"><EvidenceValues values={[
    ['Selected job', <code>{row.job.id}</code>], ['Operation', row.job.operation], ['Lifecycle status', row.job.status],
    ['Started at', row.job.startedAt], ['Input inspector availability', row.input.availability], ['Input inspector outcome', row.input.outcome],
    ['Input manifest digest', <code>{row.input.manifestDigest ?? 'Unavailable'}</code>], ['Per-run limit', row.input.manifest ? `${row.input.manifest.environment.timeoutMs} ms` : 'Unavailable'],
  ]} /><p>{row.input.reason}</p></section>;
}
function FactTable({ facts, packet, selected }: { facts: EvidenceFact[]; packet: HciCasePacket; selected: StudyRoute }) {
  return <div className="table-scroll" role="region" aria-label="Evidence fact table" tabIndex={0}><table><thead><tr><th scope="col">Evidence field</th><th scope="col">Recorded value</th></tr></thead><tbody>{facts.map(fact => <tr key={fact.path}><th scope="row">{fact.jobId ? <a href={studyHref({ sessionId: packet.evidence.session.id, jobId: fact.jobId, section: fact.trialIndex === null ? selected.section : 'reduction', trialIndex: fact.trialIndex })}><code>{fact.path}</code></a> : <code>{fact.path}</code>}</th><td><code>{fact.value}</code></td></tr>)}</tbody></table></div>;
}
export function StudySearch({ packet, selected }: { packet: HciCasePacket; selected: StudyRoute }) {
  const [query, setQuery] = useState('');
  const facts = useMemo(() => evidenceFacts(packet), [packet]);
  const download = useMemo(() => `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(packet))}`, [packet]);
  const needle = query.trim().toLocaleLowerCase('en-US');
  const matches = needle ? facts.filter(fact => `${fact.path} ${fact.value}`.toLocaleLowerCase('en-US').includes(needle)) : [];
  return <section className="study-search" aria-label="Search frozen evidence"><label htmlFor="hci-evidence-search">Search evidence</label><div className="study-search-controls"><input id="hci-evidence-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search all jobs, trials, identities, and observations" /><button type="button" onClick={() => setQuery('')}>Clear search</button><a download="evidence.json" href={download}>Download evidence</a></div><p className="small" role="status">{needle ? `${matches.length} matching evidence facts across this frozen packet.` : `${facts.length} evidence facts available across all recorded jobs.`}</p>{needle && <section aria-label="Evidence search results">{matches.length ? <FactTable facts={matches} packet={packet} selected={selected} /> : <p>No matching evidence facts.</p>}</section>}</section>;
}
export function StudyAppendix({ row, packet, selected }: { row: CaseJob; packet: HciCasePacket; selected: StudyRoute }) {
  const index = packet.evidence.jobs.indexOf(row);
  const facts = useMemo(() => evidenceFacts(packet).filter(fact => fact.path.startsWith(`/evidence/jobs/${index}/`)), [packet, index]);
  return <details className="study-appendix"><summary>Complete selected-job evidence</summary><p>All persisted fields in this job’s projected packet are available below. Empty arrays, null observations, and withheld paths retain their explicit values.</p><FactTable facts={facts} packet={packet} selected={selected} /><h3>Selected-job JSON</h3><pre className="codeblock wrap" role="region" aria-label="Complete selected-job evidence JSON" tabIndex={0}>{JSON.stringify(row, null, 2)}</pre></details>;
}
export function ExportReferences({ packet }: { packet: HciCasePacket }) {
  return <section className="study-export-references" aria-label="Recorded export references"><details><summary>Recorded export instructions and readable test</summary><p>These two documents are the recorded export’s reference text, bound to its source inventory by the displayed byte counts and SHA-256 values. They are inert text here. Host paths and the complete executable bundle are withheld; this view performs no replay.</p>{packet.evidence.exportDocuments.map(document => <section key={document.name}><h3>{document.name}</h3><EvidenceValues values={[
    ['SHA-256', <code>{document.sha256}</code>], ['Bytes', document.bytes],
  ]} /><pre className="codeblock wrap" role="region" tabIndex={0} aria-label={`Export reference ${document.name}`}>{document.text}</pre></section>)}</details></section>;
}
export function StudyGlossary() {
  return <details className="study-glossary"><summary>Glossary and limitations</summary><dl>
    <dt>Frozen input</dt><dd>The selected job’s saved manifest and exact digest. Historical jobs can have different action lists and per-run deadlines; the session’s later manifest cannot replace their saved input.</dd>
    <dt>Assertion and observation</dt><dd>The supplied synthetic expectation is evaluated after controlled responses. A zero assertion count or null observation does not establish the target failure or requirement satisfaction.</dd>
    <dt>Controlled response schedule</dt><dd>The real Chromium frontend receives synthetic HTTP responses. This evaluates frontend response handling; it does not verify a real backend fix or every response schedule.</dd>
    <dt>Baseline and removal</dt><dd>Trial 0 checks the baseline and removes nothing. Later recorded accepted decisions describe attempted removals. Dependencies are preserved; an inconclusive deletion does not establish that a step is necessary.</dd>
    <dt>Recorded decision and inspector availability</dt><dd>The reducer’s recorded accepted value and reason are distinct from the inspector’s availability, outcome, and code. A raw run reason such as MISSING_STEPS is distinct from an attribution or identity mismatch reported by the inspector.</dd>
    <dt>Minimality</dt><dd>Completion and retained action count do not establish global minimality. Unverified final neighbors remain unverified. Any recorded dependency-group claim is bounded by the tested input, oracle, and budget.</dd>
    <dt>Comparison</dt><dd>Original and candidate observations must be attributed to their exact runs with the same assertion, harness, and controlled inputs. A result from another job cannot be attributed to the selected record.</dd>
    <dt>Cancelled reduction</dt><dd>A retained action count alone is not new verified reproduction evidence. Inspect the exact baseline, repetition evidence, cancellation reason, and recorded trial decision.</dd>
    <dt>Local export and evidence download</dt><dd>Recorded export completion describes a local capsule directory. Host paths are withheld in this packet; local-export and evidence-artifact values are inventory locators, not usable filesystem paths. This evidence download contains the projected packet only, not the executable capsule, trace, or screenshot bytes. Export is not upload and does not establish clean-machine execution.</dd>
    <dt>Identity and scope</dt><dd>Hashes identify evidence bytes, not trusted authorship. Only one supplied synthetic failure family is represented. No independent case family, participant evaluation, universal determinism, or human usability result is established. Native zoom and human screen-reader checks remain unverified.</dd>
  </dl></details>;
}
