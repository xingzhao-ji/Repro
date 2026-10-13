# Repository instructions

Build the goal in GOAL.md; preserve the user's scope and the execution host's instructions. These rules never authorize bypassing sandbox, approval, or data-sharing requirements.

## Engineering
- Inspect before modifying. Separate capture, adapter, reducer, oracle, runner, and presentation boundaries.
- Use TypeScript strict mode for the intended product; the bundled dependency-free JavaScript fixtures are deliberately minimal test assets.
- Keep external service dependencies behind explicit adapters and schemas. Do not grow a generic framework before one real vertical slice works.
- Write the test that establishes the intended invariant, observe the bug, implement the smallest justified change, and rerun relevant regressions.
- Preserve independent assertion/harness identity during candidate verification. Do not skip assertions, broaden acceptance to hide a failure, or use a successful tool exit as evidence that the intended behavior happened.
- Keep all local generated run data under an ignored task-owned directory. Never ingest home-directory credentials, browser profiles, or unrelated files.
- Use structured errors with categories: input, unsupported, environment, harness, target-failure, cancelled, and verification. Preserve original cause without logging secrets.
- Make runtime limits, seeds, clocks, response schedules, and cancellation explicit. No public service should be a hidden requirement of a synthetic test.
- On a denied/canceled action, preserve the blocker and request the specific permission only if essential. Do not substitute another tool to evade it.

## Review
Use independent reviews for architecture, threat model, oracle validity, reduction semantics, and UI state coverage. Each review produces concrete findings with reproduction or source evidence; don't demand decorative approval text. Review only authorized files and effects.

## Truthful delivery
All reported completion must point to evidence. Keep actual observations separate from targets. Mark prototype assets, simulated data, known limitations, and unrun checks. Never claim human review, real users, historical-bug coverage, production readiness, universal determinism, or formal proof without evidence supporting that exact statement.
