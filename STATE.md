# Development state

2026-10-15 UTC. A working local synthetic alpha release candidate is prepared from the existing Repro implementation. The user’s active release goal remains incomplete for native 200% zoom and actual screen-reader verification. Do not mark the goal complete or paused, restart the implementation, or replace the supplied expectation. The current evidence is [RELEASE.md](evidence/RELEASE.md) and [release-candidate-summary.json](evidence/release-candidate-summary.json); the October 13 reports and Git history remain preserved as historical observations.

## Ownership and current source

Root owns integration and release delivery. The independent architecture/oracle/reducer, package, and accessibility reviewers completed their assigned work. Before resuming, inspect current Git status and active agents. Keep generated runs in ignored `.repro-runs/` and caches in `.repro-cache/`; do not ingest unrelated files, personal profiles or credentials.

Takeover base: `0902b3b11af847e2b930cbf091eda0261830efb4`. Coherent fixes: `c8cd87f` claims new CLI output directories without overwriting evidence; `cb4438d` rejects reused reducer run identities; `352f48b` repairs sidebar contrast and capture focus; `e385a54` initializes Impeccable product context and the user-selected code-first preference; `a0b327c` verifies installed/offline package workflows and distinct process censuses. No dependency versions or frozen assertion were changed. Inspect Git for the final documentation/release commit.

The user confirmed existing product documents plus the updated goal as durable context. `docs/PRODUCT.md` and `.impeccable/config.json` record that choice. Impeccable and Superpowers were found installed; no replacement installation or new visual redesign was needed.

## Current verified behavior

Fresh dependency installation and pinned Chromium acquisition succeeded. Kit checks (7 supplied model fixtures), strict typecheck, lint and build passed. Full unit/contract suite: **179 passed, 0 failed/skipped**. Full real-browser suite: **31 passed, 0 failed/skipped**. The browser suite includes UI history/inspector, interruption/recovery, cancellation, wrong-failure rejection, HTTP boundaries, keyboard focus and all 40 synthetic benchmark repetitions (20 buggy, 20 fixed; one family). npm audit reported zero known vulnerabilities at this check.

The complete executable demo captured, reproduced, reduced, compared, exported, imported and replayed the registered synthetic frontend. Five actions became three (`navigate`, `search-alpha`, `search-beta`) in 16 executions. Tested minimality remains **unverified** because final neighbors were inconclusive. Original expected behavior and independent harness identities were preserved. Demo evidence: `.repro-runs/demo/1e1e3394-fd07-4e4e-ba5a-faa28f03912e/summary.json`.

Installed package verification ran 15 commands and 8 actual assertions, including record/export/inspect/replay/verify and a conventional test in a separate capsule installed from the populated npm cache. Every command has a separate post-close census with zero observed owned survivors. PID ancestry was sampled every 100 ms and is not an exhaustive kernel process audit. [Package evidence](evidence/release-candidate-package.json).

All 26 build inputs remained unchanged and matched the working tree after the checks. Aggregate: `2210dd4dc2ef59f6b0401262bbdea59f5c52ee438e46f3f9497970410cf6ca99` (SHA-256 of the sorted source-hashes object serialized by JSON.stringify). Frozen assertion: `fd86f0acbf1b63d4cd8d301878700a7d45ee7a3b2d2367bd5a5202cf52467711`. The CLI and conventional test have different entrypoint harness hashes; each buggy/fixed pair uses one unchanged harness.

Actual three-action capsule passed in a fresh Linux arm64 image/container/evidence volume and again after saving/loading the acquired image into the same owned Docker daemon, using another fresh container/volume. Each buggy revision observed stale Alpha for beta; each fixed revision observed Beta for beta; each executed one assertion. All 14 payload files match the final exported capsule. The image is `sha256:52ca25c19ba791c95aa24c4b95a26a6c6e892d3fd8a0f3d29badb0856b009aaa`. The archive is `.repro-runs/release-candidate/delivery/repro-linux-arm64-offline.tar.gz`, 547,548,184 bytes, SHA-256 `1e1da4deffec9f5415dcc9df7672538795264cd9e2a60a04c489546616588740`. Gzip, OCI blob and all nine decompressed layer identities passed. Independent second-host archive import remains untested. [Linux evidence](evidence/release-candidate-linux.json), [offline instructions](docs/OFFLINE.md).

Keyboard workflows, 15 scoped Axe samples, responsive/error/cancellation screenshots and computed focus contrast were checked. The dark sidebar focus improved from 2.46:1 to 8.82:1; capture focus now continues into the workspace. The reviewer opened all 20 final images. The separate accessibility probe’s failed helper-process census remains preserved; its later post-script census found the observed helpers gone. [Accessibility evidence](evidence/release-candidate-accessibility.json).

## Preserved failures and scope

The contrast pilot remains 50 passing controls, 12 provisional passing measurements and 45 unattempted observations; it stopped at 899.40 MiB against a diagnostic 896 MiB gate and lacked a distinct post-close census. Raw historical artifacts were absent at takeover; tracked reports were preserved. The cap is not the original product definition. No mixed-result memory-transport prototype was installed or historical result relabeled. Current behavioral and cleanup checks do not establish a continuous native peak-memory claim. [ADR](docs/adr/0002-release-candidate-evidence.md).

Only the supplied registered synthetic frontend and expectation are implemented. Arbitrary app/expectation authoring, PostgreSQL, historical bug coverage, hostile execution, public deployment and human-study outcomes are not release results. Prepared HCI research and the previously verified synthetic analysis instrument remain available; participant work and broader comparator research are separate from the current release objective.

## Exact owned VM and container boundary

The user-approved seccomp SHA-256 remains `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`, adding only chroot to the earlier namespace policy. Repeated approval is unnecessary; this does not authorize another syscall, disabled Chromium sandbox, extra capability, public listener or arbitrary code.

The owned profile `r` is confirmed **Stopped**; the observed hostagent exited and no containers were running at shutdown. Retained images, exited containers and volumes are preserved. Do not restart it merely to move environments or rerun unchanged checks.

Precreate the task configuration directories before setting `COLIMA_HOME="$PWD/.repro-cache/c"`; also set `LIMA_HOME="$PWD/.repro-cache/c/_lima"`, `COLIMA_CACHE_HOME="$PWD/.repro-cache/colima-cache"`, `DOCKER_CONFIG="$PWD/.repro-cache/docker-config"`, and `DOCKER_HOST="unix://$PWD/.repro-cache/c/r/docker.sock"`. Scope them to the task, not global Docker configuration. Colima 0.10.3 ignored the initially nonexistent home override; the newly created default-location task profile was stopped/deleted before Repro execution. The correction and failure logs are retained.

Profile: 2 CPUs, 3 GiB memory, 12 GiB data disk, 8 GiB root disk, VZ, no host mounts, SSH-agent/key forwarding, SSH config update, context activation or template. On Colima 0.10.3/Lima 2.2.1, `--port-forwarder none` alone unexpectedly forwarded guest DNS on restart. The VM was stopped before reduced replay. The task-only full-range ignore rule with `guestIPMustBeZero:false` in CLOUD-SETUP.md then yielded no observed owned TCP listeners or UDP sockets before/after execution. The first unreduced sample’s no-forwarding boundary remains unverified; absence of a log line is not proof.

Replay container: USER node, network none, read-only root, cap-drop ALL, no-new-privileges, exact approved seccomp, pids128, memory1g, cpus2, tmpfs /tmp rw,nosuid,size256m, shm256m, fresh named evidence volume only, Chromium sandbox enabled. No host binds, credential/socket mounts, published ports or privileged mode. Docker29.5.2/OCI image storage was tested; no bit-identical OS rebuild or independent clean-host import is claimed.

## Delivery and continuation

The user already authorizes a non-force push of reviewed source/history to the existing private `https://github.com/xingzhao-ji/Repro.git`. Final artifact inventory and push/readback receipts are generated under `.repro-runs/release-candidate/delivery/`: `source-bundle.json`, `final-artifacts.json`, and `github.json`. Use those receipts and actual local/remote refs to establish the exact delivered commit. No GitHub Actions workflow is configured; a local pass is not remote CI. No hosted runtime was deployed.

The scanned source archive includes tracked source/assets/docs/tests plus its transfer inventory, excluding credentials, private local configuration, Git internals, run evidence, cache/VM data, installed dependencies and build output. The separate offline image intentionally includes its declared runtime dependencies. Earlier Library artifact `libfile_bdca044eb9e88191959b7cd8a492936c` is historical and contains the older checkpoint. A new Library upload is not claimed: the available upload tool requires a writable Page destination, and no current Library-upload capability/destination is available. The local archive and private Git repository provide the current handoff.

Remaining release checks:

1. Native Chrome navigation to the exact loopback URL previously returned `ERR_BLOCKED_BY_CLIENT`. Do not retry through another tool/browser or disable protections. The current supported inventory has no usable browser-control surface. Native 200% zoom needs that legitimate provider restriction resolved and real zoom observations. CSS zoom is not a substitute. [Recorded gate](evidence/NATIVE-ZOOM-GATE.md).
2. Actual screen-reader operation needs a supported assistive-technology control and speech/interaction observation surface. None is available in the current tools. Axe and semantic snapshots do not close this gate.

Continue those checks when legitimate capabilities become available, preserving their exact evidence and prior denial. Do not ask the user to redo already verified workflows, restart the product, silently narrow acceptance, claim human review, or mark the goal complete while these checks remain unverified.
