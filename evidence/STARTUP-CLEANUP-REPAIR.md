# Startup cleanup repair checkpoint

The worker repair passes final prerequisites on the content identities in [the verification receipt](startup-cleanup-verification.json): **382/382 ordinary tests and 50/50 functional browser tests**, plus full TypeScript, lint, build and starter-kit checks. The browser selection consists of 15 affected checks and 35 remaining functional checks; the eight accessibility-focused/mixed scenarios remain deferred and were not executed. Execution inputs were hashed before and after the final ordinary and browser runs and did not change.

The original three product cleanup assertions now pass. Rejected acquisition alone still cannot authorize deletion. A fixed worker can certify zero process-creation attempts only after execution drains, creation is sealed, and the parent observes timely natural successful worker completion. Acquired contexts require a fresh supported close acknowledgment as well. Attempted creation without that acknowledgment, detached/reparented writers, late completion, malformed receipts and owner-budget expiry retain the profile. No native helper, subreaper, Endpoint Security integration or new security permission was installed. The implementation is trusted registered-browser lifecycle handling, not arbitrary native descendant containment or reaping.

Before/after evidence is retained under ignored `.repro-runs/`:

| Regression | Failing evidence | Passing evidence |
| --- | --- | --- |
| Original cleanup assertions | `startup-repair-20261016/baseline-focused.log`, `baseline-browser.log` | `ordinary-worker-v2.log`, `affected-browser-worker-v1.log` in the same directory |
| Callback cancellation before browser acquisition | `startup-repair-20261016/reset-cancel-red.log` | `reset-cancel-green.log` and final ordinary suite |
| Mutable output path deleting another profile | `startup-prerequisites/finalizer-path-red.log` | `finalizer-path-green.log` and final ordinary suite |
| Bundled dependency capture before the fence | `worker-boundary/build-order-red.log` | `build-order-green.log` and final ordinary suite |
| Already-disconnected context with live detached writer | `startup-repair-20261016/acquired-disconnected-red-v2.log` | `startup-worker-migration-v3.log` and final ordinary suite |
| Mutable requests, impossible conclusive receipts and client timeout lifetime | `worker-boundary-diagnostics/client-red-v2.log` | `client-helper-green.log` and final ordinary suite |

The first worker ordinary run was368/369 because a test-only readiness wait expired under concurrent source-worker startup. Its log remains preserved. The two new pending-acquisition tests now control the remaining operation clock after worker readiness and verify real100ms/180ms deadline/acquisition ordering plus the unchanged2,000ms parent completion limit. The original real100ms browser criterion is unchanged. All original test scenarios and assertions remain, with fault injection moved inside controlled workers; no historical failure or retained profile was removed.

A safe parent-revision comparison also showed why immediate deletion was insufficient: the old100ms test passed, but its profile later reappeared. That snapshot and observation remain under `startup-repair-20261016/parent-3e1b2b7/`. Launcher exit and process-group absence are not descendant completion.

Fresh installed-package, native workflow/stability and Linux arm64 acceptance are pending at this checkpoint. The original htmx fixed repetition15 shutdown failure remains preserved and causally unresolved; a green new sample alone cannot repair that historical explanation. Prepared passive diagnostics will distinguish request disposal, direct-child exit/stdio close and Playwright close settlement. Accessibility remains deferred. This checkpoint makes no deployment, remote CI, publication, universal determinism or broader application-support claim.
