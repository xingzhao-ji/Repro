# Offline HCI analysis instrument

This instrument tests arithmetic and bookkeeping on explicitly declared **nonparticipant synthetic analysis-test inputs**. No participant sessions were conducted. Passing its tests is not evidence of human understanding, interface effectiveness, research validity or a completed comparative study. The declaration `synthetic-analysis-test` and a content digest do not authenticate the origin of supplied data. The script has no human-data mode and does not authorize collection or use of participant records.

Run with the repository's installed TypeScript tooling; no new dependency or product service is required:

```sh
./node_modules/.bin/tsx scripts/analyze-hci.ts \
  --input research/hci/synthetic-analysis-test/calibration.json \
  --output .repro-runs/hci-analysis/local-check/summary.json
```

The output must be a new file under the repository's ignored `.repro-runs/hci-analysis/` directory. Existing files are not overwritten. Validation precedes output creation; reports are finalized atomically. Input reads are explicit, bounded to 8 MiB, and require a single-link ordinary file. Output ancestors must be ordinary directories. These checks assume the existing trusted local workspace; they are not a sandbox for concurrent hostile filesystem modification. Malformed encoding, JSON and schema values are input errors (exit 2); filesystem/environment failures use exit 1. Diagnostics omit input values and raw error causes; wrapped causes remain attached privately to the Error object. No browser, app, VM, network, telemetry or participant-data store is used.

## Public input

`scripts/analyze-hci.ts` exports the TypeScript interfaces and import-safe `analyzeHci(input: unknown): HciAnalysisReport`. Version 1 requires every declared field and rejects unknown fields, invalid types, duplicate identities, conflicting references and unsupported schema/classification values. Raw CLI JSON also rejects duplicate object fields. Null is allowed only where the interface explicitly allows it; empty strings are not missing values.

- `schemaVersion: 1`, `classification: "synthetic-analysis-test"`, `protocolVersion`, `keyVersion` declare the instrument version and frozen scoring context.
- `units` contains synthetic analysis units. Each unit has one or two planned blocks with distinct block IDs, conditions P/L, orders 1/2 and case sets A/B. An omitted condition and a scheduled but wholly unanswered condition remain distinct in the block inventory.
- Each block identifies its case and schedules tasks and claims. Tasks carry an explicit positive `limitSeconds` and module `inspection` or `formative-workflow`. Inspection fixture limits follow the protocol's proposed 240 seconds; the engine does not invent or replace the frozen limit. Limits may not exceed 86,400 seconds.
- Scheduled claims identify an inspection task, claim ID, case-bound key and unique positive integer presentation order. Claim keys contain Boolean `supported` truth; each key ID and case/claim pair is unique. The engine checks identity consistency, not the substantive correctness of the supplied key or case evidence. Keys must be frozen independently before outcomes are collected.
- `claimObservations` and `taskObservations` reference exact unit/block/slot identities. An absent observation is missing scheduled data. Observations cannot introduce unscheduled items. Version 1 accepts one scored observation per slot and one instance of a task or claim ID per block; it never picks the best retry.

Identifiers are 1–128 ASCII letters, digits, dots, underscores, colons or hyphens, beginning with a letter or digit. The limit is 1,000 units, two blocks per unit, 1,000 tasks and 1,000 claims per block, and 100,000 scheduled slots in total. Numeric observations must be finite numbers within their declared ranges; numeric strings, NaN and infinities are rejected. Direct function inputs require ordinary data objects and dense arrays without accessor/extra properties. Empty unit/key/observation arrays are permitted and produce empty/null summaries, not success measurements.

## Claim calculations

Answers are `yes`, `no`, `unsure` or null. Probabilities are numbers from 0 through 100 or null. Categorical/probability disagreement, such as yes with 20%, is preserved.

For every unit/condition and descriptive item group, report scheduled and observed counts, absent rows, explicit blank answers, total missing answers and missing probabilities. Missing probabilities include absent scheduled rows. Probability without a categorical answer is counted separately. Supported and unsupported groups each report yes/no/unsure/missing and an answered denominator.

- False acceptance: unsupported yes / answered unsupported.
- False rejection: supported no / answered supported.
- Supported withheld: supported unsure / answered supported.
- Supported acceptance: supported yes / answered supported.

Answered means yes + no + unsure. Missing answers do not enter a categorical denominator. Every zero denominator gives null, never zero. No single success score rewards an all-no strategy.

Brier is mean `(p − y)^2`, where `p = supportProbabilityPercent / 100` and `y` is the case-bound Boolean key represented as 0/1. Eligibility requires both a categorical answer and probability; unsure with a probability contributes. Orphan probabilities are excluded, with their counts retained. `brier.eligible` is a separate denominator.

For binary responses, judgment confidence is the stated percentage for yes and 100 minus that percentage for no. Its correct/incorrect groups exclude unsure. Unsure support probabilities have a separate descriptive summary. Support-probability frequency tables preserve all supplied probabilities, including orphans, grouped both by supported/unsupported key and by yes/no/unsure/blank answer. Confidence outputs use percentages; Brier uses unit probabilities.

## Unit-level pairing and descriptive output

Each unit has at most one P block and one L block. Compute unit/condition rates before aggregating. `byCondition` reports mean, median, range and eligible unit counts for each metric; unequal claim counts do not give a unit more weight. `byItem` retains case/claim identity and presents descriptive response counts/rates. `byBlockOrder` retains condition and order, allowing first-block inspection. None treats repeated claims as independent people.

For each metric, `paired` contains individual `P − L` differences, paired count, descriptive mean/median/range and explicit unpaired reasons. Pair eligibility requires nonnull values in both conditions for that metric. `missing-P`, `missing-L` and `missing-both` refer to unavailable metric values; inspect the block inventory to distinguish an absent planned condition from zero eligible answers. No denominator is borrowed from another metric.

The report identifies `scope: "offline-instrument-test"` and repeats its provenance limitation. `inputSha256` hashes UTF-8 canonical JSON: recursively lexically sorted object keys, original array order, no whitespace. It identifies validated input content, not raw file formatting, trusted authorship or human data provenance. The pure function and CLI use the same digest. No dates or paths enter the digest. Reports are deterministic for a given input.

## Timing and incomplete work

Completion and ending reason must agree:

| Completion | Ending reason | `censored` |
| --- | --- | --- |
| independent or assisted | completed | false |
| partial or failed | time-limit | true |
| partial or failed | stopped-incomplete | false |
| withdrawn | withdrawn | false |
| technical-interruption | technical-interruption | false |

Here `censored` specifically means administrative timeout, not a survival-model assertion about other endings. A timeout requires elapsed time exactly equal to the frozen limit. Earlier withdrawal, technical interruption and incomplete stopping retain measured active time; they are never rewritten to the timeout or treated as completion. A stopped-incomplete measured time must precede the limit. Missing elapsed time is allowed except for time-limit observations and is explicitly counted.

Task summaries separate inspection from formative workflow. `completedTime` includes only independent/assisted completions with measured time and is explicitly a completed-only descriptive statistic. `activeTime` includes measured time for all endings and is not completion time. Ending counts, administrative censor/timeout counts and per-slot records keep incomplete and missing work visible. First-correct-evidence times must fit measured task time; absent times remain missing. Recovery event time requires observed recovery success and must fit task time; success with missing time remains allowed, and recovery failure/unknown counts stay visible. No missing time becomes zero. No survival estimator or speed-benefit conclusion is supplied.

## Existing blank forms and remaining work

The CSV forms remain preparation materials; this instrument does not import them. Their single condition/case columns can map to block metadata, but the session template does not yet represent both assigned blocks. A separate frozen expected-slot schedule is required to distinguish omitted rows from unassigned items. The forms also need block/attempt identity and explicit ending reason; the existing `censored` description needs reconciliation with this narrower administrative-timeout convention before human use.

`understanding_score` does not preserve six separate concept scores, coder identity per score or two independent coding passes. Coding agreement, adjudication, experience effects, error/help/navigation measures and a human-data storage workflow are not implemented here. Preregistered uncertainty intervals, exclusions, stopping rules, confirmatory power, task-family validity, comparator parity and human study approvals remain separate unfinished work. No p-values, inferential intervals or interface-effectiveness decisions are generated.

The independent regression author and instrument author share a filesystem. Tests are independently authored engineering regressions, not an access-isolated holdout. Synthetic inputs verify the instrument only; they are not fabricated participant observations or evidence that the study hypothesis holds.
