# Research: a single launch, with a real quality loop

Research checked: **2026-10-13**. Intended product: **Repro**, an evidence-dense debugging workbench. This document is research and a proposed execution method, not evidence that the full Repro product has been built or tested.

## Bottom line

A strong launch prompt can initiate autonomous work, but it cannot guarantee a polished, correct application in one generation. The useful target is **one human launch → multiple autonomous build, inspect, test, and repair cycles → an evidence-backed handoff**. Set product outcomes and boundaries; make the environment capable of checking them. A screenshot, an agent's confidence, or a passing build alone is insufficient.

Treat “does not feel AI-generated” as a request for deliberate, product-specific decisions. No research establishes a universal color, font, or style blacklist that reliably produces good design. Repro should feel considered because its layout explains evidence, uncertainty, and the next debugging action.

## What the primary sources actually support

| Evidence | Supported lesson | Limit and implication for Repro |
|---|---|---|
| Anthropic, [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), March 24, 2026 | Separate building from skeptical evaluation; explicit criteria and live interaction make critique actionable. | An engineering report with selected experiments, not a universal controlled result. More iterations can increase complexity; the last version may not be best. Use an independent review at meaningful milestones, preserve the last verified version, and avoid endless aesthetic churn. |
| Anthropic, [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), November 26, 2025 | Persistent feature/progress artifacts help sessions continue; browser testing exposes failures unit tests and HTTP checks can miss. | A working model/harness example, not proof that every task needs many agents. Repro needs a persistent acceptance checklist and a real browser walkthrough before its UI is declared complete. |
| Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), September 29, 2025 | Curate relevant context, retrieve details as needed, and use representative examples instead of an expanding list of special cases. | Context management improves the working conditions, not the truth of the answer. Keep the launch entry point short and point to maintained product, design, and verification files. |
| OpenAI, [Harness engineering](https://openai.com/index/harness-engineering/), February 11, 2026 | Repository knowledge, executable invariants, and agent-visible feedback matter alongside instructions. | A particular internal engineering experience. For this kit, define observable boundaries such as honest run states and protected acceptance criteria rather than prescribing every implementation detail. |
| Anthropic, [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), January 9, 2026 | Evaluate actual environmental outcomes; combine suitable grader types and calibrate model judgments against people. | An LLM review is fallible. Check the stored run result and evidence, not only the success toast; use deterministic checks for correctness and a separate rubric for taste. |
| OpenAI, [Frontend coding with GPT-5](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_frontend), August 7, 2025 | Frontend prompting examples can guide initial generation; production use still needs review and iteration. | The recipe is explicitly archived. Do not treat its model/API examples as current configuration guidance or its examples as a guaranteed success rate. |

These sources support the direction of the workflow. They do not establish a success probability for this exact kit. The detailed Repro design choices and thresholds below are **proposed product judgments**, to be tested with the intended users, not research findings.

## The launch contract: specify decisions, evidence, and boundaries

The launch instruction should provide or link to:

1. **Product job:** help a developer understand a failure, inspect its captured dependencies, replay supported inputs, compare a candidate, and preserve a shareable evidence package only through authorized sharing.
2. **Truth contract:** distinguish target-invariant failure, pass, inconclusive, runner error, and not-run. State provenance beside results. Synthetic examples must remain visibly synthetic. No test execution can be inferred from an illustration.
3. **Scope:** a prioritized vertical slice and explicit non-goals. A designed control must perform its named action or clearly explain why it is unavailable. No invented cloud integrations, unsupported runtimes, hidden network traffic, or implied security guarantees.
4. **Design authority:** identify the canonical local design files, token file, and reference images. Inspect reference pixels before relying on them. Record what to borrow, such as timeline density or comparison alignment, rather than copying a whole brand.
5. **Acceptance:** independent behavioral checks, UI states, browser viewports, accessibility checks, and the evidence required for each claim.
6. **Autonomy boundary:** proceed on reversible implementation decisions within scope; pause for credentials, money, publication, sharing, required approval, or a material product decision not covered by the brief. A prompt does not grant extra permissions.
7. **Completion contract:** final file/revision identity, actual commands and outcomes, screenshots, remaining limitations, and exact reproduction steps. “Not run” remains distinct from “passed.”

Keep the stable entry point compact. Put details in versioned documents. On resumption, read the current acceptance checklist, latest decisions, failing checks, and next work item; verify the app still starts before adding features. Log observable decisions and results, not private reasoning.

## Repro visual direction: purposeful specificity

**Proposed direction:** a calm instrument for investigation. Use `assets/UI-BRIEF.md` and `assets/prototype.html` as the current visual reference, and start from `assets/tokens.css`; use semantic colors for outcome and neutral surfaces for evidence. Use the supplied assets as a coherent starting system, not a restriction against improvements justified by actual review.

- Prioritize the failure or uncertainty summary, invariant, run identity, and next action above decoration.
- Make the timeline and selected event the working center. Keep dependencies and before/after evidence within a clear navigation relationship.
- Use monospace for identifiers, timestamps, and code. Keep explanatory prose in a readable sans-serif. Do not force all interface text into terminal styling.
- Put related baseline/candidate values in aligned rows. Spell out the result; color is supplementary.
- Use spacing to separate investigation stages and small gaps to group related metadata. Consistent hierarchy matters more than inventing a new font.
- Treat empty, loading, missing-dependency, and runner-error screens as designed states with specific recovery actions.
- On narrow screens, preserve the summary and primary action, then stack or tab secondary evidence. Keep code/table scrolling local and discoverable.
- Add restrained motion only to clarify state transitions. Never animate a fabricated replay or simulate work as if a runner executed it.

A generic hero, decorative metrics, or a grid of equal cards would compete with this product's task. These patterns are not universally bad; they simply need a defensible purpose here. A familiar system font or standard control can be the best choice. Distinctiveness should come from useful information architecture and precise interactions.

## Execute the quality loop

The current static prototype can be reviewed for its declared design scope, including honestly disabled execution. It cannot pass the full product execution gates below. Keep a prototype review and a product acceptance review explicitly separate.

### 1. Brief, tokens, reference annotations

Write a short design decision record: audience, main task, information hierarchy, selected direction, color semantics, density, and responsive behavior. Identify two or three reference properties if references are available; do not stall the build on browsing for inspiration. Define a small component/state inventory and use realistic synthetic data, long identifiers, and failure states immediately.

**Gate:** a reviewer can identify the main task, required evidence, meaning of each status, and mobile adaptation before implementation begins.

### 2. Build one complete vertical slice

Follow one supported fixture from selection through inspection and whatever execution the implementation actually supports, then to the observed result and comparison. Keep illustrative receipt data separate from the executable search-race fixture. Do not combine their evidence into a fictional successful replay.

**Gate:** the core journey works on real application state. Buttons, selection, filtering, error recovery, and navigation produce inspectable outcomes. Freeze expected behavior independently of the candidate; an implementation cannot earn a pass by rewriting its oracle.

### 3. Verify function first

Run applicable static, unit, integration, and browser tests. Exercise malformed inputs, missing dependencies, repeated clicks, reloads, cancellation where supported, and Back/Forward navigation. Test the intended failure in the buggy case and a pass in the fixed case with identical declared inputs. Check state below the UI when possible.

Use user-facing browser locators and isolated test state. Test observable behavior rather than brittle CSS structure. This follows [Playwright's best-practice guidance](https://playwright.dev/docs/best-practices) (living documentation, accessed October 13, 2026).

**Gate:** required checks pass against the exact final revision, or the feature stays blocked with its cause recorded. An HTTP serving test does not count as a browser interaction test.

### 4. Inspect actual rendered screens

Capture and inspect the full core flow at 1440×900, 1024×768, and 390×844, plus a 320-CSS-pixel reflow check. These viewport choices are this kit's QA sampling plan, not a universal standard. Cover default, selected evidence, comparison, long-content, empty, loading, and error states. Inspect representative keyboard-focus states, not only pristine initial screens.

Record viewport, route, fixture, state, revision, and screenshot path. Use deterministic data and a consistent browser/font environment for comparisons. [Playwright's visual-comparison documentation](https://playwright.dev/docs/test-snapshots) explains that screenshot baselines are environment-dependent. A regression baseline must first be reviewed; matching an ugly baseline proves only consistency.

**Gate:** no unintended overlap, clipping, invisible action, global horizontal overflow, or unreadable evidence. Screenshot files must actually be opened and reviewed. If no browser is available, record a blocked UI gate instead of substituting source inspection.

### 5. Independent review, targeted repair

Give a fresh reviewer the brief, acceptance criteria, running app, and evidence. Withhold the builder's self-rating. The reviewer should perform the critical journey and identify specific defects with reproduction steps and evidence. Use `prompts/design-review.md`.

Separate hard failures from taste feedback. Fix truth, functionality, keyboard access, and legibility before surface refinements. Address the highest-impact defects, rerun affected checks, then recapture the affected screens. Rerun the full required suite after the final change. Keep a known-good version when exploring a visual alternative.

**Gate:** every blocker is resolved with evidence; required coverage is complete; remaining minor limitations are disclosed. If progress requires unavailable tooling, authority, or unresolved product intent, stop with that blocker. Do not endlessly rewrite an acceptable design to raise a subjective score.

## Accessibility gates with primary references

These checks are a useful minimum, not a full WCAG conformance audit. W3C Understanding documents are explanatory companions to the standard.

- Normal text contrast at least **4.5:1**, with **3:1** for qualifying large text; verify actual foreground/background combinations. [SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Reflow at **320 CSS px** without loss of information/function or unnecessary two-dimensional scrolling. Legitimately two-dimensional evidence views may need local scrolling; that exception does not excuse the whole app. [SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Pointer targets satisfy the **24×24 CSS px** minimum or the standard's applicable spacing/other exceptions. Prefer larger touch targets where feasible. [SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Keyboard focus is visible and never entirely obscured by authored sticky panels. [SC 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [SC 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
- Use native controls and accessible names; if implementing tabs, implement the appropriate roles, selection state, and arrow-key behavior. [WAI-ARIA Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

All accessibility sources accessed October 13, 2026. Automated scanning, keyboard walkthroughs, semantic inspection, and visual checks catch different failures; passing a scanner alone is not an accessibility claim.

## How to learn whether this prompt works

Do not assess the kit only on its best screenshot. Compare a minimal task prompt with the structured launch workflow on the same frozen task set, resources, environment, and model/version. Include clean initialization, a populated workbench, missing dependencies, long evidence, and a narrow screen. Repeat runs when resources allow; label small samples as exploratory.

Track independently: core-journey completion, oracle integrity, truth-label correctness, severe defects, accessibility failures, visual rubric results, repair cycles, elapsed time, and resource use. Blind reviewers to which prompt produced the result when practical. Keep failures and blocked runs in the report. Calibrate aesthetic scoring with a human's pairwise preferences and reasoned examples; do not manufacture benchmark numbers.

The initial deliverable is a research-informed harness specification. Its effectiveness remains a hypothesis until measured on actual builds.
