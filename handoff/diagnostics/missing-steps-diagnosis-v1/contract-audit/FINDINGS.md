# Independent contract audit: missing-step deletion neighbors

Scope: read-only source, specification, existing test, schema, and prior report inspection. No tests, browser, listener, Docker, network, authentication, resource changes, source edits, or publication were performed by this audit. Reports are the only writes. All source references below refer to the preserved startup-repair candidate; source hashes are recorded in `source-inventory.json`.

## Diagnosis

`MISSING_STEPS` is an intentional execution-precondition rejection in the registered synthetic adapter. It is not evidence of an invalid dependency-closure algorithm or an accidental fixture regression. The current three-action capsule has no permitted deletion experiment that the adapter can execute through the frozen assertion. Its minimality therefore remains unverified under the current reduction contract.

The manifest dependency graph and the experiment preconditions are different contracts:

1. `src/manifest.ts:119-126` requires unique prerequisites that name earlier retained actions. The created core is `navigate -> search-alpha -> search-beta` (`src/manifest.ts:163-169`).
2. `src/reducer.ts:19-27` removes the selected action and its transitive dependents in topological order. This preserves structural validity. It produces these final neighbors:

   | Selected deletion | Dependency-closed removal | Retained actions |
   | --- | --- | --- |
   | navigate | navigate, search-alpha, search-beta | none |
   | search-alpha | search-alpha, search-beta | navigate |
   | search-beta | search-beta | navigate, search-alpha |

3. `src/adapter.ts:47-57` separately requires exactly the non-noise sequence `navigate:/`, `search:alpha`, `search:beta` and unchanged beta-then-alpha response bodies. Every neighbor violates line 56. This happens at `validateBoundary` (`src/adapter.ts:149-150`) before fixture source selection, listener startup, browser launch, or assertion execution.
4. Structural manifest subsets are deliberately representable: `tests/schema.test.ts:46-52` checks empty action/response lists and says missing execution preconditions remain structurally representable; `schemas/README.md:14-20` distinguishes schema shape from narrower execution requirements.

The frozen observable cannot validly be applied as a success test to these incomplete experiments. `src/oracle.ts:8-13` fixes latest request ID 2, query beta, and Beta results; `src/oracle.ts:26-32` treats wrong request/query and unrelated output as verification errors, not requirement satisfaction. The adapter requires both responses to complete as `[2,1]` (`src/adapter.ts:217-228`) before reading the DOM and incrementing assertionCount (`src/adapter.ts:229-239`). Removing the line-56 preflight alone would merely expose missing request/state errors or timeouts; it would not produce valid negative behavioral evidence.

This is also the documented fixture boundary: `fixtures/browser-search/README.md:3-13`, `docs/adr/0001-local-experiment-boundary.md:5-13`, `docs/SUPPORTED-SCOPE.md:12-17`. The buggy frontend intentionally assigns sequential request IDs and applies both responses (`fixtures/browser-search/buggy.js:7-22`); the fixed frontend guards only DOM replacement, while still recording both completions (`fixtures/browser-search/fixed.js:7-24`). No fixture defect was established.

## Reduction semantics remain conservative

`docs/PRODUCT.md:14-17` defines a satisfied requirement as an actually evaluated expectation, and missing state/no assertion as inconclusive. `docs/adr/0001-local-experiment-boundary.md:13` explicitly leaves minimality unverified for inconclusive neighbors. The reducer only accepts a candidate after all required target-failure repetitions (`src/reducer.ts:156-167`); it rechecks the final neighborhood and requires all neighbors to be conclusive before the dependency-group-1-minimal label (`src/reducer.ts:205-224`). Missing steps remain unaccepted and nonconclusive. This behavior matches the stated contract.

The reducer's generic unit models may validly provide a conclusive negative for synthetic graph subsets (`tests/reducer.test.ts:47-74`). That is an injected model predicate, not a claim that the registered browser adapter executes those subsets. Transferring synthetic minimality to the real capsule would be invalid, but the actual reducer does not make that transfer.

It would be a scope change to declare the three core actions undeletable and call the capsule vacuously minimal. It would also be a scope change to alter requests, responses, dependencies, or expected observation so a partial session can pass. Neither change is justified by this diagnosis. Keep real-capsule minimality unverified.

## Separate, demonstrable product contract defect: run-result schema

The current structural `RunResult` schema rejects valid runtime preflight results:

- `src/adapter.ts:85-91` initializes appDigest to the empty string, assertionCount to 0, observation to null, and browser to not-launched.
- The application digest is set only after manifest and boundary checks (`src/adapter.ts:149-155`). A missing-step rejection therefore intentionally has no application digest.
- `src/evidence-inspector.ts:123-126` explicitly recognizes this inconclusive/cancelled, zero-assertion, null-observation, empty-application-digest shape. `tests/evidence-inspector.test.ts:169-182` preserves and exposes this exact historical behavior. `scripts/hci-case.ts:248-253` also treats it as unstarted.
- `schemas/run-result-v1.schema.json:78-80` nevertheless requires appDigest to satisfy the SHA256 definition in every outcome. `schemas/README.md:8-10` says this schema describes an actual single runtime RunResult.
- `tests/schema.test.ts:100-105` uses constructed cancellation/inconclusive values that inherit a full application digest, so its asserted no-run coverage does not exercise the actual preflight shape.

This defect is representation drift, not false failure preservation, an oracle defect, or a browser failure. A minimal separate patch should allow an empty appDigest only when outcome is inconclusive/cancelled, assertionCount is 0 and observation is null, while preserving the SHA256 requirement for every conclusive outcome and rejecting empty digest with observations/assertions. Describe the semantic meaning in schema notes. Prefer representing the honest unstarted state over assigning the caller's claimed source digest to an unexecuted application. Before implementation, establish a failing schema regression against actual offline preflight/pre-cancelled outputs, then passing-after and adverse shape checks. This audit did not run that regression.

## Application identity message: conservative, but broad

`src/reducer.ts:44-47` requires result.appDigest to match the requested application digest for every outcome. Consequently the empty preflight appDigest produces `Run evidence does not match the frozen input, assertion, application, or execution identity.` before the reducer reaches its general inconclusive branch (`src/reducer.ts:147-148`). The direct adapter reason remains `MISSING_STEPS` in raw evidence and baseline. This does not change acceptance or minimality.

The missing application identity is real: no application source was selected/executed. The generic mismatch is less useful diagnostically, but is not by itself a demonstrated unsafe product defect. Historical inspection intentionally keeps recorded reducer and raw run reasons distinct (`tests/evidence-inspector.test.ts:169-182`, `tests/hci-case.test.ts:36-38`, `web/hci-study-support.tsx:60`). Do not silently rewrite historical evidence or bypass identity checks for conclusive runs. A separate future diagnostic-only improvement could distinguish unavailable application identity from contradictory identity, retaining all run IDs/raw reasons and all current acceptance checks. It is not needed to correct the schema drift, and cannot make these neighbors conclusive.

## Remaining release requirements

- Preserve startup-repair source, its prior receipt, original reports, and raw historic evidence. Keep any schema patch in a separate candidate until reviewed and verified.
- For that patch: actual nonbrowser red/green regression; conditional empty-digest adverse cases; existing schema and relevant inspection/reduction regression suites; typecheck/lint and packaging verification appropriate to changed deliverables. A successful schema validation establishes representation only.
- Current-candidate browser acceptance remains blocked/unrun: the required 31-test matrix, CLI demo, installed-package browser replay and declared fresh-reset repeatability still require a reviewed executable strategy within existing resource and security limits. Historical browser results do not establish current bytes.
- Real-capsule minimality remains unverified after any schema/diagnostic patch. A stronger claim requires a separately specified supported experiment/deletion domain, unchanged relevant oracle, fixed budget/repetition rule, established baseline, and conclusive tests of all final allowed neighbors. Browser capacity alone is insufficient.
- Separate native zoom, actual screen-reader use, broader-case and human-research gates remain unchanged. No browser or release acceptance is claimed here.

Read-only inventory note: two exploratory reads requested nonexistent `fixtures/browser-search/app.html`, `buggy.html`, and `fixed.html`; source discovery then identified the actual page.html/buggy.js/fixed.js files. These are file lookup misses, not test failures.
