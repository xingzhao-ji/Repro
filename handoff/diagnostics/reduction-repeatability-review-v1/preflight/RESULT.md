# Final-adapter nonbrowser preflight repeatability

The corrected, independently reviewed verification driver completed **420/420 planned preflight checks**: seven cases, twenty sequential fresh adapter calls per case, across source, emitted JavaScript and the freshly installed package. This verifies deterministic rejection before browser/service startup. **Current browser repeatability and reduction minimality remain UNVERIFIED.**

Each format used one fresh Node v24.19.0 process; each call received a fresh manifest clone, AbortController and owned artifact destination. The actual final startup-repair adapter ran. The test replaced only prohibited resource entrypoints with throwing guards; no outcome model or synthetic runner replaced `runBrowser`. There were zero `chromium.launch` or HTTP `listen` attempts, zero emitted events, zero executed assertions, null observations and `browser: not-launched` in all accepted calls. The returned `appDigest` is empty because no application executed; the manifest still declares its frozen registered fixture identity.

## Frozen cases

| Case | Executions across three formats | Actual outcome / category / code |
|---|---:|---|
| neighbor-remove-navigate | 60 | inconclusive / verification / MISSING_STEPS |
| neighbor-remove-search-alpha | 60 | inconclusive / verification / MISSING_STEPS |
| neighbor-remove-search-beta | 60 | inconclusive / verification / MISSING_STEPS |
| control-missing-beta-with-noise | 60 | inconclusive / verification / MISSING_STEPS |
| control-changed-oracle | 60 | inconclusive / verification / IDENTITY_MISMATCH |
| control-undeclared-boundary | 60 | inconclusive / input / MANIFEST_VALUE |
| control-pre-cancelled | 60 | cancelled / cancelled / CANCELLED |

The three final deletion neighbors were derived independently by transitive dependency closure from the exact previously retained three-action manifest. It equals the current `createManifest()` with the two noise actions removed. Its digest is `1d73378b0b1dd8b9c0e20a155c88d1c27e85910f144dcd1085ddb0f6d3214db6`.

- neighbor-remove-navigate: removes `navigate, search-alpha, search-beta`; remaining actions `(none)`; candidate digest `1c061d1b7ef3d837009072a7575755acbc847560e6c73dc50d2a92c8eba49854`.
- neighbor-remove-search-alpha: removes `search-alpha, search-beta`; remaining actions `navigate`; candidate digest `d7cdc6097616a724c232261cda8afc210f5afcce3ed8ec46f71b45e48bfd59a8`.
- neighbor-remove-search-beta: removes `search-beta`; remaining actions `navigate, search-alpha`; candidate digest `1b3173e15bf031d04c51ba5e3c8dc373ee1ba0f0e9ba809d01bb6c188140ce37`.

All three neighbors remain INCONCLUSIVE under the current boundary: MISSING_STEPS means the required experiment never ran. Twenty identical rejections do not establish requirement satisfaction, failure preservation, or dependency-group 1-minimality. The otherwise structurally valid pre-cancelled control was aborted before invoking the adapter, and never passed its initial cancellation check. No executable uncancelled baseline entered this matrix.

## Repeatability and provenance

All complete normalized results and independently read evidence contents match within each format. Normalization is limited to run UUIDs, timestamps, duration, and run-ID paths. Every raw evidence hash and length was checked before comparing normalized content. Artifact hash differences caused by normalized metadata remain traceable to retained raw bytes. Cross-format semantic comparison separately checks and preserves the following distinct actual harness identities:

| Format | Actual harness digest |
|---|---|
| source | `623156fff63bf70c55627e7c7e2a77bcacd521d3b67bc6f4ee629195dc65baba` |
| emitted | `01bf6337a2df31205cbf496eb1d3f99097433e1110b35e1ffd9c65b367bf9418` |
| installed | `85796265004796f4cbb64bc1b52645080d61e7e602c8a267a90f1aa35eddf5a5` |

The only cross-format normalized differences are the recorded harness digest, both in the returned result and persisted evidence. No harness was relabeled identical. The source adapter SHA256 remains `2727f237d460b98d620d5e2620547305d6d6e4d6e1c3c093f56419b2d475ee60`; assertion digest remains `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`. All 25 frozen executable/fixture input files match their before-run hashes.

The guards resolve Playwright from each actual adapter/library module and assert that its import and require entrypoints share the exact Chromium singleton. Each final summary records original, installed and restored property states. Exact callable identity and own-property descriptor equality are checked after restoration, including inherited HTTP `listen` and Chromium `launch` methods. Separate guard-only validation exercised the throwing guards themselves once each; those two sentinel calls are not adapter launch/listen attempts.

## Complete execution accounting

| Configuration | Actual adapter calls | Evidence artifacts | Harness completion |
|---|---:|---:|---|
| Original | 140 | 120 | Failed restoring an absent own HTTP descriptor after source checks |
| Corrected driver v2 | 140 | 120 | Failed deleting a nonconfigurable HTTP shadow after source checks |
| Corrected driver v3 | 420 | 360 | All three formats completed; guards exactly restored |
| Total retained | **700** | **600** | Two verifier failures preserved |

The first two failures were verification-script cleanup defects, not adapter discrepancies. Their processes exited and later formats did not run. Raw results, logs, plans and hashes were retained. The final fix explicitly made the temporary HTTP shadow configurable and restores an original own descriptor or removes the temporary shadow for an inherited method. A guard-only check and independent source review preceded the final matrix. No product file changed.

The final batch contains 360 INCONCLUSIVE rejections and 60 cancelled runs. Of those, 180 are the three final neighbors, each rejected MISSING_STEPS with zero assertions. Across all attempts, 700 distinct run IDs, 700 result JSON files and 600 declared evidence artifacts were independently rehashed. The 100 pre-cancelled calls across all attempts produced no adapter artifacts. No symlink, hardlink, unexpected output file or output-path escape was found. Each command retained the 120-second / 2 MiB combined-log ceiling; none approached either limit.

## Deliverables and remaining action

- `corrected-driver-v3/plan.json` SHA256 `6d631c26af347d567de9f7256285cd023115d802dfd89f53acfdba73207aba9a` freezes the final cases and execution boundary.
- `corrected-driver-v3/execute.py`, `verify-format.mjs`, `execution-freeze.json`, logs and execution receipts record exact commands and code.
- `corrected-driver-v3/formats/{source,emitted,installed}/` contains every raw result, adapter evidence, per-case record and final summary.
- `audit-receipt.json` SHA256 `cd70caecfe42af304058a9806fc09be9348958d15c4a083d5e5f62e35026dfa7` records all counts, explicit cross-format differences and input preservation.
- `artifact-inventory.json` and `result-inventory.json` bind all 1,300 raw evidence/result files; both earlier failed attempts remain in place.

Next browser-dependent action is acceptance of the final startup-repair candidate within the unchanged approved sandbox/resource boundary once a technically valid capacity strategy exists. Minimality needs conclusive executed outcomes for each permitted final dependency-group deletion; the current adapter rejects all three before execution, so simply resolving browser capacity cannot establish their minimality. Any broader replay boundary would require a separately justified product change and new frozen tests, not relabeling these results. No browser/Docker workload, resource increase, authentication attempt, network acquisition or external write occurred here.
