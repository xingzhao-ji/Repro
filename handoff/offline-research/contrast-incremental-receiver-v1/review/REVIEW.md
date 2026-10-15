# Independent review — functional scope clear, memory remedy unestablished

The uninstalled candidate removes the receiver's complete intermediate tagged graph, joined wire string and explicit retained chunk array. It reconstructs the final ordinary-data graph incrementally. Independent offline tests establish the reviewed lossless behavior and failure cleanup. They do not establish a reduction in complete-transfer RSS, a browser integration result, or compliance with the unchanged **896 MiB** gate.

Reviewed candidate SHA256: `0b36b70a53d1eddbfb9c6fe055b8c4f8e0408ffd47910675cce348021e9f42eb`. Keep this candidate as an uninstalled research artifact. No browser/container job, runtime installation, observation-lifecycle adoption, permission change, or publication was performed by this review.

## Functional evidence and preserved differences

- The exact prior 108-test suite is retained byte-for-byte. On the final candidate it reports **107 passes and one failure**: an invalid endless `x` producer now fails on its first chunk with `TRANSPORT_BAD_JSON`, while the old assertion expected a later encoded-size/chunk limit. Both paths reject and release their handles. No parser validation was delayed to satisfy the old error-name assertion.
- A separate copy changes that one error-expression to explicitly allow the earlier syntax rejection and passes **108/108**. Independent cases additionally require the malformed producer to stop at its first read and a plausible unterminated string producer to stop at the original finite read/size budget. The exact change and reason are recorded in `compatibility-adjustment.json`.
- **86/86 independent streaming test groups pass**, including every split and one-code-unit boundaries for supported graphs; all incomplete prefixes of a nested graph; strict JSON/tag grammar; all 32 forbidden raw control characters; BOM/non-JSON whitespace rejection; UTF-16 including lone surrogates; aliases/cycles; own undefined; insertion order; negative zero, numeric specials and bigint; duplicate IDs/keys, forward references and prototype-pollution rejection; and unchanged data-string, node, depth and encoded-unit budgets. The deterministic mutation corpus contains **1,728 cases: 242 accepted and 1,486 rejected**, all matching the predecessor's semantic decoder.
- All **12 complete archived rows and the complete 50-control artifact** remain deep-equal to the pinned native serializer oracle and byte-identical under JSON serialization. These are archived-evidence checks, not new browser observations or rerun controls. The oracle extracts only pure functions from the actual staged Playwright bundle `2325ca4c1c83070e89dc49fb82525508f0a68e0cf12e2a624277968da216b7e0`.
- **13/13 additional cleanup tests pass** using a documented one-assignment instrumentation that retains the otherwise private decoder for inspection. Metadata/disposal failures, including undefined/null/false/zero/empty-string rejections, clear a previously populated graph's root, reference map, frames and token state. A deferred disposal test verifies that no final graph is returned before disposal settles. Created handles receive one release attempt.

The final candidate and test sources were hash-bound before and after the final tests. `functional-clearance.json`, `stream-second-receipt.json`, and `final-command-receipts.json` bind the results. Tests used bounded offline Node execution; no skipped cases are counted as passes.

One candidate defect was fixed during review: the initial tokenizer applied `maxStringUnits` to protocol tags and special-number labels, rejecting valid supported values with a one-unit data-string budget. Context-specific bounded protocol labels now retain the predecessor's semantics; actual data/key/bigint string limits are unchanged. The author preserves the red/green regression, and the reviewer preserves the initial candidate and exact reproductions in `findings.json`.

The first independent mechanism test also contained a reviewer error: it required at least one scalar `JSON.parse` call. The manual tokenizer needs none. That failed test/log is retained. The corrected test still proves that the predecessor's whole-graph parse is blocked while the candidate completes the same graph under the prohibition.

Clearance is restricted to the supported ordinary plain-object/dense-array/scalar domain. Unsupported prototypes, accessors, symbols, nonenumerable properties and sparse arrays remain rejected as in the prior prototype. This is not a general replacement for every Playwright-serializable type.

## Source and ownership review

Independent readback verifies 22 source/evidence bindings and all 19 author-manifest files. The complete **27,906-byte `sampleText` function**, SHA256 `9cb9c70100e1657cac9b7259cb5490ca36cd177b33fedbbe12dd627c17d7a5c6`, is unchanged. The remote encoder and default/limit-validation prefix are byte-identical to the sealed predecessor. The prospective caller diff is also byte-identical to the prior reviewed proposal: one import and one product measurement call replacement, preserving its arguments. A reconstructed prospective file passes syntax checking; it remains unapplied.

The parser creates final output containers directly and registers their IDs before children, preserving cycles and aliases without a tagged intermediate graph. State consists of one bounded scalar token, depth-bounded frames, and the output reference map. `write` returns no value. Success, abort and parse failure clear internal graph references. The transfer path feeds each chunk immediately and calls `finish` only after stream completion, metadata validation and successful encoded-handle disposal. Metadata/disposal failures abort before cleanup.

This removes explicit whole-wire retention; it is not proof that V8 releases every chunk's backing storage immediately. Final strings may retain sliced-string backing storage. The final Node graph and its reference map now overlap the remote encoder's retained graph/reference map during reads. The old receiver disposed the remote handle before constructing its output. These are material lifetime differences, not measurement-semantic changes, and their memory effects require actual attribution.

## Independent allocation/RSS review

The fixed offline protocol completed **12 fresh Node workers and 156 fixture cases**, all successful. I verified every stdout/stderr/startup receipt hash, startup/end/current source bindings, all 31 bound source files, every pair's complete-evidence expected hashes, checkpoint/message parity, decoder cleanup state, and the recomputed RSS/time/heap-summary arithmetic. No trial was discarded or replaced.

| Experiment | Trial | Prior max RSS (MiB) | Incremental max RSS (MiB) | Difference (MiB) | Extra time across 12 archived rows (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Complete simulated transfer | 1 | 235.8984 | 241.1602 | +5.2617 | +990.76 |
| Complete simulated transfer | 2 | 235.8281 | 241.2500 | +5.4219 | +689.81 |
| Complete simulated transfer | 3 | 254.1758 | 241.2266 | -12.9492 | +723.72 |
| Receiver only | 1 | 275.7305 | 260.8438 | -14.8867 | +1677.44 |
| Receiver only | 2 | 275.7344 | 261.9414 | -13.7930 | +1434.61 |
| Receiver only | 3 | 275.5156 | 262.3438 | -13.1719 | +1437.47 |

The isolated decoder has lower RSS in all three pairs, but complete transfers have **two higher RSS results and one lower result**. Every timing pair is slower. Therefore there is **no consistent complete-transfer memory reduction** and no demonstrated remedy for the pilot's 3.3984375 MiB headroom miss.

These measurements use a single Node heap, not separate browser/driver processes or cgroup accounting. Complete-transfer simulations retain the source graph equally in both modes. Receiver-only tests retain the same precomputed chunks and exclude live transport. Process max RSS includes setup and assertions; sampled heap checkpoints may miss synchronous internal peaks and are not total allocation measurements. Explicit GC occurs only between rows. Three paired trials support descriptive reporting, not a confidence claim or browser prediction.

A prelaunch PATH error started zero measurement workers. Its original runner, bindings and failure are preserved. The independently reviewed correction uses the existing absolute Node executable and a separate bindings filename; fixtures, order, environment, budgets, GC policy and stop rules were unchanged. The executable was hashed outside measured workers.

## Recommendation

Keep the candidate uninstalled. The requested allocation mechanism is implemented and regression-tested, but the complete-transfer benchmark is adverse in two RSS pairs and all timing pairs. A useful next local investigation, if requested, is allocation attribution for the overlapping encoder/reference state and retained string backing storage; the present data cannot identify a safe winning optimization. Do not select another runtime pilot on the strength of isolated-decoder RSS alone.

The original stopped pilot, its provisional observations, the unchanged 896 MiB gate, and the separately pending observation-only lifetime extension remain unchanged. No further runtime test or gate modification is implied by this review.
