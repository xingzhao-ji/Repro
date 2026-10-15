from pathlib import Path
import os,json,hashlib,datetime,subprocess
base=Path(__file__).resolve().parent
repo=base.parents[2]
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
assert not (base/'artifact-manifest.json').exists() and not (base/'final-receipt.json').exists()
preservation=json.loads((base/'preservation-readback.json').read_text())
assert preservation['status']=='PRESERVATION_AND_CHILD_SEALS_READBACK_PASS'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==preservation['head']
assert subprocess.check_output(['git','status','--short'],cwd=repo,text=True)==preservation['gitStatus']
for item in preservation['childSeals']+preservation['oldSealedTrees']:
 assert sha(repo/item['path']/'final-receipt.json')==item['receiptSha256']
 assert sha(repo/item['path']/'artifact-manifest.json')==item['manifestSha256']
summary=json.loads((base/'summary.json').read_text())
for item in summary['evidence']:assert sha(base/item['path'])==item['sha256'],item['path']
excludes={'artifact-manifest.json','final-receipt.json'}
files=[];links=[]
for directory,dirs,names in os.walk(base,followlinks=False):
 for name in dirs+names:
  path=Path(directory)/name;relative=str(path.relative_to(base))
  if path.is_symlink():
   assert path.resolve().is_relative_to(base)
   links.append({'path':relative,'target':os.readlink(path),'confined':True})
  elif path.is_file() and relative not in excludes:
   files.append({'path':relative,'bytes':path.stat().st_size,'sha256':sha(path)})
manifest={'schemaVersion':1,'scope':'Only local offline incremental receiver investigation; all failures and adverse metrics preserved. No runtime installation or pilot authority.','excludes':sorted(excludes),'files':sorted(files,key=lambda x:x['path']),'links':sorted(links,key=lambda x:x['path']),'fileCount':len(files),'bytes':sum(x['bytes'] for x in files)}
(base/'artifact-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for item in manifest['files']:
 p=base/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],item['path']
receipt={'schemaVersion':1,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'SEALED_OFFLINE_INCREMENTAL_RECEIVER_COMPLETE_END_TO_END_MEMORY_REMEDY_NOT_ESTABLISHED','commit':preservation['head'],'candidateSha256':sha(base/'author/transport.mjs'),'manifestSha256':sha(base/'artifact-manifest.json'),'resultSha256':sha(base/'RESULT.md'),'summarySha256':sha(base/'summary.json'),'preservationReadbackSha256':sha(base/'preservation-readback.json'),'files':len(files),'bytes':manifest['bytes'],'links':len(links),'readback':'PASS','childSeals':preservation['childSeals'],'priorSealedTrees':preservation['oldSealedTrees'],'authorTests':{'pass':17,'fail':0},'independentTests':summary['independentTests'],'benchmarkWorkers':12,'benchmarkCaseChecks':156,'prelaunchFailuresPreserved':1,'measuredWorkerFailures':0,'unattemptedMeasuredWorkers':0,'endToEndRSSHigherPairs':2,'endToEndRSSLowerPairs':1,'receiverOnlyRSSLowerPairs':3,'incrementalSlowerTimingPairs':6,'fullIntermediateDecodedGraphRemoved':True,'allocationProfileTaken':False,'endToEndMemoryReductionEstablished':False,'below896MiBEstablished':False,'transportInstalled':False,'observationHold':'PENDING_NOT_ADOPTED','newBrowserStarts':0,'newContainerStarts':0,'gateChanges':False,'permissionsChanged':False,'published':False,'oldPilotRemainsSTOP':True,'recommendation':summary['recommendation']}
(base/'final-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert json.loads((base/'final-receipt.json').read_text())==receipt
print(json.dumps({'status':receipt['status'],'receiptSha256':sha(base/'final-receipt.json'),'manifestSha256':receipt['manifestSha256'],'files':len(files),'bytes':manifest['bytes'],'links':len(links),'readback':'PASS'},indent=2))
