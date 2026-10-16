# Package input provenance implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this single task with a focused red/green check and independent final review.

**Goal:** Detect token/configuration changes during both installed-package checks.

**Architecture:** Share the existing file-hash inventory between the two development scripts, then include the previously omitted stylesheet import and build configuration. Keep this separate from product execution and frozen assertions.

**Tech Stack:** Existing Node ESM scripts and strict TypeScript tests; no dependencies.

**Spec:** GOAL.md final source identity and docs/ACCEPTANCE.md R7/R9.

## Constraints and review focus

- Preserve runtime bytes, old receipts, failed observations and existing security limits.
- Store generated evidence only under ignored `.repro-runs/package-input-provenance/`.
- Exercise actual filesystem mutations: tokens, configuration, existing source, added source, removed required input. Generated run/cache data must not enter the inventory.
- Keep the authored script's additional built-artifact guard.
- No browser suite, package installation, Linux execution or historical diagnostics are needed for a development-script inventory correction.

## Task 1: Complete the stability inventory

Files: `scripts/package-inputs.mjs`, both `scripts/*package-smoke.mjs`, `tests/package-inputs.test.ts`, a provenance supplement and STATE.md.

Interface: `packageInputHashes(root, includeDist = false)` returns a sorted path-to-SHA256 object. The two callers keep their existing before/after equality checks.

- [x] Extract the existing inventory without changing its behavior, so the real function is independently executable without starting package work.
- [x] Add filesystem-based regressions; observe token and tsconfig mutation failures against the existing inventory.
- [x] Add `assets/tokens.css`, `tsconfig.json` and the inventory/driver scripts to the explicit inputs. Verify mutation detection, missing-input rejection and output exclusion.
- [x] Run the focused test, strict typecheck, lint and the unit/contract suite; retain red and green logs.
- [x] Reconcile current tokens against both retained CSS source maps, document the 27-entry receipt's limited coverage, and verify runtime artifact bytes remain unchanged.
- [x] Obtain independent review and prepare delivery within existing private-repository authorization. The exact completed commit and non-force push are recorded after commit under `.repro-runs/package-input-provenance/delivery/`; preserve all generated evidence and the earlier worktree.

Execution decision: implement on a local task branch in the clean main checkout; no concurrent file writers or dependency changes. Existing retained runtime results are reused only after byte comparison, not relabeled as new runs. Keep this plan and its evidence rather than deleting useful diagnostic history.
