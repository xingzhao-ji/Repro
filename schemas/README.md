# Repro file-format contracts

The JSON Schema draft 2020-12 contracts describe the synthetic and registered public repository cases in [contracts.ts](../src/contracts.ts):

| Schema | Value described |
| --- | --- |
| [manifest-v1.schema.json](manifest-v1.schema.json) | The `Manifest` saved as `manifest.json`, including numeric `schemaVersion: 1`, the frozen supplied expectation and supported actions. |
| [manifest-v2.schema.json](manifest-v2.schema.json) | Schema 2 caller-supplied latest-search declarations, with frozen scenario and registered-contract provenance. |
| [manifest-v3.schema.json](manifest-v3.schema.json) | Schema 3 registered public repository cases, including pinned commit/source identity, explicit DOM checks, normative contract URLs and bounded action subsets. |
| [run-result-v1.schema.json](run-result-v1.schema.json) | The retained synthetic-only `RunResult` contract. |
| [run-result-v2.schema.json](run-result-v2.schema.json) | The current `RunResult` union: synthetic observations or registered browser-case value projections. The value has no `schemaVersion` property; the filename identifies this contract revision. |

CLI commands usually print an `{ output, result }` envelope. Validate the inner run result, not that envelope. Reduction, verification and export return distinct result types, not a single `RunResult`. Schemas reject unknown properties and unsupported registered versions. Updating the implementation contract requires an explicit schema update; old values are not silently migrated.

The schemas use only references within their own files. Their `.invalid` identifiers are identifiers, not hosted endpoints. Do not fetch arbitrary remote `$ref` values supplied by an untrusted capsule. [schema.test.ts](../tests/schema.test.ts) and [case-schema.test.ts](../tests/case-schema.test.ts) compile the contracts strictly offline, compare field inventories against TypeScript interfaces, and exercise valid and invalid structural cases. Their constructed run values are test inputs, not browser-execution evidence.

[validateManifest](../src/manifest.ts) is the authoritative semantic validator. JSON Schema acceptance is neither execution authorization nor proof of a valid reproduction. Runtime validation additionally enforces:

- Canonical JSON limits, the 64 KiB manifest limit, safe object normalization and a valid calendar timestamp.
- Unique action IDs and dependencies naming distinct earlier actions, including prerequisite consistency.
- Actual trusted assertion, fixture and implementation identities, rather than the shape of a hash string.
- Execution preconditions: the runner supports a narrower set of viewport sizes and action sequences than the structurally representable manifest subsets.
- An executed, unchanged assertion and the frozen semantic oracle. Nonzero assertion counts and matching hash strings alone cannot establish either fact.
- Actual artifact bytes, hashes, allowlisted paths, link restrictions and complete capsule contents through [importCapsule](../src/capsule.ts).

Cancelled or inconclusive results can correctly contain zero assertions, a null observation and an empty harness digest. The current result schema also permits an empty app digest when cancellation or setup failure occurs before source loading. Conclusive result shapes require an assertion count, observation, app digest and harness identity, but their semantic truth still depends on independent verification. No human approval is claimed by these contracts.

The original [capsule.schema.json](capsule.schema.json) and [run-result.schema.json](run-result.schema.json) are **non-normative starter drafts**, retained unchanged for provenance. They describe an earlier proposed format (including string version `0.1.0`, `capsuleId` and `oracle` fields), not the implemented v1 contract. They must not be used to validate current exports. The dependency-free fixture and illustrative design JSON also use their own smaller formats; they are not completed product capsules.

Schema 2 accepts only the two distinct synthetic queries in either order. Its `independent-contract` basis means the explicit declaration was mechanically checked against the registered latest-response rule and result mapping; it does not claim independent review, authenticated authorship or human approval. `proposed-unconfirmed` remains INCONCLUSIVE. Runtime validation additionally checks scenario/expectation/response consistency, the registered contract digest and the domain-separated assertion digest. Reducible actions are separate from the frozen scenario. Schema 1 retains its exact supplied assertion identity; old executable bundles still require their matching trusted runner build.

Schema 3 describes a constrained browser workflow over registered public source.
The source repository, full commit, compiled/source digest, expected DOM values,
normative contract URLs, action sequence and dependencies are checked against
the installed declaration by [validateCaseManifest](../src/browser-case.ts).
The schema describes their structure; it does not make a caller-supplied source,
selector, expected value or URL trusted. Unknown fields are rejected, including
undeclared credential fields, but JSON Schema is not a secret-redaction system.

Browser-case observations contain only `kind: "browser-case"` and an ordered
string-value projection. The result schema bounds that shape without encoding
case-specific passing or failing values. The independent runtime evaluator must
still match the complete registered expected or intended-failure vector;
unrelated values, incomplete actions and missing dependencies cannot establish
the target failure merely by validating as JSON. Accessibility remains deferred
and unverified; none of these format checks changes that scope.
