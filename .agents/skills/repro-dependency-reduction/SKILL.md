---
name: repro-dependency-reduction
description: Reduce Repro failure capsules while preserving the frozen failure and report tested minimality, replay cost, and unresolved dependency constraints.
---

# Repro dependency reduction

Reduce the inputs and dependencies of a reproducible failure, keeping the failure
claim fixed. Consult [the project goal](../../../GOAL.md) for the supported target.

## Establish a valid baseline

Start only after the unreduced capsule reproduces the frozen assertion with an established expectationBasis
under its declared replay boundary. Record the baseline digest, fixture/reset
procedure, observed failure, environment, repeatability, and execution cost.
For local demos, expectationBasis may be supplied-synthetic-specification with
humanApproval not-claimed or pending; do not fabricate human confirmation.
If the baseline cannot be reproduced, investigate capture/replay first; reduction
cannot establish which removed dependency mattered.

Distinguish a target failure from a broken experiment. A missing table, crashed
browser, timeout, or failed build is not failure preservation unless that exact
observable is the frozen target failure.

## Choose reduction units

Use dependency-aware units appropriate to the failure:

- Browser action subsequences with their required initial state.
- Database rows, columns, or synthetic fixture entities and relationships.
- Network events and causal ordering edges.
- Services, packages, files, configuration, and environment variables.

Removing an entity may require removing its dependents as one candidate. Record
that grouping: group minimality is not single-element minimality. Do not mutate
the assertion or weaken its timeout to make a smaller candidate appear valid.

## Candidate evaluation

1. Construct a candidate from a known parent digest in an isolated workspace.
2. Check structural validity and reset all persistent state.
3. Replay with the same boundary and frozen assertion.
4. Classify the result as preserved target failure, target not reproduced, or
   INCONCLUSIVE. Keep infrastructure failures separate from target outcomes.
5. Accept a reduction only when evidence meets the baseline's repeatability
   criterion. Preserve the last verified candidate for interrupted searches.
6. Log removed units, candidate digest, outcome, runtime, and uncertainty.

Nondeterministic failures require a declared repetition rule. A single lucky
failure does not demonstrate that a race-triggering capsule retains the baseline
behavior. Repeated runs consume the same declared time/compute budget.

## Honest stopping and minimality

- Set budget dimensions before searching: wall time, executions, resources, and
  permitted cost. Stop at the budget or an authorization boundary.
- Report best verified reduction when the budget expires, including untested
  candidates and nondeterminism. Never convert an unknown result into success.
- Claim 1-minimality only if every permitted one-unit deletion from the final
  capsule was tested under the declared grouping and oracle, and none preserved
  the failure. Test these neighbors of the final candidate, not just ancestors.
- If neighbors remain untested within budget, say minimality is unverified.
- 1-minimal is not globally smallest. Report relative byte, entity, dependency,
  and replay-time changes only when actually measured.

## Boundaries and output

Do not use private production fixtures or hidden reference fixes to guide
reduction. Privacy transformations require their own validity check. Run
untrusted candidates in the approved sandbox without host Docker socket or
ambient credentials; denied writes are blockers, not permission to self-approve.
Return the verified capsule digest, reduction log, preserved-failure evidence,
budget used, and exact scope of any minimality claim.
