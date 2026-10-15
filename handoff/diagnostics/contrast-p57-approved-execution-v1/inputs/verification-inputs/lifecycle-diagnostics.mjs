// scripts/lifecycle-diagnostics.ts
var LIFECYCLE_LIMITS = Object.freeze({
  phaseEvents: 32,
  phaseBytes: 16 * 1024,
  metadataBytes: 128 * 1024,
  combinedBytes: 4 * 1024 * 1024,
  taskStatReads: 128,
  statBytes: 4096,
  completionReserve: 2048
});
var validPid = (pid) => Number.isSafeInteger(pid) && pid > 0;
var validTicks = (ticks) => typeof ticks === "string" && /^\d{1,24}$/.test(ticks);
function errorCode(error) {
  try {
    const code = error !== null && typeof error === "object" && "code" in error ? error.code : void 0;
    return typeof code === "string" && ["ENOENT", "ESRCH", "EACCES", "EPERM", "EIO", "EBADF", "ENOTDIR"].includes(code) ? code : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}
function parseProcStat(text, expectedPid) {
  const bad = () => {
    throw new Error("MALFORMED_STAT");
  };
  if (!validPid(expectedPid) || text.length > LIFECYCLE_LIMITS.statBytes || Buffer.byteLength(text) > LIFECYCLE_LIMITS.statBytes) return bad();
  const raw = text.trim(), start = raw.indexOf("("), end = raw.lastIndexOf(")");
  if (start < 2 || end <= start || !/^\d+ $/.test(raw.slice(0, start))) return bad();
  const pid = Number(raw.slice(0, start).trim()), name = raw.slice(start + 1, end);
  const fields = raw.slice(end + 2).split(" ");
  if (pid !== expectedPid || raw[end + 1] !== " " || name.length > 128 || /[\r\n]/.test(name) || !/^[A-Za-z]$/.test(fields[0] ?? "") || !/^\d+$/.test(fields[1] ?? "") || !/^\d+$/.test(fields[17] ?? "") || !validTicks(fields[19])) return bad();
  const ppid = Number(fields[1]), threads = Number(fields[17]);
  if (!Number.isSafeInteger(ppid) || ppid < 0 || !Number.isSafeInteger(threads) || threads < 0) return bad();
  return { pid, name, state: fields[0], ppid, threads, start_ticks: fields[19] };
}
function createLifecycleDiagnostics(options) {
  const limits = LIFECYCLE_LIMITS;
  let rawBytes = 0, metadataBytes = 0, phaseBytes = 0, phaseEvents = 0;
  let taskStatReads = 0, firstZombie = "not-observed";
  let completionWritten = false, finished = false, metadataWritable = true, bytesUncertain = false;
  const issues = /* @__PURE__ */ new Set();
  let issueOverflow = false;
  let sweepStart, reads = [], lastFingerprint = "";
  let closingSamples = false;
  let previousClock;
  const fail = (code) => {
    if (issues.size < 16 || issues.has(code)) issues.add(code);
    else issueOverflow = true;
  };
  function now() {
    try {
      const clock = options.clock();
      if (typeof clock.utc !== "string" || clock.utc.length > 64 || !Number.isFinite(Date.parse(clock.utc)) || typeof clock.monoNs !== "bigint" || clock.monoNs < 0n || clock.monoNs.toString().length > 24) throw new Error();
      if (previousClock !== void 0 && clock.monoNs < previousClock) fail("CLOCK_REVERSED");
      previousClock = clock.monoNs;
      return { utc: clock.utc, monoNs: clock.monoNs.toString() };
    } catch {
      fail("CLOCK_ERROR");
      return { utc: null, monoNs: null };
    }
  }
  function boundedLabel(value) {
    if (typeof value !== "string") {
      fail("LABEL_INVALID");
      return "invalid";
    }
    let result = "", bytes = 0;
    for (const c of value.slice(0, 512)) {
      const n = Buffer.byteLength(c);
      if (bytes + n > 512) break;
      result += c;
      bytes += n;
    }
    if (result !== value) fail("LABEL_TRUNCATED");
    return result;
  }
  function append(sink, line, kind) {
    const expected = Buffer.byteLength(line);
    let written, failed;
    try {
      const result = sink(line);
      if (!Number.isSafeInteger(result.bytes) || result.bytes < 0 || result.bytes > expected) {
        bytesUncertain = true;
        written = expected;
        failed = true;
      } else {
        written = result.bytes;
        failed = written !== expected || result.error !== void 0;
      }
    } catch {
      bytesUncertain = true;
      written = expected;
      failed = true;
    }
    if (kind === "raw") rawBytes += written;
    else metadataBytes += written;
    if (failed) {
      fail(kind === "raw" ? "RAW_WRITE_FAILED" : "METADATA_WRITE_FAILED");
      metadataWritable = false;
    }
    return !failed;
  }
  function emit(value, phase = false) {
    if (finished) {
      fail("AFTER_FINISH");
      return false;
    }
    if (!metadataWritable) return false;
    const line = JSON.stringify(value) + "\n", size = Buffer.byteLength(line);
    if (metadataBytes + size + limits.completionReserve > limits.metadataBytes) {
      fail("METADATA_CAP");
      metadataWritable = false;
      return false;
    }
    if (rawBytes + metadataBytes + size + limits.completionReserve > limits.combinedBytes) {
      fail("COMBINED_CAP");
      metadataWritable = false;
      return false;
    }
    if (phase && phaseBytes + size > limits.phaseBytes) {
      fail("PHASE_BYTE_CAP");
      return false;
    }
    const before = metadataBytes, ok = append(options.appendMetadata, line, "metadata");
    if (phase) {
      phaseBytes += metadataBytes - before;
      phaseEvents++;
    }
    return ok;
  }
  function mark(label, event, contextCount) {
    if (phaseEvents >= limits.phaseEvents) {
      fail("PHASE_EVENT_CAP");
      return;
    }
    const phase = boundedLabel(label);
    if (phase === "final.browser.close" && event === "start") closingSamples = true;
    if (!["start", "settled", "error", "event"].includes(event)) {
      fail("PHASE_INVALID");
      return;
    }
    if (contextCount !== void 0 && (!Number.isSafeInteger(contextCount) || contextCount < 0 || contextCount > 128)) {
      fail("CONTEXT_COUNT_INVALID");
      return;
    }
    let nextSampleIndex;
    if (phase === "final.browser.close") {
      try { nextSampleIndex = options.nextSampleIndex(); } catch { fail("SAMPLE_INDEX_UNAVAILABLE"); }
      if (!Number.isSafeInteger(nextSampleIndex) || nextSampleIndex < 0) { fail("SAMPLE_INDEX_INVALID"); nextSampleIndex = null; }
    }
    emit({ kind: "phase", phase, event, ...now(), ...contextCount === void 0 ? {} : { contextCount }, ...phase === "final.browser.close" ? { nextSampleIndex } : {} }, true);
  }
  function safeContextCount(get) {
    if (!get) return void 0;
    try {
      return get();
    } catch {
      fail("CONTEXT_COUNT_ERROR");
      return void 0;
    }
  }
  async function observeClose(label, operation, contextCount) {
    mark(label, "start", safeContextCount(contextCount));
    try {
      const value = await operation();
      mark(label, "settled", safeContextCount(contextCount));
      return value;
    } catch (error) {
      mark(label, "error", safeContextCount(contextCount));
      throw error;
    }
  }
  function stat(path, pid) {
    const before = now();
    try {
      const read = options.readStat(path, limits.statBytes);
      if (read.truncated || typeof read.text !== "string" || read.text.length > limits.statBytes || Buffer.byteLength(read.text) > limits.statBytes) {
        fail("STAT_TRUNCATED");
        return { status: "truncated", before, after: now() };
      }
      try {
        return { status: "read", before, after: now(), process: parseProcStat(read.text, pid) };
      } catch {
        fail("STAT_MALFORMED");
        return { status: "malformed", before, after: now() };
      }
    } catch (error) {
      fail("STAT_READ_ERROR");
      return { status: "unavailable", code: errorCode(error), before, after: now() };
    }
  }
  function inspectFirstZombie(target) {
    if (firstZombie !== "not-observed") return;
    firstZombie = "incomplete";
    if (!validPid(target.pid) || !validTicks(target.start_ticks)) {
      fail("Z_IDENTITY_INVALID");
      emit({ kind: "first-zombie", status: "invalid-observed-identity" });
      return;
    }
    const identity = { pid: target.pid, start_ticks: target.start_ticks };
    const before = stat(`/proc/${target.pid}/stat`, target.pid);
    const initialMatch = before.status === "read" && before.process.start_ticks === target.start_ticks;
    if (!initialMatch) fail("Z_IDENTITY_BEFORE");
    let listingStatus = "not-attempted", listedCount = 0, truncated = false;
    const tasks = [];
    let readsComplete = true;
    if (initialMatch) {
      try {
        const listing = options.listTasks(target.pid, limits.taskStatReads);
        listedCount = Math.min(listing.names.length, limits.taskStatReads + 1);
        truncated = listing.truncated || listing.names.length > limits.taskStatReads;
        listingStatus = truncated ? "truncated" : "read";
        if (truncated) {
          fail("TASK_ENTRY_CAP");
          readsComplete = false;
        }
        if (!listing.names.length) {
          fail("TASK_LIST_EMPTY");
          listingStatus = "empty-unverified";
          readsComplete = false;
        }
        const seen = /* @__PURE__ */ new Set();
        for (const name of listing.names.slice(0, limits.taskStatReads)) {
          if (typeof name !== "string" || !/^[1-9]\d{0,15}$/.test(name) || !validPid(Number(name)) || seen.has(Number(name))) {
            fail("TASK_ID_INVALID");
            readsComplete = false;
            tasks.push({ status: "invalid-task-entry" });
            continue;
          }
          const tid = Number(name);
          seen.add(tid);
          taskStatReads++;
          const observed = stat(`/proc/${target.pid}/task/${tid}/stat`, tid);
          if (observed.status !== "read") readsComplete = false;
          tasks.push({ tid, ...observed });
        }
      } catch (error) {
        fail("TASK_LIST_ERROR");
        listingStatus = "unavailable";
        readsComplete = false;
        tasks.push({ status: "list-error", code: errorCode(error) });
      }
    }
    const after = stat(`/proc/${target.pid}/stat`, target.pid);
    const finalMatch = after.status === "read" && after.process.start_ticks === target.start_ticks;
    if (!finalMatch) fail("Z_IDENTITY_AFTER");
    const stable = initialMatch && finalMatch;
    const complete = stable && readsComplete && listingStatus === "read";
    const written = emit({
      kind: "first-zombie",
      identity,
      before,
      after,
      identityStable: stable,
      status: complete ? "complete-observation" : "incomplete-observation",
      listingStatus,
      listedCount,
      truncated,
      taskStatReads,
      taskAttribution: stable ? "same-observed-leader-identity" : "unconfirmed-target-identity",
      tasks
    });
    if (complete && written) firstZombie = "complete";
  }
  function beginSweep() {
    sweepStart = now();
    reads = [];
  }
  function timedRead(pid, read) {
    const before = now();
    try {
      return read();
    } finally {
      const after = now();
      if (reads.length < limits.taskStatReads && validPid(pid)) reads.push({ pid, before, after });
      else fail("READ_BOUNDS_CAP");
    }
  }
  function observeSample(list, fingerprint, sample, phase) {
    const after = now();
    const zombies = list.filter((p) => p.state === "Z");
    if (closingSamples || phase !== "interval" || fingerprint !== lastFingerprint || zombies.length) {
      const origin = sweepStart?.monoNs;
      const offset = (stamp) => origin !== void 0 && origin !== null && stamp.monoNs !== null ? (BigInt(stamp.monoNs) - BigInt(origin)).toString() : null;
      emit({
        kind: "read-bounds",
        sample,
        before: sweepStart ?? null,
        after,
        processReadEncoding: "[pid,beforeOffsetNs,afterOffsetNs] from before.monoNs",
        processReads: reads.map((r) => [r.pid, offset(r.before), offset(r.after)]),
        atomicSnapshot: false
      });
    }
    lastFingerprint = fingerprint;
    if (zombies[0]) inspectFirstZombie(zombies[0]);
  }
  function writeRaw(line) {
    if (finished) {
      fail("AFTER_FINISH");
      return false;
    }
    const size = Buffer.byteLength(line);
    if (rawBytes + metadataBytes + size + limits.completionReserve > limits.combinedBytes) {
      fail("COMBINED_CAP");
      return false;
    }
    return append(options.appendRaw, line, "raw");
  }
  function summary() {
    return {
      status: issues.size || issueOverflow || bytesUncertain ? "incomplete" : "complete",
      issues: [...issues],
      issueOverflow,
      bytesUncertain,
      rawBytes,
      metadataBytes,
      combinedBytes: rawBytes + metadataBytes,
      phaseEvents,
      phaseBytes,
      firstZombie,
      taskStatReads,
      completionWritten,
      limits
    };
  }
  function finish(base, closure) {
    if (finished) {
      fail("AFTER_FINISH");
      return summary();
    }
    finished = true;
    const allowed = {
      samples: typeof base.samples === "number" && Number.isSafeInteger(base.samples) && base.samples >= 0 ? base.samples : null,
      bytes: rawBytes,
      failure: base.failure,
      interval_ms: 100,
      byte_limit: limits.combinedBytes
    };
    if (allowed.samples === null) fail("COMPLETION_INVALID");
    if (base.failure !== null) fail("RAW_SAMPLER_INCOMPLETE");
    if (typeof base.failure !== "string" && base.failure !== null) {
      fail("COMPLETION_INVALID");
      return summary();
    }
    if (typeof base.failure === "string" && Buffer.byteLength(base.failure) > limits.completionReserve) {
      fail("COMPLETION_CAP");
      return summary();
    }
    if (closure?.closeFailed) fail("SINK_CLOSE_FAILED");
    if (closure && (!Number.isSafeInteger(closure.sourceExitCode) || closure.sourceExitCode < 0 || closure.sourceExitCode > 255)) {
      fail("COMPLETION_INVALID");
      return summary();
    }
    let line = "", size = 0;
    for (let i = 0; i < 8; i++) {
      line = JSON.stringify({ ...allowed, lifecycle: {
        ...summary(),
        status: "provisional-external-io-verification-required",
        observedStatusBeforeCompletionWrite: summary().status,
        metadataBytes: metadataBytes + size,
        combinedBytes: rawBytes + metadataBytes + size,
        completionWritten: false,
        ...closure ? { sourceExitCode: closure.sourceExitCode, closeFailed: closure.closeFailed } : {}
      } }) + "\n";
      const next = Buffer.byteLength(line);
      if (next === size) break;
      size = next;
    }
    size = Buffer.byteLength(line);
    if (size > limits.completionReserve || metadataBytes + size > limits.metadataBytes || rawBytes + metadataBytes + size > limits.combinedBytes) {
      fail("COMPLETION_CAP");
      return summary();
    }
    completionWritten = append(options.appendCompletion, line, "metadata");
    return summary();
  }
  return { mark, observeClose, beginSweep, timedRead, observeSample, writeRaw, summary, finish, retainClosingSamples: () => closingSamples };
}
export {
  LIFECYCLE_LIMITS,
  createLifecycleDiagnostics,
  parseProcStat
};
