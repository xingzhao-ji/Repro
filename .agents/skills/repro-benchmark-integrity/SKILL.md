---
name: repro-benchmark-integrity
description: Build or audit Repro benchmarks with held-out failure assertions, leakage controls, reproducibility metrics, and honest accounting for unsupported or inconclusive cases.
---

# Repro benchmark integrity

Benchmark the portable failure compiler rather than its access to answers. Use
[the project goal](../../../GOAL.md) to keep evaluation aligned with supported
containerized web applications and resettable databases.

## Case construction and isolation

Each case needs a versioned buggy application, permitted synthetic initial state,
a frozen failure assertion with an established expectationBasis, a declared
runtime/replay boundary, and a
repeatability criterion. Include a fixed version only where comparison is part
of the benchmark and keep its implementation outside agent-visible capture and
reduction inputs. For local synthetic cases, use expectationBasis
supplied-synthetic-specification and humanApproval not-claimed or pending unless
actual human approval is evidenced; do not block unrelated local development.

Use separate locations and access boundaries for agent inputs and evaluator-only
reference fixes or withheld tests. Naming a directory private is insufficient
when the tested agent can read it. Inspect prompts, package contents, git history,
logs, caches, and generated artifacts for accidental answer leakage.

Do not let reference fixes, hidden assertions, or post-hoc oracle changes guide
capture, reduction, or candidate selection. If leaked material was accessible,
mark the affected evaluation contaminated and rerun with a fresh isolation setup;
do not silently exclude only its embarrassing outputs.

## Freeze before running

Record case IDs/splits, assertion hashes, baseline versions, environment and tool
versions, budget policy, repetition criterion, metrics, and exclusion rules.
Keep tuning cases separate from held-out evaluation cases. Document duplicates
or close variants across splits and group related failure families when needed.

Changing a timeout, fixture, mock boundary, or assertion after seeing a result
creates a new benchmark configuration. Retain the original result and identify
the change; do not overwrite history as if the configuration were unchanged.

## Metrics that expose failure modes

- Report the total case count and explicit denominators for every success rate.
- Separate supported, unsupported, contaminated, invalid, and INCONCLUSIVE cases.
  Report exclusions and why they occurred; missing results are not PASS.
- Measure capture success, sanitized reproduction, clean-machine replay, and
  buggy-fails/fixed-passes comparison separately.
- Report replay repeatability, reduction size, time/compute cost, and budget
  exhaustion. Preserve per-case results alongside aggregates.
- Claim 1-minimal reduction only for candidates whose final one-unit neighbors
  were actually tested under the stated units and budget.
- For stochastic outcomes, report the run count and distribution or uncertainty;
  do not select the most favorable run as the case result.

A capsule that mocks backend output may count toward an explicitly frontend-only
claim. It cannot count as evidence that a backend fix works. Privacy masking that
changes the target failure invalidates that sanitized reproduction claim.

## Reporting and execution boundaries

Publish a local reproducibility manifest and traceable per-case evidence without
private data or evaluator secrets. Publication itself requires authorization;
so do owner-information sharing, credential access, and paid services.
Run untrusted benchmark applications/capsules in the approved sandbox without
host Docker socket, privileged host mounts, or automatic credential injection.
Respect host permission denials and report the blocked case as INCONCLUSIVE when
its required observation cannot be made.
