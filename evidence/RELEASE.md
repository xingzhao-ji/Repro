# Local release evidence

## Current application increment — 2026-10-14

The final built CLI now preserves earlier run evidence across repeated/concurrent commands and reports export cancellation as exit 130. An actual export/deduplication/restart/inspection flow passed with a real 14-file capsule; all 435 nonbrowser tests and final typecheck/lint/build/kit passed. See [CLI evidence preservation](CLI-EVIDENCE-PRESERVATION.md) for exact observations, independent reviews and the distinction between usable export flows and Chromium-gated capture/replay/UI acceptance. Current capsule identity is 11/14 files versus the historical executed reference; no current-byte runtime pass is claimed. The original release criteria remain intact, and older notices below retain their historical scope.

## Current cloud continuation — 2026-10-14

The historical release record below remains evidence for its recorded source. Current comparator and diagnostic work is described in [Repro blocker triage](REPRO-BLOCKER-TRIAGE.md). Chromium fails before rendering with `No usable sandbox!`; static inspection found no missing declared browser libraries. The exact host policy remains unidentified. The application's misleading `doctor` installation advice is corrected and verified with controlled non-browser tests; this does not resolve or bypass the environment restriction. Current command receipts, remaining release gates and the provider's smallest supported next action are linked in that report. Authentication has separate coordination and does not gate local Repro engineering.

## Retained inspector and analysis release

The selected-run evidence inspector is implemented and technically verified for the registered synthetic stale-response frontend. Inspector checkpoint checks: **101 unit/contract tests, 29 browser tests**, build, kit, strict typecheck, lint and installed-package smoke passed with zero failures/skips. The final exported capsule is byte-identical to the fresh Linux image that passed buggy/fixed assertions under the approved policy. The VM is stopped. [Detailed HCI evidence](HCI-INSPECTOR.md), [portable check index](hci-inspector-summary.json), [Linux evidence](LINUX-PACKAGED.md).

Native 200% Chrome zoom remains gated, actual screen-reader usability and human study are unrun, and the study comparator and human-study analysis remain pending. These do not become passes from screenshots, Axe or CSS zoom. The product remains a local synthetic alpha, with no arbitrary-site recorder, PostgreSQL adapter, arbitrary patch executor, historical-bug corpus, hosted service, LLM dependency or API key requirement.

The subsequent [offline analysis instrument](HCI-ANALYSIS.md) passes 73 dedicated regressions and 174 total unit/contract tests. Its source/test/fixture inventory is separate; the prior 81 runtime files remain unchanged.

## Gate status

| Gate | Current result | Evidence and limits |
| --- | --- | --- |
| R0 kit/provenance | Passed | Seven supplied fixture tests and structural checks; distinct from browser execution |
| R1 behavioral core | Passed in supported fixture | Frozen assertion, actual browser observations; prior 20 buggy/20 fixed repetitions retained, protected core unchanged |
| R2 reduction | Passed bounded checks | Dependencies, repetitions, cancellation/budgets and adversarial cases; no global minimality claim |
| R3 portability | Passed trusted Linux arm64 scope | Fresh image/container/volume, one assertion per revision, exact policy and final payload equivalence; cached dependency layers reused |
| R4 persistence/recovery | Passed tested scope | Immutable historical inputs, interruption/retry, exact job/trial selection, late-response protection and focus preservation |
| R5 UI | Technical workflow/reflow passed; native zoom unverified | Real keyboard workflow, 390/768/1024/1440 captures, keyboard overflow access and automated accessibility; no screen-reader usability claim |
| R6 privacy/isolation | Passed applicable trusted-synthetic checks | Bounded owned file reads, allowlisted fields, malicious inputs, preserved container restrictions; no hostile-workspace/authenticity claim |
| R7 code health | Passed | Current 174 unit/contract tests and typecheck/lint; retained 29-browser/build/package evidence for unchanged runtime; zero skips |
| R8 benchmark integrity | Synthetic only | Historical bugs, real users, adoption and generality unestablished |
| R9 release evidence/delivery | Local evidence retained; private source delivery authorized | Inspector checkpoint cc52c80 delivered; subsequent offline-instrument increment push/readback pending at report preparation; no remote CI configured |
| R10 HCI | Inspector and technical checks delivered; research incomplete | Research/protocol drafts, 156 workflow assertions and 7 clean Axe samples; offline synthetic analysis instrument tested; comparator, broader tasks, inferential analysis and human validation pending |

## Provenance and verification boundaries

macOS arm64: Node 26.7.0, npm 11.19.0, TypeScript 6.0.3, Playwright 1.64.0, pinned Chromium 156.0.8078.4. Linux arm64 uses the pinned Node 26.7.0 Bookworm image. Exact package versions remain locked; no dependency change was introduced in this HCI increment. [Dependencies](../docs/DEPENDENCIES.md).

Final 81-file runtime source/build aggregate: `c263f4380f8a6dad58f9403df0135ad34f313a9c24518c1752e744529c67c65d`. [Final inventory](../.repro-runs/hci-increment/final-capsule-equivalence-e12c8561a6ee/final-content-hashes.json). The original Linux freeze and subsequent UI-only differences are separately preserved; all 14 capsule files match the actual executed image. Release prose is excluded from the runtime inventory to avoid circular hashes. The assertion remains `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711` and the packaged harness remains `f93f38c955f28a3d23057860730e3222d24608cdc31e61c025cc183576ad1695`. [Linux portable result](linux-hci-summary.json).

Read-only inspector checks validate selected trial association and observations within the trusted local workspace. They do not independently re-execute every ancestor trial or authenticate a hostile local ledger. Missing evidence stays INCONCLUSIVE; recorded acceptance is labeled historical metadata. The original reducer, adapter, oracle and security policy remain unchanged.

The exact approved seccomp SHA-256 is `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`; its sole addition to the prior namespace profile is chroot. All other VM/container restrictions were preserved, no broader permission or browser protection changed, and no further security change was needed. Native `ERR_BLOCKED_BY_CLIENT` remains separately unresolved. [Native gate](NATIVE-ZOOM-GATE.md).

## Delivery and retained history

The user explicitly approved private source/tests/assets/docs/history delivery to [xingzhao-ji/Repro](https://github.com/xingzhao-ji/Repro), without force or visibility change. The first checkpoint 9399a6c is published and backed up in private Library. [Delivery report](GITHUB-DELIVERY.md). Inspector checkpoint cc52c80795ff9696297309b836d651b35492a4e7 was subsequently published and its remote HEAD/main verified; GitHub reports zero statuses, check runs and Actions runs for that commit. At report preparation the later offline-instrument increment push/readback is pending. Consult subsequent receipts under `.repro-runs/delivery/` to establish actual remote commits; a successful local test is not a CI result. No GitHub Actions workflow is configured. No hosted runtime was deployed.

Raw traces/screenshots/VM files and private machine configuration stay local and ignored. Local evidence links require this workspace. Earlier observations remain in Git history and [completion audit](COMPLETION-AUDIT.md), [historical independent review](INDEPENDENT-REVIEW.md), [historical security review](SECURITY-REVIEW.md), [historical visual review](VISUAL-REVIEW.md) and [pre-implementation HCI review](HCI-REVIEW.md). Failed red tests and harness diagnostics are retained alongside green results, not silently reclassified.
