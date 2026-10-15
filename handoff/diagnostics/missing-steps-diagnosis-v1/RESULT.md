# Missing-step diagnosis and separate schema repair

The real capsule's final deletion neighbors return `MISSING_STEPS` because they are structurally valid action subsets but incomplete experiments under the registered adapter and frozen oracle. Dependency closure is correct. No new fixture, oracle or reducer acceptance defect was established. The existing reducer correctly leaves their outcomes inconclusive and minimality unverified.

A separate product contract defect was established and repaired in an isolated candidate: the published `RunResult` JSON Schema rejected the adapter's legitimate preflight results because `appDigest` is empty before application source selection. The patch changes only the schema, its documentation and a new regression test. The original startup-repair checkout, its baseline copy, previous package and all prior receipts remain unchanged. The patch is prepared locally and is **not applied to the original checkout**.

Execution was confirmed available at **2026-10-14 20:28:15 UTC** after the parent's reported 20:27 disconnect. `connection-recovery-checkpoint.json` preserves the completed diagnosis and the then-unfinished schema checks. Work resumed within the same offline scope. All planned diagnosis and patch checks subsequently completed; no authentication or resource changes were made.

## Why the three neighbors cannot execute this assertion

The retained core is `navigate → search-alpha → search-beta`, with digest `1d73378b0b1dd8b9c0e20a155c88d1c27e85910f144dcd1085ddb0f6d3214db6`. Removing an action removes its transitive dependents. The manifest validator checks those dependencies, while `src/adapter.ts:56` separately requires the complete non-noise sequence `navigate:/`, `search:alpha`, `search:beta`. Both checks are intentional and have different responsibilities.

| Selected deletion | Correct remaining closure | Missing experiment prerequisite |
| --- | --- | --- |
| Navigation | No actions | No initialized frontend or issued requests |
| Alpha search | Navigation only | Neither request exists; latest request remains 0 |
| Beta search | Navigation and alpha | Only request 1/query alpha exists; no beta request 2 |

The unchanged response schedule requires request 2 to finish before request 1. The unchanged oracle requires latest request ID 2, query beta, and either exact Beta results (requirement satisfied) or exact stale Alpha results (target failure). Navigation-only and alpha-only states fail with `WRONG_OBSERVATION`, not requirement satisfaction. Bypassing the preflight would still leave a missing request or incomplete response schedule; it would not produce a valid negative observation.

Removing alpha while retaining beta without updating dependencies is a different, structurally invalid input and returns `ACTION_DEPENDENCY` before the adapter. Even inventing a new dependency for beta would make the actual fixture issue beta as request 1, outside the registered route schedule and frozen oracle. That would be a changed experiment, not a repair of the current reduction.

The reducer searches a larger structurally valid candidate set than the adapter can evaluate conclusively. This is an intentional partial replay domain, handled by INCONCLUSIVE and unverified minimality. The buggy fixture's stale-response defect is the supplied target, not an additional fixture defect discovered here. Existing synthetic reducer tests test decision logic with explicit model outcomes; their smaller-candidate satisfaction results do not establish real-browser outcomes.

## Verified offline diagnosis

The actual frozen reducer and adapter were called on each of the three valid neighbors, with throwing guards on the exact Playwright launch singleton and HTTP listen entrypoint. All three returned real `MISSING_STEPS` records with empty app digest, zero assertions, null observation, no events and browser `not-launched`. Each reduction made one adapter call and retained its input and raw evidence, with no accepted trial. The invalid-dependency control made zero adapter calls. All four diagnosis cases passed with zero launch/listen attempts. See `regression-review/RESULT.md` and its raw command/result inventory.

The reduction ledger's generic identity-mismatch explanation follows from requiring a populated application digest before accepting run evidence. The underlying `MISSING_STEPS` reason and run ID remain linked and visible in the raw evidence. This conservative wording does not establish a false outcome, and no reducer wording or validation change was made.

A separate finite VM check executes the exact registered buggy script against a deliberately small in-memory DOM/fetch model and calls the unchanged actual oracle. Eight cases ran in each of two fresh processes; all sixteen cases passed and the raw outputs were byte-identical. Independent review verified 196 source/hash/record checks. Intermediate beta-only completion can satisfy the oracle at completed schedule `[2]`, but the real adapter requires completed `[2,1]` before evaluation; after `[2,1]`, the model exposes the intended stale Alpha result. This demonstrates why the observation point matters. These are component-model observations, not browser replay or real-capsule minimality evidence. The fixed implementation was not inspected to guide this diagnosis. See `oracle-audit/REPORT.md` and `contract-audit/ORACLE-MODEL-REVIEW.md`.

## Separate schema patch and failing-before evidence

Before patching, `schemas/run-result-v1.schema.json` required a SHA256 `appDigest` for every outcome, even though `runBrowser()` deliberately returns an empty string when boundary validation or pre-start cancellation occurs. The existing evidence inspector already represents an unstarted result as inconclusive/cancelled, empty app digest, zero assertions and null observation. The schema therefore contradicted the runtime values it claimed to describe.

The candidate now permits an empty app digest **only** with an inconclusive or cancelled outcome, exactly zero assertions and a null observation. Nonempty digests must still be lowercase SHA256 strings. Both conclusive outcomes retain their required application digest, harness identity, executed assertion and observation. No adapter, reducer, oracle, fixture, assertion or runtime dependency byte changed.

Deliverables:

- `schema-patch/schema-representation.patch` — standard three-file patch, SHA256 `4cfeffe4eb0f1c4b6b55bd6d33bb853074ee4d1cf0ad074dd40626fb13e25d9b`.
- `candidate/` — complete separate candidate with 183 tracked/source files: two modified schema/documentation files and one added test.
- `schema-patch/RESULT.md` — exact commands, raw test evidence and patch-application dry run.
- `schema-corpus/RESULT.md` — independent validation of all 700 retained actual preflight results.

The frozen nine-test regression first reproduced the defect: **4 passed, 5 failed**, with all four actual adapter preflight cases failing solely the `/appDigest` pattern and the fifth failure covering the structural unstarted shape. With the narrow schema change, the **same nine tests passed**. **28 existing schema, manifest and reducer tests**, strict typecheck and scoped lint also passed, with zero skips. Adverse controls retain rejection of empty app identity in either conclusive outcome, any asserted/observed empty-digest result and malformed nonempty hashes. Patch application with zero fuzz passed a read-only dry run against the preserved baseline.

An initial red invocation used the isolated candidate as cwd while its evidence directory was a sibling, causing three expected-input tests to stop at `OUTPUT_BOUNDARY`. That setup failure is preserved separately. The correction changed invocation cwd and explicit test path only; the frozen test bytes and product output boundary stayed unchanged. The corrected red run established the schema defect before any schema edit. Across the initial red, corrected red and green runs, all twelve actual adapter results and six evidence artifacts are retained. Combined with the three diagnosis calls, this task made **15 actual preflight adapter calls**, with **zero browser launches, HTTP listeners or target assertions**. Earlier plans that included unnecessary listener-based tests were retained unexecuted.

The independent schema corpus check reads the exact 700 earlier actual results: original schema **0/700 structurally valid**, candidate schema **700/700 structurally valid**. Their original 600 inconclusive and 100 cancelled outcomes and all hashes remain unchanged. Structural schema acceptance proves neither reproduction nor satisfaction. Independent patch review passes 2,584 source/diff/raw-evidence checks without finding an acceptance weakening or source preservation discrepancy.

## Release implications

**R2 does not require a 1-minimality claim.** `docs/ACCEPTANCE.md` requires failure-preserving bounded reduction, dependency integrity, repeated accepted-trial evidence, honest budget status and adverse-case coverage. ADR 0001 explicitly allows inconclusive final neighbors and unverified minimality. The current capsule can continue to report a bounded reduction with that limitation; a stronger minimality claim is optional and would require an independently justified supported evaluation domain and actual final-neighbor observations. Do not relabel missing-step rejection as satisfaction or restrict removable units retroactively to manufacture a claim.

The original checkout and prior package still contain the old schema because this task prepares a separate patch. If the patch is adopted, integrate it and run final complete code-health and package/install verification, including shipping the corrected schema. Current browser acceptance against the startup-repair runtime remains **blocked/unrun**: the complete 31-test browser matrix, declared twenty buggy/twenty fixed repetitions, separate CLI demo and installed-package browser replay still require a justified execution strategy that preserves the required two-browser workload and existing 128-task/sandbox constraints. None was selected here. The documented native zoom, actual screen-reader, remaining accessibility and separate research gates remain unverified. `remaining-release-requirements.json` lists the precise actions without adding a new mandatory minimality gate.

No resource limit, permission, authentication, network, dependency acquisition, publication or external-write change occurred. `baseline-manifest.json` freezes the original 182-file candidate; final preservation and report inventories bind the baseline, isolated patch, raw failures and prior receipts. The task-local checkpoint records this work without modifying the original STATE or runtime candidate.
