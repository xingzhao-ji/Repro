# ADR 0005 — Local web apps produce one REPRO.md report

Status: accepted for release 0.2.0, October 2026. Builds on releases 0.1.0 and earlier ADRs, without replacing them.

## Context

Release 0.1.0 reproduces, reduces, compares and exports only registered cases: the synthetic search fixture and three pinned public libraries. Its contracts check every manifest against a registry. A developer cannot bring their own application.

The 0.2.0 goal is a developer tool. A developer brings a bug in their own local web application and writes what went wrong and what should happen. Repro then returns one Markdown file. A teammate or coding agent can use that file to understand the problem, reproduce it, fix the original application, and rerun the same test. The recipient must not need Repro, an AI subscription or a Repro server.

## Decision

### Boundary

The target is a user-owned or authorized web application on the developer's machine, served over loopback HTTP. The developer gives the repository folder, an optional running loopback URL, or both.

Repro starts the app in one of three ways:

1. **An explicit `repro.config.json`** in the repository, whose fields are documented in `docs/LOCAL-APPS.md`.
2. **A `package.json` script.** Repro tries `dev`, then `start`, `serve` and `preview`, and runs it with the package manager that the lockfile implies.
3. **Built-in static serving** for a folder that has an `index.html` but no scripts.

An already-running URL is used as given. Repro then cannot restart the app or tie its responses to a source revision, and the report says so. Repro never edits Repro source for an app, never hard-codes an app, and never needs a fixed revision. The app is described by detected configuration and recorded data.

Repro executes the developer's own start command with the developer's permissions, after an explicit confirmation that shows the exact command, folder and URL. It is not a sandbox for hostile code. Each run gets:

- a fresh browser profile with a seeded `Math.random`;
- the app started in its own process group on a free port;
- a block on every request to a host other than 127.0.0.1, localhost or ::1, which is recorded.

Blocking non-loopback hosts prevents accidental production mutations. Repro never writes to the target repository: git is only read, with `GIT_OPTIONAL_LOCKS=0`, and fresh checkouts are separate clones under `.repro-runs/`.

### Data model: manifest schema 4

`ManifestV4` (`src/app-contract.ts`) holds the following:

- **Actions.** Each action is `navigate`, `click`, `dblclick`, `fill`, `press`, `check`, `uncheck`, `select`, `hover`, `wait-for` or `reload`. Its target uses one exact Playwright locator strategy: role plus name, label, placeholder, text, test id, title, alt, or CSS. The reporter's original sentence is kept with it.
- **An explicit expectation.** It is a list of checks. Each check names a target and property (`text`, `value`, `checked`, `visible`, `count`, `url` or `page-errors`), a comparison (`equals`, `contains`, `not-equals` or `not-contains`), and an expected value.
- **A frozen failure signature**, which is the observed values from the first failing run.
- **The source identity digest** that the orchestrator computed from git.

Sensitive inputs are not stored in the manifest. These are values typed into password-like fields, values that look like a token, key or card number, and email addresses outside reserved example domains. In their place the manifest names an environment variable such as `REPRO_SECRET_1`.

`evaluateObservation` classifies each run in one of three ways:

- **`requirement-satisfied`:** every check passes.
- **`target-failure`:** a check fails and the observed values equal the frozen failure signature. The capture run itself freezes that signature.
- **Inconclusive:** a check fails with any other values (`DIFFERENT_FAILURE`), a step cannot be performed, the deadline expires, the app is unreachable, or cleanup is not certified.

Reduction therefore preserves the reported failure. A different failure, such as an element missing because a prerequisite step was removed, does not count.

### Reuse of 0.1.0 infrastructure

- **Runner.** Browser runs use the existing fixed case worker, so the process group, IPC protocol, creation fence and cleanup certification are unchanged. The worker accepts schema 4, and `executeAppBrowser` runs the steps. The parent validates a schema-4 receipt with the same cleanup predicates. Reasons are templated and contain no target text. A profile is removed only after certified completion. Otherwise the run is `CLEANUP_FAILED` and the profile is kept, as before.
- **App process.** The app server is owned by the parent, in its own process group. Stopping it sends SIGTERM to the group, then SIGKILL after a grace period, then checks that the group and port are gone. A survivor makes the run inconclusive with `APP_CLEANUP_FAILED`.
- **Reduction.** This uses the existing `reduce()` delta-debugging search over actions and their `dependsOn` groups, with repeated acceptance, full trial accounting and an explicit budget. It runs only when the expectation cannot depend on which steps ran: every check is "there should be no errors", or the reporter declares it. Negative checks are not step-independent by themselves; "the total should not show $0.00" also holds for a correct app before an item is added. Even then, steps that changed a checked value in a traced run are pinned. Minimality is claimed only after at least one permitted removal was tested.
- **Comparison.** "Buggy versus fixed" is generalized to the same frozen test on two source states. One is the report's captured revision. The other is a later revision or working tree that the developer chooses, so a fix can be checked. The report records it only if it was run.
- **Evidence.** Each step writes its JSON to an owned directory under `.repro-runs/`, with the same path and link checks.

### Report flow

The orchestrator is `src/report-flow.ts`.

1. Inspect the app: source identity, launch plan and missing essentials.
2. Parse the steps and checks.
3. Capture, which also resolves the targets.
4. Reproduce three times from fresh state.
5. Classify the result as reproduced, intermittent, not reproduced or blocked.
6. If the failure was reproduced, reduce the steps within the budget, then confirm the reduced steps three times.
7. Generate the test.
8. Check it in a fresh checkout: clone the exact commit, apply the embedded local-changes patch, install, materialize the files from the generated REPRO.md itself, and run the test.
9. Write REPRO.md and `report.json`.

Cancellation stops the current stage and frees every owned process. No REPRO.md is written for a cancelled report.

### The exported test

The test is one plain ES module, `.repro/<slug>.test.mjs`, using `node:test` and the `playwright` library pinned to Repro's own version. A minimal `.repro/package.json` and lockfile come with it. The test:

- starts the app with the same command, or uses `REPRO_BASE_URL`;
- performs each step as an explicit Playwright locator call;
- settles and polls with the same rules as Repro's runner;
- prints a single `REPRO_OBSERVATION` JSON line;
- fails with `REPRO_EXPECTATION_FAILED` until the expectation holds.

The test has no Repro dependency. REPRO.md embeds these files as fenced blocks whose info string names a path under `.repro/` and its SHA-256. It also gives a small Node extraction command. The command writes only those paths, refuses to overwrite and checks every hash; copying the blocks by hand works too.

### Truthfulness

The status and every observation come only from executed runs. The report keeps three things apart:

- **Observed facts**, from runs, trials and the fresh-checkout check.
- **Suspected causes.** These are the reporter's own words, and errors logged during the run, labelled as possibly related.
- **Verified causes.** There are none unless a fix comparison actually ran. Even then, the report says only that a revision satisfies the expectation.

Minimality is "verified within the search budget" only when the reducer's dependency-group neighborhood check completes. Otherwise the report says it is unverified.

### Redaction

`src/redaction.ts` applies the following to logs, diffs, free text and remote URLs:

- **Credential patterns:** private keys, cloud and SaaS tokens, JWTs, bearer and basic credentials, cookie headers, and key/token/password assignments.
- **URL userinfo and sensitive query parameters.**
- **Emails outside reserved domains, phone numbers and Luhn-valid card numbers.**
- **The home directory and username**, which become `~`. The machine's hostname is removed.

Files with sensitive names (`.env*`, keys, certificates, `credentials*`, `secrets*`) are left out of the local-changes patch and only their names are listed. A final scan over the whole document redacts any secret value that is still known or still matches a credential pattern, and the report lists every redaction by kind. Redaction is a safeguard, not a guarantee, and the documentation says so.

## Rejected alternatives

- **Running the exported test file for every internal run.** It would make the two implementations identical, but it bypasses the certified worker lifecycle and fine-grained evidence. Instead, Repro runs the generated file once in the fresh checkout and compares its observation with its own runs. Any difference is reported.
- **An LLM to read free text.** It is not allowed without paid services and approval, and it is not deterministic. Instead, a small documented grammar recognizes steps and checks. Unrecognized lines stay as the reporter's notes, and the UI asks only for what is missing.
- **Embedding the application in the report.** That is impossible for real apps and would mislead. The report pins the commit, the remote and the local-changes patch, and lists what is missing.
- **Accepting any failing check as reproduction.** That invites failure slippage during reduction, so the frozen signature is required.
- **Shortening value checks with a trace alone.** The first implementation removed steps that left every checked value unchanged in a traced run. The independent review found two ways this fails:
  - in a "clicking Add does nothing" bug, the useless click is the bug and changes nothing, so it was removed;
  - a field filled before a later click is likewise removable.

  Either way, the shortened test could fail on a correct app while the report claimed Reproduced. Value checks are therefore not shortened unless the reporter declares them step-independent.
- **Treating negative checks as step-independent.** The 0.2.0 release shortened steps automatically for "should not show", "should not contain" and "should not be visible" checks. The 2026-10-18 foreground review showed the same failure there. With "Total should not show $0.00" when adding an item does nothing, the report was shortened to "Open the app", and its test failed on the correct app. Only "no errors" checks now qualify automatically.

## Consequences

Schema 1–3 behavior, cases and acceptance thresholds are unchanged. The worker and client now dispatch on schema, so executable and harness digests change. The 0.1.0 platform evidence does not transfer to 0.2.0 runtime bytes, and existing tests must still pass.

New limits are documented:

- Repro cannot track processes that the app detaches from its own process group.
- Databases and other state outside the browser and app process are not reset.
- Authenticated flows work only with withheld test credentials passed through environment variables.
- Non-loopback dependencies are blocked, not mocked.
