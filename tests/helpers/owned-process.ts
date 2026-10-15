import { spawnSync } from 'node:child_process';

export interface ProcessInspection { status: number | null; stdout: string | null; stderr: string | null; signal?: NodeJS.Signals | null; error?: Error }
export interface OwnedProcess { pid: number; ppid: number; state: string; identity: string }
export type InspectProcess = (pid: number) => ProcessInspection;

// Inspect only a previously established owned PID. State is diagnostic: even a
// zombie with the recorded identity remains residue until the PID is absent.
export function inspectOwnedProcess(pid: number, inspect: InspectProcess = value => spawnSync('ps', ['-p', String(value), '-o', 'ppid=', '-o', 'stat=', '-o', 'lstart=', '-o', 'comm='], { encoding: 'utf8', timeout: 2000 })): OwnedProcess | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid owned process PID.');
  const result = inspect(pid);
  if (result.error || result.signal || typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
    throw new Error('Process inspection failed; owned process absence is not established.', { cause: result.error });
  }
  const value = result.stdout.trim();
  if (!result.stderr.trim()) {
    if (result.status === 1 && !value) return undefined;
    if (result.status === 0 && value && !/[\r\n]/.test(value)) {
      const fields = /^(\d+)\s+([A-Za-z][A-Za-z<+]*)\s+(.+)$/.exec(value);
      if (fields && Number.isSafeInteger(Number(fields[1]))) {
        return { pid, ppid: Number(fields[1]), state: fields[2]!, identity: fields[3]! };
      }
    }
  }
  throw new Error('Process inspection failed; owned process absence is not established.', { cause: result.error });
}

export function remainingOwnedProcesses(owned: readonly OwnedProcess[] | undefined, inspect?: InspectProcess): OwnedProcess[] {
  if (!owned) throw new Error('Owned descendant snapshot was not established; process absence is unverified.');
  return owned.flatMap(process => {
    const current = inspectOwnedProcess(process.pid, inspect);
    return current?.identity === process.identity ? [current] : [];
  });
}
