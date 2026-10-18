# Foreground review of the diff against `main`, and a clean-checkout recipient run

October 17, 2026, about 22:00–23:05 PDT (October 18 in UTC, the date used in the message of commit `11a42f0`), on macOS arm64 with Node 26.7.0.

**What kind of review this is.** The agent that implemented Repro 0.2.0 did this review, in the same working session (continued after a context summary), without subagents, as the owner asked. It then fixed what it found. **It is not an independent review.** Each finding below was confirmed by a test that failed before the fix, or is marked as reported only.

## Scope

- **The diff reviewed:** `origin/main` `88fedc5` … `feature/repro-report` `a8eaf7e`. That is 68 commits and 234 files, and it includes the unmerged 0.1.0 practical-beta work.
- **Read line by line (all of the 0.2.0 application → REPRO.md workflow):**
  - `report-flow.ts`, `app-contract.ts`, `app-execution.ts`, `app-inspect.ts`, `app-process.ts`;
  - `report-test.ts`, `report-markdown.ts`, `redaction.ts`, `steps.ts`, `demonstration.ts`;
  - the changes to `server.ts`, `service.ts`, `cli.ts` and `ledger.ts`;
  - `web/report.tsx`;
  - the shared worker `case-execution.ts`.
- **Checked for security and cleanup only:**
  - `browser-case.ts`: source loading, pinned by digest and read without following links;
  - `scripts/verify-beta-isolated.mjs` and `scripts/measure-beta.mjs`: they act only on owned process groups and on owner-labelled containers and volumes;
  - the test diff: no assertion removed, and only Windows-only `skip`s.
- **Not read line by line:** the 58k vendored lines under `fixtures/repository-cases/`, which are 0.1.0's pinned public libraries.

## Findings

Line numbers refer to `a8eaf7e`. All fixes are in `11a42f0`, with regressions in `tests/foreground-review.test.ts` and `tests/foreground-review.browser.ts`.

| # | Severity | Where | Defect | Status |
| --- | --- | --- | --- | --- |
| A | High | `src/report-flow.ts:281` | Negative checks (`should not show`, `should not contain`, `should not be visible`) were treated as step-independent, so steps were shortened automatically. In the test case, "Total should not show $0.00" with an Add button that does nothing, the 3-step report was shortened to "Open the app", and the report said the expectation "does not depend on which steps ran". That test fails on a correct app | Fixed: only "no errors" checks qualify automatically; others need the reporter's declaration. The end-to-end regression shows the exported test now fails on the buggy app and passes on the fixed one |
| B | Medium | `src/report-flow.ts:260` | "Intermittent" was reported when no run met the expectation (capture and one repetition failed, two were inconclusive) | Fixed: intermittent requires both outcomes; thin evidence is Blocked |
| C | Low | `src/report-flow.ts:276–277, 319` | Without a trace, the shortening note claimed "every step changed a checked value" | Fixed: the note says no trace was recorded |
| D | Medium (privacy) | `src/report-flow.ts:203–214` | A value typed into a field recognised as a password only during the capture (for example `type=password` with placeholder "Enter your code") appeared in a **Blocked** REPRO.md | Fixed: such values are withheld as `REPRO_SECRET_n` on the blocked path too; the end-to-end regression confirms the value is absent |
| E | Medium (privacy) | `src/report-flow.ts:66–71`, `src/cli.ts` (default output folder) | Without a title, the title and the test's file name came from the first line, for example `Type "alice.walker@gmail.com" into "Email"`. The final scan could then also break that file block | Fixed: a derived title never comes from a line that contains a typed value |
| F | Low | `src/report-markdown.ts:129` | "Source revision" told a subfolder app's recipient to run plain `git apply`, which skips changes outside the folder; the numbered steps used the correct command | Fixed: one root-relative command everywhere |
| G | Medium | `src/report-markdown.ts:150, 203`, `src/report-flow.ts:324` | An intermittent report whose capture passed printed "Repro expected that ." and promised "This is the failure recorded in REPRO.md", which its test could never print | Fixed: a failing repetition is shown, and the text depends on whether a failure was recorded |
| H | Low | `src/report-markdown.ts:62` | A logged string containing a double backtick broke out of its code span | Fixed |
| I | Low | `web/report.tsx:146` | The idempotency key survived edits. After a lost response, a different description could be answered with the earlier report | Fixed: each edit starts a new key |
| J | Low | `src/report-test.ts:141` | The test accepted REPRO.md's `'…'` placeholder as the withheld value and then failed for a different reason | Fixed: it stops with "Set REPRO_SECRET_n …" |
| K | Low | `src/report-flow.ts:507–512` | The redacted-patch `git apply` had no `error` handler | Fixed |

### Reported only (not changed)

- **Root handoff files.** `CLAUDE_HANDOFF.md` and `CLAUDE_TAKEOVER_PROMPT.md` are agent-handoff instructions from the 0.1.0 work. They describe a superseded state, for example "Marked remains unrun", and contain a local path with the owner's username. They are the owner's existing work, so they were left in place. **Decide before merging:** keep them, or move them under `docs/history/`.
- **First printed URL used.** An app that prints another local URL first, such as an API address, is probed at that URL. The workaround is `repro.config.json` `url` (`src/app-process.ts:142`).
- **Short secrets not redacted.** Known secrets shorter than 4 characters are not redacted, a trade-off against false matches (`src/redaction.ts:67`). Such values are still withheld from the manifest and the test.
- **Recorder stores typed values.** The guided demonstration records typed values, including a password, into the draft description, which is kept in the tab's sessionStorage. REPRO.md withholds them by the same rules as typed descriptions.
- **Runs that never started.** A run whose app failed to start counts toward the status but is not listed in the evidence table.
- **The released package.** The `v0.2.0-beta` tarball (`99ec27cc…`) contains defects A–K. Its four example reports are not affected: their equality checks were not shortened, and no example has a capture that passed.

## Checks after the fixes

All were run at `11a42f0`:

| Check | Result |
| --- | --- |
| typecheck, lint, build | pass |
| ordinary suite | 449/449 |
| functional browser suite | 72/72, with the three deferred accessibility scenarios excluded by name, as before |
| `npm run test:package` | pass |

## Packaged acceptance of the fixed code

`repro-local-0.2.0.tgz` was packed from `11a42f0` (SHA-256 `db550ad19770f0dae45b6dbad353b1f9af256d31daa105220c660bb7a969612f`). The same driver as the release acceptance ran on that exact tarball, cohort `fg-acceptance` in `~/Developer/repro-acceptance/release-0.2.0/`. All eight checks passed:

- **installed version:** passed;
- **shopping-list:** reproduced, and its fresh checkout reproduced;
- **cafe-orders:** reproduced, and all 8 canaries are absent;
- **not reproduced:** a fixed clone was correctly reported as not reproduced;
- **cancellation:** exit 130 after 1.27 s, no REPRO.md written, no leftover processes or profiles;
- **scripted recipients, both apps:** exit 1 with "This is the failure recorded in REPRO.md", then exit 0 after the controlled fix.

The post-hoc pantry-scale rerun through the installed workbench page was also **Reproduced**. Its scripted recipient passed with the sealed fix (SHA-256 `dfe36e3b…`). This is not held-out evidence (see REPRO-REPORT-RELEASE.md).

## Recipient workflow from a clean checkout (foreground, by the same agent)

- **Product:** `repro-local-0.2.0.tgz` packed from `11a42f0`, SHA-256 `db550ad19770f0dae45b6dbad353b1f9af256d31daa105220c660bb7a969612f`. It was installed into an empty npm project and run with `repro report` (the CLI, the same input as the release acceptance).
- **App:** `cafe-orders`, an authorized acceptance app (Express 5) at commit `14f58765676cae37f3740fb6bcff32e3c3c51219`, with uncommitted changes and a password sign-in.
- **The report:** **Reproduced**, 4/4 runs, fresh checkout reproduced. The handoff file's SHA-256 is `5613aeff5cb4000b759e5983a6f5684b030605cc28831eb90ada07ff76d4d111`. The typed password appears 0 times in it.
- **The recipient environment:**
  - a new folder containing only that REPRO.md, and an empty HOME, so npm and browser caches started empty;
  - an environment of only `PATH`, `HOME`, `TMPDIR` and `LANG`;
  - no Repro installation or server, and nothing from the generating session. `repro` was not on PATH.
- **The commands:** every command was copied from REPRO.md's own `sh` blocks and run in order.

| Step | Command | Result |
| --- | --- | --- |
| 1 | `git clone <repository URL or path> cafe-orders && cd cafe-orders && git checkout 14f5876…`, with the placeholder replaced by a copy containing the commit (the bare repository) | HEAD `14f58765…` |
| 2 | The `node --input-type=module -e '…' REPRO.md` extraction block, verbatim | Wrote the test, `package.json`, `package-lock.json` and `local-changes.patch`, each hash-checked |
| 3 | `git apply .repro/local-changes.patch` | `M lib/discounts.js`, `M lib/orders.js`; the untracked `notes-private.txt` was not embedded |
| 4 | `npm ci` | Installed |
| 5a | The run block **verbatim**, which exports `REPRO_SECRET_1='…'` | Exit 1, `Set REPRO_SECRET_1 to the value typed into "Password" … before running.` **A setup failure, not a reproduction:** no observation was made |
| 5b | The same block with only the export line set to the password the reporter supplies | Exit 1, `REPRO_EXPECTATION_FAILED`: `#total` `$7.29` (expected `$8.10`), `#status` "WELCOME10 applied: 10% off." (expected "Code already applied"). "This is the failure recorded in REPRO.md." |
| Fix | `git apply cafe-orders-fix.patch` to the app (the controlled fix, SHA-256 `52831814…`) | Two app files changed |
| Unchanged test | Hash check of every `.repro/` file against REPRO.md | All 4 unchanged |
| 6 | `export REPRO_SECRET_1=…; node --test .repro/welcome10-can-be-applied-twice.test.mjs`, the same command as before the fix | **Exit 0**: `$8.10`, "Code already applied", satisfied |
| Cleanup | Process and port check | No recipient processes left |

**What the recipient needed beyond REPRO.md**, both of which REPRO.md names explicitly:

1. **A reachable copy of the repository.** The app's only remote is a path on the reporter's machine, and REPRO.md says so and suggests a pushed branch or `git bundle`.
2. **The withheld password**, as `REPRO_SECRET_1`.

The setup also needs network access for `npm ci` and the Playwright Chromium download: 206 MB of browser and 5 MB of npm cache into the empty HOME. REPRO.md implies this through its commands but does not state the size.

**No essential instruction was missing.** The handoff file references no temporary path, no Repro server and no Repro installation.

## Coding-agent recipient trial: unverified

A separate coding agent was to receive only REPRO.md and a bare clone, then reproduce, fix and verify the held-out bug. Every launch stopped before its first response with **"Agent stalled: no progress for 600s (stream watchdog did not recover)"**:

- two direct launches and one workflow launch, which retried four times, earlier on October 17;
- one more direct launch during this review.

Diagnostic agents asked only to reply "ready" stalled the same way on three models (the default, Sonnet and Haiku). No trial work folder was ever created. The self-run recipient workflow above is **not** a coding-agent trial and is not reported as one.
