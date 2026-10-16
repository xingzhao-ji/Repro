# Fresh native acceptance after startup cleanup repair

Implementation `9aec7fe` passes the startup cleanup prerequisites and fresh native macOS arm64 gates. **Practical-beta completion remains blocked:** fresh Linux verification awaits the requested VM credential approval, and the original intermittent htmx shutdown cause remains unresolved. Accessibility stays deferred.

The [machine-readable receipt](startup-cleanup-native-acceptance.json) binds source commit, runtime bytes, the actual `security/repro-chromium-seccomp.json` policy, logs and cohort receipts. Its builder revalidated 1,253 files. The prior [repair checkpoint](STARTUP-CLEANUP-REPAIR.md) retains the failing-before/passing-after evidence for the three original cleanup assertions and subsequent review regressions.

| Check | Fresh result |
| --- | --- |
| Ordinary tests | 382/382 |
| Selected functional browser tests | 50/50; eight focused or mixed scenarios deferred |
| TypeScript, lint, build, kit | Passed |
| Package smoke | 15 commands passed using host Chromium |
| Installed schema-3 v2 | 18/18 operations across three cases |
| Native workflows | 15 measurements; 30 actual browser executions |
| Native stability | 120/120 expected outcomes; 20 buggy/fixed pairs per case |
| Independent native audit | 150 unique run IDs; 132 frozen inputs; 854 records; no timing findings |
| Fresh Linux arm64 | Unrun; explicit VM guest host-key approval pending |

Raw evidence remains under `.repro-runs/startup-repair-20261016/acceptance-v1/`. The new native workflows and stability cohort are complete and separate from every historical failed cohort. They reuse existing workspace dependencies and pinned host Chromium; they do not establish clean-host or Linux portability. A clone without the ignored raw evidence cannot claim to have revalidated these runs.

## Preserved installed-package driver failure

The first schema-3 cohort remains **4 passed / 1 failed / 13 unattempted**. Its readable buggy test produced the correct target failure and clean shutdown, but the driver expected TAP while Node 26 selected the spec reporter. The v2 driver adds explicit `--test-reporter=tap` and uses a fresh exclusive output directory. Calibration verified both passing and failing one-test TAP results. No product bytes, observable assertions, deadline, cleanup cutoff or denominator changed; v2 is a separate completed cohort.

## Original htmx shutdown investigation

The original fixed repetition-15 failure and retained profile remain untouched. Its assertion completed before cleanup; source inspection narrows the failure to the context-close check, which did not distinguish rejection from timeout. The original aggregate process census proves other owned identities persisted, but lacks executable names and per-PID timestamps, so it cannot establish Chromium's exact lifetime or the internal wait stage.

A separate two-run passive diagnostic used the fresh hash-checked capsule and unchanged budgets. Both runs had complete stage coverage, expected assertions, natural child/worker completion and no intervention. Request disposal took 0.721/0.773 ms; context close took 14.580/16.739 ms. Transport disconnect preceded direct-child close by 8.623/8.782 ms; the original close promise settled 0.734/0.769 ms after child close. Profile removal followed actual worker close. These samples show why disconnect alone is insufficient and establish current behavior; they do not explain or causally repair the historical failure. No observed post-child delay supports an additional filesystem-removal probe now. Exact analysis and preserved-source hashes are under `.repro-runs/startup-repair-20261016/htmx-stage-v1/` and linked from the receipt.

## Outstanding prerequisite and scope

The pending action is starting **only new Repro Colima profile `e`**, using the existing Repro client identity and isolated homes. Automatic guest SSH host-key generation requires the user's requested credential approval. The approval question remains pending, not denied; no startup or credential creation was attempted. After approval, recheck the unused profile and effective controls, then run all three fresh capsule-only Linux cohorts with the unchanged approved policy and resource/cleanup limits. Older profiles and unrelated resources must remain untouched.

The eight deferred browser scenarios include mixed functional assertions; 50/50 is selected functional coverage, not a claim that all 58 browser scenarios passed. Native zoom and actual screen-reader workflows remain unverified, and the historical denied browser route is not authorized for retry. This work makes no publication, deployment, remote-CI, arbitrary-app, universal-determinism or universal-descendant-containment claim.
