import copy, hashlib, json, pathlib

root = pathlib.Path(__file__).resolve().parent
current = root / 'corrected-driver-v3'
sha = lambda data: hashlib.sha256(data).hexdigest()
load = lambda p: json.loads(p.read_text())
plan = load(current / 'plan.json')
formats = [entry['id'] for entry in plan['formats']]
summaries = {fmt: load(current / 'formats' / fmt / 'summary.json') for fmt in formats}
actual_harnesses = {fmt: summary['actualModule']['harnessDigest'] for fmt, summary in summaries.items()}
assert len(set(actual_harnesses.values())) == 3, actual_harnesses
all_ids = set()
artifact_inventory = []
result_inventory = []
normalized_by_case = {}
retained_attempts = []

def normalize(result):
    value = copy.deepcopy(result)
    value['id'] = '<RUN_ID>'
    value['startedAt'] = '<TIMESTAMP>'
    value['durationMs'] = '<DURATION>'
    for event in value['events']:
        event['at'] = '<TIMESTAMP>'
    return value

for attempt, paths, accepted in [('original', root / 'formats/source', False), ('corrected-driver-v2', root / 'corrected-driver-v2/formats/source', False), ('corrected-driver-v3', current / 'formats', True)]:
    results = sorted(paths.glob('*/run-*/result.json')) if not accepted else sorted(paths.glob('*/*/run-*/result.json'))
    count_artifacts = 0
    for path in results:
        result = load(path)
        assert result['id'] not in all_ids
        all_ids.add(result['id'])
        assert result['assertionCount'] == 0 and result['observation'] is None
        assert result['events'] == [] and result['appDigest'] == '' and result['environment']['browser'] == 'not-launched'
        assert result['outcome'] in ['inconclusive', 'cancelled']
        expected_files = {path}
        for artifact in result['artifacts']:
            assert artifact['path'] == result['id'] + '/evidence.json'
            p = path.parent / 'adapter-artifacts' / artifact['path']
            assert p.resolve().is_relative_to(root) and p.resolve() == p.absolute()
            stat = p.lstat()
            assert p.is_file() and not p.is_symlink() and stat.st_nlink == 1
            raw = p.read_bytes()
            assert len(raw) == artifact['bytes'] and sha(raw) == artifact['sha256']
            expected = copy.deepcopy(result)
            del expected['artifacts']
            assert json.loads(raw) == expected
            artifact_inventory.append({'attempt': attempt, 'path': str(p.relative_to(root)), 'bytes': len(raw), 'sha256': sha(raw)})
            count_artifacts += 1
            expected_files.add(p)
        assert set(p for p in path.parent.rglob('*') if p.is_file()) == expected_files
        result_inventory.append({'attempt': attempt, 'path': str(path.relative_to(root)), 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())})
        if accepted:
            fmt = path.parents[2].name
            case_id = path.parents[1].name
            case = next(item for item in plan['cases'] if item['id'] == case_id)
            assert result['harnessDigest'] == actual_harnesses[fmt]
            assert result['manifestDigest'] == case['manifestDigest']
            assert result['assertionDigest'] == plan['coreManifest']['assertionDigest']
            assert result['outcome'] == case['expected']['outcome'] and result['category'] == case['expected']['category']
            assert result['reason'].split(':')[0] == case['expected']['code']
            normalized = normalize(result)
            normalized['artifacts'] = [{**normalize(load(path.parent / 'adapter-artifacts' / a['path']))} for a in result['artifacts']]
            normalized_by_case.setdefault((fmt, case_id), []).append(normalized)
    assert len(results) == (420 if accepted else 140)
    assert count_artifacts == (360 if accepted else 120)
    retained_attempts.append({'attempt': attempt, 'actualAdapterExecutions': len(results), 'artifactsVerified': count_artifacts, 'acceptedHarnessRun': accepted})

comparison = []
for case in plan['cases']:
    values = {}
    for fmt in formats:
        runs = normalized_by_case[(fmt, case['id'])]
        assert len(runs) == 20 and all(value == runs[0] for value in runs)
        values[fmt] = copy.deepcopy(runs[0])
    reference = copy.deepcopy(values['source'])
    diffs = {}
    for fmt, value in values.items():
        differing_fields = [key for key in reference if reference[key] != value[key]]
        assert set(differing_fields) <= {'harnessDigest', 'artifacts'}, differing_fields
        if fmt != 'source':
            assert 'harnessDigest' in differing_fields
        diffs[fmt] = differing_fields
        assert value.pop('harnessDigest') == actual_harnesses[fmt]
        for artifact in value['artifacts']:
            assert artifact.pop('harnessDigest') == actual_harnesses[fmt]
    assert values['source'] == values['emitted'] == values['installed'], 'Cross-format differences confined explicitly to real harness identities in result/evidence'
    comparison.append({'caseId': case['id'], 'repetitionsPerFormat': 20, 'withinFormatRepeatable': True, 'crossFormatSemanticEquivalent': True, 'preservedHarnessDigests': actual_harnesses, 'exactDifferingFieldsFromSource': diffs, 'outcome': reference['outcome'], 'category': reference['category'], 'reason': reference['reason']})

for fmt, summary in summaries.items():
    assert summary['completedExecutions'] == 140 and summary['artifactsVerified'] == 120
    assert summary['launchCalls'] == summary['listenCalls'] == 0
    assert summary['exactOriginalDescriptorsRestored'] and summary['sourceInputsUnchanged']
    assert summary['guardStates']['original'] == summary['guardStates']['restored']
    for kind in ['launch', 'listen']:
        assert summary['guardStates']['installed'][kind]['ownProperty']
        assert summary['guardStates']['installed'][kind]['descriptor']['configurable']
        assert not summary['guardStates']['installed'][kind]['lookupIsOriginal']

for item in plan['inputs']:
    raw = (pathlib.Path(plan['repo']) / item['path']).read_bytes()
    assert len(raw) == item['bytes'] and sha(raw) == item['sha256']
for path in root.rglob('*'):
    assert not path.is_symlink(), str(path)
    if path.is_file(): assert path.stat().st_nlink == 1

receipt = {'status': 'PASS for corrected-driver-v3 preflight repeatability only; two earlier verification-driver failures retained', 'totalActualAdapterExecutions': len(all_ids), 'acceptedMatrixExecutions': 420, 'earlierFailedHarnessExecutions': 280, 'allArtifactFilesVerified': len(artifact_inventory), 'acceptedMatrixArtifactsVerified': 360, 'allResultFilesVerified': len(result_inventory), 'distinctRunIds': len(all_ids), 'actualHarnessDigestsDistinct': actual_harnesses, 'attempts': retained_attempts, 'caseComparison': comparison, 'sourceInputsUnchanged': True, 'browserRepeatability': 'UNRUN on final startup-repair candidate', 'minimality': 'UNVERIFIED: all three final neighbors return MISSING_STEPS, never an executed satisfying assertion', 'productChanges': 0}
(root / 'artifact-inventory.json').write_text(json.dumps(artifact_inventory, indent=2) + '\n')
(root / 'result-inventory.json').write_text(json.dumps(result_inventory, indent=2) + '\n')
(root / 'audit-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: value for key, value in receipt.items() if key not in ['caseComparison']}))
