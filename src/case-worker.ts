import { installCreationFence } from './case-process-fence.js';
import { boundedFrame, exactKeys, monotonicNs, WORKER_PROTOCOL, type ParentFrame, type WorkerFrame, type EventAcknowledgment, type ExecutionReceipt } from './case-worker-protocol.js';

const fence = installCreationFence();
// Trusted code loads before the run/profile identity is received. The fence was
// installed first so captured process creators remain observed when activated.
const { executeCaseBrowser } = await import('./case-execution.js');
const { validateManifest } = await import('./manifest.js');
const { isAbsolute } = await import('node:path');
let nonce: string | undefined, started = false, terminal = false;
const controller = new AbortController();
const acknowledgments = new Map<number, (value: EventAcknowledgment) => void>();

function send(frame: WorkerFrame): Promise<void> {
  if (!process.connected || !process.send || !boundedFrame(frame)) return Promise.reject(new Error('WORKER_CHANNEL'));
  return new Promise((resolve, reject) => process.send!(frame, error => error ? reject(error) : resolve()));
}
function diagnostic(frame: WorkerFrame) { void send(frame).catch(() => undefined); }
function fail() {
  controller.abort();
  for (const accept of acknowledgments.values()) accept('cancelled');
  acknowledgments.clear();
  process.exitCode = 1;
  process.channel?.unref();
}
function validRequest(frame: Record<string, unknown>): frame is Record<string, unknown> & Extract<ParentFrame, { type: 'start' }> {
  const r = frame.request;
  if (!exactKeys(frame, ['version', 'type', 'nonce', 'request']) || !boundedFrame(r)
    || !exactKeys(r, ['input', 'artifactDir', 'id', 'harnessDigest', 'startedAt', 'startedNs', 'diagnostics'], ['revision']) || typeof frame.nonce !== 'string' || !/^[0-9a-f-]{36}$/.test(frame.nonce)
    || typeof r.id !== 'string' || !/^[0-9a-f-]{36}$/.test(r.id) || typeof r.artifactDir !== 'string' || !isAbsolute(r.artifactDir)
    || typeof r.harnessDigest !== 'string' || !/^[0-9a-f]{64}$/.test(r.harnessDigest) || typeof r.startedAt !== 'string'
    || !monotonicNs(r.startedNs) || typeof r.diagnostics !== 'boolean'
    || (r.revision !== undefined && r.revision !== 'buggy' && r.revision !== 'fixed')) return false;
  try { return validateManifest(r.input).schemaVersion === 3; } catch { return false; }
}
async function run(frame: Extract<ParentFrame, { type: 'start' }>) {
  let receipt: ExecutionReceipt;
  try {
    receipt = await executeCaseBrowser(frame.request, {
      signal: controller.signal,
      onOwned: () => diagnostic({ version: WORKER_PROTOCOL, type: 'owned', nonce: frame.nonce }),
      onCleanupStart: cleanupStartedNs => diagnostic({ version: WORKER_PROTOCOL, type: 'cleanup-start', nonce: frame.nonce, cleanupStartedNs }),
      ...(frame.request.diagnostics ? { onTeardown: (event: import('./contracts.js').TeardownEvent) => diagnostic({ version: WORKER_PROTOCOL, type: 'teardown', nonce: frame.nonce, event }) } : {}),
      async onEvent(event) {
        const pending = new Promise<EventAcknowledgment>(resolve => acknowledgments.set(event.seq, resolve));
        try { await send({ version: WORKER_PROTOCOL, type: 'event', nonce: frame.nonce, seq: event.seq, event }); }
        catch { fail(); }
        return pending;
      },
    });
    const certificate = fence.seal();
    terminal = true;
    await send({ version: WORKER_PROTOCOL, type: 'terminal', nonce: frame.nonce, receipt, ...certificate });
    // Natural process completion is independently joined by the parent. A live
    // late close keeps forwarding diagnostics, but cannot revise the receipt.
    process.channel?.unref();
  } catch { fail(); }
}
process.on('message', (value: unknown) => {
  if (!boundedFrame(value) || value.version !== WORKER_PROTOCOL) { fail(); return; }
  if (!started) {
    if (value.type !== 'start' || !validRequest(value)) { fail(); return; }
    // No profile identity reached execution before creation accounting begins.
    fence.activate(); started = true; nonce = value.nonce;
    void run(value); return;
  }
  if (value.nonce !== nonce) { fail(); return; }
  if (value.type === 'cancel' && exactKeys(value, ['version', 'type', 'nonce'])) { controller.abort(); return; }
  if (value.type === 'event-ack' && exactKeys(value, ['version', 'type', 'nonce', 'seq', 'outcome']) && Number.isSafeInteger(value.seq)
    && ['continue', 'cancelled', 'observer-failed'].includes(String(value.outcome))) {
    const accept = acknowledgments.get(value.seq as number);
    if (!accept || terminal) { fail(); return; }
    acknowledgments.delete(value.seq as number);
    if (value.outcome === 'cancelled') controller.abort();
    accept(value.outcome as EventAcknowledgment); return;
  }
  fail();
});
process.on('disconnect', fail);
await send({ version: WORKER_PROTOCOL, type: 'ready' });
