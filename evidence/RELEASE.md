# Local release evidence

Status: local synthetic alpha implemented; final native checks and the trusted standalone Linux arm64 capsule passed on 2026-10-13 UTC. The exact approved chroot profile was applied with all other restrictions preserved; no new security permission was needed. Native 200% Chrome zoom remains gated by the existing `net::ERR_BLOCKED_BY_CLIENT` restriction. Actual screen-reader usability and human HCI study are unrun. These checks remain distinct from passing technical, CSS reflow and automated accessibility samples. See [final Linux execution](LINUX-PACKAGED.md) and [independent HCI review](HCI-REVIEW.md).

The only supported target is the registered synthetic stale-response frontend. Capture is a consented scripted browser session. There is no arbitrary-site recorder, PostgreSQL adapter, arbitrary patch executor, historical-bug corpus, public hosting, LLM dependency or API key. [Supported scope](../docs/SUPPORTED-SCOPE.md), [usage](../docs/USAGE.md), [architecture decision](../docs/adr/0001-local-experiment-boundary.md) and [deployment prerequisites](../docs/DEPLOYMENT-PLAN.md) define the boundary.

## Environment and provenance

Development host: macOS arm64; Node 26.7.0, npm 11.19.0, Python 3.14.7, TypeScript 6.0.3, Playwright 1.64.0. Native pinned Chromium reports 156.0.8078.4. Dependencies come from official npm with exact lockfile versions and integrity values. See [dependencies](../docs/DEPENDENCIES.md).

The task-owned local VM runs Linux arm64 kernel 6.8.0-117 with Docker daemon 29.5.2. Colima 0.10.3/Lima 2.2.1 use project-owned ignored directories, no host directory mounts, no SSH-agent forwarding and no active Docker context change. The base image is pinned to `node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32`. No hosted runtime or cloud infrastructure was created. The user separately authorized private GitHub source/history delivery and a source-only Library handoff; delivery receipts identify completed external actions.

The original synthetic assertion digest is `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`. The expectation basis is the supplied synthetic specification, not human approval. The assertion executes in the trusted Node runner outside candidate browser code. Source and bundled harness digests differ intentionally because their executable artifact bytes differ; pair verification requires identical harness identity within each experiment.

## Gates

| Gate | Current status | Evidence / limitation |
| --- | --- | --- |
| R0 kit and provenance | Passed — 7/7 and kit structure | Seven supplied state-model fixture tests; these are not browser tests |
| R1 behavioral core | Passed for native supported fixture | Twenty buggy and twenty fixed repetitions with the same assertion and controlled inputs; wrong/empty/missing/deadline cases, actual renderer crashes and uncaught target exceptions are inconclusive |
| R2 reduction | Passed for bounded action reduction | Repeated acceptance, dependency closure, non-monotonic/unstable cases, execution/time budgets and final-neighbor evidence; no global-minimality claim |
| R3 portability | Passed for documented trusted Linux arm64 boundary | Final fresh capsule/image/container/volume passed; buggy/fixed each executed one unchanged assertion; exact approved policy and restrictions inspected |
| R4 persistence/cancellation | Passed within tested recovery scope | Owner locks, deduplication, immutable inputs, cancelled export cleanup, actual capture/reduction/export interruption and fresh retries; native owned-descendant exit observed at the capture boundary |
| R5 real UI | Partially verified; native 200% remains unverified | 390/768/1440 layouts, keyboard and CSS 200% checks; native 200% visual verification remains unverified |
| R6 isolation/privacy | Passed applicable trusted-synthetic checks | Allowlisted synthetic inputs/exports, no ambient profiles, bounded files, egress rejection, owner-scoped cancellation and literal malicious log rendering; public/hostile execution unsupported |
| R7 code health | Passed | Final strict typecheck/lint, 64 unit/contract tests, 24 browser checks and installed-package smoke |
| R8 benchmark integrity | Synthetic only | One failure family; historical evaluation not performed and not counted as passed |
| R9 release evidence | Delivered locally; authorized source delivery tracked separately | Current portable synthetic summary, raw retained local evidence, executable examples and documentation |
| R10 UI/UX/HCI | Technical/heuristic baseline and research/protocol drafts delivered | Ten images independently reopened; candidate interaction/comparator, full keyboard investigation, screen-reader/native zoom and human evaluation remain pending |

## Current final packaging checks

The final wording-corrected build passed `npm run build`, `npm run check:kit`, `npm run typecheck`, `npm run lint`, `npm test` (64/64), `npm run test:browser` (24/24) and `npm run test:package` with no skips. See [command/exit/log index](../.repro-runs/linux-chroot-approved/20261013-e1afc3f5b97e/final-wording-checks.json), [package receipt](../.repro-runs/package-smoke/run-iiBrLQ/summary.json), [Linux report](LINUX-PACKAGED.md) and [portable summary](linux-packaged-summary.json). The Linux run used the newly exported final capsule with 13 indexed artifacts plus integrity.json. Current source/build aggregate is `c0f5c970656052415b6b13763ed574ef033a995860d1c1f49e7a0fc50877001e`; all 78 files were checked.

The adapter, oracle, web source/server/tokens and four web build artifacts remain unchanged from the preceding visual/behavioral checkpoint. Thirty directly inspected screenshots remain applicable; fresh browser suites also passed. CLI/runner executable hashes changed because capsule documentation is bundled, and the new actual Linux harness identity is recorded separately. Earlier native results below retain their original identities and totals.

## Earlier native checkpoint

Commands ran from the repository with the pinned browser cache. All passing suites below report zero skipped, cancelled or todo tests. The completion audit repaired historical run attribution and added actual crash, live-operation interruption, malicious-log and historical-navigation checks. The final installed package rebuild changed only the web bundle and its source map relative to the previous checkpoint; CLI, runner and stylesheet bytes stayed identical.

| Exact command | Observed result | Log |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Passed; lockfile install, zero reported audit vulnerabilities | [install](../.repro-runs/release-final/install.log) |
| `node scripts/verify-fixtures.mjs` | 7/7 supplied state-model tests | [fixtures](../.repro-runs/release-final/fixture-checks.log) |
| `python3 scripts/check-kit.py` | Passed | [kit](../.repro-runs/release-final/kit-checks.json) |
| `npm run build` | Passed | [build](../.repro-runs/completion-audit/build.log) |
| `npm run typecheck` | Passed | [types](../.repro-runs/completion-audit/typecheck-final.log) |
| `npm run lint` | Passed | [lint](../.repro-runs/completion-audit/lint-final.log) |
| `npm test` | 62/62 passed | [unit/contract/adversarial](../.repro-runs/completion-audit/unit-final.log) |
| `PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers node --import tsx --test --test-concurrency=1 tests/*.browser.ts` | 24/24 passed: 22 integration checks plus 2 process-inspection checks; includes 40 actual benchmark runs | [browser](../.repro-runs/completion-audit/browser-final.log) |
| `npm run test:package` | Fresh local tarball install; installed executable; export/import; readable real-browser test passed | [package](../.repro-runs/completion-audit/package.log) |
| `node --check scripts/demo.mjs` | Passed | [demo syntax](../.repro-runs/release-final/demo-syntax.log) |
| `npm run demo` | Passed all six actual CLI steps with expected behavioral exit codes | [demo](../.repro-runs/release-final/demo.log) |

[Final benchmark summary](../.repro-runs/benchmark/91403fe7-757c-40ca-8bdf-32860a5fe68f/summary.json): 20/20 buggy target failures and 20/20 fixed requirement satisfactions, all with one executed frozen assertion. [Independent artifact review](../.repro-runs/completion-audit/benchmark-final-review.json) rechecks forty unique run identities, exact observations, response completion order and 120 artifact size/hash pairs. That is evidence validation, not an additional forty executions.

[Pinned-browser executable demo](../.repro-runs/demo/c9452ec5-fcaf-40c3-a5ba-c4bc1715a793/summary.json): five actions reduced to three in sixteen executions; original failure reproduced; registered fixed revision satisfies the assertion; thirteen capsule files validated; imported capsule replay reproduces the target failure. The current adapter and oracle source is unchanged from this demo; the CLI/runner bundle now differs because capsule packaging/documentation changed. The current package and Linux tests verify the new bundle separately. Minimality is **unverified** because some final deletion neighbors are inconclusive. Doctor's default Docker connection was unavailable; it does not silently select the separate task VM.

[Reviewed current-code screenshot index](../.repro-runs/ui/browser-7b77249f-d4e4-4ba9-9ccd-073b6db6ee3f/screenshots.json) contains nineteen primary screenshots, including all six primary views, dependencies and expanded artifact details at 390 pixels, comparison at 320/390/768/1024/1440 and CSS 200% layout. [Visual review](VISUAL-REVIEW.md) documents direct inspection of those nineteen plus nine historical-selection and two malicious-log images: thirty total. [Final accessibility sample](../.repro-runs/ui-review/75c67467-1a5b-43d8-823e-8fcb527f5fa4/accessibility.json): eight states, zero automated violations and zero incomplete checks. The reviewed images were captured against the final product UI; the later test-only inspection/cleanup changes did not alter that build. Final suite screenshot copies are indexed separately in the release summary. Native zoom and screen-reader verification are not inferred from these results.

The expanded-artifact mobile test was [observed failing](../.repro-runs/release-final/ui-expanded-red.log) before `min-width: 0` constrained the grid child. CLI [red](../.repro-runs/security-review/cli-adversarial-red.log) and [green](../.repro-runs/security-review/cli-adversarial-green.log) runs establish the output-link, FIFO and budget-validation repairs. [Security review](SECURITY-REVIEW.md) records their independent audit and remaining scope limits. A transient reviewer run overlapped `npm ci`; its failure is retained separately from the stable 62/62 rerun. No failed attempt is counted as a passed attempt.

## Completion-audit regressions

The [requirement audit](COMPLETION-AUDIT.md) maps every milestone and acceptance gate to exercised behavior or an explicit limit. It found a UI defect and three missing behavioral checks in the previous evidence:

- Historical Evidence run selection silently showed another job's reduction, comparison or export, and selection reset on refresh/navigation. The [red run](../.repro-runs/ui-history-red-2.log) observed eight failures. The [repaired workflow](../.repro-runs/ui-history/8afc17d9-7302-48a2-ba13-b574c519261a/summary.json) executes seven actual jobs and checks 23 attribution/navigation/recovery properties. The selected job now persists in the URL; unknown IDs show a recoverable error. Dependencies are explicitly the current capsule, with original job manifests retained in artifacts.
- Actual [renderer crash](../.repro-runs/fault-injection/c0889ec7-6526-4b17-95eb-e92150dcc881/page-crash/fault-injection.json) and [uncaught target exception](../.repro-runs/fault-injection/c0889ec7-6526-4b17-95eb-e92150dcc881/target-exception/fault-injection.json) tests observe the real fault events, unchanged identities and INCONCLUSIVE results with zero assertions. An observer callback throwing was narrower evidence and is no longer used as proof of a browser crash test.
- Actual Coordinator work is interrupted at [capture](../.repro-runs/recovery-browser/record-b3549c65-5a3d-49cc-a5f7-eaed025a0be3/summary.json), [reduction](../.repro-runs/recovery-browser/reduce-0469883a-2e3f-4a3b-ba73-8ef540d4af1d/summary.json) and [export](../.repro-runs/recovery-browser/export-2cb8838b-cd20-46ac-ae11-2a8b6e4a8e80/summary.json) boundaries with SIGKILL. Recovery preserves interrupted status, deduplicates the original request, and completes a fresh retry. 4 recorded capture descendants exited without test cleanup on this native host. Reduction had persisted two real target-failure baseline runs. Abrupt export retains its rejected partial directory and lock; a fresh retry exports to a new job directory. These are bounded observations, not universal crash-cleanup guarantees.
- An explicitly labeled [malicious-log fixture](../.repro-runs/ui-security/14a4e6fc-742b-437f-9b38-fbbb916eae94/summary.json) renders exact HTML/script payload text in the timeline and inspector without injected nodes, script effects, requests or page errors. The 390-pixel layout check passes. This tests persisted text rendering, not arbitrary capsule-code containment.

Independent review also repaired test harness handling of process-inspection failure and partial UI setup. [Inspection red](../.repro-runs/completion-audit/inspection-red.log) and [green](../.repro-runs/completion-audit/inspection-final-green.log) preserve the regression evidence. An [expected-failure setup probe](../.repro-runs/completion-audit/ui-setup-cleanup-proof.json) confirms both UI tests fail promptly and release their ledger lock when the configured browser is missing. This deliberate failure is recorded separately from passing product checks.

The [fresh package receipt](../.repro-runs/package-smoke/run-JRHsLc/summary.json) confirms installed CLI invocation, trusted export/import, and the exported conventional buggy/fixed browser test. It explicitly reuses the declared host Chromium asset and is separate from Linux portability.

## Prior observed runs

These runs preceded final integration repairs and are retained as development evidence, not a substitute for final checks.

- [Pinned browser suite](../.repro-runs/browser-pinned-final.log): 12 passed, zero failed/skipped. [Benchmark](../.repro-runs/benchmark/09775a31-eff6-4556-abe8-6ea41d184597/summary.json): 40 executed, 40 expected outcomes, zero unrun; one synthetic family.
- [Package/install smoke](../.repro-runs/package-smoke/run-WrErWC/summary.json): fresh local install, installed export/import and readable buggy/fixed browser test. Host Chromium was explicitly reused; this is not Linux evidence.
- [Recovery](../.repro-runs/recovery-green.log): two passed. An owned Node process was killed with durably running record/reduce/export ledger states; recovery marked those jobs interrupted. This did not kill Chromium during live capture or test orphan cleanup.
- [Independent UI review](../.repro-runs/ui-review/9d41c96e-4854-4185-928f-bec231eb2abd/summary.json): keyboard workflow, reconnect, malformed evidence handling, reflow and eight sampled accessibility states with zero automated violations/incomplete checks. This is not full WCAG or screen-reader certification.
- [Integration regression fixes](../.repro-runs/release-review-green.log): exact historical job inputs, complete structured trial JSON and malformed-token rejection.

## Historical failures and current unrun checks

The [Linux build](../.repro-runs/m0/linux-capsule-first-build.log) succeeded. The [default-policy replay](../.repro-runs/m0/linux-capsule-first-run.log) failed; both runs were inconclusive and executed no assertion. The [diagnostic](../.repro-runs/m0/linux-browser-diagnostic.log) identifies `No usable sandbox`. Browser sandboxing was not disabled.

[Proposal metadata](../.repro-runs/security-proposal/proposal.json) and [independent review](../.repro-runs/security-proposal/independent-review.json) describe the exact prepared policy, SHA-256 `0885450338aec8898e557b5f851a3042c82ea4740a87f4a33675d2755d13642d`. It preserves the actual current Docker policy and adds an unfiltered allow rule for `clone`, `setns`, `unshare`. This expands kernel namespace access. The user subsequently approved this exact profile and it was applied in the separately documented [current-build attempt](LINUX-REPLAY.md); the original default-policy failure remains historical evidence. The broader vendor seccomp profile was not adopted. No privileged container, extra capability, disabled sandbox or host network was substituted.

A computer-use navigation to the local review server returned `net::ERR_BLOCKED_BY_CLIENT`. That action was not retried through another tool. An independently started native-zoom experiment produced layout metrics but a cropped screenshot; it is not accepted as complete visual evidence. Native 200% visual review remains unverified. The [targeted diagnosis](NATIVE-ZOOM-GATE.md) confirms current exact-address server readiness and available Chrome connection, but no supported control to resolve the client restriction. Existing authorized Playwright application checks remain separate from the blocked navigation.

Early pinned-browser installation/probe failures and an initial UI `EVENT_OBSERVER_FAILED` run remain in development logs. Subsequent fresh pinned-browser and UI checks passed; no deterministic root cause was established for that earlier UI event failure. There are no claimed human reviews, real users, adoption statistics, historical-bug results, production-readiness claims or formal proofs.

## Independent review and delivery

[Integration review](INDEPENDENT-REVIEW.md) records concrete defects and repair evidence. Reviewers were separate agents for the relevant modules; the browser adapter reviewer authored that adapter, so no independent oracle-author claim is made. Privacy/reducer/UI reviews used other module authors and owned synthetic test data only.

The existing `task/repro-local-product` history is preserved. The user authorized a non-forced push to the existing private `xingzhao-ji/Repro` repository; inspect delivery receipts for confirmed remote state. The current [78-file content-hash inventory](../.repro-runs/linux-final/20261013-4419b9104f7e/content-hashes.json) identifies final runtime source, tests, scripts, fixtures, schemas, configuration, policy and built artifacts. Its aggregate SHA-256 is `c0f5c970656052415b6b13763ed574ef033a995860d1c1f49e7a0fc50877001e`. The earlier native inventory and aggregate `38c1893f248a16daf3aa7537512e42f24c871e1a62d11bb8c1e8290516942099` remain historical. Release narratives and usage documentation are excluded to avoid circular report hashes; fixture/schema asset metadata remains included. The local checkpoint is recorded in Git and the historical native [release index](../.repro-runs/completion-audit/summary.json); current portable results are in [linux-packaged-summary.json](linux-packaged-summary.json). Generated traces, screenshots, npm installations and VM data are intentionally ignored under `.repro-runs/` and `.repro-cache/`; the local links in this report require this workspace.

The task-owned VM was stopped after the final successful exact-policy run, with resources retained. Chroot approval is already fulfilled; no extra security change is needed. [LINUX-REPLAY](LINUX-REPLAY.md) is historical. Current execution and remaining native/HCI gates are in [LINUX-PACKAGED](LINUX-PACKAGED.md) and STATE.md.
