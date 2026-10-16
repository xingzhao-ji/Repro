import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { lstat, mkdir, readdir, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const SAMPLE_MS = 100;
const NORMAL_CLEANUP_MS = 5000;
const STOP_CLEANUP_MS = 8000;
const KILL_AFTER_MS = 3000;
const LOG_LIMIT = 2 * 1024 * 1024;
const MAX_SAMPLES = 10000;
const delay = milliseconds => new Promise(accept => setTimeout(accept, milliseconds));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

class MeasurementError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function parseArguments(args) {
  const boundary = args.indexOf('--');
  if (boundary < 0 || boundary === args.length - 1) throw new MeasurementError('MEASUREMENT_ARGUMENTS', 'Provide --output, --timeout-ms and an explicit command after --.');
  const options = { expectedExit: 0, command: args.slice(boundary + 1) };
  const seen = new Set();
  for (let index = 0; index < boundary; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!['--output', '--timeout-ms', '--expect-exit'].includes(flag) || seen.has(flag) || value === undefined || index + 1 >= boundary) {
      throw new MeasurementError('MEASUREMENT_ARGUMENTS', 'Use each supported option once with an explicit value.');
    }
    seen.add(flag);
    if (flag === '--output') options.output = value;
    else if (!/^\d+$/.test(value)) throw new MeasurementError('MEASUREMENT_ARGUMENTS', 'Timeout and expected exit must be nonnegative integers.');
    else if (flag === '--timeout-ms') options.timeoutMs = Number(value);
    else options.expectedExit = Number(value);
  }
  if (typeof options.output !== 'string' || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 900000 || options.expectedExit > 255) {
    throw new MeasurementError('MEASUREMENT_ARGUMENTS', 'Provide a task-owned output, a 1–900000 ms watchdog and an expected exit from 0 to 255.');
  }
  if (options.command.length > 1024 || Buffer.byteLength(JSON.stringify(options.command)) > 1024 * 1024 || options.command.some(value => value.includes('\0') || value.length > 65536)) throw new MeasurementError('MEASUREMENT_ARGUMENTS', 'Command arguments must be bounded strings without null bytes.');
  return options;
}

async function claimOutput(output) {
  const path = resolve(output), taskRoot = resolve('.repro-runs');
  const local = relative(taskRoot, path);
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new MeasurementError('MEASUREMENT_LOCATION', 'Write measurement evidence beneath the current project .repro-runs directory.');
  let current = process.cwd();
  for (const part of relative(current, dirname(path)).split(sep)) {
    current = join(current, part);
    try { await mkdir(current, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new MeasurementError('MEASUREMENT_LINK', 'Measurement output must not traverse symbolic links.');
  }
  try { await mkdir(path, { mode: 0o700 }); }
  catch (cause) {
    if (cause.code === 'EEXIST') throw new MeasurementError('MEASUREMENT_EXISTS', 'Measurement evidence already exists. Choose a new output directory.');
    throw cause;
  }
  return path;
}

function processSnapshot() {
  // Numeric identities and start times only: never collect other command lines.
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,pgid=,rss=,lstart='], {
    encoding: 'utf8', timeout: 2000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' },
  });
  if (result.status !== 0 || result.error) throw new MeasurementError('CENSUS_UNAVAILABLE', 'The numeric process census is unavailable. Restore ps access before measuring again.');
  return result.stdout.split('\n').filter(line => line.trim()).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!match) throw new MeasurementError('CENSUS_FORMAT', 'The process census format is unsupported.');
    return { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), rssBytes: Number(match[4]) * 1024, startedAt: match[5].trim() };
  });
}

async function temporaryInventory(root, prefix = '', entries = []) {
  for (const name of await readdir(join(root, prefix))) {
    if (entries.length >= 4096 || prefix.split('/').length > 32) throw new MeasurementError('TEMP_INVENTORY_LIMIT', 'Owned temporary-file inventory exceeds its declared bound.');
    const local = prefix ? `${prefix}/${name}` : name;
    const stat = await lstat(join(root, local));
    entries.push({ path: local, kind: stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : 'file', bytes: stat.size });
    if (stat.isDirectory() && !stat.isSymbolicLink()) await temporaryInventory(root, local, entries);
  }
  return entries;
}

/** Measures an explicitly supplied trusted command; it is not a sandbox or redactor. */
export async function measureCommand(options) {
  const output = await claimOutput(options.output);
  const scratch = join(output, 'tmp'); await mkdir(scratch, { mode: 0o700 });
  const environment = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TZ', 'PLAYWRIGHT_BROWSERS_PATH', 'REPRO_BROWSER_CHANNEL', 'REPRO_REVISION']) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  environment.TMPDIR = scratch;
  const began = performance.now(), startedAt = new Date().toISOString();
  const elapsed = () => performance.now() - began;
  const observed = new Map(), samples = [], interventions = [], measurementErrors = [];
  const logs = { stdout: [], stderr: [] }, logBytes = { stdout: 0, stderr: 0 };
  let recordedLogBytes = 0, outputTruncated = false, peakRssBytes = 0;
  let child, processGroup, first, terminal, firstTemporaryFiles = [], terminalTemporaryFiles = [];
  let firstTemporaryCensus, temporaryCensusFailed = false;
  let exitAtMs, closedAtMs, stopAtMs, stopReason, exitCode = null, exitSignal = null, launchFailed = false;
  let watchdog, polling, terminalTimer, killTimer;
  let terminalReady;
  const terminalPromise = new Promise(accept => { terminalReady = accept; });
  const identity = row => `${row.pid}:${row.startedAt}`;
  function ownRows(rows) {
    const owned = new Map();
    for (const row of rows) {
      if (row.pgid === processGroup || observed.has(identity(row))) owned.set(row.pid, row);
    }
    let added;
    do {
      added = false;
      for (const row of rows) if (!owned.has(row.pid) && owned.has(row.ppid)) { owned.set(row.pid, row); added = true; }
    } while (added);
    for (const row of owned.values()) {
      const previous = observed.get(identity(row));
      observed.set(identity(row), { ...row, maxRssBytes: Math.max(previous?.maxRssBytes ?? 0, row.rssBytes) });
    }
    return [...owned.values()];
  }
  function sample(kind = 'sample') {
    const census = { kind, at: new Date().toISOString(), elapsedMs: elapsed(), owned: [], error: null };
    try { census.owned = ownRows(processSnapshot()); }
    catch (error) { census.error = error.code ?? 'CENSUS_FAILED'; if (!measurementErrors.includes(census.error)) measurementErrors.push(census.error); }
    census.rssBytes = census.owned.reduce((total, row) => total + row.rssBytes, 0);
    peakRssBytes = Math.max(peakRssBytes, census.rssBytes);
    if (samples.length < MAX_SAMPLES) samples.push({ elapsedMs: census.elapsedMs, rssBytes: census.rssBytes, ownedCount: census.owned.length, error: census.error });
    else if (!measurementErrors.includes('SAMPLE_LIMIT')) measurementErrors.push('SAMPLE_LIMIT');
    return census;
  }
  function signalOwned(signal) {
    const census = sample('before-signal');
    const grouped = census.owned.filter(row => row.pgid === processGroup);
    const escaped = census.owned.filter(row => row.pgid !== processGroup);
    const rootRunning = Number.isSafeInteger(processGroup) && processGroup > 0 && child?.pid === processGroup && child.exitCode === null && child.signalCode === null;
    if (!grouped.length && !escaped.length && !rootRunning) return;
    interventions.push({ signal, elapsedMs: elapsed(), processGroup, observedPids: census.owned.map(row => row.pid) });
    const send = pid => {
      try { process.kill(pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') measurementErrors.push('OWNED_SIGNAL_FAILED'); }
    };
    if (grouped.length || rootRunning) send(-processGroup);
    for (const row of escaped) send(row.pid);
  }
  function scheduleTerminal() {
    clearTimeout(terminalTimer);
    const deadline = stopAtMs === undefined ? exitAtMs + NORMAL_CLEANUP_MS : stopAtMs + STOP_CLEANUP_MS;
    terminalTimer = setTimeout(terminalReady, Math.max(0, deadline - elapsed()));
  }
  function recordFirstCensus(kind = 'first-post-exit') {
    first = sample(kind);
    firstTemporaryCensus = temporaryInventory(scratch).then(entries => { firstTemporaryFiles = entries; }, error => {
      temporaryCensusFailed = true; measurementErrors.push(error.code ?? 'TEMP_INVENTORY_FAILED');
    });
  }
  function stop(reason) {
    if (stopReason !== undefined) return;
    stopReason = reason; stopAtMs = elapsed();
    clearTimeout(watchdog);
    signalOwned('SIGTERM');
    killTimer = setTimeout(() => signalOwned('SIGKILL'), KILL_AFTER_MS);
    scheduleTerminal();
  }
  const cancel = () => stop('owner-cancelled');
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let closed;
  try {
    child = spawn(options.command[0], options.command.slice(1), { cwd: process.cwd(), env: environment, detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    processGroup = child.pid;
    closed = new Promise(accept => {
      child.once('error', () => {
        launchFailed = true; measurementErrors.push('COMMAND_UNAVAILABLE');
        clearTimeout(watchdog);
        if (exitAtMs === undefined) { exitAtMs = elapsed(); recordFirstCensus('first-post-launch-error'); scheduleTerminal(); }
      });
      child.once('exit', (code, signal) => {
        exitAtMs = elapsed(); exitCode = code; exitSignal = signal;
        clearTimeout(watchdog);
        recordFirstCensus();
        scheduleTerminal();
      });
      child.once('close', () => { closedAtMs = elapsed(); accept(); });
    });
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
      stream.on('data', bytes => {
        logBytes[name] += bytes.length;
        const remaining = Math.max(0, LOG_LIMIT - recordedLogBytes);
        if (remaining) { const recorded = bytes.subarray(0, remaining); logs[name].push(recorded); recordedLogBytes += recorded.length; }
        if (bytes.length > remaining) { outputTruncated = true; stop('output-limit'); }
      });
    }
    sample('startup');
    polling = setInterval(() => {
      const census = sample();
      if (census.error) stop('census-unavailable');
      if (samples.length >= MAX_SAMPLES) stop('sample-limit');
    }, SAMPLE_MS);
    watchdog = setTimeout(() => stop('timeout'), options.timeoutMs);
    await terminalPromise;
    terminal = sample('terminal');
    clearInterval(polling); clearTimeout(watchdog); clearTimeout(killTimer);
    try { terminalTemporaryFiles = await temporaryInventory(scratch); }
    catch (error) { temporaryCensusFailed = true; measurementErrors.push(error.code ?? 'TEMP_INVENTORY_FAILED'); }
    // The fixed-cutoff census above is immutable. Later emergency cleanup
    // cannot turn a missed cleanup criterion into a successful observation.
    let afterIntervention;
    if (terminal.owned.length) {
      signalOwned('SIGTERM'); await delay(KILL_AFTER_MS); signalOwned('SIGKILL');
      await delay(SAMPLE_MS); afterIntervention = sample('after-intervention');
    }
    await new Promise(accept => {
      const deadline = setTimeout(accept, 1000);
      void closed.then(() => { clearTimeout(deadline); accept(); });
    });
    await firstTemporaryCensus;
    if (closedAtMs === undefined) { measurementErrors.push('COMMAND_STREAMS_OPEN'); child.stdout.destroy(); child.stderr.destroy(); }
    if (!terminalTemporaryFiles.length && !temporaryCensusFailed) await rmdir(scratch);
    const cleanupPassed = first !== undefined && first.error === null && terminal.error === null && terminal.owned.length === 0 && terminalTemporaryFiles.length === 0 && !temporaryCensusFailed;
    const commandPassed = !launchFailed && exitCode === options.expectedExit && exitSignal === null;
    const outcome = stopReason === 'owner-cancelled' ? 'cancelled' : !stopReason && commandPassed && cleanupPassed && !outputTruncated && !measurementErrors.length ? 'completed' : 'failed';
    const artifacts = [];
    for (const name of ['stdout', 'stderr']) {
      const bytes = Buffer.concat(logs[name]);
      await writeFile(join(output, `${name}.log`), bytes, { flag: 'wx', mode: 0o600 });
      artifacts.push({ path: `${name}.log`, bytes: bytes.length, sha256: hash(bytes) });
    }
    const receipt = {
      schemaVersion: 1, classification: 'native-command-measurement', outcome, startedAt, finishedAt: new Date().toISOString(),
      durationMs: exitAtMs ?? elapsed(), durationScope: 'Command spawn through exit, including command-managed cleanup; post-exit observation and intervention time are separate', supervisorDurationMs: elapsed(), platform: `${process.platform}-${process.arch}`, node: process.version,
      command: { executable: basename(options.command[0]), argumentCount: options.command.length - 1, digest: hash(JSON.stringify(options.command)), expectedExit: options.expectedExit, exitCode, exitSignal, launchFailed, closedAtMs: closedAtMs ?? null },
      stopReason: stopReason ?? null, stopAtMs: stopAtMs ?? null,
      limits: { watchdogMs: options.timeoutMs, sampleMs: SAMPLE_MS, normalCleanupMs: NORMAL_CLEANUP_MS, stoppedCleanupMs: STOP_CLEANUP_MS, killAfterMs: KILL_AFTER_MS, combinedLogBytes: LOG_LIMIT },
      memory: { peakRssBytes, method: '100 ms sampled sum of owned process RSS; approximate, may count shared pages more than once; not a kernel/cgroup peak; supervisor excluded', samples },
      processes: { processGroup: processGroup ?? null, observed: [...observed.values()], method: 'Dedicated process group plus observed descendants and PID/start-time matching; short-lived escaped processes may be missed' },
      cleanup: { passed: cleanupPassed, first: first ?? null, terminal, afterIntervention: afterIntervention ?? null },
      temporaryFiles: { scope: 'Command TMPDIR only; product-specific profile/output cleanup needs its own evidence', first: firstTemporaryFiles, terminal: terminalTemporaryFiles, directoryRemoved: terminalTemporaryFiles.length === 0 && !temporaryCensusFailed },
      interventions, measurementErrors, logs: { receivedBytes: logBytes, truncated: outputTruncated, privacy: 'Bounded output of the explicitly supplied trusted command; not a general secret-redaction guarantee', artifacts },
      claims: 'Command execution and sampled native resource/cleanup evidence only. A matching exit code is not proof of the product behavioral assertion or fresh-environment portability.',
    };
    await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { receipt, path: join(output, 'receipt.json') };
  } finally {
    clearInterval(polling); clearTimeout(watchdog); clearTimeout(terminalTimer); clearTimeout(killTimer);
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await measureCommand(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify({ outcome: result.receipt.outcome, receipt: relative(process.cwd(), result.path) }));
    process.exitCode = result.receipt.outcome === 'completed' ? 0 : result.receipt.outcome === 'cancelled' ? 130 : 2;
  } catch (error) {
    console.error(JSON.stringify({ category: 'environment', code: error instanceof MeasurementError ? error.code : 'MEASUREMENT_FAILED', recovery: error instanceof MeasurementError ? error.message : 'Measurement could not finish. Preserve task evidence, inspect available prerequisites and retry with a new task-owned output.' }));
    process.exitCode = 2;
  }
}
