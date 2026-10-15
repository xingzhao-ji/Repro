# Local use

Repro is being built as a local synthetic failure compiler. Read `evidence/RELEASE.md` for the current gates and limitations. No API key, paid model, account or original service is required.

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

CLI behavioral exits: 0 for a satisfied requirement or completed non-replay operation, 1 for an intended target failure, 2 for invalid/unsupported/inconclusive execution, 130 for owner cancellation. Reduction's JSON explicitly reports budget exhaustion and unverified minimality. An export succeeding means bytes were finalized; it does not imply the failure was reproduced on a clean machine.

Stop a CLI operation with Ctrl-C. The workbench Cancel control cancels the selected active job. The Evidence run selector identifies a specific job in the URL. Refresh and back/forward navigation preserve that selection. Reduction, comparison and export show evidence only for the selected job; a different operation explains which run to choose. Unknown run IDs show a recoverable error. The Dependencies view and frozen expectation describe the selected job’s saved input; each earlier job retains its original manifest. New operations use the current capsule, as labeled beside their controls. Refresh reconnects to persisted state. Repeated operation request keys return the original job; competing jobs in one session are rejected. Restart after interruption marks unfinished ledger jobs INCONCLUSIVE, then a retry starts fresh owned state. Preserve a damaged ledger for investigation rather than assuming its incomplete output is a valid capsule.

Current adapter boundaries: synthetic alpha/beta input only; frontend behavior; controlled HTTP; no database; no authentication or ambient credentials; no arbitrary website or source execution. Unsupported inputs fail visibly. Human approval and historical-bug validation are separate, pending claims.

## Installed package and offline replay

`npm run test:package` builds and packs the release, installs it in a fresh owned directory, runs the installed CLI and exports a standalone capsule. It checks real buggy/fixed observations and the conventional test, and records a distinct process census after each command exits. Logs and the package tarball remain under `.repro-runs/package-smoke/`; `REPRO_PACKAGE_SMOKE_ROOT` can select another child of `.repro-runs`.

The check also runs `npm ci --offline --ignore-scripts --omit=dev` inside a separate capsule using `.repro-cache/npm`. Offline setup requires all locked npm packages already cached, Chromium already installed, and the platform's browser libraries available. The capsule resolves its own installed runtime dependencies; it does not require the TypeScript source tree. Replay performs no public service calls. A missing cache entry or browser is an explicit prerequisite failure, not an automatic online fallback or a passing replay. The npm capsule alone is not a clean-host offline installer. The release also provides a Linux arm64 image archive with acquired runtime dependencies; see `OFFLINE.md` for its import and isolation requirements.
