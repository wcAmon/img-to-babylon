# Spec：BabylonSculptSpec v1 撰寫指南

單一 JSON 檔 `viewer/models/<name>/spec.json`。這是「產碼前的唯一真相」——`build.md` /
`physics.md` 都是把這份 spec 轉成程式碼的規則，spec 本身錯了，程式碼一定跟著錯。
撰寫完一律先跑 `python3 forge/validate_spec.py viewer/models/<name>/spec.json --strict`，
全綠才能動手寫 `.ts`。

## 頂層欄位（`forge/validate_spec.py` 的 `REQUIRED_TOP`，缺一即 FAIL）

| 欄位 | 說明 |
|---|---|
| `targetName` | 模型代號，等於 `viewer/models/<name>` 的 `<name>` |
| `sourceImages[]` | `{ role: hero\|side\|rear, path, origin: tomato\|user, tomatoJobId?, prompt? }` |
| `coordinateFrame` | `{ up: "y", forward: "z", units: "m" }`，本 skill 一律用這組 |
| `silhouette` | `{ outline: "...", complexity: simple\|moderate\|complex }`，見下方複雜度規則 |
| `componentTree[]` | 遞迴元件樹，經 `parent` 連接 |
| `materials[]` | `{ id, kind, baseColor, roughness, alpha? }` |
| `physics` | `{ bodies[], constraints[] }`，見下方 |
| `buildPasses` | 固定 `["blockout", "structure", "material", "physics", "polish"]` |
| `reviewHistory` | 每 pass 一筆評分紀錄，見 `grimoire/review.md`；新建時給 `[]` |

## `componentTree[]`：每個元件

```jsonc
{
  "id": "cap", "name": "flip-top cap", "level": "macro",   // macro | meso | micro
  "primitive": "cylinder",   // box|sphere|cylinder|capsule|torus|tube|extrude|lathe|csg
  "dimensions": { "w": 0.05, "h": 0.02, "d": 0.05, "units": "m", "confidence": 0.8 },
  "transform": { "position": [0, 0.11, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
  "parent": "body",
  "attachment": { "type": "hinge|fixed|detachable|none", "socket": "body:rim-back",
                  "hinge": { "pivot": [0, -0.01, -0.024], "axis": [1, 0, 0],
                             "limits": [0, 1.92] } },   // 弧度；僅 type=hinge 時需要
  "material": "amber-plastic",
  "collider": {                       // macro 元件必填；meso/micro 可省略
    "type": "box|sphere|capsule|cylinder|convex",
    "size": [0.05, 0.02, 0.05], "offset": [0, 0, 0], "confidence": 0.8
  }
}
```

驗證器逐條檢查：

- `id` / `name` / `level` / `primitive` / `dimensions` / `transform` 五個欄位必存在，
  且每個元件 `id` 全域唯一。
- `primitive` 必須在 `PRIMITIVES` 集合內：
  `box, sphere, cylinder, capsule, torus, tube, extrude, lathe, csg`。
- 有填 `parent` 時，該 id 必須存在於同一份 `componentTree`。
- 有填 `collider` 時，`collider.type` 必須在 `COLLIDER_TYPES` 內：
  `box, sphere, capsule, cylinder, convex`（比 primitive 集合小——沒有 torus/lathe/csg
  的碰撞形狀，複雜幾何要挑一個近似形狀當 collider）。
- `level: macro` 的元件**必須**有 `collider`；`meso` / `micro` 可省略（例如標籤、螺紋
  這類不影響碰撞外形的細節）。

## `physics`：組件層級的剛體與約束

```jsonc
{
  "bodies": [                          // 每個獨立剛體一條；藥罐 = body + cap 兩條
    { "id": "body", "components": ["body", "label"],
      "mass": 0.04, "friction": 0.5, "restitution": 0.3, "centerOfMass": [0, -0.01, 0] },
    { "id": "cap", "components": ["cap"], "mass": 0.008, "friction": 0.5, "restitution": 0.3 }
  ],
  "constraints": [
    { "type": "hinge", "bodyA": "body", "bodyB": "cap",
      "pivotA": [0, 0.10, -0.024], "pivotB": [0, -0.01, -0.024],
      "axis": [1, 0, 0], "limits": [0, 1.92] }
  ]
}
```

驗證器逐條檢查：

- `physics.bodies` 不可為空。
- 每個 `body.components[]` 引用的元件 id 必須存在於 `componentTree`。
- **每個元件恰屬於一個 body**：同一個元件 id 出現在兩個 body 的 `components[]` 中會
  FAIL；任何 componentTree 元件沒被任何 body 領走也會 FAIL。獨立的視覺細節（例如
  只是貼在瓶身上、不會相對運動的標籤）仍要塞進某個 body 的 `components[]`。
- `body.mass` 必須是正數。
- `constraints[]` 的 `bodyA` / `bodyB` 必須是已定義的 body id。
- `type: "hinge"` 的 constraint 必須同時有 `axis` 與 `limits`。
- `limits` 必須是 `[lo, hi]` 數字對（弧度，`lo < hi`，如揀蓋 `[0, 1.92]`），或字串
  `"free"` 表示角軸完全放開（自由旋轉，如車輪——推一把因摩擦力自轉，無角度上限）。

## 權威規則：`physics.constraints` 才是物理事實

`componentTree[].attachment` 只描述視覺階層與對位（建模時怎麼把 mesh 擺好）；
**物理行為一律以 `physics.constraints` 為準**。兩者容易漂移（例如改了 spec 的
constraint pivot 卻忘記同步 attachment），所以驗證器強制比對：

- 對每個 `attachment.type == "hinge"` 的元件，找出它所屬 body 參與的 hinge
  constraint；若找不到 → FAIL（`attachment 為 hinge 但 physics.constraints 無對應`）。
- `attachment.hinge.axis` 必須與該 constraint 的 `axis`**完全相同**（列表逐元素比對，
  不是「方向相同」而已——`[1, 0, 0]` 跟 `[1.0, 0, 0]` 在 JSON 解析後數值相等才會過，
  但軸的分量順序、正負號都要一致）。
- `attachment.hinge.pivot` 與該 constraint 的 `pivotB` 歐氏距離必須 **≤ 5mm**
  （`math.dist(pivot, pivotB) <= 0.005`）。注意比對的永遠是 `pivotB`，不看
  元件掛在 `bodyA` 還是 `bodyB`——因此建 spec 時把「會動的那一側」（例如蓋子）
  放在 `bodyB`，`attachment.hinge.pivot` 就直接抄 `pivotB` 的值。
- `attachment.hinge.limits`（若有寫）必須與該 constraint 的 `limits`**完全相同**
  （`[0, 1.92]` 對 `[0, 1.92]`、`"free"` 對 `"free"`），抓兩邊漂移。

## `silhouette.complexity` 與元件數量

`--strict` 模式下的啟發式：`complexity: "complex"` 但 `componentTree` 少於 3 個
元件 → FAIL。也就是說：

- `simple`：1–2 個元件即可（例如 sample-crate 的單一 box）。
- `moderate`：無額外元件數限制，但通常代表 2–4 個元件的中等物件。
- `complex`：至少 3 個元件才可標記，否則會被 strict gate 擋下——避免「圖看起來複雜，
  spec 卻懶得拆件」。

## `--strict` 額外檢查（產碼前的品質 gate，一般 `validate_spec.py` 不含）

- 每個元件的 `dimensions.w / h / d` 必須是正數。
- 每個 `level: macro` 元件必須有 `material`，且該值必須存在於頂層 `materials[].id`。
- 上述 `silhouette.complexity` 元件數規則。

## 完整範例：揀蓋式藥罐（已跑過 `validate_spec.py --strict`，結果 `OK`）

body（瓶身，cylinder macro，mass 0.04kg）+ cap（掀蓋，cylinder macro，mass 0.008kg，
以 hinge 連接 body）+ label（標籤，box meso，無 collider，歸屬 body 這個 physics
body）。hinge 軸為 X 軸（`[1, 0, 0]`），開合角度 0–1.92 弧度（約 0–110°）；
`cap` 元件的 `attachment.hinge.pivot` 與 constraint 的 `pivotB` 完全相同，兩者
`axis` 也逐元素相等，滿足 5mm / 軸一致的權威規則。

```json
{
  "targetName": "pill-bottle",
  "schemaVersion": "1",
  "sourceImages": [
    {
      "role": "hero",
      "path": ".img2babylon/pill-bottle/hero.png",
      "origin": "tomato",
      "tomatoJobId": "job-20260831-0001",
      "prompt": "a plastic pill bottle with a flip-top cap, slightly open, centered, plain light gray background, soft studio lighting"
    }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "cylindrical body with hinged flip-top cap and printed label band",
    "complexity": "complex"
  },
  "componentTree": [
    {
      "id": "body",
      "name": "bottle body",
      "level": "macro",
      "primitive": "cylinder",
      "dimensions": { "w": 0.05, "h": 0.10, "d": 0.05, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, 0.05, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null,
      "attachment": { "type": "none" },
      "material": "amber-plastic",
      "collider": { "type": "cylinder", "size": [0.05, 0.10, 0.05], "offset": [0, 0, 0], "confidence": 0.85 }
    },
    {
      "id": "cap",
      "name": "flip-top cap",
      "level": "macro",
      "primitive": "cylinder",
      "dimensions": { "w": 0.052, "h": 0.02, "d": 0.052, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.11, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "body",
      "attachment": {
        "type": "hinge",
        "socket": "body:rim-back",
        "hinge": { "pivot": [0, -0.01, -0.024], "axis": [1, 0, 0], "limits": [0, 1.92] }
      },
      "material": "cap-plastic",
      "collider": { "type": "cylinder", "size": [0.052, 0.02, 0.052], "offset": [0, 0, 0], "confidence": 0.8 }
    },
    {
      "id": "label",
      "name": "printed label band",
      "level": "meso",
      "primitive": "box",
      "dimensions": { "w": 0.05, "h": 0.03, "d": 0.001, "units": "m", "confidence": 0.7 },
      "transform": { "position": [0, 0.05, 0.0251], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "body",
      "attachment": { "type": "fixed", "socket": "body:front-face" },
      "material": "label-print"
    }
  ],
  "materials": [
    { "id": "amber-plastic", "kind": "procedural", "baseColor": [0.8, 0.52, 0.2], "roughness": 0.35, "alpha": 0.85 },
    { "id": "cap-plastic", "kind": "procedural", "baseColor": [0.9, 0.9, 0.9], "roughness": 0.4 },
    { "id": "label-print", "kind": "dynamicTexture", "baseColor": [1, 1, 1], "roughness": 0.9 }
  ],
  "physics": {
    "bodies": [
      { "id": "body", "components": ["body", "label"], "mass": 0.04, "friction": 0.5,
        "restitution": 0.3, "centerOfMass": [0, -0.01, 0] },
      { "id": "cap", "components": ["cap"], "mass": 0.008, "friction": 0.5, "restitution": 0.3 }
    ],
    "constraints": [
      { "type": "hinge", "bodyA": "body", "bodyB": "cap",
        "pivotA": [0, 0.10, -0.024], "pivotB": [0, -0.01, -0.024],
        "axis": [1, 0, 0], "limits": [0, 1.92] }
    ]
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

驗證：

```console
$ python3 forge/validate_spec.py /tmp/pill-example.json --strict
OK
```
