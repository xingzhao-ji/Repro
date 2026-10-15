// Re-encode only already retained v3 observations; this executes no sampler/browser.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const audit=dirname(fileURLToPath(import.meta.url)),task=dirname(audit),source=join(task,'source');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=resolve(task,'../contrast-comparator-diagnostics-v1/runtime/contrast-p57-v3/jobs/contrast-p57-v3/artifacts/contrast-p57-v3/summary.json');
assert.equal(sha(await readFile(raw)),'aae719ed137110374c6df66cc0b8efe55c4673d7d744aca262dfc0bfab5cb109');
const storeBytes=await readFile(join(source,'evidence-store.mjs'));assert.equal(sha(storeBytes),'69f612126ed86aa550d14ffc0eac7161671b7a34ee701405a553e0298743b03a');
const {createEvidenceStore}=await import(pathToFileURL(join(source,'evidence-store.mjs')));
const result=JSON.parse(await readFile(raw,'utf8')),fields=['controls','screenshotControls','surfaceControls','guardBrowserControls','selectionBrowserControls'];
const expectedControls=Object.fromEntries(fields.map(key=>[key,sha(JSON.stringify(result[key]))]));
const expectedRows=result.nodes.map(row=>({sha256:sha(JSON.stringify(row)),steps:row.steps.map(step=>sha(JSON.stringify(step))),outsidePaint:row.steps.map(step=>({sha256:sha(JSON.stringify(step.outsidePaint)),count:step.outsidePaint.length}))}));
const originalStateNodes=JSON.stringify(result.states[0].nodes),out=await mkdtemp(join(audit,'retained-evidence-roundtrip-'));
const store=createEvidenceStore(out,result,{batchId:'retained-v3-fixture',expectedNodeCount:57});
await store.archiveControls();await store.save();
let assertions=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);assertions++;};
async function retrieve(ref){const bytes=await readFile(join(out,ref.file));eq(bytes.length,ref.bytes,'Exact artifact size');eq(sha(bytes),ref.sha256,'Exact artifact digest');eq(ref.acceptance,'PROVISIONAL','No acceptance claimed');return JSON.parse(bytes);}
const controls=await retrieve(result.controlArtifact);
for(const key of fields){eq(sha(JSON.stringify(controls[key])),expectedControls[key],'Complete control field roundtrip '+key);eq(Object.hasOwn(result,key),false,'Full control field released '+key);}
let distinctSteps=0,paintRecords=0;
for(let i=0;i<result.nodes.length;i++){
 const compact=result.nodes[i],artifact=await retrieve(compact.artifact),expected=expectedRows[i];
 eq(sha(JSON.stringify(artifact.row)),expected.sha256,'Every original actual row field preserved');
 eq(artifact.row.steps.map(step=>sha(JSON.stringify(step))),expected.steps,'Every complete original step preserved');
 eq(artifact.row.steps.map(step=>({sha256:sha(JSON.stringify(step.outsidePaint)),count:step.outsidePaint.length})),expected.outsidePaint,'Every distinct outside-paint array preserved');
 assert.ok(!Object.hasOwn(compact,'steps')&&!Object.hasOwn(compact,'characters')&&!Object.hasOwn(compact,'identity'));assertions++;
 distinctSteps+=new Set(expected.steps).size;paintRecords+=expected.outsidePaint.reduce((sum,x)=>sum+x.count,0);
 eq(compact.productChecksCompleted,false,'Old retained observations cannot invent new batch completion flag');
}
eq(distinctSteps,12,'All twelve distinct recorded product steps remain');eq(paintRecords,18972,'All18972 recorded outside-paint records remain');
eq(JSON.stringify(result.states[0].nodes),originalStateNodes,'State nodes retain only original index references');
eq(result.counts.completed,6,'Six locally retained rows');eq(result.checkpointCounts.productChecksCompleted,0,'No original retained row becomes new batch completion');
eq(result.counts.remaining,51,'51 observations remain without retained rows');eq(result.status,'started','Unfinalized original status preserved');
eq(Object.hasOwn(result.states[0],'selectionAfter'),false,'No after-selection fabricated');eq(Object.hasOwn(result.states[0],'bodyAfterArtifact'),false,'No after-body fabricated');
const summaryBytes=await readFile(join(out,'summary.json'));eq(JSON.parse(summaryBytes),result,'Checkpoint reconstructs compact result exactly');
eq(sha(await readFile(raw)),'aae719ed137110374c6df66cc0b8efe55c4673d7d744aca262dfc0bfab5cb109','Prior sealed summary remains unchanged');
eq(sha(await readFile(join(source,'evidence-store.mjs'))),sha(storeBytes),'Reviewed store unchanged');
const receipt={status:'PURE_LOSSLESS_RETENTION_REVIEW_PASS',scope:'Re-encoding of already retained v3 evidence only; no new measurement or runtime',assertions,evidenceStoreSha256:sha(storeBytes),originalSummarySha256:sha(await readFile(raw)),originalSummaryBytes:(await readFile(raw)).length,compactCheckpointBytes:summaryBytes.length,artifactDirectory:out,controlFieldCount:fields.length,productRows:expectedRows.length,distinctProductSteps:distinctSteps,outsidePaintRecords:paintRecords,sourceObservationComplete:false,memoryConclusion:'Output size reduction is observed; RSS reduction and future batch feasibility are unproven.',effects:{browser:false,docker:false,sourceMutation:false,priorTaskMutation:false},scriptSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
const receiptPath=join(audit,'lossless-retained-evidence-challenge-20261015.json');await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({receipt:receiptPath,sha256:sha(await readFile(receiptPath)),...receipt},null,2));
