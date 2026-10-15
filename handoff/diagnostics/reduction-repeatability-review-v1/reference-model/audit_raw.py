import collections
import datetime
import hashlib
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
PLAN = json.loads((HERE / 'PLAN-v2.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
canonical = lambda data: json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
freeze = json.loads((HERE / 'execution-freeze.json').read_text())
assert sha((HERE / 'worker.mjs').read_bytes()) == freeze['workerSha256']
assert sha((HERE / 'PLAN-v2.json').read_bytes()) == freeze['planSha256']

def normalize(value, root):
    if isinstance(value, dict):
        return {k: normalize(v, root) for k, v in value.items() if k not in ['startedAt', 'durationMs']}
    if isinstance(value, list):
        return [normalize(v, root) for v in value]
    if isinstance(value, str):
        return value.replace(root, '<OWNED_ARTIFACT_ROOT>')
    return value

def fixed_point_neighbors(actions):
    # Independent of the JavaScript verifier's reverse-adjacency BFS and the
    # production reducer's single ordered forward pass. Iterate present nodes
    # to a fixed point after deletion of each selected node.
    answer = set()
    for selected in actions:
        present = {a['id'] for a in actions} - {selected['id']}
        while True:
            next_present = {a['id'] for a in actions if a['id'] in present and set(a['dependsOn']) <= present}
            if next_present == present:
                break
            present = next_present
        answer.add(tuple(a['id'] for a in actions if a['id'] in present))
    return answer

comparisons = []
raw_audits = []
reference = None
global_gap_cases = []
controls = []
total_executions = 0
total_cases = 0
total_raw_bytes = 0
for form in PLAN['formats']:
    for rep in [1, 2]:
        label = f'{form}-{rep}'
        directory = HERE / label
        summary = json.loads((directory / 'summary.json').read_text())
        receipt = json.loads((HERE / f'{label}.receipt.json').read_text())
        raw = (directory / 'raw-cases.ndjson').read_bytes()
        assert sha(raw) == summary['rawSha256']
        assert len(raw) == summary['rawBytes'] < PLAN['rawEvidenceLimitBytesPerProcess']
        assert receipt['exitCode'] == 0 and receipt['stopReason'] is None
        assert receipt['elapsedSeconds'] < PLAN['processWallLimitSeconds']
        assert receipt['combinedLogBytes'] < PLAN['processCombinedLogLimitBytes']
        assert summary['modelHarnessDigest'] == freeze['workerSha256']
        assert not summary['caseFailures'] and not summary['processErrors']
        before = json.loads((directory / 'before-input-checks.json').read_text())
        after = json.loads((directory / 'after-input-checks.json').read_text())
        assert before == after and len(before) == 217
        for file in before:
            data = pathlib.Path(file['path']).read_bytes()
            assert len(data) == file['bytes'] and sha(data) == file['sha256']
        records = [json.loads(line) for line in raw.splitlines()]
        assert len(records) == 352
        normalized = [normalize(record, str(directory / 'model-owned-executions')) for record in records]
        if reference is None:
            reference = normalized
        assert normalized == reference, f'Full semantic transcript differs for {label}'
        seen_scopes = set()
        accepted = 0
        trial_count = 0
        final_neighbors_checked = 0
        table_count = collections.Counter()
        model_executions = 0
        for record in records:
            assert not record['errors']
            result = record['result']
            runs = record['runs']
            model_executions += len(runs)
            assert result['executions'] == len(runs) <= record['budget']['maxExecutions']
            for run in runs:
                assert run['artifactDir'] not in seen_scopes
                seen_scopes.add(run['artifactDir'])
            trial_count += len(result['trials'])
            accepted += sum(trial['accepted'] for trial in result['trials'])
            if record['kind'] == 'adversarial-control':
                if label == 'source-1':
                    controls.append({'caseId': record['caseId'], 'status': result['status'], 'minimality': result['minimality'], 'executions': result['executions'],
                                     'outcomes': [run['evidence']['outcome'] for run in runs],
                                     'runIds': [run['evidence']['id'] for run in runs],
                                     'acceptedTrials': [trial['index'] for trial in result['trials'] if trial['accepted']],
                                     'scopeLimit': record['audit'].get('scopeLimit'),
                                     'unobservedScheduledFollowup': record['audit'].get('unobservedScheduledFollowup')})
                continue
            graph_id, table_id = record['caseId'].split('-table-')
            table_count[graph_id] += 1
            original = record['originalManifest']
            actions = original['actions']
            closed = []
            for mask in range(2 ** len(actions)):
                ids = tuple(a['id'] for i, a in enumerate(actions) if mask & (1 << i))
                if all(set(a['dependsOn']) <= set(ids) for a in actions if a['id'] in ids):
                    closed.append(ids)
            table = {tuple(item['subset'].split(',')) if item['subset'] else (): item['outcome'] == 'target-failure' for item in record['oracleTable']}
            assert set(table) == set(closed)
            for i, ids in enumerate(closed):
                assert table[ids] == (i == len(closed) - 1 or bool(int(table_id) & (1 << i)))
            by_id = {run['evidence']['id']: run for run in runs}
            parent = actions
            final_acceptance = -1
            for trial in result['trials']:
                observed = [by_id[run_id] for run_id in trial['runIds']]
                assert observed
                candidate = observed[0]['candidate']
                ids = tuple(a['id'] for a in candidate['actions'])
                assert ids in table
                assert trial['inputDigest'] == sha(canonical(candidate))
                assert trial['removed'] == [a['id'] for a in parent if a['id'] not in ids]
                assert [a for a in original['actions'] if a['id'] in ids] == candidate['actions']
                identity = {k: v for k, v in candidate.items() if k != 'actions'}
                assert identity == {k: v for k, v in original.items() if k != 'actions'}
                for run in observed:
                    assert run['candidate'] == candidate
                    evidence = run['evidence']
                    assert evidence['manifestDigest'] == trial['inputDigest']
                    assert evidence['assertionDigest'] == original['assertionDigest']
                    assert evidence['harnessDigest'] == freeze['workerSha256']
                    assert evidence['assertionCount'] == 1
                    expected_observation = {'latestRequestId': 2, 'query': 'beta', 'results': ['Alpha synthetic result' if table[ids] else 'Beta synthetic result']}
                    assert evidence['observation'] == expected_observation
                    assert evidence['outcome'] == ('target-failure' if table[ids] else 'requirement-satisfied')
                assert trial['accepted'] == table[ids]
                assert len(observed) == (2 if table[ids] else 1)
                if trial['accepted']:
                    parent = candidate['actions']
                    final_acceptance = trial['index']
            assert result['status'] == 'complete' and result['minimality'] == 'dependency-group-1-minimal'
            final_ids = tuple(a['id'] for a in result['manifest']['actions'])
            assert table[final_ids]
            assert result['manifest']['actions'] == parent
            final_neighbors = fixed_point_neighbors(parent)
            assert final_neighbors == {tuple(item['ids']) for item in record['audit']['finalNeighbors']}
            for ids in final_neighbors:
                assert not table[ids]
                final_neighbors_checked += 1
                after = [trial for trial in result['trials'] if trial['index'] > final_acceptance]
                desired_digest = sha(canonical({**result['manifest'], 'actions': [a for a in parent if a['id'] in ids]}))
                matching = [trial for trial in after if trial['inputDigest'] == desired_digest]
                assert matching and all(trial['outcome'] == 'requirement-satisfied' and not trial['accepted'] for trial in matching)
            global_minimum = min(len(ids) for ids, failure in table.items() if failure)
            assert record['audit']['globalMinimumActionCount'] == global_minimum
            assert record['audit']['globalMinimumGap'] == len(final_ids) - global_minimum
            if label == 'source-1' and len(final_ids) > global_minimum:
                global_gap_cases.append({'caseId': record['caseId'], 'finalIds': list(final_ids), 'finalActionCount': len(final_ids),
                                         'globalMinimumActionCount': global_minimum,
                                         'globalMinimumSubsets': [list(ids) for ids, failure in table.items() if failure and len(ids) == global_minimum],
                                         'gap': len(final_ids) - global_minimum})
        assert dict(table_count) == {'chain-noise': 64, 'star': 256}
        assert model_executions == 2266 == summary['totalModelExecutions']
        total_executions += model_executions
        total_cases += len(records)
        total_raw_bytes += len(raw)
        raw_audits.append({'label': label, 'cases': len(records), 'modelExecutions': model_executions, 'trials': trial_count,
                           'acceptedTrials': accepted, 'finalTableNeighborsIndependentlyChecked': final_neighbors_checked,
                           'uniqueExecutionScopes': len(seen_scopes), 'beforeAfterInputChecks': len(before), 'rawSha256': sha(raw)})
        comparisons.append({'label': label, 'fullSemanticRecordsEqual': True, 'transcriptSha256': summary['transcriptSha256'], 'rawBytes': len(raw)})

assert total_cases == PLAN['expectedReducerInvocations'] == 2112
assert len(global_gap_cases) == 23
result = {'createdUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'scope': 'Independent Python audit of retained raw synthetic model decisions, not another product execution or browser evidence.',
          'normalization': 'Delete only startedAt and durationMs object keys and replace the exact owned per-process model artifact root. Preserve every other raw-case field.',
          'planSha256': freeze['planSha256'], 'modelHarnessDigest': freeze['workerSha256'],
          'totalReducerInvocations': total_cases, 'totalSyntheticModelExecutions': total_executions, 'totalRawBytes': total_raw_bytes,
          'uniqueExhaustiveTables': 320, 'tableInvocations': 1920, 'uniqueControls': 32, 'controlInvocations': 192,
          'globalMinimumGapTables': global_gap_cases, 'controls': controls, 'audits': raw_audits,
          'comparisons': comparisons, 'status': 'PASS for the stated finite synthetic decision-verification scope',
          'browserAcceptance': 'UNRUN; unchanged capacity blocker and existing actual reduction minimality limitations remain.'}
(HERE / 'raw-audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'totalReducerInvocations': total_cases, 'totalSyntheticModelExecutions': total_executions,
                  'totalRawBytes': total_raw_bytes, 'allSixSemanticTranscriptsEqual': True, 'globalMinimumGapTables': len(global_gap_cases),
                  'auditSha256': sha((HERE / 'raw-audit.json').read_bytes())}))
