# Frozen synthetic inspection conditions

Design and plan, 2026-10-15: generate research-only offline P/L inspection pages from an explicit hash-pinned selection of actual release-15a8225 synthetic run files. P groups evidence under Establish failure, Reduce steps and Check fix with disclosures; L is a conventional searchable sectioned report. One canonical fact inventory supplies identical evidence text, source references and uncertainty to both. Each condition has identical record selection, search, provenance and unavailable-record recovery. Neither runs the product or collects answers, timings or participant records.

Implementation sequence: (1) observe failing identity/parity tests; (2) implement bounded explicit file loading and independent cross-file checks without product imports; (3) render both conditions; (4) run meaningful unit mutation checks and a short keyboard/browser parity rehearsal; (5) inspect screenshots and record exact results. No product runtime, package scripts, dependency or analysis-test input changes are needed.

`fidelity-projection-15a8225.json` is a portable, allowlisted research fixture: full manifests, required identity/observation fields, trial decisions and two typed response-completion messages. It excludes traces, artifact inventories, absolute paths, free-form event streams and timing measurements. Unit/browser tests use it without ignored-data prerequisites. Its source-index digest identifies the recorded origin; independent raw-source-to-projection equality is separately observed, not inferred from that digest.

The source index selects the actual record, completed reduction, verification, export and cancelled reduction from one existing UI session. Only indexed JSON files are copied into ignored `.repro-runs/hci-fidelity/source/`; no ledger is reopened. Every file is limited to 1 MiB, the collection to 64 files, and paths are simple relative file names. Source hashes establish file identity, not author trust. The complete generated case must match frozen canonical SHA-256 `7aa12eb57804c1a9d9ee5e452e543e61a6bba9e740bfbc19d4eba60c38466c07` at both compilation and rendering boundaries. This includes all facts, full manifest text, record metadata and source inventory/provenance. Arbitrary case authoring/rendering is unsupported; changing the observed case requires a separately reviewed source/projection freeze. This single-case seal rejects unknown rendered scalars or private paths uniformly, in addition to bounded reads and actionable semantic checks. The seal identifies the audited model; it does not authenticate the original author or establish correctness by itself.

The compiler independently checks manifest/run/claim association, conclusive observations, two distinct accepted-trial executions, unchanged comparison harness/assertion and historical record boundaries. Inconclusive trial identities remain recorded uncertainty, never proof of necessity. No raw event messages, machine paths or trace archives are rendered.

The selected export has no associated clean-environment replay evidence. A different CLI demo's Linux success must not be attributed to it. The cancelled reduction did not establish its baseline. Minimality is unverified. Expectation basis is the supplied synthetic specification, with human approval not claimed. The case represents one synthetic family; neither additional IDs nor conditions provide independent bugs or people.

Run from the repository root with the existing Node/tsx tooling:

```
node_modules/.bin/tsx scripts/hci-fidelity.ts --projection --output .repro-runs/hci-fidelity/projected-UNIQUE
# Local original-source verification requires the retained indexed files, not supplied by Git:
node_modules/.bin/tsx scripts/hci-fidelity.ts --source .repro-runs/hci-fidelity/source --output .repro-runs/hci-fidelity/generated-UNIQUE
node_modules/.bin/tsx --test tests/hci-fidelity.test.ts
PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers node_modules/.bin/tsx --test tests/hci-fidelity.browser.ts
```

For original-source acquisition, copy only the 27 files explicitly named in `fidelity-source-15a8225.json` from their repository-relative `provenance` locations to the simple destination `file` names. This is a local retained-evidence operation; there is no raw evidence download or broad directory scan. Missing originals block only raw provenance re-verification. The portable projection path remains available with its separate scope.

Outputs require a new task-owned directory, are finalized by directory rename and include P.html, L.html, case.json and hashes.json. Both pages are self-contained and use no external assets, telemetry, storage or network. Source file paths in the index are relative provenance, not links to machine files. Search changes visibility only; full evidence remains accessible. Hash navigation retains exact selected records across reload/back/forward; unknown IDs show explicit INCONCLUSIVE and a return link. P is a research adaptation, not a claim that the live shipped workbench is frozen unchanged. The different grouping/disclosure is the intended treatment; underlying labels, facts, limitations and glossary are shared.

Browser evidence covers the tested keyboard, parity, focus, search, reflow and Axe samples only. Native 200% zoom and actual screen-reader operation remain separate unverified gates. Human approval, participant recruitment/data, two independent reviewers, broader task families and a frozen human-study protocol remain outstanding. Technical rehearsal is not a human study, interface-benefit measurement or WCAG certification. Existing analysis arithmetic fixtures remain unchanged and are not populated with fabricated rehearsal answers.
