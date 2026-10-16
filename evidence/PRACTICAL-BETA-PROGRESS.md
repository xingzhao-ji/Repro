# Practical beta — native evidence complete, isolated verification unrun

This is an incomplete milestone, not a release or clean-environment success claim. The owner directed preservation of commits/logs and no retry of the held operation or weakening of sandbox/security settings. The goal remains incomplete. Accessibility is deferred and unverified.

Baseline `88fedc530152b786fdb8ac76a867ddbcd8229201` was clean and verified before changes: 84 matching checks across overlapping source/build/log inventories, not 84 unique files. The new branch is `task/practical-beta`. Commits `082789c`, `6632bee`, `c0320f4`, `ee827a2` and `30cba87` preserve the frozen evaluation protocol, core implementation, workbench journey, native supervisor and isolated verification driver. No main merge, release, remote push or CI run occurred.

## Implemented behavior

Schema 3 and the registered browser adapter execute actual pinned upstream libraries through small local integration pages. Capture freezes an explicit expectation; an independent DOM oracle rejects missing assertions, unrelated exceptions and unsupported observations. Reduction reuses the bounded dependency-aware algorithm and preserves assertion/source/harness identities. Exports contain a readable single-revision Node test, selected source/provenance/licenses, lockfile and integrity-checked runtime. The workbench supports case selection, expectation confirmation, observed values, trial inspection, comparison, export commands and immutable history.

Observed failing regressions preceded fixes for a wrapper name collision, incomplete oracle executable identity, late HTTP-server acquisition cleanup, unbounded close acknowledgement, preexisting profile ownership, CSP-blocked dependency classification, contradictory reduction/evidence categories, inspector execution limits, and package build-input inventory. The close-acknowledgement regression returns bounded inconclusive evidence with a retained profile; it does not prove forced cleanup of a genuinely hung browser. Unexpected private observations are withheld, not exported as proof of the intended failure. Capture remains limited to registered public values, not arbitrary private application data.

Permitted review during the runtime hold also exposed driver defects. New failing unit tests preceded repairs for cancellation during final cleanup incorrectly retaining success, delayed host-client signals outliving process ownership, stuck stdio after timeout/cancellation, and malformed cleanup/kernel receipts passing validation. Host-client lifecycle tests use fake timers and mocked signals; they do not establish Docker cancellation or runtime cleanup. The security profile and frozen acceptance thresholds are unchanged.

A subsequent input audit found that a CLI declaration containing `expectation: null` silently selected the registered expectation. A failing ordinary unit regression preceded a boundary check matching the API's rejection of null/non-object/array declarations. It returns an actionable `input/CASE_DECLARATION` error and preserves the input and neighboring files. The internal fixture-construction default is unchanged.

## Completed verification

Counts overlap and must not be added into a new aggregate suite.

| Check | Actual result | Boundary |
| --- | --- | --- |
| Ordinary unit/contract suite | **295/295 passed** | `explicit-expectation-null/all-units.log`; includes the null-expectation regression; earlier results retained |
| Types, lint, build | Passed after the input repair | Ordinary static/build checks; no runtime portability claim |
| Driver syntax, kit | Retained passes | Input repair changes neither driver nor fixtures; kit is structural/synthetic evidence |
| Repository adapter/lifecycle checks | **10/10 passed** | Actual buggy/fixed pairs, privacy, close acknowledgement, late acquisition and profile preservation |
| Repository fault checks | **7/7 passed** | Cancellation/recovery with unrelated Chromium alive, deadline, unavailable browser/source, CSP-blocked secret-bearing request; late CSP tests include five repetitions each |
| Workbench journeys | **4/4 passed** | API plus all three cases through capture, reduction, verification, export and history |
| Legacy adapter/history regressions | **11/11 passed** | Selected affected checks; not a fresh full browser matrix |
| Native CLI workflows | All three completed | Capture, replay, reduction, comparison, export; actual assertion evidence independently re-evaluated |
| Native exported regression stability | **20 buggy + 20 fixed per case** | 60 target-assertion failures and 60 fixed passes; zero unexpected outcomes; no dependency/setup failures counted as bugs |
| Export/receipt inspection | Three capsules validated; **297 records / 150 distinct runs** audited | Read-only integrity, source, entrypoint-specific harness, frozen assertion, reduction trial, cleanup and log-hash validation |
| Isolated driver unit checks/preparation | **26/26 focused tests**, three updated capsule `--prepare` checks | 16 receipt/policy/preparation and 10 mocked lifecycle tests; v4 contexts validated without Docker or application execution |

Native environment: macOS arm64, Node 26.7.0, Playwright 1.64.0, pinned Chromium 156.0.8078.4. Existing workspace dependencies/browser were used. No LLM, API key, account or proprietary viewer is needed by the exported conventional test. These observations are neither fresh-machine verification nor a determinism proof.

All native runtime results below precede the null-expectation input repair. The previous build and native capsules remain preserved. Rebuilding changed only `dist/cli.js` and its source map; the index runner, web artifacts, readable test, manifests and case assets remain byte-identical. Three newly emitted capsules differ from their native-tested predecessors only in `dist/cli.js` and `integrity.json`; they passed import/content/preparation validation but were not executed. `explicit-expectation-null/exports.json` binds both CLI identities and the precise export differences. Retained results do not establish a fresh final-candidate workflow pass.

| Case | Full pinned revisions (buggy → fixed) | Actions / serialized action bytes | Capture / replay / reduction / export |
| --- | --- | --- | --- |
| [morphdom #19](https://github.com/patrick-steele-idem/morphdom/issues/19) | `8221ace412be8dc1f519f2dc77393f0940134648` → `b72ddd5f21a759d235d70c92d3a37a990499c22f` | 3 → 2 / 276 → 175 B | 0.606 / 0.344 / 2.013 / 0.203 s |
| [htmx #2755](https://github.com/bigskysoftware/htmx/issues/2755) | `7388d0c0573b6d6bab43baa1f66fd7e59385bcea` → `c9e2bea954efaf61d02b2f8639e31820e7632773` | 2 → 2 / 152 → 152 B | 0.458 / 0.573 / 0.960 / 0.204 s |
| [Marked #3048](https://github.com/markedjs/marked/issues/3048) | `39cee771b659ea0eba49bd69dba10817403550d6` → `a1034e6dd1ddbc2f723627f271bba29486005c1a` | 3 → 3 / 294 → 294 B | 0.386 / 0.373 / 2.093 / 0.211 s |

All three report `minimality=unverified`: inconclusive deletions cannot establish necessity. Htmx and Marked had no accepted removal. Their natural minimal input sequences were not padded; value changes are outside the frozen action-deletion contract. The Marked expected HTML comes from CommonMark 0.30's heading rules, not the reporter's inaccurate proposed HTML. These are selected public development cases, not held-out research.

Both executed application variants total 27,220 / 334,001 / 145,256 bytes; complete capsule payloads total 514,006 / 1,108,365 / 1,520,605 bytes respectively. Source assets do not shrink during action-only reduction. Separate upstream archive sizes are in [the native receipt](practical-beta-native.json).

Maximum sampled process-tree RSS across the five native workflow operations was approximately 441.80 / 438.14 / 449.86 MiB respectively. This is a 100 ms sampled sum, can double-count shared pages, excludes the measurement supervisor and is **not** a kernel/cgroup peak. All accepted workflow and stability receipts have an empty owned-process census within the frozen 5-second cleanup cutoff and a distinct empty terminal census. Owned profiles were absent, unrelated sentinels stayed alive, and checked source/input/user-neighbor bytes were preserved. Intentionally retained evidence is not temporary leakage. Both native sentinel processes were terminated by their owners after the sequences.

## Unrun or deliberately deferred

- No beta Docker image build, clean npm/browser installation inside a capsule image, or isolated case execution occurred.
- No Linux capture/replay/reduction/export, 20-pair exported stability sequence, kernel memory/pids measurement, or runtime cleanup evaluation occurred. Linux arm64 support for these cases is **unverified**; Linux amd64 and another physical host are also unverified.
- `npm run test:package` and the complete browser matrix were not run for this candidate. Focused browser checks above must not be called a full matrix pass.
- Accessibility, native 200% zoom and real screen-reader checks remain deferred/unverified. No denied accessibility route was retried.
- No participant study, arbitrary repository adapter, arbitrary website recording, public hostile execution, upstream PR or maintainer contact occurred.

The new task-owned VM setup did complete, with an initially empty Docker image store, no host directory mounts, no loaded host SSH keys/agent and no application-port forwarding. That is environment preparation, not capsule verification. The owner approved the unchanged policy for the three cases, then issued the instruction to hold the blocked step. No payload build or execution occurred between those instructions or afterward. There is no isolated runtime-denial log in this continuation from which to infer a technical cause. Profile `b` was stopped cleanly; disks, contexts and logs remain preserved. No security setting was weakened.

## Essential held step: manual review prerequisites

Purpose: prove that each exported regression works from its own package and declared public prerequisites, without the current workspace, ambient dependencies/browser caches, hidden credentials or host services; collect actual Linux kernel resource and cleanup evidence. This evidence is essential to the requested beta milestone.

The driver after the unit-tested repairs is `scripts/verify-beta-isolated.mjs`, SHA256 `03408c04a25b12517066a25d2a5d34d8cd6dd4cd68a60a3d308fa0258d6ea63c`. Current capsule-only contexts are under `.repro-runs/practical-beta/isolation-prepared-v4/{caseId}/`, bound by `explicit-expectation-null/exports.json`. Earlier v2/v3 contexts, their preparation receipts and original driver identities remain preserved as historical preparation evidence. No version was executed in Docker. The [frozen protocol](../benchmarks/PRACTICAL-BETA-PROTOCOL.md) remains unchanged.

Manual review must establish legitimate execution support for the exact Linux arm64 runtime and the unchanged profile `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`. Runtime restrictions remain USER node, enabled Chromium sandbox, network none, read-only root, all capabilities dropped, no-new-privileges, 2 CPUs, 128 tasks, 1 GiB memory, 256 MiB /tmp and /dev/shm, and task-owned evidence volumes. No host binds, Docker socket inside the container, credentials, privileged mode or sandbox disabling are permitted. Acquisition needs public npm/browser/system dependency access and the pinned Node 26.7.0 Debian base image; replay itself must have no external network.

The driver requires the explicit task-owned Unix Docker socket and exact policy opt-in. It starts with an empty daemon inventory, then allows only a verified receipt chain of this cohort's retained public base/build images. Every case installs dependencies/browser anew without build cache; the reduced export receives a second independent build. All four workflow operations precede 20 alternating buggy/fixed pairs. A foreign resource, setup failure, mismatched assertion, exceeded budget or missing census remains a failed/inconclusive result. Do not retry a denial via another tool or modify the profile to obtain a pass. The owner-directed hold is still in force; this section is a review handoff, not automatic execution authorization.

## Preserved unsuccessful attempts and evidence locations

Raw evidence is ignored local data under `.repro-runs/practical-beta/`, with conventional test execution evidence under `.repro-runs/readable-buggy/` and `readable-fixed/`. The portable JSON summary binds the audit receipt; a clone without these raw files must not call them newly reverified.

- Initial morphdom execution raised an unrelated JavaScript exception from a wrapper name collision; it was inconclusive. A failing load-order regression preceded the wrapper fix.
- The first expanded UI run was 2 passed / 2 failed because the new test read baseline trial content before selection completed. Later journey steps were unattempted in that run. The corrected bounded rerun passed 4/4.
- The initial native orchestration script failed module resolution before product execution. Its corrected v1 ran all workflows but lacked full sentinel/source-preservation coverage. V1 measurements remain retained; accepted v2 adds those observations and separates executable-source bytes from upstream archives.
- The first VM setup stopped before creation because its task-owned socket path exceeded `UNIX_PATH_MAX`. Shorter task-owned paths preserved the same security restrictions. No capsule run happened in either setup attempt.
- Red regression logs, the initial CSP classification failure, close-acknowledgement timeout, profile collision, inspector/reducer category failures, driver preparation failures and later passing checks remain retained. Successful corrections do not erase those attempts.

Primary current logs: `all-units-final-native.log`, `adapter-before-native-v1.log`, `case-faults-csp-timing.log`, `case-ui-expanded-v2.log`, `legacy-adapter-history-v1.log`, `native-v2-driver.log`, `native-stability-v1-driver.log`, `native-evidence-audit.json`, `isolation/vm-stop-owner-hold.log`. Their names are relative to `.repro-runs/practical-beta/`.

Later driver-only evidence is under `driver-hold-review/`: `receipt-red.log` (six observed failures), `receipt-green.log` (16 passes), `lifecycle-red.log` (four failures/two passes), the separate drain/cancel/post-exit red logs, `lifecycle-post-exit-cancel-green.log` (10 passes), `all-units-final.log` (294 passes), static-check logs, and `prepare-v3.json`. Independent review's cancellation reproduction is retained at `isolated-review-cancel-drain.log`. The native JSON summary keeps its earlier 278-unit cutoff; native case results were not rerun for these driver changes.

The later input repair is bound by `explicit-expectation-null/red.log` (observed missing rejection), `green.log` (15 focused passes), `all-units.log` (295 passes), build/typecheck/lint logs, `previous-dist.json` and `exports.json`. The old build is retained in that directory's `previous-dist/`; original native logs and capsules were not overwritten. The hold has persisted through native-evidence preservation, driver repairs and this input repair. Independent requirement review found no further demonstrated code defect; fresh runtime evidence remains essential and blocked by the owner's no-retry instruction.
