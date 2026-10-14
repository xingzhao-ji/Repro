# Repro portable synthetic failure capsule

This is a trusted local synthetic training fixture, not a recording of a user or an independently discovered historical bug. Its expectation comes from the supplied synthetic specification; human approval is not claimed. Only the registered stale-response frontend adapter is supported. No database, credentials, original application service, proprietary viewer or LLM is required.

## Inspect and replay

Use an independently obtained trusted Repro runner to inspect this directory before execution: `repro inspect --capsule /path/to/capsule`. SHA-256 establishes integrity, not trust in an author. Do not execute an unknown bundle on your host. Repro only supports explicitly trusted local fixtures; public or hostile capsule execution is unsupported.

The declared runner is Repro 0.1.0; Node >=24, npm, the exact package-lock.json dependencies, Chromium and Chromium's Linux system libraries are required. The package and lockfile declare all npm dependencies. Dependency installation and Chromium acquisition need access to their official registries/CDN; replay itself uses controlled local HTTP only.

On a fresh supported Linux environment, install and run:

```sh
npm ci --ignore-scripts --omit=dev
npx --no-install playwright install --with-deps chromium
node dist/cli.js inspect --capsule .
node dist/cli.js replay --capsule . --output .repro-runs/buggy
node dist/cli.js verify --capsule . --output .repro-runs/verification
node --test replay.test.mjs
```

The readable test runs separate fresh browser state for buggy and fixed revisions, requires an executed frozen assertion, checks the intended buggy observation, and independently checks the fixed visible result. A missing dependency, timeout, wrong failure or assertion mismatch fails this test. The original response schedule and assertion identity remain unchanged between revisions.

## Container boundary

The supported container recipe is Linux arm64 with Docker, the pinned Node 26.7.0 Debian image, Playwright 1.64.0 and Chromium 156.0.8078.4. It was tested using Docker daemon 29.5.2 in an owned Colima 0.10.3 vz VM (2 CPUs, 3 GiB RAM, 12 GiB data disk, 8 GiB root disk), with no host directory mounts, SSH-agent forwarding, SSH-config updates, active-context changes or application port forwarding. Other architectures and runtimes are unverified. Build acquisition requires the network; replay uses only container loopback.

The inert file `security/repro-chromium-seccomp.json` is included in integrity validation and has SHA-256 `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`. Import/export does not apply it or change Docker, Codex or browser settings. It preserves the inspected Docker all-capabilities-dropped arm64 default policy and adds unfiltered clone, setns, unshare and chroot calls for Chromium's enabled sandbox. These allowances cover all container processes and cannot restrict chroot's pathname. They expand the kernel interface even though parent capabilities are dropped; nested user namespaces may hold their own capabilities. Use only with this explicitly trusted synthetic fixture after specific approval of this exact profile and boundary. No privileged mode, additional capability or disabled Chromium sandbox is needed.

After reviewing and explicitly approving that policy, use these commands from the capsule directory with Docker pointing to your isolated owned runtime. Set `REPRO_APPROVED_POLICY_SHA256` to the exact hash above as a deliberate opt-in. The guard below checks both the opt-in and file bytes before any container is created:

```sh
# Export REPRO_APPROVED_POLICY_SHA256 only after specific approval.
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),assert=require("node:assert/strict"); const expected="949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b"; assert.equal(process.env.REPRO_APPROVED_POLICY_SHA256,expected,"Explicit policy opt-in required"); assert.equal(crypto.createHash("sha256").update(fs.readFileSync("security/repro-chromium-seccomp.json")).digest("hex"),expected,"Policy hash mismatch");' && (
  set -eu
  repro_run="repro-$(node -e 'console.log(require("node:crypto").randomUUID())')"
  repro_volume="$repro_run-evidence"
  mkdir -p ".repro-runs/$repro_run"
  docker build --iidfile ".repro-runs/$repro_run/image-id" .
  repro_image="$(cat ".repro-runs/$repro_run/image-id")"
  docker volume create "$repro_volume"
  docker create --name "$repro_run" --network none --read-only --cap-drop ALL --security-opt no-new-privileges --security-opt "seccomp=$(pwd)/security/repro-chromium-seccomp.json" --pids-limit 128 --memory 1g --cpus 2 --tmpfs /tmp:rw,nosuid,size=256m --shm-size 256m --mount "type=volume,src=$repro_volume,dst=/work/.repro-runs" "$repro_image"
  docker inspect "$repro_run" > ".repro-runs/$repro_run/container-before.json"
  repro_exit=0
  docker start --attach "$repro_run" || repro_exit=$?
  docker inspect "$repro_run" > ".repro-runs/$repro_run/container-after.json"
  docker cp "$repro_run:/work/.repro-runs/." ".repro-runs/$repro_run/"
  exit "$repro_exit"
)
```

The image runs as unprivileged USER node. Each invocation has a fresh named evidence volume, no host bind mounts, Docker socket, credentials, public ports or external network, a read-only root, all capabilities dropped, no-new-privileges, and the resource bounds shown above. The adapter deadline is declared by environment.timeoutMs in manifest.json (10 seconds in the supplied default fixture). Retain the exited container and volume until evidence is reviewed; stop only your owned runtime afterward. If another permission is required, stop and obtain a new specific decision instead of broadening this policy.

Ordinary containers are a development boundary, not a hostile-code sandbox. A build recipe is not evidence that the portability gate passed. Consult the originating project's release evidence for actual Linux executions. The base image digest is pinned. System dependency acquisition remains explicit but is not a snapshot of the Debian package repository, so the OS build is not byte-for-byte reproducible.

## Included data and validation

Only the approved manifest, registered synthetic frontend sources, trusted runner files, locked npm metadata, the exact inert container policy, this documentation and the readable test are exported. Browser profiles, cookies, authorization headers, raw user data, unrelated source files, capture logs, screenshots and traces are excluded. No redaction is claimed: supported inputs are synthetic from their origin. Older exports without the policy must be re-exported using this trusted build; the exact artifact allowlist and trusted-runner identity deliberately reject incompatible bundles.

Import validates schema, app/runner/adapter/assertion identity, artifact allowlists, sizes and hashes before replay. Paths, symlinks, hardlinks, archives and extra artifacts are rejected. Top-level node_modules, .repro-runs and .repro-cache are explicitly excluded generated runtime directories; import does not attest to their contents or installed dependency integrity. Acquire dependencies with npm ci from the lockfile in a clean environment. Empty/incomplete exports do not have a finalized integrity record. Artifact hashes are self-consistency evidence; the trusted importing runner additionally compares executable artifacts against its own installed implementation.
