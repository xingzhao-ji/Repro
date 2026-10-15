# Portable Repro source setup

This source bundle contains the local synthetic Repro implementation, starter assets, specifications, focused repository skills, tests, dependency lockfile and human-readable evidence. Read `STATE.md`, `GOAL.md` and `AGENTS.md` before continuing. `evidence/RELEASE.md` is the current acceptance matrix; `evidence/release-candidate-linux.json` contains the current portable, synthetic-only Linux and offline-image results. Older Linux reports remain historical.

The archive's `TRANSFER-MANIFEST.json` identifies the Git commit and every included file's size and SHA-256. Validate those entries before use. The current release source archive is a local handoff artifact with a separate checksum. The earlier Library upload described in `evidence/GITHUB-DELIVERY.md` is historical; no new Library upload is claimed for this checkpoint. The source bundle excludes Git internals, local Codex configuration, credentials, VM disks, caches, installed dependencies, generated build output, browser profiles, traces, screenshots and raw runtime evidence. Links into `.repro-runs/` identify evidence retained on the build Mac and will not resolve in this portable copy. A summary is not a substitute for fresh execution in a new environment. The separately supplied offline Linux image intentionally includes its declared runtime dependencies; it is not the source-only handoff.

## Install and check

Use Node >=24 and Python 3; the recorded test host used Node 26.7.0 and Python 3.14.7. Acquire pinned npm dependencies and Chromium from the declared official sources. Installation needs network access; the synthetic replay uses controlled loopback HTTP. Do not import ambient personal browser profiles or credentials.

```sh
npm ci --ignore-scripts --cache .repro-cache/npm
PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx --no-install playwright install chromium --only-shell
npm run build
npm run check:kit
npm run typecheck
npm run lint
npm test
npm run test:browser
npm run test:package
npm run demo
npm run benchmark
```

Chromium requires its platform's system libraries. On an authorized Linux environment, `npx --no-install playwright install-deps chromium` lists/installs those prerequisites through the platform package manager and may need administrator permission. If unavailable, record the exact dependency failure; do not disable the browser sandbox or silently widen host permissions. Generated outputs stay in `.repro-runs/` and caches in `.repro-cache/`.

The UI starts with `npm run dev` at `http://127.0.0.1:4318`. Do not expose it publicly. On a remote/cloud executor, use only the platform's approved preview mechanism if available. No hosted deployment or new cloud resource has been provisioned by this transfer.

## Linux capsule execution

The demonstrated container boundary is **Linux arm64**, pinned Node 26.7.0 Debian image, Playwright 1.64.0, Chromium 156.0.8078.4 and Docker daemon 29.5.2 in the documented owned Colima VM. A new cloud machine's architecture and runtime must be inspected; this evidence does not establish Linux x86_64 or an arbitrary cloud sandbox.

`security/repro-chromium-seccomp.json` is an inert file with SHA-256 `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`. It was specifically approved for the trusted synthetic test with the exact preserved restrictions. It is included and verified during capsule export/import; unpacking the source does not apply it. Do not apply a modified or architecture-substituted profile, add capabilities, use privileged mode or disable Chromium sandboxing. Any changed security scope needs its own precise review and approval.

Export a new capsule with the trusted build, inspect it, and follow its generated README. The instructions require explicit opt-in to the exact profile hash, pin execution to the successful build's image ID, use USER node and a fresh named evidence volume, and preserve network-none, read-only root, all capabilities dropped, no-new-privileges and resource bounds. No host bind mount, Docker socket, credential, public port or host application service is required. The approved profile is not a hostile-code sandbox.

For the already approved task-owned Colima setup on this Mac, create the configuration directory **before** setting `COLIMA_HOME`: Colima 0.10.3 ignores a nonexistent override and can fall back to its default home location. Set `LIMA_HOME` explicitly as well. Keep these variables scoped to the command/session; do not change the global Docker context. The release run uses `.repro-cache/c`, `.repro-cache/c/_lima`, `.repro-cache/colima-cache`, and `.repro-cache/docker-config`. Its startup command preserves `--cpus 2 --memory 3 --disk 12 --root-disk 8 --vm-type vz --mount none --ssh-agent=false --ssh-config=false --activate=false --port-forwarder none --template=false`. The separate Docker host is `unix://$PWD/.repro-cache/c/r/docker.sock`. These are local test instructions, not authorization to create a differently scoped VM or apply a modified policy.

On the verified Colima 0.10.3 / Lima 2.2.1 combination, the generated no-forwarding rule did not suppress loopback DNS forwarding. The release stopped that VM and added this stricter first rule to the **task-owned** `$LIMA_HOME/_config/override.yaml` before restarting (preserve other existing configuration):

```yaml
portForwards:
  - guestIP: "0.0.0.0"
    guestIPMustBeZero: false
    guestPortRange: [1, 65535]
    proto: any
    ignore: true
```

Verify the effective configuration and actual owned VM listeners; a startup flag alone is insufficient evidence. This rule disables additional forwarding and does not modify container seccomp or capabilities. See [Lima's rule semantics](https://github.com/lima-vm/lima/blob/v2.2.1/templates/default.yaml) and the current Linux report linked from `evidence/RELEASE.md`. Ordinary approved Docker control sockets remain local; there are no forwarded application ports.

## Continue honestly

Native 200% Chrome zoom review remains unverified because the original permitted review surface returned `net::ERR_BLOCKED_BY_CLIENT`. Do not retry the denied action through another route, treat CSS zoom as native zoom, or mark the entire engineering workflow blocked while independent work remains. A source transfer does not resolve that restriction. The supported product remains one registered synthetic failure family; historical bugs, PostgreSQL reset/reduction, arbitrary websites and hostile-code execution are unclaimed.
