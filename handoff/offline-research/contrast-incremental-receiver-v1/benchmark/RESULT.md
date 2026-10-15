# Offline incremental-receiver comparison

The candidate removes the receiver’s complete intermediate parsed graph, but these measurements do not establish a complete-transport memory reduction. Keep it uninstalled as a research candidate. The unchanged 896 MiB browser/cgroup gate remains untested.

Exact comparison: prior `440dddbb4c7bf6b5102ae3d366316fa9b9a768dbb53bb68c3731c65b06027727` versus frozen incremental `0b36b70a53d1eddbfb9c6fe055b8c4f8e0408ffd47910675cce348021e9f42eb`. All twelve prespecified fresh Node workers exited zero; all 156 case-equivalence checks passed (144 archived-row observations plus twelve synthetic alias/cycle checks). No measured worker failed or remained unattempted. No adaptive repeats occurred.

| Experiment / trial | Prior maxRSS MiB | Incremental maxRSS MiB | Incremental minus prior MiB | Prior row time s | Incremental row time s |
| --- | ---: | ---: | ---: | ---: | ---: |
| end-to-end / 1 | 235.898438 | 241.160156 | +5.261719 | 5.684541 | 6.675297 |
| end-to-end / 2 | 235.828125 | 241.250000 | +5.421875 | 5.389964 | 6.079771 |
| end-to-end / 3 | 254.175781 | 241.226562 | -12.949219 | 5.318229 | 6.041945 |
| receiver-only / 1 | 275.730469 | 260.843750 | -14.886719 | 1.560420 | 3.237864 |
| receiver-only / 2 | 275.734375 | 261.941406 | -13.792969 | 1.568909 | 3.003522 |
| receiver-only / 3 | 275.515625 | 262.343750 | -13.171875 | 1.525710 | 2.963179 |

The complete-transport simulation was higher in maxRSS in two pairs and lower in one (median signed difference +5.261719 MiB); all three incremental runs were slower. Receiver-only maxRSS was lower in all three pairs (13.171875–14.886719 MiB), but decoder elapsed time was about twice as long. Both adverse RSS pairs and every timing regression are retained in the raw records. The isolated decoder result supports a narrower construction benefit; it does not support promotion as a demonstrated memory remedy.

The mechanism conclusion is separate from RSS: `createIncrementalDecoder` allocates final arrays/objects directly, resolves aliases against that final graph, consumes each chunk without a complete-wire join/parse, and clears private graph references on completion/failure. The independent mechanism discriminator rejects the predecessor’s whole-graph `JSON.parse` and permits the candidate; independent cleanup tests cover success, abort and failure. All 39 incremental receiver-only terminal inspections also report closed state with zero frames, token units and references and no private root. This is source/test evidence, not a claim that final output allocation disappears.

Every worker verified 31 bound source/input files before importing the candidates and after measurement; its startup receipt was written before the workload. Final bindings SHA256: `89e45ff4725f762e2183a9b5310283666a20d3f245edd26e419868fbd49f1290`. The process used Node v24.19.0, 384 MiB old-space limit, 45-second wall deadline, the same four-key minimal environment, and explicit GC only between rows. Parent credentials and environment were not changed. The fixed three-pair order was prior/new, new/prior, prior/new for each experiment. Lifecycle checkpoint counts matched within all six pairs.

The first attempt encountered a prelaunch executable-lookup error because Node was outside the minimal PATH. Zero workers started. Original runner/bindings, error receipt and displayed traceback remain under `launch-failure-v1/`. The independently reviewed correction uses the existing absolute Node executable and versioned bindings; it changes no fixture, order, limit, GC, or sampling rule. Node’s binary hash was calculated outside measured workers. No measured run was discarded or replaced.

Scope limits: complete transport simulates both remote and receiver in one Node heap, retains the source equally in both modes, and uses the exact staged Playwright serializer. The incremental final graph overlaps remote-result lifetime during reads. Receiver-only releases source before pre-decode GC but deliberately retains the same precomputed wire chunks for both modes. Process maxRSS includes setup and output assertions; the per-row checkpoint deltas are not continuous peak heap or an allocation profiler. Receiver-only checkpoints occur just before and after decoding. Natural GC and allocator behavior are not controlled, only three pairs were collected, and first-position counts cannot be perfectly balanced with three pairs. None of this measures separate Chromium/driver processes or kernel cgroup usage.

Recommendation: preserve the reviewed candidate and these adverse outcomes, leave runtime installation unchanged, and do not claim that the 896 MiB blocker is resolved. Any further local memory work should target the observed end-to-end allocation/lifetime costs with a separately bounded attribution experiment, rather than favorable-result reruns. The observation-only lifetime extension remains pending and was neither adopted nor exercised. No browser/container pilot, publication, or permission change occurred.
