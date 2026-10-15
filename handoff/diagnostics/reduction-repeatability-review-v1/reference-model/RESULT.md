# Finite synthetic reducer reference verification

PASS for the stated finite reducer decision-verification scope: **2,112 reducer invocations** completed, consisting of 320 deterministic truth tables and 32 adversarial controls, each run twice in separate processes for source TypeScript, retained emitted JavaScript, and the retained installed package bundle. These produced **13,596 synthetic model callbacks**. All six complete semantic transcripts agree. There were zero verification assertion failures, omitted cases, product-code exceptions outside the deliberately throwing control, or resource-limit stops.

This checks the reducer decision path belonging to the final startup-repair candidate. It does **not** execute the startup repair, browser, frontend, application server, database, or real replay. Browser capacity remains blocked under the existing 128-task boundary; browser acceptance for the startup-repair candidate and actual retained browser-reduction minimality remain **UNRUN / UNVERIFIED**. Synthetic Alpha/Beta observations are labelled unit-model outcomes throughout. No universal determinism, global optimality, human review, real-user or clean-machine claim follows from these results.

## Frozen scope and method

The untouched original `PLAN.json` was superseded before execution by `PLAN-v2.json` (SHA256 `7046939bc5f7c0b0163f0e9ede0a19078ff10ebb5e3e50642b0b2ccb2024b4f2`). The revision tightened each process to the existing **120-second / 2-MiB combined stdout+stderr** limits and declared a separate **64-MiB raw case evidence cap per process**. The six workers were sequential. Each ordinary reduction had at most 128 callbacks, 5,000 ms and two required target-failure repetitions; the cancellation, exact/incomplete execution budgets and 20-ms deadline controls have explicit overrides in the plan.

The chain-plus-noise graph has seven valid closed subsets and 64 possible deterministic tables with the original failure fixed. The root-with-three-leaves graph has nine valid subsets and 256 tables. Every table was retained, including those where the algorithm stops above a global minimum. Independent bitmask membership checks enumerate valid subsets; a reverse-dependency breadth-first traversal derives every permitted single dependency-group deletion from the final candidate. A separate Python raw audit uses repeated fixed-point removal and independently recomputes canonical candidate digests, table coverage, global minima and final-neighbor observations.

Every model invocation receives an immutable dependency-valid candidate and a unique owned execution scope/reset marker. All accepted trials contain exactly two matching conclusive Alpha observations. Assertion digest, application revision/digest, seed, adapter and runner identity remain fixed. Only the synthetic table determines Alpha failure or Beta satisfaction. The verifier explicitly uses a **model harness digest** `ec4b0ead0b7170f6faa9bdfee27b4ddcb7f896a11a09d8e422906527459f2ec7`; it does not substitute that value for actual source/emitted/installed browser harness identities.

Each process verified **217 file records before and after** execution: 62 prior emission source files, 13 current-root fixture files, 75 retained emitted-input files and 67 installed package files. The final preservation check reverified all 217. These existing local artifacts were imported directly; no rebuilding, package installation or external acquisition was performed.

| Imported entry | SHA256 |
| --- | --- |
| Current source `src/reducer.ts` | `cc2597b309f315750a1894b916784f0e859ff8156dcbeb563898d4be01a2193e` |
| Retained emitted `src/reducer.js` | `8eb6b1b3e2b6b1e19df49fca3de63a43de07e3cb88a201a1322c087d65ca4e27` |
| Installed candidate `dist/index.js` | `e9a0fa611e38db3929563ce6df29a78bb222a11817f7ce4f20945b286719ac66` |
| Final startup-repair source `src/adapter.ts` | `2727f237d460b98d620d5e2620547305d6d6e4d6e1c3c093f56419b2d475ee60` |
| Unchanged frozen assertion | `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711` |

## Observed results and comparison boundary

Each process completed 352 cases, 2,266 callbacks, 1,527 trials and 737 accepted trials. The deterministic table cases supplied 302 final-neighbor checks per process, each independently verified as actually tested after the last accepted candidate and rejected by the table oracle. All 320 tables satisfy dependency-group 1-minimality in this finite deterministic model. The independent Python audit verified all six raw files totaling **51,717,541 bytes**. Each raw file remains below its separate 64-MiB limit.

The common full semantic transcript digest is `c0bcbf8aa82196c20a99a07509adb41170a20d065fad8b32f8b39c03d8744e6a`. Comparison removes **only** `startedAt` and `durationMs` fields and replaces the exact owned per-process model artifact-root prefix. It retains complete manifests, observations, reasons, identities, execution counts, trial ordering, run IDs, cancellation flags, oracle tables and reference audits. Process format/entry metadata and receipt timestamps are preserved separately rather than inserted into the semantic record. This establishes repeatability for the frozen finite cases on Node v24.19.0; it is not a claim about browser timing, arbitrary graphs, all runtimes or nondeterministic target behavior.

| Process | Elapsed | Exit | Combined log bytes |
| --- | --- | --- | --- |
| source-1 | 1.012 s | 0 | 254 |
| source-2 | 0.927 s | 0 | 254 |
| emitted-1 | 0.966 s | 0 | 255 |
| emitted-2 | 0.861 s | 0 | 255 |
| installed-1 | 1.646 s | 0 | 257 |
| installed-2 | 1.211 s | 0 | 257 |

The first launch attempt failed **before any child process or reducer invocation** because the intentionally cleared PATH lacked the existing Node executable. `unexecuted-launch-failure.json`, `unexecuted-launch-freeze.json` and `driver-pre-node-path.py` preserve it. The launcher was corrected to use the existing resolved executable `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`, with its binary digest recorded in `execution-freeze.json`. No installation, credentials, authentication retry or access change occurred. No case was selectively rerun.

## Adversarial control results

All 32 controls matched their predeclared expectations in all six processes: 19 returned `inconclusive`, six `complete`, four `cancelled`, and three `budget-exhausted`. Those are expected product statuses, not omitted verifier failures. Mismatched manifest/assertion/application/adapter/runner/seed/harness identities, missing or contradictory observations, zero assertion count, unknown outcomes, inconclusive evidence, cancellation, runner exceptions and incomplete repetition budgets did not establish an unearned accepted reduction. The exact-budget control completes legitimately on its third callback. Detailed outcomes and invocation IDs for every control are in `raw-audit.json` and each raw transcript.

Both alternating orders are preserved. At baseline, failure then satisfaction consumes two callbacks and returns inconclusive; satisfaction then a scheduled failure consumes only one callback and returns inconclusive. At the final neighbor, failure then satisfaction consumes two neighbor callbacks, records instability, and leaves minimality unverified. Satisfaction first consumes **one** neighbor callback, never executes the scheduled second failure, and reports dependency-group 1-minimality after rejecting the two-of-two failure-preservation criterion. This matches the documented asymmetric acceptance rule. It does **not** establish repeated neighbor stability or general stochastic minimality; the unobserved scheduled follow-up is explicitly recorded, not treated as an observation.

## All observed gaps from global optimality

**23/320 tables** (three chain-plus-noise, 20 star) finish with more actions than the enumerated global minimum, consistently in every format/process. The other 297 reach the minimum action count for their table. Every one of the 23 remains locally dependency-group 1-minimal. Full final IDs and every globally smallest subset are retained in `raw-audit.json`.

| Table | Final actions | Global minimum actions | Gap |
| --- | --- | --- | --- |
| chain-noise-table-002 | 4 | 1 | 3 |
| chain-noise-table-034 | 3 | 1 | 2 |
| chain-noise-table-042 | 3 | 1 | 2 |
| star-table-002 | 4 | 1 | 3 |
| star-table-008 | 4 | 2 | 2 |
| star-table-010 | 4 | 1 | 3 |
| star-table-018 | 3 | 1 | 2 |
| star-table-032 | 4 | 2 | 2 |
| star-table-034 | 4 | 1 | 3 |
| star-table-040 | 4 | 2 | 2 |
| star-table-042 | 4 | 1 | 3 |
| star-table-048 | 3 | 2 | 1 |
| star-table-050 | 3 | 1 | 2 |
| star-table-066 | 3 | 1 | 2 |
| star-table-072 | 3 | 2 | 1 |
| star-table-074 | 3 | 1 | 2 |
| star-table-082 | 3 | 1 | 2 |
| star-table-088 | 3 | 2 | 1 |
| star-table-090 | 3 | 1 | 2 |
| star-table-130 | 3 | 1 | 2 |
| star-table-146 | 3 | 1 | 2 |
| star-table-194 | 3 | 1 | 2 |
| star-table-210 | 3 | 1 | 2 |

For example, `chain-noise-table-002` preserves failure only in the four-action original and the one-action root subset. Every final single dependency-group deletion satisfies the requirement, so four actions are a valid local 1-minimum although a three-action joint deletion reaches the global minimum. No optimality fix or algorithm change was made; the product already limits its claim to group 1-minimality.

## Evidence and remaining actions

`raw-audit.json` contains the independent raw-data checks, six comparison receipts, every global gap and all control outcomes. A separate reviewing agent independently parsed all raw evidence and completed **50,308 checks with zero failures**, including canonical identities, exhaustive tables, fixed-point neighbors, global gaps and six-way semantic comparison. Its receipt is `../audit/model-evidence-audit.json`, SHA256 `e3de96e39038d846f04ee6bad7c033aef6fbc25b97971f6a5dd38fa1fbc5e11d`; it found no blocking harness issue. `final-input-preservation.json` contains exact current file hashes and confirms original source/fixture bytes remain unchanged. `source-1` through `installed-2` retain complete append-only raw case NDJSON, summaries and before/after input checks. The driver receipts preserve exact argv, cleared environment, duration, exit, log size and log hash. All generated files are task-owned and local.

No further reducer execution is needed for this finite plan. Remaining browser work requires a justified execution strategy preserving both browser trees, all assertions and the existing sandbox/resource boundary. Actual browser reduction minimality requires conclusive observations for the complete permitted final deletion neighborhood; prior missing-step preflights do not establish those observations. This model result cannot replace that acceptance evidence. No source changes, browser/Docker commands, network requests, external writes, authentication retries, uploads or resource changes were performed by this task.
