#!/usr/bin/env python3
"""Compose review sheets (rows of images at a shared height) so the user sees one PNG, not six."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _shared.png import read_rgba, write_rgb, composite_on_white, scale_nearest, blit  # noqa: E402


def compose_sheet(rows: list[list[Path]], out_png: Path, cell_height: int = 640, gap: int = 16) -> dict:
    scaled: list[list[tuple[int, int, bytes]]] = []
    for row in rows:
        cells = []
        for p in row:
            w, h, rgba = read_rgba(p); rgb = composite_on_white(w, h, rgba)
            nw = max(1, w * cell_height // h)
            cells.append((nw, cell_height, scale_nearest(w, h, rgb, nw, cell_height)))
        scaled.append(cells)
    width = max(sum(c[0] for c in cells) + gap * (len(cells) - 1) for cells in scaled)
    height = cell_height * len(scaled) + gap * (len(scaled) - 1)
    board = bytearray(b"\xff" * (width * height * 3)); placed = []
    for r, cells in enumerate(scaled):
        x = 0; y = r * (cell_height + gap); row_cells = []
        for cw, ch, rgb in cells:
            blit(width, height, board, cw, ch, rgb, x, y); row_cells.append([x, y, cw, ch]); x += cw + gap
        placed.append(row_cells)
    write_rgb(out_png, width, height, bytes(board))
    return {"width": width, "height": height, "cells": placed}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--row", action="append", nargs="+", type=Path, required=True, help="one --row per sheet row")
    ap.add_argument("--out", type=Path, required=True); ap.add_argument("--cell-height", type=int, default=640)
    a = ap.parse_args(argv)
    print(json.dumps(compose_sheet(a.row, a.out, a.cell_height)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
