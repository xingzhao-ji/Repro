# Browser resource diagnosis — 2026-10-14

The full browser baseline remains **22 passed / 9 failed of 31**. The CLI demo and both HCI comparators passed separately; no full release pass is claimed. New focused diagnostics ran 17 tests: 13 passed, four failed, zero skipped. Eight new nonbrowser diagnostic regressions, typecheck and scoped lint passed.

| Focused job | Passed / tests | PID peak / limit | Local PID-limit events | Final zombies |
|---|---:|---:|---:|---:|
| Adapter | 9 / 10 | 128 / 128 | 2 | 18 |
| Core flow | 0 / 2 | 128 / 128 | 980 | 91 |
| Recovery | 4 / 5 | 112 / 128 | 0 | 20 |

Adapter telemetry records local PID enforcement one millisecond before its browser EAGAIN message. At that sample, eight zombies and 120 other visible threads account for the 128-task limit. The core run has 41 top-level launches/exits with maximum overlap one; local enforcement begins with 36 zombies plus 92 other visible threads. All 40 benchmark attempts ran: 22 matched, then 18 were inconclusive. Thus sequential top-level browser shutdown alone did not prevent adopted zombie accumulation. All memory/OOM event counters remained zero.

After record-worker termination, four recorded descendants (esbuild 41 and Chromium 53/56/57) were Z-state, reparented to PID 1, with stable start ticks. They remained after cleanup signals. This recovery failure occurred without PID saturation; it failed before ledger recovery/retry. Reduce/export interruption checks passed their recorded-identity scope; they do not establish whole-container absence. The five earlier UI startup failures remain diagnosed from saved logs and were not rerun here.

The reversible patch affects only `tests/recovery.browser.ts`, `tests/helpers/owned-process.ts` and `tests/owned-process.test.ts`. It records current parent/state, retains zombies as residue, fails closed for unknown ownership/inspection errors, and verifies post-cleanup absence while preserving primary failures. It does not repair production reaping or weaken the original no-residue assertion.

The first probe attempt produced no telemetry because Node loads `--import` in its existing test child, not the PID1 runner. That failed diagnostic attempt is preserved. A local activation check justified the corrected child guard; the separately frozen second attempt produced complete bounded telemetry without an extra process. No original evidence was overwritten.

Chromium sandboxing, the approved external f590f8… profile, cached image, 128-PID/1GiB/2CPU limits, network-none isolation and read-only source remained unchanged. Init stayed unset. The original active security profile remains 949b87…. Across both focused batches, all five started test containers, two never-started transfer containers and four volumes were removed. All input archives preserved 3,764 regular files and ten confined symlinks per batch. Production source/build is unchanged.

The next proposed experiment needs explicit runtime-scope approval: add only Docker `--init` for one sequential adapter/core-flow/recovery batch, retaining 128 PIDs and every other limit. This introduces Docker's managed PID1 reaper and managed read-only init binary mount; it has not been run. No PID increase is requested or implied by that experiment, and init alone is not proven sufficient for overlapping browsers.

Detailed local evidence is under `.repro-runs/cloud-continuation/failure-remediation-v1/`: `RESULT.md`, `diagnostic-summary.json`, `proposed-init-experiment.json`, per-job independent reviews and cleanup receipts. The patch regression report is under `recovery-diagnostics-repair-v1/`. The original full baseline remains under `release-verification-v3/`.

Release gaps still include the failed workflows, full repeatability, reduction minimality, fresh installation, native zoom, actual screen-reader use, incomplete contrast and Recorded events keyboard traversal, broader cases and separately authorized human research. No new publication, persistent security change or paid service was used.
