import type { ManifestV3, RunEvent, RunResult, TeardownEvent } from './contracts.js';

export const WORKER_PROTOCOL = 1;
export const WORKER_FRAME_LIMIT = 131_072;
export interface CaseWorkerRequest {
  input: ManifestV3; artifactDir: string; revision?: 'buggy' | 'fixed';
  id: string; harnessDigest: string; startedAt: string; startedNs: string;
  diagnostics: boolean;
}
export interface ExecutionReceipt {
  result: RunResult;
  ownedDirectory: boolean;
  launchState: 'not-attempted' | 'unacquired' | 'acquired';
  closeAcknowledged: boolean;
  workDrained: boolean;
  cleanupTimedOut: boolean;
  cleanupStartedNs: string;
}
export type EventAcknowledgment = 'continue' | 'cancelled' | 'observer-failed';
export type ParentFrame =
  | { version: 1; type: 'start'; nonce: string; request: CaseWorkerRequest }
  | { version: 1; type: 'cancel'; nonce: string }
  | { version: 1; type: 'event-ack'; nonce: string; seq: number; outcome: EventAcknowledgment };
export type WorkerFrame =
  | { version: 1; type: 'ready' }
  | { version: 1; type: 'owned'; nonce: string }
  | { version: 1; type: 'event'; nonce: string; seq: number; event: RunEvent }
  | { version: 1; type: 'teardown'; nonce: string; event: TeardownEvent }
  | { version: 1; type: 'cleanup-start'; nonce: string; cleanupStartedNs: string }
  | { version: 1; type: 'terminal'; nonce: string; receipt: ExecutionReceipt; attempts: number; sealed: true };
export interface ExecutionBridge {
  signal: AbortSignal;
  onEvent(event: RunEvent): Promise<EventAcknowledgment>;
  onTeardown?(event: TeardownEvent): void;
  onOwned(): void;
  onCleanupStart(monotonicNs: string): void;
}
export function boundedFrame(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try { return Buffer.byteLength(JSON.stringify(value)) <= WORKER_FRAME_LIMIT; } catch { return false; }
}
export function monotonicNs(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,24}$/.test(value);
}

export function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
