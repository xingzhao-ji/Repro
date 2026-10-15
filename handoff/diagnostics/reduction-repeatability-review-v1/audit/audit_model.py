"""Independent parsing of existing model transcripts; no product execution."""
from pathlib import Path
from datetime import datetime, timezone
import collections
import hashlib
import itertools
import json

ROOT = Path('/workspace/repro-development-rv5abotj/repro')
BASE = ROOT / '.repro-runs/cloud-continuation/reduction-repeatability-review-v1'
MODEL = BASE / 'reference-model'
OUT = BASE / 'audit'
inputs = {}
counts = collections.Counter()
failures = []

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    raw = path.read_bytes()
    inputs[str(path.relative_to(ROOT))] = {'sha256': sha(raw), 'bytes': len(raw)}
    return raw

def obj(path):
    return json.loads(read(path))

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def digest(value):
    return sha(canonical(value).encode())

def compact(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False)

def check(label, condition):
    counts['checks'] += 1
    if not condition:
        failures.append(label)

def normalize(value, owned):
    if isinstance(value, list):
        return [normalize(x, owned) for x in value]
    if isinstance(value, dict):
        return {k: normalize(v, owned) for k, v in value.items() if k not in ['startedAt', 'durationMs']}
    if isinstance(value, str):
        return value.replace(owned, '<OWNED_ARTIFACT_ROOT>')
    return value

def closed_subsets(actions):
    # Enumerate combinations by size, independently of worker bit-mask iteration.
    by_id = {a['id']: a for a in actions}
    ids = list(by_id)
    subsets = set()
    for size in range(len(ids) + 1):
        for combo in itertools.combinations(ids, size):
            present = set(combo)
            if all(set(by_id[k]['dependsOn']).issubset(present) for k in combo):
                subsets.add(','.join(combo))
    return subsets

def neighbor_subsets(actions):
    # Fixed-point set reachability; neither ordered one-pass deletion nor BFS queue.
    result = set()
    for selected in actions:
        removed = {selected['id']}
        while True:
            extended = removed | {a['id'] for a in actions if set(a['dependsOn']) & removed}
            if extended == removed:
                break
            removed = extended
        result.add(','.join(a['id'] for a in actions if a['id'] not in removed))
    return result

plan = obj(MODEL / 'PLAN-v2.json')
freeze = obj(MODEL / 'execution-freeze.json')
driver = obj(MODEL / 'driver-receipt.json')
worker_hash = sha(read(MODEL / 'worker.mjs'))
check('worker frozen hash', worker_hash == freeze['workerSha256'])
check('plan frozen hash', sha(read(MODEL / 'PLAN-v2.json')) == freeze['planSha256'])
check('six completed outer commands', driver['completed'] and len(driver['receipts']) == 6)
check('existing command limits retained', plan['processWallLimitSeconds'] == 120 and plan['processCombinedLogLimitBytes'] == 2097152)
processes = []
reference = None
controls = {}
seen_input_paths = {}
for fmt in plan['formats']:
    for repetition in range(1, 3):
        label = f'{fmt}-{repetition}'
        path = MODEL / label
        raw = read(path / 'raw-cases.ndjson')
        cases = [json.loads(line) for line in raw.splitlines()]
        summary = obj(path / 'summary.json')
        before = obj(path / 'before-input-checks.json')
        after = obj(path / 'after-input-checks.json')
        receipt = obj(MODEL / (label + '.receipt.json'))
        check(label + ' raw hash/size', len(raw) == summary['rawBytes'] and sha(raw) == summary['rawSha256'])
        check(label + ' complete cases and zero harness errors', len(cases) == summary['completedCases'] == 352 and summary['caseFailures'] == [] and summary['processErrors'] == [])
        check(label + ' outer command within limits', receipt['exitCode'] == 0 and receipt['stopReason'] is None and receipt['elapsedSeconds'] < 120 and receipt['combinedLogBytes'] < 2097152)
        check(label + ' exact immutable source input inventory', before == after and len(before) == summary['inputChecks'] == 217)
        check(label + ' frozen worker/plan identities', summary['modelHarnessDigest'] == worker_hash and summary['planSha256'] == freeze['planSha256'])
        for entry in before:
            p = Path(entry['path'])
            check(label + ' input rooted in authorized repository: ' + entry['path'], p.is_relative_to(ROOT))
            if entry['path'] not in seen_input_paths:
                data = read(p)
                seen_input_paths[entry['path']] = {'bytes': len(data), 'sha256': sha(data)}
            check(label + ' current input equals frozen inventory: ' + entry['path'], seen_input_paths[entry['path']] == {'bytes': entry['bytes'], 'sha256': entry['sha256']})
        expected_ids = [f"{g['id']}-table-{t:03d}" for g in plan['graphs'] for t in range(g['outcomeTableCount'])] + ['control-' + c for c in plan['controls']]
        check(label + ' exact ordered case IDs', [x['caseId'] for x in cases] == expected_ids)
        normalized = []
        transcript = hashlib.sha256()
        model_runs = 0
        global_gaps = []
        observed_tables = collections.defaultdict(set)
        for case, compact_summary in zip(cases, summary['cases']):
            cid = case['caseId']
            result = case['result']
            runs = case['runs']
            model_runs += len(runs)
            counts['reducerInvocations'] += 1
            counts['modelRuns'] += len(runs)
            check(label + '/' + cid + ' no recorded verification errors', case['errors'] == [])
            check(label + '/' + cid + ' execution budget/count', result['executions'] == len(runs) <= case['budget']['maxExecutions'])
            original = case['originalManifest']
            valid_subsets = closed_subsets(original['actions'])
            by_id = {r['evidence']['id']: r for r in runs}
            check(label + '/' + cid + ' unique run IDs', len(by_id) == len(runs))
            for run in runs:
                candidate = run['candidate']
                subset = ','.join(a['id'] for a in candidate['actions'])
                check(label + '/' + cid + ' dependency-closed input', subset in valid_subsets and run['subset'] == subset)
                rebuilt = dict(candidate, actions=original['actions'])
                check(label + '/' + cid + ' unchanged non-action fields', rebuilt == original)
            for trial in result['trials']:
                if trial['accepted']:
                    rr = [by_id.get(rid) for rid in trial['runIds']]
                    check(label + '/' + cid + ' accepted complete repeated frozen evidence', len(rr) == 2 and all(r and r['evidence']['outcome'] == 'target-failure' and r['evidence']['assertionCount'] == 1 and r['evidence']['observation'] == {'latestRequestId': 2, 'query': 'beta', 'results': ['Alpha synthetic result']} and r['evidence']['manifestDigest'] == trial['inputDigest'] == digest(r['candidate']) and r['evidence']['harnessDigest'] == worker_hash for r in rr))
            if case['kind'] == 'exhaustive-table':
                counts['tableCases'] += 1
                table = {x['subset']: x['outcome'] for x in case['oracleTable']}
                check(label + '/' + cid + ' complete independent table domain', set(table) == valid_subsets)
                graph = cid.split('-table-')[0]
                observed_tables[graph].add(canonical(table))
                final = result['manifest']
                final_key = ','.join(a['id'] for a in final['actions'])
                check(label + '/' + cid + ' complete final local failure', result['status'] == 'complete' and result['minimality'] == 'dependency-group-1-minimal' and table.get(final_key) == 'target-failure')
                last = max(t['index'] for t in result['trials'] if t['accepted'])
                for subset in neighbor_subsets(final['actions']):
                    selected = set(subset.split(',')) if subset else set()
                    candidate = dict(final, actions=[a for a in final['actions'] if a['id'] in selected])
                    matching = [t for t in result['trials'] if t['index'] > last and t['inputDigest'] == digest(candidate)]
                    check(label + '/' + cid + ' independent final negative neighbor', table[subset] == 'requirement-satisfied' and len(matching) > 0 and all(t['outcome'] == 'requirement-satisfied' and not t['accepted'] for t in matching))
                min_size = min(len(k.split(',')) if k else 0 for k,v in table.items() if v == 'target-failure')
                gap = len(final['actions']) - min_size
                check(label + '/' + cid + ' recomputed global minimum gap', gap == case['audit']['globalMinimumGap'])
                if gap:
                    global_gaps.append({'caseId': cid, 'gap': gap})
            else:
                counts['controlCases'] += 1
                if label == 'source-1':
                    controls[case['control']] = {'executions': len(runs), 'status': result['status'], 'minimality': result['minimality'], 'trialOutcomes': [t['outcome'] for t in result['trials']], 'observedOutcomes': [r['evidence']['outcome'] for r in runs], 'scopeLimit': case['audit'].get('scopeLimit'), 'unobservedScheduledFollowup': case['audit'].get('unobservedScheduledFollowup')}
            norm = normalize(case, str(path / 'model-owned-executions'))
            normalized.append(norm)
            h = sha(compact(norm).encode())
            check(label + '/' + cid + ' recomputed semantic digest', h == compact_summary['semanticSha256'])
            transcript.update((cid + ':' + h + '\n').encode())
        for graph in plan['graphs']:
            check(label + '/' + graph['id'] + ' every truth table unique', len(observed_tables[graph['id']]) == graph['outcomeTableCount'])
        if reference is None:
            reference = normalized
        else:
            check(label + ' all normalized semantic records equal source-1', normalized == reference)
        check(label + ' recomputed transcript and model execution count', transcript.hexdigest() == summary['transcriptSha256'] and model_runs == summary['totalModelExecutions'] == 2266)
        check(label + ' 23 local-but-not-global cases retained', len(global_gaps) == 23)
        processes.append({'label': label, 'cases': len(cases), 'modelRuns': model_runs, 'transcriptSha256': transcript.hexdigest(), 'globalMinimumGaps': global_gaps})

check('six-process total cases and model executions', counts['reducerInvocations'] == 2112 and counts['modelRuns'] == 13596 and counts['tableCases'] == 1920 and counts['controlCases'] == 192)
report = {'utc': datetime.now(timezone.utc).isoformat(), 'method': 'Read-only independent Python parsing and hashing of every existing raw model record. Independent combination enumeration and fixed-point deletion closure; no production execution.', 'counts': dict(counts), 'failures': failures, 'processes': processes, 'controlResults': controls, 'inputs': inputs, 'scope': 'Finite synthetic reducer-model decision repeatability, not browser/application determinism or real reduction minimality.'}
(OUT / 'model-evidence-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'counts': report['counts'], 'failures': failures, 'reportSha256': sha((OUT / 'model-evidence-audit.json').read_bytes())}))
