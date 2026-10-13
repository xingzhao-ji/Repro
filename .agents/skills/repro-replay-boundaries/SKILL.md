---
name: repro-replay-boundaries
description: Specify or debug Repro replay boundaries, ordered browser and network execution, and clean-machine capsule portability for containerized web failures.
---

# Repro replay boundaries

A capsule is an executable experiment with explicit boundaries, not a video of a
failure. Read [the project goal](../../../GOAL.md) before expanding supported scope.

## Declare what actually executes

Document each boundary in the capsule manifest:

- Application components and version or source digest actually executed.
- Database reset and seed procedure, including schema and fixture identity.
- Browser engine/version, viewport, locale, time zone, clock, and random inputs
  when they influence the failure.
- Captured browser actions, readiness conditions, and the partial order of
  causally important requests and responses.
- Real services, synthetic substitutes, and recorded response mocks.
- Frozen assertion, observation point, timeout, and permitted nondeterminism.

Avoid using arbitrary sleeps as the only ordering mechanism. Prefer observable
readiness and event dependencies; record the actual sequence when timing is the
failure trigger. Preserve concurrent relationships rather than accidentally
serializing a race out of existence.

## Mock boundaries constrain conclusions

A response replay mock can establish a frontend defect conditioned on that
response. It cannot establish that a changed backend now computes the response
correctly. If the backend output is replaced by a captured response, the backend
fix is outside the executed evidence boundary.

For a backend-fix claim, execute the relevant backend path against resettable
fixtures on both versions, or report that the existing capsule cannot validate
that claim. Moving the boundary creates a new experiment; document and validate
it rather than silently changing the comparison.

Recorded output must not contain a precomputed PASS verdict. The assertion must
observe the execution under test, not merely compare metadata to expected text.

## Clean-machine replay

- Start from the declared images/source and documented prerequisites in a fresh
  permitted sandbox. Clear state between repetitions and between versions.
- Resolve all required fixtures and dependencies through the capsule manifest.
  Fail visibly when they are absent; do not fall back to the capture machine.
- Disable undeclared external network access. Distinguish permitted package/image
  acquisition from network access during replay itself.
- Verify that local caches, host files, credentials, browser profiles, and a
  pre-existing database are not required for the observed result.
- Record environment fingerprints, exit status, assertion evidence, and network
  boundary violations. Unexpected traffic makes the result invalid or
  INCONCLUSIVE until understood, rather than silently extending capture scope.

## Untrusted capsules

Inspect an imported capsule before execution and run it only in an authorized
sandbox with bounded resources and restricted filesystem/network access. Never
mount the host Docker socket, host credentials, or broad home directories.
Containerization alone does not justify privileged execution or host access.
Do not automatically obtain credentials, publish artifacts, or incur spend.
Respect denied host actions and report blockers instead of bypassing them.

## Report

State the supported failure claim and the exact boundary supporting it. Label
capture-machine success separately from independently observed clean-machine
success; unavailable clean-machine evidence is INCONCLUSIVE, not PASS.
