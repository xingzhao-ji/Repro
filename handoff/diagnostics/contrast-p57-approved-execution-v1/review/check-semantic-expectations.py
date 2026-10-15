from pathlib import Path
import json,hashlib,re
T=Path(__file__).resolve().parent.parent;B=T.parent/'contrast-p57-memory-execution-v1/runtime/p390-00-11/input';O=T.parent/'lifecycle-workload-diagnostic-v1/review/workload-evidence/semantic-expectations.json'
p=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':')).encode();h=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((T/'validator/workload-evidence/prospective-expectations.json').read_text());old=json.loads(O.read_text());m=json.loads((B/'frozen-v3-inputs.json').read_text());plan=json.loads((B/'batch-plan.json').read_text());packet=json.loads((B/'actual/packet.json').read_text());candidate=json.loads((T/'inputs/expected-bindings.json').read_text());checks=[]
def c(v,label):
 assert v,label
 checks.append(label)
for k in old:
 if k not in ['styles','stylesSha256','nodeIdentities','selection','parentExpectationsSHA256','scope']:c(s[k]==old[k],'unchanged original semantic '+k)
styles=re.findall(r'<style>(.*?)</style>',(T/'inputs/actual/study/P.html').read_text(),re.S);c(s['styles']==styles and s['stylesSha256']==h(p(styles)),'actual candidate style bytes')
trials=next(j['job']['result']['trials'] for j in packet['evidence']['jobs'] if j['job']['id']==m['jobId'])
for b in plan['batches']:
 j=s['jobs'][b['id']];state=next(x for x in m['states'] if x['id']==b['stateId']);nodes=[next(n for n in state['nodes'] if n['sourceAuditNodeIndex']==r['sourceAuditNodeIndex']) for r in b['nodes']]
 c(j['batch']==b and j['selectedOriginalNodes']==nodes,'exact descriptors '+b['id']);c(j['viewport']==state['viewport'],'viewport '+b['id']);c(j['selection']=={**old['selection'],'stateId':state['id']},'selection '+b['id']);c(candidate['jobs'][b['id']]['selectedOriginalNodes']==nodes,'independent input/validator nodes '+b['id'])
 for n,i in zip(nodes,j['nodeIdentities']):
  bind=n['packetBinding'];text=n['expectedText'];field=n['field'];texts=[text[:-3],' ms'] if field=='duration' else [text]
  c(i['packetBinding']==bind and i['trialSha256']==h(p(trials[bind['arrayIndex']])) and i['text']==text and i['textSha256']==h(text.encode()) and i['outerHTML']==n['originalHtml'] and i['outerHtmlSha256']==h(n['originalHtml'].encode()),'packet and text '+b['id']+':'+str(n['sourceAuditNodeIndex']))
  c(i['observed']['textNodes']==texts and i['observed']['nodeTypes']==[3]*len(texts) and i['observed']['rowIndex']==n['rowIndex'] and i['observed']['group']==bind['renderedGroup'] and i['observed']['trialButton']=='Inspect trial '+str(bind['trialIndex']),'DOM expected '+b['id']+':'+str(n['sourceAuditNodeIndex']))
result={'status':'PASS_STATIC_EXPECTATION_REVIEW','checkCount':len(checks),'semanticSha256':h((T/'validator/workload-evidence/prospective-expectations.json').read_bytes()),'originalSemanticSha256':h(O.read_bytes()),'inputExpectedBindingsSha256':h((T/'inputs/expected-bindings.json').read_bytes()),'notes':['Frozen control descriptors and all50 checks unchanged.','All57 expected packet/text/DOM identities derive from original occurrence descriptors, packet and renderer; observed DOM must match at runtime.','Duration text uses renderer Math.round(durationMs) followed by literal ms text node; no rendering performed.']}
print(json.dumps(result,indent=2))
