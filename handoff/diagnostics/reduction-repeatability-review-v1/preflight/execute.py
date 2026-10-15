import datetime, hashlib, json, os, pathlib, selectors, subprocess, time

root = pathlib.Path(__file__).resolve().parent
plan = json.loads((root / 'plan.json').read_text())
repo = pathlib.Path(plan['repo'])
sha = lambda data: hashlib.sha256(data).hexdigest()
for item in json.loads((root / 'execution-freeze.json').read_text())['files']:
    assert sha((root / item['path']).read_bytes()) == item['sha256'], item['path']
env = os.environ.copy()
env['TSX_DISABLE_CACHE'] = '1'
tmp = root / 'tmp'
tmp.mkdir(exist_ok=True)
env['TMPDIR'] = str(tmp)
receipts = []
for fmt in plan['formats']:
    command = ['node', *fmt['nodeArguments'], str(root / 'verify-format.mjs'), fmt['id']]
    before = time.monotonic()
    proc = subprocess.Popen(command, cwd=repo, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    log = bytearray()
    termination = None
    while selector.get_map():
        if time.monotonic() - before > plan['executionPolicy']['perFormatTimeoutSeconds']:
            termination = '120-second command deadline'
            proc.kill()
        for key, _ in selector.select(timeout=0.1):
            data = os.read(key.fileobj.fileno(), 65536)
            if not data:
                selector.unregister(key.fileobj)
                continue
            log.extend(data)
            if len(log) > plan['executionPolicy']['maxCombinedLogBytesPerFormat']:
                termination = '2 MiB combined log cap'
                proc.kill()
                log = log[:plan['executionPolicy']['maxCombinedLogBytesPerFormat']]
    code = proc.wait(timeout=5)
    (root / (fmt['id'] + '.log')).write_bytes(log)
    receipt = {'format': fmt['id'], 'command': command, 'cwd': str(repo), 'exitCode': code, 'elapsedSeconds': time.monotonic() - before, 'combinedLogBytes': len(log), 'combinedLogSha256': sha(log), 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'termination': termination}
    receipts.append(receipt)
    (root / 'execution-receipts.json').write_text(json.dumps(receipts, indent=2) + '\n')
    print(json.dumps(receipt), flush=True)
    if code != 0 or termination:
        raise SystemExit('Stop on first failed format; no retries or later formats executed.')
