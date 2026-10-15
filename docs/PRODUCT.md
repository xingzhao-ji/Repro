# Product contract

<!-- impeccable:product-schema 1 -->

## Platform

web

## Positioning

Repro is a local failure compiler and evidence workbench. Its mechanism is to preserve an explicit expected behavior while reducing a supported failure experiment, then export a dependency-explicit capsule and readable conventional test. The same frozen assertion evaluates a second registered application revision. Core execution requires neither a proprietary viewer nor an LLM.

## Operating Context

The user works in an owned local development repository through the CLI or loopback web workbench. The first supported application is the included synthetic JavaScript stale-response frontend; developers can declare either supported search order and its expected result before capture. Arbitrary app registration and arbitrary assertion code are not implemented. Package and browser acquisition are declared setup steps. Linux container replay is a separate portability check with an explicitly approved isolation policy. Preserve the existing implementation, historical evidence and user changes during release work.

## User and job
Primary user: a developer or maintainer of a self-hostable web application who receives a stateful browser bug that another person cannot reproduce. The product reduces the work of transferring and maintaining a reproduction. It does not diagnose every bug, certify arbitrary patches, or replace requirements.

## Core journey
Register an explicit local app adapter → capture an opt-in synthetic/dev session → review state and redact unsupported/private data → confirm expected behavior → reproduce the original failure → reduce under a bounded budget → export → run on a fresh supported environment → compare a candidate revision with identical assertions.

The first successful experience is a clean-environment capsule that produces the intended failure without original services or hidden configuration. Failure reduction is valuable only after faithful reproduction works.

## Observable states
A session moves through draft, validating, ready, running, reducing, exporting, complete, cancelled, or blocked. A run has a separate outcome: `target-failure`, `requirement-satisfied`, `inconclusive`, or `cancelled`. Product lifecycle and behavioral outcomes are different fields.

- `target-failure`: the frozen expectation is violated in the intended way with required preconditions met.
- `requirement-satisfied`: that expectation was evaluated and satisfied for this run.
- `inconclusive`: missing state, unsupported behavior, no assertion, wrong error, unstable environment, harness failure, or insufficient evidence.
- `cancelled`: user/owner cancellation; never recategorize as a target failure or success.

Verification labels should say “original failure reproduced,” “candidate passes bounded checks,” or “inconclusive,” not “AI fixed” or “proven safe.”

## Initial limits
One registered Chromium/local-web adapter; resettable, owned PostgreSQL instances only when required; controlled HTTP responses; no arbitrary production cookies, payments, real email, or customer datasets. WebSockets, cross-origin workers, native modules, nondeterministic GPU paths, third-party identity, and nondeterministic external systems are unsupported until independently implemented and evaluated.

## Non-goals
Do not build a new browser engine, database, universal scheduler, autonomous patch-merger, SaaS billing platform, or new agent framework. Do not copy a commercial UI. Do not add LLM chat merely to make the product look AI-enabled. Defer hosted accounts and remote execution until local correctness and isolation are established.

## Product evidence
Keep a case-linked explanation of capture scope, frozen assertion, environment, reduction, external mocks, original/candidate results, and limitations. Users must be able to inspect/export this without reading raw logs only.

## Evidence on Hand

The repository contains product and architecture specifications, original design references in `assets/`, executable synthetic fixtures, behavioral tests, and historical reports in `evidence/`. `evidence/RELEASE.md` distinguishes fresh results, retained historical reports, provisional observations and untested behavior. Raw historical runs may be absent in a portable checkout. There are no established real-user findings, historical-bug coverage or general determinism claims.

## Product Principles

- Reproduce the intended failure before accepting a reduction; keep the assertion and harness independent of the candidate.
- Make dependencies, mocked behavior, executed evidence and uncertainty inspectable.
- Preserve earlier results and give each execution its own identity and owned resources.
- Ship the complete supported workflow with reproducible setup; diagnose actual product defects before expanding scope or optimizing test infrastructure.
- Treat engineering thresholds as documented choices, with their relevance reviewed explicitly rather than silently weakening checks.

## Accessibility & Inclusion

The workbench must support keyboard operation, visible focus, readable contrast, responsive reflow, reduced motion, meaningful status announcements, native 200% zoom and actual screen-reader workflows. Automated accessibility checks and semantic snapshots provide bounded technical evidence; they do not establish screen-reader usability or native zoom. Keep blocked and unrun checks visible.
