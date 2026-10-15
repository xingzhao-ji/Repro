import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLifecycleDiagnostics,
  LIFECYCLE_LIMITS,
  parseProcStat,
} from '../scripts/lifecycle-diagnostics.js';

// Offline fixtures only: these tests never read /proc or start a browser/container.
function stat(pid = 39, name = 'chrome-headless', state = 'Z', ppid = 12,
  threads = 2, startTicks = '3694714'): string {
  const fields = Array<string>(20).fill('0');
  fields[0] = state;
  fields[1] = String(ppid);
  fields[17] = String(threads);
  fields[19] = startTicks;
  return `${pid} (${name}) ${fields.join(' ')}\n`;
}

const observed414 = Object.freeze({
  pid: 39, name: 'chrome-headless', state: 'Z', ppid: 12,
  threads: 2, start_ticks: '3694714',
});

test('retained sample 414 stat preserves literal Z and its two threads', () => {
  assert.deepEqual(parseProcStat(stat(), 39), observed414);
});

test('proc stat parser handles spaces and parentheses in comm without shifting fields', () => {
  assert.deepEqual(parseProcStat(stat(39, 'name with ) and ( spaces'), 39), {
    ...observed414, name: 'name with ) and ( spaces',
  });
});

test('proc stat parser rejects malformed and mismatched identities with fixed error text', () => {
  const inputs = ['', '39 broken stat', stat(40), stat(39, 'x', 'Z', 12, 2, 'NaN')];
  const messages: string[] = [];
  for (const input of inputs) {
    assert.throws(() => parseProcStat(input, 39), (error: unknown) => {
      assert.ok(error instanceof Error);
      messages.push(error.message);
      return true;
    });
  }
  assert.equal(new Set(messages).size, 1);
});

test('diagnostic hard limits preserve the independent frozen contract', () => {
  assert.equal(typeof createLifecycleDiagnostics, 'function');
  assert.deepEqual(LIFECYCLE_LIMITS, {
    phaseEvents: 32, phaseBytes: 16384, metadataBytes: 131072,
    combinedBytes: 4194304, taskStatReads: 128, statBytes: 4096,
    completionReserve: 2048,
  });
});

type ProcessRecord = {
  readonly pid: number; readonly name: string; readonly state: string;
  readonly ppid: number; readonly threads: number; readonly start_ticks: string;
};
type Sink = 'raw' | 'metadata' | 'completion';
type Options = Parameters<typeof createLifecycleDiagnostics>[0];
type Diagnostic = ReturnType<typeof createLifecycleDiagnostics>;
const completionBase = Object.freeze({ samples: 417, failure: null, interval_ms: 100, byte_limit: 4194304 });

function fixture(overrides: Partial<Options> = {}) {
  let tick = 0n;
  const output: Record<Sink, string[]> = { raw: [], metadata: [], completion: [] };
  const reads: Array<{ path: string; maxBytes: number }> = [];
  const listings: Array<{ pid: number; maxEntries: number }> = [];
  const append = (sink: Sink) => (line: string) => {
    output[sink].push(line);
    return { bytes: Buffer.byteLength(line, 'utf8') };
  };
  const diagnostic = createLifecycleDiagnostics({
    clock: () => ({ utc: '2026-10-15T02:50:36.034Z', monoNs: ++tick * 1000000n }),
    readStat: (path: string, maxBytes: number) => {
      reads.push({ path, maxBytes });
      const match = /^\/proc\/39\/task\/(\d+)\/stat$/.exec(path);
      if (path === '/proc/39/stat') return { text: stat(), truncated: false };
      assert.ok(match, `Unexpected injected path: ${path}`);
      const tid = Number(match[1]);
      return { text: stat(tid, `task-${tid}`, tid === 39 ? 'Z' : 'S', 12, 1,
        tid === 39 ? '3694714' : String(4000000 + tid)), truncated: false };
    },
    listTasks: (pid: number, maxEntries: number) => {
      listings.push({ pid, maxEntries });
      return { names: ['39', '40'], truncated: false };
    },
    appendRaw: append('raw'), appendMetadata: append('metadata'), appendCompletion: append('completion'),
    ...overrides,
  });
  return { diagnostic, output, reads, listings };
}

function sample(diagnostic: Diagnostic, list: readonly ProcessRecord[] = [observed414],
  index = 414, phase = 'interval'): void {
  diagnostic.beginSweep();
  diagnostic.observeSample(list, 'immutable-normalized-fingerprint', index, phase);
}

function assertIncomplete(diagnostic: Diagnostic): void {
  assert.equal(diagnostic.summary().status, 'incomplete');
  assert.ok(diagnostic.summary().issues.length > 0, 'Incomplete evidence needs an explicit reason');
}

function assertBudget(f: ReturnType<typeof fixture>, uncertainRawBytes = 0, uncertainMetadataBytes = 0): void {
  const bytes = (lines: string[]) => lines.reduce((sum, line) => sum + Buffer.byteLength(line, 'utf8'), 0);
  const summary = f.diagnostic.summary();
  // A thrown sink can have written an unknown prefix. The agreed contract charges
  // its full attempted UTF-8 bytes; known returned byte counts remain exact.
  assert.equal(summary.rawBytes, bytes(f.output.raw) + uncertainRawBytes);
  assert.equal(summary.metadataBytes, bytes(f.output.metadata) + bytes(f.output.completion) + uncertainMetadataBytes);
  assert.equal(summary.combinedBytes, summary.rawBytes + summary.metadataBytes);
  assert.ok(summary.phaseEvents <= 32);
  assert.ok(summary.phaseBytes <= 16384);
  assert.ok(summary.metadataBytes <= 131072);
  assert.ok(summary.combinedBytes <= 4194304);
  assert.ok(summary.taskStatReads <= 128);
}

test('no-Z sampling never inspects tasks; timing preserves return value and original exception', () => {
  const f = fixture();
  const alive = Object.freeze({ ...observed414, state: 'S' });
  f.diagnostic.beginSweep();
  const value = Object.freeze({ unchanged: true });
  assert.strictEqual(f.diagnostic.timedRead(39, () => value), value);
  const original = Object.freeze({ originalReadError: true });
  assert.throws(() => f.diagnostic.timedRead(40, () => { throw original; }), (error) => error === original);
  f.diagnostic.observeSample([alive], 'unchanged-fingerprint', 413, 'interval');
  assert.deepEqual(f.reads, []);
  assert.deepEqual(f.listings, []);
  assert.equal(f.diagnostic.summary().firstZombie, 'not-observed');
  f.diagnostic.finish({ ...completionBase, samples: 1 });
  assertBudget(f);
});

test('first literal Z is inspected once without changing the raw record or fingerprint', () => {
  const f = fixture();
  const list = Object.freeze([observed414]);
  const raw = JSON.stringify({ sample: 414, zombie_count: 1, processes: list,
    process_fingerprint: 'immutable-normalized-fingerprint' }) + '\n';
  const frozenBefore = JSON.stringify(list);
  sample(f.diagnostic, list);
  assert.equal(f.diagnostic.summary().firstZombie, 'complete');
  assert.equal(f.diagnostic.summary().taskStatReads, 2);
  const readCount = f.reads.length;
  const listingCount = f.listings.length;
  sample(f.diagnostic, list, 415);
  sample(f.diagnostic, [{ ...observed414, pid: 50, start_ticks: '999999' }], 416);
  assert.equal(f.reads.length, readCount);
  assert.equal(f.listings.length, listingCount);
  assert.equal(JSON.stringify(list), frozenBefore);
  assert.equal(f.diagnostic.writeRaw(raw), true);
  assert.deepEqual(f.output.raw, [raw]);
  f.diagnostic.finish({ ...completionBase, samples: 3 });
  assert.equal(f.diagnostic.summary().status, 'complete');
  assert.ok(f.reads.every(({ maxBytes }) => maxBytes > 0 && maxBytes <= 4096));
  assert.ok(f.listings.every(({ pid, maxEntries }) => pid === 39 && maxEntries <= 128));
  assert.match(f.output.metadata.join(''), /4000040/);
  assertBudget(f);
});

for (const point of ['before', 'after'] as const) {
  test(`PID reuse ${point} task inspection remains incomplete and cannot claim old identity`, () => {
    let leaderReads = 0;
    let taskReads = 0;
    const f = fixture({ readStat: (path) => {
      if (path === '/proc/39/stat') {
        leaderReads++;
        const reused = point === 'before' || leaderReads > 1;
        return { text: stat(39, 'chrome-headless', 'Z', 12, 2, reused ? '9999999' : '3694714'), truncated: false };
      }
      taskReads++;
      const tid = Number(path.split('/')[4]);
      return { text: stat(tid), truncated: false };
    } });
    sample(f.diagnostic);
    assert.equal(f.diagnostic.summary().firstZombie, 'incomplete');
    assertIncomplete(f.diagnostic);
    assert.equal(taskReads, point === 'before' ? 0 : 2);
    const readsBeforeRepeat = leaderReads + taskReads;
    sample(f.diagnostic, [{ ...observed414, pid: 60 }], 415);
    assert.equal(leaderReads + taskReads, readsBeforeRepeat);
    f.diagnostic.finish(completionBase);
    assertBudget(f);
  });
}

for (const failure of ['absent', 'io', 'malformed', 'truncated'] as const) {
  test(`leader ${failure} before inspection is explicit, never clean empty evidence`, () => {
    let listings = 0;
    const f = fixture({
      readStat: () => {
        if (failure === 'absent') throw Object.assign(new Error('fixture absent'), { code: 'ENOENT' });
        if (failure === 'io') throw Object.assign(new Error('fixture unreadable'), { code: 'EACCES' });
        return { text: failure === 'malformed' ? 'not a stat' : stat(), truncated: failure === 'truncated' };
      },
      listTasks: () => { listings++; return { names: [], truncated: false }; },
    });
    assert.doesNotThrow(() => sample(f.diagnostic));
    assert.equal(listings, 0);
    assert.equal(f.diagnostic.summary().firstZombie, 'incomplete');
    assertIncomplete(f.diagnostic);
    f.diagnostic.finish(completionBase);
    assertBudget(f);
  });
}

test('leader disappearance after successful task reads preserves partial evidence as incomplete', () => {
  let leaders = 0;
  const f = fixture({ readStat: (path) => {
    if (path === '/proc/39/stat') {
      if (++leaders === 2) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      return { text: stat(), truncated: false };
    }
    return { text: stat(Number(path.split('/')[4])), truncated: false };
  } });
  sample(f.diagnostic);
  assert.equal(f.diagnostic.summary().taskStatReads, 2);
  assert.equal(f.diagnostic.summary().firstZombie, 'incomplete');
  assertIncomplete(f.diagnostic);
  f.diagnostic.finish(completionBase);
  assertBudget(f);
});

test('task-directory failure is not a successful empty task list', () => {
  const f = fixture({ listTasks: () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } });
  assert.doesNotThrow(() => sample(f.diagnostic));
  assert.equal(f.diagnostic.summary().taskStatReads, 0);
  assert.equal(f.diagnostic.summary().firstZombie, 'incomplete');
  assertIncomplete(f.diagnostic);
  f.diagnostic.finish(completionBase);
  assertBudget(f);
});

for (const count of [127, 128, 129]) {
  test(`task-read limit handles ${count} entries and counts failed attempts within the same cap`, () => {
    let attempts = 0;
    const f = fixture({
      listTasks: (_pid, maxEntries) => ({
        names: Array.from({ length: Math.min(count, maxEntries) }, (_, index) => String(39 + index)),
        truncated: count > maxEntries,
      }),
      readStat: (path) => {
        if (path === '/proc/39/stat') return { text: stat(), truncated: false };
        attempts++;
        if (attempts === 2) throw Object.assign(new Error('task absent'), { code: 'ENOENT' });
        return { text: stat(Number(path.split('/')[4])), truncated: false };
      },
    });
    sample(f.diagnostic);
    assert.equal(attempts, Math.min(count, 128));
    assert.equal(f.diagnostic.summary().taskStatReads, attempts);
    assert.equal(f.diagnostic.summary().firstZombie, 'incomplete');
    assertIncomplete(f.diagnostic);
    f.diagnostic.finish(completionBase);
    assertBudget(f);
  });
}

test('128 successful task reads fit the boundary without false truncation', () => {
  const f = fixture({ listTasks: () => ({ names: Array.from({ length: 128 }, (_, i) => String(39 + i)), truncated: false }) });
  sample(f.diagnostic);
  assert.equal(f.diagnostic.summary().taskStatReads, 128);
  assert.equal(f.diagnostic.summary().firstZombie, 'complete');
  assert.equal(f.diagnostic.summary().status, 'complete');
  f.diagnostic.finish(completionBase);
  assertBudget(f);
});

for (const failure of ['malformed', 'mismatched-tid', 'truncated', 'io'] as const) {
  test(`task ${failure} preserves successful partial inspection and marks incomplete`, () => {
    const f = fixture({ readStat: (path) => {
      if (path === '/proc/39/stat') return { text: stat(), truncated: false };
      const tid = Number(path.split('/')[4]);
      if (tid === 39) return { text: stat(), truncated: false };
      if (failure === 'io') throw new Error('task unavailable');
      return { text: failure === 'malformed' ? 'broken' : stat(failure === 'mismatched-tid' ? 99 : tid),
        truncated: failure === 'truncated' };
    } });
    sample(f.diagnostic);
    assert.equal(f.diagnostic.summary().taskStatReads, 2);
    assert.equal(f.diagnostic.summary().firstZombie, 'incomplete');
    assertIncomplete(f.diagnostic);
    f.diagnostic.finish(completionBase);
    assert.match(f.output.metadata.join(''), /3694714/);
    assertBudget(f);
  });
}

test('a truncated directory list with zero entries stays incomplete', () => {
  const f = fixture({ listTasks: () => ({ names: [], truncated: true }) });
  sample(f.diagnostic);
  assert.equal(f.diagnostic.summary().firstZombie, 'incomplete');
  assertIncomplete(f.diagnostic);
  f.diagnostic.finish(completionBase);
  assertBudget(f);
});

test('phase records permit 32 and reject 33 with explicit bounded status', () => {
  const f = fixture();
  for (let i = 0; i < 32; i++) f.diagnostic.mark(`close-${i}`, 'event', 2);
  assert.equal(f.diagnostic.summary().phaseEvents, 32);
  assert.equal(f.diagnostic.summary().status, 'complete');
  f.diagnostic.mark('one-too-many', 'event', 2);
  assert.equal(f.diagnostic.summary().phaseEvents, 32);
  assertIncomplete(f.diagnostic);
  f.diagnostic.finish(completionBase);
  assert.equal(f.diagnostic.summary().completionWritten, true);
  assertBudget(f);
});

test('UTF-8 serialization counts framing and explicitly bounds oversized phase labels', () => {
  const f = fixture();
  f.diagnostic.mark('é😀"\\\n', 'event', 1);
  assert.ok(f.output.metadata.some((line) => Buffer.byteLength(line, 'utf8') > line.length));
  for (let i = 0; i < 32; i++) f.diagnostic.mark('é😀"\\\n'.repeat(4096), 'event', 1);
  assertIncomplete(f.diagnostic);
  f.diagnostic.finish(completionBase);
  assert.equal(f.diagnostic.summary().completionWritten, true);
  assertBudget(f);
});

test('supplemental sweep timing cannot exceed total metadata cap and overflow stays explicit', () => {
  const f = fixture();
  for (let i = 0; i < 4000; i++) {
    f.diagnostic.beginSweep();
    assert.equal(f.diagnostic.timedRead(39, () => i), i);
    f.diagnostic.observeSample([], `fingerprint-${i}`, i, 'interval');
  }
  assertIncomplete(f.diagnostic);
  f.diagnostic.finish({ ...completionBase, samples: 4000 });
  assert.equal(f.diagnostic.summary().completionWritten, true);
  assertBudget(f);
});

test('shared budget reserves completion at exact raw-byte boundary', () => {
  const f = fixture();
  const size = LIFECYCLE_LIMITS.combinedBytes - LIFECYCLE_LIMITS.completionReserve;
  assert.equal(f.diagnostic.writeRaw('x'.repeat(size)), true);
  assert.equal(f.diagnostic.summary().rawBytes, size);
  assert.equal(f.diagnostic.writeRaw('x'), false);
  f.diagnostic.mark('no-shared-capacity', 'event');
  assertIncomplete(f.diagnostic);
  f.diagnostic.finish({ ...completionBase, samples: 1 });
  assert.equal(f.diagnostic.summary().completionWritten, true);
  assertBudget(f);
});

test('a raw multibyte write one byte over the nonreserved budget is refused atomically', () => {
  const f = fixture();
  const size = LIFECYCLE_LIMITS.combinedBytes - LIFECYCLE_LIMITS.completionReserve;
  const oversized = 'é'.repeat(size / 2) + 'x';
  assert.equal(Buffer.byteLength(oversized), size + 1);
  assert.equal(f.diagnostic.writeRaw(oversized), false);
  assert.deepEqual(f.output.raw, []);
  assertIncomplete(f.diagnostic);
  f.diagnostic.finish(completionBase);
  assert.equal(f.diagnostic.summary().completionWritten, true);
  assertBudget(f);
});

test('metadata already written reduces available raw capacity under the same combined cap', () => {
  const f = fixture();
  f.diagnostic.mark('existing-metadata', 'event');
  const available = LIFECYCLE_LIMITS.combinedBytes - LIFECYCLE_LIMITS.completionReserve - f.diagnostic.summary().combinedBytes;
  assert.ok(available > 0);
  assert.equal(f.diagnostic.writeRaw('r'.repeat(available)), true);
  assert.equal(f.diagnostic.writeRaw('r'), false);
  f.diagnostic.finish(completionBase);
  assert.equal(f.diagnostic.summary().completionWritten, true);
  assertBudget(f);
});

for (const mode of ['reported', 'thrown'] as const) {
  test(`raw writer ${mode} failure keeps explicit known or conservatively uncertain byte accounting`, () => {
    let uncertainBytes = 0;
    const f = fixture({ appendRaw: (line) => {
      if (mode === 'thrown') {
        uncertainBytes += Buffer.byteLength(line, 'utf8');
        throw new Error('fixture raw write failed');
      }
      return { bytes: 0, error: 'fixture raw write failed' };
    } });
    assert.equal(f.diagnostic.writeRaw('sample\n'), false);
    assert.equal(f.diagnostic.summary().rawBytes, uncertainBytes);
    if (mode === 'thrown') assert.equal(f.diagnostic.summary().bytesUncertain, true);
    assertIncomplete(f.diagnostic);
    f.diagnostic.finish(completionBase);
    assertBudget(f, uncertainBytes);
  });
}

test('completion write failure is visible and never reports completionWritten', () => {
  const f = fixture({ appendCompletion: () => ({ bytes: 0, error: 'completion unavailable' }) });
  assert.doesNotThrow(() => f.diagnostic.finish({ ...completionBase, samples: 417 }));
  assert.equal(f.diagnostic.summary().completionWritten, false);
  assertIncomplete(f.diagnostic);
  assertBudget(f);
});

test('oversized completion data cannot escape metadata or shared caps', () => {
  const f = fixture();
  const base = Object.freeze({ samples: 417, failure: '😀'.repeat(50000), interval_ms: 100, byte_limit: 4194304 });
  assert.doesNotThrow(() => f.diagnostic.finish(base));
  assertIncomplete(f.diagnostic);
  assert.equal(base.failure.length, 100000);
  assertBudget(f);
});

test('observeClose keeps context/browser operation order, result identity and call counts', async () => {
  const f = fixture();
  const calls: string[] = [];
  const result = Object.freeze({ result: 'same-object' });
  const first = await f.diagnostic.observeClose('context', () => { calls.push('context'); return result; }, () => 1);
  const second = await f.diagnostic.observeClose('browser', async () => { calls.push('browser'); return result; }, () => 0);
  assert.strictEqual(first, result);
  assert.strictEqual(second, result);
  assert.deepEqual(calls, ['context', 'browser']);
  assert.equal(f.diagnostic.summary().phaseEvents, 4);
  f.diagnostic.finish(completionBase);
  assert.equal(f.diagnostic.summary().status, 'complete');
  assertBudget(f);
});

for (const mode of ['metadata-throw', 'metadata-error', 'clock', 'context-count', 'snapshot'] as const) {
  test(`primary close rejection survives ${mode} diagnostic failure with exact error identity`, async () => {
    const primary = Object.freeze({ originalCleanupFailure: mode });
    let calls = 0;
    let uncertainBytes = 0;
    const overrides: Partial<Options> = {};
    if (mode === 'metadata-throw') overrides.appendMetadata = (line) => {
      uncertainBytes += Buffer.byteLength(line, 'utf8');
      throw new Error('secondary metadata failure');
    };
    if (mode === 'metadata-error') overrides.appendMetadata = () => ({ bytes: 0, error: 'secondary metadata failure' });
    if (mode === 'clock') overrides.clock = () => { throw new Error('secondary clock failure'); };
    if (mode === 'snapshot') overrides.readStat = () => { throw new Error('secondary snapshot failure'); };
    const f = fixture(overrides);
    const contexts = () => {
      if (mode === 'context-count') throw new Error('secondary count failure');
      return 1;
    };
    await assert.rejects(f.diagnostic.observeClose('browser', async () => {
      calls++;
      if (mode === 'snapshot') sample(f.diagnostic);
      throw primary;
    }, contexts), (error) => error === primary);
    assert.equal(calls, 1);
    assertIncomplete(f.diagnostic);
    assert.doesNotThrow(() => f.diagnostic.finish(completionBase));
    if (mode === 'metadata-throw') assert.equal(f.diagnostic.summary().bytesUncertain, true);
    assertBudget(f, 0, uncertainBytes);
  });
}

test('synchronous close error is preserved while the following owned cleanup still runs', async () => {
  const f = fixture();
  const primary = new Error('original context close failure');
  const calls: string[] = [];
  let observed: unknown;
  try {
    await f.diagnostic.observeClose('context', () => { calls.push('context'); throw primary; });
  } catch (error) {
    observed = error;
  } finally {
    await f.diagnostic.observeClose('browser', () => { calls.push('browser'); });
  }
  assert.strictEqual(observed, primary);
  assert.deepEqual(calls, ['context', 'browser']);
  f.diagnostic.finish(completionBase);
  assertBudget(f);
});

test('successful cleanup with failed diagnostics remains incomplete observation', async () => {
  const f = fixture({ appendMetadata: () => ({ bytes: 0, error: 'sink failed' }) });
  const result = {};
  assert.strictEqual(await f.diagnostic.observeClose('browser', () => result), result);
  assertIncomplete(f.diagnostic);
  f.diagnostic.finish(completionBase);
  assertBudget(f);
});

test('short raw failure sentinel survives completion verbatim with incomplete diagnosis and exact byte accounting', () => {
  const f = fixture();
  const sentinel = 'RAW_FIXTURE_EIO_7';
  const raw = '{"fixture":"retained-raw-record"}\n';
  assert.equal(f.diagnostic.writeRaw(raw), true);
  f.diagnostic.mark('fixture-close', 'settled', 0);
  const final = f.diagnostic.finish({ ...completionBase, failure: sentinel });
  assert.equal(f.output.completion.length, 1);
  const persisted = JSON.parse(f.output.completion[0]!);
  assert.equal(persisted.failure, sentinel);
  assert.equal(final.status, 'incomplete');
  assert.ok(final.issues.includes('RAW_SAMPLER_INCOMPLETE'));
  assert.equal(final.completionWritten, true);
  assert.equal(persisted.lifecycle.observedStatusBeforeCompletionWrite, 'incomplete');
  assert.ok(persisted.lifecycle.issues.includes('RAW_SAMPLER_INCOMPLETE'));
  assert.equal(final.rawBytes, Buffer.byteLength(raw, 'utf8'));
  assert.equal(final.metadataBytes, [...f.output.metadata, ...f.output.completion]
    .reduce((sum, line) => sum + Buffer.byteLength(line, 'utf8'), 0));
  assert.equal(final.combinedBytes, final.rawBytes + final.metadataBytes);
  assertBudget(f);
});

test('persisted completion remains provisional while returned successful sink result confirms completion', () => {
  const f = fixture();
  assert.equal(f.diagnostic.writeRaw('{"fixture":"successful-raw-record"}\n'), true);
  f.diagnostic.mark('fixture-close', 'settled', 0);
  const final = f.diagnostic.finish(completionBase);
  assert.equal(f.output.completion.length, 1);
  const persisted = JSON.parse(f.output.completion[0]!);
  assert.equal(persisted.failure, null);
  assert.equal(persisted.lifecycle.status, 'provisional-external-io-verification-required');
  assert.equal(persisted.lifecycle.completionWritten, false);
  assert.equal(persisted.lifecycle.observedStatusBeforeCompletionWrite, 'complete');
  assert.equal(final.status, 'complete');
  assert.deepEqual(final.issues, []);
  assert.equal(final.completionWritten, true);
  assert.equal(persisted.lifecycle.metadataBytes, final.metadataBytes);
  assert.equal(persisted.lifecycle.combinedBytes, final.combinedBytes);
  assertBudget(f);
});
