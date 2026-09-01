"""divine_eye.py 測試：合成 PNG（stdlib）驗證遮罩、bbox 對齊 IoU、pHash、SSIM、裁決。"""
import os
import struct
import sys
import tempfile
import unittest
import zlib

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from compare import write_png  # noqa: E402
import divine_eye as de  # noqa: E402


def vgrad(w, h, top=(51, 51, 77), bot=(203, 205, 213)):
    """模擬 viewer 截圖的垂直漸層背景。"""
    buf = bytearray(w * h * 3)
    for y in range(h):
        t = y / (h - 1) if h > 1 else 0
        c = bytes(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            buf[(y * w + x) * 3:(y * w + x) * 3 + 3] = c
    return buf


def flat(w, h, color=(235, 235, 235)):
    return bytearray(bytes(color) * (w * h))


def rect(buf, w, x0, y0, x1, y1, color):
    for y in range(y0, y1):
        for x in range(x0, x1):
            buf[(y * w + x) * 3:(y * w + x) * 3 + 3] = bytes(color)


def diamond(buf, w, cx, cy, r, color):
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if abs(x - cx) + abs(y - cy) <= r:
                buf[(y * w + x) * 3:(y * w + x) * 3 + 3] = bytes(color)


def write_rgba(path, w, h, pixels):
    """最小 RGBA PNG 編碼器（color type 6），測 alpha 路徑用。"""
    def chunk(typ, payload):
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)
    raw = b"".join(
        b"\x00" + bytes(v for p in pixels[y * w:(y + 1) * w] for v in p)
        for y in range(h))
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 6))
                + chunk(b"IEND", b""))


class PngRgbaTest(unittest.TestCase):
    def test_rgb_roundtrip_alpha_255(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            buf = flat(8, 4, (10, 20, 30))
            write_png(p, 8, 4, bytes(buf))
            w, h, px = de.read_png_rgba(p)
            self.assertEqual((w, h), (8, 4))
            self.assertEqual(px[0], (10, 20, 30, 255))

    def test_rgba_alpha_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            pixels = [(255, 0, 0, 0)] * 8 + [(0, 255, 0, 200)] * 8
            write_rgba(p, 4, 4, pixels)
            w, h, px = de.read_png_rgba(p)
            self.assertEqual((w, h), (4, 4))
            self.assertEqual(px[0][3], 0)
            self.assertEqual(px[8][3], 200)


class MaskTest(unittest.TestCase):
    def test_gradient_background_masked_out(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            buf = vgrad(96, 96)
            rect(buf, 96, 30, 30, 66, 66, (200, 30, 30))
            write_png(p, 96, 96, bytes(buf))
            mask, warnings = de.load_mask(p)
            cov = sum(mask) / len(mask)
            expect = (36 * 36) / (96 * 96)
            self.assertLess(abs(cov - expect), expect * 0.35)
            x0, y0, bw, bh = de.bbox_of(mask, de.MASK_GRID)
            g = de.MASK_GRID
            self.assertLess(abs(x0 - 30 * g // 96), g * 0.05)
            self.assertLess(abs(bw - 36 * g // 96), g * 0.10)

    def test_alpha_path(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            pixels = []
            for y in range(32):
                for x in range(32):
                    inside = 8 <= x < 24 and 8 <= y < 24
                    pixels.append((90, 90, 90, 255) if inside else (0, 0, 0, 0))
            write_rgba(p, 32, 32, pixels)
            mask, warnings = de.load_mask(p)
            cov = sum(mask) / len(mask)
            self.assertLess(abs(cov - 0.25), 0.08)


class ShapeSignalTest(unittest.TestCase):
    def _mask_for(self, draw, size=96):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            buf = vgrad(size, size)
            draw(buf, size)
            write_png(p, size, size, bytes(buf))
            mask, _ = de.load_mask(p)
        return mask

    def test_iou_framing_invariant(self):
        # 同形狀、不同位置與大小 → bbox 對齊後 IoU 應接近 1
        m1 = self._mask_for(lambda b, s: rect(b, s, 10, 10, 40, 40, (200, 30, 30)))
        m2 = self._mask_for(lambda b, s: rect(b, s, 40, 30, 88, 78, (200, 30, 30)))
        a1 = de.aligned_shape(m1, de.MASK_GRID, de.bbox_of(m1, de.MASK_GRID))
        a2 = de.aligned_shape(m2, de.MASK_GRID, de.bbox_of(m2, de.MASK_GRID))
        self.assertGreater(de.silhouette_iou(a1, a2), 0.95)

    def test_iou_different_shape(self):
        # 正方形 vs 菱形：菱形只填 bbox 一半 → IoU 明顯低
        m1 = self._mask_for(lambda b, s: rect(b, s, 20, 20, 76, 76, (200, 30, 30)))
        m2 = self._mask_for(lambda b, s: diamond(b, s, 48, 48, 28, (200, 30, 30)))
        a1 = de.aligned_shape(m1, de.MASK_GRID, de.bbox_of(m1, de.MASK_GRID))
        a2 = de.aligned_shape(m2, de.MASK_GRID, de.bbox_of(m2, de.MASK_GRID))
        self.assertLess(de.silhouette_iou(a1, a2), 0.72)

    def test_symmetry_error(self):
        sym = self._mask_for(lambda b, s: rect(b, s, 20, 20, 76, 76, (200, 30, 30)))
        asym = self._mask_for(lambda b, s: (
            rect(b, s, 20, 20, 48, 76, (200, 30, 30)),
            rect(b, s, 48, 56, 76, 76, (200, 30, 30))))
        a_sym = de.aligned_shape(sym, de.MASK_GRID, de.bbox_of(sym, de.MASK_GRID))
        a_asym = de.aligned_shape(asym, de.MASK_GRID, de.bbox_of(asym, de.MASK_GRID))
        self.assertLess(de.symmetry_error(a_sym, de.ALIGN_SIZE), 0.02)
        self.assertGreater(de.symmetry_error(a_asym, de.ALIGN_SIZE), 0.15)


class PhashTest(unittest.TestCase):
    def _luma(self, buf, w, h):
        px = [(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2], 255) for i in range(w * h)]
        return de.luma_grid(w, h, px, (0, 0, w, h), 32)

    def _pattern(self, seed):
        w = h = 64
        buf = bytearray(w * h * 3)
        v = seed
        for by in range(8):
            for bx in range(8):
                v = (v * 1103515245 + 12345) & 0x7FFFFFFF
                c = 40 + (v % 160)
                rect(buf, w, bx * 8, by * 8, bx * 8 + 8, by * 8 + 8, (c, c, c))
        return buf, w, h

    def test_brightness_invariance(self):
        buf, w, h = self._pattern(7)
        brighter = bytearray(min(255, b + 40) for b in buf)
        h1 = de.phash64(self._luma(buf, w, h))
        h2 = de.phash64(self._luma(brighter, w, h))
        self.assertGreaterEqual(de.phash_similarity(h1, h2), 0.85)

    def test_different_pattern_lower(self):
        b1, w, h = self._pattern(7)
        b2, _, _ = self._pattern(999)
        h1 = de.phash64(self._luma(b1, w, h))
        h2 = de.phash64(self._luma(b2, w, h))
        self.assertLess(de.phash_similarity(h1, h2), 0.85)


class LumaSignalTest(unittest.TestCase):
    def test_identical_scores_one(self):
        buf, w, h = PhashTest._pattern(PhashTest(), 3)
        px = [(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2], 255) for i in range(w * h)]
        a = de.luma_grid(w, h, px, (0, 0, w, h), de.LUMA_SIZE)
        self.assertGreater(de.global_ssim(a, a), 0.999)
        self.assertGreater(de.tonal_parity(a, a), 0.999)
        e = de.luma_grid(w, h, px, (0, 0, w, h), de.EDGE_SIZE)
        self.assertEqual(de.edge_overlap(e, e, de.EDGE_SIZE), 1.0)


class EvaluateTest(unittest.TestCase):
    def test_identical_image_passes(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            buf = vgrad(96, 96)
            rect(buf, 96, 30, 24, 66, 80, (200, 30, 30))
            rect(buf, 96, 38, 30, 58, 44, (240, 200, 160))
            write_png(p, 96, 96, bytes(buf))
            r = de.evaluate(p, p)
            self.assertEqual(r["verdict"], "pass")
            self.assertEqual(r["hardGateFailures"], [])
            self.assertGreaterEqual(r["fidelity"], de.FIDELITY_TARGET)

    def test_shape_mismatch_rejects(self):
        with tempfile.TemporaryDirectory() as d:
            pa, pb = os.path.join(d, "a.png"), os.path.join(d, "b.png")
            b1 = vgrad(96, 96)
            rect(b1, 96, 20, 20, 76, 76, (200, 30, 30))
            write_png(pa, 96, 96, bytes(b1))
            b2 = vgrad(96, 96)
            diamond(b2, 96, 48, 48, 28, (30, 90, 200))
            write_png(pb, 96, 96, bytes(b2))
            r = de.evaluate(pa, pb)
            self.assertLess(r["signals"]["silhouetteIoU"], de.IOU_HARD_MIN)
            self.assertEqual(r["verdict"], "reject")

    def test_main_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            buf = vgrad(64, 64)
            rect(buf, 64, 20, 16, 44, 52, (200, 30, 30))
            write_png(p, 64, 64, bytes(buf))
            self.assertEqual(de.main([ "--reference", p, "--render", p, "--json"]), 0)


if __name__ == "__main__":
    unittest.main()


class ShadowTest(unittest.TestCase):
    def test_shadow_pixel_detected(self):
        bg = (200, 200, 210)
        shadow = tuple(round(c * 0.6) for c in bg)
        self.assertTrue(de.shadow_of_background(shadow, bg, 24.0))

    def test_colored_pixel_not_shadow(self):
        self.assertFalse(de.shadow_of_background((30, 80, 180), (200, 200, 210), 24.0))

    def test_near_black_not_shadow(self):
        # 黑色車輪在灰地板上：太暗（非中度變暗）不得當陰影剔除
        self.assertFalse(de.shadow_of_background((20, 20, 22), (200, 200, 210), 24.0))

    def test_mask_excludes_drop_shadow(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            buf = flat(96, 96, (235, 235, 235))
            rect(buf, 96, 30, 20, 66, 70, (200, 30, 30))
            rect(buf, 96, 14, 68, 82, 84, (150, 150, 150))  # 陰影帶（與主體相連）：背景的 0.64 倍
            write_png(p, 96, 96, bytes(buf))
            mask, _ = de.load_mask(p)
            x0, y0, bw, bh = de.bbox_of(mask, de.MASK_GRID)
            g = de.MASK_GRID
            # bbox 須貼合紅色矩形，不被陰影帶拉寬
            self.assertLess(abs(x0 - 30 * g // 96), g * 0.05)
            self.assertLess(abs(bw - 36 * g // 96), g * 0.08)


class ClosingTest(unittest.TestCase):
    def test_close_mask_bridges_thin_gap(self):
        size = 16
        mask = [False] * (size * size)
        for y in range(4, 12):
            for x in range(2, 7):
                mask[y * size + x] = True
            for x in range(8, 14):  # x=7 一格細縫
                mask[y * size + x] = True
        closed = de.close_mask(mask, size)
        filtered, discarded = de.largest_component(closed, size)
        self.assertEqual(discarded, 0.0)
        x0, _y0, bw, _bh = de.bbox_of(filtered, size)
        self.assertEqual((x0, bw), (2, 12))
