"""Synthetic evidence only; all temporary files stay inside this review subtree."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

import workload_validator as validator

HERE = Path(__file__).resolve().parent
BASE_SEM = json.loads((HERE / 'prospective-expectations.json').read_text())
SEM = {**BASE_SEM, **BASE_SEM['jobs']['p390-00-11']}
EXPECTED = {**SEM, 'expectedControlCounts':BASE_SEM['expectedControlCounts']}


def sample(text='abc', status='unresolved', spec=None):
    spec = spec or {}
    reasons = [spec.get('reason', 'synthetic-unsupported')] if status == 'unresolved' else []
    clip = dict(left=25, top=25, right=313, bottom=45)
    paint = {'issues': [], 'ancestry': [{'tag': 'SPAN'}], 'layers': [{'area': clip.copy(), 'opaqueSurface': {'supported': True, 'scope': {'selectedSurface': True}}}], 'contrastRatio': 1 if status == 'measured-fail' else 21, 'requiredContrast': 4.5}
    steps = []
    positions = [0, 144, 288, 432, 570] if spec.get('tightEdge') else [0, 144]
    for i, pos in enumerate(positions):
        steps.append(dict(index=i, requestedScrollLeft=pos, actualScrollLeft=pos, scrollWidth=858, clientWidth=288,
                          viewport={'width': 390, 'height': 900}, windowScroll={'x': 0, 'y': 0}, clip=clip.copy(), paint=copy.deepcopy(paint),
                          timing=dict(paintDurationMs=1, optimizedScanDurationMs=1, coverageDurationMs=1, stepDurationMs=3),
                          occluderEquivalence=dict(checked=True, equal=True, legacyDurationMs=1, legacyCandidates=0, optimizedCandidates=0, legacyOccluders=[]),
                          scannedElements=1, rawCandidates=0, newCovered=0, outsideClip=0, hitTestRejected=0, overlapRejected=0, backgroundAreaRejected=int(bool(spec.get('unsafe'))), noRangeRect=0, possibleOccluders=[], outsidePaint=[]))
        if spec.get('extra') or spec.get('pseudo'):
            steps[-1]['outsidePaint'] = [dict(owner={'id': 'outside'}, effect={}, boxes=[], supported=status != 'unresolved', reasons=reasons)]
    chars = []
    for offset, ch in enumerate(text):
        if ch.isspace():
            continue
        covered = status != 'unresolved' or spec.get('tightEdge') and offset != 133
        step_index = 0 if not chars else 1
        witness = None
        if covered:
            rect = dict(left=26, right=30, top=28, bottom=42, width=4, height=14)
            witness = dict(stepIndex=step_index, actualScrollLeft=steps[step_index]['actualScrollLeft'], clip=clip.copy(),
                           ranges=[{'rect': rect, 'points': [dict(x=x, y=35, hit={'tag': 'SPAN'}, unobscured=True) for x in (26.4, 28, 29.6)]}],
                           contrastRatio=paint['contrastRatio'], requiredContrast=4.5)
            steps[step_index]['newCovered'] += 1
        node_index = int(bool(spec.get('adjacent')) and offset >= 2)
        chars.append(dict(offset=offset, textNodeIndex=node_index, textNodeOffset=offset - 2 if node_index else offset, character=ch, witness=witness))
    mapping = [{'nodeIndex': 0, 'start': 0, 'end': len(text), 'data': text}]
    if spec.get('adjacent'):
        mapping = [{'nodeIndex': 0, 'start': 0, 'end': 2, 'data': text[:2]}, {'nodeIndex': 1, 'start': 2, 'end': len(text), 'data': text[2:]}]
    result = dict(status=status, reasons=reasons, steps=steps, characters=chars, whitespaceOffsets=[i for i,c in enumerate(text) if c.isspace()], unsupportedOffsets=[], totalCharacters=len(chars), coveredCharacters=sum(c['witness'] is not None for c in chars), textNodeMapping=mapping, text=text, scrollContainer={}, initialScroll={}, plannedScrollPositions=positions, outsidePaintInventory={}, paint=paint, uncoveredOffsets=[c['offset'] for c in chars if c['witness'] is None], finalScroll={}, sampleDurationMs=2)
    if result['uncoveredOffsets'] and 'incomplete-character-coverage' not in reasons:
        reasons.append('incomplete-character-coverage')
    if spec.get('nested'):
        return dict(status='unresolved', reasons=['exact-single-text-node-required'], steps=[], characters=[], whitespaceOffsets=[], unsupportedOffsets=[], totalCharacters=0, coveredCharacters=0)
    if spec.get('id') == 'inadequate-scroll-budget':
        result['steps'] = []
        result['reasons'] = ['scroll-position-budget-exceeded']
        result.pop('uncoveredOffsets')
    if spec.get('tightEdge'):
        result['steps'][-1]['outsideClip'] = 1
    return result


class Fixture:
    def __init__(self, root, status='unresolved'):
        count=EXPECTED['batch']['expectedNodeCount'];state_id=EXPECTED['stateId']
        self.runtime = root / 'runtime'
        self.jobdir = self.runtime / 'jobs' / 'synthetic'
        self.artifacts = self.jobdir / 'artifacts' / validator.JOB
        self.artifacts.mkdir(parents=True)
        (self.runtime / 'input').mkdir()
        self.manifest = {'sourceFiles': [], 'probeSources': [], 'batchInputFiles': []}
        manifest_bytes = validator.packed(self.manifest)
        (self.runtime / 'input' / 'contrast-p57-approved-batch-inputs.json').write_bytes(manifest_bytes)
        s = {k: None for k in SEM['summaryKeys']}
        s.update(copy.deepcopy(SEM['summaryStable']))
        s.update(manifestSha256=validator.digest(manifest_bytes), verifiedInputs=[], sourceObservationComplete=True, unexpectedRequests=[], pageErrors=[], cleanupErrors=[], completedStateCount=1, browserControlsStatus='PASS', browserControlCounts=EXPECTED['expectedControlCounts'], nodes=[], startedAt='2026-10-15T00:00:00Z', finishedAt='2026-10-15T00:00:01Z', durationMs=1000, browserVersion='synthetic', memorySnapshots=[{'phase': 'synthetic', 'elapsedMs': 0, 'rss': 1, 'heapUsed': 1, 'heapTotal': 1, 'external': 0, 'arrayBuffers': 0}], phaseTimings={})
        s['batch'] = dict(id=validator.JOB, planSha256='0abcd3553b3875fca305670cf6ec4e3ec0ae3af15176013df40a26479422a0dd', assigned=EXPECTED['batch']['nodes'], expectedNodeCount=count, fullManifestCount=57, globalCompletionClaim=False, acceptance='PROVISIONAL', externalCleanup='PENDING_INDEPENDENT_REVIEW')
        state = dict(id=state_id, viewport=EXPECTED['viewport'], nodes=[dict(sourceAuditNodeIndex=n['sourceAuditNodeIndex'],resultIndex=i) for i,n in enumerate(EXPECTED['selectedOriginalNodes'])], status='exact-dom-preserved', selectionBefore=copy.deepcopy(SEM['selection']), selectionAfter=copy.deepcopy(SEM['selection']), productTotalMs=1)
        state['outsidePaintInventory'] = dict(schemaVersion=1,totalElements=1,checkedElements=1,candidates=[{'index':0,'owner':{},'captured':{}}],styles=SEM['styles'],externalStylesheets=0,inlineStyledElements=0,scope='synthetic fixture')
        body = b'<body><div id="root" data-condition="P">Synthetic fixture</div></body>'
        for suffix in ('Before', 'After'):
            state['body'+suffix+'Artifact'] = self.write(state_id+'-body-'+suffix.lower()+'.html', body)
        s['states'] = [state]
        c = self.envelope('p57-full-control-evidence')
        c.update(browserControlsStatus='PASS',browserControlCounts=EXPECTED['expectedControlCounts'],selectionBrowserControls=copy.deepcopy(SEM['selectionControls']))
        for field, specs in SEM['controlSpecs'].items():
            c[field] = []
            for spec in specs:
                entry = copy.deepcopy(spec)
                if field == 'screenshotControls':
                    before = '<body><input id="caret" value="probe"></body>'
                    initial = spec['id'] == 'screenshot-initial'
                    after = before if initial else '<body><input id="caret" value="probe" style=""></body>'
                    entry.update(before=before,after=after,beforeSha256=validator.digest(before.encode()),afterSha256=validator.digest(after.encode()),mutations=[] if initial else [{'id':'caret','attributeName':'style'}],durationMs=1,screenshot=self.write('screenshot-control-'+spec['id'].split('-')[-1]+'.png',b'synthetic screenshot'))
                else:
                    text = '12 ms ' + '0123456789abcdef'*8 if spec.get('tightEdge') else '12abc'
                    entry['observed'] = sample(text, spec['expected'], spec)
                    if spec.get('tightEdge'):
                        last = entry['observed']['steps'][-1]
                        rect=dict(left=310,right=314,top=28,bottom=42,width=4,height=14)
                        entry['rejectedTerminalRange'] = dict(text='f',textNodeIndex=1,textNodeOffset=131,globalOffset=133,clientRects=[rect],boundingRect=rect.copy(),scroll=dict(left=570,top=0,scrollWidth=858,clientWidth=288),windowScroll=last['windowScroll'],viewport=last['viewport'],sampledClip=last['clip'],outsideEdges=[['right']])
                c[field].append(entry)
        s['controlArtifact'] = self.write('controls-'+validator.JOB+'.json',c,kind=c['kind'])
        for i, (original, identity) in enumerate(zip(EXPECTED['selectedOriginalNodes'], SEM['nodeIdentities'])):
            row = sample(original['expectedText'],status)
            text_nodes=identity['observed']['textNodes'];offset=0;mapping=[]
            for ni,txt in enumerate(text_nodes):
                mapping.append(dict(nodeIndex=ni,start=offset,end=offset+len(txt),data=txt));offset+=len(txt)
            row['textNodeMapping']=mapping
            for char in row['characters']:
                m=next(m for m in mapping if m['start']<=char['offset']<m['end']);char['textNodeIndex']=m['nodeIndex'];char['textNodeOffset']=char['offset']-m['start']
            row.update(state=state_id,sourceAuditNodeIndex=original['sourceAuditNodeIndex'],target=original['target'],originalHtml=original['originalHtml'],originalStatus='axe-incomplete',identity=identity,measurementDurationMs=3,afterOuterHtmlSha256=identity['outerHtmlSha256'],afterTextSha256=original['expectedTextSha256'],productChecksCompleted=True,nodeDurationMs=4)
            if original['sourceAuditNodeIndex']==0 or (original['field']=='duration' and original['sourceAuditNodeIndex']==6):
                row['screenshot'] = self.write(state_id+'-node-'+str(original['sourceAuditNodeIndex'])+'.png',b'synthetic product screenshot')
            node = self.envelope('p57-full-node-evidence');node.update(resultIndex=i,row=row)
            ref = self.write(f'node-{validator.JOB}-{i:03d}.json',node,kind=node['kind'],resultIndex=i)
            compact = {k:row[k] for k in ('state','sourceAuditNodeIndex','status','productChecksCompleted','nodeDurationMs','measurementDurationMs')};compact['artifact']=ref;s['nodes'].append(compact)
        counts = {k:count if k==status else 0 for k in validator.STATUSES}
        s['counts'] = dict(**counts,started=count,completed=count,inProgress=0,remaining=0,unattempted=0)
        s['checkpointCounts'] = dict(**s['counts'],batchId=validator.JOB,expectedNodeCount=count,productChecksCompleted=count)
        s['status'] = 'incomplete' if status=='unresolved' else 'measured-failure' if status=='measured-fail' else 'all-batch-requested-nodes-measured-pass'
        self.summary = s
        self.save()

    def envelope(self, kind):
        return dict(schemaVersion=1,kind=kind,batchId=validator.JOB,acceptance='PROVISIONAL',acceptanceRequires=SEM['acceptanceRequires'])

    def write(self,name,value,**metadata):
        data = value if isinstance(value,bytes) else validator.packed(value)+b'\n'
        (self.artifacts/name).write_bytes(data)
        return dict(file=name,bytes=len(data),sha256=validator.digest(data),**metadata,**({'batchId':validator.JOB,'acceptance':'PROVISIONAL','acceptanceRequires':SEM['acceptanceRequires']} if metadata else {}))

    def save(self):
        (self.artifacts/'summary.json').write_text(json.dumps(self.summary,ensure_ascii=False,indent=2)+'\n')

    def mutate_node(self, change, index=0):
        ref=self.summary['nodes'][index]['artifact']; obj=json.loads((self.artifacts/ref['file']).read_text());change(obj['row']);ref.update(self.write(ref['file'],obj));self.save()

    def mutate_controls(self, change):
        ref=self.summary['controlArtifact'];obj=json.loads((self.artifacts/ref['file']).read_text());change(obj);ref.update(self.write(ref['file'],obj));self.save()


class Challenges(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='synthetic-',dir=HERE)
        self.root=Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def run_fixture(self,fixture):
        reported=[]
        result=validator.validate_workload(fixture.runtime,fixture.jobdir,lambda condition,code: reported.append(code) if not condition else None,validator.JOB)
        self.assertEqual(result['issues'],reported)
        return result

    def test_three_legitimate_product_outcomes(self):
        for status, exit_code in [('unresolved',1),('measured-fail',1),('measured-pass',0)]:
            with self.subTest(status=status):
                fixture=Fixture(self.root/status,status);result=self.run_fixture(fixture)
                self.assertTrue(result['sourceComplete'],result['issues']);self.assertEqual(result['expectedSourceExitCode'],exit_code)
                self.assertIsNone(result['historicalOutcomeDeviation']);self.assertEqual(result['acceptance'],'NOT_EVALUATED')

    def test_all_five_exact_assignments_and_duration_text_nodes(self):
        global SEM,EXPECTED
        original_job=validator.JOB;old_sem,old_expected=SEM,EXPECTED
        try:
            for job in BASE_SEM['executionOrder']:
                with self.subTest(job=job):
                    validator.JOB=job;SEM={**BASE_SEM,**BASE_SEM['jobs'][job]};EXPECTED={**SEM,'expectedControlCounts':BASE_SEM['expectedControlCounts']}
                    fixture=Fixture(self.root/job,'measured-pass');result=self.run_fixture(fixture)
                    self.assertTrue(result['sourceComplete'],result['issues']);self.assertEqual(result['counts']['completed'],EXPECTED['batch']['expectedNodeCount'])
                    fixture.summary['batch']['assigned']=list(reversed(fixture.summary['batch']['assigned']));fixture.save()
                    self.assertFalse(self.run_fixture(fixture)['sourceComplete'])
        finally:
            validator.JOB=original_job;SEM,EXPECTED=old_sem,old_expected

    def test_independent_negative_challenges(self):
        mutations = {
          'added-diagnostics':lambda f:f.summary.update(lifecycleDiagnostics={}),
          'claimed-count':lambda f:f.summary['counts'].update(unresolved=0),
          'partial':lambda f:f.summary['checkpointCounts'].update(completed=11),
          'node-error-null':lambda f:f.mutate_node(lambda r:r.update(error=None)),
          'global-error-empty':lambda f:f.summary.update(error=''),
          'selection':lambda f:f.summary['states'][0]['selectionAfter'].update(selectedTrial=2),
          'styles':lambda f:f.summary['states'][0]['outsidePaintInventory'].update(styles=['changed']),
          'missing-step-fields':lambda f:f.mutate_node(lambda r:r['steps'][0].pop('outsidePaint')),
          'wrong-node-identity':lambda f:f.mutate_node(lambda r:r.update(target=['#wrong'])),
          'wrong-full-status':lambda f:f.mutate_node(lambda r:r.update(status='measured-pass')),
          'wrong-control-status':lambda f:f.mutate_controls(lambda c:c['controls'][0]['observed'].update(status='unresolved')),
          'wrong-control-id':lambda f:f.mutate_controls(lambda c:c['controls'][0].update(id='replacement')),
          'missing-terminal-range':lambda f:f.mutate_controls(lambda c:c['surfaceControls'][-1].update(rejectedTerminalRange={})),
          'wrong-selection-control':lambda f:f.mutate_controls(lambda c:c['selectionBrowserControls']['controls'][1].update(status='matched')),
          'reference-hash':lambda f:f.summary['nodes'][0]['artifact'].update(sha256='0'*64),
          'missing-artifact':lambda f:(f.artifacts/f.summary['nodes'][0]['artifact']['file']).unlink(),
          'path-traversal':lambda f:f.summary['nodes'][0]['artifact'].update(file='../summary.json'),
          'wrong-final-status':lambda f:f.summary.update(status='all-batch-requested-nodes-measured-pass'),
          'cleanup-failure':lambda f:f.summary['cleanupErrors'].append('synthetic failure'),
          'body-changed':lambda f:f.summary['states'][0].update(bodyAfterArtifact=f.write('P-reflow-390-body-after.html',b'<body data-condition="P">changed</body>')),
          'control-reference-promotion':lambda f:f.summary['controlArtifact'].update(acceptance='PASS'),
          'missing-planned-step':lambda f:f.mutate_node(lambda r:r['steps'].pop()),
          'nested-diagnostics':lambda f:f.mutate_node(lambda r:r['steps'][0]['paint'].update(lifecycleDiagnostics={})),
          'malformed-character':lambda f:f.mutate_node(lambda r:r['characters'].__setitem__(0,None)),
          'terminal-malformed-rectangle':lambda f:f.mutate_controls(lambda c:c['surfaceControls'][-1]['rejectedTerminalRange'].update(clientRects=[{}])),
          'terminal-wrong-edge':lambda f:f.mutate_controls(lambda c:c['surfaceControls'][-1]['rejectedTerminalRange'].update(outsideEdges=[['left']])),
          'tight-paint-dirty':lambda f:f.mutate_controls(lambda c:c['surfaceControls'][-1]['observed']['steps'][-1]['paint']['issues'].append('shadow-paint')),
        }
        for name,change in mutations.items():
            with self.subTest(name=name):
                fixture=Fixture(self.root/name);change(fixture);fixture.save();result=self.run_fixture(fixture)
                self.assertFalse(result['sourceComplete'],name);self.assertTrue(result['issues'],name)

    def test_witness_internal_consistency(self):
        mutations={
          'ratio':lambda r:r['steps'][0]['paint'].update(contrastRatio=1),
          'paint-issue':lambda r:r['steps'][0]['paint']['issues'].append('shadow-paint'),
          'unbounded-outside':lambda r:r['steps'][0]['outsidePaint'].append(dict(owner={},effect={},boxes=[],supported=False,reasons=['unknown'])),
          'range-outside':lambda r:r['characters'][0]['witness']['ranges'][0]['rect'].update(left=-1),
          'nonfinite':lambda r:r.update(sampleDurationMs=float('nan')),
        }
        for name,change in mutations.items():
            with self.subTest(name=name):
                fixture=Fixture(self.root/name,'measured-pass')
                if name=='nonfinite':
                    ref=fixture.summary['nodes'][0]['artifact'];data=(fixture.artifacts/ref['file']).read_text().replace('"sampleDurationMs":2','"sampleDurationMs":NaN');(fixture.artifacts/ref['file']).write_text(data);ref.update(bytes=len(data.encode()),sha256=validator.digest(data.encode()))
                else: fixture.mutate_node(change)
                fixture.save();result=self.run_fixture(fixture);self.assertFalse(result['sourceComplete'],name)


if __name__ == '__main__':
    unittest.main(verbosity=2)
