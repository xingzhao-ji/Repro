# Prospective validator handoff

Author code is frozen by `author-freeze-v2.json` (SHA256 `5bf6a832612df33fb8ace20b6dfbd12a87f6ab8363a3d643ae3b1b8631faa6d9`), superseding the first author freeze after an independent review caught a wrong postrun binding key. No runtime, Docker, browser, Git or historical evidence mutation was performed by this agent.

Run from the repository:

```bash
python .repro-runs/cloud-continuation/contrast-p57-approved-execution-v1/validator/validate-approved-job.py --runtime .repro-runs/cloud-continuation/contrast-p57-approved-execution-v1/runtime/p390-00-11 --job p390-00-11
```

Use the actual unique stage/job ID for each later authorized job. The input contract defaults to the independently reviewed `inputs/expected-bindings.json`; any override must match its pinned SHA256. `--preflight` checks staged bindings only and reports `runtimeExecuted:false`; it is not a runtime acceptance result. The first actual stage passed preflight with 3,640 retained file bindings.

Root must require process exit 0, `status: CONTINUATION_GATES_PASS`, `continuationGate: PASS`, `diagnosticChecksComplete: true`, `issues: []`, and `completedCleanupGate.status: PASS` after real external cleanup. Missing/malformed evidence exits 2 with `INCOMPLETE_VALIDATION`; completed failed gates exit 1 with `CONTINUATION_GATES_STOP`. Both stop continuation. Root independently controls sequence, unique starts and the first-P320 continuation decision; this read-only validator never starts work.

`cleanup_gate.py` validates the first naturally scheduled nonterminal census identified by the settlement sample counter, separate terminal census, complete closing read bounds, strict chronological sweep order, exact initial init/Node PID/start ticks and unchanged identities, all subsequent clean censuses, zero active contexts, and unique logged normal browser exit bound to retained child identity. Earlier qualifying samples cannot be skipped, and missing/unreadable or compressed post-close census evidence cannot establish closure. Earlier Z observations are retained, with no continuous-absence or harmlessness claim.

The external validator preserves the 90-second internal and 120-second outer bounds, 90-second driver threshold, 896 MiB observed peak, zero resource events, original sandbox/profile/image/ownership, input/archive/artifact/byte caps, original 50 controls, and source/sidecar/real-exit agreement. The workload helper derives current statuses from complete evidence; legitimate completed unresolved source exit 1 may pass execution integrity, but is never promoted to a contrast pass. No historical gate is applied again or reclassified.

Authored offline checks passed: 29 cleanup tests; 26 external telemetry, log, sidecar, driver and exact five-job artifact-schema cases; four workload test methods covering three legitimate outcome classes, 27 corruptions, five witness corruptions and all five positive/wrong-partition assignments. The independent reviewer also supplied counterexamples that were repaired before runtime: skipped first eligible census, reversed/overlapping sweeps, wrong postrun binding key, and source-index screenshot/equivalence generalization. Artifact counts are exactly 23/23/22/21/21 with 1/2/0/0/0 product screenshots in approved execution order.

Final executable SHA256:

- `validate-approved-job.py`: `83b78b9e928bc32419a84372f028a8ee7232ee256e2f8d7ff22b134b2e64e437`
- `cleanup_gate.py`: `f29222815b9f6419eb7b4a01eef4cb8aac9369a7a4681ca498c9826d4091f814`
- `workload-evidence/workload_validator.py`: `8133771e3447ed71544699cd3b86015f9ed29559472a1d11ef23390bfbaf0cc6`
- `workload-evidence/prospective-expectations.json`: `e5b973ed32dbd7b1fbfb4aad71a95830c02d44134b61e82d0f044541cdba48a9`

Final independent review belongs to the separate `review` subtree. Runtime readiness and runtime outcomes must be reported from that review and subsequent actual records, not inferred from these offline checks.
