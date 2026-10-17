# Cleanup-basis candidate — prerequisite verification only

October 16, 2026. Branch `task/cleanup-failure-basis` adds a fixed-vocabulary `Cleanup basis:` clause to `CLEANUP_FAILED` results for registered browser cases (see [ADR 0003](../docs/adr/0003-cleanup-failure-basis.md)). It is a diagnostic change: shutdown behavior, deadlines and profile retention are unchanged. It changes worker and harness bytes, so **none of `9aec7fe`'s native, installed-package or Linux acceptance transfers to it**. No acceptance cohort has run on this candidate.

[Machine-readable receipt](cleanup-basis-candidate.json) binds every log below by SHA-256. Paths are relative to the main checkout; raw logs are local and git-ignored.

| Check on tested source `1ae6ffc` | Result |
| --- | --- |
| Ordinary tests | **407/407** (382 before this branch, plus 25 new) |
| TypeScript, lint, build, starter kit | Passed |
| Functional browser selection (same 50 as `9aec7fe`) | **15/15 affected + 35/35 remaining** |
| Rule isolation | Removing any single consistency rule turns its own test red; recorded mutation checks |

## How it was tested

- **Red before green.** Three ordinary-run tests first failed on the generic reason. A review round then added tests that were red before their fixes: early worker exit, unexplained cleanup failure, `no-budget`/`expired` implications, and non-string basis values.
- **Two rounds of automated review** by a read-only Claude subagent (not human review). All findings were fixed, except two reachable states without a fixture-driven test: `launch-join=expired` and `context-close=late`.
- **Browser substitution.** During this session, the pinned Chromium in `.repro-cache/browsers`, inside the iCloud-synced Desktop, stopped producing animation frames. Clicks therefore hung, for unchanged base code `9aec7fe` too. The 50-test run used a fresh Playwright download of the same build outside iCloud, with 18/18 files byte-identical, from a detached worktree at `1ae6ffc` also outside iCloud. Earlier runs made inside the synced folder are preserved as environment-contaminated and not counted. See `.repro-runs/cleanup-basis/browser-location-diagnosis.json`.

## Not verified

- No native workflow/stability, installed-package or Linux cohort has run on this candidate.
- The original native htmx shutdown cause is unresolved; this change only makes a recurrence explainable from ordinary evidence.
- Accessibility remains deferred: eight focused or mixed browser scenarios, native zoom and screen-reader workflows.
