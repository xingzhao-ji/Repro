"""Offline prospective expectations: frozen original descriptors, fixed partition,
packet and original semantic control contract; corrected candidate style bytes.
No runtime outcomes or historical verdicts are consumed/reinterpreted.
"""
from pathlib import Path
import hashlib,json,re,copy
ROOT=Path(__file__).resolve().parents[1]; HERE=Path(__file__).resolve().parent
BASE=ROOT.parent/'contrast-p57-memory-execution-v1/runtime/p390-00-11/input'
def packed(v):return json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
def sha(v):return hashlib.sha256(v).hexdigest()
original=json.loads((BASE/'frozen-v3-inputs.json').read_text());plan=json.loads((BASE/'batch-plan.json').read_text());packet=json.loads((BASE/'actual/packet.json').read_text())
sem=json.loads((HERE/'workload-evidence/semantic-expectations.json').read_text())
html=(ROOT/'inputs/actual/study/P.html').read_text();styles=re.findall(r'<style(?:\s[^>]*)?>(.*?)</style>',html,re.S)
assert sha(packed(styles))=='06504d654ace79a91d63504e9ab7e5657ebb96a3ffef3f95adbf54d990f521a8'
# The packet's trial vector is fixed and independently bound by the input manifest.
trials=next(j['job']['result']['trials'] for j in packet['evidence']['jobs'] if j['job']['id']==original['jobId'])
by_state={s['id']:s for s in original['states']};jobs={}
for batch in plan['batches']:
 state=by_state[batch['stateId']];nodes=[next(n for n in state['nodes'] if n['sourceAuditNodeIndex']==a['sourceAuditNodeIndex']) for a in batch['nodes']];ids=[]
 for n in nodes:
  binding=n['packetBinding'];trial=trials[binding['arrayIndex']];field=binding['field'];text=n['expectedText'];html=n['originalHtml']
  tag='P' if field=='reason' else 'TD' if field=='decision' else 'SPAN'
  attrs=[['class','trial-reason']] if field=='reason' else [] if field=='decision' else [['class','small muted trial-cost']]
  texts=[text] if field!='duration' else [text.removesuffix(' ms'),' ms']
  observed={'tag':tag,'attributes':attrs,'childElementCount':0,'textNodes':texts,'nodeTypes':[3]*len(texts),'text':text,'outerHTML':html,'trialButton':'Inspect trial '+str(binding['trialIndex']),'rowIndex':n['rowIndex'],'columnIndex':3 if field=='reason' else 4 if field=='decision' else 1,'group':binding['renderedGroup'],'region':'Reduction trials'}
  ids.append({'mode':'full-axe-html-plus-exact-frozen-trial-and-text-node-boundaries','packetBinding':binding,'trialSha256':sha(packed(trial)),'text':text,'textSha256':sha(text.encode()),'outerHTML':html,'outerHtmlSha256':sha(html.encode()),'observed':observed})
 selection=copy.deepcopy(sem['selection']);selection['stateId']=state['id']
 jobs[batch['id']]={'batch':batch,'stateId':state['id'],'viewport':state['viewport'],'selection':selection,'selectedOriginalNodes':nodes,'nodeIdentities':ids}
assert jobs['p390-00-11']['nodeIdentities']==sem['nodeIdentities']
sem.update(scope='Prospective five-job corrected-CSS expectations; historical semantic fields and 50 controls retained; observed outcomes not predicted.',jobs=jobs,styles=styles,stylesSha256=sha(packed(styles)),fullOccurrenceCount=57,executionOrder=['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32'])
sem['expectedControlCounts']=json.loads((HERE/'original-workload-expectations-20261015.json').read_text())['expectedControlCounts']
sem.pop('nodeIdentities');sem.pop('selection');sem.pop('parentExpectationsSHA256')
(HERE/'workload-evidence/prospective-expectations.json').write_text(json.dumps(sem,indent=2,ensure_ascii=False)+'\n')
print('prospective_sha256',sha((HERE/'workload-evidence/prospective-expectations.json').read_bytes()))
