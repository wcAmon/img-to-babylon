#!/usr/bin/env python3
"""Summarise generated GLB candidates from their provenance and a stdlib GLB probe."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from forge.stage1_intake.probe_glb import probe_glb  # noqa: E402


def summarize_candidates(gen_root: Path, endpoints=("tripo", "rodin")) -> dict:
    """probe_glb returns (confirmed in probe_glb.py): sha256, meshes[], materials[], bounds{min,max} plus scalar warnings.

    Note: probe_glb's mesh primitive records expose attributes/material/positionBounds
    but no indices/vertex-count field, so triangleCount cannot be derived from them;
    the key is only included when such a field is actually present.
    """
    out = []
    for ep in endpoints:
        glb = gen_root / ep / "model.glb"; prov_path = gen_root / ep / "provenance.json"
        if not glb.is_file(): continue
        prov = json.loads(prov_path.read_text()) if prov_path.is_file() else {}
        report = probe_glb(glb)
        textures = [o for o in prov.get("outputs", []) if str(o.get("path", "")).endswith(".png") and "/textures/" in str(o.get("path", ""))]
        candidate = {
            "endpoint": ep, "glb": str(glb), "sha256": report["sha256"], "bytes": glb.stat().st_size,
            "requestId": prov.get("requestId"), "meshCount": len(report["meshes"]), "materialCount": len(report["materials"]),
            "textureCount": len(textures), "bounds": report.get("bounds"),
            "probe": {k: v for k, v in report.items() if not isinstance(v, (list, dict))},
        }
        triangle_count = 0
        has_triangle_field = False
        for mesh in report.get("meshes", []):
            for prim in mesh.get("primitives", []):
                for key in ("triangleCount", "indexCount", "vertexCount"):
                    if key in prim:
                        has_triangle_field = True
                        value = prim[key]
                        triangle_count += value // 3 if key == "indexCount" else value
        if has_triangle_field:
            candidate["triangleCount"] = triangle_count
        out.append(candidate)
    return {"candidates": out}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gen-root", type=Path, required=True); ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    s = summarize_candidates(a.gen_root); a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(s, indent=2, ensure_ascii=False) + "\n"); print(json.dumps(s, ensure_ascii=False)[:600])
    return 0


if __name__ == "__main__":
    sys.exit(main())
