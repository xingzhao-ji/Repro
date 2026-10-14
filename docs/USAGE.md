# Local use

Repro is being built as a local synthetic failure compiler. Read `evidence/RELEASE.md` for the current gates and limitations. No API key, paid model, account or original service is required.

Use Node 24 or newer and npm. Dependencies are pinned in `package-lock.json`.

```sh
npm ci --ignore-scripts
PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx playwright install chromium --only-shell
npm run build
npm run repro -- doctor
npm run dev
```

The workbench binds to `http://127.0.0.1:4318`. Open that exact URL; a different Host or Origin is intentionally rejected. Capture requires opt-in and executes only the registered synthetic search scenario. Review the frozen expectation and capture surfaces before starting. Runs, events, traces, screenshots and exports stay under `.repro-runs/`.

Pinned Chromium passed the retained Mac browser tests and the approved Linux arm64 capsule checks. The current cloud comparator is blocked before rendering by Chromium's `No usable sandbox!` error; see [the current triage](../evidence/REPRO-BLOCKER-TRIAGE.md). Those historical passes do not establish browser support on another host.

`doctor` performs a sandboxed browser probe. Its `browser.available: false` result includes a stable diagnostic code:

- `BROWSER_SANDBOX_UNAVAILABLE`: keep sandboxing enabled and have the environment owner review the effective policy. Reinstalling the browser or selecting another channel does not resolve an identified permission boundary.
- `BROWSER_UNAVAILABLE`: the selected executable is missing; follow the pinned-browser setup above.
- `BROWSER_DEPENDENCIES_UNAVAILABLE`: required system libraries are missing; check the supported dependencies within the environment's permissions.
- `BROWSER_PROBE_FAILED`: the cause is not established; inspect the local failure evidence before retrying.

The diagnostic does not print raw launch logs or private paths. Do not rerun the probe after an access restriction until the supported configuration is confirmed. `REPRO_BROWSER_CHANNEL=chrome` remains an explicit selection for an already supported installed Chrome environment, with no automatic fallback; it is not a way to evade a denied capability.

```sh
# Expected exit 1: this records the intended failure, not a broken command.
npm run repro -- record --consent --output .repro-runs/example

npm run repro -- replay --manifest .repro-runs/example/manifest.json --output .repro-runs/replay
npm run repro -- reduce --manifest .repro-runs/example/manifest.json --budget 50 --output .repro-runs/reduced
npm run repro -- verify --manifest .repro-runs/reduced/reduced.manifest.json --output .repro-runs/verified
npm run repro -- inspect --manifest .repro-runs/reduced/reduced.manifest.json
npm run repro -- export --manifest .repro-runs/reduced/reduced.manifest.json --output .repro-runs/capsule
```

Each CLI record, replay, reduce, verify or export operation must use a new output directory. Reusing a run destination returns `OUTPUT_EXISTS` without changing earlier evidence; exports retain their `EXPORT_EXISTS` error. Omit `--output` to create a unique directory automatically. Incomplete run directories remain available for inspection; retry with a new destination. The workbench's persistent `serve --output` directory remains reusable across restarts.

`replay --capsule DIRECTORY` validates bundle integrity and installed trusted-runner identity before execution. Follow the exported README for fresh Linux execution. A hash proves byte identity, not author trust; do not execute unknown bundle code on the host.

CLI behavioral exits: 0 for a satisfied requirement or completed non-replay operation, 1 for an intended target failure, 2 for invalid/unsupported/inconclusive execution, 130 for owner cancellation. Reduction's JSON explicitly reports budget exhaustion and unverified minimality. An export succeeding means bytes were finalized; it does not imply the failure was reproduced on a clean machine.

Stop a CLI operation with Ctrl-C. The workbench Cancel control cancels the selected active job. The Evidence run selector identifies a specific job in the URL. Refresh and back/forward navigation preserve that selection. Reduction, comparison and export show evidence only for the selected job; a different operation explains which run to choose. Unknown run IDs show a recoverable error. The Dependencies view explicitly describes the current capsule; each earlier job retains its original manifest in its artifacts. Refresh reconnects to persisted state. Repeated operation request keys return the original job; competing jobs in one session are rejected. Restart after interruption marks unfinished ledger jobs INCONCLUSIVE, then a retry starts fresh owned state. Preserve a damaged ledger for investigation rather than assuming its incomplete output is a valid capsule.

Current adapter boundaries: synthetic alpha/beta input only; frontend behavior; controlled HTTP; no database; no authentication or ambient credentials; no arbitrary website or source execution. Unsupported inputs fail visibly. Human approval and historical-bug validation are separate, pending claims.
