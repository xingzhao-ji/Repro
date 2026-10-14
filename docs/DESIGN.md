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

## Task-specific simplicity and interaction rationale

The core object is a failure experiment with a selected run, not a dashboard of product metrics. Present information in the order an engineer needs to reason: the expected behavior and supported scope; the observed result; the action/dependency sequence and controlled response order; reduction decisions and uncertainty; the same-assertion buggy/fixed comparison; exact identities and raw artifacts. Keep the current selected run visible when changing sections or returning through history.

Progressive disclosure puts plain-language outcomes and their reasons first, then the evidence needed to challenge them, then long identifiers and raw JSON. A disclosure may reduce visual density, but must not hide that minimality is unverified, that backend responses are mocked, or that an assertion did not execute. Comparison should make configuration differences inspectable before the user can infer a fix. Export is a local artifact operation, distinct from publishing or demonstrated portability.

Evaluate a linear task-oriented walkthrough, the existing timeline/detail workbench, and a raw-log/equivalent-evidence baseline. The walkthrough can improve first-use orientation but constrain expert backtracking; a persistent inspector supports comparison but adds density; raw logs retain auditability but demand more interpretation. Choose through observed task comprehension and error evidence, not visual fashion. Do not add ornamental statistics or generic template panels.

The intended HCI contribution concerns evidence comprehension and calibrated trust under uncertainty. See HCI-RESEARCH.md and HCI-STUDY-PROTOCOL.md for the research question, related work, alternative conditions and pre-study materials. evidence/HCI-REVIEW.md separates technical/heuristic observations from unrun human study and assistive-technology checks. No participant findings or publication-readiness claim follows from these design documents.

Maintain an explicit evaluation matrix for keyboard tasks, screen-reader interaction, focus transitions, errors and recovery, reduced motion, responsive behavior, contrast, CSS reflow and native browser zoom. Preserve blocked/unrun states. Native Chrome's existing ERR_BLOCKED_BY_CLIENT restriction is not resolved by container permission; no bypass is permitted.

## Implemented selected-run inspector

The workbench now adds three task links—Establish failure, Reduce steps and Check fix—while preserving the detailed evidence sections for backtracking. A persistent Frozen expectation region displays the selected job’s saved input and the controlled HTTP boundary. Dependencies also use that exact historical input. Starting a new operation still uses the current capsule, explicitly labeled beside the operation controls. This avoids presenting a later reduced manifest as the input of an earlier run.

Reduction separates the baseline check from accepted removals and groups rejected or inconclusive trials under a disclosure with a visible count. Selecting a trial preserves both job ID and local trial index in the URL. The inspector joins reconstructed removed/retained actions with exact linked run observations, executed assertion counts and identities. Recorded decisions remain historical metadata; missing or contradictory linked evidence produces an outer INCONCLUSIVE result and cannot establish an accepted trial anew. Unknown minimality stays unverified. Long digests and full run identity use keyboard-operable disclosures; uncertainty remains visible before expansion.

Operation complete uses neutral lifecycle styling. It does not mean the requirement, portability or minimality passed. The session picker displays a short identity with status outside the narrow control, addressing the reviewed tablet truncation. These are implemented design decisions, not evidence of improved human comprehension. The offline equal-evidence comparator is now implemented and undergoing its own retained-case fidelity verification; human evaluation remains separate pending work. Current verification is recorded in the release evidence, and the earlier HCI review describes the pre-implementation checkpoint.


## Frozen inspection comparison

The study comparison varies evidence organization while keeping the available evidence fixed. P reuses the workbench's task sequence, progressive disclosure and trial inspector. L presents ordinary headings, chronological events, readable trial details and identity disclosures in one continuous report. Both use one validated packet, the same selected-job control, global search, glossary, evidence download and inert export references. This preserves a usable conventional baseline without giving either condition a runner or extra answer content.

Each selection is bound to a saved job and, when relevant, a local trial index. Historical input is read from that job's saved manifest. Operation completion, recorded acceptance, outer evidence availability, assertion count and observed result remain distinct. For an inconclusive deletion, the recorded decision's identity-mismatch explanation and the raw execution's missing-steps explanation describe different evidence levels; neither demonstrates that a retained action is necessary.

The export references show exact readable test and instruction bytes with source hashes, as plaintext only. Their presence answers what was exported without implying that the frozen inspection view executes it. The machine-specific directory is withheld, and this selected export has no clean-machine replay in the retained study dataset. A deliberately invalid locator supports recovery testing in both conditions and is labeled as prepared navigation data, not a captured execution.

The tradeoff is explicit: freezing evidence removes execution timing and capture controls from the comparison, improving equivalence for inspection questions while excluding live workflow usability. One Alpha/Beta family cannot establish generality or avoid learning effects merely by changing run IDs. Final verification and remaining accessibility gates belong in the release evidence; this rationale is not a claim of human benefit.
