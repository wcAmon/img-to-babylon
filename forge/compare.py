#!/usr/bin/env python3
"""並排對照表：reference × render → sheet.png（純 stdlib PNG 編解碼）。
用法: python3 forge/compare.py <reference.png> <render.png> --out <sheet.png>
僅支援 8-bit RGB(color type 2)/RGBA(6)、無 interlace。
"""
import argparse
import json
import struct
import sys
import zlib

SIG = b"\x89PNG\r\n\x1a\n"


def read_png(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != SIG:
        raise ValueError(f"{path} 不是 PNG")
    pos, w, h, ct, idat = 8, 0, 0, 0, b""
    while pos < len(data):
        ln, typ = struct.unpack(">I4s", data[pos:pos + 8])
        pos += 8
        chunk = data[pos:pos + ln]
        pos += ln + 4  # 跳過 CRC
        if typ == b"IHDR":
            w, h, bitd, ct = struct.unpack(">IIBB", chunk[:10])
            interlace = chunk[12]
            if bitd != 8 or ct not in (2, 6) or interlace != 0:
                raise ValueError("僅支援 8-bit RGB/RGBA、無 interlace")
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
    raw = zlib.decompress(idat)
    ch = 3 if ct == 2 else 4
    stride = w * ch
    out = bytearray(h * w * 3)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        flt = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if flt == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 255
        elif flt == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif flt == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif flt == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        prev = line
        row = y * w * 3
        for x in range(w):
            out[row + x * 3: row + x * 3 + 3] = line[x * ch: x * ch + 3]
    return w, h, bytes(out)


def write_png(path, w, h, rgb):
    def chunk(typ, payload):
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + rgb[y * w * 3:(y + 1) * w * 3] for y in range(h))
    with open(path, "wb") as f:
        f.write(SIG
                + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 6))
                + chunk(b"IEND", b""))


def side_by_side(a, b, gap=8):
    wa, ha, pa = a
    wb, hb, pb = b
    height = max(ha, hb)
    width = wa + gap + wb
    out = bytearray(b"\xff" * (width * height * 3))

    def blit(px, pw, ph, ox):
        for y in range(ph):
            off = (y * width + ox) * 3
            out[off:off + pw * 3] = px[y * pw * 3:(y + 1) * pw * 3]

    blit(pa, wa, ha, 0)
    blit(pb, wb, hb, wa + gap)
    return width, height, bytes(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("reference")
    ap.add_argument("render")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    w, h, px = side_by_side(read_png(args.reference), read_png(args.render))
    write_png(args.out, w, h, px)
    print(json.dumps({"out": args.out, "width": w, "height": h}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
