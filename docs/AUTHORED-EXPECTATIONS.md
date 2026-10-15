# Declare expected behavior

Before recording, a developer can declare the search order and expected observation for the registered synthetic search app. The CLI accepts a JSON declaration; the workbench offers **Specify expected behavior** before capture. Every expected field must be supplied. Missing fields, unknown fields, unsupported values and contradictions are rejected instead of silently corrected.

The supported vocabulary is deliberately bounded: two distinct searches, `alpha` and `beta`, in either order, and their registered synthetic result strings. This is executable expected-behavior input for one registered application. Arbitrary assertion JavaScript, free-form requirements, other applications and production data are unsupported.

## CLI

Use the checked-in [reversed-search declaration](examples/search-beta-alpha.json):

```sh
# Intended target failure: exit 1, with stale Beta results for the latest alpha query.
npm run repro -- record --consent --experiment docs/examples/search-beta-alpha.json --output .repro-runs/authored-record
npm run repro -- reduce --manifest .repro-runs/authored-record/manifest.json --budget 50 --output .repro-runs/authored-reduction
npm run repro -- verify --manifest .repro-runs/authored-reduction/reduced.manifest.json --output .repro-runs/authored-comparison
npm run repro -- export --manifest .repro-runs/authored-reduction/reduced.manifest.json --output .repro-runs/authored-capsule
npm run repro -- inspect --capsule .repro-runs/authored-capsule
```

Each output must be a new directory. `--experiment` is a record-only option and cannot be combined with `--manifest` or `--capsule`. Input must be a regular single-link JSON file of at most 64 KiB. The default record command continues to use the original supplied experiment.

## Workbench

Select **Specify expected behavior**, choose the two-search order, expected latest query and expected visible result, then consent and start capture. Choices begin empty. An inconsistent declaration displays an explanation and disables capture. The selected run's frozen expectation shows the declaration and its provenance; expanded identity details include the scenario and registered contract digest. A different declaration starts a new session. Selecting an earlier job restores its saved input, including its original action count, even after reduction.

## Frozen identity and provenance

Schema 2 records caller-supplied input and the identity of the registered latest-response rule. `independent-contract` means the declaration was mechanically checked against that rule and its known query/result mapping. It does not mean a human approved the requirement or independently reviewed its author. `humanApproval` remains `not-claimed`. An explicitly `proposed-unconfirmed` basis remains INCONCLUSIVE.

The assertion digest includes the registered rule, frozen search order, expected observation and exact stale observation. Removing actions cannot redefine those values. Comparison uses separate buggy and fixed executions with the same assertion and harness. Wrong observations, missing actions and timeouts remain INCONCLUSIVE. The exported conventional Node test checks actual observations and executed assertions.

Schema 1 retains its exact original structure and assertion digest. Historical manifests remain readable. Executable capsule validation still requires the trusted runner build that created the capsule; this change does not promise execution compatibility across builds. Keep earlier exported capsules with their documented runtime and evidence.
