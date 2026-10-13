# Current Linux capsule verification

The HCI package at `.repro-runs/linux-hci-final/20261013-ebe20840191f` passed in a fresh image/container and named evidence volume under the exact already-approved policy. Cached dependency image layers were reused. The container remained nonroot, network-none, read-only, cap-drop ALL, no-new-privileges, with the existing limits and Chromium sandbox enabled. No bind mounts, credentials, socket, public ports or additional capabilities were introduced. Owned Colima profile r is confirmed stopped; resources remain retained.

Image: `sha256:aceae7b9b2f1d8efadfe25835b0a3e0e16fcbfe4de6b3dd6da0391f7e1954019`. Capsule integrity SHA-256: `70a408a802af4366fe984820d21ad0e52c733f5801f89f668293ad2f4c05e19c`. Both revisions executed one assertion with matching frozen assertion/harness identities and response order 2 then 1; buggy observed Alpha for beta, fixed observed Beta. No new security permission was required.

The later UI-only validation repair does not change the capsule: fresh final export matches all 14 actual image-copied files byte for byte. [Current full scope and checks](HCI-INSPECTOR.md), [portable Linux summary](linux-hci-summary.json), [raw execution](../.repro-runs/linux-hci-final/20261013-ebe20840191f/summary.json), [VM shutdown](../.repro-runs/linux-hci-final/20261013-ebe20840191f/vm-final.json) and [final equivalence](../.repro-runs/hci-increment/final-capsule-equivalence-e12c8561a6ee/summary.json).

## Earlier packaging checkpoint — historical

The report below preserves the previous package identity and its actual observations. Its references to final/unchanged UI bytes are relative to that earlier checkpoint, superseded for current status by the HCI report above. The earlier `linux-packaged-summary.json` also remains historical.


Verified 2026-10-13 UTC: the exact approved policy was applied and the final standalone capsule passed on Linux arm64. No additional security change was required. Native Chrome zoom and human HCI evaluation are separate gates.

## Approval and preserved boundary

The user approved the exact prepared profile, SHA-256 `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`, for the trusted synthetic test with all restrictions preserved. Its only delta from earlier namespace profile `0885450338aec8898e557b5f851a3042c82ea4740a87f4a33675d2755d13642d` is `{"names":["chroot"],"action":"SCMP_ACT_ALLOW","args":[]}`. Every earlier rule, architecture and default was compared. No global Codex permission or browser restriction changed.

The project-owned Colima `r` VM used 2 CPUs, 3 GiB RAM, 12 GiB data disk, 8 GiB root disk and vz, no host directory mounts, agent forwarding, SSH-config update or application port forwarding. Project-owned `COLIMA_HOME`, `COLIMA_CACHE_HOME`, `DOCKER_CONFIG` and explicit `DOCKER_HOST` retained the documented boundary. Container inspections confirmed USER node, network none, read-only root, all capabilities dropped, no-new-privileges, 128 PIDs, 1 GiB memory, 2 CPUs, `/tmp:rw,nosuid,size=256m`, 256 MiB shared memory, and one fresh named volume. No bind mounts, credentials, Docker socket, public ports, devices, privileged mode or added capabilities. Chromium sandbox remained enabled.

The profile permits unfiltered clone, setns, unshare and chroot for all container processes. These expand the available kernel interface; nested user namespaces can have their own capabilities. The result establishes the trusted synthetic boundary only, not arbitrary or hostile-code containment. Other architectures and runtimes remain unverified.

## Final execution and identities

- Image: `sha256:fc86009d51aab1af25c4c3c8586ab997b899e320e736f04bf81f5813e4f57644`.
- Capsule integrity SHA-256: `a1573e4214c803084982ab0dd853fe78e75046d6cd8a20d45d315b0955750a34`.
- 13 indexed artifacts plus `integrity.json` matched files copied from the built image, byte for byte.
- 78 current source/build files matched the saved inventory; aggregate `c0f5c970656052415b6b13763ed574ef033a995860d1c1f49e7a0fc50877001e` (sorted-key compact JSON in saved row order).
- Frozen assertion: `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`.
- Final bundled harness: `f93f38c955f28a3d23057860730e3222d24608cdc31e61c025cc183576ad1695`; identical across both runs. Earlier capsule builds have different harness hashes because identity includes executable bytes.
- Reduced manifest: `1d73378b0b1dd8b9c0e20a155c88d1c27e85910f144dcd1085ddb0f6d3214db6`; 3 actions, default 10,000 ms adapter deadline.

| Revision | Actual result | Assertions | Observation |
| --- | --- | --- | --- |
| buggy | target-failure | 1 | Latest request 2, query beta, stale Alpha synthetic result |
| fixed | requirement-satisfied | 1 | Latest request 2, query beta, Beta synthetic result |

Both runs observed real input, requests and frontend response completion 2 then 1 in separate fresh browser state. Actual environment: Linux arm64, Node 26.7.0, pinned Chromium 156.0.8078.4. The conventional Node test and container exited 0: one test passed, zero failed/skipped, no outer-deadline expiry or OOM. The owned VM was stopped afterward; images, exited containers, volumes and copied evidence were retained.

The portable [summary](linux-packaged-summary.json) records exact run IDs, source identities and observations. Full local evidence is in [`.repro-runs/linux-final/20261013-4419b9104f7e`](../.repro-runs/linux-final/20261013-4419b9104f7e/summary.json): `approval.json`, `content-hashes.json`, `container-preflight.json`, before/immediately-before/after container inspection, `run.log`, raw evidence JSON, traces, observation PNGs, build log and `vm-final.json`. Those raw local artifacts are intentionally excluded from source publication and the cloud bundle.

## Packaging and review

`security/repro-chromium-seccomp.json` is included in the npm package and exported capsule, integrity checked, and compared to the trusted installed profile. Tampering remains rejected even after recomputing a capsule's self-declared hash list. The two new behavioral tests bring the unit/contract total to 64. No import/export operation applies permissions automatically.

Generated instructions require explicit exact-hash opt-in before build/create. A fail-fast subshell uses a unique `--iidfile` and the successful image ID, preventing failed builds from falling through to stale images. Evidence uses a fresh named volume. An independent reviewer found and verified this correction. Another peer demonstrated that a valid 30,000 ms manifest contradicted hard-coded README deadline text; the text now refers to `environment.timeoutMs`. Trusted export/import and corrected wording were checked for that manifest, without executing a 30-second runtime experiment. The final actual Linux run uses the default 10-second manifest.

Final local checks all passed after the wording repair: build, kit (7 supplied fixture checks plus structure), typecheck, lint, 64 unit/contract tests, 24 browser checks including fault/recovery/malicious-input/UI/accessibility, and fresh installed-package/exported-test smoke. Logs are [`final-wording-checks.json`](../.repro-runs/linux-chroot-approved/20261013-e1afc3f5b97e/final-wording-checks.json) and adjacent named logs. Package receipt: [run-iiBrLQ](../.repro-runs/package-smoke/run-iiBrLQ/summary.json). UI source/server/tokens and four web build artifacts remain byte-identical to the prior direct visual review, so those 30 reviewed screenshots remain applicable. Automated samples and CSS zoom do not establish native zoom or screen-reader usability.

Independent read-only reviews inspected actual source/inventory, policy bytes, image copies, container settings, assertion identities, observations, traces and screenshots. The original-task peer's record is [final-linux-review-20261013.json](../.repro-runs/peer-review/final-linux-review-20261013.json). Reviews are agent reviews, not human approval.

## Earlier runs and remaining limits

The [namespace-only attempt](LINUX-REPLAY.md) failed before assertions and is retained as historical evidence. The first approved chroot test at `.repro-runs/linux-chroot-approved/20261013-e1afc3f5b97e` passed. The first packaged image at `.repro-runs/linux-packaged/20261013-43ae2e93c0ca` also passed and was superseded only by the truthful deadline-wording correction. No success erases those historical failure records.

Native Chrome navigation returned `net::ERR_BLOCKED_BY_CLIENT`; no retry or bypass occurred. Native 200% zoom remains unverified. Actual screen-reader usability and human HCI study are unrun. Synthetic results do not establish historical-bug coverage, a PostgreSQL adapter, arbitrary-site recording, production readiness or conference acceptance. Continue all independent authorized work using the current [state](../STATE.md) and [release matrix](RELEASE.md).
