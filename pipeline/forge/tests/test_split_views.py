"""Three-view split is driven by alpha, never by fixed thirds."""
from __future__ import annotations
import json, tempfile, unittest
from pathlib import Path
from forge._shared.png import write_rgba, read_rgba
from forge.stage1_intake.split_views import find_view_columns, split_views, pad_for_full_body


def synthetic_three_view(path: Path, w=300, h=100):
    rgba = bytearray(w * h * 4)  # transparent
    for x0, x1 in ((10, 80), (110, 190), (220, 290)):
        for y in range(20, 90):
            for x in range(x0, x1 + 1):
                i = (y * w + x) * 4; rgba[i:i + 4] = bytes([200, 30, 30, 255])
    write_rgba(path, w, h, bytes(rgba))


class SplitViews(unittest.TestCase):
    def test_find_columns_ignores_transparent_gaps(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; synthetic_three_view(p)
            w, h, rgba = read_rgba(p)
        self.assertEqual(find_view_columns(w, h, rgba), [(10, 80), (110, 190), (220, 290)])

    def test_split_writes_three_white_backed_views(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; synthetic_three_view(p)
            out = Path(d) / 'views'
            meta = split_views(p, out)
            self.assertEqual([v['role'] for v in meta['views']], ['left', 'front', 'right'])
            self.assertEqual(meta['views'][1]['box'], [110, 20, 190, 89])
            w, h, rgba = read_rgba(out / 'front.png')
            self.assertEqual((w, h), (81 + 48, 70 + 48))
            self.assertEqual(bytes(rgba[:4]), bytes([255, 255, 255, 255]))  # white margin, opaque
            self.assertTrue((out / 'views.json').is_file())
            self.assertEqual(json.loads((out / 'views.json').read_text())['views'][0]['file'], 'left.png')

    def test_pad_places_bust_at_top_centre(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; synthetic_three_view(p)
            out = Path(d) / 'views'; split_views(p, out)
            info = pad_for_full_body(out / 'front.png', out / 'padded' / 'front.png', canvas=(256, 512), top_margin=8)
            self.assertEqual(info['canvas'], [256, 512])
            x, y, bw, bh = info['bustBox']
            self.assertEqual((y, bw, bh), (8, 129, 118))
            self.assertEqual(x, (256 - 129) // 2)
            w, h, rgba = read_rgba(out / 'padded' / 'front.png')
            self.assertEqual((w, h), (256, 512))
            self.assertEqual(bytes(rgba[((511 * 256) + 128) * 4:((511 * 256) + 128) * 4 + 3]), b'\xff\xff\xff')


if __name__ == '__main__':
    unittest.main()
