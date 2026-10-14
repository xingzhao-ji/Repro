import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CaseJob, HciCasePacket } from '../scripts/hci-case.js';
import type { ReductionResult } from '../src/contracts.js';
import { Comparison, Dependencies, Export, InvestigationTasks, Overview, Reduction, SelectedExpectation, Timeline, TrialInspector, TrialTable } from './main.js';
import { frozenSource, studyHref, studyRoute, studySections, type StudyRoute, type TrialReader } from './evidence-source.js';
import { EvidenceValues, ExportReferences, sectionTitles, SelectedIdentity, StudyAppendix, StudyGlossary, StudyNotice, StudySearch, StudySelection } from './hci-study-support.js';
import './hci-report.css';

function ReportTimeline({ row }: { row: CaseJob }) {
  return <section aria-label="Recorded event report"><h2>Event timeline</h2><p>{row.events.length} persisted events · sequence represents execution order, not dependency edges.</p><div className="table-scroll" role="region" aria-label="Recorded events" tabIndex={0}><table><thead><tr><th scope="col">Sequence</th><th scope="col">Time</th><th scope="col">Event / action</th><th scope="col">Recorded message</th></tr></thead><tbody>{row.events.map(event => <tr key={event.seq}><th scope="row">{event.seq}</th><td><time dateTime={event.at}>{event.at}</time></td><td>{event.type}<br /><code>{event.actionId ?? 'Not action-specific'}</code></td><td>{event.message}</td></tr>)}</tbody></table></div></section>;
}
function ReportReduction({ row, selected, readTrial, onTrial }: { row: CaseJob; selected: StudyRoute; readTrial: TrialReader; onTrial: (index: number) => void }) {
  if (row.job.operation !== 'reduce') return <section><h2>Reduction history</h2><p>The selected {row.job.operation} run has no reduction evidence. Choose a reduce run from Evidence run.</p></section>;
  const result = row.job.result as ReductionResult;
  return <section><h2>Reduction history</h2><p>Action-only dependency groups · 50 execution limit · 120 second wall-time limit · 2 required reproductions per accepted candidate.</p><EvidenceValues values={[
    ['Recorded status', result.status], ['Retained actions', result.manifest.actions.length], ['Executions', `${result.executions}/50`], ['Duration', `${result.durationMs} ms`], ['Minimality', result.minimality],
  ]} /><p>{result.reason}</p><p>Completion does not establish global minimality. Retained actions are not individually established necessary steps; inconclusive deletion attempts do not establish necessity.</p><TrialTable trials={result.trials} selected={selected.trialIndex ?? result.trials[0]?.index ?? null} onSelect={onTrial} /><TrialInspector key={row.job.id} job={row.job} input={row.input} trialIndex={selected.trialIndex ?? result.trials[0]?.index ?? null} readTrial={readTrial} /></section>;
}
function ProgressiveEvidence({ row, selected, readTrial, onTrial }: { row: CaseJob; selected: StudyRoute; readTrial: TrialReader; onTrial: (index: number) => void }) {
  switch (selected.section) {
    case 'timeline': return <Timeline events={row.events} job={row.job} />;
    case 'dependencies': return <Dependencies input={row.input} />;
    case 'reduction': return <Reduction current={row.job} events={row.events} input={row.input} trialIndex={selected.trialIndex} onSelect={onTrial} readTrial={readTrial} />;
    case 'comparison': return <Comparison current={row.job} inspectionOnly />;
    case 'export': return <Export current={row.job} inspectionOnly />;
    default: return <Overview job={row.job} input={row.input} />;
  }
}
function ConventionalReport({ row, selected, readTrial, onTrial }: { row: CaseJob; selected: StudyRoute; readTrial: TrialReader; onTrial: (index: number) => void }) {
  return <article className="conventional-report" aria-label="Evidence report"><section id="report-overview"><h2>Overview</h2><Overview job={row.job} input={row.input} /></section><section id="report-timeline"><ReportTimeline row={row} /></section><section id="report-dependencies"><h2>Dependencies</h2><Dependencies input={row.input} /></section><section id="report-reduction"><ReportReduction row={row} selected={selected} readTrial={readTrial} onTrial={onTrial} /></section><section id="report-comparison"><h2>Compare evidence</h2><Comparison current={row.job} inspectionOnly /></section><section id="report-export"><h2>Local export</h2><Export current={row.job} inspectionOnly /></section></article>;
}
function Study({ packet, condition }: { packet: HciCasePacket; condition: 'P' | 'L' }) {
  const source = useMemo(() => frozenSource(packet), [packet]);
  const [selected, setSelected] = useState(() => studyRoute(location.hash, packet));
  useEffect(() => {
    const changed = () => setSelected(studyRoute(location.hash, packet));
    addEventListener('hashchange', changed);
    return () => removeEventListener('hashchange', changed);
  }, [packet]);
  useEffect(() => {
    if (condition === 'L' && location.hash) document.getElementById(`report-${selected.section}`)?.scrollIntoView();
  }, [condition, selected.section]);
  const row = source.select(selected);
  const onTrial = (index: number) => { location.hash = studyHref({ ...selected, section: 'reduction', trialIndex: index }); };
  return <><a className="skip" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to evidence</a><div className={`study-shell condition-${condition}`}><header className="study-heading"><p className="eyebrow">REPRO · FROZEN SYNTHETIC EVIDENCE</p><h1>Older response replaces the latest search</h1><p>{condition === 'P' ? 'Evidence workbench' : 'Evidence report'} · {packet.evidence.caseId}</p></header><StudyNotice packet={packet} /><StudySearch packet={packet} selected={selected} /><StudyGlossary /><StudySelection packet={packet} selected={selected} row={row} /><nav aria-label="Evidence sections" className="study-navigation">{studySections.map(section => <a key={section} href={studyHref({ ...selected, section })} aria-current={selected.section === section ? 'page' : undefined}>{sectionTitles[section]}</a>)}</nav><main id="main" tabIndex={-1}>
    {condition === 'P' && <InvestigationTasks selected={selected} />}
    <SelectedExpectation job={row?.job ?? null} input={row?.input ?? null} error={row ? '' : 'INCONCLUSIVE · NOT_FOUND: The requested evidence run is not in this frozen case.'} loading={false} />
    {row && <><SelectedIdentity row={row} />{condition === 'P' ? <ProgressiveEvidence row={row} selected={selected} readTrial={source.readTrial} onTrial={onTrial} /> : <ConventionalReport row={row} selected={selected} readTrial={source.readTrial} onTrial={onTrial} />}{row.job.id === packet.evidence.roles.export && <ExportReferences packet={packet} />}<StudyAppendix row={row} packet={packet} selected={selected} /></>}
  </main><footer className="bottom"><span>Frozen local inspection · synthetic evidence records</span><span>Export ≠ clean-machine proof · hashes identify bytes, not authorship</span></footer></div></>;
}

const embedded = document.getElementById('hci-evidence');
const root = document.getElementById('root');
if (!embedded?.textContent || !root) throw new Error('Frozen evidence or study root is missing.');
const packet = JSON.parse(embedded.textContent) as HciCasePacket;
const condition = root.dataset.condition;
if (condition !== 'P' && condition !== 'L') throw new Error('Unknown frozen study condition.');
createRoot(root).render(<Study packet={packet} condition={condition} />);
