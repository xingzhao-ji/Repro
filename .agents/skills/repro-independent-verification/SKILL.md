---
name: repro-independent-verification
description: Independently verify Repro capsules and buggy-versus-fixed behavior with a frozen assertion with recorded expectation provenance, clean resets, and evidence-based PASS or INCONCLUSIVE outcomes.
---

# Repro independent verification

Validate the claim supported by the artifact, rather than trusting the artifact's
own success summary. Read [the project goal](../../../GOAL.md) for acceptance scope.

## Separate generation from verification

The verifier needs the public task, capsule, frozen assertion, declared
runtime boundary, and authorized buggy/fixed execution artifacts. It should not
receive the generator's proposed verdict or hidden reference-fix explanation.
Keep benchmark reference fixes and withheld tests out of agent-accessible work.

Freeze the assertion before inspecting the proposed fix. Record its content hash,
author/source, observable, timeout, and environment requirements. Record the
schema fields expectationBasis and humanApproval separately. For a local demo,
the supplied reviewed synthetic specification may establish the expectation:
use expectationBasis supplied-synthetic-specification and humanApproval
not-claimed or pending. An independently established contract can instead use
independent-contract. Neither basis fabricates human review. Use reporter-confirmed
only with actual reporter confirmation and humanApproval recorded only with
evidence. Agent-proposed expectations without independent support remain
proposed-unconfirmed; report dependent verdicts as provisional/INCONCLUSIVE.
Require human approval only for claims that actually need it, and continue
unrelated local build and verification work while that approval is pending.

## Run the comparison

- Inspect imported capsules as untrusted code. Execute only in an approved
  isolated environment with resource limits and restricted mounts/network.
- Never mount the host Docker socket or ambient credential directories.
- Establish clean-machine prerequisites explicitly. Do not reuse the generator's
  database, browser profile, filesystem state, or warmed application process.
- Reset and seed the declared database before every buggy and fixed run.
- Use the same sanitized fixture, actions, ordering, assertion, browser settings,
  and replay boundary for both versions. Record unavoidable version differences.
- Confirm that the buggy version exhibits the target failure and the fixed
  version satisfies the exact same frozen assertion.
- Verify that the code path claimed as fixed actually executes. A recorded
  backend response replay cannot validate the backend computation behind it.
- Use the declared repetition criterion for races or nondeterminism. Preserve
  every run, including unsuccessful reproductions and infrastructure errors.

Do not grant PASS because a subprocess exits zero, an output file says success,
or a screenshot resembles the expected state. Collect direct assertion evidence
and verify that it belongs to the current capsule/version/run.

## Outcome vocabulary

- PASS: All required observations were executed and satisfy the stated acceptance
  claim, including buggy-fails/fixed-passes where that is the requested claim.
- FAIL: A valid, completed experiment contradicts an acceptance requirement.
- INCONCLUSIVE: Missing prerequisites, denied execution, unsupported boundary,
  contamination, nondeterminism beyond tolerance, or infrastructure failure
  prevents establishing the claim.

Use narrower outcomes where appropriate: capture reproduced but portability
unverified; frontend behavior validated but backend fix unverified. Do not merge
these into an overall PASS when a required acceptance check remains unknown.

## Evidence packet

Record capsule and version digests, assertion hash, fixture/reset identity,
execution environment, commands, timestamps, exit status, relevant observations,
repetition outcomes, and unexpected network/dependency access. Keep private data
and credentials out of logs. Report limitations before claiming generality.

Verification does not authorize publication, upload, credentials, paid resources,
or host permission changes. If access is denied, stop the dependent action and
identify the exact missing authorization; do not self-approve or reroute the
blocked action. Preserve completed independent checks as partial evidence.
