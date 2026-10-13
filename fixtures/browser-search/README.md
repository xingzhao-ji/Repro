# Registered browser fixture

This original synthetic frontend makes real same-origin HTTP `fetch` requests.
The runner waits for alpha and beta requests to arrive, completes beta, observes
its DOM completion, then completes alpha and observes the second completion.
`buggy.js` allows the stale response to overwrite the visible results. `fixed.js`
only applies the latest request's response. Neither page computes a test verdict.

The frozen supplied expectation is evaluated in the separate Node runner using
the observed latest query, request identifier, and rendered result items. Only
the exact stale-alpha result after both completions is the target failure.
The response bodies are synthetic substitutes for a search backend: this
experiment verifies frontend response handling and cannot verify backend fixes.

`fixtureSource` joins `page.html` with the selected registered script, and
`fixtureDigest` hashes that exact executed source. Manifests cannot supply source,
URLs, scripts, locators, authentication, or external services. Each run owns a new
loopback server, Chromium process, and empty context; browser sandboxing is enabled.
Browser traffic is restricted to that server's three declared route shapes.

The input uses a frozen Date and seeded Math.random. The registered frontend uses
neither timers nor performance clocks. GPU nondeterminism, arbitrary timer-driven
apps, workers, WebSockets, authentication, databases, and other applications are
unsupported. This is a trusted local fixture boundary, not a hostile-code sandbox.

The default browser is Playwright's pinned Chromium. `REPRO_BROWSER_CHANNEL=chrome`
explicitly selects a locally installed Chrome engine in a fresh task-owned context;
the exact version and channel are recorded. There is no silent browser fallback.
Local macOS observations do not establish Linux-container portability.
