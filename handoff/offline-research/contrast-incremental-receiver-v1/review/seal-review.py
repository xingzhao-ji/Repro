from pathlib import Path
import json, hashlib, datetime

base=Path(__file__).resolve().parent
task=base.parent
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        while chunk:=stream.read(1048576): h.update(chunk)
    return h.hexdigest()

assert not (base/'artifact-manifest.json').exists()
assert not (base/'final-receipt.json').exists()
candidate='0b36b70a53d1eddbfb9c6fe055b8c4f8e0408ffd47910675cce348021e9f42eb'
assert digest(task/'author/transport.mjs')==candidate
clearance=json.loads((base/'functional-clearance.json').read_text())
assert clearance['candidateSha256']==candidate and clearance['openFindings']==[]
benchmark=json.loads((base/'benchmark-result-review.json').read_text())
assert benchmark['workers']==12 and benchmark['cases']==156
assert benchmark['candidateSha256']==candidate
for name in ['author','benchmark']:
    record=json.loads((base/(name+'-seal-readback.json')).read_text())
    assert record['receiptSha256']==digest(task/name/'final-receipt.json')
    assert record['manifestSha256']==digest(task/name/'artifact-manifest.json')
    for entry in record['files']:
        path=task/name/entry['path']
        assert path.stat().st_size==entry['bytes'] and digest(path)==entry['sha256']
files=[]
for path in sorted(base.rglob('*')):
    assert not path.is_symlink()
    if path.is_file():
        files.append({'path':str(path.relative_to(base)),'bytes':path.stat().st_size,'sha256':digest(path)})
manifest={'schemaVersion':1,'scope':'independent offline incremental receiver review','files':files}
(base/'artifact-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for entry in files:
    path=base/entry['path']
    assert path.stat().st_size==entry['bytes'] and digest(path)==entry['sha256']
receipt={
    'schemaVersion':1,
    'status':'SEALED_OFFLINE_REVIEW_CLEAR_MEMORY_REMEDY_UNESTABLISHED',
    'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'candidateSha256':candidate,
    'resultSha256':digest(base/'REVIEW.md'),
    'manifestSha256':digest(base/'artifact-manifest.json'),
    'functionalClearanceSha256':digest(base/'functional-clearance.json'),
    'benchmarkReviewSha256':digest(base/'benchmark-result-review.json'),
    'authorReceiptSha256':digest(task/'author/final-receipt.json'),
    'benchmarkReceiptSha256':digest(task/'benchmark/final-receipt.json'),
    'artifactFiles':len(files),
    'artifactReadback':'PASS',
    'authorFilesReadback':19,
    'benchmarkFilesReadback':56,
    'frozenRegression':{'pass':107,'fail':1,'documentedDifference':'earlier invalid-stream BAD_JSON rejection'},
    'explicitlyAdjustedRegression':{'pass':108,'fail':0},
    'independentStreaming':{'pass':86,'fail':0,'wireMutations':1728},
    'instrumentedCleanup':{'pass':13,'fail':0},
    'independentlyReviewedWorkers':12,
    'independentlyReviewedCases':156,
    'openFunctionalFindings':[],
    'endToEndRSSHigherPairs':2,
    'endToEndRSSLowerPairs':1,
    'receiverOnlyRSSLowerPairs':3,
    'incrementalSlowerTimingPairs':6,
    'gateMiB':896,
    'gateComplianceEstablished':False,
    'candidateInstalled':False,
    'browserOrContainerStarts':0,
    'observationLifecycleExtensionAdopted':False,
    'published':False,
    'permissionChanged':False,
    'recommendation':'Keep uninstalled research artifact; isolated decoder savings do not demonstrate a complete-transfer memory remedy.'
}
(base/'final-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert json.loads((base/'final-receipt.json').read_text())==receipt
print(json.dumps({'status':receipt['status'],'artifactFiles':len(files),'readback':'PASS','resultSha256':receipt['resultSha256'],'finalReceiptSha256':digest(base/'final-receipt.json')}))
