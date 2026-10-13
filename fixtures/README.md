# Synthetic training fixtures

These assets are deliberately small synthetic development fixtures, not the Repro product, captured customer sessions, real-site evidence, or generated benchmark results. They use only Node.js 24 built-ins. There are no dependencies, installs, secrets, production calls, or external services. The local demo and HTTP smoke test bind only to `127.0.0.1`.

## Run from the kit root

```sh
node scripts/verify-fixtures.mjs
# Equivalent explicit test paths (works without shell globstar support):
node --test fixtures/search-stale-response/model.test.mjs fixtures/search-stale-response/server.test.mjs

# These independently run the same frozen inputs and oracle:
node fixtures/search-stale-response/check.mjs buggy  # EXPECTED exit 1, target-invariant-failure
node fixtures/search-stale-response/check.mjs fixed  # EXPECTED exit 0, pass
node fixtures/search-stale-response/check.mjs unknown # EXPECTED exit 2, other-error

node fixtures/search-stale-response/demo-server.mjs
# Open http://127.0.0.1:8787 on the same computer; Ctrl-C to stop.
# PORT=0 selects an available local port and prints its URL.
```

Choose Buggy or Fixed and run the race. Both modes issue alpha then beta and receive beta then alpha. The buggy model renders stale alpha results; the fixed model discards the outdated response. Browser timers pace the demonstration; response ordering is explicitly controlled by the synthetic manifest. The demo does not generate actual search API requests.

## Acceptance oracle and approval boundary

`search-stale-response/manifest.json` contains the proposed expected behavior, fabricated response data, exact request/completion order, and human-approval fields. It is honestly labeled **pending-human-approval**. An assistant must not self-approve it or invent a reviewer. A human must review the invariant and input sequence before marking it approved, identifying the reviewer, and recording the review timestamp. To enforce that prerequisite in a subsequent acceptance run:

```sh
node fixtures/search-stale-response/check.mjs fixed --require-human-approval
```

Until approval is supplied, this command intentionally exits 2. Ordinary demonstration tests can run while approval is pending. An approval field in a writable file is not an authenticated approval system; the complete product must establish trusted human approval outside candidate write permissions.

The separate oracle module checks a SHA-256 baseline of expected behavior before checking the invariant. Tests detect an altered expected result and reject unrelated or code-forged errors as evidence of the target bug. The model input is the same for both implementations, and tests verify it is not mutated. The test suite passes only when the buggy subprocess actually fails the intended invariant and the fixed subprocess actually passes. This is an expected-failure regression harness, not a test suite that conceals a currently failing product.

## Scope and limitations

- Implemented: deterministic synthetic state-model replay, intended-failure classification, an oracle-change guard, Node unit tests, localhost HTTP smoke tests, and a manually operable browser demonstration.
- Not implemented: real-browser capture/replay, DOM-driven automation, browser console/network evidence collection, task isolation, approval authentication, immutable external oracle storage, production integrations, or product benchmark evaluation.
- The HTTP test verifies serving and route restrictions, not browser rendering or interaction. No automated browser QA is claimed.
- These integrity guards are demonstrative and do not defend against an agent that can rewrite both the oracle and its tests. A production harness must separate protected specification/tests from candidate implementation permissions and pin input data independently.
- No optimistic-update fixture is included; the search race is the single supported fixture.
