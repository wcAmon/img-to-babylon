"""Minimal 8-bit RGB/RGBA PNG reader/writer plus compositing helpers. Stdlib only.

The repository already decodes PNG in forge/divine_eye.py and forge/compare.py (root tools) but
pipeline/forge must not import root forge; this module is the pipeline-side equivalent and
keeps alpha, which the yui three-view reference relies on (transparent background).
"""
from __future__ import annotations
import struct, zlib
from pathlib import Path

SIG = b"\x89PNG\r\n\x1a\n"


def _unfilter(raw: bytes, w: int, h: int, ch: int) -> list[bytearray]:
    stride = w * ch; prev = bytearray(stride); rows = []; pos = 0
    for _ in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f == 1:
            for i in range(ch, stride): line[i] = (line[i] + line[i - ch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0; b = prev[i]; c = prev[i - ch] if i >= ch else 0
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        elif f != 0:
            raise ValueError(f"unsupported PNG filter {f}")
        rows.append(line); prev = line
    return rows


def read_rgba(path: Path) -> tuple[int, int, bytearray]:
    data = Path(path).read_bytes()
    if data[:8] != SIG: raise ValueError(f"{path} is not a PNG")
    pos = 8; w = h = 0; ct = -1; idat = b""
    while pos < len(data):
        ln, typ = struct.unpack(">I4s", data[pos:pos + 8]); pos += 8
        chunk = data[pos:pos + ln]; pos += ln + 4
        if typ == b"IHDR":
            w, h, bd, ct, _comp, _filt, interlace = struct.unpack(">IIBBBBB", chunk[:13])
            if bd != 8 or ct not in (2, 6) or interlace != 0:
                raise ValueError("only 8-bit RGB/RGBA non-interlaced PNG is supported")
        elif typ == b"IDAT": idat += chunk
        elif typ == b"IEND": break
    ch = 3 if ct == 2 else 4
    rows = _unfilter(zlib.decompress(idat), w, h, ch)
    out = bytearray(w * h * 4)
    for y, line in enumerate(rows):
        if ch == 4: out[y * w * 4:(y + 1) * w * 4] = line
        else:
            for x in range(w):
                out[(y * w + x) * 4:(y * w + x) * 4 + 3] = line[x * 3:x * 3 + 3]; out[(y * w + x) * 4 + 3] = 255
    return w, h, out


def _write(path: Path, w: int, h: int, pixels: bytes, ch: int, ct: int) -> None:
    def chunk(typ: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + typ + payload + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)
    if len(pixels) != w * h * ch: raise ValueError("pixel buffer size mismatch")
    raw = b"".join(b"\x00" + bytes(pixels[y * w * ch:(y + 1) * w * ch]) for y in range(h))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(SIG + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, ct, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def write_rgba(path: Path, w: int, h: int, rgba: bytes) -> None: _write(path, w, h, rgba, 4, 6)
def write_rgb(path: Path, w: int, h: int, rgb: bytes) -> None: _write(path, w, h, rgb, 3, 2)


def composite_on_white(w: int, h: int, rgba: bytes) -> bytes:
    out = bytearray(w * h * 3)
    for i in range(w * h):
        a = rgba[i * 4 + 3]
        for c in range(3):
            out[i * 3 + c] = (rgba[i * 4 + c] * a + 255 * (255 - a)) // 255
    return bytes(out)


def scale_nearest(w: int, h: int, rgb: bytes, new_w: int, new_h: int) -> bytes:
    out = bytearray(new_w * new_h * 3)
    for y in range(new_h):
        sy = min(h - 1, y * h // new_h)
        for x in range(new_w):
            sx = min(w - 1, x * w // new_w)
            out[(y * new_w + x) * 3:(y * new_w + x) * 3 + 3] = rgb[(sy * w + sx) * 3:(sy * w + sx) * 3 + 3]
    return bytes(out)


def blit(dst_w: int, dst_h: int, dst_rgb: bytearray, src_w: int, src_h: int, src_rgb: bytes, x: int, y: int) -> None:
    for row in range(src_h):
        dy = y + row
        if dy < 0 or dy >= dst_h: continue
        x0 = max(0, x); x1 = min(dst_w, x + src_w)
        if x1 <= x0: continue
        dst_rgb[(dy * dst_w + x0) * 3:(dy * dst_w + x1) * 3] = src_rgb[(row * src_w + (x0 - x)) * 3:(row * src_w + (x1 - x)) * 3]
