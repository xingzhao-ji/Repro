import copy, datetime, hashlib, json, pathlib

repo = pathlib.Path('/workspace/repro-development-rv5abotj/repro')
root = repo / '.repro-runs/cloud-continuation/reduction-repeatability-review-v1/preflight'
prior = repo / '.repro-runs/cloud-continuation/compiled-test-development-v1/frozen-v3-bounded-node-pools/jobs/core-flow/artifacts/core-flow/1238d4ae-c987-4014-a7f0-a2229fbb844c/reduction.json'
core = json.loads(prior.read_text())['result']['manifest']
assert [a['id'] for a in core['actions']] == ['navigate', 'search-alpha', 'search-beta']
sha = lambda data: hashlib.sha256(data).hexdigest()
canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
cases = []
seen = set()
for action in core['actions']:
    removed = {action['id']}
    for dependent in core['actions']:
        if any(d in removed for d in dependent['dependsOn']):
            removed.add(dependent['id'])
    candidate = copy.deepcopy(core)
    candidate['actions'] = [a for a in candidate['actions'] if a['id'] not in removed]
    digest = sha(canonical(candidate).encode())
    if digest in seen:
        continue
    seen.add(digest)
    cases.append({'id': 'neighbor-remove-' + action['id'], 'kind': 'final-dependency-group-neighbor', 'removed': [a['id'] for a in core['actions'] if a['id'] in removed], 'manifest': candidate, 'expected': {'outcome': 'inconclusive', 'category': 'verification', 'code': 'MISSING_STEPS'}})
missing = copy.deepcopy(core)
missing['actions'] = [copy.deepcopy(core['actions'][0]), {'id': 'focus-before', 'kind': 'noise', 'value': 'focus', 'dependsOn': ['navigate']}, copy.deepcopy(core['actions'][1]), {'id': 'focus-after', 'kind': 'noise', 'value': 'focus', 'dependsOn': ['navigate']}]
cases.append({'id': 'control-missing-beta-with-noise', 'kind': 'missing-step-control', 'manifest': missing, 'expected': {'outcome': 'inconclusive', 'category': 'verification', 'code': 'MISSING_STEPS'}})
changed = copy.deepcopy(core)
changed['assertionDigest'] = '0' * 64
cases.append({'id': 'control-changed-oracle', 'kind': 'changed-oracle-control', 'manifest': changed, 'expected': {'outcome': 'inconclusive', 'category': 'verification', 'code': 'IDENTITY_MISMATCH'}})
boundary = copy.deepcopy(core)
boundary['boundary']['externalDependencies'] = ['https://example.invalid']
cases.append({'id': 'control-undeclared-boundary', 'kind': 'undeclared-boundary-control', 'manifest': boundary, 'expected': {'outcome': 'inconclusive', 'category': 'input', 'code': 'MANIFEST_VALUE'}})
cases.append({'id': 'control-pre-cancelled', 'kind': 'pre-cancelled-control', 'preCancelled': True, 'manifest': copy.deepcopy(core), 'expected': {'outcome': 'cancelled', 'category': 'cancelled', 'code': 'CANCELLED'}})
for case in cases:
    case['manifestDigest'] = sha(canonical(case['manifest']).encode())
formats = [
    {'id': 'source', 'adapter': 'src/adapter.ts', 'manifest': 'src/manifest.ts', 'nodeArguments': ['--import', 'tsx']},
    {'id': 'emitted', 'adapter': '.repro-runs/cloud-continuation/browser-lifetime-review-v1/emitted/src/adapter.js', 'manifest': '.repro-runs/cloud-continuation/browser-lifetime-review-v1/emitted/src/manifest.js', 'nodeArguments': []},
    {'id': 'installed', 'adapter': '.repro-runs/cloud-continuation/browser-lifetime-review-v1/nonbrowser-release/install/node_modules/repro-local/dist/index.js', 'manifest': '.repro-runs/cloud-continuation/browser-lifetime-review-v1/nonbrowser-release/install/node_modules/repro-local/dist/index.js', 'nodeArguments': []},
]
inputs = set()
for item in formats:
    module = repo / item['adapter']
    if item['id'] == 'installed':
        inputs.add(module)
        inputs.update((module.parent.parent / 'fixtures/browser-search').glob('*'))
    else:
        for name in ['adapter', 'manifest', 'oracle', 'fixture', 'contracts', 'paths']:
            inputs.add(module.parent / (name + module.suffix))
        inputs.update((module.parent.parent / 'fixtures/browser-search').glob('*'))
assert sha((repo / 'src/adapter.ts').read_bytes()) == '2727f237d460b98d620d5e2620547305d6d6e4d6e1c3c093f56419b2d475ee60'
plan = {
    'schemaVersion': 1, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Actual final-adapter nonbrowser rejected-input repeatability only; no browser/service/model substitute execution.',
    'repo': str(repo), 'outputRoot': str(root),
    'retainedReduction': {'path': str(prior.relative_to(repo)), 'sha256': sha(prior.read_bytes()), 'coreManifestDigest': sha(canonical(core).encode()), 'minimality': 'unverified'},
    'coreManifest': core, 'cases': cases, 'formats': formats,
    'inputs': [{'path': str(p.relative_to(repo)), 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())} for p in sorted(inputs)],
    'executionPolicy': {'repetitions': 20, 'maxRunBrowserExecutions': len(cases) * 20 * len(formats), 'ordering': 'Formats then cases then repetitions, strictly sequential; one fresh Node process per format and fresh cloned manifest/controller/output per runBrowser call; no retries.', 'perFormatTimeoutSeconds': 120, 'totalDriverDeadlineSeconds': 360, 'maxCombinedLogBytesPerFormat': 2097152, 'browserLaunchAllowed': False, 'httpListenAllowed': False, 'networkOrDockerAllowed': False, 'tsxCache': 'disabled'},
    'sentinels': ['Patch the chromium singleton resolved from the exact adapter/library module to a throwing launch sentinel; resolve its import and require entrypoints and assert object identity.', 'Patch node:http Server.prototype.listen to a throwing sentinel; assert zero observed calls after every actual adapter execution.', 'Restore both exact original descriptors in finally; fail closed on any unexpected call and stop subsequent cases.'],
    'comparison': {'withinFormat': 'All complete normalized result fields and independently read normalized evidence contents must match the first repetition.', 'allowedNormalization': ['run UUID to <RUN_ID>', 'startedAt and event at timestamps to <TIMESTAMP>', 'durationMs to <DURATION>', 'artifact path run UUID to <RUN_ID>; raw hash/byte count validated then compare normalized evidence hash/byte count'], 'crossFormat': 'Require all three actual harness digests distinct. Compare semantic result while retaining harness identities in a separate explicit comparison column; differences may be harnessDigest and normalized artifact SHA256 derived from that recorded field only. Record exact differing fields, never relabel format-specific harnesses identical.', 'rawIntegrity': 'Every evidence artifact size and SHA256 verified; JSON must equal returned result minus artifacts; no extra output files, symlinks, hardlinks or outside-scope paths.'},
    'requiredObservations': ['20 distinct run IDs per case/format, 420 globally distinct IDs', 'zero chromium.launch attempts, zero HTTP listens, zero emitted events and assertions, null observation, browser not-launched, appDigest empty (no application executed)', 'MISSING_STEPS remains inconclusive; precancelled remains cancelled and produces no adapter artifact', 'unchanged input/source bytes before and after'],
    'limitations': ['No current browser repeatability, target-failure reproduction, buggy/fixed comparison, cancellation acceptance or reduction minimality claim.', 'All final deletion neighbors are structurally valid but rejected as incomplete; their repeated rejection is not proof that the frozen requirement is satisfied.'],
}
(root / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n')
print(json.dumps({'plan': str(root / 'plan.json'), 'sha256': sha((root / 'plan.json').read_bytes()), 'cases': len(cases), 'executions': plan['executionPolicy']['maxRunBrowserExecutions'], 'neighbors': len(seen)}))
