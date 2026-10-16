import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const POLICY_SHA256 = '949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b';
const POLICY_FILE = 'security/repro-chromium-seccomp.json';
const CASE_IDS = ['morphdom-textarea', 'htmx-checkbox', 'marked-empty-heading'];
const MEMORY_LIMIT = 1073741824;
const SETUP_LIMIT_MS = 900000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = milliseconds => new Promise(accept => setTimeout(accept, milliseconds));
class DriverError extends Error { constructor(code, message) { super(`${code}: ${message}`); this.code = code; } }

/** The environment opt-in records an approval supplied by the caller; this function never grants it. */
export function assertPolicyApproval(environment, bytes) {
  if (environment.REPRO_APPROVED_BETA_POLICY_SHA256 !== POLICY_SHA256) throw new DriverError('BETA_POLICY_APPROVAL', 'The owner must explicitly approve this unchanged policy for the three pinned public cases before execution. Set REPRO_APPROVED_BETA_POLICY_SHA256 only after that approval.');
  if (hash(bytes) !== POLICY_SHA256) throw new DriverError('BETA_POLICY_BYTES', 'Restore the exact reviewed policy bytes. A different profile requires separate review and approval.');
}

export function operationPlan(repetitions = 20) {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 20) throw new DriverError('BETA_ARGUMENTS', 'Use 1–20 repetition pairs; fewer than 20 are exploratory and cannot pass acceptance.');
  const workflow = [
    { name: 'capture', kind: 'capture', revision: 'buggy', expectedExit: 1, maximumMs: 30000, watchdogMs: 40000 },
    { name: 'replay', kind: 'replay', revision: 'buggy', expectedExit: 1, maximumMs: 30000, watchdogMs: 40000 },
    { name: 'reduce', kind: 'reduce', revision: 'buggy', expectedExit: 0, maximumMs: 300000, watchdogMs: 310000 },
    { name: 'export', kind: 'export', revision: 'buggy', expectedExit: 0, maximumMs: 15000, watchdogMs: 25000 },
  ];
  const stability = Array.from({ length: repetitions * 2 }, (_, index) => {
    const revision = index % 2 ? 'fixed' : 'buggy';
    return { name: `pair-${String(Math.floor(index / 2) + 1).padStart(2, '0')}-${revision}`, kind: 'readable', revision, expectedExit: revision === 'buggy' ? 1 : 0, maximumMs: 30000, watchdogMs: 40000 };
  });
  return { workflow, stability, acceptanceEligible: repetitions === 20, repetitions, setupMaximumMs: SETUP_LIMIT_MS,
    // Acquisition for both independent images shares the single frozen 15-minute setup allowance.
    batchWatchdogMs: SETUP_LIMIT_MS + [...workflow, ...stability].reduce((sum, op) => sum + op.watchdogMs + 40000, 0) + 120000 };
}

export function containerArguments({ name, owner, volume, image, policyPath, worker, operation }) {
  return ['create', '--name', name, '--label', `io.repro.beta.owner=${owner}`, '--platform', 'linux/arm64',
    '--init', '--user', 'node', '--workdir', '/work', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--security-opt', `seccomp=${policyPath}`,
    '--pids-limit', '128', '--memory', '1g', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,size=256m', '--shm-size', '256m', '--cgroupns', 'private',
    '--mount', `type=volume,source=${volume},target=/work/.repro-runs`, '--env', `REPRO_REVISION=${operation.revision}`,
    '--entrypoint', 'node', image, '--input-type=module', '-e', worker, JSON.stringify(operation)];
}

export function receiptProblems(receipt, operation) {
  const problems = [];
  if (!receipt || receipt.schemaVersion !== 1 || receipt.operation !== operation.name) return ['RECEIPT_IDENTITY'];
  if (receipt.command?.exitCode !== operation.expectedExit || receipt.command?.exitSignal !== null || receipt.command?.launchFailed !== false) problems.push('COMMAND_EXIT');
  if (!Number.isFinite(receipt.durationMs) || receipt.durationMs <= 0 || receipt.durationMs > operation.maximumMs) problems.push('DURATION_LIMIT');
  if (receipt.stopReason !== null) problems.push('FORCED_STOP');
  if (!Array.isArray(receipt.measurementErrors) || receipt.measurementErrors.length) problems.push('MEASUREMENT_INCOMPLETE');
  if (receipt.logsTruncated !== false) problems.push('LOGS_INCOMPLETE');
  for (const point of ['before', 'after']) {
    const memory = receipt.memory?.[point];
    if (!memory || !Number.isSafeInteger(memory.peakBytes) || memory.peakBytes <= 0 || memory.peakBytes > MEMORY_LIMIT || memory.maxBytes !== MEMORY_LIMIT || memory.pidsMax !== 128) problems.push('CGROUP_LIMITS');
    const cpu = typeof memory?.cpuMax === 'string' ? memory.cpuMax.split(' ').map(Number) : undefined;
    if (!cpu || cpu.length !== 2 || !cpu.every(Number.isFinite) || cpu[0] !== 2 * cpu[1] || cpu[1] <= 0) problems.push('CGROUP_CPU');
    if (memory?.events?.oom !== 0 || memory?.events?.oom_kill !== 0 || memory?.pidsEvents?.max !== 0) problems.push('CGROUP_DENIAL');
  }
  if (receipt.memory?.after?.peakBytes < receipt.memory?.before?.peakBytes) problems.push('CGROUP_PEAK_REGRESSION');
  const cleanup = receipt.cleanup;
  const timestamp = value => Number.isFinite(value) && value >= 0;
  const infrastructure = cleanup?.initial?.infrastructure;
  const identity = row => row && [row.pid, row.ppid, row.pgid, row.startTicks].every(Number.isSafeInteger)
    && row.pid > 0 && row.ppid >= 0 && row.pgid > 0 && row.startTicks > 0 && /^[RSDTWKPI]$/.test(row.state);
  const same = (left, right) => left && right && ['pid', 'ppid', 'pgid', 'startTicks'].every(key => left[key] === right[key]);
  const verifiedInfrastructure = point => {
    const current = point?.infrastructure;
    return identity(current?.init) && current.init.pid === 1 && current.init.ppid === 0
      && ['/sbin/docker-init', '/usr/sbin/docker-init'].includes(current.init.canonicalExecutable) && current.init.executable === current.init.canonicalExecutable
      && current.init.executable === infrastructure?.init?.executable && current.init.canonicalExecutable === infrastructure?.init?.canonicalExecutable
      && identity(current?.observer) && current.observer.pid > 1 && current.observer.ppid === 1
      && same(current.init, infrastructure?.init) && same(current.observer, infrastructure?.observer);
  };
  if (![cleanup?.initial, cleanup?.first, ...(Array.isArray(receipt.processes?.samples) ? receipt.processes.samples : []), cleanup?.terminal].every(verifiedInfrastructure)) problems.push('CENSUS_INFRASTRUCTURE');
  if (!cleanup || !Array.isArray(cleanup.initial?.owned) || cleanup.initial.owned.length || !Array.isArray(cleanup.first?.owned) || !Array.isArray(cleanup.terminal?.owned)) problems.push('CENSUS_INCOMPLETE');
  else {
    if (cleanup.terminal.owned.length) problems.push('OWNED_SURVIVORS');
    if (![cleanup.commandExitedAtMs, cleanup.initial.elapsedMs, cleanup.first.elapsedMs, cleanup.terminal.elapsedMs].every(timestamp)
      || cleanup.initial.elapsedMs > cleanup.commandExitedAtMs || cleanup.first.elapsedMs < cleanup.commandExitedAtMs
      || cleanup.terminal.elapsedMs - cleanup.commandExitedAtMs < 5000 || cleanup.terminal.elapsedMs <= cleanup.first.elapsedMs) problems.push('CENSUS_TIMING');
    const cutoff = cleanup.commandExitedAtMs + 5000;
    const censuses = [cleanup.first, ...(Array.isArray(receipt.processes?.samples) ? receipt.processes.samples : []), cleanup.terminal];
    if (!censuses.some(point => timestamp(point?.elapsedMs) && point.elapsedMs >= cleanup.commandExitedAtMs && point.elapsedMs <= cutoff && Array.isArray(point.owned) && point.owned.length === 0)) problems.push('CLEANUP_CUTOFF_UNVERIFIED');
  }
  if (!Array.isArray(cleanup?.temporaryFiles) || cleanup.temporaryFiles.length || !Array.isArray(cleanup?.profiles) || cleanup.profiles.length) problems.push('TEMPORARY_SURVIVORS');
  const fileCutoff = cleanup?.commandExitedAtMs + 5000;
  const firstInventoryValid = timestamp(cleanup?.firstInventoryAtMs) && cleanup.firstInventoryAtMs >= cleanup.commandExitedAtMs && cleanup.firstInventoryAtMs >= cleanup.first?.elapsedMs;
  const terminalInventoryValid = timestamp(cleanup?.terminalInventoryAtMs) && cleanup.terminalInventoryAtMs >= cleanup.commandExitedAtMs
    && cleanup.terminalInventoryAtMs >= cleanup.terminal?.elapsedMs && cleanup.terminalInventoryAtMs >= cleanup.firstInventoryAtMs;
  if (!firstInventoryValid || !terminalInventoryValid) problems.push('FILE_INVENTORY_TIMING');
  if (!(firstInventoryValid && Array.isArray(cleanup?.firstTemporaryFiles) && !cleanup.firstTemporaryFiles.length && Array.isArray(cleanup.firstProfiles) && !cleanup.firstProfiles.length && cleanup.firstInventoryAtMs <= fileCutoff)
    && !(terminalInventoryValid && Array.isArray(cleanup?.temporaryFiles) && !cleanup.temporaryFiles.length && Array.isArray(cleanup.profiles) && !cleanup.profiles.length && cleanup.terminalInventoryAtMs <= fileCutoff)) problems.push('FILE_CLEANUP_CUTOFF_UNVERIFIED');
  return [...new Set(problems)];
}

export function harnessForArtifact(manifest, bytes, trusted) {
  const definition = trusted.getRegisteredCase(manifest.caseId), artifact = hash(bytes);
  return trusted.digest({ executable: artifact, oracleExecutable: artifact, contract: definition.contractDigest, wrapper: definition.wrapperDigest, version: trusted.VERSION });
}

export function runEvidenceProblems(manifest, result, revision, trusted) {
  const problems = [];
  if (!result || typeof result.id !== 'string' || !result.id || result.id === 'not-executed') return ['RUN_MISSING'];
  if (result.manifestDigest !== trusted.digest(manifest) || result.assertionDigest !== manifest.assertionDigest || result.harnessDigest !== trusted.experimentHarnessDigest(manifest)
    || result.appRevision !== revision || result.appDigest !== trusted.revisionDigest(manifest, revision)
    || result.adapterVersion !== manifest.adapter.version || result.runnerVersion !== manifest.runnerVersion || result.seed !== manifest.environment.seed) problems.push('RUN_IDENTITY');
  const expected = revision === 'buggy' ? 'target-failure' : 'requirement-satisfied';
  if (result.assertionCount !== 1 || result.outcome !== expected || result.category !== (revision === 'buggy' ? 'target-failure' : undefined)) problems.push('FROZEN_ASSERTION');
  try { if (trusted.evaluateObservation(manifest, result.observation) !== expected) problems.push('OBSERVATION'); } catch { problems.push('OBSERVATION'); }
  return problems;
}

/** Read every namespace process; exclude only the verified init and this observer. */
export async function containerCensus(filesystem, processIdentity, expectedInfrastructure) {
  const fail = code => { throw Object.assign(new Error(`INIT_IDENTITY: ${code}. Inspect Docker init and namespace process identity under the unchanged controls before retrying.`), { code }); };
  const same = (left, right) => left && right && ['pid', 'ppid', 'pgid', 'startTicks'].every(key => left[key] === right[key]);
  const alive = row => row && !['Z', 'X', 'x'].includes(row.state);
  const read = async (pid, mayVanish = false) => {
    let raw;
    try { raw = await filesystem.readFile(`/proc/${pid}/stat`, 'utf8'); }
    catch (error) { if (mayVanish && ['ENOENT', 'ESRCH'].includes(error.code)) return; fail('CENSUS_PROCESS_STAT_UNAVAILABLE'); }
    if (!raw.startsWith(`${pid} (`) || raw.lastIndexOf(')') < 0) fail('CENSUS_PROCESS_STAT_INVALID');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/);
    const row = { pid, ppid: Number(fields[1]), pgid: Number(fields[2]), startTicks: Number(fields[19]), state: fields[0] };
    if (![row.pid, row.ppid, row.pgid, row.startTicks].every(Number.isSafeInteger)
      || row.pid <= 0 || row.ppid < 0 || row.pgid <= 0 || row.startTicks <= 0 || !/^[RSDZTWXxKPI]$/.test(row.state)) fail('CENSUS_PROCESS_STAT_INVALID');
    return row;
  };
  const canonical = async () => {
    let path;
    try { path = await filesystem.realpath('/sbin/docker-init'); } catch { fail('CENSUS_INIT_CANONICAL_UNAVAILABLE'); }
    if (!['/sbin/docker-init', '/usr/sbin/docker-init'].includes(path)) fail('CENSUS_INIT_CANONICAL_UNEXPECTED');
    return path;
  };
  const actual = async () => {
    try { return await filesystem.readlink('/proc/1/exe'); } catch { fail('CENSUS_INIT_EXECUTABLE_UNAVAILABLE'); }
  };
  if (!Number.isSafeInteger(processIdentity.pid) || processIdentity.pid <= 1 || processIdentity.ppid !== 1) fail('CENSUS_OBSERVER_PARENT');
  const canonicalExecutable = await canonical(), executable = await actual();
  const firstInit = await read(1);
  if (executable !== canonicalExecutable) fail('CENSUS_INIT_EXECUTABLE_MISMATCH');
  if (firstInit.ppid !== 0 || !alive(firstInit)) fail('CENSUS_INIT_IDENTITY');
  const rows = [];
  let names;
  try { names = await filesystem.readdir('/proc'); } catch { fail('CENSUS_PROCESS_DIRECTORY_UNAVAILABLE'); }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    const row = await read(Number(name), true);
    if (row) rows.push(row);
  }
  const lastInit = await read(1), lastExecutable = await actual(), lastCanonical = await canonical();
  const init = rows.find(row => row.pid === 1), observer = rows.find(row => row.pid === processIdentity.pid);
  if (!same(firstInit, init) || !same(firstInit, lastInit) || lastExecutable !== executable || lastCanonical !== canonicalExecutable || !alive(init) || !alive(lastInit)) fail('CENSUS_INIT_IDENTITY');
  if (!observer || observer.ppid !== processIdentity.ppid || !alive(observer)) fail('CENSUS_OBSERVER_IDENTITY');
  const infrastructure = { init: { ...init, executable, canonicalExecutable }, observer };
  if (expectedInfrastructure && (!same(init, expectedInfrastructure.init) || executable !== expectedInfrastructure.init?.executable
    || canonicalExecutable !== expectedInfrastructure.init?.canonicalExecutable || !same(observer, expectedInfrastructure.observer))) fail('CENSUS_INFRASTRUCTURE_CHANGED');
  return { infrastructure, owned: rows.filter(row => !same(row, init) && !same(row, observer)).sort((a, b) => a.pid - b.pid) };
}

/** Export only fixed diagnostic codes, never filesystem errors or arbitrary thrown values. */
export function measurementFailureCode(error) {
  return ['CENSUS_PROCESS_STAT_UNAVAILABLE', 'CENSUS_PROCESS_STAT_INVALID', 'CENSUS_INIT_CANONICAL_UNAVAILABLE',
    'CENSUS_INIT_CANONICAL_UNEXPECTED', 'CENSUS_INIT_EXECUTABLE_UNAVAILABLE', 'CENSUS_OBSERVER_PARENT',
    'CENSUS_INIT_EXECUTABLE_MISMATCH', 'CENSUS_INIT_IDENTITY', 'CENSUS_PROCESS_DIRECTORY_UNAVAILABLE',
    'CENSUS_OBSERVER_IDENTITY', 'CENSUS_INFRASTRUCTURE_CHANGED'].includes(error?.code) ? error.code : 'MEASUREMENT_CAUSE_UNAVAILABLE';
}

/** Timers may fire early; only the monotonic clock establishes the absolute cutoff. */
export async function waitUntilDeadline(deadline, now, delay) {
  for (let remaining = deadline - now(); remaining > 0; remaining = deadline - now()) await delay(Math.ceil(remaining));
}

// This function is serialized verbatim, reviewed and hashed, then supplied as a Node argument.
// It is a measurement supervisor, never an alternative oracle or capsule implementation.
async function isolatedWorker() {
  const { spawn } = await import('node:child_process');
  const { mkdir, readFile, readdir, readlink, realpath, lstat, writeFile, rmdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { performance } = await import('node:perf_hooks');
  const { createHash } = await import('node:crypto');
  const operation = JSON.parse(process.argv[1]);
  const base = '/work/.repro-runs', output = join(base, '.beta-observer', operation.name);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const began = performance.now(), elapsed = () => performance.now() - began;
  const delay = ms => new Promise(accept => setTimeout(accept, ms));
  const errors = [], observed = new Map(), samples = [], interventions = [];
  const measurementFailed = (phase, error) => { for (const code of [phase, measurementFailureCode(error)]) if (!errors.includes(code)) errors.push(code); };
  const scratch = '/tmp/repro-tmp', home = '/tmp/repro-home';
  await mkdir(scratch); await mkdir(home);
  let infrastructure;
  async function census() {
    const snapshot = await containerCensus({ readdir, readFile, readlink, realpath }, { pid: process.pid, ppid: process.ppid }, infrastructure);
    infrastructure ??= snapshot.infrastructure;
    snapshot.owned.forEach(row => observed.set(`${row.pid}:${row.startTicks}`, row));
    return { elapsedMs: elapsed(), ...snapshot };
  }
  async function kernel() {
    const values = {};
    for (const file of ['memory.peak', 'memory.current', 'memory.max', 'memory.events', 'pids.current', 'pids.max', 'pids.events', 'cpu.max']) values[file] = (await readFile(`/sys/fs/cgroup/${file}`, 'utf8')).trim();
    const events = value => Object.fromEntries(value.split('\n').map(line => { const [key, number] = line.split(/\s+/); return [key, Number(number)]; }));
    return { peakBytes: Number(values['memory.peak']), currentBytes: Number(values['memory.current']), maxBytes: Number(values['memory.max']), events: events(values['memory.events']), pidsCurrent: Number(values['pids.current']), pidsMax: Number(values['pids.max']), pidsEvents: events(values['pids.events']), cpuMax: values['cpu.max'] };
  }
  async function inventory(root, prefix = '', selected = () => true, entries = []) {
    for (const name of await readdir(join(root, prefix))) {
      if (entries.length >= 20000 || prefix.split('/').length > 40) throw new Error('inventory limit');
      const local = prefix ? `${prefix}/${name}` : name, stat = await lstat(join(root, local));
      if (selected(local, name)) entries.push({ path: local, kind: stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : stat.isSocket() ? 'socket' : 'file', bytes: stat.size });
      if (stat.isDirectory() && !stat.isSymbolicLink()) await inventory(root, local, selected, entries);
    }
    return entries;
  }
  let before, after, initial, first, terminal, firstTemporaryFiles = [], firstProfiles = [], temporaryFiles = [], profiles = [], firstInventoryAtMs, terminalInventoryAtMs;
  try { before = await kernel(); initial = await census(); } catch (error) { measurementFailed('INITIAL_MEASUREMENT_UNAVAILABLE', error); }
  if (operation.kind === 'capture') {
    const { getRegisteredCase } = await import('/work/dist/index.js');
    const selected = getRegisteredCase(operation.caseId);
    await writeFile(join(base, 'declaration.json'), JSON.stringify({ caseId: selected.id, expectation: selected.expectation }), { flag: 'wx', mode: 0o600 });
  }
  const paths = {
    capture: ['dist/cli.js', 'record', '--consent', '--experiment', '.repro-runs/declaration.json', '--output', '.repro-runs/capture'],
    replay: ['dist/cli.js', 'replay', '--manifest', '.repro-runs/capture/manifest.json', '--output', '.repro-runs/replay'],
    reduce: ['dist/cli.js', 'reduce', '--manifest', '.repro-runs/capture/manifest.json', '--budget', '80', '--output', '.repro-runs/reduce'],
    export: ['dist/cli.js', 'export', '--manifest', '.repro-runs/reduce/reduced.manifest.json', '--output', '.repro-runs/capsule'],
    readable: ['--test', '--test-reporter=tap', 'replay.test.mjs'],
  };
  const args = paths[operation.kind];
  if (!args) throw new Error('Unsupported measured operation');
  const logs = { stdout: [], stderr: [] }, logBytes = { stdout: 0, stderr: 0 };
  let storedBytes = 0, logsTruncated = false, exitCode = null, exitSignal = null, launchFailed = false, child, group, commandExitedAtMs, stopReason = null, stopAtMs;
  let ended;
  const exit = new Promise(accept => { ended = accept; });
  function signal(signal) {
    if (!group) return;
    try { process.kill(-group, signal); interventions.push({ signal, elapsedMs: elapsed() }); }
    catch (error) { if (error.code !== 'ESRCH') errors.push('OWNED_SIGNAL_FAILED'); }
  }
  function stop(reason) {
    if (stopReason || commandExitedAtMs !== undefined) return;
    stopReason = reason; stopAtMs = elapsed(); signal('SIGTERM');
    setTimeout(() => signal('SIGKILL'), 3000).unref();
  }
  process.on('SIGTERM', () => stop('owner-cancelled'));
  process.on('SIGINT', () => stop('owner-cancelled'));
  const commandBegan = performance.now();
  const timer = setTimeout(() => stop('timeout'), operation.watchdogMs);
  let pendingSample;
  const polling = setInterval(() => {
    if (pendingSample) return;
    pendingSample = census().then(snapshot => { if (samples.length < 10000) samples.push(snapshot); else if (!errors.includes('SAMPLE_LIMIT')) errors.push('SAMPLE_LIMIT'); }).catch(error => measurementFailed('CENSUS_UNAVAILABLE', error)).finally(() => { pendingSample = undefined; });
  }, 100);
  child = spawn(process.execPath, args, { cwd: '/work', detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: home, TMPDIR: scratch, PLAYWRIGHT_BROWSERS_PATH: '/opt/playwright', REPRO_REVISION: operation.revision } });
  group = child.pid;
  for (const stream of ['stdout', 'stderr']) child[stream].on('data', bytes => {
    logBytes[stream] += bytes.length;
    const retain = bytes.subarray(0, Math.max(0, 2 * 1024 * 1024 - storedBytes));
    if (retain.length) { logs[stream].push(retain); storedBytes += retain.length; }
    if (retain.length < bytes.length) logsTruncated = true;
  });
  child.once('error', () => { launchFailed = true; errors.push('COMMAND_UNAVAILABLE'); commandExitedAtMs = elapsed(); clearTimeout(timer); ended(); });
  child.once('exit', (code, signal) => { exitCode = code; exitSignal = signal; commandExitedAtMs = elapsed(); clearTimeout(timer); ended(); });
  await exit;
  const durationMs = performance.now() - commandBegan;
  try {
    first = await census();
    firstTemporaryFiles = await inventory('/tmp', '', local => local !== 'repro-tmp' && local !== 'repro-home');
    firstProfiles = await inventory(base, '', (local, name) => name === '.profile' || local.split('/').includes('.profile'));
    firstInventoryAtMs = elapsed();
  } catch (error) { measurementFailed('FIRST_CENSUS_UNAVAILABLE', error); }
  const deadline = (stopAtMs ?? commandExitedAtMs) + (stopReason ? 8000 : 5000);
  await waitUntilDeadline(deadline, elapsed, delay);
  clearInterval(polling); await pendingSample;
  try {
    terminal = await census();
    temporaryFiles = await inventory('/tmp', '', local => local !== 'repro-tmp' && local !== 'repro-home');
    profiles = await inventory(base, '', (local, name) => name === '.profile' || local.split('/').includes('.profile'));
    terminalInventoryAtMs = elapsed();
    after = await kernel();
  } catch (error) { measurementFailed('TERMINAL_MEASUREMENT_UNAVAILABLE', error); }
  // Preserve the original failed census. Container removal is the final containment boundary.
  if (terminal?.owned.length) signal('SIGKILL');
  if (!temporaryFiles.length) { await rmdir(scratch); await rmdir(home); }
  const logRecords = {};
  for (const stream of ['stdout', 'stderr']) {
    const bytes = Buffer.concat(logs[stream]); await writeFile(join(output, `${stream}.log`), bytes, { flag: 'wx', mode: 0o600 });
    logRecords[stream] = { observedBytes: logBytes[stream], retainedBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  const receipt = { schemaVersion: 1, operation: operation.name, caseId: operation.caseId, platform: `${process.platform}-${process.arch}`, node: process.version,
    command: { exitCode, exitSignal, launchFailed }, durationMs, durationScope: 'Node command spawn through natural exit, including ordinary command-owned setup and cleanup; independent 5/8-second census excluded',
    stopReason, stopAtMs, measurementErrors: errors, logsTruncated, logs: logRecords, interventions,
    memory: { method: 'Linux cgroup v2 kernel memory.peak for this distinct container, including observer', before, after },
    processes: { observed: [...observed.values()], samples },
    cleanup: { initial, first, terminal, commandExitedAtMs, firstTemporaryFiles, firstProfiles, firstInventoryAtMs, temporaryFiles, profiles, terminalInventoryAtMs } };
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ operation: operation.name, receipt: `.repro-runs/.beta-observer/${operation.name}/receipt.json` }));
  process.exit(stopReason || errors.length || launchFailed || exitCode !== operation.expectedExit || logsTruncated || terminal?.owned.length || temporaryFiles.length || profiles.length ? 2 : 0);
}

export function workerSource() { return `${containerCensus.toString()}\n${measurementFailureCode.toString()}\n${waitUntilDeadline.toString()}\n(${isolatedWorker.toString()})().catch(() => { console.error('OBSERVER_INCOMPLETE: Preserve this container receipt and inspect the approved environment before retrying.'); process.exitCode = 2; });\n`; }

export function inspectProblems(inspect, volume, policyBytes) {
  const problems = [], config = inspect?.Config, host = inspect?.HostConfig;
  if (config?.User !== 'node' || config?.WorkingDir !== '/work' || !host || host.Init !== true || host.Privileged !== false || host.ReadonlyRootfs !== true || host.NetworkMode !== 'none'
    || host.PidsLimit !== 128 || host.Memory !== MEMORY_LIMIT || host.NanoCpus !== 2000000000 || host.ShmSize !== 268435456 || host.CgroupnsMode !== 'private') problems.push('CONTAINER_BOUNDARY');
  if (JSON.stringify(host?.CapDrop) !== '["ALL"]' || host?.CapAdd?.length || host?.Binds?.length || host?.Devices?.length || host?.DeviceRequests?.length || host?.PidMode || host?.IpcMode === 'host'
    || Object.keys(host?.PortBindings ?? {}).length || host?.PublishAllPorts) problems.push('CONTAINER_HOST_ACCESS');
  const mounts = inspect?.Mounts;
  if (!Array.isArray(mounts) || mounts.length !== 1 || mounts[0]?.Type !== 'volume' || mounts[0]?.Name !== volume || mounts[0]?.Destination !== '/work/.repro-runs' || mounts[0]?.RW !== true) problems.push('CONTAINER_MOUNTS');
  if (host?.Tmpfs?.['/tmp'] !== 'rw,nosuid,size=256m' || Object.keys(host?.Tmpfs ?? {}).length !== 1) problems.push('CONTAINER_TMPFS');
  const options = host?.SecurityOpt ?? [];
  if (!options.includes('no-new-privileges') && !options.includes('no-new-privileges=true')) problems.push('NO_NEW_PRIVILEGES');
  const seccomp = options.filter(option => option.startsWith('seccomp='));
  try {
    // Docker stores the expanded JSON, not the client policy pathname.
    if (seccomp.length !== 1 || JSON.stringify(JSON.parse(seccomp[0].slice(8))) !== JSON.stringify(JSON.parse(policyBytes.toString()))) problems.push('CONTAINER_POLICY');
  } catch { problems.push('CONTAINER_POLICY'); }
  if (inspect?.State?.OOMKilled) problems.push('CONTAINER_OOM');
  return [...new Set(problems)];
}

async function claimOutput(output) {
  const full = resolve(output), local = relative(resolve('.repro-runs'), full);
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new DriverError('BETA_OUTPUT', 'Choose a new output beneath this project .repro-runs directory.');
  let current = process.cwd();
  for (const part of relative(current, dirname(full)).split(sep)) {
    current = join(current, part);
    try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new DriverError('BETA_LINK', 'Output parents must be real task-owned directories, not links.');
  }
  try { await mkdir(full, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') throw new DriverError('BETA_EXISTS', 'Preserve the previous evidence and select a fresh output directory.'); throw error; }
  return full;
}

async function writeJson(path, value) { await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
async function jsonFile(path) { return JSON.parse(await readFile(path, 'utf8')); }

async function inventory(root, prefix = '', files = []) {
  for (const name of (await readdir(join(root, prefix))).sort()) {
    if (files.length > 30000 || prefix.split('/').length > 40) throw new DriverError('BETA_INVENTORY_LIMIT', 'The retained evidence exceeds its bounded inventory. Preserve it for inspection.');
    const local = prefix ? `${prefix}/${name}` : name, full = join(root, local), stat = await lstat(full);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()) || stat.nlink > 1 && stat.isFile()) throw new DriverError('BETA_LINK', 'Evidence must contain only ordinary files and directories; linked or special entries are retained but cannot pass verification.');
    if (stat.isDirectory()) await inventory(root, local, files);
    else {
      if (stat.size > 32 * 1024 * 1024) throw new DriverError('BETA_FILE_LIMIT', 'An evidence file exceeds the measurement bound. Preserve it for inspection.');
      files.push({ path: local, bytes: stat.size, sha256: hash(await readFile(full)) });
    }
  }
  return files;
}

async function contextSnapshot(directory) {
  const index = await jsonFile(join(directory, 'integrity.json'));
  const entries = index.files;
  if (!Array.isArray(entries)) throw new DriverError('BETA_CONTEXT_INDEX', 'Use a complete validated capsule.');
  const files = [];
  for (const path of ['integrity.json', ...entries.map(entry => entry.path)].sort()) {
    if (typeof path !== 'string' || path.includes('..') || path.startsWith('/') || path.includes('\\')) throw new DriverError('BETA_CONTEXT_PATH', 'Capsule context paths must be validated relative paths.');
    const bytes = await readFile(join(directory, path)); files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  return { sha256: hash(JSON.stringify(files)), bytes: files.reduce((sum, item) => sum + item.bytes, 0), files };
}

async function copyContext(source, target, trusted) {
  const manifest = await trusted.importCapsule(source), before = await contextSnapshot(source);
  if (manifest.schemaVersion !== 3 || !CASE_IDS.includes(manifest.caseId)) throw new DriverError('BETA_COHORT', 'This driver accepts only the three reviewed schema-3 public cases.');
  await mkdir(target, { mode: 0o700 });
  for (const file of before.files) { const destination = join(target, file.path); await mkdir(dirname(destination), { recursive: true }); await copyFile(join(source, file.path), destination); }
  await trusted.importCapsule(target);
  const copied = await contextSnapshot(target), after = await contextSnapshot(source);
  if (before.sha256 !== copied.sha256 || before.sha256 !== after.sha256) throw new DriverError('BETA_CONTEXT_CHANGED', 'Capsule bytes changed during copying. Preserve the original and retry from a stable export.');
  return { manifest, snapshot: copied, sourceSnapshot: before };
}

function parseArguments(args) {
  const options = { repetitions: 20, prepare: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--capsule', '--output', '--repetitions', '--previous-summary', '--prepare'].includes(key) || seen.has(key)) throw new DriverError('BETA_ARGUMENTS', 'Use --capsule DIRECTORY --output .repro-runs/NEW [--repetitions 1..20] [--previous-summary FILE] [--prepare].');
    seen.add(key);
    if (key === '--prepare') options.prepare = true;
    else { const value = args[++i]; if (!value || value.startsWith('--')) throw new DriverError('BETA_ARGUMENTS', 'Each option requires its explicit value.'); options[key === '--previous-summary' ? 'previousSummary' : key.slice(2)] = key === '--repetitions' ? Number(value) : value; }
  }
  if (!options.capsule || !options.output) throw new DriverError('BETA_ARGUMENTS', 'Provide a validated capsule and a fresh task-owned output directory.');
  operationPlan(options.repetitions);
  return options;
}

export async function verifyIsolated(options) {
  const policyBytes = await readFile(POLICY_FILE);
  if (hash(policyBytes) !== POLICY_SHA256) throw new DriverError('BETA_POLICY_BYTES', 'Restore the exact reviewed policy bytes.');
  // Deliberately before directory creation, trusted imports, and every possible Docker call.
  if (!options.prepare) assertPolicyApproval(process.env, policyBytes);
  if (!options.prepare && (!process.env.DOCKER_HOST?.startsWith('unix:///') || process.env.DOCKER_HOST.includes('\n'))) throw new DriverError('BETA_DOCKER_HOST', 'Supply the explicit Unix socket of the separately prepared fresh task-owned daemon via DOCKER_HOST.');
  const plan = operationPlan(options.repetitions), output = await claimOutput(options.output);
  const trusted = await import(pathToFileURL(resolve('dist/index.js')).href);
  const input = await copyContext(resolve(options.capsule), join(output, 'input-context'), trusted);
  const owner = randomUUID(), worker = workerSource(), policyPath = join(output, 'reviewed-seccomp.json');
  const driverSha256 = hash(await readFile(fileURLToPath(import.meta.url))), protocolSha256 = hash(await readFile('benchmarks/PRACTICAL-BETA-PROTOCOL.md'));
  await writeFile(policyPath, policyBytes, { flag: 'wx', mode: 0o600 });
  await writeFile(join(output, 'observer.mjs'), worker, { flag: 'wx', mode: 0o600 });
  await writeJson(join(output, 'plan.json'), { ...plan, caseId: input.manifest.caseId, owner, policySha256: POLICY_SHA256, observerSha256: hash(worker), context: input.snapshot,
    platform: 'linux-arm64', boundary: 'Fresh declared Docker daemon; exact capsule-only builds; isolated distinct operation containers; no host binds, network, credentials or existing dependency/browser caches',
    policyStatus: options.prepare ? 'not executed; explicit owner approval still required' : 'caller supplied explicit policy approval attestation', accessibility: 'deferred/unverified' });
  if (options.prepare) return { status: 'prepared-not-executed', output, acceptance: false };
  const dockerEnvironment = { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', DOCKER_HOST: process.env.DOCKER_HOST, DOCKER_CONFIG: join(output, 'docker-config'), LANG: 'C', LC_ALL: 'C' };
  await mkdir(dockerEnvironment.DOCKER_CONFIG, { mode: 0o700 });
  await writeFile(join(dockerEnvironment.DOCKER_CONFIG, 'config.json'), '{}\n', { flag: 'wx', mode: 0o600 });
  const began = performance.now(), receipts = [], images = [], publicBaseImages = new Set(), containers = new Set(), volumes = new Set(), failures = [], runIds = new Set();
  let setupDurationMs = 0, sequence = 0, cancelled = false, finalContext, activeContainer, sentinel, sentinelVolume, sentinelIdentity, session;
  const cancel = () => { cancelled = true; };
  process.on('SIGTERM', cancel); process.on('SIGINT', cancel);
  async function docker(args, name, maximumMs = 30000, allowFailure = false, cleanup = false) {
    if (!cleanup && cancelled) throw new DriverError('BETA_CANCELLED', 'Owner cancellation stopped this batch. Evidence is preserved.');
    if (!cleanup && performance.now() - began > plan.batchWatchdogMs) throw new DriverError('BETA_BATCH_TIMEOUT', 'The predeclared batch watchdog expired; preserve incomplete results.');
    const logBase = join(output, `${String(++sequence).padStart(3, '0')}-${name}`), chunks = { stdout: [], stderr: [] };
    let total = 0, truncated = false;
    const commandBegan = performance.now();
    const child = spawn('docker', args, { env: dockerEnvironment, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', bytes => { const keep = bytes.subarray(0, Math.max(0, 10 * 1024 * 1024 - total)); if (keep.length) { chunks[stream].push(keep); total += keep.length; } if (keep.length < bytes.length) truncated = true; });
    const result = await watchDockerClient(child, { maximumMs, isCancelled: () => cancelled, cleanup, onSignalError: () => failures.push('DOCKER_CLIENT_SIGNAL') });
    const { timedOut, cancelled: signalSent } = result;
    const stdout = Buffer.concat(chunks.stdout), stderr = Buffer.concat(chunks.stderr), durationMs = performance.now() - commandBegan;
    await writeFile(`${logBase}.stdout.log`, stdout, { flag: 'wx', mode: 0o600 }); await writeFile(`${logBase}.stderr.log`, stderr, { flag: 'wx', mode: 0o600 });
    await writeJson(`${logBase}.json`, { command: args[0], argumentsSha256: hash(JSON.stringify(args)), ...result, durationMs, timedOut, cancelled: signalSent, truncated,
      stdout: { bytes: stdout.length, sha256: hash(stdout) }, stderr: { bytes: stderr.length, sha256: hash(stderr) } });
    if (result.launchFailed || timedOut || truncated || signalSent || !allowFailure && result.code !== 0) throw new DriverError(timedOut ? 'BETA_DOCKER_TIMEOUT' : signalSent ? 'BETA_CANCELLED' : 'BETA_DOCKER_COMMAND', 'A bounded Docker operation failed. Inspect its retained task-owned logs; no target-failure claim is available.');
    return { ...result, stdout: stdout.toString(), stderr: stderr.toString(), durationMs };
  }
  async function inspect(name, suffix) {
    const result = await docker(['inspect', name], suffix, 15000, false, true);
    const objects = JSON.parse(result.stdout); if (objects.length !== 1) throw new DriverError('BETA_INSPECT', 'Container inspection did not identify exactly one owned container.'); return objects[0];
  }
  function requireOwner(object) {
    if (object?.Config?.Labels?.['io.repro.beta.owner'] !== owner && object?.Labels?.['io.repro.beta.owner'] !== owner) throw new DriverError('BETA_RESOURCE_OWNER', 'The named resource does not carry this task’s exact ownership label. It will not be stopped, changed or removed.');
  }
  async function build(context, label) {
    const remaining = SETUP_LIMIT_MS - setupDurationMs;
    if (remaining <= 0) throw new DriverError('BETA_SETUP_TIMEOUT', 'Both clean builds share the frozen 15-minute setup allowance.');
    const before = await contextSnapshot(context), began = performance.now(), iid = join(output, `${label}-image.id`);
    try { await docker(['build', '--no-cache', '--pull', '--platform', 'linux/arm64', '--label', `io.repro.beta.owner=${owner}`, '--iidfile', iid, context], `${label}-build`, remaining); }
    finally { setupDurationMs += performance.now() - began; }
    const id = (await readFile(iid, 'utf8')).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new DriverError('BETA_IMAGE_ID', 'The clean build did not supply an immutable image identity.');
    const after = await contextSnapshot(context);
    if (before.sha256 !== after.sha256) throw new DriverError('BETA_CONTEXT_CHANGED', 'Build context bytes changed during acquisition.');
    const image = JSON.parse((await docker(['image', 'inspect', id], `${label}-image-inspect`)).stdout)[0];
    if (image.Os !== 'linux' || image.Architecture !== 'arm64' || image.Config?.User !== 'node') throw new DriverError('BETA_IMAGE_PLATFORM', 'The built image must be Linux arm64 and declare the unprivileged node user.');
    const recipe = await readFile(join(context, 'Dockerfile'), 'utf8'), base = /^FROM (node:[^\s]+@sha256:[a-f0-9]{64})$/m.exec(recipe)?.[1];
    if (!base) throw new DriverError('BETA_BASE_IDENTITY', 'The validated Dockerfile must name its exact public base image digest.');
    // BuildKit may retain the base only in its content store; a separately tagged base is permitted only by this exact digest lookup.
    const baseInspect = await docker(['image', 'inspect', base], `${label}-public-base`, 15000, true);
    if (baseInspect.code === 0) {
      const objects = JSON.parse(baseInspect.stdout);
      if (objects.length !== 1 || objects[0].Os !== 'linux' || objects[0].Architecture !== 'arm64' || !/^sha256:[a-f0-9]{64}$/.test(objects[0].Id)) throw new DriverError('BETA_BASE_IDENTITY', 'The exact public base image lookup was inconsistent.');
      publicBaseImages.add(objects[0].Id);
    }
    images.push({ id, label, before, after, durationMs: performance.now() - began, retainedAsArtifact: true }); return id;
  }
  async function volume(label) {
    const name = `repro-beta-${owner}-${label}`;
    await docker(['volume', 'create', '--label', `io.repro.beta.owner=${owner}`, name], `${label}-volume-create`);
    const found = JSON.parse((await docker(['volume', 'inspect', name], `${label}-volume-inspect`)).stdout)[0]; requireOwner(found);
    volumes.add(name); return name;
  }
  async function removeContainer(name) {
    requireOwner(await inspect(name, 'remove-container-owner'));
    await docker(['rm', '--force', name], 'container-remove', 20000, false, true); containers.delete(name);
  }
  async function removeVolume(name) {
    const found = JSON.parse((await docker(['volume', 'inspect', name], 'remove-volume-owner', 15000, false, true)).stdout)[0]; requireOwner(found);
    await docker(['volume', 'rm', name], 'volume-remove', 20000, false, true); volumes.delete(name);
  }
  async function sentinelCensus(suffix) {
    const object = await inspect(sentinel, suffix); requireOwner(object);
    if (!object.State?.Running || object.State?.OOMKilled || object.State?.Pid !== sentinelIdentity.pid || object.State?.StartedAt !== sentinelIdentity.startedAt) throw new DriverError('BETA_SENTINEL', 'The separate unrelated sentinel did not remain alive with the same process identity.');
    return { containerId: object.Id, pid: object.State.Pid, startedAt: object.State.StartedAt, running: object.State.Running, observedAt: new Date().toISOString() };
  }
  async function execute(operation, image, dataVolume) {
    const name = `repro-beta-${owner}-${operation.name}`, evidence = join(output, operation.name);
    const op = { ...operation, caseId: input.manifest.caseId };
    const sentinelBefore = await sentinelCensus(`${op.name}-sentinel-before`);
    await docker(containerArguments({ name, owner, volume: dataVolume, image, policyPath, worker, operation: op }), `${op.name}-create`);
    containers.add(name); activeContainer = name;
    const before = await inspect(name, `${op.name}-inspect-before`);
    requireOwner(before);
    const boundary = inspectProblems(before, dataVolume, policyBytes); if (boundary.length) throw new DriverError('BETA_CONTAINER_BOUNDARY', boundary.join(', '));
    let attachedError;
    try { await docker(['start', '--attach', name], `${op.name}-attached`, op.watchdogMs + 18000, true); }
    catch (error) { attachedError = error.code ?? 'BETA_ATTACHED'; await docker(['stop', '--time', '12', name], `${op.name}-stop`, 15000, true, true); }
    const after = await inspect(name, `${op.name}-inspect-after`);
    if (after.State?.Running) { await docker(['stop', '--time', '12', name], `${op.name}-stop-running`, 15000, true, true); attachedError ??= 'CONTAINER_STILL_RUNNING'; }
    await mkdir(evidence, { mode: 0o700 });
    await docker(['cp', `${name}:/work/.repro-runs/.`, evidence], `${op.name}-copy`, 30000, false, true);
    const files = await inventory(evidence);
    const receipt = await jsonFile(join(evidence, '.beta-observer', op.name, 'receipt.json'));
    const problems = [...receiptProblems(receipt, op), ...inspectProblems(after, dataVolume, policyBytes)];
    if (attachedError) problems.push(attachedError);
    if (after.State?.ExitCode !== 0) problems.push('OBSERVER_EXIT');
    const sentinelAfter = await sentinelCensus(`${op.name}-sentinel-after`);
    const record = { operation: op, receipt, inspect: { before, after }, files, problems, sentinel: { before: sentinelBefore, after: sentinelAfter } };
    receipts.push(record);
    await writeJson(join(output, `${op.name}-measurement.json`), record);
    await removeContainer(name); activeContainer = undefined;
    if (problems.length) throw new DriverError('BETA_MEASUREMENT_FAILED', `${op.name}: ${problems.join(', ')}. Preserve the original failed receipt.`);
    return { record, evidence };
  }
  function checkRun(manifest, result, revision, artifact) {
    const evaluator = artifact ? { ...trusted, experimentHarnessDigest: value => harnessForArtifact(value, artifact, trusted) } : trusted;
    const problems = runEvidenceProblems(manifest, result, revision, evaluator);
    if (runIds.has(result?.id)) problems.push('REUSED_RUN');
    if (problems.length) throw new DriverError('BETA_BEHAVIOR_UNVERIFIED', problems.join(', '));
    runIds.add(result.id); return result;
  }
  let status = 'inconclusive', original, reduced, size;
  try {
    // Read-only daemon inventory records the independently prepared environment. A nonempty store is not silently accepted as fresh.
    const imageList = await docker(['image', 'ls', '--quiet', '--no-trunc'], 'initial-images');
    const containerList = await docker(['ps', '--all', '--quiet', '--no-trunc'], 'initial-containers');
    const volumeList = await docker(['volume', 'ls', '--quiet'], 'initial-volumes');
    const daemonId = JSON.parse((await docker(['info', '--format', '{{json .ID}}'], 'daemon-id')).stdout);
    const imageIds = [...new Set(imageList.stdout.trim().split('\n').filter(Boolean))].sort();
    if (containerList.stdout.trim() || volumeList.stdout.trim()) throw new DriverError('BETA_DAEMON_NOT_CLEAN', 'This batch must begin with no containers or volumes. Preserve foreign resources and select the task-owned daemon.');
    if (options.previousSummary) {
      const bytes = await readFile(resolve(options.previousSummary)), previous = JSON.parse(bytes.toString());
      if (previous.driverSha256 !== driverSha256 || previous.protocolSha256 !== protocolSha256 || previous.policySha256 !== POLICY_SHA256 || previous.session?.daemonId !== daemonId || previous.session?.originEmpty !== true
        || previous.retainedContainers?.length || previous.retainedVolumes?.length || !previous.session?.terminalInventoryVerified
        || JSON.stringify(previous.session.terminalImageIds) !== JSON.stringify(imageIds)) throw new DriverError('BETA_SESSION_CHAIN', 'The preceding receipt must bind this exact driver, protocol, clean daemon and unchanged prior cohort image inventory.');
      session = { id: previous.session.id, daemonId, originEmpty: true, originReceipt: previous.session.originReceipt, previousSummary: { path: resolve(options.previousSummary), sha256: hash(bytes) }, previousOwners: [...previous.session.previousOwners, previous.owner], initialImageIds: imageIds };
    } else {
      if (imageIds.length) throw new DriverError('BETA_DAEMON_NOT_FRESH', 'The first cohort case requires a new empty daemon. Subsequent cases require --previous-summary binding the exact same-session inventory.');
      session = { id: owner, daemonId, originEmpty: true, originReceipt: join(output, 'summary.json'), previousOwners: [], initialImageIds: [] };
    }
    await docker(['version', '--format', '{{json .}}'], 'docker-version');
    const inputImage = await build(join(output, 'input-context'), 'input');
    sentinelVolume = await volume('sentinel'); sentinel = `repro-beta-${owner}-sentinel`;
    await docker(containerArguments({ name: sentinel, owner, volume: sentinelVolume, image: inputImage, policyPath, worker: 'process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000);', operation: { revision: 'buggy', name: 'unrelated-sentinel' } }), 'sentinel-create');
    containers.add(sentinel);
    requireOwner(await inspect(sentinel, 'sentinel-created-owner'));
    await docker(['start', sentinel], 'sentinel-start');
    const sentinelStarted = await inspect(sentinel, 'sentinel-started');
    const sentinelProblems = inspectProblems(sentinelStarted, sentinelVolume, policyBytes);
    if (sentinelProblems.length) throw new DriverError('BETA_SENTINEL_BOUNDARY', sentinelProblems.join(', '));
    sentinelIdentity = { pid: sentinelStarted.State.Pid, startedAt: sentinelStarted.State.StartedAt };
    await sentinelCensus('sentinel-initial-census');
    const workflowVolume = await volume('workflow');
    const capture = await execute(plan.workflow[0], inputImage, workflowVolume);
    const cliBytes = await readFile(join(output, 'input-context', 'dist/cli.js'));
    original = trusted.validateManifest(await jsonFile(join(capture.evidence, 'capture', 'manifest.json')));
    if (trusted.digest(original) !== trusted.digest(trusted.createCaseManifest(input.manifest.caseId))) throw new DriverError('BETA_CAPTURE_DECLARATION', 'Capture did not preserve the complete registered declaration.');
    checkRun(original, await jsonFile(join(capture.evidence, 'capture', 'result.json')), 'buggy', cliBytes);
    const replay = await execute(plan.workflow[1], inputImage, workflowVolume);
    checkRun(original, await jsonFile(join(replay.evidence, 'replay', 'result.json')), 'buggy', cliBytes);
    const reduction = await execute(plan.workflow[2], inputImage, workflowVolume);
    reduced = trusted.validateManifest(await jsonFile(join(reduction.evidence, 'reduce', 'reduced.manifest.json')));
    const result = await jsonFile(join(reduction.evidence, 'reduce', 'result.json'));
    if (!['complete', 'budget-exhausted'].includes(result.status) || result.executions > 80 || result.executions < 2 || result.durationMs > 300000 || trusted.digest(result.manifest) !== trusted.digest(reduced)
      || reduced.assertionDigest !== original.assertionDigest || reduced.actions.length > original.actions.length || !Array.isArray(result.trials)) throw new DriverError('BETA_REDUCTION', 'Reduction did not meet the frozen identity and execution-budget contract.');
    // Independently inspect all retained trial evidence, including rejected and inconclusive attempts.
    const evidenceFiles = reduction.record.files.filter(file => file.path.startsWith('reduce/') && /(?:^|\/)evidence\.json$/.test(file.path));
    if (evidenceFiles.length !== result.executions) throw new DriverError('BETA_REDUCTION_EVIDENCE', 'Every reduction execution must retain its independent run evidence.');
    const reductionRuns = new Map();
    for (const file of evidenceFiles) { const run = await jsonFile(join(reduction.evidence, file.path)); if (!run?.id || runIds.has(run.id) || reductionRuns.has(run.id)) throw new DriverError('BETA_REDUCTION_RUN_ID', 'Reduction run IDs must be fresh and distinct.'); reductionRuns.set(run.id, run); }
    let best = original, trialExecutions = 0;
    const boundRuns = new Set();
    for (const trial of result.trials) {
      const candidate = { ...best, actions: best.actions.filter(action => !trial.removed.includes(action.id)) };
      if (trusted.digest(candidate) !== trial.inputDigest || trial.seed !== candidate.environment.seed || !Array.isArray(trial.runIds) || trial.runIds.length < 1 || trial.runIds.length > 2) throw new DriverError('BETA_REDUCTION_TRIAL', 'A recorded trial does not bind the exact reconstructed candidate and run set.');
      trialExecutions += trial.runIds.length;
      for (const id of trial.runIds) {
        const run = reductionRuns.get(id);
        if (!run || boundRuns.has(id) || run.manifestDigest !== trial.inputDigest || run.assertionDigest !== original.assertionDigest || run.harnessDigest !== harnessForArtifact(candidate, cliBytes, trusted)
          || run.appDigest !== trusted.revisionDigest(candidate, 'buggy') || run.appRevision !== 'buggy' || run.adapterVersion !== candidate.adapter.version || run.runnerVersion !== candidate.runnerVersion || run.seed !== candidate.environment.seed) throw new DriverError('BETA_REDUCTION_IDENTITY', 'A reduction execution does not match its independent trial identity.');
        boundRuns.add(id); runIds.add(id);
        if (run.outcome === 'target-failure' || run.outcome === 'requirement-satisfied') {
          if (run.assertionCount !== 1 || trusted.evaluateObservation(candidate, run.observation) !== run.outcome || run.category !== (run.outcome === 'target-failure' ? 'target-failure' : undefined)) throw new DriverError('BETA_REDUCTION_OBSERVATION', 'A conclusive trial did not execute the unchanged assertion with a consistent category.');
        } else if (!['inconclusive', 'cancelled'].includes(run.outcome)) throw new DriverError('BETA_REDUCTION_OUTCOME', 'A trial has an unsupported outcome.');
        if (trial.accepted && run.outcome !== 'target-failure') throw new DriverError('BETA_REDUCTION_ACCEPTANCE', 'Accepted trial must preserve the same failure twice.');
      }
      if (trial.accepted) { if (trial.runIds.length !== 2 || trial.outcome !== 'target-failure') throw new DriverError('BETA_REDUCTION_REPETITIONS', 'Each accepted candidate requires two fresh matching failures.'); best = candidate; }
    }
    if (trialExecutions !== result.executions || boundRuns.size !== result.executions || trusted.digest(best) !== trusted.digest(reduced)) throw new DriverError('BETA_REDUCTION_ACCOUNTING', 'Trial accounting does not establish the final reduced candidate.');
    const exported = await execute(plan.workflow[3], inputImage, workflowVolume);
    finalContext = await copyContext(join(exported.evidence, 'capsule'), join(output, 'final-context'), trusted);
    if (trusted.digest(finalContext.manifest) !== trusted.digest(reduced)) throw new DriverError('BETA_EXPORT_CHANGED', 'The final export changed the reduced manifest or frozen expectation.');
    const casePrefix = `fixtures/repository-cases/${original.caseId}/`, caseFiles = finalContext.snapshot.files.filter(file => file.path.startsWith(casePrefix));
    size = { originalActions: original.actions.length, reducedActions: reduced.actions.length, originalActionBytes: Buffer.byteLength(JSON.stringify(original.actions)), reducedActionBytes: Buffer.byteLength(JSON.stringify(reduced.actions)),
      caseAssetsBytes: caseFiles.reduce((sum, item) => sum + item.bytes, 0),
      executedVariantBytes: Object.fromEntries(['buggy', 'fixed'].map(revision => [revision, caseFiles.find(file => file.path === `${casePrefix}${revision}.js`)?.bytes])),
      bothExecutedVariantBytes: caseFiles.filter(file => file.path === `${casePrefix}buggy.js` || file.path === `${casePrefix}fixed.js`).reduce((sum, item) => sum + item.bytes, 0),
      upstreamArchiveBytes: caseFiles.filter(file => file.path.startsWith(`${casePrefix}upstream/`)).reduce((sum, item) => sum + item.bytes, 0),
      wholeExportBytes: finalContext.snapshot.bytes, reductionExecutions: result.executions, reductionStatus: result.status, minimality: result.minimality };
    if (size.reducedActionBytes > size.originalActionBytes) throw new DriverError('BETA_REDUCTION_GREW', 'The final action sequence grew.');
    await removeVolume(workflowVolume);
    // A second independent no-cache build receives only the newly exported package, never the first image's node_modules.
    const finalImage = await build(join(output, 'final-context'), 'final');
    for (const operation of plan.stability) {
      const dataVolume = await volume(operation.name);
      const measured = await execute(operation, finalImage, dataVolume);
      const candidates = measured.record.files.filter(file => /(?:^|\/)evidence\.json$/.test(file.path));
      if (candidates.length !== 1) throw new DriverError('BETA_ASSERTION_COUNT', 'Exactly one independently recorded readable-test execution is required.');
      checkRun(reduced, await jsonFile(join(measured.evidence, candidates[0].path)), operation.revision);
      const tap = await readFile(join(measured.evidence, '.beta-observer', operation.name, 'stdout.log'), 'utf8');
      if (!/^# tests 1$/m.test(tap) || !/^# cancelled 0$/m.test(tap) || !/^# skipped 0$/m.test(tap)
        || !(operation.revision === 'buggy' ? /^# fail 1$/m.test(tap) && /TARGET_ASSERTION:/.test(tap) : /^# pass 1$/m.test(tap) && /^# fail 0$/m.test(tap))) throw new DriverError('BETA_READABLE_ASSERTION', 'The conventional test did not report exactly the expected frozen assertion result.');
      await removeVolume(dataVolume);
    }
    status = plan.acceptanceEligible ? 'passed' : 'exploratory-completed';
  } catch (error) {
    failures.push(error instanceof DriverError ? error.code : 'BETA_INCOMPLETE');
    if (cancelled) status = 'cancelled';
  } finally {
    if (activeContainer) { try { requireOwner(await inspect(activeContainer, 'final-stop-owner')); await docker(['stop', '--time', '12', activeContainer], 'final-owned-stop', 15000, true, true); } catch { failures.push('OWNED_STOP_FAILED'); } }
    if (sentinel && containers.has(sentinel)) {
      try { if (sentinelIdentity) await sentinelCensus('sentinel-terminal-census'); requireOwner(await inspect(sentinel, 'sentinel-stop-owner')); await docker(['stop', '--time', '2', sentinel], 'sentinel-stop', 5000, false, true); await removeContainer(sentinel); }
      catch { failures.push('SENTINEL_CLEANUP_FAILED'); }
    }
    for (const name of [...containers]) {
      // If a failure occurred before normal copying, retain the stopped container and volume for inspection.
      // Never destroy the only copy of a failed operation's logs or evidence.
      failures.push('OWNED_CONTAINER_RETAINED');
      try { await inspect(name, 'retained-container-inspect'); } catch { failures.push('RETAINED_CONTAINER_INSPECTION_FAILED'); }
    }
    if (!containers.size) for (const name of [...volumes]) { try { await removeVolume(name); } catch { failures.push('OWNED_VOLUME_REMOVE_FAILED'); } }
    try {
      const remainingContainers = await docker(['ps', '--all', '--quiet', '--filter', `label=io.repro.beta.owner=${owner}`], 'terminal-owned-containers', 15000, false, true);
      const remainingVolumes = await docker(['volume', 'ls', '--quiet', '--filter', `label=io.repro.beta.owner=${owner}`], 'terminal-owned-volumes', 15000, false, true);
      if (remainingContainers.stdout.trim() || remainingVolumes.stdout.trim()) failures.push('OWNED_RESOURCES_REMAIN');
      const allContainers = await docker(['ps', '--all', '--quiet'], 'terminal-all-containers', 15000, false, true);
      const allVolumes = await docker(['volume', 'ls', '--quiet'], 'terminal-all-volumes', 15000, false, true);
      const allImages = await docker(['image', 'ls', '--quiet', '--no-trunc'], 'terminal-images', 15000, false, true);
      if (session) {
        session.terminalImageIds = [...new Set(allImages.stdout.trim().split('\n').filter(Boolean))].sort();
        const permitted = new Set([...session.initialImageIds, ...images.map(image => image.id), ...publicBaseImages]);
        const foreignImages = session.terminalImageIds.filter(id => !permitted.has(id));
        if (foreignImages.length) failures.push('FOREIGN_IMAGES_APPEARED');
        if (allContainers.stdout.trim() || allVolumes.stdout.trim()) failures.push('FOREIGN_OR_RETAINED_RESOURCES');
        session.publicBaseImageIds = [...publicBaseImages].sort();
        session.terminalInventoryVerified = !allContainers.stdout.trim() && !allVolumes.stdout.trim() && !foreignImages.length;
      }
    } catch { failures.push('RESOURCE_CLEANUP_UNVERIFIED'); }
    try {
      const sourceAfter = await contextSnapshot(resolve(options.capsule));
      if (sourceAfter.sha256 !== input.sourceSnapshot.sha256 || (await contextSnapshot(join(output, 'input-context'))).sha256 !== input.snapshot.sha256
        || finalContext && (await contextSnapshot(join(output, 'final-context'))).sha256 !== finalContext.snapshot.sha256) failures.push('CONTEXT_CHANGED');
      await writeJson(join(output, 'input-after.json'), sourceAfter);
    } catch { failures.push('CONTEXT_RECHECK_FAILED'); }
    process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel);
  }
  status = finalBatchStatus(status, failures, cancelled);
  const summary = { schemaVersion: 1, status, acceptance: status === 'passed', acceptanceScope: 'This case isolated capture, replay, bounded reduction, export, 20 alternating readable pairs, cgroup and per-operation cleanup gates; fault suite and accessibility excluded', output, caseId: input.manifest.caseId, platform: 'linux-arm64', policySha256: POLICY_SHA256, driverSha256, protocolSha256, owner, session,
    repetitionsPlanned: plan.repetitions, completedOperations: receipts.map(item => ({ name: item.operation.name, revision: item.operation.revision, durationMs: item.receipt.durationMs, kernelPeakBytes: item.receipt.memory?.after?.peakBytes, problems: item.problems })),
    setupDurationMs, setupMaximumMs: SETUP_LIMIT_MS, batchDurationMs: performance.now() - began, batchWatchdogMs: plan.batchWatchdogMs, size, images,
    failures: [...new Set(failures)], retainedContainers: [...containers], retainedVolumes: [...volumes], accessibility: 'deferred/unverified',
    limitations: ['Same task-owned Linux arm64 VM, not another physical machine or Linux amd64; exact public base layers acquired in this cohort may be reused, npm and browser installation executes anew without build cache for every image', 'Public registered development cases, not hostile arbitrary code', 'Sentinel is a separate unrelated Node process/container, not an unrelated browser; dedicated cancellation/fault cases require their separate recorded checks'] };
  await writeJson(join(output, 'summary.json'), summary);
  return summary;
}

/** Host-side Docker client supervision only; this never signals a container process directly. */
export async function watchDockerClient(child, { maximumMs, isCancelled, cleanup, onSignalError }) {
  let timedOut = false, signalSent = false, exited = false, settled = false, escalation, drainDeadline, exitResult;
  const processGroup = child.pid;
  const signal = signal => {
    if (exited || settled || !processGroup) return;
    try { process.kill(-processGroup, signal); } catch (error) { if (error.code !== 'ESRCH') onSignalError(); }
  };
  let finish;
  const completed = new Promise(accept => { finish = accept; });
  function stopSignaling() { exited = true; clearTimeout(escalation); }
  function complete(result) {
    if (settled) return;
    settled = true; stopSignaling(); clearInterval(cancelling); clearTimeout(watchdog); clearTimeout(drainDeadline);
    finish({ ...result, timedOut, cancelled: signalSent });
  }
  function incompleteStdio() {
    complete({ ...exitResult, launchFailed: false, stdioIncomplete: true });
    child.stdout?.destroy(); child.stderr?.destroy();
  }
  function escalate() {
    if (exited || settled || escalation !== undefined) return;
    signal('SIGTERM');
    escalation = setTimeout(() => signal('SIGKILL'), 1000); escalation.unref();
  }
  const watchdog = setTimeout(() => {
    timedOut = true;
    if (exited) {
      // The process identity has ended. Bound a stuck stdio drain without signaling its old group.
      incompleteStdio();
    } else escalate();
  }, maximumMs);
  const cancelling = setInterval(() => {
    if (isCancelled() && !cleanup && !signalSent) {
      signalSent = true;
      if (exited) incompleteStdio(); else escalate();
    }
  }, 100);
  child.once('exit', (code, signal) => {
    exitResult = { code, signal }; stopSignaling();
    if ((timedOut || signalSent) && !settled) drainDeadline = setTimeout(incompleteStdio, 0);
  });
  child.once('error', () => complete({ code: null, launchFailed: true }));
  child.once('close', (code, signal) => complete({ code, signal, launchFailed: false }));
  return completed;
}

/** The final decision is made after cleanup so its errors remain part of the receipt. */
export function finalBatchStatus(status, failures, cancelled) {
  if (cancelled) return 'cancelled';
  return failures.length && status !== 'cancelled' ? 'inconclusive' : status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await verifyIsolated(parseArguments(process.argv.slice(2))); console.log(JSON.stringify({ status: result.status, acceptance: result.acceptance, output: result.output })); process.exitCode = ['passed', 'prepared-not-executed', 'exploratory-completed'].includes(result.status) ? 0 : result.status === 'cancelled' ? 130 : 2; }
  catch (error) { console.error(error instanceof DriverError ? error.message : 'BETA_PREPARATION_FAILED: Restore the trusted build and capsule, then retry in a fresh task-owned output directory.'); process.exitCode = 2; }
}
