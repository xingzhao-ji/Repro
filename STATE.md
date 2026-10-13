# Development state

2026-10-13 UTC. Local synthetic alpha on `task/repro-local-product`; no remote or publication. Goal is not complete. M0–M3 and local M5–M7 are implemented and checked. M4 Linux portability and native 200% visual review remain unverified. M8 is a deployment plan only.

## Current checkpoint

Read `evidence/RELEASE.md` and `evidence/COMPLETION-AUDIT.md`. The current machine index is `.repro-runs/completion-audit/summary.json`; its commit field is finalized immediately after the local commit. Runtime/configuration/test aggregate SHA-256: `38c1893f248a16daf3aa7537512e42f24c871e1a62d11bb8c1e8290516942099` across 68 files, plus 9 built artifacts. Original checkpoint `1621e62` and its inventories remain under `.repro-runs/release-final/`.

Final typecheck/lint passed; unit/contract/adversarial 62/62 and browser suite 24/24 passed with no skips. Browser suite comprises 22 integration checks plus 2 process-inspection checks. It includes another 40 actual synthetic executions (20 buggy / 20 fixed); all expected observations, 40 unique IDs and 120 artifact hashes were rechecked. Exact commands/logs: `npm run typecheck`, `npm run lint`, `npm test` and `PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers node --import tsx --test --test-concurrency=1 tests/*.browser.ts`; logs under completion-audit with `-final.log` suffixes. Fresh installed package smoke passed at `.repro-runs/package-smoke/run-JRHsLc/summary.json`, including installed binary and readable exported browser test. The previous executable demo remains applicable because final CLI/runner bytes are identical. Current build differs from prior checkpoint only in web.js and its map.

Thirty current-code screenshots were opened by the visual reviewer: 19 primary, 9 history, 2 literal-log. Exact reviewed images/hashes are in completion-audit/visual-review.json. Later changes were test-only; final integrated run generated additional images but they are not silently relabeled as reviewed. Final 8 axe samples have 0 violations / 0 incomplete. CSS 200% does not establish native 200% zoom. Prior supplied fixture 7/7, kit structure and locked-install evidence apply to unchanged assets/dependencies.

## Audit findings and repairs

The audit found historical Evidence run selection could substitute another job's reduction/comparison/export and reset across refresh/navigation. Red regression observed 8 failures. `web/main.tsx` now stores selection in the URL, resolves it within the selected session, shows only that job, and preserves a usable picker/error for unknown IDs. The real 7-job workflow checks 23 properties. Dependencies remain explicitly the current capsule; per-job original manifests remain in artifacts.

New tests: `faults.browser.ts` observes actual renderer crash and uncaught target exception, both INCONCLUSIVE / assertionCount 0 with unchanged identities. `recovery.browser.ts` and helper exercise actual Coordinator work at live capture request, accepted reduction baseline (2 real runs), and first staged export file; SIGKILL, recovery, request deduplication and fresh retries pass. Capture recorded 4 browser descendants; all exited without test cleanup on this host. This is bounded evidence, not universal orphan cleanup. Abrupt export retains rejected partial output/lock; fresh retry uses a new directory. `ui-security.browser.ts` proves persisted synthetic malicious markup stays literal without nodes/scripts/requests. `ui-history.browser.ts` proves exact historical attribution.

Independent review then found test harness gaps: failed `ps` queries could imply absence, and failed browser setup could skip cleanup. Observed red inspection regressions now pass; queries fail explicitly/preserve cause, including null spawn output. Both UI resources are closed with failures preserved. Deliberate missing-browser probe failed both tests promptly, removed owner locks and recorded no cleanup errors. Do not count those expected injected failures as product failures or passing browser executions. All final integrated checks passed after repairs.

Strict TypeScript module boundaries, frozen supplied assertion SHA-256 `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`, registered synthetic frontend, explicit controlled HTTP and Node oracle remain unchanged. No arbitrary app, database adapter, historical evaluation, human approval, public hosting or hostile-code isolation claim. Generated data stays under ignored task-owned directories. Original kit assets preserved.

## Blocked audit and resume requirements

The third consecutive audit re-read the launch attachment, inspected clean commit `d5e43f7`, and rechecked 68 source/test hashes, 9 built artifact hashes, 30 reviewed screenshot hashes, the final terminal logs, and the exact prepared namespace-policy delta. The preceding turn is classified as progress: it repaired historical attribution, added behavioral checks, completed verification and committed the result. This audit does not claim new test executions or implementation progress.

A separate reviewer inspected the current reports and raw evidence and found no concrete required local work that can meaningfully progress independently of the two prerequisites below. Both remain unresolved: no specific policy approval and no resolution of the native-browser navigation restriction. The scoped Colima status query now confirms profile `r` is not running; no process or job is being awaited. Machine record: `.repro-runs/completion-audit/blocked-audit.json`.

The blocked-audit threshold is met. The goal must be marked blocked, not complete. Resume when an explicit policy decision or permitted native-zoom review surface is supplied; then revalidate the applicable prerequisite and continue the original full objective. Do not infer authorization from automatic continuation, repeat the denied navigation, or rerun unchanged failing tests. After any explicit user resume, start a fresh blocked-audit count if the prerequisite remains unavailable.

## Pending specific approval: Linux sandbox policy

Default Docker run built successfully but Chromium reported `No usable sandbox`; both results INCONCLUSIVE, assertionCount0. Exact failed run:

```
DOCKER_HOST="unix://$PWD/.repro-cache/c/r/docker.sock" DOCKER_CONFIG="$PWD/.repro-cache/docker-config" docker run --name repro-check-first --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 --memory 1g --cpus 2 --tmpfs /tmp:rw,nosuid,size=256m --shm-size 256m --mount type=volume,src=repro-evidence-first,dst=/work/.repro-runs repro-capsule:first
```

Logs `.repro-runs/m0/linux-capsule-first-{build,run}.log` and `linux-browser-diagnostic.log`. Old failed capsule predates final repairs; do not reuse it as final-build evidence.

Prepared but **not applied** policy `.repro-runs/security-proposal/repro-chromium-seccomp.json`, SHA-256 `0885450338aec8898e557b5f851a3042c82ea4740a87f4a33675d2755d13642d`. Exactly one added unfiltered SCMP_ACT_ALLOW rule for clone/setns/unshare to extracted actual Docker29.5.2 arm64 all-caps-dropped policy. Everything else preserved (including io_uring denial and socket family restrictions). Independent proposal review recorded. This expands kernel namespace access. GOAL.md explicitly requires specific approval before weakening security. The async user question offers “Approve this local test” or “Keep Linux replay blocked”; no reply received as of this update. Do not execute until an explicit answer arrives. Time passing is not approval.

Owned VM uses Colima0.10.3/Lima2.2.1, profile `r`, Docker29.5.2 linuxarm64 kernel6.8.0-117. Config/state `.repro-cache/c`, download cache `.repro-cache/colima-cache`, Docker config `.repro-cache/docker-config`. No host mounts, no SSH-agent forwarding, no user SSH-config modification, no active Docker context change. The owned VM is stopped; scoped `colima -p r stop` completed successfully. Authoritative result `.repro-runs/release-final/vm-stop.log`. Preserve state and dependencies. An initial misplaced profile was stopped and specifically deleted earlier; do not touch other profiles.

If approved, restart only owned profile with explicit project paths; export current build to a new owned directory, rebuild image and run with the exact reviewed policy plus existing constraints. Any new security change requires its own authority; never use --no-sandbox, privileged, SYS_ADMIN, seccomp=unconfined, host networking or credential mounts as an unapproved workaround. Docker CLI uses explicit DOCKER_HOST above. The proposed profile is specific to the inspected VM/runtime and is not a portable public sandbox configuration.

## Native zoom restriction

Computer-use navigation to `http://127.0.0.1:4318` returned `net::ERR_BLOCKED_BY_CLIENT` for task-created Chrome tab1099847202. Do not retry or route around it. An independently started native-zoom experiment before that denial was shared yielded a cropped screenshot; it is inadequate visual evidence. Native200% remains unverified; existing authorized Playwright suites test app behavior/CSS reflow only. A permitted browser-review surface or user-provided review result is needed to resolve this gate. No native/browser-use action remains running. Root stopped stale manual-review server PID51544 before final build.

## Next useful action

Read the release report and actual state, check the user’s specific decision or changed review-surface availability, and resolve the applicable gate. The current blocked audit is complete; no work is running in the background. Preserve the existing checkpoint while awaiting the missing prerequisite. No publishing/cloud/charges/credentials/data sharing are authorized. Default local work is reversible and needs no repeated permission.
