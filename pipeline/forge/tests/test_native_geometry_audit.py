"""Real NullEngine geometry and subprocess gate integration, no browser."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]


class NativeGeometryAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='native-geometry-audit-')
        cls.directory = Path(cls.temp.name)
        result = subprocess.run(['node', '--import', './viewer/node_modules/tsx/dist/loader.mjs', 'viewer/scripts/export_pipeline_test.ts', str(cls.directory)], cwd=ROOT, text=True, capture_output=True)
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)
        cls.numeric = json.loads(result.stdout.splitlines()[-1])

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def audit(self, label, *args):
        out = self.directory / label
        result = subprocess.run([sys.executable, 'pipeline/scripts/character_audit_babylon.py', '--out-dir', str(out), '--max-samples', '32', *args], cwd=ROOT, text=True, capture_output=True, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
        return result.returncode, json.loads((out / 'audit.json').read_text())

    def test_numerical_pose_instances_and_coordinate_conventions(self):
        self.assertTrue(self.numeric['passed'])
        self.assertGreaterEqual(self.numeric['numericalCases'], 7)
        payload = json.loads((self.directory / 'clean.json').read_text())
        self.assertEqual(len(payload['meshes']), 2)
        self.assertEqual(payload['coordinateFrame']['handedness'], 'right')
        self.assertAlmostEqual(payload['meshes'][0]['colors'][0], .2, places=6)

    def test_actual_registered_export(self):
        code, report = self.audit('registered', '--model', 'sample-crate', '--include', '^crate$')
        self.assertEqual(code, 0, report)
        self.assertEqual(report['gates']['export']['exitStatus'], 0)
        self.assertGreater(report['gates']['selfIntersection']['result']['sampledVertexCount'], 0)
        self.assertEqual(report['authoredUVVerification']['status'], 'unassessed')

    def test_clean_sampling_and_explicit_replay(self):
        code, report = self.audit('clean-run', '--input', str(self.directory / 'clean.json'))
        self.assertEqual(code, 0, report)
        self.assertEqual(report['gates']['export']['status'], 'replayed')
        self.assertEqual(report['coverage']['placements'], 2)
        for mesh in report['gates']['selfIntersection']['result']['meshes']:
            self.assertLessEqual(mesh['sampledVertexCount'], 32)
        self.assertEqual(report['gates']['penetration']['exitStatus'], 0)

    def test_real_overlap_and_allow(self):
        source = str(self.directory / 'overlap.json')
        code, report = self.audit('overlap-run', '--input', source)
        self.assertEqual(code, 1, report)
        self.assertTrue(report['gates']['penetration']['result']['penetrating'])
        code, report = self.audit('allow-run', '--input', source, '--allow', 'a,b')
        self.assertEqual(code, 0, report)
        self.assertEqual(report['coverage']['expandedAllowPairs'], ['a,b'])

    def test_open_surface_never_clean_volume_pass(self):
        code, report = self.audit('open-run', '--input', str(self.directory / 'open.json'))
        self.assertEqual(code, 2, report)
        self.assertEqual(report['status'], 'incomplete')
        self.assertEqual(report['coverage']['volumeUnsupported'], ['open'])

    def test_export_failure_records_unrun_gates(self):
        code, report = self.audit('missing-model', '--model', 'not-a-registered-model')
        self.assertEqual(code, 2)
        self.assertEqual(report['gates']['export']['exitStatus'], 2)
        self.assertEqual(report['gates']['selfIntersection']['status'], 'unrun')
        self.assertIsNone(report['gates']['penetration']['exitStatus'])
        self.assertNotIn('result', report['gates']['penetration'])

    def test_unwrap_is_per_mesh_planning(self):
        _, report = self.audit('unwrap-run', '--input', str(self.directory / 'clean.json'), '--unwrap-plan')
        self.assertEqual({p['placement'] for p in report['unwrapPlanning']}, {'a', 'b'})
        self.assertTrue(all(p['exitStatus'] is not None for p in report['unwrapPlanning']))
        self.assertEqual(report['authoredUVVerification']['status'], 'unassessed')

    def test_bad_allow_fails_closed(self):
        code, report = self.audit('bad-allow', '--input', str(self.directory / 'clean.json'), '--allow', 'a,typo')
        self.assertEqual(code, 2)
        self.assertIn('unknown --allow', report['error'])


if __name__ == '__main__':
    unittest.main()
