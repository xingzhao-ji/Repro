// P57 selection identity only. Expected values come from the independently frozen
// packet, never the DOM. Browser controls below are source-only until explicitly run.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const FROZEN_JOB = '3c31f009-7301-45fa-acd8-b5239746588d';
const FROZEN_SESSION = '91f9a9b6-ba78-49fb-bf48-0f096347dd45';
const FROZEN_CASE = '7c788f5c42087b36c373bea1dce2ac8511b6273a117f124fc37178beb9282b8a';
const TRIAL_NOTICE = 'Dependent actions are removed with their prerequisite. Retained actions are not established causes or individually necessary steps. An inconclusive deletion cannot establish necessity.';

// Self-contained for page.evaluate. textContent reads closed details without
// opening, focusing, scrolling, changing attributes, or dispatching any event.
export function readSelectionSnapshot() {
  const all = (selector, owner = document) => [...owner.querySelectorAll(selector)];
  const text = element => element.textContent;
  const classes = element => [...element.classList];
  const fields = owner => all(':scope > dl > .key-value', owner).map(row => ({
    names: all(':scope > dt', row).map(text), values: all(':scope > dd', row).map(text)
  }));
  const badges = owner => all(':scope > .badge', owner).map(badge => ({ classes: classes(badge), text: text(badge) }));
  const roots = all('#root');
  const owned = '#hci-job,[aria-label="Selected job identity"],[aria-label="Reduction trials"],.trial-inspector,[aria-label="Trial evidence"],.trial-select,.selected-trial';
  return {
    schemaVersion: 1,
    route: location.hash,
    roots: roots.map(root => ({ tag: root.tagName, condition: root.getAttribute('data-condition') })),
    outsideRootCount: all(owned).filter(element => !roots[0]?.contains(element)).length,
    jobSelects: all('#hci-job').map(select => ({ tag: select.tagName, value: select.value,
      options: all('option', select).map(option => ({ value: option.value, text: text(option), selected: option.selected, disabled: option.disabled })) })),
    jobIdentities: all('[aria-label="Selected job identity"]').map(identity => ({
      tag: identity.tagName, fields: fields(identity), reasons: all(':scope > p', identity).map(text)
    })),
    trialButtonCount: all('.trial-select').length,
    selectedRowCount: all('tr.selected-trial').length,
    pressedTrialButtonCount: all('button.trial-select[aria-pressed="true"]').length,
    trialRegions: all('[aria-label="Reduction trials"]').map(region => ({
      tag: region.tagName, role: region.getAttribute('role'), group: region.closest('.rejected-trials') ? 'rejected' : 'kept',
      rows: all(':scope > table > tbody > tr', region).map(row => ({ tag: row.tagName, classes: classes(row),
        cellCount: row.cells.length, buttons: all('button', row).map(button => ({
          tag: button.tagName, classes: classes(button), text: text(button), pressed: button.getAttribute('aria-pressed'), disabled: button.disabled
        })) }))
    })),
    inspectors: all('.trial-inspector,[aria-label="Trial evidence"]').map(inspector => ({
      tag: inspector.tagName, classes: classes(inspector), label: inspector.getAttribute('aria-label'),
      headings: all(':scope > header > h2', inspector).map(text), trialLabels: all(':scope > header > span', inspector).map(text),
      statuses: all('[role="status"]', inspector).map(text),
      busyCount: all('[aria-busy="true"]', inspector).length + Number(inspector.getAttribute('aria-busy') === 'true'),
      notices: all('.notice,[role="alert"]', inspector).map(text),
      verdicts: all('.trial-verdict', inspector).map(verdict => ({ badges: badges(verdict), reasons: all(':scope > p', verdict).map(text) })),
      availability: all(':scope > .panel-body > p', inspector).filter(p => text(p).startsWith('Inspector availability:')).map(p => ({
        text: text(p), values: all(':scope > strong', p).map(text), codes: all(':scope > code', p).map(text)
      })),
      identities: all('details', inspector).filter(details => all(':scope > summary', details).some(summary => text(summary) === 'Inspect trial identity')).map(fields),
      linkedRuns: all('.linked-run', inspector).map(run => ({
        headings: all(':scope > h4', run).map(text), ids: all(':scope > h4 > code', run).map(text),
        badges: badges(run), reasons: all(':scope > p', run).slice(0, 1).map(text),
        identities: all(':scope > details', run).filter(details => all(':scope > summary', details).some(summary => text(summary) === 'Inspect run identity')).map(fields)
      }))
    }))
  };
}

const field = (name, value) => ({ names: [name], values: [String(value)] });
const badge = outcome => ({ classes: ['badge', `outcome-${outcome}`], text: ({
  'target-failure': 'Original failure reproduced', 'requirement-satisfied': 'Requirement satisfied',
  inconclusive: 'INCONCLUSIVE', cancelled: 'Cancelled', running: 'Running', complete: 'Operation complete',
  failed: 'Run failed', interrupted: 'Interrupted', ready: 'Ready'
})[outcome] ?? outcome });

// Exported so synthetic fixtures and reviewers can inspect the complete contract.
export function expectedSelectionSnapshot(manifest, state, packet) {
  assert.equal(manifest.jobId, FROZEN_JOB, 'P57 frozen job');
  assert.equal(manifest.sessionId, FROZEN_SESSION, 'P57 frozen session');
  assert.equal(manifest.caseSha256, FROZEN_CASE, 'P57 frozen case');
  assert.equal(packet.caseSha256, manifest.caseSha256, 'Independent packet case');
  assert.equal(packet.evidence.session.id, manifest.sessionId, 'Independent packet session');
  assert.equal(state.condition, 'P', 'P57 condition');
  assert.equal(state.selectedTrial, 1, 'P57 explicitly selects trial 1');
  assert.equal(manifest.route, `#/sessions/${manifest.sessionId}/reduction?run=${manifest.jobId}&trial=1`, 'Exact selected route');
  const jobs = packet.evidence.jobs, matches = jobs.filter(row => row.job.id === manifest.jobId);
  assert.equal(new Set(jobs.map(row => row.job.id)).size, jobs.length, 'Unique frozen packet jobs');
  assert.equal(matches.length, 1, 'Unique frozen selected job');
  const { job, input, trials } = matches[0], records = job.result.trials;
  assert.equal(job.sessionId, manifest.sessionId);
  assert.equal(job.operation, 'reduce');
  assert.equal(input.jobId, job.id);
  assert.equal(input.availability, 'available');
  const selected = trials.filter(trial => trial.trialIndex === state.selectedTrial);
  assert.equal(selected.length, 1, 'Unique frozen selected trial evidence');
  const evidence = selected[0], trial = evidence.trial;
  assert.equal(evidence.jobId, job.id);
  assert.equal(evidence.sessionId, manifest.sessionId);
  assert.equal(evidence.availability, 'available', 'Available frozen inspector');
  assert.equal(trial.index, state.selectedTrial);
  assert.equal(new Set(records.map(row => row.index)).size, records.length, 'Unique complete trial vector');
  assert.deepEqual(records.filter(row => row.index === state.selectedTrial), [trial], 'Inspector belongs to the recorded selected trial');
  assert.deepEqual(evidence.runs.map(run => run.runId), trial.runIds, 'Linked run identity vector');
  const groups = [['kept', records.filter(row => row.accepted)], ['rejected', records.filter(row => !row.accepted)]];
  return {
    schemaVersion: 1, route: manifest.route, roots: [{ tag: 'DIV', condition: state.condition }], outsideRootCount: 0,
    jobSelects: [{ tag: 'SELECT', value: job.id, options: jobs.map(({ job: option }) => ({ value: option.id,
      text: `${option.operation} · ${option.status} · ${option.id}`, selected: option.id === job.id, disabled: false })) }],
    jobIdentities: [{ tag: 'SECTION', fields: [field('Selected job', job.id), field('Operation', job.operation),
      field('Lifecycle status', job.status), field('Started at', job.startedAt), field('Input inspector availability', input.availability),
      field('Input inspector outcome', input.outcome), field('Input manifest digest', input.manifestDigest ?? 'Unavailable'),
      field('Per-run limit', input.manifest ? `${input.manifest.environment.timeoutMs} ms` : 'Unavailable')], reasons: [input.reason] }],
    trialButtonCount: records.length, selectedRowCount: 1, pressedTrialButtonCount: 1,
    trialRegions: groups.filter(([, rows]) => rows.length).map(([group, rows]) => ({ tag: 'DIV', role: 'region', group,
      rows: rows.map(row => ({ tag: 'TR', classes: row.index === state.selectedTrial ? ['selected-trial'] : [], cellCount: 4,
        buttons: [{ tag: 'BUTTON', classes: ['trial-select'], text: `Inspect trial ${row.index}`,
          pressed: String(row.index === state.selectedTrial), disabled: false }] })) })),
    inspectors: [{ tag: 'SECTION', classes: ['panel', 'trial-inspector'], label: 'Trial evidence', headings: ['Trial inspector'],
      trialLabels: [`Trial ${trial.index}`], statuses: [`Trial ${trial.index} evidence ${evidence.availability}.`], busyCount: 0, notices: [TRIAL_NOTICE],
      verdicts: [{ badges: [badge(evidence.outcome)], reasons: [evidence.reason] }],
      availability: [{ text: `Inspector availability: ${evidence.availability}`, values: [evidence.availability], codes: [] }],
      identities: [[field('Job', evidence.jobId), field('Candidate input digest', trial.inputDigest),
        field('Assertion digest', evidence.candidate?.assertionDigest ?? 'Unavailable'), field('Seed', trial.seed)]],
      linkedRuns: evidence.runs.map(run => ({ headings: [`Run ${run.runId}`], ids: [run.runId], badges: [badge(run.outcome)], reasons: [run.reason],
        identities: run.result ? [[field('Run', run.runId), field('Manifest digest', run.result.manifestDigest),
          field('Assertion digest', run.result.assertionDigest), field('Harness digest', run.result.harnessDigest),
          field('Application digest', run.result.appDigest), field('Execution boundary', run.result.environment.isolation)]] : [] }))
    }]
  };
}

export function checkSelectionSnapshot(snapshot, manifest, state, packet) {
  const expected = expectedSelectionSnapshot(manifest, state, packet);
  assert.deepEqual(snapshot, expected, 'Exact frozen job, all trial controls, and available selected inspector identity');
  return { status: 'selection-identity-matched', stateId: state.id, jobId: manifest.jobId, selectedTrial: state.selectedTrial,
    trialCount: expected.trialButtonCount, inspectorAvailability: 'available',
    inspectorOutcome: snapshot.inspectors[0].verdicts[0].badges[0].classes[1].slice('outcome-'.length),
    snapshotSha256: sha256(JSON.stringify(snapshot)), snapshot };
}

function negativeSnapshots() {
  const inspector = snapshot => snapshot.inspectors[0];
  const selectedRow = snapshot => snapshot.trialRegions.flatMap(region => region.rows).find(row => row.classes.includes('selected-trial'));
  return [
    ['wrong-root-condition', s => { s.roots[0].condition = 'R'; }], ['missing-root', s => { s.roots = []; }],
    ['duplicate-root', s => { s.roots.push(s.roots[0]); }], ['wrong-route', s => { s.route += '0'; }],
    ['controls-outside-root', s => { s.outsideRootCount = 1; }],
    ['wrong-selected-job', s => { s.jobSelects[0].value = 'stale-job'; }], ['missing-job-select', s => { s.jobSelects = []; }],
    ['duplicate-job-select', s => { s.jobSelects.push(s.jobSelects[0]); }],
    ['wrong-selected-option', s => { s.jobSelects[0].options[0].selected = true; }],
    ['extra-job-option', s => { s.jobSelects[0].options.push(s.jobSelects[0].options[0]); }],
    ['missing-job-option', s => { s.jobSelects[0].options.pop(); }],
    ['reordered-job-options', s => { s.jobSelects[0].options.reverse(); }],
    ['wrong-job-option-label', s => { s.jobSelects[0].options[0].text = 'stale'; }],
    ['missing-job-identity', s => { s.jobIdentities = []; }], ['duplicate-job-identity', s => { s.jobIdentities.push(s.jobIdentities[0]); }],
    ...Array.from({ length: 8 }, (_, index) => [`job-identity-field-${index}`, s => { s.jobIdentities[0].fields[index].values[0] += '-stale'; }]),
    ['job-identity-reason', s => { s.jobIdentities[0].reasons[0] = 'stale'; }],
    ['duplicate-trial-row', s => { s.trialRegions[0].rows.push(s.trialRegions[0].rows[0]); }],
    ['missing-trial-row', s => { s.trialRegions[0].rows.pop(); }],
    ['wrong-trial-label', s => { selectedRow(s).buttons[0].text = 'Inspect trial 2'; }],
    ['duplicate-trial-button', s => { selectedRow(s).buttons.push(selectedRow(s).buttons[0]); }],
    ['missing-trial-button', s => { selectedRow(s).buttons = []; }],
    ['wrong-group-order', s => { s.trialRegions.reverse(); }], ['wrong-row-order', s => { s.trialRegions[1].rows.reverse(); }],
    ['no-pressed-button', s => { selectedRow(s).buttons[0].pressed = 'false'; s.pressedTrialButtonCount = 0; }],
    ['multiple-pressed-buttons', s => { s.trialRegions[0].rows[0].buttons[0].pressed = 'true'; s.pressedTrialButtonCount++; }],
    ['missing-aria-pressed', s => { selectedRow(s).buttons[0].pressed = null; }],
    ['wrong-selected-row', s => { selectedRow(s).classes = []; s.trialRegions[0].rows[0].classes = ['selected-trial']; }],
    ['extra-selected-row', s => { s.trialRegions[0].rows[0].classes = ['selected-trial']; s.selectedRowCount++; }],
    ['extra-trial-control', s => { s.trialButtonCount++; }],
    ['missing-inspector', s => { s.inspectors = []; }], ['duplicate-inspector', s => { s.inspectors.push(s.inspectors[0]); }],
    ['stale-inspector-trial', s => { inspector(s).trialLabels = ['Trial 2']; }],
    ['loading-inspector', s => { inspector(s).statuses = ['Loading evidence for trial 1…']; }],
    ['unavailable-inspector', s => { inspector(s).statuses = ['Trial 1 evidence unavailable.']; }],
    ['busy-inspector', s => { inspector(s).busyCount = 1; }],
    ['missing-explanatory-notice', s => { inspector(s).notices = []; }],
    ['inspector-error', s => { inspector(s).notices.push('Evidence unavailable'); }],
    ['stale-actual-availability', s => { inspector(s).availability[0].values = ['unavailable']; }],
    ['wrong-inspector-outcome', s => { inspector(s).verdicts[0].badges = [badge('target-failure')]; }],
    ['wrong-inspector-reason', s => { inspector(s).verdicts[0].reasons = ['stale']; }],
    ['missing-inspector-identity', s => { inspector(s).identities = []; }],
    ['duplicate-inspector-identity', s => { inspector(s).identities.push(inspector(s).identities[0]); }],
    ...Array.from({ length: 4 }, (_, index) => [`trial-identity-field-${index}`, s => { inspector(s).identities[0][index].values[0] += '-stale'; }]),
    ['missing-linked-run', s => { inspector(s).linkedRuns = []; }],
    ['duplicate-linked-run', s => { inspector(s).linkedRuns.push(inspector(s).linkedRuns[0]); }],
    ['wrong-linked-run-id', s => { inspector(s).linkedRuns[0].ids = ['wrong-run']; }],
    ...Array.from({ length: 6 }, (_, index) => [`linked-run-identity-field-${index}`, s => { inspector(s).linkedRuns[0].identities[0][index].values[0] += '-stale'; }]),
    ['wrong-linked-run-outcome', s => { inspector(s).linkedRuns[0].badges = [badge('target-failure')]; }],
    ['wrong-linked-run-reason', s => { inspector(s).linkedRuns[0].reasons = ['stale']; }]
  ];
}

export function selectionSelfTest(manifest, state, packet) {
  assert.ok(manifest && state && packet, 'Pass the verified manifest, state, and independently frozen packet');
  const positive = expectedSelectionSnapshot(manifest, state, packet);
  const matched = checkSelectionSnapshot(positive, manifest, state, packet);
  const controls = negativeSnapshots().map(([id, mutate]) => {
    const changed = structuredClone(positive); mutate(changed);
    assert.throws(() => checkSelectionSnapshot(changed, manifest, state, packet), { code: 'ERR_ASSERTION' }, id);
    return { id, status: 'rejected' };
  });
  return { status: 'pure-selection-controls-passed', expectationBasis: 'independent-frozen-packet-and-original-html-source',
    positive: { status: matched.status, snapshotSha256: matched.snapshotSha256, trialCount: matched.trialCount },
    negativeCount: controls.length, controls, browserControls: 'UNRUN', productObservation: 'UNRUN' };
}

// Synthetic DOM only: caller supplies a dedicated disposable page. This does not
// load the product, import Playwright, launch a browser, or authorize execution.
export async function runSelectionBrowserControls(page, manifest, state, packet) {
  const expected = expectedSelectionSnapshot(manifest, state, packet);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const dl = values => `<dl>${values.map(({ names, values: entries }) => `<div class="key-value"><dt>${escape(names[0])}</dt><dd>${escape(entries[0])}</dd></div>`).join('')}</dl>`;
  const badgeHTML = value => `<span class="${escape(value.classes.join(' '))}">${escape(value.text)}</span>`;
  const identity = expected.jobIdentities[0], inspector = expected.inspectors[0];
  const html = `<div id="root" data-condition="P"><select id="hci-job">${expected.jobSelects[0].options.map(option => `<option value="${escape(option.value)}"${option.selected ? ' selected' : ''}>${escape(option.text)}</option>`).join('')}</select>
    <section aria-label="Selected job identity">${dl(identity.fields)}<p>${escape(identity.reasons[0])}</p></section>
    ${expected.trialRegions.map(region => `${region.group === 'rejected' ? '<details class="rejected-trials" open><summary>Rejected</summary>' : ''}<div role="region" aria-label="Reduction trials"><table><tbody>${region.rows.map(row => `<tr${row.classes.length ? ' class="selected-trial"' : ''}><td><button class="trial-select" aria-pressed="${row.buttons[0].pressed}">${escape(row.buttons[0].text)}</button></td><td></td><td></td><td></td></tr>`).join('')}</tbody></table></div>${region.group === 'rejected' ? '</details>' : ''}`).join('')}
    <section class="panel trial-inspector" aria-label="Trial evidence"><header><h2>Trial inspector</h2><span>Trial 1</span></header><div class="panel-body"><p role="status">${escape(inspector.statuses[0])}</p>
    <div class="trial-verdict">${badgeHTML(inspector.verdicts[0].badges[0])}<p>${escape(inspector.verdicts[0].reasons[0])}</p></div><p>Inspector availability: <strong>available</strong></p>
    <p class="notice">${escape(TRIAL_NOTICE)}</p><details><summary>Inspect trial identity</summary>${dl(inspector.identities[0])}</details><div class="trial-runs">${inspector.linkedRuns.map(run => `<section class="linked-run"><h4>Run <code>${escape(run.ids[0])}</code></h4>${badgeHTML(run.badges[0])}<p>${escape(run.reasons[0])}</p>${run.identities.map(identity => `<details><summary>Inspect run identity</summary>${dl(identity)}</details>`).join('')}</section>`).join('')}</div></div></section></div>`;
  const controls = ['positive', 'wrong-job', 'wrong-trial', 'duplicate-row', 'missing-row', 'no-pressed', 'duplicate-pressed',
    'missing-inspector', 'duplicate-inspector', 'loading', 'unavailable', 'inspector-error', 'stale-availability', 'wrong-outcome', 'wrong-reason',
    'wrong-job-identity', 'wrong-candidate-digest', 'wrong-assertion-digest', 'wrong-seed', 'wrong-linked-run', 'wrong-hidden-linked-run', 'wrong-linked-outcome', 'wrong-linked-reason'];
  const receipts = [];
  for (const id of controls) {
    await page.setContent(html);
    await page.evaluate(route => { location.hash = route; }, manifest.route);
    await page.evaluate(control => {
      const q = selector => document.querySelector(selector), inspector = q('.trial-inspector');
      const selected = q('.selected-trial'), fields = inspector.querySelectorAll('details dd');
      const mutations = {
        'wrong-job': () => { q('#hci-job').selectedIndex = 0; },
        'wrong-trial': () => { selected.querySelector('button').textContent = 'Inspect trial 2'; },
        'duplicate-row': () => { selected.after(selected.cloneNode(true)); }, 'missing-row': () => { selected.remove(); },
        'no-pressed': () => { selected.querySelector('button').setAttribute('aria-pressed', 'false'); },
        'duplicate-pressed': () => { q('button.trial-select').setAttribute('aria-pressed', 'true'); },
        'missing-inspector': () => { inspector.remove(); }, 'duplicate-inspector': () => { inspector.after(inspector.cloneNode(true)); },
        loading: () => { inspector.querySelector('[role="status"]').textContent = 'Loading evidence for trial 1…'; },
        unavailable: () => { inspector.querySelector('[role="status"]').textContent = 'Trial 1 evidence unavailable.'; },
        'inspector-error': () => { const error = document.createElement('p'); error.className = 'notice'; error.textContent = 'Evidence unavailable'; inspector.append(error); },
        'stale-availability': () => { inspector.querySelector('.panel-body > p > strong').textContent = 'unavailable'; },
        'wrong-outcome': () => { inspector.querySelector('.trial-verdict > .badge').textContent = 'Original failure reproduced'; },
        'wrong-reason': () => { inspector.querySelector('.trial-verdict > p').textContent = 'stale'; },
        'wrong-job-identity': () => { fields[0].textContent = 'stale-job'; },
        'wrong-candidate-digest': () => { fields[1].textContent = 'stale-digest'; },
        'wrong-assertion-digest': () => { fields[2].textContent = 'stale-digest'; }, 'wrong-seed': () => { fields[3].textContent = '0'; },
        'wrong-linked-run': () => { inspector.querySelector('.linked-run h4 code').textContent = 'stale-run'; },
        'wrong-hidden-linked-run': () => { inspector.querySelector('.linked-run details dd').textContent = 'stale-run'; },
        'wrong-linked-outcome': () => { inspector.querySelector('.linked-run > .badge').textContent = 'Original failure reproduced'; },
        'wrong-linked-reason': () => { inspector.querySelector('.linked-run > p').textContent = 'stale'; }
      };
      if (control !== 'positive') mutations[control]();
    }, id);
    const before = await page.evaluate(() => ({ html: document.body.outerHTML, route: location.hash }));
    const snapshot = await page.evaluate(readSelectionSnapshot);
    const after = await page.evaluate(() => ({ html: document.body.outerHTML, route: location.hash }));
    assert.deepEqual(after, before, `${id}: snapshot reader preserves DOM, closed details, and route`);
    if (id === 'positive') checkSelectionSnapshot(snapshot, manifest, state, packet);
    else assert.throws(() => checkSelectionSnapshot(snapshot, manifest, state, packet), { code: 'ERR_ASSERTION' }, id);
    receipts.push({ id, status: id === 'positive' ? 'matched' : 'rejected', snapshotSha256: sha256(JSON.stringify(snapshot)), domUnchanged: true });
  }
  return { status: 'synthetic-browser-selection-controls-passed', controls: receipts, productObservation: 'UNRUN' };
}
