"""RGBA PNG round trip and compositing, stdlib only."""
from __future__ import annotations
import tempfile, unittest, struct, zlib
from pathlib import Path
from forge._shared.png import read_rgba, write_rgba, write_rgb, composite_on_white, scale_nearest, blit


class PngIo(unittest.TestCase):
    def test_rgba_round_trip(self):
        w, h = 3, 2
        rgba = bytes([10, 20, 30, 255, 40, 50, 60, 0, 70, 80, 90, 128] * 2)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'a.png'
            write_rgba(p, w, h, rgba)
            rw, rh, back = read_rgba(p)
        self.assertEqual((rw, rh), (w, h))
        self.assertEqual(bytes(back), rgba)

    def test_rgb_reads_back_with_opaque_alpha(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'b.png'
            write_rgb(p, 2, 1, bytes([1, 2, 3, 4, 5, 6]))
            _w, _h, back = read_rgba(p)
        self.assertEqual(bytes(back), bytes([1, 2, 3, 255, 4, 5, 6, 255]))

    def test_composite_on_white_blends_alpha(self):
        rgb = composite_on_white(2, 1, bytes([0, 0, 0, 255, 0, 0, 0, 0]))
        self.assertEqual(bytes(rgb), bytes([0, 0, 0, 255, 255, 255]))

    def test_scale_and_blit(self):
        small = bytes([9, 9, 9, 1, 1, 1])  # 2x1
        big = scale_nearest(2, 1, small, 4, 2)
        self.assertEqual(len(big), 4 * 2 * 3)
        self.assertEqual(bytes(big[:6]), bytes([9, 9, 9, 9, 9, 9]))
        dst = bytearray(b'\xff' * (4 * 2 * 3))
        blit(4, 2, dst, 2, 1, small, 1, 1)
        self.assertEqual(bytes(dst[(1 * 4 + 1) * 3:(1 * 4 + 3) * 3]), small)

    def test_rejects_non_8bit_png(self):
        def chunk(typ: bytes, payload: bytes) -> bytes:
            return struct.pack(">I", len(payload)) + typ + payload + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)
        w, h = 2, 1
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'c.png'
            sig = b"\x89PNG\r\n\x1a\n"
            ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 16, 2, 0, 0, 0))
            idat = chunk(b"IDAT", zlib.compress(b'\x00' + b'\x00' * (w * 3)))
            iend = chunk(b"IEND", b"")
            Path(p).write_bytes(sig + ihdr + idat + iend)
            with self.assertRaises(ValueError):
                read_rgba(p)

    def test_write_rejects_size_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'd.png'
            with self.assertRaises(ValueError):
                write_rgb(p, 2, 2, b'\x00' * 3)


if __name__ == '__main__':
    unittest.main()
