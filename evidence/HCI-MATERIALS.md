# HCI materials version 2 — preparation correction

2026-10-15. Documentation and blank study artifacts only, based on source checkpoint `1db23ea223341d39ef20ec318c6641124ac60461`. Zero participant records or sessions. The product runtime, dependency lockfile, synthetic analysis engine, arithmetic fixture and frozen P/L evidence are unchanged. This is a correction to R10 preparation materials, not a completed or approved human study.

## Findings and changes

Independent source audit found four concrete inconsistencies in the previous materials:

1. The protocol planned two blocks, while the session template represented only one condition/case. Result rows lacked block/slot/attempt identity and no blank schedule represented all expected tasks/claims.
2. The form dictionary described all noncompletion as censoring, whereas the analysis engine uses administrative timeout only. Ending reasons were absent.
3. One `understanding_score`/coder pair could not preserve six concepts, independent coder passes or disagreements before adjudication.
4. Static T5/T6 scoring required live current-capsule operations and export paths/artifacts absent from the sealed P/L projection.

[Protocol 0.2](../docs/HCI-STUDY-PROTOCOL.md) now binds inspection keys to the historical schema-1 alpha→beta case and separates live formative extensions. [Materials version 2](../research/hci/README.md) supplies two unassigned block placeholders; separate task/claim schedules and result sheets; original-attempt identity; explicit endings and missingness; six-concept independent coding and separate adjudication sheets. A first-attempt policy is proposed for approval/freeze before collection, preserving all later attempts. The [analysis contract](../research/hci/ANALYSIS-CONTRACT.md) explains field correspondence while retaining the unchanged synthetic-only input schema and absence of a CSV/human-data importer.

## Verification scope

A local Python standard-library check parsed JSON and all six CSV files, confirmed zero data rows and unique headers, checked that both block assignments and all participant/approval/runtime observations remain unresolved, and resolved 14 relative Markdown links. `git diff --check` passed. The command inspected Git's changed-path list against the explicit materials/protocol allowlist; no executable product, test, renderer, analyzer, fixture or dependency file changed.

Raw structural check receipts and material hashes are retained under ignored `.repro-runs/hci-materials-v2/`. The portable final receipt is [hci-materials-check.json](hci-materials-check.json). These checks establish syntax, blankness and file identity, not study validity, correct future data entry or scientific benefit. No runtime suite, browser run, participant collection or assistive-technology action was performed for this documentation-only change. Prior runtime results remain at their originally recorded source/build identities.

A supplemental link check over the entire preserved release report failed on an older local raw-evidence reference. The complete scan found 1 absent historical links; their exact targets and the failed check remain in the receipt. All 7 links added to the state/reports resolve, and final material hashes match. No missing historical evidence was regenerated or relabeled.

Independent review scope: task/claim/block identity, timing and missingness, retries, coding independence, static P/L task-key fidelity and authorization language. Review findings and their resolution are recorded in the final receipt; this is agent source review, not human approval or participant evaluation.

## Remaining limits

A human owner must still approve and freeze the actual study, private data store, cases, build parity, assignments, keys, coding plan and analysis choices before collection. The single supplied failure family does not provide independent matched task families. Human-data import, agreement calculations, inferential analysis and participant work remain unimplemented or unrun as previously stated.

The current continuation rechecked supported computer-use inventory: native Chrome was listed as an application, but browser providers were empty and no actual screen-reader speech-observation capability was available. No denied navigation was retried through another route. Native 200% zoom and actual screen-reader workflow remain the product's open release gates; the original `ERR_BLOCKED_BY_CLIENT` action and restrictions remain in [NATIVE-ZOOM-GATE.md](NATIVE-ZOOM-GATE.md). This materials correction does not close those gates or complete the active release goal.
