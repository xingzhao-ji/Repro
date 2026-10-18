# Independent report/export review

Reviewed reconstructed source pinned to commit `42d2b32fb8ee5e99e5fb21006d3ac4827ffc931e`; source integrity verification is owned by the main verifier. Read AGENTS.md. No source edits, browser runs, network calls, or held-out application/fix inspection were performed by this review.

## Findings

### 1. High: export redaction changes the regression assertion, while expected-value narrative can retain personal data

- `src/report-flow.ts:333-337` sanitizes a frozen failure, then runs the code-mode redactor over the **entire generated test** and rehashes it. This includes executable expected values and selectors, not just comments or observations.
- `src/report-test.ts:61-63` embeds the original expected value as a literal. `src/redaction.ts:94` replaces personal email addresses in code mode.
- `src/report-flow.ts:356-357` copies `check.expected` and the described check into report data without broad redaction. The final scan at lines 424-427 is credentials-only; that mode returns before email redaction (`src/redaction.ts:84`).
- Isolated proof: an expectation of `synthetic-person@private-company.org` generates an exported check with `expected: "[redacted email]"`, while the final narrative still contains the original address. See `review-proofs.json` and executable `review-proofs.mts`.
- Consequence: the recipient's unchanged test rejects an app that correctly returns the intended email, and accepts the placeholder as the expected value. The privacy scan does not remove that email from the expectation narrative. This example uses a synthetic address, not user data. No end-to-end browser claim is made.
- Recommendation: represent withheld expected values/selector data structurally (for example required environment inputs), preserve assertion semantics, and redact all narrative fields independently. Do not sanitize executable code by blind string replacement.

### 2. High when metadata is untrusted: generated source-acquisition commands interpret shell syntax

- `src/report-markdown.ts:188` interpolates clone URL and app subdirectory directly into shell commands without quoting. `shareableRemote` at lines 107-108 only checks the remote's shape/protocol. Inspection preserves remote metadata at `src/app-inspect.ts:181-182`.
- Proof: `https://host.invalid/$(printf${IFS}INJECTED).git` is emitted literally into the clone command. Running that line with a harmless local shell `git` stub, without invoking git or making any network request, shows the argument becomes `https://host.invalid/INJECTED.git`: shell substitution executed. A real app folder `app folder` is emitted as `cd app folder`, which also breaks ordinary recipient commands.
- Consequence: a recipient copying the command can execute shell syntax contained in repository metadata; normal paths containing spaces also fail. This is a copy/paste command risk, not proof that generating/viewing a report automatically executes metadata.
- Recommendation: shell-quote each data argument, reject option-like arguments/use option terminators where supported, and test spaces, quotes, substitutions, and leading hyphens.

### 3. Medium: extractor follows a preexisting `.repro` directory symlink

- `src/report-markdown.ts:86-91` restricts lexical file names and uses exclusive creation, but recursive mkdir accepts an existing symlink to a directory; no canonical-directory/symlink check is performed.
- Proof in task-owned sibling evidence: `recipient/.repro -> ../elsewhere`; extracting one valid hashed block exits 0 and creates `elsewhere/proof.test.mjs`. No file was overwritten. See `review-proofs.json`.
- Consequence: the documented “writes only .repro/ files” boundary is not a filesystem confinement guarantee. An existing symlink causes creation outside the recipient app's `.repro` directory (including outside the app, subject to filesystem permissions).
- Existing tests (`tests/report-markdown.test.ts:61-91`) cover hash tampering, overwrites, `../` names and nested names, but not a symlinked destination directory.
- Recommendation: reject symlink/non-directory `.repro`, verify the destination's real directory, and preserve exclusive creation.

### 4. Medium, source-confirmed branch issue: fresh-check status conflates different failures and ignores nonzero exit on the satisfied branch

- `src/report-flow.ts:577-578` gives an intermittent fresh check status `reproduced` for both `target-failure` and `different`, even while its summary says “failed with a different result.” It reports `passed` for `requirement-satisfied` without requiring test exit 0.
- Lines 579-580 correctly require nonzero exit for the recorded failure, but the next branch says “the test passed” for a satisfied observation without checking exit 0. A test can print its observation and then fail in teardown; generated test teardown is awaited after printing (`src/report-test.ts:162-166`).
- The `not-reproduced` source-status branch already requires exit 0 at lines 574-575, showing the inconsistency. This is a code-path finding, not a browser/teardown reproduction.
- Recommendation: require both matching observation and consistent exit status; distinguish `different` from `reproduced`, and expose teardown/setup failures as failed verification.

## Source identity and verification boundaries

- Fresh-check execution clones the local repository at the recorded commit (`src/report-flow.ts:509-510`), not the advertised remote. It therefore does not prove a recipient can fetch that commit. `pushedTo` comes from local remote-tracking refs (`src/app-inspect.ts:183`), not a live remote check; the type comment correctly states this.
- When the embedded patch is redacted, the fresh check applies the unredacted patch instead (`src/report-flow.ts:531-540`). This difference is disclosed, but a successful check is not evidence that the transferable patch alone works unchanged.
- `sourceDigest` hashes selected metadata/patch/lockfile (`src/app-inspect.ts:294-295`), not all working-tree content. It cannot identify arbitrary source contents for a nongit app. The report separately discloses that no exact revision is available.
- Setup/extraction/install failures generally receive failed/not-run fresh-check statuses (`src/report-flow.ts:500-501,521,526,556,563-567`). Nonzero exit alone is not generally treated as the reported failure; observation values are evaluated against the original manifest at lines 568-571. Finding 4 identifies the narrower inconsistencies.

## Evidence and limitations

Executed only a focused TypeScript proof using `node --import ./node_modules/tsx/dist/loader.mjs ../evidence/review-proofs.mts` from the source directory. Proof output is `review-proofs.json`; all created files are under sibling `evidence/`. Inspected relevant report generation, redaction, source inspection and report test code, including existing tests. No full test-suite pass, browser portability, live recipient workflow, remote access, universal redaction, or production-readiness assurance is asserted.
