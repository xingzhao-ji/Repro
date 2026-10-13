# Development state

2026-10-13 UTC. The third resumed blocked audit found the same two pending prerequisites; the goal is incomplete and meets the blocked-status threshold. The local synthetic product is implemented, but Linux portability and native 200% zoom review remain unverified. No publication, cloud resources, paid service or personal data use is authorized.

## Current authority and next decisions

The user replied “appproved” after the exact prepared Linux per-container policy decision was identified. That approval covered policy SHA-256 `0885450338aec8898e557b5f851a3042c82ea4740a87f4a33675d2755d13642d`, adding unfiltered `clone`, `setns`, `unshare` calls to the actual all-capabilities-dropped Docker policy. The profile was applied exactly to the current-build test and a separate diagnostic, preserving all other container restrictions.

The approved policy did not establish replay. Chromium progressed to a failing `chroot` sandbox step. A separately prepared profile adds only `chroot`, with SHA-256 `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`. It is **not applied**. An async user question requests specific approval for that additional call, explaining that it applies throughout the container and cannot be restricted to the observed pathname. GOAL.md requires this additional decision; the earlier approval does not authorize arbitrary further security changes.

A second pending async question asks whether the native Chrome/client restriction has been resolved and the same local Repro page may be retried. Inventory shows Chrome available but no evidence that the earlier `net::ERR_BLOCKED_BY_CLIENT` condition changed. No native navigation retry has occurred. Native 200% remains distinct from CSS layout zoom. Do not route around the restriction through another tool or surface.

The earlier blocked goal was explicitly resumed; its audit count did not carry over. Resumed turn one made concrete progress through actual approved execution, failure diagnosis and an independently reviewed next proposal. Turn two only revalidated existing evidence and made no release-gate progress. Turn three confirms that the same prerequisites remain, the owned VM is stopped, and no verification handle is live. All 77 source/build hashes and both Linux evidence hashes still match. The record is `.repro-runs/completion-audit/resumed-blocked-audit-3.json`. Mark the goal blocked after this audit; resume when a pending prerequisite receives an actionable answer. Do not infer approval from continuation or elapsed time.

## Current Linux evidence

Directory: `.repro-runs/linux-approved/1a81f0e2-fc66-4ab9-8fac-a495a0ad20b5`. Read `evidence/LINUX-REPLAY.md`, its `summary.json`, `approval.json`, `preflight.json`, `container-before.json`, `container-after.json`, `diagnostic-container.json` and `independent-review.json`.

A fresh reduced capsule from commit `1a59cb2` was exported and validated. The image build passed. Image tag `repro-capsule:approved-1a81f0e2`, ID `sha256:2aef58f3cd26d4ee30f974b045a74e45a9894e10e4c2510cd98a86b3675b073d`. Reduced manifest digest `1d73378b0b1dd8b9c0e20a155c88d1c27e85910f144dcd1085ddb0f6d3214db6`, three actions. Both real runs are environment/INCONCLUSIVE, zero assertions, null observations; the conventional test exits 1. Main container `repro-approved-1a81f0e2-run1` is exited, not pending.

The separate `repro-approved-1a81f0e2-diagnostic` container exits 2. Its launch log reports `Check failed: sys_chroot("/proc/self/fdinfo/") == 0`. The main application evidence retains generic `RUNNER_ERROR`; do not misattribute the diagnostic message to it. The diagnostic used the same image, approved policy and restrictions, with a separate fresh evidence volume.

Independent review checked all twelve capsule artifact hashes/sizes, current trusted files, manifest/assertion/harness/app identities, both container configurations, and the exact new policy delta. The hypothesis that allowing chroot resolves the next launch failure is unproven. Nested user namespaces can hold their own capabilities even with parent capabilities dropped; the new allowance is not inert. No arbitrary/hostile-code isolation claim follows from a future successful synthetic run.

## Owned resources and exact boundary

The owned VM is Colima profile `r`. Paths: `COLIMA_HOME="$PWD/.repro-cache/c"`, `COLIMA_CACHE_HOME="$PWD/.repro-cache/colima-cache"`, `DOCKER_CONFIG="$PWD/.repro-cache/docker-config"`. Docker uses `DOCKER_HOST="unix://$PWD/.repro-cache/c/r/docker.sock"`; do not change active context. VM uses two CPUs, 3 GiB memory, 12 GiB data disk, 8 GiB root disk, vz, no host directory mounts, no SSH-agent forwarding, no user SSH-config update and disabled application port forwarding.

Container constraints: `--network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 --memory 1g --cpus 2 --tmpfs /tmp:rw,nosuid,size=256m --shm-size 256m`, unprivileged image USER node, and one new named evidence volume at `/work/.repro-runs`. The exact approved seccomp file is passed separately. No bind mount, credentials, Docker socket, public port, privileged mode, extra capability or disabled Chromium sandbox is allowed by the current approval.

Scoped VM shutdown completed with terminal exit 0; the current Linux directory’s `vm-stop.log` records it. No process or job is being awaited. Preserve images, exited containers, owned volumes and copied evidence. Do not touch other Colima profiles or unrelated resources.

If chroot is specifically approved: verify the proposed file hash, restart only the owned profile with the same explicit flags, create a new container and evidence volume, inspect its exact configuration before start, and run the current trusted capsule. If another security change becomes necessary, prepare and review it before requesting its specific approval; do not silently broaden the policy. If replay succeeds, finish standalone portability packaging: include the exact tested profile as an inert integrity-checked capsule artifact with explicit opt-in instructions and the tested runtime boundary. Then rebuild, rerun affected checks and execute a newly exported final capsule. An ignored development-file reference is not sufficient standalone setup documentation.

## Preserved native checkpoint

Runtime code and test source remain those verified at `d5e43f7`; `1a59cb2` added handoff documentation only. All 68 source/test hashes and nine build hashes were rechecked after this Linux attempt and remain unchanged. Aggregate `38c1893f248a16daf3aa7537512e42f24c871e1a62d11bb8c1e8290516942099`; inventory `.repro-runs/completion-audit/content-hashes.json`.

Native typecheck/lint, 62 unit/contract tests, 24 browser-suite checks (22 integration plus two process-inspection checks), fresh installed package/exported conventional test, 40 synthetic benchmark outcomes, eight axe samples and thirty reviewed screenshots remain valid for those unchanged bytes. They are not Linux portability evidence. Exact logs, image hashes and scope are in `evidence/RELEASE.md` and `.repro-runs/completion-audit/summary.json`. No native tests were redundantly rerun during the approved Linux investigation.

Module boundaries, frozen supplied assertion `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`, exact historical evidence selection, fault/recovery/privacy tests and known limits remain unchanged. Earlier history and blocker audits are retained in `evidence/COMPLETION-AUDIT.md`. Historical bugs, human approval of expectations, arbitrary app capture, database reduction, global minimality, public hosting and universal crash cleanup remain unclaimed.
