# Asset-pack QA

## Actually passed
- Dependency-free static integrity check: `python qa/static-check.py`.
- All 20 HTML/CSS asset or fragment references resolve locally; no external asset references.
- All three SVG files parse as XML. Symbol references resolve to embedded SVG symbol IDs.
- JSON parses, is explicitly marked synthetic, and its counts match the UI: 5 events, 3 fixtures, 3 minimization attempts.
- One H1, unique IDs, no executable JavaScript, and execution button disabled with descriptive text linkage.
- Eight semantic foreground/background pairs parsed from the current `tokens.css` exceed 4.5:1; these are token ratios, not browser-computed styles. Exact calculated ratios are in `qa/static-results.json`.
- Source inspection confirms native anchor navigation, disclosure widgets, reduced-motion handling, alternate status labels, mobile/desktop media rules, and SVG accessible descriptions.

## Blocked / not verified
Installed Chromium was available, with Playwright already installed. A local-only browser check was attempted first under ordinary execution and once through the reviewed escalation route. Both launches failed before page rendering because Chromium's process singleton could not create a socket: `socket() failed: Operation not permitted (1)`.

No screenshots were produced. Visual layout, overflow at desktop or mobile widths, browser focus order, actual interactive operation, and screen-reader behavior have NOT been verified in a running browser. The existence of responsive CSS and semantic HTML is not equivalent to those checks passing.

## Repeatable next check
`node qa/check.cjs` on a machine with installed Playwright and its bundled Chromium browser runs a local-only HTTP preview, checks 1440 × 1150 and 390 × 844 layouts, tests skip-link focus and disclosure activation, and writes full-page captures, architecture capture, and result JSON. No dependency installation is performed by this script. To use an existing compatible Chromium executable instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its full path. Playwright and a usable browser must already be installed; this script does not install either. Chromium sandboxing remains enabled on all platforms.

Human review should inspect density, line wrapping, SVG label legibility, 200% zoom, keyboard-only navigation, forced colors, and assistive-technology announcement before a production UI is approved.

## Claims boundary
The proposed architecture and UI do not establish runtime isolation, fixture fidelity, deterministic reproduction, bug fixes, or minimized-input optimality. The product workflow is illustrated only. Nothing was published or uploaded.

## Harness review correction
The browser harness now explicitly sets `chromiumSandbox: true` and supplies no sandbox-bypass flag. It has not been relaunched after the blocked attempts above. The original blocked-browser status remains unchanged.

`qa/assert-results.cjs` aggregates missing viewport checks, horizontal overflow, missing heading/labels/anchors, unexpected enabled execution, skip-link focus failure, disclosure failure, page/console/request errors, non-success HTTP responses, and missing HTTP observations. Any failure or blocked setup yields a nonzero exit code. `qa/check.cjs` writes `qa/results.json` from its finalization path even when setup or launch fails, provided the output directory is writable; output-write failure is also a nonzero result. Architecture-page errors are collected too.

Executed after the correction:
- `node --test qa/assert-results.test.cjs`: 10 tests passed, 0 failed. These are pure result-aggregation unit tests, not browser or UI tests.
- `node --check qa/check.cjs`: syntax check passed.
- `python qa/static-check.py`: static checks passed again.

Static-check review correction: count labels are now extracted from HTML text and compared with the corresponding JSON array lengths. Contrast input colors are parsed from current CSS tokens rather than copied constants. Eight documented semantic pairs are checked; browser-computed contrast is not claimed. The portable browser harness uses Playwright bundled Chromium unless `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is explicitly set. No browser relaunch was attempted.
