# Independent schema patch and evidence review

Decision: no blocking issue found for this separate schema-only candidate. The patch fixes a demonstrated representation defect without changing adapter, reducer, oracle, fixture, application identity semantics, accepted behavioral outcomes or minimality claims.

The review inspected actual candidate changes, frozen tests, all retained regression attempts and receipts, actual results/guard records/artifacts, root's independent 700-record corpus checker and its raw before/after results. It performed source/JSON/hash inspection only: it did not run product code, schema validation, tests, browser, HTTP listeners, Docker, network, authentication or publication. `schema-patch-evidence-review.json` records 2,584 checks and zero failures.

## Patch semantics

The existing schema's appDigest property changes from a SHA256 reference to SHA256-or-empty. A new conditional requires any empty application digest to have an inconclusive/cancelled outcome, exactly zero assertions and a null observation. The root required-property list still includes appDigest. Thus omitted fields do not create a conditional loophole. Nonempty digests retain the existing SHA256 shape, and both conclusive outcomes retain the prior assertion/harness/observation constraints. Independently normalizing only the appDigest property and removing the new conditional reconstructs the entire original schema JSON exactly.

The documentation explains missing identity without pretending the application executed. The frozen nine-test regression checks real adapter preflight results under launch/listen guards plus contradictory structural shapes. Tests remain unchanged across red and green, SHA256 `9ba6c8954ba053dce3f5f49f274c51468ad39dcedead4891df1bbfce905df140`.

All 182 preserved baseline files match their original inventory. Compared with those files, the separate candidate modifies only `schemas/run-result-v1.schema.json` and `schemas/README.md`; it adds `tests/schema-preflight.test.ts`. Runtime and fixture source hashes remain unchanged. The deliverable patch is `schema-patch/schema-representation.patch`, SHA256 `4cfeffe4eb0f1c4b6b55bd6d33bb853074ee4d1cf0ad074dd40626fb13e25d9b`. The retained `patch-dry-run.json` records successful zero-fuzz checking against the preserved baseline. This reviewer inspected that receipt rather than reapplying the patch.

## Failure preservation and regression evidence

| Attempt | Recorded result | Interpretation |
| --- | --- | --- |
| Original red | 4 passed, 5 failed | Three cases failed earlier with OUTPUT_BOUNDARY because the test cwd made a sibling evidence directory fall outside the existing product boundary. One pre-cancelled case and the structural positive control exposed appDigest schema rejection. Preserved as a test-setup failure, not complete evidence for the desired regression. |
| Corrected red-v2 | 4 passed, 5 failed | All four actual outputs reached schema validation and failed only the appDigest pattern; the unstarted structural positive control also failed. |
| Green | 9 passed, 0 failed | The unchanged tests pass with the narrow schema patch. |
| Existing scoped regression | 28 passed, 0 failed | Manifest, reducer, reducer-review and existing schema coverage passed. No skips, cancellations or todo tests reported. |
| Strict typecheck / scoped lint | Both exit 0 | Empty error output; commands and exact source/test identities retained. |

The correction changed only invocation cwd and explicit candidate test path. This made the task-owned evidence destination comply with the existing path boundary; production path validation remained unchanged. PLAN-v2 excludes the listener-opening inspector suite. PLAN-v3 and the unchanged test hash are bound into the corrected red, green and scoped-check receipts. The old launcher was explicitly reconstructed by reversing the sole plan-filename change, with its SHA256 matching the original red receipt. Current launcher bytes are separately retained. No setup failure or previous output was overwritten.

Across all three nine-test attempts, all 12 actual adapter results were inspected: six missing-step rejections, three initial OUTPUT_BOUNDARY setup rejections, and three pre-cancelled outcomes. Six actual evidence artifacts match their recorded size, SHA256 and result content. Every guard record reports zero launch/listen attempts, restored exact descriptors, and unchanged harness identity. The results remain zero-assertion, null-observation, empty-application-digest, not-launched outcomes. The red-v2 and green schema identity records match the baseline and candidate schemas respectively.

## Independent retained-result corpus

Root's separate `schema-corpus/check.mjs` compiles the actual baseline/candidate schemas with strict Ajv and validates the same retained 700-result inventory. This review inspected that checker and independently checked its frozen script hash, source schemas, inventory, all 700 raw result hashes/lengths, and each before/after detail record.

The baseline rejects 700/700 solely at appDigest's pattern. The candidate structurally accepts 700/700. Their original outcomes remain 600 inconclusive and 100 cancelled; all have empty appDigest, zero assertions and null observation. The raw evidence is unchanged. Structural acceptance does not reclassify any run as target-failure or requirement-satisfied.

## Release implications

The original startup-repair candidate and its receipt remain the separate preserved baseline. This patch is reviewable local work; publication, installation or integration into the primary candidate is not claimed here. If integrated for release, preserve a new exact candidate/package identity and include the corrected schema in the normal release packaging checks. Runtime source did not change in this patch, so repeating unrelated tests solely for this representation change is not justified.

R2 permits bounded failure-preserving reduction with honest unverified minimality. Achieved 1-minimality is not an added mandatory gate. The existing three-action capsule must continue to say minimality unverified; a stronger claim would require an appropriate separately supported experiment and actual conclusive final-neighbor evidence.

Current exact-candidate browser acceptance remains blocked/unrun under the existing capacity/security constraints: the required browser matrix, CLI demo, packaged browser replay and fresh-reset repeatability still need their prescribed evidence. No source/schema/model audit substitutes for those checks. The separate native zoom, screen-reader use and broader research gates remain unchanged.
