# HCI study materials — blank, not run

Use the [protocol](../../docs/HCI-STUDY-PROTOCOL.md) and its private facilitator answer key only after its approval and fidelity gates pass. Nothing in this directory is recruitment authorization or a completed participant record. The review snapshot is actual **agent/source/screenshot review provenance**, not participant data.

Files:

- `session-manifest.template.json`: freeze approvals, protocol/build/evidence identities and assignment before collection. Null fields are unresolved; they must not be interpreted as approval.
- `task-results.blank.csv`: header only, one eventual row per task attempt.
- `claim-results.blank.csv`: header only, one eventual row per claim judgment. The claim key belongs in analysis, not a participant handout.
- `review-snapshot.json`: inspected source/build hashes and ten images actually opened during the independent review; relative `.repro-runs/` paths refer to local-only evidence.

Copy blank forms into a separately approved private study store, not this repository. Do not write participant answers here or include them in Git/Library handoff. Keep consent/contact mappings separate. Generated synthetic test rows, if later needed to test analysis, require an explicit `synthetic-analysis-test` label and a separate location; never mix them with participant records.

Facilitator opening, subject to human approval: “We are evaluating the evidence presentation, not your ability. Work only with the supplied synthetic cases. You may stop or skip a task. Explain what the evidence supports; uncertainty is an acceptable answer. Do not open personal projects or credentials.” Present only the prompt column from the protocol. During timed work, offer no correctness feedback; log help and protocol deviations. Ask the same retrospective questions after each condition: “What evidence drove your conclusion? What was difficult to locate or interpret? What would you inspect next?”

Field conventions:

| Field | Meaning |
| --- | --- |
| `participant_code` | Random code, never name/email/account ID |
| `condition`, `case_set`, `case_id`, `task_id` | Frozen assignment and exact evidence case; do not infer from task outcome |
| `completion` | independent, assisted, partial, failed, withdrawn or technical-interruption |
| `elapsed_seconds`, `censored` | Measured active time; true when a task did not complete before the fixed limit |
| `understanding_score` | Protocol's six-concept rubric; leave empty until scored, with coder and notes |
| `answer` | yes, no, unsure; blank is missing, not no |
| `support_probability_percent` | 0–100 probability that the exact claim is supported; blank is missing |
| `evidence_reference` | Case/run/trial reference, not a copied personal file path |
| `error_codes` | Semicolon-separated attribution, unsupported-success, mock-boundary, minimality, missing-evidence, navigation, other; pair with factual notes |
| `assistance_count`, `recovery_success` | Observed interventions and recovery result; unknown remains blank |
| `notes`, `deviation` | Task-specific facts, with accidental personal information removed before storage |

Preparation sequence: verify the frozen fixture/expected outcomes; bind real run IDs/digests to case manifests; confirm P/L evidence parity and accessibility; complete the approval fields; freeze assignment/scoring/analysis decisions; only then schedule approved sessions. Existing screenshot UUIDs are examples of actual technical evidence, not reusable participant IDs or fresh run outcomes. No data analysis script or matched comparator is delivered yet.
