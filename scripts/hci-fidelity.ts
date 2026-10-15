/** Research-only frozen evidence compiler. No product runtime imports or execution. */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve, relative, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface SourceIndex {
  schemaVersion: 1; classification: 'synthetic-technical-fidelity'; sourceCommit: string; caseId: string;
  records: { id: string; name: string; operation: string; lifecycle: string }[];
  files: { id: string; file: string; recordId: string; role: string; sha256: string; bytes: number; provenance: string }[];
}
export type SourceDocuments = Record<string, Record<string, unknown>>;
export interface FrozenFact {
  id: string; recordId: string; section: string; label: string; text: string;
  source: { fileId: string; pointer: string };
}
export interface FrozenCase {
  classification: 'synthetic-technical-fidelity'; sourceCommit: string; caseId: string;
  records: SourceIndex['records']; sources: SourceIndex['files']; facts: FrozenFact[];
}
const assertion = 'fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711';
const apps = { buggy: 'a81479664d26fb060c8ad5a9136f32777a75b3e4049fbf14fde479549ec3b38a', fixed: '62dc6cf692d2c26d821ee5f6cde9fdf8660bed810a5726deeddf5b6771c7ba09' };
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export class FidelityError extends Error { readonly category = 'verification'; readonly code = 'HCI_FIDELITY'; }
function fail(message: string): never { throw new FidelityError(`HCI fidelity verification: ${message}`); }
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Unsupported source object.');
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] { if (!Array.isArray(value)) fail('Unsupported source list.'); return value; }
function text(value: unknown): string { if (typeof value !== 'string' || value.length > 65536) fail('Unsupported source text.'); return value; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(obj(value)[k])}`).join(',')}}`;
  if (value === undefined) fail('Missing source value.');
  return JSON.stringify(value);
}
const digest = (value: unknown): string => hash(canonical(value));
// One audited observed case only; this is not an arbitrary evidence import/render API.
const frozenModelDigest = '7aa12eb57804c1a9d9ee5e452e543e61a6bba9e740bfbc19d4eba60c38466c07';
function frozenModel(value: FrozenCase): void { if (digest(value) !== frozenModelDigest) fail('Frozen model identity mismatch.'); }
function equal(a: unknown, b: unknown, reason: string): void { if (canonical(a) !== canonical(b)) fail(reason); }
function validateManifest(manifest: Record<string, unknown>): void {
  equal(manifest['assertionDigest'], assertion, 'Frozen assertion identity changed.');
  equal(manifest['classification'], 'synthetic-training-fixture', 'Source classification changed.');
  equal(manifest['expectationBasis'], 'supplied-synthetic-specification', 'Expectation basis changed.');
  equal(manifest['humanApproval'], 'not-claimed', 'Unestablished human approval.');
  equal(manifest['expectation'], { description: 'A response belonging to an older search request must not replace results for the most recently issued request.', expectedResults: ['Beta synthetic result'], invariantId: 'LATEST_SEARCH_RESPONSE_WINS', latestQuery: 'beta', latestRequestId: 2 }, 'Frozen expected behavior changed.');
  equal(manifest['responses'], [{ requestId: 2, results: ['Beta synthetic result'] }, { requestId: 1, results: ['Alpha synthetic result'] }], 'Response schedule changed.');
  equal(manifest['app'], { revision: 'buggy', sourceDigest: apps.buggy }, 'Manifest application identity changed.');
}
function validateRun(run: Record<string, unknown>, manifest: Record<string, unknown>, harness: unknown, revision: 'buggy' | 'fixed'): void {
  equal(run['manifestDigest'], digest(manifest), 'Run input manifest identity mismatch.');
  equal(run['assertionDigest'], assertion, 'Run assertion identity mismatch.');
  equal(run['harnessDigest'], harness, 'Comparison harness identity mismatch.');
  if (!/^[a-f0-9]{64}$/.test(text(harness))) fail('Harness identity missing.');
  equal(run['appRevision'], revision, 'Application revision identity mismatch.');
  equal(run['appDigest'], apps[revision], 'Application source identity mismatch.');
  equal(run['seed'], obj(manifest['environment'])['seed'], 'Seed identity mismatch.');
  equal(run['runnerVersion'], manifest['runnerVersion'], 'Runner identity mismatch.');
  equal(run['adapterVersion'], obj(manifest['adapter'])['version'], 'Adapter identity mismatch.');
  equal(run['assertionCount'], 1, 'Exactly one assertion must execute.');
  const expectedOutcome = revision === 'buggy' ? 'target-failure' : 'requirement-satisfied';
  equal(run['outcome'], expectedOutcome, 'Assertion outcome mismatch.');
  equal(run['observation'], { latestRequestId: 2, query: 'beta', results: [revision === 'buggy' ? 'Alpha synthetic result' : 'Beta synthetic result'] }, 'Observation contradicts the frozen assertion.');
  const responses = list(run['events']).map(obj).filter(e => e['type'] === 'response-completed').map(e => e['message']);
  equal(responses, ['HTTP response 2 completed in the frontend.', 'HTTP response 1 completed in the frontend.'], 'Observed response completion order mismatch.');
}
function recordId(id: unknown): void { if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) fail('Unsupported record identifier.'); }
function explanation(value: unknown, allowed: readonly string[]): void { if (typeof value !== 'string' || !allowed.includes(value)) fail('Source explanation is outside the frozen allowlist.'); }
function validateIndex(index: SourceIndex): void {
  if (index.schemaVersion !== 1 || index.classification !== 'synthetic-technical-fidelity' || index.sourceCommit !== '15a82252b46b870f120faa448fbd55bec11333a4' || index.caseId !== 'release-ui-stale-response') fail('Unsupported source index.');
  if (!Array.isArray(index.files) || index.files.length < 10 || index.files.length > 64 || !Array.isArray(index.records) || index.records.length !== 5) fail('Source inventory outside bounds.');
  if (new Set(index.files.map(f => f.id)).size !== index.files.length || new Set(index.files.map(f => f.file)).size !== index.files.length) fail('Duplicate source identity.');
  if (new Set(index.records.map(r => r.id)).size !== 5 || new Set(index.records.map(r => r.name)).size !== 5) fail('Duplicate record identity.');
  for (const record of index.records) recordId(record.id);
  for (const file of index.files) {
    if (!/^[a-zA-Z0-9-]+\.json$/.test(file.file) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isInteger(file.bytes) || file.bytes < 1 || file.bytes > 1048576 || !index.records.some(r => r.id === file.recordId)) fail('Unsafe source path, hash or size.');
  }
}

/** This pure compiler also checks cross-file claims when tests deliberately bypass byte integrity. */
export function compileFrozenCase(index: SourceIndex, docs: SourceDocuments): FrozenCase {
  validateIndex(index);
  for (const file of index.files) if (!docs[file.id]) fail('Missing indexed source.');
  const facts: FrozenFact[] = [];
  for (const record of index.records) {
    const manifestId = `${record.name}-manifest`, resultId = `${record.name}-result`;
    const manifest = obj(docs[manifestId]), result = obj(docs[resultId]);
    validateManifest(manifest);
    const input = digest(manifest);
    const add = (suffix: string, section: string, label: string, value: string, fileId = resultId, pointer = '/') => {
      facts.push({ id: `${record.name}-${suffix}`, recordId: record.id, section, label, text: value, source: { fileId, pointer } });
    };
    add('identity', 'identity', 'Selected record', `${record.operation} · ${record.lifecycle} · ${record.id}`);
    add('manifest', 'identity', 'Frozen input identity', input, manifestId, '/');
    add('expectation', 'expectation', 'Expected behavior', text(obj(manifest['expectation'])['description']), manifestId, '/expectation');
    add('scope', 'expectation', 'Experiment scope', 'Actual Chromium frontend with controlled HTTP responses; supplied synthetic specification; human approval not claimed. Backend behavior is not tested.', manifestId, '/boundary');
    add('assertion', 'expectation', 'Frozen assertion identity', assertion, manifestId, '/assertionDigest');
    add('schedule', 'expectation', 'Controlled response schedule', 'Request 2 / Beta, then request 1 / Alpha.', manifestId, '/responses');
    add('input', 'identity', 'Frozen manifest', JSON.stringify(manifest, null, 2), manifestId, '/');
    if (record.operation === 'record') {
      validateRun(result, manifest, result['harnessDigest'], 'buggy');
      add('observation', 'failure', 'Observed failure', `${result['outcome']}: ${JSON.stringify(result['observation'])}; assertion count: ${result['assertionCount']}.`, resultId, '/observation');
      add('order', 'failure', 'Observed completion order', '2 then 1; both responses completed before assertion.', resultId, '/events');
      add('comparison', 'comparison', 'Historical association', 'No comparison belongs to this record. Later verification is a separate selected record.');
      add('run', 'identity', 'Run and harness identity', `${text(result['id'])}; harness ${text(result['harnessDigest'])}; app ${text(result['appDigest'])}.`);
    } else if (record.operation === 'verify') {
      equal(result['manifestDigest'], input, 'Comparison manifest identity mismatch.');
      const original = obj(result['original']), candidate = obj(result['candidate']);
      if (original['id'] === candidate['id']) fail('Comparison requires distinct execution identities.');
      validateRun(original, manifest, original['harnessDigest'], 'buggy');
      validateRun(candidate, manifest, original['harnessDigest'], 'fixed');
      for (const [name, run] of [['original', original], ['candidate', candidate]] as const) {
        add(name, 'comparison', `${name} observation`, `${run['outcome']}: ${JSON.stringify(run['observation'])}; assertion count: ${run['assertionCount']}; run ${run['id']}; app ${run['appDigest']}; harness ${run['harnessDigest']}.`, resultId, `/${name}`);
      }
      add('limit', 'comparison', 'Comparison limit', 'The registered fixed frontend satisfies this unchanged assertion and schedule. This does not verify a real backend, arbitrary revision or universal correctness.');
    } else if (record.operation === 'reduce') {
      equal(result['minimality'], 'unverified', 'Frozen case minimality must remain unverified.');
      explanation(result['reason'], ['Search completed, but inconclusive or unstable final neighbors leave dependency-group minimality unverified.', 'Baseline was not established under the repetition rule. Reduction cancelled during execution.']);
      const trials = list(result['trials']).map(obj);
      if (trials.length > 51 || !trials.length) fail('Reduction trial limit.');
      let current = structuredClone(manifest);
      const runIds = new Set<string>();
      const harness = obj(result['baseline'])['harnessDigest'];
      for (let i = 0; i < trials.length; i++) {
        const trial = trials[i]!;
        explanation(trial['reason'], ['Target failure preserved in 2/2 required repetitions.', 'Run evidence does not match the frozen input, assertion, application, or execution identity.', 'Reduction cancelled during execution.']);
        equal(trial['index'], i, 'Trial order identity mismatch.');
        const removed = list(trial['removed']).map(text);
        const candidate = { ...current, actions: list(current['actions']).map(obj).filter(a => !removed.includes(text(a['id']))) };
        equal(trial['inputDigest'], digest(candidate), 'Trial candidate input identity mismatch.');
        const ids = list(trial['runIds']).map(text);
        if (!ids.length || ids.some(id => runIds.has(id)) || new Set(ids).size !== ids.length) fail('Trial requires distinct repetition identities.');
        ids.forEach(id => runIds.add(id));
        const linked: { id: string; run: Record<string, unknown> }[] = [];
        if (trial['accepted'] === true) {
          if (ids.length !== 2 || trial['outcome'] !== 'target-failure') fail('Accepted trial requires two failure repetitions.');
          for (const id of ids) {
            const evidence = obj(docs[`${record.name}-run-${id}`]);
            equal(evidence['id'], id, 'Linked run identity mismatch.');
            validateRun(evidence, candidate, harness, 'buggy');
            linked.push({ id, run: evidence });
          }
          current = candidate;
        }
        add(`trial-${i}`, 'reduction', `${i === 0 ? 'Baseline' : 'Trial'} ${i}`, `Removed: ${removed.join(', ') || 'none'}. Recorded outcome: ${trial['outcome']}. Accepted: ${trial['accepted']}. ${trial['reason']} Input ${trial['inputDigest']}. Repetition run IDs: ${ids.join(', ')}.`, resultId, `/trials/${i}`);
        for (const { id, run } of linked) add(`trial-${i}-run-${id}`, 'reduction', `Trial ${i} linked execution`, `Run ${id}: ${run['outcome']}; observation ${JSON.stringify(run['observation'])}; assertion count ${run['assertionCount']}; input ${run['manifestDigest']}; assertion ${run['assertionDigest']}; harness ${run['harnessDigest']}; app ${run['appDigest']}.`, `${record.name}-run-${id}`, '/');
      }
      equal(result['manifest'], current, 'Final reduction manifest identity mismatch.');
      if (record.lifecycle === 'cancelled' && (trials.some(t => t['accepted'] === true) || result['status'] !== 'cancelled' || obj(result['baseline'])['assertionCount'] !== 0)) fail('Cancelled baseline cannot establish reduction.');
      equal(obj(result['baseline'])['id'], list(trials[0]!['runIds'])[0], 'Baseline run association mismatch.');
      equal(obj(result['baseline'])['manifestDigest'], input, 'Baseline input identity mismatch.');
      equal(obj(result['baseline'])['assertionDigest'], assertion, 'Baseline assertion identity mismatch.');
      if (record.lifecycle === 'cancelled') { equal(obj(result['baseline'])['observation'], null, 'Cancelled baseline has contradictory observation.'); add('baseline', 'reduction', 'Cancelled baseline observation', `Run ${obj(result['baseline'])['id']}; outcome ${obj(result['baseline'])['outcome']}; assertion count 0; observation null. No accepted trial established a new baseline.`, resultId, '/baseline'); }
      add('retained', 'reduction', 'Retained actions', list(current['actions']).map(a => text(obj(a)['id'])).join(', '), resultId, '/manifest/actions');
      add('minimality', 'reduction', 'Reduction limits', `Minimality: ${result['minimality']}. ${result['reason']}`, resultId, '/reason');
    } else if (record.operation === 'export') {
      equal(result['manifestDigest'], input, 'Export input identity mismatch.');
      add('files', 'export', 'Recorded export', `${result['files']} files recorded for this selected export; manifest ${input}.`, resultId, '/files');
      add('portability', 'export', 'Portability evidence', 'Clean-environment replay is unverified for this selected export. Another capsule’s Linux success is not evidence for it.');
    } else fail('Unsupported record operation.');
    add('limits', 'limitations', 'Evidence limits', 'One supplied synthetic failure family; trusted local evidence, not author authentication. No participant observations or interface-effectiveness result. Native zoom and actual screen reader remain unverified.');
  }
  const value: FrozenCase = { classification: index.classification, sourceCommit: index.sourceCommit, caseId: index.caseId, records: structuredClone(index.records), sources: structuredClone(index.files), facts };
  frozenModel(value);
  return value;
}

export async function loadFrozenCase(root: string, suppliedIndex?: SourceIndex): Promise<FrozenCase> {
  const index = suppliedIndex ?? JSON.parse(await readFile(new URL('../research/hci/fidelity-source-15a8225.json', import.meta.url), 'utf8')) as SourceIndex;
  validateIndex(index);
  const boundary = resolve('.repro-runs'); const absolute = resolve(root);
  if (!relative(boundary, absolute) || relative(boundary, absolute).startsWith('..')) fail('Source root must be a task-owned run directory.');
  let parent = process.cwd();
  for (const part of relative(parent, absolute).split(sep)) {
    parent = join(parent, part); const stat = await lstat(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Unsafe source directory.');
  }
  const docs: SourceDocuments = {};
  for (const entry of index.files) {
    const path = join(absolute, entry.file), before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size !== entry.bytes) fail('Unsafe source file or size.');
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (stat.ino !== before.ino || stat.dev !== before.dev || stat.size !== entry.bytes || stat.nlink !== 1) fail('Source changed during read.');
      const bytes = Buffer.alloc(entry.bytes + 1); let count = 0;
      while (count < bytes.length) { const read = await handle.read(bytes, count, bytes.length - count, null); if (!read.bytesRead) break; count += read.bytesRead; }
      if (count !== entry.bytes || hash(bytes.subarray(0, count)) !== entry.sha256) fail('Source integrity hash mismatch.');
      docs[entry.id] = obj(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count))));
    } finally { await handle.close(); }
  }
  return compileFrozenCase(index, docs);
}

/** Portable allowlisted research fixture; original raw bytes are checked separately by the CLI. */
export async function loadProjectedCase(): Promise<FrozenCase> {
  const indexBytes = await readFile(new URL('../research/hci/fidelity-source-15a8225.json', import.meta.url));
  const projection = obj(JSON.parse(await readFile(new URL('../research/hci/fidelity-projection-15a8225.json', import.meta.url), 'utf8')));
  equal(projection['classification'], 'synthetic-evidence-projection', 'Projection classification mismatch.');
  equal(projection['sourceIndexSha256'], hash(indexBytes), 'Projection source index identity mismatch.');
  return compileFrozenCase(JSON.parse(indexBytes.toString('utf8')) as SourceIndex, obj(projection['documents']) as SourceDocuments);
}

export function assertFactParity(expected: FrozenFact[], actual: FrozenFact[]): void {
  const sorted = (facts: FrozenFact[]) => facts.map(f => canonical(f)).sort();
  equal(sorted(expected), sorted(actual), 'Rendered fact parity mismatch.');
}
const escape = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function renderCondition(value: FrozenCase, condition: 'P' | 'L'): string {
  if (condition !== 'P' && condition !== 'L') fail('Unsupported presentation condition.');
  for (const record of value.records) recordId(record.id);
  frozenModel(value);
  const initialId = JSON.stringify(value.records[0]!.id).replace(/</g, '\\u003c');
  const fact = (f: FrozenFact) => `<article data-fact data-id="${escape(f.id)}" data-record="${escape(f.recordId)}" data-section="${escape(f.section)}" data-file="${escape(f.source.fileId)}" data-pointer="${escape(f.source.pointer)}"><h3 data-label>${escape(f.label)}</h3><p data-value>${escape(f.text)}</p><p class="source">Source: ${escape(f.source.fileId)}#${escape(f.source.pointer)}</p></article>`;
  const panels = value.records.map(record => {
    const facts = value.facts.filter(f => f.recordId === record.id);
    const sections = [...new Set(facts.map(f => f.section))];
    const content = condition === 'P' ? sections.map(s => `<details data-group="${escape(s)}" ${['expectation', 'limitations'].includes(s) ? 'open' : ''}><summary>${escape(({ identity: 'Identity and inputs', expectation: 'Establish failure: expectation', failure: 'Establish failure: observations', reduction: 'Reduce steps', comparison: 'Check fix', export: 'Inspect handoff', limitations: 'Evidence limits' } as Record<string, string>)[s] ?? s)}</summary>${facts.filter(f => f.section === s).map(fact).join('')}</details>`).join('') : sections.map(s => `<section><h2>${escape(s)}</h2>${facts.filter(f => f.section === s).map(fact).join('')}</section>`).join('');
    return `<section data-panel="${escape(record.id)}" hidden><h2>${escape(record.name)} · ${escape(record.id)}</h2>${content}</section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>Frozen synthetic inspection — ${condition}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f5f1;color:#202832;font:16px/1.55 system-ui,sans-serif}header,nav,main,footer{max-width:1100px;margin:auto;padding:20px}header{border-bottom:1px solid #7c8590}h1{font-size:28px;line-height:1.2}h2{font-size:21px}h3,summary{font-size:17px}a{color:#114d85}a:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #005eaa;outline-offset:3px}nav{display:flex;gap:12px;flex-wrap:wrap}nav a{overflow-wrap:anywhere}input{width:100%;padding:12px;font:inherit;border:1px solid #596570}article{padding:10px 0;border-bottom:1px solid #bdc3c8}p{margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}.source{font-size:13px;color:#46525e}details{padding:10px 0}summary{cursor:pointer;font-weight:600}main:focus{outline:none}.skip{position:absolute;left:-10000px}.skip:focus{position:static;margin:20px;display:block}label{font-weight:600}.search{max-width:1100px;margin:auto;padding:20px}footer{border-top:1px solid #7c8590}a[aria-current]{font-weight:700}[hidden]{display:none!important}
</style></head><body><a class="skip" href="#evidence">Skip to evidence</a><header><p>Research preparation · condition ${condition}</p><h1>${condition === 'P' ? 'Establish failure → Reduce steps → Check fix' : 'Frozen evidence report'}</h1><p>Synthetic technical fidelity rehearsal; zero participant sessions. Read-only precomputed evidence from ${escape(value.sourceCommit)}.</p><p>Glossary: target-failure means the intended assertion failed; requirement-satisfied means this bounded assertion passed; INCONCLUSIVE means the supplied evidence cannot establish the claim. Retained actions do not establish necessity or global minimality.</p></header><nav aria-label="Frozen records">${value.records.map(r => `<a href="#${escape(r.id)}">${escape(r.name)} · ${escape(r.lifecycle)} · ${escape(r.id)}</a>`).join('')}</nav><div class="search"><label for="search">Search selected evidence</label><input id="search" type="search"><p id="matches" role="status" aria-live="polite"></p></div><main id="evidence" tabindex="-1">${panels}<section id="missing" hidden><h2>INCONCLUSIVE: record unavailable</h2><p>This locator identifies no record in the frozen case. No other record’s verdict can be substituted.</p><a id="recover" href="#${escape(value.records[0]!.id)}">Return to the earlier record</a></section></main><footer><p>One synthetic family; P is a research adaptation of the workbench. No live execution, answers, participant data or performance measurements. Native zoom and actual screen reader unverified.</p><details><summary>Source inventory</summary>${value.sources.map(s => `<p>${escape(s.id)} — SHA-256 ${escape(s.sha256)}</p>`).join('')}</details></footer><script>
const panels=Array.from(document.querySelectorAll('[data-panel]'));const search=document.querySelector('#search');
function update(focus){const id=location.hash.slice(1)||${initialId};let found=false;panels.forEach(p=>{p.hidden=p.dataset.panel!==id;if(!p.hidden)found=true});document.querySelector('#missing').hidden=found;document.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+id)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current')});let count=0;document.querySelectorAll('[data-fact]').forEach(f=>{const match=f.textContent.toLowerCase().includes(search.value.toLowerCase());f.hidden=!match;if(match&&f.closest('[data-panel]').dataset.panel===id){count++;if(search.value)f.closest('details')?.setAttribute('open','')}});document.querySelector('#matches').textContent=found?count+' matching evidence fields':'Record unavailable';if(focus)document.querySelector('#evidence').focus()}
document.querySelector('.skip').addEventListener('click',e=>{e.preventDefault();document.querySelector('#evidence').focus()});addEventListener('hashchange',()=>update(true));search.addEventListener('input',()=>update(false));update(false);
</script></body></html>`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const projected = args.length === 3 && args[0] === '--projection' && args[1] === '--output';
  if (!projected && (args.length !== 4 || args[0] !== '--source' || args[2] !== '--output')) fail('Use --projection --output new-task-directory, or --source task-directory --output new-task-directory.');
  const value = projected ? await loadProjectedCase() : await loadFrozenCase(args[1]!);
  const output = resolve(args[projected ? 2 : 3]!), boundary = resolve('.repro-runs/hci-fidelity');
  const local = relative(boundary, output);
  if (!local || local.startsWith('..') || local.includes(sep)) fail('Output must be one new directory directly under .repro-runs/hci-fidelity.');
  const parent = await lstat(dirname(output)); if (!parent.isDirectory() || parent.isSymbolicLink()) fail('Unsafe output parent.');
  try { await lstat(output); fail('Output already exists.'); } catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
  const stage = `${output}.stage-${randomUUID()}`;
  await mkdir(stage, { mode: 0o700 });
  try {
    const files: Record<string, string> = { 'P.html': renderCondition(value, 'P'), 'L.html': renderCondition(value, 'L'), 'case.json': JSON.stringify(value, null, 2) };
    for (const [name, content] of Object.entries(files)) await writeFile(join(stage, name), content, { flag: 'wx' });
    await writeFile(join(stage, 'hashes.json'), JSON.stringify(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])), null, 2), { flag: 'wx' });
    await rename(stage, output); process.stdout.write(JSON.stringify({ classification: value.classification, facts: value.facts.length, sourceVerification: projected ? 'portable-projection-only' : 'pinned-raw-source', output })+'\n');
  } catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(JSON.stringify(error instanceof FidelityError ? { category: error.category, code: error.code, message: error.message } : { category: 'environment', code: 'HCI_FIDELITY_IO', message: 'The bounded fidelity operation could not read or finalize its task-owned files.' })+'\n'); process.exitCode = 1; });
}
// Keep imports side-effect free; no product, ledger, browser or service is started here.
