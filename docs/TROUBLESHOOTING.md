# Troubleshooting

Every CLI failure prints JSON with a `category`, a stable code and a recovery message. A command that cannot run prints an error object with a `code` field. A run that executed but was inconclusive prints its `result`, whose `reason` starts with the code, for example `BROWSER_UNAVAILABLE: …`. Diagnostics never echo raw target exceptions or page content. Start from the exit code, then find the code below.

## Exit codes

| Exit | Meaning | Is the command broken? |
| --- | --- | --- |
| 0 | Requirement satisfied, or a non-replay operation (reduce, verify, export, inspect, doctor) completed | No |
| 1 | The declared target failure was reproduced: the frozen assertion executed and failed on the buggy revision | No. This is the expected result of `record` and `replay` on a buggy revision |
| 2 | Invalid input, unsupported request, environment problem, or an inconclusive run | Read the error code |
| 130 | You cancelled with Ctrl-C or SIGTERM | No. The result is saved as `cancelled`, and an export is never finalized; retry in a new output directory |

An inconclusive result is never counted as reproducing the bug or as proving a fix. A timeout, missing dependency, wrong observation, unrelated page exception or changed identity is inconclusive by design.

## Installation and environment

| Symptom or code | Cause | What to do |
| --- | --- | --- |
| `BROWSER_UNAVAILABLE` | `PLAYWRIGHT_BROWSERS_PATH` points to a missing or empty directory | Run `npx --no-install playwright install chromium --only-shell` with the same `PLAYWRIGHT_BROWSERS_PATH`, then retry |
| `BROWSER_CACHE_UNREADABLE` | The browser directory exists but cannot be read | Check permissions on `PLAYWRIGHT_BROWSERS_PATH` |
| `doctor` reports `"browser": { "available": false }` | The browser could not launch, click a probe or take a screenshot within its deadline | Reinstall the pinned browser. If it persists, check the file-sync section below |
| `doctor` reports `"linuxContainer": { "available": false }` | No reachable Docker engine | Only needed for the isolated Linux capsule recipe; native use is unaffected |
| `BROWSER_CHANNEL` | `REPRO_BROWSER_CHANNEL` is set to something other than `chrome` | Unset it to use pinned Chromium. `chrome` explicitly selects installed Chrome with a fresh profile; there is no automatic fallback |
| `BROWSER_CRASH` | Chromium crashed, often from memory or process limits | Free memory, then retry in a new output directory |
| `UI_BUILD_MISSING` | The workbench bundle is absent (source checkout without a build) | Run `npm run build` |
| `CAPSULE_BUILD_REQUIRED` | Export or import ran without the built trusted runner and lockfile | Run `npm run build`, or use the installed release package |
| `CASE_SOURCE_UNAVAILABLE`, `CASE_SOURCE_CHANGED` | A registered case file is missing or differs from its pinned hash | Reinstall the release package or restore the exact capsule; do not edit pinned case source |
| `npm ci --offline` fails with a cache miss | A locked package is not in the npm cache | Install online once, or use a machine whose cache already holds every locked package. Repro does not fall back to another source |
| Node refuses to start or reports syntax errors | Node is older than 24 | Install Node 24 or newer; 26.7.0 is the verified version |

### iCloud or other file-sync folders

macOS can evict files in iCloud-synced folders (Desktop, Documents) into dataless placeholders. These were observed on the development machine:

- npm dependencies that failed in strange ways (`ESLint is not a constructor`), and tests stalled at 0% CPU.
- A file that read back empty while `cat` still exited 0.
- A pinned Chromium executed from the synced folder that loaded pages but never fired `requestAnimationFrame`. Clicks then hung at Playwright's "visible, enabled and stable" check and screenshots timed out.

Check for evicted files with `find node_modules .repro-cache -flags +dataless | wc -l`. Use a workspace and `PLAYWRIGHT_BROWSERS_PATH` outside synced folders. `repro doctor` catches the rendering problem, because its probe needs a click and a screenshot.

## Running

| Symptom or code | Cause | What to do |
| --- | --- | --- |
| `OUTPUT_EXISTS`, `EXPORT_EXISTS` | The output directory already exists | Choose a new directory. Repro never overwrites earlier or partial evidence |
| `CANCELLED`, `REDUCTION_CANCELLED`, `EXPORT_CANCELLED` | You cancelled the operation | Nothing was accepted as a result. Retry in a new output directory |
| `OUTPUT_BOUNDARY`, `EXPORT_LOCATION` | Output is not a child of `.repro-runs/` in the current directory | Run from your workspace and use `--output .repro-runs/NAME` |
| `CONSENT_REQUIRED` | `record` was run without `--consent` | Read the declaration, then add `--consent` |
| `CASE_DECLARATION`, `EXPECTATION_CHANGED` | The expectation file is not the supported declaration | Regenerate it with `repro cases --case ID`; for the synthetic app, see [AUTHORED-EXPECTATIONS](AUTHORED-EXPECTATIONS.md) |
| `CASE_UNAVAILABLE` | The case ID is not registered | Use `morphdom-textarea`, `htmx-checkbox` or `marked-empty-heading` |
| `BUDGET` | `--budget` is outside 1–200 | The practical-beta acceptance budget is 80 |
| `DEADLINE`, `REDUCTION_DEADLINE` | A run exceeded its fixed deadline | Retry in a new directory. Repeated deadlines indicate a slow or overloaded host; budgets are not configurable to hide this |
| `WRONG_FAILURE`, `WRONG_OBSERVATION`, `MISSING_OBSERVATION`, `CASE_OBSERVATION` | The observed values were neither the declared failure nor the expected behavior | Treat as inconclusive. Check setup and that nothing else is loading the page |
| `TARGET_EXCEPTION` | The page raised an exception unrelated to the declared failure | Inconclusive by design; this is not the bug |
| `NETWORK_BOUNDARY`, `CSP_BOUNDARY`, `WEBSOCKET_BOUNDARY` | The page tried to load something outside its declared local assets | Unsupported for this adapter; the run never reaches the network |
| `IDENTITY_MISMATCH`, `CAPSULE_TRUST`, `CAPSULE_HASH`, `VERSION_MISMATCH` | A manifest or capsule does not match the installed trusted runner, case or schema | Use the runner build that exported the capsule. Do not re-hash modified files to make them pass |
| `CAPSULE_FORMAT` | You passed an archive | Extract it yourself after review. Repro only imports unpacked directories and never extracts archives |
| Reduction leaves the action count unchanged | No smaller action sequence reproduced the same failure twice | Expected for some cases (htmx 2→2, Marked 3→3). Minimality is reported as unverified, never assumed |

### CLEANUP_FAILED and a retained profile

`CLEANUP_FAILED` means Repro could not certify that the run's browser and worker shut down within the cleanup budget. It keeps that run's owned `.profile` directory instead of deleting files a live process might still write. This is deliberate safety behavior, not data loss. Repro never removes a profile while ownership or shutdown is uncertain. The reason's `Cleanup basis:` clause names the condition that failed, for example `context-close=timeout` or `worker=closed-before-cleanup`; [USAGE](USAGE.md) lists the vocabulary.

1. Keep the run directory as evidence.
2. Check whether that run's own browser or worker processes are still alive. Look only at that run; do not stop unrelated browsers or processes.
3. Once those processes have exited, you may remove that exact `.profile`. If you cannot tell, keep it.
4. Retry in a new output directory.

A later successful shutdown does not change the failed result or remove the profile automatically. Cancel with Ctrl-C, SIGTERM to the CLI, or the workbench's Cancel. Signalling the worker process directly can still end in this safe state. One historical occurrence on an earlier build remains unexplained; see the [release notes](RELEASE-NOTES.md#known-issues).

## Workbench

| Symptom | Cause | What to do |
| --- | --- | --- |
| `403` with `ORIGIN_DENIED` | Opened through a different host name or origin, such as `localhost` or a proxy | Open the exact printed `http://127.0.0.1:PORT` URL |
| `403` with `TOKEN_REQUIRED` | The page's request token is stale, for example after the workbench restarted | Reload the page |
| `serve` exits 2 with `OPERATION_FAILED` immediately | Usually port 4318 is already in use, perhaps by another Repro workbench | Use `repro serve --port 0`, or stop your own earlier workbench. Do not stop processes you do not own |
| `LEDGER_BUSY` | Another live workbench owns this ledger | Use that workbench, or start one with a different `--output .repro-runs/NAME` |
| `BUSY` | A job is already running in this session | Wait, or press Cancel |
| A job shows INCONCLUSIVE after a restart | The workbench was interrupted while that job ran | Expected recovery. Start the operation again; it uses fresh state |
| Unknown run ID in the URL | The run belongs to another ledger or was mistyped | Choose a run from the Evidence selector |

## REPRO.md reports for your app

`repro report` exits **0** when it wrote REPRO.md, whatever the status inside it. It exits **2** when it needs more input (the JSON lists `questions`) or could not start, and **130** when you cancelled. In the workbench, the same codes appear in plain words.

| Symptom or code | Cause | What to do |
| --- | --- | --- |
| **Needs your input:** a step "could not find its element" (`STEP_TARGET_NOT_FOUND`) | No element on the page has that label, placeholder, button text or link text at that point, and no single control's name contains it | Use one of the names Repro lists under the question, add the missing step before it, or use a CSS selector such as `Click "#save"` |
| A step "matched more than one element" (`STEP_TARGET_AMBIGUOUS`) | Several elements share that name, for example many "Delete" buttons, or several control names contain the quoted text | Quote more of the name, as listed under the question; use a more specific name (`Click "Delete Milk"`); or use a CSS selector |
| `STEP_FAILED` | The element existed but did not accept the action in time (hidden, disabled, covered) | Add a step that makes it usable, for example opening a menu first, or `Wait for "…"` |
| **Needs your input:** Repro "could not tell which element … refers to" (`CHECK_TARGET_UNRESOLVED`) | The element named in "What should happen?" did not match exactly one element | Choose one of the elements Repro lists, or quote a selector such as `"#total" should show "$8.10"` |
| `APP_START_TIMEOUT` | The start command ran, but nothing answered HTTP on a local address in time | Check that the app serves on `127.0.0.1` or `localhost`, honours `PORT` or prints its URL, or set `url` and `startTimeoutMs` in `repro.config.json` |
| `APP_START_FAILED` | The start command exited before it served | Run the command yourself in the app folder. The last lines of its output are in the report's server output |
| Repro asks you to install dependencies | `package.json` declares dependencies but `node_modules` is missing | Run the shown install command in your app folder. Repro does not change your folder |
| `APP_UNREACHABLE` | The URL you gave did not answer, or the app stopped answering | Start the app, or leave the URL empty so Repro starts it |
| `APP_CLEANUP_FAILED` | After a run, the app's process group or its port was still alive after SIGTERM, then SIGKILL | The run is not counted. Check for processes the app starts outside its own group, and stop only processes that belong to your app |
| `DIFFERENT_FAILURE` in a run | The expectation failed, but with different values from the frozen failure | Expected during step shortening. If it appears in reproduction runs, the result is reported as **Intermittent** |
| Status **Intermittent** | Some runs failed in the reported way and others did not | Look for timing, randomness, real time, or external state. The report lists every run's observation |
| Status **Not reproduced** | The expected behavior happened in every run | Check the steps against what you did, any data or state outside the app process, or whether the bug needs a non-local service (blocked hosts are listed) |
| Fresh checkout: **Not reproduced in a clean clone** | The test passed in a clean clone of the commit (with the patch applied) | The bug depends on something outside the commit: untracked or ignored files, local data, environment variables or installed tools |
| Fresh checkout: **Failed** at `install` or `npm ci` | The install command or the npm registry was not available, or an npm setting rejected the install | Run the shown commands yourself in a clean clone; the report includes their output |
| `SECRET_MISSING`, or the exported test asks for `REPRO_SECRET_1` | A typed value was withheld from the report | Set the named environment variable to the value described in REPRO.md |
| `REPRO_STEP_FAILED` when running the exported test | The app no longer matches the recorded steps, for example a renamed button | This is not the reported bug; update the app or ask the reporter |

## Getting help

Collect the command, its exit code, the JSON error and the run directory. The run directory contains only registered inputs, observations and identities, not page contents or credentials, but review it before sharing.
