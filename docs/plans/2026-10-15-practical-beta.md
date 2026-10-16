# Practical beta: registered public repository browser cases

Owner scope: three materially different real upstream bugs, complete capture/replay/reduction/export workflow, fresh isolated exports and regression evidence. Accessibility is deferred/unverified. Baseline `88fedc530152b786fdb8ac76a867ddbcd8229201` was clean; 84 source/artifact/log identity checks matched before edits. Work is on `task/practical-beta`; no main merge or release publication is authorized.

## Design

The largest observed gap is not a missing fixture: schemas, actions, oracle, revision selection, evidence inspector and export all assume one synthetic search. Extend them with a discriminated schema 3 for registered static browser cases. Keep schemas 1/2 readable and their oracle identities intact. Reuse the bounded dependency-aware reducer and immutable job ledger.

A case registers pinned upstream JavaScript bytes, repository/revision/license provenance, a small independent HTML integration page, action templates, DOM observables, expected values and the exact intended wrong result. No arbitrary shell commands, file paths, network targets or executable assertions enter manifests. Setup downloads public pinned sources separately from offline replay; upstream installation scripts are unnecessary for this slice. Only the upstream library implementation varies between buggy and fixed runs. A separate Node oracle reads DOM values and rejects absent readiness, unrelated exceptions, wrong values and unavailable dependencies as inconclusive. The app does not write the oracle or runner.

Capture records an explicit consent and expectation declaration. Registered actions can be deleted with their dependents, never altered by reduction. Source, assertion, case and harness identities remain frozen. UI/CLI use the same dispatch. Export includes source provenance/licenses, byte-checked application assets and a readable single-revision Node test; that test must exit failing on buggy and passing on fixed. A separate comparison command verifies both.

Use public reports/contracts to write expectations before viewing fixed source internals. These are development cases selected for supported capabilities, not a random, held-out or general-effectiveness cohort. Keep rejected/blocked cases and all attempted runs. Do not inflate original actions to manufacture reduction gains. First case: morphdom issue 19, live textarea value update after user input; buggy `8221ace412be8dc1f519f2dc77393f0940134648`, fixed `b72ddd5f21a759d235d70c92d3a37a990499c22f`. Remaining cases will be frozen in the cohort before their first execution.

Capture only allowlisted action and assertion evidence. No target screenshots, traces, DOM snapshots, console or request bodies are persisted in this new adapter. Unexpected observed strings must not enter public evidence. This is a deliberately narrow capture/privacy boundary, not a general secret detector.

## Implementation sequence

1. Strict v3 contracts and registered-source identity; demonstrate valid real case rejected by baseline, then add contract/oracle regressions.
2. Owned static browser runner and dispatch; actual first-case capture/replay/reduction. Add wrong-failure, missing-dependency, cancellation, timeout and privacy regressions.
3. Portable single-revision regression export with tamper/path/link/cancel tests; validate installed setup.
4. Complete three pinned cases and functional case-selection/expectation/evidence journey; fix discovered failures with red regressions.
5. Preregistered repeated runs and fresh isolated verification; independent source/oracle, reduction, security/export and functional UX review. Commit cohesive reviewed changes on the task branch.

## Execution conditions

A separate preregistered protocol sets time, resource, stability and cleanup criteria before any selected case executes. Prior synthetic results remain retained evidence only. Fresh verification must use new dependency/browser acquisition, no host workspace/cache/credential mounts, network disabled at execution and declared platform limits. Existing synthetic-only container-policy approval must not be silently generalized; prepare and review a concrete real-case runtime before resolving any additional essential scope decision. Independent local implementation continues while a portability prerequisite is pending.
