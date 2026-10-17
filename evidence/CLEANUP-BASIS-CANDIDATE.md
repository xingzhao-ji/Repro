# Cleanup-basis candidate — prerequisites and native acceptance

October 16, 2026. Branch `task/cleanup-failure-basis` adds a fixed-vocabulary `Cleanup basis:` clause to `CLEANUP_FAILED` results for registered browser cases (see [ADR 0003](../docs/adr/0003-cleanup-failure-basis.md)). It is a diagnostic change: shutdown behavior, deadlines and profile retention are unchanged. It changes worker and harness bytes, so **none of `9aec7fe`'s acceptance transfers to it**. Its own native macOS arm64 gates have now passed (below). **Its Linux arm64 cohort has not run**: it is blocked on an owner decision about VM disk space.

[Machine-readable receipt](cleanup-basis-candidate.json) binds every log below by SHA-256. Paths are relative to the main checkout; raw logs are local and git-ignored.

| Check on tested source `1ae6ffc` | Result |
| --- | --- |
| Ordinary tests | **407/407** (382 before this branch, plus 25 new) |
| TypeScript, lint, build, starter kit | Passed |
| Functional browser selection (same 50 as `9aec7fe`) | **15/15 affected + 35/35 remaining** |
| Rule isolation | Removing any single consistency rule turns its own test red; recorded mutation checks |

## Native acceptance (cohort `.repro-runs/cleanup-basis-acceptance/v2`)

[Receipt](cleanup-basis-native-acceptance.json). The drivers are copies of the reviewed `9aec7fe` drivers with only the cohort path changed; their template diffs are retained. The run used an outside-iCloud checkout at the same product bytes, with real dependencies from the lockfile and the byte-identical pinned Chromium, and the cohort was copied into the candidate worktree with a verified tree hash.

| Gate | Result |
| --- | --- |
| Package smoke | 15 commands passed |
| Installed schema-3 | 18/18 operations |
| Native workflows | 15 measurements, all three cases |
| Native stability | **120/120** (20 buggy + 20 fixed per case) |
| Independent native audit | 150 unique runs, 131 frozen inputs, 853 records, no timing findings |

No run reported `CLEANUP_FAILED`. The historical htmx failure did not recur, which is not a causal explanation.

An earlier attempt from the iCloud worktree is preserved under `v1` and not counted. Its package smoke passed, but the installed-package driver correctly refused the symlinked browser path.

## Linux status

After a verified restart, the VM's Docker filesystem had 2.1 GB free. The space is held by six labeled per-case images that the passed `9aec7fe` Linux cohorts retained as artifacts, 1.92 GB each, and each candidate case needs two such builds. The VM was stopped and verified with nothing executed and nothing deleted. Removing retained artifacts or enlarging the approved data disk needs owner approval.

## How it was tested

- **Red before green.** Three ordinary-run tests first failed on the generic reason. A review round then added tests that were red before their fixes: early worker exit, unexplained cleanup failure, `no-budget`/`expired` implications, and non-string basis values.
- **Two rounds of automated review** by a read-only Claude subagent (not human review). All findings were fixed, except two reachable states without a fixture-driven test: `launch-join=expired` and `context-close=late`.
- **Browser substitution.** During this session, the pinned Chromium in `.repro-cache/browsers`, inside the iCloud-synced Desktop, stopped producing animation frames. Clicks therefore hung, for unchanged base code `9aec7fe` too. The 50-test run used a fresh Playwright download of the same build outside iCloud, with 18/18 files byte-identical, from a detached worktree at `1ae6ffc` also outside iCloud. Earlier runs made inside the synced folder are preserved as environment-contaminated and not counted. See `.repro-runs/cleanup-basis/browser-location-diagnosis.json`.

## Not verified

- No Linux arm64 cohort has run on this candidate.
- The original native htmx shutdown cause is unresolved; this change only makes a recurrence explainable from ordinary evidence.
- Accessibility remains deferred: eight focused or mixed browser scenarios, native zoom and screen-reader workflows.
