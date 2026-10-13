# Independent integration and release review

Reviewed 2026-10-13 UTC by a separate implementation agent. This is an automated review, not human approval. The reviewer authored the browser adapter and its tests; independence here applies to the other agents' manifest, capsule, ledger, service, server and UI integration. Browser results below are supporting execution evidence, not a claim of an independently written browser oracle.

Inspected `GOAL.md`, `docs/ACCEPTANCE.md`, security/architecture documents, the benchmark integrity skill, `src/{capsule,manifest,service,server,ledger,contracts}.ts`, `web/`, schema drafts, tests, exported readable tests and actual package/install reports. No sealed historical test or fix material exists in this kit. No proposed seccomp configuration was executed by this reviewer.

## Findings and repairs

| Finding | Reproduction or source evidence | Resolution and current evidence |
| --- | --- | --- |
| Output paths could traverse a symlink despite lexical `.repro-runs` containment | Earlier `ownedOutput` used relative-path checks only; ledger and direct runner paths could follow existing links | Shared `src/paths.ts` validates each existing path component and regular state files. `tests/paths.test.ts` and the direct-runner symlink test cover rejection without writes to the neighboring target |
| Failed SQLite initialization leaked the coordinator owner lock | Corrupt owned `ledger.sqlite`; constructor failed, repairing that file and retrying returned `LEDGER_BUSY` despite no coordinator. [Original reproduction](../.repro-runs/security-review/ledger-lock-R4JQjE/review.json) | Constructor closes its database and removes its owned lock on initialization failure. `tests/recovery.test.ts` passes this regression |
| Pairwise verification did not explicitly bind all run identities to the requested experiment | Earlier `verify` compared assertion/harness/seed between the two runs, but not all requested manifest/source/version identities | `src/service.ts` now checks requested manifest, installed harness, assertion, seed, versions, app revisions/digests and executed assertion counts before accepting comparison |
| Doctor used a different browser/sandbox configuration from replay | Earlier doctor ignored selected channel and launched without explicit `chromiumSandbox: true`; a launch alone missed input/screenshot failures | Doctor now tests the selected sandboxed browser with actual input and screenshot; recorded actual browser channel/version. Early pinned-browser failures remain preserved; later pinned runs passed |
| Shutdown still admitted requests while active jobs drained | HTTP listener remained live during `coordinator.close()` | Server marks closing and rejects subsequent requests with HTTP 503 before draining owned work |
| Historical jobs lost recoverable exact inputs after reduction | Session manifest was replaced after reduction; earlier job results contained a digest but no original manifest snapshot | `Coordinator.execute` now writes immutable `artifacts/<jobId>/manifest.json` before operations. `tests/release-review.test.ts` proves the snapshot survives session mutation and matches that job's digest |
| Valid structured trial evidence was silently corrupted | Eighty allowed long action IDs yielded a roughly 6 KiB trial event; `message.slice(0,4000)` made invalid JSON, which the live UI could not display. [Red run](../.repro-runs/release-review-red.log) | Ledger preserves complete events up to 64 KiB and rejects larger ones before insertion. Regression verifies both intact JSON and explicit oversized-event rejection |
| Malformed request tokens produced an environment error | A token containing 64 non-ASCII characters passed the JS-length guard, then `timingSafeEqual` threw on differing byte lengths; POST returned 500 | Server requires exactly 64 lowercase hex characters before comparison. Regression now receives 403 with no created session |
| CLI file input needed bounded reading and categorized JSON errors | The earlier CLI read and parsed the entire file before validation | `src/input.ts` now uses `O_NOFOLLOW`, a regular single-link file check and a 64 KiB bounded read; malformed JSON produces category `input`, code `MANIFEST_JSON`, without echoing content. Existing `tests/cli.test.ts` covers malformed JSON; the independent post-repair probe also passed |
| Starter JSON schemas contradict the executable format if treated as normative | Draft schemas use string `0.1.0` and different property names; actual manifest uses numeric version 1 | Current runtime contract is identified explicitly in [SUPPORTED-SCOPE](../docs/SUPPORTED-SCOPE.md). No claim is made that product capsules conform to starter drafts |

The three new release regressions pass: [green log](../.repro-runs/release-review-green.log), command `node --import tsx --test tests/release-review.test.ts`. The first snapshot check already passed after the integrator's repair; the event and token checks were observed failing before their fixes.

## What execution evidence establishes

- [Pinned browser suite](../.repro-runs/browser-pinned-final.log): 12 passed, 0 failed, 0 skipped. It covers real buggy/fixed observations, wrong and incomplete experiments, missing browser, deadlines, cancellation ownership, cancellation before finalization, symlink output rejection, actual denied browser egress, repeated replay and real reduction.
- [Synthetic benchmark](../.repro-runs/benchmark/09775a31-eff6-4556-abe8-6ea41d184597/summary.json): one failure family, 20 buggy and 20 fixed runs, 40/40 expected outcomes. Every run retains identities, observations and artifacts. This is native macOS Chromium 156.0.8078.4 evidence, not Linux portability or historical validation.
- [Recovery tests](../.repro-runs/recovery-green.log): two passed. An actual owned Node process was killed with three durably running ledger jobs (record/reduce/export); reopening marks them interrupted and blocks their sessions. This proves ledger recovery at those states. It does not prove cleanup of orphan browser processes or interrupted external services.
- [Fresh npm package smoke](../.repro-runs/package-smoke/run-WrErWC/summary.json): actual package/install, installed export/import and [exported conventional test](../.repro-runs/package-smoke/run-WrErWC/exported-readable-test.stdout.log) passed. The environment deliberately reused a declared host Chromium tool asset. The readable Node test directly checks nonzero assertion counts, identities and both observed result values; process exit alone is not its oracle. This run precedes later integration edits and must be rerun for final release.
- UI evidence includes real workflow screenshots and separate accessibility/reconnect checks. The reviewed tests distinguish CSS layout zoom from native browser zoom; they explicitly avoid a full WCAG or screen-reader conformance claim. Native zoom authorization and the final screenshot matrix remain the integrator's gate, not inferred from static source.

The exported bundle rejects unapproved artifacts, unsafe paths/links, oversize inputs, changed executable artifacts even when self-declared hashes are recomputed, and missing finalization. It deliberately rejects archives. The importing trusted installation compares executables to its own bytes; a malicious capsule cannot become trustworthy merely by recalculating its own integrity file. Executing an unknown capsule's own `dist/index.js` before independent inspection would still execute unknown code and is explicitly outside supported use.

## Linux sandbox blocker and reviewed proposal

The [default-container run](../.repro-runs/m0/linux-capsule-first-run.log) failed because no assertion executed. The separate [browser diagnostic](../.repro-runs/m0/linux-browser-diagnostic.log) records Chromium's `No usable sandbox` error. This is an environment failure and cannot satisfy R3 or be relabeled a target reproduction.

The initial pinned Playwright profile (`cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`) was unsuitable as a minimal-delta proposal: besides unrestricted namespace syscalls, that full profile allows `io_uring_*` and unrestricted socket families. Docker's current documentation identifies those as restricted security-sensitive areas. [Docker seccomp documentation](https://docs.docker.com/engine/security/seccomp/), [pinned Playwright profile](https://raw.githubusercontent.com/microsoft/playwright/v1.64.0/utils/docker/seccomp_profile.json).

The integrator then extracted the actual Docker 29.5.2 Linux arm64 runtime policy with all capabilities dropped and prepared a narrower profile. This reviewer independently compared parsed documents and file hashes:

| Item | SHA-256 / observation |
| --- | --- |
| Extracted default policy | `0be46a0ad7fee6639eb05104b9203193e54f5d85ffacc3e706bedab8720458f2` |
| Proposed policy | `0885450338aec8898e557b5f851a3042c82ea4740a87f4a33675d2755d13642d` |
| Preserved | Exact original syscall rules, default action/errno and architecture list; no `io_uring_*` allow rule; socket-family restrictions unchanged |
| Added | One `SCMP_ACT_ALLOW` rule for `clone`, `setns`, `unshare`, with an empty argument filter |
| Review artifact | [independent-review.json](../.repro-runs/security-proposal/independent-review.json) |

Playwright documents these namespace calls as needed for its sandboxed container configuration. The added rule allows the calls without argument filters; it is not restricted solely to user-namespace flag combinations. It increases the available kernel namespace surface while retaining the rest of this runtime's seccomp restrictions. [Playwright Docker documentation](https://playwright.dev/docs/docker).

The proposed policy is prepared only. It was not applied by this reviewer and does not prove that Chromium will run. The user's `GOAL.md` explicitly prohibits weakening security without specific approval; the integrator must obtain authorization for the exact per-container change before testing it. Browser sandboxing, unprivileged user, no external networking, read-only root filesystem, dropped capabilities, resource limits and the surrounding local VM must remain explicit. No untrusted/public-execution claim follows from a successful trusted synthetic run.

## Remaining acceptance boundaries

R3 Linux clean-environment execution is not established by the current failed run or by local package success. Native 200% browser zoom is separately unverified after a denied navigation action; the denial must not be bypassed with another tool. Final suites, final built-package smoke and screenshots must refer to the final source/build after all review repairs. Historical evaluation and public hosting are unsupported, separately documented future scope, not silently counted as passing results. [Supported scope](../docs/SUPPORTED-SCOPE.md) gives the audited feature boundary; [RELEASE](RELEASE.md) owns the final gate decisions.
