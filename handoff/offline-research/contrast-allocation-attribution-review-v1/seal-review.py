from pathlib import Path
import os,json,hashlib,subprocess,datetime
base=Path(__file__).resolve().parent;repo=base.parents[2]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def bind(p):return {'path':str(p.relative_to(repo)),'bytes':p.stat().st_size,'sha256':sha(p)}
def resolve_item(directory,item):
 p=Path(item['path'])
 return p if p.is_absolute() else (repo/p if str(p).startswith('.repro-runs/') else directory/p)
def verify_manifest(directory):
 mpath=directory/'artifact-manifest.json';rpath=directory/'final-receipt.json'
 m=json.loads(mpath.read_text());r=json.loads(rpath.read_text());digest=r.get('manifestSha256') or r.get('manifest',{}).get('sha256')
 assert digest and sha(mpath)==digest,str(mpath)
 expected=set()
 for item in m['files']:
  p=resolve_item(directory,item);assert p.is_relative_to(directory) and not p.is_symlink()
  expected.add(str(p.relative_to(directory)))
  assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],str(p)
 actual=set()
 for p in directory.rglob('*'):
  assert not p.is_symlink(),str(p)
  if p.is_file():actual.add(str(p.relative_to(directory)))
 assert actual-{'artifact-manifest.json','final-receipt.json'}==expected,(str(directory),'inventory')
 return {'path':str(directory.relative_to(repo)),'files':len(expected),'receiptSha256':sha(rpath),'manifestSha256':sha(mpath),'readback':'PASS'}
assert not (base/'artifact-manifest.json').exists() and not (base/'final-receipt.json').exists()
baseline=json.loads((base/'baseline.json').read_text());head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();status=subprocess.check_output(['git','status','--short'],cwd=repo,text=True)
assert head==baseline['head'] and status==baseline['gitStatus']
assert not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True)
for item in baseline['files']:
 p=repo/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],str(p)
prior=verify_manifest(base.parent/'contrast-incremental-receiver-v1')
assert prior['receiptSha256']=='97c10f818109d852804b3ab8ed0ba54d12fb38387fd5ce530f878e5d0eb101c5'
children=[verify_manifest(base/name) for name in ['code-review','independent-review']]
reviewReceipt=json.loads((base/'independent-review/final-receipt.json').read_text())
assert reviewReceipt['planSha256']==sha(base/'ATTRIBUTION-PLAN.md') and reviewReceipt['openReviewFindings']==[]
source=json.loads((base/'code-review/source-bindings.json').read_text())
for item in source['files']:
 p=repo/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],str(p)
independent=json.loads((base/'independent-review/evidence-review.json').read_text())
for item in independent['sourceBindings']:
 p=repo/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],str(p)
extraction=json.loads((base/'existing-evidence-review.json').read_text())
pilot=base.parent/'contrast-p57-approved-execution-v1'; pm=json.loads((pilot/'artifact-manifest.json').read_text());pr=json.loads((pilot/'final-receipt.json').read_text())
assert sha(pilot/'artifact-manifest.json')==pr['manifestSha256']
old_entries={x['path']:x for x in pm['files']}
for item in extraction['bindings']:
 p=repo/item['path']; archived=old_entries[str(p.relative_to(pilot))]
 assert item['sha256']==archived['sha256']==sha(p) and item['bytes']==archived['bytes']==p.stat().st_size
preservation={'status':'PRESERVATION_READBACK_PASS','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'gitStatus':status,'indexClean':True,'baselineFilesVerified':len(baseline['files']),'priorFrozenTask':prior,'childSeals':children,'codeReviewSourceBindings':len(source['files']),'independentReviewSourceBindings':len(independent['sourceBindings']),'archivedPilotDiagnosticsVerifiedAgainstSeal':len(extraction['bindings']),'candidateInstalled':False,'frozenRegression':'107/108 preserved'}
(base/'preservation-readback.json').write_text(json.dumps(preservation,indent=2)+'\n')
summary=json.loads((base/'summary.json').read_text());assert summary['planSha256']==sha(base/'ATTRIBUTION-PLAN.md') and summary['resultSha256']==sha(base/'RESULT.md') and summary['existingEvidenceExtractionSha256']==sha(base/'existing-evidence-review.json')
files=[]
for p in sorted(base.rglob('*')):
 assert not p.is_symlink()
 if p.is_file():files.append({'path':str(p.relative_to(base)),'bytes':p.stat().st_size,'sha256':sha(p)})
manifest={'schemaVersion':1,'scope':'Focused read-only code/measurement review and unapproved future attribution plan. No implementation or experiment.','excludes':['artifact-manifest.json','final-receipt.json'],'files':files,'links':[],'fileCount':len(files),'bytes':sum(x['bytes'] for x in files)}
(base/'artifact-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for item in files:
 p=base/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256']
receipt={'schemaVersion':1,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'SEALED_FOCUSED_REVIEW_NO_CORRECTION_SELECTED_PENDING_ATTRIBUTION_DECISION','commit':head,'manifestSha256':sha(base/'artifact-manifest.json'),'resultSha256':sha(base/'RESULT.md'),'planSha256':sha(base/'ATTRIBUTION-PLAN.md'),'summarySha256':sha(base/'summary.json'),'preservationReadbackSha256':sha(base/'preservation-readback.json'),'files':len(files),'bytes':manifest['bytes'],'readback':'PASS','priorFrozenTask':prior,'childSeals':children,'candidateSha256':summary['candidateSha256'],'candidateInstalled':False,'frozenRegressionPreserved':{'pass':107,'fail':1},'newImplementation':False,'newTests':0,'newBenchmarkWorkers':0,'browserStarts':0,'containerStarts':0,'gateMiB':896,'gateChanges':False,'permissionChanges':False,'published':False,'observationHold':'PENDING_NOT_ADOPTED','decisionPending':summary['decisionPending']}
(base/'final-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');assert json.loads((base/'final-receipt.json').read_text())==receipt
print(json.dumps({'status':receipt['status'],'receiptSha256':sha(base/'final-receipt.json'),'manifestSha256':receipt['manifestSha256'],'planSha256':receipt['planSha256'],'files':len(files),'bytes':manifest['bytes'],'priorFilesVerified':prior['files'],'readback':'PASS'},indent=2))
