// Offline prototype. Does not change sampler calculations, acceptance, or runtime gates.
export const DEFAULT_LIMITS=Object.freeze({chunkUnits:65536,maxEncodedUnits:16777216,maxStringUnits:1048576,maxNodes:1000000,maxDepth:128});
function checkedLimits(given={}){
 const result={...DEFAULT_LIMITS,...given};
 for(const [key,value] of Object.entries(result))if(!Object.hasOwn(DEFAULT_LIMITS,key)||!Number.isSafeInteger(value)||value<1||value>DEFAULT_LIMITS[key])throw new RangeError('TRANSPORT_INVALID_LIMIT:'+key);
 if(result.chunkUnits>result.maxEncodedUnits)throw new RangeError('TRANSPORT_INVALID_CHUNK_LIMIT');
 return result;
}
// This function is serialized unchanged into the result's realm; no closure dependencies.
// It emits strings incrementally instead of constructing a full second object envelope.
export function createRemoteEncoder(value,limits){
 const seen=new Map();let nodes=0,total=0,index=0,pending='',done=false;
 function quoted(text){if(text.length>limits.maxStringUnits)throw new Error('TRANSPORT_STRING_LIMIT');return JSON.stringify(text);}
 function* encode(item,depth){
  if(++nodes>limits.maxNodes)throw new Error('TRANSPORT_NODE_LIMIT');
  if(depth>limits.maxDepth)throw new Error('TRANSPORT_DEPTH_LIMIT');
  if(item===null){yield 'null';return;}
  if(item===undefined){yield '["~u"]';return;}
  if(typeof item==='boolean'){yield item?'true':'false';return;}
  if(typeof item==='string'){yield quoted(item);return;}
  if(typeof item==='number'){
   if(Object.is(item,-0)){yield '["~n","-0"]';return;}
   if(!Number.isFinite(item)){yield '["~n",'+JSON.stringify(String(item))+']';return;}
   yield String(item);return;
  }
  if(typeof item==='bigint'){yield '["~b",'+quoted(String(item))+']';return;}
  if(typeof item!=='object')throw new Error('TRANSPORT_UNSUPPORTED_TYPE');
  const array=Array.isArray(item),proto=Object.getPrototypeOf(item);
  if(proto!==(array?Array.prototype:Object.prototype))throw new Error('TRANSPORT_UNSUPPORTED_PROTOTYPE');
  if(seen.has(item)){yield '["~r",'+seen.get(item)+']';return;}
  const id=seen.size+1;seen.set(item,id);
  const keys=Reflect.ownKeys(item);
  for(const key of keys){
   if(typeof key!=='string'||key==='__proto__')throw new Error('TRANSPORT_UNSUPPORTED_KEY');
   const descriptor=Object.getOwnPropertyDescriptor(item,key);
   if(!descriptor||!('value' in descriptor))throw new Error('TRANSPORT_ACCESSOR_UNSUPPORTED');
   if(array&&key==='length')continue;
   if(!descriptor.enumerable)throw new Error('TRANSPORT_NONENUMERABLE_UNSUPPORTED');
   if(array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=item.length))throw new Error('TRANSPORT_ARRAY_PROPERTY_UNSUPPORTED');
  }
  if(array){
   yield '["~a",'+id+',[';
   for(let i=0;i<item.length;i++){
    if(!Object.hasOwn(item,i))throw new Error('TRANSPORT_SPARSE_ARRAY_UNSUPPORTED');
    if(i)yield ',';yield* encode(Object.getOwnPropertyDescriptor(item,String(i)).value,depth+1);
   }
   yield ']]';
  }else{
   yield '["~o",'+id+',[';
   for(let i=0;i<keys.length;i++){
    if(i)yield ',';yield '['+quoted(keys[i])+',';
    yield* encode(Object.getOwnPropertyDescriptor(item,keys[i]).value,depth+1);yield ']';
   }
   yield ']]';
  }
 }
 const generator=encode(value,0);
 return {
  read(requestIndex){
   if(requestIndex!==index++)throw new Error('TRANSPORT_SEQUENCE_INVALID');
   let chunk='';
   while(chunk.length<limits.chunkUnits){
    if(!pending){const next=generator.next();if(next.done){done=true;break;}pending=next.value;}
    const take=Math.min(limits.chunkUnits-chunk.length,pending.length);
    chunk+=pending.slice(0,take);pending=pending.slice(take);
    total+=take;if(total>limits.maxEncodedUnits)throw new Error('TRANSPORT_ENCODED_LIMIT');
   }
   return chunk;
  },
  metadata(){return {version:1,done,units:total,chunks:index,nodes};}
 };
}
export function decodeGraph(text,given={}){
 const limits=checkedLimits(given);
 if(typeof text!=='string'||text.length>limits.maxEncodedUnits)throw new Error('TRANSPORT_DECODE_SIZE');
 const wire=JSON.parse(text),refs=new Map();let nodes=0;
 function decode(item,depth){
  if(++nodes>limits.maxNodes||depth>limits.maxDepth)throw new Error('TRANSPORT_DECODE_LIMIT');
  if(item===null||typeof item==='boolean'||typeof item==='number'||typeof item==='string'){
   if(typeof item==='number'&&!Number.isFinite(item))throw new Error('TRANSPORT_BAD_NUMBER');
   if(typeof item==='string'&&item.length>limits.maxStringUnits)throw new Error('TRANSPORT_STRING_LIMIT');
   return item;
  }
  if(!Array.isArray(item)||typeof item[0]!=='string')throw new Error('TRANSPORT_BAD_TAG');
  const [tag,id,entries]=item;
  if(tag==='~u'&&item.length===1)return undefined;
  if(tag==='~n'&&item.length===2){if(id==='-0')return -0;if(id==='NaN')return NaN;if(id==='Infinity')return Infinity;if(id==='-Infinity')return -Infinity;}
  if(tag==='~b'&&item.length===2&&typeof id==='string'&&id.length<=limits.maxStringUnits&&/^-?(0|[1-9][0-9]*)$/.test(id))return BigInt(id);
  if(tag==='~r'&&item.length===2&&Number.isSafeInteger(id)&&refs.has(id))return refs.get(id);
  if((tag!=='~a'&&tag!=='~o')||item.length!==3||!Number.isSafeInteger(id)||id!==refs.size+1||!Array.isArray(entries))throw new Error('TRANSPORT_BAD_GRAPH');
  const output=tag==='~a'?[]:{};refs.set(id,output);
  for(const entry of entries){
   if(tag==='~a'){output.push(decode(entry,depth+1));continue;}
   if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||entry[0]==='__proto__'||entry[0].length>limits.maxStringUnits||Object.hasOwn(output,entry[0]))throw new Error('TRANSPORT_BAD_PROPERTY');
   Object.defineProperty(output,entry[0],{value:decode(entry[1],depth+1),enumerable:true,writable:true,configurable:true});
  }
  return output;
 }
 return decode(wire,0);
}
export async function transferMeasurement(locator,sampler,argument,given={}){
 const limits=checkedLimits(given);let original,encoded,output,error,failed=false;
 try{
  original=await locator.evaluateHandle(sampler,argument);
  encoded=await original.evaluateHandle(createRemoteEncoder,limits);
  // Encoder closure owns the completed result while strings are read. Original handle
  // is redundant and released immediately; no result mutation or forced GC occurs.
  const originalToDispose=original;original=undefined;await originalToDispose.dispose();
  const chunks=[];const maxCalls=Math.ceil(limits.maxEncodedUnits/limits.chunkUnits)+1;let units=0,ended=false;
  for(let index=0;index<maxCalls;index++){
   const chunk=await encoded.evaluate((state,i)=>state.read(i),index);
   if(typeof chunk!=='string'||chunk.length>limits.chunkUnits)throw new Error('TRANSPORT_BAD_CHUNK');
   if(!chunk.length){ended=true;break;}
   units+=chunk.length;if(units>limits.maxEncodedUnits)throw new Error('TRANSPORT_ENCODED_LIMIT');chunks.push(chunk);
  }
  if(!ended)throw new Error('TRANSPORT_CHUNK_LIMIT');
  const metadata=await encoded.evaluate(state=>state.metadata());
  if(metadata?.version!==1||metadata.done!==true||metadata.units!==units||metadata.chunks!==chunks.length+1||!Number.isSafeInteger(metadata.nodes)||metadata.nodes<1||metadata.nodes>limits.maxNodes)throw new Error('TRANSPORT_BAD_METADATA');
  // Dispose the browser graph before allocating Node's decoded graph.
  const encodedToDispose=encoded;encoded=undefined;await encodedToDispose.dispose();
  output=decodeGraph(chunks.join(''),limits);
 }catch(cause){failed=true;error=cause;}
 const disposeErrors=[];
 for(const handle of [encoded,original])if(handle)try{await handle.dispose();}catch(cause){disposeErrors.push(cause);}
 if(failed&&disposeErrors.length)throw new AggregateError([error,...disposeErrors],'TRANSPORT_FAILED_AND_DISPOSAL_FAILED',{cause:error});
 if(failed)throw error;
 if(disposeErrors.length)throw new AggregateError(disposeErrors,'TRANSPORT_DISPOSAL_FAILED');
 return output;
}
