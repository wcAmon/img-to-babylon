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
- `type: "joint"` 的 constraint（多軸限位，如 ragdoll 的肩/髖/脖子）必須同時有
  `axis` 與 `angular`。`angular` 是 `{x|y|z: 值}` 的物件（至少一軸），每軸的值為
  `[lo, hi]` 數字對、`"free"` 或 `"locked"`；**省略的軸視同 `"locked"`**。
  軸名以 constraint 的 `axis` 為 X 建立局部座標（對應 6DoF 的 ANGULAR_X/Y/Z）：

  ```jsonc
  { "type": "joint", "bodyA": "torso", "bodyB": "upper-arm-l",
    "pivotA": [0.02, 0.04, 0], "pivotB": [0, 0.018, 0],
    "axis": [1, 0, 0],
    "angular": { "x": [-0.5, 3.0], "y": [-0.8, 0.8], "z": [-0.3, 1.6] } }
  ```

  單軸關節（肘、膝）**不要用 joint**，用既有的 `hinge`。

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
- `attachment.type == "joint"` 的元件走同一套比對，鏡像欄位放在 `attachment.joint`
  （`pivot` / `axis` / `angular`）：axis 完全相同、pivot 對 `pivotB` ≤ 5mm、
  `angular`（若有寫）與 constraint 的 `angular` 完全相同。

## `proportions`：角色頭身比 gate（選填）

人形/角色 spec 加頂層 `proportions` 區塊，validate_spec 會多跑比例 gate；
非角色 spec（車、罐子）不寫這塊，完全不受影響：

```jsonc
"proportions": {
  "head_component": "head",   // componentTree 中頭部元件的 id（必須存在）
  "head_unit": 0.032,         // 一顆頭的高度（米）
  "total_heads": 4.0,         // 全身幾頭身（玩具公仔 3–4.5；寫實 7–8）
  "tolerance": 0.15           // 相對容差（選填，預設 0.15 = ±15%）
}
```

檢查兩條：head 元件的 `dimensions.h` ≈ `head_unit`；模型全高（沿 parent 鏈累加
`position.y`、取所有元件 `±h/2` 的世界 Y 範圍）≈ `head_unit × total_heads`。
兩條都以 `tolerance` 為相對容差。

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

## 關節鏈質量比

- 相鄰關節兩側的有效質量比應控制在約 `10:1` 以內，spec `physics.bodies[].mass`
  與 factory 定義必須一致。倒單擺探針中，85 kg 上身由 1 kg 底座支撐必翻，底座
  提高到 5 kg 才恢復剛體權威；過大的質量比會讓 Havok POSITION 馬達呈現黏滑或失去權威。
  action-figure 腿鏈參考值為 thigh `0.005 kg`、calf `0.008 kg`、boot `0.005 kg`。

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


## rupture（M10 可破裂 body）

點滴袋類物件破裂時袋身不分家、液體離開——契約是**質量轉移**，不是剛體分裂。
在 `physics.bodies[]` 上選填：

```json
{ "id": "bag", "components": ["bag", "liquid", "label"], "mass": 0.55,
  "rupture": { "impulseThreshold": 2.0, "emptiedMass": 0.04, "puddleRadius": 0.30, "droplets": 12 } }
```

- `impulseThreshold`（N·s）：單一物理步的動量變化 |Δv|·m 超過即破裂；正數。
- `emptiedMass`（kg）：排空後質量，必須小於 `mass`。
- `puddleRadius`（m）：水漬最終半徑；正數。
- `droplets`：破裂時噴出的液滴剛體數；非負整數。

factory 契約：掛 actuator `rupture:<bodyId>`（kind `"rupture"`，min 0、max 1，`set(1)` 觸發、
冪等）；破裂後 `bodies[<bodyId>]` 質量 = emptiedMass、`meshes["puddle"]` 出現、
`bodies["droplet-<i>"]` 共 `droplets` 個。gate：`viewer/scripts/rupture_test.ts`。

## pour（M11 可傾倒 body）

粉罐類物件傾倒時容器不變、內容物離開——契約仍是**質量轉移**，但是**節流**的：傾角夠大、
蓋子夠開、還有存量時每秒倒出固定顆數。在 `physics.bodies[]` 上選填：

```json
{ "id": "bottle", "components": ["bottle", "powder-face", "label-band"], "mass": 0.45,
  "pour": { "tiltThreshold": 1.2, "grains": 40, "grainMass": 0.003, "ratePerSecond": 20,
            "gate": { "body": "cap", "minAngle": 1.0 } } }
```

- `tiltThreshold`（rad，**選填**）：body 局部 +y 與世界 +y 的夾角達此值才倒；(0, π)。缺省 = 不看傾角（噴瓶），
  此時 `gate` 必填（否則出廠即永倒）。
- `grains`：總顆數（正整數）；`grainMass`（kg）：每顆質量；`grains × grainMass < mass`。
- `ratePerSecond`：倒出速率（顆／秒），正數。
- `direction`（選填，預設 [0, 1, 0]）：body 局部單位向量，內容物初速方向（噴瓶用噴嘴 +z）。
- `exitSpeed`（選填，m/s，預設 0.3）：內容物離開容器的初速。生成點由 factory 決定（頸口或噴嘴），契約不規定。
- `gate`（選填）：`body` 必須是掛在本 body 上（bodyA = 本 body）的 hinge 之 bodyB；hinge 角
  ≥ `minAngle`（須在該 hinge limits 內）才倒。
- `source`（選填，預設 `"declared"`）：`"collected"` 時倒出的是本 body `collect` 收進來的東西，逐顆歸還原質量與原半徑；
  此時 **不得**有 `grains`／`grainMass`、同 body **必須**有 `collect`；`ratePerSecond`／`tiltThreshold`／`gate`／`direction`／`exitSpeed` 規則不變。
  倒出的 body 命名 `bodies["clump-<i>"]`／`meshes["clump-<i>"]`（i 單調遞增、不重用），與 `grain-<i>` 區分。
  有 `direction` 時**出口方向的世界 y < 0 才倒**（唇朝上的後仰不算，否則顆粒會從朝上的唇噴出又掉回斗）。（M17）

factory 契約：掛 actuator `pour:<bodyId>`（kind `"pour"`，min 0、max 1，`set(1)` 立即倒出全部剩餘、
冪等；`set(0)` 無事）；每倒一顆 `bodies[<bodyId>]` 質量減 `grainMass`，顆粒為 `bodies["grain-<i>"]`
／`meshes["grain-<i>"]`。gate：`viewer/scripts/pour_test.ts`。

## collect（M12 容器 body）

廢棄物袋類物件封袋時把掉進來的東西收進袋身——契約是**反向的質量轉移**。在 `physics.bodies[]` 上選填：

```json
{ "id": "bag", "components": ["bag", "bag-bottom", "wall-front", "wall-back", "wall-left", "wall-right"], "mass": 0.20,
  "collect": { "interior": { "size": [0.288, 0.35, 0.188], "offset": [0, 0.005, 0] }, "maxItemMass": 0.05 } }
```

- `interior.size`（m，三正數）／`interior.offset`（三數）：body 局部框的收納區（開口容器的內腔）。
- `maxItemMass`（kg）：只收質量 ≤ 此值的外來 dynamic body；必須小於 `mass`。
- `trigger`（選填，預設 `"manual"`）：`"contact"` 時每個物理步掃描，合格 body 質心一進 interior 就立刻收走，不需 set(1)；
  `collect:<bodyId>` actuator 仍必掛（手動補收、冪等）。gate：`viewer/scripts/collect_test.ts` contact 分支、`viewer/scripts/sweep_test.ts`。（M17）

factory 契約：掛 actuator `collect:<bodyId>`（kind `"collect"`，min 0、max 1，`set(1)` 觸發、冪等、可重複收新掉進來的
東西；`set(0)` 無事）。觸發時凡**不屬本模型、dynamic、0 < 質量 ≤ maxItemMass、質心在 interior 世界框內**的 body 連 mesh
一起 `dispose()`，本 body 質量加上收進的總質量。gate：`viewer/scripts/collect_test.ts`。

## actuation（M4 可動物件契約）

模型「遊戲可用」的標準是可動件可驅動、可審查。宣告了 actuation 的 spec 必須通過
`viewer/scripts/actuation_test.ts` gate（宣告了但動不了 = FAIL）。

constraint 上（drive / steer / servo）：

```json
{ "type": "hinge", "bodyA": "chassis", "bodyB": "wheel-rl", "limits": "free",
  "actuation": { "type": "drive", "targetSpeed": 25, "maxForce": 0.02 } }
{ "type": "hinge", "bodyA": "chassis", "bodyB": "knuckle-fl", "limits": [-0.45, 0.45],
  "actuation": { "type": "steer", "range": [-0.4, 0.4], "maxForce": 0.5 } }
{ "type": "joint", "bodyA": "torso", "bodyB": "head", "angular": { "x": [-0.6, 0.6] },
  "actuation": { "type": "servo", "maxForce": 0.02 } }
```

- `drive` 只准掛在 `limits:"free"` 的 hinge；`targetSpeed`（rad/s）與 `maxForce` 必填正數。
- `steer` 只准掛在有數字 limits 的 hinge；`range` 必須在 limits 內。
- `servo` 掛在有數字 limits 的 hinge 或 joint；每個非鎖定角軸各生一支 actuator。

component 上（light，非物理）：

```json
{ "id": "headlight-l", "material": "headlight-silver",
  "actuation": { "type": "light", "emissive": { "on": "#ffefa8", "off": "#141410" } } }
```

factory 契約：模型出廠掛 `actuators`（見 `viewer/src/types.ts` 的 Actuator）——
`drive` 一支（set 為 targetSpeed 比例 -1..1）、`steer` 一支（set 為目標角，出廠即置中）、
`servo:<bodyB>.<axis>` 逐軸（set 為目標角，夾限位）、`light:<componentId>` 逐件。
drive/servo 馬達惰性啟動（第一次 set 前不影響物理——否則毀掉自由滾動/ragdoll）。

## 動作時間線

`forge/retarget.py` 把 GLB 骨骼的局部 rotation 動畫轉成公仔 servo 角度時間線：

```console
python3 forge/retarget.py motion.glb \
  --spec viewer/models/action-figure/spec.json \
  --out timeline.json --fps 20
```

輸出 JSON 契約：

```json
{
  "model": "action-figure",
  "fps": 20,
  "frames": 21,
  "tracks": {
    "servo:head.x": [0.0, 0.025, 0.05],
    "servo:head.y": [0.0, 0.0, 0.0],
    "servo:forearm-l.x": [0.0, -0.1, -0.2]
  }
}
```

例中陣列為節錄；實際輸出的每個陣列都必須恰有 `frames` 個弧度值。`tracks` 的鍵只能
是 spec 中 `actuation.type == "servo"` 所宣告的軸：hinge 僅有 `x`，joint 則包含
`angular` 中所有非 `"locked"` 軸。每一軌等長；每個值已夾進該 constraint 在 spec
宣告的數字 angular 限位。GLB 沒有映射到的 servo 軸仍須存在，並輸出全零軌。
