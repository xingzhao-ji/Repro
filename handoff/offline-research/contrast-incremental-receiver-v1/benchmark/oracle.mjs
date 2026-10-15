import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function syntheticGraph(){
 const shared={title:'shared',zero:-0,notNumber:NaN,positive:Infinity,negative:-Infinity,missing:undefined,big:12345678901234567890n,text:'line\nquote"backslash\\surrogate\ud800pair😀'};
 const root={shared,alias:shared,array:[shared,null,true,false,0,'',undefined]};root.self=root;shared.owner=root;
 return root;
}
export function encodeChunks(module,value){
 const encoder=module.createRemoteEncoder(value,module.DEFAULT_LIMITS),chunks=[];
 for(let index=0;index<=Math.ceil(module.DEFAULT_LIMITS.maxEncodedUnits/module.DEFAULT_LIMITS.chunkUnits);index++){
  const chunk=encoder.read(index);assert.equal(typeof chunk,'string');assert.ok(chunk.length<=module.DEFAULT_LIMITS.chunkUnits);
  if(!chunk.length){const metadata=encoder.metadata();assert.equal(metadata.done,true);assert.equal(metadata.units,chunks.reduce((n,c)=>n+c.length,0));assert.equal(metadata.chunks,chunks.length+1);return chunks;}
  chunks.push(chunk);
 }
 throw Error('ORACLE_ENCODER_DID_NOT_FINISH');
}
export function canonicalHash(module,value){const digest=createHash('sha256');for(const chunk of encodeChunks(module,value))digest.update(chunk);return digest.digest('hex');}
export function expectedResult(module,value,synthetic){return synthetic?{kind:'canonical graph bytes and explicit alias assertions',sha256:canonicalHash(module,value)}:{kind:'complete JSON.stringify bytes',sha256:sha(JSON.stringify(value))};}
export function assertResult(module,output,expected,synthetic){
 if(!synthetic){assert.equal(sha(JSON.stringify(output)),expected.sha256);return;}
 assert.equal(canonicalHash(module,output),expected.sha256);assert.equal(output.self,output);assert.equal(output.alias,output.shared);assert.equal(output.array[0],output.shared);assert.equal(output.shared.owner,output);
 assert.equal(Object.is(output.shared.zero,-0),true);assert.equal(Number.isNaN(output.shared.notNumber),true);assert.equal(output.shared.positive,Infinity);assert.equal(output.shared.negative,-Infinity);assert.equal(output.shared.missing,undefined);assert.equal(output.shared.big,12345678901234567890n);
}
