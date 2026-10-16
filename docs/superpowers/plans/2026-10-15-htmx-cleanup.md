# Native htmx cleanup investigation implementation plan

> For agentic workers: root implements the adapter instrumentation; a separate worker owns the measurement observer; independent reviewers inspect evidence. The owner's explicit instruction authorizes execution of this bounded plan.

**Goal:** Distinguish the native htmx teardown failure's cause before repairing it, preserving the failed repetition and unchanged acceptance limits.

**Architecture:** Optional closed-vocabulary callbacks record adapter/helper events into task-owned sidecars. The existing native supervisor records individual owned-process identities at its existing census times. Diagnostic artifacts are separate from returned product evidence and acceptance results.

**Tech stack:** Strict TypeScript, Node 26.7.0, pinned Playwright/Chromium, existing native supervisor.

**Spec:** Owner instruction to finish the investigation from 1ecca68; benchmarks/PRACTICAL-BETA-PROTOCOL.md remains frozen.

## Constraints and review focus

- Preserve original fixed15 evidence/profile and earlier successful diagnostics; no profile contents, raw exceptions, target data or unrelated process command lines collected.
- Keep context-close wait2000ms, execution-drain1000ms, normal observer cleanup5000ms, stop cleanup8000ms and command watchdog40000ms unchanged. Browser sandbox/security, registered source, actions and assertion stay unchanged.
- Observe rejection, timeout and late resolution/rejection separately; late settlement must not change a timeout's returned result or delete its retained profile.
- Use monotonic nanoseconds plus elapsed milliseconds, phase names/run IDs, deadline/outcome and actual owned-profile metadata state. Record context-close/browser-disconnect separately from individual process disappearance bounds. A diagnostic-only public Node `spawn` observer, installed before loading Playwright, records direct owned child exit/close event delivery without inspecting arguments, environment or output; these are not exact kernel exit timestamps. It adds no timers, signals or lifetime holds.
- Observer failures must not leak error text or turn missing diagnostics into evidence. Default-off instrumentation must not introduce filesystem probes, timers, close requests or holds.

## Tasks

1. Preserve baseline identity receipt; add failing ordinary tests for resolved/rejected/timed-out late-resolved/timed-out late-rejected observations and noninterference/secret handling. Instrument `runCaseBrowser`/`settlesWithin` through an optional `RunOptions` callback. Record before/after profile probes and distinguish close versus execution-drain wait.
2. Add failing supervisor test for full owned PID/birth census observations and monotonic command-exit bounds. Implement an optional diagnostic observer using existing samples only. Run focused tests and independent review.
3. Build and freeze one diagnostic candidate/capsule. Test instrumentation calibration with controlled promise outcomes; synthetic timing cases are not evidence of the historical natural cause.
4. Run exactly one bounded natural diagnostic sequence: at most20 alternating buggy/fixed pairs (40 fresh commands), no concurrent task-owned browser/container workload, same manifest/budgets,100ms sampling and distinct terminal census. Stop at first unexpected result after the existing supervisor records cleanup; never reset the denominator. Record helper branch/deadline, eventual settlement, close/disconnect, individual process disappearance intervals and profile state on a shared same-host monotonic basis. Do not add lifetime holds; if a process exits before eventual settlement, mark it unobserved.
5. Analyze raw events independently. Only an identified causal failure permits a targeted failing regression and repair; do not change lifecycle strategy or budgets based on successful diagnostic runs. If unresolved, state exactly which stage/outcome/process relationship remains missing.
6. If a repair is justified, verify focused regressions and ordinary checks, then run a new complete native htmx20-pair acceptance sequence on a fresh exported repaired build, plus checks affected by the actual change. Never finish only the ten old unattempted rows. Reconcile any affected other-case/export/Linux identities explicitly. If unresolved, acceptance rerun is unexecuted rather than a substitute for cause evidence.
7. Preserve logs and unsuccessful attempts; independent evidence review, scoped documentation and local commits. Accessibility stays deferred/unverified; no CUA route, security change, release, push or merge.
