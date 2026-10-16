# Startup cleanup ownership — partial safety repair

Continued from clean `3e1b2b7aff1338227918757e512f3a0b2b63a380` and its parent `bcc67d2b68438eb35fe96364217e7c4b0c8f9f3a` on `task/startup-cleanup-ownership`. Implementation commit: `51ee29a`. Accessibility remains deferred/unverified. This is not completed startup cleanup or practical-beta acceptance.

## Established defect and narrow repair

Before the repair, `runCaseBrowser()` joined launch rejection, normalized execution rejection, and deleted the owned profile without an owner-completion acknowledgment. Pinned Playwright 1.64.0 can reject before its cleanup completes: `node_modules/playwright-core/lib/coreBundle.js:41157` and `:41284` await cleanup through `progress2.race(...)`, whose implementation at `:12994` races the already-rejected `_forceAbortPromise` too. A rejected launch returns no context or process handle to the adapter.

The new deterministic regression controls that public launch boundary and uses a real task-owned Node child. Immediately before the adapter's profile removal, the child successfully writes through a pathname inside that profile; it stays alive until explicitly stopped by the test. Both ordinary launch rejection and owner cancellation reproduced unsafe deletion. This establishes the ordering violation without inferring OS process state from Node exit-event delivery or a compiler cache. It does not establish the errno or exact cause of the historical startup deletion failure.

`src/case-adapter.ts` now records launch attempts and retains the profile when no context was acquired. It returns `CLEANUP_FAILED` while preserving the sanitized original setup/cancellation recovery message. It still joins delayed acquisition and uses the unchanged 2,000 ms context-close and 1,000 ms execution-drain budgets. No extra wait, late deletion, global cleanup, process signaling, security change or acceptance relaxation was added. This guard addresses rejected launch without a context; it is not proof of owner completion for every possible already-closed-context path.

`tests/startup-ownership.test.ts` covers rejected launch with/without cancellation, delayed successful launch, rejected close, and process termination after the existing close budget. Late termination cannot erase the returned failure or delete the retained profile. Test cleanup stops only its own controlled child. Existing cleanup assertions were not changed. Independent source/test review found no defect in the new guard and confirmed the remaining completion-contract gap.

## Executed checks

Raw logs are preserved under ignored `.repro-runs/startup-cleanup-ownership/`. A clone without those logs cannot claim to have reverified them. These checks used macOS arm64, Node 26.7.0 and pinned Playwright 1.64.0; they do not establish fresh-environment export acceptance.

| Check | Actual result | Log |
| --- | --- | --- |
| New regression before production repair | 3 passed, 2 failed on live-owner deletion | `red.log` |
| New regression after repair | 5/5 passed | `green.log` |
| `npm test` | 322 passed, 1 failed, 323 total | `ordinary-tests.log` |
| `npm run typecheck` | Exit 0 | `typecheck.log` |
| `npm run lint` | Exit 0 | `lint.log` |
| `npm run check:kit` | Exit 0; 7 fixture checks, structural scope only | `check-kit.log` |
| `npm run build` | Exit 0 | `build.log` |
| `PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers node --import tsx --test --test-concurrency=1 tests/case-adapter.browser.ts tests/case-faults.browser.ts` | 13 passed, 2 failed, 15 total; diagnostics disabled | `affected-browser.log` |

The ordinary failure is the existing `browser home and font caches stay owned when launch fails after creating files` deletion assertion. Its fake launch rejects without giving the adapter a shutdown acknowledgment. The browser failures are the unchanged 100 ms deadline and missing-browser profile-removal assertions. They now expose the conservative retention policy instead of attempting unsafe deletion. These are failures, not waived requirements. All three pinned buggy/fixed assertion tests and actual-navigation cancellation/unrelated-browser liveness/recovery passed in the affected selection; that small selection is not a stability cohort.

The new browser failure evidence is under `.repro-runs/practical-beta/case-faults/55ab6ce0-6865-4476-8bd7-3dcf26b13713/`:

- `deadline/35060965-1250-4abe-b352-80e7063e4b70/evidence.json`: `CLEANUP_FAILED`, original `DEADLINE` retained, 101.368834 ms adapter duration, zero assertions, profile retained.
- `missing-browser/bc4e94d1-0733-4d98-908c-113339fd5b13/evidence.json`: `CLEANUP_FAILED`, original `BROWSER_UNAVAILABLE` and install instructions retained, 18.591375 ms adapter duration, zero assertions, profile retained.

The exact security policy remains `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`. No denied route, container workload, broad diagnostic cohort or acceptance retry was run. Prior commits, profiles and failed receipts were not modified.

## Remaining work and verification gate

The missing primitive is a **per-launch acknowledgment that all owned runtime use of the profile has ended**, available even when acquisition rejects or times out. The reviewed public launch API does not provide it. Process-global Playwright cleanup would violate concurrent ownership; merely waiting longer, trusting an error-message regex, or removing the profile after a late unobserved callback is not a repair. A complete implementation needs an independently owned launcher completion boundary or a dependency contract exposing completed failed-launch cleanup, validated against the same delayed/rejected/late cases and unchanged budgets. No approval or service denial is blocking these tests; the implementation contract is incomplete.

The original htmx fixed repetition-15 shutdown failure remains separately unresolved. Its missing observation is the failed close helper branch (rejection versus timeout), eventual close settlement, and the owned process/profile state at those boundaries. Neither this deterministic launch defect nor the successful previous diagnostics connects that shutdown failure to startup cleanup. The original startup deletion failure's errno and correlated owner state also remain unknown; no cause is inferred from earlier event ordering.

Because relevant checks failed, the documented fresh acceptance cohort was **not started**. Remaining verification after a complete repair: rerun the unchanged ordinary and affected browser checks; rebuild and freeze current capsules through all three native workflows; run complete fresh native 20 buggy/fixed pairs per case, including all 20 htmx pairs; run the fresh Linux arm64 isolated export workflows/stability under the unchanged approved profile and an initially empty owned daemon; run affected installed-package verification. Existing frozen thresholds apply. Historical failed cohorts and later diagnostics remain separate. No new stability, fresh Linux, package, remote CI, release or accessibility result is claimed.
