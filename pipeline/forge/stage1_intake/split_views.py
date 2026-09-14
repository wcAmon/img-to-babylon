#!/usr/bin/env python3
"""Split a transparent-background multi-view reference into per-view white-backed PNGs.

Column gaps are found on the alpha channel, never assumed to be fixed thirds: the yui reference is
2172x724 with figures at columns 113-675 / 701-1474 / 1497-2061, and jackets touch the bottom edge,
so an RGB-threshold scan finds no gap at all. `--pad` places each bust on a tall white canvas so the
tomato edit route (output = input size) can extend the body downward.
"""
from __future__ import annotations
import argparse, hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _shared.png import read_rgba, write_rgb, composite_on_white, scale_nearest, blit  # noqa: E402

MARGIN = 24


def foreground_mask(w: int, h: int, rgba: bytes, alpha_threshold: int = 8, color_threshold: int = 22, edge: int = 16) -> list[bytearray]:
    """Per-row foreground mask. Alpha-driven when any pixel is translucent; else a per-row
    left/right-edge median background with a per-channel color-distance threshold, so an
    opaque grey-gradient backdrop (no alpha channel) still separates figures from background."""
    has_alpha = False
    for i in range(3, len(rgba), 4):
        if rgba[i] < 255: has_alpha = True; break
    rows: list[bytearray] = []
    for y in range(h):
        row = bytearray(w)
        base = y * w * 4
        if has_alpha:
            for x in range(w):
                if rgba[base + x * 4 + 3] > alpha_threshold: row[x] = 1
        else:
            lo = list(range(0, min(edge, w)))
            hi = list(range(max(0, w - edge), w))
            idx = sorted(set(lo + hi))
            chans = []
            for c in range(3):
                vals = sorted(rgba[base + x * 4 + c] for x in idx)
                n = len(vals)
                med = vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) // 2
                chans.append(med)
            for x in range(w):
                px = base + x * 4
                if any(abs(rgba[px + c] - chans[c]) > color_threshold for c in range(3)): row[x] = 1
        rows.append(row)
    return rows


def find_view_columns(w: int, h: int, rgba: bytes, alpha_threshold: int = 8, min_gap: int = 3, mask: list[bytearray] | None = None, row_fraction: float = 0.85) -> list[tuple[int, int]]:
    mask = mask if mask is not None else foreground_mask(w, h, rgba, alpha_threshold=alpha_threshold)
    scan_h = int(h * row_fraction)
    occupied = [False] * w
    for y in range(scan_h):
        row = mask[y]
        for x in range(w):
            if not occupied[x] and row[x]: occupied[x] = True
    runs: list[list[int]] = []; gap = 0
    for x, on in enumerate(occupied):
        if on:
            if runs and gap < min_gap: runs[-1][1] = x
            else: runs.append([x, x])
            gap = 0
        else: gap += 1
    return [(a, b) for a, b in runs if b - a + 1 > 20]


def _row_extent(w: int, h: int, rgba: bytes, x0: int, x1: int, alpha_threshold: int = 8, mask: list[bytearray] | None = None) -> tuple[int, int]:
    mask = mask if mask is not None else foreground_mask(w, h, rgba, alpha_threshold=alpha_threshold)
    top = bottom = -1
    for y in range(h):
        row = mask[y]
        if any(row[x] for x in range(x0, x1 + 1)):
            if top < 0: top = y
            bottom = y
    return top, bottom


def split_views(src: Path, out_dir: Path, roles: tuple[str, ...] = ("left", "front", "right")) -> dict:
    w, h, rgba = read_rgba(src)
    mask_mode = "color"
    for i in range(3, len(rgba), 4):
        if rgba[i] < 255: mask_mode = "alpha"; break
    mask = foreground_mask(w, h, rgba)
    cols = find_view_columns(w, h, rgba, mask=mask)
    if len(cols) != len(roles): raise ValueError(f"expected {len(roles)} views, found {len(cols)} column runs: {cols}")
    rgb = composite_on_white(w, h, rgba)
    out_dir.mkdir(parents=True, exist_ok=True); views = []
    for role, (x0, x1) in zip(roles, cols):
        y0, y1 = _row_extent(w, h, rgba, x0, x1, mask=mask)
        cw, chh = x1 - x0 + 1 + 2 * MARGIN, y1 - y0 + 1 + 2 * MARGIN
        canvas = bytearray(b"\xff" * (cw * chh * 3))
        crop = bytearray()
        for y in range(y0, y1 + 1): crop += rgb[(y * w + x0) * 3:(y * w + x1 + 1) * 3]
        blit(cw, chh, canvas, x1 - x0 + 1, y1 - y0 + 1, bytes(crop), MARGIN, MARGIN)
        write_rgb(out_dir / f"{role}.png", cw, chh, bytes(canvas))
        views.append({"role": role, "file": f"{role}.png", "box": [x0, y0, x1, y1], "width": cw, "height": chh})
    meta = {"source": str(src), "sourceSha256": hashlib.sha256(Path(src).read_bytes()).hexdigest(), "maskMode": mask_mode, "views": views}
    (out_dir / "views.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    return meta


def pad_for_full_body(view_png: Path, out_png: Path, canvas: tuple[int, int] = (1024, 2016), top_margin: int = 32) -> dict:
    w, h, rgba = read_rgba(view_png); rgb = composite_on_white(w, h, rgba)
    cw, ch = canvas; max_w = cw - 64
    if w > max_w:
        nh = max(1, h * max_w // w); rgb = scale_nearest(w, h, rgb, max_w, nh); w, h = max_w, nh
    if top_margin + h > ch: raise ValueError("bust taller than canvas; choose a taller canvas")
    board = bytearray(b"\xff" * (cw * ch * 3)); x = (cw - w) // 2
    blit(cw, ch, board, w, h, rgb, x, top_margin)
    write_rgb(out_png, cw, ch, bytes(board))
    return {"bustBox": [x, top_margin, w, h], "canvas": [cw, ch]}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path); ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--pad", action="store_true"); ap.add_argument("--canvas", default="1024x2016")
    a = ap.parse_args(argv)
    meta = split_views(a.src, a.out_dir)
    if a.pad:
        cw, ch = (int(v) for v in a.canvas.lower().split("x"))
        for v in meta["views"]:
            v.update(pad_for_full_body(a.out_dir / v["file"], a.out_dir / "padded" / v["file"], canvas=(cw, ch)))
            v["padded"] = f"padded/{v['file']}"
        (a.out_dir / "views.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"views": [(v["role"], v["box"]) for v in meta["views"]]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
