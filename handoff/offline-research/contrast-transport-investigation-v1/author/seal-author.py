from pathlib import Path
import json,hashlib,datetime
base=Path(__file__).resolve().parent
repo=base.parents[3]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
candidate='440dddbb4c7bf6b5102ae3d366316fa9b9a768dbb53bb68c3731c65b06027727'
assert sha(base/'transport.mjs')==candidate
assert 'tests 7' in (base/'test-final.txt').read_text() and 'fail 0' in (base/'test-final.txt').read_text()
for item in json.loads((base/'source-bindings.json').read_text())['files']:
 p=repo/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],item['path']
assert (base/'benchmark-candidate-reconstruction.mjs').read_bytes()==(base.parent/'review/reviewed-first-candidate.mjs').read_bytes()
manifest=[]
for p in sorted(base.rglob('*')):
 if p.is_dir():continue
 assert not p.is_symlink()
 if p.name in ['artifact-manifest.json','final-receipt.json']:continue
 manifest.append({'path':str(p.relative_to(base)),'bytes':p.stat().st_size,'sha256':sha(p)})
(base/'artifact-manifest.json').write_text(json.dumps({'schemaVersion':1,'files':manifest},indent=2)+'\n')
for item in manifest:
 p=base/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256']
receipt={'schemaVersion':1,'status':'SEALED_OFFLINE_TRANSPORT_INVESTIGATION_INCONCLUSIVE_MEMORY','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateSha256':candidate,'resultSha256':sha(base/'RESULT.md'),'manifestSha256':sha(base/'artifact-manifest.json'),'artifactFiles':len(manifest),'sourceBindingsReadback':19,'artifactReadback':'PASS','authorTests':{'groups':7,'passed':7,'failed':0,'outputSha256':sha(base/'test-final.txt')},'independentTestsReported':{'passed':108,'failed':0,'reviewReceipt':'separately produced in sibling review after author freeze'},'benchmarkSourceExecutionAttested':False,'benchmarkResult':'mixed RSS; no consistent memory reduction established','runtimePilotCount':0,'browserStarts':0,'containerStarts':0,'networkActions':0,'installed':False,'gatesChanged':False,'gateMiB':896,'published':False}
(base/'final-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert json.loads((base/'final-receipt.json').read_text())==receipt
print(json.dumps({'receipt':str(base/'final-receipt.json'),'receiptSha256':sha(base/'final-receipt.json'),'manifestFiles':len(manifest),'candidateSha256':candidate,'readback':'PASS'},indent=2))
