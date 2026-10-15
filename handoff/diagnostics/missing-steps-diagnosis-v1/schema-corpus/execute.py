from pathlib import Path
import datetime, hashlib, json, os, selectors, signal, subprocess, sys, time

here = Path(__file__).resolve().parent
plan = json.loads((here / 'PLAN.json').read_text())
mode = sys.argv[1]
assert mode in ('baseline', 'candidate')
assert hashlib.sha256((here / 'check.mjs').read_bytes()).hexdigest() == plan['scriptSha256']
tmp = here / 'tmp'
tmp.mkdir(exist_ok=True)
argv = [plan['nodeExecutable'], str(here / 'check.mjs'), mode]
env = {'PATH': str(Path(plan['nodeExecutable']).parent) + ':/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TZ': 'UTC', 'TMPDIR': str(tmp)}
began = time.monotonic()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
process = subprocess.Popen(argv, cwd=plan['repository'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
selector = selectors.DefaultSelector()
selector.register(process.stdout, selectors.EVENT_READ)
size = 0
stop = None
log = here / (mode + '.log')
with log.open('xb') as output:
    while selector.get_map():
        if time.monotonic() - began > plan['boundPerRun']['seconds'] and stop is None:
            stop = 'time-limit'
            os.killpg(process.pid, signal.SIGKILL)
        for key, _ in selector.select(0.05):
            block = os.read(key.fd, 65536)
            if not block:
                selector.unregister(key.fileobj)
                continue
            if size + len(block) > plan['boundPerRun']['combinedLogBytes'] and stop is None:
                stop = 'log-limit'
                os.killpg(process.pid, signal.SIGKILL)
            output.write(block)
            size += len(block)
exit_code = process.wait()
receipt = {'mode': mode, 'argv': argv, 'environment': env, 'startedUtc': started, 'finishedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'elapsedSeconds': time.monotonic() - began, 'exitCode': exit_code, 'stopReason': stop, 'combinedLogBytes': size, 'combinedLogSha256': hashlib.sha256(log.read_bytes()).hexdigest(), 'planSha256': hashlib.sha256((here / 'PLAN.json').read_bytes()).hexdigest(), 'driverSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'scriptSha256': plan['scriptSha256']}
with (here / (mode + '-receipt.json')).open('x') as output:
    output.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
sys.exit(0 if exit_code == 0 and stop is None else 1)
