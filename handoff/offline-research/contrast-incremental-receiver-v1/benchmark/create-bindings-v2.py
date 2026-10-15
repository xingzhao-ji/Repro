from pathlib import Path
import hashlib,json,sys,datetime
base=Path(__file__).resolve().parent
repo=base.parents[3]
old=repo/'.repro-runs/cloud-continuation/contrast-transport-investigation-v1/author'
author=base.parent/'author'
pilot=repo/'.repro-runs/cloud-continuation/contrast-p57-approved-execution-v1'
artifacts=pilot/'runtime/p390-00-11/jobs/p390-00-11/artifacts/p390-00-11'
module=author/'transport.mjs'
assert len(sys.argv)==3, 'usage: create-bindings.py FROZEN_MODULE_SHA FREEZE_RECEIPT_PATH'
expected_sha,freeze_path=sys.argv[1],Path(sys.argv[2]).resolve()
assert hashlib.sha256(module.read_bytes()).hexdigest()==expected_sha
assert hashlib.sha256((old/'transport.mjs').read_bytes()).hexdigest()=='440dddbb4c7bf6b5102ae3d366316fa9b9a768dbb53bb68c3731c65b06027727'
assert freeze_path.is_file() and freeze_path.is_relative_to(author)
assert not (base/'bindings-v2.json').exists()
rows=sorted(artifacts.glob('node-*.json'));assert len(rows)==12
pw=pilot/'runtime/p390-00-11/input/node_modules/playwright-core'
paths=[old/'transport.mjs',old/'fixture.mjs',module,freeze_path,pw/'lib/coreBundle.js',pw/'package.json',*rows,*sorted(base.glob('*.mjs')),*sorted(base.glob('*.py')),base/'PROTOCOL.md']
# Bind any imported author module even if candidate is split during review.
paths.extend(sorted(author.glob('*.mjs')))
paths=sorted(set(p.resolve() for p in paths))
def binding(p):
 b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
value={'schemaVersion':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'priorModule':str(old/'transport.mjs'),'incrementalModule':str(module),'freezeReceipt':str(freeze_path),'oracleModule':str(base/'oracle.mjs'),'fixtureModule':str(old/'fixture.mjs'),'playwrightBundleSha256':hashlib.sha256((pw/'lib/coreBundle.js').read_bytes()).hexdigest(),'playwrightVersion':json.loads((pw/'package.json').read_text())['version'],'rows':[{'name':p.name,**binding(p)} for p in rows],'files':[binding(p) for p in paths]}
(base/'bindings-v2.json').write_text(json.dumps(value,indent=2)+'\n')
print(json.dumps({'bindingSha256':hashlib.sha256((base/'bindings-v2.json').read_bytes()).hexdigest(),'files':len(paths),'rows':len(rows),'candidateSha256':expected_sha},indent=2))
