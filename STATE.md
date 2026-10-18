# Current work — Repro 0.2.0: one REPRO.md from your own app (released as a verified beta)

October 17–18, 2026. The owner's `/goal`: evolve Repro into a developer tool. The input is an application plus an issue description; the output is one actionable REPRO.md that a teammate or coding agent can use to reproduce the bug, fix the original app and run the same test.

## Release identity

- Release commit `5ca54f101d517626551d53d0b9756d4eea99a83c`, tagged `v0.2.0-beta`. Branch `release/repro-report-0.2.0`, with the evidence commit on top. The development branch is `feature/repro-report`.
- Package `repro-local-0.2.0.tgz`: 1,875,935 bytes, SHA-256 `99ec27ccea0b812858573b6f174a332550dbfaf9bba69072529516565230ad2a`. A rebuild of the commit packs to identical bytes. The runtime bytes are identical to rc3.
- Report: [evidence/REPRO-REPORT-RELEASE.md](evidence/REPRO-REPORT-RELEASE.md), with JSON records in `evidence/repro-report-0.2.0/`.
- Not done: no merge to `main`, no GitHub Release, no npm publication, no deployment.

## Verified

- **Automated checks:** ordinary suite 441/441, and functional browser suite 70/70 with the three deferred accessibility scenarios excluded. Typecheck, lint, build and `test:package` pass.
- **The exact tarball, installed into an empty project:**
  - shopping-list (React) and cafe-orders (Express, uncommitted changes and a withheld password) reproduced, and the fresh checkout reproduced;
  - all 8 redaction canaries absent;
  - not-reproduced on a fixed clone;
  - CLI cancellation: exit 130, nothing written or left running;
  - the scripted recipient workflow passed for both apps: an empty HOME, REPRO.md's own commands, the test fails as recorded, then the same test passes after the controlled fix.
- **Held-out pantry-scale (Vue):**
  - With rc1 and the issue's own wording, Repro needed input: a partial button name, and no suggestions were offered.
  - With the rendered names it reproduced, and the sealed fix passed the same test.
  - Both gaps were fixed generically. The post-hoc reruns with the original wording, on rc2, rc3 and the release, reproduce and pass the recipient workflow. They are not held-out evidence.

## Foreground review (October 17, 2026, after the release)

The owner asked for a direct review of the diff against `main`, without subagents. The implementing agent did it in the same session, so **it is not independent**. It found 11 defects:

- **High:** automatic step shortening for negative checks, which produced a test that fails on a correct app.
- **Medium:** "Intermittent" on thin evidence; a password in a Blocked report; typed values in the derived title and file name; an intermittent report without a recorded failure.
- **Low:** six smaller ones.

They were fixed test-first in `11a42f0`. Afterwards:

- ordinary suite 449/449, functional browser suite 72/72, and `test:package` passed;
- packaged acceptance of the fixed tarball (`db550ad1…`) passed 8/8, and the post-hoc held-out rerun passed;
- a manual clean-checkout recipient run of a cafe-orders REPRO.md: exit 1 as recorded, then exit 0 after the controlled fix, with byte-identical test files.

**The tagged `v0.2.0-beta` package contains these defects; the branch head does not.** Details are in [evidence/FOREGROUND-REVIEW-0.2.0.md](evidence/FOREGROUND-REVIEW-0.2.0.md). The merge to `main` waits for the owner's approval.

## Open, with reasons

- **The second independent review and the coding-agent recipient trial were attempted but not run.** From about 21:05 PDT every subagent stalled before its first response, on every route and model tried, and a further trial launch during the foreground review stalled the same way. Both are recorded as not run; the foreground review is not a substitute for an independent one.
- **One unexplained browser failure:** `marked-empty-heading complete UI journey` failed once under load and passed in every other run. Its cause was not established.
- **Not done:** Linux acceptance for 0.2.0, accessibility (deferred), human usability testing, and stacks other than JavaScript/npm.

## Workspace

- **The clone:** `~/Developer/Repro-dev`, outside iCloud.
- **Acceptance:** `~/Developer/repro-acceptance/`. It holds the apps, the sealed held-out fix, the drivers in `release-0.2.0/tools/`, the cohorts `rc1` to `rc3` and `release`, the screenshots and the round-1 review findings.
- **Still running:** the 0.1.0 walkthrough workbench from earlier in the session, at http://127.0.0.1:4318, from the scratchpad.

---

# Preserved checkpoint — Repro 0.1.0 practical beta released and verified

October 17, 2026. The owner's `/goal` asked to finish the practical beta as a verified release.

## Release identity

- Release commit `65e6003235b553e2820ac7e0949407b0a1fe61ce`, tagged `v0.1.0-beta`.
- Branch `release/practical-beta-0.1.0`; the evidence commit sits on top of the release commit.
- Package `repro-local-0.1.0.tgz`: 1,495,621 bytes, SHA-256 `f2282cda6de110eb5d0873520c2d42c67fa4cf0a8b0f5d10227fa1d151c8e546`. A second independent rebuild of the commit packs to identical bytes.
- Report: [evidence/PRACTICAL-BETA-RELEASE.md](evidence/PRACTICAL-BETA-RELEASE.md), with the native and Linux JSON receipts beside it.

## Results on the release commit

- **Native (cohort rc5):** every gate passed.
  - Tests: 409/409 ordinary and 17/17 + 35/35 functional browser.
  - Package and install: package smoke from the exact tarball, and 18/18 installed schema-3.
  - Workflow and stability: 15/15 workflow measurements and 120/120 stability runs.
  - Audit: 150 runs, 857 records.
  - Cancellation, workbench and clean machine: 16/16 CLI cancellations, the installed-workbench journey, and 4/4 exported capsules on a clean machine.
- **Linux (cohort v5):** 132 operations, 144 runs and 120 readable tests on profile e. The owner approved removing the six old images first. The independent audit found no findings in 7,191 records. The VM stop was verified.

## Changes from `9aec7fe`

- The `task/cleanup-failure-basis` diagnostics were merged.
- Three defects found during release verification were fixed, each with a failing-then-passing regression:
  - terminal Ctrl-C killed the case worker (ADR 0004);
  - a cancelled export exited 2;
  - a late-bound synthetic fixture server kept the CLI alive.
- An INSTALL capsule-command inaccuracy was corrected.

## Preserved failures

Each failure is preserved with its logs: rc1 and rc2 (heavy host load from another session), rc3 (defect 3), rc4 (a driver defect and the INSTALL inaccuracy), the frozen v5 Linux auditor output, the timed-out `colima stop` receipt, and a false-positive v1 stop resolution.

## Not claimed

- Accessibility (deferred).
- Independent review of the three fixes: four agent attempts stalled, so only the self-review is recorded.
- Other physical machines.
- Deployment: none.

## Environment hazards

- iCloud repeatedly evicts this repo's git refs and objects, `.repro-runs` evidence, and profile-e configuration including its SSH key.
- Git in this checkout needs `-c core.trustctime=false -c core.checkStat=minimal`. Ref-enumerating commands hang while refs are evicted.
- Commits were made in an outside-iCloud clone and transferred with `pack-objects` | `unpack-objects`. GitHub holds the authoritative refs.
- Restore files with `brctl download` before VM or git work.
- Run timing-sensitive gates only on a quiet host.

## Next actions

These are owner decisions:

1. Merge to `main` or create a GitHub Release.
2. Choose a hosting target, if any.
3. Resume accessibility work.
4. Fix the Linux driver's quiet image listing in a future candidate.
5. Consider moving the repository and VM out of the iCloud-synced Desktop.

## Preserved Claude resume checkpoint (Linux three-case pass for 9aec7fe)


October 16, 2026, on `task/startup-owner-boundary` from delivered `a386750` (origin readback matched). The owner's `/goal continue` / `/goal resume` reopened the handed-off work. Implementation `9aec7fe` is unchanged; this continuation added only evidence and documentation.

**Fresh Linux arm64 is now complete for all three pinned cases.** Morphdom and htmx (acceptance-v1, before the handoff) plus Marked (new `.repro-runs/claude-resume-20261016/` cohort) each passed 44 operations: **132 operations, 144 distinct executions, 120 readable tests (20 buggy target failures + 20 fixed passes per case)**. Audit v3 (`.repro-runs/claude-resume-20261016/linux-three-case-audit-v3.json`) runs the unchanged, hash-bound `audit-linux.py` `preflight()`/`isolation()`/`audit(case)` helpers plus three new wrapper functions: `resume_isolation()` (every `isolation()` check, adapted for the restart), `resume_daemon_cleanup()` and `resume_stop()` (stop logs, Docker bindings, pre-stop identity, Lima dir, script hash). It found no findings across 132 unique containers and 6,898 records. Negative controls on disposable copies rejected log tampering, a wrong expected predecessor, a changed previous-summary hash, content-level misrouting and semantic mutations of the isolation, cleanup and stop receipts. Each control records the auditor line that fired. Two rounds of automated review by a read-only Claude subagent (not human review) found weaknesses: v1 had weaker restart-isolation checks, and v2 had looser stop checks. Both are preserved; v3 is the cited evidence. See [the Linux report](evidence/LINUX-THREE-CASE-RESUME.md) and [receipt](evidence/linux-three-case-resume.json).

Profile `e` was restarted for Marked: a recorded deviation, with the same daemon, disks and image inventory re-verified. The earlier session's unexecuted start intent is preserved. Afterwards a verified finalizer confirmed empty containers/volumes, stopped the VM, and confirmed the resumed hostagent (PID 95902) absent, Docker unavailable, the socket absent and the disks retained. A later read-only note found the task-local usernet (PID 95896) gone too; no signal was sent to it. No other profile, shared service or game-session resource was touched.

**Next-session note:** the restart passed `COLIMA_HOME`/`LIMA_HOME` relative to the shell's lower-case path alias (`/Users/xingzhaoji/desktop/repro`). The live profile config therefore holds lower-case socket paths (colima.yaml `2368f4f4…`, lima.yaml `9b88bd56…`), and acceptance-v1's inspector/finalizer config hashes no longer match. For any future start, use absolute canonical paths (`cd "$(pwd -P)"`).

**Environment hazard (observed 2026-10-16):** the repository sits in an iCloud-synced Desktop, and macOS evicts files to dataless placeholders. At 18:40 PDT, 2,364 `node_modules` files, 16 browser-cache files, 222 npm-cache files and 10 `.git` files were dataless. Two git objects made `git worktree add` fail (`mmap failed: Operation timed out`). ESLint crashed with `ESLint is not a constructor`, and an ordinary test run stalled at 0% CPU until it was stopped. Neither is a product result. Check `find node_modules .repro-cache .git -flags +dataless | wc -l` before trusting tool failures.

What worked:
- **`node_modules`:** `npm ci --ignore-scripts --cache <fresh scratch dir>`. It fetched the 116 locked packages from the official registry in about 1 s, with identical top-level versions. Don't reuse `.repro-cache/npm` for this: it was partly dataless.
- **Individual files:** `brctl download <file>`, then poll until the flag clears.

What was misleading:
- A `compressed,dataless` Chromium file (`icudtl.dat`, 10.8 MB) read back **empty** while `cat` exited 0. Verify full read length or hash, not just exit status.
- Parallel `cat` hydration slowed to about 30 files a minute.

**Browser-location hazard (diagnosed 2026-10-16 ~19:20 PDT):** after rehydration, the pinned Chromium in `.repro-cache/browsers` (inside the synced Desktop) loaded pages and handled `fill`, but `requestAnimationFrame` never fired. Clicks hung at Playwright's "visible, enabled and stable" check, and screenshots timed out. Every click-based browser test hit its deadline, base code `9aec7fe` included.

How it was isolated:
- A fresh Playwright download of the same build into the session scratchpad has 18/18 byte-identical files and renders normally, as does a flag-preserving copy of the cached tree outside iCloud.
- The cause is therefore executing Chromium from the iCloud-synced location while the iCloud daemon `bird` was at ~90% CPU, not the bytes or the `hidden` flag.
- Workaround used for verification: `PLAYWRIGHT_BROWSERS_PATH` pointing at a hash-identical copy outside iCloud.
- Probe script: `.repro-runs/cleanup-basis/raf-probe.mjs`.

Before trusting any browser failure here, probe animation frames first.

Still open: the original native htmx repetition-15 shutdown cause is unresolved. Current-candidate native (120/120) and Linux cohorts did not reproduce it, which is not a causal repair. Normal-run `CLEANUP_FAILED` evidence still cannot say which cleanup predicate failed (worker close, deadline, drain, or context-close rejection vs timeout); only the optional diagnostic observer distinguishes them. That gap is closed on the separate candidate branch `task/cleanup-failure-basis`, pushed at `a68bf03` (tested source `1ae6ffc`, worktree `.repro-runs/cleanup-basis/worktree`). `CLEANUP_FAILED` reasons now carry a validated, fixed-vocabulary `Cleanup basis:` clause. Prerequisites pass:

- **Ordinary:** 407/407, plus typecheck, lint, build and kit.
- **Functional browser:** the same 50-test selection, run with a byte-identical pinned Chromium outside iCloud (see the hazard note below).

Two rounds of automated subagent review are addressed. See `evidence/CLEANUP-BASIS-CANDIDATE.md` on that branch.

It changes harness bytes, so it has **no acceptance**. No native, installed-package or Linux cohort has run on it, and it must not be reported under `9aec7fe`'s acceptance.

**Candidate acceptance progress (19:55 PDT).** The native gates pass for tested source `1ae6ffc`. They ran in an outside-iCloud checkout with real dependencies and a byte-identical browser, and were copied into the candidate worktree (cohort `.repro-runs/cleanup-basis-acceptance/v2`):

- package smoke: 15 commands;
- installed schema-3: 18/18;
- native workflow: 15 measurements;
- native stability: **120/120**;
- independent native audit: 150 runs, 131 frozen inputs, 853 records, no timing findings.

No `CLEANUP_FAILED` occurred, so the htmx failure didn't recur.

**Linux for the candidate is blocked on an owner decision.** After a verified restart, the VM's Docker filesystem had only 2.1 GB free of 12 GB. The six labeled per-case images from the passed `9aec7fe` Linux cohorts (1.92 GB each, `retainedAsArtifact`) hold the space, and each new case needs two such builds. Profile `e` was stopped and verified with nothing executed and nothing deleted. Options:

1. Approve removing those six exact task-owned images (IDs and owner labels are in `vm-e-resume-v2/image-owner-labels.stdout.log`).
2. Approve enlarging the data disk; the host has about 14 GiB free.
3. Accept the candidate on native evidence only, without a Linux claim.

**Measured sizes** (read-only `docker system df -v` during a short restart at 20:05 PDT; VM stopped and verified afterwards; `vm-e-inspect-v3/`):
- Each of the six cohort images is 1.92 GB, of which about 1.556 GB is unique; the 368 MB node base is shared.
- The other 48 `image ls -a` entries are intermediate build-step images inside that accounting.
- The candidate cohort retains about 9.3 GB of new images. Option 1 therefore means deleting at least five of the six; option 2 means growing the data disk by about 7.5 GB.

The prepared candidate audit is `.repro-runs/cleanup-basis/linux-v2/audit-linux-candidate.py`, with its template diff alongside. The finalizer is `vm-e-resume-v2/finalize-resume.py.pending`, which needs its post-restart hashes filled in.

**Driver finding:** `docker image ls --quiet` hides untagged images under this Docker 29 store. The driver's foreign-image and terminal-inventory checks therefore cannot see them, and earlier "only base image retained" statements understated what was retained (corrected in the Linux report). Fix this in a future driver revision. Accessibility remains deferred. Full practical-beta acceptance is not claimed.

## Preserved Claude handoff checkpoint

October 16, 2026. The owner changed priority to transferring Repro to Claude and authorized committing/pushing the current branch to the existing private GitHub repository. After the already-running htmx Linux case finished, no new implementation or test cohort started. See [the self-contained handoff](CLAUDE_HANDOFF.md), [takeover prompt](CLAUDE_TAKEOVER_PROMPT.md), and [exact checkpoint receipt](evidence/CLAUDE-HANDOFF-CHECKPOINT.json). Final publication SHA/readback is recorded separately in the delivery manifest after this commit; no main merge, force push, visibility change or deployment is authorized.

The preserved implementation is `9aec7fe`, with native acceptance recorded at `f72c722`: 382/382 ordinary and 50/50 selected functional browser tests; types/lint/build/kit; 15 package smoke commands; 18/18 installed schema-3 v2 operations; 30 native workflow executions and 120/120 native stability runs. Earlier failed cohorts and retained profiles remain intact. These are retained results, not fresh executions after the documentation-only handoff.

The owner explicitly approved isolated Repro Colima profile `e`, including automatic guest SSH host-key generation, after the historical approval-pending section below. Fresh Linux morphdom and htmx each passed 44 operations, totaling **88 operations /95 distinct executions /80 readable stability tests**. Independent read-only partial audit found no discrepancies across 88 containers and 4,575 immutable file records. **Marked's 44 operations remain unrun by the handoff priority change**; full fresh Linux and practical-beta acceptance remain incomplete. The older profile-d cohort cannot fill this gap.

Only profile `e` was stopped after exact ownership/birth/daemon and empty container/volume checks. Stop exited0; Lima reported Stopped and the original hostagent was absent. The first verifier then rejected Docker's JSON empty-string unavailable-endpoint response; that failure is preserved. A separate read-only resolution confirmed stopped status, absent original process and Docker socket, and retained root/data disks. No stop was repeated. Task-local shared usernet was excluded from manual shutdown. No game-session resource or shared service was touched.

Original native htmx shutdown cause remains unresolved; later passing runs are not a causal repair. Eight accessibility-focused or mixed browser scenarios, native zoom and actual screen-reader evaluation remain deferred/unverified. The historical denied browser route remains untried. All acceptance/security thresholds are unchanged. The handoff bundle includes only reviewed source/docs and explicitly listed evidence; profiles, credentials, caches and VM disks stay local.

## Preserved native acceptance checkpoint

# Current work — startup repair and fresh native acceptance passed

October 16, 2026. Implementation commit `9aec7fe` on `task/startup-owner-boundary` repairs the original three cleanup assertions while retaining profiles whenever completion cannot be certified. The fixed worker requires sealed execution and actual timely natural completion; acquired browser contexts also require a fresh supported close acknowledgment. This is trusted pinned-browser lifecycle handling, not arbitrary native descendant containment. All previous work, failures and retained profiles remain preserved.

Final prerequisites passed on stable bytes: **382/382 ordinary tests and 50/50 selected functional browser tests**, plus types, lint, build and kit. Fresh package smoke passed **15 commands**; installed schema-3 v2 passed **18 operations**; native workflows passed **15 measurements / 30 browser executions**; native stability passed **120/120** (20 alternating buggy/fixed pairs for each of the three pinned cases). The independent audit checked **150 unique native run IDs, 132 frozen inputs and 854 records**, with no timing findings. A final builder revalidated 1,253 files. See [fresh native acceptance and remaining blockers](evidence/STARTUP-CLEANUP-NATIVE-ACCEPTANCE.md) and [the exact receipt](evidence/startup-cleanup-native-acceptance.json).

The first installed schema-3 cohort remains failed: 4 passed, 1 reporter-format failure, 13 unattempted. Its readable buggy result was correct; Node 26 defaulted to the spec reporter while the driver expected TAP. A separately calibrated driver explicitly selected TAP for the fresh v2 cohort. Product bytes, assertions, budgets and historical denominators were unchanged.

The original htmx fixed repetition-15 cleanup failure remains causally unresolved. Two separate passive diagnostic runs had complete lifecycle coverage and expected outcomes: close promises settled in 14.580/16.739 ms, with 0.734/0.769 ms after direct-child close; profile removal followed actual worker close. This did not reproduce the old failure or establish a causal repair. The old runner merges close rejection and timeout, and its census did not retain descendant executable names or per-PID timelines. Do not extend green diagnostics or label the historical cause fixed without new supporting evidence.

Fresh Linux acceptance is **unrun, pending explicit approval** to start the new Repro-only Colima profile `e` under `.repro-cache/pb`, including automatic guest SSH host-key generation. The existing client identity would be reused under unchanged 2 CPU / 3 GiB, no-host-mount, no-agent, no-public-port controls and the approved policy hash. No VM startup or credential generation occurred in this continuation; no approval denial was reported. Eight accessibility-focused or mixed browser scenarios, native zoom and actual screen-reader evaluation remain deferred/unverified. The historical denied browser route was not retried. No other session, shared service, security setting, publication, remote CI or deployment was changed. Practical-beta completion is not claimed.

## Preserved implementation and prerequisite checkpoint

# Current work — startup worker repair under verification

October 16, 2026. Working on `task/startup-owner-boundary`, from the initially clean `49d162a`. Only Repro resources are in scope; the separately running game session must remain untouched. No shared service, unrelated process, native security helper, credential, security setting, publication, or deployment has been changed.

Implemented a fixed per-run browser worker, parent-owned profile finalization, a sealed no-process completion path, short-deadline acquisition joining, and explicit missing-cache prerequisites. Worker source/bundle identity is included in the independent harness and capsule checks. Any attempted process creation without an acquired/acknowledged browser context still retains its profile as cleanup failure. This is not native descendant containment. See [current boundary implementation and preserved review](docs/STARTUP-OWNER-BOUNDARY.md).

Fresh baseline reproduced the three original failing cleanup assertions: focused 11/12 and affected browser 13/15. The safe parent-revision comparison showed the old deadline test could pass its immediate deletion assertion while the profile later reappeared. Logs and original profiles remain under ignored `.repro-runs/startup-repair-20261016/`; no historical failure was replaced. Initial worker integration passed startup12/12, diagnostics6/6, lifecycle3/3 and packaging48/48. The first full ordinary run was368/369: a test-only source-worker readiness wait expired under parallel load. Its log is preserved as `ordinary-worker-v1.log`.

Independent review subsequently found and reproduced the output-path mutation race, cancellation after reset acknowledgment, bundled Playwright import before the creation fence, acquired already-disconnected context acceptance, and client request/receipt/liveness gaps. Repairs and focused failing-before/passing-after evidence are being integrated. These interim counts do not establish final prerequisite or acceptance completion. Rebuild and rerun all final prerequisites on stable bytes before freezing fresh acceptance.

Final prerequisites now pass on unchanged execution inputs: **382/382 ordinary tests, 15/15 affected browser tests and 35/35 remaining functional browser tests**, plus full TypeScript, lint, build and kit checks. See [the repair checkpoint](evidence/STARTUP-CLEANUP-REPAIR.md) and [exact input/log hashes](evidence/startup-cleanup-verification.json). The earlier interim failures above remain preserved.

Root owns integration. Fresh native workflow/stability, installed schema3 package checks, Linux arm64 verification and original htmx stage diagnostics are being prepared under distinct ignored paths. Do not run the historical drivers unchanged or reuse their output directories. Preserve the existing thresholds, approved policy SHA256, owner-only resource controls, all failed runs, and accessibility deferral. The original htmx fixed repetition15 remains unresolved; a new green sample alone cannot establish its cause or repair. No fresh acceptance has yet run on this candidate, and no full deployment is claimed.

## Preserved startup-boundary checkpoint

# Current work — complete startup ownership requires a stronger platform boundary

Continued from clean `51ee29a` / `e67b573` on `task/startup-owner-boundary`. The safety repair and all product/cleanup/security requirements remain unchanged. Installed API and supervisor review found no complete native macOS descendant-completion authority: direct-child handles, launcher exit, group disappearance and sampled ancestry can miss a detached descendant. Four new deterministic process-boundary/fixture tests pass, including a writable surviving descendant after launcher close and group disappearance, deadline/rejection retention, late completion, confirmed controlled shutdown/deletion, unrelated-process isolation and failed fixture readiness. They do not implement a complete startup owner.

The [concrete architecture note](docs/STARTUP-OWNER-BOUNDARY.md) describes a per-launch native owner outside a sealed Playwright worker: a verified Linux subreaper/all-child join, and a separate supported macOS descendant-tracking capability. The macOS candidate requires legitimate entitlement/signing, a suitable SDK and compatibility/event-completeness verification; no new permission/API probe or security change occurred. No material alternative was installed. This is an implementation/platform prerequisite, not a current tool/service denial.

Final fresh checks: 326/327 ordinary, 13/15 affected browser with diagnostics disabled, types/lint/build/kit and fixture syntax passed. The same three profile-removal assertions remain failed. A test-fixture readiness regression was observed red (launcher exit 0 rather than 1) and repaired; all attempts remain in `.repro-runs/startup-owner-boundary/`. Fresh acceptance was not started because prerequisite checks fail. Original htmx repetition 15 stays separately unresolved; accessibility stays deferred/unverified. No completion claim, release, merge, push, container run or broad diagnostic cohort occurred.

## Preserved partial startup safety checkpoint at e67b573

Continuation from verified `bcc67d2` / `3e1b2b7` is on `task/startup-cleanup-ownership`. Commit `51ee29a` fixes a deterministic unsafe-deletion path: rejected browser launch could remove a profile while a controlled real owner could still write it. The adapter now retains profiles when failed launch provides no shutdown acknowledgment. Deadlines, security controls, ownership checks and existing cleanup assertions are unchanged. This is a partial safety repair, not completed cleanup.

Fresh results: new regressions 5/5 after two intended red failures; ordinary tests 322/323; affected browser tests 13/15 with diagnostics disabled; types/lint/build/kit passed. The three remaining failures require profile removal after failed launch; profiles and failed logs are preserved. No fresh acceptance cohort ran because these prerequisite checks failed. The missing per-launch completion boundary is an implementation gap, not a current service denial or permission hold. Original htmx repetition 15 remains separately unresolved; accessibility remains deferred/unverified. See [source evidence, results and remaining checks](evidence/STARTUP-CLEANUP-OWNERSHIP.md). Raw new evidence is under `.repro-runs/startup-cleanup-ownership/`; prior logs and profiles are unchanged.

## Preserved htmx teardown checkpoint at 3e1b2b7

Continuation from clean verified `1ecca68` is on `task/htmx-cleanup-investigation`; `bcc67d2` adds opt-in monotonic teardown and owned-process observations with regressions. The original failed fixed repetition 15, its profile, and all prior logs remain preserved. Budgets/security/acceptance criteria are unchanged. Accessibility remains deferred/unverified. No release, merge, push, container operation, denied-route retry or completion claim occurred.

Fresh checks: 318/318 ordinary tests, types/lint/build/kit, and one bounded 40-command htmx diagnostic sequence with 20 expected buggy failures and 20 fixed successes. Independent audit found no discrepancies. Those 40 are diagnostics, not acceptance; the original close failure did not recur, so no causal lifecycle repair is established.

The affected native adapter/fault selection passed 14/15 and exposed a separate 100 ms morphdom startup-deadline `PROFILE_CLEANUP_FAILED`. Its profile and failed receipt remain. The test compiler also retained 13 TMPDIR entries; process censuses were empty. One separately bounded startup probe returned `DEADLINE` with profile absent and showed launch rejection/removal preceding Node child-exit delivery. It did not reproduce the deletion errno, establish kernel liveness at deletion, or replace the failed test.

Missing evidence remains an instrumented failing htmx teardown (helper branch, eventual settlement, lifecycle/process/profile correlation), plus the separate failed startup deletion's errno/timeline. No speculative repair or new 20-pair acceptance rerun was performed. Repaired-build native acceptance and affected fresh-environment verification remain unexecuted. This is not a current tool/service denial or a new permission request. See [investigation](evidence/HTMX-CLEANUP-INVESTIGATION.md) and [exact receipt](evidence/htmx-cleanup-investigation.json); raw task evidence stays under ignored `.repro-runs/htmx-cleanup-investigation/`.

## Preserved practical-beta checkpoint at 1ecca68

The owner clarified that no-retry is not a blanket pause. The prior beta-wide hold at `921f14c:STATE.md:11` was a project interpretation, not an observed beta service denial, and is superseded. The historical Chrome CUA `net::ERR_BLOCKED_BY_CLIENT` restriction remains respected: no retry, probe, alternate route or security change occurred. Accessibility is deferred/unverified. Existing scoped approval of policy `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b` covers the three pinned cases under the unchanged frozen controls.

Baseline `88fedc530152b786fdb8ac76a867ddbcd8229201` was clean and verified before edits (84 overlapping identity checks). Branch `task/practical-beta` retains all prior commits and logs. The owner has not authorized release publication, main merge, visibility changes or paid services. No push or remote CI occurred. Do not mark this goal complete: native htmx stability has a real unresolved cleanup failure.

Schema 3, actual pinned upstream cases, frozen independent assertions, bounded reduction, readable exports and case-selection workbench journeys are implemented. Resumed failures drove browser HOME/cache ownership, verified container init, canonical init-path handling, exact census deadlines and completed-by-cutoff process/file observations. Commits `5fa1917`, `4342a27`, `c4c5abe`, `c946214`, `2ce4bd5` and `75e973c` preserve those changes and their observed red/green regressions. No acceptance threshold or security boundary was loosened.

Current code evidence: 310/310 ordinary unit/contract tests, 50/50 functional browser tests, typecheck/lint/build, and 15 bounded installed-package commands passed. The eight accessibility-focused/mixed browser tests are not included in that final selection. An earlier selection accidentally ran three deferred tests; all outcomes remain preserved, not counted as accessibility completion. Package smoke uses the host pinned browser and task cache and predates the final status-document edits.

All three full native CLI workflows passed independent inspection: 15 measurements, 30 actual executions, 118 frozen input identities. Fresh Linux profile d completed and independently audited all three workflows plus 20 alternating buggy/fixed exported-test pairs per case: 132 operations, 120 readable tests, 144 distinct actual executions. Exact source/assertion/harness/context identities, fresh no-cache acquisition, kernel limits, cleanup deadlines and unrelated sentinels passed. Final Docker container/volume inventories are empty; profile d is stopped with disks/images/logs preserved. Prior failed profiles b/c are stopped. The three archived capsules match the native exports and Linux final contexts byte for byte.

Native stability remains failed/incomplete. `native-stability-v4` recorded 69 completed tests, one failed htmx fixed pair 15 and 50 unattempted rows. The expected assertion executed once with `['true', 'clicked']`, but shutdown acknowledgement missed the existing limit. Result `CLEANUP_FAILED` and its owned `.profile` remain at `.repro-runs/readable-fixed/202a6e1c-caea-4f7b-a079-1b087e7dd846/`. Later process/TMPDIR cleanup does not cure that product failure. Ten bounded phase-timing diagnostics did not reproduce the delay; they are not replacement acceptance evidence. The independent Marked continuation is recorded separately in the current report and does not rewrite the stopped cohort's denominator.

Remaining work: establish the intermittent close-delay cause, make an evidence-backed repair without relaxing limits, then complete the native htmx gate and affected final-candidate verification. No causal repair is established by the current evidence; an ephemeral-context change would be speculative. This is not an approval or service-access blocker. Native zoom still separately requires the provider to legitimately permit the original supported route, and actual screen-reader work requires supported operation/output observation plus owner resumption of deferred scope.

Current report: [practical-beta progress](evidence/PRACTICAL-BETA-PROGRESS.md); [verification receipt](evidence/practical-beta-verification.json). Earlier [native JSON](evidence/practical-beta-native.json) retains its historical cutoff. Raw evidence and failed attempts stay under ignored `.repro-runs/practical-beta/`; a clone without it cannot claim fresh revalidation. Root owns integration. Preserve unrelated history, archived failures and the retained profiles; do not replace a failed stability cohort with repeated green attempts.

## Preserved completed local alpha

The owner instructed “lets ignore the accessibility part for now, /goal resume”. That prospective scope change supersedes the accessibility-only blocked state below. The original native-zoom and screen-reader criteria remain deferred/unverified; do not mark them passed or retry the denied route. [Current completion audit](evidence/LOCAL-ALPHA-COMPLETION.md) maps R0–R10 to actual evidence and the explicit exception. All other supported local-alpha requirements were independently audited with no remaining blocker.

This increment changes only goal/acceptance, README, design and evidence/state documentation. Current code and artifact identities still match the reviewed inventory correction, 214-unit result, 39-browser result, installed package and Linux payload. Those are retained results, not fresh executions. The bounded comparator is delivered; human-study freeze/evaluation, broad app support and pending diagnostics remain separately scoped. Historical failures and absent handoff material are preserved as disclosed.

Root owns final integration. The audited implementation baseline is `f18d94ff00b0c76371e360f5f1c96a07730aabbc`; `task/defer-accessibility` contains this owner-directed documentation update. Final commit, private origin/main readback and scanned source archive identities are recorded after commit under `.repro-runs/accessibility-deferred/delivery/`; verify those receipts for delivery status. No runtime deployment, new package/image, remote CI or Library upload is implied. Keep the retained worktree and all useful excluded evidence. Future accessibility work requires the owner's decision to resume it and legitimate supported operation/observation, not another automatic capability-poll loop.

## Preserved blocked checkpoint

The resumed goal reached the blocked threshold after three consecutive goal turns with the same unavailable native-browser and screen-reader capabilities. The first turn also repaired and delivered the package-input guard; the next two read-only inventories confirmed no capability change. The preceding continuation was no progress, not a live-process wait. Independent reviews are complete, with no remaining actionable finding. No denied navigation, tests, builds or diagnostics were repeated during the final two checks. Resume only after legitimate tool access changes; the goal is not complete.

The implementation and provenance correction were delivered at `58fdf79d47d646cbfe2680acbfe4eb622f51a7ea`. Its source archive remains the latest archive; this state-only supplement is delivered separately in Git. The latest capability check still reports `browsers: []`, native Chrome listed, and no supported actual screen-reader operation/output observation. Required next actions remain the exact permitted loopback/native-200%-zoom workflow and actual screen-reader workflows described in [the blocker report](evidence/RELEASE-BLOCKERS.md). No security changes or new diagnostic proposal are authorized by this checkpoint.

## Preserved package input inventory correction

2026-10-15 (America/Los_Angeles). The resumed audit found and repaired a concrete omission in the two package-check source inventories: imported `assets/tokens.css` and build `tsconfig.json` were absent. Both callers now share the corrected explicit inventory. Six red mutation/missing-file cases became green; focused checks pass 10/10, and fresh unit/contract checks pass 214/214 with typecheck, lint and script syntax checks. Independent code review found no actionable defect and reran the focused checks. [Correction and limits](evidence/PACKAGE-INPUT-PROVENANCE.md), [exact receipt](evidence/package-input-provenance.json).

All 27 previously recorded source entries, nine main build artifacts and seven retained command/UI logs still match. Tokens additionally match both CSS maps. No browser/package/Linux workflow was rerun and no old receipt was expanded retroactively. The guard compares endpoint hashes in a trusted checkout, not continuous immutability. Existing failures, original contrast-pilot limits and missing historical archives remain preserved as reported.

Root owns integration; `task/package-input-provenance` identifies the correction branch. Inspect current Git and `.repro-runs/package-input-provenance/delivery/` for the final delivery state. Keep the retained expectation-authoring worktree and all generated evidence. The goal remains incomplete. Fresh supported inventory again has no browser provider or actual screen-reader output observation; native 200% zoom and actual assistive-technology workflows remain unavailable. Do not bypass the original denial or restart unapproved diagnostics. Resume these gates only when the legitimate capabilities change; do not rerun unchanged suites for a newer timestamp.

## Preserved prior audit — two accessibility prerequisites

2026-10-15 UTC. Final independent R0–R10 audit at source `f60a3f5fff2926cf4f3e66880ab148c7c8ee6bff` identified no additional unfinished work in the supported release scope. Root revalidated 27 source hashes, nine main build artifacts, seven retained command/UI logs, the package observations, Linux assertion/harness identity and current private origin/main/source archive. Independent review additionally rehashed all 14 exported/build/executed Linux payload files and checked all 11 raw post-close process censuses. This is evidence revalidation, not fresh execution. [Audit and exact remaining prerequisites](evidence/RELEASE-BLOCKERS.md), [receipt](evidence/release-blocked-audit.json).

The same native-zoom and actual screen-reader blockers remained through authored delivery, HCI-materials correction and this audit. All independent authorized work found by the audit is delivered. Mark the persistent goal blocked, not complete; resume when the legitimate browser provider permits the exact loopback origin and an actual assistive-technology operation/observation surface is available. No denied navigation, alternate-control bypass, protection change or participant collection was attempted. The owned VM remains stopped; no unchanged expensive suite needs another run solely for this audit.

Git source/history is the current handoff. The latest source archive at `.repro-runs/hci-materials-v2/delivery/` identifies f60a3f5; the audit/state supplement is delivered in Git separately. No newer Library upload, runtime package, Linux image or deployment is implied. Root owns integration; inspect Git and the gate-audit delivery receipt before resuming. Do not erase historical evidence or the retained authored-workflow worktree.

## Preserved HCI materials checkpoint

# Current continuation — HCI materials correction

2026-10-15 UTC. Root corrected an independently identified R10 preparation gap after delivering the authored workflow. Protocol 0.2 and blank materials v2 preserve both assigned blocks, expected task/claim slots, original attempts, explicit endings and independent six-concept coding/adjudication. Static P/L inspection keys now ask only for evidence in the frozen historical schema-1 projection; live formative extensions remain separate. See [HCI-MATERIALS](evidence/HCI-MATERIALS.md) and its final structural/review receipt. No product runtime, analyzer, dependencies or frozen evidence changed; earlier test counts remain historical observations at their recorded builds.

The user-confirmed Impeccable context remains `docs/PRODUCT.md`, with `buildPath: code` in `.impeccable/config.json`; both installed plugins are available. No reinitialization, replacement installation or design change is needed.

This continuation rechecked the supported computer-use inventory: native Chrome appears as an app but browser providers remain empty, and there is no actual screen-reader speech-observation surface. Do not use the native app or another tool to evade the recorded loopback navigation denial. The active goal is incomplete for native 200% zoom and actual screen-reader workflow. No authorized product defect remains identified after this bounded materials correction; continue the two gates only when legitimate capabilities change. Human study authorization and broader research remain separately scoped, not permission to manufacture observations or add arbitrary product support.

Root owns integration. Inspect actual Git status and delivery receipt before resuming; non-force private origin/main delivery is already authorized. Documentation-only source handoff receipts belong under `.repro-runs/hci-materials-v2/delivery/`; no new npm package, Linux image, hosted deployment, remote CI or Library upload is implied. Keep the retained authored-workflow worktree and historical raw evidence intact.

## Preserved authored expectation checkpoint

# Current development state — authored expectation extension

2026-10-15 UTC. Continue the unchanged GOAL.md and acceptance contract. The missing explicit expected-behavior input is now implemented through CLI/API/UI schema 2, with unchanged schema-1 compatibility. The core and integration were independently reviewed; actual buggy/fixed observations and immutable assertion/harness identities were checked. Current report: [AUTHORED-RELEASE](evidence/AUTHORED-RELEASE.md), [summary](evidence/authored-release-summary.json). The active goal remains incomplete; do not mark complete or paused.

Final checks: 204 unit/contract and 39 browser tests pass with zero failed/skipped/cancelled; static/build and seven kit fixtures pass. Installed package: 11 commands, 12 unique assertions, separate zero-observed-survivor censuses. Rebuilt artifacts exactly equal the tested package. New three-action schema-2 capsule passed in a fresh restricted Linux image/container/volume; exact payload, two actual assertions, container/VM restrictions and stopped VM verified. Tested minimality remains unverified. Source aggregate: `8ae0b607943fd851e841165ae63952be752b6085cec85211f80f8e2ad3529755`.

Research-only P/L inspection pages now have 74 matched facts from five actual historical synthetic records, portable fixtures, technical rehearsal and closed independent source review. This is not participant evidence or a frozen/approved human-study comparison. Broader task families, human study, native zoom and actual screen-reader checks remain separate limitations.

Commits: `4352290` plan/spec, `fe738ba` frozen authored core, `a96a260` user input/persistence/package workflow, `ddf8d18` research fidelity. Final documentation/delivery commit is identified by Git and the post-commit delivery receipt. Root owns integration; main checkout and the retained isolated worktree must be inspected before further changes. All raw extension evidence is under `.repro-runs/expectation-authoring/worktree/.repro-runs/`; original reports and failures remain intact. Do not delete this worktree or its untracked node_modules symlink as cleanup that could remove evidence.

The user already selected existing docs plus the updated goal for Impeccable context and code-first for future interfaces. The existing workbench design was preserved. The detector's two pre-existing accent-border warnings were recorded without an unrelated redesign.

The user authorizes non-force delivery to the existing private origin/main. Final delivery receipts belong under main `.repro-runs/expectation-authoring/delivery/`. No remote CI or new Library upload is implied. The previous offline image archive remains schema 1; the new schema-2 package and local Linux image are separately documented.

Remaining release gates: native 200% zoom still requires a legitimately available native browser surface after the recorded ERR_BLOCKED_BY_CLIENT denial; actual screen-reader workflow needs supported assistive-technology operation and observation. Do not bypass the denial or substitute CSS/Axe for these checks. Do not rerun unchanged expensive checks merely to change hosts. A second physical host is an untested extension, not an added release gate. Preserve the exact approved VM/security constraints below if new runtime changes justify new Linux verification; profile r is stopped.

## Preserved earlier checkpoint — 15a8225

# Development state

2026-10-15 UTC. A working local synthetic alpha release candidate is prepared from the existing Repro implementation. The user’s active release goal remains incomplete for native 200% zoom and actual screen-reader verification. Do not mark the goal complete or paused, restart the implementation, or replace the supplied expectation. The current evidence is [RELEASE.md](evidence/RELEASE.md) and [release-candidate-summary.json](evidence/release-candidate-summary.json); the October 13 reports and Git history remain preserved as historical observations.

## Ownership and current source

Root owns integration and release delivery. The independent architecture/oracle/reducer, package, and accessibility reviewers completed their assigned work. Before resuming, inspect current Git status and active agents. Keep generated runs in ignored `.repro-runs/` and caches in `.repro-cache/`; do not ingest unrelated files, personal profiles or credentials.

Takeover base: `0902b3b11af847e2b930cbf091eda0261830efb4`. Coherent fixes: `c8cd87f` claims new CLI output directories without overwriting evidence; `cb4438d` rejects reused reducer run identities; `352f48b` repairs sidebar contrast and capture focus; `e385a54` initializes Impeccable product context and the user-selected code-first preference; `a0b327c` verifies installed/offline package workflows and distinct process censuses. No dependency versions or frozen assertion were changed. Inspect Git for the final documentation/release commit.

The user confirmed existing product documents plus the updated goal as durable context. `docs/PRODUCT.md` and `.impeccable/config.json` record that choice. Impeccable and Superpowers were found installed; no replacement installation or new visual redesign was needed.

## Current verified behavior

Fresh dependency installation and pinned Chromium acquisition succeeded. Kit checks (7 supplied model fixtures), strict typecheck, lint and build passed. Full unit/contract suite: **179 passed, 0 failed/skipped**. Full real-browser suite: **31 passed, 0 failed/skipped**. The browser suite includes UI history/inspector, interruption/recovery, cancellation, wrong-failure rejection, HTTP boundaries, keyboard focus and all 40 synthetic benchmark repetitions (20 buggy, 20 fixed; one family). npm audit reported zero known vulnerabilities at this check.

The complete executable demo captured, reproduced, reduced, compared, exported, imported and replayed the registered synthetic frontend. Five actions became three (`navigate`, `search-alpha`, `search-beta`) in 16 executions. Tested minimality remains **unverified** because final neighbors were inconclusive. Original expected behavior and independent harness identities were preserved. Demo evidence: `.repro-runs/demo/1e1e3394-fd07-4e4e-ba5a-faa28f03912e/summary.json`.

Installed package verification ran 15 commands and 8 actual assertions, including record/export/inspect/replay/verify and a conventional test in a separate capsule installed from the populated npm cache. Every command has a separate post-close census with zero observed owned survivors. PID ancestry was sampled every 100 ms and is not an exhaustive kernel process audit. [Package evidence](evidence/release-candidate-package.json).

All 26 build inputs remained unchanged and matched the working tree after the checks. Aggregate: `2210dd4dc2ef59f6b0401262bbdea59f5c52ee438e46f3f9497970410cf6ca99` (SHA-256 of the sorted source-hashes object serialized by JSON.stringify). Frozen assertion: `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`. The CLI and conventional test have different entrypoint harness hashes; each buggy/fixed pair uses one unchanged harness.

Actual three-action capsule passed in a fresh Linux arm64 image/container/evidence volume and again after saving/loading the acquired image into the same owned Docker daemon, using another fresh container/volume. Each buggy revision observed stale Alpha for beta; each fixed revision observed Beta for beta; each executed one assertion. All 14 payload files match the final exported capsule. The image is `sha256:52ca25c19ba791c95aa24c4b95a26a6c6e892d3fd8a0f3d29badb0856b009aaa`. The archive is `.repro-runs/release-candidate/delivery/repro-linux-arm64-offline.tar.gz`, 547,548,184 bytes, SHA-256 `1e1da4deffec9f5415dcc9df7672538795264cd9e2a60a04c489546616588740`. Gzip, OCI blob and all nine decompressed layer identities passed. Independent second-host archive import remains untested. [Linux evidence](evidence/release-candidate-linux.json), [offline instructions](docs/OFFLINE.md).

Keyboard workflows, 15 scoped Axe samples, responsive/error/cancellation screenshots and computed focus contrast were checked. The dark sidebar focus improved from 2.46:1 to 8.82:1; capture focus now continues into the workspace. The reviewer opened all 20 final images. The separate accessibility probe’s failed helper-process census remains preserved; its later post-script census found the observed helpers gone. [Accessibility evidence](evidence/release-candidate-accessibility.json).

## Preserved failures and scope

The contrast pilot remains 50 passing controls, 12 provisional passing measurements and 45 unattempted observations; it stopped at 899.40 MiB against a diagnostic 896 MiB gate and lacked a distinct post-close census. Raw historical artifacts were absent at takeover; tracked reports were preserved. The cap is not the original product definition. No mixed-result memory-transport prototype was installed or historical result relabeled. Current behavioral and cleanup checks do not establish a continuous native peak-memory claim. [ADR](docs/adr/0002-release-candidate-evidence.md).

Only the supplied registered synthetic frontend and expectation are implemented. Arbitrary app/expectation authoring, PostgreSQL, historical bug coverage, hostile execution, public deployment and human-study outcomes are not release results. Prepared HCI research and the previously verified synthetic analysis instrument remain available; participant work and broader comparator research are separate from the current release objective.

## Exact owned VM and container boundary

The user-approved seccomp SHA-256 remains `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`, adding only chroot to the earlier namespace policy. Repeated approval is unnecessary; this does not authorize another syscall, disabled Chromium sandbox, extra capability, public listener or arbitrary code.

The owned profile `r` is confirmed **Stopped**; the observed hostagent exited and no containers were running at shutdown. Retained images, exited containers and volumes are preserved. Do not restart it merely to move environments or rerun unchanged checks.

Precreate the task configuration directories before setting `COLIMA_HOME="$PWD/.repro-cache/c"`; also set `LIMA_HOME="$PWD/.repro-cache/c/_lima"`, `COLIMA_CACHE_HOME="$PWD/.repro-cache/colima-cache"`, `DOCKER_CONFIG="$PWD/.repro-cache/docker-config"`, and `DOCKER_HOST="unix://$PWD/.repro-cache/c/r/docker.sock"`. Scope them to the task, not global Docker configuration. Colima 0.10.3 ignored the initially nonexistent home override; the newly created default-location task profile was stopped/deleted before Repro execution. The correction and failure logs are retained.

Profile: 2 CPUs, 3 GiB memory, 12 GiB data disk, 8 GiB root disk, VZ, no host mounts, SSH-agent/key forwarding, SSH config update, context activation or template. On Colima 0.10.3/Lima 2.2.1, `--port-forwarder none` alone unexpectedly forwarded guest DNS on restart. The VM was stopped before reduced replay. The task-only full-range ignore rule with `guestIPMustBeZero:false` in CLOUD-SETUP.md then yielded no observed owned TCP listeners or UDP sockets before/after execution. The first unreduced sample’s no-forwarding boundary remains unverified; absence of a log line is not proof.

Replay container: USER node, network none, read-only root, cap-drop ALL, no-new-privileges, exact approved seccomp, pids128, memory1g, cpus2, tmpfs /tmp rw,nosuid,size256m, shm256m, fresh named evidence volume only, Chromium sandbox enabled. No host binds, credential/socket mounts, published ports or privileged mode. Docker29.5.2/OCI image storage was tested; no bit-identical OS rebuild or independent clean-host import is claimed.

## Delivery and continuation

The user already authorizes a non-force push of reviewed source/history to the existing private `https://github.com/xingzhao-ji/Repro.git`. Final artifact inventory and push/readback receipts are generated under `.repro-runs/release-candidate/delivery/`: `source-bundle.json`, `final-artifacts.json`, and `github.json`. Use those receipts and actual local/remote refs to establish the exact delivered commit. No GitHub Actions workflow is configured; a local pass is not remote CI. No hosted runtime was deployed.

The scanned source archive includes tracked source/assets/docs/tests plus its transfer inventory, excluding credentials, private local configuration, Git internals, run evidence, cache/VM data, installed dependencies and build output. The separate offline image intentionally includes its declared runtime dependencies. Earlier Library artifact `libfile_bdca044eb9e88191959b7cd8a492936c` is historical and contains the older checkpoint. A new Library upload is not claimed: the available upload tool requires a writable Page destination, and no current Library-upload capability/destination is available. The local archive and private Git repository provide the current handoff.

Remaining release checks:

1. Native Chrome navigation to the exact loopback URL previously returned `ERR_BLOCKED_BY_CLIENT`. Do not retry through another tool/browser or disable protections. The current supported inventory has no usable browser-control surface. Native 200% zoom needs that legitimate provider restriction resolved and real zoom observations. CSS zoom is not a substitute. [Recorded gate](evidence/NATIVE-ZOOM-GATE.md).
2. Actual screen-reader operation needs a supported assistive-technology control and speech/interaction observation surface. None is available in the current tools. Axe and semantic snapshots do not close this gate.

Continue those checks when legitimate capabilities become available, preserving their exact evidence and prior denial. Do not ask the user to redo already verified workflows, restart the product, silently narrow acceptance, claim human review, or mark the goal complete while these checks remain unverified.
