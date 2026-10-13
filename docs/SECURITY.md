# Threat model and release boundaries

A capsule is executable, attacker-controlled content. A JSON manifest or SHA-256 digest does not make it safe. Never execute an unknown capsule directly on the host.

## Assets and adversaries
Protect host files, credentials, network services, source confidentiality, reviewer assertions, and result integrity against malicious target code, hostile capsule archives, prompt injection in logs, and accidental data capture. Local-only tools still need a security model.

## Required controls
- Opt-in capture limited to approved origins and a task-owned profile. Use synthetic data by default. Never copy a user's real browser profile, cookies, authorization headers, or home directory.
- Allowlist exported fields. Strip tokens/secrets before persistence and export, then scan artifacts including URLs, request bodies, database fixtures and screenshots. Masking text alone is not privacy protection. If sanitization alters the bug, disclose it and require synthetic substitution or informed approval; do not call changed behavior equivalent.
- Prevent archive traversal, absolute paths, symlink/hardlink escapes, duplicate entries, archive bombs, unsupported compression, excessive files/size/depth, and hash mismatch. Reject unsafe bundles before unpack or launch.
- Limit CPU, memory, disk, execution time, output size, processes, and network. No host Docker socket inside a capsule. No privileged containers, host network, host PID namespace, credential mounts, or arbitrary bind mounts.
- Treat ordinary Docker isolation as a development boundary, not proof that hostile code is safe. Public/untrusted execution requires a separately reviewed sandbox or VM boundary, unprivileged runtime, egress policy, and deployment-specific hardening. If unavailable, support only explicitly trusted local fixtures and state that limit.
- Restrict outbound access by default. Prevent SSRF into cloud metadata, private networks, host services, or loopback outside the approved target. Be explicit when the target itself is allowed loopback inside a private run network. Do not accept arbitrary URL proxying.
- Validate the local UI/API origin, bind to loopback, reject cross-origin state-changing requests, and avoid unauthenticated remote exposure.
- Keep oracle/harness immutable relative to candidate code, verify identities, and reject skipped/empty/altered assertions. Prompts and logs never authorize tools or weaken the harness.
- Use cancellation-safe, owner-scoped cleanup. An unrelated browser, Docker container, database or process must never be terminated by broad name matching.

## Adversarial tests
Path traversal; symlink escape; overlarge bundle; process timeout; huge stdout; attempted unexpected egress; malicious script in log/viewer content; candidate edits to assertions; wrong failure signature; missing dependency mistaken for reproduction; fixture privacy sentinel leakage; cancellation during export; crashed runner before final ledger write.

Do not run harmful exploit tests on a real user environment. Test controls with owned fixtures in the intended sandbox. Record untested hardening as a release blocker for untrusted/public execution.

## Approval boundaries
Local implementation does not imply authority to publish user information, upload private source, incur charges, create cloud resources, change permissions, configure credentials, or contact maintainers. Prepare these steps and request specific approval. A denied or canceled action is not a challenge to find another route.
