# Development state

2026-10-13 UTC. Local synthetic alpha implemented on `task/repro-local-product`; no remote or publication. M0–M3 and local M5–M7 work delivered; M4 Linux portability and native 200% visual review remain unverified. M8 is a deployment plan only. Goal remains active until missing gates are resolved or formally blocked; do not claim complete.

## Final observed checks

`evidence/RELEASE.md` is the human-readable report. `.repro-runs/release-final/summary.json` indexes authoritative runs and the local checkpoint; `content-hashes.json` identifies runtime source/configuration/tests/builds. Aggregate source SHA-256: `bde059fc105c18646ecef6a3a3386aa344fcd96612db316948e54c4603915560` (narrative documentation excluded, algorithm in inventory).

Final clean npm install/build/typecheck/lint passed. Supplied state-model checks7/7 and kit structure passed. Unit/contract/adversarial62/62 passed. Browser15/15 passed, including twenty buggy and twenty fixed executions with40/40 expected outcomes. Final affected UI/accessibility suites3/3 passed after the expanded-artifact mobile reflow repair. Nineteen final screenshots inspected independently; eight axe states have zero violations/incomplete checks. CSS200 is not native browser zoom. Fresh local package/install checks include the installed `.bin/repro` executable and real exported conventional test. Executable pinned-browser demo passed:5actions→3,16executions, original failure, fixed requirement satisfied,13validated capsule files, imported capsule replay; minimality remains unverified due inconclusive final neighbors. All logs/raw observations stay under `.repro-runs/`.

Final benchmark `.repro-runs/benchmark/b93b7e26-fcf7-4a29-a06f-35ad346366dd/summary.json`; demo `.repro-runs/demo/c9452ec5-fcaf-40c3-a5ba-c4bc1715a793/summary.json`; screenshots `.repro-runs/ui/browser-d0743414-7d64-4356-9d81-f49bb126a412/screenshots.json`; axe `.repro-runs/ui-review/b52913ac-0db7-4de7-8909-9f07bff12c93/accessibility.json`.

## Implemented boundaries and review repairs

Strict TypeScript core separates manifest/capture consent, adapter, oracle, reducer, capsule, ledger/service, CLI and presentation. Registered synthetic frontend only; actual browser actions/fetches and controlled beta-before-alpha HTTP completion. No database needed, arbitrary websites/candidates and real-user data unsupported. Node oracle outside candidate browser, unchanged supplied assertion SHA-256 `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`. Supplied synthetic specification is expectation provenance; no human approval claimed.

Reviews repaired forged reducer outcome acceptance, symlink output escapes, ledger initialization lock leak, shutdown admission, pair identity binding, missing historical manifest snapshots, structured event truncation, malformed-token timing comparison, FIFO input blocking, CLI leaf symlink/hardlink writes, late budget validation, and expanded mobile artifact overflow. Regressions were observed failing then passing. Reports: evidence/INDEPENDENT-REVIEW.md, SECURITY-REVIEW.md, VISUAL-REVIEW.md. Recovery tests kill an actual Node process with durably running ledger states; they do not prove orphan-browser crash cleanup.

Original kit assets/drafts retained and labeled. New product schemas are schemas/manifest-v1.schema.json and run-result-v1.schema.json, with structural tests and authoritative semantic runtime validation. Runtime/tests/scripts/config stable at hash above. No unrelated files reset or external data uploaded.

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

Read the release report and actual state, check for a user response to the pending specific proposal, and resolve only authorized remaining gates. If no response, preserve blocker and do not repeatedly execute unchanged failing tests. The blocked-goal threshold requires three consecutive goal turns at a real impasse; do not infer a prior continuation count from elapsed time. No publishing/cloud/charges/credentials/data sharing are authorized. Default local work is reversible and needs no repeated permission.
