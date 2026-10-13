# Architecture and contracts

## Default implementation direction
A TypeScript workspace with packages for shared contracts, capture adapter, runner, reducer, CLI, and web UI. A Node service coordinates local runs; a React UI consumes explicit run events. Use an established package manager and commit its lockfile. Start with one process and a durable local SQLite run ledger; PostgreSQL belongs to the target fixture application, not necessarily the control plane. Add distributed workers only when measured workload requires them.

Pin actual package and container versions after verifying official sources; the starter kit does not pretend to supply a resolved production dependency lock. No credentials or LLM are needed. Reuse Playwright for browser execution, not for silently changing the frozen verification test.

## Separation
1. Capture adapter observes supported user actions, target app state and declared dependencies. It does not authorize execution or approve the oracle.
2. Capsule builder selects reviewed artifacts, assigns hashes, writes a temporary bundle, validates, and atomically finalizes it.
3. Runner validates a bundle before launch, creates disposable state, applies fixtures, schedules supported network/time inputs, executes actions, calls the independent oracle, and collects evidence.
4. Reducer proposes smaller candidates. It cannot change the oracle. The runner evaluates each proposal after a fresh reset.
5. Verifier runs original and candidate app revisions using the same capsule contract and controlled inputs; it describes the bounded evidence rather than assigning an unqualified “correct.”
6. UI and CLI display the same persisted state, never infer progress from elapsed time or a tool invocation.

## App adapter interface
Use an explicit interface with: `validateConfig`, `prepare`, `reset`, `start`, `applyFixture`, `readiness`, `executeActions`, `evaluateOracle`, `collectEvidence`, `stop`, and `dispose`. Each operation takes a deadline and cancellation signal. Give each run a unique owner ID and a private artifact directory. Cleanup must only affect that owner's resources.

Actions have stable IDs, semantic locators, supported inputs, and dependency IDs. Credentials and raw authentication tokens are forbidden in exported actions. Selector confidence is not a substitute for checking that the intended element was reached.

## Storage
Persist runs, trial records, artifact digests, outcome categories, seeds, adapter/runner versions, and cancellation state. Use transactional updates and monotonic event sequence IDs so refresh/reconnect cannot display stale completion over a newer failure. Artifacts are content-addressed under project-owned directories. Use atomic output finalization; incomplete bundles are unmistakable and cannot be replayed as valid exports.

## Replay boundaries
Every mocked response needs a reason and boundary label. A frontend stale-response fix may be tested against controlled API response order. A backend fix must execute the backend behavior under test; returning the old recorded API response cannot validate it. Record which behavior is observed, simulated, or not covered.

Clock, randomness, response ordering, initial local storage, app version, and database fixtures are explicit inputs when supported. Do not call a replay deterministic solely because one run succeeded. Hidden state produces an unsupported/inconclusive result or a documented limitation.

## Reduction algorithm
Begin with dependency-aware chunk deletion (ddmin-inspired): propose action removals, close over required dependencies, reset, execute, and accept only if the exact failure predicate remains true. Cache trials by full relevant input/environment/oracle digest, not just action text. Non-monotonic predicates require rechecking.

A budgeted reducer returns best-known failure-preserving output with a ledger. `1-minimal` means every allowed single remaining removal was tested and rejected under the declared constraints; `minimal` without qualification is forbidden. Repeat final candidates enough to characterize stability. Never reduce fixture rows by deleting referential parents while keeping dependents; adapter-specific invariants govern state reduction.

## Verification isolation
The candidate cannot write the harness, oracle, expected snapshots, or held-out cases. Bind approval and expected behavior to digests and a recorded source. Read-only mounts alone are insufficient if the candidate can alter the runner process; use a separate trust boundary. Treat target exceptions differently from adapter errors. Validate executed-assertion count and identity.

## APIs
Provide commands `doctor`, `record`, `replay`, `reduce`, `verify`, `export`, `inspect`. Local API resources: sessions, runs, trial events, artifacts, cancellation. Use an allowlisted project/session ID rather than arbitrary filesystem paths or shell commands. Generate a shared schema/type contract and contract tests before wiring the UI.

## ADRs required
Record choices for capture scope, reproducibility boundary, expected-behavior approval, mock semantics, isolation mechanism, reduction search, cache identity, cancellation ownership, storage recovery, and version compatibility. State alternatives and evidence; avoid invented “industry best practice” claims.

## Implemented read-only evidence inspection

`GET /api/jobs/:jobId/input` reads only that owned job’s saved `manifest.json`; it never substitutes the mutable session manifest. It validates the manifest and compares available recorded input digests. The response distinguishes readable input from confirmed recorded association.

`GET /api/jobs/:jobId/trials/:index` reconstructs the selected candidate from the frozen input and contiguous accepted-trial prefix. The baseline removes nothing; later removals preserve dependency validity. The reader derives execution directories from preceding run counts and reads only the selected trial’s exact linked evidence files. It checks identity, assertion count and synthetic observations against the recorded baseline harness, preserving historical builds. Missing artifacts, inconsistent records and unsupported data yield INCONCLUSIVE. Placeholder run IDs are not executed assertions.

The new module uses bounded regular-file reads with ancestor/leaf link rejection and single-link checks, returns allowlisted fields, and exposes no arbitrary file route or raw artifact paths. Existing loopback Host/Origin and no-store controls remain. This validates selected evidence association within the trusted local workspace; it does not independently authenticate every ancestor artifact or make local files tamper-proof. Concurrent hostile ancestor replacement remains outside the existing trusted-workspace model. Adapter, oracle, reducer and persistence behavior are unchanged.
