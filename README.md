# Repro — turn a bug in your local web app into one REPRO.md

Point Repro at your own local web app and write what went wrong and what should happen. Repro then:

- starts the app in a fresh browser and reproduces the bug from a fresh state;
- shortens the steps when the expected behavior cannot depend on them;
- writes **one Markdown file**.

The file gives a teammate or coding agent the status, the expected and observed behavior, the exact commit with any local changes, the environment, sanitized logs, and a **regression test embedded as code blocks**. They can recreate the test with one command, reproduce the failure, fix the original app, and run the same command to check the fix. They do not need Repro or an AI service.

Repro does not invent results:

- every status and observed value comes from actual runs;
- suspected causes are kept apart from verified ones;
- what is missing or unsupported is stated in the file.

**Release 0.2.2** adds this developer workflow to the 0.1.0 practical beta, whose built-in cases remain as examples. Start with the [QUICKSTART](docs/QUICKSTART.md). The supported apps, step grammar, redaction and limits are in [LOCAL-APPS](docs/LOCAL-APPS.md), and the design is in [ADR 0005](docs/adr/0005-local-app-repro-report.md). [Example REPRO.md files](docs/examples/README.md) show the output, and the [release notes](docs/RELEASE-NOTES.md) list what changed. Accessibility remains deferred and unverified.

```sh
npm install --ignore-scripts --no-audit --no-fund /absolute/path/to/repro-local-0.2.2.tgz
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.repro-cache/browsers"
npx --no-install playwright install chromium --only-shell
npx --no-install repro serve            # open http://127.0.0.1:4318
# or: npx --no-install repro report --app /path/to/app --went-wrong '…' --should-happen '…'
```

## Built-in examples and registered cases (from 0.1.0)

Repro began as a local failure compiler for explicitly registered cases. It captures a declared browser failure, reduces its action sequence, and exports a readable test and integrity-checked capsule. Its workbench (now at `#/new`, under **Built-in examples**) and CLI share the same runner. Registered buggy and fixed revisions execute against the same frozen expected behavior in fresh browser state.

**Release 0.1.0 (practical beta)** shipped as `repro-local-0.1.0.tgz`. It supports the synthetic stale-response alpha plus three pinned public repository bugs: morphdom textarea updates, htmx delegated checkbox events and Marked empty headings. They run against actual upstream source in small integration pages.

The release builds on implementation `9aec7fe`, which passed native macOS arm64 and fresh isolated Linux arm64 acceptance ([native](evidence/STARTUP-CLEANUP-NATIVE-ACCEPTANCE.md), [Linux](evidence/LINUX-THREE-CASE-RESUME.md)). It adds the cleanup-basis diagnostics and two cancellation fixes found while verifying the installed package. Those changes need fresh evidence, so verification of the exact release tarball is recorded separately in [`evidence/PRACTICAL-BETA-RELEASE.md`](evidence/PRACTICAL-BETA-RELEASE.md). A documentation-only commit adds that report after the release commit. Releases 0.2.0 to 0.2.2 change runtime bytes, so the 0.1.0 platform evidence does not transfer to them.

Read [INSTALL](docs/INSTALL.md), [USAGE](docs/USAGE.md), [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) and the [release notes](docs/RELEASE-NOTES.md). The notes cover what changed and the known issues: one historical native htmx shutdown failure on an earlier build, cause unresolved, is preserved. The registered cases are selected development cases, not held-out effectiveness or arbitrary website support; see the [frozen protocol](benchmarks/PRACTICAL-BETA-PROTOCOL.md). Earlier [release evidence](evidence/RELEASE.md) belongs to the synthetic alpha. Real-user recording, PostgreSQL adapters and public untrusted execution remain unsupported.

### Install the release

```sh
mkdir repro-workspace && cd repro-workspace
npm init -y
npm install --ignore-scripts --no-audit --no-fund /absolute/path/to/repro-local-0.2.2.tgz
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.repro-cache/browsers"
npx --no-install playwright install chromium --only-shell
npx --no-install repro doctor
npx --no-install repro serve
```

See [INSTALL](docs/INSTALL.md) for requirements, checksum verification and running an exported capsule on another machine.

### Run from a source checkout

Use Node 24 or newer, npm, and a supported Chromium host. Development was tested on macOS arm64 with Node 26.7.0.

```sh
npm ci --ignore-scripts --cache .repro-cache/npm
PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx --no-install playwright install chromium --only-shell
npm run build
npm run repro -- doctor
npm run dev
```

Open `http://127.0.0.1:4318/#/new` for the built-in examples. Capture requires opt-in. Use the supplied example or explicitly declare either supported alpha/beta search order and its expected result; see [expected-behavior input](docs/AUTHORED-EXPECTATIONS.md). No account, API key, proprietary viewer or LLM is required. All generated sessions, traces, screenshots, reports and exports stay beneath ignored `.repro-runs/`; downloaded tools and caches use `.repro-cache/`.

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
