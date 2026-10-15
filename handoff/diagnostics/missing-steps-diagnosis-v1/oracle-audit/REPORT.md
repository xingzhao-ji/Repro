# Independent oracle and fixture diagnosis

The three final deletion neighbors return `MISSING_STEPS` because the registered adapter deliberately requires one complete navigation/alpha/beta experiment. Dependency closure is correct. Its outputs are structurally valid action lists but cannot reach the frozen oracle's required beta request 2 state and response-completion checkpoint. This is a limitation of the current experiment domain for empirical minimality, not an established fixture, oracle, or reducer correctness defect. No product patch is justified merely to turn these inconclusive neighbors into negative failure-preservation results.

## Source trace

- `src/manifest.ts:164-168` declares navigate → alpha → beta dependencies; noise depends only on navigation. `src/reducer.ts:19-27` deletes selected actions and their transitive dependents in topological order. From the final three-action capsule, removing navigate yields `[]`, removing alpha yields `[navigate]`, and removing beta yields `[navigate, alpha]`.
- `src/manifest.ts:109-127` validates supported action kinds and earlier prerequisites without requiring the complete three-action scenario. That structural validation is intentionally broader than executable adapter support.
- `src/adapter.ts:47-57` validates dependencies and then requires non-noise kinds to be exactly navigation, alpha, beta. Every final neighbor fails that complete-scenario check at line 56, before the runner starts the owned listener or browser (`src/adapter.ts:149-169`). Missing-step evidence consequently has zero assertions and no DOM observation. Existing tests expressly expect missing steps to remain inconclusive (`tests/adapter.browser.ts:68-82`).
- `fixtures/browser-search/buggy.js:6-14` increments a per-page request counter on each submit. Alpha must be issued first to make beta request 2 in this registered experiment. `src/adapter.ts:60-64` allows only request 1/alpha and request 2/beta routes; simply rewiring beta's dependency to navigation creates an unsupported request 1/beta, not the same experiment.
- `src/adapter.ts:217-228` requires live requests for both controlled responses, waits for each frontend completion, and demands final completion order `[2,1]` without unrelated errors. Removing only the `MISSING_STEPS` guard would still encounter an absent request 2, incomplete completion sequence, or missing DOM prerequisites. Silently dropping responses changes the frozen experiment schedule.
- `src/oracle.ts:8-14,22-32` requires latest request 2 and query beta. It accepts only exact Beta results as satisfaction and exact Alpha results as the target failure. An initial page or alpha-only state raises `WRONG_OBSERVATION`; empty results after both requests raise `WRONG_FAILURE`. Neither is a valid negative target result under the unchanged oracle.
- `fixtures/browser-search/page.html:7` initializes request ID 0, completed `[]`, visible query em dash, and empty results. `buggy.js:17-22` intentionally applies whichever response finishes, which is the registered stale-response defect. No additional fixture defect was found.
- `src/reducer.ts:141-167,205-224` retains inconclusive neighbors and leaves minimality unverified. Thus the generic candidate model can propose unsupported experiments without falsely granting minimality. It is unsuitable for establishing empirical minimality of this exact final capsule; it is not an unsound acceptance algorithm on this evidence.

## Bounded offline model

The frozen plan is `PLAN.json` (SHA256 `59ddbe5bb2cec80366783b00c598f67348e3084f605b4598903ac7ae6e7fa234`). The frozen worker `fixture-model.mjs` has SHA256 `a22fc11770f6800b0dbcd6ea39b50ab47cc53ab0bcc3daf9cf3ff212a24bc6dd`.

The model executes the exact unchanged registered **buggy** script in a fresh Node VM context with a deliberately small DOM model and deferred in-memory fetch responses. Initial DOM values are extracted and checked against `page.html`. It invokes the actual unchanged `src/oracle.ts`; it does not inspect or execute the fixed implementation. No browser, listener, live network, Docker, authentication, resource change, or source edit occurred.

Eight cases ran in each of two fresh processes. Each process had a 60-second and 1-MiB combined log bound. Both exited 0, used 10,603 stdout bytes and zero stderr bytes, and produced byte-identical results with SHA256 `a9b4c13bfb1393b85860e6be44fc33ba70986736530197a491efe8f380911161`. Durations were 0.142 and 0.115 seconds. All 11 frozen input files were verified unchanged before and after each process. Across the two processes there were 16 actual oracle calls: seven observed cases plus one altered-expectation rejection per process. The no-navigation case makes zero fixture and zero oracle calls.

| Model case | Observation | Completion state | Actual frozen oracle |
| --- | --- | --- | --- |
| No navigation | No app/observation | Unavailable | Not called |
| Navigation only | ID 0, em dash, empty | `[]` | `WRONG_OBSERVATION` |
| Alpha pending | ID 1, alpha, empty | `[]` | `WRONG_OBSERVATION` |
| Alpha completed | ID 1, alpha, Alpha | `[1]` | `WRONG_OBSERVATION` |
| Both issued, responses pending | ID 2, beta, empty | `[]` | `WRONG_FAILURE` |
| Beta completed, alpha pending | ID 2, beta, Beta | `[2]` | Satisfaction **at this intermediate model state only** |
| Beta then alpha completed | ID 2, beta, Alpha | `[2,1]` | Exact target failure |
| Beta without alpha | ID 1, beta, empty | `[]` | `WRONG_OBSERVATION` |

The intermediate Beta satisfaction is deliberately not an adapter PASS: the adapter must first establish full completion `[2,1]`. That control illustrates why the schedule checkpoint cannot be removed. Beta without alpha is a counterfactual dependency rewrite, explicitly outside the closure-neighbor set; its issued URL is `/api/search?requestId=1&query=beta`, which the actual adapter's source allowlist excludes.

The model excludes real browser event trust, actionability, navigation, rendering, CSP, HTTP transport, scheduling, cleanup, and resource behavior. It supports source diagnosis only. It establishes no real-browser repeatability, real-capsule minimality, fixed-implementation validation, or release acceptance.

## Disposition and release limits

1. Preserve current `MISSING_STEPS`, unchanged oracle, exact response schedule, and `minimality=unverified`. Correct dependency closure is necessary but cannot manufacture missing observation prerequisites.
2. Keep a bounded, failure-preserving reduction claim separate from a minimality claim. Current R2 (`docs/ACCEPTANCE.md:9-10`) requires accepted-trial failure evidence and honest status; it does not require unqualified or global minimality. A fresh empirical dependency-group minimality claim would require a separately specified supported reduction boundary with evaluable final neighbors under the relevant unchanged oracle, a predeclared budget/repetition rule, a fresh baseline, and complete final-neighbor evidence. Reclassifying unsupported cases or weakening the oracle is not that evidence.
3. The current startup-repair candidate's real browser acceptance and repeatability remain blocked/unrun. The previously documented requirements remain: independently reviewed capacity strategy within the unchanged 128-task/sandbox limits; current full 31-test browser matrix; separate CLI demo; installed-package browser replay; current-byte fresh-reset buggy/fixed repetitions with every attempt preserved. This model does not replace any of them.
4. Preserve separate native zoom, real screen-reader, accessibility, broader-case and human-research gates. No publication or authentication action is authorized by this diagnosis.
5. A separate report-schema issue identified by another reviewer is outside this oracle/fixture finding. This audit neither tests nor approves that patch; it does not justify changing adapter, reducer, fixture, or oracle behavior.
