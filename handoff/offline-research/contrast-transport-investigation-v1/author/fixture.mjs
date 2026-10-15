import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
export const repo=resolve(import.meta.dirname,'../../../..');
export const pilot=resolve(repo,'.repro-runs/cloud-continuation/contrast-p57-approved-execution-v1');
export const artifacts=resolve(pilot,'runtime/p390-00-11/jobs/p390-00-11/artifacts/p390-00-11');
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function fixtures(){
 const rows=readdirSync(artifacts).filter(n=>/^node-.*\.json$/.test(n)).sort().map(n=>({name:n,value:JSON.parse(readFileSync(resolve(artifacts,n))).row,sha256:sha(readFileSync(resolve(artifacts,n)))}));
 const controls=JSON.parse(readFileSync(resolve(artifacts,'controls-p390-00-11.json')));
 return {rows,controls};
}
export function pinnedSerializer(){
 const path=resolve(pilot,'runtime/p390-00-11/input/node_modules/playwright-core/lib/coreBundle.js');
 const bytes=readFileSync(path);const line=bytes.toString().split('\n').find(x=>x.startsWith('    source4 = ')&&x.includes('packages/injected/src/utilityScript.ts'));
 if(!line)throw Error('PINNED_SERIALIZER_NOT_FOUND');
 const source=vm.runInNewContext(line.trim().slice('source4 = '.length).replace(/;$/,''));
 const context={module:{exports:{}},URL,Error,Date,RegExp,Map,Set,ArrayBuffer,Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array,btoa,atob};
 vm.createContext(context);vm.runInContext(source,context);
 const serialize=value=>context.serializeAsCallArgument(value,v=>({fallThrough:v}));
 const parse=value=>context.parseEvaluationResultValue(value);
 return {serialize,parse,sourceSha256:sha(bytes),package:JSON.parse(readFileSync(resolve(pilot,'runtime/p390-00-11/input/node_modules/playwright-core/package.json')))};
}
export function fakeLocator(value,{fault}={}){
 const stats={evaluate:0,opened:0,disposed:0,reads:0,maxChunk:0};
 function handle(item){stats.opened++;let disposed=false;return {
 async evaluateHandle(fn,arg){if(fault==='open')throw Error('OPEN_FAULT');return handle(await fn(item,arg));},
 async evaluate(fn,arg){if(fault==='read')throw Error('READ_FAULT');stats.reads++;let result=await fn(item,arg);if(typeof result==='string'){stats.maxChunk=Math.max(stats.maxChunk,result.length);if(fault==='corrupt')result='!'+result.slice(1);}return result;},
 async dispose(){if(disposed)throw Error('DOUBLE_DISPOSE');disposed=true;stats.disposed++;if(fault==='dispose')throw Error('DISPOSE_FAULT');}
 };}
 return {stats,async evaluate(fn,arg){stats.evaluate++;return await fn(value,arg);},async evaluateHandle(fn,arg){if(fault==='sample')throw Error('SAMPLE_FAULT');return handle(await fn(value,arg));}};
}
