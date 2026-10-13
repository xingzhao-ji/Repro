# Declared local dependencies

The product uses Node built-ins for HTTP, SQLite, crypto, process ownership and files. The supported runtime floor is Node 24; the recorded development host used Node 26.7.0 and npm 11.19.0. No database is needed for the registered search fixture. PostgreSQL integration remains future adapter work.

| Package | Pinned version | Concrete purpose |
| --- | --- | --- |
| playwright | 1.64.0 | Chromium launch, isolated contexts, controlled HTTP, tracing and screenshots |
| react / react-dom | 19.3.0 | Local workbench rendering and state |
| typescript | 6.0.3 | Strict source and test checks |
| tsx | 4.23.15 | Development CLI and TypeScript tests |
| esbuild | 0.28.2 | Local Node/browser bundles |
| eslint / typescript-eslint | 10.12.0 / 8.71.2 | Source quality checks |
| @axe-core/playwright | 4.13.0 | Automated accessibility samples in browser tests |
| ajv | 8.20.0 | Product JSON Schema contract tests |

All transitive versions and integrity hashes are in `package-lock.json`, resolved from [the official npm registry](https://registry.npmjs.org/). `.npmrc` pins that registry and a project-owned cache. Build scripts use installed packages; core execution does not call an LLM or paid service. Runtime manifest validation also enforces adapter-specific semantic constraints that JSON Schema alone cannot establish.

Playwright acquires its matching Chromium from the vendor's browser distribution. Current native evidence records Chromium 156.0.8078.4. Run `PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx playwright install chromium --only-shell` explicitly. Linux additionally needs Chromium system libraries; the exported Dockerfile uses `playwright install --with-deps chromium`. Browser acquisition and Debian packages are declared build-time network dependencies. Replay uses only its owned local HTTP service.

The exported image pins `node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32` from [Docker's official Node image](https://hub.docker.com/_/node). Debian package acquisition is not snapshot-pinned; byte-for-byte image reproducibility is not claimed. Image build success does not establish sandboxed replay success; consult the release report.

Optional local portability tooling installed for verification: Docker CLI 29.9.0, Colima 0.10.3 and Lima 2.2.1, with a task-owned Linux arm64 VM and Docker daemon 29.5.2. These are not product npm dependencies. The VM has no host directory mounts or SSH-agent forwarding. The exact per-container profile including chroot was specifically approved and passed the trusted Linux arm64 test with all other restrictions preserved. The inert policy is shipped in the package/capsule; see [actual execution and scope](../evidence/LINUX-PACKAGED.md). No additional security change was required.

The starter's dependency-free state-model checks additionally use Python (3.14.7 on this host). They do not launch a browser. No proprietary font, dataset, viewer, API key, cloud resource or original application service is required for this synthetic slice.
