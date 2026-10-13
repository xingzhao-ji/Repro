# Release gates

## R0 — kit and provenance
Supplied synthetic checks pass. The agent identifies which files are starter assets versus product code and records package/runtime sources. Synthetic fixture human approval remains pending until actually confirmed; no fabricated human review. Local development may use the supplied synthetic specification as its explicit expectation basis, without labeling it human-approved. This does not authorize real-user assertion approval.

## R1 — behavioral core
In a real browser, the unchanged synthetic assertion identifies the intended bug in the buggy target and passes in the fixed target with identical controlled input. Separate empty assertion, wrong exception, missing dependency, and adapter timeout cases return inconclusive. Repeat supported deterministic replay at least 20 times and report every outcome; this is a proposed gate, not an achieved product result.

## R2 — reduction
A noisy supported session is reduced without changing the oracle. Dependency constraints survive. Every accepted reduction trial has evidence of the same failure. An exhausted budget returns best-known output and honest status. Test a non-monotonic failure, prerequisite action, multiple different errors, and unstable candidate. Do not claim global minimality.

## R3 — portability
Export and replay on a fresh supported environment using documented commands, without original services, local credentials, or undocumented data. Validate missing adapter/version mismatch, corrupt artifact, interrupted export, unknown schema, and unsafe archive. Independently check that the actual fixed app revision satisfies the original expected behavior.

## R4 — persistence and cancellation
Restart at capture/reduction/export boundaries, recover owned state, deduplicate recorded events, and distinguish incomplete from completed outputs. Cancel/retry/refresh/repeated-click flows do not create duplicate jobs or delete another run's resources. Evidence stays linked to its exact run.

## R5 — real UI
All primary controls call real operations or clearly state unsupported/disabled status. No static metrics masquerade as live results. Keyboard navigation, focused dialogs, cancellation, error recovery, back/forward, reconnect and read-only evidence inspection work. No layout clipping at 390, 768, and 1440 CSS pixels; review 200% zoom. Color is never the only outcome indicator. Labels, focus, contrast and reduced-motion behavior are tested.

## R6 — isolation/privacy
Pass the applicable SECURITY.md adversarial fixtures. Never claim public/untrusted execution support if only ordinary local containers were tested. Include a privacy sentinel fixture proving forbidden fields do not reach exported artifacts. Report any unsupported browser/native feature explicitly.

## R7 — code health
Type checks, lint, unit, contract, integration and E2E suites pass against final source. Lockfile and install instructions reproduce. No broad catch-and-success, duplicate shadow implementations, unnecessary frameworks, TODO-shaped primary flows, dependency vulnerabilities silently ignored, or test skips introduced to obtain green.

## R8 — benchmark integrity
Synthetic demos are labeled synthetic. Historical-bug cohort selection, buggy/fixed revisions, licenses, setup and held-out separation follow benchmarks/PROTOCOL.md. No fabricated dataset or target represented as outcome. Product completion may be local-alpha while historical validation remains pending; do not call the broader research hypothesis established.

## R9 — release evidence
Produce evidence/RELEASE.md, machine-readable run summaries, actual logs, screenshots, architecture decisions, supported-scope matrix, limitations, and an executable demo script. Each claim has a source/run. Deployed success requires exact remote commit, terminal CI, deployment result, and live behavior; otherwise label local-only.

## R10 — original interaction design and HCI research integrity
Maintain an original task-specific interface and a written rationale linking each primary view, status and disclosure to an engineer's evidence question. Reject generic dashboard content without a task purpose. Demonstrate that the supported workflow exposes capture scope, retained/removed actions, dependencies, exact run identity, frozen assertion, reproduced failure, candidate observation and limits without implying that a completed operation establishes an unrun property.

Maintain technical and heuristic coverage for keyboard-only workflows, screen-reader semantics and actual screen-reader usability, focus, meaningful status announcements, errors/recovery, reduced motion, responsive layouts, contrast and native 200% zoom. Distinguish passed samples, observed defects, blocked checks and unrun checks. Full screen-reader usability and native zoom require actual evidence, not inference from axe, screenshots or CSS zoom.

Deliver a research question, intended contribution, primary related-work review, alternative/comparator design, reproducible usability tasks and answer keys, calibrated-trust/comprehension/recovery measures, comparison/counterbalancing plan, analysis rules and blank study artifacts. Pilot technical fidelity and heuristic tasks autonomously within permissions. Human participants, recruitment, consent/ethics and participant-data use remain separately authorized gates. No fabricated observations or conference acceptance/readiness claim; prepared study materials do not establish the research hypothesis.

## Independent review prompts
Architecture reviewer: find incompatible contracts and needless abstraction.
Correctness reviewer: try to obtain a false reproduction or false patch pass.
Security reviewer: try to cross trust boundaries using owned test fixtures.
Design reviewer: inspect actual screenshots and interact, not just generated CSS.
Release reviewer: verify commands and artifacts on a clean environment; list passed/failed/skipped/unrun separately.
