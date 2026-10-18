# Example REPRO.md files

These are unedited REPRO.md files that the packaged Repro 0.2.1 wrote during its release acceptance. Repro checked each one in a fresh clone before writing it. Each reproduced one was then also run through the scripted recipient workflow: a fresh clone and an empty HOME, the test failing as recorded, the controlled fix, and the same test passing. [REPRO-REPORT-0.2.1-RELEASE](../../evidence/REPRO-REPORT-0.2.1-RELEASE.md) records every run.

They show what a teammate or coding agent receives. The apps they describe are small acceptance apps on the release machine; they are **not** included in this repository. That is why each file asks for `<repository URL or path>`: the repositories have no remote, or only a path on the release machine. So you cannot run these examples yourself. To try the whole flow, use **Try it with an example app** on the workbench page, which uses the bundled `task-tally` app.

| File | App | What it shows |
| --- | --- | --- |
| [shopping-list.REPRO.md](shopping-list.REPRO.md) | React + Vite, `npm run dev` | A committed bug, **Reproduced**. The steps were not shortened, because the expected value depends on them |
| [cafe-orders.REPRO.md](cafe-orders.REPRO.md) | Express, `npm run dev` (`node --watch server.js`) | A bug in **uncommitted** changes, embedded as a hash-checked patch. A sign-in password is withheld as `REPRO_SECRET_1`, and canary secrets in the app's logs are redacted |
| [not-reproduced.REPRO.md](not-reproduced.REPRO.md) | The shopping-list app with its fix applied | **Not reproduced**: every run met the expectation. The same test passes, and the report says there is nothing to fix |
| [pantry-scale.REPRO.md](pantry-scale.REPRO.md) | Vue 3 + Vite, `npm run dev` | The held-out acceptance app, rerun with the issue's original wording after the fixes it prompted (post-hoc, not held-out evidence). "Click "Crisp Waffles"" matched the button whose name contains it, and the reporter chose the element for "Plain flour" from Repro's list |

Every file follows the same order:

1. status and summary;
2. expected and observed behavior;
3. steps;
4. **Run the regression test** (get the exact source, create the test files, apply any local changes, install, run);
5. **Checking a fix**;
6. the test files;
7. evidence, with observed facts kept apart from suspected and verified causes;
8. environment and dependencies;
9. source revision and local changes;
10. limits.
