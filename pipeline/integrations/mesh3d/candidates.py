#!/usr/bin/env python3
"""Summarise generated GLB candidates from their provenance and a stdlib GLB probe."""
from __future__ import annotations
import argparse, json, math, struct, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from forge.stage1_intake.probe_glb import probe_glb, parse_glb, _buffer_view_bytes  # noqa: E402

_TEXTURE_SLOTS = (
    ("pbrMetallicRoughness", "baseColorTexture"),
    ("pbrMetallicRoughness", "metallicRoughnessTexture"),
    (None, "normalTexture"),
    (None, "occlusionTexture"),
    (None, "emissiveTexture"),
)


def _png_dimensions(data: bytes) -> tuple[int, int]:
    """Width/height from the IHDR chunk (bytes 16-24 of a well-formed PNG)."""
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG file")
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def _jpeg_dimensions(data: bytes) -> tuple[int, int]:
    """Walk JFIF markers to the first SOF0/SOF1/SOF2/SOF3 and read height/width.

    Pure stdlib: no PIL, no JPEG decode. Markers are TAG(0xFF, code) [+ 2-byte big-endian
    segment length]; RST markers (0xD0-0xD7) and the two markers with no payload (0xD8 SOI,
    0x01 TEM) are skipped without a length field.
    """
    if len(data) < 4 or data[0:2] != b"\xff\xd8":
        raise ValueError("not a JPEG file")
    pos = 2
    n = len(data)
    while pos + 1 < n:
        if data[pos] != 0xFF:
            pos += 1
            continue
        marker = data[pos + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            pos += 2
            continue
        if pos + 4 > n:
            break
        seg_len = struct.unpack(">H", data[pos + 2 : pos + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3):
            height, width = struct.unpack(">HH", data[pos + 5 : pos + 9])
            return width, height
        if marker == 0xD9:  # EOI: no SOF found
            break
        pos += 2 + seg_len
    raise ValueError("no SOF0/SOF1/SOF2/SOF3 marker found")


def _image_dimensions(mime_type: str | None, data: bytes) -> tuple[int, int] | None:
    if mime_type == "image/png" or data[:8] == b"\x89PNG\r\n\x1a\n":
        return _png_dimensions(data)
    if mime_type == "image/jpeg" or data[:2] == b"\xff\xd8":
        return _jpeg_dimensions(data)
    return None


def _texture_usage(document: dict) -> dict[int, list[str]]:
    """Map image index -> sorted list of "materials[i].slot" labels that reference it."""
    textures = document.get("textures", []) if isinstance(document.get("textures"), list) else []
    materials = document.get("materials", []) if isinstance(document.get("materials"), list) else []
    usage: dict[int, list[str]] = {}
    for material_index, material in enumerate(materials):
        if not isinstance(material, dict):
            continue
        for container_key, slot in _TEXTURE_SLOTS:
            holder = material.get(container_key, {}) if container_key else material
            if not isinstance(holder, dict):
                continue
            ref = holder.get(slot)
            if not isinstance(ref, dict):
                continue
            texture_index = ref.get("index")
            if not isinstance(texture_index, int) or not 0 <= texture_index < len(textures):
                continue
            texture = textures[texture_index]
            if not isinstance(texture, dict):
                continue
            image_index = texture.get("source")
            if not isinstance(image_index, int):
                continue
            usage.setdefault(image_index, []).append(f"materials[{material_index}].{slot}")
    return {k: sorted(v) for k, v in usage.items()}


def _embedded_textures(document: dict, bin_payload: bytes) -> list[dict]:
    images = document.get("images", []) if isinstance(document.get("images"), list) else []
    usage = _texture_usage(document)
    out = []
    for index, image in enumerate(images):
        if not isinstance(image, dict):
            continue
        record: dict = {"index": index, "usedBy": usage.get(index, [])}
        if "bufferView" in image:
            data = _buffer_view_bytes(document, bin_payload, int(image["bufferView"]))
            mime_type = image.get("mimeType")
            record["mimeType"] = mime_type
            record["bytes"] = len(data)
            dims = _image_dimensions(mime_type, data)
            if dims is not None:
                record["width"], record["height"] = dims
        else:
            record["uri"] = image.get("uri")
        out.append(record)
    return out


def _triangle_and_vertex_counts(document: dict) -> tuple[int, int, bool]:
    accessors = document.get("accessors", []) if isinstance(document.get("accessors"), list) else []
    meshes = document.get("meshes", []) if isinstance(document.get("meshes"), list) else []
    triangle_count = 0
    vertex_count = 0
    non_triangle_modes = False
    for mesh in meshes:
        if not isinstance(mesh, dict):
            continue
        for prim in mesh.get("primitives", []) if isinstance(mesh.get("primitives"), list) else []:
            if not isinstance(prim, dict):
                continue
            mode = prim.get("mode", 4)
            attributes = prim.get("attributes", {}) if isinstance(prim.get("attributes"), dict) else {}
            position_index = attributes.get("POSITION")
            if isinstance(position_index, int) and 0 <= position_index < len(accessors):
                vertex_count += int(accessors[position_index].get("count", 0))
            indices_index = prim.get("indices")
            if isinstance(indices_index, int) and 0 <= indices_index < len(accessors):
                count = int(accessors[indices_index].get("count", 0))
            elif isinstance(position_index, int) and 0 <= position_index < len(accessors):
                count = int(accessors[position_index].get("count", 0))
            else:
                continue
            if mode == 4:
                triangle_count += count // 3
            else:
                triangle_count += count
                non_triangle_modes = True
    return triangle_count, vertex_count, non_triangle_modes


def _node_matrix(node: dict) -> list[float]:
    if "matrix" in node and isinstance(node["matrix"], list) and len(node["matrix"]) == 16:
        return [float(v) for v in node["matrix"]]
    tx, ty, tz = (node.get("translation") or [0.0, 0.0, 0.0])
    rx, ry, rz, rw = (node.get("rotation") or [0.0, 0.0, 0.0, 1.0])
    sx, sy, sz = (node.get("scale") or [1.0, 1.0, 1.0])
    xx, yy, zz = rx * rx, ry * ry, rz * rz
    xy, xz, yz = rx * ry, rx * rz, ry * rz
    wx, wy, wz = rw * rx, rw * ry, rw * rz
    col0 = (1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy))
    col1 = (2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx))
    col2 = (2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy))
    return [
        col0[0] * sx, col0[1] * sx, col0[2] * sx, 0.0,
        col1[0] * sy, col1[1] * sy, col1[2] * sy, 0.0,
        col2[0] * sz, col2[1] * sz, col2[2] * sz, 0.0,
        tx, ty, tz, 1.0,
    ]


def _apply_matrix(m: list[float], point: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = point
    return (
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    )


def _uniform_scale(m: list[float], rel_tol: float = 1e-3) -> float | None:
    def norm(v: tuple[float, float, float]) -> float:
        return math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)

    lengths = [norm((m[0], m[1], m[2])), norm((m[4], m[5], m[6])), norm((m[8], m[9], m[10]))]
    if any(l <= 0 for l in lengths):
        return None
    if max(lengths) - min(lengths) > rel_tol * max(lengths):
        return None
    return sum(lengths) / 3.0


def _collect_mesh_local_bounds(document: dict, node_index: int, bounds: list[tuple[list[float], list[float]]]) -> None:
    nodes = document.get("nodes", []) if isinstance(document.get("nodes"), list) else []
    if not 0 <= node_index < len(nodes):
        return
    node = nodes[node_index]
    if not isinstance(node, dict):
        return
    mesh_index = node.get("mesh")
    meshes = document.get("meshes", []) if isinstance(document.get("meshes"), list) else []
    accessors = document.get("accessors", []) if isinstance(document.get("accessors"), list) else []
    if isinstance(mesh_index, int) and 0 <= mesh_index < len(meshes):
        mesh = meshes[mesh_index]
        for prim in mesh.get("primitives", []) if isinstance(mesh.get("primitives"), list) else []:
            if not isinstance(prim, dict):
                continue
            position_index = (prim.get("attributes") or {}).get("POSITION")
            if not isinstance(position_index, int) or not 0 <= position_index < len(accessors):
                continue
            accessor = accessors[position_index]
            mn, mx = accessor.get("min"), accessor.get("max")
            if isinstance(mn, list) and isinstance(mx, list) and len(mn) == 3 and len(mx) == 3:
                bounds.append(([float(v) for v in mn], [float(v) for v in mx]))
    for child in node.get("children", []) or []:
        if isinstance(child, int):
            _collect_mesh_local_bounds(document, child, bounds)


def _world_bounds(document: dict) -> tuple[dict | None, float | None]:
    """Apply each scene root node's transform to the 8 corners of the pooled mesh-local
    bounds of the meshes under it (children walked but their own transforms not composed
    in, per the plan). Multiple roots are merged into one overall world AABB; nodeScale is
    reported only when exactly one root contributes meshes and its transform is a uniform
    scale."""
    scenes = document.get("scenes", []) if isinstance(document.get("scenes"), list) else []
    scene_index = document.get("scene", 0) if isinstance(document.get("scene"), int) else 0
    if not 0 <= scene_index < len(scenes):
        return None, None
    roots = scenes[scene_index].get("nodes", []) if isinstance(scenes[scene_index], dict) else []
    nodes = document.get("nodes", []) if isinstance(document.get("nodes"), list) else []
    all_world_points: list[tuple[float, float, float]] = []
    scales: list[float | None] = []
    contributing_roots = 0
    for root_index in roots if isinstance(roots, list) else []:
        if not isinstance(root_index, int) or not 0 <= root_index < len(nodes):
            continue
        local_bounds: list[tuple[list[float], list[float]]] = []
        _collect_mesh_local_bounds(document, root_index, local_bounds)
        if not local_bounds:
            continue
        contributing_roots += 1
        local_min = [min(b[0][axis] for b in local_bounds) for axis in range(3)]
        local_max = [max(b[1][axis] for b in local_bounds) for axis in range(3)]
        corners = [
            (local_min[0] if cx == 0 else local_max[0],
             local_min[1] if cy == 0 else local_max[1],
             local_min[2] if cz == 0 else local_max[2])
            for cx in (0, 1) for cy in (0, 1) for cz in (0, 1)
        ]
        m = _node_matrix(nodes[root_index])
        all_world_points.extend(_apply_matrix(m, c) for c in corners)
        scales.append(_uniform_scale(m))
    if not all_world_points:
        return None, None
    wmin = [min(p[axis] for p in all_world_points) for axis in range(3)]
    wmax = [max(p[axis] for p in all_world_points) for axis in range(3)]
    size = [wmax[axis] - wmin[axis] for axis in range(3)]
    center = [(wmin[axis] + wmax[axis]) / 2.0 for axis in range(3)]
    world_bounds = {
        "min": wmin, "max": wmax, "size": size, "center": center,
        "space": "world-untransformed-by-viewer",
    }
    node_scale = scales[0] if contributing_roots == 1 else None
    return world_bounds, node_scale


def summarize_candidates(gen_root: Path, endpoints=("tripo", "rodin"), extra: dict[str, dict] | None = None) -> dict:
    """probe_glb returns (confirmed in probe_glb.py): sha256, meshes[], materials[], bounds{min,max} plus
    scalar warnings; this module additionally re-parses the raw glTF JSON (via probe_glb.parse_glb /
    probe_glb._buffer_view_bytes) for fields probe_glb does not expose: triangleCount, vertexCount,
    embeddedTextures (with decoded PNG/JPEG dimensions) and worldBounds (mesh-local bounds transformed
    by each scene root node's matrix/TRS).

    `extra`, when given, maps endpoint -> a dict of additional fields merged into that
    candidate only (e.g. viewerAzimuthOffsetDegrees, captureCamera); endpoints not present
    in `extra` are left untouched.
    """
    out = []
    for ep in endpoints:
        glb = gen_root / ep / "model.glb"; prov_path = gen_root / ep / "provenance.json"
        if not glb.is_file(): continue
        prov = json.loads(prov_path.read_text()) if prov_path.is_file() else {}
        report = probe_glb(glb)
        document, bin_payload, _binary_header = parse_glb(glb)
        separate_texture_files = [o for o in prov.get("outputs", []) if str(o.get("path", "")).endswith(".png") and "/textures/" in str(o.get("path", ""))]
        embedded_textures = _embedded_textures(document, bin_payload)
        triangle_count, vertex_count, non_triangle_modes = _triangle_and_vertex_counts(document)
        world_bounds, node_scale = _world_bounds(document)
        candidate = {
            "endpoint": ep, "glb": str(glb), "sha256": report["sha256"], "bytes": glb.stat().st_size,
            "requestId": prov.get("requestId"), "meshCount": len(report["meshes"]), "materialCount": len(report["materials"]),
            "separateTextureFiles": len(separate_texture_files), "textureCount": len(embedded_textures) + len(separate_texture_files),
            "bounds": report.get("bounds"),
            "probe": {k: v for k, v in report.items() if k != "path" and not isinstance(v, (list, dict))},
            "triangleCount": triangle_count, "vertexCount": vertex_count,
            "embeddedTextures": embedded_textures,
            "worldBounds": world_bounds, "nodeScale": node_scale,
            "warnings": list(report.get("warnings", [])),
        }
        if non_triangle_modes:
            candidate["nonTriangleModes"] = True
        if extra and ep in extra:
            candidate.update(extra[ep])
        out.append(candidate)
    return {"candidates": out}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gen-root", type=Path, required=True); ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--extra", type=Path, help="JSON file: {endpoint: {field: value, ...}, ...} merged per candidate")
    a = ap.parse_args(argv)
    extra = json.loads(a.extra.read_text()) if a.extra else None
    s = summarize_candidates(a.gen_root, extra=extra); a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(s, indent=2, ensure_ascii=False) + "\n"); print(json.dumps(s, ensure_ascii=False)[:600])
    return 0


if __name__ == "__main__":
    sys.exit(main())
