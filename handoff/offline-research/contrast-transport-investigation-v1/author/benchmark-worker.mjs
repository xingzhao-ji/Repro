import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {transferMeasurement} from './transport.mjs';
import {artifacts,pinnedSerializer,sha} from './fixture.mjs';
const mode=process.argv[2];if(!['native','candidate'].includes(mode)||!global.gc)throw Error('BAD_BENCHMARK_MODE');
const pw=pinnedSerializer(),records=[];
for(const name of readdirSync(artifacts).filter(n=>/^node-.*\.json$/.test(n)).sort()){
 let source=JSON.parse(readFileSync(resolve(artifacts,name))).row;
 const expected=sha(JSON.stringify(source));global.gc();
 const before=process.memoryUsage();let maxHeap=before.heapUsed,maxRSS=before.rss,checkpoints=0,maxChunk=0,messages=0;
 function observe(){const m=process.memoryUsage();maxHeap=Math.max(maxHeap,m.heapUsed);maxRSS=Math.max(maxRSS,m.rss);checkpoints++;}
 // Fake realm boundary uses the exact staged Playwright encoder and decoder on each
 // message. All browser+driver allocations share this one Node heap: mechanism only.
 function send(value){const envelope=pw.serialize(value);observe();const wire=JSON.stringify(envelope);observe();const parsed=JSON.parse(wire);observe();const decoded=pw.parse(parsed);observe();return decoded;}
 const started=performance.now();let output;
 if(mode==='native')output=send(source);
 else{
  function handle(value){return {async evaluateHandle(fn,arg){const result=await fn(value,arg);observe();return handle(result);},async evaluate(fn,arg){let v=await fn(value,arg);if(typeof v==='string')maxChunk=Math.max(maxChunk,v.length);messages++;observe();return send(v);},async dispose(){value=undefined;observe();}};}
  output=await transferMeasurement({async evaluateHandle(fn,arg){return handle(await fn(source,arg));}},value=>value);
 }
 observe();const elapsedMs=performance.now()-started;
 assert.equal(sha(JSON.stringify(output)),expected);
 records.push({name,sourceArtifactSha256:sha(readFileSync(resolve(artifacts,name))),mode,elapsedMs,before,observedMaximumHeapUsed:maxHeap,observedHeapDelta:maxHeap-before.heapUsed,observedMaximumRSS:maxRSS,observedRSSDelta:maxRSS-before.rss,checkpoints,messages,maxChunkUnits:maxChunk,equivalence:'complete JSON bytes'});
 output=undefined;source=undefined;global.gc();
}
console.log(JSON.stringify({mode,node:process.version,playwrightVersion:pw.package.version,playwrightBundleSha256:pw.sourceSha256,method:'single Node heap combines remote and receiver; exact staged Playwright wire transform; checkpoints not allocation profiler; explicit gc only between rows; no browser or cgroup',records,maxRSSKiB:process.resourceUsage().maxRSS},null,2));
