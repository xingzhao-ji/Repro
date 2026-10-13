# Independent engineering review

Review this Repro revision against GOAL.md and docs/ACCEPTANCE.md. Inspect the actual implementation, commands, logs and artifacts; do not accept the builder's completion narrative as evidence. Use only permitted local fixtures. Do not mutate external systems.

Attempt to find: wrong-error reproduction; oracle modification; original response mocks that hide target code; leaked private state; stale result after cancel/restart; duplicate owned jobs; unsafe capsule extraction; falsely claimed minimality; hidden dependencies; unexecuted or skipped tests; fake UI interactions.

Classify each finding by observable consequence and give exact reproduction, affected files, and a minimal repair direction. Run the exported capsule on a fresh supported environment if possible. Otherwise state exactly what was not checked. Separate hard correctness/security/accessibility defects from aesthetic preference.

Return PASS only for the stated scope whose evidence you verified. Return FAIL for concrete unsatisfied gates. Return BLOCKED/UNVERIFIED for unavailable prerequisites. Do not rewrite requirements to make the existing implementation pass; ask the owner when a real specification decision is unresolved.
