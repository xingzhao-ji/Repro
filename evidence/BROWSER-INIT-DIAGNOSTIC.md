# Approved init diagnostic — 2026-10-14

The explicitly approved `--init` batch passed **16/17 focused tests**, with one failure and zero skips. The same focused files previously passed 13/17 without init. The older complete suite remains 22/31; these results must not be combined into a new full-suite tally.

| File | Passed/tests | Kernel PID peak/cap | Local PID-limit events | Final zombies |
|---|---:|---:|---:|---:|
| Core flow | 2/2 | 98/128 | 0 | 0 |
| Recovery | 5/5 | 116/128 | 0 | 0 |
| Adapter | 9/10 | 128/128 | 18 | 0 |

All 40 benchmark repetitions now match their expected outcomes: 20 buggy target failures and 20 fixed requirement-satisfied outcomes, each with one unchanged assertion. Reduction and fixed reduced replay pass. Minimality remains unverified because ten reduced-neighbor attempts fail the supported-boundary preflight with `MISSING_STEPS`, not because of browser resource errors. Their generic trial wrapper describes an identity mismatch when the app identity was never established before preflight rejection.

Interrupted recording now passes actual descendant absence, ledger recovery, deduplication and fresh retry. All eight captured descendants disappear before test cleanup. The retry observes the intended failure with one assertion. Reduce/export interruption checks also pass their recorded-identity scope.

The adapter's intentional two-browser cancellation workload still exceeds the 128-task bound. The inner page crashes before `request-issued`, so its abort callback, unrelated-browser liveness and next replay checks are not reached. Local PID rejections occur with no accumulated zombie residue. The kernel records a peak of 128 while the 100 ms sampled current maximum is 121; distinguish those measurements. This remains a capacity failure; cancellation classification was not exercised by that test.

`docker-init` was observed at PID1 in each container. All three jobs end with zero sampled zombies and zero memory/OOM events. Application/test semantics, browser flags and fixture bytes were unchanged. The previously approved image/profile, sandboxing, nonroot user, network-none isolation, read-only source/root, dropped capabilities, no-new-privileges and all resource/time/log limits stayed fixed. No PID increase or other security/access change occurred.

All four owned containers, including the never-started transfer container, and both volumes were removed. The before/after input archives match 3,764 files and ten links. Independent review verified 262 new regular artifacts and preserved earlier evidence. The prior Library ZIP remains the earlier report archive; no new external upload occurred.

Detailed reports and receipts are under `.repro-runs/cloud-continuation/init-diagnostic-v1/`: `RESULT.md`, `diagnostic-summary.json`, `independent-final-review.json`, per-job resource reviews and `cleanup-receipt.json`.

The capacity failure stops this bounded batch. A read-only feasibility review identifies precompiled test execution as a possible next ordinary engineering step to remove runtime tsx/esbuild overhead at the same limit. It is unimplemented and untested; it requires truthful new harness identity, fixed assertion/fixture identities, mirrored fixture paths and loader-neutral subprocess fixtures. No acceptance check may be omitted to reduce resource use.

Remaining gates include that adapter scope, five earlier UI failures not retested under init, a current complete suite, reduction minimality, fresh package installation, native browser zoom, screen-reader use, contrast/Recorded events keyboard gaps, broader cases and separately authorized human research.
