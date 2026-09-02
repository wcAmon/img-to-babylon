#!/usr/bin/env python3
"""Divine Eye — 確定性、零 token 的 reference↔render 多訊號評估器。
用法: python3 forge/divine_eye.py --reference <ref.png> --render <render.png>
       [--region x,y,w,h] [--json]
exit 0=pass, 1=low-confidence/reject, 2=錯誤。

移植自 img2threejs v1.3 divine_eye.py，並針對本管線改造：
  - 參考圖（tomato 生圖）與渲染圖（Babylon 截圖）取景必然不同 → silhouette IoU
    與 luma 訊號全部先各自裁到前景 bbox、重採樣到共同格網再比，消除取景差。
    因此捨棄 reference 的 scale-delta 硬 gate（bbox 對齊後尺度差無意義）。
  - viewer 截圖背景是垂直漸層 → 前景遮罩用逐列左右邊緣中位色估背景，
    不能用單一角落色（reference 的做法）。

硬 gate（一票否決）：bbox 對齊 silhouette IoU、遮罩反轉警告。
軟訊號（加權平均 → fidelity）：aspect-ratio、對稱 parity、pHash、SSIM、
edge overlap、tonal parity。訊號間分歧（spread）過大且未達標 → low-confidence
（交給 agent vision 裁量），這是自我不確定性路由。

門檻以 M1/M2 既有素材校準（2026-09-01，含陰影剔除與遮罩閉合後實測）：
  known-good（likeness≥7 的 hero 對）IoU 0.676/0.686、fidelity 0.453/0.397；
  cross-model 錯配對 IoU 0.599/0.619、fidelity 0.238/0.312。
  IOU_HARD_MIN=0.65、FIDELITY_TARGET=0.36 取好壞中點——在此 4 對語料上完美分離，
  但邊際窄（IoU ±0.03、fid ±0.04）；語料擴大後應重校。pHash/edge/tonal 在此語料
  無鑑別力（跨域渲染差異壓過訊號），symmetry parity 與 aspect 鑑別力最強。
"""
import argparse
import json
import math
import struct
import sys
import zlib

SIG = b"\x89PNG\r\n\x1a\n"
MASK_GRID = 224     # 前景遮罩格網
ALIGN_SIZE = 128    # bbox 對齊後形狀比對格網
LUMA_SIZE = 64      # SSIM / tonal 的 luma 格網
EDGE_SIZE = 96      # Sobel edge overlap 格網
IOU_HARD_MIN = 0.65         # bbox 對齊後 IoU 低於此 → reject（校準見 docstring）
FIDELITY_TARGET = 0.36      # 軟訊號加權平均達標線（跨域渲染，校準見 docstring）
DISAGREEMENT_SPREAD = 0.35  # 軟訊號分歧超過此 → low-confidence
ASPECT_SOFT_SCALE = 0.15    # aspect delta 到此值時 proportion 訊號歸零


def read_png_rgba(path):
    """8-bit RGB/RGBA、無 interlace 的 PNG → (w, h, [(r,g,b,a), ...])。"""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != SIG:
        raise ValueError(f"{path} 不是 PNG")
    pos, w, h, ct, idat = 8, 0, 0, 0, b""
    while pos < len(data):
        ln, typ = struct.unpack(">I4s", data[pos:pos + 8])
        pos += 8
        chunk = data[pos:pos + ln]
        pos += ln + 4
        if typ == b"IHDR":
            w, h, bitd, ct = struct.unpack(">IIBB", chunk[:10])
            if bitd != 8 or ct not in (2, 6) or chunk[12] != 0:
                raise ValueError("僅支援 8-bit RGB/RGBA、無 interlace")
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
    raw = zlib.decompress(idat)
    ch = 3 if ct == 2 else 4
    stride = w * ch
    prev = bytearray(stride)
    pixels = []
    pos = 0
    for _y in range(h):
        flt = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if flt == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 255
        elif flt == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif flt == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif flt == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        prev = line
        if ch == 3:
            for x in range(w):
                i = x * 3
                pixels.append((line[i], line[i + 1], line[i + 2], 255))
        else:
            for x in range(w):
                i = x * 4
                pixels.append((line[i], line[i + 1], line[i + 2], line[i + 3]))
    return w, h, pixels


def _median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def shadow_of_background(pixel, bg, thresh):
    """判斷 pixel 是否為背景的落地陰影：中度變暗（luma 比 0.45–0.97）
    且色度與等比例調暗後的背景一致。太暗的像素（如黑輪胎）不算陰影。"""
    bl = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]
    pl = 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]
    if bl <= 1e-6:
        return False
    ratio = pl / bl
    if not (0.45 < ratio < 0.97):
        return False
    d = math.sqrt(sum((pixel[c] - bg[c] * ratio) ** 2 for c in range(3)))
    return d <= thresh * 1.2


def foreground_mask(w, h, pixels):
    """全解析度前景遮罩。透明圖走 alpha；不透明圖用逐列左右邊緣中位色
    估背景（承受垂直漸層），色距超過雜訊自適應門檻即前景。"""
    warnings = []
    transparent = sum(1 for p in pixels if p[3] < 245) / max(1, len(pixels))
    if transparent > 0.03:
        mask = [p[3] > 24 for p in pixels]
    else:
        m = max(2, w // 50)
        bg_rows, noises = [], []
        for y in range(h):
            row = y * w
            samples = [pixels[row + x][:3] for x in range(m)] + \
                      [pixels[row + x][:3] for x in range(w - m, w)]
            bg = tuple(_median([s[c] for s in samples]) for c in range(3))
            bg_rows.append(bg)
            noises.append(_median(
                [max(abs(s[c] - bg[c]) for c in range(3)) for s in samples]))
        thresh = max(24.0, 2.4 * _median(noises))
        mask = []
        for y in range(h):
            bg = bg_rows[y]
            row = y * w
            for x in range(w):
                px = pixels[row + x][:3]
                d = math.sqrt(sum((px[c] - bg[c]) ** 2 for c in range(3)))
                mask.append(d > thresh and not shadow_of_background(px, bg, thresh))
    coverage = sum(mask) / max(1, len(mask))
    if coverage < 0.035:
        warnings.append("前景遮罩 tiny；訊號量的可能不是主體（遮罩退化為全圖）")
        mask = [p[3] > 16 for p in pixels]
    elif coverage > 0.9:
        warnings.append("圖片與背景無明顯區隔；遮罩近乎全圖")
    return mask, warnings


def close_mask(mask, size, radius=1):
    """形態學閉合（先膨脹後侵蝕，4-鄰域）：接回抗鋸齒造成的細縫，
    避免主體在 largest_component 被拆成多塊。"""
    cur = mask
    for _ in range(radius):
        cur = _dilate(cur, size)
    for _ in range(radius):
        cur = _erode(cur, size)
    return cur


def _dilate(mask, size):
    out = list(mask)
    for idx, v in enumerate(mask):
        if not v:
            continue
        y, x = divmod(idx, size)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < size and 0 <= ny < size:
                out[ny * size + nx] = True
    return out


def _erode(mask, size):
    out = list(mask)
    for idx in range(len(mask)):
        y, x = divmod(idx, size)
        if not mask[idx]:
            continue
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= nx < size and 0 <= ny < size) or not mask[ny * size + nx]:
                out[idx] = False
                break
    return out


def largest_component(mask, size):
    """只留最大 4-連通塊；回傳 (濾後遮罩, 被丟棄的前景比例)。
    bbox 是極值統計，一顆雜訊格就會把 bbox 拉到畫面邊緣，故必須先濾。"""
    seen = [False] * len(mask)
    best = []
    total = sum(mask)
    for start in range(len(mask)):
        if not mask[start] or seen[start]:
            continue
        stack = [start]
        seen[start] = True
        blob = []
        while stack:
            idx = stack.pop()
            blob.append(idx)
            y, x = divmod(idx, size)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < size and 0 <= ny < size:
                    n = ny * size + nx
                    if mask[n] and not seen[n]:
                        seen[n] = True
                        stack.append(n)
        if len(blob) > len(best):
            best = blob
    filtered = [False] * len(mask)
    for idx in best:
        filtered[idx] = True
    discarded = (total - len(best)) / total if total else 0.0
    return filtered, discarded


def load_mask(path, size=MASK_GRID):
    """PNG → (size² 前景遮罩（最大連通塊）, 警告)。"""
    w, h, pixels = read_png_rgba(path)
    mask, warnings = foreground_mask(w, h, pixels)
    resized = []
    for y in range(size):
        sy = min(h - 1, y * h // size)
        for x in range(size):
            sx = min(w - 1, x * w // size)
            resized.append(mask[sy * w + sx])
    filtered, discarded = largest_component(close_mask(resized, size), size)
    if discarded > 0.02:
        warnings = list(warnings) + [
            f"{discarded:.1%} 前景格不在最大連通塊內，未被量測；"
            "若主體投影下真有分離部件，它們不在 bbox 裡"]
    return filtered, warnings


def mask_is_inverted(warnings):
    return any("tiny" in str(w).lower() for w in warnings)


def bbox_of(mask, size):
    xs, ys = [], []
    for idx, v in enumerate(mask):
        if v:
            xs.append(idx % size)
            ys.append(idx // size)
    if not xs:
        return (0, 0, 0, 0)
    return (min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)


def aligned_shape(mask, size, bbox, out=ALIGN_SIZE):
    """把 bbox 區域最近鄰重採樣到 out² 格網 → 取景無關的形狀表示。"""
    x0, y0, bw, bh = bbox
    if bw <= 0 or bh <= 0:
        return [False] * (out * out)
    shape = []
    for j in range(out):
        sy = y0 + min(bh - 1, j * bh // out)
        for i in range(out):
            sx = x0 + min(bw - 1, i * bw // out)
            shape.append(mask[sy * size + sx])
    return shape


def silhouette_iou(a, b):
    inter = union = 0
    for x, y in zip(a, b):
        if x or y:
            union += 1
            if x and y:
                inter += 1
    return inter / union if union else 0.0


def symmetry_error(mask, size):
    mismatch = total = 0
    for y in range(size):
        row = y * size
        for x in range(size):
            total += 1
            if mask[row + x] != mask[row + size - 1 - x]:
                mismatch += 1
    return mismatch / total if total else 0.0


def aspect_delta(bbox_ref, bbox_ren):
    _x, _y, rw, rh = bbox_ref
    _u, _v, dw, dh = bbox_ren
    ar_ref = rw / rh if rh else 0.0
    ar_ren = dw / dh if dh else 0.0
    if not ar_ref:
        return 0.0 if not ar_ren else 1.0
    return abs(ar_ref - ar_ren) / ar_ref


def luma_grid(w, h, pixels, bbox_px, size):
    """把像素座標 bbox 區域的 Rec.709 luma 盒平均降採樣到 size²（0..1 平坦列表）。"""
    x0, y0, bw, bh = bbox_px
    bw, bh = max(1, bw), max(1, bh)
    acc = [0.0] * (size * size)
    cnt = [0] * (size * size)
    for y in range(y0, min(h, y0 + bh)):
        cy = min(size - 1, (y - y0) * size // bh) * size
        row = y * w
        for x in range(x0, min(w, x0 + bw)):
            r, g, b, _a = pixels[row + x]
            cell = cy + min(size - 1, (x - x0) * size // bw)
            acc[cell] += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
            cnt[cell] += 1
    return [acc[i] / cnt[i] if cnt[i] else 0.0 for i in range(size * size)]


_DCT_CACHE = {}


def _dct_matrix(n):
    if n not in _DCT_CACHE:
        f = math.pi / (2.0 * n)
        _DCT_CACHE[n] = [
            [(math.sqrt(1.0 / n) if k == 0 else math.sqrt(2.0 / n))
             * math.cos((2 * i + 1) * k * f) for i in range(n)]
            for k in range(n)]
    return _DCT_CACHE[n]


def phash64(luma, size=32, hash_size=8):
    """經典 pHash：32² luma → 2D DCT-II → 左上 8×8 低頻（去 DC 中位數比較）→ 64-bit。"""
    m = _dct_matrix(size)
    g = [luma[i * size:(i + 1) * size] for i in range(size)]
    temp = [[sum(m[k][i] * g[i][j] for i in range(size)) for j in range(size)]
            for k in range(hash_size)]
    low = [sum(temp[k][j] * m[l][j] for j in range(size))
           for k in range(hash_size) for l in range(hash_size)]
    ac = sorted(abs(v) for v in low[1:])
    mid = len(ac) // 2
    median = ac[mid] if len(ac) % 2 else 0.5 * (ac[mid - 1] + ac[mid])
    bits = 0
    for v in low:
        bits = (bits << 1) | (1 if abs(v) > median else 0)
    return bits


def phash_similarity(a, b, bits=64):
    return 1.0 - bin(a ^ b).count("1") / bits


def _mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def global_ssim(a, b):
    """整張降採樣 luma 圖的單窗 SSIM（結構訊號）。"""
    n = len(a)
    if n == 0 or len(b) != n:
        return 0.0
    mu_a, mu_b = _mean(a), _mean(b)
    var_a = _mean([(x - mu_a) ** 2 for x in a])
    var_b = _mean([(x - mu_b) ** 2 for x in b])
    cov = _mean([(a[i] - mu_a) * (b[i] - mu_b) for i in range(n)])
    c1, c2 = 0.01 ** 2, 0.03 ** 2
    s = ((2 * mu_a * mu_b + c1) * (2 * cov + c2)) / (
        (mu_a ** 2 + mu_b ** 2 + c1) * (var_a + var_b + c2))
    return max(0.0, min(1.0, s))


def _sobel_edges(luma, size, thresh=0.12):
    edges = [False] * (size * size)
    for y in range(1, size - 1):
        for x in range(1, size - 1):
            def g(dx, dy):
                return luma[(y + dy) * size + (x + dx)]
            gx = (g(-1, -1) + 2 * g(-1, 0) + g(-1, 1)) - (g(1, -1) + 2 * g(1, 0) + g(1, 1))
            gy = (g(-1, -1) + 2 * g(0, -1) + g(1, -1)) - (g(-1, 1) + 2 * g(0, 1) + g(1, 1))
            if math.hypot(gx, gy) > thresh:
                edges[y * size + x] = True
    return edges


def edge_overlap(a, b, size):
    ea, eb = _sobel_edges(a, size), _sobel_edges(b, size)
    inter = union = 0
    for x, y in zip(ea, eb):
        if x or y:
            union += 1
            if x and y:
                inter += 1
    return inter / union if union else 1.0


def tonal_parity(a, b, bins=16):
    def hist(xs):
        h = [0] * bins
        for v in xs:
            h[min(bins - 1, int(v * bins))] += 1
        tot = sum(h) or 1
        return [c / tot for c in h]
    ha, hb = hist(a), hist(b)
    return max(0.0, 1.0 - sum(abs(ha[i] - hb[i]) for i in range(bins)) / 2.0)


def _grid_bbox_to_px(bbox, size, w, h):
    x0, y0, bw, bh = bbox
    px0 = x0 * w // size
    py0 = y0 * h // size
    px1 = min(w, (x0 + bw) * w // size + 1)
    py1 = min(h, (y0 + bh) * h // size + 1)
    return (px0, py0, max(1, px1 - px0), max(1, py1 - py0))


def parse_region(value):
    """argparse type：解析並驗證 bbox 內的分數矩形 x,y,w,h。"""
    try:
        parts = [float(part) for part in value.split(",")]
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "region 必須是四個逗號分隔的 0..1 分數：x,y,w,h") from exc
    if len(parts) != 4:
        raise argparse.ArgumentTypeError(
            "region 必須是四個逗號分隔的 0..1 分數：x,y,w,h")
    x, y, width, height = parts
    if not all(math.isfinite(v) and 0.0 <= v <= 1.0 for v in parts):
        raise argparse.ArgumentTypeError("region 的 x,y,w,h 都必須在 0..1")
    if width <= 0.0 or height <= 0.0:
        raise argparse.ArgumentTypeError("region 的 w 與 h 必須大於 0")
    if x + width > 1.0 or y + height > 1.0:
        raise argparse.ArgumentTypeError(
            "region 必須位於前景 bbox 內（x + w <= 1 且 y + h <= 1）")
    return tuple(parts)


def region_bbox(bbox, region):
    """把 bbox 內的分數 region 轉成涵蓋該區域的整數座標 bbox。"""
    x0, y0, width, height = bbox
    x, y, region_width, region_height = region
    left = x0 + math.floor(x * width)
    top = y0 + math.floor(y * height)
    right = x0 + math.ceil((x + region_width) * width)
    bottom = y0 + math.ceil((y + region_height) * height)
    return (left, top, max(1, right - left), max(1, bottom - top))


def evaluate(reference_png, render_png, region=None):
    """跑所有確定性訊號並合成 verdict + 路由動作。"""
    ref_mask, ref_warn = load_mask(reference_png)
    ren_mask, ren_warn = load_mask(render_png)
    ref_bbox = bbox_of(ref_mask, MASK_GRID)
    ren_bbox = bbox_of(ren_mask, MASK_GRID)
    ref_full_bbox = ref_bbox
    ren_full_bbox = ren_bbox
    if region is not None:
        ref_bbox = region_bbox(ref_bbox, region)
        ren_bbox = region_bbox(ren_bbox, region)
    ref_shape = aligned_shape(ref_mask, MASK_GRID, ref_bbox)
    ren_shape = aligned_shape(ren_mask, MASK_GRID, ren_bbox)

    iou = silhouette_iou(ref_shape, ren_shape)
    aspect = aspect_delta(ref_bbox, ren_bbox)
    sym = max(0.0, 1.0 - abs(symmetry_error(ren_shape, ALIGN_SIZE)
                             - symmetry_error(ref_shape, ALIGN_SIZE)) / 0.10)

    rw, rh, rpx = read_png_rgba(reference_png)
    vw, vh, vpx = read_png_rgba(render_png)
    ref_px_bbox = _grid_bbox_to_px(ref_full_bbox, MASK_GRID, rw, rh)
    ren_px_bbox = _grid_bbox_to_px(ren_full_bbox, MASK_GRID, vw, vh)
    if region is not None:
        ref_px_bbox = region_bbox(ref_px_bbox, region)
        ren_px_bbox = region_bbox(ren_px_bbox, region)
    ref_luma = luma_grid(rw, rh, rpx, ref_px_bbox, LUMA_SIZE)
    ren_luma = luma_grid(vw, vh, vpx, ren_px_bbox, LUMA_SIZE)
    ref_edge = luma_grid(rw, rh, rpx, ref_px_bbox, EDGE_SIZE)
    ren_edge = luma_grid(vw, vh, vpx, ren_px_bbox, EDGE_SIZE)
    phash_sim = phash_similarity(
        phash64(luma_grid(rw, rh, rpx, ref_px_bbox, 32)),
        phash64(luma_grid(vw, vh, vpx, ren_px_bbox, 32)))
    ssim = global_ssim(ref_luma, ren_luma)
    edges = edge_overlap(ref_edge, ren_edge, EDGE_SIZE)
    tonal = tonal_parity(ref_luma, ren_luma)

    hard_failures = []
    if mask_is_inverted(ref_warn) or mask_is_inverted(ren_warn):
        hard_failures.append("前景遮罩退化為全圖；輪廓與比例訊號量的不是主體")
    if iou < IOU_HARD_MIN:
        hard_failures.append(f"bbox 對齊 silhouette IoU {iou:.3f} < {IOU_HARD_MIN}")

    soft = {
        "proportion": (max(0.0, 1.0 - aspect / ASPECT_SOFT_SCALE), 1.0),
        "symmetry": (sym, 0.5),
        "phash": (phash_sim, 1.0),
        "ssim": (ssim, 1.5),
        "edgeOverlap": (edges, 1.0),
        "tonalParity": (tonal, 1.0),
    }
    weighted = sum(s * w for s, w in soft.values())
    total_w = sum(w for _s, w in soft.values())
    fidelity = weighted / total_w if total_w else 0.0
    scores = [s for s, _w in soft.values()]
    spread = max(scores) - min(scores) if scores else 0.0

    if hard_failures:
        verdict, action = "reject", "refine-code"
    elif spread > DISAGREEMENT_SPREAD and fidelity < FIDELITY_TARGET:
        verdict, action = "low-confidence", "probe"
    elif fidelity >= FIDELITY_TARGET:
        verdict, action = "pass", "continue"
    else:
        verdict, action = "reject", "refine-code"

    result = {
        "verdict": verdict,
        "action": action,
        "fidelity": round(fidelity, 4),
        "fidelityTarget": FIDELITY_TARGET,
        "hardGateFailures": hard_failures,
        "maskWarnings": [f"reference: {w}" for w in ref_warn]
                        + [f"render: {w}" for w in ren_warn],
        "disagreementSpread": round(spread, 4),
        "signals": {
            "silhouetteIoU": round(iou, 4),
            "aspectRatioDelta": round(aspect, 4),
            "symmetryParity": round(sym, 4),
            "phashSimilarity": round(phash_sim, 4),
            "ssim": round(ssim, 4),
            "edgeOverlap": round(edges, 4),
            "tonalParity": round(tonal, 4),
        },
        "weights": {k: w for k, (_s, w) in soft.items()},
        "reference": reference_png,
        "render": render_png,
    }
    if region is not None:
        result["region"] = list(region)
    return result


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--reference", required=True)
    ap.add_argument("--render", required=True)
    ap.add_argument("--region", type=parse_region,
                    help="前景 bbox 內的分數矩形 x,y,w,h（各值 0..1）")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    try:
        result = evaluate(args.reference, args.render, region=args.region)
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"{result['verdict'].upper()} → {result['action']}  "
              f"fidelity={result['fidelity']}（目標 {result['fidelityTarget']}）")
        for f in result["hardGateFailures"]:
            print(f"  HARD: {f}")
    return 0 if result["verdict"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
