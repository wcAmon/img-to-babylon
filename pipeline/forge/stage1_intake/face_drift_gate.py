#!/usr/bin/env python3
"""Did the tomato extension move or repaint the face? Compare the bust region before and after.

Two signals, both inside the bust box the padding step recorded: (1) raw pixel difference over the
whole bust (mean absolute difference and the fraction of pixels that changed by more than 24/255);
(2) Divine Eye silhouette IoU on the head crop (top 45 percent of the bust box), reusing the root
forge/divine_eye.py evaluator so the number is the same one the rest of the pipeline reports.
Thresholds come from the R6 spec: IoU >= 0.92, mean <= 6/255, changed fraction <= 2 percent.
"""
from __future__ import annotations
import argparse, json, sys, tempfile
from pathlib import Path
HERE = Path(__file__).resolve(); ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parents[1])); sys.path.insert(0, str(ROOT / "forge"))
from _shared.png import read_rgba, write_rgb, composite_on_white  # noqa: E402
import divine_eye  # noqa: E402  (root forge tool; stdlib only)


def _crop_rgb(png: Path, box: list[int]) -> tuple[int, int, bytes]:
    w, h, rgba = read_rgba(png); rgb = composite_on_white(w, h, rgba)
    x, y, bw, bh = box; bw = min(bw, w - x); bh = min(bh, h - y)
    out = bytearray()
    for row in range(y, y + bh): out += rgb[(row * w + x) * 3:(row * w + x + bw) * 3]
    return bw, bh, bytes(out)


def bust_difference(input_png: Path, output_png: Path, bust_box: list[int]) -> dict:
    w, h, a = _crop_rgb(input_png, bust_box); w2, h2, b = _crop_rgb(output_png, bust_box)
    if (w, h) != (w2, h2): raise ValueError("bust crops differ in size; extension must keep the source size")
    total = 0; over = 0; n = w * h
    for i in range(n):
        d = max(abs(a[i * 3] - b[i * 3]), abs(a[i * 3 + 1] - b[i * 3 + 1]), abs(a[i * 3 + 2] - b[i * 3 + 2]))
        total += d
        if d > 24: over += 1
    return {"meanAbsDiff": total / n if n else 0.0, "fractionOver24": over / n if n else 0.0}


def head_iou(input_png: Path, output_png: Path, bust_box: list[int]) -> float:
    x, y, bw, bh = bust_box; head = [x, y, bw, max(1, int(bh * 0.45))]
    with tempfile.TemporaryDirectory() as d:
        ref = Path(d) / "ref.png"; ren = Path(d) / "ren.png"
        for src, dst in ((input_png, ref), (output_png, ren)):
            cw, ch, rgb = _crop_rgb(src, head); write_rgb(dst, cw, ch, rgb)
        result = divine_eye.evaluate(str(ref), str(ren))
    return float(result["signals"]["silhouetteIoU"])


def run_gate(extend_json: Path, out_json: Path, iou_min: float = 0.92, mean_max: float = 6.0, frac_max: float = 0.02) -> dict:
    meta = json.loads(Path(extend_json).read_text()); views = []
    for v in meta["views"]:
        diff = bust_difference(Path(v["input"]), Path(v["output"]), v["bustBox"])
        iou = head_iou(Path(v["input"]), Path(v["output"]), v["bustBox"])
        ok = iou >= iou_min and diff["meanAbsDiff"] <= mean_max and diff["fractionOver24"] <= frac_max
        views.append({"role": v["role"], "headIoU": round(iou, 4), "meanAbsDiff": round(diff["meanAbsDiff"], 3),
                      "fractionOver24": round(diff["fractionOver24"], 4), "pass": ok})
    result = {"pass": all(v["pass"] for v in views), "views": views,
              "thresholds": {"headIoUMin": iou_min, "meanAbsDiffMax": mean_max, "fractionOver24Max": frac_max}}
    Path(out_json).parent.mkdir(parents=True, exist_ok=True)
    Path(out_json).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    return result


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--extend", type=Path, required=True); ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    r = run_gate(a.extend, a.out); print(json.dumps(r, ensure_ascii=False))
    return 0 if r["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
