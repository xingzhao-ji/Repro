# Operating Repro

Repro runs locally. No API key, paid model, account or original service is required. Install it with [INSTALL](INSTALL.md); when something fails, see [TROUBLESHOOTING](TROUBLESHOOTING.md). The [release notes](RELEASE-NOTES.md) list known issues and limits.

## Release package workflow

Run these commands from the workspace where you installed `repro-local-0.1.0.tgz`, with `PLAYWRIGHT_BROWSERS_PATH` exported as in INSTALL. Every operation that writes evidence needs a new directory beneath `.repro-runs/`.

### 1. Declare the expected behavior

Each registered case ships the expected behavior derived from its public issue or specification. Print it, read it, and save it:

```sh
npx --no-install repro cases
mkdir -p .repro-runs/morphdom
npx --no-install repro cases --case morphdom-textarea > .repro-runs/morphdom/expectation.json
```

The other case IDs are `htmx-checkbox` and `marked-empty-heading`. Capture refuses a changed or partial declaration. For the synthetic search app you can author your own declaration; see [AUTHORED-EXPECTATIONS](AUTHORED-EXPECTATIONS.md). The installed package includes an example at `node_modules/repro-local/docs/examples/search-beta-alpha.json`.

### 2. Capture and replay the failure

```sh
npx --no-install repro record --consent --experiment .repro-runs/morphdom/expectation.json --output .repro-runs/morphdom/capture
npx --no-install repro replay --manifest .repro-runs/morphdom/capture/manifest.json --output .repro-runs/morphdom/replay
```

Both exit **1** when the frozen assertion executes and fails on the buggy revision, which is the intended result. `--consent` is required. Capture records only the registered inputs and observed values, not arbitrary DOM, screenshots, traces, console output or request bodies.

### 3. Reduce, compare and export

```sh
npx --no-install repro reduce --manifest .repro-runs/morphdom/capture/manifest.json --budget 80 --output .repro-runs/morphdom/reduction
npx --no-install repro verify --manifest .repro-runs/morphdom/reduction/reduced.manifest.json --output .repro-runs/morphdom/comparison
npx --no-install repro export --manifest .repro-runs/morphdom/reduction/reduced.manifest.json --output .repro-runs/morphdom/capsule
npx --no-install repro inspect --capsule .repro-runs/morphdom/capsule
```

- `reduce` exits 0. Its `result.json` lists every trial with its seed, input digest, outcome, reason and cost. It also reports whether minimality is verified; it never claims global minimality.
- `verify` runs the buggy and fixed revisions in separate fresh runs with the same assertion. It exits 0 only when buggy reproduces the failure and fixed satisfies the requirement.
- `export` exits 0 once the capsule is atomically finalized. That proves the files were written, not that the failure reproduces elsewhere.

### 4. Run the exported regression independently

The capsule directory is the portable result. Copy it anywhere and follow its README: `npm ci --ignore-scripts --omit=dev`, install the browser, then `REPRO_REVISION=buggy node --test replay.test.mjs` (fails with `TARGET_ASSERTION`) and `REPRO_REVISION=fixed node --test replay.test.mjs` (passes). See [INSTALL](INSTALL.md#run-an-exported-regression-capsule-elsewhere).

### Workbench

`npx --no-install repro serve` starts the workbench at `http://127.0.0.1:4318` (`--port 0` picks a free port; `--output .repro-runs/NAME` selects its ledger directory). The workbench runs the same core as the CLI:

1. Choose the application case.
2. Review the linked expected-behavior source and the declared values.
3. Consent, confirm that you reviewed the expectation, then start capture.
4. Inspect the observed values, then reduce, compare the fixed revision and export.

Cancel stops the selected active job. Refresh reconnects to persisted state.

### Cancellation and cleanup

Press Ctrl-C (or send SIGTERM) to cancel a CLI operation. It exits **130** and finalizes nothing. Export removes its own partial staging directory, and the next attempt needs a new output directory. Owned browser and server resources are released within 8 seconds of cancellation and within 5 seconds of ordinary completion. Unrelated processes and other runs' files are never touched. If shutdown cannot be certified, the run reports `CLEANUP_FAILED` and keeps its browser profile; see [TROUBLESHOOTING](TROUBLESHOOTING.md#cleanup_failed-and-a-retained-profile).

## Source checkout and synthetic workflow

Use Node 24 or newer and npm. Dependencies are pinned in `package-lock.json`.

```sh
npm ci --ignore-scripts --cache .repro-cache/npm
PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx --no-install playwright install chromium --only-shell
npm run build
npm run repro -- doctor
npm run dev
```

The workbench binds to `http://127.0.0.1:4318`. Open that exact URL; a different Host or Origin is intentionally rejected. Capture requires opt-in and executes only the registered synthetic search scenario. Use the supplied example or choose **Specify expected behavior** to declare a supported search order and expected result before capture. See [declaration format and CLI example](AUTHORED-EXPECTATIONS.md). Review the frozen expectation and capture surfaces before starting. Runs, events, traces, screenshots and exports stay under `.repro-runs/`.

Pinned Chromium passed the latest local browser tests. Early installation/probe failures and the explicitly selected installed Chrome investigation are retained in development logs. If troubleshooting locally, `REPRO_BROWSER_CHANNEL=chrome` explicitly selects a fresh installed Chrome profile; there is no automatic fallback and the actual browser version is recorded. Local browser results do not establish Linux portability.

```sh
# Expected exit 1: this records the intended failure, not a broken command.
npm run repro -- record --consent --output .repro-runs/example

npm run repro -- replay --manifest .repro-runs/example/manifest.json --output .repro-runs/replay
npm run repro -- reduce --manifest .repro-runs/example/manifest.json --budget 50 --output .repro-runs/reduced
npm run repro -- verify --manifest .repro-runs/reduced/reduced.manifest.json --output .repro-runs/verified
npm run repro -- inspect --manifest .repro-runs/reduced/reduced.manifest.json
npm run repro -- export --manifest .repro-runs/reduced/reduced.manifest.json --output .repro-runs/capsule
```

Every record, replay, reduce, verify and export command must use a new output directory. `OUTPUT_EXISTS` (`EXPORT_EXISTS` for export) means earlier or partial evidence is preserved: choose a new directory for the retry. Concurrent commands cannot claim the same run output. The persistent `serve` workbench is the exception and deliberately reopens its ledger. `replay --capsule DIRECTORY` validates bundle integrity and installed trusted-runner identity before execution. Follow the exported README for fresh Linux execution. A hash proves byte identity, not author trust; do not execute unknown bundle code on the host.

For registered browser cases, `CLEANUP_FAILED` means resource completion was not certified and the run's owned `.profile` is retained. Preserve the evidence and inspect only that run's owned browser, worker and applicable descendants. Consider removing only that exact `.profile` after their completion is established; if completion remains uncertain, keep it. Do not stop unrelated processes or remove another run's files. Retry in a new output directory. A later shutdown does not rewrite the failed result or automatically remove the retained profile.

The reason includes a fixed-vocabulary `Cleanup basis:` clause naming the predicate that failed, so a rare failure can be localized from ordinary evidence without the diagnostic observer:

- `receipt` (`present`/`absent`) and `protocol` (`ok`/`failed`): the worker's validated terminal receipt.
- `wait-ended`: what ended the wait — `close` (the worker exited), `failed-receipt` (the receipt already proved failed cleanup, so the parent stopped waiting), `deadline`, or `protocol` (an invalid frame, or a spawn/IPC error).
- `worker`: state when the parent decided — `closed`, `closed-late` (after its cleanup deadline), `closed-before-cleanup` (exited before reporting cleanup start, e.g. a bootstrap crash), or `open`.
- `launch`: `not-attempted`, `unacquired` or `acquired`.
- `launch-join`: `not-needed`, `joined` or `expired` (startup acquisition still pending at cleanup).
- `context-close`:
  - `acknowledged`, `rejected`, `timeout` or `not-applicable`;
  - `stale` — the close resolved but wasn't a fresh request: the context was already closed or disconnected, or its state couldn't be read;
  - `late` — the close *resolved* after its deadline (a rejection after the deadline reports `rejected`);
  - `no-budget` — the shared startup window was already spent when close began, after a startup join (including server shutdown time).

  `rejected` and `timeout` take precedence over `stale`.
- `drain`: `complete` or `timeout`.
- `creation-attempts`: process, worker, native-addon or exec creation attempts counted by the worker's creation fence.

The worker's basis fields are validated against the receipt flags they explain. A receipt outside the vocabulary, or one that contradicts those flags, is a protocol failure. The clause never contains target text, paths or error messages. See [cleanup guarantees and limits](STARTUP-OWNER-BOUNDARY.md).

CLI behavioral exits: 0 for a satisfied requirement or completed non-replay operation, 1 for an intended target failure, 2 for invalid/unsupported/inconclusive execution, 130 for owner cancellation. Reduction's JSON explicitly reports budget exhaustion and unverified minimality. An export succeeding means bytes were finalized; it does not imply the failure was reproduced on a clean machine.

Stop a CLI operation with Ctrl-C. The workbench Cancel control cancels the selected active job. The Evidence run selector identifies a specific job in the URL. Refresh and back/forward navigation preserve that selection. Reduction, comparison and export show evidence only for the selected job; a different operation explains which run to choose. Unknown run IDs show a recoverable error. The Dependencies view and frozen expectation describe the selected job’s saved input; each earlier job retains its original manifest. New operations use the current capsule, as labeled beside their controls. Refresh reconnects to persisted state. Repeated operation request keys return the original job; competing jobs in one session are rejected. Restart after interruption marks unfinished ledger jobs INCONCLUSIVE, then a retry starts fresh owned state. Preserve a damaged ledger for investigation rather than assuming its incomplete output is a valid capsule.

Current adapter boundaries: synthetic alpha/beta input only; frontend behavior; controlled HTTP; no database; no authentication or ambient credentials; no arbitrary website or source execution. Unsupported inputs fail visibly. Human approval and historical-bug validation are separate, pending claims.

## Installed package and offline replay

`npm run test:package` builds and packs the release, installs it in a fresh owned directory, runs the installed CLI and exports a standalone capsule. It checks real buggy/fixed observations and the conventional test, and records a distinct process census after each command exits. Logs and the package tarball remain under `.repro-runs/package-smoke/`; `REPRO_PACKAGE_SMOKE_ROOT` can select another child of `.repro-runs`.

Registered-case packages and capsules include the fixed `dist/case-worker.js` executable. Its identity is checked with the trusted runner; a missing or modified worker is not a supported partial installation.

The check also runs `npm ci --offline --ignore-scripts --omit=dev` inside a separate capsule using `.repro-cache/npm`. Offline setup requires all locked npm packages already cached, Chromium already installed, and the platform's browser libraries available. The capsule resolves its own installed runtime dependencies; it does not require the TypeScript source tree. Replay performs no public service calls. A missing cache entry or browser is an explicit prerequisite failure, not an automatic online fallback or a passing replay. The npm capsule alone is not a clean-host offline installer. The release also provides a Linux arm64 image archive with acquired runtime dependencies; see `OFFLINE.md` for its import and isolation requirements.
