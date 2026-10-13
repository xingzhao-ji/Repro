# Repro evidence inspector

## Intent
A professional local debugging workbench for portable bug capsules. The important unit is inspectable evidence, not a magic reproduction button. The design surfaces event order, declared dependencies, explicit assertions, and the distinction between a bug verdict and an environment failure.

This asset pack is a **design prototype with synthetic data**. It performs no capture, replay, minimization, upload, or telemetry. “Passed,” “failed,” elapsed times, and counts in the screen are illustrative fixture values, not observed results, benchmarks, or product claims. The architecture is proposed, not an implementation or a verified security boundary.

## Files
- `prototype.html`: complete responsive inspector, no build or JavaScript required.
- `prototype.css`: layout and component styling.
- `tokens.css`: semantic colors, font stacks, spacing, radii.
- `logo.svg`: original cubic capsule mark and wordmark.
- `icons.svg`: nine original stroke symbols: capsule, timeline, graph, compare, check, warning, error, file, arrow.
- `architecture.svg`: proposed capture-to-evidence flow and minimization loop.
- `demo.fixture.json`: explicitly synthetic sample content; design format, not a product schema contract.
- `QA.md`: actual validation coverage and limitations.
- `qa/`: repeatable validation scripts and actual static-check output. Browser captures are absent because launch was blocked.

## Visual system and acceptance criteria
- Restrained slate navigation, white evidence surfaces, blue links, labeled semantic status chips.
- No marketing hero, glass, gradients, decorative blobs, emoji icons, invented metrics, or ornamental charts.
- System sans text and system monospace identifiers; no external font dependency.
- Compact but readable inspector hierarchy: capsule identity → declared environment → evidence → ambiguity.
- Event graph represents dependency inputs; event timeline represents order. Do not conflate them.
- Comparison uses the same input key and the same explicit assertion on both sides.
- A minimization attempt that loses the failure is restored. No claim of globally minimal output.
- Every affordance works locally (section links, disclosure widgets, fixture and architecture links), or is explicitly unavailable (`Run capsule`). No fake execution progress, disconnected menu, decorative search field, or simulated success toast.
- At narrow widths, navigation becomes a wrapping-safe horizontal strip, panels stack, and comparison columns become rows. No clipped primary content at 390 px.

## Accessibility and keyboard behavior
- Native landmarks, heading hierarchy, ordered event/log lists, and a first-focus skip link.
- Tab reaches navigation and links; Enter activates links. Native details/summary responds to Enter or Space and retains browser behavior. No custom keyboard traps or shortcuts.
- Focus uses a visible blue 3 px outline with a 4 px offset. Disabled execution is explained with persistent nearby text and `aria-describedby`.
- SVG diagrams include accessible title and description; ornamental icons are hidden from assistive technology. The inline graph description supplies its essential relationship content.
- Result labels and shape/icon differences supplement color. Red indicates assertion failure or runner error only when a text label disambiguates. Amber is uncertainty or a restored minimization attempt. Green is an illustrative passed assertion or preserved-failure reduction. Blue is navigation/information, never proof of success.
- Reduced-motion preference disables smooth anchor scrolling. No animation is needed to understand evidence.
- No live regions are included because this page never executes asynchronous work. A future implementation should announce user-triggered run-state changes without moving focus.
- CSS targets readable contrast; current-CSS token pair checks are recorded in QA. Browser accessibility-tree behavior and human screen-reader usability are not claimed as tested.

## Outcome semantics
- **Assertion failed:** the supplied predicate evaluated and failed; this can establish reproduction only within the tested scope.
- **Assertion passed:** predicate evaluated successfully; do not imply every bug is fixed.
- **Inconclusive:** required evidence is absent or insufficient. Never style as success.
- **Runner error:** the harness did not reach a valid assertion result. Separate remediation from bug diagnosis.
- A real runner must preserve provenance, runtime identity, fixture completeness, exit reasons, and the exact assertion. It must not inherit the prototype's illustrative verdicts.

## Local preview
Open `prototype.html` in a browser, or serve this folder through an existing local HTTP server. The prototype embeds its SVG symbols so icons do not depend on cross-file SVG loading. There are no external assets or network requests beyond this folder. Do not publish or upload automatically.
