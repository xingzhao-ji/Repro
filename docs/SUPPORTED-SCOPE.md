# Supported scope and observed limits

This matrix describes the implemented local synthetic product. It is not a claim that every release gate has passed; exact final commands and remaining gates belong in [RELEASE](../evidence/RELEASE.md).

| Boundary | Implemented and observed | Unsupported or not established |
| --- | --- | --- |
| Application | One registered JavaScript search frontend, with separate buggy/fixed source digests | Arbitrary websites, arbitrary candidate source, additional app adapters |
| Capture | Explicit opt-in scripted alpha/beta session; actual browser input/submit and HTTP completion events | Manual browsing recorder, existing personal profiles, production sessions |
| Expected behavior | Supplied synthetic specification; unchanged baseline SHA-256 `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711` | Human approval, real-reporter approval, arbitrary synthesized assertions |
| Browser | Pinned Chromium 156.0.8078.4 passed native macOS runs; explicit installed Chrome was also tested during development | Other browser engines; universal cross-version equivalence |
| Reset | New owned HTTP service, browser process and empty context per run | Database/server state reset for other applications |
| HTTP | Real fetch requests; synthetic API bodies released beta then alpha, with frontend completion observed between responses | Backend computation verification; external authenticated services |
| Database | None required by this fixture | PostgreSQL adapter, schema/row reduction and reset evidence |
| Clock/randomness | Explicit fixed Date, Math.random seed, locale, timezone and viewport for this fixture | Arbitrary timer schedules, performance clocks, cryptographic randomness, GPU nondeterminism |
| Other browser features | Registered page's declared inputs and routes | Workers, WebSockets, third-party identity, native integration, arbitrary downloads |
| Assertion | Node assertion outside browser candidate; exact stale-alpha signature; empty/wrong/missing/timeout cases, actual renderer crashes and uncaught target exceptions remain inconclusive | Formal proof; unrelated failure treated as reproduction |
| Reduction | Bounded action/dependency-group deletion; repeated acceptance; complete trial identities and costs | State/fixture reduction; global minimality; minimality when final neighbors are inconclusive |
| Capsule | Allowlisted directory; atomic finalization; sizes, paths, links, versions and artifact hashes checked; executables compared to trusted installation | Archive extraction, public or hostile-code execution, hashes as author trust |
| Export execution | Conventional Node test and bundled readable runner; fresh npm installation tested without original app service | A proprietary viewer or LLM is not required; dependency installation still requires declared package/browser acquisition |
| Privacy | Synthetic data at origin; forbidden capture fields rejected; export allowlist excludes profiles, raw capture logs, traces and screenshots; sentinel tests | General-purpose redaction, real customer data support, a claim that sanitization preserves arbitrary bugs |
| Persistence | SQLite jobs/events, request-key deduplication, exact per-job manifest snapshot, actual interrupted capture/reduction/export recovery with fresh retries and owner-scoped cancellation | Distributed workers; crash-proof cleanup of arbitrary external services |
| UI | Live backend operations, timeline, explicitly current capsule dependencies, selected-job reduction/comparison/export; run selection survives refresh and navigation; literal untrusted log text, keyboard, reflow and automated accessibility samples | Full WCAG conformance or screen-reader usability certification; native 200% zoom remains a distinct check |
| Native isolation | Chromium sandbox enabled; fresh profiles; page-request allowlist; execution deadlines; bounded manifests/exports | Native OS CPU/memory/process isolation or hostile-code containment |
| Linux portability | Pinned container recipe builds; default-seccomp sandbox launch failure is preserved as evidence | Successful sandboxed replay was not established at this audit. A reviewed namespace-syscall profile is prepared but requires specific authorization before use |
| Benchmark | One synthetic failure family, twenty buggy and twenty fixed repetitions with every result retained | Historical bugs, held-out effectiveness, real users/adoption, general determinism or performance claims |
| Deployment | Local-only implementation and deployment plan | Hosted endpoint, publication, external uploads, paid infrastructure |

Actual recovery tests kill an owned worker during a live capture, after two real reduction baseline runs, and after the first staged export file. The recorded capture descendants exit on this native host without test cleanup. This observation does not establish universal cleanup after arbitrary process or host failures. An abrupt export leaves rejected partial output and its lock; a retry uses a fresh job/output directory.

The current execution manifest is numeric `schemaVersion: 1`, structurally documented in [manifest-v1.schema.json](../schemas/manifest-v1.schema.json) and validated by `validateManifest` in [manifest.ts](../src/manifest.ts), with types in [contracts.ts](../src/contracts.ts). The starter files [capsule.schema.json](../schemas/capsule.schema.json) and [run-result.schema.json](../schemas/run-result.schema.json) describe incompatible proposed `0.1.0` interchange formats; they are not the runtime product-v1 schema. The corresponding [run-result-v1.schema.json](../schemas/run-result-v1.schema.json) describes individual run results. [Schema notes](../schemas/README.md) distinguish structural checks from semantic identity validation. `repro inspect` uses the actual runtime validator. A future format migration must be explicit.

`manifest.environment.platform` names the intended `linux-container` portability target. Each run separately records its actual host and browser. A native macOS requirement-satisfied result does not satisfy the Linux portability gate. Top-level generated directories in an imported capsule are excluded from artifact validation; installed dependency integrity must come from a clean lockfile installation, not the capsule's self-declared hash list.

The synthetic fixed implementation is intentionally available in the development kit. These runs are development demonstrations, not held-out evaluation. No historical reference fixes or sealed historical tests were supplied or used.
