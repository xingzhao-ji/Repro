# Offline measurement transport investigation

A small, uninstalled transport prototype preserves the supported measurement graph and bounds each returned string. **It has not established a memory remedy or a peak below the unchanged 896 MiB gate.** No browser, container, network, production edit, sampler edit, or gate change was used.

`transport.mjs` (SHA256 `440dddbb4c7bf6b5102ae3d366316fa9b9a768dbb53bb68c3731c65b06027727`) replaces the full result return with `evaluateHandle(sampleText, sameArguments)`, a lazy encoder held by a second handle, bounded string reads, and a Node decoder. The completed original result stays reachable through the encoder while read; the original handle is redundant and released. The encoder emits a tagged reference graph incrementally, without making a complete encoded graph or complete encoded string in the browser. Every returned string is at most 65,536 UTF-16 code units (JSON escaping can make the protocol byte message larger). The encoder handle is disposed before Node reconstruction.

This removes the full recursive Playwright object envelope from the ordinary measurement return. It does **not** remove the browser's completed result, the encoder's reference map, Node's collected chunks/joined text, parsed tagged graph, reconstructed result, or the existing evidence writer's serialization/readback. Node decode can hold several of these at once. It also adds 62–64 string/metadata evaluations per stored row, plus handle creation/disposal calls. Real protocol latency and interaction with the unchanged 90/120-second limits remain unmeasured.

## Preservation and tests

The initial test ran against a baseline `locator.evaluate` adapter and failed the intended invariant: one full-object return remained. `baseline-invariant-failure.txt` preserves that failure. The initial implementation's one incorrectly sized limit test also remains in `test-initial-implementation.txt`; the test fixture was corrected from a non-exceeding 32-unit budget to an exceeding 24-unit budget.

Final author tests pass 7/7 groups. They round-trip all 12 complete archived product rows and the complete artifact containing all 50 controls, with deep equality and identical JSON serialization; test native Playwright semantics for own undefined, NaN, infinities, negative zero, bigint, key order, Unicode/lone surrogates, repeated references and cycles; and cover fail-closed domain/size/depth/node limits, sampler/open/read/corruption/disposal faults. The independent reviewer reports 108/108 tests passing on the final hash, including an independently extracted serializer from the executed Playwright 1.64.0 bundle. Review fixed two validation bugs (inherited option names and negative metadata node counts were accepted) and a failure-propagation bug (falsy rejection reasons were swallowed). Failed review output is preserved in the sibling review directory; `review-fixes.diff` contains all three fixes.

Supported inputs are ordinary plain objects, dense ordinary arrays, and the listed scalar values. Getters, custom/null prototypes, sparse arrays, array extra properties, symbol keys, nonenumerable data, `__proto__`, functions, symbols, Date, Map, Set and typed arrays fail closed. This is deliberately narrower than all Playwright-serializable values; the frozen sampler constructs ordinary records/dense arrays, and all stored evidence fits. The prototype is not a general Playwright replacement. Archived JSON cannot establish original alias identity, so alias/cycle preservation is separately tested with synthetic fixtures and the exact pinned native serializer. No runtime witness or calculation was recomputed.

Prototype transport ceilings are 16,777,216 encoded UTF-16 units, 1,048,576 units per string, 1,000,000 visited values and depth 128; each can only be lowered. These are implementation investigation guards, **not adopted measurement acceptance gates**. Capacity for the 45 unattempted occurrences is not established. Unsupported/oversize evidence throws; it is never truncated, omitted, or accepted as a pass.

## Allocation observations and limits

Six fresh bounded Node processes (384 MiB V8 old-space ceiling, 45-second subprocess deadline) each process the same 12 stored rows. They use the exact staged Playwright serializer/parser to model messages, with explicit GC only between rows. All 72 mode/row observations preserve complete serialized row bytes.

| Observation | Native full result | Prototype |
| --- | --- | --- |
| Whole-process max RSS, three trials | 232.32 / 231.39 / 232.41 MiB | 240.84 / 225.11 / 226.48 MiB |
| Median checkpoint heap increase | 67.76 MiB | 66.77 MiB |
| Range of checkpoint heap increase | 43.15–81.36 MiB | 47.34–68.95 MiB |

RSS is mixed; the first prototype trial is higher. This does not justify claiming a consistent allocation reduction, a 3.40 MiB pilot saving, or a pass under 896 MiB. The benchmark combines simulated remote and receiver work in one Node heap, keeps its outer `source` reference reachable after fake handle disposal, has no real IPC/browser processes/cgroup, and samples checkpoints rather than every allocation. In particular, checkpoints miss the decoder's internal coexistence of chunks, joined string, tagged wire graph and output. Whole-process max RSS also includes setup and loading.

The benchmark command receipts did not record the candidate hash at child startup. `benchmark-candidate-reconstruction.mjs` reverses the two subsequent validation edits and one failure-propagation edit and is byte-identical to the independently retained first candidate (`2848ea01d0fe98dd8fb016e43d5d4b8bacd5554cf4162653d8d594152d48759b`). This supports reconstruction provenance, **not execution-attested source identity**. The measurements concern that earlier prototype; final-hash evidence is functional testing only. No fresh measurement was invented for the final hash.

## Concrete integration and next step

`prospective-caller.diff` is uninstalled: one import and the sole product measurement call replacement at the frozen caller's line 795. Sampler bytes, all arguments, control bodies, DOM/selection/screenshot/equivalence assertions, evidence-store code, resource sampling, cleanup, source completeness and acceptance remain untouched. `source-bindings.json` binds all 19 source/evidence files and the unchanged sampler SHA256 `9cb9c70100e1657cac9b7259cb5490ca36cd177b33fedbbe12dd627c17d7a5c6`.

A transport or disposal error rejects the call before `Object.assign`; the existing inner catch records an unresolved row without `productChecksCompleted`. The unchanged complete-and-archived assertion then fails, source completeness remains false and exit is nonzero. No permissive fallback invokes the unbounded native return. A failed disposal is reported and not silently retried; a primary failure plus cleanup failures retains all causes in an AggregateError.

Do not install or run this candidate as the pilot memory fix. The next technical investigation, if desired, is a bounded incremental receiver decoder that avoids the full tagged wire graph; it must first demonstrate lower allocation with the same complete round-trip/native-identity/fault suite. Any real-browser verification must be separately scoped, retain the 896 MiB gate and existing measurement semantics, and address the independent observation-lifecycle issue. This task supplies no new runtime authorization and makes no claim that changing transport resolves the missing post-close census.
