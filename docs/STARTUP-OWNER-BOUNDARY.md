# Startup owner boundary — architecture required, not installed

This review continues `51ee29a` / `e67b573`. Their profile-retention guard remains unchanged. The three failed cleanup assertions remain requirements. No new owner is installed, and startup cleanup is not complete. The original htmx close failure remains a separate unresolved failure.

## What the installed boundaries actually expose

| Boundary | Useful observation | Missing guarantee |
| --- | --- | --- |
| Playwright 1.64.0 `launchPersistentContext` | Context after successful acquisition | Rejection supplies neither the underlying child handle nor a promise for completed failed-launch cleanup. `coreBundle.js:41157` and `:41284` race cleanup with aborted progress. |
| `launchServer().process()` | Direct child after successful server acquisition | No handle before failed acquisition; direct-child termination does not prove descendant termination. |
| Node process diagnostics | Direct `ChildProcess` creation/spawn, before launch can reject | Native Chromium forks do not pass through Node. Built-in channels are experimental. [Node documentation](https://nodejs.org/download/release/v26.7.0/docs/api/diagnostics_channel.html#process). |
| Documented Playwright `executablePath` hook | A wrapper can establish a per-launch handshake and preserve the pipe transport | Wrapper exit and process-group disappearance do not account for a detached/reparented descendant. It also bypasses normal executable selection/host validation; substituting `chromium.executablePath()` would change this headless-shell runtime. |
| Existing `scripts/measure-beta.mjs` supervisor | Dedicated group, periodic numeric census and previously observed descendants | Playwright starts Chromium in another detached group (`coreBundle.js:10027–10036`). The supervisor explicitly admits missed short-lived escaped processes at line 285. It measures a run; it is not a complete ownership authority. |

The needed completion condition is **creation sealed, all owned processes completed, and no unaccounted descendants**. “No children observed” before acquisition/preparation is sealed does not establish no future work. A wrapper's `close` event alone establishes neither sealed descendant creation nor descendant completion. Successful polling is not a substitute for either fact.

The installed macOS SDK explicitly rules out recursive kqueue tracking: `/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/sys/event.h:356` says, “NOTE_TRACK, NOTE_TRACKERR, and NOTE_CHILD are no longer supported as of 10.5.” This was a source read, not an attempted privileged operation. The current host reports macOS 27.0.1; the installed SDK is macosx26.1 and does not declare `es_new_descendants_client`.

## Smallest complete ownership change identified

Use one native owner per launch, outside a worker that contains that launch's Playwright activity. Move the per-run browser execution into the worker, preserving the same manifest, actions, oracle, browser selection, flags, sandbox and network rules. Keep profile deletion in the parent. A Playwright context cannot simply be serialized back to the parent; this is an adapter execution-boundary change, not a Promise wrapper.

The owner must be established **before** the worker can create browser processes. It must survive worker rejection, timeout and exit. Its acknowledgment must bind the run identity and assert sealed creation plus complete descendant shutdown. An owner crash, missing acknowledgment, observer error/event loss, deadline expiry or uncertain descendant identity retains the profile and returns cleanup failure. Later completion cannot rewrite the failure or delete the profile asynchronously. Do not grant deletion authority to a caller-supplied boolean or a file the target can forge.

Platform implementations have different prerequisites:

- **Linux:** a dedicated native helper can set `PR_SET_CHILD_SUBREAPER` before spawning its sole worker, stop creating children after launch, and reap descendants until `ECHILD`. Orphaned/double-forked descendants are reparented to the nearest living ancestor subreaper; changing a process group/session does not defeat that relationship. This is the narrowest stronger Linux primitive found, but it still needs implementation and deterministic runtime verification. [Linux contract](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html). The unchanged policy lists `prctl`, `wait4` and `waitid`; this source observation is not a fresh runtime policy pass. A native helper introduces compiled artifacts, Linux ABI/build prerequisites and binary provenance.
- **Native macOS:** no equivalent complete boundary was found in the installed Node/Playwright/SDK interfaces. Apple's newer descendant-only Endpoint Security API is a possible kernel observation boundary, **not a verified solution**. Apple documents recursive descendant visibility and an Endpoint Security entitlement; it does not require root or TCC. A suitable supported SDK/runtime, legitimately provisioned signed helper and demonstrated complete event accounting would be prerequisites. The installed SDK lacks the declaration; no API call, entitlement request, signing-key access, SDK installation or permission probe was attempted. [Apple API and requirements](https://developer.apple.com/documentation/endpointsecurity/es_new_descendants_client%28_%3A_%3A%29?changes=_4). Do not substitute the older system-wide ES client, grant Full Disk Access, disable protections or use private APIs.
- **Alternative on a Mac host:** a run-owned Linux PID namespace/container can provide a different descendant boundary with the existing unprivileged container controls. It introduces a VM/container prerequisite and is Linux execution. It cannot silently replace the required native macOS acceptance or justify changing that criterion. A container boundary must verify the actual namespace/cgroup is empty; a Docker client exit is insufficient.

No root privilege, broader seccomp rule, browser sandbox change, process-name kill, global Playwright cleanup or polling-based claim is part of this proposal. None of these material alternatives has been adopted by this review.

The macOS candidate also needs behavioral compatibility review: Apple's descendant client restricts non-root execution of setuid/setgid binaries in the subtree. It must not be treated as purely observational or adopted by changing UID/sandbox settings to accommodate it. Any complete implementation must preserve the existing browser/security behavior.

The Linux helper must verify subreaper setup before spawning, retain exclusive reaping ownership, seal creation, and use an all-child join/reap that includes applicable clone children. `ECHILD` from waiting only for the worker PID does not establish descendant completion.

## Integration and verification requirements

1. Implement and test the ownership primitive first: delayed acquisition, failed acquisition, deadline expiry, rejected cleanup, late completion, owner crash, detached/reparented survivors and an unrelated sentinel. Include a surviving descendant after both wrapper close and original group disappearance. Positive completion must permit deletion; uncertainty must retain it.
2. Integrate with the adapter using the existing absolute limits. Owner confirmation and context close must share the existing 2,000 ms cleanup budget, not receive separate additive allowances. Preserve the 1,000 ms drain and existing launch/deadline rules. A missing context-close acknowledgment must not become success merely because an owner later exits; keep the original htmx failure classification separate.
3. Keep worker IPC bounded and restricted to registered inputs, approved observations/events and structured errors. Do not inherit arbitrary parent preload/test flags, credentials or private target diagnostics. Preserve cancellation ownership and server cleanup.
4. Ship and bind all new execution bytes. `scripts/build.mjs` currently builds only CLI/index; capsule allowlists and trusted-copy validation in `src/capsule.ts` must include the worker/helper. `caseHarnessDigest()` currently hashes its own source/bundle; include external worker/helper bytes and update independent reconstruction in `scripts/verify-beta-isolated.mjs`. Test missing, modified and reindexed helper artifacts. Native helper distribution must remain usable by an offline installed capsule without the original workspace.
5. Leave the three existing failed deletion tests unchanged. After a full owner implementation passes ordinary and affected browser checks, rebuild/freeze and run fresh native workflows and full 20 buggy/fixed pairs per case, fresh Linux arm64 export verification, and affected installed-package checks under the existing criteria. Retain all older failures separately. Accessibility remains deferred/unverified.

This is an implementation/architecture prerequisite, not an observed current tool/service denial. No natural-run diagnostic cohort can supply the missing ownership primitive.

## Executed verification for this review

Production code, the three failing cleanup assertions, deadlines and policy bytes are unchanged from `51ee29a` / `e67b573`. The policy SHA256 remains `949b87f781131e0c1a842e306ee102506d33ba5f33247fe073d62519614ed72b`. New code is confined to `tests/startup-owner-boundary.test.ts` and its controlled process fixture.

The tests demonstrate a detached descendant still writing the owned profile after launcher `close` and original process-group disappearance; rejection and fake-clock deadline expiry retain the profile; late termination cannot change that failure. A positive controlled context-close joins actual owner termination before deletion, with an unrelated sentinel still usable. These are deterministic process/adapter-boundary tests, not proof of a completed real-browser owner. A fourth regression covers the test fixture's own failed readiness. Its observed red result was launcher exit 0 instead of required exit 1, not demonstrated indefinite launcher liveness. The helper now bounds readiness and joins only its captured child's cleanup. Independent review checked these changes and the architecture limitations.

All logs, including failed attempts, remain under ignored `.repro-runs/startup-owner-boundary/`:

| Check | Actual result | Log |
| --- | --- | --- |
| Initial boundary tests | 3/3 passed | `focused-v1.log` |
| Fixture failed-readiness regression before helper repair | 0 passed, 1 failed (exit 0 versus 1) | `readiness-red.log` |
| Final boundary/fixture tests | 4/4 passed | `focused-v2.log` |
| Ordinary suite before fixture hardening | 325/326; existing launch-failure deletion assertion failed | `ordinary-v1.log` |
| Final ordinary suite | 326/327; same unchanged deletion assertion failed | `ordinary-v2.log` |
| Typecheck / lint | Exit 0 on final test bytes | `typecheck-v2.log`, `lint-v2.log` |
| Build / kit | Exit 0; production inputs unchanged by fixture hardening | `build-v1.log`, `kit-v1.log` |
| Fixture syntax | Exit 0 | `fixture-syntax-v2.log` |
| Affected browser selection, diagnostics disabled | 13/15; unchanged startup-deadline and unavailable-browser profile-removal assertions failed | `affected-browser-v1.log` |

The browser command was `PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers node --import tsx --test --test-concurrency=1 tests/case-adapter.browser.ts tests/case-faults.browser.ts`. No broad diagnostic cohort, new native stability cohort, Linux workload or package acceptance was run. Fresh acceptance remains unstarted because prerequisite cleanup checks fail. Prior failures, including original htmx fixed repetition 15, remain preserved separately. No verified startup completion, htmx repair or practical-beta completion is claimed. A clone lacking the ignored logs cannot claim to have reverified them.
