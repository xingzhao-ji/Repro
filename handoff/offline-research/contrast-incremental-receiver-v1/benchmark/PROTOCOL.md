# Prospective offline comparison protocol

This protocol is fixed before measurement. The candidate stays uninstalled. No browser, container, network, gate, lifecycle, permission, or publication operation is allowed. The unchanged 896 MiB kernel-memory acceptance gate cannot be evaluated by these offline measurements.

## Compared implementations and fixtures

- Prior final transport: sealed `contrast-transport-investigation-v1/author/transport.mjs`, SHA256 `440dddbb4c7bf6b5102ae3d366316fa9b9a768dbb53bb68c3731c65b06027727`.
- New incremental receiver: author-frozen source and freeze receipt, supplied before execution. Imports and helper sources are hash-bound.
- All twelve archived `node-*.json` measurement rows in deterministic name order, unchanged and checked by full `JSON.stringify` byte hash. A thirteenth small synthetic value exercises aliases, cycles, special numeric values, undefined, bigint, and scalar strings; graph equality and canonical-encoder bytes are checked.
- The exact staged Playwright serializer/parser is used for every simulated wire message in end-to-end mode. The pinned bundle, package metadata, fixture adapter, all archived inputs, worker, orchestration script and assertion oracle are bound before importing the candidates. Startup bindings are written before work, and checked again after work. Native baseline is omitted: the comparison addresses the full intermediate decoder graph in the prior candidate.

## Fixed workload and order

Two distinct experiments, six fresh Node workers each (12 total):

1. `end-to-end`: complete prior/new `transferMeasurement` through a fake locator and pinned Playwright wire; both keep the source graph reachable equally. Browser-side and receiver allocations occupy one Node heap. The incremental receiver overlaps its final graph with the source graph while reading. This experiment cannot reproduce separate browser/driver processes or cgroup usage.
2. `receiver-only`: encode each fixture outside the timed interval using the unchanged prior encoder, discard its source graph, then force GC. The same array of precomputed wire chunks remains reachable for both decoders. Old joins/parses/decodes the complete wire; new consumes the chunks incrementally. This isolates decoder construction but deliberately retains precomputed wire and excludes live browser/transport costs.

For each experiment, execute pairs in the fixed order: trial 1 prior then incremental; trial 2 incremental then prior; trial 3 prior then incremental. Three pairs cannot perfectly balance first-position counts; this is disclosed. End-to-end experiment precedes receiver-only. No adaptive repetitions or selection of favorable runs.

Every worker uses `node --max-old-space-size=384 --expose-gc`, a 45-second wall deadline, and a minimal child environment (`PATH`, `LANG=C`, `LC_ALL=C`, `TZ=UTC` only). No inherited `NODE_OPTIONS`, credentials or unrelated environment is passed. Worker exit/timeout/assertion/source mismatch ends the entire matrix, preserving all produced files. Root and independent reviewer must approve the concrete frozen harness/bindings before execution. Harness errors may be corrected transparently with prior failures preserved and re-reviewed; measurements will not be silently replaced.

## Measurements and limits

Primary descriptive metric is fresh-process `process.resourceUsage().maxRSS` in KiB (also reported in MiB). Report every paired result, signed differences, elapsed transfer time and adverse outcomes; do not infer a memory-gate pass from them. Per-row before/final and observation-point heap/RSS readings are secondary diagnostics, not allocation totals or true peak-heap claims. Lifecycle checkpoint labels and counts are recorded and compared. End-to-end memory checkpoints occur at the same fake-handle/wire boundaries in both modes. Receiver-only uses matching start/end checkpoints; parser internal peaks may be missed. Source and expected-byte calculation is outside timing.

Explicit GC occurs only between rows, immediately before each measured transfer/decode and after releasing its output. No forced GC occurs inside a transfer. Natural V8 collection, process startup, fixture parsing, pinned serializer initialization, and equality checks still affect process maxRSS. Precomputed fixture setup is included in process maxRSS even though excluded from decoder timing. Results are descriptive with only three trials; no confidence claim, browser prediction, acceptance-gate extrapolation or retained-heap claim.

A separate source/mechanism check must establish that the incremental receiver constructs the final object graph directly and does not retain a complete parsed wire graph. Passing allocation measurements alone does not establish that property. Candidate regression and independent review remain required separately.
