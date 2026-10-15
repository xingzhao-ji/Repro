# Repro — local failure compiler

User takeover checkpoint: read [HANDOFF.md](HANDOFF.md) for the current implementation, known failures, source/history delivery and goal prompt. Historical passing results below do not establish complete acceptance of the latest candidate. Development and diagnostic work stopped at this handoff.

Repro records a registered synthetic browser failure, reduces its action sequence, and exports a readable test and integrity-checked capsule. Its local workbench uses the same real runner as the CLI. The buggy and fixed search implementations are evaluated with the same frozen expected behavior in fresh browser state.

This is a local synthetic alpha. Native Chromium replay and the trusted Linux arm64 capsule pass with the exact explicitly approved container policy. Native 200% Chrome zoom and actual screen-reader usability remain unverified. See [release evidence](evidence/RELEASE.md) for actual checks and open gates. Arbitrary websites, real-user recording, PostgreSQL adapters, historical-bug validation and public execution are outside this version's supported scope.

## Run locally

Use Node 24 or newer, npm, and a supported Chromium host. Development was tested on macOS arm64 with Node 26.7.0.

```sh
npm ci --ignore-scripts
PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx playwright install chromium --only-shell
npm run build
npm run repro -- doctor
npm run dev
```

Open `http://127.0.0.1:4318`. Capture requires opt-in and runs only the declared synthetic alpha/beta search scenario. No account, API key, proprietary viewer or LLM is required. All generated sessions, traces, screenshots, reports and exports stay beneath ignored `.repro-runs/`; downloaded tools and caches use `.repro-cache/`.

```sh
npm run demo
npm run benchmark
```

The demo performs capture, reduction, verification, export, import and capsule replay. The package smoke check runs the conventional exported test. The benchmark retains all twenty buggy and twenty fixed repetitions; it measures one synthetic failure family, not forty independent bugs. [Usage](docs/USAGE.md) documents individual commands, exit codes, cancellation and recovery.

## Evidence and boundaries

- [Release report](evidence/RELEASE.md): exact commands, results, environment, hashes, screenshots and unresolved gates.
- [Supported scope](docs/SUPPORTED-SCOPE.md): capture, adapter, replay, oracle, reduction and isolation boundaries.
- [Implementation decision](docs/adr/0001-local-experiment-boundary.md): why this vertical slice is deliberately narrow.
- [Independent integration review](evidence/INDEPENDENT-REVIEW.md): defects found, reproductions and repairs; automated review is not human approval.
- [Deployment plan](docs/DEPLOYMENT-PLAN.md): authorized private source delivery and separate hosted-runtime prerequisites.
- [HCI research](docs/HCI-RESEARCH.md) and [study protocol](docs/HCI-STUDY-PROTOCOL.md): reviewed drafts and blank materials; candidate interaction/comparator work and human validation remain pending.
- [Portable setup](CLOUD-SETUP.md): source-bundle verification and fresh-environment instructions.

The expectation basis is the supplied synthetic specification. A source digest establishes identity, not author trust or correctness. An exported directory is not itself proof of successful clean-machine replay. Timeouts, unsupported state, missing dependencies and wrong failures remain INCONCLUSIVE. Reduction reports its tested neighborhood and budget; it does not claim global minimality.

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
