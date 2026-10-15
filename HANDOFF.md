# Repro owner handoff

Development, experiments and diagnostics stopped at the user's request on 2026-10-15. This checkpoint preserves the implemented product and local history, reviewed pending documentation, useful uninstalled research source/tests, and known failures. It is not a release or a claim that remaining acceptance checks pass.

- Repository: <https://github.com/xingzhao-ji/Repro> (verified private and owned by the authenticated user before delivery).
- Handoff branch: `cloud/hci-comparator-redaction`, the existing local branch. GitHub's default `main` is preserved.
- Source checkpoint before handoff: `823c3751f1c02a834d713665fa89927b618530f2`; it contains twelve local commits beyond remote `main` at `0902b3b11af847e2b930cbf091eda0261830efb4`.
- The handoff retains that ancestry and adds coherent documentation/archive commits. The final delivery response and ignored local delivery receipt record the pushed commit and independent remote SHA readback.

```sh
git clone --branch cloud/hci-comparator-redaction --single-branch https://github.com/xingzhao-ji/Repro.git
cd Repro
git rev-parse HEAD
```

Private repository access is required. Compare the displayed SHA with the confirmed handoff SHA, then follow the documented setup when you decide to resume work. No credentials are included or changed by the handoff.

Read [current state and verification boundaries](docs/handoff/STATUS.md), then use the [goal prompt for a new coding agent](docs/handoff/GOAL-PROMPT.md). The original product goal and release contract remain [GOAL.md](GOAL.md) and [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). Later engineering diagnostic caps and approved experiment criteria must not be promoted into original product requirements.

[Local exclusions](docs/handoff/EXCLUDED-LOCAL.md) and its machine-readable inventory identify useful evidence retained outside Git, with exact paths and reasons. [Archived engineering material](handoff/README.md) explains included sources, uninstalled candidates, preserved failures and portability limitations. Source copies and documentation do not reclassify historical failures or authorize any runtime, lifecycle extension, resource change or release.

The existing `origin` in the working environment is a local restoration archive and was preserved. Delivery uses the verified GitHub URL explicitly without force, branch deletion, reset or history rewriting. Your clone will use GitHub as its ordinary `origin`.
