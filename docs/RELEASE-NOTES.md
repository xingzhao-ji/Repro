# Repro 0.1.0 — practical beta

Release package: `repro-local-0.1.0.tgz`, built with `npm pack` from the release commit on branch `release/practical-beta-0.1.0`, which is tagged `v0.1.0-beta` once every gate passes. Its SHA-256 and the verification of that exact tarball are recorded in [`evidence/PRACTICAL-BETA-RELEASE.md`](../evidence/PRACTICAL-BETA-RELEASE.md). A documentation-only commit adds that report after the release commit, because a tarball cannot contain its own verification report.

## What it does

Repro turns a reproducible browser failure plus an explicitly declared expected behavior into a portable regression package:

1. **Declare** the expected behavior. Use a registered case's issue-derived declaration (`repro cases --case ID`), or author one for the synthetic search app. The declaration is frozen into the assertion's identity.
2. **Capture** the failure with explicit consent in a fresh browser profile. The buggy revision must fail that exact assertion; anything else is inconclusive.
3. **Reduce** the action sequence. Each accepted deletion must reproduce the same failure twice in fresh state, within at most 80 executions and 300 seconds.
4. **Compare** the buggy and fixed revisions in separate fresh runs with the same assertion and harness.
5. **Export** an integrity-checked capsule with a readable `node --test` regression test. It runs from a fresh install without the original workspace, an LLM or any proprietary viewer.

The CLI (`record`, `replay`, `reduce`, `verify`, `export`, `inspect`, `cases`, `doctor`, `serve`) and the local workbench share one execution core.

## Supported workflows

| Workflow | Source | Expected behavior |
| --- | --- | --- |
| Synthetic stale-response search (alpha baseline) | Bundled fixture | Supplied specification, or a caller-authored schema-2 declaration |
| `morphdom-textarea` | Actual pinned morphdom source, [issue 19](https://github.com/patrick-steele-idem/morphdom/issues/19) | Morphing to a textarea updates its live value |
| `htmx-checkbox` | Actual pinned htmx source, [issue 2755](https://github.com/bigskysoftware/htmx/issues/2755) | A delegated trigger does not cancel a native checkbox change |
| `marked-empty-heading` | Actual pinned Marked source, [issue 3048](https://github.com/markedjs/marked/issues/3048) | An empty ATX heading interrupts a paragraph (CommonMark 0.30 §4.2) |

The three cases are selected development cases with small integration pages. They are not held-out evaluations, and they are not coverage of each project's full application.

## Changes since implementation 9aec7fe

`9aec7fe`, the startup cleanup repair, passed its own native and Linux acceptance ([native](../evidence/STARTUP-CLEANUP-NATIVE-ACCEPTANCE.md), [Linux](../evidence/LINUX-THREE-CASE-RESUME.md)). Release verification then exercised CLI cancellation through the installed package and found three defects. The release contains:

- **Terminal Ctrl-C no longer defeats certified cleanup.** The case worker shared the CLI's process group, so a terminal interrupt killed it directly. The run then reported `CLEANUP_FAILED` and kept an empty browser profile, although no process survived. The worker now runs in its own process group, and cancellation reaches it only through the CLI ([ADR 0004](adr/0004-cancellation-signal-boundary.md)).
- **A cancelled synthetic run cannot keep the CLI alive.** If cancellation landed while a synthetic run was still creating its directory, the owned fixture server could bind after the run had returned. Its socket then kept the CLI process running after it printed a `cancelled` result. A late-bound server now closes itself.
- **A cancelled `export` exits 130.** It previously exited 2, although its JSON already reported `cancelled` and nothing was finalized.
- **`CLEANUP_FAILED` names the failed condition.** Its reason carries a validated, fixed-vocabulary `Cleanup basis:` clause, such as `context-close=timeout` or `worker=closed-before-cleanup` ([ADR 0003](adr/0003-cleanup-failure-basis.md)). The retention decision itself is unchanged.

Each fix has a regression that failed before the change and passes after it. These changes alter runtime and harness bytes, so none of `9aec7fe`'s acceptance transfers. The release has its own verification.

Budgets are unchanged from the [frozen protocol](../benchmarks/PRACTICAL-BETA-PROTOCOL.md):

- capture and each replay: 30 s;
- reduction: at most 80 executions and 300 s;
- export: 15 s;
- clean setup: 15 minutes;
- cleanup: 5 s after ordinary completion and 8 s after cancellation or timeout.

## Known issues

- **Historical htmx shutdown failure, cause unresolved.** On an earlier build, one fixed htmx run (repetition 15 of a native stability cohort) completed its assertion but missed the browser-shutdown acknowledgment. It reported `CLEANUP_FAILED` and kept its profile, as designed. Later cohorts passed without recurrence, which does not explain the original cause. If it recurs, Repro still fails safe: it reports `CLEANUP_FAILED` with its cleanup basis, retains the profile and never claims a pass.
- **A worker signalled directly by an outside tool still fails safe.** Ctrl-C, SIGTERM to the CLI and workbench Cancel are the supported cancellation paths. Signalling the worker's own PID can still produce `CLEANUP_FAILED` with a retained profile.
- **Linux verification driver blind spot.** `scripts/verify-beta-isolated.mjs` lists images with `docker image ls --quiet`. Under Docker 29 that listing hides untagged images, so the driver's foreign-image check cannot see them. Earlier independent audits listed images with `--all` and found only each cohort's own labeled images. The driver is not part of the npm package.

## Limitations

- Only the four registered workflows above. Arbitrary websites, authenticated apps, databases, WebSockets and real-user recording are unsupported, and are rejected rather than silently approximated.
- Ordinary containers are a development boundary, not hostile-code isolation. Do not execute untrusted capsules.
- Platform claims are limited to what the release evidence records: native macOS arm64, and isolated Linux arm64 on one task-owned VM when that evidence is present. Linux amd64, Windows and other physical machines are untested.
- Reduction deletes actions and dependency groups only. It reports minimality as unverified and never claims global minimality.
- Repeated passing runs are bounded evidence, not proof of determinism.
- **Accessibility is deferred and unverified.** That covers native 200% zoom, actual screen-reader workflows and the 8 accessibility-focused or mixed browser scenarios. Keyboard, focus and automated checks keep their earlier scoped results only.
- No hosted deployment. Repro runs locally; the private GitHub repository holds source, not a deployed service.

See [SUPPORTED-SCOPE](SUPPORTED-SCOPE.md) for the complete boundary matrix.
