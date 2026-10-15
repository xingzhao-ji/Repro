"""Independent synthetic frozen-validator challenges. Never runtime observations."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'contrast-p57-approved-execution-v1/validator/cleanup_gate.py'
spec = importlib.util.spec_from_file_location('frozen_cleanup_review', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    def process(pid, name, ppid, start):
        return {'pid': pid, 'start_ticks': str(start), 'name': name, 'ppid': ppid, 'state': 'S', 'threads': 1}
    init, node, browser = process(1, 'docker-init', 0, 10), process(7, 'node', 1, 20), process(13, 'chrome', 7, 30)
    records = []
    events = []
    for index, time in enumerate([1, 20, 50, 60, 70]):
        processes = [init, node, browser] if index == 1 else [init, node]
        records.append({'sample': index, 'phase': 'start' if index == 0 else 'exit' if index == 4 else 'interval', 'processes': copy.deepcopy(processes), 'zombie_count': 0})
        events.append({'kind': 'read-bounds', 'sample': index, 'before': {'monoNs': str(time)}, 'after': {'monoNs': str(time + 9)}, 'atomicSnapshot': False, 'processReadEncoding': '[pid,beforeOffsetNs,afterOffsetNs] from before.monoNs', 'processReads': [[p['pid'], '1', '2'] for p in processes]})
    records[0]['sampler'] = {'pid': 7}
    events.extend([{'kind': 'phase', 'phase': 'final.browser.close', 'event': event, 'monoNs': str(time), 'contextCount': 0, 'nextSampleIndex': 2} for event, time in [('start', 30), ('settled', 40)]])
    return records, events, {'browserPid': 13, 'normalExit': True, 'unexpectedFallbackLogLines': []}


class IndependentCleanupChallenges(unittest.TestCase):
    def test_control_fabricated_clean_sequence(self):
        self.assertEqual(module.completed_cleanup(*fixture())['status'], 'PASS')

    def test_advanced_marker_cannot_hide_dirty_first_interval(self):
        records, events, child = fixture()
        records[2]['processes'].append({'pid': 99, 'start_ticks': '99', 'name': 'residue', 'ppid': 1, 'state': 'S', 'threads': 1})
        events[2]['processReads'].append([99, '1', '2'])
        events[-1]['nextSampleIndex'] = 3
        result = module.completed_cleanup(records, events, child)
        self.assertEqual(result['status'], 'NOT_ESTABLISHED')
        self.assertIn('CLEANUP_FIRST_QUALIFYING_SKIPPED', result['issues'])

    def test_overlapping_complete_sweeps_cannot_prove_sequence(self):
        records, events, child = fixture()
        events[2]['after']['monoNs'] = '65'
        result = module.completed_cleanup(records, events, child)
        self.assertEqual(result['status'], 'NOT_ESTABLISHED')
        self.assertIn('CLEANUP_SWEEP_SEQUENCE', result['issues'])

if __name__ == '__main__':
    unittest.main(verbosity=2)
