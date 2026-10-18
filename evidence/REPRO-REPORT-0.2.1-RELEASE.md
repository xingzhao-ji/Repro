# Repro 0.2.1 — release evidence

October 17, 2026, 23:00–23:30 PDT, on one macOS arm64 machine (Darwin 27.0.0, Node 26.7.0, npm 11.19.0, Playwright 1.64.0 with headless Chromium 156.0.8078.4). Everything below was observed during these runs. Where a check was not run, this report says so.

0.2.1 is 0.2.0 plus the fixes from the [foreground review](FOREGROUND-REVIEW-0.2.0.md). The most important one: under 0.2.0, a report on a negative check could shorten the steps to a test that fails on a correct app. **Use 0.2.1 instead of 0.2.0.**

## Release identity

| | |
| --- | --- |
| Release commit | `42d2b32fb8ee5e99e5fb21006d3ac4827ffc931e` on branch `release/repro-report-0.2.1`, tagged `v0.2.1-beta`. This evidence is in the commit on top of it |
| Package | `repro-local-0.2.1.tgz`: 1,895,799 bytes |
| SHA-256 | `8dbb80096221846cdf88aa318550d4bfb4ea507f299d8f9b9e5fa6260f565560` |
| npm integrity | `sha512-hoaKne5ndi5PEjNap06H74yrzUi04BHC3BLbDVlcvwcFkxHnFst05jHR5ZEuRTkNCXDtE8XpEuAYk3zylj/y6A==` |
| Reproducible build | A second build and pack of the release commit produced the same SHA-256 |
| Candidate | rc1 (`6a2a5c6`, SHA-256 `92b48da7…`). All 173 files outside `docs/`, including the 11 in `dist/`, are byte-identical to the release. The release changes only the example REPRO.md files and their index |
| Not done | No merge to `main` (awaiting the owner's approval), no GitHub Release, no npm publication, no deployment |

## Automated checks on the release code

`6a2a5c6`; the release commit adds documentation only.

| Check | Result |
| --- | --- |
| typecheck, lint, build | pass |
| Ordinary suite | 449/449 |
| Functional browser suite (the three deferred accessibility scenarios excluded by name, as in 0.1.0 and 0.2.0) | 72/72 |
| `npm run test:package` | pass |

## Packaged acceptance: the exact release tarball

The driver is the same as for 0.2.0, with the installed-version check set to 0.2.1. It lives in `tools/acceptance.mjs`, under `~/Developer/repro-acceptance/release-0.2.1/`. It installs the tarball into an empty project and runs the CLI as a developer would, with no Repro source edits between apps.

The apps are the authorized acceptance apps described in the [0.2.0 evidence](REPRO-REPORT-RELEASE.md#the-apps). The record of this run is [repro-report-0.2.1/release-acceptance.json](repro-report-0.2.1/release-acceptance.json).

| Scenario | Observed |
| --- | --- |
| shopping-list (React + Vite) | **Reproduced**, 4/4. The fresh-checkout check reproduced. 34.9 s |
| cafe-orders (Express, uncommitted changes, sign-in) | **Reproduced**, 4/4. The fresh check reproduced with the local changes applied. All 8 canaries are absent from REPRO.md, and the password is withheld as `REPRO_SECRET_1`. 33.8 s |
| Not reproduced (shopping-list with the controlled fix committed) | **Not reproduced**. The fresh check passed |
| Cancellation (SIGINT during "run 2 of 3") | Exit 130 after 1.27 s. No REPRO.md, no leftover processes, port closed, no retained profile |
| Recipient: shopping-list | Fresh clone, empty HOME, REPRO.md's own commands: exit 1 with the recorded failure, then exit 0 after the controlled fix with the same command. 17.0 s setup and first run |
| Recipient: cafe-orders | The same, including the embedded patch and the withheld password as an environment variable: exit 1, then exit 0. 15.0 s |
| Held-out pantry-scale (Vue), through the installed workbench page, with the issue's original wording | **Reproduced**. The scripted recipient failed as recorded, then passed after the sealed fix (SHA-256 `dfe36e3b…`). Post-hoc: the matching fix was informed by the original held-out failure. The original held-out result is in the [0.2.0 evidence](REPRO-REPORT-RELEASE.md#the-held-out-app-through-the-real-workbench-page) |

**A manual clean-checkout recipient run** used a cafe-orders REPRO.md from `11a42f0`, the same code as 0.2.1 except the version string. Every command was copied by hand, in an empty folder with an empty HOME and no Repro installed. It is recorded step by step in the [foreground review](FOREGROUND-REVIEW-0.2.0.md#recipient-workflow-from-a-clean-checkout-foreground-by-the-same-agent):

- with REPRO.md's `'…'` placeholder for the password, the test stopped before running, which is a setup failure and not a reproduction;
- with the password supplied, the test failed as recorded;
- after the controlled fix, the unchanged test passed.

## Real-browser UX on this package

The installed 0.2.1 workbench was driven by Playwright through the real page, and the agent inspected the screenshots. No human did. They are in `~/Developer/repro-acceptance/release-0.2.1/heldout/posthoc-rc1/` and `ux-rc1-step-suggestions/`. The screens checked:

- the form, with app facts and the "Repro will" scope;
- staged progress with Cancel;
- the "Needs your input" choice of element, offered as radio candidates, with the `--check-element` equivalent;
- step suggestions for a misspelled step, with "Write a Blocked report anyway";
- the Reproduced result, with the REPRO.md preview and download.

UI cancellation is covered by the `report-ui` browser test.

## Not verified

- **An independent review of the final code.** The foreground review was done by the implementing agent. Every attempt at an independent review or a coding-agent recipient trial stalled before its first response: "Agent stalled: no progress for 600s (stream watchdog did not recover)".
- **Linux, accessibility, human usability testing, real users, other browsers, and stacks other than JavaScript/npm.**
- The exact supported boundary is in [docs/LOCAL-APPS.md](../docs/LOCAL-APPS.md).
