"""Independent synthetic contract challenges; no browser, Docker or historical verdicts."""
from pathlib import Path
import copy, importlib.util, json, sys, hashlib
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
TARGET=HERE.parent/'validator'/'cleanup_gate.py'

def proc(pid,ticks,name,parent,state='S'):
    return {'pid':pid,'start_ticks':str(ticks),'name':name,'ppid':parent,'state':state,'threads':1}
def window(index,start,pids):
    return {'kind':'read-bounds','sample':index,'before':{'monoNs':str(start)},'after':{'monoNs':str(start+20)},'atomicSnapshot':False,'processReadEncoding':'[pid,beforeOffsetNs,afterOffsetNs] from before.monoNs','processReads':[[pid,str(2+i*3),str(3+i*3)] for i,pid in enumerate(pids)]}
def fixture():
    init=proc(1,101,'docker-init',0);node=proc(7,102,'node',1);browser=proc(13,103,'chrome',7)
    lists=[[init,node],[init,node,browser],[init,node],[init,node],[init,node]]
    samples=[]
    for i,rows in enumerate(lists):
        samples.append({'sample':i,'phase':'start' if i==0 else 'exit' if i==4 else 'interval','processes':copy.deepcopy(rows),'process_count':len(rows),'zombie_count':0,'visible_threads':len(rows)})
    samples[0]['sampler']={'pid':7,'ppid':1};samples[0]['runtime_init']={'pid':1,'name':'docker-init'}
    events=[window(0,10,[1,7]),window(1,50,[1,7,13]),{'kind':'phase','phase':'final.browser.close','event':'start','monoNs':'80','contextCount':0,'nextSampleIndex':2},{'kind':'phase','phase':'final.browser.close','event':'settled','monoNs':'90','contextCount':0,'nextSampleIndex':2},window(2,100,[1,7]),window(3,140,[1,7]),window(4,180,[1,7])]
    return samples,events,{'browserPid':13,'normalExit':True,'unexpectedFallbackLogLines':[]}

cases=[]
def case(name,expected,mutate=lambda s,e,l:None):cases.append((name,expected,mutate))
case('clean_distinct_first_and_terminal','PASS')
case('preclose_z_preserved','PASS',lambda s,e,l:(s[1]['processes'][2].update(state='Z'),s[1].update(zombie_count=1)))
case('initial_node_identity_missing','NOT_ESTABLISHED',lambda s,e,l:s[0]['processes'][1].pop('start_ticks'))
case('initial_init_identity_missing','NOT_ESTABLISHED',lambda s,e,l:s[0]['processes'][0].pop('start_ticks'))
case('incomplete_first_with_later_clean','NOT_ESTABLISHED',lambda s,e,l:s[2]['processes'][1].update(unavailable='EACCES'))
case('missing_first_bounds_with_later_clean','NOT_ESTABLISHED',lambda s,e,l:e.pop(4))
case('missing_first_list_with_later_clean','NOT_ESTABLISHED',lambda s,e,l:s[2].pop('processes'))
case('later_compressed_list_missing','NOT_ESTABLISHED',lambda s,e,l:s[3].pop('processes'))
case('later_bounds_missing','NOT_ESTABLISHED',lambda s,e,l:e.pop(5))
case('terminal_only_anchor','NOT_ESTABLISHED',lambda s,e,l:e[3].update(nextSampleIndex=4))
case('duplicate_bound_same_sample','NOT_ESTABLISHED',lambda s,e,l:e.append(copy.deepcopy(e[4])))
case('initial_node_pid_reused_after_close','FAIL',lambda s,e,l:s[2]['processes'][1].update(start_ticks='999'))
case('first_init_z','FAIL',lambda s,e,l:(s[2]['processes'][0].update(state='Z'),s[2].update(zombie_count=1)))
case('later_interval_live_residue','FAIL',lambda s,e,l:(s[3]['processes'].append(proc(99,999,'chrome',7)),e[5]['processReads'].append([99,'10','11']),s[3].update(process_count=3,visible_threads=3)))
case('terminal_z_residue','FAIL',lambda s,e,l:(s[4]['processes'].append(proc(99,999,'chrome',7,'Z')),e[6]['processReads'].append([99,'10','11']),s[4].update(process_count=3,visible_threads=3,zombie_count=1)))
case('browser_exit_missing','FAIL',lambda s,e,l:l.update(normalExit=False))
case('forced_fallback_even_normal_exit','FAIL',lambda s,e,l:l.update(unexpectedFallbackLogLines=[1]))
case('browser_identity_unseen','NOT_ESTABLISHED',lambda s,e,l:l.update(browserPid=999))
case('browser_identity_is_node','NOT_ESTABLISHED',lambda s,e,l:l.update(browserPid=7))
case('first_sweep_before_close','NOT_ESTABLISHED',lambda s,e,l:e[4]['before'].update(monoNs='89'))
case('terminal_window_before_settlement','NOT_ESTABLISHED',lambda s,e,l:(e[6]['before'].update(monoNs='85'),e[6]['after'].update(monoNs='89')))
case('read_window_outside_sweep','NOT_ESTABLISHED',lambda s,e,l:e[4]['processReads'].__setitem__(0,[1,'1','21']))
case('duplicate_read_pid','NOT_ESTABLISHED',lambda s,e,l:e[4]['processReads'].append([1,'10','11']))
case('census_claim_atomic','NOT_ESTABLISHED',lambda s,e,l:e[4].update(atomicSnapshot=True))
case('active_context_at_start','FAIL',lambda s,e,l:e[2].update(contextCount=1))
case('active_context_at_settlement','FAIL',lambda s,e,l:e[3].update(contextCount=1))
case('skip_first_complete_census_by_advanced_anchor','NOT_ESTABLISHED',lambda s,e,l:e[3].update(nextSampleIndex=3))
case('postclose_sweeps_reverse_temporal_order','NOT_ESTABLISHED',lambda s,e,l:(e[5]['before'].update(monoNs='91'),e[5]['after'].update(monoNs='111')))
case('bad_sample_index_bool','NOT_ESTABLISHED',lambda s,e,l:e[3].update(nextSampleIndex=True))
case('bad_pid_bool','NOT_ESTABLISHED',lambda s,e,l:s[2]['processes'][0].update(pid=True))
case('process_state_unknown','NOT_ESTABLISHED',lambda s,e,l:s[2]['processes'][0].update(state='?'))
case('unknown_process_with_valid_pid','NOT_ESTABLISHED',lambda s,e,l:s[2]['processes'][0].update(unaccounted=True))

if __name__=='__main__':
    spec=importlib.util.spec_from_file_location('reviewed_cleanup_gate',TARGET);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    results=[]
    for name,expected,mutate in cases:
        s,e,l=fixture();mutate(s,e,l)
        try:
            actual=mod.completed_cleanup(s,e,l)
            passed=actual.get('status')==expected
            if name=='preclose_z_preserved':passed=passed and actual.get('retainedZSampleIds')==[1] and actual.get('continuousZombieAbsenceClaimed') is False
            results.append({'name':name,'expected':expected,'passed':passed,'actual':actual})
        except Exception as ex:results.append({'name':name,'expected':expected,'passed':False,'exception':type(ex).__name__,'message':str(ex)})
    result={'scope':'independent synthetic challenges only; no runtime/historical reclassification','target':str(TARGET),'targetSha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'count':len(results),'passed':sum(r['passed'] for r in results),'results':results}
    print(json.dumps(result,indent=2));sys.exit(0 if all(r['passed'] for r in results) else 1)
