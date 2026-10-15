# Approved corrected-CSS pilot — 2026-10-15

**Continuation stopped after one fresh pilot.** The user approved the exact prospective completed-cleanup criterion and 90-second driver threshold at 06:26 UTC (message `Sentinel_c0c1a97e7fc48191b9a0be45fd712492`). Those criteria were adopted for this run; no renewed approval was requested. Every historical failure retains its original criterion and verdict. The remaining four unique jobs were not started.

The corrected-CSS `p390-00-11` capture completed all 50 controls and all 12 selected observations. All 12 reported measured-pass, with no unresolved or measured-fail rows. They remain **provisional observations, not accepted batch evidence**, because the approved continuation contract did not pass. Across the 57-occurrence candidate, 12 were measured provisionally, 45 remain unattempted and zero are accepted through this sequence's aggregate gate. Source exit 0 alone is not acceptance.

| Gate or observation | Actual result |
| --- | --- |
| Unique starts / nonce | 1 / `7b4232475825` |
| Driver elapsed / threshold | **41.72000612 s / 90 s: PASS** |
| Internal / outer deadline | 90 / 120 s; neither expired |
| Observed kernel memory peak / gate | **943,087,616 B (899.3984375 MiB) / 939,524,096 B (896 MiB): FAIL** |
| Excess above planning headroom gate | 3,563,520 B (3.3984375 MiB); configured 1 GiB hard cap unchanged |
| Task peak / cap | 75 / 128 |
| PID, memory and OOM events | All zero; no OOM kill |
| Process samples / Z samples | 268 / samples 76 and 266; all retained |
| Approved completed-cleanup criterion | **NOT_ESTABLISHED: distinct natural post-close interval census absent** |
| Browser child / source-container exit | Normal browser exit 0, null signal / source-container exit 0 |
| Input integrity / owned cleanup | 3,614 files and 10 confined links unchanged; zero owned containers or volumes; transfer never started |

Final browser close settled with next sample index 267. Sample 266 occurred during close and contained a Z observation. Sample 267 is the terminal census, starting 21.028694 ms after settlement and containing only the original init PID 1 and Node PID 7. It is clean, but cannot serve as both required distinct observations. No sleep, extra sample, delayed sampling, forced termination or criterion change was introduced to manufacture a pass. This is missing required closure evidence, not proof of a surviving process leak.

The frozen validator returned exit 1, `CONTINUATION_GATES_STOP`, `continuationGate: STOP` and `diagnosticChecksComplete: false`. Its only distinct issue classes are `MEMORY_OR_HEADROOM_LIMIT` and `COMPLETED_CLEANUP_NOT_ESTABLISHED`. The memory issue repeats on 21 samples because the cgroup peak counter retains its maximum; these are not 21 independent resource events. Workload integrity, exact body/style/selection, artifact accounting and final owned-resource cleanup reported no issues. Source-level measured contrast does not override the two failed/unestablished continuation requirements.

The latest capture is substantially faster than the earlier original-CSS diagnostic, but the difference is not an isolated timing experiment or a proven optimization attribution. The new memory peak likewise does not identify the responsible allocation. No lifecycle fix, universal memory bound, continuous zombie absence or harmlessness of every transient is claimed.

Preparation retained all 57 canonical identities and the five-job order, all 50 controls per job, unchanged product assertions, 90-second internal and 120-second outer bounds, 128 tasks / 1 GiB / 2 CPUs, 896 MiB headroom gate, exact approved image/profile/sandbox/network and log/metadata caps. The only product change remains the earlier scoped inspector `box-shadow:none` rule. The harness retains existing natural sweep/read evidence throughout final close, without adding process reads or changing cadence. Necessary input/validator changes were independently reviewed before the one start.

Focused checks included 83 input/caller checks, authored cleanup/external/workload challenges, independent 32 cleanup and 38 external challenges, 69 static input and 143 semantic checks, and complete stage verification. Review corrected skipped-first-census and reversed-sweep false passes, old single-job assumptions and artifact-schema errors before freezing. These checks are preparation evidence, not additional browser runs.

Evidence is under `.repro-runs/cloud-continuation/contrast-p57-approved-execution-v1/`: `AUTHORIZATION.json`, `inputs/source-freeze.json`, `validator/author-freeze-v2.json`, `review/PILOT-READINESS.json`, `runtime/p390-00-11/`, and `postrun/p390-00-11/validation.json`. The executed validator SHA-256 is `83b78b9e928bc32419a84372f028a8ee7232ee256e2f8d7ff22b134b2e64e437`. Exact independent postrun findings and the sequence STOP decision are retained alongside those records.

Safe independent work closed the offline candidate build/package identity item; see [offline package verification](OFFLINE-CANDIDATE-PACKAGE.md). Release remains incomplete: the two pilot requirements, 45 unattempted candidate observations, the six original browser behaviors, broader paint uncertainty, native 200% zoom and actual screen-reader verification remain open. The original 31-test matrix stays 24 passed / 6 failed / 1 started-interrupted. No unchanged retry, later contrast job, permission change or publication follows from this result.
