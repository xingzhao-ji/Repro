# ADR 0003 — Record why browser cleanup was not certified

Status: implemented on `task/cleanup-failure-basis`, October 16, 2026. Diagnostic only; no shutdown behavior, deadline or deletion rule changed.

## Context

The original native htmx fixed repetition-15 failure returned `CLEANUP_FAILED` after a satisfied assertion. Its evidence could not say whether context close rejected or timed out. It also couldn't say whether the drain expired, or whether the worker missed its deadline. Later analysis narrowed the cause to the context-close check, but the old runner merged rejection and timeout. Current code on `9aec7fe` still exposes that distinction only to the optional diagnostic observer. An ordinary run, or an exported readable test, records the same generic reason for every failing predicate. A recurrence would therefore be as undiagnosable as the original.

## Decision

The worker receipt carries two fixed-vocabulary fields:

- `contextClose`: `not-applicable`, `acknowledged`, `rejected`, `timeout`, `stale`, `late` or `no-budget`.
- `launchJoin`: `not-needed`, `joined` or `expired`.

The parent rejects a receipt whose basis contradicts the flags that decide cleanup. Examples: an acknowledged close with a timeout basis; a failed close without a cleanup failure; an expired join that is not reported as a failure; or an acquired context without a close basis. The client also reports what ended its wait: `close`, `failed-receipt`, `deadline` or `protocol`.

On `CLEANUP_FAILED`, the parent appends one `Cleanup basis:` clause built only from those enums, worker close/deadline state, drain state and the process-creation count. A certified cleanup keeps its unchanged reason.

Rejected alternatives:

- **A new structured RunResult field.** It would change the evidence schema, validators and capsule readers for a field written only on failure.
- **Always enabling the diagnostic observer.** That adds timing-sensitive IPC to every run and would perturb the behavior under study.
- **Changing shutdown timing to make the failure disappear.** No reproduced trace supports a specific repair.

## Consequences

The clause is evidence, not a repair. It cannot reveal transient Playwright retries hidden by eventual success, descendant names or per-PID timelines. It changes runtime, worker and harness bytes, so this is a new candidate. `9aec7fe`'s native and Linux acceptance does not transfer to it (see ADR 0002 on Linux portability). The new candidate needs its own prerequisite checks and, before any acceptance claim, fresh native and Linux cohorts with unchanged thresholds.
