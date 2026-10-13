# Private source delivery

On 2026-10-13 at 19:56 UTC, the explicitly approved reviewed source, tests, assets, documentation and existing history were pushed to the private [xingzhao-ji/Repro repository](https://github.com/xingzhao-ji/Repro).

- Branch: `main`; exact commit: `9399a6c7405aa7599d7b4e35d86152069a23906a`.
- All seven existing commits preserved; no force push or visibility change.
- Remote `HEAD` and `refs/heads/main` independently read back at that exact commit. Repository metadata still reports private.
- Exactly 138 tracked source files. Independent review of seven commits and 173 unique blobs found no secrets or excluded machine data within the review’s coverage. The unrelated `.codex/`, runtime evidence, caches, VM disks, dependencies and generated build files were excluded.
- No `.github/workflows` files exist at this commit. The commit-status API returned an empty status list. Remote CI is not configured; no CI pass is claimed. The earlier checkpoint’s reports remain in that commit; the current [release report](RELEASE.md) and [Linux report](LINUX-PACKAGED.md) distinguish the later HCI evidence.

The local receipt is `.repro-runs/delivery/github-20261013/checkpoint-9399a6c.json`. The working branch remains `task/repro-local-product`. The subsequently reviewed HCI milestone is described in [HCI-INSPECTOR.md](HCI-INSPECTOR.md), with final source/build aggregate `c263f4380f8a6dad58f9403df0135ad34f313a9c24518c1752e744529c67c65d`. Its source, tests and portable reports are included in the commit containing this report; at report preparation, its publication is pending a confirmed non-force push and remote readback. Any successful subsequent delivery must be established from the exact receipt under `.repro-runs/delivery/`. These local checks do not constitute remote CI.

The separate earlier private Library backup contains the same 138 checkpoint source files plus a transfer manifest, without Git history or raw runtime evidence. Library ID: `libfile_bdca044eb9e88191959b7cd8a492936c`; ZIP SHA-256: `e12596d2addf059b509dbff1b8249520f98e74d181d11ad0de5b4e69212b3046`. This records delivery, not a verified persistent cloud execution environment.

Raw local HCI screenshots, traces, receipts, VM state and source inventories remain ignored. The portable reports contain only allowlisted synthetic observations, hashes and relative evidence references. The Library backup does not contain the later HCI implementation.
