# Offline analysis instrument evidence

The [analyzer](../scripts/analyze-hci.ts) now validates and summarizes explicitly labeled nonparticipant synthetic test data. It preserves scheduled-but-absent answers, blank answers, unsure responses and orphan probabilities; uses explicit denominators and null for zero denominators; computes calibration and equally weighted per-unit P−L differences; and separates administrative timeouts from earlier withdrawal, interruption and incomplete work. [Contract and exact command](../research/hci/ANALYSIS-CONTRACT.md).

## Executed verification

- **73/73 independently authored instrument regressions passed**, including actual CLI output, malformed inputs, no-overwrite behavior and the hand-calculated six-claim Brier score 0.285 (floating-point output 0.2850000000000001).
- Final project typecheck, lint and **174/174 unit/contract tests passed**, with zero failures, skips or cancellations. [Receipts](../.repro-runs/hci-analysis/final-checks-strict/) and [portable summary](hci-analysis-summary.json).
- [Final independent record](../.repro-runs/hci-analysis/verification-final.json) binds script, contract, fixture, tests and logs. The [standalone CLI report](../.repro-runs/hci-analysis/verified-final-calibration-report.json) uses canonical input identity `c43225376e6cd472ccc1779ef5e016439ae554263045730f702bb07f06a1ac5c`.
- Initial implementation, strict-input and UTF-8 diagnostic failures are retained alongside the passing snapshots. The strict-input fix command was submitted while its red run was being prepared; the record proves failing/passing snapshots, not stricter write ordering. Tests were authored independently but share a filesystem; no access-isolated holdout is claimed.

The four-file instrument inventory aggregate is `ecb18f0620aee7da7514b4abc991561e34e8c7a422c8f93d16d7582143fb5c6b`. All 81 files in the [prior runtime inventory](../.repro-runs/hci-increment/final-capsule-equivalence-e12c8561a6ee/final-content-hashes.json) still match. No app, browser, capsule, VM, security policy, dependency or package configuration changed. The inspector's 29-browser and actual Linux evidence remains scoped to those unchanged bytes; no new browser or VM execution is implied. [Inspector evidence](HCI-INSPECTOR.md).

## Boundaries and next criterion

This delivers tested arithmetic and bookkeeping, not a human-study analysis or evidence of interface effectiveness. The scope label does not authenticate input origin. No participant data was collected, imported or published. Inferential uncertainty intervals, comprehension coding, experience effects, human-data forms/import and approved study execution remain unfinished.

The next unblocked R10 engineering criterion is a matched conventional evidence comparator and frozen-condition fidelity. Both conditions must expose the same precomputed real synthetic evidence; a live P runner versus static L would be unfair. Native zoom remains separately gated, actual screen-reader usability and human evaluation unrun. Existing permissions and privacy boundaries remain unchanged.
