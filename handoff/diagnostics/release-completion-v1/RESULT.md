# Repro local candidate verification

The expected workspace exists at `/workspace/repro-development-rv5abotj/repro`. This task produced a separate candidate under `candidate/`; the original checkout and prior evidence are preserved. **Overall status: NOT ALL RELEASE GATES MET.** Current source, emitted runtime, installed package and core browser behavior have substantial verified coverage, but the original browser matrix and accessibility gates remain incomplete.

## Deliverables

- [Final installable npm archive](package/final/repro-local-0.1.0.tgz) and [offline package receipt](package/final/final-receipt.json).
- [Complete selected source snapshot](repro-release-candidate-source.tar.gz), with 184 source files, and [source delivery receipt](source-delivery-receipt.json).
- [Cumulative integration patch](release-candidate.patch), relative to the preserved 182-file pre-schema baseline. It is not a patch against an arbitrary Git HEAD.
- [Final source inventory](final-source-inventory.json), [independent audit](audit/FINAL-REVIEW.md), [whole-task manifest](artifact-manifest.json) and [final receipt](final-receipt.json).

The source snapshot includes the previously integrated startup ownership work, reviewed schema correction, minimal sidebar focus repair and current release documentation. The cumulative patch changes seven paths relative to the preserved task baseline. It was applied in a separate verification copy and checked against every delivered source hash. Runtime evidence, dependencies and Git internals are excluded from the source archive.

## Actual results

| Check | Result | Evidence |
| --- | --- | --- |
| Full source suite | 464/464 passed; zero failed, skipped or cancelled | `nonbrowser/final-source-full.receipt.json` |
| Full emitted suite | 464/464 passed; zero failed, skipped or cancelled | `nonbrowser/final-assets-emitted-full.receipt.json` |
| Build, strict types, lint, fixture and kit | Passed; fixtures 7/7; nine build outputs | `nonbrowser/final-receipt.json` |
| Original browser matrix | 31 planned: 24 passed, 6 failed, 1 started but interrupted at 120 seconds; zero skipped or unrun | `browser/final-receipt.json` |
| Current synthetic benchmark | 20 buggy and 20 fixed runs matched the frozen assertion | `audit/core-flow-evidence-audit.json` |
| CLI demo | Six actual command steps passed their expected semantic results | `browser/final/jobs/demo/test-receipt.json` |
| Installed browser execution | Buggy and fixed readable replays passed; CLI directly observed the expected target failure | `package/final/browser-evidence-binding.json` |
| Final offline package | Clean local install and 12 verification commands; exact runtime/capsule/dependency evidence binding | `package/final/final-receipt.json` |
| Sidebar focus | Authored regression red/green; actual Tab-focus contrast 8.82:1 | `usability/completion-receipt.json` |
| Constructed contrast supplement | All 124 occurrences measured pass, minimum 5.9111:1 | `audit/contrast-results-review.json` |
| New actual-packet contrast audit | Zero axe violations, 66 incomplete occurrences; separate measurements 51 pass, 0 fail, 15 unresolved | `usability/contrast-followup-assessment.json` |
| Static/visual usability | 29 static checks and 29 inspected screenshots | `usability/RESULT.md` |

Counts use different units and are not additive. Benchmark runs occur inside core-flow checks. Supplemental successes do not replace the six failed original tests or the interrupted test. Exit 1 for the demonstrated buggy fixture is the expected target-failure result, supported by actual assertion observations; it is not inferred solely from a process exit.

The emitted suite preserves 62 raw compiler outputs. Eight generated test files adapt hardcoded subprocess paths from TypeScript to JavaScript and remove matching tsx preloads; assertions and test deadlines are unchanged. V8 coverage establishes emitted production execution. Original web sources remain intentional build inputs for HCI export tests, and test-runtime tests intentionally generate synthetic TypeScript workers. See [the nonbrowser report](nonbrowser/RESULT.md) for the exact scope.

The final package differs from the runtime-verification package only in release documentation. All nine built files, all 14 capsule files and 260 dependency entries are compared. Separate installed library and CLI harness identities remain explicit; they are not interchangeable. The final external package receipt binds the exact delivered runtime to three actual installed browser observations without claiming a new browser run for the documentation-only archive.

Current reduction used 16 executions and 13 trials, accepting the baseline and two deletions. It retained three of five actions, and the reduced fixed revision passed the unchanged assertion. Minimality remains **unverified**, as the bounded R2/ADR 0001 contract permits; it is not a newly invented release failure or a global-minimality claim.

## Remaining gates and supported next steps

1. **Six original browser checks failed before establishing their target behavior.** Required overlapping Chromium trees reached the unchanged 128-task cap in the cancellation check; its navigation, cancellation, unrelated-browser liveness and subsequent replay assertions were not reached. The other capture-dependent failures have their own `pthread_create EAGAIN` and task-limit evidence. One UI review reached navigation and then its 10-second adapter deadline; the reset-only captures did not. These are retained test failures with inconclusive product behavior. A future run needs an evidence-backed supported execution arrangement that preserves the required assertions, browser sandbox, ownership semantics and approved limits. Repeating an unchanged failing run provides no new evidence.
2. **The retained actual-packet comparator was interrupted at its 120-second outer deadline.** It produced screenshots and downloads but no completed TAP summary. Its final audit, global equality, network and page-error checks remain unestablished. Recorded PID-limit and OOM counters were zero, so this is not attributed to the task cap. An offline supplement verified both downloads and built evidence, and a new narrow L320 audit added separate evidence; neither recovers the lost final in-memory checks.
3. **Fifteen actual contrast samples remain unresolved.** Thirteen failed strict identity guards because axe retained truncated table-cell HTML; two text samples remained clipped after bounded scrolling. No measured product contrast failure was established. Future verification must resolve these measurement limits without hiding the original axe incomplete results.
4. **Native 200% zoom remains unverified.** The prior supported Chrome request returned `net::ERR_BLOCKED_BY_CLIENT`, and no supported native-control surface is available. Provider resolution and an actual native zoom check are required; CSS zoom and viewport reflow are not substitutes.
5. **Actual screen-reader usability remains unrun.** There is no supported active screen-reader/display session. A supported session is needed; automated axe, ARIA and screenshots do not establish spoken usability.

Observed portability is restricted to the pinned Linux amd64 browser image and separately approved external runtime profile `f590f8ce5e847b35c95ed525a0a24c2e290472732c7c86f307e8496d7b47e33c`. The bundled capsule profile `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b` is unchanged. This is not evidence of universal or default bundled-policy portability. Human participant research remains unrun and is not claimed as technical verification.

## Preservation and limits

The original 182 selected source files and 2,048 entries in three prior evidence chains are checked independently. All owned browser containers and volumes were removed. Browser execution retained 128 tasks, 1 GiB memory, two CPUs, network isolation, read-only root/inputs, enabled sandboxing and a 120-second outer deadline. No authentication, GitHub writes, security settings, resource limits or publication changed during this Repro task.

Earlier failures remain in the packet: the first source run passed 463/464 with a child timeout during concurrent work; the initial emitted run passed 461/464 because a static CSS input was omitted from staging; baseline focus setup and wrong-selector failures are retained. The exact frozen asset and selector were corrected before the corresponding final checks. No baseline browser contrast-red result is claimed; the red result belongs to the authored color regression.

The whole-task manifest records regular files and symlink targets without following links. The final receipt binds the manifest, component receipts, package, source archive and patch. Local candidate preparation and evidence reconciliation are complete; the remaining acceptance gates above prevent a completed-release claim.
