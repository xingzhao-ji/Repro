---
name: repro-accessible-debug-ui
description: Design or review Repro debugging interfaces for accessible capture consent, replay boundaries, reduction evidence, and trustworthy failure verification status.
---

# Repro accessible debug UI

Make the failure experiment understandable and operable without hiding its limits.
Consult [the project goal](../../../GOAL.md) for the supported capture/replay scope.

## Expose the experiment

Keep the capsule identity, application version, synthetic fixture/reset identity,
frozen assertion, and replay boundary available from the main failure view.
Show real execution and mocked components with text labels. A network replay
badge must identify what is mocked and what conclusions that excludes.

Distinguish capture status, privacy checks, reproduction, clean-machine replay,
reduction, and buggy/fixed verification. A green capture indicator must not imply
that an unexecuted clean-machine check passed. Use explicit PASS, FAIL, and
INCONCLUSIVE labels with short reasons and links to actual evidence.

## Consent and sensitive material

- Present capture opt-in before recording starts, with the environment, capture
  surfaces, duration/stop control, and local destination in plain language.
- Use synthetic fixtures as the expected path. Make production scope changes
  visible rather than silently extending a previous session's consent.
- Redact before rendering previews, notifications, downloadable traces, or
  clipboard content. CSS blur and hidden DOM nodes are not redaction.
- Explain when masking may affect reproduction and show its validation outcome.
- Keep export/download distinct from upload/share/publish. Do not imply that
  local export authorizes sharing owner information or publishing a capsule.
- Never auto-fill credentials, request privileged host execution, spend money,
  or offer a button that self-approves a denied operation.

## Keyboard and assistive technology

Use semantic headings, buttons, tables, forms, and labels. All workflows must be
usable by keyboard, including event inspection, timeline navigation, filtering,
expansion, rerun, cancellation, and export review.

Maintain visible focus, logical tab order, and a predictable return point after
closing dialogs. Dialogs need an accessible name, focus containment, and a usable
cancel path. Avoid drag-only ordering or hover-only failure details.

Provide a text/list representation of causal timelines and graphs. Identify event
sequence, dependencies, component, action, and outcome without color or position
alone. Announce meaningful progress/status changes through appropriate live
regions without narrating every event in a high-volume trace.

Support zoom, reflow, sufficient contrast, reduced motion, and readable long
identifiers. Truncation needs an accessible full-value path that preserves privacy.

## Debugging evidence and affordances

- Compare buggy and fixed observations against the same visible assertion hash.
  Highlight configuration differences rather than presenting unequal runs as an
  unqualified side-by-side verdict.
- Show budget used and remaining, best verified reduction, and untested work.
  Label minimality unverified unless final one-unit neighbors were all checked.
- Preserve the last verified artifact if cancellation interrupts reduction.
- Distinguish app failures from harness errors, permission blocks, and unavailable
  dependencies. Present a useful next step without disguising INCONCLUSIVE.
- Link each verdict to its run, capsule digest, environment, and relevant evidence.

## Validate the UI

Exercise the end-to-end supported workflow with keyboard-only navigation and an
accessibility-tree or screen-reader check where available. Include failed capture,
privacy invalidation, interrupted reduction, mocked backend, denied write, and
INCONCLUSIVE verification states. Report untested accessibility checks honestly;
a lint pass or attractive screenshot is not an end-to-end accessibility result.
