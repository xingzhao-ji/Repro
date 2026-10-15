from pathlib import Path
import json,statistics,hashlib
base=Path(__file__).resolve().parent
receipts=json.loads((base/'command-receipts.json').read_text())
summary={'status':'OFFLINE_DESCRIPTIVE_COMPARISON','workers':len(receipts),'gateMiB':896,'gateChanged':False,'gateComplianceEstablished':False,'candidateInstalled':False,'browserStarted':False,'containerStarted':False,'allPassed':len(receipts)==12 and all(r['exitCode']==0 for r in receipts),'experiments':{}}
for experiment in ['end-to-end','receiver-only']:
 pairs=[]
 for trial in range(1,4):
  records=[r for r in receipts if r['experiment']==experiment and r['trial']==trial]
  if len(records)!=2 or any(r['exitCode']!=0 for r in records):continue
  by_mode={r['mode']:json.loads((base/r['stdout']).read_text()) for r in records}
  old,new=by_mode['prior'],by_mode['incremental']
  assert len(old['records'])==len(new['records'])==13
  assert [r['name'] for r in old['records']]==[r['name'] for r in new['records']]
  assert all(a['expected']==b['expected'] and a['equivalence']==b['equivalence']=='PASS' for a,b in zip(old['records'],new['records']))
  checkpoint_equal=all(a['checkpointCounts']==b['checkpointCounts'] for a,b in zip(old['records'],new['records']))
  def row_summary(data):
   return {'processMaxRSSKiB':data['maxRSSKiB'],'processMaxRSSMiB':data['maxRSSMiB'],'archivedRowsElapsedMs':sum(r['elapsedMs'] for r in data['records'] if not r['synthetic']),'allCasesElapsedMs':sum(r['elapsedMs'] for r in data['records']),'archivedObservedHeapDeltaMedianMiB':statistics.median(r['observedHeapDelta']/1048576 for r in data['records'] if not r['synthetic']),'checkpointTotals':[r['checkpointTotal'] for r in data['records']]}
  prior,incremental=row_summary(old),row_summary(new)
  pairs.append({'trial':trial,'order':records[0]['order'],'prior':prior,'incremental':incremental,'rssDifferenceKiBIncrementalMinusPrior':new['maxRSSKiB']-old['maxRSSKiB'],'rssDifferenceMiBIncrementalMinusPrior':new['maxRSSMiB']-old['maxRSSMiB'],'archivedElapsedDifferenceMsIncrementalMinusPrior':incremental['archivedRowsElapsedMs']-prior['archivedRowsElapsedMs'],'checkpointCountsEqual':checkpoint_equal,'allEquivalenceAssertionsPassed':True})
 diffs=[p['rssDifferenceMiBIncrementalMinusPrior'] for p in pairs]
 summary['experiments'][experiment]={'pairs':pairs,'lowerRSSPairs':sum(d<0 for d in diffs),'higherRSSPairs':sum(d>0 for d in diffs),'equalRSSPairs':sum(d==0 for d in diffs),'rssDifferenceMedianMiB':statistics.median(diffs) if diffs else None,'rssDifferenceRangeMiB':[min(diffs),max(diffs)] if diffs else None}
summary['limitations']=['Only three paired trials; no inferential or acceptance conclusion.','Fresh-process maxRSS includes fixture setup, explicit between-row GC and result assertions.','End-to-end uses one shared Node heap and equally retained source graph; final incremental output overlaps remote source while reading.','Receiver-only retains identical precomputed wire chunks in both modes and excludes live browser/transport.','Heap checkpoints are not an allocation profiler; internal peaks may be missed.','No browser process or cgroup measured; unchanged 896 MiB gate remains untested.','Three-pair order is alternated but cannot perfectly balance first positions.']
(base/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
