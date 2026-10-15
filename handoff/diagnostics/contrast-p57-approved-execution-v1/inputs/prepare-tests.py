from pathlib import Path
out=Path(__file__).resolve().parent;root=out.parents[3];prior=root/'.repro-runs/cloud-continuation/lifecycle-workload-diagnostic-v1/instrumentation'
s=(prior/'tests/workload-lifecycle-capture.test.mjs').read_text()
s=s.replace("'../contrast-p57-workload-lifecycle-probe.mjs'","'../verification-inputs/contrast-p57-approved-batch-probe.mjs'")
s=s.replace('/work/verification-inputs/contrast-p57-workload-lifecycle-probe.mjs','/work/verification-inputs/contrast-p57-approved-batch-probe.mjs')
s=s.replace('    callerSha256: options.callerSha256',"    batchId: Object.hasOwn(options,'batchId')?options.batchId:'p390-00-11',\n    callerSha256: options.callerSha256")
s+="""
for(const batchId of ['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32']) {
 test('exact assigned batch completes sidecar '+batchId,async()=>{
  const f=fixture({batchId}); f.capture.validate();
  assert.equal((await f.capture.finish({...completeSource,batchId})).complete,true);
  assert.equal(JSON.parse(f.writes[0]).source.batchId,batchId);
  assert.equal(JSON.parse(f.writes[0]).scope,'prospective-corrected-css-p57-batch');
 });
 test('other authorized ID cannot impersonate assigned batch '+batchId,async()=>{
  const f=fixture({batchId});f.capture.validate();
  const wrong=batchId==='p390-00-11'?'p320-00-10':'p390-00-11';
  assert.equal((await f.capture.finish({...completeSource,batchId:wrong})).complete,false);
 });
}
for(const batchId of [undefined,null,'p390-00-10','p320-33-43','../p390-00-11'])test('unknown batch rejected '+batchId,()=>{
 const f=fixture({batchId});assert.throws(()=>f.capture.validate(),{message:'LIFECYCLE_PRELOAD_INVALID'});
});
"""
(out/'tests/capture.test.mjs').write_text(s)
s=(root/'.repro-runs/cloud-continuation/contrast-p57-correction-preparation-v1/instrumentation/tests/caller-integration.test.mjs').read_text()
s=s[:s.index('const declarations=')]
s=s.replace("'../lifecycle-diagnostics.mjs'","'../verification-inputs/lifecycle-diagnostics.mjs'").replace("'../resource-probe.mjs'","'../verification-inputs/resource-probe.mjs'").replace("'../contrast-p57-instrumented-batch-probe.mjs'","'../verification-inputs/contrast-p57-approved-batch-probe.mjs'").replace('/work/verification-inputs/contrast-p57-instrumented-batch-probe.mjs','/work/verification-inputs/contrast-p57-approved-batch-probe.mjs')
s+="""
test('unchanged naturally scheduled closing lists are explicit and all read bounds survive compression',async()=>{
 const h=harness();h.sample();const before=h.records('lifecycle.ndjson').filter(r=>r.kind==='read-bounds');assert.equal(before.length,1);
 await h.lifecycle.observeClose('final.browser.close',async()=>{h.setList(base.slice(0,2));h.sample();h.sample();},()=>0);
 h.sample();h.sample();h.exit();
 const rows=h.records('samples.ndjson');assert.equal(rows.length,7);assert.equal(rows[1].processes,undefined);
 for(const r of rows.slice(2))assert.equal(r.processes.length,2);
 const metadata=h.records('lifecycle.ndjson');
 assert.deepEqual(metadata.filter(r=>r.kind==='read-bounds').map(r=>r.sample),[0,2,3,4,5,6]);
 const phases=metadata.filter(r=>r.kind==='phase'&&r.phase==='final.browser.close');
 assert.deepEqual(phases.map(r=>[r.event,r.nextSampleIndex]),[['start',2],['settled',4]]);
 assert.equal(rows[phases[1].nextSampleIndex].phase,'interval');assert.equal(rows.at(-1).phase,'exit');
 assert.equal(h.timers.length,1);assert.equal(h.timers[0].ms,100);assert.equal(h.process.exitCode,1);
});
test('post-close retention exhaustion remains fail closed at existing metadata cap',()=>{
 const h=harness();h.lifecycle.mark('final.browser.close','start',0);
 for(let i=0;i<1000;i++)h.sample();h.exit();
 const c=h.records('completion.json')[0];assert.equal(h.process.exitCode,86);
 assert.ok(h.lifecycle.summary().issues.length>0);assert.ok(c.lifecycle.metadataBytes<=114688);
 assert.ok([...h.files.values()].reduce((n,b)=>n+b.length,0)<=4177920);
});
"""
(out/'tests/sampler.test.mjs').write_text(s)
