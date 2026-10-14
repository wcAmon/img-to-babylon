#!/usr/bin/env python3
"""Extend padded bust views to full body through the local tomato edit route.

Edit mode returns the source size, so Task 3 already placed the bust on a tall white canvas; this
script only asks the model to fill the blank area. The prompt is fixed and English (tomato tracks
English prompts best) and pins the parts that must not move: face, hair, jacket. Every call records
seed and job id so a rerun is reproducible. Free and local; never counts as a correction.
"""
from __future__ import annotations
import argparse, base64, hashlib, json, os, sys, time, urllib.error, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _shared.png import read_rgba  # noqa: E402

DEFAULT_BASE = os.environ.get("IMG2BABYLON_TOMATO_BASE", "")
EXTEND_PROMPT = (
    "Extend the blank white area below to show the same woman standing at full height: "
    "black tactical cargo trousers, black combat boots, arms slightly away from the body in a relaxed A-pose, "
    "same camera angle as the bust. Keep the face, hair, red collar and black jacket pixel-identical. "
    "Plain white background, no shadow, no text."
)
MAX_RETRIES = 3


def _open(opener, req, timeout):
    return opener.open(req, timeout=timeout)


def tomato_edit(image_png: Path, prompt: str, seed: int, opener=None, base: str = DEFAULT_BASE) -> tuple[bytes, dict]:
    if not base:
        raise SystemExit("tomato: IMG2BABYLON_TOMATO_BASE is not set; tomato is optional, provide the image yourself")
    opener = opener or urllib.request.build_opener()
    payload = {"prompt": prompt, "image": base64.b64encode(Path(image_png).read_bytes()).decode(), "seed": seed}
    body = json.dumps(payload).encode()
    for attempt in range(MAX_RETRIES + 1):
        req = urllib.request.Request(f"{base}/image", data=body, headers={"Content-Type": "application/json"})
        try:
            with _open(opener, req, 600) as resp: job = json.loads(resp.read().decode())
            break
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt < MAX_RETRIES:
                time.sleep(int(e.headers.get("Retry-After") or 5)); continue
            raise
    else: raise RuntimeError("unreachable")
    req = urllib.request.Request(f"{base}/assets/{job['job_id']}")
    with _open(opener, req, 120) as resp: png = resp.read()
    if png[:8] != b"\x89PNG\r\n\x1a\n": raise ValueError("tomato asset is not a PNG")
    return png, job


def extend_views(views_dir: Path, out_dir: Path, seed: int, opener=None, base: str = DEFAULT_BASE) -> dict:
    meta = json.loads((views_dir / "views.json").read_text())
    out_dir.mkdir(parents=True, exist_ok=True); rows = []
    for v in meta["views"]:
        src = views_dir / v["padded"]
        png, job = tomato_edit(src, EXTEND_PROMPT, seed, opener, base)
        dst = out_dir / f"{v['role']}.png"; dst.write_bytes(png)
        w, h, _ = read_rgba(dst)
        rows.append({"role": v["role"], "input": str(src), "output": str(dst), "jobId": job.get("job_id"),
                     "width": w, "height": h, "sha256": hashlib.sha256(png).hexdigest(), "bustBox": v["bustBox"]})
    result = {"prompt": EXTEND_PROMPT, "seed": seed, "base": base, "views": rows}
    (out_dir / "extend.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    return result


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--views", type=Path, required=True); ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--seed", type=int, required=True); ap.add_argument("--base", default=DEFAULT_BASE)
    a = ap.parse_args(argv)
    result = extend_views(a.views, a.out, a.seed, base=a.base)
    print(json.dumps({"views": [(v["role"], v["width"], v["height"], v["jobId"]) for v in result["views"]]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
