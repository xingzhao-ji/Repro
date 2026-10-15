// Read-only telemetry from inside this job's existing private PID/cgroup namespaces.
// One exact test file runs directly in Node; the built CLI demo remains separate. Docker init owns PID1.
import { closeSync, mkdirSync, openSync, opendirSync, readSync, readFileSync, readdirSync, writeSync } from 'node:fs';
import { createLifecycleDiagnostics } from './lifecycle-diagnostics.mjs';

const intendedTest = process.argv[1] === '/work/verification-inputs/contrast-p57-approved-batch-probe.mjs';
const selected = intendedTest;
if (selected && (!process.execArgv.includes('--v8-pool-size=1') || process.env.UV_THREADPOOL_SIZE !== '1')) throw new Error('Declared Node background pools were not selected; workload stopped.');
if (selected && process.ppid !== 1) throw new Error('Direct Node script boundary under Docker init was not observed; workload stopped.');
globalThis[Symbol.for('repro.resourceProbe')] = { pid: process.pid, ppid: process.ppid, entrypoint: process.argv[1], intendedTest, selected, runnerMode: 'single-script-bounded-pools', nodePools: { v8: 1, libuv: 1 } };
if (selected) {
  const initName = readFileSync('/proc/1/comm', 'utf8').trim();
  if (initName !== 'docker-init') throw new Error('Approved Docker init was not observed as PID1; diagnostic workload stopped.');
  const directory = '/work/.repro-runs/resource-diagnostics';
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const fd = openSync(`${directory}/samples.ndjson`, 'wx', 0o600);
  const metadataFd = openSync(`${directory}/lifecycle.ndjson`, 'wx', 0o600);
  function append(fd, line) {
    const data = Buffer.from(line); let bytes = 0;
    while (bytes < data.length) { const n = writeSync(fd, data, bytes, data.length - bytes); if (!Number.isSafeInteger(n) || n <= 0) return { bytes, error: 'EIO' }; bytes += n; } return { bytes };
  }
  let rawWriteFailure;
  const sourceSummaryBudget = { sourceMaxBytes: 16 * 1024, samplerMetadataMaxBytes: 112 * 1024, samplerCombinedMaxBytes: 4 * 1024 * 1024 - 16 * 1024, failure: null };
  globalThis[Symbol.for('repro.resourceProbe')].sourceSummaryBudget = sourceSummaryBudget;
  function admitted(line, metadata, completion = false) {
    const current = diagnostics.summary(), size = Buffer.byteLength(line), completionReserve = completion ? 0 : 2048;
    let code;
    if (metadata && current.metadataBytes + size + completionReserve > sourceSummaryBudget.samplerMetadataMaxBytes) code = 'SOURCE_SUMMARY_METADATA_RESERVE_CAP';
    else if (current.combinedBytes + size + completionReserve > sourceSummaryBudget.samplerCombinedMaxBytes) code = 'SOURCE_SUMMARY_COMBINED_RESERVE_CAP';
    if (code) { sourceSummaryBudget.failure ??= code; return { bytes: 0, error: code }; }
    return null;
  }
  const diagnostics = createLifecycleDiagnostics({
    clock: () => ({ utc: new Date().toISOString(), monoNs: process.hrtime.bigint() }),
    nextSampleIndex: () => samples,
    readStat(path, maxBytes) {
      const statFd = openSync(path, 'r'); const data = Buffer.alloc(maxBytes + 1); let bytes = 0;
      try { while (bytes < data.length) { const n = readSync(statFd, data, bytes, data.length - bytes, null); if (!n) break; bytes += n; } }
      finally { closeSync(statFd); }
      return { text: data.subarray(0, bytes).toString('utf8'), truncated: bytes > maxBytes };
    },
    listTasks(pid, maxEntries) {
      const dir = opendirSync(`/proc/${pid}/task`); const names = []; let truncated = false;
      try { for (let i = 0; i <= maxEntries; i++) { const entry = dir.readSync(); if (!entry) break; if (i === maxEntries) { truncated = true; break; } names.push(entry.name); } }
      finally { dir.closeSync(); }
      return { names, truncated };
    },
    appendRaw(line) {
      try { const result = admitted(line, false) ?? append(fd, line); if (result.error) rawWriteFailure = result.error; return result; }
      catch (error) { rawWriteFailure = error.code ?? String(error); throw error; }
    },
    appendMetadata: line => admitted(line, true) ?? append(metadataFd, line),
    appendCompletion(line) {
      const rejection = admitted(line, true, true); if (rejection) return rejection;
      let completionFd, result = { bytes: 0 };
      try { completionFd = openSync(`${directory}/completion.json`, 'wx', 0o600); result = append(completionFd, line); }
      finally { if (completionFd !== undefined) try { closeSync(completionFd); } catch { result.error = 'EIO'; } }
      return result;
    }
  });
  globalThis[Symbol.for('repro.lifecycleDiagnostics')] = diagnostics;
  const limit = 4 * 1024 * 1024;
  let bytes = 0;
  let samples = 0;
  let lastProcesses = '';
  let failure;
  function read(path) {
    try { return readFileSync(path, 'utf8').trim(); }
    catch (error) { return { unavailable: error.code ?? 'UNKNOWN' }; }
  }
  function processes() {
    return readdirSync('/proc').filter(name => /^\d+$/.test(name)).map(name => {
      const raw = diagnostics.timedRead(Number(name), () => read(`/proc/${name}/stat`));
      if (typeof raw !== 'string') return { pid: Number(name), ...raw };
      const start = raw.indexOf('(');
      const end = raw.lastIndexOf(')');
      const fields = raw.slice(end + 2).split(' ');
      if (start < 0 || end <= start || !/^[A-Za-z]$/.test(fields[0] ?? '') || !/^\d+$/.test(fields[1] ?? '') || !/^\d+$/.test(fields[17] ?? '') || !/^\d+$/.test(fields[19] ?? '')) return { pid: Number(name), unavailable: 'MALFORMED_STAT' };
      return { pid: Number(name), name: raw.slice(start + 1, end), state: fields[0], ppid: Number(fields[1]), threads: Number(fields[17]), start_ticks: fields[19] };
    }).sort((a, b) => a.pid - b.pid);
  }
  function sample(phase) {
    if (failure || bytes >= limit) return;
    try {
      diagnostics.beginSweep();
      const counters = Object.fromEntries(['pids.current', 'pids.max', 'pids.peak', 'pids.events', 'pids.events.local', 'memory.current', 'memory.peak', 'memory.events', 'memory.events.local'].map(name => [name, read(`/sys/fs/cgroup/${name}`)]));
      const list = processes();
      const fingerprint = JSON.stringify(list);
      const record = { utc: new Date().toISOString(), phase, sample: samples++, counters, process_count: list.length, zombie_count: list.filter(p => p.state === 'Z').length, visible_threads: list.reduce((sum, p) => sum + (p.threads ?? 0), 0) };
      if (diagnostics.retainClosingSamples() || fingerprint !== lastProcesses || phase !== 'interval') {
        record.processes = list;
        lastProcesses = fingerprint;
      }
      if (phase === 'start') {
        record.scope = 'existing private namespaces; no extra process; read-only fixed cgroup files and process stat, no command lines or environments';
        record.sampler = { ...globalThis[Symbol.for('repro.resourceProbe')] };
        delete record.sampler.sourceSummaryBudget;
        record.runtime_init = { pid: 1, name: initName };
        record.sampler_parent = list.find(item => item.pid === process.ppid);
        record.cgroup = read('/proc/self/cgroup');
        record.process_limits = read('/proc/self/limits');
        const mounts = read('/proc/self/mountinfo');
        record.cgroup_mounts = typeof mounts === 'string' ? mounts.split('\n').filter(line => / - cgroup2? /.test(line)) : mounts;
        record.interval_ms = 100;
        record.byte_limit = limit;
      }
      const line = JSON.stringify(record) + '\n';
      const size = Buffer.byteLength(line);
      if (bytes + size > limit) {
        failure = 'diagnostic byte cap reached; workload unchanged';
        return;
      }
      if (!diagnostics.writeRaw(line)) failure = rawWriteFailure ?? 'diagnostic byte cap or write failure; workload unchanged';
      bytes = diagnostics.summary().rawBytes;
      diagnostics.observeSample(list, fingerprint, record.sample, phase);
    } catch (error) { failure = error.code ?? String(error); }
  }
  sample('start');
  const timer = setInterval(() => sample('interval'), 100);
  timer.unref();
  process.on('exit', () => {
    clearInterval(timer);
    sample('exit');
    let closeFailed = false;
    try { closeSync(fd); } catch { closeFailed = true; }
    try { closeSync(metadataFd); } catch { closeFailed = true; }
    const sourceExitCode = Number(process.exitCode ?? 0);
    const final = diagnostics.finish({ samples, bytes, failure: failure ?? null, interval_ms: 100, byte_limit: limit }, { sourceExitCode, closeFailed });
    // A file cannot attest to its own final write/close. Exit 86 is the bounded
    // external failure signal; original source status/exit are retained separately.
    if (final.status !== 'complete' || !final.completionWritten) process.exitCode = 86;
  });
}
