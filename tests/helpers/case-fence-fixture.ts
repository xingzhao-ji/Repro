import { installCreationFence } from '../../src/case-process-fence.js';
import childProcess from 'node:child_process';
import { once } from 'node:events';
import workerThreads from 'node:worker_threads';
const fence = installCreationFence();
fence.activate();
const mode = process.argv[2];
if (mode === 'spawn') await once(childProcess.spawn(process.execPath, ['-e', ''], { stdio: 'ignore' }), 'close');
if (mode === 'spawnSync') childProcess.spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' });
if (mode === 'execFile') await new Promise<void>((resolve, reject) => childProcess.execFile(process.execPath, ['-e', ''], error => error ? reject(error) : resolve()));
if (mode === 'execFileSync') childProcess.execFileSync(process.execPath, ['-e', '']);
if (mode === 'exec') await new Promise<void>((resolve, reject) => childProcess.exec('true', error => error ? reject(error) : resolve()));
if (mode === 'execSync') childProcess.execSync('true');
if (mode === 'fork') await once(childProcess.fork(new URL('./case-fence-noop.cjs', import.meta.url), [], { execArgv: [], stdio: 'ignore' }), 'close');
if (mode === 'worker-thread') await once(new workerThreads.Worker('', { eval: true }), 'exit');
const receipt = fence.seal();
let lateSpawnBlocked = false, lateSyncSpawnBlocked = false;
try { childProcess.spawn(process.execPath, ['-e', '']); } catch { lateSpawnBlocked = true; }
try { childProcess.spawnSync(process.execPath, ['-e', '']); } catch { lateSyncSpawnBlocked = true; }
const lateReplacementBlocked = !Reflect.set(childProcess, 'spawn', () => undefined);
console.log(JSON.stringify({ ...receipt, lateSpawnBlocked, lateSyncSpawnBlocked, lateReplacementBlocked }));
