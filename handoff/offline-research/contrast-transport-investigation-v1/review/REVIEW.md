# Independent review — offline scope clear

The frozen prototype passes **108/108 independent offline Node tests**, with no skipped cases. This establishes lossless transport within the reviewed ordinary-data domain and tested failure handling. It does **not** establish a memory remedy, real Playwright integration, or a peak below the unchanged 896 MiB gate. No browser, container or network operation was used; no production or tracked file was changed by this review.

Final candidate SHA256: `440dddbb4c7bf6b5102ae3d366316fa9b9a768dbb53bb68c3731c65b06027727`, verified before and after the 11.020-second final test run. The candidate and prospective caller diff remain uninstalled.

## Evidence and preservation

The executed caller receives the complete `sampleText` object through `locator.evaluate` and immediately assigns it to its result row. The existing evidence store already archives and drops finished rows. The opportunity investigated is the recursive transport envelope for one live graph.

An independent oracle extracts the actual staged Playwright serializer functions from the executed input's local `coreBundle.js`. It never imports Playwright or creates a browser. Bundle SHA256 is `2325ca4c1c83070e89dc49fb82525508f0a68e0cf12e2a624277968da216b7e0`; the 9,225-byte pure-function excerpt SHA256 is `654f492840529e6c984d9ab219343769fe82c75cd3198e33a318df005099c93e`.

All 12 complete archived product rows round-trip with identical JSON serialization and deep equality against that exact native oracle. Synthetic tests additionally establish own undefined versus missing properties, key order, numeric specials and negative zero, bigint, Unicode and lone surrogates across one-unit chunk boundaries, shared-reference identity and cycles. Those properties cannot all be recovered from archived JSON alone. The actual sampler has aliases, including the first paint record and clip objects shared by character witnesses; they must not be silently flattened.

The candidate accepts ordinary plain records, dense arrays and supported scalar values. It rejects accessors without invoking their getter, custom/null prototypes, sparse or extended arrays, symbols, nonenumerables, `__proto__`, and unsupported special types. Native Playwright supports or normalizes some such values differently. Clearance is restricted to the sampler's reviewed ordinary data domain, not every Playwright-serializable value.

Independent source comparison verified 19 bound source/evidence files, the exact proposed one-import/one-call replacement, and syntax of the reconstructed prospective caller. The entire 27,906-byte sampler remains identical: SHA256 `9cb9c70100e1657cac9b7259cb5490ca36cd177b33fedbbe12dd627c17d7a5c6`. Controls, witnesses, caller arguments, DOM/selection/occluder assertions, evidence writer, deadlines, sampling, cleanup and acceptance source remain unchanged. Archived observations were read only, not recomputed.

## Findings closed

- R1: inherited option names `toString` and `constructor` were mistakenly accepted. Own-property validation now rejects them before invoking the sampler.
- R2: a negative metadata node count was accepted. Counts below one now fail closed, alongside other tested metadata type/range errors.
- R3: initial source could attempt disposal again after disposal itself failed. The author independently changed ownership clearing before awaited disposal; one-attempt disposal and primary-plus-cleanup failure tests pass.
- R4: falsy Promise rejection causes could be swallowed by truthiness checks. An explicit failed flag now preserves undefined, null, false, zero and empty-string rejections. Playwright ordinarily rejects Error objects, so this was an offline adapter robustness finding, not a reproduced browser failure.

The first independent suite had 86 passes and three failures; after the first fixes the 103-case suite passed. Five subsequently targeted falsy-rejection cases failed and are retained. The final expanded suite passes 108/108 on the final hash. A report-only sampler-hash transcription error was corrected before author sealing. `findings.json` and the original logs preserve the history.

Handle acquisition, encoding, chunk reads, metadata, decode and disposal failures fail closed in the tested paths. Created handles receive one release attempt; primary and cleanup causes remain available. The tests cover empty, oversized, malformed and nonterminating streams, graph corruption, invalid limits and finite read bounds. No unbounded native-return fallback exists. The implementation guards do not amend product acceptance gates or prove capacity for the 45 unattempted occurrences.

## Allocation conclusion and next step

I checked all 72 records in the author's three paired, bounded offline trials and verified their source hashes and byte-equivalence results. Native whole-process maximum RSS ranged from **236,940 to 237,992 KiB**; prototype RSS ranged from **230,516 to 246,616 KiB**. Median checkpoint heap increase was 67.76 versus 66.77 MiB. The ranges overlap and one prototype maximum is higher: there is **no consistent RSS reduction**, no demonstrated 3.40 MiB pilot saving and no demonstrated 896 MiB pass.

The lazy remote encoder avoids constructing a complete second browser envelope or full browser encoded string. It still retains the original graph, a reference map and traversal state. Node still collects chunks, joins text, parses the complete tagged graph and reconstructs output; these can coexist. Returned strings are bounded to 65,536 UTF-16 units, not protocol bytes. The 62–64 per-row string/metadata result messages exclude handle creation/disposal RPCs and add unmeasured real latency.

The benchmark combines simulated remote and receiving work in one Node heap, retains its outer source variable after fake disposal, uses explicit GC only between offline rows, lacks actual IPC/browser/cgroup behavior and misses allocations inside decoder checkpoints. Original aliases were lost by historical JSON archival. Whole-process RSS includes setup. Its child receipts lack execution-time candidate hashes; the reconstructed earlier candidate matches the retained review copy, but that is reconstruction provenance rather than attested execution identity. Final-hash evidence is functional testing only.

The next concrete technical investigation is a bounded incremental receiver decoder that avoids the full tagged intermediate graph, retaining the same native-equivalence, complete-evidence and failure suite. The current candidate should not be installed or presented as the pilot memory fix. Any later browser verification must be separately scoped and must also resolve the independent observation-lifecycle design. Nothing in this review changes the old stopped pilot, its acceptance, the memory gate, or runtime authorization.
