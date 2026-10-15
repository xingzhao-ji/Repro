# HCI study materials and synthetic analysis instrument

Materials version **2**, protocol **0.2**. These are blank preparation materials, not a frozen study assignment, recruitment authorization or participant records. Use the [protocol](../../docs/HCI-STUDY-PROTOCOL.md) and its facilitator-only answer key after its approval and fidelity gates pass. The review snapshot records agent/source/screenshot review, not participant evidence.

## Files and preparation

| File | Purpose |
| --- | --- |
| `session-manifest.template.json` | Unresolved approvals and identities; two ordered, unassigned block placeholders; references and hashes for frozen schedules, keys and coding plan. |
| `task-schedule.blank.csv` | Header only. One eventual row per assigned task slot, including module, presentation order and time limit. |
| `claim-schedule.blank.csv` | Header only. One eventual row per assigned claim slot, linked to its inspection task and private case-bound key. |
| `task-results.blank.csv` | Header only. One eventual row per task attempt, retaining ending reason and missing measurements. |
| `claim-results.blank.csv` | Header only. One eventual final judgment per claim slot per associated task attempt. |
| `understanding-codes.blank.csv` | Header only. Separate concept-level judgments for each independent coder/pass. |
| `understanding-adjudications.blank.csv` | Header only. Later resolutions linked to original coding rows; never replacements for them. |
| `ANALYSIS-CONTRACT.md` | Implemented synthetic-only analysis command, field correspondence and limits; no CSV importer. |
| `synthetic-analysis-test/calibration.json` | Nonparticipant arithmetic fixture, not a study record. |
| `review-snapshot.json` | Source/build hashes and ten images opened during independent review; `.repro-runs/` references are local-only evidence. |

Copy blank forms into a separately approved private study store, not this repository. Do not write participant answers here or include them in Git/Library handoff. Keep consent/contact mappings separate. Never mix the nonparticipant arithmetic fixture or generated instrument outputs with participant records. Null approval, identity or configuration fields remain unresolved; two block placeholders do not mean two blocks were assigned or conducted.

Before any authorized session, freeze the case/build/key identities, the actual block assignment, both expected-slot schedules and the coding plan. Set `materials_version` to `2` in each row. Store SHA-256 of each referenced file's exact bytes in the manifest, including protocol and private scoring key; preserve the original frozen files if later amended. Build and case digests bind the actual artifacts. `sequence` must agree with block order/condition/case-set, using a protocol sequence. Leave the manifest `not-run` until actual execution; no supplied field is evidence that approval or collection occurred.

Each participant manifest has two assigned comparative blocks with distinct `blockId`, orders 1/2, conditions P/L and case sets A/B. A planned one-block formative session may omit the second placeholder with the protocol deviation recorded before collection. Bind each block to its exact case manifest, source commit, assertion/harness and run IDs. The case manifest must resolve every inspected record, including its historical input, rather than substituting the current product capsule. A/B remain planning labels: the existing single failure family does not supply independent matched cases.

## Identity, schedules and attempts

Identifiers use 1–128 ASCII letters, digits, dots, underscores, colons or hyphens, starting with a letter or digit. `participant_code` is random, never a name/email/account ID. Each participant has one manifest in the frozen analysis cohort. Repeat sessions require a separately frozen handling rule; never silently merge or choose the better session.

- Task schedule identity: `(participant_code, block_id, task_slot_id)`. A block has unique task IDs and positive integer task orders. `module` is `inspection` or `formative-workflow`; `limit_seconds` is positive and frozen before outcomes (proposed inspection limit: 240). Task order is not an attempt number.
- Claim schedule identity: `(participant_code, block_id, claim_slot_id)`. Each claim references an assigned inspection `task_slot_id`, unique claim ID and positive integer claim order within the block. `key_id` resolves to the privately frozen case/claim truth. Keys and answer-key text are not participant handouts.
- Observation identity adds `attempt_number`, a positive integer beginning at 1 for each task slot. A claim's attempt number refers to its associated task attempt; each claim has at most one final judgment in that attempt. Keep original and retry rows separately. Log deviations and any timing pauses; never overwrite a failed or interrupted first attempt with a retry.
- The materials' proposed analysis policy is `first-attempt-per-slot`, to be approved/frozen before collection. Task attempt 1 and its claim judgments are the analysis observations. Later attempts remain visible as recovery/practice records; a missing first-attempt row stays missing, even if a later attempt exists. Do not choose the fastest, best or last attempt.
- Freeze the full expected schedule independently of observed rows. A scheduled slot with no observation is missing; an unscheduled slot is unassigned. Do not generate the schedule from answered items or add a slot after seeing its outcome. Retain skips/withdrawals and their reasons; a blank measurement or answer is not zero, false or no.

The frozen static P/L comparison supports T2–T6 inspection as scoped in protocol 0.2. T1 and the live extensions T5F/T6F use distinct task IDs. Live capture, cancellation, reconnection and artifact-opening extensions belong in a separately identified formative module and do not enter comparative inspection timing. Do not apply the historical alpha→beta key to a different authored experiment.

## Measurement conventions

| Field | Meaning |
| --- | --- |
| `completion` | `independent`, `assisted`, `partial`, `failed`, `withdrawn` or `technical-interruption`; based on the frozen task key. |
| `elapsed_seconds` | Measured active task time, excluding explicitly logged pauses; blank means missing. Record the actual value rather than imputing a limit. |
| `ending_reason`, `censored` | Use the table below. Here censoring means administrative timeout only, not every noncompletion or a statistical survival-model claim. |
| `time_to_first_correct_evidence_seconds` | Time to the first evidence meeting the frozen key, if observed; cannot exceed measured active time. |
| `answer` | `yes`, `no`, `unsure`; blank is missing, not `no`. |
| `support_probability_percent` | 0–100 probability that the exact claim is supported; blank is missing. Preserve disagreement with the categorical answer. |
| `evidence_reference`, `response_reference` | Case/run/trial or private response-packet identifier, not copied personal paths. A response packet binds the original task/claim slot and attempt identities. |
| `error_codes` | Semicolon-separated `attribution`, `unsupported-success`, `mock-boundary`, `minimality`, `missing-evidence`, `navigation`, `other`; pair with factual notes. |
| Interaction counts | Nonnegative observed navigation/disclosure/search/assistance counts. Unknown remains blank. Freeze event-count definitions consistently for P/L before collection. |
| `recovery_success`, `recovery_seconds` | `true`, `false` or blank unknown; time requires observed success and must fit task time. Failure is not a zero-time success. |
| `missing_reason`, `notes`, `deviation` | Task-specific factual context; distinguish skipped/unobserved measures and deviations, removing accidental personal information before storage. |

| Completion | Ending reason | `censored` | Time handling |
| --- | --- | --- | --- |
| independent or assisted | completed | false | Actual measured active time. |
| partial or failed | time-limit | true | Exactly the frozen task limit; never label this a completion. |
| partial or failed | stopped-incomplete | false | Actual measured active time before the limit. |
| withdrawn | withdrawn | false | Actual measured active time, if available. |
| technical-interruption | technical-interruption | false | Actual measured active time, if available; preserve fault separately. |

Use lowercase `true`/`false` for CSV Boolean values and an empty cell for a permitted missing value. All elapsed/event times must be within the frozen limit. Missing time is allowed except for a timeout; do not invent precision. RFC 4180 quoting preserves commas/newlines in notes. These are documentation conventions, not an implemented form validator.

## Independent understanding coding

Freeze a coding plan naming the subset selected for double coding, coder codes/pass IDs, response-packet construction and task-to-concept coverage before looking at scores. Each coding unit is a participant/block/concept, based on its designated original-attempt response packet. Freeze the same packet for both coders; remove condition identity where feasible and keep its private mapping separate. Do not give one coder an adjudicated score or the other's work before independent scoring.

| `concept_id` | Concept |
| --- | --- |
| U1 | Expected versus observed behavior. |
| U2 | Input order versus response order. |
| U3 | Real frontend versus mocked dependency boundary. |
| U4 | Failure-preserving reduction versus necessity/minimality. |
| U5 | Same-assertion bounded comparison. |
| U6 | Selected-run identity versus export/portability. |

Use `score` 0 = incorrect/absent concept in an available response, 1 = correct partial, 2 = correct with linked evidence. An unavailable response or unperformed coding pass is missing, not a 0; preserve the reason. Each `coding_id` identifies one immutable row; `(participant_code, block_id, concept_id, coder_code, coding_pass_id)` must be unique. Keep a separate rationale and source reference for each score. A second independent pass requires a different coder; duplicate passes by one coder are not independent agreement.

Calculate/report agreement from the original independent rows before adjudication. Each later `adjudication_id` links the applicable original `coding_ids` (semicolon-separated), same unit and response packet, adjudicator, rationale and resolved score. Preserve both original disagreements and missing scores. The sheets can record this process; no agreement calculator, adjudication engine or human-data importer is implemented.

## Facilitation and remaining preparation

Facilitator opening, subject to human approval: “We are evaluating the evidence presentation, not your ability. Work only with the supplied synthetic cases. You may stop or skip a task. Explain what the evidence supports; uncertainty is an acceptable answer. Do not open personal projects or credentials.” Present only the protocol prompt column. During timed work, offer no correctness feedback; log help and deviations. Ask the same retrospective questions after each condition: “What evidence drove your conclusion? What was difficult to locate or interpret? What would you inspect next?”

Verify real case/run identities and expected outcomes; confirm P/L evidence parity and accessibility; complete approvals; freeze assignment, scoring and analysis decisions; only then schedule approved sessions. Existing screenshot UUIDs are technical evidence, not participant IDs or fresh outcomes. The [bounded P/L adaptation](FIDELITY-CONTRACT.md) and synthetic analysis instrument are delivered. Full study freezing, broader task equivalence, actual native zoom/screen-reader checks, human study approval and human-data analysis remain pending. See [ANALYSIS-CONTRACT.md](ANALYSIS-CONTRACT.md) for the exact supported arithmetic and mapping limits. Version 1 forms remain in Git history; do not relabel an old incomplete record as version 2 without preserving what is unknown.
