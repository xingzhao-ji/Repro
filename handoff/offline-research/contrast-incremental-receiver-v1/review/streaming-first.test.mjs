import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRemoteEncoder,createIncrementalDecoder,decodeGraph,transferMeasurement,DEFAULT_LIMITS} from '../author/transport.mjs';
import {decodeGraph as priorDecode} from '../../contrast-transport-investigation-v1/author/transport.mjs';
import {nativeRoundtrip} from './native-oracle.mjs';

const art=new URL('../../contrast-p57-approved-execution-v1/runtime/p390-00-11/jobs/p390-00-11/artifacts/p390-00-11/',import.meta.url);
function encode(value,given={}){const encoder=createRemoteEncoder(value,{...DEFAULT_LIMITS,...given}),parts=[];for(let i=0;i<100000;i++){const c=encoder.read(i);if(!c)return parts.join('');parts.push(c);}throw Error('Independent encoder bound');}
function decodeParts(parts,given={}){const d=createIncrementalDecoder(given);for(const part of parts)assert.equal(d.write(part),undefined,'write exposes no partial value');return d.finish();}
function eachSplit(text,callback){for(let i=0;i<=text.length;i++)callback([text.slice(0,i),text.slice(i)],i);callback([...text].flatMap(c=>c.length===2?[c[0],c[1]]:[c]),'one-unit');}
function expectInvalidEverySplit(text){assert.throws(()=>priorDecode(text),'prior rejects malformed baseline');eachSplit(text,parts=>assert.throws(()=>decodeParts(parts),'stream parser rejects '+JSON.stringify(text)));}

const shared={unicode:'\u0000\b\f\n\r\t"\\/é中🙂\ud800\udfff',ownUndefined:undefined,z:-0,nan:NaN,positive:Infinity,negative:-Infinity,big:12345678901234567890123456789n};
const graph={array:[shared,shared],ownUndefined:undefined,constructor:3,toString:4};shared.root=graph;graph.self=graph;
for(const [name,value] of Object.entries({graph,null:null,false:false,true:true,zero:0,negative:-1,decimal:0.0000000000003,string:'x\u0000🙂\ud800',undefined:undefined,bigint:0n,empty:[],emptyObject:{}}))test('all split boundaries preserve native ordinary graph '+name,()=>{
 const text=encode(value),expected=nativeRoundtrip(value);eachSplit(text,parts=>assert.deepStrictEqual(decodeParts(parts),expected));
 if(name==='graph'){const out=decodeParts([...text]);assert.equal(out.array[0],out.array[1]);assert.equal(out.array[0].root,out);assert.equal(out.self,out);assert.equal(Object.hasOwn(out,'ownUndefined'),true);assert.equal(Object.hasOwn(out,'absent'),false);assert.deepStrictEqual(Object.keys(out),Object.keys(value));}
});
test('valid JSON whitespace and numeric grammar independent of canonical encoder',()=>{
 for(const text of [' \t\r\n true \n','  -0  ','0.0','1e2','1E+2','-1.234e-5',' [ "~o" , 1 , [ [ "x" , [ "~a",2,[1,2,3] ] ] ] ] ','"\\uD800\\uDC00\\/\\b\\f\\n\\r\\t"'])eachSplit(text,parts=>assert.deepStrictEqual(decodeParts(parts),priorDecode(text)));
});
const invalidGrammar={
 empty:['',' ','\t\n'],
 numbers:['+1','01','-01','--1','1.','1.e1','.1','-.1','1e','1e+','1e-','1e++2','NaN','Infinity','-Infinity','1e99999','0x12'],
 literals:['nul','Null','truefalse','false0','nullx','undefined','TRUE'],
 strings:['"x','"\\','"\\x00"','"\\v"','"\\u123"','"\\u12xz"','"\n"','"\u0000"','"\t"'],
 separators:['[]','["~u",]','["~a",1,[1,]]','["~a",1,[,1]]','["~a",1,[1 2]]','["~o",1,[["x" 2]]]','["~o",1,[["x",2],]]','["~o",1,[["x",2,3]]]'],
 trailing:['null null','1 2','"x" "y"','["~u"]true','["~a",1,[]][]','["~o",1,[]]x'],
 objects:['{}','{"a":1}','["~a",1,[{}]]'],
 tags:['[1]','[null]','[true]','["bad"]','["~u",0]','["~n"]','["~n","x"]','["~n","NaN",0]','["~b"]','["~b",0]','["~b","+1"]','["~b","01"]','["~b","1.2"]','["~r",1]','["~r",0]','["~r",1,0]'],
 graphs:['["~a",0,[]]','["~a",2,[]]','["~a",1.1,[]]','["~a",1,[],0]','["~a",1,null]','["~a",1,[["~a",1,[]]]]','["~a",1,[["~a",3,[]]]]','["~a",1,[["~r",2]]]','["~o",1,[["x",1],["x",2]]]','["~o",1,[["x",1],["\\u0078",2]]]','["~o",1,[["__proto__",1]]]','["~o",1,[["__pro\\u0074o__",1]]]','["~o",1,[[1,2]]]','["~o",1,[["x"]]]','["~o",1,["x"]]']
};
for(const [category,texts] of Object.entries(invalidGrammar))test('strict JSON/tag grammar every boundary '+category,()=>{for(const text of texts)expectInvalidEverySplit(text);assert.equal({}.polluted,undefined);});
test('every incomplete prefix of a nested graph fails without a partial return',()=>{const wire=encode(graph);for(let n=0;n<wire.length;n++){const d=createIncrementalDecoder();for(const c of wire.slice(0,n))d.write(c);assert.throws(()=>d.finish());assert.throws(()=>d.finish());}});
test('single-use terminal lifecycle prevents reuse or partial recovery',()=>{for(const reason of ['abort','success','failure']){const d=createIncrementalDecoder();if(reason==='abort'){d.write('["~o",1,[["x",');d.abort();d.abort();}if(reason==='success'){d.write('null');assert.equal(d.finish(),null);}if(reason==='failure'){assert.throws(()=>d.write('!'));}assert.throws(()=>d.write('null'));assert.throws(()=>d.finish());}});
test('input and output preserve safe own names and insertion order',()=>{const value={};for(const name of ['10','2','b','toString','constructor','hasOwnProperty','a'])Object.defineProperty(value,name,{value:undefined,enumerable:true,writable:true,configurable:true});const out=decodeParts([...encode(value)]);assert.deepStrictEqual(Object.keys(out),Object.keys(value));assert.deepStrictEqual(Object.getOwnPropertyDescriptors(out),Object.getOwnPropertyDescriptors(nativeRoundtrip(value)));});
test('decoded strings bounded by decoded UTF16 units, not escape text',()=>{assert.equal(decodeParts(['"\\u','0061"'],{maxStringUnits:1}), 'a');assert.throws(()=>decodeParts(['"\\u0061\\u0062"'],{maxStringUnits:1}));assert.equal(decodeParts(['"\ud800"'],{maxStringUnits:1}), '\ud800');assert.throws(()=>decodeParts(['"🙂"'],{maxStringUnits:1}));assert.throws(()=>decodeParts(['["~o",1,[["ab",0]]]'],{maxStringUnits:1}));});
test('receiver independently enforces total wire, depth and nodes across writes',()=>{
 const text=encode({a:{b:1}});assert.deepStrictEqual(decodeParts([...text],{maxEncodedUnits:text.length,chunkUnits:1}),{a:{b:1}});assert.throws(()=>decodeParts([...text],{maxEncodedUnits:text.length-1,chunkUnits:1}));assert.throws(()=>decodeParts([...text],{maxNodes:2}));assert.throws(()=>decodeParts([...text],{maxDepth:1}));assert.deepStrictEqual(decodeParts([...text],{maxNodes:3,maxDepth:2}),{a:{b:1}});
});
test('scalar number with enormous token fails within finite encoded budget',()=>{const d=createIncrementalDecoder({maxEncodedUnits:1000,chunkUnits:10});assert.throws(()=>{for(let i=0;i<102;i++)d.write('1'.repeat(10));d.finish();});assert.throws(()=>d.finish());});
test('mechanism discriminator rejects predecessor whole-wire JSON parse but permits incremental scalar tokens',()=>{const value={a:Array.from({length:20},(_,i)=>({n:i,text:'literal [ is scalar '+i}))},wire=encode(value),old=JSON.parse;let blocked=0,scalars=0;JSON.parse=function(text,...args){if(typeof text==='string'&&/^[\s]*[\[{]/.test(text)){blocked++;throw Error('Independent whole-graph parse forbidden');}scalars++;return old.call(this,text,...args);};try{assert.throws(()=>priorDecode(wire),/whole-graph/);assert.equal(blocked,1);assert.deepStrictEqual(decodeParts([...wire]),value);assert.equal(blocked,1,'candidate never sends graph JSON to JSON.parse');}finally{JSON.parse=old;}assert.ok(scalars>0,'real scalar tokenizer exercised');});
test('write rejects nonstrings and parser cannot revive after invalid input',()=>{for(const x of [null,undefined,false,0,[],{}]){const d=createIncrementalDecoder();assert.throws(()=>d.write(x));assert.throws(()=>d.finish());}});
for(const name of readdirSync(art).filter(x=>/^node-.*\.json$|^controls-.*\.json$/.test(x)).sort())test('complete archived evidence through incremental chunks '+name,()=>{const archived=JSON.parse(readFileSync(new URL(name,art))),source=name.startsWith('node-')?archived.row:archived,wire=encode(source),d=createIncrementalDecoder();for(let i=0;i<wire.length;i+=4093)d.write(wire.slice(i,i+4093));const out=d.finish();assert.deepStrictEqual(out,nativeRoundtrip(source));assert.equal(JSON.stringify(out),JSON.stringify(source));});

function fake(value,{phase,reason,disposeKind,disposeReason,patchMeta,patchChunk}={}){
 const handles=[],events=[];function handle(v,kind){const h={kind,n:0,async evaluateHandle(fn,arg){events.push('encode');if(phase==='encode')throw reason;return handle(fn(v,arg),'encoded');},async evaluate(fn,arg){const op=arg===undefined?'metadata':'chunk-'+arg;events.push(op);if(phase===op)throw reason;const ret=fn(v,arg);return op==='metadata'&&patchMeta?{...ret,...patchMeta}:op.startsWith('chunk-')&&patchChunk?patchChunk(ret,arg):ret;},async dispose(){this.n++;events.push('dispose-'+kind);if(kind===disposeKind)throw disposeReason;}};handles.push(h);return h;}return{handles,events,async evaluateHandle(fn,arg){if(phase==='sample')throw reason;return handle(fn(value,arg),'original');}};
}
for(const phase of ['sample','encode','chunk-0','chunk-1','metadata'])for(const reason of [undefined,null,false,0,''])test('falsy primary rejected with exactly one disposal '+phase+'/'+String(reason),async()=>{const f=fake({a:'long string'},{phase,reason});let threw=false;try{await transferMeasurement(f,x=>x,null,{chunkUnits:2});}catch(error){threw=true;assert.equal(error,reason);}assert.equal(threw,true);assert.ok(f.handles.every(h=>h.n===1));});
for(const kind of ['original','encoded'])for(const reason of [undefined,null,false,0,''])test('falsy cleanup rejected with exactly one attempt '+kind+'/'+String(reason),async()=>{const f=fake({a:1},{disposeKind:kind,disposeReason:reason});let rejected=false;try{await transferMeasurement(f,x=>x,null);}catch(error){rejected=true;assert.ok(error===reason||error instanceof AggregateError);}assert.equal(rejected,true);assert.ok(f.handles.every(h=>h.n===1));});
test('primary and falsy cleanup causes remain distinct',async()=>{const f=fake({a:1},{phase:'chunk-1',reason:false,disposeKind:'encoded',disposeReason:undefined});await assert.rejects(()=>transferMeasurement(f,x=>x,null,{chunkUnits:2}),error=>{assert.equal(error instanceof AggregateError,true);assert.deepStrictEqual(error.errors,[false,undefined]);assert.equal(error.cause,false);return true;});assert.ok(f.handles.every(h=>h.n===1));});
test('malformed suffix rejects after substantial partial graph and disposes handles',async()=>{const text=encode({a:Array.from({length:20},(_,i)=>({n:i}))}),f=fake(null,{patchChunk:(_,i)=>i*17>=text.length?'':text.slice(i*17,(i+1)*17)+(i===Math.floor((text.length-1)/17)?'!':'')});await assert.rejects(()=>transferMeasurement(f,x=>x,null,{chunkUnits:18}));assert.ok(f.handles.every(h=>h.n===1));});
