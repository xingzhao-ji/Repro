import { promises as filesystem, renameSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename, join, resolve } from 'node:path';
import type { Operation } from '../../src/ledger.js';

const operation = process.argv[2] as Operation;
const directory = resolve(process.argv[3]!);
if (!['record', 'reduce', 'export'].includes(operation)) throw new Error('Unsupported recovery fixture operation');
let paused = false;

function pause(boundary: Record<string, unknown>): void {
  if (paused) return;
  paused = true;
  writeFileSync(join(directory, 'boundary.partial.json'), JSON.stringify({
    pid: process.pid, operation, job: ledger.getJob(started.id),
    session: ledger.getSession(started.sessionId), boundary,
  }, null, 2));
  renameSync(join(directory, 'boundary.partial.json'), join(directory, 'boundary.json'));
  // Stop only this owned test worker after genuine persistence. The parent
  // records its descendants and kills this exact worker to simulate abrupt loss.
  process.kill(process.pid, 'SIGSTOP');
}

if (operation === 'export') {
  // Test-only fault injection, installed before dynamically importing product
  // modules. The real write completes before the process is stopped.
  const originalWriteFile = filesystem.writeFile;
  filesystem.writeFile = async (...args: Parameters<typeof originalWriteFile>) => {
    await originalWriteFile(...args);
    const path = args[0];
    if (typeof path === 'string' && path.startsWith(directory) && path.includes('.partial-') && basename(path) !== 'integrity.json') {
      pause({ kind: 'export-artifact-written', path, bytes: (await filesystem.stat(path)).size });
    }
  };
  syncBuiltinESMExports();
}

const { Ledger: RealLedger } = await import('../../src/ledger.js');
const { Coordinator } = await import('../../src/service.js');
const { createManifest } = await import('../../src/manifest.js');
const ledger = new RealLedger(join(directory, 'ledger'));
const persist = ledger.event.bind(ledger);
ledger.event = (jobId, type, message, actionId) => {
  persist(jobId, type, message, actionId);
  if (operation === 'record' && type === 'request-issued') pause({ kind: 'record-request-issued', type, message });
  if (operation === 'reduce' && type === 'trial') {
    const trial: unknown = JSON.parse(message);
    if (trial && typeof trial === 'object' && 'accepted' in trial && trial.accepted === true) {
      pause({ kind: 'reduction-accepted-trial', trial });
    }
  }
};
const coordinator = new Coordinator(ledger);
const session = ledger.createSession(createManifest(), true);
const started = coordinator.start(session.id, operation, 'interrupted-request');
await coordinator.wait(started.id);
throw new Error('Recovery fixture operation completed without reaching its required interruption boundary');
