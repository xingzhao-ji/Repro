# Repro handoff status — 2026-10-15

Development, experiments and diagnostics are stopped at the owner's request. This handoff preserves source and useful reviewed material for the owner to take over. It does not claim release completion, authorize a new run or adopt pending proposals. No product tests or runtime experiments were executed to write this document; the results below are prior recorded observations.

## Product and source map

Repro is a working local synthetic alpha for one registered stale-response web fixture. It captures an explicit opt-in scripted alpha/beta interaction, evaluates the frozen expected behavior against separate buggy/fixed implementations, reduces supported actions under a budget, and exports an integrity-checked capsule and readable test. The workbench uses the same real backend as the CLI. Core execution needs no account, LLM or API key.

| Area | Repository paths and implemented scope |
| --- | --- |
| CLI and service | `src/cli.ts`, `src/service.ts`, `src/server.ts`; doctor, record, replay, reduce, verify, export, inspect and local serving; capsule import through `--capsule` |
| Contracts and execution | `src/contracts.ts`, `src/manifest.ts`, `src/adapter.ts`, `src/oracle.ts`, `src/reducer.ts`; explicit reset, controlled HTTP responses, frozen assertion, bounded action/dependency-group reduction |
| Persistence and evidence | `src/ledger.ts`, `src/evidence-inspector.ts`, `src/capsule.ts`, `src/paths.ts`; job/event history, immutable run inputs, scoped cancellation/recovery, validated exports and exact selected-run attribution |
| UI | `web/main.tsx`, `web/style.css`, `web/evidence-source.ts`; live capture/reduction/comparison/export flows, consent, timeline, selected-run inspection, clear outcome/operation distinction |
| Fixture | `fixtures/browser-search/`, `fixtures/search-stale-response/`; supplied synthetic buggy/fixed family, not held-out historical bugs |
| HCI tooling | `scripts/build-hci-study.ts`, `scripts/freeze-hci-case.ts`, `scripts/analyze-hci.ts`, `web/hci-*`, `research/hci/`; case/comparator preparation and tested synthetic analysis, no participant results |
| Diagnostics | `scripts/lifecycle-diagnostics.ts` and focused tests; opt-in instrumentation, not a new product feature or adopted lifecycle hold |

Useful existing repairs include CLI evidence preservation and export cancellation, adapter startup resource ownership, schema-preflight consistency, sidebar focus contrast and the narrow inspector shadow removal. Source, tests and documentation are the implementation; generated builds and installed dependencies are recreated from the lockfile. See [the local exclusion inventory](EXCLUDED-LOCAL.md) for excluded material and the portable research archive under `handoff/offline-research/`.

Unsupported scope includes arbitrary websites/candidate patches, real-user/manual recording, production profiles/authentication, PostgreSQL/state reduction, public untrusted execution and general historical-bug effectiveness. The current fixture requires no database. The supplied synthetic specification is the expectation basis; human approval is not claimed.

## Prior verification and its limits

Counts in different rows measure different things and must not be added. Exact recorded candidate identities matter; these are not fresh handoff runs.

| Evidence | Recorded result | Scope and limits |
| --- | --- | --- |
| Broad release candidate | 464/464 source and 464/464 emitted tests; build, strict types, lint and kit pass | Frozen `release-completion-v1` candidate; older 435/455-test checkpoints are historical. Later CSS/helper changes have focused evidence, not a new aggregate rerun. |
| Real browser matrix | **24 passed / 6 failed / 1 started-interrupted**, 31 planned | No skips or wholly unstarted tests in that original matrix. The incomplete test reached its outer 120-second deadline. |
| Core synthetic behavior | 20 buggy and 20 fixed benchmark runs matched the unchanged assertion; six CLI demo steps | One synthetic failure family, not forty independent bugs or a determinism proof. |
| Installed execution/package | Actual installed buggy/fixed readable replay and CLI target-failure observation; 12 offline install commands | Bound to recorded package/runtime identities; no fresh remote CI or handoff installation. |
| Later comparator | 688 completed checks with final invariants | Separate scoped evidence; does not rewrite the failed/interrupted original matrix or establish human usability. |
| Latest offline candidate package | 12 bounded commands; 62 original raw emissions, 14 capsule files and 260 runtime dependency entries bound | Intended CSS/module-path differences remain explicit; package documents have a staging cutoff. |
| Corrected-CSS pilot | 50 controls met expected outcomes; 12 provisional measured-pass observations; 41.72000612-second driver | Sequence STOP: 899.3984375 MiB exceeded its 896 MiB gate; distinct natural post-close interval absent. Across 57 occurrences: 12 provisional, 45 unattempted, 0 accepted through the aggregate gate. |
| Reduction | Five actions reduced to three, 16 executions / 13 trials in the broad candidate | Bounded failure-preserving result; `minimality=unverified` is permitted when final neighbors are inconclusive. No global-minimality claim. |
| Portability | Earlier native macOS and trusted Linux arm64 evidence; later Linux amd64 evidence under its separately approved external profile | Host/profile-specific observations, not universal portability or default-policy success on all platforms. |

Version-controlled evidence indexes include [release](../../evidence/RELEASE.md), [approved pilot](../../evidence/P57-APPROVED-PILOT.md), [offline package](../../evidence/OFFLINE-CANDIDATE-PACKAGE.md), [HCI inspector](../../evidence/HCI-INSPECTOR.md), [HCI analysis](../../evidence/HCI-ANALYSIS.md), [CLI preservation](../../evidence/CLI-EVIDENCE-PRESERVATION.md) and [supported scope](../SUPPORTED-SCOPE.md). Raw logs and detailed seals referenced by older documents may be excluded from the clone; consult the handoff inventory. Missing raw files in a clone must not be described as newly reverified evidence.

The six original failed browser checks were:

1. `cancellation terminates only the owned run and the next fresh replay works` (`tests/adapter.browser.ts`).
2. `real workbench capture, reduction, comparison, export, recovery and responsive evidence` (`tests/ui.browser.ts`).
3. `historical Evidence run selection identifies the exact job across evidence views` (`tests/ui-history.browser.ts`).
4. `independent UI review: keyboard consent, automated accessibility, reflow, and service restart recovery` (`tests/ui-review.browser.ts`).
5. `selected run expectation persists alongside actual captured evidence` (`tests/ui-evidence-inspector.browser.ts`).
6. `keyboard investigation joins immutable job input and actual trial evidence without stale attribution` (same file).

Required overlapping Chromium trees reached the configured task boundary in cancellation; relevant navigation/cancellation/unrelated-browser-liveness/replay assertions were not reached. Other capture-dependent failures retain thread/task exhaustion evidence, and one UI review reached navigation before its adapter deadline. These are genuine failed tests with inconclusive target behavior, not evidence that each intended behavior is a confirmed product defect. The original actual-packet comparator was started but interrupted; later comparator success remains a separate run.

## Uninstalled transport work and pending proposals

Both transport candidates are offline research artifacts. Their prospective caller diffs are unapplied, and neither is a supported replacement for native Playwright transport.

- The first prototype lazily encodes supported ordinary data in bounded chunks, then joins/decodes on the receiver. Final functional checks passed 7 author groups and 108 independent cases. Earlier RSS simulations were mixed and lacked execution-time source-hash attestation; reconstructed provenance is disclosed. No memory remedy was established.
- The incremental prototype directly constructs the final graph without the full intermediate decoded graph. Candidate SHA256 is `0b36b70a53d1eddbfb9c6fe055b8c4f8e0408ffd47910675cce348021e9f42eb`. Author 17/17, independent streaming 86/86 and cleanup 13/13 groups passed. The frozen predecessor suite remains **107/108**, because a forever-`x` malformed stream raises `TRANSPORT_BAD_JSON` earlier instead of reaching `ENCODED_LIMIT`/`CHUNK_LIMIT`. A separate expected-category adjustment passes 108/108; it does not change the frozen result.
- Its fixed offline matrix completed 12 Node workers and 156 equality checks. End-to-end paired RSS changes were **+5.2617, +5.4219, −12.9492 MiB**, with transfer 12.80–17.43% slower. Receiver-only changes were **−14.8867, −13.7930, −13.1719 MiB**, with decode 1.91–2.07 times as slow. Three pairs per experiment are descriptive, not a robust performance claim. A single-heap simulation is not browser/driver IPC or cgroup memory. Final client construction overlaps the still-live remote graph; source reachability is deliberately retained in the end-to-end model. These results do not justify installation.
- A focused code/evidence review found no smaller evidence-backed allocation correction that both avoids graph overlap and preserves required error semantics. Buffer-then-decode changes failure ordering and retains full wire data; clearing references has unmeasured benefit. No correction or further experiment followed.
- The **observation-only lifecycle extension remains pending and unadopted**. It proposes temporarily referencing the existing 100 ms timer through the first scheduled post-close attempt or the original absolute deadline, with first-attempt failure sticky and a distinct terminal census still required. Offline model/validator checks are not runtime validation or authorization.
- The **bounded attribution plan remains pending**: after a separate decision and review, one unchanged native-transport workload with twelve rows/fifty controls, existing 100 ms sampling, bounded separate process/cgroup/phase telemetry, then stop. It authorizes no run now, no sweep, no forced collection and no lifecycle extension.

The preserved task roots are `contrast-transport-investigation-v1`, `contrast-incremental-receiver-v1` and `contrast-allocation-attribution-review-v1` under the locally excluded `.repro-runs/cloud-continuation/`. Byte-preserving archival copies are delivered under `handoff/offline-research/`: [first transport report](../../handoff/offline-research/contrast-transport-investigation-v1/RESULT.md), [incremental report](../../handoff/offline-research/contrast-incremental-receiver-v1/RESULT.md), [candidate source](../../handoff/offline-research/contrast-incremental-receiver-v1/author/transport.mjs), [focused review](../../handoff/offline-research/contrast-allocation-attribution-review-v1/RESULT.md) and [unapproved attribution plan](../../handoff/offline-research/contrast-allocation-attribution-review-v1/ATTRIBUTION-PLAN.md). These archives retain original local path references and are not turnkey experiments for a fresh clone; the wrapper and exclusion inventory explain their limits. Retain unsuccessful attempts, adverse measurements and original frozen suites alongside successful adjusted checks.

## Product requirements versus diagnostic-plan criteria

`GOAL.md` and `docs/ACCEPTANCE.md` R0–R10 define the product outcome and release contract. They require faithful frozen assertions, bounded work, cleanup of owned resources, portable supported execution, privacy, usable accessible workflows and truthful evidence. They do not prescribe the numerical criteria below as universal product requirements.

| Criterion | Provenance and handoff status |
| --- | --- |
| 896 MiB observed kernel/cgroup peak | Later conservative engineering headroom gate for the contrast diagnostic sequence, below a configured 1 GiB hard cap. It was preserved in approved plans and is still the recorded gate; it is not an original product requirement or an established necessary product memory budget. |
| Zero Z at every sample / 75-second driver threshold | Earlier engineering audit/planning criteria that became binding in their approved execution plans. Those historical failures stay failures. They were prospectively superseded for the later specific contrast sequence, not erased. |
| Completed cleanup / 90-second driver threshold | Explicitly approved prospective criterion for the five-job corrected-CSS sequence. Requires normal browser exit and clean distinct first naturally scheduled post-close and terminal censuses. The one executed pilot did not establish the first census. This was a scoped diagnostic decision, not a universal product cleanup definition. |
| 90-second internal / 120-second outer deadlines; 128 tasks, 1 GiB, 2 CPUs | Recorded diagnostic execution boundaries. Deadline clocks have different semantics. Preserve the historical security/resource context and do not infer that different hosts are approved or equivalent. |
| Proposed timer lifetime hold / attribution pilot | Separate pending decisions. Neither was adopted or executed; the owner has now stopped diagnostics altogether for handoff. |

The original accepted security profile and later explicitly scoped external-runtime profile are distinct. The bundled policy's SHA256 is `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`; the later recorded Linux amd64 external profile is `f590f8ce5e847b35c95ed525a0a24c2e290472732c7c86f307e8496d7b47e33c`. A historical approval is not permission to broaden syscall, privilege, mount, network or browser-sandbox scope. This handoff changes neither profile nor any gate.

## Remaining release work when the owner resumes

1. Resolve the six original browser behaviors with an evidence-backed supported arrangement preserving their actual assertions, concurrent ownership/liveness checks and security scope. Do not claim a complete matrix from a subset or simply repeat the same failed arrangement.
2. Complete current-CSS contrast and applicable paint evidence. Preserve the 188 original raw axe incomplete statuses and distinguish supplemental measurement methods. Twelve provisional rows do not close the remaining 45 or complete outside-paint uncertainty.
3. Obtain legitimate support for native 200% Chrome zoom and perform the actual check; the prior supported call returned `ERR_BLOCKED_BY_CLIENT`. No alternate route around that denial or CSS/device scaling substitute closes it. Separately verify real screen-reader workflows in a supported active session.
4. Reconcile final source/build/package identities and run appropriate final-candidate verification once work resumes. Reuse valid exact-byte prior evidence where justified and label it retained; do not claim a fresh full suite. Keep package documents and delivery evidence aligned with their cutoffs.
5. Preserve scoped local-alpha claims. Stronger reduction minimality, additional adapters, historical-bug research and participant research remain separate work, not retroactively invented local-alpha prerequisites. Human recruitment/consent/ethics/data sharing requires specific authorization.

The repository's documented check entry points are `npm run check:kit`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npm run test:browser` and `npm run test:package`. `npm run demo` and `npm run benchmark` perform real supported browser work. Listing these commands is not an instruction to execute them during this handoff or permission to bypass host restrictions.

The owner-requested source push is version-control delivery only. Remote SHA verification belongs in the final delivery record; this status note does not claim a new CI run, public release, deployed service or completed product release.
