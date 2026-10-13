# Historical evaluation protocol (not a supplied dataset)

This kit supplies original synthetic development fixtures only. It does not contain twelve authentic historical bugs or forty held-out cases. Do not manufacture bug reports or relabel generated defects as historical.

## Intake
Select public, licensed, self-hostable app issues with a confirmed buggy revision, evidence of intended behavior, reproducible setup, and a later independently reviewed fix. Store source links and license obligations. Do not contact maintainers or publish their data without required permission. Exclude secrets, personal data and active security vulnerabilities from a public corpus; use approved synthetic replacements where validity can be established.

Start with a proposed 12-case development study across three applications; expand to a separately selected held-out cohort only after the protocol is stable. Record selection before tuning. Reference fixes and maintainer-added regression tests must not be visible to the reducer/patch-producing agent until evaluation. Keep evaluator material outside its workspace, not merely in another folder it can read. The template includes null revision fields deliberately; they are not completed cases.

## Baselines
Compare with ordinary documented container setup plus browser recording and strong Playwright test generation under matched time/model/tool budgets. If evaluating commercial tooling, disclose access and budget differences. Never design a deliberately broken baseline to obtain a percentage win.

## Execution
Run clean environments, identical inputs/expectations, recorded seeds and versions. Use a human-confirmed expected behavior or independently established contract. Track same-failure identity, setup cost, reduction trials, environment failures and cancellation. A correct fix satisfying one assertion is only bounded evidence, not universal correctness.

## Proposed go/no-go targets
Initial technical test: at least 9 of 12 selected cases transferable to two clean supported environments without undocumented setup; deterministic successes evaluated over 20 repeated runs. These are aspirations, not results. Reconsider the product if most cases need bespoke per-app repair or setup remains as difficult as a manual report.

## Leakage and publication
Maintain immutable cohort manifests with hashes and a changes log. Do not inspect sealed fix revisions while tuning. Publish actual failures and exclusions along with successes. Any résumé metric must be computed from completed records, never these targets.
