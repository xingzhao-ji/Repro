import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const startedAt=new Date().toISOString();
const [experiment,mode,bindingsPath,startupPath]=process.argv.slice(2);
assert.ok(['end-to-end','receiver-only'].includes(experiment));assert.ok(['prior','incremental'].includes(mode));assert.equal(typeof global.gc,'function');
assert.equal(process.env.NODE_OPTIONS,undefined);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bindingBytes=readFileSync(bindingsPath),bindings=JSON.parse(bindingBytes);
function verifyFiles(){return bindings.files.map(item=>{const bytes=readFileSync(item.path),actual=digest(bytes);assert.equal(actual,item.sha256,`SOURCE_CHANGED:${item.path}`);assert.equal(bytes.length,item.bytes);return {...item,actualSha256:actual};});}
const initialFiles=verifyFiles();
const startup={startedAt,pid:process.pid,experiment,mode,node:process.version,execPath:process.execPath,execArgv:process.execArgv,platform:process.platform,arch:process.arch,environment:process.env,bindingsSha256:digest(bindingBytes),files:initialFiles};
writeFileSync(startupPath,JSON.stringify(startup,null,2)+'\n',{flag:'wx'});
const prior=await import(pathToFileURL(bindings.priorModule).href);
const selected=mode==='prior'?prior:await import(pathToFileURL(bindings.incrementalModule).href);
const oracle=await import(pathToFileURL(bindings.oracleModule).href);
const fixture=await import(pathToFileURL(bindings.fixtureModule).href);
// Pin the unchanged encoder independently of any timed memory observations.
assert.equal(selected.createRemoteEncoder.toString(),prior.createRemoteEncoder.toString());
const pw=experiment==='end-to-end'?fixture.pinnedSerializer():null;
if(pw){assert.equal(pw.sourceSha256,bindings.playwrightBundleSha256);assert.equal(pw.package.version,bindings.playwrightVersion);}
const records=[];
for(const item of [...bindings.rows,{name:'synthetic-alias-cycle',synthetic:true}]){
 const synthetic=!!item.synthetic;
 let source=synthetic?oracle.syntheticGraph():JSON.parse(readFileSync(item.path)).row;
 const expected=oracle.expectedResult(prior,source,synthetic);
 let chunks;
 if(experiment==='receiver-only'){chunks=oracle.encodeChunks(prior,source);source=undefined;}
 global.gc();
 const before=process.memoryUsage();let maximumHeapUsed=before.heapUsed,maximumRSS=before.rss,messages=0,maxChunkUnits=0;
 const checkpoints={};
 function observe(label){const sample=process.memoryUsage();maximumHeapUsed=Math.max(maximumHeapUsed,sample.heapUsed);maximumRSS=Math.max(maximumRSS,sample.rss);checkpoints[label]=(checkpoints[label]??0)+1;}
 function send(value){const envelope=pw.serialize(value);observe('wire-serialized');const wire=JSON.stringify(envelope);observe('wire-stringified');const parsed=JSON.parse(wire);observe('wire-parsed');const decoded=pw.parse(parsed);observe('wire-decoded');return decoded;}
 function handle(value){return {
  async evaluateHandle(fn,arg){const result=await fn(value,arg);observe('handle-created');return handle(result);},
  async evaluate(fn,arg){const result=await fn(value,arg);if(typeof result==='string')maxChunkUnits=Math.max(maxChunkUnits,result.length);messages++;observe('evaluate-returned');return send(result);},
  async dispose(){value=undefined;observe('handle-disposed');}
 };}
 const began=performance.now();let output,decoderInspection;
 observe('transfer-start');
 if(experiment==='end-to-end')output=await selected.transferMeasurement({async evaluateHandle(fn,arg){return handle(await fn(source,arg));}},value=>value);
 else if(mode==='prior')output=prior.decodeGraph(chunks.join(''));
 else{
  const receiver=selected.createIncrementalDecoder();
  for(const chunk of chunks)receiver.write(chunk);
  output=receiver.finish();
  if(typeof receiver.inspect==='function')decoderInspection=receiver.inspect();
 }
 observe('transfer-finish');
 const elapsedMs=performance.now()-began,after=process.memoryUsage();
 oracle.assertResult(prior,output,expected,synthetic);
 records.push({name:item.name,sourceArtifactSha256:item.sha256??null,synthetic,expected,experiment,mode,elapsedMs,before,after,observedMaximumHeapUsed:maximumHeapUsed,observedHeapDelta:maximumHeapUsed-before.heapUsed,observedMaximumRSS:maximumRSS,observedRSSDelta:maximumRSS-before.rss,checkpointCounts:checkpoints,checkpointTotal:Object.values(checkpoints).reduce((n,x)=>n+x,0),messages,maxChunkUnits,precomputedChunks:chunks?.length??null,precomputedWireUnits:chunks?.reduce((n,c)=>n+c.length,0)??null,decoderInspection:decoderInspection??null,equivalence:'PASS'});
 output=undefined;source=undefined;chunks=undefined;global.gc();
}
const finalFiles=verifyFiles();assert.equal(digest(readFileSync(bindingsPath)),startup.bindingsSha256);
console.log(JSON.stringify({status:'PASS',experiment,mode,startup,finishedAt:new Date().toISOString(),finalFiles,node:process.version,playwrightVersion:pw?.package.version??null,playwrightBundleSha256:pw?.sourceSha256??null,gcPolicy:'explicit GC immediately before transfer and after releasing row; no explicit GC during transfer',measurementScope:'offline single fresh Node process; process maxRSS includes setup and assertions; no browser/cgroup',sourceRetention:experiment==='end-to-end'?'source remains reachable equally; browser and receiver simulated in one heap':'source released before transfer; same precomputed chunks deliberately remain reachable for both decoders',records,processResourceUsage:process.resourceUsage(),maxRSSKiB:process.resourceUsage().maxRSS,maxRSSMiB:process.resourceUsage().maxRSS/1024},null,2));
