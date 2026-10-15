# Independent review of the retained oracle model evidence

This review inspected `oracle-audit/fixture-model.mjs`, its frozen plan and hashes, both full raw stdout/stderr files, the two command receipts, and the unchanged production oracle/fixture sources. It did not execute the model, product, browser, listener, or network. The separate `oracle-model-evidence-review.json` contains 196 independent artifact/record checks; all passed. Earlier `FINDINGS.md` and `source-inventory.json` were preserved unchanged.

## Findings

No blocking issue was found within this deliberately limited model's stated scope.

- The driver imports the actual `src/oracle.ts` (`fixture-model.mjs:20-21,111-120`) and calls its actual assertion. It verifies the frozen assertion digest and source inventories before and after execution (`:12-21,157`). The reviewed oracle source SHA256 is `f69cf7d3585975ceaf289088c3b5ca9ffc5fa43a71ed4b4e3af88a14ac1fb4c7` and assertion digest is `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`.
- It reads the exact unmodified registered buggy JavaScript and executes it in a new Node VM for each initialized case (`:22,37-79,141`). The deliberately fake DOM exposes only the members this script uses; fetch promises resolve only when explicitly instructed. It neither imports nor executes the browser adapter, and its source contains no actual socket/network/listener operation. The current oracle import transitively imports only its contracts and Node built-ins, not the browser adapter or fixed fixture.
- The initial request ID, completion list, visible query and empty result/error elements are checked against the actual page HTML (`:23-31`). Seven cases initialize a fresh VM; the no-navigation case deliberately initializes no fixture and supplies no observation or oracle verdict (`:134-153`). Eight cases per command therefore does not mean eight browser or fixture executions.
- Actual model observations are collected from state changed by the unmodified fixture (`:83-107,144-153`). Expected values are assertions on those outputs; they are not substituted as the oracle input. The direct changed-expectation control requires the real oracle's `ORACLE_CHANGED` exception (`:155`). Each command records seven case-level oracle invocations plus this one negative control.
- Raw records match the expected request IDs, query, result replacement order, controlled completion order, event counts and oracle classification. Navigation-only and alpha-only states cannot meet the frozen latest-beta observation. The full experiment after both completions observes stale Alpha and raises the intended target failure.
- The beta-only control issues request ID 1 with query beta. This is intentionally outside the production allowlist and outside the actual dependency-closed neighbors. The model's permissive in-memory fetch does not establish production execution of that path; the plan explicitly labels the distinction.
- The intermediate full-after-beta model state satisfies the value oracle while completion is only `[2]`. This is not a completed adapter experiment. Production `adapter.ts:217-228` requires the original `[2,1]` checkpoint before the oracle runs. The later modeled Alpha completion overwrites the results and produces the target failure. This control correctly illustrates why moving the assertion earlier would change the experiment.

## Evidence identity

The model source SHA256 is `a22fc11770f6800b0dbcd6ea39b50ab47cc53ab0bcc3daf9cf3ff212a24bc6dd`; the frozen plan SHA256 is `59ddbe5bb2cec80366783b00c598f67348e3084f605b4598903ac7ae6e7fa234`. All 11 recorded input hashes/lengths still match current source bytes.

The two full stdout files are byte-identical, 10,603 bytes each, SHA256 `a9b4c13bfb1393b85860e6be44fc33ba70986736530197a491efe8f380911161`. Both stderr files are empty. The retained receipts record exit 0, no limit violation and durations below 0.15 seconds, within the declared 60-second/1-MiB bounds. The source, receipts and raw output hashes agree. This reviewer verified the resulting bytes and receipts; it did not independently rerun the commands or attest to their original process-level limit enforcement.

## Limits and decision

The model does not emulate browser actionability, trusted events, navigation, rendering, CSP, HTTP, browser scheduling or fresh-browser isolation. A pending modeled fetch promise is intentionally an inert in-memory promise, not a browser/server resource. No fixed-browser comparison or real-browser repetition is present. The two identical model outputs establish repeatability of this finite offline model run, not general determinism or capsule minimality.

The model evidence supports the static diagnosis that removing required actions does not produce a valid frozen-oracle pass. It does not justify removing MISSING_STEPS, altering the response schedule, weakening the assertion, or claiming final-neighbor minimality. The separate schema-only defect and release requirements remain as stated in `FINDINGS.md`.
