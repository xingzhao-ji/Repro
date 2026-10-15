from pathlib import Path
import subprocess,json,time,hashlib,os,datetime,sys
base=Path(__file__).resolve().parent
bindings_path=base/'bindings.json'
bindings_bytes=bindings_path.read_bytes();bindings=json.loads(bindings_bytes)
assert sys.argv[1:]==['--reviewed-plan'], 'Root and independent review required before execution'
for f in bindings['files']:
 b=Path(f['path']).read_bytes();assert hashlib.sha256(b).hexdigest()==f['sha256'] and len(b)==f['bytes'], f['path']
assert not (base/'command-receipts.json').exists(), 'No overwrite/repeat'
env={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC'}
orders=[['prior','incremental'],['incremental','prior'],['prior','incremental']]
receipts=[]
for experiment in ['end-to-end','receiver-only']:
 for trial,order in enumerate(orders,1):
  for mode in order:
   label=f'{experiment}-{trial}-{mode}'
   command=['node','--max-old-space-size=384','--expose-gc',str(base/'worker.mjs'),experiment,mode,str(bindings_path),str(base/(label+'.startup.json'))]
   start=time.monotonic();started=datetime.datetime.now(datetime.timezone.utc).isoformat()
   try:
    result=subprocess.run(command,cwd=base,env=env,capture_output=True,timeout=45)
    out,err,code=result.stdout,result.stderr,result.returncode
   except subprocess.TimeoutExpired as exc:out,err,code=exc.stdout or b'',exc.stderr or b'',124
   elapsed=time.monotonic()-start
   (base/(label+'.stdout.json')).write_bytes(out);(base/(label+'.stderr.txt')).write_bytes(err)
   receipt={'label':label,'experiment':experiment,'trial':trial,'mode':mode,'order':order,'command':command,'environment':env,'startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':code,'elapsedSeconds':elapsed,'timeoutSeconds':45,'bindingsSha256':hashlib.sha256(bindings_bytes).hexdigest(),'stdout':label+'.stdout.json','stdoutSha256':hashlib.sha256(out).hexdigest(),'stderr':label+'.stderr.txt','stderrSha256':hashlib.sha256(err).hexdigest(),'startup':label+'.startup.json','startupSha256':hashlib.sha256((base/(label+'.startup.json')).read_bytes()).hexdigest() if (base/(label+'.startup.json')).exists() else None}
   receipts.append(receipt);(base/'command-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n');print(json.dumps(receipt),flush=True)
   if code:raise SystemExit(code)
   payload=json.loads(out);assert payload['status']=='PASS' and len(payload['records'])==13
print(json.dumps({'status':'COMPLETE','workers':len(receipts)}),flush=True)
