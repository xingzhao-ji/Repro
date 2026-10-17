# Repro 0.1.0 practical beta — release verification

**Verdict: every supported acceptance gate passed on native macOS arm64 and fresh isolated Linux arm64.** The evidence is tied to release commit `65e6003235b553e2820ac7e0949407b0a1fe61ce` (tag `v0.1.0-beta`) and to the exact release tarball below. Accessibility remains deferred and unverified, as the owner directed. Independent automated code review of the three fixes did not complete; see [Review](#review). Nothing is deployed.

## Release identity

| Item | Value |
| --- | --- |
| Release commit | `65e6003235b553e2820ac7e0949407b0a1fe61ce`, tag `v0.1.0-beta`, on branch `release/practical-beta-0.1.0`. This report is in a later documentation-only commit |
| Package | `repro-local-0.1.0.tgz`: 1,495,621 bytes, 189 entries |
| SHA-256 | `f2282cda6de110eb5d0873520c2d42c67fa4cf0a8b0f5d10227fa1d151c8e546` |
| npm integrity | `sha512-KwUIWjbk2XPN8QuQJWOQtNANNMmEJnvEAKiGvakIMBCMlBBek+Db1bNZSPufTeNhbNmbA5UTsDXP0H30hZby9Q==` |
| Lineage | Accepted implementation `9aec7fe`, plus cleanup-basis diagnostics (`1ae6ffc`, merged in `520bde5`), plus fixes `67a3c3a`, `8b6ad9a` and `db0495c`, plus documentation |
| Environment | Node 26.7.0, npm 11.19.0, Playwright 1.64.0 with pinned Chromium 156.0.8078.4, macOS arm64 (14 cores) |
| Linux | Task-owned Colima profile `e` (VZ, 2 CPUs, 3 GiB): daemon `ad0afe52…`, Docker 29.5.2, approved policy `949b87f7…` |

`npm pack` of the release commit is deterministic: two packs and the package smoke's own pack produced identical bytes.

Machine-readable receipts are [practical-beta-release-native.json](practical-beta-release-native.json) and [practical-beta-release-linux.json](practical-beta-release-linux.json). They bind every cited file by path, size and SHA-256. Raw evidence is local under ignored `.repro-runs/practical-beta-release-rc5/`, with the failed cohorts preserved beside it.

## Native macOS arm64 gates (cohort rc5, commit `65e6003`)

| Gate | Result | Budget |
| --- | --- | --- |
| Kit, strict typecheck, lint, build | Passed | — |
| Ordinary tests | **409/409**, 0 skipped | — |
| Functional browser tests | **17/17** affected, including 2 new Ctrl-C regressions; **35/35** remaining. The 8 accessibility-focused or mixed scenarios are deferred | — |
| Package smoke from the release tarball | **15 commands** passed; packed tarball byte-identical to the release tarball | — |
| Installed schema-3 (three cases) | **18/18** operations | 30 s capture/replay |
| Native workflow (installed CLI) | **15/15** measurements. Capture/replay 0.51–0.56 s, reduce 1.5–2.5 s (morphdom 3→2 in 7 executions, htmx 2→2 in 4, Marked 3→3 in 7), verify 0.84–0.94 s, export 0.20–0.21 s, peak RSS ≤ 573 MiB | 30 s / 80 executions and 300 s / 15 s |
| Native stability | **120/120**: 20 buggy and 20 fixed per case, alternating; longest run 0.99 s | 30 s each, zero wrong outcomes |
| Independent native audit | 150 unique run IDs, 857 records, 132 frozen inputs, no timing findings | — |
| CLI cancellation (installed CLI) | **16/16**: synthetic and three cases × record/reduce/verify/export. Every sample exits 130 within 7–97 ms of SIGINT, passes the unchanged 5 s post-exit census, leaves no profile, and retries successfully in a new directory | ≤ 8 s after cancellation |
| Workbench journey (installed `serve`) | Three case journeys through the UI (capture, reduce, verify, export, refresh keeps selection); Cancel settled in 1,085 ms and the retry succeeded; authored schema-2 expectation; unknown-run recovery; no page errors. `serve` exited 0 on SIGINT, and 0 of 149 owned processes were alive 5 s later | 8 s cancellation |
| Exported regressions on a clean machine | **4/4** capsules (synthetic and three cases), each from a fresh directory with an empty HOME, fresh npm and browser caches and the capsule README's commands. Buggy fails its frozen assertion and fixed passes; `verify` compares both. Setup 16.5–19.1 s | 15 min clean setup |

## Fresh isolated Linux arm64 (cohort v5, commit `65e6003`)

The owner approved removing the six images retained from the passed `9aec7fe` Linux cohorts. They were removed by exact owner label; Docker also pruned their 48 untagged build-step parents. This cohort continues the same daemon session. Its first case chains to the passed Marked summary by hash.

| Case | Operations | Readable buggy / fixed | Capture / replay / reduce / export | Kernel peak | No-cache setup |
| --- | --- | --- | --- | --- | --- |
| morphdom-textarea | 44 | 20 / 20 | 0.70 / 0.69 / 3.26 / 0.28 s (3→2) | 313 MiB | 159 s |
| htmx-checkbox | 44 | 20 / 20 | 1.18 / 0.71 / 2.38 / 0.37 s (2→2) | 393 MiB | 177 s |
| marked-empty-heading | 44 | 20 / 20 | 0.91 / 0.80 / 3.93 / 0.38 s (3→3) | 504 MiB | 156 s |

**Totals: 132 operations, 144 unique runs, 132 unique containers, 0 recorded problems.** Every run had the restricted container boundary:

- unprivileged user, network none, read-only root, all capabilities dropped, no-new-privileges, approved seccomp policy;
- 2 CPUs, 128 tasks, 1 GiB memory, 256 MiB `/tmp` and `/dev/shm`;
- fresh volume, no host binds or socket, Chromium sandbox enabled.

The independent audit found **no findings across 7,191 file records** (`linux-audit-complete`). Before execution, the VM inspection verified the same daemon, empty containers and volumes, no host mounts, no agent forwarding and loopback-only listeners. At the end, the daemon had no containers or volumes.

The audit also closes the driver's quiet-listing blind spot. Every untagged terminal image must be in the recorded Parent chain of this cohort's own labelled images, rooted at the pinned public base. All 48 are.

- **Auditor provenance.** The auditor was generated from the hash-bound `acceptance-v1` template before any Linux result existed. Three later changes are recorded as diffs: v5b, v5c and v5d. The frozen v5 output is preserved: it reported incomplete because of a predecessor path outside the audited tree and the failed stop receipt.
- **Negative controls.** Run on disposable clones and compared with an unmodified clone baseline:
  - a one-bit log flip gives `DOCKER_LOG_HASH`;
  - an injected foreign image is rejected;
  - a forged live-hostagent stop resolution is rejected.
- **VM stop.** The VM stopped cleanly at 22:17:22Z (hostagent log), but `colima stop` exceeded its 180 s tool timeout. Its `limactl` child was blocked reading an iCloud-evicted file of another stopped profile. Restoring that 5-byte file let it exit naturally; no signal was sent. A separate read-only resolution verified the following, with the failed receipt preserved:
  - the profile is Stopped;
  - the hostagent and usernet are gone;
  - the socket is absent and Docker is unavailable;
  - the disks are retained.

## Budgets

All budgets are unchanged from [the frozen protocol](../benchmarks/PRACTICAL-BETA-PROTOCOL.md). Worst observed values across native and Linux:

| Budget | Limit | Worst observed |
| --- | --- | --- |
| Capture and replay | 30 s | 1.18 s |
| Reduction executions | 80 | 7 |
| Reduction time | 300 s | 3.9 s |
| Export | 15 s | 0.38 s |
| Clean setup | 15 min | 177 s |
| Container memory | 1 GiB | 504 MiB kernel peak |
| Cleanup | 5 s ordinary / 8 s cancellation | Every census passed; cancellation exits ≤ 97 ms after the signal |
| Stability | 20 buggy + 20 fixed per case per environment | 240/240 with zero wrong outcomes |

## How the release was verified

The release commit was exported with `git archive` into a directory outside the iCloud-synced Desktop. It then got a fresh locked `npm ci` with an empty cache, a build, and the pinned Chromium headless shell. Every gate ran there, against that exact tree and the tarball packed from it. The package smoke packs its own tarball from the same tree and must be byte-identical to the release tarball.

The installed-package, workflow, stability, cancellation, workbench and clean-machine gates all execute the CLI installed from that tarball. Before each workflow step, the driver checks that the installed `dist/` equals the built release `dist/`. The audit also recomputes every workflow command digest against the installed CLI's path.

Timing-sensitive gates start only on a host that is not oversubscribed: 1-minute load ≤ 10 and 5-minute load ≤ 14 on 14 cores, held for 60 s (3 minutes before the first gate). The load is recorded with every step. This chooses *when* to run; no budget or threshold changed. The cohort drivers are path-only copies of the accepted `acceptance-v1` drivers, with template diffs kept beside them, plus four new release drivers:

- `run-cancellation.mjs` — a CLI-written marker, then SIGINT to the CLI's own process group, then the unchanged measure harness;
- `run-workbench-journey.mjs` — the installed `serve`, driven by pinned Chromium;
- `run-independent.mjs` — a fresh directory, fresh HOME, npm and browser caches, and each capsule README's commands;
- `audit-native.mjs` changes — workflow command digests are bound to the installed CLI.

## Defects found and repaired during release verification

Each fix has a regression that failed on the earlier bytes and passes now. The red and green logs are under the release cohort's `tdd/` evidence.

1. **Terminal Ctrl-C killed the case worker.** The worker shared the CLI's process group and handled no signals. The parent therefore kept the profile and reported `CLEANUP_FAILED` (`worker=closed-before-cleanup`), although no process survived. Fix: spawn the worker detached, in its own process group ([ADR 0004](../docs/adr/0004-cancellation-signal-boundary.md)). Seen in 3/3 dry-run reductions and 5/5 group-signal probes; the new regression failed 2/2 before the fix.
2. **A cancelled `export` exited 2, not 130.** Regression red 3/3, green 3/3.
3. **A cancelled synthetic run could keep the CLI alive.** A fixture server that bound after finalization had already run was never closed. Seen once in cohort rc3: reduce, held for 330 s until the watchdog. The regression aborts during run-directory creation. Before the fix it failed 3/3, and its own test process hung; after the fix it passes 3/3.

## Preserved failed cohorts

None of these was replaced or relabelled. Each is preserved with its logs and its unrun remainder.

| Cohort | Commit | Stopped at | Cause |
| --- | --- | --- | --- |
| rc1 | `0c87677` | installed schema-3: 3 passed, 1 failed, 14 unattempted | morphdom fixed-revision `verify` returned `CLEANUP_FAILED` with `context-close=timeout`, profile retained. Host load 39–95 from another session's Unity/Blender work; every phase was 6–9× slower. Plausible contention, not an established cause |
| rc2 | `9bb9829` | ordinary 407/408 | A test-fixture readiness wait of 3 s expired under load (`profile-ready`). No product assertion ran. Same code passed 408/408 before and after |
| rc3 | `9bb9829` | CLI cancellation 14/16 | Defect 3 above (synthetic reduce), and one driver timing miss (synthetic verify finished before the signal) |
| rc4 | `ec91f9a` | clean-machine execution | A driver defect: its post-run walk entered generated `node_modules` symlinks, and it expected the registered-case command form for a synthetic capsule. It also exposed INSTALL.md presenting only the registered-case capsule commands; fixed in the release commit |

## Historical evidence

Before any change, the four tracked receipts for implementation `9aec7fe` were re-verified: native acceptance, prerequisites, the Linux three-case resume and the Claude handoff. All 82 files they reference directly matched their recorded size and SHA-256. A fresh `git archive` of `9aec7fe`'s bytes, with a fresh locked install, then passed:

- kit, typecheck, lint and a byte-identical build;
- 382/382 ordinary tests;
- the same 50/50 functional browser selection;
- all 113 package-input and 132 frozen-input identities.

Those results describe `9aec7fe`. They are cited as lineage only; every claim above comes from cohort rc5 and Linux v5 on the release commit.

## Review

An independent automated review of `67a3c3a`, `8b6ad9a` and `db0495c` was attempted four times with background agents. Every attempt stalled at the 600 s watchdog without output, so **no independent review of these three fixes is claimed**. The author's recorded self-review found nothing new in the fixes. It checked:

- orphan and census paths for the detached worker, and the container census, which reads every namespace process;
- certification predicates and retention, both unchanged;
- exit-code edge cases;
- late-resource paths in the synthetic adapter.

It found one inaccurate sentence in ADR 0004, which was corrected. The cleanup-basis diagnostics had two earlier rounds of automated review on their own branch. A SIGKILL-the-CLI probe found no orphans in 3 of 3 runs.

## Not verified and limitations

- **Accessibility is deferred and unverified.** That covers the 8 focused or mixed browser scenarios, native 200% zoom and actual screen-reader workflows. The historical Chrome route was not retried.
- **One physical Mac.** Linux arm64 ran on one task-owned VM on that same Mac. Linux amd64, Windows and other physical machines are untested.
- **Scope.** Only the synthetic search app and three pinned public cases are supported. Arbitrary or authenticated websites, databases and hostile code are out of scope; ordinary containers are not hostile-code isolation.
- **Minimality.** It is unverified in every case, and htmx and Marked are not reduced (2→2, 3→3).
- **Historical htmx failure.** The original repetition-15 `CLEANUP_FAILED` on an earlier build remains causally unexplained. rc1 recorded another `context-close=timeout` under heavy host contention. Both failed safe.
- **Timing gates.** Timing-sensitive gates ran only on a host that was not oversubscribed (load gate). Under the heavy load another session produced, rc1 and rc2 failed and are preserved.
- **Linux driver.** It still uses the quiet image listing. Only the release audit closes that blind spot.

## Deployment status

**Not deployed.** No hosting target has been agreed. The release is the tarball above plus source on the private GitHub repository `xingzhao-ji/Repro`, branch `release/practical-beta-0.1.0` and tag `v0.1.0-beta`, both non-force. `main` is unchanged. There is no npm publication and no GitHub Release object, and repository visibility is unchanged (private).

## Reproduce

```sh
git clone --branch v0.1.0-beta https://github.com/xingzhao-ji/Repro.git && cd Repro
npm ci --ignore-scripts && npm run build && npm pack --ignore-scripts   # same SHA-256 as above
```

Install and use the package as described in [INSTALL](../docs/INSTALL.md) and [USAGE](../docs/USAGE.md). The cohort drivers, kept with the raw evidence, are local path-only copies of the accepted drivers plus the four release drivers described above.
