import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';

type Callable = (...args: unknown[]) => unknown;
export interface CreationFence {
  activate(): void;
  seal(): { attempts: number; sealed: true };
}
let installed: CreationFence | undefined;

/** A trusted-runtime fence, not an OS sandbox or descendant-completion claim. */
export function installCreationFence(): CreationFence {
  if (installed) return installed;
  let active = false, sealed = false, attempts = 0;
  const attempt = () => {
    if (active) attempts++;
    if (sealed) throw new Error('WORKER_CREATION_SEALED');
  };
  const guarded: { owner: object; key: string; value: unknown }[] = [];
  const wrap = (owner: object, key: string) => {
    const original = Reflect.get(owner, key) as unknown;
    if (typeof original !== 'function') return;
    const replacement = function(this: unknown, ...args: unknown[]) {
      attempt();
      return Reflect.apply(original as Callable, this, args);
    };
    Object.defineProperty(owner, key, { ...Object.getOwnPropertyDescriptor(owner, key), value: replacement });
    guarded.push({ owner, key, value: replacement });
  };
  // Install before trusted dependencies load, including their captured exports.
  // The prototype interception additionally covers lexical Node async creators.
  for (const key of ['spawn', 'fork', 'exec', 'execFile', 'spawnSync', 'execSync', 'execFileSync']) wrap(childProcess, key);
  wrap(childProcess.ChildProcess.prototype, 'spawn');
  wrap(process, 'dlopen');
  wrap(process, 'execve');
  const OriginalWorker = workerThreads.Worker;
  const GuardedWorker = new Proxy(OriginalWorker, { construct(target, args, newTarget) {
    attempt(); return Reflect.construct(target, args, newTarget);
  } });
  Object.defineProperty(workerThreads, 'Worker', { ...Object.getOwnPropertyDescriptor(workerThreads, 'Worker'), value: GuardedWorker });
  guarded.push({ owner: workerThreads, key: 'Worker', value: GuardedWorker });
  syncBuiltinESMExports();
  installed = {
    activate() {
      if (active || sealed) throw new Error('WORKER_FENCE_STATE');
      active = true;
      for (const { owner, key, value } of guarded) {
        if (Reflect.get(owner, key) !== value) attempts++;
        // Keep the creation seal enforceable through terminal and exit handlers.
        Object.defineProperty(owner, key, { value, writable: false, configurable: false });
      }
    },
    seal() {
      if (!active || sealed) throw new Error('WORKER_FENCE_STATE');
      // A replaced creator invalidates certification, even if no attempt was seen.
      if (guarded.some(({ owner, key, value }) => Reflect.get(owner, key) !== value)) attempts++;
      sealed = true;
      return { attempts, sealed: true };
    },
  };
  return installed;
}
