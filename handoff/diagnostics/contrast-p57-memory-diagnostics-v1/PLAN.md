# Prepared P57 continuation plan

This is a proposal and prepared source for review. **Status: PREPARED_NOT_EXECUTED; no pilot, Docker setup or browser run occurs in this preparation turn.** The prior OOM attempt remains sealed and unchanged. Final source hashes and independent review are bound in this task's preparation record after author freeze.

Root reviewed the existing authorization and found90s/120s limits defined **per job**, with sequential jobs and no user-imposed task-wide120s or cumulative cap. No additional end-user, sandbox, paid-resource, security or permission approval was identified solely for five unchanged-boundary jobs. Execution is deferred because the latest instruction limits this turn to preparation/review and exact runtime staging/bindings/envelope review are not yet complete. These are internal completion steps, not an invented external approval flow. [CURRENT-AUTHORIZATION.json](CURRENT-AUTHORIZATION.json) explicitly supersedes blanket cumulative-approval language in the earlier frozen forensic proposal, which remains unchanged as historical evidence.

## Diagnosis and smallest proposed correction

The prior run ended with exit137 / Docker `OOMKilled=true` after28.531398392s under the existing1GiB limit. All50 controls completed, but only six unresolved P390 samples were retained;51 occurrences lack completed retained measurements and no after-state invariants were retained. This is a diagnostic harness interruption, not evidence of product contrast failure. Unsupported sibling shadow extent remains unresolved independently of memory.

Its50,745,836-byte pretty summary is21,019,778 compact bytes. The12 retained product-step arrays hold18,972 outside-paint records and occupy18,100,168 compact bytes,86.11% of that compact summary. All12 arrays have distinct geometry/digests. The source retains completed rows and repeatedly serializes the whole growing result. Telemetry shows memory growth without growing process count, but contains no per-process RSS, heap or allocation stack. The exact process/allocation responsible for OOM is unproved.

The proposed change writes complete, immutable, hash-bound control and node artifacts, retaining only small references after successful writes/readback. It preserves every per-step paint record, glyph witness, identity, control assertion and body/selection check. There is no whole-array deduplication, new paint support or relaxed acceptance. The sampler and all50 browser-control bodies stay unchanged. Bounded Node `process.memoryUsage()` phase records may aid later attribution; they cannot explain the historical kill retrospectively. Memory improvement remains a hypothesis until a separately authorized pilot.

The initial product-era sampled kernel peak already reached **785,764,352 bytes** before the later six-node accumulation. Streaming does not remove single-node Playwright transport/marshalling or Chromium peaks. A P320 node is predicted to return three step arrays rather than two, so a successful P390 result below896MiB cannot establish P320 transient headroom. Inadequate observed headroom must stop the proposed sequence; a smaller unique P320 canary would require a separately revised and reviewed partition/budget. It is not an extra job authorized or included here.

## Exact occurrence partition and proposed order

Occurrence identity includes the original state and occurrence binding, not selector alone. A selector-only set would lose24 of the57 occurrences. The canonical ordered57-key vector has SHA256 `998c4c6cc925197a2bcc5406b9caca8b08ee4b5879b79f98b4c711d0ed65fd8a`.

| Proposed order | Original state | Original occurrence positions | Count | Conditional counted-time estimate |
| --- | --- | --- | ---: | ---: |
| 1: P390 A pilot | P-reflow-390 | 0–11 | 12 | 39.789–51.105s |
| 2: P320 A separate gate | P-reflow-320 | 0–10 | 11 | 51.768–67.3275s |
| 3: P390 B | P-reflow-390 | 12–23 | 12 | 39.789–51.105s |
| 4: P320 B | P-reflow-320 | 11–21 | 11 | 51.768–67.3275s |
| 5: P320 C | P-reflow-320 | 22–32 | 11 | 51.768–67.3275s |

These estimates use the observed P390 prefix, fixed counted phases of7.845s and predicted two/P390 or three/P320 scroll positions. **P320 cost has not been measured.** The summed estimate is235–304s plus unmeasured final-save, context setup, DOM finalization and external orchestration costs. It is not a bound or a performance claim. A P390 result cannot establish P320 safety.

Every proposed job retains the **90s internal /120s outer** limit. Five jobs disclose **450s cumulative internal /600s cumulative outer workload maxima** under the existing per-job boundary. These sums exclude Docker setup, copying, cleanup and independent audit wall time; they are not an end-to-end600s promise or a new permission requirement. No individual limit increases. The five distinct subsets contain57 unique occurrences exactly once; no duplicate pilot or repeated unchanged batch is included.

## Proposed future runtime isolation and continuation gate

Each batch would have a fresh process/browser/container/cgroup and a separately owned nonce, read-only input volume and empty evidence volume. Its full exact-owned cleanup would finish before the next batch. Reuse only the already reviewed runtime design and exact pinned image/profile, with focused binding review of the new source, batch selector and task identity before any GO. The current task performs no runtime staging.

After this preparation is sealed, any future execution must use a new task directory and reference/copy these exact frozen source artifacts. Do not add runtime files to this sealed preparation or to the prior sealed diagnostics.

The concrete proposed in-container command adds one explicit batch selector to the revised source. For the first unique batch it is:

```text
UV_THREADPOOL_SIZE=1 node --v8-pool-size=1 --import /work/verification-inputs/resource-probe.mjs /work/verification-inputs/contrast-p57-memory-batch-probe.mjs /work/contrast-p57-memory-batch-inputs.json /work/.repro-runs/p390-00-11 p390-00-11
```

The later selectors, once their respective continuation gates permit them, are `p320-00-10`, `p390-12-23`, `p320-11-21`, `p320-22-32`, each with its own matching output directory. Future staging must bind the frozen source/prepared-input hashes, change only the telemetry entrypoint selector as needed, preserve the clean environment and validate every runtime input before/after. This command is proposed text, not a command executed by this task.

The unchanged boundary is128 tasks,1GiB memory,twoCPUs,4MiB combined logs,network none,read-only root/inputs,all capabilities dropped,no-new-privileges,enabled Chromium sandbox,existingDocker init,V8/UV pools ofone,no home/credential/socket mounts,120s outer deadline and90s internal budget. The inherited Docker combined memory+swap setting is not increased. No Chromium flags, resource/security policy or product styles change.

A later coordinator must review each unique batch result before authorizing the next. The proposed continuation decision requires all of the following:

- Exactly one recorded start and no restart; Docker final state confirms not running and not OOM-killed. Preserve the probe's original exit semantics: exit0 corresponds to its all-measured-pass outcome; expected exit1 may accompany a fully completed unresolved or measured-failure outcome. Exit1 is eligible for continuation only when independent review establishes complete batch finalization, zero unattempted selected nodes, legitimate recorded statuses and no harness/node/body/selection/cleanup error. It must never excuse an assertion failure, error, interruption or missing result. The driver `test-receipt.json.elapsed_seconds` must be **≤75s**. This measures start/attach through final state and excludes later artifact copying/cleanup; it is a stricter planning gate, not a new timeout.
- Complete terminal telemetry and completion record, with no sampler error or missing required counters; observed cgroup kernel memory peak **≤896MiB (939,524,096 bytes)**, leaving128MiB to the hard cap. Require zero PID/memory/OOM events, zombies, deadline expiry and log-cap events. Sampled zero counters alone are insufficient. No observed peak proves a universal future bound.
- All50 controls actually completed and satisfied their assertions. Every selected occurrence has the exact original state/packet/trial/selector/HTML binding and all original node assertions. Every detailed artifact is present, immutable and closed by exact bytes/hash; no dangling or duplicate reference.
- Complete before/after body equality and final selection checks for the entire batch state, with no unexpected request, page error or cleanup error. Finalization is required even when individual nodes are unresolved.
- Before/after input identity and exact-owned cleanup pass; zero batch-owned containers and volumes remain and transfer never started. Bind raw artifacts, final Docker state, telemetry and independent result review to the exact source/batch/nonce.

**Legitimately unresolved paint is allowed by this execution-integrity gate.** It remains unresolved in all reports and cannot be converted into a product pass. A valid completed measurement that contradicts an acceptance requirement remains a measured failure. The gate does not require green ratios or weaken coverage/DOM assertions. Any gate failure stops later jobs and preserves the actual partial result; no unchanged automatic retry, fallback or resource increase follows. The first P320 batch has its own gate before its remaining siblings.

## Aggregate closure

Detailed files from an unfinished batch remain partial evidence, even if a node file was fully written. The aggregate may use a node as completed acceptance evidence only after that whole batch's controls, node checks, before/after body and final selection invariants, runtime outcome and cleanup are independently complete. Each source-bound state/occurrence key must appear exactly once across the five declared batches, with exact artifact hash/byte closure and no extras. All57 must be accounted for explicitly as measured-pass, measured-fail, unresolved or without completed evidence. An incomplete aggregate must not claim completion or universal contrast acceptance.

The prior six partial unresolved records are retained historical evidence; the proposed57-key partition does not silently merge or relabel them. Previous raw188 axe incomplete statuses, L320/L65 paint-method limitations, six browser workflow failures, native zoom and actual screen-reader gates remain unchanged. Bounded minimality=unverified remains permitted; human/held-out research and broader publication/portability claims remain outside this preparation.
