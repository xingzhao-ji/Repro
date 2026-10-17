# Fresh Linux arm64 verification — all three current-candidate cases

October 16, 2026. Resumed after the Claude handoff. Implementation `9aec7fe` now has passing fresh isolated Linux arm64 evidence for all three pinned practical-beta cases. Morphdom and htmx ran before the handoff in `acceptance-v1`. The previously unrun Marked case ran afterwards in a separately named cohort directory. **Practical-beta completion is still not claimed:** the original native htmx shutdown cause remains unresolved, and accessibility stays deferred.

[Machine-readable receipt](linux-three-case-resume.json) binds every summary, audit, isolation, start and stop receipt by path, size and SHA-256. Raw evidence is local under `.repro-runs/startup-repair-20261016/acceptance-v1/` and `.repro-runs/claude-resume-20261016/`; a clone without those ignored files cannot re-audit them.

| Case | Cohort directory | Operations | Executions | Readable buggy / fixed | Reduction | Kernel peak |
| --- | --- | --- | --- | --- | --- | --- |
| morphdom textarea | `acceptance-v1` | 44 | 49 | 20 target failures / 20 satisfied | 3 → 2 actions, 7 executions | 346.31 MiB |
| htmx checkbox | `acceptance-v1` | 44 | 46 | 20 / 20 | 2 → 2, 4 executions | 409.68 MiB |
| Marked empty heading | `claude-resume-20261016` | 44 | 49 | 20 / 20 | 3 → 3 (no reduction), 7 executions | 313.43 MiB |

Workflow times in seconds (capture / replay / reduction / export): morphdom 0.745 / 0.725 / 3.354 / 0.312; htmx 0.906 / 0.796 / 2.142 / 0.312; Marked 0.714 / 0.709 / 3.140 / 0.339. Recorded no-cache setup: 171.2 s, 179.4 s, 139.1 s, each under the 15-minute budget. Tested minimality remains unverified in every case. Marked's unchanged action sequence is reported as no reduction, as the protocol requires.

## What ran and how it was checked

- **Inputs.** Before restart, all 132 frozen native-workflow input identities matched the working tree, including `dist/`, the driver, the protocol, the policy and the fixtures. All 59 Marked capsule inventory entries matched.
- **Restart.** Task-owned Colima profile `e` was restarted under the existing owner approval, with unchanged versions: Colima 0.10.3, Lima 2.2.1, Docker client 29.9.0 / server 29.5.2.
  - An earlier session's unexecuted v1 start intent is preserved.
  - An adapted copy of the original inspector verified the same daemon `ad0afe52…`, with no containers or volumes and exactly the retained base image.
  - It also verified no host shares and no SSH agent, loopback-only host listeners, and the unchanged override.
  - Colima rewrote two config lines: it filled in `hostname`, and the host socket paths took the letter case of the caller's lower-case path alias. On case-insensitive APFS those are the same files. Both diffs are recorded.
- **Execution.** `scripts/verify-beta-isolated.mjs` ran unchanged with the approved policy SHA-256 `949b87f7…`, chained by `--previous-summary` to the htmx summary. Nothing was written into `acceptance-v1`.
- **Independent audit.** `linux-three-case-audit.json` runs the hash-bound, unchanged `preflight()`, `isolation()` and `audit(case)` definitions from `acceptance-v1/audit-linux.py`.
  - The only change is the case-directory root, so Marked reads from the new cohort.
  - Result: 132 operations, 144 unique runs, 132 unique containers and 6,870 file records, with no findings. Run, container and owner identities are unique across all three cases.
- **Negative controls.** Disposable copies show the redirected audit still catches tampering:
  - A one-bit change in a readable-test log yields `OPERATION_LOG`/`FILE_HASH`.
  - Binding Marked to the wrong previous case yields `PREVIOUS_RECEIPT_EXACT`/`SESSION_CHAIN`.
  - An unmodified copy differs only in the path-bound `NO_CACHE_ACQUISITION` argument hash.
- **Finalization.** A terminal receipt confirmed no containers or volumes and the base image retained. The verified stop then confirmed Lima Stopped, the original hostagent PID absent, Docker unavailable, the socket absent and the disks retained.
  - The Docker client again printed `""` for the unavailable endpoint. That response made the first handoff stop verifier fail; this finalizer accepts it, and the failed receipt is preserved.

## Limits

These are runs on the same task-owned Linux arm64 VM, not another physical machine or Linux amd64. The profile restart between htmx and Marked is a recorded deviation; the same daemon, disks and image inventory were re-verified. The fault suite is excluded. Eight focused or mixed browser scenarios, native zoom and actual screen-reader workflows remain deferred and unverified. The historical native htmx repetition-15 failure is not explained by these passing runs. The older profile-d cohort belongs to the previous candidate and is not combined with these counts.
