"""Three-view split is driven by alpha, never by fixed thirds."""
from __future__ import annotations
import json, tempfile, unittest
from pathlib import Path
from forge._shared.png import write_rgba, write_rgb, read_rgba
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

    def test_find_columns_drops_fragments_of_width_20_but_keeps_21(self):
        w, h = 100, 50
        rgba = bytearray(w * h * 4)  # transparent
        # run 1: x=10..29 -> width 20 (must be dropped)
        # run 2: x=33..53 -> width 21 (must be kept), separated by 3 transparent columns (30,31,32)
        for x0, x1 in ((10, 29), (33, 53)):
            for y in range(10, 40):
                for x in range(x0, x1 + 1):
                    i = (y * w + x) * 4; rgba[i:i + 4] = bytes([200, 30, 30, 255])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; write_rgba(p, w, h, bytes(rgba))
            w2, h2, rgba2 = read_rgba(p)
        self.assertEqual(find_view_columns(w2, h2, rgba2), [(33, 53)])

    def test_pad_downscales_wide_bust(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; synthetic_three_view(p)
            out = Path(d) / 'views'; split_views(p, out)
            info = pad_for_full_body(out / 'front.png', out / 'padded' / 'front.png', canvas=(100, 300), top_margin=4)
            x, y, bw, bh = info['bustBox']
            self.assertEqual((y, bw), (4, 36))
            self.assertEqual(bh, 118 * 36 // 129)
            self.assertEqual(x, (100 - 36) // 2)
            w, h, rgba = read_rgba(out / 'padded' / 'front.png')
            self.assertEqual((w, h), (100, 300))
            px = ((4 + 16) * 100 + 50) * 4
            self.assertNotEqual(bytes(rgba[px:px + 3]), b'\xff\xff\xff')

    def test_color_mask_finds_columns_on_opaque_grey_background(self):
        w, h = 300, 100
        rgb = bytearray(w * h * 3)
        for y in range(h):
            bg = bytes([120 + y // 10, 120 + y // 10, 122 + y // 10])
            for x in range(w):
                rgb[(y * w + x) * 3:(y * w + x) * 3 + 3] = bg
        for x0, x1 in ((10, 80), (110, 190), (220, 290)):
            for y in range(h):
                for x in range(x0, x1 + 1):
                    rgb[(y * w + x) * 3:(y * w + x) * 3 + 3] = bytes([30, 30, 30])
        for y in range(90, h):
            for x in range(w):
                rgb[(y * w + x) * 3:(y * w + x) * 3 + 3] = bytes([100, 100, 100])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; write_rgb(p, w, h, bytes(rgb))
            w2, h2, rgba2 = read_rgba(p)
            self.assertEqual(find_view_columns(w2, h2, rgba2), [(10, 80), (110, 190), (220, 290)])
            out = Path(d) / 'views'
            meta = split_views(p, out)
        self.assertEqual(meta['maskMode'], 'color')

    def test_alpha_mask_still_preferred_when_alpha_present(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; synthetic_three_view(p)
            out = Path(d) / 'views'
            meta = split_views(p, out)
        self.assertEqual(meta['maskMode'], 'alpha')
        self.assertEqual([v['box'] for v in meta['views']], [[10, 20, 80, 89], [110, 20, 190, 89], [220, 20, 290, 89]])

    def test_row_fraction_excludes_partial_width_floor_shadow(self):
        w, h = 300, 100
        rgb = bytearray(w * h * 3)
        for y in range(h):
            bg = bytes([120 + y // 10, 120 + y // 10, 122 + y // 10])
            for x in range(w):
                rgb[(y * w + x) * 3:(y * w + x) * 3 + 3] = bg
        for x0, x1 in ((10, 80), (110, 190), (220, 290)):
            for y in range(20, 90):
                for x in range(x0, x1 + 1):
                    rgb[(y * w + x) * 3:(y * w + x) * 3 + 3] = bytes([30, 30, 30])
        # Floor shadow spans only part of the width (60..240), leaving the edges background so the
        # per-row median still reads correctly, but bridging the gaps between figures if included.
        for y in range(90, h):
            for x in range(60, 241):
                rgb[(y * w + x) * 3:(y * w + x) * 3 + 3] = bytes([40, 40, 40])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; write_rgb(p, w, h, bytes(rgb))
            w2, h2, rgba2 = read_rgba(p)
        self.assertEqual(find_view_columns(w2, h2, rgba2), [(10, 80), (110, 190), (220, 290)])
        self.assertEqual(find_view_columns(w2, h2, rgba2, row_fraction=1.0), [(10, 290)])


if __name__ == '__main__':
    unittest.main()
