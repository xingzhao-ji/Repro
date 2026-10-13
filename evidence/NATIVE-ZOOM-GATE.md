# Native Chrome zoom gate: concrete diagnosis

2026-10-13 UTC. The blocked action is the original task's supported computer-use call:

```js
await cua.createBrowserTab("chrome", "http://127.0.0.1:4318", { sessionName: "🔬 Repro QA" });
```

The original task history confirms this exact call failed. The retained release report records `net::ERR_BLOCKED_BY_CLIENT`. The history reader does not return the full original MCP error payload, so the reported error string is sourced to that contemporaneous release record rather than a newly executed probe. No navigation retry was performed during this diagnosis.

## Project-side checks

The current CLI defaults to port 4318 and prints its address only after `serve` resolves. `src/server.ts` awaits `server.listen(options.port, '127.0.0.1', ...)` before returning the actual origin; `/` is a supported GET route. No stale hard-coded advertised hostname or premature readiness announcement was found.

A bounded current-build CLI startup on port 4318 used a new owned workbench directory. Its exact readiness message was observed; process-scoped `lsof` confirmed the same process listening on `127.0.0.1:4318`; the owned process then shut down with exit 0. No HTTP page fetch or browser navigation was made. [Readiness receipt](../.repro-runs/ui-gate-diagnosis/20261013/readiness.json), [server log](../.repro-runs/ui-gate-diagnosis/20261013/server.log). This establishes current server startup, not that the server was ready at the historical failed navigation or that the browser restriction is resolved.

The existing final authorized browser suites also pass their separate product workflow/accessibility checks. They are not substitutes for this denied navigation or native browser zoom.

## Supported browser inspection

Read-only browser inventory reports Chrome connected through the supported extension surface. Its documented capability list offers a viewport override, not a client-policy diagnostic, URL permission override, extension-protection toggle or browser-native zoom control. No matching Repro tab is currently retained. Supported troubleshooting/local-development documentation offers no specific remediation for this error. No unrelated tabs, personal profiles, extension configuration files or browsing history were inspected.

Chromium distinguishes client-blocked requests (`BLOCKED_BY_CLIENT`, -20) from connection refusal (-102), response/CSP rejection, and administrator block-list errors. See the [primary Chromium error definitions](https://chromium.googlesource.com/chromium/src/+/main/net/base/net_error_list.h). The observed error is consistent with client-side restriction; it does not identify which extension, automation service or policy made that decision. Do not guess that an ad blocker, firewall, missing macOS permission or Repro's container seccomp policy caused it.

## Smallest legitimate prerequisite

The browser/automation provider must permit the supported Chrome navigation to the exact loopback origin `http://127.0.0.1:4318`, with Repro's owned server ready. Identify and resolve the actual blocking rule through that provider's legitimate permission/support path, then confirm the restriction is resolved before retrying. No callable supported tool presently exposes that control. A new chroot approval, global Codex permission change, disabling browser protections, switching browser/control mechanisms to evade the denial, or substituting CSS zoom does not satisfy this prerequisite.

Once the original permitted surface is available, perform native 200% browser zoom, capture the complete relevant viewport and overflow/focus/status behavior, and verify the current build at the required dimensions. The historical standalone native-zoom probe recorded layout metrics but a cropped screenshot; its old `outcome: passed` summary is not accepted as a completed visual gate. It is retained for provenance only. No new native zoom result is claimed.

This gate affects only native-zoom acceptance. It does not block verified Linux replay, source publication, portable handoff, HCI study preparation or other independent authorized work. The separate Codex-app UI denial (`Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.`) was respected; project organization completed through supported project tools and is not a remaining task.
