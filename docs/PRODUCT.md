# Product contract

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
