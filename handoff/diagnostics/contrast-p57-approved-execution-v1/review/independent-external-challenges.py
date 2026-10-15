"""Independent pure parser, log, time and actual-partition challenge cases."""
from pathlib import Path
import sys,importlib.util,hashlib,json
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;T=HERE.parent;V=T/'validator';sys.path.insert(0,str(V))
spec=importlib.util.spec_from_file_location('external',V/'validate-approved-job.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name)
base={'job':'p390-00-11','deadline_seconds':120,'combined_log_limit_bytes':4194304,'deadline_expired':False,'log_limit_exceeded':False,'errors':[],'elapsed_seconds':90}
for value,expected in [(90,True),(90.000001,False),(89.999,True),(True,False),(-1,False),(float('nan'),False),(float('inf'),False),('89',False)]:check('driver '+repr(value),v.driver_receipt_valid({**base,'elapsed_seconds':value},'p390-00-11') is expected)
for key,value in [('deadline_seconds',121),('deadline_expired',True),('log_limit_exceeded',True),('errors',['error']),('attach_client_terminated',True)]:check('driver rejects '+key,not v.driver_receipt_valid({**base,key:value},'p390-00-11'))
log=['pw:browser <launching> local','pw:browser <launched> pid=13','pw:browser [pid=13] <gracefully close start>','pw:browser [pid=13] <process did exit: exitCode=0, signal=null>','pw:browser [pid=13] <gracefully close end>']
def normal(lines):
 v.issues.clear();r=v.normal_browser_log(('\n'.join(lines)+'\n').encode());return r['normalExit'],list(v.issues)
check('normal unique browser exit',normal(log)==(True,[]))
for name,lines in [('duplicate-exit',log+[log[3]]),('wrong-pid',log[:3]+[log[3].replace('pid=13','pid=14')]+log[4:]),('kill',log+['pw:browser [pid=13] <kill>']),('forced',log+['pw:browser [pid=13] <forcefully close>']),('signal',log[:3]+[log[3].replace('signal=null','signal=SIGKILL')]+log[4:]),('launch-again',log+[log[1]])]:
 try:ok,issues=normal(lines);check('reject log '+name,not ok and bool(issues))
 except (ValueError,KeyError,IndexError):checks.append('reject malformed log '+name)
for raw in [b'{"a":1,"a":2}',b'{"a":NaN}',b'{"a":Infinity}']:
 try:v.parse(raw)
 except ValueError:checks.append('strict JSON '+raw.decode())
 else:raise AssertionError('strict JSON rejected')
contracts=json.loads((T/'inputs/expected-bindings.json').read_text());specs=[('p390-00-11','P-reflow-390',12,[0]),('p320-00-10','P-reflow-320',11,[0,6]),('p390-12-23','P-reflow-390',12,[]),('p320-11-21','P-reflow-320',11,[]),('p320-22-32','P-reflow-320',11,[])]
for job,state,count,shots in specs:
 actual=v.expected_artifacts(job,contracts['jobs'][job]);want={job+'/'+state+'-node-'+str(i)+'.png' for i in shots};got={x for x in actual if x.endswith('.png') and '/screenshot-control-' not in x}
 check('exact product screenshots '+job,got==want);check('all exact artifact count '+job,len(actual)==10+count+len(shots));check('all node artifacts '+job,{job+'/node-'+job+'-'+str(i).zfill(3)+'.json' for i in range(count)}<=actual)
print(json.dumps({'status':'PASS_SYNTHETIC_ONLY','count':len(checks),'checks':checks,'validatorSha256':hashlib.sha256((V/'validate-approved-job.py').read_bytes()).hexdigest()},indent=2))
