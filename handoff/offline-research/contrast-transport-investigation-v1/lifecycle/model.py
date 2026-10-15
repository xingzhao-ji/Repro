"""Synthetic prospective observation ownership model. No I/O, timers or runtime control.

All times are fabricated integer microseconds on one virtual clock. This model
tests the proposed state transitions, not Node scheduling, /proc, or Chromium.
"""
from dataclasses import dataclass, field

INTERNAL_US = 90_000_000
CADENCE_US = 100_000
ORIGINALS = ((1, "init-start"), (7, "node-start"))


@dataclass(frozen=True)
class Sweep:
    index: int
    phase: str
    start: int
    end: int
    processes: tuple = ORIGINALS
    states: tuple = ("S", "R")
    read_windows: tuple = ((1, 0, 1), (7, 1, 2))
    complete: bool = True
    writes_ok: bool = True


@dataclass
class ObservationModel:
    state: str = "WORKLOAD"
    sampler_referenced: bool = False
    close_settled: int | None = None
    expected_first: int | None = None
    first: int | None = None
    terminal_index: int | None = None
    hold_deadline: int | None = None
    previous_end: int | None = None
    close_calls: int = 0
    normal_browser_exit: bool = False
    context_count: int = 0
    hard_failures: list = field(default_factory=list)
    unknown: list = field(default_factory=list)
    seen: list = field(default_factory=list)
    retained_z: list = field(default_factory=list)
    evidence_io_complete: bool = False
    now: int = 0

    def problem(self, code, *, contrary=False):
        collection = self.hard_failures if contrary else self.unknown
        if code not in collection:
            collection.append(code)

    def at(self, now):
        if now < self.now:
            self.problem("CLOCK_REVERSED")
        self.now = now
        if now >= INTERNAL_US:
            self.problem("INTERNAL_DEADLINE", contrary=True)
            self.sampler_referenced = False
            if self.state in ("CLOSING", "WAIT_FIRST"):
                self.state = "FAILED_FINALIZE"

    def begin_close(self, now, contexts=0):
        self.at(now)
        self.close_calls += 1
        if self.close_calls != 1:
            self.problem("DUPLICATE_FINAL_CLOSE")
        self.context_count = contexts
        if contexts:
            self.problem("ACTIVE_CONTEXTS", contrary=True)
        if now < INTERNAL_US:
            self.sampler_referenced = True
            self.state = "CLOSING"

    def settle_close(self, now, next_index, *, normal_exit=True, contexts=0):
        self.at(now)
        self.close_settled = now
        self.expected_first = next_index
        self.context_count = contexts
        self.normal_browser_exit = normal_exit
        if contexts:
            self.problem("ACTIVE_CONTEXTS", contrary=True)
        if not normal_exit:
            self.problem("NORMAL_BROWSER_EXIT_REQUIRED", contrary=True)
        if self.state != "CLOSING":
            self.problem("CLOSE_STATE_INVALID")
            return
        self.hold_deadline = INTERNAL_US
        self.state = "WAIT_FIRST"

    def close_error(self, now):
        self.at(now)
        self.problem("CLOSE_ERROR", contrary=True)
        self.sampler_referenced = False
        self.state = "FAILED_FINALIZE"

    def wants_natural_exit(self, now):
        self.at(now)
        return not self.sampler_referenced

    def verify_sweep(self, sweep):
        if not sweep.complete or not sweep.writes_ok:
            self.problem("INCOMPLETE_FIRST_OR_LATER_CENSUS")
        if sweep.start > sweep.end or (self.previous_end is not None and sweep.start <= self.previous_end):
            self.problem("SWEEP_ORDER")
        self.previous_end = sweep.end
        if self.close_settled is None or sweep.start <= self.close_settled:
            self.problem("NOT_WHOLE_POST_CLOSE")
        if len(set(sweep.processes)) != len(sweep.processes):
            self.problem("DUPLICATE_PROCESS")
        if sweep.processes != ORIGINALS:
            self.problem("RESIDUE_OR_IDENTITY_CHANGE", contrary=True)
        if len(sweep.states) != len(sweep.processes):
            self.problem("INCOMPLETE_PROCESS_STATES")
        if "Z" in sweep.states:
            self.problem("POST_CLOSE_Z", contrary=True)
        windows = sweep.read_windows
        if (len(windows) != len(sweep.processes)
                or [r[0] for r in windows] != [p[0] for p in sweep.processes]
                or any(not 0 <= a <= b <= sweep.end - sweep.start for _, a, b in windows)):
            self.problem("PROCESS_READ_COVERAGE_OR_BOUNDS")

    def interval(self, sweep):
        # Actual callbacks are synchronous: check budget both before and after
        # the full attempted sweep. A late callback never earns a pass.
        self.at(sweep.start)
        if sweep.phase != "interval":
            self.problem("WRONG_INTERVAL_PHASE")
        self.seen.append(sweep.index)
        if "Z" in sweep.states:
            self.retained_z.append(sweep.index)
        if self.close_settled is None:
            self.at(sweep.end)
            return
        if self.first is None:
            self.first = sweep.index
            if sweep.index != self.expected_first:
                self.problem("FIRST_INDEX_SKIPPED")
        elif sweep.index != self.seen[-2] + 1:
            self.problem("SAMPLE_SEQUENCE_GAP")
        self.verify_sweep(sweep)
        self.at(sweep.end)
        # The first attempt consumes ownership even when dirty/incomplete.
        self.sampler_referenced = False
        if self.state == "WAIT_FIRST":
            self.state = "FINALIZING"

    def finish_evidence(self, now, *, complete=True):
        self.at(now)
        self.evidence_io_complete = complete
        if not complete:
            self.problem("EVIDENCE_IO_INCOMPLETE")

    def terminal(self, sweep):
        self.at(sweep.start)
        self.terminal_index = sweep.index
        if self.sampler_referenced:
            self.problem("FORCED_TERMINAL_BEFORE_RELEASE", contrary=True)
        if sweep.phase != "exit":
            self.problem("WRONG_TERMINAL_PHASE")
        if self.first is None or sweep.index == self.first:
            self.problem("DISTINCT_FIRST_INTERVAL_REQUIRED")
        if self.seen and sweep.index != self.seen[-1] + 1:
            self.problem("TERMINAL_SEQUENCE_GAP")
        self.verify_sweep(sweep)
        self.at(sweep.end)
        if not self.normal_browser_exit:
            self.problem("NORMAL_BROWSER_EXIT_REQUIRED", contrary=True)
        if not self.evidence_io_complete:
            self.problem("EVIDENCE_IO_INCOMPLETE")
        self.sampler_referenced = False
        self.state = "TERMINAL"

    def result(self, *, driver_us=50_000_000, outer_expired=False, memory_bytes=800_000_000):
        if driver_us > INTERNAL_US:
            self.problem("DRIVER_90S_GATE", contrary=True)
        if outer_expired:
            self.problem("OUTER_120S_DEADLINE", contrary=True)
        if memory_bytes > 939_524_096:
            self.problem("UNCHANGED_896MIB_GATE", contrary=True)
        if self.terminal_index is None:
            self.problem("TERMINAL_MISSING")
        return "FAIL" if self.hard_failures else "NOT_ESTABLISHED" if self.unknown else "PASS"
