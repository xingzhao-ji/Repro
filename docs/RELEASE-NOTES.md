# Repro 0.2.0 — one REPRO.md from your own app

Release package: `repro-local-0.2.0.tgz`, built with `npm pack` from the release commit on branch `release/repro-report-0.2.0` and tagged `v0.2.0-beta`. Its SHA-256, and the acceptance runs of that exact tarball, are recorded in [`evidence/REPRO-REPORT-RELEASE.md`](../evidence/REPRO-REPORT-RELEASE.md).

## What is new

Repro now works on **your own local web app**. Give it the app folder (and, optionally, the URL where it already runs), say what went wrong and what should happen, and press **Generate report**. Repro then:

1. **Checks the app read-only:** how it starts (`repro.config.json`, a `package.json` script, or static files), the exact git commit and any uncommitted changes, the lockfile and dependencies. It asks only for what is missing.
2. **Understands the description** with a small, documented grammar: `Click "Add"`, `Type "milk" into "New item"`, `"Total" should show "$8.10"`. You can also **demonstrate** the bug in a browser window, and Repro writes the steps down. Nothing runs until you confirm the steps, the checks and the exact command.
3. **Reproduces** from fresh state: the app is restarted and a fresh browser profile is used for every run, with non-local network blocked. It reports **Reproduced**, **Intermittent**, **Not reproduced** or **Blocked** from actual runs only.
4. **Shortens the steps** when that is sound: only when the expectation cannot depend on which steps ran, or you declare that it doesn't. Steps that change a checked value are always kept.
5. **Writes a standalone regression test**: `node:test` + Playwright, with no Repro dependency. It starts your app, repeats the steps, and fails until the bug is fixed.
6. **Checks the report in a fresh clone** by following its own instructions, then writes one **REPRO.md**. The file holds the status, expected versus observed behavior, the exact revision and local-changes patch, environment and dependencies, sanitized logs, kept-apart observed facts and suspected and verified causes, the test files as hash-checked code blocks, the commands to run them, the fix criteria, and the limits.

It runs on the same certified browser worker, reducer, evidence ledger and loopback-only server as 0.1.0, and it is available as the default workbench page (`repro serve`) and as `repro report` / `repro app` on the CLI. The 0.1.0 registered cases remain as **Built-in examples** (`#/new`). [QUICKSTART](QUICKSTART.md) and [LOCAL-APPS](LOCAL-APPS.md) document the workflow and its exact scope; [ADR 0005](adr/0005-local-app-repro-report.md) records the design.

## Trust and privacy

- Values typed into password-like fields, and anything that looks like a credential or personal data, are withheld from the report. The recipient supplies them as environment variables.
- The following are removed from logs, observed values, text, remotes and the local-changes patch:
  - tokens, keys, JWTs, cookies, authorization headers and secret-named values;
  - personal emails, phone numbers, card numbers and public IPs;
  - your home path, username and hostname.
- Sensitive files and untracked non-source files are listed by name only. A final whole-document scan checks for withheld values and credentials.
- Repro never writes to your repository. It reads git with optional locks disabled, runs nothing before you confirm, and blocks non-local requests in its browser.

## Fixed during this release

An independent multi-agent review of the feature found, among others, these defects, and each was fixed before acceptance:

- unsound step shortening for value checks;
- an inconclusive capture counted as meeting the expectation;
- a containment-signature truncation;
- REPRO.md install and patch order;
- patch application in monorepo subfolders;
- redaction rewriting identifiers such as `node:test` for common usernames;
- planted file blocks in logs;
- secrets in a typed start command;
- leaked processes on cancellation;
- several UI state errors.

They are listed with their regressions in the release evidence.

## Known limits

- Chromium only (headless, pinned 156 via Playwright 1.64), on macOS arm64 and Node 26.7.0 as measured. Linux was not part of 0.2.0 acceptance. Windows is not supported, because the exported test uses POSIX process groups.
- State outside the browser and the app process (databases, files, external services) is not reset. Non-local services are blocked, not mocked.
- Repro does not diagnose causes or change your code. "Verified causes" stays empty unless it was actually verified.
- Accessibility remains deferred and unverified, as in 0.1.0.

---

# Repro 0.1.0 — practical beta (previous release)

Release package: `repro-local-0.1.0.tgz`, built with `npm pack` from the release commit on branch `release/practical-beta-0.1.0`, which is tagged `v0.1.0-beta` once every gate passes. Its SHA-256 and the verification of that exact tarball are recorded in [`evidence/PRACTICAL-BETA-RELEASE.md`](../evidence/PRACTICAL-BETA-RELEASE.md). A documentation-only commit adds that report after the release commit, because a tarball cannot contain its own verification report.

## What it does

Repro turns a reproducible browser failure plus an explicitly declared expected behavior into a portable regression package:

1. **Declare** the expected behavior. Use a registered case's issue-derived declaration (`repro cases --case ID`), or author one for the synthetic search app. The declaration is frozen into the assertion's identity.
2. **Capture** the failure with explicit consent in a fresh browser profile. The buggy revision must fail that exact assertion; anything else is inconclusive.
3. **Reduce** the action sequence. Each accepted deletion must reproduce the same failure twice in fresh state, within at most 80 executions and 300 seconds.
4. **Compare** the buggy and fixed revisions in separate fresh runs with the same assertion and harness.
5. **Export** an integrity-checked capsule with a readable `node --test` regression test. It runs from a fresh install without the original workspace, an LLM or any proprietary viewer.

The CLI (`record`, `replay`, `reduce`, `verify`, `export`, `inspect`, `cases`, `doctor`, `serve`) and the local workbench share one execution core.

## Supported workflows

| Workflow | Source | Expected behavior |
| --- | --- | --- |
| Synthetic stale-response search (alpha baseline) | Bundled fixture | Supplied specification, or a caller-authored schema-2 declaration |
| `morphdom-textarea` | Actual pinned morphdom source, [issue 19](https://github.com/patrick-steele-idem/morphdom/issues/19) | Morphing to a textarea updates its live value |
| `htmx-checkbox` | Actual pinned htmx source, [issue 2755](https://github.com/bigskysoftware/htmx/issues/2755) | A delegated trigger does not cancel a native checkbox change |
| `marked-empty-heading` | Actual pinned Marked source, [issue 3048](https://github.com/markedjs/marked/issues/3048) | An empty ATX heading interrupts a paragraph (CommonMark 0.30 §4.2) |

The three cases are selected development cases with small integration pages. They are not held-out evaluations, and they are not coverage of each project's full application.

## Changes since implementation 9aec7fe

`9aec7fe`, the startup cleanup repair, passed its own native and Linux acceptance ([native](../evidence/STARTUP-CLEANUP-NATIVE-ACCEPTANCE.md), [Linux](../evidence/LINUX-THREE-CASE-RESUME.md)). Release verification then exercised CLI cancellation through the installed package and found three defects. The release contains:

- **Terminal Ctrl-C no longer defeats certified cleanup.** The case worker shared the CLI's process group, so a terminal interrupt killed it directly. The run then reported `CLEANUP_FAILED` and kept an empty browser profile, although no process survived. The worker now runs in its own process group, and cancellation reaches it only through the CLI ([ADR 0004](adr/0004-cancellation-signal-boundary.md)).
- **A cancelled synthetic run cannot keep the CLI alive.** If cancellation landed while a synthetic run was still creating its directory, the owned fixture server could bind after the run had returned. Its socket then kept the CLI process running after it printed a `cancelled` result. A late-bound server now closes itself.
- **A cancelled `export` exits 130.** It previously exited 2, although its JSON already reported `cancelled` and nothing was finalized.
- **`CLEANUP_FAILED` names the failed condition.** Its reason carries a validated, fixed-vocabulary `Cleanup basis:` clause, such as `context-close=timeout` or `worker=closed-before-cleanup` ([ADR 0003](adr/0003-cleanup-failure-basis.md)). The retention decision itself is unchanged.

Each fix has a regression that failed before the change and passes after it. These changes alter runtime and harness bytes, so none of `9aec7fe`'s acceptance transfers. The release has its own verification.

Budgets are unchanged from the [frozen protocol](../benchmarks/PRACTICAL-BETA-PROTOCOL.md):

- capture and each replay: 30 s;
- reduction: at most 80 executions and 300 s;
- export: 15 s;
- clean setup: 15 minutes;
- cleanup: 5 s after ordinary completion and 8 s after cancellation or timeout.

## Known issues

- **Historical htmx shutdown failure, cause unresolved.** On an earlier build, one fixed htmx run (repetition 15 of a native stability cohort) completed its assertion but missed the browser-shutdown acknowledgment. It reported `CLEANUP_FAILED` and kept its profile, as designed. Later cohorts passed without recurrence, which does not explain the original cause. If it recurs, Repro still fails safe: it reports `CLEANUP_FAILED` with its cleanup basis, retains the profile and never claims a pass.
- **A worker signalled directly by an outside tool still fails safe.** Ctrl-C, SIGTERM to the CLI and workbench Cancel are the supported cancellation paths. Signalling the worker's own PID can still produce `CLEANUP_FAILED` with a retained profile.
- **Linux verification driver blind spot.** `scripts/verify-beta-isolated.mjs` lists images with `docker image ls --quiet`. Under Docker 29 that listing hides untagged images, so the driver's foreign-image check cannot see them. Earlier independent audits listed images with `--all` and found only each cohort's own labeled images. The driver is not part of the npm package.

## Limitations

- Only the four registered workflows above. Arbitrary websites, authenticated apps, databases, WebSockets and real-user recording are unsupported, and are rejected rather than silently approximated.
- Ordinary containers are a development boundary, not hostile-code isolation. Do not execute untrusted capsules.
- Platform claims are limited to what the release evidence records: native macOS arm64, and isolated Linux arm64 on one task-owned VM when that evidence is present. Linux amd64, Windows and other physical machines are untested.
- Reduction deletes actions and dependency groups only. It reports minimality as unverified and never claims global minimality.
- Repeated passing runs are bounded evidence, not proof of determinism.
- **Accessibility is deferred and unverified.** That covers native 200% zoom, actual screen-reader workflows and the 8 accessibility-focused or mixed browser scenarios. Keyboard, focus and automated checks keep their earlier scoped results only.
- No hosted deployment. Repro runs locally; the private GitHub repository holds source, not a deployed service.

See [SUPPORTED-SCOPE](SUPPORTED-SCOPE.md) for the complete boundary matrix.
