# Repro 0.2.0 — release evidence

October 17–18, 2026, on one macOS arm64 machine (Darwin 27.0.0, Node 26.7.0, npm 11.19.0, Playwright 1.64.0 with headless Chromium 156.0.8078.4). Everything below was observed during these runs. Where a check was not run, this report says so.

## Release identity

| | |
| --- | --- |
| Release commit | `5ca54f101d517626551d53d0b9756d4eea99a83c` on branch `release/repro-report-0.2.0`, tagged `v0.2.0-beta`. This evidence is in the commit on top of it |
| Package | `repro-local-0.2.0.tgz`: 1,875,935 bytes, 206 entries |
| SHA-256 | `99ec27ccea0b812858573b6f174a332550dbfaf9bba69072529516565230ad2a` |
| npm integrity | `sha512-b+LcnccjtcC5KMoj6f/mB90Gy/IhQpp0z2iQT1Chxf46NDM+puUGuBc1CpqG9EOc1a/smndgnllzzNjuzdLnvA==` |
| Reproducible build | A second `npm run build` + `npm pack` of the release commit produced the same SHA-256 |
| Previous candidate | rc3 (`091d7a0`, SHA-256 `ff21457a…`). Its `dist/` and every other runtime file are byte-identical to the release (154 files compared). The release adds only the four example REPRO.md files and two doc links |
| Not done | No merge to `main`, no GitHub Release, no npm publication, no deployment |

## Automated checks on the release code

No file under `src/`, `web/`, `tests/`, `scripts/` or `schemas/`, and neither `package.json` nor `package-lock.json`, changed between `ea4105f` (browser suite below) and the release commit.

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | Pass |
| Ordinary suite (`npm test`) | 441/441 |
| Functional browser suite (all `tests/*.browser.ts`, with the three deferred accessibility scenarios excluded by name) | 70/70 at `ea4105f` |
| `npm run test:package` | Pass |

**The three excluded browser scenarios** are "keyboard investigation joins…", "starting capture moves keyboard focus…" and "independent UI review: keyboard consent…". They fail identically on the untouched 0.1.0 source, which also excluded them. Accessibility remains deferred and unverified.

**One unexplained failure.** At `c6a2f6c`, one full browser run had a single failure: `marked-empty-heading complete UI journey` (the job ended `failed` instead of `complete`). At the time a coding-agent trial was loading the machine. The test passed in the two runs before, 3/3 in isolation afterwards, and in the 70/70 run above. Its cause was not established.

## Packaged acceptance: the exact release tarball

The driver is `tools/acceptance.mjs` in `~/Developer/repro-acceptance/release-0.2.0/`. It installs the tarball into an empty npm project, installs the pinned browser, runs `repro doctor`, and then runs the CLI as a developer would. It never edits Repro source between apps. The record is [repro-report-0.2.0/release-acceptance.json](repro-report-0.2.0/release-acceptance.json).

### The apps

None of the apps is bundled with Repro. All were written for this acceptance in the owner's workspace (`~/Developer/repro-acceptance/apps/`), by agents in an earlier workflow, each checked by an independent verifier agent. They are authorized test apps, not pre-existing production apps, and no real users were involved.

| App | Stack | Bug | Kind of input |
| --- | --- | --- | --- |
| shopping-list | React 19 + Vite 7, `npm run dev` | Deleting a bought item lowers the "items left" counter | Committed bug, no remote |
| cafe-orders | Express 5, `npm run dev` (`node --watch server.js`) | Discount code WELCOME10 can be applied twice | Bug in uncommitted changes; sign-in with a password; canary secrets in server logs, page console, cookies and the remote URL |
| pantry-scale (**held out**) | Vue 3 + Vite 8, `npm run dev` | Adding recipes to the shopping list changes the recipe's own ingredient amounts | Committed bug; its fix and notes were sealed until its report existed |

### Results

| Scenario | Observed |
| --- | --- |
| shopping-list | **Reproduced**, 4/4 runs. The fresh-checkout check reproduced: "in a clean clone of the commit, the test failed with the same observed result". 34.8 s in all |
| cafe-orders | **Reproduced**, 4/4. The fresh check reproduced "in a clean clone of the commit with the local changes applied". 33.7 s. All 8 canaries are absent from REPRO.md (the password, an `sk_live_`-style key, a JWT, a session secret, a `ghp_` token, a URL user, and two personal-data strings). The password is withheld as `REPRO_SECRET_1` |
| not reproduced | A clone of shopping-list with the controlled fix committed: **Not reproduced**, 4/4 met the expectation. The fresh check passed, "as in Repro’s runs". 25.4 s |
| cancellation | SIGINT to the CLI's process group during "run 2 of 3": exit 130, 1.26 s from signal to exit. No REPRO.md was written, no leftover processes, the app port was closed, and no browser profile was retained |
| recipient: shopping-list | See below. Passed |
| recipient: cafe-orders | See below, including the embedded patch and the withheld password supplied as an environment variable. Passed |

### The recipient workflow

The driver is `tools/recipient.mjs`. It plays a teammate on another machine:

1. **A clean environment:** an empty HOME, so npm and browser caches are empty, and no Repro installation.
2. **The report's own commands:** it extracts every `sh` block under "Run the regression test" and runs them in order, verbatim. Only the `<repository URL or path>` placeholder and the withheld values are filled in. The blocks clone the commit, extract the hash-checked test files, apply the local-changes patch, run `npm ci`, install the test's dependencies and browser, and run the test.
3. **Before the fix:** it requires exit 1, `REPRO_EXPECTATION_FAILED`, and "This is the failure recorded in REPRO.md".
4. **After the fix:** it applies the controlled fix to the app, never to the test, and requires the **same test command** to exit 0 with the expectation satisfied.

| App | Before the fix | After the controlled fix | Setup and first run, empty caches |
| --- | --- | --- | --- |
| shopping-list | exit 1, the recorded failure | exit 0, satisfied | 17.3 s |
| cafe-orders | exit 1, the recorded failure | exit 0, satisfied | 15.5 s |
| pantry-scale (held out, rc1 report) | exit 1, the recorded failure | exit 0 after the **sealed** fix (SHA-256 `dfe36e3b…`, checked) | 13.7 s |
| pantry-scale (post-hoc, release report) | exit 1, the recorded failure | exit 0 after the sealed fix | 17.8 s |

## The held-out app, through the real workbench page

The held-out app went through the installed package's workbench page (`repro serve`). A Playwright script typed into the page as a person would, and the agent inspected the screenshots. No human did. The record is [repro-report-0.2.0/heldout-and-ux.json](repro-report-0.2.0/heldout-and-ux.json).

**The input** came from the sealed issue text only: steps, the 200 g / 450 g observation, `npm run dev` and Vue 3 + Vite. The app's source was not read.

1. **rc1, attempt 1, the issue's own wording:** **Needs your input**. The step `Click "Crisp Waffles"` found no element: the button's accessible name is "Crisp Waffles Serves 4 · 30 min". No suggestions were offered. **This is the held-out result: Repro 0.2.0-rc1 could not take the issue's wording as written.**
2. **rc1, attempt 2:** the steps used the button names as rendered. These were read from a screenshot and an accessibility snapshot of the running app, not from source. Repro asked which element "Plain flour" meant, offering eight candidates, and one choice ("450 g (in “Buttermilk Pancakes”)") answered it. The result was **Reproduced**, 4/4, and the fresh checkout reproduced. The recipient row above shows the sealed fix then passing the same test.
3. **The fix:** both gaps from attempt 1 were then fixed generically (`40165ad`, `ea4105f`), test first, using a synthetic page, not the held-out app:
   - When no element has the exact name, a step's quoted text may match inside exactly one control's name. It is recorded as `match: "contains"`, and the exported test uses the same Playwright locator, `exact: false`. Checks never match partially.
   - A step that finds no element lists the controls with the closest names.
   - Questions say `Step 3 (Click "…")` instead of `step-3`.
4. **Post-hoc, not held-out**, on rc2, rc3 and the release tarball: the issue's original wording now reproduces with one element choice. The report says "Click the button whose name contains "Crisp Waffles"", and the recipient workflow passes. These reruns are no longer held-out evidence, because the fix was informed by the held-out failure.

## UX observations (agent-inspected screenshots, real browser)

The screenshots are in `~/Developer/repro-acceptance/release-0.2.0/` (`heldout/*/`, `ux-*`). They contain local paths, so they are not committed here. The agent viewed them in the real Chromium page, at 1280 px wide.

- **The form:**
  - app facts appear as soon as the folder is entered: start command, commit, and a missing-remote warning;
  - "Repro understood" lists the numbered steps, the checks and the kept notes;
  - the shortening option sits under "More options";
  - "Repro will" lists the exact command, folder, network block and fresh clone;
  - the consent checkbox is required before generating.
- **Progress:** visible stages and a Cancel button. UI cancellation is covered by the `report-ui` browser test: no REPRO.md is written and nothing keeps running.
- **Needs your input:** check candidates appear as radio choices. Step suggestions appear as a list, with Edit and "Write a Blocked report anyway".
- **The result:** a status badge and summary, Download and Copy, then a rendered preview with the Markdown source a click away. The internal events sit behind "What Repro did".
- **Two fixes made after viewing:** the intro no longer promises shortening it may not do, and a chosen element keeps the reporter's name in REPRO.md.
- **Not covered:** accessibility (deferred), visual design review by a person, other browsers, and the demonstration recorder on the installed package. The recorder is covered by `demonstration.browser.ts` in the source tree.

## Reviews

- **Round 1 (independent, multi-agent):** six reviewer dimensions over the feature diff returned 43 findings: 4 critical, 25 major, 14 minor. Their titles are in [repro-report-0.2.0/review-round1-findings.json](repro-report-0.2.0/review-round1-findings.json).
  - The workflow's adversarial-verification stage was stopped before it completed. The implementer triaged the findings against the source.
  - The fixes are in `88139ea`, with regressions in `tests/review-fixes.test.ts` and updated browser tests. The critical ones included unsound step shortening, which is now only for step-independent checks or a reporter declaration.
  - The status of each finding was not recorded item by item.
- **Round 2 (attempted, not run):** an independent review of the fix diff (`b532018..c6a2f6c`) was launched as workflow `wf_60877fc2-db4`. From about 21:05 PDT every subagent in this session stalled before its first response: 20 review-agent starts and 0 responses, and also trivial diagnostic agents on two models. **No second independent review exists.** The implementer re-read the partial-matching code, which is not independent.
- **A coding-agent recipient (attempted, not run):** an agent given only REPRO.md and a bare clone was to reproduce, fix and verify the held-out bug. It stalled the same way on three launches (two direct, one as a workflow that retried four times) before running any command. **No coding-agent recipient result exists.** The scripted recipient above applied the controlled fixes; it did not write a fix.

## Supported scope and known limits

The exact boundary is in [docs/LOCAL-APPS.md](../docs/LOCAL-APPS.md). Limits that bear on these results:

- **Platform:** only this macOS arm64 machine was measured. Linux was not part of 0.2.0 acceptance, and Windows is unsupported.
- **Apps:** three apps, all JavaScript/npm and loopback HTTP, two development apps and one held out. That is not evidence for other stacks, package managers or authentication flows beyond a password form.
- **Reduction:** none of the release reports was shortened. Their checks depend on their steps, and the reporter did not declare them step-independent. Shortening itself is covered by the `report-flow` browser test (9 of 11 steps, with a step-independent check) and the reducer tests.
- **Determinism:** each REPRO.md reproduced in its fresh clone and in the recipient run. This is not a claim of determinism in general.
- **Not claimed:** independent review of the final code (round 2 did not run), accessibility, human usability testing, real-user validation, production readiness, or deployment.
