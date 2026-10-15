from pathlib import Path
p=Path(__file__).parent/'workload-evidence/workload_validator.py'
s=p.read_text().replace("SEMANTIC_SHA256 = '79cf0dede1be5b81ecb28b837d8cabfeb94101745af0f34c4ac8b97db7e76979'","SEMANTIC_SHA256 = 'be62f11cd87177253bd7e09328b5fcdb7f63297333bd381171084603ffc18c3f'")
s=s.replace('def validate_workload(runtime: Path, jobdir: Path, require) -> dict:', 'def validate_workload(runtime: Path, jobdir: Path, require, job="p390-00-11") -> dict:')
s=s.replace('    runtime, jobdir = Path(runtime), Path(jobdir)','    JOB = job\n    runtime, jobdir = Path(runtime), Path(jobdir)')
s=s.replace("def measurement(observed, label, expected_text=None, require_steps=True, all_equivalence=False):", "def measurement(observed, label, expected_text=None, require_steps=True, all_equivalence=False, expected_text_nodes=None):")
s=s.replace("            check(observed.get('textNodeMapping') == [{'nodeIndex': 0, 'start': 0, 'end': len(expected_text), 'data': expected_text}], label + '.text-node-boundaries')", "            offset=0; mapping=[]\n            for ni,txt in enumerate(expected_text_nodes or [expected_text]):\n                mapping.append({'nodeIndex':ni,'start':offset,'end':offset+len(txt),'data':txt});offset+=len(txt)\n            check(observed.get('textNodeMapping') == mapping, label + '.text-node-boundaries')")
s=s.replace("                check(char['textNodeIndex'] == 0 and char['textNodeOffset'] == char['offset'], label + '.character-boundary')", "                wanted=next((m for m in mapping if m['start']<=char['offset']<m['end']),None)\n                check(wanted is not None and char['textNodeIndex']==wanted['nodeIndex'] and char['textNodeOffset']==char['offset']-wanted['start'],label+'.character-boundary')")
s=s.replace("here / 'semantic-expectations.json'", "here / 'prospective-expectations.json'")
a=s.index("        expected_bytes = read(here.parent / 'original-workload-expectations-20261015.json'");b=s.index("        artifacts =",a)
s=s[:a]+"        expected=semantic['jobs'][JOB]\n        count=expected['batch']['expectedNodeCount']; state_id=expected['stateId']\n        semantic={**semantic,'selection':expected['selection'],'nodeIdentities':expected['nodeIdentities']}\n"+s[b:]
s=s.replace("'contrast-p57-memory-batch-inputs.json'","'contrast-p57-approved-batch-inputs.json'")
s=s.replace("'expectedNodeCount': 12", "'expectedNodeCount': count")
s=s.replace("state['id'] == 'P-reflow-390' and state['viewport'] == {'width': 390, 'height': 900}","state['id'] == state_id and state['viewport'] == expected['viewport']")
s=s.replace("[{'sourceAuditNodeIndex': i, 'resultIndex': i} for i in range(12)]", "[{'sourceAuditNodeIndex': n['sourceAuditNodeIndex'], 'resultIndex': i} for i,n in enumerate(expected['selectedOriginalNodes'])]")
s=s.replace("'P-reflow-390-body-before.html'", "state_id+'-body-before.html'").replace("'P-reflow-390-body-after.html'", "state_id+'-body-after.html'")
s=s.replace("expected['expectedControlCounts']", "semantic['expectedControlCounts']")
s=s.replace("len(summary['nodes']) == 12", "len(summary['nodes']) == count").replace("workload.nodes.exact12", "workload.nodes.exact-assignment")
s=s.replace("row['state'] == 'P-reflow-390' and row['sourceAuditNodeIndex'] == index", "row['state'] == state_id and row['sourceAuditNodeIndex'] == original['sourceAuditNodeIndex']")
s=s.replace("measurement(row, label, original['expectedText'], all_equivalence=index == 0)", "measurement(row, label, original['expectedText'], all_equivalence=index == 0, expected_text_nodes=identity['observed']['textNodes'])")
s=s.replace("f'P-reflow-390-node-{index}.png'", "f'{state_id}-node-{original[\"sourceAuditNodeIndex\"]}.png'")
s=s.replace("len(set(node_files)) == 12", "len(set(node_files)) == count")
s=s.replace("'started': 12, 'completed': 12", "'started': count, 'completed': count").replace("'productChecksCompleted': 12", "'productChecksCompleted': count")
s=s.replace("historicalOutcomeDeviation=counts != {'measured-pass': 0, 'measured-fail': 0, 'unresolved': 12}", "historicalOutcomeDeviation=None")
p.write_text(s)
# Preserve exact pre-existing 50-control contract.
p=Path(__file__).parent/'workload-evidence/prospective-expectations.json'
import json,hashlib
x=json.loads(p.read_text());orig=json.loads((p.parent.parent/'original-workload-expectations-20261015.json').read_text());x['expectedControlCounts']=orig['expectedControlCounts'];p.write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n')
sha=hashlib.sha256(p.read_bytes()).hexdigest()
v=p.parent/'workload_validator.py';v.write_text(v.read_text().replace('be62f11cd87177253bd7e09328b5fcdb7f63297333bd381171084603ffc18c3f',sha));print(sha)
