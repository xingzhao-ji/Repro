"""Fabricated deterministic events only; no real clocks, sleeps or runtime starts."""
import unittest
from dataclasses import replace
from model import CADENCE_US, INTERNAL_US, ORIGINALS, ObservationModel, Sweep


def ready(close=110_000, next_index=2):
    model = ObservationModel()
    model.begin_close(close - 20_000)
    model.settle_close(close, next_index)
    return model


def complete(model, first=None, terminal=None, **kwargs):
    first = first or Sweep(2, "interval", 200_000, 202_000)
    terminal = terminal or Sweep(3, "exit", 220_000, 222_000)
    model.interval(first)
    model.finish_evidence(terminal.start - 1)
    model.terminal(terminal)
    return model.result(**kwargs)


class LifecycleModelTests(unittest.TestCase):
    def test_fixed_parameters(self):
        self.assertEqual((CADENCE_US, INTERNAL_US), (100_000, 90_000_000))

    def test_clean_distinct_samples(self):
        model = ready()
        self.assertEqual(complete(model), "PASS")
        self.assertEqual((model.first, model.terminal_index, model.close_calls), (2, 3, 1))

    def test_original_no_hold_exits_before_next_tick(self):
        model = ready()
        model.sampler_referenced = False  # Explicit synthetic legacy lifecycle.
        self.assertTrue(model.wants_natural_exit(131_029))
        model.finish_evidence(131_030)
        model.terminal(Sweep(2, "exit", 131_031, 133_031))
        self.assertEqual(model.result(), "NOT_ESTABLISHED")
        self.assertIn("DISTINCT_FIRST_INTERVAL_REQUIRED", model.unknown)

    def test_hold_prevents_21ms_exit_but_does_not_take_immediate_sample(self):
        model = ready()
        self.assertFalse(model.wants_natural_exit(131_029))
        self.assertEqual(model.seen, [])
        self.assertEqual(complete(model), "PASS")

    def test_close_just_before_tick(self):
        self.assertEqual(complete(ready(199_999)), "PASS")

    def test_close_just_after_tick_uses_next_existing_tick(self):
        self.assertEqual(complete(ready(200_001), Sweep(2, "interval", 300_000, 302_000), Sweep(3, "exit", 320_000, 322_000)), "PASS")

    def test_dirty_first_is_not_skipped(self):
        model = ready()
        dirty = Sweep(2, "interval", 200_000, 202_000, processes=ORIGINALS + ((13, "browser"),), states=("S", "R", "S"), read_windows=((1, 0, 1), (7, 1, 2), (13, 2, 3)))
        model.interval(dirty)
        self.assertFalse(model.sampler_referenced)
        model.interval(Sweep(3, "interval", 300_000, 302_000))
        model.finish_evidence(310_000)
        model.terminal(Sweep(4, "exit", 320_000, 322_000))
        self.assertEqual(model.result(), "FAIL")
        self.assertEqual(model.first, 2)

    def test_incomplete_first_releases_immediately_and_stays_unknown(self):
        model = ready()
        model.interval(Sweep(2, "interval", 200_000, 202_000, complete=False))
        self.assertFalse(model.sampler_referenced)
        model.interval(Sweep(3, "interval", 300_000, 302_000))
        model.finish_evidence(310_000)
        model.terminal(Sweep(4, "exit", 320_000, 322_000))
        self.assertEqual(model.result(), "NOT_ESTABLISHED")

    def test_dirty_later_interval_remains_failure(self):
        model = ready()
        model.interval(Sweep(2, "interval", 200_000, 202_000))
        model.interval(Sweep(3, "interval", 300_000, 302_000, states=("S", "Z")))
        model.finish_evidence(310_000)
        model.terminal(Sweep(4, "exit", 320_000, 322_000))
        self.assertEqual(model.result(), "FAIL")

    def test_earlier_z_retained_without_becoming_post_close_failure(self):
        model = ObservationModel()
        model.interval(Sweep(1, "interval", 80_000, 82_000, states=("S", "Z")))
        model.begin_close(90_000)
        model.settle_close(110_000, 2)
        self.assertEqual(complete(model), "PASS")
        self.assertEqual(model.retained_z, [1])

    def test_identity_change(self):
        self.assertEqual(complete(ready(), replace(Sweep(2, "interval", 200_000, 202_000), processes=((1, "init-start"), (7, "reused-node")))), "FAIL")

    def test_unknown_process_read(self):
        self.assertEqual(complete(ready(), Sweep(2, "interval", 200_000, 202_000, read_windows=((1, 0, 1),))), "NOT_ESTABLISHED")

    def test_sweep_started_before_close_cannot_be_used(self):
        self.assertEqual(complete(ready(), Sweep(2, "interval", 109_000, 111_000)), "NOT_ESTABLISHED")

    def test_same_timestamp_is_not_strictly_post_close(self):
        self.assertEqual(complete(ready(), Sweep(2, "interval", 110_000, 112_000)), "NOT_ESTABLISHED")

    def test_missing_first_index_fails_even_if_later_clean(self):
        self.assertEqual(complete(ready(), Sweep(3, "interval", 200_000, 202_000), Sweep(4, "exit", 220_000, 222_000)), "NOT_ESTABLISHED")

    def test_terminal_cannot_count_twice(self):
        self.assertEqual(complete(ready(), terminal=Sweep(2, "exit", 220_000, 222_000)), "NOT_ESTABLISHED")

    def test_terminal_residue(self):
        self.assertEqual(complete(ready(), terminal=Sweep(3, "exit", 220_000, 222_000, states=("Z", "R"))), "FAIL")

    def test_first_write_failure_is_sticky(self):
        self.assertEqual(complete(ready(), Sweep(2, "interval", 200_000, 202_000, writes_ok=False)), "NOT_ESTABLISHED")

    def test_hold_timeout_releases_without_a_new_sample(self):
        model = ready()
        model.at(INTERNAL_US)
        self.assertFalse(model.sampler_referenced)
        self.assertEqual(model.seen, [])
        self.assertIn("INTERNAL_DEADLINE", model.hard_failures)

    def test_late_callback_after_hold_deadline_cannot_repair_timeout(self):
        self.assertEqual(complete(ready(), Sweep(2, "interval", INTERNAL_US + 1, INTERNAL_US + 3), Sweep(3, "exit", INTERNAL_US + 5, INTERNAL_US + 7)), "FAIL")

    def test_sweep_crosses_hold_deadline(self):
        self.assertEqual(complete(ready(), Sweep(2, "interval", INTERNAL_US - 1, INTERNAL_US + 1), Sweep(3, "exit", INTERNAL_US + 5, INTERNAL_US + 7)), "FAIL")

    def test_hold_clipped_by_original_deadline(self):
        model = ready(89_950_000)
        self.assertEqual(model.hold_deadline, INTERNAL_US)
        model.at(INTERNAL_US)
        self.assertFalse(model.sampler_referenced)
        self.assertIn("INTERNAL_DEADLINE", model.hard_failures)

    def test_close_after_deadline_does_not_rearm_hold(self):
        model = ready(INTERNAL_US + 1)
        self.assertFalse(model.sampler_referenced)
        self.assertIsNone(model.hold_deadline)
        self.assertIn("INTERNAL_DEADLINE", model.hard_failures)

    def test_finalization_deadline_is_not_cleared_early(self):
        model = ready()
        model.interval(Sweep(2, "interval", 200_000, 202_000))
        model.finish_evidence(INTERNAL_US + 1)
        model.terminal(Sweep(3, "exit", INTERNAL_US + 2, INTERNAL_US + 4))
        self.assertEqual(model.result(), "FAIL")

    def test_normal_exit_required(self):
        model = ObservationModel()
        model.begin_close(90_000)
        model.settle_close(110_000, 2, normal_exit=False)
        self.assertEqual(complete(model), "FAIL")

    def test_active_contexts_fail(self):
        model = ObservationModel()
        model.begin_close(90_000, contexts=1)
        model.settle_close(110_000, 2)
        self.assertEqual(complete(model), "FAIL")

    def test_close_failure_releases_and_cannot_retry(self):
        model = ObservationModel()
        model.begin_close(90_000)
        model.close_error(110_000)
        self.assertFalse(model.sampler_referenced)
        model.begin_close(120_000)
        self.assertIn("DUPLICATE_FINAL_CLOSE", model.unknown)

    def test_external_and_memory_gates_unchanged(self):
        for kwargs in ({"driver_us": INTERNAL_US + 1}, {"outer_expired": True}, {"memory_bytes": 943_087_616}):
            with self.subTest(kwargs=kwargs):
                self.assertEqual(complete(ready(), **kwargs), "FAIL")

    def test_evidence_and_terminal_absence_fail_closed(self):
        model = ready()
        model.interval(Sweep(2, "interval", 200_000, 202_000))
        self.assertEqual(model.result(), "NOT_ESTABLISHED")
        model.terminal(Sweep(3, "exit", 220_000, 222_000))
        self.assertIn("EVIDENCE_IO_INCOMPLETE", model.unknown)


if __name__ == "__main__":
    unittest.main(verbosity=2)
