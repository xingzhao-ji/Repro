"""Offline synthetic challenges: these are not runtime observations."""
import copy, unittest
from cleanup_gate import completed_cleanup

def stamp(n): return {'monoNs': str(n)}
def process(pid,ticks,name='node',ppid=1,state='S'):
 return dict(pid=pid,start_ticks=str(ticks),name=name,ppid=ppid,state=state,threads=1)
def bounds(i,lo,hi,pids):
 return dict(kind='read-bounds',sample=i,before=stamp(lo),after=stamp(hi),atomicSnapshot=False,processReadEncoding='[pid,beforeOffsetNs,afterOffsetNs] from before.monoNs',processReads=[[p,'1','2'] for p in pids])
def fixture():
 init=process(1,10,'docker-init',0); node=process(6,20); browser=process(12,30,'chrome',6)
 lists=[[init,node],[init,node,browser],[init,node],[init,node]]
 samples=[dict(sample=i,phase='start' if i==0 else 'exit' if i==3 else 'interval',processes=copy.deepcopy(v),process_count=len(v),zombie_count=0,visible_threads=len(v)) for i,v in enumerate(lists)]
 samples[0]['sampler']={'pid':6,'ppid':1};samples[0]['runtime_init']={'pid':1,'name':'docker-init'}
 events=[bounds(0,1,5,[1,6]),bounds(1,50,55,[1,6,12]),dict(kind='phase',phase='final.browser.close',event='start',monoNs='60',contextCount=0,nextSampleIndex=2),dict(kind='phase',phase='final.browser.close',event='settled',monoNs='70',contextCount=0,nextSampleIndex=2),bounds(2,80,85,[1,6]),bounds(3,90,95,[1,6])]
 return samples,events,{'browserPid':12,'normalExit':True,'unexpectedFallbackLogLines':[]}
class Challenges(unittest.TestCase):
 def check(self,edit=None,verdict='PASS',reason=None):
  args=fixture()
  if edit: edit(*args)
  result=completed_cleanup(*args)
  self.assertEqual(result['status'],verdict,result)
  if reason: self.assertIn(reason,result['issues'])
  return result
 def test_positive(self): self.check()
 def test_preclose_z_retained(self):
  def edit(s,e,l): s[1]['processes'][2]['state']='Z';s[1]['zombie_count']=1
  r=self.check(edit);self.assertEqual(r['retainedZSampleIds'],[1]);self.assertFalse(r['continuousZombieAbsenceClaimed'])
 def test_residue_first_even_later_clean(self):
  def edit(s,e,l): s[2]['processes'].append(process(99,99));e[-2]['processReads'].append([99,'1','2'])
  self.check(edit,'FAIL','CLEANUP_BROWSER_RESIDUE')
 def test_later_interval_residue(self):
  def edit(s,e,l):
   s.insert(3,copy.deepcopy(s[2]));s[-1]['sample']=4;s[3]['sample']=3;s[3]['processes'].append(process(99,99));e.insert(-1,bounds(3,86,89,[1,6,99]));e[-1]['sample']=4
  self.check(edit,'FAIL','CLEANUP_BROWSER_RESIDUE')
 def test_terminal_residue(self):
  def edit(s,e,l): s[-1]['processes'].append(process(99,99));e[-1]['processReads'].append([99,'1','2'])
  self.check(edit,'FAIL','CLEANUP_BROWSER_RESIDUE')
 def test_first_missing_bounds_does_not_skip(self): self.check(lambda s,e,l:e.pop(-2),'NOT_ESTABLISHED','CLEANUP_MISSING_CENSUS_BOUNDS')
 def test_first_missing_processes_does_not_skip(self): self.check(lambda s,e,l:s[2].pop('processes'),'NOT_ESTABLISHED','CLEANUP_INCOMPLETE_CENSUS')
 def test_first_unreadable(self): self.check(lambda s,e,l:s[2]['processes'][1].update(unavailable='ENOENT'),'NOT_ESTABLISHED','CLEANUP_UNREADABLE_PROCESS')
 def test_no_nonterminal(self): self.check(lambda s,e,l:e[-3].update(nextSampleIndex=3),'NOT_ESTABLISHED','CLEANUP_DISTINCT_FIRST_INTERVAL_REQUIRED')
 def test_no_settlement_marker(self): self.check(lambda s,e,l:e.pop(3),'NOT_ESTABLISHED','CLEANUP_PHASE_CARDINALITY')
 def test_missing_next_index(self): self.check(lambda s,e,l:e[3].pop('nextSampleIndex'),'NOT_ESTABLISHED','CLEANUP_SETTLED_SAMPLE_INDEX')
 def test_first_sweep_straddles(self): self.check(lambda s,e,l:e[-2].update(before=stamp(69)),'NOT_ESTABLISHED','CLEANUP_SWEEP_NOT_WHOLE_POST_CLOSE')
 def test_read_precedes_settlement(self): self.check(lambda s,e,l:e[-2]['processReads'].__setitem__(0,[1,'-20','2']),'NOT_ESTABLISHED','CLEANUP_PROCESS_READ_BOUNDS')
 def test_duplicate_read(self): self.check(lambda s,e,l:e[-2]['processReads'].append([1,'1','2']),'NOT_ESTABLISHED','CLEANUP_PROCESS_READ_COVERAGE')
 def test_missing_read(self): self.check(lambda s,e,l:e[-2]['processReads'].pop(),'NOT_ESTABLISHED','CLEANUP_PROCESS_READ_COVERAGE')
 def test_duplicate_process(self): self.check(lambda s,e,l:s[2]['processes'].append(copy.deepcopy(s[2]['processes'][0])),'NOT_ESTABLISHED','CLEANUP_DUPLICATE_PID')
 def test_pid_reuse(self): self.check(lambda s,e,l:s[2]['processes'][0].update(start_ticks='999'),'FAIL','CLEANUP_ORIGINAL_IDENTITY_CHANGED')
 def test_init_z(self): self.check(lambda s,e,l:s[2]['processes'][0].update(state='Z'),'FAIL','CLEANUP_INIT_NODE_Z')
 def test_node_active_context(self): self.check(lambda s,e,l:e[3].update(contextCount=1),'FAIL','CLEANUP_ACTIVE_CONTEXTS')
 def test_forced_close(self): self.check(lambda s,e,l:l.update(unexpectedFallbackLogLines=[7]),'FAIL','CLEANUP_FORCED_SHUTDOWN')
 def test_abnormal_exit(self): self.check(lambda s,e,l:l.update(normalExit=False),'FAIL','CLEANUP_NORMAL_BROWSER_EXIT_REQUIRED')
 def test_browser_pid_never_seen(self): self.check(lambda s,e,l:l.update(browserPid=99),'NOT_ESTABLISHED','CLEANUP_BROWSER_IDENTITY_UNESTABLISHED')
 def test_browser_reused_identity(self):
  def edit(s,e,l): s[0]['processes'].append(process(12,90,'chrome',6));e[0]['processReads'].append([12,'1','2'])
  self.check(edit,'NOT_ESTABLISHED','CLEANUP_BROWSER_IDENTITY_UNESTABLISHED')
 def test_node_identity_must_originate_at_start(self): self.check(lambda s,e,l:s[0]['processes'].pop(),'NOT_ESTABLISHED','CLEANUP_INITIAL_IDENTITIES')
 def test_duplicate_bound(self): self.check(lambda s,e,l:e.append(copy.deepcopy(e[-2])),'NOT_ESTABLISHED','CLEANUP_DUPLICATE_BOUNDS')
 def test_outoforder_sequence(self): self.check(lambda s,e,l:s[2].update(sample=8),'NOT_ESTABLISHED','CLEANUP_SAMPLE_SEQUENCE')
 def test_invalid_process_state(self): self.check(lambda s,e,l:s[2]['processes'][0].update(state='?'),'NOT_ESTABLISHED','CLEANUP_PROCESS_IDENTITY_FIELDS')
 def test_unknown_process_field(self): self.check(lambda s,e,l:s[2]['processes'][0].update(unknown=True),'NOT_ESTABLISHED','CLEANUP_PROCESS_IDENTITY_FIELDS')
 def test_late_window_reversed(self): self.check(lambda s,e,l:e[-1].update(before=stamp(100)),'NOT_ESTABLISHED','CLEANUP_SWEEP_NOT_WHOLE_POST_CLOSE')
if __name__=='__main__':unittest.main(verbosity=2)
