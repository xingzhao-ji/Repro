# Compiled browser runner investigation — 2026-10-14

Compiled test launching is implemented and verified, but the overlapping-browser capacity failure remains. Three separately frozen configurations each pass **16/17 focused tests**: adapter 9/10, core flow 2/2 and recovery 5/5. No test is skipped or cancelled. The broader continuation gate stays closed; this is not a new full-suite result.

| Frozen configuration | Adapter kernel task peak / cap | Local PID-limit events | Final nonbrowser tasks in adapter sample | Core / recovery kernel peaks |
|---|---:|---:|---:|---:|
| Compiled JavaScript, ordinary Node test subprocess | 128 / 128 | 5 | 18 | 89 / 100 |
| Compiled JavaScript, one direct Node test process | 128 / 128 | 6 | 12 | 85 / 91 |
| Direct runner, V8/libuv pools of one | 128 / 128 | 12 | 6 | 79 / 83 |

These are three individual diagnostic configurations, not a statistical performance comparison. Their PID-event counts do not measure how many additional slots would be sufficient. Kernel peaks must not be replaced by the lower 100 ms sampled current values. Each job ends with zero sampled zombies and zero memory-limit/OOM events.

## Implemented change and regression evidence

`tests/helpers/test-runtime.ts` selects the child runtime from the actual calling module URL. Source `.ts` tests retain their explicit tsx loader; emitted `.js` tests use plain Node and resolve their child modules from the caller's location. The adapter's missing-browser subprocess and recovery's abrupt-interruption worker retain their separate processes, arguments, environment behavior, fault injection and assertions. The benchmark records its actual TypeScript/JavaScript module format.

The old source-only launching behavior passed two source cases and failed both compiled cases. After the repair, all six new runtime/metadata regressions plus eight process-ownership regressions pass. The same 14 regressions pass against actual emitted JavaScript. Whole-project type checking and scoped lint pass, and the full source nonbrowser suite passes **449/449** with zero failures/skips/cancellations.

The two additional runner configurations live only in ignored diagnostic plans. Single-file `--test-isolation=none` changes the Node process/error/argv boundary while keeping one file per fresh sandboxed container. Paired nonbrowser fixtures verify success/failure reporting, exact preload activation and independent child processes. Pool settings reduce background concurrency, changing I/O/compression/crypto scheduling; paired async filesystem/crypto fixtures retain completion and deliberate-failure behavior. `UV_THREADPOOL_SIZE=1` inherits into explicit Node children; the runner's `--v8-pool-size=1` flag does not. The separate CLI demo configuration was left unchanged and was not run.

## Behavioral findings

Every variant completes all 40 benchmark attempts: 20 buggy target failures and 20 fixed requirement-satisfied observations, each with one unchanged assertion. Reduction removes two noise actions, preserves the target failure in repeated accepted trials, and passes the reduced fixed replay. Minimality remains **unverified**: ten neighbor attempts fail supported-boundary preflight with `MISSING_STEPS`, with zero browser assertions.

All three recovery configurations pass their five tests, including recorded descendant absence, ledger recovery, deduplication and fresh retry. The assertions and cleanup diagnostics were retained.

The failing adapter test never reaches `request-issued`, so its abort callback, unrelated-browser survival assertion and next fresh replay are not exercised. The final configuration's run `faa6d0cc-df7f-4ca1-aaec-c83d1efedc26` records zero assertions and a reset event only; its retained trace shows `BrowserContext.newPage` failing with `Target crashed`, alongside local PID enforcement and Chromium thread-creation errors. This does not establish a cancellation-classification defect. The separate cancellation-after-assertion control passes.

## Provenance and remaining scope

Compilation uses the existing pinned TypeScript 6.0.3 compiler, strict NodeNext settings and `noEmitOnError`, with no install or download. Host compilation uses Node 24.19; container execution uses the existing image's Node 24.21, Playwright 1.64.0 and Chromium 156.0.8078.4. All 60 emitted files are hashed; 56 non-web JavaScript files are staged. Original web source, dist bundles, fixtures, dependencies, security policy and frozen comparator packet retain their bytes. Generated web JavaScript is excluded to preserve comparator build resolution.

The actual emitted harness is `c432e782cad9d9ceb3601778707c8b1b1cc0c4546864e29be9a1eb3140580838`; the assertion remains `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`. Runtime pool/runner settings are recorded separately in each plan and telemetry; matching harness digests do not make those configurations identical.

All jobs retain approved init, enabled Chromium sandboxing, nonroot UID/GID, network-none, read-only root/input, dropped capabilities, no-new-privileges, private namespaces, two CPUs, 1 GiB memory, 128 PIDs, 256 MiB shm/tmp, and the 120-second/4-MiB job bounds. No source production logic, browser launch option, assertion or deadline was changed. There was no publication or external upload.

All 12 owned containers and six volumes across the three configurations were removed. Independent audits verify 784 regular artifacts, input archives matching 3,824 files and ten confined links per variant, and preserved prior evidence. No diagnostic job remains running.

Eight wider browser jobs (14 tests, including the five previously failing UI scopes) and the separate demo remain **unrun** in each new configuration because the focused capacity gate failed. The old full-suite 22/31 result remains a historical checkpoint and is not recomputed from these subsets. Current full-suite/package verification, reduction minimality, native zoom, actual screen-reader use, incomplete accessibility findings, broader cases and human research remain separate unverified gates.

Exact commands, source patch, compiler provenance, runtime receipts, artifacts and independent reviews are under `.repro-runs/cloud-continuation/compiled-test-development-v1/`; start with `RESULT.md`. Further work needs a reviewed strategy for the unchanged two-browser acceptance workload at 128 tasks. None of these failed configurations is adopted as a verified capacity fix.
