# Local release evidence

Status: local synthetic alpha implemented and native checks passed on 2026-10-13 UTC. Two release checks remain unverified below. This is not a completed Linux-portability release. The Linux test failed at browser sandbox launch with zero assertions. The reviewed per-container namespace policy is prepared but remains unapplied pending specific approval. Native 200% browser-zoom visual verification is also unverified after a browser navigation restriction; CSS 200% layout and narrow-viewport checks are separate evidence.

The only supported target is the registered synthetic stale-response frontend. Capture is a consented scripted browser session. There is no arbitrary-site recorder, PostgreSQL adapter, arbitrary patch executor, historical-bug corpus, public hosting, LLM dependency or API key. [Supported scope](../docs/SUPPORTED-SCOPE.md), [usage](../docs/USAGE.md), [architecture decision](../docs/adr/0001-local-experiment-boundary.md) and [deployment prerequisites](../docs/DEPLOYMENT-PLAN.md) define the boundary.

## Environment and provenance

Development host: macOS arm64; Node 26.7.0, npm 11.19.0, Python 3.14.7, TypeScript 6.0.3, Playwright 1.64.0. Native pinned Chromium reports 156.0.8078.4. Dependencies come from official npm with exact lockfile versions and integrity values. See [dependencies](../docs/DEPENDENCIES.md).

The task-owned local VM runs Linux arm64 kernel 6.8.0-117 with Docker daemon 29.5.2. Colima 0.10.3/Lima 2.2.1 use project-owned ignored directories, no host directory mounts, no SSH-agent forwarding and no active Docker context change. The base image is pinned to `node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32`. No cloud resources or remote publication were created.

The original synthetic assertion digest is `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`. The expectation basis is the supplied synthetic specification, not human approval. The assertion executes in the trusted Node runner outside candidate browser code. Source and bundled harness digests differ intentionally because their executable artifact bytes differ; pair verification requires identical harness identity within each experiment.

## Gates

| Gate | Current status | Evidence / limitation |
| --- | --- | --- |
| R0 kit and provenance | Passed — 7/7 and kit structure | Seven supplied state-model fixture tests; these are not browser tests |
| R1 behavioral core | Passed for native supported fixture | Twenty buggy and twenty fixed repetitions with the same assertion and controlled inputs; wrong/empty/missing/deadline cases are inconclusive |
| R2 reduction | Passed for bounded action reduction | Repeated acceptance, dependency closure, non-monotonic/unstable cases, execution/time budgets and final-neighbor evidence; no global-minimality claim |
| R3 portability | **Blocked / unverified on Linux** | Fresh npm package/install passed previously; Linux image built, but Chromium sandbox failed with zero executed assertions |
| R4 persistence/cancellation | Passed within tested recovery scope | Owner locks, deduplication, immutable job inputs, cancelled export cleanup and interrupted ledger recovery; no orphan-browser crash-cleanup claim |
| R5 real UI | Partially verified; native 200% remains unverified | 390/768/1440 layouts, keyboard and CSS 200% checks; native 200% visual verification remains unverified |
| R6 isolation/privacy | Passed applicable trusted-synthetic checks | Allowlisted synthetic inputs/exports, no ambient profiles, bounded files, egress rejection, owner-scoped cancellation; public/hostile execution unsupported |
| R7 code health | Passed | Strict typecheck, lint, 62 unit/contract tests, real browser suites and installed-package smoke |
| R8 benchmark integrity | Synthetic only | One failure family; historical evaluation not performed and not counted as passed |
| R9 release evidence | Delivered locally | This report, machine-readable summaries, raw ignored run data, schemas, executable demo, reviews and documentation |

## Final native checks

Commands ran from the repository with the pinned browser cache. All passing suites below report zero skipped, cancelled or todo tests. The final CSS repair affected expanded mobile evidence; its UI and accessibility suites were rerun after rebuilding. Core/runtime source did not change after the 15-test browser run.

| Exact command | Observed result | Log |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Passed; lockfile install, zero reported audit vulnerabilities | [install](../.repro-runs/release-final/install.log) |
| `node scripts/verify-fixtures.mjs` | 7/7 supplied state-model tests | [fixtures](../.repro-runs/release-final/fixture-checks.log) |
| `python3 scripts/check-kit.py` | Passed | [kit](../.repro-runs/release-final/kit-checks.json) |
| `npm run build` | Passed | [build](../.repro-runs/release-final/build.log) |
| `npm run typecheck` | Passed | [types](../.repro-runs/release-final/typecheck.log) |
| `npm run lint` | Passed | [lint](../.repro-runs/release-final/lint.log) |
| `npm test` | 62/62 passed | [unit/contract/adversarial](../.repro-runs/release-final/unit.log) |
| `PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers node --import tsx --test --test-concurrency=1 tests/*.browser.ts` | 15/15 passed, including 40 actual benchmark runs | [browser](../.repro-runs/release-final/browser.log) |
| `PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers node --import tsx --test tests/ui.browser.ts tests/ui-review.browser.ts` | 3/3 passed after expanded-artifact reflow repair | [final UI](../.repro-runs/release-final/ui-additional-states.log) |
| `npm run test:package` | Fresh local tarball install; installed executable; export/import; readable real-browser test passed | [package](../.repro-runs/release-final/package.log) |
| `node --check scripts/demo.mjs` | Passed | [demo syntax](../.repro-runs/release-final/demo-syntax.log) |
| `npm run demo` | Passed all six actual CLI steps with expected behavioral exit codes | [demo](../.repro-runs/release-final/demo.log) |

[Final benchmark summary](../.repro-runs/benchmark/b93b7e26-fcf7-4a29-a06f-35ad346366dd/summary.json): 20/20 buggy target failures and 20/20 fixed requirement satisfactions, all with one executed frozen assertion. [Independent artifact review](../.repro-runs/release-final/benchmark-review.json) rechecks forty unique run identities, exact observations, response completion order and 120 artifact size/hash pairs. That is evidence validation, not an additional forty executions.

[Final pinned-browser demo](../.repro-runs/demo/c9452ec5-fcaf-40c3-a5ba-c4bc1715a793/summary.json): five actions reduced to three in sixteen executions; original failure reproduced; registered fixed revision satisfies the assertion; thirteen capsule files validated; imported capsule replay reproduces the target failure. Minimality is **unverified** because some final deletion neighbors are inconclusive. Doctor's default Docker connection was unavailable; it does not silently select the separate task VM.

[Final screenshot index](../.repro-runs/ui/browser-d0743414-7d64-4356-9d81-f49bb126a412/screenshots.json) contains nineteen actual screenshots, including all six primary views, dependencies and expanded artifact details at 390 pixels, comparison at 320/390/768/1024/1440 and CSS 200% layout. [Visual review](VISUAL-REVIEW.md) documents direct image inspection. [Final accessibility sample](../.repro-runs/ui-review/b52913ac-0db7-4de7-8909-9f07bff12c93/accessibility.json): eight states, zero automated violations and zero incomplete checks. Native zoom and screen-reader verification are not inferred from these results.

The expanded-artifact mobile test was [observed failing](../.repro-runs/release-final/ui-expanded-red.log) before `min-width: 0` constrained the grid child. CLI [red](../.repro-runs/security-review/cli-adversarial-red.log) and [green](../.repro-runs/security-review/cli-adversarial-green.log) runs establish the output-link, FIFO and budget-validation repairs. [Security review](SECURITY-REVIEW.md) records their independent audit and remaining scope limits. A transient reviewer run overlapped `npm ci`; its failure is retained separately from the stable 62/62 rerun. No failed attempt is counted as a passed attempt.

## Prior observed runs

These runs preceded final integration repairs and are retained as development evidence, not a substitute for final checks.

- [Pinned browser suite](../.repro-runs/browser-pinned-final.log): 12 passed, zero failed/skipped. [Benchmark](../.repro-runs/benchmark/09775a31-eff6-4556-abe8-6ea41d184597/summary.json): 40 executed, 40 expected outcomes, zero unrun; one synthetic family.
- [Package/install smoke](../.repro-runs/package-smoke/run-WrErWC/summary.json): fresh local install, installed export/import and readable buggy/fixed browser test. Host Chromium was explicitly reused; this is not Linux evidence.
- [Recovery](../.repro-runs/recovery-green.log): two passed. An owned Node process was killed with durably running record/reduce/export ledger states; recovery marked those jobs interrupted. This did not kill Chromium during live capture or test orphan cleanup.
- [Independent UI review](../.repro-runs/ui-review/9d41c96e-4854-4185-928f-bec231eb2abd/summary.json): keyboard workflow, reconnect, malformed evidence handling, reflow and eight sampled accessibility states with zero automated violations/incomplete checks. This is not full WCAG or screen-reader certification.
- [Integration regression fixes](../.repro-runs/release-review-green.log): exact historical job inputs, complete structured trial JSON and malformed-token rejection.

## Failed and unrun checks

The [Linux build](../.repro-runs/m0/linux-capsule-first-build.log) succeeded. The [default-policy replay](../.repro-runs/m0/linux-capsule-first-run.log) failed; both runs were inconclusive and executed no assertion. The [diagnostic](../.repro-runs/m0/linux-browser-diagnostic.log) identifies `No usable sandbox`. Browser sandboxing was not disabled.

[Proposal metadata](../.repro-runs/security-proposal/proposal.json) and [independent review](../.repro-runs/security-proposal/independent-review.json) describe the exact prepared policy, SHA-256 `0885450338aec8898e557b5f851a3042c82ea4740a87f4a33675d2755d13642d`. It preserves the actual current Docker policy and adds an unfiltered allow rule for `clone`, `setns`, `unshare`. This expands kernel namespace access; GOAL.md requires specific approval before applying it. The broader vendor seccomp profile was not adopted. No privileged container, extra capability, disabled sandbox or host network was substituted.

A computer-use navigation to the local review server returned `net::ERR_BLOCKED_BY_CLIENT`. That action was not retried through another tool. An independently started native-zoom experiment produced layout metrics but a cropped screenshot; it is not accepted as complete visual evidence. Native 200% visual review remains unverified. Existing authorized Playwright application checks remain separate from the blocked navigation.

Early pinned-browser installation/probe failures and an initial UI `EVENT_OBSERVER_FAILED` run remain in development logs. Subsequent fresh pinned-browser and UI checks passed; no deterministic root cause was established for that earlier UI event failure. There are no claimed human reviews, real users, adoption statistics, historical-bug results, production-readiness claims or formal proofs.

## Independent review and delivery

[Integration review](INDEPENDENT-REVIEW.md) records concrete defects and repair evidence. Reviewers were separate agents for the relevant modules; the browser adapter reviewer authored that adapter, so no independent oracle-author claim is made. Privacy/reducer/UI reviews used other module authors and owned synthetic test data only.

The repository is on local branch `task/repro-local-product`, with no remote. The [content-hash inventory](../.repro-runs/release-final/content-hashes.json) identifies final runtime source, tests, scripts, fixtures, schemas, configuration and built artifacts. Its aggregate SHA-256 is `bde059fc105c18646ecef6a3a3386aa344fcd96612db316948e54c4603915560`. Narrative documentation is excluded to avoid circular report hashes. The local checkpoint is recorded in Git and the machine-readable [release index](../.repro-runs/release-final/summary.json). Generated traces, screenshots, npm installations and VM data are intentionally ignored under `.repro-runs/` and `.repro-cache/`; the local links in this report require this workspace.

The task-owned VM was stopped after verification preparation; its state is retained under ignored project directories. Resuming the Linux gate requires the pending specific authorization, restarting that owned VM, exporting the current trusted build to a new directory, and testing the exact approved profile. No approval is inferred from elapsed time.
