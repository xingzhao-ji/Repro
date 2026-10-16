# htmx delegated checkbox case

This development case executes the original htmx source from the buggy parent
`7388d0c0573b6d6bab43baa1f66fd7e59385bcea` and the upstream fix
`c9e2bea954efaf61d02b2f8639e31820e7632773`. The fix was merged in
[PR 3336](https://github.com/bigskysoftware/htmx/pull/3336), and
[issue 2755](https://github.com/bigskysoftware/htmx/issues/2755) records the
report, native checkbox behavior, and resolution in htmx 2.0.5.

The local page uses the report's checkbox and naked `hx-trigger="click
from:body"` form. It sends no HTTP request. Its status marker observes htmx's
initial load event; a separate marker observes the actual checkbox click. Those
markers are fixture instrumentation, not substitutes for the assertion on the
native checkbox's `checked` property.

`case.json` freezes the actions, readiness, assertion and exact intended failure
before the first browser execution. The initial sequence contains navigation and
one real click. No redundant actions were added to manufacture a reduction gain.
An unchecked checkbox together with a missing click marker is not this failure.

`buggy.js` and `fixed.js` are byte-for-byte copies of upstream `src/htmx.js`,
not the repository's potentially stale distribution builds. `upstream/` retains
the original source, package metadata, README and Zero-Clause BSD license for
both revisions. `provenance.json` binds each file to its upstream URL and SHA256;
`build.json` binds the browser assets to those originals.

Recreate or verify the browser assets from the Repro repository root:

```sh
node scripts/build-repository-cases.mjs
node scripts/build-repository-cases.mjs --check
```

No upstream package scripts or dependencies are required. Acquisition and build
receipts do not establish reproduction, portability, or performance. These are
public development cases, not held-out evaluation or human-approved assertions.
