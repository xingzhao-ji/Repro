from pathlib import Path
import hashlib,json,datetime
base=Path(__file__).resolve().parent
repo=base.parents[3]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
candidate='0b36b70a53d1eddbfb9c6fe055b8c4f8e0408ffd47910675cce348021e9f42eb'
assert sha(base/'transport.mjs')==candidate
assert (base/'candidate-freeze.json').is_file()
freeze=json.loads((base/'candidate-freeze.json').read_text());assert freeze['candidateSha256']==candidate and freeze['functionalReview']=='CLEAR'
regression=json.loads((base/'regression-receipt.json').read_text());assert regression['candidateSha256']==candidate and regression['groups']==regression['passed']==17 and regression['failed']==0
assert regression['outputSha256']==sha(base/'test-final-candidate.txt')
bindings=json.loads((base/'source-bindings.json').read_text())
for item in bindings['files']+[bindings['baseline'],bindings['candidate'],bindings['callerDiff']]:
 p=repo/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],item['path']
assert not (base/'artifact-manifest.json').exists() and not (base/'final-receipt.json').exists()
manifest=[]
for p in sorted(base.rglob('*')):
 if p.is_dir():continue
 assert not p.is_symlink()
 if p.name in ['artifact-manifest.json','final-receipt.json']:continue
 manifest.append({'path':str(p.relative_to(base)),'bytes':p.stat().st_size,'sha256':sha(p)})
(base/'artifact-manifest.json').write_text(json.dumps({'schemaVersion':1,'files':manifest},indent=2)+'\n')
for item in manifest:
 p=base/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256']
receipt={'schemaVersion':1,'status':'SEALED_OFFLINE_INCREMENTAL_RECEIVER_UNINSTALLED','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateSha256':candidate,'freezeSha256':sha(base/'candidate-freeze.json'),'resultSha256':sha(base/'RESULT.md'),'manifestSha256':sha(base/'artifact-manifest.json'),'artifactFiles':len(manifest),'sourceBindingsReadback':len(bindings['files'])+3,'artifactReadback':'PASS','authorTests':{'groups':17,'passed':17,'failed':0,'outputSha256':sha(base/'test-final-candidate.txt')},'independentFunctionalReview':freeze['functionalReview'],'independentReviewEvidence':freeze['reviewEvidence'],'memoryOutcome':'Not measured by author; independently frozen sibling benchmark owns allocation/RSS evidence','runtimePilotCount':0,'browserStarts':0,'containerStarts':0,'networkActions':0,'installed':False,'gatesChanged':False,'gateMiB':896,'observationLifecycleExtensionAdopted':False,'published':False}
(base/'final-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert json.loads((base/'final-receipt.json').read_text())==receipt
print(json.dumps({'receipt':str(base/'final-receipt.json'),'receiptSha256':sha(base/'final-receipt.json'),'manifestFiles':len(manifest),'candidateSha256':candidate,'readback':'PASS'},indent=2))
