# yui R6 計畫 A：參考圖前處理、使用者目視關卡與 fal.ai 付費生成

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 yui 的上半身三視圖切開、延伸成全身、通過臉部漂移 gate 與使用者目視關卡後，用 fal.ai 的 Tripo 與 Rodin 各生成一個基底 GLB，產出候選比較讓使用者選定。

**Architecture:** 全部前處理是 Python 3.11 stdlib 腳本，放在 `pipeline/forge/stage1_intake/`，共用一個新的 `_shared/png.py` 讀寫 RGBA PNG。付費生成是 `pipeline/integrations/mesh3d/fal_generate.py`，以可注入的 `urllib` opener 呼叫 fal 佇列 API，金鑰只在記憶體。每步產物落在 `.img2babylon/female-tactical/generative/`（gitignored）與 `viewer/models/female-tactical/round6/`（版控證據）。計畫 B（GLB 匯入與貼圖）與計畫 C（骨架動作與物理）在本計畫的 `selected.json` 產生後另寫。

**Tech Stack:** Python 3.11 stdlib（`urllib`、`zlib`、`struct`、`json`、`hashlib`、`unittest`）；tomato 影像服務（`https://tomato.tail8e3f79.ts.net/image`）；fal.ai 佇列 API（`https://queue.fal.run/<endpoint>`）；viewer 的 `window.__IMG2BABYLON_CAPTURE__.setReferenceMode` 與 playwright MCP 截圖。

**Spec:** `docs/superpowers/specs/2026-09-14-yui-generative-assist-design.md`（§2、§3、§9、§10）

## Global Constraints

- `forge/` 與 `pipeline/forge/` 只准 Python stdlib，零第三方依賴（CLAUDE.md、SKILL.md）。
- 金鑰只從 `.env` 的 `FAL_API_KEY` 或環境變數讀取；任何輸出、日誌、JSON、例外訊息都不得含金鑰（spec §3）。
- 付費呼叫需 `--confirm-paid`；同一輸入雜湊已有輸出時拒絕重跑，除非 `--force`（spec §3）。本輪預算：Tripo 一次、Rodin 一次。
- 全身延伸圖與候選比較圖都必須先交給使用者看過並明確同意，才能進下一步（spec §2 第 5 點、§3 選型）。
- 臉部漂移門檻：頭部區 Divine Eye IoU ≥ 0.92 且原始胸像區平均色差 ≤ 6/255，任一視角失敗即漂移（spec §2 第 3 點）。
- 修正次數由 `pipeline/forge/babylon.py` 的 workflow 管理，每輪最多 6 次；tomato 重跑延伸不計修正次數。
- 測試執行方式：`cd pipeline && python3.11 -m unittest forge.tests.<module>`；根目錄 `python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'` 不得變紅。
- tomato edit 模式輸出等於來源尺寸（16 的倍數、長邊 ≤ 2048），所以延伸靠事先把胸像貼到白底高畫布。
- 參考圖 `viewer/models/female-tactical/reference/female_reference.png` 是 2172×724 RGBA、透明背景；三個人像的欄範圍實測為 113–675（左側視）、701–1474（正面）、1497–2061（右側視）。

---

### Task 1: 開第 6 輪並建立證據目錄

**Files:**
- Modify: `.img2babylon/female-tactical/pipeline/workflow.json`（由工具改）
- Create: `viewer/models/female-tactical/round6/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `round6/` 目錄（後續 Task 的證據都放 `round6/c0/`，c0 表示「本輪準備期、未計修正」）；`viewer/public/generative` 符號連結指向 `.img2babylon/female-tactical/generative`。

- [ ] **Step 1: 確認目前狀態是第 5 輪 4/6**

Run: `python3.11 pipeline/forge/babylon.py next --state $PWD/.img2babylon/female-tactical/pipeline/workflow.json`
Expected: 第一行含 `round=5 corrections=4/6`。

- [ ] **Step 2: 開第 6 輪（會快照第 5 輪模型目錄與 viewer/src）**

Run:
```bash
python3.11 pipeline/forge/babylon.py round \
  --state $PWD/.img2babylon/female-tactical/pipeline/workflow.json \
  --model-dir $PWD/viewer/models/female-tactical \
  --reason "R6 generative-assist head/body, textures, SOMA rig, light physics"
python3.11 pipeline/forge/babylon.py next --state $PWD/.img2babylon/female-tactical/pipeline/workflow.json
```
Expected: 第二個命令印出 `round=6 corrections=0/6`；`.img2babylon/female-tactical/pipeline/rounds/round-005/model/spec.json` 存在。

- [ ] **Step 3: 建立目錄、符號連結與 gitignore**

```bash
mkdir -p viewer/models/female-tactical/round6/c0 .img2babylon/female-tactical/generative
ln -s ../../.img2babylon/female-tactical/generative viewer/public/generative
printf '\n# yui R6 generative candidates are served to the dev server through a symlink; never committed\nviewer/public/generative\n' >> .gitignore
```

寫 `viewer/models/female-tactical/round6/README.md`：
```markdown
# yui 第 6 輪：generative-assist

設計：`docs/superpowers/specs/2026-09-14-yui-generative-assist-design.md`。
`c0/` 是準備期證據（切圖、延伸、漂移 gate、候選比較），不計修正次數。
`cN/`（N ≥ 1）是計次修正，每次含 author.py、rebuild.sh、changes.json、strict.json、visibility.json、physics.json 與固定視角 PNG。
生成 GLB 與貼圖原檔在 `.img2babylon/female-tactical/generative/`，只有 provenance 雜湊進版控。
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore viewer/models/female-tactical/round6/README.md
git commit -m "chore(yui): open round 6 evidence directory"
```

---

### Task 2: 共用 RGBA PNG 讀寫（`_shared/png.py`）

**Files:**
- Create: `pipeline/forge/_shared/png.py`
- Test: `pipeline/forge/tests/test_png_io.py`

**Interfaces:**
- Produces:
  - `read_rgba(path: Path) -> tuple[int, int, bytearray]`：回傳 `(w, h, rgba)`，rgba 長度 `w*h*4`；RGB 來源補 alpha 255；只支援 8-bit、無 interlace，其餘 `ValueError`。
  - `write_rgba(path: Path, w: int, h: int, rgba: bytes) -> None`：寫 colortype 6。
  - `write_rgb(path: Path, w: int, h: int, rgb: bytes) -> None`：寫 colortype 2。
  - `composite_on_white(w, h, rgba) -> bytes`：回傳 RGB，alpha 線性混白。
  - `scale_nearest(w, h, rgb, new_w, new_h) -> bytes`：最近鄰縮放 RGB。
  - `blit(dst_w, dst_h, dst_rgb: bytearray, src_w, src_h, src_rgb, x, y) -> None`：把 RGB 貼到目標。

- [ ] **Step 1: 寫失敗測試**

`pipeline/forge/tests/test_png_io.py`:
```python
"""RGBA PNG round trip and compositing, stdlib only."""
from __future__ import annotations
import tempfile, unittest
from pathlib import Path
from forge._shared.png import read_rgba, write_rgba, write_rgb, composite_on_white, scale_nearest, blit


class PngIo(unittest.TestCase):
    def test_rgba_round_trip(self):
        w, h = 3, 2
        rgba = bytes([10, 20, 30, 255, 40, 50, 60, 0, 70, 80, 90, 128] * 2)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'a.png'
            write_rgba(p, w, h, rgba)
            rw, rh, back = read_rgba(p)
        self.assertEqual((rw, rh), (w, h))
        self.assertEqual(bytes(back), rgba)

    def test_rgb_reads_back_with_opaque_alpha(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'b.png'
            write_rgb(p, 2, 1, bytes([1, 2, 3, 4, 5, 6]))
            _w, _h, back = read_rgba(p)
        self.assertEqual(bytes(back), bytes([1, 2, 3, 255, 4, 5, 6, 255]))

    def test_composite_on_white_blends_alpha(self):
        rgb = composite_on_white(2, 1, bytes([0, 0, 0, 255, 0, 0, 0, 0]))
        self.assertEqual(bytes(rgb), bytes([0, 0, 0, 255, 255, 255]))

    def test_scale_and_blit(self):
        small = bytes([9, 9, 9, 1, 1, 1])  # 2x1
        big = scale_nearest(2, 1, small, 4, 2)
        self.assertEqual(len(big), 4 * 2 * 3)
        self.assertEqual(bytes(big[:6]), bytes([9, 9, 9, 9, 9, 9]))
        dst = bytearray(b'\xff' * (4 * 2 * 3))
        blit(4, 2, dst, 2, 1, small, 1, 1)
        self.assertEqual(bytes(dst[(1 * 4 + 1) * 3:(1 * 4 + 3) * 3]), small)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_png_io`
Expected: `ModuleNotFoundError: No module named 'forge._shared.png'`

- [ ] **Step 3: 實作**

`pipeline/forge/_shared/png.py`:
```python
"""Minimal 8-bit RGB/RGBA PNG reader/writer plus compositing helpers. Stdlib only.

The repository already decodes PNG in forge/divine_eye.py and forge/compare.py (root tools) but
pipeline/forge must not import root forge; this module is the pipeline-side equivalent and
keeps alpha, which the yui three-view reference relies on (transparent background).
"""
from __future__ import annotations
import struct, zlib
from pathlib import Path

SIG = b"\x89PNG\r\n\x1a\n"


def _unfilter(raw: bytes, w: int, h: int, ch: int) -> list[bytearray]:
    stride = w * ch; prev = bytearray(stride); rows = []; pos = 0
    for _ in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f == 1:
            for i in range(ch, stride): line[i] = (line[i] + line[i - ch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0; b = prev[i]; c = prev[i - ch] if i >= ch else 0
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        elif f != 0:
            raise ValueError(f"unsupported PNG filter {f}")
        rows.append(line); prev = line
    return rows


def read_rgba(path: Path) -> tuple[int, int, bytearray]:
    data = Path(path).read_bytes()
    if data[:8] != SIG: raise ValueError(f"{path} is not a PNG")
    pos = 8; w = h = 0; ct = -1; idat = b""
    while pos < len(data):
        ln, typ = struct.unpack(">I4s", data[pos:pos + 8]); pos += 8
        chunk = data[pos:pos + ln]; pos += ln + 4
        if typ == b"IHDR":
            w, h, bd, ct, _comp, _filt, interlace = struct.unpack(">IIBBBBB", chunk[:13])
            if bd != 8 or ct not in (2, 6) or interlace != 0:
                raise ValueError("only 8-bit RGB/RGBA non-interlaced PNG is supported")
        elif typ == b"IDAT": idat += chunk
        elif typ == b"IEND": break
    ch = 3 if ct == 2 else 4
    rows = _unfilter(zlib.decompress(idat), w, h, ch)
    out = bytearray(w * h * 4)
    for y, line in enumerate(rows):
        if ch == 4: out[y * w * 4:(y + 1) * w * 4] = line
        else:
            for x in range(w):
                out[(y * w + x) * 4:(y * w + x) * 4 + 3] = line[x * 3:x * 3 + 3]; out[(y * w + x) * 4 + 3] = 255
    return w, h, out


def _write(path: Path, w: int, h: int, pixels: bytes, ch: int, ct: int) -> None:
    def chunk(typ: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + typ + payload + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)
    if len(pixels) != w * h * ch: raise ValueError("pixel buffer size mismatch")
    raw = b"".join(b"\x00" + bytes(pixels[y * w * ch:(y + 1) * w * ch]) for y in range(h))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(SIG + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, ct, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def write_rgba(path: Path, w: int, h: int, rgba: bytes) -> None: _write(path, w, h, rgba, 4, 6)
def write_rgb(path: Path, w: int, h: int, rgb: bytes) -> None: _write(path, w, h, rgb, 3, 2)


def composite_on_white(w: int, h: int, rgba: bytes) -> bytes:
    out = bytearray(w * h * 3)
    for i in range(w * h):
        a = rgba[i * 4 + 3]
        for c in range(3):
            out[i * 3 + c] = (rgba[i * 4 + c] * a + 255 * (255 - a)) // 255
    return bytes(out)


def scale_nearest(w: int, h: int, rgb: bytes, new_w: int, new_h: int) -> bytes:
    out = bytearray(new_w * new_h * 3)
    for y in range(new_h):
        sy = min(h - 1, y * h // new_h)
        for x in range(new_w):
            sx = min(w - 1, x * w // new_w)
            out[(y * new_w + x) * 3:(y * new_w + x) * 3 + 3] = rgb[(sy * w + sx) * 3:(sy * w + sx) * 3 + 3]
    return bytes(out)


def blit(dst_w: int, dst_h: int, dst_rgb: bytearray, src_w: int, src_h: int, src_rgb: bytes, x: int, y: int) -> None:
    for row in range(src_h):
        dy = y + row
        if dy < 0 or dy >= dst_h: continue
        x0 = max(0, x); x1 = min(dst_w, x + src_w)
        if x1 <= x0: continue
        dst_rgb[(dy * dst_w + x0) * 3:(dy * dst_w + x1) * 3] = src_rgb[(row * src_w + (x0 - x)) * 3:(row * src_w + (x1 - x)) * 3]
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_png_io`
Expected: `OK`（4 tests）

- [ ] **Step 5: Commit**

```bash
git add pipeline/forge/_shared/png.py pipeline/forge/tests/test_png_io.py
git commit -m "feat(pipeline): stdlib RGBA PNG io and compositing helpers"
```

---

### Task 3: 三視圖切割與全身畫布（`split_views.py`）

**Files:**
- Create: `pipeline/forge/stage1_intake/split_views.py`
- Test: `pipeline/forge/tests/test_split_views.py`

**Interfaces:**
- Consumes: Task 2 的 `read_rgba`、`write_rgb`、`composite_on_white`、`blit`。
- Produces:
  - `find_view_columns(w, h, rgba, alpha_threshold=8, min_gap=3) -> list[tuple[int, int]]`：依 alpha 找前景欄區段 `[x0, x1]`（含），忽略寬度 ≤ 20 的碎片。
  - `split_views(src: Path, out_dir: Path, roles=("left","front","right")) -> dict`：切出 `out_dir/<role>.png`（RGB、白底、貼緊前景 bbox、四周 24 px 白邊），回傳並寫 `out_dir/views.json`：
    `{"source": str, "sourceSha256": str, "views": [{"role","file","box":[x0,y0,x1,y1],"width","height"}]}`。
  - `pad_for_full_body(view_png: Path, out_png: Path, canvas=(1024, 2016), top_margin=32) -> dict`：把胸像置中貼到白底畫布頂部，回傳 `{"bustBox":[x,y,w,h],"canvas":[1024,2016]}`；胸像寬度 > 1024−64 時等比縮到 960 寬。
  - CLI：`python3.11 pipeline/forge/stage1_intake/split_views.py SRC --out-dir DIR [--pad]`，`--pad` 同時輸出 `DIR/padded/<role>.png` 與把 `bustBox` 寫回 views.json 各 view。

- [ ] **Step 1: 寫失敗測試**

`pipeline/forge/tests/test_split_views.py`:
```python
"""Three-view split is driven by alpha, never by fixed thirds."""
from __future__ import annotations
import json, tempfile, unittest
from pathlib import Path
from forge._shared.png import write_rgba, read_rgba
from forge.stage1_intake.split_views import find_view_columns, split_views, pad_for_full_body


def synthetic_three_view(path: Path, w=300, h=100):
    rgba = bytearray(w * h * 4)  # transparent
    for x0, x1 in ((10, 80), (110, 190), (220, 290)):
        for y in range(20, 90):
            for x in range(x0, x1 + 1):
                i = (y * w + x) * 4; rgba[i:i + 4] = bytes([200, 30, 30, 255])
    write_rgba(path, w, h, bytes(rgba))


class SplitViews(unittest.TestCase):
    def test_find_columns_ignores_transparent_gaps(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; synthetic_three_view(p)
            w, h, rgba = read_rgba(p)
        self.assertEqual(find_view_columns(w, h, rgba), [(10, 80), (110, 190), (220, 290)])

    def test_split_writes_three_white_backed_views(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; synthetic_three_view(p)
            out = Path(d) / 'views'
            meta = split_views(p, out)
            self.assertEqual([v['role'] for v in meta['views']], ['left', 'front', 'right'])
            self.assertEqual(meta['views'][1]['box'], [110, 20, 190, 89])
            w, h, rgba = read_rgba(out / 'front.png')
            self.assertEqual((w, h), (81 + 48, 70 + 48))
            self.assertEqual(bytes(rgba[:4]), bytes([255, 255, 255, 255]))  # white margin, opaque
            self.assertTrue((out / 'views.json').is_file())
            self.assertEqual(json.loads((out / 'views.json').read_text())['views'][0]['file'], 'left.png')

    def test_pad_places_bust_at_top_centre(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'ref.png'; synthetic_three_view(p)
            out = Path(d) / 'views'; split_views(p, out)
            info = pad_for_full_body(out / 'front.png', out / 'padded' / 'front.png', canvas=(256, 512), top_margin=8)
            self.assertEqual(info['canvas'], [256, 512])
            x, y, bw, bh = info['bustBox']
            self.assertEqual((y, bw, bh), (8, 129, 118))
            self.assertEqual(x, (256 - 129) // 2)
            w, h, rgba = read_rgba(out / 'padded' / 'front.png')
            self.assertEqual((w, h), (256, 512))
            self.assertEqual(bytes(rgba[((511 * 256) + 128) * 4:((511 * 256) + 128) * 4 + 3]), b'\xff\xff\xff')


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_split_views`
Expected: `ModuleNotFoundError: No module named 'forge.stage1_intake.split_views'`

- [ ] **Step 3: 實作**

`pipeline/forge/stage1_intake/split_views.py`:
```python
#!/usr/bin/env python3
"""Split a transparent-background multi-view reference into per-view white-backed PNGs.

Column gaps are found on the alpha channel, never assumed to be fixed thirds: the yui reference is
2172x724 with figures at columns 113-675 / 701-1474 / 1497-2061, and jackets touch the bottom edge,
so an RGB-threshold scan finds no gap at all. `--pad` places each bust on a tall white canvas so the
tomato edit route (output = input size) can extend the body downward.
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _shared.png import read_rgba, write_rgb, composite_on_white, scale_nearest, blit  # noqa: E402

MARGIN = 24


def find_view_columns(w: int, h: int, rgba: bytes, alpha_threshold: int = 8, min_gap: int = 3) -> list[tuple[int, int]]:
    occupied = [False] * w
    for y in range(h):
        base = y * w * 4 + 3
        for x in range(w):
            if not occupied[x] and rgba[base + x * 4] > alpha_threshold: occupied[x] = True
    runs: list[list[int]] = []; gap = 0
    for x, on in enumerate(occupied):
        if on:
            if runs and gap < min_gap: runs[-1][1] = x
            else: runs.append([x, x])
            gap = 0
        else: gap += 1
    return [(a, b) for a, b in runs if b - a > 20]


def _row_extent(w: int, h: int, rgba: bytes, x0: int, x1: int, alpha_threshold: int = 8) -> tuple[int, int]:
    top = bottom = -1
    for y in range(h):
        base = y * w * 4 + 3
        if any(rgba[base + x * 4] > alpha_threshold for x in range(x0, x1 + 1)):
            if top < 0: top = y
            bottom = y
    return top, bottom


def split_views(src: Path, out_dir: Path, roles: tuple[str, ...] = ("left", "front", "right")) -> dict:
    w, h, rgba = read_rgba(src)
    cols = find_view_columns(w, h, rgba)
    if len(cols) != len(roles): raise ValueError(f"expected {len(roles)} views, found {len(cols)} column runs: {cols}")
    rgb = composite_on_white(w, h, rgba)
    out_dir.mkdir(parents=True, exist_ok=True); views = []
    for role, (x0, x1) in zip(roles, cols):
        y0, y1 = _row_extent(w, h, rgba, x0, x1)
        cw, chh = x1 - x0 + 1 + 2 * MARGIN, y1 - y0 + 1 + 2 * MARGIN
        canvas = bytearray(b"\xff" * (cw * chh * 3))
        crop = bytearray()
        for y in range(y0, y1 + 1): crop += rgb[(y * w + x0) * 3:(y * w + x1 + 1) * 3]
        blit(cw, chh, canvas, x1 - x0 + 1, y1 - y0 + 1, bytes(crop), MARGIN, MARGIN)
        write_rgb(out_dir / f"{role}.png", cw, chh, bytes(canvas))
        views.append({"role": role, "file": f"{role}.png", "box": [x0, y0, x1, y1], "width": cw, "height": chh})
    meta = {"source": str(src), "sourceSha256": hashlib.sha256(Path(src).read_bytes()).hexdigest(), "views": views}
    (out_dir / "views.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    return meta


def pad_for_full_body(view_png: Path, out_png: Path, canvas: tuple[int, int] = (1024, 2016), top_margin: int = 32) -> dict:
    w, h, rgba = read_rgba(view_png); rgb = composite_on_white(w, h, rgba)
    cw, ch = canvas; max_w = cw - 64
    if w > max_w:
        nh = max(1, h * max_w // w); rgb = scale_nearest(w, h, rgb, max_w, nh); w, h = max_w, nh
    if top_margin + h > ch: raise ValueError("bust taller than canvas; choose a taller canvas")
    board = bytearray(b"\xff" * (cw * ch * 3)); x = (cw - w) // 2
    blit(cw, ch, board, w, h, rgb, x, top_margin)
    write_rgb(out_png, cw, ch, bytes(board))
    return {"bustBox": [x, top_margin, w, h], "canvas": [cw, ch]}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path); ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--pad", action="store_true"); ap.add_argument("--canvas", default="1024x2016")
    a = ap.parse_args(argv)
    meta = split_views(a.src, a.out_dir)
    if a.pad:
        cw, ch = (int(v) for v in a.canvas.lower().split("x"))
        for v in meta["views"]:
            v.update(pad_for_full_body(a.out_dir / v["file"], a.out_dir / "padded" / v["file"], canvas=(cw, ch)))
            v["padded"] = f"padded/{v['file']}"
        (a.out_dir / "views.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"views": [(v["role"], v["box"]) for v in meta["views"]]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_split_views`
Expected: `OK`（3 tests）

- [ ] **Step 5: 對真實參考圖執行並目視**

Run:
```bash
python3.11 pipeline/forge/stage1_intake/split_views.py viewer/models/female-tactical/reference/female_reference.png \
  --out-dir .img2babylon/female-tactical/generative/views --pad
```
Expected: 印出三個 box，第一個 x0 為 113、第二個 701、第三個 1497（±2）。用 Read 工具開 `.img2babylon/female-tactical/generative/views/padded/front.png` 確認胸像在白底畫布頂部置中，下方留白。

- [ ] **Step 6: Commit**

```bash
git add pipeline/forge/stage1_intake/split_views.py pipeline/forge/tests/test_split_views.py
git commit -m "feat(pipeline): alpha-driven three-view split with full-body padding"
```

---

### Task 4: tomato 全身延伸（`extend_views.py`）

**Files:**
- Create: `pipeline/forge/stage1_intake/extend_views.py`
- Test: `pipeline/forge/tests/test_extend_views.py`

**Interfaces:**
- Consumes: Task 3 的 `views.json`（含 `padded` 與 `bustBox`）。
- Produces:
  - `EXTEND_PROMPT: str`（固定英文提示）。
  - `tomato_edit(image_png: Path, prompt: str, seed: int, opener, base: str) -> tuple[bytes, dict]`：POST `{base}/image` 帶 `{"prompt","image":<b64>,"seed"}`，503 依 `Retry-After` 重試最多 3 次，回傳 `(png_bytes, job_json)`。
  - `extend_views(views_dir: Path, out_dir: Path, seed: int, opener=None, base=DEFAULT_BASE) -> dict`：對每個 view 的 `padded` 圖跑一次，寫 `out_dir/<role>.png`，回傳並寫 `out_dir/extend.json`：`{"prompt","seed","base","views":[{"role","input","output","jobId","width","height","sha256"}]}`。
  - CLI：`python3.11 pipeline/forge/stage1_intake/extend_views.py --views DIR --out DIR --seed N`。

- [ ] **Step 1: 寫失敗測試**

`pipeline/forge/tests/test_extend_views.py`:
```python
"""tomato edit is exercised through an injected opener; no network in tests."""
from __future__ import annotations
import base64, io, json, tempfile, unittest, urllib.error
from pathlib import Path
from forge._shared.png import write_rgb
from forge.stage1_intake.extend_views import EXTEND_PROMPT, extend_views, tomato_edit


class FakeResponse(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


class FakeOpener:
    def __init__(self, png: bytes, busy_first=False):
        self.png = png; self.calls = []; self.busy_first = busy_first
    def open(self, req, timeout=0):
        url = req.full_url if hasattr(req, 'full_url') else req
        self.calls.append(url)
        if url.endswith('/image'):
            if self.busy_first:
                self.busy_first = False
                raise urllib.error.HTTPError(url, 503, 'busy', {'Retry-After': '0'}, None)
            body = json.loads(req.data.decode())
            assert body['prompt'] == EXTEND_PROMPT and base64.b64decode(body['image'])[:4] == b'\x89PNG'
            return FakeResponse(json.dumps({'job_id': 'job-1', 'status': 'done', 'mode': 'edit', 'width': 4, 'height': 8}).encode())
        if url.endswith('/assets/job-1'):
            return FakeResponse(self.png)
        raise AssertionError(url)


class ExtendViews(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); root = Path(self.tmp.name)
        self.views = root / 'views'; (self.views / 'padded').mkdir(parents=True)
        for role in ('left', 'front', 'right'):
            write_rgb(self.views / 'padded' / f'{role}.png', 4, 8, b'\xff' * (4 * 8 * 3))
        (self.views / 'views.json').write_text(json.dumps({'views': [
            {'role': r, 'file': f'{r}.png', 'padded': f'padded/{r}.png', 'bustBox': [0, 0, 4, 3]} for r in ('left', 'front', 'right')]}))
        buf = root / 'out.png'; write_rgb(buf, 4, 8, bytes([1, 2, 3]) * 32); self.png = buf.read_bytes()

    def tearDown(self): self.tmp.cleanup()

    def test_edit_retries_on_503(self):
        opener = FakeOpener(self.png, busy_first=True)
        png, job = tomato_edit(self.views / 'padded' / 'front.png', EXTEND_PROMPT, 7, opener, 'https://t')
        self.assertEqual(png, self.png); self.assertEqual(job['job_id'], 'job-1')
        self.assertEqual(opener.calls, ['https://t/image', 'https://t/image', 'https://t/assets/job-1'])

    def test_extend_writes_three_outputs_and_manifest(self):
        out = Path(self.tmp.name) / 'extended'
        meta = extend_views(self.views, out, seed=7, opener=FakeOpener(self.png), base='https://t')
        self.assertEqual([v['role'] for v in meta['views']], ['left', 'front', 'right'])
        self.assertEqual(meta['seed'], 7)
        self.assertTrue((out / 'front.png').read_bytes() == self.png)
        self.assertEqual(json.loads((out / 'extend.json').read_text())['views'][2]['jobId'], 'job-1')
        self.assertEqual(meta['views'][0]['bustBox'], [0, 0, 4, 3])


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_extend_views`
Expected: `ModuleNotFoundError: No module named 'forge.stage1_intake.extend_views'`

- [ ] **Step 3: 實作**

`pipeline/forge/stage1_intake/extend_views.py`:
```python
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

DEFAULT_BASE = os.environ.get("IMG2BABYLON_TOMATO_BASE", "https://tomato.tail8e3f79.ts.net")
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
                     "width": w, "height": h, "sha256": hashlib.sha256(png).hexdigest(), "bustBox": v.get("bustBox")})
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_extend_views`
Expected: `OK`（2 tests）

- [ ] **Step 5: 對真實圖執行（本機免費，約 1–3 分鐘）**

Run:
```bash
python3.11 pipeline/forge/stage1_intake/extend_views.py \
  --views .img2babylon/female-tactical/generative/views \
  --out .img2babylon/female-tactical/generative/extended --seed 913
```
Expected: 印出三個 view 各 1024×2016 與 jobId。用 Read 工具開三張 `extended/*.png`，記下第一印象（臉是否改變、下半身是否合理）。tomato 不可達時本步驟報錯，記錄到 `round6/c0/notes.md` 並停止，等使用者處理。

- [ ] **Step 6: Commit**

```bash
git add pipeline/forge/stage1_intake/extend_views.py pipeline/forge/tests/test_extend_views.py
git commit -m "feat(pipeline): tomato full-body extension for padded bust views"
```

---

### Task 5: 臉部漂移 gate（`face_drift_gate.py`）

**Files:**
- Create: `pipeline/forge/stage1_intake/face_drift_gate.py`
- Test: `pipeline/forge/tests/test_face_drift_gate.py`

**Interfaces:**
- Consumes: Task 4 的 `extend.json`（每 view 的 `input`、`output`、`bustBox`）；根目錄 `forge/divine_eye.py` 的 `evaluate(reference_png, render_png, region)`（region 為前景 bbox 內分數矩形 `(x,y,w,h)`，回傳 dict 含 `signals.silhouetteIoU` 或 `iou`，見實作註解）。
- Produces:
  - `bust_difference(input_png, output_png, bust_box) -> dict`：`{"meanAbsDiff": float(0..255), "fractionOver24": float}`，只比 bustBox 內像素。
  - `head_iou(input_png, output_png, bust_box) -> float`：把兩圖的頭部區（bustBox 上半 45%）各裁成暫存 PNG 後呼叫 divine_eye `evaluate`，取 IoU。
  - `run_gate(extend_json: Path, out_json: Path, iou_min=0.92, mean_max=6.0, frac_max=0.02) -> dict`：`{"pass": bool, "views":[{"role","headIoU","meanAbsDiff","fractionOver24","pass"}], "thresholds": {...}}`，寫 `out_json`。
  - CLI：`python3.11 pipeline/forge/stage1_intake/face_drift_gate.py --extend EXTEND_JSON --out OUT_JSON`，exit 0 通過、1 漂移。

- [ ] **Step 1: 寫失敗測試**

`pipeline/forge/tests/test_face_drift_gate.py`:
```python
"""Face drift: identical bust passes, a shifted or recoloured bust fails."""
from __future__ import annotations
import json, tempfile, unittest
from pathlib import Path
from forge._shared.png import write_rgb
from forge.stage1_intake.face_drift_gate import bust_difference, run_gate


def bust_image(path: Path, shift=0, tint=0, w=64, h=128):
    rgb = bytearray(b'\xff' * (w * h * 3))
    for y in range(8 + shift, 40 + shift):          # head blob
        for x in range(20, 44):
            i = (y * w + x) * 3; rgb[i:i + 3] = bytes([200 - tint, 150, 120])
    for y in range(40 + shift, 60 + shift):         # shoulders
        for x in range(8, 56):
            i = (y * w + x) * 3; rgb[i:i + 3] = bytes([20, 20, 20])
    write_rgb(path, w, h, bytes(rgb))


class FaceDrift(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
    def tearDown(self): self.tmp.cleanup()

    def manifest(self, out_png):
        m = self.root / 'extend.json'
        m.write_text(json.dumps({'views': [{'role': 'front', 'input': str(self.root / 'in.png'), 'output': str(out_png), 'bustBox': [0, 0, 64, 64]}]}))
        return m

    def test_identical_bust_passes(self):
        bust_image(self.root / 'in.png'); bust_image(self.root / 'out.png')
        d = bust_difference(self.root / 'in.png', self.root / 'out.png', [0, 0, 64, 64])
        self.assertEqual(d['meanAbsDiff'], 0.0); self.assertEqual(d['fractionOver24'], 0.0)
        r = run_gate(self.manifest(self.root / 'out.png'), self.root / 'gate.json')
        self.assertTrue(r['pass']); self.assertGreaterEqual(r['views'][0]['headIoU'], 0.92)

    def test_shifted_head_fails(self):
        bust_image(self.root / 'in.png'); bust_image(self.root / 'out.png', shift=12)
        r = run_gate(self.manifest(self.root / 'out.png'), self.root / 'gate.json')
        self.assertFalse(r['pass'])
        self.assertTrue((self.root / 'gate.json').is_file())

    def test_recoloured_face_fails_on_mean_diff(self):
        bust_image(self.root / 'in.png'); bust_image(self.root / 'out.png', tint=90)
        r = run_gate(self.manifest(self.root / 'out.png'), self.root / 'gate.json')
        self.assertFalse(r['views'][0]['pass']); self.assertGreater(r['views'][0]['meanAbsDiff'], 6.0)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_face_drift_gate`
Expected: `ModuleNotFoundError: No module named 'forge.stage1_intake.face_drift_gate'`

- [ ] **Step 3: 實作**

`pipeline/forge/stage1_intake/face_drift_gate.py`:
```python
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
```

`divine_eye.evaluate` 回傳 dict 的 `signals.silhouetteIoU` 就是 bbox 對齊後的輪廓 IoU（已在 `forge/divine_eye.py` 第 528 行附近確認）；`forge/divine_eye.py` 只 import stdlib，可直接以 sys.path 匯入。

- [ ] **Step 4: 跑測試確認通過**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_face_drift_gate`
Expected: `OK`（3 tests）。若 `test_identical_bust_passes` 因 divine_eye 對小圖遮罩退化而 IoU 偏低，把測試圖放大到 256×512（同比例）再跑，不要調門檻。

- [ ] **Step 5: 對真實延伸圖執行**

Run:
```bash
python3.11 pipeline/forge/stage1_intake/face_drift_gate.py \
  --extend .img2babylon/female-tactical/generative/extended/extend.json \
  --out viewer/models/female-tactical/round6/c0/face-drift.json; echo exit=$?
```
Expected: 印出三個 view 的數字與 pass。exit 1 表示漂移：改 seed（913 → 914、915）最多重跑 Task 4 Step 5 兩次；仍失敗就記錄在 `round6/c0/face-drift.json` 並在 Task 6 的圖表上標明將走胸像方案。

- [ ] **Step 6: Commit**

```bash
git add pipeline/forge/stage1_intake/face_drift_gate.py pipeline/forge/tests/test_face_drift_gate.py viewer/models/female-tactical/round6/c0/face-drift.json
git commit -m "feat(pipeline): face drift gate for extended reference views"
```

---

### Task 6: 人偶形象圖表與使用者目視關卡（`figure_sheet.py`）

**Files:**
- Create: `pipeline/forge/stage1_intake/figure_sheet.py`
- Test: `pipeline/forge/tests/test_figure_sheet.py`
- Create: `viewer/models/female-tactical/round6/c0/figure-sheet.png`、`round6/c0/figure-review.json`

**Interfaces:**
- Consumes: Task 3 `views/<role>.png`、Task 4 `extended/<role>.png`、Task 5 `face-drift.json`。
- Produces:
  - `compose_sheet(rows: list[list[Path]], out_png: Path, cell_height=640, gap=16) -> dict`：每列圖片等比縮到同高、橫向並排，列之間留白；回傳 `{"width","height","cells":[[...]]}`。
  - `round6/c0/figure-review.json`：`{"sheet","faceDrift":<gate json>,"userVerdict": "pending"|"approved"|"rejected","note":""}`。

- [ ] **Step 1: 寫失敗測試**

`pipeline/forge/tests/test_figure_sheet.py`:
```python
from __future__ import annotations
import tempfile, unittest
from pathlib import Path
from forge._shared.png import write_rgb, read_rgba
from forge.stage1_intake.figure_sheet import compose_sheet


class FigureSheet(unittest.TestCase):
    def test_rows_share_height_and_columns_are_gapped(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            a = root / 'a.png'; write_rgb(a, 10, 20, bytes([255, 0, 0]) * 200)
            b = root / 'b.png'; write_rgb(b, 40, 40, bytes([0, 0, 255]) * 1600)
            info = compose_sheet([[a, b], [b]], root / 'sheet.png', cell_height=40, gap=4)
            self.assertEqual(info['height'], 40 + 4 + 40)
            self.assertEqual(info['width'], 20 + 4 + 40)      # a scaled to 20x40, b stays 40x40
            w, h, rgba = read_rgba(root / 'sheet.png')
            self.assertEqual((w, h), (info['width'], info['height']))
            self.assertEqual(bytes(rgba[(0 * w + 21) * 4:(0 * w + 21) * 4 + 3]), b'\xff\xff\xff')  # gap column is white
            self.assertEqual(bytes(rgba[(0 * w + 30) * 4:(0 * w + 30) * 4 + 3]), bytes([0, 0, 255]))


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_figure_sheet`
Expected: `ModuleNotFoundError`

- [ ] **Step 3: 實作**

`pipeline/forge/stage1_intake/figure_sheet.py`:
```python
#!/usr/bin/env python3
"""Compose review sheets (rows of images at a shared height) so the user sees one PNG, not six."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _shared.png import read_rgba, write_rgb, composite_on_white, scale_nearest, blit  # noqa: E402


def compose_sheet(rows: list[list[Path]], out_png: Path, cell_height: int = 640, gap: int = 16) -> dict:
    scaled: list[list[tuple[int, int, bytes]]] = []
    for row in rows:
        cells = []
        for p in row:
            w, h, rgba = read_rgba(p); rgb = composite_on_white(w, h, rgba)
            nw = max(1, w * cell_height // h)
            cells.append((nw, cell_height, scale_nearest(w, h, rgb, nw, cell_height)))
        scaled.append(cells)
    width = max(sum(c[0] for c in cells) + gap * (len(cells) - 1) for cells in scaled)
    height = cell_height * len(scaled) + gap * (len(scaled) - 1)
    board = bytearray(b"\xff" * (width * height * 3)); placed = []
    for r, cells in enumerate(scaled):
        x = 0; y = r * (cell_height + gap); row_cells = []
        for cw, ch, rgb in cells:
            blit(width, height, board, cw, ch, rgb, x, y); row_cells.append([x, y, cw, ch]); x += cw + gap
        placed.append(row_cells)
    write_rgb(out_png, width, height, bytes(board))
    return {"width": width, "height": height, "cells": placed}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--row", action="append", nargs="+", type=Path, required=True, help="one --row per sheet row")
    ap.add_argument("--out", type=Path, required=True); ap.add_argument("--cell-height", type=int, default=640)
    a = ap.parse_args(argv)
    print(json.dumps(compose_sheet(a.row, a.out, a.cell_height)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_figure_sheet`
Expected: `OK`

- [ ] **Step 5: 產生形象圖表**

Run:
```bash
G=.img2babylon/female-tactical/generative
python3.11 pipeline/forge/stage1_intake/figure_sheet.py \
  --row $G/views/left.png $G/views/front.png $G/views/right.png \
  --row $G/extended/left.png $G/extended/front.png $G/extended/right.png \
  --out viewer/models/female-tactical/round6/c0/figure-sheet.png --cell-height 720
python3 - <<'EOF'
import json
gate=json.load(open('viewer/models/female-tactical/round6/c0/face-drift.json'))
json.dump({"sheet":"figure-sheet.png","faceDrift":gate,"userVerdict":"pending","note":""},open('viewer/models/female-tactical/round6/c0/figure-review.json','w'),indent=2,ensure_ascii=False)
EOF
```
Expected: `figure-sheet.png` 上列三張原始視圖、下列三張全身延伸圖。

- [ ] **Step 6: 交給使用者看，STOP 等回覆**

用 `SendUserFile` 送 `viewer/models/female-tactical/round6/c0/figure-sheet.png`，並在對話貼出 `face-drift.json` 的三個 view 數字與「通過／漂移」結論。文字說明：上列原圖、下列延伸；若漂移，說明將走胸像方案（頭髮外套生成、下半身沿用程序化零件）。**停止，等待使用者明確回覆「同意」或修改意見。** 使用者要求改提示或 seed 時回到 Task 4 Step 5 重跑（免費，不計修正）。

- [ ] **Step 7: 記錄使用者判定並 commit**

把 `figure-review.json` 的 `userVerdict` 改成 `approved`（或 `rejected` 加 `note`），`round6/c0/notes.md` 記錄日期、seed、使用者原話摘要。
```bash
git add viewer/models/female-tactical/round6/c0/figure-sheet.png viewer/models/female-tactical/round6/c0/figure-review.json viewer/models/female-tactical/round6/c0/notes.md pipeline/forge/stage1_intake/figure_sheet.py pipeline/forge/tests/test_figure_sheet.py
git commit -m "feat(yui R6): figure sheet and user-approved reference views"
```

---

### Task 7: fal.ai 生成客戶端（`fal_generate.py`）

**Files:**
- Create: `pipeline/integrations/mesh3d/fal_generate.py`
- Test: `pipeline/forge/tests/test_fal_generate.py`

**Interfaces:**
- Consumes: 使用者核准後的視圖（全身 `extended/*.png` 或胸像 `views/*.png`）。
- Produces:
  - `load_fal_key(env_path: Path | None) -> str`：先讀環境變數 `FAL_API_KEY`，再讀 `.env` 的 `FAL_API_KEY=...` 行；缺少時 `SystemExit("FAL_API_KEY not found")`（訊息不含任何值）。
  - `image_data_uri(path: Path) -> str`。
  - `build_payload(endpoint: str, views: dict[str, Path], seed: int) -> dict`：`endpoint` 為 `"tripo"` 或 `"rodin"`，回傳 fal 輸入 JSON：
    - tripo → endpoint id `tripo3d/tripo/v2.5/multiview-to-3d`，`{"front_image_url","left_image_url","right_image_url","texture":"HD","pbr":true,"face_limit":120000,"orientation":"align_image","auto_size":true,"seed"}`（沒有 back 就不放）。
    - rodin → `fal-ai/hyper3d/rodin`，`{"input_image_urls":[front,left,right],"condition_mode":"concat","quality":"high","material":"PBR","TAPose":true,"geometry_file_format":"glb","seed"}`。
  - `ENDPOINTS = {"tripo": "tripo3d/tripo/v2.5/multiview-to-3d", "rodin": "fal-ai/hyper3d/rodin"}`。
  - `input_hash(payload: dict) -> str`：payload JSON（含 data URI）SHA-256。
  - `run_job(endpoint_id, payload, key, opener, poll_interval=5.0, timeout=900.0, sleep=time.sleep) -> dict`：POST `https://queue.fal.run/{endpoint_id}` header `Authorization: Key <key>`，讀 `request_id`、`status_url`、`response_url`；輪詢 `status_url` 直到 `COMPLETED`（`FAILED` 或逾時拋 `RuntimeError`，訊息不含 key）；GET `response_url` 回傳輸出 JSON。
  - `download_outputs(endpoint: str, output: dict, out_dir: Path, opener) -> dict`：tripo 取 `pbr_model.url`（沒有就 `model_mesh.url`）存 `model.glb`，`rendered_image.url` 存 `preview.png`；rodin 取 `model_mesh.url` 存 `model.glb`、`textures[i].url` 存 `textures/<file_name>`。回傳 `{"files":[{"path","sha256","bytes"}]}`。
  - `generate(endpoint, views, seed, out_root, key, opener, confirm_paid, force, sleep) -> dict`：組 payload、算 hash；`out_root/<endpoint>/provenance.json` 已存在且 `inputHash` 相同且未 `force` → `RuntimeError("already generated ...")`；未 `confirm_paid` → 只寫 `out_root/<endpoint>/dry-run.json`（payload 去掉 data URI 內容改成長度）並回傳 `{"dryRun": True}`；否則跑 job、下載、寫 `provenance.json`：`{"endpoint","endpointId","requestId","seed","parameters"(不含圖)，"inputImages":[{"role","path","sha256"}],"inputHash","outputs":[...],"startedAt","finishedAt","paid": true}`。
  - CLI：`python3.11 pipeline/integrations/mesh3d/fal_generate.py --endpoint tripo|rodin --front F --left L --right R [--back B] --seed N --out-root DIR [--confirm-paid] [--force] [--env .env]`。

- [ ] **Step 1: 寫失敗測試**

`pipeline/forge/tests/test_fal_generate.py`:
```python
"""fal client: key never leaks, dry-run by default, dedupe by input hash, queue polling."""
from __future__ import annotations
import io, json, os, tempfile, unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'integrations' / 'mesh3d'))
from forge._shared.png import write_rgb
import fal_generate as fg


class FakeResponse(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


class FakeOpener:
    def __init__(self):
        self.calls = []; self.status_polls = 0
    def open(self, req, timeout=0):
        url = req.full_url; self.calls.append((url, dict(req.header_items())))
        if url == 'https://queue.fal.run/fal-ai/hyper3d/rodin':
            return FakeResponse(json.dumps({'request_id': 'r1', 'status_url': 'https://q/status', 'response_url': 'https://q/result'}).encode())
        if url == 'https://q/status':
            self.status_polls += 1
            return FakeResponse(json.dumps({'status': 'IN_PROGRESS' if self.status_polls < 3 else 'COMPLETED'}).encode())
        if url == 'https://q/result':
            return FakeResponse(json.dumps({'model_mesh': {'url': 'https://cdn/m.glb', 'file_name': 'm.glb'},
                                            'textures': [{'url': 'https://cdn/t.png', 'file_name': 't.png'}], 'seed': 5}).encode())
        if url == 'https://cdn/m.glb': return FakeResponse(b'glTF-bytes')
        if url == 'https://cdn/t.png': return FakeResponse(b'\x89PNG-bytes')
        raise AssertionError(url)


class FalGenerate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.views = {}
        for r in ('front', 'left', 'right'):
            p = self.root / f'{r}.png'; write_rgb(p, 2, 2, b'\x00' * 12); self.views[r] = p
        os.environ.pop('FAL_API_KEY', None)
    def tearDown(self): self.tmp.cleanup()

    def test_key_from_env_file_and_missing_key_message_has_no_value(self):
        env = self.root / '.env'; env.write_text('OTHER=1\nFAL_API_KEY=abc:secret123\n')
        self.assertEqual(fg.load_fal_key(env), 'abc:secret123')
        with self.assertRaises(SystemExit) as cm: fg.load_fal_key(self.root / 'nope.env')
        self.assertNotIn('secret', str(cm.exception))

    def test_payloads_match_endpoint_schemas(self):
        t = fg.build_payload('tripo', self.views, 9)
        self.assertEqual(t['texture'], 'HD'); self.assertTrue(t['pbr']); self.assertNotIn('back_image_url', t)
        self.assertTrue(t['front_image_url'].startswith('data:image/png;base64,'))
        r = fg.build_payload('rodin', self.views, 9)
        self.assertEqual(len(r['input_image_urls']), 3); self.assertTrue(r['TAPose']); self.assertEqual(r['condition_mode'], 'concat')

    def test_dry_run_without_confirm_and_no_key_in_files(self):
        out = self.root / 'gen'
        res = fg.generate('rodin', self.views, 9, out, key='abc:secret123', opener=FakeOpener(), confirm_paid=False, force=False, sleep=lambda s: None)
        self.assertTrue(res['dryRun'])
        text = (out / 'rodin' / 'dry-run.json').read_text()
        self.assertNotIn('secret123', text); self.assertNotIn('base64,', text)

    def test_paid_run_polls_downloads_and_dedupes(self):
        out = self.root / 'gen'; opener = FakeOpener()
        res = fg.generate('rodin', self.views, 9, out, key='abc:secret123', opener=opener, confirm_paid=True, force=False, sleep=lambda s: None)
        self.assertEqual(res['requestId'], 'r1'); self.assertEqual(opener.status_polls, 3)
        self.assertEqual(opener.calls[0][1].get('Authorization'), 'Key abc:secret123')
        self.assertEqual((out / 'rodin' / 'model.glb').read_bytes(), b'glTF-bytes')
        self.assertTrue((out / 'rodin' / 'textures' / 't.png').is_file())
        prov = json.loads((out / 'rodin' / 'provenance.json').read_text())
        self.assertNotIn('secret123', json.dumps(prov)); self.assertEqual(prov['paid'], True)
        with self.assertRaises(RuntimeError): fg.generate('rodin', self.views, 9, out, key='k', opener=opener, confirm_paid=True, force=False, sleep=lambda s: None)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_fal_generate`
Expected: `ModuleNotFoundError: No module named 'fal_generate'`

- [ ] **Step 3: 實作**

`pipeline/integrations/mesh3d/fal_generate.py`:
```python
#!/usr/bin/env python3
"""Opt-in generativeAssist: call fal.ai image-to-3D endpoints and record provenance. Stdlib only.

This is the escape hatch described in pipeline/docs/UPGRADE_PLAN.md 5.9 and the R6 spec: never a
default, always paid on explicit `--confirm-paid`, deduplicated by input hash, and the key lives only
in memory. Images travel as data URIs so nothing is uploaded to a public bucket.
"""
from __future__ import annotations
import argparse, base64, hashlib, json, os, sys, time, urllib.request
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
    with opener.open(req, timeout=timeout) as resp: return json.loads(resp.read().decode())


def run_job(endpoint_id: str, payload: dict, key: str, opener, poll_interval: float = 5.0, timeout: float = 900.0, sleep=time.sleep) -> dict:
    req = urllib.request.Request(f"{QUEUE}/{endpoint_id}", data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
    with opener.open(req, timeout=120) as resp: job = json.loads(resp.read().decode())
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


def generate(endpoint: str, views: dict[str, Path], seed: int, out_root: Path, key: str, opener=None,
             confirm_paid: bool = False, force: bool = False, sleep=time.sleep) -> dict:
    opener = opener or urllib.request.build_opener()
    endpoint_id = ENDPOINTS[endpoint]; payload = build_payload(endpoint, views, seed); h = input_hash(payload)
    out_dir = out_root / endpoint; out_dir.mkdir(parents=True, exist_ok=True)
    prov_path = out_dir / "provenance.json"
    if prov_path.is_file() and not force:
        old = json.loads(prov_path.read_text())
        if old.get("inputHash") == h: raise RuntimeError(f"already generated for this input (request {old.get('requestId')}); pass --force to pay again")
    inputs = [{"role": r, "path": str(p), "sha256": hashlib.sha256(Path(p).read_bytes()).hexdigest()} for r, p in views.items()]
    if not confirm_paid:
        (out_dir / "dry-run.json").write_text(json.dumps({"endpoint": endpoint, "endpointId": endpoint_id, "parameters": _redacted(payload), "inputImages": inputs, "inputHash": h}, indent=2) + "\n")
        return {"dryRun": True, "endpointId": endpoint_id, "inputHash": h}
    started = datetime.now(timezone.utc).isoformat()
    output = run_job(endpoint_id, payload, key, opener, sleep=sleep)
    files = download_outputs(endpoint, output, out_dir, opener)
    prov = {"endpoint": endpoint, "endpointId": endpoint_id, "requestId": output.get("_requestId"), "seed": seed,
            "parameters": _redacted(payload), "inputImages": inputs, "inputHash": h, "outputs": files["files"],
            "resultSeed": output.get("seed"), "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(), "paid": True}
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_fal_generate`
Expected: `OK`（4 tests）

- [ ] **Step 5: Dry-run 兩個端點（不扣款）**

依 Task 6 的使用者判定選輸入：通過全身 → `E=.img2babylon/female-tactical/generative/extended`；胸像方案 → `E=.img2babylon/female-tactical/generative/views`。
```bash
for ep in tripo rodin; do
python3.11 pipeline/integrations/mesh3d/fal_generate.py --endpoint $ep \
  --front $E/front.png --left $E/left.png --right $E/right.png --seed 913 \
  --out-root .img2babylon/female-tactical/generative
done
cat .img2babylon/female-tactical/generative/tripo/dry-run.json | head -20
```
Expected: 兩個 `dry-run.json`，參數與 spec §3 表格一致，沒有 base64 內容。

- [ ] **Step 6: 付費執行（各一次）**

```bash
for ep in tripo rodin; do
python3.11 pipeline/integrations/mesh3d/fal_generate.py --endpoint $ep \
  --front $E/front.png --left $E/left.png --right $E/right.png --seed 913 \
  --out-root .img2babylon/female-tactical/generative --confirm-paid
done
ls -la .img2babylon/female-tactical/generative/*/
```
Expected: 每個目錄有 `model.glb` 與 `provenance.json`；tripo 另有 `preview.png`，rodin 另有 `textures/`。HTTP 413 或 422 表示 data URI 過大：把三張圖用 `scale_nearest` 縮成一半（寫在 `round6/c0/notes.md`）後重跑一次；仍失敗就停止並回報使用者。逾時 15 分鐘會拋錯；重跑會被去重擋下，要先確認 fal 後台狀態再決定 `--force`。

- [ ] **Step 7: 把 provenance 複製進證據並 commit**

```bash
mkdir -p viewer/models/female-tactical/round6/c0/provenance
cp .img2babylon/female-tactical/generative/tripo/provenance.json viewer/models/female-tactical/round6/c0/provenance/tripo.json
cp .img2babylon/female-tactical/generative/rodin/provenance.json viewer/models/female-tactical/round6/c0/provenance/rodin.json
grep -c "base64," viewer/models/female-tactical/round6/c0/provenance/*.json   # 必須都是 0
git add pipeline/integrations/mesh3d/fal_generate.py pipeline/forge/tests/test_fal_generate.py viewer/models/female-tactical/round6/c0/provenance
git commit -m "feat(pipeline): fal.ai generativeAssist client with provenance; yui R6 tripo+rodin runs"
```

---

### Task 8: 候選比較與使用者選定

**Files:**
- Create: `pipeline/integrations/mesh3d/candidates.py`
- Test: `pipeline/forge/tests/test_candidates.py`
- Create: `viewer/models/female-tactical/round6/c0/candidates.json`、`candidates-sheet.png`、`.img2babylon/female-tactical/generative/selected.json`

**Interfaces:**
- Consumes: `pipeline/forge/stage1_intake/probe_glb.py` 的 `probe_glb(path: Path) -> dict`（回傳含 `sha256`、mesh／material 清單、bounds；實作時用 `python3 -c "from forge.stage1_intake.probe_glb import probe_glb; print(list(probe_glb(Path('x.glb'))))"` 確認鍵名）；viewer `window.__IMG2BABYLON_CAPTURE__.setReferenceMode({kind:'glb', url, sha256})` 與 `setCamera`／`screenshot`。
- Produces:
  - `summarize_candidates(gen_root: Path, endpoints=("tripo","rodin")) -> dict`：每個端點讀 `provenance.json` 與 `probe_glb(model.glb)`，輸出 `{"candidates":[{"endpoint","glb","sha256","bytes","meshCount","materialCount","textureCount","bounds","triangleCount"(若 probe 提供)}]}`。
  - `selected.json`：`{"endpoint","glb","sha256","chosenBy":"user","note"}`。

- [ ] **Step 1: 寫失敗測試**

`pipeline/forge/tests/test_candidates.py`:
```python
from __future__ import annotations
import json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'integrations' / 'mesh3d'))
from forge.tests.test_glb_reference import write_triangle_glb
import candidates


class Candidates(unittest.TestCase):
    def test_summary_reads_provenance_and_probe(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for ep in ('tripo', 'rodin'):
                (root / ep).mkdir(); write_triangle_glb(root / ep / 'model.glb')
                (root / ep / 'provenance.json').write_text(json.dumps({'endpoint': ep, 'requestId': 'r-' + ep, 'outputs': []}))
            s = candidates.summarize_candidates(root)
            self.assertEqual([c['endpoint'] for c in s['candidates']], ['tripo', 'rodin'])
            self.assertEqual(s['candidates'][0]['requestId'], 'r-tripo')
            self.assertEqual(len(s['candidates'][0]['sha256']), 64)
            self.assertGreaterEqual(s['candidates'][0]['meshCount'], 1)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_candidates`
Expected: `ModuleNotFoundError: No module named 'candidates'`

- [ ] **Step 3: 實作**

`pipeline/integrations/mesh3d/candidates.py`:
```python
#!/usr/bin/env python3
"""Summarise generated GLB candidates from their provenance and a stdlib GLB probe."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from forge.stage1_intake.probe_glb import probe_glb  # noqa: E402


def summarize_candidates(gen_root: Path, endpoints=("tripo", "rodin")) -> dict:
    """probe_glb returns (confirmed in probe_glb.py): sha256, meshes[], materials[], bounds{min,max} plus scalar warnings."""
    out = []
    for ep in endpoints:
        glb = gen_root / ep / "model.glb"; prov_path = gen_root / ep / "provenance.json"
        if not glb.is_file(): continue
        prov = json.loads(prov_path.read_text()) if prov_path.is_file() else {}
        report = probe_glb(glb)
        textures = [o for o in prov.get("outputs", []) if str(o.get("path", "")).endswith(".png") and "/textures/" in str(o.get("path", ""))]
        out.append({"endpoint": ep, "glb": str(glb), "sha256": report["sha256"], "bytes": glb.stat().st_size,
                    "requestId": prov.get("requestId"), "meshCount": len(report["meshes"]), "materialCount": len(report["materials"]),
                    "textureCount": len(textures), "bounds": report.get("bounds"),
                    "probe": {k: v for k, v in report.items() if not isinstance(v, (list, dict))}})
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd pipeline && python3.11 -m unittest forge.tests.test_candidates`
Expected: `OK`

- [ ] **Step 5: 產生 candidates.json**

```bash
python3.11 pipeline/integrations/mesh3d/candidates.py --gen-root .img2babylon/female-tactical/generative \
  --out viewer/models/female-tactical/round6/c0/candidates.json
```

- [ ] **Step 6: viewer 內以同一相機截兩個候選**

背景啟動 dev server：`cd viewer && npm run dev -- --host 127.0.0.1 --port 5173`（run_in_background）。以 playwright MCP 開 `http://127.0.0.1:5173/#model=female-tactical`，等 `window.__IMG2BABYLON_READY__ === true`，對每個候選在 `browser_evaluate` 內執行（sha256 取自 candidates.json）：
```js
async ({url, sha256, view}) => {
  const api = window.__IMG2BABYLON_CAPTURE__;
  await api.setReferenceMode({kind: 'glb', url, sha256});
  const base = {projection: 'perspective', fovDegrees: 28, near: 0.01, far: 100};
  const cams = {front: {...base, target: [0, 0.885, 0], azimuthDegrees: 0,   elevationDegrees: 2, distance: 3.85},
                left:  {...base, target: [0, 0.885, 0], azimuthDegrees: -90, elevationDegrees: 2, distance: 3.85},
                face:  {...base, target: [0, 1.55, 0],  azimuthDegrees: 0,   elevationDegrees: 0, distance: 0.9}};
  api.setCamera(cams[view]); await new Promise(r => setTimeout(r, 400)); api.setCamera(cams[view]);
  return await api.screenshot();
}
```
相機欄位是 `viewer/src/capture-camera.ts` 的 `CameraSpec`（`azimuthDegrees`／`elevationDegrees`／`distance`／`target`／`fovDegrees`），與 `round5/c4/capture-handoff.json` 的 `views[].camera` 同格式；`left` 的方位角正負以該檔 `views` 中 id 為 `left` 的那筆為準，照抄。`url` 用 `/generative/<endpoint>/model.glb`（Task 1 的符號連結）。每張 base64 存成 `.img2babylon/shots/round6-c0-<endpoint>-<view>.png`（front、left、face 各一）。

- [ ] **Step 7: 合成候選比較表並交給使用者，STOP**

```bash
S=.img2babylon/shots; E=.img2babylon/female-tactical/generative/extended
python3.11 pipeline/forge/stage1_intake/figure_sheet.py \
  --row $E/front.png $S/round6-c0-tripo-front.png $S/round6-c0-rodin-front.png \
  --row $E/left.png  $S/round6-c0-tripo-left.png  $S/round6-c0-rodin-left.png \
  --row .img2babylon/female-tactical/generative/views/front.png $S/round6-c0-tripo-face.png $S/round6-c0-rodin-face.png \
  --out viewer/models/female-tactical/round6/c0/candidates-sheet.png --cell-height 640
```
用 `SendUserFile` 送 `candidates-sheet.png`，對話中列出 candidates.json 的三角形數、貼圖數、AABB（表格），說明左欄是參考、中欄 Tripo、右欄 Rodin，並提醒 Rodin 是 T-pose 較利綁骨。**停止，等使用者選定。**

- [ ] **Step 8: 寫 selected.json 並 commit**

```bash
python3 - <<'EOF'
import json
ep="<使用者選的 endpoint>"; c=[x for x in json.load(open('viewer/models/female-tactical/round6/c0/candidates.json'))['candidates'] if x['endpoint']==ep][0]
json.dump({"endpoint":ep,"glb":c["glb"],"sha256":c["sha256"],"chosenBy":"user","note":"<使用者原話摘要>"},open('.img2babylon/female-tactical/generative/selected.json','w'),indent=2,ensure_ascii=False)
EOF
cp .img2babylon/female-tactical/generative/selected.json viewer/models/female-tactical/round6/c0/selected.json
git add pipeline/integrations/mesh3d/candidates.py pipeline/forge/tests/test_candidates.py viewer/models/female-tactical/round6/c0/candidates.json viewer/models/female-tactical/round6/c0/candidates-sheet.png viewer/models/female-tactical/round6/c0/selected.json
git commit -m "feat(yui R6): candidate comparison sheet and user-selected base mesh"
```

---

### Task 9: 文件與狀態同步

**Files:**
- Create: `docs/character-round6.md`
- Modify: `docs/yui.md`、`viewer/models/female-tactical/iteration.json`（`workflow.limits`、`review.nextAction`）
- Modify: `viewer/models/female-tactical/round6/c0/notes.md`

- [ ] **Step 1: 寫 `docs/character-round6.md` 的 A 段**

```markdown
# 女性角色 yui 第 6 輪：generative-assist

設計：`docs/superpowers/specs/2026-09-14-yui-generative-assist-design.md`。本輪分三個計畫：A 參考圖與生成（本頁 A 段）、B GLB 匯入與貼圖、C 骨架動作與輕量物理。

## A. 參考圖前處理與基底 mesh 生成

- 參考圖：`reference/female_reference.png`（使用者提供，上半身左／正／右三視圖，RGBA 透明背景）。切圖以 alpha 欄間隙為準，欄範圍 113–675／701–1474／1497–2061。
- 全身延伸：tomato edit，seed 與提示記錄於 `.img2babylon/female-tactical/generative/extended/extend.json`。臉部漂移 gate 結果：`round6/c0/face-drift.json`（填實際數字：headIoU、meanAbsDiff、fractionOver24 與 pass）。
- 使用者目視關卡：`round6/c0/figure-sheet.png`，判定見 `round6/c0/figure-review.json`。
- 付費生成：Tripo v2.5 multiview 與 Hyper3D Rodin 各一次，來源紀錄 `round6/c0/provenance/`。候選比較 `round6/c0/candidates-sheet.png`、`candidates.json`。
- 選定：`round6/c0/selected.json`（填端點與使用者理由）。
- 修正次數：本段不計修正，第 6 輪仍為 0/6。
```
把括號內「填實際數字」處換成真實值。

- [ ] **Step 2: 更新 yui.md 與 iteration.json**

`docs/yui.md` 的「設計與持續迭代」段末加一行：`- [第 6 輪優化紀錄](character-round6.md)`。
`iteration.json`：`workflow.limits` 改 `"Round6 0/6; plan A (reference+generation) done; next plan B import"`，`review.nextAction` 改 `"Plan B: import selected generative GLB into nativeVertexData with textures"`。

- [ ] **Step 3: 驗證全部測試仍綠**

Run:
```bash
cd pipeline && python3.11 -m unittest forge.tests.test_png_io forge.tests.test_split_views forge.tests.test_extend_views forge.tests.test_face_drift_gate forge.tests.test_figure_sheet forge.tests.test_fal_generate forge.tests.test_candidates && cd ..
python3 -m unittest discover -s forge/tests -t . -p 'test_*.py' 2>&1 | tail -3
python3.11 pipeline/forge/babylon.py next --state $PWD/.img2babylon/female-tactical/pipeline/workflow.json | head -2
```
Expected: 全部 `OK`；workflow 仍 `round=6 corrections=0/6`。

- [ ] **Step 4: Commit**

```bash
git add docs/character-round6.md docs/yui.md viewer/models/female-tactical/iteration.json viewer/models/female-tactical/round6/c0/notes.md
git commit -m "docs(yui R6): plan A record, selected base mesh, next step plan B"
```

---

## 計畫 B、C 的交接點

- 計畫 B 從 `.img2babylon/female-tactical/generative/selected.json` 指向的 GLB 開始（spec §4、§5）：切零件、減面、貼圖、nativeVertexData、viewer 顯示。
- 計畫 C 從計畫 B 的 15 個零件 mesh 開始（spec §6、§7）：SOMA 30 骨、權重、kimodo 動畫重定向、11 個 ANIMATED 剛體。
- 兩者各自另寫 `docs/superpowers/plans/2026-09-14-yui-r6b-*.md`、`...-r6c-*.md`，在計畫 A 完成後由本 session 以 writing-plans 產生。
