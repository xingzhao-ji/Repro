# Local files excluded from the handoff commit

This inventory records original ignored paths in the Repro checkout. All originals remain in place. It does not delete, discard, rewrite or unignore evidence. Counts are filesystem metadata, not new verification results; no product code, tests, benchmarks, browsers or containers ran for this inventory.

The exact repository-relative subtree paths, counts, useful report/seal paths, selected archival files and SHA256 values are in [excluded-local-inventory.json](excluded-local-inventory.json). Counts use logical regular-file bytes, do not follow symlinks and exclude directory entries. Nested rows overlap and must not be summed. The capture time is recorded in JSON; later local handoff logs can grow afterward.

| Original excluded root | Regular files | Logical bytes | Symlinks | Other entries |
| --- | ---: | ---: | ---: | ---: |
| `.repro-runs/` | 143,105 | 9,198,801,028 | 502 | 14 |
| `.repro-cache/` | 536 | 310,276,353 | 0 | 0 |
| `dist/` | 9 | 3,841,195 | 0 | 0 |
| `node_modules/` | 3,577 | 87,975,546 | 10 | 0 |

`.repro-runs/` contains generated evidence, SQLite/test outputs, repeated staged source and dependencies, runtime archives and historical logs. `.repro-cache/` contains npm/browser downloads. `node_modules/` is the installed dependency tree. `dist/` is generated output and may predate current source. Source, package metadata and build instructions are version-controlled separately. Environment-like test/output filenames were inventoried as metadata only; their contents were not opened and they are excluded.

Three complete small research trees have byte-preserving archival mirrors under `handoff/offline-research/`: `contrast-transport-investigation-v1`, `contrast-incremental-receiver-v1`, and `contrast-allocation-attribution-review-v1`. They total 224 regular files and 1,682,123 bytes, including original adverse outcomes, source, tests, reviews, manifests and final receipts. The original paths under `.repro-runs/cloud-continuation/` remain excluded and unchanged. Neither transport candidate is installed. The incremental candidate’s frozen suite remains 107/108; its separately adjusted expectation does not erase that result.

Additional authored diagnostic harnesses, tests, plans and reports are listed exactly in `portableAdditionalSelections`. The intended copy destination is `handoff/diagnostics/<original path relative to .repro-runs/cloud-continuation/>`; the final handoff copy manifest records the actual copied set. This includes corrected-pilot verification inputs, validators and independent challenge sources, the actual postrun STOP alongside earlier readiness, finite reducer and preflight audit sources, missing-steps/schema investigation material, and selected release summaries. These are partial archives: their raw input archives, repeated staging, dependencies and unselected runtime evidence remain local. Older probe variants are kept in the original task trees rather than represented as new product code.

The JSON lists exact task directories throughout `.repro-runs/cloud-continuation/`, other run roots, and `.repro-runs/handoff/user-takeover-20261015/` (local delivery records). `usefulLocalReportsAndSeals` locates retained summaries and final receipts/manifests without adding multi-megabyte historical manifests or entire dependency trees to Git. The root `.repro-runs/` exclusion also covers any direct files and deeper descendants not enumerated separately.

These archives are not a runnable fresh-clone regression bundle. Helpers reference the original workspace and exact archived pilot rows, controls, staged Playwright serializer, source hashes and historical emitted/installed forms. Relative layout assumptions and absolute Node/workspace paths also remain unchanged. A partial archive cannot validate a complete historical seal without its omitted originals. Preserve original identity when reading results; any later adaptation needs new verification and must retain the historical failures.

The 896 MiB gate, 90/120-second bounds, first scheduled post-close census and similar diagnostic conditions were continuation policy used during this investigation, not original product requirements. Historical pilot readiness did not result in acceptance: the actual postrun was STOP. The lifecycle extension and bounded attribution proposal remain pending; copying their source or plans grants no runtime authorization.
