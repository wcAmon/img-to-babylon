"""Face drift: identical bust passes, a shifted or recoloured bust fails."""
from __future__ import annotations
import json, tempfile, unittest
from pathlib import Path
from forge._shared.png import write_rgb
from forge.stage1_intake.face_drift_gate import bust_difference, run_gate


def bust_image(path: Path, shift=0, tint=0, w=64, h=128):
    rgb = bytearray(b'\xff' * (w * h * 3))
    for y in range(8 + shift, 40 + shift):          # head blob
        for x in range(20, 44):
            i = (y * w + x) * 3; rgb[i:i + 3] = bytes([200 - tint, 150, 120])
    for y in range(40 + shift, 60 + shift):         # shoulders
        for x in range(8, 56):
            i = (y * w + x) * 3; rgb[i:i + 3] = bytes([20, 20, 20])
    write_rgb(path, w, h, bytes(rgb))


class FaceDrift(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
    def tearDown(self): self.tmp.cleanup()

    def manifest(self, out_png):
        m = self.root / 'extend.json'
        m.write_text(json.dumps({'views': [{'role': 'front', 'input': str(self.root / 'in.png'), 'output': str(out_png), 'bustBox': [0, 0, 64, 64]}]}))
        return m

    def test_identical_bust_passes(self):
        bust_image(self.root / 'in.png'); bust_image(self.root / 'out.png')
        d = bust_difference(self.root / 'in.png', self.root / 'out.png', [0, 0, 64, 64])
        self.assertEqual(d['meanAbsDiff'], 0.0); self.assertEqual(d['fractionOver24'], 0.0)
        r = run_gate(self.manifest(self.root / 'out.png'), self.root / 'gate.json')
        self.assertTrue(r['pass']); self.assertGreaterEqual(r['views'][0]['headIoU'], 0.92)

    def test_shifted_head_fails(self):
        bust_image(self.root / 'in.png'); bust_image(self.root / 'out.png', shift=12)
        r = run_gate(self.manifest(self.root / 'out.png'), self.root / 'gate.json')
        self.assertFalse(r['pass'])
        self.assertTrue((self.root / 'gate.json').is_file())

    def test_recoloured_face_fails_on_mean_diff(self):
        bust_image(self.root / 'in.png'); bust_image(self.root / 'out.png', tint=90)
        r = run_gate(self.manifest(self.root / 'out.png'), self.root / 'gate.json')
        self.assertFalse(r['views'][0]['pass']); self.assertGreater(r['views'][0]['meanAbsDiff'], 6.0)


if __name__ == '__main__':
    unittest.main()
