# Independent actual preflight diagnosis

The frozen second plan passed once: **4/4 cases**, **3 actual adapter calls**, **0 browser launches**, **0 listeners**, **0 synthetic target-failure calls**. The command exited 0 in 0.6475 seconds, below its 120-second and 2-MiB combined-log bounds; all 256 log bytes were retained. No product source or original candidate file was edited.

| Removal from the core | Remaining actions | Structural result | Actual adapter/reducer result |
| --- | --- | --- | --- |
| Navigate and its dependent searches | Empty | Valid | `MISSING_STEPS`; inconclusive, minimality unverified |
| Alpha and dependent beta | Navigate | Valid | `MISSING_STEPS`; inconclusive, minimality unverified |
| Beta | Navigate, alpha | Valid | `MISSING_STEPS`; inconclusive, minimality unverified |
| Alpha without deleting beta | Navigate, beta | `ACTION_DEPENDENCY` | Rejected before adapter invocation |

This distinguishes valid dependency closure from the registered adapter's supported experiment. The current adapter requires navigation and both ordered searches before running the fixed beta-then-alpha response schedule. Every valid deletion neighbor is incomplete for that experiment, so no assertion executes. These results do not establish a dependency-closure bug, a fixture defect, or a false reducer acceptance.

Each real raw result has blank `appDigest`, zero assertions, null observation, empty events and `browser: not-launched`, with matching input, assertion, harness, revision, adapter, runner and seed identities. Returned evidence stayed settled after two event-loop barriers. Each unique, regular, single-link `evidence.json` matched its recorded size and SHA-256 and the returned result excluding its artifact index. The reducer retained the exact raw `MISSING_STEPS` cause and run ID while conservatively returning inconclusive. Its existing generic identity-mismatch trial reason is recorded unchanged; wording alone is not treated as a runtime correctness defect.

The oracle is unchanged. Source inspection confirms that wrong request/query state is `WRONG_OBSERVATION`, while empty or unrelated results are `WRONG_FAILURE`. No synthetic observations were passed to it by this runner. The separate schema audit owns the actionable published-contract inconsistency and its red/green regression: an unstarted empty application digest must be representable without allowing conclusive evidence to omit its digest.

The four preserved source hashes matched before and after, including adapter `2727f237d460b98d620d5e2620547305d6d6e4d6e1c3c093f56419b2d475ee60`. Actual harness identity remained `623156fff63bf70c55627e7c7e2a77bcacd521d3b67bc6f4ee629195dc65baba`.

Evidence:

- `PLAN-v2.json`: SHA-256 `83d0aac29c0cb913f4bfdd7bd2c0a1799e2bd14c7b578edb9fb9fc352a2237b6`.
- `run-diagnosis.mjs`: SHA-256 `96e914329d55343408e659c47a02c06c1dff8a594bb5fa1c9c64454b26ce6d16`.
- `execution-v2/summary.json`: SHA-256 `1cbd6710777a4ab20aedaca810665f21c78aa9cc22657c9fc326c4ea6ced96ab`.
- `execution-v2-command.json`: SHA-256 `7fa1e90a44551b468e06975f026da966953929cdc4243561f0af58df4bae0bf1`.
- Complete original results, three raw run records and three indexed evidence files are under `execution-v2/`.

The first plan and first review are retained as unexecuted history and superseded by version 2. No rerun or discarded execution occurred.

For the schema-only patch, complete its independently assigned failing-before/passing-after checks and relevant schema validation; unchanged runtime sources do not by themselves require rebuilding or repeating all earlier runtime checks. Any future release package must include the corrected schema with verified package identities. The previously outstanding current-browser acceptance/repeatability, CLI demo and installed-package browser replay remain blocked/unrun and are not satisfied by these offline checks.

Honest bounded reduction with minimality unverified is permitted by the current release contract. A newly declared, evaluable final neighborhood and its real observations are prerequisites only to a stronger dependency-group 1-minimal claim, not an added mandatory release gate. No resource, permission, authentication or publication action was performed.
