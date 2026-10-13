---
name: repro-capture-privacy
description: Design or review Repro opt-in failure capture, synthetic fixtures, redaction, and capsule export without silently changing reproduction validity.
---

# Repro capture privacy

Repro compiles a supported containerized web application failure into a portable
capsule. Capture only the state and observations needed to reproduce that failure.
Read [the project goal](../../../GOAL.md) for the currently supported scope.

## Capture contract

- Capture requires explicit opt-in for the application and session being recorded.
  An enabled recorder in one environment does not authorize production capture.
- Prefer resettable synthetic database fixtures and disposable test accounts.
  Never replace an unavailable production dependency with copied live user data.
- Enumerate captured surfaces before implementation: database rows, browser storage,
  DOM snapshots, screenshots, console output, URLs, headers, request bodies,
  responses, and server logs. Each can contain identifying or secret material.
- Default to a field allowlist. Exclude credentials, authorization headers, session
  cookies, private keys, and unrelated user records from portable output.
- Preserve required browser actions, request identity, network order, and relevant
  initial state. Recording every byte is not a substitute for a capture model.

## Privacy transformations affect validity

Treat masking, deletion, token substitution, and fixture synthesis as changes to
an experiment, not transparent formatting operations.

1. Record which fields change and which failure-relevant relationships must hold.
   Examples include equal IDs across requests, string length, uniqueness, ordering,
   and the difference between absent, null, and empty values.
2. Generate synthetic replacements consistently within the capsule. Do not expose
   raw values in replacement maps, filenames, exception messages, or reports.
3. Re-run the frozen failure assertion against the transformed
   capture from a fresh reset. Preserve the recorded replay boundary and
   expectationBasis. A supplied synthetic specification does not imply human
   approval; keep humanApproval as not-claimed or pending unless evidenced.
4. Report whether the sanitized capsule reproduces the same observable failure.
   If masking removes the failure, report loss of validity; do not export raw
   values to rescue the result or claim the sanitized capture is equivalent.
5. If validation cannot run, mark validity INCONCLUSIVE and state the blocker.

A failed secret scan is a release blocker. A passing scan is evidence about the
scanner's coverage, not proof that every private datum has been removed.

## Export review

- Check all capsule layers: fixtures, image build context, image history, trace
  payloads, source maps, screenshots, caches, lockfiles, logs, and manifests.
- Include transformation provenance and integrity hashes without original secrets.
- Do not embed credentials or require the recipient's ambient credentials.
- Check clean-machine replay after sanitization, rather than only in the capture
  machine's cached environment.
- Export locally within the permitted workspace. Upload, publication, spending,
  and sharing owner information require applicable explicit authorization.
- Respect host permissions. On a denied write, stop that write and report the
  path and blocker; do not self-approve or route around the denial.

## Deliverable

Return the capture surfaces and opt-in scope, synthetic fixture provenance,
transformations, residual limitations, and measured reproduction status. Separate
privacy findings from validity findings so a private but invalid capsule cannot
be mistaken for a successful portable reproduction.
