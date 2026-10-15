import datetime
import hashlib
import json
import os
import pathlib
import selectors
import signal
import subprocess
import time

HERE = pathlib.Path(__file__).resolve().parent
PLAN = json.loads((HERE / 'PLAN-v2.json').read_text())
ROOT = pathlib.Path(PLAN['candidateRoot'])
sha = lambda data: hashlib.sha256(data).hexdigest()

def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

freeze = {
    'createdUtc': now(),
    'planSha256': sha((HERE / 'PLAN-v2.json').read_bytes()),
    'workerSha256': sha((HERE / 'worker.mjs').read_bytes()),
    'driverSha256': sha(pathlib.Path(__file__).read_bytes()),
    'note': 'Frozen immediately before any reducer import or case execution. Original PLAN.json was unexecuted and retained.'
}
write_json(HERE / 'execution-freeze.json', freeze)
receipts = []
total_start = time.monotonic()
for form in PLAN['formats']:
    for rep in range(1, PLAN['independentProcessesPerFormat'] + 1):
        label = f'{form}-{rep}'
        if (HERE / label).exists():
            raise RuntimeError(f'Refusing to overwrite existing result {label}')
        if time.monotonic() - total_start >= PLAN['overallWallLimitSeconds']:
            raise RuntimeError('Overall frozen wall limit expired; no additional process started')
        if sha((HERE / 'worker.mjs').read_bytes()) != freeze['workerSha256']:
            raise RuntimeError('Frozen worker changed before execution')
        home = HERE / 'isolated-home'
        tmp = HERE / 'isolated-tmp'
        home.mkdir(exist_ok=True)
        tmp.mkdir(exist_ok=True)
        env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(home), 'TMPDIR': str(tmp), 'LANG': 'C.UTF-8', 'TZ': 'UTC'}
        argv = ['node'] + (['--import', 'tsx'] if form == 'source' else []) + [str(HERE / 'worker.mjs'), form, str(rep)]
        start = time.monotonic()
        started = now()
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        combined = bytearray()
        stop_reason = None
        while selector.get_map():
            elapsed = time.monotonic() - start
            if elapsed >= PLAN['processWallLimitSeconds']:
                stop_reason = 'process wall limit exceeded'
                os.killpg(process.pid, signal.SIGKILL)
            for key, _ in selector.select(timeout=0.1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                room = PLAN['processCombinedLogLimitBytes'] - len(combined)
                combined.extend(chunk[:room])
                if len(chunk) > room:
                    stop_reason = 'combined stdout/stderr limit exceeded'
                    os.killpg(process.pid, signal.SIGKILL)
            if stop_reason:
                break
        process.wait(timeout=10)
        selector.close()
        process.stdout.close()
        log_path = HERE / f'{label}.log'
        log_path.write_bytes(combined)
        receipt = {
            'label': label, 'argv': argv, 'cwd': str(ROOT), 'environment': env,
            'startedUtc': started, 'finishedUtc': now(), 'elapsedSeconds': time.monotonic() - start,
            'exitCode': process.returncode, 'stopReason': stop_reason,
            'combinedLogBytes': len(combined), 'combinedLogSha256': sha(combined),
            'workerSha256': freeze['workerSha256'], 'planSha256': freeze['planSha256'],
            'rawEvidenceLimitBytes': PLAN['rawEvidenceLimitBytesPerProcess'],
        }
        write_json(HERE / f'{label}.receipt.json', receipt)
        receipts.append(receipt)
        print(json.dumps({k: receipt[k] for k in ['label', 'exitCode', 'elapsedSeconds', 'stopReason']}), flush=True)
        # Continue the exact predeclared matrix after ordinary assertion failures;
        # resource-limit failures stop future processes without selective reruns.
        if stop_reason:
            write_json(HERE / 'driver-receipt.json', {'completed': False, 'receipts': receipts, 'stopReason': stop_reason})
            raise SystemExit(1)

write_json(HERE / 'driver-receipt.json', {'completed': True, 'finishedUtc': now(), 'elapsedSeconds': time.monotonic() - total_start, 'receipts': receipts})
raise SystemExit(0 if all(item['exitCode'] == 0 for item in receipts) else 1)
