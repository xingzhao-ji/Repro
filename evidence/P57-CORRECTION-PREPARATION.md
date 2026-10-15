# P57 correction preparation — 2026-10-15

This is local implementation and offline verification. No browser, Docker, acceptance, publication or permission change was performed. The failed P390 pilot remains sealed: 12 source-complete unresolved observations, 45 unattempted occurrences, zero accepted occurrences, and a failed zero-observed-zombie gate. Its final receipt SHA-256 is `ef3334047d4dd4f1ba4b5e2a243d101f9a45b94f921e0032dba0e3dab9bab955`.

## Narrow CSS correction

Commit `b48c69672f35d4b51db3325eb2d7a212ec68bcc6` adds only `.reduction-workspace > .panel.trial-inspector { box-shadow: none; }` to `web/style.css`. Retained paint evidence identified that inspector's blurred shadow as the sole unsupported effect blocking the sampled history-text witnesses; no actual overlap or contrast failure was established. The shared shadow token and history-panel styles remain unchanged. Removing this dependency is a source correction, not a new rendered contrast result.

The focused study-builder tests passed 15/15. The new frozen study is `.repro-runs/hci-comparator/p57-inspector-shadow-none-20261015T031400Z-b7541c83`. Its P HTML SHA-256 is `a7c31a08d5a0cb23a40dbee32ccc1b928c78c80a1fd665ba5247cd15837d245f`; both scripts and embedded canonical evidence match the old P. The difference is the added CSS rule and corresponding CSP style hash. Static identity continuity covers all 57 occurrences; none has been rendered or accepted for this candidate.

## Bounded lifecycle diagnostics

`scripts/lifecycle-diagnostics.ts` is an opt-in, I/O-injected helper with no import-time effects. It records shutdown phases, bounded process-read timing, and at most 128 task-stat attempts at the first observed zombie. It checks leader PID/start-tick identity before and after task inspection, preserves uncertainty and failures, and never retries inspection on a later zombie. It neither filters zombie observations nor changes process states.

The limits are 32 phase events / 16 KiB phase data, 128 KiB for all new metadata, and the original shared 4 MiB telemetry ceiling including completion. Original 100 ms sampling, process fingerprinting and awaited close operations are preserved in separate task-owned caller copies. These copies add read-only context counts and an explicit missing/invalid-preload failure. Original source inputs remain untouched. This helper is not enabled in the general application or test runner.

A stored completion record is explicitly provisional: it cannot certify the success of its own final write or close. The copied sampler emits reserved exit code 86 on final diagnostics failure, preserving the original source exit separately. Future acceptance must verify actual completion I/O and external exit in addition to every original gate. Source result status, a complete-looking JSON file, or instrumentation tests alone cannot establish valid runtime closure.

The retained 417-sample offline replay preserves all 284,936 raw bytes exactly, including the one zombie observation at sample 414. With 32 synthetic phase events, two task-count fixtures consume 58,941 bytes (2 tasks) and 94,983 bytes (128 tasks) of metadata. All 115 expected changed/terminal read-bound records and 997 process bounds are retained. Added times and task records are synthetic; these figures establish capacity for those fixtures, not live overhead, headroom or lifecycle correctness.

## Verification and evidence

Final focused checks passed: 43/43 helper regressions, 16/16 mocked caller checks, strict TypeScript checking and scoped ESLint. The independent reviewer also passed seven targeted offline challenges. The CSS builder tests passed separately at 15/15. These are preparation checks, not browser acceptance. The initial lint failure and every earlier test attempt remain retained.

Task artifacts live under `.repro-runs/cloud-continuation/contrast-p57-correction-preparation-v1/`. `css/RESULT.md` and `css/candidate-static-bindings.json` describe the candidate. `instrumentation/` contains the caller copies, bundle, source diffs, reproduction script, provenance and focused test receipts. `review/` contains the independent contract and reviews. Initial failing attempts are retained, including the distinction between missing implementation, corrected fixture/API expectations, and actual implementation defects.

The final focused verification and caller hashes are recorded in this task's `RESULT.md` and `final-receipt.json`. Generated candidate/caller artifacts remain ignored local evidence; the helper, regression tests and this report are version-controlled separately from the CSS commit. Preexisting unrelated work is preserved.

## Remaining condition

No evidence-backed lifecycle correction or valid runtime path has been established. Instrumentation preparation does not meet that prerequisite, so another acceptance sequence remains blocked. The next justified step must resolve that lifecycle condition and review the new candidate's exact input bindings before any newly authorized runtime. All 57 occurrences require fresh verification for the changed CSS candidate.

The existing 128-task, 1 GiB, 2 CPU, deadline, telemetry, zero-zombie, browser-control, exact-identity, selection, artifact-closure and cleanup gates remain unchanged. Native zoom, actual screen-reader workflow, broader browser acceptance and other existing release gates retain their separate unresolved status.
