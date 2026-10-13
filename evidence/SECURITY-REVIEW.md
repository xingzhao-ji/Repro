# Security and correctness review

Reviewed 2026-10-13 UTC against [recorded source hashes](../.repro-runs/security-review/review-source-hashes.json), Node 26.7.0, macOS arm64. This automated review is independent of the input, CLI, path, ledger, service, server, reducer and UI implementations. The reviewer authored manifest/capsule code; their tests are supporting checks, not independent authorship. No Linux policy execution or native-browser zoom retry occurred in this audit.

**Final focused result: 62 passed, 0 failed, 0 skipped.** Command: `node --import tsx --test tests/*.test.ts`; [terminal log](../.repro-runs/security-review/final-audit-stable.log). The CLI test file also passed ESLint. One earlier combined run overlapped the integrator's dependency reinstall and had eight CLI subprocess failures; that [unsuccessful run](../.repro-runs/security-review/final-audit.log) is preserved separately.

## Findings fixed during this review

| Finding | Behavioral evidence | Verified repair |
| --- | --- | --- |
| CLI output leaf links could overwrite another file | Owned sentinel changed through `manifest.json`, `result.json` and `reduced.manifest.json`, for both symbolic and hard links | All six tests now preserve the target and return category `input`. CLI prechecks applicable leaves; `writeOwnedFile` opens without following links and checks the descriptor before truncation |
| FIFO manifest blocked before regular-file validation | Owned FIFO with no writer required timeout termination | `readManifest` checks the file before opening, uses nonblocking/no-follow flags, compares device/inode, and bounds reads to 64 KiB; regression exits promptly with category `input` |
| Invalid reduction budget created output before rejection | Budget zero created an output directory and manifest | Validation now precedes output creation; regression confirms no directory exists |

[Red log](../.repro-runs/security-review/cli-adversarial-red.log): two CLI tests passed and eight failed before repair. [Green log](../.repro-runs/security-review/cli-adversarial-green.log): all ten passed, including malformed and oversized input. Link fixtures and timeout cleanup touched only task-owned files/processes. [Regression source](../tests/cli.test.ts).

## Acceptance coverage

**R2 — action reduction:** [Reducer tests](../tests/reducer.test.ts) exercise dependency closure, non-monotonic deletion, final-neighbor retesting, unstable candidates/baselines, budgets, deadlines, cancellation, changed identities, empty assertions and runner exceptions. [Independent tests](../tests/reducer-review.test.ts) reject unknown outcome labels, a failure label contradicted by its observation, and absent observations. Current code independently evaluates every conclusive observation with the frozen oracle before accepting repetitions. These are unit models. Separate [real-browser evidence](../.repro-runs/browser-pinned-final.log) includes actual noise removal and fixed-revision verification; it is native macOS evidence. Missing prerequisites remain inconclusive, so the real fixture does not earn a global or unqualified minimality claim. State/database reduction is unsupported.

**R6 — scoped isolation/privacy:** Current tests cover manifest fields/identities/bounds; unsafe capsule paths, links, sizes, duplicate records and archives; tampered executables with recomputed hashes; interrupted and competing export; explicit consent; and [forbidden-field privacy sentinels](../tests/privacy-review.test.ts) across run evidence, ledger and every exported file. No forbidden sentinel leaked in those fixtures. Existing real-browser tests observe denied requests to an undeclared owned service and owner-scoped cancellation. These establish coverage of the registered synthetic frontend, not arbitrary code containment or general secret detection.

**Persistence/API integrity:** [Release regressions](../tests/release-review.test.ts) confirm exact per-job input snapshots survive later session changes, roughly 6 KiB trial events remain intact, oversized events are rejected, and malformed non-ASCII tokens receive 403. [Recovery tests](../tests/recovery.test.ts) exercise initialization failure/lock release and an actually killed owned coordinator with record/reduce/export ledger states. Origin/Host/token and consent checks pass. Source review confirms verification binds both runs to the requested manifest, installed harness, assertion, seed, versions and application digests.

## Remaining boundaries

No unresolved defect from the scoped regressions remains. This does **not** close Linux portability: the recorded default-container attempt executed no assertion because Chromium lacked a usable sandbox. A prepared custom security policy remains unexecuted pending specific authorization. Native 200% zoom remains a separate unverified UI gate.

The local workspace is trusted; file checks are not a race-proof hostile-filesystem sandbox. The loopback token protects browser-origin mutations, not against another process acting as the local user. Native CPU/memory/process isolation, arbitrary workers/native integrations, huge-output hostile processes and public/untrusted execution are unsupported. Ledger crash recovery does not prove orphan-browser cleanup after abrupt host-process death. Export hashes establish integrity; excluded installed dependencies are not attested. Privacy relies on synthetic data and allowlists, not an exhaustive personal-data scanner; caller-defined identifiers must remain synthetic. These limits and the remaining release gates must remain visible in [RELEASE](RELEASE.md).
