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
function proc(rows: ProcRow[], executable = '/sbin/docker-init') {
  return {
    readdir: async (path: string) => { assert.equal(path, '/proc'); return ['self', ...rows.map(row => String(row.pid))]; },
    readFile: async (path: string) => {
      const match = /^\/proc\/(\d+)\/stat$/.exec(path); assert.ok(match);
      const row = rows.find(row => row.pid === Number(match[1]));
      if (!row) throw Object.assign(new Error('vanished'), { code: 'ENOENT' });
      return procStat(row);
    },
    readlink: async (path: string) => { assert.equal(path, '/proc/1/exe'); return executable; },
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
  assert.deepEqual(result.infrastructure, { init: { ...init, executable: '/sbin/docker-init' }, observer });
  const clean = await driver.containerCensus(proc([init, observer]), { pid: 7, ppid: 1 }, result.infrastructure);
  assert.deepEqual(clean.owned, []);
  assert.deepEqual(clean.infrastructure, result.infrastructure);
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
