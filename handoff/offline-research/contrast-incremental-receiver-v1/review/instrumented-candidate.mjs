export let reviewCreatedDecoder;
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
// One scalar token and a depth-bounded grammar stack feed the final graph directly.
// No whole-wire string, tagged-object graph, or retained array of transport chunks.
export function createIncrementalDecoder(given={}){
 const limits=checkedLimits(given),refs=new Map();
 const stack=[{state:'rootValue',depth:0}];
 let root,rootReady=false,closed=false,units=0,nodes=0,mode='normal',scalar='',escapeDigits='';
 function clear(){root=undefined;rootReady=false;refs.clear();stack.length=0;scalar='';escapeDigits='';mode='normal';closed=true;}
 function fail(message){throw new Error(message);}
 function append(text){
  const frame=stack[stack.length-1];
  // Fixed protocol labels were never subject to the user-data string budget.
  const limit=frame.state==='tag'?2:frame.state==='argument'&&frame.tag==='~n'?9:limits.maxStringUnits;
  scalar+=text;if(scalar.length>limit)fail('TRANSPORT_STRING_LIMIT');
 }
 function deliver(value){
  const frame=stack[stack.length-1];
  if(frame.state==='rootValue'){root=value;rootReady=true;frame.state='rootDone';}
  else if(frame.state==='arrayFirst'||frame.state==='arrayValue'){frame.output.push(value);frame.state='arrayAfter';}
  else if(frame.state==='propertyValue'){Object.defineProperty(frame.output,frame.key,{value,enumerable:true,writable:true,configurable:true});frame.key=undefined;frame.state='propertyEnd';}
  else fail('TRANSPORT_BAD_GRAPH');
 }
 function beginValue(kind,value,depth){
  if(++nodes>limits.maxNodes||depth>limits.maxDepth)fail('TRANSPORT_DECODE_LIMIT');
  if(kind==='['){stack.push({state:'tag',depth});return;}
  if(kind!=='string'&&kind!=='number'&&kind!=='literal')fail('TRANSPORT_BAD_TAG');
  deliver(value);
 }
 function finishFrame(value){stack.pop();deliver(value);}
 function token(kind,value){
  const frame=stack[stack.length-1];
  switch(frame.state){
   case 'rootValue':beginValue(kind,value,0);return;
   case 'rootDone':fail('TRANSPORT_TRAILING_DATA');break;
   case 'tag':
    if(kind!=='string'||!['~u','~n','~b','~r','~a','~o'].includes(value))fail('TRANSPORT_BAD_TAG');
    frame.tag=value;frame.state=value==='~u'?'undefinedEnd':'tagComma';return;
   case 'undefinedEnd':if(kind!==']')fail('TRANSPORT_BAD_TAG');finishFrame(undefined);return;
   case 'tagComma':if(kind!==',')fail('TRANSPORT_BAD_GRAPH');frame.state='argument';return;
   case 'argument':
    if(frame.tag==='~n'){
     if(kind!=='string'||!['-0','NaN','Infinity','-Infinity'].includes(value))fail('TRANSPORT_BAD_NUMBER');
     frame.output=value==='-0'?-0:Number(value);frame.state='scalarEnd';return;
    }
    if(frame.tag==='~b'){
     if(kind!=='string'||!(/^-?(0|[1-9][0-9]*)$/).test(value))fail('TRANSPORT_BAD_GRAPH');
     frame.output=BigInt(value);frame.state='scalarEnd';return;
    }
    if(kind!=='number'||!Number.isSafeInteger(value))fail('TRANSPORT_BAD_GRAPH');
    if(frame.tag==='~r'){
     if(!refs.has(value))fail('TRANSPORT_BAD_GRAPH');frame.output=refs.get(value);frame.state='scalarEnd';return;
    }
    if(value!==refs.size+1)fail('TRANSPORT_BAD_GRAPH');
    frame.output=frame.tag==='~a'?[]:{};refs.set(value,frame.output);frame.state='entriesComma';return;
   case 'scalarEnd':if(kind!==']')fail('TRANSPORT_BAD_GRAPH');finishFrame(frame.output);return;
   case 'entriesComma':if(kind!==',')fail('TRANSPORT_BAD_GRAPH');frame.state='entriesStart';return;
   case 'entriesStart':if(kind!=='[')fail('TRANSPORT_BAD_GRAPH');frame.state=frame.tag==='~a'?'arrayFirst':'objectFirst';return;
   case 'arrayFirst':if(kind===']'){frame.state='envelopeEnd';return;}beginValue(kind,value,frame.depth+1);return;
   case 'arrayValue':beginValue(kind,value,frame.depth+1);return;
   case 'arrayAfter':if(kind===','){frame.state='arrayValue';return;}if(kind===']'){frame.state='envelopeEnd';return;}fail('TRANSPORT_BAD_GRAPH');break;
   case 'objectFirst':if(kind===']'){frame.state='envelopeEnd';return;}if(kind!=='[')fail('TRANSPORT_BAD_PROPERTY');frame.state='propertyKey';return;
   case 'objectValue':if(kind!=='[')fail('TRANSPORT_BAD_PROPERTY');frame.state='propertyKey';return;
   case 'propertyKey':
    if(kind!=='string'||value==='__proto__'||Object.hasOwn(frame.output,value))fail('TRANSPORT_BAD_PROPERTY');frame.key=value;frame.state='propertyComma';return;
   case 'propertyComma':if(kind!==',')fail('TRANSPORT_BAD_PROPERTY');frame.state='propertyValue';return;
   case 'propertyValue':beginValue(kind,value,frame.depth+1);return;
   case 'propertyEnd':if(kind!==']')fail('TRANSPORT_BAD_PROPERTY');frame.state='objectAfter';return;
   case 'objectAfter':if(kind===','){frame.state='objectValue';return;}if(kind===']'){frame.state='envelopeEnd';return;}fail('TRANSPORT_BAD_GRAPH');break;
   case 'envelopeEnd':if(kind!==']')fail('TRANSPORT_BAD_GRAPH');finishFrame(frame.output);return;
   default:fail('TRANSPORT_BAD_GRAPH');
  }
 }
 function endScalar(){
  const text=scalar,kind=mode;scalar='';mode='normal';
  if(kind==='number'){
   if(!(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/).test(text))fail('TRANSPORT_BAD_NUMBER');
   const value=Number(text);if(!Number.isFinite(value))fail('TRANSPORT_BAD_NUMBER');token('number',value);
  }else{if(text!=='true'&&text!=='false'&&text!=='null')fail('TRANSPORT_BAD_LITERAL');token('literal',text==='null'?null:text==='true');}
 }
 function consume(chunk){
  let i=0;
  while(i<chunk.length){
   const char=chunk[i];
   if(mode==='string'){
    let end=i;
    while(end<chunk.length&&chunk[end]!=='"'&&chunk[end]!=='\\'&&chunk.charCodeAt(end)>=32)end++;
    append(chunk.slice(i,end));i=end;
    if(i===chunk.length)continue;
    if(chunk[i]==='"'){const value=scalar;scalar='';mode='normal';i++;token('string',value);continue;}
    if(chunk[i]==='\\'){mode='escape';i++;continue;}
    fail('TRANSPORT_BAD_STRING');
   }
   if(mode==='escape'){
    i++;
    if(char==='u'){escapeDigits='';mode='unicode';continue;}
    const escapes={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};
    if(!Object.hasOwn(escapes,char))fail('TRANSPORT_BAD_ESCAPE');append(escapes[char]);mode='string';continue;
   }
   if(mode==='unicode'){
    if(!/[0-9a-fA-F]/.test(char))fail('TRANSPORT_BAD_ESCAPE');escapeDigits+=char;i++;
    if(escapeDigits.length===4){append(String.fromCharCode(parseInt(escapeDigits,16)));escapeDigits='';mode='string';}continue;
   }
   if(mode==='number'||mode==='literal'){
    let end=i;
    if(mode==='number'){while(end<chunk.length&&/[0-9eE+.-]/.test(chunk[end]))end++;}
    else{while(end<chunk.length&&/[a-z]/.test(chunk[end]))end++;}
    scalar+=chunk.slice(i,end);i=end;
    if(mode==='literal'&&scalar.length>5)fail('TRANSPORT_BAD_LITERAL');
    if(i===chunk.length)continue;
    endScalar();continue;
   }
   if(char===' '||char==='\t'||char==='\r'||char==='\n'){i++;continue;}
   if(char==='"'){mode='string';scalar='';i++;continue;}
   if(char==='-'||/[0-9]/.test(char)){mode='number';scalar=char;i++;continue;}
   if(char==='t'||char==='f'||char==='n'){mode='literal';scalar=char;i++;continue;}
   if(char==='['||char===']'||char===','){i++;token(char);continue;}
   fail('TRANSPORT_BAD_JSON');
  }
 }
 return {
  write(chunk){
   if(closed)fail('TRANSPORT_DECODER_CLOSED');
   try{if(typeof chunk!=='string')fail('TRANSPORT_BAD_CHUNK');units+=chunk.length;if(units>limits.maxEncodedUnits)fail('TRANSPORT_DECODE_SIZE');consume(chunk);}catch(error){clear();throw error;}
  },
  finish(){
   if(closed)fail('TRANSPORT_DECODER_CLOSED');
   try{if(mode==='number'||mode==='literal')endScalar();if(mode!=='normal'||stack.length!==1||!rootReady)fail('TRANSPORT_INCOMPLETE_GRAPH');const result=root;clear();return result;}catch(error){clear();throw error;}
  },
  abort(){clear();},
  inspect(){return Object.freeze({closed,units,nodes,frames:stack.length,tokenUnits:scalar.length+escapeDigits.length,references:refs.size,rootReady});}
 };
}
export function decodeGraph(text,given={}){
 const decoder=createIncrementalDecoder(given);
 decoder.write(text);return decoder.finish();
}
export async function transferMeasurement(locator,sampler,argument,given={}){
 const limits=checkedLimits(given);let original,encoded,output,error,failed=false,decoder;
 try{
  original=await locator.evaluateHandle(sampler,argument);
  encoded=await original.evaluateHandle(createRemoteEncoder,limits);
  // Encoder closure owns the completed result while strings are read. Original handle
  // is redundant and released immediately; no result mutation or forced GC occurs.
  const originalToDispose=original;original=undefined;await originalToDispose.dispose();
  decoder=reviewCreatedDecoder=createIncrementalDecoder(limits);
  const maxCalls=Math.ceil(limits.maxEncodedUnits/limits.chunkUnits)+1;let units=0,chunkCount=0,ended=false;
  for(let index=0;index<maxCalls;index++){
   const chunk=await encoded.evaluate((state,i)=>state.read(i),index);
   if(typeof chunk!=='string'||chunk.length>limits.chunkUnits)throw new Error('TRANSPORT_BAD_CHUNK');
   if(!chunk.length){ended=true;break;}
   units+=chunk.length;if(units>limits.maxEncodedUnits)throw new Error('TRANSPORT_ENCODED_LIMIT');
   decoder.write(chunk);chunkCount++;
  }
  if(!ended)throw new Error('TRANSPORT_CHUNK_LIMIT');
  const metadata=await encoded.evaluate(state=>state.metadata());
  if(metadata?.version!==1||metadata.done!==true||metadata.units!==units||metadata.chunks!==chunkCount+1||!Number.isSafeInteger(metadata.nodes)||metadata.nodes<1||metadata.nodes>limits.maxNodes)throw new Error('TRANSPORT_BAD_METADATA');
  // Unlike the predecessor, the partial/final Node graph overlaps the remote graph.
  // It remains private and is released on failure; no return occurs before disposal.
  const encodedToDispose=encoded;encoded=undefined;await encodedToDispose.dispose();
  output=decoder.finish();
 }catch(cause){failed=true;error=cause;decoder?.abort();}
 const disposeErrors=[];
 for(const handle of [encoded,original])if(handle)try{await handle.dispose();}catch(cause){disposeErrors.push(cause);}
 if(failed&&disposeErrors.length)throw new AggregateError([error,...disposeErrors],'TRANSPORT_FAILED_AND_DISPOSAL_FAILED',{cause:error});
 if(failed)throw error;
 if(disposeErrors.length)throw new AggregateError(disposeErrors,'TRANSPORT_DISPOSAL_FAILED');
 return output;
}
