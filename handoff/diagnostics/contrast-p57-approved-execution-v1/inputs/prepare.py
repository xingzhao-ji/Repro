from pathlib import Path
import json,hashlib,re,difflib,base64
out=Path(__file__).resolve().parent;root=out.parents[3]
prior=root/'.repro-runs/cloud-continuation/lifecycle-workload-diagnostic-v1/instrumentation'
base=root/'.repro-runs/cloud-continuation/contrast-p57-memory-execution-v1/runtime/p390-00-11/input'
candidate=root/'.repro-runs/hci-comparator/p57-inspector-shadow-none-20261015T031400Z-b7541c83/P.html'
sha=lambda b:hashlib.sha256(b).hexdigest()
def replace(s,a,b):
 assert s.count(a)==1,(a[:100],s.count(a));return s.replace(a,b)
oldhtml=(base/'actual/study/P.html').read_text();newhtml=candidate.read_text()
assert sha(newhtml.encode())=='a7c31a08d5a0cb23a40dbee32ccc1b928c78c80a1fd665ba5247cd15837d245f'
oldstyles=re.findall(r'<style>(.*?)</style>',oldhtml,re.S);newstyles=re.findall(r'<style>(.*?)</style>',newhtml,re.S)
assert len(oldstyles)==len(newstyles)==1
rule='.reduction-workspace>.panel.trial-inspector{box-shadow:none}'
assert newstyles[0].count(rule)==1 and newstyles[0].replace(rule,'')==oldstyles[0]
assert newhtml.replace(newstyles[0],oldstyles[0]).replace(base64.b64encode(hashlib.sha256(newstyles[0].encode()).digest()).decode(),base64.b64encode(hashlib.sha256(oldstyles[0].encode()).digest()).decode())==oldhtml
styleshash=sha(json.dumps(newstyles,separators=(',',':'),ensure_ascii=False).encode())
old=(base/'contrast-p57-memory-batch-inputs.json').read_bytes();manifest=json.loads(old);frozen=json.loads((base/'frozen-v3-inputs.json').read_bytes())
assert sha(old)=='1d3102b0d55538f50522b0e82291556ebc4098cf03b4616e31bcc6801887b08c'
oldentry=manifest['sourceFiles'][0];assert oldentry['path']=='actual/study/P.html'
newentry={**oldentry,'source':str(candidate),'bytes':len(newhtml.encode()),'sha256':sha(newhtml.encode())}
newpaint={**manifest['paintScope'],'stylesSha256':styleshash,'scope':'Exact approved corrected-CSS P HTML and unchanged completed selected job/trial state. Only inspector shadow:none and required CSP/style identity differ. State-wide inventory scans all elements/pseudos before rectangle prefilter; per-step recomputation of all effect/focus/hover candidates. No generic blurred shadow extent accepted.'}
manifest['sourceFiles'][0]=newentry;manifest['paintScope']=newpaint
module="""import assert from 'node:assert/strict';
// The frozen original remains immutable. Only these exact approved candidate fields differ.
export function verifyCandidateManifest(manifest,frozenManifest) {
  const originalEntry=ORIGINAL_ENTRY;
  const candidateEntry=CANDIDATE_ENTRY;
  const candidatePaint=CANDIDATE_PAINT;
  assert.deepEqual(frozenManifest.sourceFiles[0],originalEntry,'Exact sealed original HTML provenance');
  for(const [key,value] of Object.entries(frozenManifest)) {
    if(['revision','probeSources'].includes(key))continue;
    const expected=key==='sourceFiles'?[candidateEntry,...value.slice(1)]:key==='paintScope'?candidatePaint:value;
    assert.deepEqual(manifest[key],expected,'Exact approved full57 manifest field '+key);
  }
  assert.equal(manifest.stopAfterElapsedMs,90000,'Unchanged internal budget');
  return true;
}
""".replace('ORIGINAL_ENTRY',json.dumps(oldentry,separators=(',',':'))).replace('CANDIDATE_ENTRY',json.dumps(newentry,separators=(',',':'))).replace('CANDIDATE_PAINT',json.dumps(newpaint,separators=(',',':')))
v=out/'verification-inputs';(v/'candidate-binding.mjs').write_text(module)
caller=(prior/'contrast-p57-workload-lifecycle-probe.mjs').read_text();originalcaller=caller
assert sha(caller.encode())=='25df13d9c37a0f9e9189556a01e593d7542662241179805244c25e548b6dafe0'
caller=caller.replace('contrast-p57-workload-lifecycle-probe.mjs','contrast-p57-approved-batch-probe.mjs')
caller=replace(caller,"import assert from 'node:assert/strict';","import assert from 'node:assert/strict';\nimport { verifyCandidateManifest } from './candidate-binding.mjs';\nconst approvedBatchIds=Object.freeze(['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32']);")
caller=replace(caller,'runtimeVersions = {} }) {','runtimeVersions = {}, batchId }) {')
caller=replace(caller,"if(resourceProbe?.selected!==true","if(!approvedBatchIds.includes(batchId)||resourceProbe?.selected!==true")
caller=replace(caller,"source.batchId!=='p390-00-11'","source.batchId!==batchId")
caller=replace(caller,"source?.batchId==='p390-00-11'?'p390-00-11':null","source?.batchId===batchId?batchId:null")
caller=replace(caller,"scope:'original-p390-00-11-lifecycle-diagnostic-only'","scope:'prospective-corrected-css-p57-batch'")
caller=replace(caller,"historicalVerifiedInputsMeaning:'ORIGINAL_WORKLOAD_PROVENANCE_NOT_EXECUTED_CALLER_IDENTITY'","historicalVerifiedInputsMeaning:'CANDIDATE_AND_EXECUTED_CALLER_WITH_IMMUTABLE_BASELINE_REFERENCES'")
caller=replace(caller,"  assert.equal(batchId,'p390-00-11','One authorized original workload capture');","  assert.ok(approvedBatchIds.includes(batchId),'One of five exact approved unique batch IDs');")
caller=replace(caller,'lifecycleCapture=createWorkloadLifecycleCapture({lifecycle:','lifecycleCapture=createWorkloadLifecycleCapture({batchId,lifecycle:')
line="    for(const [key,value] of Object.entries(frozenManifest))if(!['revision','probeSources'].includes(key))assert.deepEqual(manifest[key],value,'Original full57 manifest field '+key);"
caller=replace(caller,line,'    verifyCandidateManifest(manifest,frozenManifest);')
caller=replace(caller,'// P57 memory batch proposal: lossless complete-observation artifacts and exact subsets; frozen v3 sampler and all 50 browser control bodies unchanged. PREPARED_NOT_EXECUTED.','// Approved prospective P57 corrected-CSS batch: exact frozen partition and all 50 control bodies retained. External continuation review required.')
(v/'contrast-p57-approved-batch-probe.mjs').write_text(caller)
preload=(prior/'resource-probe.mjs').read_text();originalpreload=preload
preload=preload.replace('contrast-p57-workload-lifecycle-probe.mjs','contrast-p57-approved-batch-probe.mjs')
# Retain existing read outputs after final-close start; no read, timer, sample or wait is added.
preload=replace(preload,'    clock: () => ({ utc: new Date().toISOString(), monoNs: process.hrtime.bigint() }),','    clock: () => ({ utc: new Date().toISOString(), monoNs: process.hrtime.bigint() }),\n    nextSampleIndex: () => samples,')
preload=replace(preload,"if (fingerprint !== lastProcesses || phase !== 'interval') {","if (diagnostics.retainClosingSamples() || fingerprint !== lastProcesses || phase !== 'interval') {")
(v/'resource-probe.mjs').write_text(preload)
helper=(prior/'lifecycle-diagnostics.mjs').read_text();originalhelper=helper
helper=replace(helper,'let sweepStart, reads = [], lastFingerprint = "";','let sweepStart, reads = [], lastFingerprint = "";\n  let closingSamples = false;')
helper=replace(helper,'    const phase = boundedLabel(label);','    const phase = boundedLabel(label);\n    if (phase === "final.browser.close" && event === "start") closingSamples = true;')
helper=replace(helper,'    emit({ kind: "phase", phase, event, ...now(), ...contextCount === void 0 ? {} : { contextCount } }, true);','''    let nextSampleIndex;
    if (phase === "final.browser.close") {
      try { nextSampleIndex = options.nextSampleIndex(); } catch { fail("SAMPLE_INDEX_UNAVAILABLE"); }
      if (!Number.isSafeInteger(nextSampleIndex) || nextSampleIndex < 0) { fail("SAMPLE_INDEX_INVALID"); nextSampleIndex = null; }
    }
    emit({ kind: "phase", phase, event, ...now(), ...contextCount === void 0 ? {} : { contextCount }, ...phase === "final.browser.close" ? { nextSampleIndex } : {} }, true);''')
helper=replace(helper,'if (phase !== "interval" || fingerprint !== lastFingerprint || zombies.length) {','if (closingSamples || phase !== "interval" || fingerprint !== lastFingerprint || zombies.length) {')
helper=replace(helper,'return { mark, observeClose, beginSweep, timedRead, observeSample, writeRaw, summary, finish };','return { mark, observeClose, beginSweep, timedRead, observeSample, writeRaw, summary, finish, retainClosingSamples: () => closingSamples };')
(v/'lifecycle-diagnostics.mjs').write_text(helper)
for name in ['batch-partition.mjs','evidence-store.mjs','selection-state.mjs']:(v/name).write_bytes((prior/name).read_bytes())
(out/'actual/study').mkdir(parents=True,exist_ok=True);(out/'actual/study/P.html').write_bytes(candidate.read_bytes())
for name in ['contrast-p57-approved-batch-probe.mjs','resource-probe.mjs','lifecycle-diagnostics.mjs','candidate-binding.mjs']:
 b=(v/name).read_bytes();manifest['probeSources'].append({'path':'verification-inputs/'+name,'sha256':sha(b),'bytes':len(b)})
(out/'contrast-p57-approved-batch-inputs.json').write_text(json.dumps(manifest,indent=2)+'\n')
for name,a,b in [('caller',originalcaller,caller),('resource-probe',originalpreload,preload),('lifecycle-diagnostics',originalhelper,helper)]:
 (out/(name+'.diff')).write_text(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='sealed-workload/'+name,tofile='approved-inputs/'+name)))
oldassert=[x for x in originalcaller.splitlines() if 'assert.' in x];missing=[x for x in oldassert if x not in caller.splitlines()]
assert missing==["  assert.equal(batchId,'p390-00-11','One authorized original workload capture');",line],missing
(out/'source-preservation.json').write_text(json.dumps({'originalAssertionLines':len(oldassert),'retainedUnchanged':len(oldassert)-len(missing),'replacedOnly':missing,'replacementReasons':['Exact five authorized batch IDs replace one original diagnostic ID.','Exact candidate sourceFiles and paintScope replace original identities; every other original field is deep-equal.'],'originalControlBodyUnchanged':originalcaller[originalcaller.index('    const controls = ['):originalcaller.index('    const productStarted =') if '    const productStarted =' in originalcaller else originalcaller.index('    result.browserControlCounts=')]==caller[caller.index('    const controls = ['):caller.index('    const productStarted =') if '    const productStarted =' in caller else caller.index('    result.browserControlCounts=')],'sampler100msUnchanged':"setInterval(() => sample('interval'), 100)" in preload,'rawStatParserUnchanged':originalpreload[originalpreload.index('  function processes()'):originalpreload.index('  function sample(')]==preload[preload.index('  function processes()'):preload.index('  function sample(')]},indent=2)+'\n')
files=[]
for path in sorted([out/'actual/study/P.html',out/'contrast-p57-approved-batch-inputs.json',*v.glob('*.mjs')]):
 b=path.read_bytes();relative=str(path.relative_to(out));files.append({'path':relative,'source':str(path),'bytes':len(b),'sha256':sha(b),'action':'replace' if (base/relative).exists() else 'add'})
order=['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32']
report={'schemaVersion':1,'status':'PREPARED_PENDING_INDEPENDENT_REVIEW_NO_RUNTIME','baseInput':str(base),'files':files,'commands':{id:['node','--v8-pool-size=1','--import','/work/verification-inputs/resource-probe.mjs','/work/verification-inputs/contrast-p57-approved-batch-probe.mjs','/work/contrast-p57-approved-batch-inputs.json','/work/.repro-runs/'+id,id] for id in order},'executionOrder':order,'candidateHtmlSha256':sha(newhtml.encode()),'candidateStylesSha256':styleshash,'candidateStyleTextSha256':sha(newstyles[0].encode()),'originalManifestSha256':sha(old),'consumedManifestSha256':sha((out/'contrast-p57-approved-batch-inputs.json').read_bytes()),'packetSha256':'2931a3b104efb5410461669cc6115b457831c8ec0a20b55d8509fddd80740c42','frozenManifestSha256':sha((base/'frozen-v3-inputs.json').read_bytes()),'batchPlanSha256':sha((base/'batch-plan.json').read_bytes()),'sourceScope':'prospective-corrected-css-p57-batch','callerPath':'verification-inputs/contrast-p57-approved-batch-probe.mjs','callerSha256':sha(caller.encode()),'sidecar':'<batchId>/lifecycle-source.json','limits':{'internalMs':90000,'outerSeconds':120,'driverSeconds':90,'newMetadataBytes':131072,'allDiagnosticBytes':4194304,'sourceSidecarBytes':16384},'baselinePreserved':'All files not listed here remain exact. Historical input JSON and historical caller remain original, unexecuted references.'}
(out/'overlay-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'overlay':str(out/'overlay-manifest.json'),'callerSha256':sha(caller.encode()),'stylesSha256':styleshash,'files':len(files),'assertions':len(oldassert),'replaced':len(missing)}))
