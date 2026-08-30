import os, tempfile, unittest
from forge import compare


def solid(w, h, rgb):
    return bytes(rgb) * (w * h)


class CompareTest(unittest.TestCase):
    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            compare.write_png(p, 4, 3, solid(4, 3, (255, 0, 0)))
            w, h, px = compare.read_png(p)
            self.assertEqual((w, h), (4, 3))
            self.assertEqual(px[:3], b"\xff\x00\x00")
            self.assertEqual(len(px), 4 * 3 * 3)

    def test_side_by_side_dimensions(self):
        a = (4, 3, solid(4, 3, (255, 0, 0)))
        b = (2, 5, solid(2, 5, (0, 255, 0)))
        w, h, px = compare.side_by_side(a, b, gap=8)
        self.assertEqual((w, h), (4 + 8 + 2, 5))
        self.assertEqual(len(px), w * h * 3)
        # 左圖第一列第一像素為紅，右圖區第一列第一像素為綠
        self.assertEqual(px[:3], b"\xff\x00\x00")
        right_off = (0 * w + 4 + 8) * 3
        self.assertEqual(px[right_off:right_off + 3], b"\x00\xff\x00")

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            pa, pb, po = (os.path.join(d, n) for n in ("a.png", "b.png", "o.png"))
            compare.write_png(pa, 4, 4, solid(4, 4, (10, 20, 30)))
            compare.write_png(pb, 4, 4, solid(4, 4, (40, 50, 60)))
            self.assertEqual(compare.main([pa, pb, "--out", po]), 0)
            w, h, _ = compare.read_png(po)
            self.assertEqual((w, h), (16, 4))


if __name__ == "__main__":
    unittest.main()
