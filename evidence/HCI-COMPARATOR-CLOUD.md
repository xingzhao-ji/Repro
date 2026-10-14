# Cloud comparator repair checkpoint

This retained checkpoint is followed by [current blocker triage and the doctor diagnostic correction](REPRO-BLOCKER-TRIAGE.md), with 422 passing non-browser tests. That report clarifies that the stored ARM architecture entries alone do not establish x86 incompatibility and separates current CLI bytes from prior capsule equivalence. Original run evidence below remains unchanged.

2026-10-14 UTC. Product acceptance remains incomplete. Migration completion is separate from browser fidelity and release completion.

Development continues in `/workspace/repro-development-rv5abotj/repro`, branch `cloud/hci-comparator-redaction`, seeded from Git `0902b3b11af847e2b930cbf091eda0261830efb4` and the verified 167-file working source snapshot. The original migration trees and bare history remain untouched. Node 24.19.0, npm 11.9.0 and Linux x86_64 were observed. About 31.6 GB was available at startup; the earlier Mac ENOSPC is historical, and no storage cleanup was needed.

## Correction and provenance

Seven new behavioral regressions established the defect before repair: one guard passed and six expected failures were retained in [the original red log](../.repro-runs/cloud-continuation/redaction-tests-red.log) and [canonical-marker red log](../.repro-runs/cloud-continuation/redaction-canonical-marker-red.log). The freezer now records both exact withholding markers without changing their text. The validator requires their declarations and still rejects missing, duplicate, wrong-kind and orphan records. Ordinary explanations remain unchanged. Two existing builder cleanup errors now preserve their original cause, satisfying the configured lint rule.

The historical packet is preserved at `.repro-runs/hci-comparator/actual-case-3290e554dc2b/case.json`, SHA256 `11d9e1bac479cf31b375145a1dd12685259e34865a386bea7be527ce964c9293`. The [new repaired packet](../.repro-runs/cloud-continuation/actual-case-redaction-repair-v1/case.json) is 110,557 bytes, SHA256 `2931a3b104efb5410461669cc6115b457831c8ec0a20b55d8509fddd80740c42`, case digest `7c788f5c42087b36c373bea1dce2ac8511b6273a117f124fc37178beb9282b8a`.

The [version-1 provenance receipt](../.repro-runs/cloud-continuation/actual-case-redaction-repair-v1/provenance.json) binds the predecessor and successor. The only evidence changes are appended declarations at:

- `/jobs/4/trials/0/runs/0/reason`
- `/jobs/4/trials/0/runs/0/result/reason`

The packet digest is recomputed. Five jobs, fourteen trials, observations, identities, frozen inputs, source inventory and two inert export documents are unchanged. The cancelled run still has zero assertions and a null observation. This is an accounting repair, not a new target execution or a refreeze. The corrected validator intentionally rejects the old incomplete packet.

The retained ledger records an absolute Mac export path. The freezer's strict owned-path guard would reject a direct cloud refreeze; that guard and the historical path remain unchanged. Explicit packet repair avoids silently rewriting source evidence.

Separate [redaction review](../.repro-runs/cloud-continuation/redaction-independent-review.json) and [packet/provenance review](../.repro-runs/cloud-continuation/packet-independent-review.json) passed. The latter independently reproduced canonical bytes and digests. [Final preservation checks](../.repro-runs/cloud-continuation/final-preservation.json) confirm all 919 original migration files (70,075,967 bytes), all 752 copied historical evidence files (68,842,120 bytes), and the original bare main remain unchanged. All 34 packet-declared source files also match.

## Executed checks

| Check | Observed result |
|---|---|
| Official locked dependency setup | `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache .repro-cache/npm`: 115 packages installed; lockfile resolved hosts are solely registry.npmjs.org |
| Focused case/freezer/builder | 227 passed, zero failed/skipped: [log](../.repro-runs/cloud-continuation/case-build-green.log) |
| Final full unit/contract suite | 401 passed, zero failed/skipped: [log](../.repro-runs/cloud-continuation/unit-full-after-build.log) |
| Typecheck, lint, build, kit | Passed: `typecheck-final.log`, `lint-final.log`, `build.log`, `kit.log` under `.repro-runs/cloud-continuation/` |
| Independent adversarial packet review | 15 additional checks passed; no weakened privacy/path/source guards found |
| Actual P/L build | Complete study artifacts generated and source-packet byte identity checked before browser launch |
| Actual P/L browser fidelity | BLOCKED before rendering: Chromium reported `No usable sandbox!`; one pre-browser assertion passed, zero screenshots/Axe/keyboard samples |
| Capsule equivalence | Fresh export using the exact historical Linux input matches all 14 retained image capsule files byte for byte; no new Linux execution claimed |
| Scoped fresh package contract | All eight subprocesses passed: archive inspection, fresh install, installed CLI/bin help, synthetic manifest, export and trusted inspect; full browser smoke remains blocked |

The initial full suite ran before its required build and produced 389 passes and twelve missing-`dist/cli.js` failures. [That log](../.repro-runs/cloud-continuation/unit-full.log) is preserved. After the build completed, the full suite passed. The initial lint log retains the two missing-cause findings before correction.

The first capsule comparison used the study's historical 1,500 ms input against a different Linux 10,000 ms input; twelve of fourteen files matched. The [input difference](../.repro-runs/cloud-continuation/capsule-manifest-difference.json) and non-equivalence receipt remain preserved. Re-exporting the exact Linux input established [all fourteen byte matches](../.repro-runs/cloud-continuation/linux-reference-capsule-equivalence.json). This does not establish that the study's different input was executed in that Linux run.

The [final verified implementation inventory](../.repro-runs/cloud-continuation/verified-source-inventory-v3.json) binds fifteen relevant source/test/lock/policy files, aggregate SHA256 `ff71dc44fb199e6c2245db0875fc37940f177af29fc20d5e2530c4954cbfe013`. Earlier inventory versions remain preserved.

The [scoped package receipt](../.repro-runs/cloud-continuation/package-install-contract-v1/trusted-completion-receipt.json), SHA256 `8e080ed9d559c51d4614dd51ed429315f874a8314b25683f799cb4e433e5ab30`, records eight successful subprocesses. The retained package contains 61 files, 829,645 compressed bytes, SHA256 `f2ffaf9144c5eb47a93603e1e8f960032876ad6ab768f88632985bf1ecb096f4`. Installed files and lockfile match; five runtime dependencies came from the official npm registry. The package predates the final checkpoint documentation; its executable payload is unchanged. Initial archive-allowlist, routing and CA-trust failures remain preserved. The minimal package-smoke subprocess environment now inherits only existing standard proxy variables and `NODE_EXTRA_CA_CERTS`, preserving managed routing and TLS verification without passing unrelated credentials. No browser or target execution is claimed by this scoped contract.

## Browser/security gate and next action

Exact attempted command:

```sh
REPRO_HCI_PACKET_PATH=.repro-runs/cloud-continuation/actual-case-redaction-repair-v1/case.json PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers node --import tsx --test tests/ui-hci-comparator.browser.ts
```

[Failure log](../.repro-runs/cloud-continuation/actual-comparator-browser.log) and [summary](../.repro-runs/hci-comparator/verification/actual-3be11fb2-36b5-4d13-a96e-083ab27b64a4/summary.json) preserve the attempt. Browser launch kept `chromiumSandbox: true`; no alternative browser, disabled sandbox, capability grant, policy edit or Docker execution followed the failure. The test retains local-file loading and HTTP blocking.

[Read-only host inspection](../.repro-runs/cloud-continuation/sandbox-readonly-inspection.json) found UID 1000, zero effective/bounding capabilities, NoNewPrivs=1 and one seccomp filter. The specific rejecting host rule was not established. The existing approved profile's SHA256 remains `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`; its architecture list is AARCH64/ARM, whereas this host is x86_64. An architecture-adjusted profile would be a new policy scope/hash and is not approved by the ARM receipt. No such profile was created or applied.

The coordinator/host owner must establish a supported sandbox-enabled cloud runner under the preserved boundary before another browser attempt. The exact host-policy change cannot be safely specified from the launch error alone; no generic capability, namespace or sandbox bypass is requested. Once legitimately available, rerun the command above and independently inspect actual P/L screenshots, parity, keyboard and Axe results.

Full browser integration, the browser portion of package smoke, native 200% browser zoom, actual screen-reader usability and participant research remain unverified or gated. CSS scaling and viewport reflow are not native zoom. Earlier Mac/ARM evidence remains historical evidence, not a fresh cloud pass.

The current coordinating instruction pauses credentials and all external publication. It overrides the older private-push allowance in GOAL.md for this continuation; the goal and original safety gates were not edited away. No GitHub write, Library upload, credential change, participant contact, public hosting or Mac operation occurred.

Development is paused at the owner's request for a metadata-only check of the dedicated public GitHub secret. `OSS_GITHUB_PUBLIC_TOKEN` is absent from this running task. No tool exposes the environment request or domain-binding metadata, so neither an exclusive `api.github.com` binding nor the token's exact scope has been verified. No authenticated request with that key was attempted. The checkout and all evidence remain retained for continuation; a fresh task after environment republication must receive an explicit handoff rather than assume this task's uncommitted files are in the published environment.

A later coordinating instruction authorizes a separate private Library handoff of current source, patch and new review evidence, plus read-only sandbox diagnosis; GitHub publication remains paused. A reported notification describes a new PAT with broad scopes, but its relationship to the vault entry and current scope are unknown. The owner must resolve that mismatch privately before use or binding changes; see [the updated hold](../.repro-runs/cloud-continuation/authentication-hold-v2.json). No secret value was read and the existing integration remains unchanged.
