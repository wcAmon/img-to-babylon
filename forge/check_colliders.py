#!/usr/bin/env python3
"""靜態物理 gate：驗證 runtime_export 輸出。
用法: python3 forge/check_colliders.py <runtime.json>
規則: collider AABB ⊇ mesh AABB（±10% 容差）；同 body 相鄰 collider 重疊 ≤25%；
密度 50–3000 kg/m³；質心在 collider 聯集 AABB 內。exit 0/2。
"""
import argparse
import json
import sys

CONTAIN_TOL = 0.10
OVERLAP_MAX = 0.25
DENSITY_MIN, DENSITY_MAX = 50.0, 3000.0


def aabb_contains(col, mesh, tol=CONTAIN_TOL):
    for i in range(3):
        size = mesh["max"][i] - mesh["min"][i]
        slack = tol * size
        if col["min"][i] > mesh["min"][i] + slack:
            return False
        if col["max"][i] < mesh["max"][i] - slack:
            return False
    return True


def overlap_volume(a, b):
    v = 1.0
    for i in range(3):
        lo = max(a["min"][i], b["min"][i])
        hi = min(a["max"][i], b["max"][i])
        if hi <= lo:
            return 0.0
        v *= hi - lo
    return v


def aabb_volume(a):
    v = 1.0
    for i in range(3):
        v *= max(a["max"][i] - a["min"][i], 0.0)
    return v


def check(runtime):
    errors = []
    mesh_by_comp = {m["component"]: m["aabb"] for m in runtime["meshes"]}
    for body in runtime["bodies"]:
        bid = body["id"]
        cols = body["colliders"]
        if not cols:
            errors.append(f"body {bid}: 沒有任何 collider")
            continue
        for col in cols:
            mesh = mesh_by_comp.get(col["component"])
            if mesh is None:
                errors.append(f"{col['component']}: collider 存在但 runtime 沒有對應 mesh")
            elif not aabb_contains(col["aabb"], mesh):
                errors.append(f"{col['component']}: collider AABB 未包住 mesh AABB（±10%）")
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                ov = overlap_volume(cols[i]["aabb"], cols[j]["aabb"])
                small = min(aabb_volume(cols[i]["aabb"]), aabb_volume(cols[j]["aabb"]))
                if small > 0 and ov / small > OVERLAP_MAX:
                    errors.append(
                        f"body {bid}: {cols[i]['component']}×{cols[j]['component']} "
                        f"collider 重疊 {ov / small:.0%} > 25%")
        vol = sum(c.get("volume", 0.0) for c in cols)
        if vol > 0:
            density = body["mass"] / vol
            if not DENSITY_MIN <= density <= DENSITY_MAX:
                errors.append(f"body {bid}: 密度 {density:.0f} kg/m³ 超出 [50, 3000]")
        union_min = [min(c["aabb"]["min"][i] for c in cols) for i in range(3)]
        union_max = [max(c["aabb"]["max"][i] for c in cols) for i in range(3)]
        com = body["centerOfMassWorld"]
        if not all(union_min[i] <= com[i] <= union_max[i] for i in range(3)):
            errors.append(f"body {bid}: 質心不在 collider 聯集 AABB 內")
    return errors


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("runtime")
    args = ap.parse_args(argv)
    with open(args.runtime) as f:
        runtime = json.load(f)
    errors = check(runtime)
    for e in errors:
        print(f"FAIL: {e}")
    print("OK" if not errors else f"{len(errors)} 項未通過")
    return 0 if not errors else 2


if __name__ == "__main__":
    sys.exit(main())
