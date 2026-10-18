# Repro 0.2.1-beta — independent cloud verification

Verified October 18, 2026, approximately 07:08–07:16 UTC (October 18, 00:08–00:16 Pacific).

## Verdict

**Do not treat this release as fully independently verified or merge-ready yet.** Its ordinary tests and static checks pass in this cloud environment, but three export/handoff defects were reproduced without a browser and one further classification issue was identified in source. Browser-based end-to-end verification remains blocked here. No product source was changed or pushed.

## Identity and method

- Private repository: https://github.com/xingzhao-ji/Repro
- Release tag: `v0.2.1-beta`
- Release commit: `42d2b32fb8ee5e99e5fb21006d3ac4827ffc931e`
- Later evidence-only branch commit: `a4be003cde5a28233eead3e97c8f9aa843e632d5`
- Source retrieved through the authorized GitHub connector, not an authenticated Git clone. All **398 tracked file blobs** were reconstructed and verified against Git blob SHA-1 identities. A post-test integrity check found **zero tracked-source modifications**.
- Environment: Linux x86_64; Node v24.19.0. This differs from the author's macOS arm64/Node 26.7.0 acceptance environment.
- An independent reviewer inspected the report/export implementation. An independent fixture author created a fresh checkout-calculator case without examining Repro code, documentation, parser, or tests.

## Independently passed

| Check | Observed result |
|---|---|
| `npm ci --ignore-scripts` | Pass, 115 packages installed |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run build` | Pass |
| `npm run check:kit` | Pass |
| Ordinary tests via `node --import tsx --test tests/*.test.ts` | **449/449 pass; 0 failed/skipped/cancelled**, approximately 69.4 seconds |
| Focused parser/redaction/report/input tests | 21/21 pass; included in the later full 449, not additional coverage |
| Source-built `npm pack --ignore-scripts --json` | Pass |
| Install source-built tarball in separate empty project | Pass, with a task-local npm cache |
| Installed CLI `--help` | Pass |

The initial `npm test` wrapper failed before tests because tsx's Unix IPC socket was denied. The direct Node/tsx loader ran the unchanged test files successfully inside the existing sandbox; no socket restriction or security setting was disabled. An attempted elevated execution could not initialize its environment and was not used.

## Findings requiring attention

### 1. Expected-value redaction corrupts the exported assertion and leaves personal data in narrative

**Reproduced at code level.** A synthetic non-example email expected value becomes `[redacted email]` inside the generated regression assertion, but the original address remains visible in the report narrative. This can make an otherwise correct application fail the exported test while still leaking the value the redactor intended to protect.

Relevant source: `src/report-flow.ts:333–337,356–357,424–427`, `src/report-test.ts:61–63`, `src/redaction.ts:84,94`.

Repair: parameterize withheld expected values and selectors structurally; preserve assertion meaning; redact narrative separately. Do not blind-replace strings across executable code. Add fail-before/pass-after regressions.

### 2. Unquoted repository metadata becomes executable shell syntax

**Reproduced with a harmless local stub, no network.** The generated clone command allows shell substitution from a repository URL. Subdirectories containing ordinary spaces are also emitted as broken `cd` commands. Merely displaying the report does not execute this; the danger arises when a recipient copies its commands.

Relevant source: `src/report-markdown.ts:107–108,188`, `src/app-inspect.ts:181–182`.

Repair: shell-quote every data argument, defend against option-like values, and test spaces, quotes and substitutions. Treat repository metadata as untrusted data.

### 3. Extractor follows a preexisting `.repro` symlink

**Reproduced in task-owned temporary folders.** When `.repro` points to a sibling directory, extracting a valid hashed block writes the new file there instead. Exclusive creation prevents overwrite but does not confine the write to the intended directory.

Relevant source: `src/report-markdown.ts:86–91`.

Repair: reject symlink/non-directory destinations and validate the real destination before exclusive file creation. Test symlink destinations in addition to lexical `../` traversal.

### 4. Fresh-check classification can mislabel results

**Source-confirmed logic issue; not reproduced through a browser.** The intermittent branch assigns `reproduced` to a different failure. Some branches describe a satisfied observation as a passed test without requiring exit zero, even though teardown can fail after the observation is printed.

Relevant source: `src/report-flow.ts:574–580`, `src/report-test.ts:162–166`.

Repair: require a compatible observation AND process exit status; distinguish different failures from the recorded bug and separate teardown failures from successful verification.

See `evidence/independent-code-review.md`, `review-proofs.mts` and `review-proofs.json` for exact proof details. All proof addresses and shell actions were synthetic; no owner credentials were involved.

## End-to-end attempt and exact blockers

A new held-out app was frozen at commit `51c9853912a3be6378ba3595bad36b0b156b8610` before any Repro trial. Its ordinary checkout workflow selects two boxes, then Pickup. Correct total: $48.00 with $0 delivery fee; deliberately buggy total: $54.00 with $6 fee. Its author independently checked calculations and server routes, not browser behavior.

Repro correctly parsed the three actions and two expected values. The report-generation attempt then returned exit 2 / `needs-input`, with `report: null`, requesting the pinned browser. **No held-out reproduction, exported report, fix verification, or browser UX pass is claimed.** The frozen app remains unchanged.

- The required Playwright Chromium 156.0.8078.4 download returned a 195-byte HTML `Site Unavailable` response rather than a ZIP. The installer failed. The preinstalled Chromium 154 was not substituted as if it were the pinned browser.
- `repro doctor` reports browser unavailable and Docker unavailable. Its process exit is zero; that alone is not readiness.
- The exact original release tarball is not available from a GitHub Release or the retrieved Library files. Author's recorded SHA-256: `8dbb80096221846cdf88aa318550d4bfb4ea507f299d8f9b9e5fa6260f565560`, size 1,895,799 bytes. Our source build: `0491b6c7c07aa3aa6d860f3ec1b94e4d4aa2d2963948e144a8ea59f98d61f40f`, size 1,896,455 bytes. They differ; no cause or original-byte equivalence is claimed.
- Original shopping-list, cafe-orders and pantry-scale application repositories and controlled fixes are absent from the Repro repository. Their reports alone do not supply those applications. They are needed to repeat the author's exact recipient trials.

## Correction to the supplied completion summary

The pinned release evidence explicitly says pantry-scale succeeded **post-hoc**, after its earlier failure informed implementation changes. It is not successful untouched held-out effectiveness evidence. Independent final-code review and Linux verification were also explicitly absent from the original release evidence. Those qualifications must not be erased by the separate “goal achieved” summary.

## Recommended next steps

1. Give Claude the four findings and proof bundle. Fix each with a demonstrated failing regression, preserving current functionality and security boundaries.
2. Rerun all 449 ordinary tests and the browser suite after repairs. Record any changed test totals, deferred accessibility cases and exact artifact identities.
3. Provide the original tarball and original test application repositories/reports, excluding credentials and dependency folders, for exact artifact and recipient verification.
4. Run the frozen new holdout against the repaired pinned artifact in an environment with the required browser available. Do not tune the product to its outcome and then relabel the rerun as held-out success; if tuning is needed, reserve another unseen case.
5. Complete report-only recipient failure → unchanged-test pass, browser UX, cancellation and cleanup checks before declaring the entire workflow independently verified.

No merge, push, deployment, security-setting change, or author-session control was performed.

## Source links

- [Release evidence](https://github.com/xingzhao-ji/Repro/blob/a4be003cde5a28233eead3e97c8f9aa843e632d5/evidence/REPRO-REPORT-0.2.1-RELEASE.md)
- [Local application scope](https://github.com/xingzhao-ji/Repro/blob/42d2b32fb8ee5e99e5fb21006d3ac4827ffc931e/docs/LOCAL-APPS.md)
- [Sample report prerequisites](https://github.com/xingzhao-ji/Repro/blob/42d2b32fb8ee5e99e5fb21006d3ac4827ffc931e/docs/examples/README.md)
