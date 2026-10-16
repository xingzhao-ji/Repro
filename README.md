# Repro — local failure compiler

Repro captures an explicitly declared browser failure, reduces its action sequence, and exports a readable test and integrity-checked capsule. Its local workbench and CLI share the same runner. Registered buggy and fixed revisions execute against the same frozen expected behavior in fresh browser state.

The completed synthetic alpha is the baseline. This branch develops a practical beta on three pinned public repository bugs: morphdom textarea updates, htmx delegated checkbox events, and Marked empty headings. All three completed fresh Linux arm64 workflows and 20 buggy/fixed exported-test pairs under the unchanged approved controls. Native workflows pass, but htmx's native stability sequence failed on browser shutdown and retained its profile; the practical beta remains incomplete. These are selected development cases using actual upstream source and small integration pages, not held-out effectiveness or arbitrary website support. See [verification status](evidence/PRACTICAL-BETA-PROGRESS.md) and the [frozen protocol](benchmarks/PRACTICAL-BETA-PROTOCOL.md). Earlier [release evidence](evidence/RELEASE.md) belongs to the synthetic alpha. Accessibility remains explicitly deferred and unverified. Real-user recording, PostgreSQL adapters and public untrusted execution remain unsupported.

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

For a repository case, choose it in the workbench, review its linked expected-behavior contract, and confirm capture. Inspect the observed values, reduce the actions, compare the fixed revision, then export. The new adapter retains only registered input and observation values; it does not capture arbitrary DOM, screenshots, traces, console or request bodies.

The same workflow is available from the CLI. Read the generated declaration before opting in; each operation needs a fresh output directory:

```sh
mkdir -p .repro-runs/my-case
node dist/cli.js cases --case morphdom-textarea > .repro-runs/my-case/expectation.json
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.repro-cache/browsers"
node dist/cli.js record --consent --experiment .repro-runs/my-case/expectation.json --output .repro-runs/my-case/capture
node dist/cli.js replay --manifest .repro-runs/my-case/capture/manifest.json --output .repro-runs/my-case/replay
node dist/cli.js reduce --manifest .repro-runs/my-case/capture/manifest.json --output .repro-runs/my-case/reduction
node dist/cli.js verify --manifest .repro-runs/my-case/reduction/reduced.manifest.json --output .repro-runs/my-case/comparison
node dist/cli.js export --manifest .repro-runs/my-case/reduction/reduced.manifest.json --output .repro-runs/my-case/capsule
```

Buggy capture and replay deliberately exit 1 when the declared failure is observed. Other registered case IDs are `htmx-checkbox` and `marked-empty-heading`. The capsule's README explains clean installation and its conventional single-revision test: select `REPRO_REVISION=buggy` to observe the failing assertion or `REPRO_REVISION=fixed` to test the fixed source. A missing dependency or unrelated failure does not establish the bug. Reduction can leave the sequence unchanged; inconclusive deletions keep minimality unverified.

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
