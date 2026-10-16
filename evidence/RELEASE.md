# Current release evidence

Development-script correction: [package input provenance](PACKAGE-INPUT-PROVENANCE.md) fixes omitted token/config inputs in both package checks. Fresh unit/contract count is **214/214**, plus typecheck/lint/syntax checks; product runtime bytes are unchanged. Browser/package/Linux results below are retained observations, not new runs. Native zoom and actual screen-reader checks remain open.

The caller-declared expectation extension is verified: **204 unit/contract and 39 browser tests pass**, plus installed/offline package and a fresh restricted Linux replay. See [the current release supplement](AUTHORED-RELEASE.md), [machine-readable summary](authored-release-summary.json) and [HCI fidelity preparation](HCI-FIDELITY.md). Native zoom and actual screen-reader checks remain open.

Documentation-only continuation: [HCI materials v2](HCI-MATERIALS.md) reconciles study schedules, timing/coding forms and static inspection keys. No runtime or frozen-case changes, participant observations or new runtime verification are implied.

The following report is preserved for checkpoint `15a8225`; its hashes, counts and offline archive describe that earlier schema-1 build.

# Repro local alpha release candidate — October 15, 2026

The supported synthetic workflow is working on this Mac: capture with consent → reproduce → reduce → compare the fixed revision with the unchanged assertion → export → inspect → standalone replay. **179 unit/contract tests and 31 real-browser tests pass, with zero failures or skips.** Clean dependency installation, build, typecheck, lint, kit checks, executable demo, installed package and cached offline capsule checks also pass. This is a local synthetic alpha release candidate, not a general recorder or production-readiness claim.

**Remaining accessibility gates:** native 200% Chrome zoom is blocked/unverified; actual screen-reader operation is unrun. The historical provider denial was not retried or bypassed, and the current supported tool inventory exposes no browser-control or screen-reader observation surface for those checks. Keyboard, Axe, semantic snapshots and CSS reflow are separate evidence. [Native gate](NATIVE-ZOOM-GATE.md).

## Current evidence

| Check | Actual result | Authoritative evidence |
| --- | --- | --- |
| Fresh setup | npm ci installed 116 packages; pinned Chromium acquired; build passed | [Setup logs](../.repro-runs/release-candidate/setup/), [build log](../.repro-runs/release-candidate/final-build.log) |
| Static/kit | Strict typecheck, lint, 7 supplied model fixtures and kit structure passed | [Machine-readable command/log hashes](release-candidate-summary.json) |
| Unit/contract | 179 passed, 0 failed/skipped, including malicious inputs and new evidence-preservation regressions | [Final unit log](../.repro-runs/release-candidate/final-unit.log) |
| Real browser | 31 passed, 0 failed/skipped; full UI, interrupted-process recovery, cancellation, network boundary, wrong failures, inspector/history | [Final browser log](../.repro-runs/release-candidate/final-browser.log) |
| Repeatability sample | 20 buggy and 20 fixed runs matched the frozen expected behavior | [All 40 retained observations](../.repro-runs/benchmark/5fdc8526-d59b-4cce-834b-f6b8b1553273/summary.json); one synthetic family |
| CLI journey | Demo passed; 5 actions reduced to 3 with 16 executions; buggy reproduced, fixed satisfied, exported capsule replayed | [Demo summary](../.repro-runs/demo/1e1e3394-fd07-4e4e-ba5a-faa28f03912e/summary.json); minimality remains **unverified**, because final neighbors were inconclusive |
| Installed/offline package | 15 commands and 8 actual assertions passed; installed record/export/inspect/replay/verify and conventional test | [Portable package report](release-candidate-package.json); offline installation uses populated npm cache and separately acquired Chromium |
| Reduced Linux replay | Actual 3-action capsule passed buggy/fixed assertions in a fresh Linux arm64 image/container/volume; all 14 payload files matched | [Linux report](release-candidate-linux.json); network none, approved policy, browser sandbox enabled |
| Acquired offline image | Saved archive verified, loaded at the expected image identity, and replayed in another fresh container/volume | [Offline instructions](../docs/OFFLINE.md); import used the existing owned Docker daemon, not a second physical host |
| Process cleanup | Separate post-close census after every package command found zero observed owned survivors; real abrupt-process recovery passed | [Package report](release-candidate-package.json), browser recovery tests; ancestry sampled every 100 ms, not an exhaustive kernel audit |
| Accessibility | Keyboard regressions and full flow pass; sampled Axe checks and responsive screenshots reviewed | [Accessibility report](release-candidate-accessibility.json); native zoom and screen reader remain separate open gates |
| Dependency advisories | npm audit reported 0 known vulnerabilities across runtime and development dependencies at this check | [Audit response](../.repro-runs/release-candidate/setup/npm-audit-all.json); not a guarantee of absence of vulnerabilities |

Commands are the README development checks, plus `npm run demo` and `REPRO_PACKAGE_SMOKE_ROOT=.repro-runs/release-candidate/package node scripts/package-smoke.mjs`. Npm setup used empty task-owned user/global configuration, the official npm registry and a project cache. Host: macOS arm64, Node 26.7.0, npm 11.19.0, Playwright 1.64.0, pinned Chromium 156.0.8078.4. No dependency versions or frozen assertion were changed.

The 26-file build-input aggregate is `2210dd4dc2ef59f6b0401262bbdea59f5c52ee438e46f3f9497970410cf6ca99`, defined and checked in the package report. Source TypeScript, bundled CLI and conventional bundled test have different executable harness hashes; each buggy/fixed comparison checks equality within its own unchanged harness. The frozen assertion is always `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`.

The reduced Linux image is `sha256:52ca25c19ba791c95aa24c4b95a26a6c6e892d3fd8a0f3d29badb0856b009aaa`. Both executions observed stale Alpha for beta on the buggy revision and Beta for beta on the fixed revision, with distinct run IDs and one frozen assertion per revision. The compressed image is **547,548,184 bytes**, SHA-256 `1e1da4deffec9f5415dcc9df7672538795264cd9e2a60a04c489546616588740`. Gzip integrity, OCI blobs and all nine decompressed layer identities were verified. It contains acquired runtime dependencies and excludes runtime evidence volumes and host profiles. Replay needed no download, original app service, viewer or LLM. Docker acquisition and independent second-host archive import were not tested offline.

Actual VM listener checks found that Colima's `--port-forwarder none` alone still forwarded guest DNS on restart. The owned VM was stopped before reduced replay, and a task-only first-priority ignore rule disabled that forwarding. Pre/post checks then found no owned TCP listeners or UDP sockets; the exact container restrictions remained unchanged. The first unreduced sample's VM no-forwarding boundary remains unverified. The final VM is **Stopped**, its observed hostagent exited, and no containers were running at shutdown. [Setup correction](../CLOUD-SETUP.md), [preserved diagnostics and boundary evidence](release-candidate-linux.json).

## Defects repaired and failures preserved

- CLI output reuse overwrote previous input/result files. An atomic new-directory claim now rejects repeated/concurrent output reuse before execution, preserving partial and completed history. Three red regressions became green. Commit `c8cd87f`.
- Reducer repetition accepted the same run ID twice. Reused IDs now yield INCONCLUSIVE and cannot accept deletion. Two model regressions failed before the fix and pass afterward. Commit `cb4438d`.
- Dark-sidebar keyboard focus measured 2.46:1 against its surroundings. Its scoped focus token now measures 8.82:1. Starting capture also lost focus when its button unmounted; focus now continues in the evidence workspace. Both keyboard regressions pass, along with the existing historical-selector focus check. Commit `352f48b`.
- Package smoke previously omitted installed replay/verification, cached offline installation and a distinct post-close census. Those checks now validate actual observations, identities and cleanup. Commit `a0b327c`.

Independent agent reviews covered architecture, oracle identity, reducer semantics, trust boundaries, packaging and UI states. The package reviewer independently reran 28 CLI/reducer tests in a copied task-owned workspace. These are software-agent reviews, not human approval. Red logs remain under `.repro-runs/release-candidate/setup/cli-output-red.log`, `review/reducer-red.log`, and `accessibility-*-red.log`. The accessibility probe also retains a failed cleanup assertion that counted its still-running tsx/esbuild helper; a separate post-script census establishes its exit without rewriting that failure. A post-fix test-locator error and the Linux setup diagnostics are likewise retained.

## Contrast diagnostic decision

The historical pilot remains **50 passing controls, 12 provisional passing measurements, 45 unattempted observations**, stopped at **899.40 MiB** against **896 MiB**, with no distinct post-close census. Those are user-supplied historical observations; the raw packet was absent at takeover. This release does not complete or relabel that pilot.

The 896 MiB cap is a diagnostic engineering choice, not the original product definition. Combined test-loader/Axe/transport/browser RSS cannot by itself establish product leakage. We retained the old result, used bounded workflow checks with separate cleanup evidence, and made no native peak-memory claim. No memory-transport prototype was installed; no original test or approved container resource limit was weakened. [Decision and alternatives](../docs/adr/0002-release-candidate-evidence.md).

## Remaining limits

1. Native 200% zoom needs the legitimate browser provider to resolve the recorded access restriction and expose a usable native zoom surface.
2. Actual screen-reader behavior needs supported assistive-technology operation and observation; semantic snapshots are not that evidence.
3. Only the registered synthetic frontend and supplied expectation are supported. Arbitrary app adapters, arbitrary expectation authoring, PostgreSQL, historical bugs, human-study outcomes and hostile/public execution remain outside the implemented release scope.
4. The acquired Linux arm64 image supports offline replay on a compatible Docker host. Docker itself is a prerequisite, and archive import on a separate clean host remains untested. Debian system-package repositories are not snapshot-pinned, so bit-for-bit OS image rebuilds are not claimed.

The original R0–R10 contract is unchanged. Technical R0–R4/R6/R7 checks pass within the stated fixture boundary; R5/R10 remain incomplete for actual native zoom and assistive technology, and R8 remains synthetic-only. HCI research preparation is preserved; participant study, comparator research and broad effectiveness claims are not release results. No hosted runtime or CI pass is implied by local checks.

## Historical release report — preserved

The report below describes the earlier October 13 checkpoint. Its counts, source hashes, local evidence availability and delivery state are historical and are superseded by the current report above where they differ. The original raw historical run directory was absent in this checkout; tracked reports and history were preserved.

# Local release evidence

The selected-run evidence inspector is implemented and technically verified for the registered synthetic stale-response frontend. Inspector checkpoint checks: **101 unit/contract tests, 29 browser tests**, build, kit, strict typecheck, lint and installed-package smoke passed with zero failures/skips. The final exported capsule is byte-identical to the fresh Linux image that passed buggy/fixed assertions under the approved policy. The VM is stopped. [Detailed HCI evidence](HCI-INSPECTOR.md), [portable check index](hci-inspector-summary.json), [Linux evidence](LINUX-PACKAGED.md).

Native 200% Chrome zoom remains gated, actual screen-reader usability and human study are unrun, and the study comparator and human-study analysis remain pending. These do not become passes from screenshots, Axe or CSS zoom. The product remains a local synthetic alpha, with no arbitrary-site recorder, PostgreSQL adapter, arbitrary patch executor, historical-bug corpus, hosted service, LLM dependency or API key requirement.

The subsequent [offline analysis instrument](HCI-ANALYSIS.md) passes 73 dedicated regressions and 174 total unit/contract tests. Its source/test/fixture inventory is separate; the prior 81 runtime files remain unchanged.

## Gate status

| Gate | Current result | Evidence and limits |
| --- | --- | --- |
| R0 kit/provenance | Passed | Seven supplied fixture tests and structural checks; distinct from browser execution |
| R1 behavioral core | Passed in supported fixture | Frozen assertion, actual browser observations; prior 20 buggy/20 fixed repetitions retained, protected core unchanged |
| R2 reduction | Passed bounded checks | Dependencies, repetitions, cancellation/budgets and adversarial cases; no global minimality claim |
| R3 portability | Passed trusted Linux arm64 scope | Fresh image/container/volume, one assertion per revision, exact policy and final payload equivalence; cached dependency layers reused |
| R4 persistence/recovery | Passed tested scope | Immutable historical inputs, interruption/retry, exact job/trial selection, late-response protection and focus preservation |
| R5 UI | Technical workflow/reflow passed; native zoom unverified | Real keyboard workflow, 390/768/1024/1440 captures, keyboard overflow access and automated accessibility; no screen-reader usability claim |
| R6 privacy/isolation | Passed applicable trusted-synthetic checks | Bounded owned file reads, allowlisted fields, malicious inputs, preserved container restrictions; no hostile-workspace/authenticity claim |
| R7 code health | Passed | Current 174 unit/contract tests and typecheck/lint; retained 29-browser/build/package evidence for unchanged runtime; zero skips |
| R8 benchmark integrity | Synthetic only | Historical bugs, real users, adoption and generality unestablished |
| R9 release evidence/delivery | Local evidence retained; private source delivery authorized | Inspector checkpoint cc52c80 delivered; subsequent offline-instrument increment push/readback pending at report preparation; no remote CI configured |
| R10 HCI | Inspector and technical checks delivered; research incomplete | Research/protocol drafts, 156 workflow assertions and 7 clean Axe samples; offline synthetic analysis instrument tested; comparator, broader tasks, inferential analysis and human validation pending |

## Provenance and verification boundaries

macOS arm64: Node 26.7.0, npm 11.19.0, TypeScript 6.0.3, Playwright 1.64.0, pinned Chromium 156.0.8078.4. Linux arm64 uses the pinned Node 26.7.0 Bookworm image. Exact package versions remain locked; no dependency change was introduced in this HCI increment. [Dependencies](../docs/DEPENDENCIES.md).

Final 81-file runtime source/build aggregate: `c263f4380f8a6dad58f9403df0135ad34f313a9c24518c1752e744529c67c65d`. [Final inventory](../.repro-runs/hci-increment/final-capsule-equivalence-e12c8561a6ee/final-content-hashes.json). The original Linux freeze and subsequent UI-only differences are separately preserved; all 14 capsule files match the actual executed image. Release prose is excluded from the runtime inventory to avoid circular hashes. The assertion remains `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711` and the packaged harness remains `f93f38c955f28a3d23057860730e3222d24608cdc31e61c025cc183576ad1695`. [Linux portable result](linux-hci-summary.json).

Read-only inspector checks validate selected trial association and observations within the trusted local workspace. They do not independently re-execute every ancestor trial or authenticate a hostile local ledger. Missing evidence stays INCONCLUSIVE; recorded acceptance is labeled historical metadata. The original reducer, adapter, oracle and security policy remain unchanged.

The exact approved seccomp SHA-256 is `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`; its sole addition to the prior namespace profile is chroot. All other VM/container restrictions were preserved, no broader permission or browser protection changed, and no further security change was needed. Native `ERR_BLOCKED_BY_CLIENT` remains separately unresolved. [Native gate](NATIVE-ZOOM-GATE.md).

## Delivery and retained history

The user explicitly approved private source/tests/assets/docs/history delivery to [xingzhao-ji/Repro](https://github.com/xingzhao-ji/Repro), without force or visibility change. The first checkpoint 9399a6c is published and backed up in private Library. [Delivery report](GITHUB-DELIVERY.md). Inspector checkpoint cc52c80795ff9696297309b836d651b35492a4e7 was subsequently published and its remote HEAD/main verified; GitHub reports zero statuses, check runs and Actions runs for that commit. At report preparation the later offline-instrument increment push/readback is pending. Consult subsequent receipts under `.repro-runs/delivery/` to establish actual remote commits; a successful local test is not a CI result. No GitHub Actions workflow is configured. No hosted runtime was deployed.

Raw traces/screenshots/VM files and private machine configuration stay local and ignored. Local evidence links require this workspace. Earlier observations remain in Git history and [completion audit](COMPLETION-AUDIT.md), [historical independent review](INDEPENDENT-REVIEW.md), [historical security review](SECURITY-REVIEW.md), [historical visual review](VISUAL-REVIEW.md) and [pre-implementation HCI review](HCI-REVIEW.md). Failed red tests and harness diagnostics are retained alongside green results, not silently reclassified.
