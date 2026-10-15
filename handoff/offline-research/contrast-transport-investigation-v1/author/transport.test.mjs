import test from 'node:test';
import assert from 'node:assert/strict';
import {transferMeasurement} from './transport.mjs';
import {fixtures,fakeLocator,pinnedSerializer} from './fixture.mjs';
const identity=value=>value;
test('complete stored row through bounded handle transport',async()=>{
 const value=fixtures().rows[0].value,locator=fakeLocator(value);
 const recovered=await transferMeasurement(locator,identity,undefined);
 assert.deepStrictEqual(recovered,value);
 assert.equal(locator.stats.evaluate,0,'full-object evaluate return is eliminated');
 assert.ok(locator.stats.reads>1,'multiple bounded messages replace one full object');
 assert.ok(locator.stats.maxChunk<=65536);
 assert.equal(locator.stats.disposed,locator.stats.opened);
});
test('all 12 complete stored rows and complete controls evidence round-trip',async()=>{
 const {rows,controls}=fixtures();assert.equal(rows.length,12);assert.equal(controls.browserControlCounts.total,50);
 for(const {name,value} of [...rows,{name:'all-controls',value:controls}]){
  const locator=fakeLocator(value),recovered=await transferMeasurement(locator,identity);
  assert.deepStrictEqual(recovered,value,name);assert.equal(JSON.stringify(recovered),JSON.stringify(value),name+' complete serialized bytes');
  assert.equal(locator.stats.evaluate,0);assert.equal(locator.stats.disposed,2);assert.ok(locator.stats.maxChunk<=65536);
 }
});
test('aliases, cycles, own undefined, special numbers, bigint, keys and Unicode retain pinned Playwright semantics',async()=>{
 const value={u:undefined,n:NaN,p:Infinity,m:-Infinity,z:-0,b:123456789012345678901234567890n,text:'x😀\ud800\u0000',array:[undefined,NaN,-0],constructor:'literal',toString:'literal'};
 value.shared={clip:3};value.alias=value.shared;value.self=value;
 const locator=fakeLocator(value),actual=await transferMeasurement(locator,identity,undefined,{chunkUnits:17});
 assert.deepStrictEqual(actual,value);assert.equal(actual.shared,actual.alias);assert.equal(actual.self,actual);assert.ok(Object.hasOwn(actual,'u'));assert.ok(Object.is(actual.z,-0));
 const pw=pinnedSerializer();const native=pw.parse(JSON.parse(JSON.stringify(pw.serialize(value))));
 // Cross-realm Playwright objects are normalized only for prototype equality.
 const normalize=x=>structuredClone(x);
 assert.deepStrictEqual(normalize(actual),normalize(native));
});
test('unsupported values fail closed without invoking getters and release both handles',async()=>{
 let getterCalls=0;const getter={get x(){getterCalls++;throw Error('SHOULD_NOT_RUN');}};
 const cases=[getter,Object.create(null),new Date(),new Map(),new Set(),new Uint8Array([1]),()=>1,Symbol('x'),[1,,3],Object.assign([1],{extra:2}),Object.defineProperty({},'x',{value:1}),{[Symbol('k')]:1},JSON.parse('{"__proto__":1}')];
 for(const value of cases){const locator=fakeLocator(value);await assert.rejects(transferMeasurement(locator,identity),/TRANSPORT_/);assert.equal(locator.stats.disposed,locator.stats.opened);}
 assert.equal(getterCalls,0);
});
test('bounded limits reject invalid options before sampling and oversize/deep graphs without truncating',async()=>{
 for(const options of [{chunkUnits:0},{chunkUnits:1.5},{maxNodes:'1'},{maxDepth:999},{unknown:1}]){const locator=fakeLocator({a:1});await assert.rejects(transferMeasurement(locator,identity,undefined,options),/TRANSPORT_/);assert.equal(locator.stats.opened,0);}
 for(const [value,options] of [[{a:'abcdef'},{maxStringUnits:2}],[{a:{b:1}},{maxDepth:1}],[{a:1,b:2},{maxNodes:2}],[{a:'1234567890'},{maxEncodedUnits:24,chunkUnits:8}]]){const locator=fakeLocator(value);await assert.rejects(transferMeasurement(locator,identity,undefined,options),/TRANSPORT_/);assert.equal(locator.stats.disposed,locator.stats.opened);}
});
test('sampler, handle-open, read, corruption, disposal faults are surfaced with cleanup',async()=>{
 for(const fault of ['sample','open','read','corrupt','dispose']){const locator=fakeLocator({a:1},{fault});await assert.rejects(transferMeasurement(locator,identity));assert.equal(locator.stats.disposed,locator.stats.opened,fault);}
});

test('falsy rejection reasons are preserved rather than swallowed',async()=>{
 for(const reason of [undefined,null,false,0,'']){let resolved=false,caught=false;try{await transferMeasurement({async evaluateHandle(){throw reason;}},identity);resolved=true;}catch(actual){caught=true;assert.equal(actual,reason);}assert.equal(resolved,false);assert.equal(caught,true);}
});
