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

Exports must use a new directory. `replay --capsule DIRECTORY` validates bundle integrity and installed trusted-runner identity before execution. Follow the exported README for fresh Linux execution. A hash proves byte identity, not author trust; do not execute unknown bundle code on the host.

CLI behavioral exits: 0 for a satisfied requirement or completed non-replay operation, 1 for an intended target failure, 2 for invalid/unsupported/inconclusive execution, 130 for owner cancellation. Reduction's JSON explicitly reports budget exhaustion and unverified minimality. An export succeeding means bytes were finalized; it does not imply the failure was reproduced on a clean machine.

Stop a CLI operation with Ctrl-C. The workbench Cancel control cancels the selected active job. Refresh reconnects to persisted state. Repeated operation request keys return the original job; competing jobs in one session are rejected. Restart after interruption marks unfinished ledger jobs INCONCLUSIVE, then a retry starts fresh owned state. Preserve a damaged ledger for investigation rather than assuming its incomplete output is a valid capsule.

Current adapter boundaries: synthetic alpha/beta input only; frontend behavior; controlled HTTP; no database; no authentication or ambient credentials; no arbitrary website or source execution. Unsupported inputs fail visibly. Human approval and historical-bug validation are separate, pending claims.
