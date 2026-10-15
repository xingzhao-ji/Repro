# Developer-supplied search expectations

The release audit found that the published synthetic candidate has one global beta expectation. GOAL.md requires a developer to supply expected behavior. This increment implements that operation within the existing registered trusted search application. The user has authorized autonomous implementation and ordinary design decisions; this document records the chosen design, not human review of it.

The intent is to supply a concrete observable expectation before capture, reproduce and reduce a failure without changing that expectation, then compare the registered fixed revision and export the same test. Existing default experiments and their assertion identity remain intact. Arbitrary assertion code, websites, credentials, production data and generic adapters are outside this change.

## Chosen contract

A new `record --experiment FILE` option and optional `experiment` field on POST /api/sessions accept a bounded JSON declaration:

```json
{
  "searchOrder": ["beta", "alpha"],
  "expectation": {
    "invariantId": "LATEST_SEARCH_RESPONSE_WINS",
    "latestRequestId": 2,
    "latestQuery": "alpha",
    "expectedResults": ["Alpha synthetic result"]
  },
  "expectationBasis": "independent-contract"
}
```

Only two distinct registered queries in either order and their known result strings are allowed. The caller must provide all expected-observation fields. Missing or contradictory fields are rejected, never silently corrected. The workbench exposes this declaration as labeled controls before capture. It retains the default supplied experiment as an explicit option. Changing a declaration starts a new session; earlier session and job manifests remain immutable.

Schema 1 keeps its exact supplied expectation, provenance and digest rules. Schema 2 adds a frozen `scenario.searchOrder` and `expectationSource` with kind `caller-supplied`, contractId `registered-search-latest-response-v1`, and the digest of the registered contract. Its basis is `independent-contract` or `proposed-unconfirmed`; humanApproval stays `not-claimed`. The independent basis means the declaration was mechanically checked against the registered rule and query/result mapping, not human approval, independently reviewed authorship or real-user feedback. An unconfirmed proposal remains INCONCLUSIVE even if structurally valid.

A discriminated ManifestV1/ManifestV2 union preserves exact schema-specific validation. The v2 assertion digest is domain-separated and covers the registered rule, frozen scenario, expected observation and exact intended stale observation. The scenario is independent of reducible actions. Removing actions must never change the scenario, expected result, response schedule or assertion digest. Unknown fields, mismatched hashes and inconsistent expected observations fail closed.

## Execution and evidence

One search-contract module derives the declared request-ID/query allowlist, response schedule (request 2 before 1), expected observation and exact stale observation. The adapter executes the same known buggy/fixed code with fresh browser state. Request IDs follow action execution order, not the literal query name. An incomplete candidate remains INCONCLUSIVE. Other errors, empty output or a different result cannot count as the intended failure.

The reducer, verifier, selected-job inspector and exported conventional test use that frozen contract. The conventional test explicitly checks distinct executions, assertion and harness identity, actual buggy/fixed observations and unchanged manifest identity. Altering an existing capsule invalidates integrity; an explicitly new declaration creates a new experiment. The ledger rejects attempts to change the session's frozen assertion/scenario through its reduction update path.

Default v1 manifests retain their assertion identity and historical readers continue to understand them. Exact executable validation still rejects capsules built by a different runner build; this is existing behavior, not binary compatibility promised by this change. New exports need fresh package and Linux validation because executable payload changes.

## Alternatives

A confirmation checkbox or editable prose would not implement caller-specified executable behavior. Arbitrary assertion JavaScript would expand execution/privacy boundaries unnecessarily. Data-only declarations checked against the already registered rule provide the required first slice with explicit limits.

## Evidence required

Tests must first fail for missing support, then pass for both query orders, distinct frozen identities, invalid/missing expectation fields, changed source/digest, incomplete reduction candidates, provisional provenance, attempts to rewrite session expectations, exact dynamic network routes, and readable exported tests. A keyboard browser workflow must supply the reversed expectation, capture, reduce, verify, export, inspect earlier records and preserve the declaration after refresh. Existing unit/browser regressions remain passing. New final package and Linux samples must use actual v2 payloads; historical v1 results remain labeled historical. Native zoom and actual screen-reader restrictions stay separate.
