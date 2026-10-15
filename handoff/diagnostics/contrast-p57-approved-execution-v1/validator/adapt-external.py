from pathlib import Path
p=Path(__file__).parent/'validate-approved-job.py';s=p.read_text()
s=s.replace('import hashlib, importlib.util, json, os, pathlib, re, stat, sys, tarfile','import argparse, hashlib, importlib.util, json, math, os, pathlib, re, stat, sys, tarfile\nfrom cleanup_gate import completed_cleanup')
s=s.replace("JOB = 'p390-00-11'", "JOB = 'p390-00-11'\nEXPECTED_BINDINGS_SHA256='456fd9b0403fe82a42cc5cb016a2320823a24f4934aa8bd22ecdef0819c6139b'\nOVERLAY_SHA256='124a9af10f7e3fb47508a0be9c6805f141872207df953f1ab3e1086607e568b1'\nEXPECTED_BINDINGS_PATH=TASK/'inputs/expected-bindings.json'\nEXPECTED_BINDINGS=None")
s=s.replace("def normal_browser_log(raw):\n", "def normal_browser_log(raw):\n    prior_issues=len(issues)\n")
s=s.replace("return {'browserPid':pid,'unexpectedFallbackLogLines':unexpected,'events':events,", "return {'browserPid':pid,'normalExit':len(issues)==prior_issues,'unexpectedFallbackLogLines':unexpected,'events':events,")
s=s.replace('contrast-p57-workload-lifecycle-probe.mjs','contrast-p57-approved-batch-probe.mjs').replace('contrast-p57-memory-batch-inputs.json','contrast-p57-approved-batch-inputs.json')
s=s.replace("s['scope']=='original-p390-00-11-lifecycle-diagnostic-only'", "s['scope']=='prospective-corrected-css-p57-batch'")
s=s.replace("    plan=load(RUNTIME/'plan.json');prep=", "    expected_contract=load(EXPECTED_BINDINGS_PATH);require(file_hash(EXPECTED_BINDINGS_PATH)[1]==EXPECTED_BINDINGS_SHA256,'EXPECTED_CONTRACT_HASH')\n    overlay=load(TASK/'inputs/overlay-manifest.json');require(file_hash(TASK/'inputs/overlay-manifest.json')[1]==OVERLAY_SHA256,'OVERLAY_HASH')\n    job_contract=expected_contract['jobs'][JOB]\n    plan=load(RUNTIME/'plan.json');prep=")
s=s.replace("len(manifest['entries'])==3622 and sum(e['type']=='file' for e in manifest['entries'])==3612 and sum(e['type']=='symlink' for e in manifest['entries'])==10", "sum(e['type']=='file' for e in manifest['entries'])==plan['input_file_count'] and sum(e['type']=='symlink' for e in manifest['entries'])==plan['input_symlink_count']==10 and len(manifest['entries'])==plan['input_file_count']+10")
a=s.index("    require([k for k in old if input_identity");b=s.index("    require(all(e.get('mode')",a)
s=s[:a]+'''    overlay_by_path={e['path']:e for e in overlay['files']}
    desired={k:input_identity(v) for k,v in old.items()}
    desired.update({e['path']:('file',e['bytes'],e['sha256']) for e in overlay['files']})
    require({k:input_identity(v) for k,v in expected.items()}==desired,'EXACT_APPROVED_INPUT_DELTA')
    for e in overlay['files']:require(file_hash(e['source'])==(e['bytes'],e['sha256']),'OVERLAY_SOURCE_'+e['path'])
    require(expected['contrast-p57-approved-batch-inputs.json']['sha256']==expected_contract['manifestSha256'] and expected['actual/study/P.html']['sha256']==expected_contract['candidateHtmlSha256'],'CORRECTED_CSS_AND_MANIFEST')
'''+s[b:]
s=s.replace("for field in ['source_freeze','input_bindings','independent_contract','independent_expectations']:", "for field in ['source_freeze','input_bindings','independent_contract','independent_expectations']:")
s=s.replace("{'regular_files':3612,'confined_symlinks':10}", "{'regular_files':plan['input_file_count'],'confined_symlinks':10}")
s=s.replace("=='lifecycle-workload-diagnostic-v1'", "=='contrast-p57-approved-execution-v1'")
s=s.replace("and receipt['elapsed_seconds']<=75", "and type(receipt['elapsed_seconds']) in (int,float) and math.isfinite(receipt['elapsed_seconds']) and 0<=receipt['elapsed_seconds']<=90")
a=s.index("    wanted={'resource-diagnostics/samples.ndjson'");b=s.index("    for e in artifacts['entries']:",a)
s=s[:a]+'''    state_id=job_contract['stateId'];count=job_contract['expectedNodeCount'];source_first=job_contract['nodes'][0]['sourceAuditNodeIndex']
    wanted={'resource-diagnostics/samples.ndjson','resource-diagnostics/lifecycle.ndjson','resource-diagnostics/completion.json',JOB+'/lifecycle-source.json',JOB+'/summary.json',JOB+'/controls-'+JOB+'.json',JOB+'/'+state_id+'-body-before.html',JOB+'/'+state_id+'-body-after.html',JOB+'/'+state_id+'-node-'+str(source_first)+'.png',JOB+'/screenshot-control-default.png',JOB+'/screenshot-control-initial.png'}|{JOB+'/node-'+JOB+'-'+str(i).zfill(3)+'.json' for i in range(count)}
    require({e['path'] for e in artifacts['entries']}==wanted and len(artifacts['entries'])==11+count,'ARTIFACT_SET')
'''+s[b:]
s=s.replace("TASK/'review/workload-evidence/workload_validator.py'", "TASK/'validator/workload-evidence/workload_validator.py'")
s=s.replace("helper.validate_workload(RUNTIME,jd,require)", "helper.validate_workload(RUNTIME,jd,require,JOB)")
s=s.replace("'ORIGINAL_WORKLOAD_INCOMPLETE'", "'APPROVED_WORKLOAD_INCOMPLETE'")
a=s.index("    verdict=zero_z_verdict(not issues)");s=s[:a]+'''    cleanup_observation=completed_cleanup(*[ndjson(read(folder/name,4194304))[0] for name in ('samples.ndjson','lifecycle.ndjson')],log_observation)
    require(cleanup_observation['status']=='PASS','COMPLETED_CLEANUP_'+cleanup_observation['status'])
    verdict='PASS' if not issues else 'STOP'
    print(json.dumps({'status':'CONTINUATION_GATES_PASS' if verdict=='PASS' else 'CONTINUATION_GATES_STOP','continuationGate':verdict,'diagnosticChecksComplete':not issues,'completedCleanupGate':cleanup_observation,'knownZSampleIds':known_z_sample_ids,'issues':issues,'workload':workload,'sidecar':sidecar_observation,'observation':observation,'browserLog':log_observation,'bindings':bindings,'limitations':['Prospective current corrected-CSS job only. Historical results remain unchanged.','Sampled completed cleanup is not continuous zombie absence or proof of harmlessness of every transient.','Source-complete unresolved observations are not contrast passes; global 57 completion requires all five distinct jobs.']},indent=2))
    return 0 if verdict=='PASS' else 1
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--runtime',required=True,type=pathlib.Path);ap.add_argument('--job',required=True,choices=['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32']);ap.add_argument('--bindings',type=pathlib.Path,default=EXPECTED_BINDINGS_PATH)
    args=ap.parse_args();RUNTIME=args.runtime.resolve();JOB=args.job;EXPECTED_BINDINGS_PATH=args.bindings.resolve()
    try:sys.exit(main())
    except Exception as error:
        print(json.dumps({'status':'INCOMPLETE_VALIDATION','continuationGate':'STOP','errorType':type(error).__name__,'issues':issues,'bindings':bindings,'knownZSampleIds':known_z_sample_ids},indent=2));sys.exit(2)
'''
p.write_text(s)
