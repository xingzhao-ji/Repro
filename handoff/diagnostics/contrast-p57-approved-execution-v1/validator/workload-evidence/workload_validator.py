"""Read-only five-batch prospective workload evidence checks; no browser/runtime actions.

validate_workload(runtime, jobdir, require) calls require(bool, code). A recording
callback is supported: every local failure still prevents sourceComplete. This
module validates retained evidence closure, not independent pixel truth or lifecycle cleanup.
"""
from pathlib import Path
import hashlib
import json
import math

SEMANTIC_SHA256 = 'e5b973ed32dbd7b1fbfb4aad71a95830c02d44134b61e82d0f044541cdba48a9'
STATUSES = ('measured-pass', 'measured-fail', 'unresolved')
JOB = 'p390-00-11'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def packed(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()


def finite(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def coordinate(value):
    return type(value) in (int, float) and math.isfinite(value)


def rectangle(value):
    return isinstance(value, dict) and all(coordinate(value.get(k)) for k in ('left', 'right', 'top', 'bottom')) and value['left'] < value['right'] and value['top'] < value['bottom']


def inside(a, b):
    return rectangle(a) and rectangle(b) and a['left'] >= b['left'] and a['right'] <= b['right'] and a['top'] >= b['top'] and a['bottom'] <= b['bottom']


def decode(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('duplicate JSON key')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))


class InvalidEvidence(Exception):
    pass


def validate_workload(runtime: Path, jobdir: Path, require, job="p390-00-11") -> dict:
    """Read only explicit input/summary/referenced artifact paths, never scan.

    Returns expectedSourceExitCode, sourceComplete, workloadStatus/workloadstatus,
    counts, historicalOutcomeDeviation, bindings and issues. The caller compares
    expectedSourceExitCode with external source/terminal receipts; exit86 remains
    an instrumentation failure handled outside this module.
    """
    JOB = job
    runtime, jobdir = Path(runtime), Path(jobdir)
    issues, bindings, seen = [], [], set()
    outcome = {'expectedSourceExitCode': None, 'sourceComplete': False,
               'workloadStatus': None, 'workloadstatus': None, 'counts': {},
               'historicalOutcomeDeviation': None, 'bindings': bindings,
               'issues': issues, 'acceptance': 'NOT_EVALUATED'}

    def check(condition, code):
        condition = bool(condition)
        if not condition:
            issues.append(code)
        require(condition, code)
        return condition

    def need(condition, code):
        if not check(condition, code):
            raise InvalidEvidence(code)

    def read(path, cap=64 * 1024 * 1024):
        path = Path(path)
        need(not path.is_symlink() and path.is_file(), 'workload.file.regular:' + path.name)
        need(0 < path.stat().st_size <= cap, 'workload.file.size:' + path.name)
        data = path.read_bytes()
        if str(path) not in seen:
            bindings.append({'path': str(path), 'bytes': len(data), 'sha256': digest(data)})
            seen.add(str(path))
        return data

    def reference(ref, filename=None):
        need(isinstance(ref, dict), 'workload.reference.object')
        name = ref.get('file')
        need(isinstance(name, str) and name == Path(name).name and name not in ('', '.', '..'), 'workload.reference.basename')
        if filename is not None:
            check(name == filename, 'workload.reference.expected:' + filename)
        path = artifacts / name
        need(path.resolve().parent == artifacts.resolve(), 'workload.reference.confined')
        data = read(path)
        check(type(ref.get('bytes')) is int and len(data) == ref['bytes'], 'workload.reference.bytes:' + name)
        check(digest(data) == ref.get('sha256'), 'workload.reference.sha256:' + name)
        return data

    def envelope(value, kind, result_index=None):
        wanted = {'schemaVersion', 'kind', 'batchId', 'acceptance', 'acceptanceRequires'}
        wanted |= {'row', 'resultIndex'} if result_index is not None else {'browserControlsStatus', 'browserControlCounts', 'controls', 'screenshotControls', 'surfaceControls', 'guardBrowserControls', 'selectionBrowserControls'}
        check(set(value) == wanted, 'workload.envelope.shape:' + kind)
        check(value.get('schemaVersion') == 1 and value.get('kind') == kind and value.get('batchId') == JOB, 'workload.envelope.identity:' + kind)
        check(value.get('acceptance') == 'PROVISIONAL' and value.get('acceptanceRequires') == semantic['acceptanceRequires'], 'workload.envelope.provisional:' + kind)
        if result_index is not None:
            check(value.get('resultIndex') == result_index, 'workload.envelope.index')

    def no_diagnostic_fields(value):
        forbidden = {'lifecycleDiagnostics', 'instrumentedClosureComplete', 'runtimeVersions', 'sourceSummaryBudget', 'sourceExitCode', 'phaseEvents', 'taskStatReads', 'metadataBytes', 'completionWritten'}
        if isinstance(value, dict):
            return not (set(value) & forbidden) and all(no_diagnostic_fields(v) for v in value.values())
        return not isinstance(value, list) or all(no_diagnostic_fields(v) for v in value)

    def measurement(observed, label, expected_text=None, require_steps=True, all_equivalence=False, expected_text_nodes=None):
        need(isinstance(observed, dict), label + '.object')
        need(all(k in observed for k in ('status', 'reasons', 'steps', 'characters', 'totalCharacters', 'coveredCharacters', 'whitespaceOffsets', 'unsupportedOffsets')), label + '.full-shape')
        reasons, steps, chars = observed['reasons'], observed['steps'], observed['characters']
        need(all(isinstance(v, list) for v in (reasons, steps, chars)), label + '.arrays')
        check(observed['status'] in STATUSES, label + '.status')
        check(not any(r in reasons for r in ('internal-time-budget', 'dom-changed-during-sampling', 'paint-changed-between-scroll-positions', 'outside-paint-inventory-topology-changed', 'outside-paint-inventory-identity-changed', 'occluder-prefilter-equivalence-failed')), label + '.no-partial')
        if require_steps:
            check(0 < len(steps) <= 12, label + '.steps-present')
        elif not steps:
            check(observed['status'] == 'unresolved' and reasons in (['exact-single-text-node-required'], ['scroll-position-budget-exceeded']) and observed['coveredCharacters'] == 0 and observed['totalCharacters'] == len(chars) and all(c.get('witness') is None for c in chars), label + '.original-early-return')
            return
        check(observed.get('plannedScrollPositions') == [s.get('requestedScrollLeft') for s in steps], label + '.all-planned-steps')
        required_step = {'index', 'requestedScrollLeft', 'actualScrollLeft', 'scrollWidth', 'clientWidth', 'viewport', 'windowScroll', 'clip', 'paint', 'timing', 'occluderEquivalence', 'scannedElements', 'rawCandidates', 'newCovered', 'outsideClip', 'hitTestRejected', 'overlapRejected', 'backgroundAreaRejected', 'noRangeRect', 'possibleOccluders', 'outsidePaint'}
        for index, step in enumerate(steps):
            need(isinstance(step, dict) and set(step) == required_step, label + '.full-step')
            check(step['index'] == index, label + '.step-order')
            need(isinstance(step['paint'], dict) and {'issues', 'ancestry', 'layers', 'contrastRatio', 'requiredContrast'} <= set(step['paint']), label + '.paint-full')
            check(isinstance(step['paint']['ancestry'], list) and bool(step['paint']['ancestry']) and isinstance(step['paint']['layers'], list), label + '.paint-ancestry')
            need(isinstance(step['possibleOccluders'], list) and isinstance(step['outsidePaint'], list), label + '.paint-arrays')
            eq = step['occluderEquivalence']
            need(isinstance(eq, dict), label + '.equivalence-object')
            if all_equivalence:
                check(eq.get('checked') is True, label + '.equivalence-required')
            if eq.get('checked'):
                check(eq.get('equal') is True and eq.get('legacyOccluders') == step['possibleOccluders'], label + '.equivalence-equal')
            for effect in step['outsidePaint']:
                need(isinstance(effect, dict) and {'owner', 'effect', 'boxes', 'supported', 'reasons'} <= set(effect), label + '.outside-paint-full')
            check(isinstance(step['timing'], dict) and all(k in step['timing'] and finite(step['timing'][k]) for k in ('paintDurationMs', 'optimizedScanDurationMs', 'coverageDurationMs', 'stepDurationMs')), label + '.step-timing')
        if expected_text is not None:
            check(observed.get('text') == expected_text, label + '.text')
            expected_chars = [(i, c) for i, c in enumerate(expected_text) if not c.isspace() and 32 <= ord(c) <= 126]
            check([(c.get('offset'), c.get('character')) for c in chars] == expected_chars, label + '.character-vector')
            offset=0; mapping=[]
            for ni,txt in enumerate(expected_text_nodes or [expected_text]):
                mapping.append({'nodeIndex':ni,'start':offset,'end':offset+len(txt),'data':txt});offset+=len(txt)
            check(observed.get('textNodeMapping') == mapping, label + '.text-node-boundaries')
            check(observed['whitespaceOffsets'] == [i for i, c in enumerate(expected_text) if c.isspace()] and observed['unsupportedOffsets'] == [], label + '.text-offsets')
        check(observed['totalCharacters'] == len(chars), label + '.character-count')
        covered = []
        ratios = []
        for char in chars:
            need(isinstance(char, dict) and {'offset', 'textNodeIndex', 'textNodeOffset', 'character', 'witness'} == set(char), label + '.character-full')
            if expected_text is not None:
                wanted=next((m for m in mapping if m['start']<=char['offset']<m['end']),None)
                check(wanted is not None and char['textNodeIndex']==wanted['nodeIndex'] and char['textNodeOffset']==char['offset']-wanted['start'],label+'.character-boundary')
            witness = char['witness']
            if witness is None:
                continue
            need(isinstance(witness, dict) and {'stepIndex', 'actualScrollLeft', 'clip', 'ranges', 'contrastRatio', 'requiredContrast'} == set(witness), label + '.witness-full')
            need(type(witness['stepIndex']) is int and 0 <= witness['stepIndex'] < len(steps), label + '.witness-step')
            step = steps[witness['stepIndex']]
            check(witness['actualScrollLeft'] == step['actualScrollLeft'] and witness['clip'] == step['clip'], label + '.witness-step-match')
            check(witness['contrastRatio'] == step['paint']['contrastRatio'] and witness['requiredContrast'] == step['paint']['requiredContrast'] and step['paint']['issues'] == [] and all(e['supported'] is True for e in step['outsidePaint']), label + '.witness-paint-consistency')
            need(bool(step['paint']['layers']), label + '.witness-paint-layers')
            need(isinstance(witness['ranges'], list) and bool(witness['ranges']), label + '.witness-ranges')
            for box in witness['ranges']:
                need(isinstance(box, dict) and {'rect', 'points'} == set(box) and isinstance(box['points'], list) and len(box['points']) == 3, label + '.range-full')
                check(all(isinstance(p, dict) and {'x', 'y', 'hit', 'unobscured'} == set(p) and p['unobscured'] is True for p in box['points']), label + '.range-hit-tests')
                check(inside(box['rect'], step['clip']) and all(inside(box['rect'], layer.get('area')) for layer in step['paint']['layers']), label + '.range-contained')
                check(all(coordinate(p.get('x')) and coordinate(p.get('y')) and box['rect']['left'] <= p['x'] <= box['rect']['right'] and box['rect']['top'] <= p['y'] <= box['rect']['bottom'] and isinstance(p.get('hit'), dict) for p in box['points']), label + '.range-points')
                check(all(not (box['rect']['left'] < o['rect']['right'] and box['rect']['right'] > o['rect']['left'] and box['rect']['top'] < o['rect']['bottom'] and box['rect']['bottom'] > o['rect']['top']) for o in step['possibleOccluders']), label + '.range-no-occluders')
            check(finite(witness['contrastRatio']) and finite(witness['requiredContrast']) and witness['requiredContrast'] > 0, label + '.contrast-finite')
            covered.append(char['offset'])
            ratios.append((witness['contrastRatio'], witness['requiredContrast']))
        check(observed['coveredCharacters'] == len(covered), label + '.covered-count')
        if chars or require_steps:
            uncovered = [c['offset'] for c in chars if c['witness'] is None]
            check(observed.get('uncoveredOffsets') == uncovered, label + '.uncovered-vector')
            check(not uncovered or 'incomplete-character-coverage' in reasons, label + '.uncovered-reason')
            derived = 'unresolved' if reasons else 'measured-fail' if any(a < b for a, b in ratios) else 'measured-pass'
            check(observed['status'] == derived, label + '.derived-status')

    try:
        here = Path(__file__).resolve().parent
        semantic_bytes = read(here / 'prospective-expectations.json', 1024 * 1024)
        need(digest(semantic_bytes) == SEMANTIC_SHA256, 'workload.semantic-expectations.binding')
        semantic = decode(semantic_bytes)
        expected=semantic['jobs'][JOB]
        count=expected['batch']['expectedNodeCount']; state_id=expected['stateId']
        semantic={**semantic,'selection':expected['selection'],'nodeIdentities':expected['nodeIdentities']}
        artifacts = jobdir / 'artifacts' / JOB
        summary = decode(read(artifacts / 'summary.json', 16 * 1024 * 1024))
        need(isinstance(summary, dict), 'workload.summary.object')
        check(set(summary) == set(semantic['summaryKeys']), 'workload.summary.original-full-shape-no-added-fields')
        check(no_diagnostic_fields(summary), 'workload.summary.no-nested-diagnostics')
        for key, value in semantic['summaryStable'].items():
            check(summary.get(key) == value, 'workload.summary.stable:' + key)
        check(summary.get('sourceObservationComplete') is True, 'workload.summary.source-complete')
        for field in ('error', 'internalBudgetExpired'):
            check(field not in summary, 'workload.summary.no-' + field)
        for field in ('cleanupErrors', 'pageErrors', 'unexpectedRequests'):
            check(summary.get(field) == [], 'workload.summary.empty:' + field)
        manifest_bytes = read(runtime / 'input' / 'contrast-p57-approved-batch-inputs.json', 1024 * 1024)
        manifest = decode(manifest_bytes)
        check(summary.get('manifestSha256') == digest(manifest_bytes), 'workload.summary.manifest-binding')
        check(summary.get('verifiedInputs') == manifest['sourceFiles'] + manifest['probeSources'] + manifest['batchInputFiles'], 'workload.summary.verified-input-vector')
        batch = summary['batch']
        check(batch == {'id': JOB, 'planSha256': '0abcd3553b3875fca305670cf6ec4e3ec0ae3af15176013df40a26479422a0dd', 'assigned': expected['batch']['nodes'], 'expectedNodeCount': count, 'fullManifestCount': 57, 'globalCompletionClaim': False, 'acceptance': 'PROVISIONAL', 'externalCleanup': 'PENDING_INDEPENDENT_REVIEW'}, 'workload.batch.exact')
        need(len(summary['states']) == 1, 'workload.states.one')
        state = summary['states'][0]
        check(set(state) == set(semantic['stateKeys']), 'workload.state.original-shape')
        check(state['id'] == state_id and state['viewport'] == expected['viewport'] and state['status'] == 'exact-dom-preserved' and summary['completedStateCount'] == 1, 'workload.state.identity-complete')
        check(state['nodes'] == [{'sourceAuditNodeIndex': n['sourceAuditNodeIndex'], 'resultIndex': i} for i,n in enumerate(expected['selectedOriginalNodes'])], 'workload.state.node-order')
        for field in ('selectionBefore', 'selectionAfter'):
            check(state[field] == semantic['selection'], 'workload.' + field + '.exact-frozen-identity')
            check(digest(packed(state[field]['snapshot'])) == state[field]['snapshotSha256'], 'workload.' + field + '.snapshot-hash')
        before = reference(state['bodyBeforeArtifact'], state_id+'-body-before.html')
        after = reference(state['bodyAfterArtifact'], state_id+'-body-after.html')
        check(before == after and b'<body' in before and b'data-condition="P"' in before, 'workload.body.complete-unchanged')
        inventory = state['outsidePaintInventory']
        check(set(inventory) == set(semantic['inventoryKeys']), 'workload.inventory.full-shape')
        check(type(inventory['totalElements']) is int and inventory['totalElements'] == inventory['checkedElements'] and inventory['totalElements'] >= len(inventory['candidates']) > 0 and all(set(c) == {'index', 'owner', 'captured'} for c in inventory['candidates']), 'workload.inventory.complete')
        check(digest(packed(inventory['styles'])) == semantic['stylesSha256'] and inventory.get('externalStylesheets') == 0 and inventory.get('inlineStyledElements') == 0, 'workload.corrected-candidate-styles')
        check(summary['browserControlsStatus'] == 'PASS' and summary['browserControlCounts'] == semantic['expectedControlCounts'], 'workload.controls.counts')
        controls = decode(reference(summary['controlArtifact'], 'controls-' + JOB + '.json'))
        control_ref = summary['controlArtifact']
        check(control_ref.get('kind') == 'p57-full-control-evidence' and control_ref.get('batchId') == JOB and control_ref.get('acceptance') == 'PROVISIONAL' and control_ref.get('acceptanceRequires') == semantic['acceptanceRequires'], 'workload.controls.reference-envelope')
        envelope(controls, 'p57-full-control-evidence')
        check(no_diagnostic_fields(controls), 'workload.controls.no-nested-diagnostics')
        check(controls['browserControlsStatus'] == 'PASS' and controls['browserControlCounts'] == semantic['expectedControlCounts'], 'workload.controls.archived-counts')
        for field, specs in semantic['controlSpecs'].items():
            entries = controls[field]
            need(isinstance(entries, list) and len(entries) == len(specs), 'workload.controls.vector:' + field)
            for entry, spec in zip(entries, specs):
                label = 'workload.control:' + spec['id']
                for key, value in spec.items():
                    check(entry.get(key) == value, label + '.descriptor:' + key)
                extras = {'before', 'after', 'beforeSha256', 'afterSha256', 'mutations', 'durationMs', 'screenshot'} if field == 'screenshotControls' else {'observed'} | ({'rejectedTerminalRange'} if spec.get('tightEdge') else set())
                check(set(entry) == set(spec) | extras, label + '.full-shape')
                if field == 'screenshotControls':
                    reference(entry['screenshot'], 'screenshot-control-' + spec['id'].split('-')[-1] + '.png')
                    fixture = '<body><input id="caret" value="probe"></body>'
                    check(entry['before'] == fixture and entry['beforeSha256'] == digest(fixture.encode()), label + '.before')
                    wanted = fixture if spec['id'] == 'screenshot-initial' else '<body><input id="caret" value="probe" style=""></body>'
                    check(entry['after'] == wanted and entry['afterSha256'] == digest(wanted.encode()), label + '.after')
                    check(entry['mutations'] == [] if spec['id'] == 'screenshot-initial' else any(x.get('id') == 'caret' and x.get('attributeName') == 'style' for x in entry['mutations']), label + '.mutations')
                else:
                    observed = entry['observed']
                    measurement(observed, label, require_steps=not spec.get('nested') and spec['id'] != 'inadequate-scroll-budget', all_equivalence=True)
                    check(observed['status'] == spec['expected'], label + '.expected-status')
                    if 'reason' in spec:
                        check(spec['reason'] in observed['reasons'], label + '.expected-reason')
                    if spec['expected'] == 'measured-pass':
                        check(any(c.get('witness') and c['witness']['stepIndex'] > 0 for c in observed['characters']), label + '.multi-position-witness')
                    if spec.get('adjacent'):
                        check(len(observed.get('textNodeMapping', [])) == 2 and all(any(c['textNodeIndex'] == i and c['witness'] for c in observed['characters']) for i in (0, 1)), label + '.adjacent-boundaries')
                    if spec.get('unsafe'):
                        check(any(s['backgroundAreaRejected'] > 0 for s in observed['steps']), label + '.unsafe-rejected')
                    if spec['id'] == 'rounded-outset-safe-interior' or spec.get('historyPanels'):
                        check(all(any(layer.get('opaqueSurface', {}).get('scope', {}).get('selectedSurface') is True if spec.get('historyPanels') else layer.get('opaqueSurface', {}).get('supported') is True for layer in s['paint']['layers']) for s in observed['steps']), label + '.reviewed-surface')
                    if spec.get('extra') or spec.get('pseudo'):
                        check(any(any(p.get('owner', {}).get('id') == 'outside' for p in s['outsidePaint']) for s in observed['steps']) and all(not any(p.get('owner', {}).get('id') == 'outside' for p in s['possibleOccluders']) for s in observed['steps']), label + '.outside-inventory')
                    if spec.get('tightEdge'):
                        last, terminal = observed['steps'][-1], entry['rejectedTerminalRange']
                        check(observed.get('text') == '12 ms ' + '0123456789abcdef' * 8 and observed['totalCharacters'] == 132 and observed['coveredCharacters'] == 131 and observed.get('uncoveredOffsets') == [133] and observed['unsupportedOffsets'] == [] and observed['reasons'] == ['incomplete-character-coverage'], label + '.tight-coverage')
                        check(observed.get('textNodeMapping') == [{'nodeIndex': 0, 'start': 0, 'end': 2, 'data': '12'}, {'nodeIndex': 1, 'start': 2, 'end': 134, 'data': ' ms ' + '0123456789abcdef' * 8}] and observed['characters'][-1] == {'offset': 133, 'textNodeIndex': 1, 'textNodeOffset': 131, 'character': 'f', 'witness': None}, label + '.tight-boundaries')
                        check(observed.get('plannedScrollPositions') == [0, 144, 288, 432, 570] and last['actualScrollLeft'] == 570 and last['scrollWidth'] == 858 and last['clientWidth'] == 288 and last['clip'] == {'left': 25, 'top': 25, 'right': 313, 'bottom': 45} and last['outsideClip'] == 1, label + '.tight-scroll')
                        check(all(s['paint']['issues'] == [] and all(p['supported'] is True for p in s['outsidePaint']) and s['possibleOccluders'] == [] and all(s[k] == 0 for k in ('hitTestRejected', 'overlapRejected', 'backgroundAreaRejected', 'noRangeRect')) for s in observed['steps']), label + '.tight-clean-paint')
                        check(terminal.get('text') == 'f' and terminal.get('globalOffset') == 133 and terminal.get('textNodeIndex') == 1 and terminal.get('textNodeOffset') == 131 and terminal.get('windowScroll') == last['windowScroll'] and terminal.get('viewport') == last['viewport'] and terminal.get('sampledClip') == last['clip'], label + '.terminal-range-identity')
                        rects = terminal.get('clientRects')
                        need(isinstance(rects, list) and bool(rects) and all(rectangle(r) and set(r) == {'left', 'right', 'top', 'bottom', 'width', 'height'} and finite(r['width']) and r['width'] > 0 and finite(r['height']) and r['height'] > 0 for r in rects) and rectangle(terminal.get('boundingRect')), label + '.terminal-range-rectangles')
                        clip = last['clip']
                        edges = [[edge for edge, outside in (('left', r['left'] < clip['left']), ('right', r['right'] > clip['right']), ('top', r['top'] < clip['top']), ('bottom', r['bottom'] > clip['bottom'])) if outside] for r in rects]
                        check(terminal.get('scroll', {}).get('left') == 570 and terminal.get('scroll', {}).get('scrollWidth') == 858 and terminal.get('scroll', {}).get('clientWidth') == 288 and terminal.get('outsideEdges') == edges and any(edges), label + '.terminal-range-outside')
        check(controls['selectionBrowserControls'] == semantic['selectionControls'], 'workload.controls.selection23')
        need(isinstance(summary['nodes'], list) and len(summary['nodes']) == count, 'workload.nodes.exact-assignment')
        counts = dict.fromkeys(STATUSES, 0)
        node_files = []
        for index, (compact, original, identity) in enumerate(zip(summary['nodes'], expected['selectedOriginalNodes'], semantic['nodeIdentities'])):
            label = 'workload.node:' + str(index)
            ref = compact['artifact']
            node_files.append(ref['file'])
            node = decode(reference(ref, f'node-{JOB}-{index:03d}.json'))
            envelope(node, 'p57-full-node-evidence', index)
            row = node['row']
            check(no_diagnostic_fields(node), label + '.no-nested-diagnostics')
            check(set(row) == set(semantic['rowKeys']) | ({'screenshot'} if original['sourceAuditNodeIndex']==0 or (original['field']=='duration' and original['sourceAuditNodeIndex']==6) else set()), label + '.full-original-row-shape')
            check(set(compact) == {'state', 'sourceAuditNodeIndex', 'status', 'productChecksCompleted', 'nodeDurationMs', 'measurementDurationMs', 'artifact'}, label + '.compact-shape')
            for key in ('state', 'sourceAuditNodeIndex', 'status', 'productChecksCompleted', 'nodeDurationMs', 'measurementDurationMs'):
                check(compact.get(key) == row.get(key), label + '.compact-full:' + key)
            check(ref.get('kind') == node['kind'] and ref.get('batchId') == JOB and ref.get('resultIndex') == index and ref.get('acceptance') == 'PROVISIONAL' and ref.get('acceptanceRequires') == semantic['acceptanceRequires'], label + '.reference-envelope')
            check(row['state'] == state_id and row['sourceAuditNodeIndex'] == original['sourceAuditNodeIndex'] and row['originalStatus'] == 'axe-incomplete' and row['productChecksCompleted'] is True, label + '.identity-status')
            check(row['target'] == original['target'] and row['originalHtml'] == original['originalHtml'] and row['identity'] == identity, label + '.exact-frozen-identity')
            check(row['afterOuterHtmlSha256'] == identity['outerHtmlSha256'] and row['afterTextSha256'] == original['expectedTextSha256'], label + '.after-identity')
            check(all(finite(row.get(k)) for k in ('nodeDurationMs', 'measurementDurationMs', 'sampleDurationMs')), label + '.timings')
            measurement(row, label, original['expectedText'], all_equivalence=original['sourceAuditNodeIndex']==0 or original['field']=='duration', expected_text_nodes=identity['observed']['textNodes'])
            if 'screenshot' in row:
                reference(row['screenshot'], f'{state_id}-node-{original["sourceAuditNodeIndex"]}.png')
            need(row['status'] in STATUSES, label + '.known-status')
            counts[row['status']] += 1
        check(len(set(node_files)) == count, 'workload.nodes.unique-artifacts')
        expected_counts = {**counts, 'started': count, 'completed': count, 'inProgress': 0, 'remaining': 0, 'unattempted': 0}
        check(summary['counts'] == expected_counts, 'workload.counts.derived')
        check(summary['checkpointCounts'] == {**expected_counts, 'batchId': JOB, 'expectedNodeCount': count, 'productChecksCompleted': count}, 'workload.checkpoint.complete')
        status = 'measured-failure' if counts['measured-fail'] else 'incomplete' if counts['unresolved'] else 'all-batch-requested-nodes-measured-pass'
        check(summary['status'] == status, 'workload.status.derived')
        outcome.update(expectedSourceExitCode=0 if status == 'all-batch-requested-nodes-measured-pass' else 1,
                       workloadStatus=summary['status'], workloadstatus=summary['status'], counts=expected_counts,
                       historicalOutcomeDeviation=None)
        outcome['sourceComplete'] = not issues
    except InvalidEvidence:
        pass
    except (OSError, ValueError, TypeError, KeyError, IndexError, AttributeError, RecursionError) as error:
        check(False, 'workload.malformed:' + type(error).__name__)
    return outcome
