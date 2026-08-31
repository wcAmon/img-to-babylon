#!/usr/bin/env python3
"""BabylonSculptSpec v1 驗證器。
用法: python3 forge/validate_spec.py <spec.json> [--strict]
exit 0=通過, 2=未通過。--strict 加開品質 gate（產碼前必須通過）。
"""
import argparse
import json
import math
import sys

REQUIRED_TOP = ["targetName", "sourceImages", "coordinateFrame", "silhouette",
                "componentTree", "materials", "physics", "buildPasses", "reviewHistory"]
PRIMITIVES = {"box", "sphere", "cylinder", "capsule", "torus", "tube",
              "extrude", "lathe", "csg"}
COLLIDER_TYPES = {"box", "sphere", "capsule", "cylinder", "convex"}
HINGE_PIVOT_TOL = 0.005  # 5mm：attachment.hinge.pivot 與 constraint.pivotB 容差


def _valid_limits(limits):
    """hinge limits：[lo, hi] 數字對（lo < hi）或 "free"（角軸完全放開，如車輪）。"""
    if limits == "free":
        return True
    return (isinstance(limits, list) and len(limits) == 2
            and all(isinstance(x, (int, float)) for x in limits)
            and limits[0] < limits[1])


def validate(spec, strict=False):
    errors, warnings = [], []
    for key in REQUIRED_TOP:
        if key not in spec:
            errors.append(f"缺少頂層欄位: {key}")
    if errors:
        return errors, warnings

    comps = {}
    for c in spec["componentTree"]:
        cid = c.get("id")
        if not cid:
            errors.append("componentTree 有元件缺 id")
            continue
        if cid in comps:
            errors.append(f"componentTree id 重複: {cid}")
        comps[cid] = c
        for field in ("name", "level", "primitive", "dimensions", "transform"):
            if field not in c:
                errors.append(f"元件 {cid} 缺少 {field}")
        if c.get("primitive") not in PRIMITIVES:
            errors.append(f"元件 {cid} primitive 不合法: {c.get('primitive')}")
        if c.get("parent") and c["parent"] not in {x.get("id") for x in spec["componentTree"]}:
            errors.append(f"元件 {cid} parent 不存在: {c['parent']}")
        col = c.get("collider")
        if col and col.get("type") not in COLLIDER_TYPES:
            errors.append(f"元件 {cid} collider type 不合法: {col.get('type')}")

    bodies = spec["physics"].get("bodies", [])
    if not bodies:
        errors.append("physics.bodies 不可為空")
    assigned = {}
    for b in bodies:
        bid = b.get("id", "?")
        for cid in b.get("components", []):
            if cid not in comps:
                errors.append(f"body {bid} 引用不存在元件: {cid}")
            elif cid in assigned:
                errors.append(f"元件 {cid} 同時屬於 body {assigned[cid]} 與 {bid}")
            else:
                assigned[cid] = bid
        if not isinstance(b.get("mass"), (int, float)) or b["mass"] <= 0:
            errors.append(f"body {bid} mass 必須為正數")
    for cid in comps:
        if cid not in assigned:
            errors.append(f"元件 {cid} 未指派給任何 body")
    for cid, c in comps.items():
        if c.get("level") == "macro" and not c.get("collider"):
            errors.append(f"macro 元件 {cid} 缺少 collider")

    body_ids = {b.get("id") for b in bodies}
    constraints = spec["physics"].get("constraints", [])
    for con in constraints:
        for side in ("bodyA", "bodyB"):
            if con.get(side) not in body_ids:
                errors.append(f"constraint 引用不存在 body: {con.get(side)}")
        if con.get("type") == "hinge":
            if "axis" not in con or "limits" not in con:
                errors.append("hinge constraint 必須有 axis 與 limits")
            elif not _valid_limits(con["limits"]):
                errors.append(
                    f"hinge constraint limits 不合法（須為 [lo, hi] 數字對且 lo < hi，"
                    f"或 \"free\"）: {con['limits']!r}")

    for cid, c in comps.items():
        att = c.get("attachment") or {}
        if att.get("type") != "hinge":
            continue
        h = att.get("hinge") or {}
        my_body = assigned.get(cid)
        match = next((con for con in constraints
                      if con.get("type") == "hinge"
                      and my_body in (con.get("bodyA"), con.get("bodyB"))), None)
        if not match:
            errors.append(f"元件 {cid} attachment 為 hinge 但 physics.constraints 無對應")
            continue
        if h.get("axis") != match.get("axis"):
            errors.append(f"元件 {cid} hinge axis 與 constraint 不一致")
        pa, pb = h.get("pivot"), match.get("pivotB")
        if pa and pb and math.dist(pa, pb) > HINGE_PIVOT_TOL:
            errors.append(f"元件 {cid} hinge pivot 與 constraint pivotB 差距 > 5mm")
        if "limits" in h and h["limits"] != match.get("limits"):
            errors.append(f"元件 {cid} hinge limits 與 constraint 不一致")

    if strict:
        if spec["silhouette"].get("complexity") == "complex" and len(comps) < 3:
            errors.append("strict: silhouette 為 complex 但 componentTree 少於 3 個元件")
        mat_ids = {m.get("id") for m in spec.get("materials", [])}
        for cid, c in comps.items():
            d = c.get("dimensions", {})
            for k in ("w", "h", "d"):
                if not isinstance(d.get(k), (int, float)) or d[k] <= 0:
                    errors.append(f"strict: 元件 {cid} dimensions.{k} 必須為正數")
            if c.get("level") == "macro":
                if not c.get("material"):
                    errors.append(f"strict: macro 元件 {cid} 缺少 material")
                elif c["material"] not in mat_ids:
                    errors.append(f"strict: 元件 {cid} material 未定義: {c['material']}")
    return errors, warnings


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("spec")
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args(argv)
    with open(args.spec) as f:
        spec = json.load(f)
    errors, warnings = validate(spec, args.strict)
    for w in warnings:
        print(f"WARN: {w}")
    for e in errors:
        print(f"FAIL: {e}")
    print("OK" if not errors else f"{len(errors)} 項未通過")
    return 0 if not errors else 2


if __name__ == "__main__":
    sys.exit(main())
