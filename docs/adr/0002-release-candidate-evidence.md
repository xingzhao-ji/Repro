# ADR 0002 — Preserve executions and distinguish release evidence

Status: implemented for the supported synthetic release candidate, October 15, 2026. Current results and unresolved gates are in [the release report](../../evidence/RELEASE.md).

## Execution ownership

CLI record, replay, reduce and verify now atomically claim a new output directory. Reusing a directory, including an incomplete one, returns the structured input error `OUTPUT_EXISTS` before writing a manifest or starting execution. This fixes an observed defect where a second command replaced the first manifest/result but retained its older artifact directories. Automatic overwrite and implicit resume were rejected because they break historical run association. Workbench startup still reopens its persistent ledger; its jobs already have distinct owned directories. Export retains its existing atomic staging/finalization contract.

Each reducer execution must also have a previously unseen run ID. Matching input, assertion, app and harness digests are necessary but do not make the same execution into two repetitions. Reused identities become INCONCLUSIVE and cannot accept a deletion. The registered browser adapter already creates fresh UUIDs; this closes a demonstrated reducer boundary inconsistency with the evidence inspector.

## Diagnostic resources versus product acceptance

The user's earlier contrast pilot recorded 50 passing controls, 12 provisional passing measurements and 45 unattempted observations, stopping at 899.40 MiB against a chosen 896 MiB diagnostic gate. It lacked a distinct post-close process census. Those results remain historical and incomplete; this checkout did not contain the raw pilot artifacts. They cannot be relabeled as a completed contrast or cleanup pass.

The 896 MiB threshold is not in the original product acceptance contract and does not establish a native product memory budget. A combined measurement of the test loader, accessibility scanner, transport and browsers is not automatically attributable to Repro. This release therefore uses behavioral acceptance, bounded execution and owned-process cleanup evidence, and reports sampled resource observations with their measurement scope. It does not raise the old pilot's cap, reclassify that run, assert a lower continuous peak, or install the mixed-result memory-transport prototypes. A future native memory budget requires a defined workload, measured process set and user-relevant limit. The approved Linux container's 1 GiB limit remains unchanged.

## Offline and portability claims

Installation requires declared acquisition of npm packages, Chromium and platform libraries. Cached `npm ci --offline` plus standalone replay proves operation from an already populated cache, not an offline installer for a clean host. Installed runtime dependencies must resolve inside that capsule. No proprietary viewer, LLM, API key or original application service is required.

The release also saves the verified reduced Linux image with its acquired runtime dependencies. Its archive was integrity-checked, loaded, and replayed in a fresh container/volume on the existing owned daemon. This establishes that import/replay sample; it does not claim a separate physical clean-host import or supply Docker itself. The two offline paths have different prerequisites and are documented separately.

A fresh Linux image/container is checked when executable capsule bytes change. Native success and previous Linux reports are not substitutes. The exact approved seccomp hash and all resource/network restrictions remain mandatory. UI-only changes can reuse the current Linux execution only after comparing all final capsule payload files byte for byte.

## Accessibility evidence

Keyboard navigation, computed contrast, semantic snapshots, Axe and opened screenshots establish only the behaviors actually observed. A route change must give keyboard users a deliberate continuation point; focus indicators need sufficient contrast against their actual surrounding surface. Native 200% browser zoom and actual screen-reader operation remain distinct gates. A blocked browser provider or missing assistive-technology observation capability must be reported, never bypassed or replaced by CSS zoom or an accessibility-tree claim.
