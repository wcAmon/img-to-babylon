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


_ANGULAR_KEYS = {"x", "y", "z"}


def _valid_angular(angular):
    """joint angular：{x|y|z: [lo,hi] 或 "free" 或 "locked"}，至少一軸。"""
    if not isinstance(angular, dict) or not angular:
        return False
    for k, v in angular.items():
        if k not in _ANGULAR_KEYS:
            return False
        if v in ("free", "locked"):
            continue
        if not isinstance(v, list) or not _valid_limits(v):
            return False
    return True


_ACTUATION_CON_TYPES = {"drive", "steer", "servo"}


def _hex_color(v):
    return (isinstance(v, str) and len(v) == 7 and v[0] == "#"
            and all(c in "0123456789abcdefABCDEF" for c in v[1:]))


def _check_constraint_actuation(con, errors):
    act = con.get("actuation")
    if act is None:
        return
    kind = act.get("type")
    if kind not in _ACTUATION_CON_TYPES:
        errors.append(f"constraint actuation type 不合法: {kind!r}（合法: drive/steer/servo）")
        return
    if not isinstance(act.get("maxForce"), (int, float)) or act["maxForce"] <= 0:
        errors.append(f"actuation {kind} 的 maxForce 必須為正數")
    if kind == "drive":
        if con.get("type") != "hinge" or con.get("limits") != "free":
            errors.append("actuation drive 只准掛在 limits 為 \"free\" 的 hinge 上")
        if not isinstance(act.get("targetSpeed"), (int, float)) or act["targetSpeed"] <= 0:
            errors.append("actuation drive 的 targetSpeed 必須為正數")
    elif kind == "steer":
        limits = con.get("limits")
        rng = act.get("range")
        if con.get("type") != "hinge" or not isinstance(limits, list):
            errors.append("actuation steer 只准掛在有數字 limits 的 hinge 上")
        elif (not isinstance(rng, list) or len(rng) != 2
              or not all(isinstance(x, (int, float)) for x in rng)
              or rng[0] >= rng[1]):
            errors.append("actuation steer 必須有 range [lo, hi] 數字對")
        elif rng[0] < limits[0] or rng[1] > limits[1]:
            errors.append(f"actuation steer range {rng} 超出 hinge limits {limits}")
    elif kind == "servo":
        ok = ((con.get("type") == "hinge" and isinstance(con.get("limits"), list))
              or (con.get("type") == "joint" and isinstance(con.get("angular"), dict)))
        if not ok:
            errors.append("actuation servo 只准掛在有數字 limits 的 hinge 或 joint 上")


def _check_component_actuation(cid, c, errors):
    act = c.get("actuation")
    if act is None:
        return
    if act.get("type") != "light":
        errors.append(f"元件 {cid} actuation type 不合法: {act.get('type')!r}（元件僅支援 light）")
        return
    if not c.get("material"):
        errors.append(f"元件 {cid} actuation light 需要 material")
    em = act.get("emissive")
    if (not isinstance(em, dict) or not _hex_color(em.get("on"))
            or not _hex_color(em.get("off"))):
        errors.append(f"元件 {cid} actuation light 的 emissive 必須有 on/off 十六進位色")


_RUPTURE_POSITIVE = ("impulseThreshold", "emptiedMass", "puddleRadius")


def _check_rupture(bid, body, errors):
    """可破裂 body：質量轉移契約（設計文件 §3.2／§4）。"""
    rup = body.get("rupture")
    if rup is None:
        return
    if not isinstance(rup, dict):
        errors.append(f"body {bid} rupture 必須是物件")
        return
    for key in _RUPTURE_POSITIVE:
        v = rup.get(key)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or v <= 0:
            errors.append(f"body {bid} rupture.{key} 必須為正數")
    mass = body.get("mass")
    em = rup.get("emptiedMass")
    if (isinstance(mass, (int, float)) and isinstance(em, (int, float))
            and not isinstance(em, bool) and em >= mass):
        errors.append(f"body {bid} rupture.emptiedMass {em} 必須小於 mass {mass}")
    d = rup.get("droplets")
    if not isinstance(d, int) or isinstance(d, bool) or d < 0:
        errors.append(f"body {bid} rupture.droplets 必須為非負整數")




def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _check_pour(bid, body, constraints, errors):
    """可傾倒 body：節流的質量轉移契約（M11 設計文件 §3.2／§4；M12 §4.1 擴充 direction／exitSpeed、tilt 選填）。"""
    pour = body.get("pour")
    if pour is None:
        return
    if not isinstance(pour, dict):
        errors.append(f"body {bid} pour 必須是物件")
        return
    tilt = pour.get("tiltThreshold")
    if tilt is not None and (not _is_num(tilt) or not 0 < tilt < math.pi):
        errors.append(f"body {bid} pour.tiltThreshold 必須在 (0, π) 內")
    if tilt is None and pour.get("gate") is None:
        errors.append(f"body {bid} pour 無 tiltThreshold 時必須有 gate（否則出廠即永倒）")
    direction = pour.get("direction")
    if direction is not None and (
            not isinstance(direction, list) or len(direction) != 3
            or not all(_is_num(v) for v in direction)
            or abs(math.sqrt(sum(v * v for v in direction)) - 1.0) > 1e-6):
        errors.append(f"body {bid} pour.direction 必須是長度 1 的三元向量")
    speed = pour.get("exitSpeed")
    if speed is not None and (not _is_num(speed) or speed <= 0):
        errors.append(f"body {bid} pour.exitSpeed 必須為正數")
    source = pour.get("source", "declared")
    if source not in ("declared", "collected"):
        errors.append(f"body {bid} pour.source 必須是 declared 或 collected")
    rate = pour.get("ratePerSecond")
    if not _is_num(rate) or rate <= 0:
        errors.append(f"body {bid} pour.ratePerSecond 必須為正數")
    if source == "collected":
        # M17：倒出收進來的東西——顆數／質量來自 collect，不得預宣告
        if "grains" in pour or "grainMass" in pour:
            errors.append(f"body {bid} pour.source collected 時不得有 grains／grainMass")
        if not isinstance(body.get("collect"), dict):
            errors.append(f"body {bid} pour.source collected 需要同 body 的 collect")
    else:
        gm = pour.get("grainMass")
        if not _is_num(gm) or gm <= 0:
            errors.append(f"body {bid} pour.grainMass 必須為正數")
        grains = pour.get("grains")
        if not isinstance(grains, int) or isinstance(grains, bool) or grains <= 0:
            errors.append(f"body {bid} pour.grains 必須為正整數")
        mass = body.get("mass")
        if (isinstance(grains, int) and not isinstance(grains, bool)
                and _is_num(mass) and _is_num(gm) and grains * gm >= mass):
            errors.append(f"body {bid} pour.grains×grainMass {grains * gm} 必須小於 mass {mass}")
    gate = pour.get("gate")
    if gate is None:
        return
    if not isinstance(gate, dict):
        errors.append(f"body {bid} pour.gate 必須是物件")
        return
    hinge = next((c for c in constraints if c.get("type") == "hinge"
                  and c.get("bodyA") == bid and c.get("bodyB") == gate.get("body")), None)
    if hinge is None:
        errors.append(f"body {bid} pour.gate.body {gate.get('body')!r} 不是掛在本 body 上的 hinge 之 bodyB")
        return
    limits, ang = hinge.get("limits"), gate.get("minAngle")
    if (not _is_num(ang) or not isinstance(limits, list) or not (limits[0] <= ang <= limits[1])):
        errors.append(f"body {bid} pour.gate.minAngle {ang!r} 必須落在 hinge limits {limits!r} 內")


def _check_collect(bid, body, errors):
    """容器 body：收納＝反向的質量轉移（M12 設計文件 §4.2）。"""
    col = body.get("collect")
    if col is None:
        return
    if not isinstance(col, dict):
        errors.append(f"body {bid} collect 必須是物件")
        return
    trigger = col.get("trigger", "manual")
    if trigger not in ("manual", "contact"):
        errors.append(f"body {bid} collect.trigger 必須是 manual 或 contact")
    interior = col.get("interior")
    if not isinstance(interior, dict):
        errors.append(f"body {bid} collect.interior 必須是物件（size、offset）")
    else:
        size = interior.get("size")
        if not (isinstance(size, list) and len(size) == 3 and all(_is_num(v) and v > 0 for v in size)):
            errors.append(f"body {bid} collect.interior.size 必須是三個正數")
        offset = interior.get("offset")
        if not (isinstance(offset, list) and len(offset) == 3 and all(_is_num(v) for v in offset)):
            errors.append(f"body {bid} collect.interior.offset 必須是三個數字")
    mim, mass = col.get("maxItemMass"), body.get("mass")
    if not _is_num(mim) or mim <= 0:
        errors.append(f"body {bid} collect.maxItemMass 必須為正數")
    elif _is_num(mass) and mim >= mass:
        errors.append(f"body {bid} collect.maxItemMass {mim} 必須小於 mass {mass}")


def _stack_height(comps):
    """componentTree 的世界 Y 範圍（沿 parent 鏈累加 position.y，±h/2）。"""
    tops, bottoms = [], []
    for c in comps.values():
        h = c.get("dimensions", {}).get("h")
        if not isinstance(h, (int, float)):
            continue
        y, p, seen = c["transform"]["position"][1], c.get("parent"), set()
        while p and p in comps and p not in seen:
            seen.add(p)
            y += comps[p]["transform"]["position"][1]
            p = comps[p].get("parent")
        tops.append(y + h / 2)
        bottoms.append(y - h / 2)
    return (max(tops) - min(bottoms)) if tops else 0.0


def _check_proportions(spec, comps, errors):
    prop = spec.get("proportions")
    if not prop:
        return
    head_id = prop.get("head_component")
    unit = prop.get("head_unit")
    heads = prop.get("total_heads")
    tol = prop.get("tolerance", 0.15)
    if head_id not in comps:
        errors.append(f"proportions.head_component 不存在: {head_id}")
        return
    if not all(isinstance(x, (int, float)) and x > 0 for x in (unit, heads, tol)):
        errors.append("proportions 的 head_unit/total_heads/tolerance 必須為正數")
        return
    head_h = comps[head_id].get("dimensions", {}).get("h")
    if isinstance(head_h, (int, float)) and abs(head_h - unit) > unit * tol:
        errors.append(
            f"proportions head_unit 不符：head 元件高 {head_h} vs 宣告 {unit}（±{tol:.0%}）")
    height = _stack_height(comps)
    expect = unit * heads
    if abs(height - expect) > expect * tol:
        errors.append(
            f"proportions total_heads 不符：模型全高 {height:.4f} vs "
            f"{unit}×{heads} = {expect:.4f}（±{tol:.0%}）")


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
        _check_rupture(bid, b, errors)
        _check_pour(bid, b, spec["physics"].get("constraints", []), errors)
        _check_collect(bid, b, errors)
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
        _check_constraint_actuation(con, errors)
        if con.get("type") == "joint":
            if "axis" not in con or "angular" not in con:
                errors.append("joint constraint 必須有 axis 與 angular")
            elif not _valid_angular(con["angular"]):
                errors.append(
                    f"joint constraint angular 不合法（逐軸 x/y/z 各為 [lo, hi] 數字對、"
                    f"\"free\" 或 \"locked\"）: {con['angular']!r}")

    for cid, c in comps.items():
        _check_component_actuation(cid, c, errors)
        att = c.get("attachment") or {}
        kind = att.get("type")
        if kind not in ("hinge", "joint"):
            continue
        h = att.get(kind) or {}
        my_body = assigned.get(cid)
        match = next((con for con in constraints
                      if con.get("type") == kind
                      and my_body in (con.get("bodyA"), con.get("bodyB"))), None)
        if not match:
            errors.append(f"元件 {cid} attachment 為 {kind} 但 physics.constraints 無對應")
            continue
        if h.get("axis") != match.get("axis"):
            errors.append(f"元件 {cid} {kind} axis 與 constraint 不一致")
        pa, pb = h.get("pivot"), match.get("pivotB")
        if pa and pb and math.dist(pa, pb) > HINGE_PIVOT_TOL:
            errors.append(f"元件 {cid} {kind} pivot 與 constraint pivotB 差距 > 5mm")
        if kind == "hinge" and "limits" in h and h["limits"] != match.get("limits"):
            errors.append(f"元件 {cid} hinge limits 與 constraint 不一致")
        if kind == "joint" and "angular" in h and h["angular"] != match.get("angular"):
            errors.append(f"元件 {cid} joint angular 與 constraint 不一致")

    _check_proportions(spec, comps, errors)

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
