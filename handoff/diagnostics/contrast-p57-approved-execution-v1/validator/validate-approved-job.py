"""Read-only prospective per-job continuation checks for the approved corrected-CSS sequence; stdout only."""
import argparse, hashlib, importlib.util, json, math, os, pathlib, re, stat, sys, tarfile
from cleanup_gate import completed_cleanup
TASK = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = TASK / 'runtime'
JOB = 'p390-00-11'
EXPECTED_BINDINGS_SHA256='456fd9b0403fe82a42cc5cb016a2320823a24f4934aa8bd22ecdef0819c6139b'
OVERLAY_SHA256='124a9af10f7e3fb47508a0be9c6805f141872207df953f1ab3e1086607e568b1'
EXPECTED_BINDINGS_PATH=TASK/'inputs/expected-bindings.json'
EXPECTED_BINDINGS=None
PREFLIGHT=False
LIMITS = {'phaseEvents':32, 'phaseBytes':16384, 'metadataBytes':131072,
          'combinedBytes':4194304, 'taskStatReads':128, 'statBytes':4096, 'completionReserve':2048}
issues = []
bindings = []
known_z_sample_ids = []
def require(ok, code):
    if not ok: issues.append(code)
def digest(raw): return hashlib.sha256(raw).hexdigest()
def pairs(rows):
    out={}
    for k,v in rows:
        if k in out: raise ValueError('duplicate JSON key')
        out[k]=v
    return out
def parse(raw):
    return json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))
def read(path, cap=33554432):
    path=pathlib.Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size>cap: raise ValueError('file absent/type/size')
    raw=path.read_bytes();bindings.append({'path':str(path),'bytes':len(raw),'sha256':digest(raw)})
    return raw
def load(path, cap=33554432): return parse(read(path,cap))
def ndjson(raw):
    if not raw or not raw.endswith(b'\n'): raise ValueError('NDJSON framing')
    lines=raw.splitlines(keepends=True)
    return [parse(line) for line in lines],lines
def retain_known_z(samples):
    for index,row in enumerate(samples):
        if (type(row.get('zombie_count')) is int and row['zombie_count']>0) or any(p.get('state')=='Z' for p in row.get('processes',[])):
            sample=row.get('sample',index)
            if sample not in known_z_sample_ids:known_z_sample_ids.append(sample)
def stamp(value):
    text=value['monoNs']
    if not isinstance(text,str) or not text.isdecimal() or len(text)>24: raise ValueError('monotonic stamp')
    return int(text)
def integer(value): return type(value) is int and value>=0
def inspect(path):
    record=load(path);require(record['exit_code']==0,'INSPECT_COMMAND_FAILED')
    rows=parse(record['stdout'].encode());require(len(rows)==1,'INSPECT_CARDINALITY')
    return rows[0]
def normal_browser_log(raw):
    prior_issues=len(issues)
    lines=raw.decode('utf-8').splitlines()
    launching=[i for i,s in enumerate(lines) if 'pw:browser <launching>' in s]
    launched=[(i,re.search(r'pw:browser <launched> pid=(\d+)',s)) for i,s in enumerate(lines) if 'pw:browser <launched>' in s]
    require(len(launching)==1 and len(launched)==1 and launched[0][1] is not None,'BROWSER_LAUNCH_LOG')
    pid=int(launched[0][1].group(1)) if len(launched)==1 and launched[0][1] else None
    events={}
    for name,token in [('start','<gracefully close start>'),('exit','<process did exit: exitCode=0, signal=null>'),('end','<gracefully close end>')]:
        matches=[i for i,s in enumerate(lines) if 'pw:browser ' in s and token in s]
        require(len(matches)==1 and f'[pid={pid}]' in lines[matches[0]],'BROWSER_LOG_'+name.upper())
        events[name]=matches[0] if len(matches)==1 else None
    unexpected=[i+1 for i,s in enumerate(lines) if 'pw:browser ' in s and any(x in s for x in ('<forcefully close>','<kill>','<will force kill>','<skipped force kill','exception while trying to kill','exception while removing'))]
    require(not unexpected,'BROWSER_FORCE_OR_KILL_FALLBACK')
    require(sum('pw:browser ' in s and '<process did exit:' in s for s in lines)==1,'BROWSER_EXIT_LOG_CARDINALITY')
    if len(launching)==len(launched)==1 and all(x is not None for x in events.values()):
        require(launching[0]<launched[0][0]<events['start']<events['exit']<events['end'],'BROWSER_LOG_ORDER')
    return {'browserPid':pid,'normalExit':len(issues)==prior_issues,'unexpectedFallbackLogLines':unexpected,'events':events,
            'limitation':'Normal process-close log evidence does not identify any child wait/reaper or kernel path.'}
def telemetry(raw,meta,completion,external_exit,source_summary_bytes,expected_source_exit):
    samples,_=ndjson(raw);retain_known_z(samples)
    events,event_lines=ndjson(meta);c=parse(completion);lc=c['lifecycle']
    require(type(expected_source_exit) is int and expected_source_exit in (0,1) and type(external_exit) is int and external_exit==expected_source_exit,'EXTERNAL_EXIT_NOT_EXPECTED_SOURCE')
    require(c['samples']==len(samples) and c['bytes']==len(raw),'RAW_COMPLETION_TOTALS')
    require(c['interval_ms']==100 and c['byte_limit']==4194304 and c['failure'] is None,'RAW_COMPLETION_STATUS')
    require(lc['status']=='provisional-external-io-verification-required' and lc['completionWritten'] is False,'COMPLETION_NOT_PROVISIONAL')
    require(lc['observedStatusBeforeCompletionWrite']=='complete','PRE_COMPLETION_INCOMPLETE')
    require(type(lc['sourceExitCode']) is int and lc['sourceExitCode']==expected_source_exit and lc['closeFailed'] is False,'SOURCE_EXIT_OR_SINK_CLOSE_FAILED')
    require(lc['issues']==[] and lc['issueOverflow'] is False and lc['bytesUncertain'] is False,'DIAGNOSTIC_ISSUES_OR_UNCERTAINTY')
    require(lc['rawBytes']==len(raw) and lc['metadataBytes']==len(meta)+len(completion)
            and lc['combinedBytes']==len(raw)+len(meta)+len(completion),'ACTUAL_UTF8_BYTE_TOTALS')
    require(lc['limits']==LIMITS and len(meta)+len(completion)<=131072
            and len(raw)+len(meta)+len(completion)<=4194304 and len(completion)<=2048,'BYTE_OR_LIMITS_GATE')
    require(0<source_summary_bytes<=16384 and len(meta)+len(completion)+source_summary_bytes<=131072
            and len(raw)+len(meta)+len(completion)+source_summary_bytes<=4194304,'AGGREGATE_BYTES_INCLUDING_SOURCE_SUMMARY')
    require(len(meta)+len(completion)<=131072-16384
            and len(raw)+len(meta)+len(completion)<=4194304-16384,'PRE_RESERVED_SUMMARY_ALLOWANCE')
    require([x['sample'] for x in samples]==list(range(len(samples))),'SAMPLE_SEQUENCE')
    require(samples[0]['phase']=='start' and samples[-1]['phase']=='exit'
            and all(x['phase']=='interval' for x in samples[1:-1]),'START_INTERVAL_TERMINAL_SEQUENCE')
    start=samples[0];node=start['sampler']['pid']
    require(start['sampler']['selected'] is True and start['sampler']['intendedTest'] is True
            and start['sampler']['entrypoint']=='/work/verification-inputs/contrast-p57-approved-batch-probe.mjs'
            and start['sampler']['ppid']==1 and start['sampler']['nodePools']=={'v8':1,'libuv':1}
            and start['runtime_init']=={'pid':1,'name':'docker-init'}
            and start['interval_ms']==100 and start['byte_limit']==4194304,'SELECTED_SAMPLER_BOUNDARY')
    current=None;z_samples=[];peaks=[];identity={};lists_by_sample={}
    for row in samples:
        if 'processes' in row: current=row['processes']
        require(isinstance(current,list),'PROCESS_LIST_MISSING')
        if not isinstance(current,list): continue
        lists_by_sample[row['sample']]=current
        require(all('unavailable' not in p for p in current),'PROCESS_READ_UNAVAILABLE')
        require(len({p['pid'] for p in current})==len(current),'DUPLICATE_PROCESS_PID')
        observed_z=sum(p.get('state')=='Z' for p in current)
        require(row['zombie_count']==observed_z and row['process_count']==len(current)
                and row['visible_threads']==sum(p.get('threads',0) for p in current),'RAW_PROCESS_COUNT_MISMATCH')
        if observed_z:z_samples.append(row['sample'])
        for p in current:
            if p['pid'] in (1,node) and 'start_ticks' in p:
                identity.setdefault(p['pid'],p['start_ticks'])
                require(identity[p['pid']]==p['start_ticks'],'INIT_NODE_IDENTITY_CHANGED')
        counters=row['counters']
        for key in ['pids.current','pids.max','pids.peak','memory.current','memory.peak']:
            value=counters[key];require(isinstance(value,str) and value.isdecimal(),'COUNTER_UNAVAILABLE_'+key)
        require(counters['pids.max']=='128','PID_LIMIT_CHANGED')
        require(int(counters['pids.current'])<=128 and int(counters['pids.peak'])<=128
                and row['visible_threads']<=128 and row['process_count']<=128,'TASK_LIMIT_EXCEEDED')
        require(int(counters['memory.current'])<=1073741824 and int(counters['memory.peak'])<=939524096,'MEMORY_OR_HEADROOM_LIMIT')
        peaks.append(int(counters['memory.peak']))
        for key in ['pids.events','pids.events.local','memory.events','memory.events.local']:
            value=counters[key];require(isinstance(value,str) and bool(value),'EVENT_COUNTER_UNAVAILABLE_'+key)
            fields=value.splitlines() if isinstance(value,str) else []
            require(bool(fields) and all(len(x.split())==2 and x.split()[1]=='0' for x in fields),'RESOURCE_EVENT_'+key)
    require({p['pid'] for p in samples[-1]['processes']}=={1,node},'TERMINAL_BROWSER_PROCESS_REMAINS')
    phases=[x for x in events if x['kind']=='phase'];phase_bytes=sum(len(line) for x,line in zip(events,event_lines) if x['kind']=='phase')
    require(lc['phaseEvents']==len(phases)<=32 and lc['phaseBytes']==phase_bytes<=16384,'PHASE_TOTALS_OR_CAP')
    require(all(x['kind'] in ('phase','read-bounds','first-zombie') for x in events),'UNKNOWN_METADATA_KIND')
    require([stamp(x) for x in phases]==sorted(stamp(x) for x in phases),'PHASE_CLOCK_ORDER')
    expected=[('workload.capture','start'),('controls.context.close','start'),('controls.context.close','settled'),('product.context.close','start'),('product.context.close','settled'),('final.browser.close','start'),('final.browser.close','settled'),('workload.capture','settled')]
    disconnect=[p for p in phases if p['phase']=='browser.disconnected'];require(len(disconnect)==1 and disconnect[0]['event']=='event','DISCONNECTED_EVENT')
    require([(p['phase'],p['event']) for p in phases if p['phase']!='browser.disconnected']==expected,'EXACT_SUCCESSFUL_PHASE_SEQUENCE')
    by={(p['phase'],p['event']):p for p in phases}
    intervals={}
    for label,counts in [('controls.context.close',(1,0)),('product.context.close',(1,0)),('final.browser.close',(0,0))]:
        a,b=by[(label,'start')],by[(label,'settled')]
        require((a.get('contextCount'),b.get('contextCount'))==counts,'CONTEXT_COUNTS_'+label)
        intervals[label]=(stamp(a),stamp(b));require(intervals[label][0]<=intervals[label][1],'CLOSE_TIME_REVERSED')
    require(intervals['controls.context.close'][1]<=intervals['product.context.close'][0] and intervals['product.context.close'][1]<=intervals['final.browser.close'][0],'CLOSE_ORDER')
    require(len(disconnect)==1 and intervals['final.browser.close'][0]<=stamp(disconnect[0])<=intervals['final.browser.close'][1],'DISCONNECT_OUTSIDE_CLOSE')
    reads=[];bound_samples=[]
    for record in events:
        if record['kind']!='read-bounds':continue
        require(record['atomicSnapshot'] is False and record['processReadEncoding']=='[pid,beforeOffsetNs,afterOffsetNs] from before.monoNs','READ_BOUND_FORMAT')
        i=record['sample'];require(integer(i) and i<len(samples),'READ_BOUND_SAMPLE')
        bound_samples.append(i);origin=stamp(record['before']);end=stamp(record['after']);require(origin<=end,'SWEEP_REVERSED')
        require(len(record['processReads'])<=128,'PROCESS_READ_CAP')
        for pid,a,b in record['processReads']:
            require(type(pid)is int and pid>0 and isinstance(a,str) and a.isdecimal() and isinstance(b,str) and b.isdecimal(),'PROCESS_READ_ENCODING')
            low,high=origin+int(a),origin+int(b);require(origin<=low<=high<=end,'PROCESS_READ_BOUNDS')
            reads.append({'sample':i,'pid':pid,'startNs':low,'endNs':high})
    require(len(bound_samples)==len(set(bound_samples)),'DUPLICATE_BOUND_SAMPLE')
    required={x['sample'] for x in samples if 'processes' in x or x['zombie_count']>0}
    require(set(bound_samples)==required,'CHANGED_Z_TERMINAL_BOUND_COVERAGE')
    for i in required:
        record=next(x for x in events if x['kind']=='read-bounds' and x['sample']==i)
        if 'processes' in samples[i]:require({r[0] for r in record['processReads']}=={p['pid'] for p in samples[i]['processes']},'PER_PROCESS_BOUND_COVERAGE')
    first=[x for x in events if x['kind']=='first-zombie']
    if not z_samples:require(not first and lc['firstZombie']=='not-observed' and lc['taskStatReads']==0,'UNEXPECTED_FIRST_Z')
    else:
        require(len(first)==1 and lc['firstZombie']=='complete','FIRST_Z_ATTRIBUTION_INCOMPLETE')
        if first:
            z=first[0];require(z['identityStable'] is True and z['status']=='complete-observation' and z['listingStatus']=='read' and z['truncated'] is False,'FIRST_Z_IDENTITY_OR_READ_FAILURE')
            observed=next(p for row in samples[:z_samples[0]+1] if 'processes' in row for p in row['processes'] if p.get('state')=='Z')
            require(z['identity']=={'pid':observed['pid'],'start_ticks':observed['start_ticks']},'FIRST_Z_RAW_IDENTITY')
            require(z['taskStatReads']==lc['taskStatReads']==z['listedCount']==len(z['tasks']) and 0<len(z['tasks'])<=128
                    and all(t['status']=='read' for t in z['tasks']),'FIRST_Z_TASK_READS')
            for side in ['before','after']:
                require(z[side]['status']=='read' and z[side]['process']['pid']==z['identity']['pid'] and z[side]['process']['start_ticks']==z['identity']['start_ticks'],'FIRST_Z_LEADER_BINDING')
    coverage={}
    for label,(a,b) in intervals.items():
        overlaps=[r for r in reads if r['startNs']<=b and r['endNs']>=a]
        inside=[r for r in overlaps if a<=r['startNs']<=r['endNs']<=b]
        coverage[label]={'startNs':str(a),'settledNs':str(b),'durationNs':str(b-a),
                         'retainedProcessReadIntervalsOverlapping':len(overlaps),'retainedProcessReadIntervalsWhollyInside':len(inside),
                         'boundaryOverlappingReadIntervals':len(overlaps)-len(inside),'noRetainedReadOverlap':not overlaps,
                         'overlappingSampleIds':sorted({r['sample'] for r in overlaps}),
                         'chromiumNamedReadIntervalsWhollyInside':sum(any(p['pid']==r['pid'] and p.get('name','').startswith('chrome') for p in lists_by_sample[r['sample']]) for r in inside)}
    z_attribution=[]
    for r in reads:
        if r['sample'] not in z_samples or not any(p['pid']==r['pid'] and p.get('state')=='Z' for p in lists_by_sample[r['sample']]):continue
        z_attribution.append({**r,'phaseRelations':{label:'wholly-inside' if a<=r['startNs']<=r['endNs']<=b else 'boundary-overlap' if r['startNs']<=b and r['endNs']>=a else 'outside' for label,(a,b) in intervals.items()}})
    return {'rawSamples':len(samples),'zSampleIds':z_samples,'zeroObservedZ':not z_samples,
            'kernelMemoryPeakBytes':max(peaks),'kernelTaskPeak':max(int(x['counters']['pids.peak']) for x in samples),'closeReadCoverage':coverage,'zReadPhaseAttribution':z_attribution,
            'firstZombieObservation':first[0] if first else None,
            'zProcessObservations':[{'sample':i,'utc':samples[i].get('utc'),'process':p} for i in z_samples for p in lists_by_sample[i] if p.get('state')=='Z'],
            'coverageLimitation':'Intervals are non-atomic read bounds. No retained overlap means close-time timing evidence is absent; unchanged interval reads may have been compressed. Zero sampled Z does not exclude unsampled transitions.',
            'rawBytes':len(raw),'samplerMetadataIncludingCompletionBytes':len(meta)+len(completion),
            'sourceSummaryBytes':source_summary_bytes,'allNewMetadataBytes':len(meta)+len(completion)+source_summary_bytes,
            'allTelemetryBytes':len(raw)+len(meta)+len(completion)+source_summary_bytes}

def file_hash(path):
    path=pathlib.Path(path)
    if path.is_symlink() or not path.is_file():raise ValueError('file absent/type')
    h=hashlib.sha256();size=0
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1048576),b''):h.update(block);size+=len(block)
    bindings.append({'path':str(path),'bytes':size,'sha256':h.hexdigest()})
    return size,h.hexdigest()
def path_parts(name):
    p=pathlib.PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts:raise ValueError('unsafe retained path')
    return p.parts
def input_identity(e):
    return ('symlink',e['target']) if e['type']=='symlink' else ('file',e['bytes'],e['sha256'])
def check_input_archives(expected,directories):
    for which in ['before','after']:
        path=RUNTIME/('input-'+which+'.tar');file_hash(path)
        with tarfile.open(path,'r:') as archive:
            found={};dirs={}
            for member in archive:
                parts=path_parts(member.name);require(parts[0]=='input','INPUT_ARCHIVE_ROOT')
                name='/'.join(parts[1:]) or '.'
                require(member.uid==member.gid==1000,'INPUT_ARCHIVE_OWNER')
                if member.isdir():dirs[name]=(member.mode,member.uid,member.gid);continue
                require(name not in found,'INPUT_ARCHIVE_DUPLICATE')
                if member.issym():
                    target=pathlib.PurePosixPath(member.linkname)
                    require(not target.is_absolute(),'INPUT_LINK_ABSOLUTE')
                    # The exact target and confined staged resolution are checked independently.
                    found[name]=('symlink',member.linkname)
                elif member.isfile() and not member.issparse():
                    require(member.size<=33554432,'INPUT_ARCHIVE_FILE_CAP')
                    stream=archive.extractfile(member);h=hashlib.sha256();n=0
                    for block in iter(lambda:stream.read(1048576),b''):h.update(block);n+=len(block)
                    found[name]=('file',n,h.hexdigest())
                    require(name in expected and member.mode==expected[name]['mode'],'INPUT_ARCHIVE_MODE')
                else:require(False,'INPUT_ARCHIVE_TYPE')
            require(found=={k:input_identity(v) for k,v in expected.items()},'INPUT_ARCHIVE_'+which.upper()+'_IDENTITY')
            require(dirs=={e['path']:(e['mode'],e['uid'],e['gid']) for e in directories},'INPUT_ARCHIVE_DIRECTORY_MODES')
def sidecar(raw,expected_exit,workload,caller_sha):
    require(0<len(raw)<=16384,'SIDECAR_BYTE_CAP');s=parse(raw)
    require(s['schemaVersion']==1 and s['scope']=='prospective-corrected-css-p57-batch' and s['acceptance']=='NOT_EVALUATED' and s['closure']=='PROVISIONAL_PENDING_SIDECAR_AND_TELEMETRY_IO_AND_EXTERNAL_GATES','SIDECAR_PROVISIONAL_SCOPE')
    require(s['executedCaller']=={'file':'verification-inputs/contrast-p57-approved-batch-probe.mjs','sha256':caller_sha},'SIDECAR_EXECUTED_CALLER')
    require(s['originalWorkloadProbeSha256']=='9b8f407a554434f793bd93b7cf50cf145adfba828d6660c6b49896fe82da7053' and s['historicalVerifiedInputsMeaning']=='CANDIDATE_AND_EXECUTED_CALLER_WITH_IMMUTABLE_BASELINE_REFERENCES','SIDECAR_HISTORICAL_PROVENANCE')
    require(type(s['source']['expectedExitCode']) is int,'SIDECAR_EXIT_TYPE')
    require(s['source']=={'batchId':JOB,'status':workload['workloadStatus'],'sourceObservationComplete':True,'internalBudgetExpired':False,'cleanupErrorCount':0,'expectedExitCode':expected_exit},'SIDECAR_SOURCE_AGREEMENT')
    require(s['observationsComplete'] is True and s['errors']==[] and s['lifecycleDiagnostics']['status']=='complete' and s['lifecycleDiagnostics']['issues']==[] and s['lifecycleDiagnostics']['issueOverflow'] is False and s['lifecycleDiagnostics']['bytesUncertain'] is False,'SIDECAR_DIAGNOSTIC_STATUS')
    require(s['sourceSummaryBudget']=={'sourceMaxBytes':16384,'samplerMetadataMaxBytes':114688,'samplerCombinedMaxBytes':4177920,'failure':None},'SIDECAR_RESERVE_STATUS')
    require(0<=stamp(s['ended'])-stamp(s['started'])<=90000000000,'SOURCE_ELAPSED_BOUND')
    require(set(s['runtimeVersions'])=={'node','kernelRelease','browser'} and all(isinstance(x,str) and 0<len(x.encode())<=128 and re.fullmatch(r'[\w.+()# -]+',x) for x in s['runtimeVersions'].values()),'BOUNDED_RUNTIME_VERSIONS')
    return {'runtimeVersions':s['runtimeVersions'],'source':s['source'],'elapsedNs':str(stamp(s['ended'])-stamp(s['started'])),'limitation':'Sidecar snapshot precedes terminal sampling and completion; its counters and first-Z state are not terminal truth.'}
def driver_receipt_valid(receipt, job):
    elapsed=receipt.get('elapsed_seconds')
    return (receipt.get('job')==job and type(receipt.get('deadline_seconds')) is int and receipt['deadline_seconds']==120
            and receipt.get('combined_log_limit_bytes')==4194304 and receipt.get('deadline_expired') is False
            and receipt.get('log_limit_exceeded') is False and receipt.get('errors')==[]
            and type(elapsed) in (int,float) and math.isfinite(elapsed) and 0<=elapsed<=90
            and not receipt.get('attach_client_terminated',False))

def expected_artifacts(job, contract):
    state_id=contract['stateId'];count=contract['expectedNodeCount']
    shots=[n['sourceAuditNodeIndex'] for n in contract['selectedOriginalNodes'] if n['sourceAuditNodeIndex']==0 or (n['field']=='duration' and n['sourceAuditNodeIndex']==6)]
    base={'resource-diagnostics/samples.ndjson','resource-diagnostics/lifecycle.ndjson','resource-diagnostics/completion.json',job+'/lifecycle-source.json',job+'/summary.json',job+'/controls-'+job+'.json',job+'/'+state_id+'-body-before.html',job+'/'+state_id+'-body-after.html',job+'/screenshot-control-default.png',job+'/screenshot-control-initial.png'}
    return base|{job+'/node-'+job+'-'+str(i).zfill(3)+'.json' for i in range(count)}|{job+'/'+state_id+'-node-'+str(i)+'.png' for i in shots}

def main():
    raw_path=RUNTIME/'jobs'/JOB/'artifacts/resource-diagnostics/samples.ndjson'
    if raw_path.is_file():
        raw_eager=read(raw_path,4194304)
        for line in raw_eager.splitlines():
            try:retain_known_z([parse(line)])
            except Exception:pass
    expected_contract=load(EXPECTED_BINDINGS_PATH);require(file_hash(EXPECTED_BINDINGS_PATH)[1]==EXPECTED_BINDINGS_SHA256,'EXPECTED_CONTRACT_HASH')
    overlay=load(TASK/'inputs/overlay-manifest.json');require(file_hash(TASK/'inputs/overlay-manifest.json')[1]==OVERLAY_SHA256,'OVERLAY_HASH')
    job_contract=expected_contract['jobs'][JOB]
    plan=load(RUNTIME/'plan.json');prep=load(RUNTIME/'preparation-receipt.json');manifest=load(RUNTIME/'input-manifest.json')
    require(file_hash(RUNTIME/'plan.json')[1]==prep['bindings']['plan.json']['sha256'],'PLAN_HASH')
    require(file_hash(RUNTIME/'input-manifest.json')[1]==plan['input_manifest_sha256']==prep['bindings']['input-manifest.json']['sha256'],'INPUT_MANIFEST_HASH')
    require(file_hash(RUNTIME/'driver.py')[1]==plan['driver_sha256']==prep['bindings']['driver.py']['sha256'],'DRIVER_HASH')
    require(file_hash(plan['profile'])[1]==plan['profile_sha256']=='f590f8ce5e847b35c95ed525a0a24c2e290472732c7c86f307e8496d7b47e33c','PROFILE_HASH')
    require(plan['image_id']=='sha256:847f71bbb3f17fc1032d50d75bf6fb3fdcf188b16dff81f24667fe9ae9409e01' and plan['image_digest']=='sha256:bc72a8df40831ded821e3cbc79c318c21b44d6e51dff9fd89ace7a8249c5b462','IMAGE_BINDING')
    require(plan['jobs']==[{'id':JOB,'command':['node','--v8-pool-size=1','--import','/work/verification-inputs/resource-probe.mjs','/work/verification-inputs/contrast-p57-approved-batch-probe.mjs','/work/contrast-p57-approved-batch-inputs.json','/work/.repro-runs/'+JOB,JOB],'env':['UV_THREADPOOL_SIZE=1']}],'EXACT_ONE_JOB')
    require(sum(e['type']=='file' for e in manifest['entries'])==plan['input_file_count'] and sum(e['type']=='symlink' for e in manifest['entries'])==plan['input_symlink_count']==10 and len(manifest['entries'])==plan['input_file_count']+10,'INPUT_SCOPE')
    expected={}
    for e in manifest['entries']:
        path_parts(e['path']);require(e['path'] not in expected,'INPUT_DUPLICATE_PATH');expected[e['path']]=e
        path=RUNTIME/'input'/e['path'];info=path.lstat();require(info.st_uid==info.st_gid==1000,'INPUT_OWNER')
        if e['type']=='symlink':
            require(path.is_symlink() and os.readlink(path)==e['target'] and not pathlib.PurePosixPath(e['target']).is_absolute() and path.resolve(strict=True).is_relative_to((RUNTIME/'input').resolve()) and path.resolve(strict=True).is_file(),'INPUT_LINK_CONFINEMENT')
        else:
            require(file_hash(path)==(e['bytes'],e['sha256']) and stat.S_IMODE(info.st_mode)==e['mode'],'INPUT_FILE_'+e['path'])
    require(len(manifest['directories'])==451,'INPUT_DIRECTORY_COUNT')
    for e in manifest['directories']:
        path=RUNTIME/'input'/e['path'];info=path.stat();require(path.is_dir() and not path.is_symlink() and info.st_uid==info.st_gid==1000 and stat.S_IMODE(info.st_mode)==e['mode']==448,'INPUT_DIRECTORY_MODE_OWNER')
    baseline=load(manifest['baseline_manifest']);require(file_hash(manifest['baseline_manifest'])[1]==manifest['baseline_manifest_sha256']=='1035b18a38ad19b11c06d8cf135af9f8767356bd5d9c509db62496f68c7dab33','ORIGINAL_MANIFEST_BINDING')
    old={e['path']:e for e in baseline['entries']}
    overlay_by_path={e['path']:e for e in overlay['files']}
    desired={k:input_identity(v) for k,v in old.items()}
    desired.update({e['path']:('file',e['bytes'],e['sha256']) for e in overlay['files']})
    require({k:input_identity(v) for k,v in expected.items()}==desired,'EXACT_APPROVED_INPUT_DELTA')
    for e in overlay['files']:require(file_hash(e['source'])==(e['bytes'],e['sha256']),'OVERLAY_SOURCE_'+e['path'])
    require(expected['contrast-p57-approved-batch-inputs.json']['sha256']==expected_contract['manifestSha256'] and expected['actual/study/P.html']['sha256']==expected_contract['candidateHtmlSha256'],'CORRECTED_CSS_AND_MANIFEST')
    require(all(e.get('mode')==expected[k].get('mode') for k,e in old.items()),'ORIGINAL_MODES_UNCHANGED')
    require(file_hash(TASK/'inputs/source-freeze.json')[1]=='b49450b8b30245d308750c4018a84bdc9032babdb9c8670b8fe82f51921a4510','SOURCE_FREEZE')
    for field in ['overlay_manifest','independent_contract','authorization']:
        require(file_hash(plan[field])[1]==plan[field+'_sha256'],'PLAN_BINDING_'+field)
    require(plan['input_file_count']==3614 and plan['input_symlink_count']==10 and plan['maximum_jobs']==5 and plan['cumulative_internal_seconds']==450 and plan['cumulative_outer_seconds']==600 and plan['approved_execution_order']==['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32'],'APPROVED_SEQUENCE_AND_SCOPE')
    require(plan['interpretive_thresholds']['driver_elapsed_seconds']==90 and plan['interpretive_thresholds']['kernel_peak_bytes']==939524096 and plan['deadline_seconds']==120 and plan['log_limit_bytes']==4194304 and plan['internal_bounds']['stop_after_elapsed_ms']==90000,'PLAN_LIMITS')
    if PREFLIGHT:
        print(json.dumps({'status':'STAGED_BINDINGS_PASS' if not issues else 'STAGED_BINDINGS_FAIL','runtimeExecuted':False,'job':JOB,'issues':issues,'bindings':bindings},indent=2));return 0 if not issues else 1
    check_input_archives(expected,manifest['directories'])
    jd=RUNTIME/'jobs'/JOB;owned=load(RUNTIME/'owned.json');receipt=load(jd/'test-receipt.json');cleanup=load(RUNTIME/'cleanup-receipt.json')
    require(set(owned['jobs'])=={JOB} and owned['jobs'][JOB]['start_attempted'] is True and owned['finished'] is True,'SINGLE_ATTEMPT_FINISHED')
    require(len(owned['containers'])==2 and {c['role'] for c in owned['containers']}=={'transfer',JOB} and all(c['removed'] is True for c in owned['containers']),'EXACT_OWNED_CONTAINERS')
    require(owned['nonce']==plan['nonce'] and owned['image_id']==plan['image_id'],'OWNERSHIP_IDENTITY')
    require(cleanup['result']=='PASS' and cleanup['jobs']==[JOB] and cleanup['remaining_owned_containers']==[] and cleanup['remaining_owned_volumes']==[] and cleanup['transfer_never_started'] is True and cleanup['input_after_matches_before']=={'regular_files':plan['input_file_count'],'confined_symlinks':10} and cleanup['retained_image_id']==plan['image_id'],'CLEANUP_RECEIPT')
    for name in ['remaining-owned-containers','remaining-owned-volumes']:
        q=load(RUNTIME/(name+'.json'));require(q['exit_code']==0 and q['stdout'].strip()=='','OWNED_OBJECTS_REMAIN')
    pre=inspect(jd/'inspect-prestart.json');final=inspect(jd/'inspect-final.json');h=pre['HostConfig']
    require(pre['Id']==final['Id']==receipt['container_id']==owned['jobs'][JOB]['container_id'],'CONTAINER_ID_BINDING')
    require(pre['Config']['Labels']['org.repro.nonce']==plan['nonce'] and pre['Config']['Labels']['org.repro.task']=='contrast-p57-approved-execution-v1','EXACT_LABELS')
    require(pre['Image']==plan['image_id'] and pre['Config']['User']=='1000:1000' and h['Init'] is True and h['NetworkMode']=='none' and h['ReadonlyRootfs'] is True and h['Privileged'] is False and h['CapDrop']==['ALL'] and not h['CapAdd'] and not h['Binds'],'BOUNDARY')
    require(pre['Config']['Entrypoint']==['/usr/bin/env'] and pre['Config']['Cmd']==['-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','TMPDIR=/tmp','LANG=C.UTF-8','PLAYWRIGHT_BROWSERS_PATH=/ms-playwright','DEBUG=pw:browser']+plan['jobs'][0]['env']+plan['jobs'][0]['command'],'EXACT_COMMAND_ENVIRONMENT')
    require(h['PidsLimit']==128 and h['Memory']==1073741824 and h['NanoCpus']==2000000000 and h['ShmSize']==268435456 and h['PidMode']=='' and h['IpcMode']=='private' and h['CgroupnsMode']=='private' and h['Runtime']=='runc','RESOURCE_ENVELOPE')
    require(h['Tmpfs']=={'/tmp':'rw,nosuid,nodev,size=256m'} and not h['PortBindings'] and not h['ExtraHosts'] and not h['Devices'] and not h['DeviceRequests'] and not h['DeviceCgroupRules'] and h['RestartPolicy']['Name']=='no' and not h['PublishAllPorts'],'NO_EXTRA_RUNTIME_ACCESS')
    iv,ev=owned['volumes']
    require(sorted((m['Type'],m['Name'],m['Destination'],m['RW']) for m in pre['Mounts'])==sorted([('volume',iv,'/work',False),('volume',ev,'/work/.repro-runs',True)]) and h['Mounts'][0]['VolumeOptions']['Subpath']=='input' and h['Mounts'][1]['VolumeOptions']['Subpath']=='runs/'+JOB,'EXACT_OWNED_MOUNTS')
    require(len(h['SecurityOpt'])==2 and 'no-new-privileges' in h['SecurityOpt'] and parse(next(x[8:] for x in h['SecurityOpt'] if x.startswith('seccomp=')).encode())==load(plan['profile']),'SECURITY_PROFILE')
    require(driver_receipt_valid(receipt,JOB),'DRIVER_GATE')
    state=receipt['final_state'];require(state==final['State'] and state['Status']=='exited' and state['Running'] is False and state['OOMKilled'] is False and state['Error']=='' and state['ExitCode']==receipt['attach_exit_code'],'EXTERNAL_FINAL_STATE')
    log_raw=read(jd/'test.log');require(len(log_raw)==receipt['log_bytes']<=4194304,'LOG_BYTES');log_observation=normal_browser_log(log_raw)
    artifacts=load(jd/'artifact-manifest.json');require(file_hash(jd/'artifacts.tar')[1]==artifacts['raw_tar_sha256'],'ARTIFACT_ARCHIVE_HASH')
    wanted=expected_artifacts(JOB,job_contract)
    require({e['path'] for e in artifacts['entries']}==wanted and len(artifacts['entries'])==len(wanted),'ARTIFACT_SET')
    for e in artifacts['entries']:
        path_parts(e['path']);require(e['type']=='file','ARTIFACT_TYPE');require(file_hash(jd/'artifacts'/e['path'])==(e['bytes'],e['sha256']),'ARTIFACT_FILE_BINDING')
    archived={}
    with tarfile.open(jd/'artifacts.tar','r:') as archive:
        for member in archive:
            parts=path_parts(member.name);require(parts[0]=='.repro-runs','ARTIFACT_ARCHIVE_ROOT')
            if member.isdir():continue
            require(member.isfile() and not member.issparse(),'ARTIFACT_ARCHIVE_TYPE')
            name='/'.join(parts[1:]);require(name not in archived,'ARTIFACT_ARCHIVE_DUPLICATE');require(member.size<=33554432,'ARTIFACT_FILE_CAP')
            stream=archive.extractfile(member);hsh=hashlib.sha256();n=0
            for block in iter(lambda:stream.read(1048576),b''):hsh.update(block);n+=len(block)
            archived[name]=(n,hsh.hexdigest())
    require(archived=={e['path']:(e['bytes'],e['sha256']) for e in artifacts['entries']},'ARTIFACT_ARCHIVE_IDENTITY')
    helper_path=TASK/'validator/workload-evidence/workload_validator.py'
    spec=importlib.util.spec_from_file_location('workload_evidence',helper_path);helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    workload=helper.validate_workload(RUNTIME,jd,require,JOB);bindings.extend(workload.get('bindings',[]));require(workload['sourceComplete'] is True,'APPROVED_WORKLOAD_INCOMPLETE')
    expected_exit=workload['expectedSourceExitCode'];folder=jd/'artifacts/resource-diagnostics';sidecar_raw=read(jd/'artifacts'/JOB/'lifecycle-source.json',16384)
    sidecar_observation=sidecar(sidecar_raw,expected_exit,workload,expected['verification-inputs/contrast-p57-approved-batch-probe.mjs']['sha256'])
    observation=telemetry(read(folder/'samples.ndjson',4194304),read(folder/'lifecycle.ndjson',131072),read(folder/'completion.json',2048),state['ExitCode'],len(sidecar_raw),expected_exit)
    cleanup_observation=completed_cleanup(*[ndjson(read(folder/name,4194304))[0] for name in ('samples.ndjson','lifecycle.ndjson')],log_observation)
    require(cleanup_observation['status']=='PASS','COMPLETED_CLEANUP_'+cleanup_observation['status'])
    verdict='PASS' if not issues else 'STOP'
    print(json.dumps({'status':'CONTINUATION_GATES_PASS' if verdict=='PASS' else 'CONTINUATION_GATES_STOP','continuationGate':verdict,'diagnosticChecksComplete':not issues,'completedCleanupGate':cleanup_observation,'knownZSampleIds':known_z_sample_ids,'issues':issues,'workload':workload,'sidecar':sidecar_observation,'observation':observation,'browserLog':log_observation,'bindings':bindings,'limitations':['Prospective current corrected-CSS job only. Historical results remain unchanged.','Sampled completed cleanup is not continuous zombie absence or proof of harmlessness of every transient.','Source-complete unresolved observations are not contrast passes; global 57 completion requires all five distinct jobs.']},indent=2))
    return 0 if verdict=='PASS' else 1
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--runtime',required=True,type=pathlib.Path);ap.add_argument('--job',required=True,choices=['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32']);ap.add_argument('--bindings',type=pathlib.Path,default=EXPECTED_BINDINGS_PATH);ap.add_argument('--preflight',action='store_true')
    args=ap.parse_args();RUNTIME=args.runtime.resolve();JOB=args.job;EXPECTED_BINDINGS_PATH=args.bindings.resolve();PREFLIGHT=args.preflight
    try:sys.exit(main())
    except Exception as error:
        print(json.dumps({'status':'INCOMPLETE_VALIDATION','continuationGate':'STOP','errorType':type(error).__name__,'issues':issues,'bindings':bindings,'knownZSampleIds':known_z_sample_ids},indent=2));sys.exit(2)
