from pathlib import Path
import subprocess,json,time,hashlib
base=Path(__file__).resolve().parent
commands=[('tests',['node','--test',str(base/'transport.test.mjs')])]
for trial in range(1,4):
 for mode in ('native','candidate'):
  commands.append((f'allocation-{trial}-{mode}',['node','--max-old-space-size=384','--expose-gc',str(base/'benchmark-worker.mjs'),mode]))
receipts=[]
for label,command in commands:
 start=time.monotonic()
 try:
  result=subprocess.run(command,cwd=base,capture_output=True,timeout=45)
  out,err,code=result.stdout,result.stderr,result.returncode
 except subprocess.TimeoutExpired as exc:out,err,code=exc.stdout or b'',exc.stderr or b'',124
 suffix='.json' if label.startswith('allocation-') and code==0 else '.txt'
 (base/(label+suffix)).write_bytes(out);(base/(label+'.stderr.txt')).write_bytes(err)
 receipts.append({'label':label,'command':command,'exitCode':code,'elapsedSeconds':time.monotonic()-start,'stdout':label+suffix,'stdoutSha256':hashlib.sha256(out).hexdigest(),'stderr':label+'.stderr.txt','stderrSha256':hashlib.sha256(err).hexdigest(),'timeoutSeconds':45})
 (base/'command-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
 print(json.dumps(receipts[-1]),flush=True)
 if code:raise SystemExit(code)
