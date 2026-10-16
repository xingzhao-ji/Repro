# Practical beta protocol v1 — frozen before selected-case execution

This is a prospective three-case engineering evaluation, not a held-out research cohort. It supersedes the proposed twelve-case development study only for the owner's requested beta milestone. Selection favors supported static JavaScript browser behavior and public inputs. No selected case has executed when this version is written. Accessibility is deferred/unverified. Historical alpha and contrast results are unchanged.

## Frozen cohort

| Case | Buggy revision | Fixed revision | Independent expectation |
| --- | --- | --- | --- |
| morphdom textarea live value (issue 19) | `8221ace412be8dc1f519f2dc77393f0940134648` | `b72ddd5f21a759d235d70c92d3a37a990499c22f` | [Public report](https://github.com/patrick-steele-idem/morphdom/issues/19): after editing, morphing to a textarea with Hello World must update its live value. |
| htmx delegated event / native checkbox (issue 2755) | `7388d0c0573b6d6bab43baa1f66fd7e59385bcea` | `c9e2bea954efaf61d02b2f8639e31820e7632773` | [Public report](https://github.com/bigskysoftware/htmx/issues/2755): a delegated trigger must not cancel a checkbox's ordinary checked-state change. |
| Marked empty heading interrupts paragraph (issue 3048) | `39cee771b659ea0eba49bd69dba10817403550d6` | `a1034e6dd1ddbc2f723627f271bba29486005c1a` | [CommonMark 0.30 §4.2](https://spec.commonmark.org/0.30/#atx-headings), empty headings and paragraph interruption; [report](https://github.com/markedjs/marked/issues/3048). |

Use actual pinned source, not reconstructed implementations. Preserve source-byte hashes, licenses and exact acquisition/build commands. An independent small integration page exercises the library in Chromium; this is not coverage of each project's complete application ecosystem. No backend behavior is mocked to claim a backend fix. Freeze each concrete action/assertion manifest before its first execution, with the same assertion for both revisions. Author expectations from reports/specification without inspecting fixed implementation internals. The fixed bytes may be acquired/copied/hash-checked automatically. This operational discipline is not an inaccessible held-out boundary, so no held-out claim is made.

## Acceptance criteria

These numbers are engineering budgets chosen for dependency-light local browser work, not claims about general workloads. Never lower them after observing a result. Record every failed attempt, environment failure, cancellation and no-reduction result.

- Capture and each replay: at most 30 seconds including ordinary setup/cleanup; external watchdog 40 seconds. Interactive feedback should not require a long unattended job. Acquisition is a separately measured prerequisite.
- Reduction: at most 80 executions and 300 seconds, including all baseline, rejected, inconclusive and repeated trials. Each accepted candidate requires two fresh matching failures. Five minutes is a bounded developer operation. No global-minimality gate; final-neighbor uncertainty stays explicit.
- Export: at most 15 seconds, excluding acquisition. Atomic complete output or explicit incomplete staging state; never overwrite prior evidence.
- Clean setup: at most 15 minutes for locked public dependency/browser acquisition and build, with bounded logs, no ambient credentials, and a distinct network-enabled acquisition phase. Setup failure is inconclusive, not target failure.
- Runtime container: 2 CPUs, 128 tasks, 1 GiB hard memory limit, 256 MiB /tmp and 256 MiB /dev/shm. No OOM or denied task creation. Collect cgroup memory.peak and memory/pids events, not a sampled working-set proxy. Native development process-tree RSS is sampled and labeled approximate separately.
- Stability: reduced exported workflow, 20 buggy and 20 fixed executions per declared supported verification environment, alternating revisions; zero wrong outcomes, missing/changed assertions or infrastructure failures. This is bounded repeated evidence, not a determinism proof.
- Cleanup: owned browser/server resources released within 5 seconds of ordinary work completion, within 8 seconds of cancellation/timeout; zero observed owned survivors at that cutoff, unrelated sentinel alive. Preserve first and terminal census results even if later cleanup succeeds. Generated browser profiles/sockets/temp directories must disappear. Deliberately retained evidence is separately inventoried. User source/input/neighbor file hashes must remain unchanged.
- Size: report action count, serialized action bytes, application source bytes and complete export bytes separately. Reducible input must not grow; claim reduction only after actual removal. Do not add artificial actions merely to improve the ratio. An unchanged case is reported as no reduction and investigated for useful input-reduction support.

Correctness and faithful transfer are hard gates. Missing dependencies, startup errors, page exceptions, wrong observable values, absence of the intended preconditions or an empty test cannot establish target failure. The readable single-revision test must fail on buggy because its frozen assertion executed and pass on fixed with the same identity. Each new product fix needs its observed failing regression before repair.

## Fresh environments and measurements

Verify on native macOS arm64 development and fresh isolated Linux arm64, conditional on actual execution evidence. Do not claim Linux amd64, another physical machine, arbitrary apps or public hostile execution. Fresh export verification uses only the capsule context and declared public prerequisites; no repository, existing npm/browser cache, user profile/configuration/credentials, host service, host bind mount or Docker socket. An owned fresh VM/daemon avoids old image/cache reuse. Dependency installation scripts are disabled except the reviewed explicit browser/system prerequisite installer. Execution has no external network, unprivileged user, read-only root, all capabilities dropped and no-new-privileges. Browser sandbox remains enabled. The historical synthetic-only profile approval is not silently extended to new source.

Measure monotonic operation elapsed time and process/cgroup peak memory separately for capture, replay, reduction and export. Record acquisition duration, revision/source/harness/assertion identities, versions, all trial outcomes, original/reduced sizes, repetitions, cleanup census and temporary-file inventory. A measurement supervisor is owned by this beta task and remains alive naturally through child exit and the stated cleanup observations; this does not adopt the historical pending contrast lifecycle extension.

## Failure and privacy checks

Cover cancellation during startup/actions/reduction/export, deadlines, malformed/oversized/path-linked input, unavailable browser/source dependencies, source tampering, unrelated exceptions and wrong observations. Public diagnostics must give a concrete recovery action without echoing raw target exceptions. Use fake secret sentinels in forbidden declarations, DOM, console and error paths and scan every retained/exported artifact. This adapter deliberately captures only registered input/observation values, not arbitrary DOM/screenshots/trace/HTTP bodies. If filtering removes failure-relevant evidence, the result is inconclusive; never export raw secrets to force a pass.

Unsupported cases retain their exact blocker and denominator while independent implementation continues. Replacement or revised threshold requires an explicitly versioned prospective decision and cannot erase original outcomes. No maintainer contact, upstream PR, release, main merge, paid service or repository visibility change is included.
