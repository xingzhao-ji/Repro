# Repro browser blocker and current application correction

## Subsequent application work — 2026-10-14

After this diagnostic checkpoint, two concrete CLI defects were repaired and independently verified: repeated output could overwrite prior evidence, and thrown export cancellation returned the wrong exit code. The current built export/restart/inspection journey passes; 435 nonbrowser tests pass. [The application increment report](CLI-EVIDENCE-PRESERVATION.md) records exact flow evidence and the current 11/14 capsule comparison. This report's 422-test and 12/14 figures remain valid for its earlier checkpoint. The sandbox blocker and unwaived browser/native/human gates below remain unresolved.

2026-10-14 UTC. Repro's current comparator acceptance is blocked by Chromium sandbox initialization before rendering. GitHub authentication is independently coordinated and is not a prerequisite for the local application checks here.

## Exact failure and supported diagnosis

The [retained launch log](../.repro-runs/cloud-continuation/actual-comparator-browser.log), SHA256 `23869807a13270a6b5e6c234061227e15ddda01104a1114722e688f73d4203a2`, records Chrome Headless Shell 156.0.8078.4/build1248, PID6165, at `1013/235819.483866`: `zygote_host_impl_linux.cc:130`, `No usable sandbox!`, then SIGTRAP. It failed at `tests/ui-hci-comparator.browser.ts:64`, before page creation. The actual packet build and byte-identity check passed; screenshots, keyboard samples and Axe audits are empty.

[Read-only static dependency inspection](../.repro-runs/cloud-continuation/release-triage-v1/browser-metadata.json) resolved five bundled ELF files, 50 unique objects and 157 dependency edges, with zero missing declared shared libraries. This does not establish later dynamic-load or symbol compatibility, but neither the retained failure nor the inspected closure supports a missing-browser/library diagnosis. The failure is an environment sandbox-support blocker; its exact enforcing rule remains unidentified.

The current inspecting process has UID1000, zero capability sets, NoNewPrivs=1 and one seccomp filter. The exact approved profile remains SHA256 `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b` and already permits clone/setns/unshare/chroot. A file on disk does not establish which filter governed the failed process. Its ARM architecture entries alone do not prove x86 incompatibility: runtime handling of native architectures matters. This clarifies earlier checkpoint wording; no architecture edit is justified by the generic error. See [the diagnosis and official sources](../.repro-runs/cloud-continuation/release-triage-v1/browser-report.md).

The smallest supported next action is for the provider to identify the effective exec policy/hash, its attachment layer, and any retained denied-operation/errno event for that PID/time. It must confirm supported non-root Chromium sandboxing under the existing controls. If those exact approved profile bytes were not applied at the intended boundary, confirm their authorized scope before use. Any different inherited-filter/LSM change needs an exact reviewed configuration delta; no such delta is justified yet. Browser sandbox, network isolation, capability limits and no-new-privileges remain unchanged. No browser retry, namespace probe, package reinstall or security escalation was made.

## Application work completed independently

The application did have a diagnostic defect: `doctor` caught every browser error and advised installing the browser or changing channels, including for the saved sandbox error. A new controlled-text classifier now distinguishes sandbox initialization, missing executable, missing system libraries and unknown probe failures. It returns no raw error or private path, keeps the sandbox option true, and preserves uncertainty for unrelated failures. This improves diagnosis; it does not remove the host restriction or claim a browser pass.

Independent tests first established the old behavior's failures, then verified the correction. A subsequent review caught an overly broad distribution-not-found match; an additional failing regression established it before narrowing the match to Chromium's diagnostic. Original red logs, frozen test contracts and final results are retained under `.repro-runs/cloud-continuation/release-triage-v1/`. Controlled CLI tests replace the launch function with a rejecting stub and make Docker unavailable in an owned test PATH; they execute no browser or Docker process.

Final current results: **422 unit/contract tests passed, zero failures/skips**, including **21 diagnostic regressions**; typecheck, lint, build and kit passed. Exact commands, times and exit codes are recorded in [the final command receipt](../.repro-runs/cloud-continuation/release-triage-v1/nonbrowser-checks-final.json). The [independent diagnostic review](../.repro-runs/cloud-continuation/release-triage-v1/browser-diagnostics-independent-review.json) has no remaining findings.

A fresh non-executing capsule export and trusted integrity inspection passed. [Comparison](../.repro-runs/cloud-continuation/release-triage-v1/capsule-current-comparison.json) finds **12/14 files identical** to the exact earlier Linux reference; only `dist/cli.js` and `integrity.json` differ. The prior 401-test checkpoint, eight scoped package checks and 14-file capsule-equivalence receipt remain historical evidence for their exact bytes. The current capsule has not been executed in the prior ARM image or this cloud browser; no new runtime-portability pass is claimed.

## Remaining release work

| Gate | What remains | Supported next action |
|---|---|---|
| R4/R5/R6/R10 comparator fidelity | Actual frozen-packet P/L rendering, exact facts/downloads, keyboard/recovery, responsive captures, Axe and inert/no-network behavior | After provider confirmation, run the unchanged actual-case command below and independently review its output |
| R7 integration/package | Final browser suite and installed exported-readable-test smoke against current source | Same supported sandbox prerequisite; retain existing failures and repair demonstrated defects |
| R5/R10 native zoom | Actual 200% browser zoom | Restore the previously denied supported native-browser surface; CSS scaling/reflow does not satisfy this gate |
| R10 screen-reader workflow | Actual navigation, announcements and task completion | An authorized supported screen-reader/browser workflow; Axe and semantics are insufficient |
| R8/R10 broader research | Independent eligible cases, human-data study preparation and empirical validation | Technical preparation can proceed; recruitment, consent/ethics and participant-data collection require separate study approval |
| R9 final release record | Consolidated current source/build/check identity and later actual browser evidence | Current local records are updated now; retain historical evidence and gate incomplete claims |

Existing bounded core/reduction and trusted ARM results remain valid for their recorded bytes and supported scope. Browser restriction does not block diagnostic implementation, type/lint/unit/contract tests, static builds, packet/privacy checks, export/import contracts or local evidence preservation. No artificial application change is required merely to keep work busy.

Only after supported sandbox availability is confirmed:

```sh
REPRO_HCI_PACKET_PATH=.repro-runs/cloud-continuation/actual-case-redaction-repair-v1/case.json PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers node --import tsx --test tests/ui-hci-comparator.browser.ts
```

Then complete `npm run test:browser` and `npm run test:package`, preserving all results. Native zoom, screen-reader usability and human research remain separate gates. The original migration snapshots and three frozen handoff artifacts remain unchanged; current diagnostic work is preserved as a separate local increment. No authentication or publication action was taken in this triage.
