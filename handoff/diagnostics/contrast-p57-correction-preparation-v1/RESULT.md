# P57 local correction preparation

Status: **LOCAL_PREPARATION_COMPLETE — ACCEPTANCE_BLOCKED**. No browser, Docker or acceptance sequence ran. No publication, credential/security change, resource increase or paid service occurred. The original failed pilot and all prior sealed evidence remain unchanged.

Two separate local commits on `cloud/hci-comparator-redaction` record the work:

- `b48c69672f35d4b51db3325eb2d7a212ec68bcc6`: remove only the trial-inspector decorative shadow.
- `93b0cc455d95032a305ca7cbd13bf989eec6fe25`: bounded lifecycle helper, 43 regression cases, evidence report and the new STATE section. The preexisting 48-line STATE delta and three unrelated evidence files remain uncommitted and preserved.

The index is clean, and the committed CSS/helper/test/report bytes match the checked files. See `root-git-checkpoint.json` and `root-selective-staging.json`.

## CSS result

The single selector `.reduction-workspace > .panel.trial-inspector { box-shadow: none; }` removes the sole unsupported shadow identified by retained paint diagnostics. No actual overlap or low-contrast failure was proved. The history-panel/shared-token styling is unchanged.

Study-builder tests passed **15/15**. The new candidate is `.repro-runs/hci-comparator/p57-inspector-shadow-none-20261015T031400Z-b7541c83` relative to the repository root. P HTML SHA-256: `a7c31a08d5a0cb23a40dbee32ccc1b928c78c80a1fd665ba5247cd15837d245f`. Both scripts and embedded canonical evidence are unchanged; only the new CSS rule and CSP style hash differ. All 57 static occurrence identities remain bound. This candidate has **zero new rendered measurements or accepted occurrences**. See `css/RESULT.md`, `css/candidate-static-bindings.json` and the CSS independent conclusion.

## Diagnostics result

The opt-in helper records bounded shutdown phases, context counts, process-read bounds, and first-observed-zombie task information, with PID/start-tick checks before and after task inspection. It retains original raw zombie states, 100 ms sampling and awaited close ordering. Absence, malformed data, PID reuse, read failures, truncation and I/O failures remain explicit and non-accepting.

The unchanged ceilings are 32 phase events / 16 KiB phase data, 128 KiB all new metadata, and 4 MiB raw-plus-metadata-plus-completion. Task-stat attempts are limited to 128; there is no later-zombie fallback. Stored completion is provisional. Final sink/close failure forces reserved exit 86, preserving the source exit separately, and cannot be certified by the completion file itself. The caller copies are task-owned preparation artifacts; their new candidate bindings are still pending. The general product runner is not activated with this helper.

Final source hashes:

| File | SHA-256 |
| --- | --- |
| `scripts/lifecycle-diagnostics.ts` | `3302fb8d7e71f7773f42d504449bc0a7f2ee44174925322e28d62e8c00ebae0e` |
| `tests/lifecycle-diagnostics.test.ts` | `4dbdc1add203cd11eff4dae163d70446190f2aa111a4e1f9a42530f73052572b` |
| `instrumentation/lifecycle-diagnostics.mjs` | `81fb8e00e358d2e397abed50fb1c05cc710e1ff6a2cb85d5816e2f74ca6acc23` |
| `instrumentation/resource-probe.mjs` | `a37e90a97c8633f52c89b979df11f33596a6d766ea58ec8cde57c84952261904` |
| `instrumentation/contrast-p57-instrumented-batch-probe.mjs` | `487238261ce33406f1340aa1617936780d870f7d8c5e0d1cc028fbbc92a06ded` |

## Actual verification

- Final helper regressions: **43/43 PASS**, zero skipped; `root-final-focused-tests.json` and `.log`.
- Strict TypeScript check and scoped ESLint: **PASS**, both exit 0; `root-final-typecheck.json` and `root-final-scoped-lint.json`.
- Actual copied sampler evaluated in a mocked VM, plus extracted probe call-site checks: **16/16 PASS** against the final helper bundle; `instrumentation/tests/caller-integration-final-source-receipt.json`. This is not a full browser-probe run.
- Independent injected-I/O challenges: **7/7 PASS**, with final source review clearing only this local preparation checkpoint. See `review/`.
- Offline retained replay: all **417 samples / 284,936 raw bytes** preserved exactly, including the failed pilot's one zombie observation. It retains 115 read-bound records / 997 process bounds. Metadata is **58,941 bytes** with 2 synthetic tasks and **94,983 bytes** with 128 synthetic tasks, each with 32 synthetic phase events. Supplemental timings and task records are simulated. The capacity receipt predates the final typed-declaration-only lint correction; independent review establishes that exact source delta, while final helper/caller tests bind the final bytes. No live overhead or universal future headroom is inferred.

Initial missing-module RED, the first 36/41 run, justified fixture/API corrections, the completion self-attestation counterexample, initial caller failures, and the two redundant-assignment lint errors are preserved. Final checks do not relabel those attempts as passing. Original sampler failure causes and primary close-error identity are covered explicitly.

## Remaining blocker

No evidence-backed lifecycle correction or valid runtime path has been established. Instrumentation alone does not satisfy that prerequisite; **do not start another acceptance sequence from this checkpoint**. The next justified work must resolve the lifecycle condition and review exact new-candidate/runtime bindings. Every one of the 57 candidate occurrences then needs fresh measurement under the unchanged gates.

The sealed pilot remains 12 unresolved / 45 unattempted / zero accepted, with its zero-observed-zombie gate failed. The existing 128-task, 1 GiB, 2 CPU, 90 s internal / 120 s outer job deadlines, 75 s continuation threshold, 896 MiB kernel-peak threshold, original controls, artifact closure, cleanup and broader release gates remain unchanged. No decision to increase resources, weaken a gate or retry an inconclusive batch was made.

`final-receipt.json` binds this result, local commits, reviewed deliverables and final checks. The separate tracked summary is `evidence/P57-CORRECTION-PREPARATION.md`.
