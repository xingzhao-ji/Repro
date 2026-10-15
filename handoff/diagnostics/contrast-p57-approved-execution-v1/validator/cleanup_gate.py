"""Prospective completed-cleanup criterion; no file I/O, process actions or sleeps.

Observes existing natural samples only. Missing evidence is NOT_ESTABLISHED;
valid contrary cleanup evidence is FAIL. A PASS is sampled completed cleanup,
never continuous absence. Historical results are outside this module's scope.
"""

def completed_cleanup(samples, events, browser_log):
    failures, unknown = [], []
    result = {'status':'NOT_ESTABLISHED','issues':[], 'firstPostCloseSample':None,
              'terminalSample':None,'checkedSampleIds':[], 'browserIdentity':None,
              'retainedZSampleIds':[], 'continuousZombieAbsenceClaimed':False}
    def require(ok, code, contrary=False):
        if not ok: (failures if contrary else unknown).append(code)
        return bool(ok)
    def numeric(value): return type(value) is int and value >= 0
    def ns(value):
        s=value['monoNs']
        if not isinstance(s,str) or not s.isdecimal() or len(s)>24: raise ValueError('stamp')
        return int(s)
    def identity(p):
        return p['pid'],p['start_ticks']
    def valid_process(p):
        return (isinstance(p,dict) and set(p)=={'pid','start_ticks','name','ppid','state','threads'}
                and type(p['pid']) is int and p['pid']>0 and numeric(p['ppid'])
                and isinstance(p['start_ticks'],str) and p['start_ticks'].isdecimal()
                and isinstance(p['name'],str) and bool(p['name'])
                and p['state'] in ('R','S','D','Z','T','t','X','x','K','W','P','I')
                and type(p['threads']) is int and p['threads']>0)
    try:
        if not require(isinstance(samples,list) and len(samples)>=3,'CLEANUP_SAMPLE_SEQUENCE'): raise ValueError('samples')
        require([s.get('sample') for s in samples]==list(range(len(samples))) and samples[0].get('phase')=='start' and samples[-1].get('phase')=='exit' and all(s.get('phase')=='interval' for s in samples[1:-1]),'CLEANUP_SAMPLE_SEQUENCE')
        for s in samples:
            if s.get('zombie_count',0)>0 or any(p.get('state')=='Z' for p in s.get('processes',[])):
                result['retainedZSampleIds'].append(s['sample'])
        starts=[e for e in events if e.get('kind')=='phase' and e.get('phase')=='final.browser.close' and e.get('event')=='start']
        ends=[e for e in events if e.get('kind')=='phase' and e.get('phase')=='final.browser.close' and e.get('event')=='settled']
        if not require(len(starts)==len(ends)==1,'CLEANUP_PHASE_CARDINALITY'): raise ValueError('phase')
        start,end=starts[0],ends[0]; settled=ns(end)
        require(ns(start)<=settled,'CLEANUP_CLOSE_ORDER')
        require(start.get('contextCount')==0 and end.get('contextCount')==0,'CLEANUP_ACTIVE_CONTEXTS',True)
        require(browser_log.get('normalExit') is True,'CLEANUP_NORMAL_BROWSER_EXIT_REQUIRED',True)
        require(browser_log.get('unexpectedFallbackLogLines')==[],'CLEANUP_FORCED_SHUTDOWN',True)
        next_index=end.get('nextSampleIndex')
        if not require(numeric(next_index) and 0<next_index<len(samples),'CLEANUP_SETTLED_SAMPLE_INDEX'): raise ValueError('next-index')
        if not require(next_index<len(samples)-1 and samples[next_index].get('phase')=='interval','CLEANUP_DISTINCT_FIRST_INTERVAL_REQUIRED'): raise ValueError('first')
        result['firstPostCloseSample']=next_index;result['terminalSample']=len(samples)-1
        initial=samples[0].get('processes'); node=samples[0].get('sampler',{}).get('pid')
        if not require(isinstance(initial,list) and type(node) is int and node>1 and len({p.get('pid') for p in initial})==len(initial),'CLEANUP_INITIAL_IDENTITIES'): raise ValueError('initial')
        originals={p.get('pid'):p for p in initial if p.get('pid') in (1,node)}
        if not require(set(originals)=={1,node} and all(valid_process(p) for p in originals.values()) and originals[1]['name']=='docker-init' and originals[node]['name'] in ('node','MainThread') and originals[node]['ppid']==1 and originals[1]['state']!='Z' and originals[node]['state']!='Z','CLEANUP_INITIAL_IDENTITIES'): raise ValueError('initial-identity')
        pid=browser_log.get('browserPid');observed=[]
        for s in samples:
            for p in s.get('processes',[]):
                if p.get('pid')==pid: observed.append(p)
        ids={identity(p) for p in observed if valid_process(p)}
        require(type(pid) is int and pid not in (1,node) and bool(observed) and len(ids)==1 and all(valid_process(p) and p['ppid']==node for p in observed),'CLEANUP_BROWSER_IDENTITY_UNESTABLISHED')
        if len(ids)==1:result['browserIdentity']={'pid':next(iter(ids))[0],'start_ticks':next(iter(ids))[1]}
        by_sample={}
        for event in events:
            if event.get('kind')!='read-bounds':continue
            i=event.get('sample')
            if not require(numeric(i) and i<len(samples),'CLEANUP_BOUND_SAMPLE'):continue
            require(i not in by_sample,'CLEANUP_DUPLICATE_BOUNDS');by_sample[i]=event
        close_index=start.get('nextSampleIndex')
        require(numeric(close_index) and 0<close_index<=next_index,'CLEANUP_START_SAMPLE_INDEX')
        if numeric(close_index):
            require(all(i in by_sample for i in range(close_index,len(samples))),'CLEANUP_CLOSING_BOUND_COVERAGE')
        previous_end=None
        for i,b in sorted(by_sample.items()):
            low,high=ns(b['before']),ns(b['after'])
            require(low<=high and (previous_end is None or previous_end<low),'CLEANUP_SWEEP_SEQUENCE')
            previous_end=high
            require(not (i<next_index and low>settled),'CLEANUP_FIRST_QUALIFYING_SKIPPED')
        for i in range(next_index,len(samples)):
            row=samples[i];b=by_sample.get(i);processes=row.get('processes')
            if not require(b is not None,'CLEANUP_MISSING_CENSUS_BOUNDS'):continue
            if not require(isinstance(processes,list) and bool(processes),'CLEANUP_INCOMPLETE_CENSUS'):continue
            require(all('unavailable' not in p for p in processes),'CLEANUP_UNREADABLE_PROCESS')
            require(all(valid_process(p) for p in processes),'CLEANUP_PROCESS_IDENTITY_FIELDS')
            require(len({p.get('pid') for p in processes})==len(processes),'CLEANUP_DUPLICATE_PID')
            pids={p.get('pid') for p in processes}
            require(pids=={1,node},'CLEANUP_BROWSER_RESIDUE',True)
            for p in processes:
                if p.get('pid') in originals:
                    require(identity(p)==identity(originals[p['pid']]) and p.get('name')==originals[p['pid']]['name'] and p.get('ppid')==originals[p['pid']]['ppid'],'CLEANUP_ORIGINAL_IDENTITY_CHANGED',True)
                    require(p.get('state')!='Z','CLEANUP_INIT_NODE_Z',True)
            low,high=ns(b['before']),ns(b['after'])
            require(settled<low<=high,'CLEANUP_SWEEP_NOT_WHOLE_POST_CLOSE')
            require(b.get('atomicSnapshot') is False and b.get('processReadEncoding')=='[pid,beforeOffsetNs,afterOffsetNs] from before.monoNs','CLEANUP_BOUND_ENCODING')
            reads=b.get('processReads')
            if not require(isinstance(reads,list) and len(reads)==len(processes) and all(isinstance(r,list) and len(r)==3 for r in reads),'CLEANUP_PROCESS_READ_COVERAGE'):continue
            require([r[0] for r in reads]==[p['pid'] for p in processes] and len({r[0] for r in reads})==len(reads),'CLEANUP_PROCESS_READ_COVERAGE')
            for _,a,z in reads:
                valid=isinstance(a,str) and a.isdecimal() and isinstance(z,str) and z.isdecimal()
                require(valid and settled<low<=low+int(a)<=low+int(z)<=high,'CLEANUP_PROCESS_READ_BOUNDS')
            result['checkedSampleIds'].append(i)
    except (KeyError,ValueError,TypeError,IndexError,AttributeError):
        unknown.append('CLEANUP_MALFORMED_OR_MISSING_EVIDENCE')
    result['issues']=list(dict.fromkeys(failures+unknown))
    result['status']='FAIL' if failures else 'NOT_ESTABLISHED' if unknown else 'PASS'
    return result
