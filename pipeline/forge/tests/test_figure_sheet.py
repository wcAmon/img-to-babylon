from __future__ import annotations
import tempfile, unittest
from pathlib import Path
from forge._shared.png import write_rgb, read_rgba
from forge.stage1_intake.figure_sheet import compose_sheet


class FigureSheet(unittest.TestCase):
    def test_rows_share_height_and_columns_are_gapped(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            a = root / 'a.png'; write_rgb(a, 10, 20, bytes([255, 0, 0]) * 200)
            b = root / 'b.png'; write_rgb(b, 40, 40, bytes([0, 0, 255]) * 1600)
            info = compose_sheet([[a, b], [b]], root / 'sheet.png', cell_height=40, gap=4)
            self.assertEqual(info['height'], 40 + 4 + 40)
            self.assertEqual(info['width'], 20 + 4 + 40)      # a scaled to 20x40, b stays 40x40
            w, h, rgba = read_rgba(root / 'sheet.png')
            self.assertEqual((w, h), (info['width'], info['height']))
            self.assertEqual(bytes(rgba[(0 * w + 21) * 4:(0 * w + 21) * 4 + 3]), b'\xff\xff\xff')  # gap column is white
            self.assertEqual(bytes(rgba[(0 * w + 30) * 4:(0 * w + 30) * 4 + 3]), bytes([0, 0, 255]))


if __name__ == '__main__':
    unittest.main()
