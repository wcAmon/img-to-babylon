#!/usr/bin/env python3
"""Opt-in generativeAssist: call fal.ai image-to-3D endpoints and record provenance. Stdlib only.

This is the escape hatch described in pipeline/docs/UPGRADE_PLAN.md 5.9 and the R6 spec: never a
default, always paid on explicit `--confirm-paid`, deduplicated by input hash, and the key lives only
in memory. Rodin (fal-ai/hyper3d/rodin) receives images inline as data URIs. Tripo
(tripo3d/tripo/v2.5/multiview-to-3d) rejects data URIs for its *_image_url inputs, so its three
views are uploaded to fal's own storage (an unauthenticated, unguessable URL) for the paid
submission only; dry-run output, input_hash, and provenance["parameters"] all stay data-URI based
regardless of endpoint.
"""
from __future__ import annotations
import argparse, base64, hashlib, json, os, sys, time, urllib.error, urllib.request
from datetime import datetime, timezone
from pathlib import Path

QUEUE = "https://queue.fal.run"
ENDPOINTS = {"tripo": "tripo3d/tripo/v2.5/multiview-to-3d", "rodin": "fal-ai/hyper3d/rodin"}


def load_fal_key(env_path: Path | None) -> str:
    key = os.environ.get("FAL_API_KEY", "").strip()
    if not key and env_path and Path(env_path).is_file():
        for line in Path(env_path).read_text().splitlines():
            if line.strip().startswith("FAL_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key: raise SystemExit("FAL_API_KEY not found (set the environment variable or add it to .env)")
    return key


def image_data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(Path(path).read_bytes()).decode()


def build_payload(endpoint: str, views: dict[str, Path], seed: int) -> dict:
    uris = {role: image_data_uri(p) for role, p in views.items()}
    if endpoint == "tripo":
        p = {"front_image_url": uris["front"], "left_image_url": uris["left"], "right_image_url": uris["right"],
             "texture": "HD", "pbr": True, "face_limit": 120000, "orientation": "align_image", "auto_size": True, "seed": seed}
        if "back" in uris: p["back_image_url"] = uris["back"]
        return p
    if endpoint == "rodin":
        return {"input_image_urls": [uris["front"], uris["left"], uris["right"]] + ([uris["back"]] if "back" in uris else []),
                "condition_mode": "concat", "quality": "high", "material": "PBR", "TAPose": True,
                "geometry_file_format": "glb", "seed": seed}
    raise ValueError(f"unknown endpoint {endpoint}")


def input_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _redacted(payload: dict) -> dict:
    out = {}
    for k, v in payload.items():
        if isinstance(v, str) and v.startswith("data:"): out[k] = f"<data-uri {len(v)} chars>"
        elif isinstance(v, list) and v and isinstance(v[0], str) and v[0].startswith("data:"): out[k] = [f"<data-uri {len(s)} chars>" for s in v]
        else: out[k] = v
    return out


def _get_json(opener, url: str, key: str, timeout: float = 60) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Key {key}"})
    try:
        with opener.open(req, timeout=timeout) as resp: return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:2000]
        raise RuntimeError(f"fal GET {url.split('?')[0]} failed: HTTP {e.code} {e.reason}: {body}") from None


def run_job(endpoint_id: str, payload: dict, key: str, opener, poll_interval: float = 5.0, timeout: float = 900.0, sleep=time.sleep) -> dict:
    req = urllib.request.Request(f"{QUEUE}/{endpoint_id}", data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
    try:
        with opener.open(req, timeout=120) as resp: job = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:2000]
        raise RuntimeError(f"fal POST {QUEUE}/{endpoint_id} failed: HTTP {e.code} {e.reason}: {body}") from None
    deadline = time.monotonic() + timeout
    while True:
        status = _get_json(opener, job["status_url"], key)
        if status.get("status") == "COMPLETED": break
        if status.get("status") in ("FAILED", "CANCELLED", "ERROR"): raise RuntimeError(f"fal job {job['request_id']} ended with {status.get('status')}")
        if time.monotonic() > deadline: raise RuntimeError(f"fal job {job['request_id']} timed out after {timeout}s")
        sleep(poll_interval)
    output = _get_json(opener, job["response_url"], key)
    output["_requestId"] = job["request_id"]
    return output


def _download(opener, url: str, dst: Path) -> dict:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with opener.open(urllib.request.Request(url), timeout=300) as resp: data = resp.read()
    dst.write_bytes(data)
    return {"path": str(dst), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "url": url}


def download_outputs(endpoint: str, output: dict, out_dir: Path, opener) -> dict:
    files = []
    if endpoint == "tripo":
        model = output.get("pbr_model") or output.get("model_mesh")
        if not model or not model.get("url"): raise RuntimeError("tripo output has no model url")
        files.append(_download(opener, model["url"], out_dir / "model.glb"))
        if output.get("rendered_image", {}).get("url"): files.append(_download(opener, output["rendered_image"]["url"], out_dir / "preview.png"))
    else:
        model = output.get("model_mesh")
        if not model or not model.get("url"): raise RuntimeError("rodin output has no model url")
        files.append(_download(opener, model["url"], out_dir / "model.glb"))
        for i, t in enumerate(output.get("textures") or []):
            files.append(_download(opener, t["url"], out_dir / "textures" / (t.get("file_name") or f"texture-{i}.png")))
    return {"files": files}


def upload_to_fal_storage(path: Path, key: str, opener) -> str:
    """Upload a file to fal's CDN storage and return its fetchable https URL.

    Adaptation (not in the original brief): fal's tripo3d/tripo/v2.5/multiview-to-3d endpoint
    rejects `data:` URIs for its *_image_url inputs with HTTP 422 "Failed to download the file"
    (verified empirically 2026-09-14 against the real API — rodin's fal-ai/hyper3d/rodin accepts
    data URIs fine, tripo does not). fal's queue itself has no documented endpoint to accept
    inline image bytes for tripo, so images must be uploaded to fal's own storage first. This is
    only used for the tripo submission payload; build_payload/input_hash/provenance still use data
    URIs so dedupe and the "never leak the key, never leak raw pixels beyond fal" intent hold for
    hashing/audit purposes even though the bytes are necessarily uploaded for tripo to work at all.
    """
    data = Path(path).read_bytes()
    init_req = urllib.request.Request(
        "https://rest.alpha.fal.ai/storage/upload/initiate",
        data=json.dumps({"content_type": "image/png", "file_name": Path(path).name}).encode(),
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"}, method="POST")
    try:
        with opener.open(init_req, timeout=30) as resp: init = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:2000]
        raise RuntimeError(f"fal storage initiate failed: HTTP {e.code} {e.reason}: {body}") from None
    if not init.get("upload_url") or not init.get("file_url"):
        raise RuntimeError(f"fal storage initiate response missing upload_url/file_url: {sorted(init.keys())}")
    put_req = urllib.request.Request(init["upload_url"], data=data, headers={"Content-Type": "image/png"}, method="PUT")
    try:
        with opener.open(put_req, timeout=120): pass
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:2000]
        raise RuntimeError(f"fal storage upload failed: HTTP {e.code} {e.reason}: {body}") from None
    return init["file_url"]


_URL_FIELDS = {"front": "front_image_url", "left": "left_image_url", "right": "right_image_url", "back": "back_image_url"}


def generate(endpoint: str, views: dict[str, Path], seed: int, out_root: Path, key: str, opener=None,
             confirm_paid: bool = False, force: bool = False, sleep=time.sleep) -> dict:
    opener = opener or urllib.request.build_opener()
    endpoint_id = ENDPOINTS[endpoint]; payload = build_payload(endpoint, views, seed); h = input_hash(payload)
    out_dir = out_root / endpoint; out_dir.mkdir(parents=True, exist_ok=True)
    prov_path = out_dir / "provenance.json"
    inputs = [{"role": r, "path": str(p), "sha256": hashlib.sha256(Path(p).read_bytes()).hexdigest()} for r, p in views.items()]
    if not confirm_paid:
        (out_dir / "dry-run.json").write_text(json.dumps({"endpoint": endpoint, "endpointId": endpoint_id, "parameters": _redacted(payload), "inputImages": inputs, "inputHash": h}, indent=2) + "\n")
        return {"dryRun": True, "endpointId": endpoint_id, "inputHash": h}
    # Dedupe only guards paid submissions: a dry run must never raise just because a previous
    # paid run (or another dry run) already wrote provenance.json for this exact input.
    if prov_path.is_file() and not force:
        old = json.loads(prov_path.read_text())
        if old.get("inputHash") == h: raise RuntimeError(f"already generated for this input (request {old.get('requestId')}); pass --force to pay again")
    submit_payload = payload
    submitted_via = "data-uri"
    if endpoint == "tripo":
        submit_payload = dict(payload)
        submitted_via = "fal-storage"
        for role, field in _URL_FIELDS.items():
            if field in submit_payload:
                submit_payload[field] = upload_to_fal_storage(views[role], key, opener)
    started = datetime.now(timezone.utc).isoformat()
    output = run_job(endpoint_id, submit_payload, key, opener, sleep=sleep)
    # Write a partial record as soon as the job is accepted (requestId known, paid) so a
    # download failure below still leaves an audit trail of what was actually submitted and
    # paid for, instead of silently losing the requestId.
    partial_prov = {"endpoint": endpoint, "endpointId": endpoint_id, "requestId": output.get("_requestId"),
                     "inputHash": h, "seed": seed, "startedAt": started, "paid": True, "status": "submitted"}
    prov_path.write_text(json.dumps(partial_prov, indent=2) + "\n")
    files = download_outputs(endpoint, output, out_dir, opener)
    prov = {"endpoint": endpoint, "endpointId": endpoint_id, "requestId": output.get("_requestId"), "seed": seed,
            "parameters": _redacted(payload), "inputImages": inputs, "inputHash": h, "outputs": files["files"],
            "resultSeed": output.get("seed"), "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(),
            "paid": True, "status": "complete", "submittedVia": submitted_via}
    prov_path.write_text(json.dumps(prov, indent=2) + "\n")
    return prov


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--endpoint", choices=sorted(ENDPOINTS), required=True)
    for role in ("front", "left", "right"): ap.add_argument(f"--{role}", type=Path, required=True)
    ap.add_argument("--back", type=Path); ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--out-root", type=Path, required=True); ap.add_argument("--confirm-paid", action="store_true")
    ap.add_argument("--force", action="store_true"); ap.add_argument("--env", type=Path, default=Path(".env"))
    a = ap.parse_args(argv)
    views = {"front": a.front, "left": a.left, "right": a.right}
    if a.back: views["back"] = a.back
    key = load_fal_key(a.env) if a.confirm_paid else "dry-run"
    result = generate(a.endpoint, views, a.seed, a.out_root, key, confirm_paid=a.confirm_paid, force=a.force)
    print(json.dumps({k: v for k, v in result.items() if k != "parameters"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
