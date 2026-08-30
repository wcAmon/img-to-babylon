#!/usr/bin/env python3
"""tomato-image 客戶端：生成/編輯/多視角參考圖。純 stdlib。
用法:
  python3 forge/tomato.py gen  --prompt "..." [--aspect 16:9] [--seed N] --out hero.png
  python3 forge/tomato.py edit --image src.png --prompt "..." [--seed N] --out out.png
  python3 forge/tomato.py views --image hero.png --out-dir dir   # side.png + rear.png
tomato 不可達時：明確報錯，流程降級為使用者提供圖片（見 grimoire/intake.md）。
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("IMG2BABYLON_TOMATO_BASE", "https://tomato.tail8e3f79.ts.net")
MAX_RETRIES = 3

VIEW_PROMPTS = {
    "side": "rotate the view to show the same object directly from the side, "
            "keep the same style, lighting and background",
    "rear": "rotate the view to show the same object from behind, "
            "keep the same style, lighting and background",
}


def _post_json(url, payload, opener=None, retries=MAX_RETRIES):
    opener = opener or urllib.request.build_opener()
    body = json.dumps(payload).encode()
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"})
        try:
            with opener.open(req, timeout=300) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt < retries:
                wait = int(e.headers.get("Retry-After") or 5)
                print(f"tomato 忙碌，{wait}s 後重試（{attempt + 1}/{retries}）",
                      file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("unreachable")


def _fetch_asset(job_id, out_path, opener=None):
    opener = opener or urllib.request.build_opener()
    with opener.open(f"{BASE}/assets/{job_id}", timeout=120) as resp:
        data = resp.read()
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(data)
    return len(data)


def cmd_gen(args, opener=None):
    payload = {"prompt": args.prompt, "aspect": args.aspect}
    if args.seed is not None:
        payload["seed"] = args.seed
    job = _post_json(f"{BASE}/image", payload, opener)
    n = _fetch_asset(job["job_id"], args.out, opener)
    print(json.dumps({"out": args.out, "bytes": n, "job_id": job["job_id"],
                      "mode": job.get("mode")}, ensure_ascii=False))
    return 0


def cmd_edit(args, opener=None):
    with open(args.image, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    payload = {"prompt": args.prompt, "image": b64}
    if args.seed is not None:
        payload["seed"] = args.seed
    job = _post_json(f"{BASE}/image", payload, opener)
    n = _fetch_asset(job["job_id"], args.out, opener)
    print(json.dumps({"out": args.out, "bytes": n, "job_id": job["job_id"],
                      "mode": job.get("mode")}, ensure_ascii=False))
    return 0


def cmd_views(args, opener=None):
    os.makedirs(args.out_dir, exist_ok=True)
    for role, prompt in VIEW_PROMPTS.items():
        sub = argparse.Namespace(
            image=args.image, prompt=prompt, seed=args.seed,
            out=os.path.join(args.out_dir, f"{role}.png"))
        cmd_edit(sub, opener)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("gen")
    p.add_argument("--prompt", required=True)
    p.add_argument("--aspect", default="16:9", choices=["16:9", "9:16"])
    p.add_argument("--seed", type=int)
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_gen)
    p = sub.add_parser("edit")
    p.add_argument("--image", required=True)
    p.add_argument("--prompt", required=True)
    p.add_argument("--seed", type=int)
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_edit)
    p = sub.add_parser("views")
    p.add_argument("--image", required=True)
    p.add_argument("--seed", type=int)
    p.add_argument("--out-dir", required=True)
    p.set_defaults(func=cmd_views)
    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
