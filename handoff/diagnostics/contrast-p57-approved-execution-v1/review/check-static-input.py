"""Independent static candidate/partition/source continuity checks; no runtime."""
from pathlib import Path
import base64,hashlib,json,re
HERE=Path(__file__).resolve().parent;TASK=HERE.parent;REPO=TASK.parents[2]
IN=TASK/'inputs';BASE=REPO/'.repro-runs/cloud-continuation/contrast-p57-memory-execution-v1/runtime/p390-00-11/input'
checks=[];bindings=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):
 b=p.read_bytes();bindings.append({'path':str(p),'bytes':len(b),'sha256':sha(b)});return b

def check(ok,name):
 checks.append({'name':name,'pass':bool(ok)})
 if not ok:raise AssertionError(name)
def packed(x):return json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()
overlay=json.loads(read(IN/'overlay-manifest.json'));files={r['path']:r for r in overlay['files']}
for r in overlay['files']:
 b=read(Path(r['source']));check(len(b)==r['bytes'] and sha(b)==r['sha256'],'overlay exact '+r['path'])
html=read(IN/'actual/study/P.html');old=read(BASE/'actual/study/P.html')
newstyle=re.findall(rb'<style>(.*?)</style>',html,re.S);oldstyle=re.findall(rb'<style>(.*?)</style>',old,re.S)
check(len(newstyle)==len(oldstyle)==1,'one style each')
rule=b'.reduction-workspace>.panel.trial-inspector{box-shadow:none}'
check(newstyle[0].count(rule)==1 and newstyle[0].replace(rule,b'')==oldstyle[0],'only exact scoped shadow rule')
newscript=re.findall(rb'<script[^>]*>(.*?)</script>',html,re.S);oldscript=re.findall(rb'<script[^>]*>(.*?)</script>',old,re.S)
check(newscript==oldscript and len(newscript)==2,'exact JavaScript and embedded packet unchanged')
newhash=base64.b64encode(hashlib.sha256(newstyle[0]).digest());oldhash=base64.b64encode(hashlib.sha256(oldstyle[0]).digest());scripthash=base64.b64encode(hashlib.sha256(newscript[1]).digest())
check(b"style-src 'sha256-"+newhash+b"'" in html,'candidate CSP style matches')
check(b"script-src 'sha256-"+scripthash+b"'" in html,'candidate CSP script matches')
check(html.replace(rule,b'').replace(b"style-src 'sha256-"+newhash+b"'",b"style-src 'sha256-"+oldhash+b"'")==old,'HTML exact old plus rule and required CSP')
man=json.loads(read(IN/'contrast-p57-approved-batch-inputs.json'));frozen=json.loads(read(BASE/'frozen-v3-inputs.json'));plan=json.loads(read(BASE/'batch-plan.json'))
check(sha(read(BASE/'frozen-v3-inputs.json'))=='9299adf0dcc84668d4c5410ae98be6929728b120c918736507f1467e9d998d37','canonical full57 hash')
check(man['states']==frozen['states'],'all canonical states/descriptors unchanged')
check(man['sourceFiles'][1:]==frozen['sourceFiles'][1:],'packet and other source bindings unchanged')
check(man['paintScope']['surface']==frozen['paintScope']['surface'],'selected surface profile unchanged')
check(man['paintScope']['stylesSha256']==sha(packed([newstyle[0].decode()]))==overlay['candidateStylesSha256'],'candidate style-array binding')
for k,v in frozen.items():
 if k not in ['revision','probeSources','sourceFiles','paintScope']:check(man[k]==v,'frozen manifest field '+k)
for r in man['sourceFiles']+man['probeSources']+man['batchInputFiles']:
 p=Path(files[r['path']]['source']) if r['path'] in files else BASE/r['path'];b=read(p);check(sha(b)==r['sha256'] and len(b)==r['bytes'],'consumed source '+r['path'])
order=['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32']
check(overlay['executionOrder']==plan['executionOrder']==order,'exact approved five-job order')
check([len(s['nodes']) for s in man['states']]==[24,33],'24+33 occurrences')
actual=[(b['stateId'],n['sourceAuditNodeIndex'],n['nodeSha256']) for b in plan['batches'] for n in b['nodes']]
wanted=[(s['id'],n['sourceAuditNodeIndex'],sha(packed(n))) for s in man['states'] for n in s['nodes']]
check(actual==wanted and len(actual)==len(set(actual))==57,'exact once 57 union and individual hashes')
oldcaller=read(REPO/'.repro-runs/cloud-continuation/lifecycle-workload-diagnostic-v1/runtime/input/verification-inputs/contrast-p57-workload-lifecycle-probe.mjs').decode();caller=read(IN/'verification-inputs/contrast-p57-approved-batch-probe.mjs').decode()
check(caller[caller.index('export async function sampleText'):caller.index('// New diagnostics only.')]==oldcaller[oldcaller.index('export async function sampleText'):oldcaller.index('// New diagnostics only.')],'sampler and full helper/control function bodies unchanged')
check(caller[caller.index('    // These independent synthetic controls'):caller.index("    result.states=[];")]==oldcaller[oldcaller.index('    // These independent synthetic controls'):oldcaller.index("    result.states=[];")],'all 50 runtime control bodies unchanged')
for line in oldcaller.splitlines():
 if 'observeClose(' in line and 'function observeClose' not in line:check(line in caller,'close await unchanged '+line.strip()[:90])
probe=read(IN/'verification-inputs/resource-probe.mjs').decode();oldprobe=read(REPO/'.repro-runs/cloud-continuation/lifecycle-workload-diagnostic-v1/runtime/input/verification-inputs/resource-probe.mjs').decode()
check("const timer = setInterval(() => sample('interval'), 100);" in probe and "sample('exit');" in probe,'100ms and terminal schedule unchanged')
check(probe[probe.index('  function processes()'):probe.index('  function sample(')]==oldprobe[oldprobe.index('  function processes()'):oldprobe.index('  function sample(')],'exact original raw process read/parser')
check(all(x not in probe for x in ['setTimeout(', 'sleep(', 'kill(']),'no new sampler sleep kill or timeout')
for name in ['batch-partition.mjs','evidence-store.mjs','selection-state.mjs']:
 check(read(IN/'verification-inputs'/name)==read(BASE/'verification-inputs'/name),'unchanged overlay copy '+name)
result={'status':'PASS_STATIC_ONLY','checks':checks,'bindings':bindings,'limitations':['No browser rendering or paint acceptance from this static review.','Existing50 controls preserved; no new exact candidate/reinstated-inspector browser pair.','Original frozen plan proposal-status retained as provenance; task AUTHORIZATION governs execution.']}
print(json.dumps(result,indent=2))
