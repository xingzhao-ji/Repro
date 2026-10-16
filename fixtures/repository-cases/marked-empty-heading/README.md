# Marked empty heading case

This development case executes the original Marked source from buggy parent
`39cee771b659ea0eba49bd69dba10817403550d6` and upstream fix
`a1034e6dd1ddbc2f723627f271bba29486005c1a`, merged in
[PR 3050](https://github.com/markedjs/marked/pull/3050).
[Issue 3048](https://github.com/markedjs/marked/issues/3048) supplies the actual
input: `Hashtags test`, an empty four-hash heading, and `End of test` on three
consecutive lines.

The independently established expectation is
[CommonMark 0.30 section 4.2](https://spec.commonmark.org/0.30/#atx-headings):
example 78 demonstrates paragraph interruption, and example 79 demonstrates
empty headings. The result is two paragraphs separated by an empty `h4`.
The report's proposed literal HTML is not the expectation: it omits the heading
element. The supplied input and default `breaks: false` also preserve linefeeds
inside the buggy paragraph; the report's displayed `<br>` spelling is not used.

`case.json` freezes the natural navigation, text entry and render actions, the
expected HTML, and the intended wrong paragraph before browser execution.
The completion marker requires an actual parse/render attempt. An empty result,
missing dependency, exception or incomplete action is not the target failure.
No redundant input or actions were added to manufacture a reduction gain.

`upstream/` contains all thirteen unmodified TypeScript source files for each
revision plus their MIT license, README, package/lock metadata and original build
configuration. The browser assets are generated using esbuild 0.28.2 with the
explicit settings recorded in `build.json`; they contain the actual upstream
parser. The tiny local page only calls `ReproMarked.parse` and displays its output.
It cannot select or change the expected behavior.

From the Repro repository root, with lockfile dependencies installed:

```sh
node scripts/build-repository-cases.mjs
node scripts/build-repository-cases.mjs --check
```

The builder verifies every pinned original, rejects undeclared runtime inputs,
and records the compiler version, recipe, script hash, input hashes and output
hashes. It does not install upstream dependencies or execute upstream scripts.
The generated assets have no runtime dependencies. Build receipts establish
source derivation only; no browser outcome or portability is implied. These are
development cases, not held-out evaluation or human-approved assertions.
