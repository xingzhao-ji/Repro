# Morphdom textarea case

This public repository development case executes the unmodified `lib/index.js`
bytes from the pinned revisions of [morphdom](https://github.com/patrick-steele-idem/morphdom).
It is derived from [issue 19](https://github.com/patrick-steele-idem/morphdom/issues/19),
which describes a textarea failing to display the value supplied to morphdom after editing.

- Buggy revision: `8221ace412be8dc1f519f2dc77393f0940134648`.
- Fixed revision: `b72ddd5f21a759d235d70c92d3a37a990499c22f`.
- Upstream application file: `lib/index.js`, copied byte-for-byte to each revision file.
- No upstream application dependencies are declared by the pinned package.
- The independent `page.html` wrapper supplies a CommonJS `module.exports` object,
  the issue's textarea input handler, and readiness/completion text. It does not
  modify the upstream library or compute a passing verdict.
- The initial capture follows two edits as described in the report. Reduction may
  remove an edit; the frozen assertion remains the live textarea value after a
  completed morph, with exact supported failure observations.

`provenance.json` records acquisition URLs and byte identities. Source acquisition
is separate from replay; replay serves these local assets only. No browser run,
performance result, release completion, human approval, or held-out evaluation
is claimed by these source fixtures. Fixed source was copied and hashed without
inspecting its contents during assertion construction.

## Attribution and license

Upstream author: Patrick Steele-Idem. The pinned `package.json` declares `ISC`.
The pinned README's complete license notice is reproduced verbatim below:

# License

ISC
