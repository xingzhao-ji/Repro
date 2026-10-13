# Approved Linux replay attempt

The user approved the previously reviewed namespace policy on 2026-10-13. The current reduced capsule was freshly exported from commit `1a59cb2`, validated by the trusted CLI, and built inside the task-owned Linux VM. This attempt is **INCONCLUSIVE**: both revisions executed zero assertions. Linux portability remains unverified.

The [run summary](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/summary.json), [approval record](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/approval.json), [build log](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/build.log), [test output](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/run.log) and copied run evidence retain the observation. The image is `sha256:2aef58f3cd26d4ee30f974b045a74e45a9894e10e4c2510cd98a86b3675b073d`. The reduced manifest retains three actions and digest `1d73378b0b1dd8b9c0e20a155c88d1c27e85910f144dcd1085ddb0f6d3214db6`.

## Approved boundary and observed result

[Preflight](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/preflight.json) checks the created container against the authorized boundary before starting it: unprivileged `node`, network `none`, read-only root, all capabilities dropped, `no-new-privileges`, no host bind mounts or published ports, a fresh owned evidence volume, 128-process/1-GiB/2-CPU limits, 256-MiB temporary filesystem and shared memory. Docker inspection retains the actual before/after configuration. The exact approved policy SHA-256 is `0885450338aec8898e557b5f851a3042c82ea4740a87f4a33675d2755d13642d`.

The readable test exits 1 because its original-assertion-count check fails. Both application results are `environment / inconclusive`, with null observations and zero assertions. Their manifest/assertion/harness identities agree with the exported experiment. This is no evidence that either behavioral outcome occurred.

A separate [launch diagnostic](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/diagnostic.log), using the same image and restrictions, reports `sys_chroot("/proc/self/fdinfo/")` failure during Chromium sandbox initialization. Its [container inspection](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/diagnostic-container.json) records the command and configuration. The actual application run evidence retains its generic `RUNNER_ERROR`; the more specific error belongs to this separate diagnostic. No successful assertion is inferred from a diagnostic launch.

The approved profile has no `chroot` allow rule. This is consistent with [Docker's capability-dependent default profile](https://github.com/moby/moby/blob/master/vendor/github.com/moby/profiles/seccomp/default.json), which conditions that rule on `CAP_SYS_CHROOT`; this experiment drops all container capabilities. The locally extracted runtime policy, rather than the changing upstream branch, is the authoritative comparison baseline.

## Prepared additional proposal

The [proposal](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/chroot-proposal.json) adds only an unfiltered `chroot` allow rule to the approved policy. The [prepared file](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/proposed-seccomp-with-chroot.json) has SHA-256 `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`. Every existing rule, architecture and default is preserved. Container capabilities remain dropped; the proposal grants no host capability. Allowing this extra syscall expands the permitted kernel interface, and seccomp cannot restrict its string-pointer argument to the path observed in the log.

The [independent review](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/independent-review.json) verifies both container configurations, all twelve capsule artifact hashes, run identities and the exact added rule. It notes that dropping parent-container capabilities does not make this allowance inert: a nested user namespace can hold capabilities in its own namespace. The rule applies to all container processes, not only Chromium.

This is a targeted hypothesis, not a verified remedy. The file is prepared only; it has not been applied. GOAL.md requires specific approval for this additional policy change. A successful eventual test will also require distributing the exact tested profile as an inert, integrity-checked capsule artifact and documenting its explicit opt-in command and supported runtime. A reference to an ignored development file alone is not a standalone replay prerequisite.

The task-owned VM was [stopped successfully](../.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5/vm-stop.log) after evidence collection. Exited containers, volumes and copied observations remain local. No background verification is running.
