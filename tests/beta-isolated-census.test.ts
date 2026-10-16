import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const driver = await import(pathToFileURL(resolve('scripts/verify-beta-isolated.mjs')).href);
interface ProcRow { pid: number; ppid: number; pgid: number; startTicks: number; state: string }
const init: ProcRow = { pid: 1, ppid: 0, pgid: 1, startTicks: 100, state: 'S' };
const observer: ProcRow = { pid: 7, ppid: 1, pgid: 1, startTicks: 110, state: 'R' };
function procStat(row: ProcRow): string {
  const fields = Array<string>(50).fill('0');
  fields[0] = row.state; fields[1] = String(row.ppid); fields[2] = String(row.pgid); fields[19] = String(row.startTicks);
  return `${row.pid} (browser ) worker) ${fields.join(' ')}`;
}
function proc(rows: ProcRow[], executable = '/sbin/docker-init', canonicalExecutable = '/sbin/docker-init') {
  return {
    readdir: async (path: string) => { assert.equal(path, '/proc'); return ['self', ...rows.map(row => String(row.pid))]; },
    readFile: async (path: string) => {
      const match = /^\/proc\/(\d+)\/stat$/.exec(path); assert.ok(match);
      const row = rows.find(row => row.pid === Number(match[1]));
      if (!row) throw Object.assign(new Error('vanished'), { code: 'ENOENT' });
      return procStat(row);
    },
    readlink: async (path: string) => { assert.equal(path, '/proc/1/exe'); return executable; },
    realpath: async (path: string) => { assert.equal(path, '/sbin/docker-init'); return canonicalExecutable; },
  };
}

test('census excludes only verified init and observer while retaining descendants, orphans and zombies', async () => {
  const descendants: ProcRow[] = [
    { pid: 18, ppid: 7, pgid: 18, startTicks: 200, state: 'S' },
    { pid: 33, ppid: 1, pgid: 30, startTicks: 210, state: 'Z' },
    { pid: 34, ppid: 1, pgid: 30, startTicks: 211, state: 'S' },
  ];
  const result = await driver.containerCensus(proc([init, observer, ...descendants]), { pid: 7, ppid: 1 });
  assert.deepEqual(result.owned, descendants);
  assert.deepEqual(result.infrastructure, { init: { ...init, executable: '/sbin/docker-init', canonicalExecutable: '/sbin/docker-init' }, observer });
  const clean = await driver.containerCensus(proc([init, observer]), { pid: 7, ppid: 1 }, result.infrastructure);
  assert.deepEqual(clean.owned, []);
  assert.deepEqual(clean.infrastructure, result.infrastructure);
});

test('census accepts merged usr only when the canonical Docker init path equals the actual executable', async () => {
  const executable = '/usr/sbin/docker-init';
  const result = await driver.containerCensus(proc([init, observer], executable, executable), { pid: 7, ppid: 1 });
  assert.deepEqual(result.infrastructure.init, { ...init, executable, canonicalExecutable: executable });
  assert.deepEqual(result.owned, []);
  await assert.rejects(driver.containerCensus(proc([init, observer], executable), { pid: 7, ppid: 1 }), /INIT_IDENTITY/);
  await assert.rejects(driver.containerCensus(proc([init, observer], '/usr/local/bin/node', '/usr/local/bin/node'), { pid: 7, ppid: 1 }), /INIT_IDENTITY/);
});

test('canonical init identity must remain stable within a scan and across samples', async () => {
  const filesystem = proc([init, observer]);
  let calls = 0;
  filesystem.realpath = async () => ++calls === 1 ? '/sbin/docker-init' : '/usr/sbin/docker-init';
  await assert.rejects(driver.containerCensus(filesystem, { pid: 7, ppid: 1 }), /INIT_IDENTITY/);
  const initial = await driver.containerCensus(proc([init, observer]), { pid: 7, ppid: 1 });
  await assert.rejects(driver.containerCensus(proc([init, observer], '/usr/sbin/docker-init', '/usr/sbin/docker-init'), { pid: 7, ppid: 1 }, initial.infrastructure), /INIT_IDENTITY/);
});

test('measurement diagnostics retain allowlisted census cause codes without raw paths or error messages', async () => {
  const errors: unknown[] = [];
  try { await driver.containerCensus(proc([init, observer], '/usr/local/bin/private-secret'), { pid: 7, ppid: 1 }); } catch (error) { errors.push(error); }
  const filesystem = proc([init, observer]);
  filesystem.realpath = async () => { throw Object.assign(new Error('/private/credential=secret'), { code: 'EACCES' }); };
  try { await driver.containerCensus(filesystem, { pid: 7, ppid: 1 }); } catch (error) { errors.push(error); }
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(error => driver.measurementFailureCode(error)), ['CENSUS_INIT_EXECUTABLE_MISMATCH', 'CENSUS_INIT_CANONICAL_UNAVAILABLE']);
  assert.equal(driver.measurementFailureCode(new Error('credential=secret')), 'MEASUREMENT_CAUSE_UNAVAILABLE');
  assert.equal(driver.measurementFailureCode({ code: 'CENSUS_private-secret' }), 'MEASUREMENT_CAUSE_UNAVAILABLE');
  assert.ok(!JSON.stringify(errors.map(error => driver.measurementFailureCode(error))).includes('secret'));
});

test('cleanup wait rechecks its absolute monotonic deadline after an early timer', async () => {
  for (const cutoff of [5000, 8000]) {
    let now = 10.25;
    const deadline = now + cutoff, delays: number[] = [];
    await driver.waitUntilDeadline(deadline, () => now, async (milliseconds: number) => {
      delays.push(milliseconds);
      now += milliseconds - (delays.length === 1 ? 1 : 0);
    });
    assert.equal(now, deadline);
    assert.deepEqual(delays, [cutoff, 1]);
  }
  let now = 0.25;
  const delays: number[] = [];
  await driver.waitUntilDeadline(5000, () => now, async (milliseconds: number) => { delays.push(milliseconds); now += milliseconds; });
  assert.ok(now >= 5000);
  assert.deepEqual(delays, [5000]);
});

test('census rejects a Node PID1, an unexpected init executable, or an observer not parented by init', async () => {
  await assert.rejects(driver.containerCensus(proc([init]), { pid: 1, ppid: 0 }), /INIT_IDENTITY/);
  await assert.rejects(driver.containerCensus(proc([init, observer], '/usr/local/bin/node'), { pid: 7, ppid: 1 }), /INIT_IDENTITY/);
  await assert.rejects(driver.containerCensus(proc([init, { ...observer, ppid: 6 }]), { pid: 7, ppid: 6 }), /INIT_IDENTITY/);
  await assert.rejects(driver.containerCensus(proc([{ ...init, state: 'Z' }, observer]), { pid: 7, ppid: 1 }), /INIT_IDENTITY/);
});

test('census rejects replaced init identity during a scan or between samples', async () => {
  const filesystem = proc([init, observer]);
  const original = filesystem.readFile;
  let reads = 0;
  filesystem.readFile = async path => path === '/proc/1/stat' && ++reads > 1 ? procStat({ ...init, startTicks: 999 }) : original(path);
  await assert.rejects(driver.containerCensus(filesystem, { pid: 7, ppid: 1 }), /INIT_IDENTITY/);
  const initial = await driver.containerCensus(proc([init, observer]), { pid: 7, ppid: 1 });
  await assert.rejects(driver.containerCensus(proc([{ ...init, startTicks: 999 }, observer]), { pid: 7, ppid: 1 }, initial.infrastructure), /INIT_IDENTITY/);
  await assert.rejects(driver.containerCensus(proc([init, { ...observer, startTicks: 999 }]), { pid: 7, ppid: 1 }, initial.infrastructure), /INIT_IDENTITY/);
});

test('Docker inspection rejects missing or disabled init without relaxing the existing boundary', async () => {
  const policy = await readFile('security/repro-chromium-seccomp.json');
  const inspect = { Config: { User: 'node', WorkingDir: '/work' }, HostConfig: {
    Init: true, Privileged: false, ReadonlyRootfs: true, NetworkMode: 'none', PidsLimit: 128, Memory: 1073741824,
    NanoCpus: 2000000000, ShmSize: 268435456, CgroupnsMode: 'private', CapDrop: ['ALL'],
    Tmpfs: { '/tmp': 'rw,nosuid,size=256m' }, SecurityOpt: ['no-new-privileges', `seccomp=${policy.toString()}`],
  }, Mounts: [{ Type: 'volume', Name: 'owned', Destination: '/work/.repro-runs', RW: true }], State: { OOMKilled: false } };
  assert.deepEqual(driver.inspectProblems(inspect, 'owned', policy), []);
  inspect.HostConfig.Init = false;
  assert.ok(driver.inspectProblems(inspect, 'owned', policy).includes('CONTAINER_BOUNDARY'));
  Reflect.deleteProperty(inspect.HostConfig, 'Init');
  assert.ok(driver.inspectProblems(inspect, 'owned', policy).includes('CONTAINER_BOUNDARY'));
});
