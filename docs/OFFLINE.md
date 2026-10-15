> This archive is the preserved schema-1 checkpoint `15a8225`. The newer caller-declared schema-2 workflow has separate [package and Linux evidence](../evidence/AUTHORED-RELEASE.md); no new schema-2 image archive is claimed.

# Offline Linux replay

The release includes a compressed Docker image containing the actual reduced synthetic capsule, Node, its locked npm runtime packages, Chromium and Linux browser libraries. Once this image has been acquired, replay needs no registry/CDN access, original application service, proprietary viewer or LLM. A compatible Linux arm64 Docker host remains a prerequisite. This is a trusted synthetic development image, not a hostile-code sandbox.

The archive is local at `.repro-runs/release-candidate/delivery/repro-linux-arm64-offline.tar.gz`. Its exact SHA-256, byte size and image ID are in `evidence/release-candidate-linux.json`. Keep that report, this source repository's `security/repro-chromium-seccomp.json`, and the archive together when transferring it. Raw traces, host browser profiles, VM keys and the runtime evidence volume are not in the image.

Validation used Docker 29.5.2 with OCI image storage on Linux arm64. The archive was loaded into the existing owned daemon and executed in a new container with a fresh evidence volume. All archive blobs and decompressed layer hashes were checked. Import on an independent clean host and older Docker storage formats remain untested; use the tested Docker configuration when reproducing the recorded image identity.

## Verify and load

Check the archive's SHA-256 against the release report before loading. On macOS use `shasum -a 256`; on Linux use `sha256sum`. A digest proves bytes match, not author trust. Use only the trusted release you intended to obtain.

```bash
set -euo pipefail
gzip -t repro-linux-arm64-offline.tar.gz
gzip -dc repro-linux-arm64-offline.tar.gz | docker image load
```

The load must report image `sha256:52ca25c19ba791c95aa24c4b95a26a6c6e892d3fd8a0f3d29badb0856b009aaa`. Do not run a differently identified image just because a load command exited successfully. The source capsule's readable `replay.test.mjs` is also retained under `.repro-runs/demo/1e1e3394-fd07-4e4e-ba5a-faa28f03912e/capsule/` on the build machine; a new `npm run demo` generates its own equivalent readable bundle and evidence.

## Run with the approved boundary

Use a fresh unique name for the container and evidence volume. The following command applies the exact policy previously approved for this trusted synthetic capsule; it does not authorize a different policy, arbitrary code, or a broader sandbox. Verify `security/repro-chromium-seccomp.json` has SHA-256 `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b` first.

```bash
(
set -euo pipefail
repro_run="repro-offline-$(date +%s)-$$"
repro_volume="$repro_run-evidence"
docker volume create "$repro_volume"
docker create --name "$repro_run" \
  --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --security-opt "seccomp=$(pwd)/security/repro-chromium-seccomp.json" \
  --pids-limit 128 --memory 1g --cpus 2 \
  --tmpfs /tmp:rw,nosuid,size=256m --shm-size 256m \
  --mount "type=volume,src=$repro_volume,dst=/work/.repro-runs" \
  sha256:52ca25c19ba791c95aa24c4b95a26a6c6e892d3fd8a0f3d29badb0856b009aaa
repro_status=0
docker start --attach "$repro_run" || repro_status=$?
mkdir -p .repro-runs
mkdir ".repro-runs/$repro_run"
docker inspect "$repro_run" > ".repro-runs/$repro_run/container.json"
docker logs "$repro_run" > ".repro-runs/$repro_run/console.log" 2>&1
mkdir ".repro-runs/$repro_run/artifacts"
docker cp "$repro_run:/work/.repro-runs/." ".repro-runs/$repro_run/artifacts/"
exit "$repro_status"
)
```

The image uses `USER node` and keeps Chromium's sandbox enabled. No host binds, credentials, Docker socket, public ports or external network are provided to the replay container. The conventional test requires both real observations: stale Alpha for beta in the buggy revision, then Beta for beta in the fixed revision, with one executed frozen assertion in each fresh browser state. Its success is not inferred from the container exit alone; preserve and inspect the evidence.

The command preserves the container inspection, console output and run artifacts even when replay fails, then returns that replay status. Retain the exited container and volume until the evidence is reviewed.

Stop only your owned VM after the check. The Mac/Colima setup additionally needs the strict no-forwarding rule documented in `CLOUD-SETUP.md`; a command-line flag alone did not enforce that boundary on the tested versions. No native-zoom or screen-reader claim follows from this offline replay.

## Npm capsule alternative

The smaller exported capsule contains readable code and a locked dependency recipe. It can use `npm ci --offline --ignore-scripts --omit=dev` only when all npm packages are already cached and Chromium/system libraries are available. The release package smoke checks this cached-install path separately. It is not interchangeable with the fully acquired image archive above.
