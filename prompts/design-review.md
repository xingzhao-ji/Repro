# Independent Repro design and interaction review

Use this as a review task after the builder has a running implementation. This prompt is not permission to publish, share data, spend money, change acceptance criteria, or approve a human-gated oracle.

## Task

Review Repro as a developer investigating a failure. Be skeptical, concrete, and fair. Judge the running application and actual artifacts, not the builder's claims. A familiar visual pattern is acceptable when it serves the task. Novelty is not a substitute for usability.

Read the current product brief, scope, design specification, acceptance criteria, and `docs/PROMPTING-RESEARCH.md`. Inspect supplied visual references and assets. If essential inputs or tools are unavailable, mark the corresponding checks BLOCKED; do not invent observations. Do not read or rely on a builder's self-assigned quality score.

## Execute

1. Classify the review scope first: static design prototype or implemented product. A clearly disabled runner is correct for the supplied static prototype, but product execution remains unverified. Never present a prototype design pass as product acceptance. Identify the exact revision, start command, local URL, runtime, and available fixtures. Keep all test data synthetic or already authorized for this environment. Do not contact external services.
2. Complete the supported core journey yourself: select a capsule, understand its invariant/provenance, inspect the timeline and dependencies, invoke a real supported run if available, inspect its result, and compare evidence. Verify the actual state behind the UI. An illustrative example is not a real execution.
3. Check not-run, pending/running where implemented, target failure, pass, inconclusive, runner error, and unavailable-action states. Verify status meaning and recovery actions. Fail any design that silently translates an unknown result into a pass.
4. Exercise keyboard-only operation, visible focus, tabs/dialogs if present, filter/selection reset, repeated clicks, Back/Forward, reload, long identifiers, and empty/error data. Observe console/runtime failures where tooling permits.
5. Capture and open screenshots at 1440×900, 1024×768, and 390×844. Check reflow at 320 CSS px. Include the selected-event view, comparison, and at least one failure or empty state. Log route, fixture/state, viewport, and revision for each screenshot. Missing screenshot inspection is a blocked visual gate.
6. Check actual text contrast, target sizing, accessible names, status labels beyond color, and focus visibility. Reference the linked W3C criteria for exceptions. Report coverage honestly; this is not a complete accessibility certification.

## Hard gates

FAIL if observed; BLOCKED if unverified:

- A core action is fake, broken, misleadingly enabled, or claims unsupported capability.
- The application presents synthetic or not-run data as an observed real result.
- The candidate changes its own acceptance oracle or self-approves a human approval gate.
- Required behavioral tests fail, or supposedly passed checks have no execution evidence.
- A primary journey cannot be completed using the keyboard, or its evidence/action is hidden by layout.
- Severe clipping, illegible evidence, or unexpected global horizontal scrolling occurs in tested supported layouts.
- A required missing/error state provides no honest explanation or actionable recovery.

No aesthetic score can compensate for a failed or blocked hard gate. An inability to test is not a pass.

## Design rubric

Rate each dimension 0–3 with evidence. This is a proposed local review scale, not an objective scientific quality measure.

- **Information hierarchy:** Can I quickly find the invariant, current result, provenance, selected evidence, and next step?
- **Product specificity:** Do timeline, dependency, and comparison treatments help debugging, rather than look like generic dashboard decoration?
- **Coherence and craft:** Are typography, spacing, alignment, tokens, density, and state styles deliberate and consistent?
- **Interaction clarity:** Do controls predict their effects, preserve context, explain unavailable states, and recover gracefully?
- **Responsive evidence readability:** Is the investigation still understandable on narrow screens, with necessary scrolling confined to appropriate regions?

Anchors: 0 = obstructive or absent; 1 = usable only with substantial friction/inconsistency; 2 = solid and task-appropriate with minor defects; 3 = exceptionally clear and polished, supported by concrete observations. Explain each score; do not average away a weak dimension. Proposed acceptance: every dimension at least 2, with all hard gates passing. Human preference may still differ.

## Required report

Write a review artifact containing:

- Verdict: PASS, FAIL, or BLOCKED; exact reviewed revision and coverage.
- Core-journey steps and observed results, including the provenance of the evidence.
- Hard-gate checklist with PASS/FAIL/BLOCKED and evidence per gate.
- Rubric ratings with one concrete explanation each.
- Findings ordered by impact: ID, severity, location/state, reproduction, expected/observed behavior, screenshot/log/test path, and smallest useful repair. Distinguish measured defects from taste suggestions.
- Three highest-impact next changes, or an explicit statement that no material repair is needed.
- Unverified areas and limitations.

Do not modify implementation during the independent review unless separately asked. Return actionable findings to the builder. After repair, review the changed revision and rerun affected interactions and visual checks. Preserve the original criteria and original failures in the audit trail. Completion requires evidence against the final revision; no automatic baseline updates merely to make screenshots pass.
