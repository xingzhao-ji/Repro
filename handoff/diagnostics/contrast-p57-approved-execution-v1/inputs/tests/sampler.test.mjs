import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLifecycleDiagnostics} from '../verification-inputs/lifecycle-diagnostics.mjs';
const source=readFileSync(new URL('../verification-inputs/resource-probe.mjs',import.meta.url),'utf8');
const probe=readFileSync(new URL('../verification-inputs/contrast-p57-approved-batch-probe.mjs',import.meta.url),'utf8');
const sampler=source.replace(/^import .*;\n/gm,'');
function stat(p){const f=Array(20).fill('0');f[0]=p.state;f[1]=String(p.ppid);f[17]=String(p.threads);f[19]=p.start_ticks;return `${p.pid} (${p.name}) ${f.join(' ')}`;}
const base=[{pid:1,name:'docker-init',state:'S',ppid:0,threads:1,start_ticks:'100'}, {pid:6,name:'node',state:'S',ppid:1,threads:3,start_ticks:'200'}, {pid:12,name:'chrome',state:'S',ppid:6,threads:10,start_ticks:'300'}, {pid:39,name:'chrome',state:'S',ppid:12,threads:7,start_ticks:'3694714'}];
function harness(fault='none',selected=true){
 let list=structuredClone(base),fd=100,mono=0n,tick=0;const files=new Map(),fds=new Map(),callbacks=new Map(),timers=[],closed=[];
 const fixtures=path=>{if(path==='/proc/1/comm')return 'docker-init';if(path.startsWith('/sys/fs/cgroup/'))return '0';if(['/proc/self/cgroup','/proc/self/limits','/proc/self/mountinfo'].includes(path))return 'fixture';const m=path.match(/^\/proc\/(\d+)(?:\/task\/(\d+))?\/stat$/);if(m){const pid=Number(m[2]??m[1]);const p=list.find(p=>p.pid===pid)??(pid===40?{...base[3],pid:40,state:'S',threads:2}:null);if(p)return stat(p);}throw Object.assign(new Error('fixture missing'),{code:'ENOENT'});};
 const fakeProcess={argv:['node',selected?'/work/verification-inputs/contrast-p57-approved-batch-probe.mjs':'other.mjs'],execArgv:['--v8-pool-size=1'],env:{UV_THREADPOOL_SIZE:'1'},pid:6,ppid:1,exitCode:1,hrtime:{bigint:()=>mono+=100n},on:(name,callback)=>callbacks.set(name,callback)};
 const fs={mkdirSync(){},openSync(path,flags){const n=fd++;fds.set(n,{path,offset:0,read:flags==='r'});if(flags!=='r'){assert.ok(!files.has(path),'exclusive file creation');files.set(path,Buffer.alloc(0));}return n;},readFileSync:fixtures,readdirSync:path=>{assert.equal(path,'/proc');return list.map(p=>String(p.pid));},opendirSync:path=>{assert.equal(path,'/proc/39/task');let i=0;return {readSync:()=>i<2?{name:['39','40'][i++]}:null,closeSync(){}};},readSync(n,buffer,offset,length){const item=fds.get(n),bytes=Buffer.from(fixtures(item.path));const count=Math.min(length,bytes.length-item.offset);bytes.copy(buffer,offset,item.offset,item.offset+count);item.offset+=count;return count;},writeSync(n,data,offset,length){const {path}=fds.get(n);const chunk=Buffer.from(data).subarray(offset,offset+length);
  if(fault==='rawWrite'&&path.endsWith('samples.ndjson'))throw Object.assign(new Error('secret fixture'),{code:'EIO'});
  if(fault==='metadataWrite'&&path.endsWith('lifecycle.ndjson'))throw Object.assign(new Error('secret fixture'),{code:'EIO'});
  if(fault==='completionPartial'&&path.endsWith('completion.json')){if(files.get(path).length)throw Object.assign(new Error('secret fixture'),{code:'EIO'});files.set(path,chunk.subarray(0,17));return 17;}
  files.set(path,Buffer.concat([files.get(path),chunk]));return chunk.length;
 },closeSync(n){const {path,read}=fds.get(n);closed.push(path);if(!read&&((fault==='completionClose'&&path.endsWith('completion.json'))||(fault==='metadataClose'&&path.endsWith('lifecycle.ndjson'))||(fault==='rawClose'&&path.endsWith('samples.ndjson'))))throw Object.assign(new Error('secret fixture'),{code:'EIO'});}};
 class FakeDate extends Date {constructor(){super(1800000000000+tick++);}}
 const context={...fs,createLifecycleDiagnostics,process:fakeProcess,Buffer,Symbol,Date:FakeDate,setInterval(callback,ms){const timer={callback,ms,active:true,unref(){this.unreferenced=true;}};timers.push(timer);return timer;},clearInterval(timer){timer.active=false;}};
 const lifecycle=vm.runInNewContext(sampler+";globalThis[Symbol.for('repro.lifecycleDiagnostics')];",context,{filename:'actual-copied-resource-probe.mjs'});
 return {context,lifecycle,files,timers,closed,process:fakeProcess,setList:next=>{list=structuredClone(next);},sample(){timers[0].callback();},exit(){callbacks.get('exit')();},records(name){const b=files.get('/work/.repro-runs/resource-diagnostics/'+name);return b?.toString().trim().split('\n').filter(Boolean).map(JSON.parse)??[];}};
}
test('actual selected sampler retains100ms cadence, fingerprints, rawZ and through-close interval',async()=>{
 const h=harness();assert.equal(h.timers.length,1);assert.equal(h.timers[0].ms,100);assert.equal(h.timers[0].unreferenced,true);
 const lifecycle=h.lifecycle;h.sample();h.sample();
 const z=structuredClone(base);Object.assign(z[3],{state:'Z',threads:2});
 const closed=await lifecycle.observeClose('final.browser.close',async()=>{assert.equal(h.timers[0].active,true);h.setList(z);h.sample();h.setList(base.slice(0,2));h.sample();return 'closed';});assert.equal(closed,'closed');
 h.exit();assert.equal(h.timers[0].active,false);assert.equal(h.process.exitCode,1,'honest source exit1 retained');
 const rows=h.records('samples.ndjson'),metadata=h.records('lifecycle.ndjson'),completion=h.records('completion.json')[0];
 assert.equal(rows.length,6);assert.equal(rows[1].processes,undefined);assert.equal(rows[2].processes,undefined);assert.equal(rows[3].zombie_count,1);assert.equal(rows[3].processes.find(p=>p.pid===39).threads,2);assert.equal(rows[5].phase,'exit');assert.equal(rows[5].zombie_count,0);
 assert.deepEqual(metadata.filter(r=>r.kind==='read-bounds').map(r=>r.processReads.length),[4,4,2,2]);
 assert.equal(metadata.filter(r=>r.kind==='first-zombie').length,1);assert.equal(completion.failure,null);assert.equal(completion.lifecycle.sourceExitCode,1);
 assert.equal(completion.lifecycle.status,'provisional-external-io-verification-required');assert.equal(completion.lifecycle.completionWritten,false);assert.equal(completion.lifecycle.observedStatusBeforeCompletionWrite,'complete');
 const actual=[...h.files.values()].reduce((n,b)=>n+b.length,0);assert.equal(completion.lifecycle.combinedBytes,actual);assert.ok(actual<=4194304);
});
test('actual unselected sampler never installs lifecycle hook, opens files or sets timer',()=>{const h=harness('none',false);assert.equal(h.lifecycle,undefined);assert.equal(h.files.size,0);assert.equal(h.timers.length,0);});
for(const fault of ['completionClose','metadataClose','rawClose','completionPartial','rawWrite','metadataWrite'])test('actual final I/O failure is externally non-accepting: '+fault,()=>{
 const h=harness(fault);h.exit();assert.equal(h.process.exitCode,86);const text=h.files.get('/work/.repro-runs/resource-diagnostics/completion.json')?.toString();
 if(fault!=='completionPartial'){const c=JSON.parse(text);assert.equal(c.lifecycle.status,'provisional-external-io-verification-required');assert.equal(c.lifecycle.completionWritten,false);assert.equal(c.lifecycle.sourceExitCode,1);}
 const summary=h.lifecycle.summary();assert.equal(summary.status,'incomplete');assert.ok(summary.issues.length);
 if(fault==='rawWrite')assert.equal(JSON.parse(text).failure,'EIO','original raw sampler cause preserved');
 if(fault==='completionClose'){assert.equal(JSON.parse(text).lifecycle.observedStatusBeforeCompletionWrite,'complete');assert.equal(summary.completionWritten,false,'full bytes plus close EIO cannot attest successful final I/O');}
 if(['completionPartial','rawWrite','metadataWrite'].includes(fault))assert.equal(summary.bytesUncertain,true);
});

test('unchanged naturally scheduled closing lists are explicit and all read bounds survive compression',async()=>{
 const h=harness();h.sample();const before=h.records('lifecycle.ndjson').filter(r=>r.kind==='read-bounds');assert.equal(before.length,1);
 await h.lifecycle.observeClose('final.browser.close',async()=>{h.setList(base.slice(0,2));h.sample();h.sample();},()=>0);
 h.sample();h.sample();h.exit();
 const rows=h.records('samples.ndjson');assert.equal(rows.length,7);assert.equal(rows[1].processes,undefined);
 for(const r of rows.slice(2))assert.equal(r.processes.length,2);
 const metadata=h.records('lifecycle.ndjson');
 assert.deepEqual(metadata.filter(r=>r.kind==='read-bounds').map(r=>r.sample),[0,2,3,4,5,6]);
 const phases=metadata.filter(r=>r.kind==='phase'&&r.phase==='final.browser.close');
 assert.deepEqual(phases.map(r=>[r.event,r.nextSampleIndex]),[['start',2],['settled',4]]);
 assert.equal(rows[phases[1].nextSampleIndex].phase,'interval');assert.equal(rows.at(-1).phase,'exit');
 assert.equal(h.timers.length,1);assert.equal(h.timers[0].ms,100);assert.equal(h.process.exitCode,1);
});
test('post-close retention exhaustion remains fail closed at existing metadata cap',()=>{
 const h=harness();h.lifecycle.mark('final.browser.close','start',0);
 for(let i=0;i<1000;i++)h.sample();h.exit();
 const c=h.records('completion.json')[0];assert.equal(h.process.exitCode,86);
 assert.ok(h.lifecycle.summary().issues.length>0);assert.ok(c.lifecycle.metadataBytes<=114688);
 assert.ok([...h.files.values()].reduce((n,b)=>n+b.length,0)<=4177920);
});
for(const value of [undefined,-1,1.5,NaN])test('missing or invalid next sample anchor fails closed '+String(value),()=>{
 const metadata=[];let tick=0n;
 const d=createLifecycleDiagnostics({clock:()=>({utc:'2026-10-15T06:30:00.000Z',monoNs:++tick}),
  nextSampleIndex:()=>value,readStat(){throw Error('unused');},listTasks(){throw Error('unused');},
  appendRaw:line=>({bytes:Buffer.byteLength(line)}),appendMetadata:line=>{metadata.push(JSON.parse(line));return {bytes:Buffer.byteLength(line)};},appendCompletion:line=>({bytes:Buffer.byteLength(line)})});
 d.mark('final.browser.close','settled',0);assert.equal(d.summary().status,'incomplete');assert.ok(d.summary().issues.includes('SAMPLE_INDEX_INVALID'));assert.equal(metadata[0].nextSampleIndex,null);
});
