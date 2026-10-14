# CLI evidence preservation and export recovery

2026-10-14 UTC. Current local application increment, following the diagnostic correction in [the blocker report](REPRO-BLOCKER-TRIAGE.md). No GitHub publication, Library operation, credential change, browser launch or security change occurred. Original release criteria in `docs/ACCEPTANCE.md` remain unchanged.

## Repaired application behavior

Repeated `record`, `replay`, `reduce` and `verify` commands previously reused the supplied output directory and truncated its manifest/results. A second run with another seed or timeout could destroy the first run's evidence. Concurrent commands could also write into the same directory. The CLI now atomically reserves a fresh directory and returns input error `OUTPUT_EXISTS` for any existing destination. Evidence files use exclusive creation without truncation. Default run names use UUIDs. Partial run directories remain inspectable; retry requires a new destination. The persistent workbench directory remains reusable across restarts.

Owner cancellation during export already removed its staged artifacts, but its thrown cancellation error escaped through the generic CLI exit-2 path. It now returns the documented exit 130 with the controlled `cancelled` result. Ordinary invalid/inconclusive failures still return 2. Export finalization, cleanup ownership, sandbox settings and frozen assertions are unchanged.

Independent tests reproduced seven output-preservation failures before repair and the wrong cancellation exit before repair. The final 11 new preservation regressions plus existing CLI/path checks pass 22/22. Two export cancellation checks pass 2/2. The cancellation test interrupts a genuinely staged export with a real SIGINT to its owned process; it verifies the absent final capsule, staging/lock cleanup and unchanged neighboring sentinel. A test-only filesystem wrapper pauses the artifact write to make that interruption deterministic; it does not replace the exporter. The direct exclusive-file helper regression was first observed after the repair and is not claimed as a separate red test. Original failed logs remain preserved.

Independent reviews found no remaining issue in the changed ownership/cancellation behavior. Source: `src/paths.ts`, `src/cli.ts`; regression tests: `tests/cli-output-preservation.test.ts`, `tests/cli-export-cancellation.test.ts`. No adapter, oracle, reducer, candidate or assertion changes were made.

## Actual built application flow

The standalone `built-cli-flow.mjs` executed the final built CLI through its real loopback service, with no browser or simulated job completion:

1. Started `dist/cli.js serve` on an ephemeral loopback port in a new owned directory and created an explicitly consenting synthetic session.
2. Started export job `ca9305e2-5cd5-4f42-bcf0-c08bcf495d0f`; the real coordinator finalized its 14-file capsule.
3. Repeated the operation request and confirmed exactly one job, the same frozen input and stable events.
4. Stopped only its owned server, restarted against the same ledger, and confirmed the identical completed job, input, result, event sequence and capsule bytes. Repeating the request after restart still returned that job.
5. Independently checked every capsule artifact's bytes/hash and ran a separate built CLI `inspect --capsule`, comparing its manifest with the persisted session. A read-only SQLite check confirmed one complete consenting session, one complete export job and started/progress/complete events.

All 44 flow assertions passed. Both owned servers exited normally. The entire `dist` inventory remained unchanged. The built CLI SHA256 was `27e3689ac5e8a0ae297129360e6edc296de8859b50e51c61faaa2775c147cc7e`. API request tokens remained in memory and were not logged. This verifies an export/persistence/inspection journey; it does not demonstrate capture, rendering or bug reproduction.

Flow receipt: `.repro-runs/cloud-continuation/cli-evidence-preservation-v1/flow-HROUvP/receipt.json`, 15,689 bytes, SHA256 `64bfc5e8ab4d32b9ea5252ffeaabbd6ef2101d3f1840d66a2b6ad9862b361f0b`.

## Final checks and portability limits

`npm run typecheck`, `npm run lint`, `npm run build`, `npm test` and `npm run check:kit` all passed against the amended implementation. The full nonbrowser suite reports **435 passed, zero failed, cancelled or skipped**. Exact commands, timestamps and logs are in `.repro-runs/cloud-continuation/cli-evidence-preservation-v1/nonbrowser-checks-final.json` and its adjacent logs. Tests are supporting evidence, not a substitute for the actual flow above or the browser gates below.

A fresh current export and trusted inspection using the exact retained Linux reference manifest passed without execution. Eleven of fourteen files match the previously executed Linux capsule. `dist/cli.js`, `dist/index.js` and `integrity.json` changed. The earlier 12/14 comparison and 422-test result apply to the preceding diagnostic checkpoint. No new capsule runtime pass or final package/browser smoke is claimed.

| User flow / acceptance scope | What the evidence establishes |
| --- | --- |
| Manifest validation and inspection | Available in the current CLI; malformed/unsupported inputs fail explicitly. |
| Export, repeat request, restart and capsule inspection | Current built application flow passed as described above. An export is a finalized artifact, not a reproduction verdict. |
| Preservation of failed/incomplete run evidence | Current CLI regressions preserve prior bytes and isolate concurrent commands. Missing-action inputs remain INCONCLUSIVE before browser launch. |
| Capture, intended-failure replay, reduction and buggy/fixed comparison | Retained Mac and trusted Linux arm64 evidence establishes the earlier bounded synthetic slice and 20 buggy/20 fixed repetitions. Current cloud execution cannot establish these outcomes without supported sandboxed Chromium. |
| Frozen comparator build and offline synthetic analysis | Nonbrowser contracts/builds pass. The actual frozen packet's rendered P/L fidelity, interaction, downloads, keyboard/recovery, reflow and Axe checks remain unverified. |
| Fresh current capsule replay and final readable-test/package smoke | Unverified for the current changed executable bytes; require supported sandboxed Chromium. |
| Native 200% zoom and actual screen-reader workflow | Separate unverified gates. CSS zoom, source review and Axe do not satisfy them. |
| Broader cases and human HCI results | Pending eligible independent cases and the separately authorized participant/consent/ethics/data workflow. No empirical benefit or broad generality is claimed. |

The known cloud launch failed before page creation with `No usable sandbox!`. The browser executable and inspected declared libraries are present. The smallest useful external action remains identification of the effective execution policy and retained denial, followed by a legitimately supported sandbox-enabled runner within the approved boundary. The existing approved profile already permits the relevant namespace calls; its ARM entries alone do not establish an x86 incompatibility. No alternative route or unchanged browser retry was attempted.

R1/R2 retain exact historical scope; R3 needs current-byte runtime confirmation; browser portions of R4/R5/R6/R7/R10 remain gated. R8/R10 research claims retain their separate limits. R9 is updated by this report without waiving any original criterion. No additional demonstrated application defect remains from this focused review; the next highest-value acceptance work is the current actual-packet/browser journey once the environment supports it.

## Independent evidence

- `.repro-runs/cloud-continuation/cli-output-preservation-red.log`: original ten preservation tests, three passed and seven failed.
- `.repro-runs/cloud-continuation/output-preservation-v1/independent-review-v2.json`: 22 passing focused checks; SHA256 `ef002c4355355400a4472d0810f23128c7c9418294cb649621b4a42c60196fca`.
- `.repro-runs/cloud-continuation/cli-export-cancellation-v1/red.log` and `green.log`: actual SIGINT regression before and after repair.
- `.repro-runs/cloud-continuation/cli-export-cancellation-v1/green-independent-review.json`: SHA256 `955d0bdb86c7a7a64109aeb7c5bc00192f01e046a39d53d11a377edc638598b7`.
- `.repro-runs/cloud-continuation/cli-evidence-preservation-v1/ownership-cancellation-independent-review.json`: independent actual-diff review; SHA256 `f812452ea1c3e301297d0b01b67bb5462bbc8a31255f50cf4f31f1c7da20bf89`.
- `.repro-runs/cloud-continuation/cli-evidence-preservation-v1/capsule-current-comparison.json`: current 11/14 payload comparison, with no new runtime claim.
