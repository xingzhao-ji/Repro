# Minimal lifecycle diagnostic — 2026-10-15

One real Chromium lifecycle completed under the existing approved boundary. It launched one browser, one explicit context and one inert `about:blank` page, evaluated its location/readiness, then awaited context and browser close. No product page, contrast case, retry, added dwell or acceptance batch ran.

The independently frozen validator returned `COMPLETE_MINIMAL_ZERO_OBSERVED_Z`, exit 0, with no issues. All five raw samples contained zero zombies. Normal browser close logged browser-process exit 0 with no forced-close fallback. Terminal telemetry contained only init and Node. The driver took 0.9090273579931818 seconds; source operations took 259.8092 ms. Peak usage was 70 tasks and 157,011,968 bytes (149.74 MiB), with no PID, memory or OOM events. All 178 input files matched before and after, and cleanup verified zero remaining owned containers/volumes. The transfer container was never started.

## What this establishes

The literal **sampled** zero-zombie criterion is technically achievable in this runtime: this completed minimal execution is a witness. It does not establish that every intermediate kernel state was non-zombie. Context close took 6.204042 ms and browser close 37.052376 ms. All five samples retain their process-read bounds, and **neither close interval overlaps any recorded sampler process-stat read**; both fit between sample 3 and terminal sample 4. No first-zombie task inspection occurred. This is a concrete observation gap, not an inferred reaping mechanism or proof of a product defect.

The source and library review found no missing await in the normal browser-close path. The retained Playwright bundle waits for process close and cleanup. These source facts and this minimal nonreproduction do not explain the original pilot's observed `Z` leader with two threads. There is no demonstrated lifecycle correction and no proof that the original P390/P57 workload will satisfy the unchanged gate. The original pilot remains sealed at 12 unresolved observations, 45 unattempted occurrences and zero accepted occurrences, with its zero-observed-zombie gate failed.

## Bounds and verification

The experiment retained 128 tasks, 1 GiB, 2 CPUs, 90-second internal and 120-second outer deadlines, 100 ms scheduled sampling, the original 75-second/896 MiB interpretive thresholds, network isolation, read-only root/inputs, sandbox, existing init, bounded Node pools and the exact approved image/profile. The scheduled sampling interval is not a guarantee of real-time execution; the first interval sample occurred about 370 ms after the start sample during startup.

The source-summary maximum of 16 KiB was reserved inside both the existing 128 KiB new-metadata limit and shared 4 MiB telemetry limit. Before launch, review corrected a task-only admission-accounting gap that otherwise would have treated that summary as extra allowance. The tested helper bundle stayed unchanged. Actual new metadata was 5,526 bytes and all diagnostic files totaled 11,754 bytes. Completion remained explicitly provisional until independent checks verified final I/O, external exit and exact bytes.

Preparation passed 47 focused offline checks, including deadline races and exact budget boundaries, plus 12 independent validator challenges. These are separate from the actual five-sample runtime result. No security/permission change, increased limit, publication or paid service occurred. Runtime versions were Node `v24.21.0`, Chromium `156.0.8078.4` and reported kernel release `6.18.44`; a release string does not identify exact running kernel source/configuration or the reaper.

## Remaining scope decision

There is no access denial or permission blocker and no evidence-based need for a criterion waiver. The remaining blocker is evidence about the original workload. If diagnosis continues, the distinct next scope is **one frozen, workload-matched capture of the original stopped P390 pilot with the tested shutdown instrumentation**, solely to seek causal shutdown evidence under the unchanged gate. It would preserve the old pilot's evidence and workload identity, use one fresh container and no retries, and stop after that diagnostic rather than cycle through 57 acceptance cases. Exact input/summary-budget/driver bindings and independent review must precede that separate runtime. This report neither authorizes nor claims that capture. No further minimal rerun is justified by this result.

All artifacts are retained under `.repro-runs/cloud-continuation/lifecycle-resolution-diagnostic-v1/`. Read `RESULT.md`, `root-postrun-validation.json`, the independent `review/` reports, and `runtime/cleanup-receipt.json`. Root validation output SHA-256: `ec472e16c66f527e909fc248164e0e86bc1c31572c6d0688c665928396019572`.
