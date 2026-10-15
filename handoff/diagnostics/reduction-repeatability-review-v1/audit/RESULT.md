# Independent reduction and repeatability audit

The retained evidence and the completed nonbrowser checks support their narrow claims. They do not establish browser acceptance or browser repeatability for the current startup-repair candidate. The real three-action capsule still has **minimality unverified**. No product defect requiring a source change was identified by this audit.

This reviewer executed only read-only parsing, hashing and independent calculations over authorized repository files. There were no product imports or tests, adapter calls, browser or Docker operations, network or authentication actions, uploads, or source changes. Audit outputs are confined to this directory. The checks below are evidence-audit checks, not additions to the repository's source-test count.

| Independent audit | Result | Scope |
| --- | --- | --- |
| Historical browser and reduction records | 879/879 checks | 157 retained artifacts, 40 benchmark runs, six accepted reduction runs, one reduced fixed run and ten rejected preflights |
| Raw reducer-model records | 50,308/50,308 checks | Every record from 2,112 reducer invocations and 13,596 synthetic runner calls across six processes |
| Actual adapter preflight records | 5,853/5,853 checks | All 700 saved results and 600 artifacts, including both failed verifier attempts; the final complete matrix has 420 calls and 360 artifacts |

The full calculations and input inventories are in [historical-evidence-audit.json](historical-evidence-audit.json), [model-evidence-audit.json](model-evidence-audit.json) and [preflight-evidence-audit.json](preflight-evidence-audit.json). Their corresponding `audit_*.py` scripts run no application code.

## Historical browser evidence

The frozen bounded-pool run retained all 20 buggy and 20 fixed repetitions, ordered by repetition and revision, with 40 unique run IDs. `summary.json` and `runs.ndjson` agree exactly. Every run has one frozen assertion, the correct revision and fixture identity, the same seed, both issued requests and the controlled beta-then-alpha response completion order. All 120 benchmark artifact hashes and sizes match. Independently decoded Playwright DOM-query return values in all 40 traces agree with the recorded observations: latest request 2, query `beta`, and Alpha results for buggy or Beta results for fixed. This is an observation about one synthetic failure family in that old configuration, not 40 independent bugs or universal determinism.

The reduction consumed 16 adapter attempts over 13 trials. Trial 0 established the five-action baseline twice; trials 5 and 9 each preserved the target failure twice while deleting a noise action. The final capsule retains `navigate`, `search-alpha`, `search-beta`, with canonical digest `1d73378b0b1dd8b9c0e20a155c88d1c27e85910f144dcd1085ddb0f6d3214db6`. All six accepted runs have one exact frozen target assertion. The separate fixed run `5b30911b-57d7-4f5f-87f4-320de7f53119` satisfies that assertion once. The seven corresponding traces independently match their stored DOM observations and response order.

Every trial candidate was reconstructed from its preceding accepted parent and rehashed. The final neighborhood was independently enumerated by transitive reverse dependency closure:

| Selected deletion | Closure removed | Remaining actions | Final trial / execution | Candidate digest |
| --- | --- | --- | --- | --- |
| `navigate` | `navigate`, `search-alpha`, `search-beta` | none | 10 / 14 | `1c061d1b7ef3d837009072a7575755acbc847560e6c73dc50d2a92c8eba49854` |
| `search-alpha` | `search-alpha`, `search-beta` | `navigate` | 11 / 15 | `d7cdc6097616a724c232261cda8afc210f5afcce3ed8ec46f71b45e48bfd59a8` |
| `search-beta` | `search-beta` | `navigate`, `search-alpha` | 12 / 16 | `1b3173e15bf031d04c51ba5e3c8dc373ee1ba0f0e9ba809d01bb6c188140ce37` |

All three final neighbors returned `MISSING_STEPS`, `inconclusive`, category `verification`, browser `not-launched`, assertion count 0, null observation, no events and an empty app digest. They were attempted after the final acceptance, but no relevant requirement was evaluated. They therefore cannot establish that deleting a final dependency group makes the requirement hold.

The same rejection occurred in ten historical attempts in total. Trial/execution indices are zero-based trials and the recorded one-based execution directory suffixes:

| Trial | Execution | Remaining actions | Run ID |
| --- | --- | --- | --- |
| 1 | 3 | none | `2aa506e1-cd9c-44ac-b4ce-141f89259791` |
| 2 | 4 | `navigate`, `focus-before`, `search-alpha` | `a1acf0fc-12cb-4301-96b9-2602bf7b005c` |
| 3 | 5 | none | `c352eb16-a769-4d70-bafe-f4462b4e6989` |
| 4 | 6 | `navigate`, `focus-before`, `focus-after` | `465a6ae7-b117-465e-b5c3-23b892d5479b` |
| 6 | 9 | none | `30c1d3ba-ae5f-4051-bc4d-f22357a81d03` |
| 7 | 10 | `navigate`, `focus-before` | `fe301830-5173-42ba-8dcf-ca59b1399cc0` |
| 8 | 11 | none | `513a2606-6666-4874-be27-9273af14dea9` |
| 10 | 14 | none | `38282421-d672-4b8f-9001-14cd22b7aa42` |
| 11 | 15 | `navigate` | `98eaad91-c555-43b9-9042-0fbab737bb3e` |
| 12 | 16 | `navigate`, `search-alpha` | `9bf1f479-5c00-41c7-812c-e608df75bf32` |

The reducer's ledger reports a generic frozen-identity mismatch for these attempts because `appDigest` has not been populated before boundary rejection. The underlying persisted run reason preserves `MISSING_STEPS`. This does not turn the rejection into a target failure or a requirement-satisfied outcome. The stored reduction correctly says `minimality: unverified`.

## Executable identity and transfer limits

The assertion remains `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`. Independently reconstructed fixture digests remain buggy `a81479664d26fb060c8ad5a9136f32777a75b3e4049fbf14fde479549ec3b38a` and fixed `62dc6cf692d2c26d821ee5f6cde9fdf8660bed810a5726deeddf5b6771c7ba09`. Current oracle, reducer, manifest, contracts, fixture loader, benchmark and fixture bytes match the frozen historical input among the ten inspected paths. The adapter changed to SHA-256 `2727f237d460b98d620d5e2620547305d6d6e4d6e1c3c093f56419b2d475ee60`.

| Execution artifact | Actual harness digest |
| --- | --- |
| Historical browser evidence | `c432e782cad9d9ceb3601778707c8b1b1cc0c4546864e29be9a1eb3140580838` |
| Current TypeScript source | `623156fff63bf70c55627e7c7e2a77bcacd521d3b67bc6f4ee629195dc65baba` |
| Current emitted JavaScript | `01bf6337a2df31205cbf496eb1d3f99097433e1110b35e1ffd9c65b367bf9418` |
| Current installed library | `85796265004796f4cbb64bc1b52645080d61e7e602c8a267a90f1aa35eddf5a5` |

The three current identities were measured in the prior startup-repair receipts and are also present in the newly audited actual-adapter preflight results. The historical browser runs used Node v24.21.0 and pinned Chromium 156.0.8078.4. The current nonbrowser checks used host Node v24.19.0. Matching assertions and fixtures do not transfer old browser acceptance to changed executable bytes or a different execution environment. Harness identity also does not encode every process-pool flag; the frozen browser plan remains separate provenance.

## New nonbrowser evidence

The model worker's tables cover every Boolean predicate on all dependency-valid subsets of the two declared four-action graphs, conditioned on a failing full baseline: 64 chain-noise tables and 256 star tables. These are a finite test domain, not all possible graphs or programs. Two fresh processes for each source, emitted and installed format executed 320 tables plus 32 controls, yielding 2,112 reductions and 13,596 synthetic runner calls. No browser or application behavior was inferred by those runner responses.

This audit independently enumerated valid subsets by combinations, calculated deletion closures to a fixed point, rechecked final-neighbor evidence after final acceptance, recomputed all semantic hashes and compared every normalized record across all six processes. It verified all 217 frozen input inventory entries per process. All deterministic table cases retain a failing final candidate with no failing permitted final neighbor. In 23 of the 320 tables the final answer is larger than a globally smallest failing subset; these observations are retained and correctly prevent a global-minimality claim. All six normalized transcript hashes equal `c0bcbf8aa82196c20a99a07509adb41170a20d065fad8b32f8b39c03d8744e6a`. The synthetic model harness digest identifies the worker, not any actual browser harness.

The alternate-order controls establish an explicit limit in the repetition policy. In [src/reducer.ts](/workspace/repro-development-rv5abotj/repro/src/reducer.ts:150), a first requirement-satisfied observation rejects the candidate immediately and is considered conclusive; failure followed by satisfaction is marked unstable and inconclusive. A verified satisfaction is enough to reject the declared all-N-failures acceptance criterion, so this is not by itself a contradiction of the bounded deterministic claim in [docs/ARCHITECTURE.md](/workspace/repro-development-rv5abotj/repro/docs/ARCHITECTURE.md:32). However, satisfaction-first does not sample the scheduled later failure. The model's satisfaction-first neighbor therefore gets the product's dependency-group-1-minimal label after one observed satisfied run, while repeated neighbor stability and general stochastic minimality remain unestablished. No source change is justified merely by assuming the stronger claim.

The final actual-adapter preflight matrix ran seven rejected-input/cancellation cases 20 times in each of three formats: 420 calls and 360 evidence artifacts. All three final-neighbor inputs remain `MISSING_STEPS` before the browser, server listener or assertion. The worker installed throwing guards for the exact Playwright singleton's launch method and HTTP listen method, observed zero calls, then restored the exact original descriptors and callable identities. This reviewer checked the final guard logic and guard-only receipt before the batch. Independently read results match their persisted artifacts and hashes, all 20 normalized outputs per case/format agree, and cross-format differences are confined to the separately preserved harness identity and dependent evidence hash. This proves consistency of the actual adapter's rejected-input path only.

All verifier failures remain visible. The model's first launcher could not find `node` on its sanitized PATH and executed zero reducer processes; the correction used the existing resolved executable. The first preflight verifier saved 140 source results and 120 artifacts, then failed when restoring an inherited HTTP method with an undefined own descriptor. The second saved another 140/120, then failed deleting a temporary property that had not been declared configurable. The final verifier explicitly creates a configurable shadow and deletes it when the original method was inherited. Both failed batches remain separate from the final 420-call success; all attempts total 700 distinct saved run IDs and 600 artifacts. The first historical audit JSON also preserves a bookkeeping error in this reviewer's Python `Counter` construction; counting dictionary keys corrected it without executing product code or changing retained inputs.

## Remaining actions under the existing boundary

1. Identify and independently review an execution strategy that preserves the required two-browser overlap, unrelated-browser liveness and fresh-replay assertions within the unchanged 128-task cap and all existing sandbox/resource constraints. None has been selected. This audit starts no new browser experiment and grants no resource or access expansion.
2. Once such execution is feasible, bind the final source/emitted/installed artifacts and repeat the declared fresh-reset buggy/fixed browser observations with unchanged fixture, seed, clock, response schedule and assertion. Retain all runs and traces. The current 31-test browser matrix, separate CLI demo and installed-package browser replay remain acceptance work; historical passes and these nonbrowser checks do not close it.
3. Keep the current capsule's minimality unverified. Capacity repair alone cannot resolve the `MISSING_STEPS` neighbors: the existing boundary rejects them before the unchanged oracle can execute. A new minimality claim needs a separately specified supported case/deletion boundary, frozen budget and repetition criterion, a re-established baseline and executed final-neighbor observations. Do not weaken the oracle or relabel unsupported neighbors as satisfied.
4. Native zoom, actual screen-reader use, remaining accessibility findings and human-research gates remain separate unverified work. This review supplies no evidence for those gates.

The coordinator's [remaining-actions.json](../remaining-actions.json) states these scopes accurately. Further identical nonbrowser reruns are not justified by the completed evidence. No new implementation change or browser acceptance claim follows from this audit.
