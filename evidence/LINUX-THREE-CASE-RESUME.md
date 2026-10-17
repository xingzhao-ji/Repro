# Fresh Linux arm64 verification — all three current-candidate cases

October 16, 2026. Resumed after the Claude handoff. Implementation `9aec7fe` now has passing fresh isolated Linux arm64 evidence for all three pinned practical-beta cases. Morphdom and htmx ran before the handoff in `acceptance-v1`. The previously unrun Marked case ran afterwards in a separately named cohort directory. **Practical-beta completion is still not claimed:** the original native htmx shutdown cause remains unresolved, and accessibility stays deferred.

[Machine-readable receipt](linux-three-case-resume.json) binds every summary, audit, auditor, negative control, isolation, start and stop receipt, plus the builder that generated it, by path, size and SHA-256. Raw evidence is local under `.repro-runs/startup-repair-20261016/acceptance-v1/` and `.repro-runs/claude-resume-20261016/`; a clone without those ignored files cannot re-audit them.

| Case | Cohort directory | Operations | Executions | Readable buggy / fixed | Reduction | Kernel peak |
| --- | --- | --- | --- | --- | --- | --- |
| morphdom textarea | `acceptance-v1` | 44 | 49 | 20 target failures / 20 satisfied | 3 → 2 actions, 7 executions | 346.31 MiB |
| htmx checkbox | `acceptance-v1` | 44 | 46 | 20 / 20 | 2 → 2 (no reduction), 4 executions | 409.68 MiB |
| Marked empty heading | `claude-resume-20261016` | 44 | 49 | 20 / 20 | 3 → 3 (no reduction), 7 executions | 313.43 MiB |

Workflow times in seconds (capture / replay / reduction / export): morphdom 0.745 / 0.725 / 3.354 / 0.312; htmx 0.906 / 0.796 / 2.142 / 0.312; Marked 0.714 / 0.709 / 3.140 / 0.339. Recorded no-cache setup: 171.2 s, 179.4 s, 139.1 s, each under the 15-minute budget. Tested minimality remains unverified in every case. htmx and Marked kept their action sequences unchanged and are reported as no reduction, as the protocol requires.

## What ran and how it was checked

- **Inputs.** After the run, two checks bound all 132 frozen native-workflow input identities to the working tree: the audit's `preflight()`, and the finalizer's `frozen_inputs()`. Those inputs include `dist/`, the driver, the protocol, the policy and the fixtures. The same comparison and a 59-entry Marked capsule check (58 integrity rows plus `integrity.json`) also passed before the restart, but those results are recorded only as text in `start-intent-v2.json`.
- **Restart.** Task-owned Colima profile `e` was restarted under the existing owner approval. Lima 2.2.1 and Docker client 29.9.0 / server 29.5.2 are confirmed by raw logs; Colima 0.10.3 is recorded in the intent.
  - An earlier session's unexecuted v1 start intent is preserved.
  - An adapted copy of the original inspector verified the same daemon `ad0afe52…`, with no containers or volumes and exactly the retained base image.
  - It also verified no host shares and no SSH agent, loopback-only host listeners, and the unchanged override.
  - Colima rewrote three lines in two files. It filled in `hostname` in `colima.yaml`, and the two `lima.yaml` host socket paths came out lower case. That's because `COLIMA_HOME`/`LIMA_HOME` were given relative to the shell's lower-case alias of the same case-insensitive APFS directory. The receipt lists these inspector relaxations.
- **Execution.** `scripts/verify-beta-isolated.mjs` ran unchanged with the approved policy SHA-256 `949b87f7…`, chained by `--previous-summary` to the htmx summary. Nothing was written into `acceptance-v1`.
- **Independent audit (v3).** `linux-three-case-audit-v3.json` runs the hash-bound, unchanged `preflight()`, `isolation()` and `audit(case)` definitions from `acceptance-v1/audit-linux.py`. It replaces only the case-directory root, so Marked reads from the new cohort while its previous summary still binds acceptance-v1's htmx summary.
  - Three new functions cover what the helper's fixed paths cannot reach:
    - `resume_isolation()` applies every `isolation()` check to the restart receipt, with recorded adaptations. Those adaptations are the same daemon, base-image inventory, case-insensitive path comparison, and config diffs recomputed from the snapshot files.
    - `resume_daemon_cleanup()` mirrors `daemon_cleanup()`.
    - `resume_stop()` rechecks the stop receipt's command logs, the Docker binding of every command, the pre-stop hostagent identity against the isolation receipt, the post-stop Lima dir, and the finalizer script hash.
  - Result: 132 operations, 144 unique runs, 132 unique containers and 6,898 file records, with no findings. Run, container and owner identities are unique across all three cases.
  - Two rounds of automated review by a read-only Claude subagent (not human review) found weaknesses. v1 (`linux-three-case-audit.json`) had a much weaker restart-isolation check than first claimed. v2 accepted two stop-receipt mutations. Both versions report the same counts and are preserved; v3 is the cited evidence.
- **Negative controls.** All run on disposable copies.
  - Helper path: a one-bit readable-test log change is caught by hash checks (`OPERATION_LOG`/`FILE_HASH`), and an expected-predecessor substitution yields `PREVIOUS_RECEIPT_EXACT`/`SESSION_CHAIN`. An unmodified copy differs only in the path-bound `NO_CACHE_ACQUISITION` argument hash.
  - Replacement functions (v3): unmutated copies pass. Mutated logs have their receipt hashes updated, so only a semantic check can reject them, and each result records the auditor line that fired. Each of these is rejected:
    - a guest CPU count of 4;
    - a new hostagent listener;
    - a foreign Docker host socket;
    - unrecorded config drift;
    - a leftover volume;
    - a surviving hostagent PID;
    - a Docker endpoint that still answers;
    - a foreign post-stop Docker host binding;
    - a different pre-stop hostagent identity;
    - Marked's previous-summary hash changed in a copy (`PREVIOUS_RECEIPT_EXACT`);
    - morphdom routed to htmx's directory (morphdom's pinned source is absent there, so the audit is incomplete).
- **Finalization.** A terminal receipt confirmed no containers or volumes and the base image retained. The verified stop then confirmed the following, while the original pre-handoff hostagent 58483 had already exited at the handoff stop:
  - Lima Stopped;
  - the resumed hostagent (PID 95902) absent;
  - Docker unavailable;
  - the socket absent;
  - the disks retained.

  The Docker client again printed `""` for the unavailable endpoint. That response made the first handoff stop verifier fail; this finalizer accepts it but still requires exit 1, an endpoint error, the absent socket and a stopped VM. The failed receipt is preserved. A read-only process note taken about 27 minutes after the stop, with raw `ps` output and its script retained, found neither the resumed hostagent nor the task-local usernet (PID 95896) running.

## Limits

- **Same VM.** These are runs on the same task-owned Linux arm64 VM, not another physical machine or Linux amd64.
- **Restart deviation.** The profile restart between htmx and Marked is a recorded deviation; the same daemon, disks and image inventory were re-verified.
- **Config drift.** The live profile config now keeps the lower-case socket paths, so the acceptance-v1 config hashes no longer match it. Future starts should pass absolute canonical paths.
- **Excluded checks.** The fault suite is excluded. Eight focused or mixed browser scenarios, native zoom and actual screen-reader workflows remain deferred and unverified.
- **Historical failure.** The historical native htmx repetition-15 failure is not explained by these passing runs.
- **Older cohort.** The older profile-d cohort belongs to the previous candidate and is not combined with these counts.
