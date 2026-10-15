# Developer-supplied Expectations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Root coordinates distinct file owners and independent review under the user's autonomous execution instruction.

**Goal:** Let a developer provide a supported expected observation before capture and preserve it through reduction, comparison and export.

**Architecture:** Add schema 2 beside unchanged schema 1 and centralize frozen search-contract derivation. CLI/UI create a new session from a validated declaration; reducers and persisted historical jobs cannot rewrite it.

**Tech Stack:** Existing strict TypeScript, Node, React, Playwright and SQLite; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-15-authored-expectations-design.md`

## Global constraints

- Preserve schema 1 default assertion digest fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711.
- Keep trusted registered app code, exact controlled HTTP routes, fresh browser state and original container policy.
- No human approval claim; proposed-unconfirmed is INCONCLUSIVE.
- All raw evidence remains under ignored .repro-runs; retain red failures and historical results.
- No retries or bypasses of denied native navigation, new service dependencies or arbitrary code execution.

## Review focus

1. Deleting the final action must not redefine the expected result or response schedule.
2. A changed assertion or scenario cannot be written over a session during reduction/retry.
3. Request1/querybeta is valid only in the reversed frozen scenario; broadening route acceptance is not allowed.
4. Missing expected fields or contradictory values must not be autofilled to produce a pass.
5. Old selected jobs retain their own expectation after a new declaration is captured.

### Task 1: Frozen authored core and conventional export

Owner: core implementer. Files: src/contracts.ts, new src/search-contract.ts, src/oracle.ts, src/manifest.ts, src/adapter.ts, src/reducer.ts, src/capsule.ts, src/index.ts, schemas/manifest-v2.schema.json, schemas/README.md, tests/authored-expectations.test.ts and tests/authored-expectations.browser.ts. Existing tests may be extended but not weakened.

Interfaces: `createAuthoredManifest(input: unknown): ManifestV2` from manifest.ts. `searchContract(manifest: Manifest): FrozenSearchContract` and `expectationEstablished(manifest: Manifest): boolean` from search-contract.ts. Contract exposes `searchOrder`, `expected` and `stale` observations, `responses`, `assertionDigest`. Legacy oracle API remains usable by existing consumers.

- [x] Write and observe failing tests for schema2 validation, explicit caller expectation, two orders/different identities, invalid fields, provenance and frozen reduction inputs.
- [x] Implement discriminated contracts, registered rule identity, immutable scenario derivation and schema-specific validation.
- [x] Write and observe failing real-browser reversed-order tests, then implement exact routes/request numbering and dynamic independent assertion.
- [x] Extend reducer/export to preserve frozen identity and check actual dynamic observations in the conventional test.
- [x] Run relevant unit/browser checks; provide red/green logs and commit owned files after integration agrees.

### Task 2: User input and persisted evidence

Owner: root. Files: src/cli.ts, src/server.ts, src/ledger.ts, src/evidence-inspector.ts, web/main.tsx, web/style.css if required, tests/authored-input.test.ts, tests/authored-ui.browser.ts, tests/ledger.test.ts and tests/evidence-inspector.test.ts.

Consumes Task1 factory/contract. Produces record --experiment FILE and optional POST /api/sessions experiment. Read JSON through existing bounded regular-file reader. Default absence preserves v1 flow.

- [x] Write and observe failing CLI/API tests for authored input, missing fields, unsafe file and contradictory expectations.
- [x] Add CLI/API factory use and prevent ledger.updateManifest from changing frozen expectation/scenario/provenance.
- [x] Expose explicit labeled declaration controls before capture, display source and frozen observation, create a new session for edits.
- [x] Write and observe failing reversed-order selected-job inspection and keyboard capture-to-export workflow tests.
- [x] Implement contract-aware inspector and UI while preserving historical focus, refresh, cancellation and neutral uncertainty.
- [x] Run relevant checks and integrate with Task1; record deviations in ignored progress ledger.

### Task 3: Full validation and delivery

Owner: root plus independent reviewers. Files: usage/scope/design docs, release/STATE and portable evidence.

- [x] Run full unit/browser/static/build checks on integrated final source; inspect actual artifacts and screenshots.
- [x] Validate installed CLI and standalone exported v2 test; run new v2 Linux capsule under exact approved policy and stop owned VM.
- [x] Independently review oracle identity, authoring provenance, reduction semantics, privacy and UI states; fix evidenced defects with red/green tests.
- [ ] Final delivery: docs/reports and coherent implementation commits are prepared. Integrate the reviewed branch and perform authorized non-force private delivery; use the post-commit receipt under main `.repro-runs/expectation-authoring/delivery/` for exact remote readback. All implementation and validation steps above are complete.

Separate work: research-only HCI condition preparation may use frozen 15a8225 evidence and distinct files. It cannot change product runtime or fabricate participant observations.
