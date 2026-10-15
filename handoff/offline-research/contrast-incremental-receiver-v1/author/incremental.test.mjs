import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as candidate from './transport.mjs';
import * as baseline from './baseline-transport.mjs';
function wire(value,limits={}){const state=baseline.createRemoteEncoder(value,{...baseline.DEFAULT_LIMITS,...limits});let text='';for(let i=0;;i++){const chunk=state.read(i);if(!chunk)return text;text+=chunk;}}
test('receiver exposes incremental graph decoder and does not join whole wire or parse tagged graph',()=>{
 assert.equal(typeof candidate.createIncrementalDecoder,'function');
 const source=readFileSync(new URL('./transport.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/chunks\s*=\s*\[\]|chunks\.push|chunks\.join|JSON\.parse\(text\)/);
});
test('incremental receiver matches sealed decoder through every split and one-unit chunks',()=>{
 const x={text:'x\n\u0000\ud800\udfff😀"\\',undefined:undefined,n:-0,a:[NaN,Infinity,-Infinity,23n]};x.self=x;x.alias=x.a;
 const text=wire(x);
 for(let cut=0;cut<=text.length;cut++){const d=candidate.createIncrementalDecoder();d.write(text.slice(0,cut));d.write(text.slice(cut));assert.deepStrictEqual(d.finish(),baseline.decodeGraph(text));}
 const d=candidate.createIncrementalDecoder();for(const unit of text.split(''))d.write(unit);assert.deepStrictEqual(d.finish(),baseline.decodeGraph(text));
});
test('incremental parser withholds graph until finish and clears state on abort/failure',()=>{
 const d=candidate.createIncrementalDecoder();assert.equal(d.write('["~o",1,[["a",["~a",2,[1,2,3]]]]'),undefined);assert.throws(()=>d.finish());assert.throws(()=>d.write(']'),/CLOSED/);
 const e=candidate.createIncrementalDecoder();e.write(wire({a:1}));e.abort();assert.throws(()=>e.finish(),/CLOSED/);
});
test('all encoder bytes are identical to sealed predecessor',()=>{assert.equal(candidate.createRemoteEncoder.toString(),baseline.createRemoteEncoder.toString());assert.deepStrictEqual(candidate.DEFAULT_LIMITS,baseline.DEFAULT_LIMITS);});
test('string budget applies to data and keys, not fixed protocol tag/special-number labels',()=>{
 for(const value of [{a:'b'},[NaN,Infinity,-Infinity,-0],undefined,1n]){
  const text=wire(value,{maxStringUnits:1});assert.deepStrictEqual(candidate.decodeGraph(text,{maxStringUnits:1}),baseline.decodeGraph(text,{maxStringUnits:1}));
 }
});
test('valid scalar and graph grammar matches predecessor, including noncanonical finite JSON numeric tokens',()=>{
 for(const text of ['null',' true ','false','0','-0','1.00','1e-1000',' 1e3 ','""','"\\uD800\\uDC00"','["~b","-0"]','["~a",1,[]]','["~o",1,[["constructor",["~r",1]],["01",true],["0",null]]]']){
  for(let size=1;size<=5;size++){const d=candidate.createIncrementalDecoder();for(let i=0;i<text.length;i+=size)d.write(text.slice(i,i+size));assert.deepStrictEqual(d.finish(),baseline.decodeGraph(text));}
 }
});
test('strict JSON and tagged grammar rejects malformed input and clears partial retained state',()=>{
 const texts=['',' ','{','[]','[1]','["~u",0]','["~a",1,[1,]]','["~o",1,[["a",1],]]','["~o",1,[["a",1],["a",2]]]','["~o",1,[["__proto__",1]]]','["~r",1]','["~a",1,[["~a",1,[]]]]','["~a",2,[]]','["~b","00"]','["~n","inf"]','1e10000','01','1.','-.5','1e+','true false','"\n"','"\\v"','"\\u00xz"','"unfinished','"\\u12','["~o",1,[["a",["~a",2,[1,2,3]]]]]extra'];
 for(const text of texts){const d=candidate.createIncrementalDecoder();assert.throws(()=>{for(const unit of text.split(''))d.write(unit);d.finish();},text);const state=d.inspect();for(const key of ['frames','tokenUnits','references'])assert.equal(state[key],0);assert.equal(state.closed,true);assert.equal(state.rootReady,false);d.abort();assert.throws(()=>d.finish(),/CLOSED/);}
});
test('receiver exact node/depth/string/unit budgets and failure cleanup',()=>{
 const value={a:[1,2]},text=wire(value),nodes=4;
 assert.deepStrictEqual(candidate.decodeGraph(text,{maxNodes:nodes,maxDepth:2,maxStringUnits:1}),value);
 for(const given of [{maxNodes:nodes-1},{maxDepth:1},{maxEncodedUnits:text.length-1,chunkUnits:1}]){
  const d=candidate.createIncrementalDecoder(given);assert.throws(()=>{d.write(text);d.finish();});assert.equal(d.inspect().references,0);assert.equal(d.inspect().frames,0);
 }
 assert.deepStrictEqual(candidate.decodeGraph(text,{maxEncodedUnits:text.length,chunkUnits:1}),value);
 assert.throws(()=>candidate.decodeGraph(wire({a:'xx'}),{maxStringUnits:1}),/STRING_LIMIT/);
});
test('no final graph is returned before metadata and encoded disposal succeed',async()=>{
 let releaseDispose;const release=new Promise(resolve=>releaseDispose=resolve),events=[];let released=false;
 function handle(value,kind){return {async evaluateHandle(fn,arg){return handle(fn(value,arg),'encoded');},async evaluate(fn,arg){events.push(arg===undefined?'metadata':'read');return fn(value,arg);},async dispose(){events.push('dispose-'+kind);if(kind==='encoded'){await release;released=true;}}};}
 const pending=candidate.transferMeasurement({async evaluateHandle(){return handle({a:1},'original');}},x=>x);let returned=false;pending.then(()=>returned=true);
 while(!events.includes('dispose-encoded'))await new Promise(resolve=>setImmediate(resolve));
 assert.equal(returned,false);assert.equal(released,false);assert.ok(events.includes('metadata'));releaseDispose();assert.deepStrictEqual(await pending,{a:1});assert.equal(released,true);
});
test('parser stack and scalar state remain bounded under one-unit streaming',()=>{
 let value='x'.repeat(1024);for(let i=0;i<16;i++)value=[value];const text=wire(value),d=candidate.createIncrementalDecoder({maxDepth:16,maxStringUnits:1024});
 for(const unit of text.split('')){d.write(unit);const s=d.inspect();assert.ok(s.frames<=18);assert.ok(s.tokenUnits<=1024);assert.ok(s.references<=16);}
 assert.deepStrictEqual(d.finish(),value);const s=d.inspect();assert.equal(s.frames,0);assert.equal(s.tokenUnits,0);assert.equal(s.references,0);
});
