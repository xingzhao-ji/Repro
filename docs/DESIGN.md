# Design direction: an evidence workbench

Repro is a debugging tool. Its visual priority is answering: what failed, under which conditions, what was removed, and what evidence supports the outcome?

Use the original assets/ prototype and tokens as a starting direction, not an inflexible screenshot or proof of finished behavior. Inspect the asset brief. If a provided static filename differs, use the actual files listed in assets/. Preserve its restrained typography, alignment and evidence hierarchy while wiring real states.

## Layout
A compact project/session rail; a central run timeline or reduction comparison; a detail inspector for selected actions, dependencies, evidence and mocks. Keep the primary next action obvious. Errors belong beside the relevant operation, with recovery instructions. Large decorative hero sections, testimonials, fake KPI cards and AI-chat-first navigation are inappropriate for the product workspace.

## Typography and color
Use a local system UI stack and system monospace fallback; no external font request required. Establish a spacing and type scale, consistent borders and density, and restrained accent use. Outcome colors supplement explicit text/icons. Avoid flattening different meanings into a single green “success.” “Original bug reproduced” and “candidate satisfies requirement” must remain distinguishable.

## Interaction specification
Provide a selection state, empty state, loading state with real progress only, error state, cancelled state, unsupported state and completed-evidence state for every primary view. Preserve user context after refresh and return focus after dialogs. Destructive run cleanup should identify exact owned artifacts. Explain disabled controls.

## Quality is not a ban list
Generic styling is often a symptom of missing product decisions. Choose information hierarchy from the user's task, not trends. A gradient or rounded corner is not inherently wrong; unexplained decoration that competes with evidence is. Require an independent reviewer to state concrete usability defects, not simply “make it premium.”

## Review loop
Capture actual product screenshots at desktop/tablet/mobile and 200% zoom. Inspect dense and empty sessions, long paths/error messages, 100+ timeline items, keyboard focus, and all outcomes. Compare with the intended tokens. Fix overlap, inconsistent alignment, weak hierarchy, inaccessible status, or fake interactions, then rerun browser tests and recapture. Pixel appearance alone never establishes functionality.

Read docs/PROMPTING-RESEARCH.md and prompts/design-review.md when available for the evidence-based prompting workflow.
