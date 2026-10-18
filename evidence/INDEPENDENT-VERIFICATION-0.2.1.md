# Response to the independent verification of v0.2.1-beta

The independent cloud verification of `v0.2.1-beta` (October 18, 2026, Linux x86_64, Node 24.19, npm 11.9.0) is preserved verbatim in [independent-verification-0.2.1/](independent-verification-0.2.1/). The bundle as received:

- `Repro_Independent_Verification_Evidence.zip`, SHA-256 `65f4d632…`;
- `INDEPENDENT_VERIFICATION.md`, SHA-256 `ad5888c2…`.

Both are kept in `~/Developer/repro-acceptance/independent-verification-0.2.1/`. Everything below was done by the implementing agent, so it is not independent.

## The four findings: all fixed

Each fix has a regression in `tests/independent-verification.test.ts` that failed before it.

| # | Finding | Fix (commit `a4c63dd`) |
| --- | --- | --- |
| 1 | Redaction rewrote the exported test (an email expected value became `"[redacted email]"`), while the narrative kept the value | Redaction never rewrites test code. Repro asks before running when an expected value or an element name looks like a credential or personal data. A test that would still contain such data is refused (`SENSITIVE_TEST_DATA`). The title and the expectation table are redacted as narrative |
| 2 | Repository data in the commands was shell-interpreted (`$(…)` in a remote URL), and `cd app folder` broke | Every data argument is one quoted shell word, `git clone --` ends git's options, and the clone folder is never `.`, `..` or option-like. The test runs the generated block with a stub `git` |
| 3 | The extractor followed a `.repro` symbolic link | The extractor refuses a `.repro` that is a link or resolves outside the app folder |
| 4 | The fresh-check verdict conflated a different failure with the recorded one, and passed a satisfied observation without exit 0 | A run counts only when the observation and the exit code agree. A different failure gets its own **different** status |

One reviewer note was adopted: REPRO.md now says that the fresh-checkout check clones the local repository, so it does not prove the recipient can fetch the commit.

## A fifth defect, found by the new held-out run

The held-out report printed its `origin` remote, a temporary local path that contained the reporter's username. Remotes that are folders on the reporter's machine are no longer printed (commit `3897ce2`, regression test 5).

## Tarball difference

The verifier's source build of `v0.2.1-beta` (`0491b6c7…`, 1,896,455 bytes) differs from the release tarball (`8dbb8009…`, 1,895,799 bytes). Their `npm pack` listing and the release's have:

- the same 211 entries;
- the same per-file sizes;
- the same unpacked size, 8,548,106 bytes.

So the difference is in the compressed archive. Different npm and Node zlib versions (11.9.0/Node 24 against 11.19.0/Node 26) are a plausible cause; **this is not proven**. Per-file SHA-256s of the contents are planned for the 0.2.2 evidence, so equivalence can be checked file by file.

## The new held-out app (Harbor Pantry), on the 0.2.2 candidate

- **The candidate:** rc1, commit `b7be19f`, tarball SHA-256 `a467d85c…`, in `~/Developer/repro-acceptance/release-0.2.2/`.
- **Integrity:** the frozen app was restored from its bundle at `51c9853912a3be6378ba3595bad36b0b156b8610`, and all 9 freeze hashes verified, `fix.patch` included. The app's source and the fix were not read before the report existed. All 0.2.2 changes were committed before the run, and none was made for this app.
- **The input:** the issue's actions, written in Repro's grammar by looking at the rendered page:

  > Open the app / Select "2 boxes" from "Quantity" / Select "Pickup" from "Delivery method"

  The checks were `"Subtotal" should show "$48.00"`, `"Delivery fee" should show "$0.00"` and `"Total" should show "$48.00"`. The start command was `node server.js`.
- **The result, through the installed workbench page:** **Reproduced on the first attempt**, 4/4, with no questions asked. Observed: subtotal `$48.00`, delivery fee `$6.00`, total `$54.00`, exactly as frozen. The fresh checkout reproduced. Selecting Pickup changed no checked value, and Repro correctly kept that step rather than shortening it away.
- **The recipient workflow:** a fresh clone, an empty HOME, and only REPRO.md's commands. The test exited 1 with "This is the failure recorded in REPRO.md". After the sealed fix (SHA-256 `27e99f34…`), the unchanged test exited 0.

On the same candidate, the packaged acceptance passed 8/8: shopping-list and cafe-orders reproduced, the canaries were absent, not-reproduced was reported correctly, cancellation worked, and both recipient runs passed. The post-hoc pantry-scale run was also Reproduced.

## Not done yet

- **The 0.2.2 release.** The rc2 tarball (after `3897ce2`) has not been packed; acceptance on that exact tarball, regenerated examples, per-file SHA-256s, the tag and the release branch are still to do.
- **The merge to `main`.** It awaits the owner's approval.
- **Independent checks.** No independent review of these fixes, Linux browser run, coding-agent trial or accessibility check exists.
