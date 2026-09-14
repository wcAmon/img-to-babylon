from __future__ import annotations
import json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'integrations' / 'mesh3d'))
from forge.tests.test_glb_reference import write_triangle_glb
import candidates


class Candidates(unittest.TestCase):
    def test_summary_reads_provenance_and_probe(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for ep in ('tripo', 'rodin'):
                (root / ep).mkdir(); write_triangle_glb(root / ep / 'model.glb')
                (root / ep / 'provenance.json').write_text(json.dumps({'endpoint': ep, 'requestId': 'r-' + ep, 'outputs': []}))
            s = candidates.summarize_candidates(root)
            self.assertEqual([c['endpoint'] for c in s['candidates']], ['tripo', 'rodin'])
            self.assertEqual(s['candidates'][0]['requestId'], 'r-tripo')
            self.assertEqual(len(s['candidates'][0]['sha256']), 64)
            self.assertGreaterEqual(s['candidates'][0]['meshCount'], 1)

    def test_probe_path_excluded(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for ep in ('tripo', 'rodin'):
                (root / ep).mkdir(); write_triangle_glb(root / ep / 'model.glb')
                (root / ep / 'provenance.json').write_text(json.dumps({'endpoint': ep, 'requestId': 'r-' + ep, 'outputs': []}))
            s = candidates.summarize_candidates(root)
            self.assertNotIn('/Users/', json.dumps(s))
            self.assertNotIn('path', s['candidates'][0]['probe'])

    def test_extra_merged_per_endpoint(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for ep in ('tripo', 'rodin'):
                (root / ep).mkdir(); write_triangle_glb(root / ep / 'model.glb')
                (root / ep / 'provenance.json').write_text(json.dumps({'endpoint': ep, 'requestId': 'r-' + ep, 'outputs': []}))
            extra = {'tripo': {'viewerAzimuthOffsetDegrees': 90}}
            s = candidates.summarize_candidates(root, extra=extra)
            by_ep = {c['endpoint']: c for c in s['candidates']}
            self.assertEqual(by_ep['tripo']['viewerAzimuthOffsetDegrees'], 90)
            self.assertNotIn('viewerAzimuthOffsetDegrees', by_ep['rodin'])


if __name__ == '__main__':
    unittest.main()
