"""Independent, read-only inspection of retained evidence. Executes no product code."""
from pathlib import Path
import collections
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone

ROOT = Path('/workspace/repro-development-rv5abotj/repro')
OUT = ROOT / '.repro-runs/cloud-continuation/reduction-repeatability-review-v1/audit'
OLD = ROOT / '.repro-runs/cloud-continuation/compiled-test-development-v1/frozen-v3-bounded-node-pools'
ART = OLD / 'jobs/core-flow/artifacts'
BENCH = next((ART / 'benchmark').iterdir())
RED = next((ART / 'core-flow').iterdir())
HISTORICAL_HARNESS = 'c432e782cad9d9ceb3601778707c8b1b1cc0c4546864e29be9a1eb3140580838'
inputs = {}
checks = []
trace_observations = []

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    data = path.read_bytes()
    inputs[str(path.relative_to(ROOT))] = {'sha256': sha(data), 'bytes': len(data)}
    return data

def obj(path):
    return json.loads(read(path))

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def digest(value):
    return sha(canonical(value).encode())

def check(label, condition):
    checks.append({'check': label, 'passed': bool(condition)})

def inspect_trace(path, run):
    # Inspect recorded Playwright return values, independently of evidence labels.
    with zipfile.ZipFile(path) as archive:
        rows = [json.loads(line) for line in archive.read('trace.trace').decode().splitlines()]
    after = {r['callId']: r for r in rows if r.get('type') == 'after'}
    values = {}
    keys = {('getAttribute', '#search-state', 'data-completed'): 'completed',
            ('getAttribute', '#search-state', 'data-latest-request-id'): 'latestRequestId',
            ('innerText', '#latest-query', None): 'query',
            ('evalOnSelectorAll', '#results li', None): 'results'}
    for before in rows:
        if before.get('type') != 'before':
            continue
        params = before.get('params', {})
        key = keys.get((before.get('method'), params.get('selector'), params.get('name')))
        if key:
            completion = after.get(before['callId'], {})
            check('trace DOM query completed: ' + run['id'] + '/' + key,
                  'error' not in completion and 'value' in completion.get('result', {}))
            values[key] = completion.get('result', {}).get('value')
    expected = run['observation']
    actual = {'latestRequestId': int(values.get('latestRequestId', '-1')), 'query': values.get('query'),
              'results': [x.get('s') for x in values.get('results', {}).get('a', [])]}
    check('trace DOM observation and response order match run: ' + run['id'],
          actual == expected and values.get('completed') == '[2,1]')
    trace_observations.append({'runId': run['id'], 'path': str(path.relative_to(ROOT)),
                               'observation': actual, 'completedResponseOrder': values.get('completed')})

spec = obj(BENCH / 'specification.json')
summary = obj(BENCH / 'summary.json')
rows = [json.loads(line) for line in read(BENCH / 'runs.ndjson').decode().splitlines()]
reduction = obj(RED / 'reduction.json')
result = reduction['result']
original = spec['manifest']
assertion = spec['expected']['assertionDigest']
fixtures = spec['expected']['appDigests']
input_manifest = obj(OLD / 'input-manifest.json')
frozen_entries = {e['path']: e for e in input_manifest['entries']}

# Hash every extracted core-flow artifact against the pre-existing retention manifest.
artifact_manifest = obj(OLD / 'jobs/core-flow/artifact-manifest.json')
artifact_checks = []
for entry in artifact_manifest['entries']:
    check('artifact entry is file: ' + entry['path'], entry['type'] == 'file')
    data = read(ART / entry['path'])
    good = sha(data) == entry['sha256'] and len(data) == entry['bytes']
    artifact_checks.append({'path': entry['path'], 'passed': good})
check('all 157 retained artifact hashes and sizes match', len(artifact_checks) == 157 and all(x['passed'] for x in artifact_checks))

source_bindings = []
for name in ['src/oracle.ts', 'src/reducer.ts', 'src/manifest.ts', 'src/contracts.ts',
             'src/fixture.ts', 'src/adapter.ts', 'scripts/benchmark.ts',
             'fixtures/browser-search/page.html', 'fixtures/browser-search/buggy.js',
             'fixtures/browser-search/fixed.js']:
    old = read(OLD / 'input' / name)
    current = read(ROOT / name)
    check('frozen input hash: ' + name, sha(old) == frozen_entries[name]['sha256'])
    source_bindings.append({'path': name, 'historicalSha256': sha(old),
                            'currentSha256': sha(current), 'unchanged': old == current})
check('only adapter changed among inspected execution source inputs',
      [x['path'] for x in source_bindings if not x['unchanged']] == ['src/adapter.ts'])
for revision in ('buggy', 'fixed'):
    page = (ROOT / 'fixtures/browser-search/page.html').read_text()
    fixture = page.replace('/* REGISTERED_APPLICATION */', (ROOT / f'fixtures/browser-search/{revision}.js').read_text())
    check('fixture digest reconstructed: ' + revision, sha(fixture.encode()) == fixtures[revision])
expectation = original['expectation']
oracle_order = ['invariantId', 'description', 'latestRequestId', 'latestQuery', 'expectedResults']
check('frozen assertion digest reconstructed', sha(json.dumps({k: expectation[k] for k in oracle_order}, separators=(',', ':')).encode()) == assertion)
check('original canonical manifest digest', digest(original) == spec['expected']['manifestDigest'])
check('benchmark summary rows equal append-only rows', summary['runs'] == rows)
check('benchmark exactly all 40 planned rows', len(rows) == 40 and summary['counts'] == {'planned': 40, 'executed': 40, 'matchedExpected': 40, 'unexpected': 0, 'skipped': 0, 'unrun': 0})
check('benchmark rows have unique IDs', len({x['run']['id'] for x in rows}) == 40)
check('benchmark all repetitions and revision order', [(x['repetition'], x['revision']) for x in rows] == [(n, rev) for n in range(1, 21) for rev in ('buggy', 'fixed')])

def inspect_run(run, base, candidate_digest, revision, conclusive=True):
    persisted = obj(base / run['id'] / 'evidence.json')
    check('persisted run equals complete in-memory fields: ' + run['id'], persisted == {k: v for k, v in run.items() if k != 'artifacts'})
    for item in run['artifacts']:
        data = read(base / item['path'])
        check('run artifact: ' + run['id'] + '/' + Path(item['path']).name, sha(data) == item['sha256'] and len(data) == item['bytes'])
    identity = (run['manifestDigest'] == candidate_digest and run['assertionDigest'] == assertion
                and run['harnessDigest'] == HISTORICAL_HARNESS and run['appRevision'] == revision
                and run['adapterVersion'] == original['adapter']['version']
                and run['runnerVersion'] == original['runnerVersion'] and run['seed'] == 1729)
    check('recorded frozen identity: ' + run['id'], identity)
    if not conclusive:
        check('preflight has no browser or oracle observation: ' + run['id'],
              run['outcome'] == 'inconclusive' and run['reason'].startswith('MISSING_STEPS:')
              and run['category'] == 'verification' and run['appDigest'] == ''
              and run['assertionCount'] == 0 and run['observation'] is None and run['events'] == []
              and run['environment']['browser'] == 'not-launched')
        return
    label = 'target-failure' if revision == 'buggy' else 'requirement-satisfied'
    observed = {'latestRequestId': 2, 'query': 'beta', 'results': ['Alpha synthetic result' if revision == 'buggy' else 'Beta synthetic result']}
    check('direct frozen observation and exactly one assertion: ' + run['id'],
          run['outcome'] == label and run['assertionCount'] == 1 and run['observation'] == observed and run['appDigest'] == fixtures[revision])
    inspect_trace(base / run['id'] / 'trace.zip', run)
    events = run['events']
    check('fresh reset, both requests, controlled responses and final assertion: ' + run['id'],
          events[0]['type'] == 'reset'
          and [e.get('actionId') for e in events if e['type'] == 'request-issued'] == ['search-alpha', 'search-beta']
          and [e['message'] for e in events if e['type'] == 'response-completed'] == ['HTTP response 2 completed in the frontend.', 'HTTP response 1 completed in the frontend.']
          and events[-1]['type'] == 'assertion' and sum(e['type'] == 'assertion' for e in events) == 1)

for row in rows:
    run = row['run']
    inspect_run(run, BENCH, digest(original), row['revision'])
    check('row observation digest and expected label: ' + run['id'],
          row['observationDigest'] == digest(run['observation']) and row['matchesExpected'] is True
          and row['expectedOutcome'] == ('target-failure' if row['revision'] == 'buggy' else 'requirement-satisfied'))

# Reconstruct each reduction candidate from the preceding accepted candidate.
executions = {x['id']: x for x in reduction['executions']}
check('all 16 attempts retained uniquely', len(executions) == len(reduction['executions']) == result['executions'] == 16)
check('13 trials and three accepted (including baseline)', len(result['trials']) == 13 and sum(t['accepted'] for t in result['trials']) == 3)
check('all execution IDs accounted once by trials', collections.Counter(x for t in result['trials'] for x in t['runIds']) == collections.Counter(list(executions)))
best = json.loads(json.dumps(original))
trial_audit = []
for trial in result['trials']:
    candidate = json.loads(json.dumps(best))
    candidate['actions'] = [a for a in best['actions'] if a['id'] not in trial['removed']]
    check('reconstructed trial digest ' + str(trial['index']), digest(candidate) == trial['inputDigest'])
    seen = set()
    for action in candidate['actions']:
        check('candidate dependency closure ' + str(trial['index']) + '/' + action['id'], set(action['dependsOn']).issubset(seen))
        seen.add(action['id'])
    run_rows = []
    for rid in trial['runIds']:
        run = executions[rid]
        files = list(RED.glob('execution-*/' + rid + '/evidence.json'))
        check('one persisted execution path: ' + rid, len(files) == 1)
        inspect_run(run, files[0].parent.parent, trial['inputDigest'], 'buggy', trial['accepted'])
        run_rows.append({'id': rid, 'executionDirectory': files[0].parent.parent.name,
                         'outcome': run['outcome'], 'reason': run['reason'], 'assertionCount': run['assertionCount'],
                         'browser': run['environment']['browser'], 'appDigest': run['appDigest']})
    if trial['accepted']:
        check('accepted trial has two target-failure observations ' + str(trial['index']), len(run_rows) == 2 and all(r['outcome'] == 'target-failure' for r in run_rows))
        best = candidate
    trial_audit.append({'trial': trial['index'], 'removed': trial['removed'], 'remaining': [a['id'] for a in candidate['actions']],
                        'inputDigest': trial['inputDigest'], 'accepted': trial['accepted'], 'runs': run_rows})
check('final manifest equals reconstructed last accepted candidate', best == result['manifest'])
check('minimality remains explicitly unverified', result['minimality'] == 'unverified')
check('six actual failure runs and ten preflights', sum(r['outcome'] == 'target-failure' for r in executions.values()) == 6 and sum(r['reason'].startswith('MISSING_STEPS:') for r in executions.values()) == 10)

# Independent breadth-first reverse-edge traversal enumerates final neighbors.
neighbors = []
for selected in best['actions']:
    removed = {selected['id']}
    queue = [selected['id']]
    while queue:
        previous = queue.pop(0)
        for action in best['actions']:
            if previous in action['dependsOn'] and action['id'] not in removed:
                removed.add(action['id'])
                queue.append(action['id'])
    candidate = json.loads(json.dumps(best))
    candidate['actions'] = [a for a in best['actions'] if a['id'] not in removed]
    matches = [t for t in trial_audit if t['trial'] > 9 and t['inputDigest'] == digest(candidate)]
    check('final neighbor retained after last acceptance: ' + selected['id'], len(matches) == 1)
    neighbors.append({'selected': selected['id'], 'closure': [a['id'] for a in best['actions'] if a['id'] in removed],
                      'remaining': [a['id'] for a in candidate['actions']], 'inputDigest': digest(candidate), 'trial': matches[0]})

fixed_path = RED / '5b30911b-57d7-4f5f-87f4-320de7f53119/evidence.json'
fixed = obj(fixed_path)
inspect_trace(fixed_path.with_name('trace.zip'), fixed)
check('reduced fixed run directly satisfies frozen assertion once', fixed['outcome'] == 'requirement-satisfied'
      and fixed['assertionCount'] == 1 and fixed['observation'] == {'latestRequestId': 2, 'query': 'beta', 'results': ['Beta synthetic result']}
      and fixed['manifestDigest'] == digest(best) and fixed['appDigest'] == fixtures['fixed']
      and fixed['appRevision'] == 'fixed' and fixed['harnessDigest'] == HISTORICAL_HARNESS and fixed['assertionDigest'] == assertion)

receipt = obj(ROOT / '.repro-runs/cloud-continuation/browser-lifetime-review-v1/final-receipt.json')
report = {
    'utc': datetime.now(timezone.utc).isoformat(),
    'method': 'Read-only Python evidence parsing, direct SHA-256 and independent canonical/BFS calculations. No product imports or execution, browser, Docker, network, authentication, upload or source edits.',
    'checks': checks, 'checksPassed': sum(x['passed'] for x in checks), 'checksTotal': len(checks),
    'failures': [x for x in checks if not x['passed']],
    'artifactCount': len(artifact_checks), 'benchmark': {'rows': len(rows), 'repetitionsPerRevision': 20, 'uniqueRunIds': len({x['run']['id'] for x in rows}), 'recordedHarness': HISTORICAL_HARNESS,
    'assertionDigest': assertion, 'manifestDigest': digest(original), 'fixtures': fixtures, 'startedAt': spec['startedAt'], 'endedAt': summary['endedAt'], 'node': spec['node'],
    'browser': sorted({r['run']['environment']['browser'] for r in rows}), 'observationDigestsByRevision': {rev: sorted({r['observationDigest'] for r in rows if r['revision'] == rev}) for rev in ('buggy', 'fixed')}},
    'reduction': {'originalActions': len(original['actions']), 'finalActions': len(best['actions']), 'finalDigest': digest(best), 'executions': 16, 'targetFailures': 6, 'preflights': 10,
                  'trials': trial_audit, 'finalNeighbors': neighbors, 'minimality': 'unverified', 'fixedRun': fixed['id'], 'durationMs': result['durationMs']},
    'sourceBindings': source_bindings,
    'traceObservations': trace_observations,
    'currentHarnessIdentitiesFromRetainedReceipt': receipt.get('identities', receipt.get('harness_identities')),
    'currentInstalledHarnessFromRetainedReceipt': receipt['installed_library_harness'],
    'inputs': inputs,
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'historical-evidence-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'checksPassed': report['checksPassed'], 'checksTotal': report['checksTotal'], 'failures': report['failures'], 'reportSha256': sha((OUT / 'historical-evidence-audit.json').read_bytes())}))
