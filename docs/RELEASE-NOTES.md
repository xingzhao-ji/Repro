# Repro 0.1.0 — practical beta

Release package: `repro-local-0.1.0.tgz`, built with `npm pack` from the release commit tagged `v0.1.0-beta` on branch `release/practical-beta-0.1.0`. The implementation is commit `9aec7fe` (startup cleanup repair). The release commit changes only documentation, so its built `dist/` is byte-identical to the accepted implementation's. The tarball's SHA-256 and the verification of that exact tarball are recorded in [`evidence/PRACTICAL-BETA-RELEASE.md`](../evidence/PRACTICAL-BETA-RELEASE.md), which a documentation-only commit adds after this one. A tarball cannot contain its own verification report.

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

## Accepted evidence for implementation 9aec7fe

Recorded against these product bytes before this release. The release verification re-checks the bytes' identity and reruns the package, workflow, stability, cancellation and fresh-install checks on the release tarball.

| Gate | Result | Evidence |
| --- | --- | --- |
| Ordinary tests | 382/382 | [repair checkpoint](../evidence/STARTUP-CLEANUP-REPAIR.md) |
| Functional browser tests | 50/50 selected; 8 accessibility-focused or mixed scenarios deferred | same |
| Native macOS arm64 workflows | 15 measurements, 30 browser executions | [native acceptance](../evidence/STARTUP-CLEANUP-NATIVE-ACCEPTANCE.md) |
| Native stability | 120/120: 20 alternating buggy/fixed pairs per case | same |
| Fresh isolated Linux arm64 | 132 operations, 144 executions, 120 readable tests; independent audit found no issues | [Linux acceptance](../evidence/LINUX-THREE-CASE-RESUME.md) |

Budgets are unchanged from the [frozen protocol](../benchmarks/PRACTICAL-BETA-PROTOCOL.md):

- capture and each replay: 30 s;
- reduction: at most 80 executions and 300 s;
- export: 15 s;
- clean setup: 15 minutes;
- cleanup: 5 s after ordinary completion and 8 s after cancellation or timeout.

## Known issues

- **Historical htmx shutdown failure, cause unresolved.** On an earlier build, one fixed htmx run (repetition 15 of a native stability cohort) completed its assertion but missed the browser-shutdown acknowledgment. The run reported `CLEANUP_FAILED` and kept its profile, as designed. In the accepted cohorts for the current build, all 40 native and all 40 Linux htmx stability runs passed without recurrence. Those passes do not explain the original cause, which remains open. If it recurs, Repro still fails safe: it reports `CLEANUP_FAILED`, retains the profile and never claims a pass.
- **`CLEANUP_FAILED` does not yet say which cleanup condition failed.** A follow-up candidate on branch `task/cleanup-failure-basis` adds that detail. It is not in this release because it changes runtime bytes and has not passed Linux acceptance.
- **Linux verification driver blind spot.** `scripts/verify-beta-isolated.mjs` lists images with `docker image ls --quiet`. Under Docker 29 that listing hides untagged images, so the driver's foreign-image check cannot see them. An independent listing showed that the Linux cohorts' retained images were all their own labeled artifacts, so no result changes. A fix needs a live Linux run to verify and is deferred to the follow-up candidate. The driver is not part of the npm package.

## Limitations

- Only the four registered workflows above. Arbitrary websites, authenticated apps, databases, WebSockets and real-user recording are unsupported, and are rejected rather than silently approximated.
- Ordinary containers are a development boundary, not hostile-code isolation. Do not execute untrusted capsules.
- Verified platforms: native macOS arm64, and isolated Linux arm64 on one task-owned VM. Linux amd64, Windows and other physical machines are untested.
- Reduction deletes actions and dependency groups only. It reports minimality as unverified and never claims global minimality.
- Repeated passing runs are bounded evidence, not proof of determinism.
- **Accessibility is deferred and unverified.** That covers native 200% zoom, actual screen-reader workflows and the 8 accessibility-focused or mixed browser scenarios. Keyboard, focus and automated checks keep their earlier scoped results only.
- No hosted deployment. Repro runs locally; the private GitHub repository holds source, not a deployed service.

See [SUPPORTED-SCOPE](SUPPORTED-SCOPE.md) for the complete boundary matrix.
