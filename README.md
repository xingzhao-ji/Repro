# Repro — local failure compiler

Repro records a registered synthetic browser failure, reduces its action sequence, and exports a readable test and integrity-checked capsule. Its local workbench uses the same real runner as the CLI. The buggy and fixed search implementations are evaluated with the same frozen expected behavior in fresh browser state.

This is a local synthetic alpha. Recorded native Chromium replay and trusted Linux arm64 capsule checks passed with the exact explicitly approved container policy. The owner has deferred native 200% Chrome zoom and actual screen-reader verification for this milestone; both remain unverified. See [release evidence](evidence/RELEASE.md) for actual results and limits. Arbitrary websites, real-user recording, PostgreSQL adapters, historical-bug validation and public execution are outside this version's supported scope.

## Run locally

Use Node 24 or newer, npm, and a supported Chromium host. Development was tested on macOS arm64 with Node 26.7.0.

```sh
npm ci --ignore-scripts --cache .repro-cache/npm
PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx --no-install playwright install chromium --only-shell
npm run build
npm run repro -- doctor
npm run dev
```

Open `http://127.0.0.1:4318`. Capture requires opt-in. Use the supplied example or explicitly declare either supported alpha/beta search order and its expected result; see [expected-behavior input](docs/AUTHORED-EXPECTATIONS.md). No account, API key, proprietary viewer or LLM is required. All generated sessions, traces, screenshots, reports and exports stay beneath ignored `.repro-runs/`; downloaded tools and caches use `.repro-cache/`.

```sh
npm run demo
npm run benchmark
```

The demo performs capture, reduction, verification, export, import and capsule replay. The package smoke check runs the conventional exported test. The benchmark retains all twenty buggy and twenty fixed repetitions; it measures one synthetic failure family, not forty independent bugs. [Usage](docs/USAGE.md) documents individual commands, exit codes, cancellation and recovery.

Each CLI execution needs a new output directory. Reusing `--output` returns `OUTPUT_EXISTS` (`EXPORT_EXISTS` for export) and preserves prior evidence; the workbench deliberately reopens its persisted state. An intended buggy replay exits **1**, a satisfied assertion exits **0**, and an inconclusive run exits **2**.

Initial installation needs network access. Once npm dependencies and Chromium have been acquired, the registered replay needs only controlled loopback HTTP. `npm run test:package` checks both a fresh installed package and a separate capsule installed with `npm ci --offline` from the populated npm cache. For replay without acquiring npm/browser dependencies on the receiving machine, use the verified [Linux arm64 offline image](docs/OFFLINE.md).

## Evidence and boundaries

- [Release report](evidence/RELEASE.md): exact commands, results, environment, hashes, screenshots and unresolved gates.
- [Supported scope](docs/SUPPORTED-SCOPE.md): capture, adapter, replay, oracle, reduction and isolation boundaries.
- [Implementation decision](docs/adr/0001-local-experiment-boundary.md): why this vertical slice is deliberately narrow.
- [Independent integration review](evidence/INDEPENDENT-REVIEW.md): defects found, reproductions and repairs; automated review is not human approval.
- [Deployment plan](docs/DEPLOYMENT-PLAN.md): authorized private source delivery and separate hosted-runtime prerequisites.
- [HCI research](docs/HCI-RESEARCH.md) and [study protocol](docs/HCI-STUDY-PROTOCOL.md): reviewed drafts, blank materials and a [synthetic P/L fidelity rehearsal](evidence/HCI-FIDELITY.md); human validation remains pending.
- [Portable setup](CLOUD-SETUP.md): source-bundle verification and fresh-environment instructions.

The default expectation basis is the supplied synthetic specification. Caller declarations are checked against the registered rule and frozen in a new session; neither path claims human approval. A source digest establishes identity, not author trust or correctness. An exported directory is not itself proof of successful clean-machine replay. Timeouts, unsupported state, missing dependencies and wrong failures remain INCONCLUSIVE. Reduction reports its tested neighborhood and budget; it does not claim global minimality.

## Development checks

```sh
npm run check:kit
npm run typecheck
npm run lint
npm run build
npm test
npm run test:browser
npm run test:package
```

The original kit remains part of this repository: `GOAL.md`, repository instructions, product/security/acceptance specifications, original design assets, benchmark policies, focused skills and dependency-free state-model fixtures. `assets/prototype.html` is an illustrative design reference, not the product UI. `KIT-VERIFICATION.md` records the starter's earlier checks. The product is implemented in `src/`, `web/`, `fixtures/browser-search/` and `tests/`; current schemas are identified in [schemas/README.md](schemas/README.md). Starter fixture tests are distinct from real browser tests.
