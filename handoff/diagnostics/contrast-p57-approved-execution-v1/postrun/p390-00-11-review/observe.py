"""Read-only independent primary pilot observation review; no runtime operations."""
from pathlib import Path
import hashlib,json,re
HERE=Path(__file__).resolve().parent;T=HERE.parents[1];R=T/'runtime/p390-00-11';J=R/'jobs/p390-00-11';A=J/'artifacts';JOB='p390-00-11'
refs=[]
def read(p):
 b=p.read_bytes();refs.append({'path':str(p.relative_to(T)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()});return b
def load(p):return json.loads(read(p))
def sha(b):return hashlib.sha256(b).hexdigest()
def packed(v):return json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
plan=load(R/'plan.json');receipt=load(J/'test-receipt.json');cleanup=load(R/'cleanup-receipt.json');manifest=load(J/'artifact-manifest.json')
for x in manifest['entries']:
 b=read(A/x['path']);assert len(b)==x['bytes'] and sha(b)==x['sha256']
summary=load(A/JOB/'summary.json');sidecar=load(A/JOB/'lifecycle-source.json');sem=load(T/'validator/workload-evidence/prospective-expectations.json');expected=load(T/'inputs/expected-bindings.json')['jobs'][JOB]
assert summary['sourceObservationComplete'] is True and summary['status']=='all-batch-requested-nodes-measured-pass'
assert summary['browserControlCounts']==sem['expectedControlCounts'] and summary['browserControlCounts']['total']==50
assert sidecar['executedCaller']=={'file':'verification-inputs/contrast-p57-approved-batch-probe.mjs','sha256':'ba670e41acca925ba9c6b27c3b36f6a7d34ed5a2d4f5a8af422b8d382f996b54'}
controls=load(A/JOB/summary['controlArtifact']['file']);controlfacts=[]
for field,specs in sem['controlSpecs'].items():
 rows=controls[field];assert len(rows)==len(specs)
 for row,spec in zip(rows,specs):
  assert all(row[k]==v for k,v in spec.items())
  if field!='screenshotControls':assert row['observed']['status']==spec['expected']
  controlfacts.append({'field':field,'id':spec['id'],'expected':spec.get('expected'),'observed':row.get('observed',{}).get('status')})
assert controls['selectionBrowserControls']==sem['selectionControls']
nodefacts=[]
for i,(compact,node) in enumerate(zip(summary['nodes'],expected['selectedOriginalNodes'])):
 data=read(A/JOB/compact['artifact']['file']);assert sha(data)==compact['artifact']['sha256'] and len(data)==compact['artifact']['bytes'];row=json.loads(data)['row']
 assert row['sourceAuditNodeIndex']==node['sourceAuditNodeIndex'] and row['target']==node['target'] and row['originalHtml']==node['originalHtml'] and row['identity']['text']==node['expectedText']
 assert row['status']=='measured-pass' and row['reasons']==[] and row['productChecksCompleted'] is True
 assert row['totalCharacters']==row['coveredCharacters']==len(row['characters']) and not row['uncoveredOffsets'] and not row['unsupportedOffsets']
 assert len(row['steps'])==2 and all(s['paint']['issues']==[] and all(p['supported'] is True for p in s['outsidePaint']) for s in row['steps'])
 for char in row['characters']:
  w=char['witness'];assert w and w['contrastRatio']>=w['requiredContrast']==4.5 and w['ranges']
  s=row['steps'][w['stepIndex']];assert w['actualScrollLeft']==s['actualScrollLeft'] and w['clip']==s['clip'] and w['contrastRatio']==s['paint']['contrastRatio']
  for r in w['ranges']:assert r['points'] and all(p['unobscured'] is True for p in r['points'])
 nodefacts.append({'sourceAuditNodeIndex':row['sourceAuditNodeIndex'],'status':row['status'],'characters':len(row['characters']),'steps':len(row['steps']),'minimumContrast':min(c['witness']['contrastRatio'] for c in row['characters']),'requiredContrast':4.5,'measurementDurationMs':row['measurementDurationMs']})
assert len(nodefacts)==12
state=summary['states'][0];before=read(A/JOB/state['bodyBeforeArtifact']['file']);after=read(A/JOB/state['bodyAfterArtifact']['file']);assert before==after
assert state['selectionBefore']==state['selectionAfter']==sem['jobs'][JOB]['selection']
assert sha(packed(state['outsidePaintInventory']['styles']))=='06504d654ace79a91d63504e9ab7e5657ebb96a3ffef3f95adbf54d990f521a8'
samples=[json.loads(l) for l in read(A/'resource-diagnostics/samples.ndjson').splitlines()];events=[json.loads(l) for l in read(A/'resource-diagnostics/lifecycle.ndjson').splitlines()];completion=load(A/'resource-diagnostics/completion.json')
phase=next(e for e in events if e.get('phase')=='final.browser.close' and e['event']=='settled');settled=int(phase['monoNs']);bounds={e['sample']:e for e in events if e['kind']=='read-bounds'}
qualified=[s['sample'] for s in samples if s['phase']=='interval' and s['sample'] in bounds and int(bounds[s['sample']]['before']['monoNs'])>settled]
terminal=samples[-1];tb=bounds[terminal['sample']];initial={p['pid']:p for p in samples[0]['processes']};node=samples[0]['sampler']['pid'];assert {p['pid'] for p in terminal['processes']}=={1,node}
for p in terminal['processes']:assert p['start_ticks']==initial[p['pid']]['start_ticks'] and p['state']!='Z'
assert int(tb['before']['monoNs'])>settled
z=[];current=[]
for s in samples:
 current=s.get('processes',current)
 if s['zombie_count']:z.append({'sample':s['sample'],'utc':s['utc'],'processes':[p for p in current if p['state']=='Z']})
resourceevents=[]
for s in samples:
 for key in ['pids.events','pids.events.local','memory.events','memory.events.local']:
  for line in s['counters'][key].splitlines():
   if int(line.split()[1]):resourceevents.append([s['sample'],key,line])
peak=max(int(s['counters']['memory.peak']) for s in samples);over=[s['sample'] for s in samples if int(s['counters']['memory.peak'])>939524096]
log=read(J/'test.log').decode();launch=re.findall(r'pw:browser <launched> pid=(\d+)',log);assert launch==['13'];assert len(re.findall(r'\[pid=13\] <process did exit: exitCode=0, signal=null>',log))==1
assert not any(token in log for token in ['<forcefully close>','<kill>','<will force kill>'])
assert cleanup['result']=='PASS' and cleanup['remaining_owned_containers']==cleanup['remaining_owned_volumes']==[] and cleanup['transfer_never_started'] is True
result={'status':'STOP_CONTINUATION_INDEPENDENT_PRIMARY_OBSERVATIONS','job':JOB,'nonce':plan['nonce'],'sourceComplete':True,'observations':{'measuredPass':12,'measuredFail':0,'unresolved':0,'acceptedAfterAllGates':0,'remaining57Unattempted':45,'browserControls':50,'nodeFacts':nodefacts,'controls':controlfacts,'bodyBytesBeforeAfter':len(before),'fullSelectionAndCandidateStylesUnchanged':True},'driverSeconds':receipt['elapsed_seconds'],'sourceDurationMs':summary['durationMs'],'sourceExit':receipt['final_state']['ExitCode'],'normalBrowserExit':{'pid':13,'startTicks':'5101686','exitCode':0,'signal':None},'resources':{'memoryPeakBytes':peak,'memoryPeakMiB':peak/1048576,'memoryGateBytes':939524096,'overGateBytes':peak-939524096,'samplesOverGate':over,'taskPeak':max(int(s['counters']['pids.peak']) for s in samples),'nonzeroResourceEvents':resourceevents},'cleanupCensuses':{'status':'NOT_ESTABLISHED','reason':'No distinct naturally scheduled nonterminal census begins after final browser-close settlement; next sample is terminal.','settledMonoNs':str(settled),'settledNextSampleIndex':phase['nextSampleIndex'],'qualifyingNonterminalSampleIds':qualified,'terminalSample':terminal['sample'],'terminalSweep':tb,'terminalProcesses':terminal['processes'],'terminalSweepBeginsAfterSettlementMs':(int(tb['before']['monoNs'])-settled)/1000000},'retainedZObservations':z,'sampleCount':len(samples),'ownedCleanup':cleanup,'limitations':['No later job is authorized to continue because the preceding gate did not pass.','These12 measured-pass observations remain provisional under failed continuation gates; no aggregate contrast PASS.','Clean terminal alone does not satisfy the approved two-census contract.','Historical failures remain unchanged; no runtime retry or source mutation performed by reviewer.'],'bindings':refs}
print(json.dumps(result,indent=2))
