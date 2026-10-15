import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {selectBatch} from './verification-inputs/batch-partition.mjs';
const here=new URL('./',import.meta.url),base=new URL('../../contrast-p57-memory-execution-v1/runtime/p390-00-11/input/',import.meta.url);
const load=(p)=>JSON.parse(readFileSync(p));const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=load(new URL('contrast-p57-approved-batch-inputs.json',here)),plan=load(new URL('batch-plan.json',base)),overlay=load(new URL('overlay-manifest.json',here));
const styles=[...readFileSync(new URL('actual/study/P.html',here),'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]);
const result={schemaVersion:1,status:'STATIC_EXPECTATIONS_NOT_RUNTIME_RESULTS',sourceScope:overlay.sourceScope,executedCaller:{file:overlay.callerPath,sha256:overlay.callerSha256},manifestSha256:overlay.consumedManifestSha256,planSha256:overlay.batchPlanSha256,frozenManifestSha256:overlay.frozenManifestSha256,candidateHtmlSha256:overlay.candidateHtmlSha256,styles,stylesSha256:hash(JSON.stringify(styles)),packetSha256:overlay.packetSha256,controlCounts:{screenshots:2,sampler:6,surface:9,guards:10,selection:23,total:50},caseSha256:manifest.caseSha256,jobId:manifest.jobId,sessionId:manifest.sessionId,route:manifest.route,verifiedInputs:[...manifest.sourceFiles,...manifest.probeSources,...manifest.batchInputFiles],jobs:{}};
for(const id of plan.executionOrder){const {batch,state,nodes}=selectBatch(manifest,plan,id);result.jobs[id]={batchId:id,stateId:state.id,viewport:state.viewport,selectedTrial:state.selectedTrial,expectedNodeCount:nodes.length,assigned:batch.nodes,selectedOriginalNodes:nodes,selectedState:state};}
writeFileSync(new URL('expected-bindings.json',here),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({jobs:Object.keys(result.jobs),occurrences:Object.values(result.jobs).reduce((n,j)=>n+j.expectedNodeCount,0),file:'expected-bindings.json',sha256:hash(readFileSync(new URL('expected-bindings.json',here)))}));
