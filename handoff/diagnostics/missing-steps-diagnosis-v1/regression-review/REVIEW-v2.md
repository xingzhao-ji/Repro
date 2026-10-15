# Revised independent regression scope

The original review and plan are retained and were never executed. Parent review correctly separates a conservative reducer diagnostic from an outcome correctness defect: the current reducer still rejects the incomplete experiment, preserves raw linked evidence, and leaves minimality unverified. No reducer patch is requested by this review.

The separate contract audit reports the actionable structural issue: `schemas/run-result-v1.schema.json` requires a SHA-256 application digest on all results while actual unstarted adapter evidence legitimately carries an empty string. The schema patch and red/green test belong to the assigned schema agent, not this reviewer.

`PLAN-v2.json` and `run-diagnosis.mjs` record three real guarded preflight-through-reducer checks and one invalid dependency control. They use the frozen original candidate, distinguish structural validity from adapter support, preserve exact raw evidence, explicitly retain the conservative original trial reason, and make no synthetic target-failure observations. No execution has occurred at preparation time. The unchanged oracle and fixture are inspected but not modified or bypassed.
