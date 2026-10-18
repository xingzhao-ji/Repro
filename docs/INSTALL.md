# Install Repro 0.2.2

Repro installs as a local npm package. It runs on your machine and needs no account, API key, LLM, proprietary viewer or hosted service. This guide covers the release package, a source checkout and an exported regression capsule. For daily use see [USAGE](USAGE.md); for failures see [TROUBLESHOOTING](TROUBLESHOOTING.md); for what is and is not supported see [SUPPORTED-SCOPE](SUPPORTED-SCOPE.md) and the [release notes](RELEASE-NOTES.md).

## Requirements

| Requirement | Verified | Notes |
| --- | --- | --- |
| Operating system | macOS arm64 (native) | Exported registered-case capsules are also run in fresh isolated Linux arm64 containers; the release evidence records this build's Linux result. Linux amd64, Windows and other hosts are untested. |
| Node.js | 26.7.0 | `package.json` declares `>=24`; only 26.7.0 was measured. |
| npm | 11.19.0 | Uses the committed `package-lock.json`. |
| Browser | Playwright 1.64.0 pinned Chromium 156.0.8078.4 | Acquired with Playwright, not your installed Chrome. |
| Network | Public npm registry and Playwright CDN during installation only | Capture, replay, reduction, comparison and export use only owned loopback HTTP. |
| Disk | About 35 MB of npm packages and 210 MB for the headless browser | An exported capsule's `--with-deps chromium` step downloads full Chromium plus the headless shell, about 580 MB. Run evidence accumulates under `.repro-runs/`. |

Keep the working directory outside folders that a cloud-sync client can evict, such as an iCloud-synced Desktop or Documents. Evicted files read back slowly or empty, and a browser executed from such a folder was observed never to render animation frames. See [TROUBLESHOOTING](TROUBLESHOOTING.md#icloud-or-other-file-sync-folders).

## Install the release package

The release artifact is `repro-local-0.2.2.tgz`, produced by `npm pack` from the release commit. After installing, continue with the [QUICKSTART](QUICKSTART.md). Check its SHA-256 against the release evidence before installing. A digest proves the bytes match; it does not establish who built them.

```sh
shasum -a 256 repro-local-0.2.2.tgz
```

Install into a new, empty workspace directory. Repro writes every run beneath that workspace's `.repro-runs/`.

```sh
mkdir repro-workspace
cd repro-workspace
npm init -y
npm install --ignore-scripts --no-audit --no-fund /absolute/path/to/repro-local-0.2.2.tgz
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.repro-cache/browsers"
npx --no-install playwright install chromium --only-shell
npx --no-install repro doctor
```

`--ignore-scripts` keeps dependency lifecycle scripts from running; the browser is acquired by the explicit `playwright install` step instead. Keep `PLAYWRIGHT_BROWSERS_PATH` set in every shell that runs Repro. A missing or empty browser directory fails with `BROWSER_UNAVAILABLE` before any run starts.

`doctor` must report `"available": true` and version `156.0.8078.4 (pinned chromium)`. It launches the browser, clicks a probe button and takes a screenshot, so a browser that cannot render fails here rather than mid-run.

Start the workbench:

```sh
npx --no-install repro serve
```

Open exactly `http://127.0.0.1:4318`. Requests with any other Host or Origin are rejected by design. Use `--port 0` to choose a free port; the printed URL is the one to open. Stop it with Ctrl-C.

## Install from a source checkout

Use this to develop Repro or to rebuild the release artifact.

```sh
git clone --branch release/repro-report-0.2.2 https://github.com/xingzhao-ji/Repro.git
cd Repro
npm ci --ignore-scripts --cache .repro-cache/npm
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.repro-cache/browsers"
npx --no-install playwright install chromium --only-shell
npm run build
node dist/cli.js doctor
npm pack --ignore-scripts
```

The repository is private; cloning needs your existing GitHub access. `npm run build` reproduces `dist/` byte for byte from the committed source and lockfile. The tarball also packs `docs/` and `evidence/`, so only the release commit, tagged `v0.2.2-beta`, packs to the exact release tarball whose SHA-256 is recorded in the release evidence. Run `git checkout v0.2.2-beta` before `npm pack` to reproduce it. Later documentation commits pack the same runtime bytes with newer documents. The development checks are listed in the [README](../README.md#development-checks).

## Run an exported regression capsule elsewhere

An exported capsule is a self-contained directory with a readable `replay.test.mjs`, `manifest.json`, the application source, the trusted runner and a lockfile. It does not need the original workspace, a Repro installation or any LLM. Copy the directory to the receiving machine, then follow the README inside it. Without `PLAYWRIGHT_BROWSERS_PATH`, Playwright uses its default per-user browser cache.

A registered-case capsule (morphdom, htmx, Marked) has a single-revision test:

```sh
cd capsule
npm ci --ignore-scripts --omit=dev
npx --no-install playwright install --with-deps chromium
node dist/cli.js inspect --capsule .
REPRO_REVISION=buggy node --test replay.test.mjs   # expected: exit 1, TARGET_ASSERTION
REPRO_REVISION=fixed node --test replay.test.mjs   # expected: exit 0
node dist/cli.js verify --capsule . --output .repro-runs/comparison
```

A synthetic search capsule's test runs both revisions itself and passes when buggy reproduces the stale result and fixed shows the expected one:

```sh
cd capsule
npm ci --ignore-scripts --omit=dev
npx --no-install playwright install --with-deps chromium
node dist/cli.js inspect --capsule .
node dist/cli.js replay --capsule . --output .repro-runs/buggy        # expected: exit 1
node dist/cli.js verify --capsule . --output .repro-runs/verification  # expected: exit 0
node --test replay.test.mjs                                            # expected: exit 0
```

On Linux, `--with-deps` installs Chromium's system libraries and may ask for administrator rights; on macOS it adds nothing. Inspect a capsule before running it. Hashes establish integrity, not trust; do not execute capsules from unknown authors on your host. For the isolated Linux container recipe, see the capsule's README and [SECURITY](SECURITY.md).

## Offline use

After installation, replay needs no network. A fresh capsule installation needs the npm registry and the Playwright CDN unless every locked package is already in your npm cache and Chromium is already installed (`npm ci --offline --ignore-scripts --omit=dev`). A missing cache entry fails; Repro never falls back silently to another source. [OFFLINE](OFFLINE.md) describes the older synthetic Linux image archive.

## Uninstall

Delete the workspace directory. Repro installs nothing globally, starts no background service and changes no system settings. Before deleting, keep any `.repro-runs/` evidence you need. A run that reported `CLEANUP_FAILED` keeps its browser profile on purpose; see [TROUBLESHOOTING](TROUBLESHOOTING.md#cleanup_failed-and-a-retained-profile) before removing it.
