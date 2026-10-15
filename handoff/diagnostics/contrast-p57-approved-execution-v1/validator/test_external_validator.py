"""Synthetic telemetry counterexamples only; no browser/Docker/proc/network or file writes."""
import importlib.util,json,copy,hashlib,pathlib
p=pathlib.Path(__file__).with_name('validate-approved-job.py');spec=importlib.util.spec_from_file_location('workload_job',p);v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
def encode(x):return (json.dumps(x,separators=(',',':'))+'\n').encode()
def fixture(zombie=False,padding=0):
    proc=[{'pid':1,'name':'docker-init','state':'S','ppid':0,'threads':1,'start_ticks':'10'},{'pid':6,'name':'MainThread','state':'R','ppid':1,'threads':1,'start_ticks':'11'}]
    counters={'pids.current':'4','pids.max':'128','pids.peak':'4','pids.events':'max 0','pids.events.local':'max 0','memory.current':'1024','memory.peak':'2048','memory.events':'oom 0\noom_kill 0','memory.events.local':'oom 0\noom_kill 0'}
    rows=[]
    for i,phase in enumerate(['start','exit']):
        ps=copy.deepcopy(proc)
        if zombie and not i:ps.append({'pid':22,'name':'chrome-headless','state':'Z','ppid':6,'threads':2,'start_ticks':'13'})
        rows.append({'sample':i,'phase':phase,'processes':ps,'process_count':len(ps),'zombie_count':int(zombie and not i),'visible_threads':sum(x['threads'] for x in ps),'counters':counters})
    rows[0].update(sampler={'pid':6,'ppid':1,'selected':True,'intendedTest':True,'entrypoint':'/work/verification-inputs/contrast-p57-approved-batch-probe.mjs','nodePools':{'v8':1,'libuv':1}},runtime_init={'pid':1,'name':'docker-init'},interval_ms=100,byte_limit=4194304)
    labels=[('workload.capture','start'),('controls.context.close','start'),('controls.context.close','settled'),('product.context.close','start'),('product.context.close','settled'),('final.browser.close','start'),('browser.disconnected','event'),('final.browser.close','settled'),('workload.capture','settled')]
    meta=[]
    for i,(label,event) in enumerate(labels,2):
        e={'kind':'phase','phase':label,'event':event,'monoNs':str(i)}
        if label in ('controls.context.close','product.context.close','final.browser.close'):e['contextCount']=int(label!='final.browser.close' and event=='start')
        meta.append(e)
    for i,origin in [(0,0),(1,15)]:
        e={'kind':'read-bounds','sample':i,'before':{'monoNs':str(origin)},'after':{'monoNs':str(origin+1)},'processReadEncoding':'[pid,beforeOffsetNs,afterOffsetNs] from before.monoNs','atomicSnapshot':False,'processReads':[[q['pid'],'0','1'] for q in rows[i]['processes']]}
        if not i and padding:e['syntheticPadding']='x'*padding
        meta.append(e)
    if zombie:
        target=rows[0]['processes'][-1]
        meta.append({'kind':'first-zombie','identity':{'pid':22,'start_ticks':'13'},'identityStable':True,'status':'complete-observation','listingStatus':'read','listedCount':1,'truncated':False,'taskStatReads':1,'before':{'status':'read','process':target},'after':{'status':'read','process':target},'tasks':[{'tid':22,'status':'read','process':target}]})
    return rows,meta

def package(rows,events):
    raw=b''.join(encode(x) for x in rows);meta=b''.join(encode(x) for x in events);z=any(x['zombie_count'] for x in rows)
    lc={'status':'provisional-external-io-verification-required','observedStatusBeforeCompletionWrite':'complete','completionWritten':False,'sourceExitCode':1,'closeFailed':False,'issues':[],'issueOverflow':False,'bytesUncertain':False,'rawBytes':len(raw),'metadataBytes':0,'combinedBytes':0,'phaseEvents':sum(x['kind']=='phase' for x in events),'phaseBytes':sum(len(encode(x)) for x in events if x['kind']=='phase'),'firstZombie':'complete' if z else 'not-observed','taskStatReads':int(z),'limits':v.LIMITS}
    c={'samples':len(rows),'bytes':len(raw),'interval_ms':100,'byte_limit':4194304,'failure':None,'lifecycle':lc}
    for _ in range(8):
        size=len(encode(c));lc['metadataBytes']=len(meta)+size;lc['combinedBytes']=len(raw)+len(meta)+size
    return raw,meta,encode(c)
checks=[]
def check(name,fn):fn();checks.append({'name':name,'status':'PASS'})
def run(rows=None,events=None,external=1,summary=256):
    if rows is None:rows,events=fixture()
    v.issues.clear();v.known_z_sample_ids.clear();out=v.telemetry(*package(rows,events),external,summary,1);return out,list(v.issues)
def normal():
    out,errors=run();assert not errors,errors;assert out['zeroObservedZ'] and out['closeReadCoverage']['final.browser.close']['noRetainedReadOverlap']
check('honest workload exit1 can pass complete diagnostic telemetry while recording no close-time read coverage',normal)
def zfail():
    out,errors=run(*fixture(True));assert not errors,errors;assert not out['zeroObservedZ'] and out['zSampleIds']==[0]
check('valid source/diagnostics with a literal Z still retains literal Z observations',zfail)
def io():
    _,errors=run(external=86);assert 'EXTERNAL_EXIT_NOT_EXPECTED_SOURCE' in errors
check('complete-looking files cannot override external final I/O failure86',io)
def bytes_wrong():
    r,m,c=package(*fixture());d=json.loads(c);d['lifecycle']['metadataBytes']+=1;v.issues.clear();v.telemetry(r,m,encode(d),1,256,1);assert 'ACTUAL_UTF8_BYTE_TOTALS' in v.issues
check('false completion byte accounting is rejected',bytes_wrong)
def aggregate():
    _,errors=run(*fixture(padding=125000),summary=16384);assert 'AGGREGATE_BYTES_INCLUDING_SOURCE_SUMMARY' in errors and 'PRE_RESERVED_SUMMARY_ALLOWANCE' in errors
check('separately capped summary cannot evade aggregate metadata cap',aggregate)
def unavail():
    rows,events=fixture();rows[0]['processes'][0]['unavailable']='EIO';_,errors=run(rows,events);assert 'PROCESS_READ_UNAVAILABLE' in errors
check('unavailable process read cannot establish no-Z completeness',unavail)
def identity():
    rows,events=fixture(True);events[-1]['identityStable']=False;_,errors=run(rows,events);assert 'FIRST_Z_IDENTITY_OR_READ_FAILURE' in errors
check('first-Z target identity loss remains incomplete attribution',identity)
def phase():
    rows,events=fixture();next(x for x in events if x.get('phase')=='controls.context.close' and x['event']=='settled')['contextCount']=1;_,errors=run(rows,events);assert 'CONTEXT_COUNTS_controls.context.close' in errors
check('retained context after close cannot masquerade as complete close',phase)
def terminal():
    rows,events=fixture();rows[-1]['phase']='interval';_,errors=run(rows,events);assert 'START_INTERVAL_TERMINAL_SEQUENCE' in errors
check('missing terminal sample is rejected',terminal)
def incomplete_no_z():
    _,errors=run(external=86);assert errors
check('no counted Z with incomplete observation cannot establish complete telemetry',incomplete_no_z)
def late_error():
    raw,_,completion=package(*fixture(True));v.known_z_sample_ids.clear()
    try:v.telemetry(raw,b'not JSON\n',completion,1,256,1)
    except ValueError:pass
    else:raise AssertionError('Malformed metadata must fail')
    assert v.known_z_sample_ids==[0]
check('raw Z survives a later metadata parse exception without loss',late_error)
def normal_log():
    raw=b'pw:browser <launching> local\npw:browser <launched> pid=12\npw:browser [pid=12] <gracefully close start>\npw:browser [pid=12] <process did exit: exitCode=0, signal=null>\npw:browser [pid=12] <gracefully close end>\n'
    v.issues.clear();out=v.normal_browser_log(raw);assert not v.issues and out['browserPid']==12
    v.issues.clear();v.normal_browser_log(raw+b'pw:browser [pid=12] <kill>\n');assert 'BROWSER_FORCE_OR_KILL_FALLBACK' in v.issues
check('normal browser-close log passes but successful-looking kill fallback is rejected',normal_log)
def wrong_source_exit():
    _,errors=run(external=0);assert 'EXTERNAL_EXIT_NOT_EXPECTED_SOURCE' in errors
check('a green external exit cannot replace expected original unresolved workload exit1',wrong_source_exit)
def original_failure_zero_z():
    _,errors=run(external=1);assert not errors,errors
    assert not errors
check('workload exit1 is not automatically classified as instrumentation failure',original_failure_zero_z)
def first_z_after_state_changes():
    rows,events=fixture(True);events[-1]['after']['process']=dict(events[-1]['after']['process'],state='S')
    out,errors=run(rows,events);assert not errors,errors
    assert not out['zeroObservedZ']
check('stable identity and successful first-Z reads do not require repeated Z or imply whole-group termination',first_z_after_state_changes)
def extra_phase():
    rows,events=fixture();events.insert(1,{'kind':'phase','phase':'deadline','event':'event','monoNs':'2'})
    _,errors=run(rows,events);assert 'EXACT_SUCCESSFUL_PHASE_SEQUENCE' in errors
check('unexpected deadline phase cannot masquerade as completed original workload',extra_phase)
def sidecar_fixture():
    return {'schemaVersion':1,'scope':'prospective-corrected-css-p57-batch','acceptance':'NOT_EVALUATED','closure':'PROVISIONAL_PENDING_SIDECAR_AND_TELEMETRY_IO_AND_EXTERNAL_GATES','executedCaller':{'file':'verification-inputs/contrast-p57-approved-batch-probe.mjs','sha256':'a'*64},'originalWorkloadProbeSha256':'9b8f407a554434f793bd93b7cf50cf145adfba828d6660c6b49896fe82da7053','historicalVerifiedInputsMeaning':'CANDIDATE_AND_EXECUTED_CALLER_WITH_IMMUTABLE_BASELINE_REFERENCES','source':{'batchId':'p390-00-11','status':'incomplete','sourceObservationComplete':True,'internalBudgetExpired':False,'cleanupErrorCount':0,'expectedExitCode':1},'observationsComplete':True,'errors':[],'lifecycleDiagnostics':{'status':'complete','issues':[],'issueOverflow':False,'bytesUncertain':False},'sourceSummaryBudget':{'sourceMaxBytes':16384,'samplerMetadataMaxBytes':114688,'samplerCombinedMaxBytes':4177920,'failure':None},'started':{'monoNs':'1'},'ended':{'monoNs':'100'},'runtimeVersions':{'node':'v24.21.0','kernelRelease':'6.18.44','browser':'156.0.8078.4'}}
def sc(record):
    v.issues.clear();out=v.sidecar(encode(record),1,{'workloadStatus':'incomplete'},'a'*64);return out,list(v.issues)
def sidecar_valid():
    out,errors=sc(sidecar_fixture());assert not errors,errors
check('complete unresolved original workload sidecar preserves provisional closure and exit1',sidecar_valid)
def sidecar_mismatch():
    s=sidecar_fixture();s['executedCaller']['sha256']='b'*64;_,errors=sc(s);assert 'SIDECAR_EXECUTED_CALLER' in errors
check('historical verified inputs cannot substitute for actual executed caller identity',sidecar_mismatch)
def sidecar_green():
    s=sidecar_fixture();s['source']['expectedExitCode']=0;_,errors=sc(s);assert 'SIDECAR_SOURCE_AGREEMENT' in errors
check('sidecar cannot silently green original unresolved source result',sidecar_green)
def sidecar_error():
    s=sidecar_fixture();s['source']['sourceObservationComplete']=False;_,errors=sc(s);assert 'SIDECAR_SOURCE_AGREEMENT' in errors
check('partial source observation cannot satisfy workload sidecar closure',sidecar_error)
def sidecar_late_z():
    s=sidecar_fixture();s['lifecycleDiagnostics']['firstZombie']='not-observed';_,errors=sc(s);assert not errors,errors
    out,errors=run(*fixture(True));assert not errors and not out['zeroObservedZ']
check('terminal first-Z may follow complete provisional sidecar and remains explicitly retained',sidecar_late_z)
def sidecar_overflow():
    s=sidecar_fixture();s['padding']='x'*16384;_,errors=sc(s);assert 'SIDECAR_BYTE_CAP' in errors
check('new sidecar alone cannot exceed16KiB even when legacy summary is much larger',sidecar_overflow)
def driver_cases():
    base={'job':'p390-00-11','deadline_seconds':120,'combined_log_limit_bytes':4194304,'deadline_expired':False,'log_limit_exceeded':False,'errors':[],'elapsed_seconds':90}
    assert v.driver_receipt_valid(base,'p390-00-11')
    for invalid in [float('nan'),float('inf'),-1,90.000001,True,'89']:
        assert not v.driver_receipt_valid(dict(base,elapsed_seconds=invalid),'p390-00-11')
    for field,value in [('deadline_expired',True),('log_limit_exceeded',True),('attach_client_terminated',True),('deadline_seconds',121),('errors',['late failure']),('job','p320-00-10')]:
        assert not v.driver_receipt_valid(dict(base,**{field:value}),'p390-00-11')
check('driver exact90 boundary accepts; NaN/Inf/bool/negative/over90/watchdog/logcap/wrongjob reject',driver_cases)
def external_bool():
    _,errors=run(external=True);assert 'EXTERNAL_EXIT_NOT_EXPECTED_SOURCE' in errors
check('boolean external exit is not integer sourceexit1',external_bool)
def sidecar_bool():
    s=sidecar_fixture();s['source']['expectedExitCode']=True;_,errors=sc(s);assert 'SIDECAR_EXIT_TYPE' in errors
check('boolean sidecar exit cannot masquerade as legitimate completed unresolved1',sidecar_bool)
def exact_five_artifact_sets():
    contract=json.loads((p.parent.parent/'inputs/expected-bindings.json').read_bytes())
    expected_counts={'p390-00-11':23,'p320-00-10':23,'p390-12-23':22,'p320-11-21':21,'p320-22-32':21}
    for job,count in expected_counts.items():
        wanted=v.expected_artifacts(job,contract['jobs'][job]);assert len(wanted)==count,(job,wanted)
        shots=[x for x in wanted if x.endswith('.png') and '/P-reflow-' in x]
        assert len(shots)==(1 if job=='p390-00-11' else 2 if job=='p320-00-10' else 0)
        assert all(x.startswith(job+'/') or x.startswith('resource-diagnostics/') for x in wanted)
check('actual frozen five-job binding schema yields exact retained artifactsets including sourceindex screenshots',exact_five_artifact_sets)
print(json.dumps({'status' :'PASS' ,'method':'Synthetic in-memory telemetry only; no runtime, network, proc or writes.','checks':len(checks),'results':checks,'validatorSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'challengeSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()},indent=2))
