from pathlib import Path
import os,json,hashlib,subprocess,datetime
root=Path(__file__).resolve().parents[3]
base=Path(__file__).resolve().parent

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def verify_tree(path):
    manifest=path/'artifact-manifest.json'; receipt=path/'final-receipt.json'
    m=json.loads(manifest.read_text()); r=json.loads(receipt.read_text())
    assert digest(manifest)==r['manifestSha256'], str(manifest)
    expected={x['path'] for x in m['files']}
    actual=set(); links={}
    for directory,dirs,files in os.walk(path,followlinks=False):
        for name in dirs+files:
            p=Path(directory)/name
            if p.is_symlink(): links[str(p.relative_to(path))]=os.readlink(p)
            elif p.is_file(): actual.add(str(p.relative_to(path)))
    assert actual-{'artifact-manifest.json','final-receipt.json'}==expected, (str(path),'file inventory')
    assert links=={x['path']:x['target'] for x in m.get('links',[])}, (str(path),'link inventory')
    for item in m['files']:
        p=path/item['path']
        assert p.is_relative_to(path) and not p.is_symlink()
        assert p.stat().st_size==item['bytes'] and digest(p)==item['sha256'], str(p)
    for rel in links:
        assert (path/rel).resolve().is_relative_to(path.resolve()), rel
    return {'path':str(path.relative_to(root)),'receiptSha256':digest(receipt),'manifestSha256':digest(manifest),'files':len(expected),'bytes':sum(x['bytes'] for x in m['files']),'links':len(links),'readback':'PASS'}

baseline=json.loads((base/'root-baseline.json').read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
status=subprocess.check_output(['git','status','--short'],cwd=root,text=True)
assert head==baseline['head'] and status==baseline['gitStatus']
assert not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=root,text=True)
for item in baseline['preservedWorktreeFiles']:
    assert digest(root/item['path'])==item['sha256'], item['path']
old=[]
for name,prefix in [('contrast-p57-approved-execution-v1','pilot'),('contrast-transport-investigation-v1','prior')]:
    result=verify_tree(base.parent/name)
    assert result['receiptSha256']==baseline[prefix+'TaskReceiptSha256']
    assert result['manifestSha256']==baseline[prefix+'TaskManifestSha256']
    old.append(result)
children=[verify_tree(base/name) for name in ['author','benchmark','review']]
source=json.loads((base/'author/source-bindings.json').read_text())
for item in [source['baseline'],source['candidate'],source['callerDiff'],*source['files']]:
    p=root/item['path'];assert p.stat().st_size==item['bytes'] and digest(p)==item['sha256'],str(p)
result={'status':'PRESERVATION_AND_CHILD_SEALS_READBACK_PASS','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'gitStatus':status,'indexClean':True,'unrelatedWorktreeFilesVerified':len(baseline['preservedWorktreeFiles']),'oldSealedTrees':old,'childSeals':children,'authorSourceBindingsVerified':len(source['files'])+3,'runtimeInstalled':False,'observationHold':'PENDING_NOT_ADOPTED','gateBytes':baseline['memoryGateBytes']}
(base/'preservation-readback.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
