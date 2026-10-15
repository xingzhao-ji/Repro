"""Independently inspect saved adapter preflight records; no adapter execution."""
from pathlib import Path
from datetime import datetime, timezone
import collections
import hashlib
import json

ROOT = Path('/workspace/repro-development-rv5abotj/repro')
BASE = ROOT / '.repro-runs/cloud-continuation/reduction-repeatability-review-v1'
PRE = BASE / 'preflight'
V3 = PRE / 'corrected-driver-v3'
OUT = BASE / 'audit'
counts = collections.Counter()
failures = []
inputs = {}
all_ids = set()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    data = path.read_bytes()
    inputs[str(path.relative_to(ROOT))] = {'sha256': sha(data), 'bytes': len(data)}
    return data

def obj(path):
    return json.loads(read(path))

def check(label, condition):
    counts['checks'] += 1
    if not condition:
        failures.append(label)

def encoded(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()

def digest(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())

def normalize(value):
    v = json.loads(json.dumps(value))
    v['id'] = '<RUN_ID>'
    v['startedAt'] = '<TIMESTAMP>'
    v['durationMs'] = '<DURATION>'
    for event in v['events']:
        event['at'] = '<TIMESTAMP>'
    return v

historical = obj(OUT / 'historical-evidence-audit.json')
expected_neighbors = {n['inputDigest'] for n in historical['reduction']['finalNeighbors']}
candidate = obj(ROOT / '.repro-runs/cloud-continuation/browser-lifetime-review-v1/final-receipt.json')
harnesses = {'source': candidate['identities']['source']['harnessDigest'], 'emitted': candidate['identities']['emitted']['harnessDigest'], 'installed': candidate['installed_library_harness']}
attempts = []
final_normalized = {}

for attempt_path, formats, expected_exit in [(PRE, ['source'], 1), (PRE / 'corrected-driver-v2', ['source'], 1), (V3, ['source', 'emitted', 'installed'], 0)]:
    label = attempt_path.name
    plan = obj(attempt_path / 'plan.json')
    freeze = obj(attempt_path / 'execution-freeze.json')
    receipts = obj(attempt_path / 'execution-receipts.json')
    cases = {c['id']: c for c in plan['cases']}
    check(label + ' exact retained neighbor input identities', {c['manifestDigest'] for c in cases.values() if c['kind'] == 'final-dependency-group-neighbor'} == expected_neighbors)
    check(label + ' unchanged core', digest(plan['coreManifest']) == historical['reduction']['finalDigest'])
    check(label + ' declared 20 repetitions', plan['executionPolicy']['repetitions'] == 20)
    check(label + ' expected command count', len(receipts) == len(formats))
    check(label + ' recorded outer bounds', all(r['exitCode'] == expected_exit and r['termination'] is None and r['elapsedSeconds'] < 120 and r['combinedLogBytes'] < 2097152 for r in receipts))
    for receipt in receipts:
        rawlog = read(attempt_path / (receipt['format'] + '.log'))
        check(label + ' log integrity/' + receipt['format'], len(rawlog) == receipt['combinedLogBytes'] and sha(rawlog) == receipt['combinedLogSha256'])
    if expected_exit:
        failed = obj(attempt_path / 'failed-attempt-summary.json')
        check(label + ' failed verifier attempt retained', failed['actualAdapterExecutions'] == 140 and failed['artifacts'] == 120 and failed['productFailure'] is False)
    per_attempt = {'attempt': label, 'expectedExitCode': expected_exit, 'formats': []}
    for fmt in formats:
        fmtpath = attempt_path / 'formats' / fmt
        paths = sorted(fmtpath.glob('*/run-*/result.json'))
        check(label + '/' + fmt + ' all 140 saved result records', len(paths) == 140)
        per_case = collections.defaultdict(list)
        artifacts = 0
        for path in paths:
            cid = path.parent.parent.name
            case = cases[cid]
            result = obj(path)
            counts['adapterResultRecords'] += 1
            check(label + '/' + fmt + '/' + cid + ' unique global run ID', result['id'] not in all_ids)
            all_ids.add(result['id'])
            check(label + '/' + fmt + '/' + cid + ' exact input and candidate harness', result['manifestDigest'] == case['manifestDigest'] == digest(case['manifest']) and result['harnessDigest'] == harnesses[fmt] and result['assertionDigest'] == plan['coreManifest']['assertionDigest'])
            check(label + '/' + fmt + '/' + cid + ' honest rejection classification', result['outcome'] == case['expected']['outcome'] and result['category'] == case['expected']['category'] and result['reason'].split(':')[0] == case['expected']['code'])
            check(label + '/' + fmt + '/' + cid + ' no browser/target observation', result['assertionCount'] == 0 and result['observation'] is None and result['events'] == [] and result['appDigest'] == '' and result['environment']['browser'] == 'not-launched')
            expected_count = 0 if case.get('preCancelled') else 1
            check(label + '/' + fmt + '/' + cid + ' declared artifact count', len(result['artifacts']) == expected_count)
            normalized = normalize(result)
            normalized['artifacts'] = []
            for artifact in result['artifacts']:
                artifact_path = path.parent / 'adapter-artifacts' / artifact['path']
                raw = read(artifact_path)
                persisted = json.loads(raw)
                stat = artifact_path.lstat()
                check(label + '/' + fmt + '/' + cid + ' exact owned evidence path/type', artifact['path'] == result['id'] + '/evidence.json' and not artifact_path.is_symlink() and stat.st_nlink == 1 and artifact_path.resolve().is_relative_to(path.parent))
                check(label + '/' + fmt + '/' + cid + ' raw artifact hash/size', sha(raw) == artifact['sha256'] and len(raw) == artifact['bytes'])
                check(label + '/' + fmt + '/' + cid + ' persisted result equals returned evidence', persisted == {k: v for k, v in result.items() if k != 'artifacts'})
                normal_bytes = encoded(normalize(persisted))
                normalized['artifacts'].append({'path': '<RUN_ID>/evidence.json', 'sha256': sha(normal_bytes), 'bytes': len(normal_bytes)})
                artifacts += 1
                counts['evidenceArtifacts'] += 1
            per_case[cid].append(normalized)
        for cid in cases:
            check(label + '/' + fmt + '/' + cid + ' exact 20 repeated normalized outputs', len(per_case[cid]) == 20 and all(x == per_case[cid][0] for x in per_case[cid]))
        check(label + '/' + fmt + ' exactly 120 artifacts', artifacts == 120)
        if expected_exit == 0:
            summary = obj(fmtpath / 'summary.json')
            records = obj(fmtpath / 'records.json')
            check(label + '/' + fmt + ' complete success only in final attempt', summary['status'] == 'PASS: nonbrowser preflight repeatability only' and summary['completedExecutions'] == 140 and summary['artifactsVerified'] == 120)
            check(label + '/' + fmt + ' zero forbidden calls and exact restoration', summary['launchCalls'] == summary['listenCalls'] == 0 and summary['exactOriginalDescriptorsRestored'] and summary['guardStates']['original'] == summary['guardStates']['restored'])
            check(label + '/' + fmt + ' final summary binds actual module', summary['actualModule']['harnessDigest'] == harnesses[fmt] and sha(read(ROOT / summary['actualModule']['path'])) == summary['actualModule']['sha256'])
            check(label + '/' + fmt + ' complete raw record index', len(records) == 140 and {r['runId'] for r in records} == {obj(p)['id'] for p in paths})
            for record in records:
                data = read(attempt_path / record['resultPath'])
                check(label + '/' + fmt + ' indexed result and normalized digest', sha(data) == record['resultSha256'] and record['normalizedSha256'] == sha(encoded(per_case[record['caseId']][0])))
            for s in summary['cases']:
                check(label + '/' + fmt + '/' + s['caseId'] + ' independent normalization equals reported normalization', per_case[s['caseId']][0] == s['normalizedResult'])
            final_normalized[fmt] = {k: v[0] for k,v in per_case.items()}
        per_attempt['formats'].append({'format': fmt, 'savedResults': len(paths), 'artifactCount': artifacts, 'harnessDigest': harnesses[fmt]})
    attempts.append(per_attempt)

cross_differences = {}
for cid in final_normalized['source']:
    values = [json.loads(json.dumps(final_normalized[fmt][cid])) for fmt in ['source','emitted','installed']]
    varying = [k for k in values[0] if any(x[k] != values[0][k] for x in values[1:])]
    cross_differences[cid] = varying
    for value in values:
        value.pop('harnessDigest')
        for artifact in value['artifacts']:
            artifact.pop('sha256')
    check('cross-format semantic agreement except separately bound harness and evidence hash: ' + cid, all(x == values[0] for x in values[1:]))

for entry in obj(V3 / 'plan.json')['inputs']:
    data = read(ROOT / entry['path'])
    check('final current source/input preservation: ' + entry['path'], len(data) == entry['bytes'] and sha(data) == entry['sha256'])
check('aggregate 700 saved calls and 600 artifacts including verifier failures', counts['adapterResultRecords'] == 700 and counts['evidenceArtifacts'] == 600 and len(all_ids) == 700)
report = {'utc': datetime.now(timezone.utc).isoformat(), 'method': 'Independent read-only parsing and hashing of all saved result/evidence files across all three verifier attempts. No adapter calls, browser, listener, network or authentication.', 'counts': dict(counts), 'failures': failures, 'attempts': attempts, 'acceptedFinalMatrix': {'adapterCalls': 420, 'artifactCount': 360, 'formats': 3, 'casesPerFormat': 7, 'repetitionsPerCase': 20}, 'earlierVerifierFailures': {'savedAdapterCalls': 280, 'artifactCount': 240}, 'crossFormatVaryingFields': cross_differences, 'inputs': inputs, 'scope': 'Repeated actual-adapter preflight rejection consistency only. No target assertion or browser repeatability/minimality evidence.'}
(OUT / 'preflight-evidence-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'counts': report['counts'], 'failures': failures, 'reportSha256': sha((OUT / 'preflight-evidence-audit.json').read_bytes())}))
