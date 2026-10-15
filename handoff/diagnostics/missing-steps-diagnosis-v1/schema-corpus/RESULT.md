# Independent retained-result schema check

The original schema rejects all 700 retained actual adapter preflight results solely at `/appDigest` with the SHA-256 pattern error. The separate candidate schema accepts the exact same 700 records structurally. All file hashes are unchanged. The corpus contains 600 inconclusive results and 100 cancelled results, including the previously preserved verifier failures. Every record has empty `appDigest`, zero assertions, null observation and browser `not-launched`.

This review imports only the existing Ajv validator and reads saved JSON. It does not call the product adapter or reducer, launch a browser/listener, acquire dependencies or access the network. No result outcome was changed and no browser acceptance or minimality claim follows from schema acceptance.

Original schema SHA256: `046a45c16aab3928673d3cfaa0862b9d40da1c34c7e9fb028207462078b7c57f`. Candidate schema SHA256: `5999f3db272858d4eba9fdf322eb90ea9bd0c12062ac664ec04af5080215e4e9`. Frozen result inventory SHA256: `2aa1ed34a1b603451e1b4b29c81fc2ff93d2805d9fcb8b63244cf2c09a26be50`.

`PLAN.json` froze both reads before execution. `check.mjs` checks every raw result size/hash before validation and after, requires the expected baseline-only pattern errors, and records every validation result. The two command receipts retain exact commands, isolated process environments, log hashes and timing under the 120-second / 2 MiB limits. Both commands exited zero because they matched their declared diagnostic expectations; the schema patch's actual failing-before regression has a separate nonzero test exit in `../schema-patch/red-v2/`.
