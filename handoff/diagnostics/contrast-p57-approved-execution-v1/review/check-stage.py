"""Independent read-only binding review of one prepared stage."""
from pathlib import Path
import argparse,hashlib,json,os,stat
TASK=Path(__file__).resolve().parent.parent;BASE=TASK.parent/'contrast-p57-memory-execution-v1/runtime/p390-00-11'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_bytes())
def ident(e):return ('link',e['target']) if e['type']=='symlink' else ('file',e['bytes'],e['sha256'],e['mode'])
a=argparse.ArgumentParser();a.add_argument('--job',required=True);job=a.parse_args().job;R=TASK/'runtime'/job
plan=read(R/'plan.json');prep=read(R/'preparation-receipt.json');man=read(R/'input-manifest.json');old=read(BASE/'input-manifest.json');overlay=read(TASK/'inputs/overlay-manifest.json');checks=[]
def check(ok,what):
 checks.append(what)
 if not ok:raise AssertionError(what)
for n,v in prep['bindings'].items():check(sha(R/n)==v['sha256'] and (R/n).stat().st_size==v['bytes'],'prep binding '+n)
check(sha(R/'driver.py')==plan['driver_sha256'],'plan driver binding');driver=(R/'driver.py').read_bytes();prior=(BASE/'driver.py').read_bytes();check(driver==prior.replace(b'org.repro.task=contrast-p57-memory-execution-v1',b'org.repro.task=contrast-p57-approved-execution-v1'),'driver only labels changed')
check(sha(TASK/'prepare-runtime.py')==prep['staging_script_sha256']==plan['staging_script_sha256'],'stage script frozen')
for n in ['authorization','independent_contract','overlay_manifest']:check(sha(Path(plan[n]))==plan[n+'_sha256'],'plan '+n+' hash')
check(plan['jobs']==[{'id':job,'command':overlay['commands'][job],'env':['UV_THREADPOOL_SIZE=1']}],'exact one command')
check(plan['deadline_seconds']==120 and plan['limits']=={'tasks':128,'memory_bytes':1073741824,'cpu_count':2,'outer_deadline_seconds':120,'combined_log_limit_bytes':4194304,'shm_bytes':268435456,'tmpfs_bytes':268435456},'approved hard resource limits')
check(plan['internal_bounds']['stop_after_elapsed_ms']==90000 and plan['internal_bounds']['sample_interval_ms']==100 and plan['interpretive_thresholds']['driver_elapsed_seconds']==90 and plan['interpretive_thresholds']['kernel_peak_bytes']==939524096,'approved continuation/internal/sampling')
check(plan['image_id']=='sha256:847f71bbb3f17fc1032d50d75bf6fb3fdcf188b16dff81f24667fe9ae9409e01' and plan['image_digest']=='sha256:bc72a8df40831ded821e3cbc79c318c21b44d6e51dff9fd89ace7a8249c5b462','approved image')
check(sha(Path(plan['profile']))==plan['profile_sha256']=='f590f8ce5e847b35c95ed525a0a24c2e290472732c7c86f307e8496d7b47e33c','approved profile')
check(plan['boundary']==read(TASK.parent/'lifecycle-workload-diagnostic-v1/runtime/plan.json')['boundary'],'approved boundary unchanged')
actual={e['path']:e for e in man['entries']};original={e['path']:e for e in old['entries']};over={e['path']:e for e in overlay['files']}
check(len(actual)==len(man['entries']),'unique stage entries')
for rel,e in actual.items():
 p=R/'input'/rel;st=p.lstat();check(st.st_uid==st.st_gid==1000,'owner '+rel)
 if e['type']=='symlink':check(p.is_symlink() and os.readlink(p)==e['target'] and not Path(e['target']).is_absolute() and p.resolve().is_relative_to((R/'input').resolve()) and p.resolve().is_file(),'link '+rel)
 else:check(not p.is_symlink() and p.is_file() and st.st_size==e['bytes'] and sha(p)==e['sha256'] and stat.S_IMODE(st.st_mode)==e['mode'],'file '+rel)
for e in man['directories']:
 p=R/'input'/e['path'];st=p.lstat();check(p.is_dir() and not p.is_symlink() and st.st_uid==st.st_gid==1000 and stat.S_IMODE(st.st_mode)==e['mode']==0o700,'directory '+e['path'])
changed=sorted(k for k in original if ident(original[k])!=ident(actual[k]));added=sorted(set(actual)-set(original))
check(changed==['actual/study/P.html','verification-inputs/resource-probe.mjs'],'exact two changed baseline files')
check(added==['contrast-p57-approved-batch-inputs.json','verification-inputs/candidate-binding.mjs','verification-inputs/contrast-p57-approved-batch-probe.mjs','verification-inputs/lifecycle-diagnostics.mjs'],'exact four added files')
check(set(original)<=set(actual),'no baseline removals')
for rel,e in over.items():check(actual[rel]['sha256']==e['sha256'] and actual[rel]['bytes']==e['bytes'],'stage equals reviewed overlay '+rel)
check(not list((R/'input/.repro-runs').iterdir()),'clean input evidence mount point')
result={'status':'PASS_PREPARED_STAGE_ONLY','job':job,'nonce':plan['nonce'],'checks':len(checks),'regularFiles':sum(e['type']=='file' for e in actual.values()),'links':sum(e['type']=='symlink' for e in actual.values()),'inputBytes':sum(e.get('bytes',0) for e in actual.values()),'changed':changed,'added':added,'bindings':{str(p.relative_to(TASK)):sha(p) for p in [R/'plan.json',R/'driver.py',R/'input-manifest.json',R/'preparation-receipt.json',TASK/'prepare-runtime.py',TASK/'run-approved-operation.py',TASK/'inputs/overlay-manifest.json',TASK/'review/EXECUTABLE-CONTRACT.md']},'limitations':['No runtime or actual container inspect performed by this reviewer.','Final independent validator freeze and GO bindings are still required.']}
print(json.dumps(result,indent=2))
