# Metrics and claims policy

Every metric needs a definition, cohort, denominator, environment, timestamp, version, method and raw evidence. Report setup failures and exclusions. Do not substitute count-of-tests for engineering impact.

Recommended measurements:
- Clean-environment reproduction rate: intended original failures reproduced / all eligible preregistered cases. Report inconclusive and setup failure separately; never silently exclude them.
- Repeatability: successful identical reproductions / repeated runs per case, with seeds and environment.
- Reduction: action count and fixture bytes before/after, restricted to valid failure-preserving outputs; include computation cost and budgets.
- Human setup effort: measured task time under a documented comparison protocol, not estimated hours saved.
- Candidate discrimination: human-known correct and plausible incorrect revisions checked against a frozen assertion and held-out variations. Publish false acceptance and false rejection separately.
- Capture overhead: application latency, memory and artifact size versus instrumentation-off on stated workloads/hardware.
- Adoption: actual independent maintainers who used and reused the tool, with permission to disclose. Stars, generated demos and your own tests are not customers.

Claims forbidden without evidence: 100% reliable, production ready, zero hallucinations, universally secure, smallest possible reproduction, arbitrary app support, thousands of users, hours saved, human reviewed, independently validated, formal proof, or passed all tests when some were skipped/unrun.

Proposed acceptance targets in this kit are goals only. A passing test of the synthetic state model does not establish browser capture, container isolation, real-app portability or commercial demand.
