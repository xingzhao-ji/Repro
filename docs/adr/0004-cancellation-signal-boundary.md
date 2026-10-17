# ADR 0004 — Terminal cancellation reaches the case worker only through its parent

Status: implemented on `task/release-candidate`, October 17, 2026, for release 0.1.0. Shutdown deadlines, deletion rules and cleanup thresholds are unchanged.

## Context

Release verification cancelled the CLI installed from the release package. Like a terminal Ctrl-C, it sent SIGINT to the CLI's whole process group, while a registered-case run was active. Two defects followed.

1. **The case worker died before it could report cleanup.** It ran in the CLI's process group and installed no signal handler, so the group SIGINT killed it directly. The parent then saw a worker that exited before reporting cleanup start (`Cleanup basis: receipt=absent; protocol=failed; wait-ended=close; worker=closed-before-cleanup`). It correctly refused to certify cleanup, returned `CLEANUP_FAILED` and kept the empty `.profile`. No owned process survived; the census found none. Cancellation through the workbench, or a signal to the CLI's PID alone, already cleaned up correctly. Observed on implementation `9aec7fe`: 3 of 3 registered-case reductions in the release cancellation dry run, 5 of 5 targeted group probes, and 2 of 2 new CLI regressions (worker started; browser launched).
2. **A cancelled export exited 2, not 130.** Export reports cancellation by throwing `EXPORT_CANCELLED`, and the CLI's top-level handler mapped every thrown error to exit 2. The JSON still said `cancelled`, and nothing was finalized. Record, replay, reduce and verify return a cancelled result and already exited 130.

## Decision

- The parent spawns the case worker with `detached: true`, in its own process group. Playwright already launches Chromium in its own group on macOS and Linux, so a terminal interrupt now reaches only the CLI. The CLI's existing handler aborts the operation, the parent sends the protocol `cancel` frame, and the worker closes its acquired context and exits naturally. Normal certification follows. If the parent dies abruptly, the worker still observes IPC `disconnect` and aborts, as before.
- The CLI records that its own SIGINT/SIGTERM handler fired. A failure whose public outcome is `cancelled` exits 130 only in that case; every other failure still exits 2.

Each fix has a regression that failed on the original bytes and passes with the change: `tests/case-faults.browser.ts` (terminal Ctrl-C, two stages) and `tests/cli.test.ts` (interrupted export).

Rejected alternatives:

- **Worker SIGINT/SIGTERM handlers alone.** A signal arriving during Node bootstrap, before the handler exists, would still kill the worker, so a timing window would remain.
- **Ignoring the CLI's process-group signals in the parent and polling instead.** That adds a second cancellation path without fixing why the worker could not be certified.
- **Removing the profile when no owned process is observed.** Absence from a census is not ownership-certified completion, and the safety rule forbids it.

## Consequences

The changes touch `src/case-worker-client.ts` and `src/cli.ts`, and so `dist/cli.js`, `dist/index.js` and the harness and capsule identity. Earlier native and Linux acceptance for `9aec7fe` does not transfer. The release candidate needs its own prerequisite checks plus fresh native and Linux cohorts under unchanged thresholds. An external tool that signals the worker's PID directly can still produce a safe `CLEANUP_FAILED`; that is outside the supported cancellation paths (Ctrl-C, SIGTERM to the CLI, workbench Cancel).
