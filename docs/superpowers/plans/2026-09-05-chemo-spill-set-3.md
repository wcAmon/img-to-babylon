# 化療潑灑處理套件第三批（M12）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 img2babylon 六步流程產出三個新物件（消毒劑扳機噴瓶／開口自立廢棄物袋／小鏟＋推板），`pour` 契約加三個選填欄位、新增 `collect` 契約與 gate，playground 擴到十件並重部署。

**Architecture:** 先擴契約（forge validate_spec TDD＋grimoire → viewer types／harness／actuation_test／pour_test 切換／`collect_test.ts`），再依序做三個 factory（噴瓶沿用 `hinge.ts` 助手與 pour 機制；袋子一 body 五 collider＋collect 掃描 `PhysicsEngineV2.getBodies()`；鏟刮板兩自由 body），最後 playground 加場景項、卡片、scene_test 斷言並 `npm run serve` 重部署。

**Tech Stack:** Python 3.10+ stdlib（forge）、TypeScript strict、Babylon.js 8 + Havok、Vite 6、tsx、playwright MCP（截圖）、tomato-image（生參考圖）、Tailscale serve、launchd。

**Spec:** `docs/superpowers/specs/2026-09-05-chemo-spill-set-3-design.md`

## Global Constraints

- forge/ 只准 Python 3.10+ stdlib，零第三方依賴。
- viewer/ TypeScript strict；只能程式碼建模（primitives / CSG / DynamicTexture），禁止外部 mesh 或貼圖。
- 單位公尺、尺寸烘進幾何參數、程序化雜訊帶 seed、`physics.constraints` 是物理權威。
- 物理尺度 S=1（`physicsScale: 1`）。factory 出廠 body 密度 50–3000 kg/m³。
- 每個模型走 `next_pass.py` 五 pass；每 pass 第 4 次、全程第 6 次修正會被擋（exit 3 = 停下問使用者）。
- `.img2babylon/` 是 gitignored 執行期狀態；state.json 一次只屬一個模型（換模型 `init --force`）；兩模型的 next_pass 命令不可並行。
- 截圖先存 `.img2babylon/shots/` 再讀回；一次只看一張對照表。
- Havok 質量 float32：gate 容差 1e-5。生成的小球加線性／角阻尼 2.0。
- 同模型相鄰活動件：`shape.filterMembershipMask = GROUP(2); shape.filterCollideMask = ~GROUP`；生成物 `membership 4 / collide ~2`。
  **新規則（M12）**：無活動件的容器類模型（袋子、鏟刮板）用 `membership 8 / collide ~0`，否則粉罐顆粒（collide ~2）會穿過它們。
- hinge 角 0 = 出廠姿勢；曲面文字用 `CreateRibbon`；正面 plane 畫布垂直翻轉 `c.translate(0, h); c.scale(1, -1)`；平鋪 DynamicTexture 設 WRAP。
- check_colliders 同 body collider 重疊以 AABB 計：相鄰 collider 齊平（touch）不重疊。
- commit 訊息尾端固定加：
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 與
  `Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6`。
- bash 每次呼叫 cwd 可能殘留上次 `cd`：每個命令用絕對路徑或開頭 `cd <repo>`。zsh 分隔符用 `'---'`。
- playground 對外網址 `https://<internal-host>/`。

---

## 檔案地圖

| 路徑 | 責任 |
|---|---|
| `forge/validate_spec.py` | `_check_pour` 加 direction／exitSpeed／tilt 選填規則；新增 `_check_collect` |
| `forge/tests/test_validate_spec.py` | pour 擴充 4 測試、collect 5 測試 |
| `grimoire/spec.md`、`grimoire/physics.md` | pour 欄位補寫、collect 新節 |
| `viewer/src/types.ts` | `Actuator.kind` 加 `"collect"` |
| `viewer/src/harness.ts` | 面板對 collect 用按鈕 |
| `viewer/scripts/actuation_test.ts` | SpecPour tilt 選填；collect coverage＋無物觸發檢查 |
| `viewer/scripts/pour_test.ts` | 依有無 tiltThreshold 切換側躺／直立情境 |
| `viewer/scripts/collect_test.ts`（新） | 收納 gate |
| `viewer/models/disinfectant-spray/{spec.json,createDisinfectantSprayModel.ts}` | 噴瓶 |
| `viewer/models/cytotoxic-waste-bag/{spec.json,createCytotoxicWasteBagModel.ts}` | 廢棄物袋 |
| `viewer/models/scoop-and-scraper/{spec.json,createScoopAndScraperModel.ts}` | 鏟刮板 |
| `viewer/src/registry.ts` | 註冊三個新模型 |
| `../playground/src/{scene.ts,ui.ts}`、`../playground/scripts/scene_test.ts` | 十件場景 |
| `ROADMAP.md`、`tasks/0024-chemo-spill-set-3.md`、`docs/next-steps.md`、`.remember/remember.md` | 結案 |

## 共用流程片段（各模型任務引用）

**A. 視覺 gate 截圖（playwright MCP）**：viewer dev server 在 5173（`cd <repo>/viewer && nohup npm run dev -- --port 5173 > /dev/null 2>&1 &`，已在跑就略過）。
`browser_navigate` 到 `http://localhost:5173/#model=<name>&physics=1`，換模型後必 `browser_evaluate` 執行 `location.reload()` 再等 900 ms。截圖：

```js
async () => {
  const c = window.__IMG2BABYLON_CAPTURE__;
  const cam = { alpha: -0.9, beta: 1.15, radius: 0.9, target: [0, 0.15, 0] }; // 每模型自訂
  c.setCamera(cam); await new Promise(r => setTimeout(r, 400)); c.setCamera(cam);
  await new Promise(r => setTimeout(r, 200));
  return { hero: await c.screenshot() };
}
```

以 `filename` 參數存成 `.img2babylon/shots/<name>-hero.json`，再
`python3 <scratchpad>/decode.py .img2babylon/shots/<name>-hero.json hero=.img2babylon/shots/<name>-hero.png`。
decode.py（scratchpad 清空就重建）：

```python
import base64, json, sys
data = json.load(open(sys.argv[1]))
for pair in sys.argv[2:]:
    key, out = pair.split("=", 1)
    b64 = data[key].split(",", 1)[-1]
    open(out, "wb").write(base64.b64decode(b64))
```

碰撞線框：snapshot 找「碰撞線框」按鈕 `browser_click`（`text=碰撞線框`），用 `browser_take_screenshot` 視口截圖，檔案落在 repo 根，`mv` 進 `.img2babylon/shots/<name>-collider.png`。

**B. 對照與預審**：
```bash
cd <repo> && python3 forge/compare.py .img2babylon/<name>/hero.png .img2babylon/shots/<name>-hero.png --out .img2babylon/<name>/sheet.png && python3 forge/divine_eye.py --reference .img2babylon/<name>/hero.png --render .img2babylon/shots/<name>-hero.png --json
```
Read `sheet.png` 目視評分（likeness／colliderFit 1–10）。REJECT 先分類是否三種系統性原因（天際帶／白主體淺灰地板／多物件構圖）；是 → 目視判定並在 reviewHistory 註明；否 → `next_pass.py correction` 修模型（exit 3 停下問使用者）。

**C. pass 節奏**：`python3 forge/next_pass.py status` 看當前 pass → 做完該 pass 內容 → 跑 headless gate＋視覺 gate → spec `reviewHistory` 追加 `{pass, likeness, colliderFit, eye:{verdict,fidelity,iou}, action:"continue", notes}` → `python3 forge/next_pass.py done`。五 pass：blockout（主幾何＋collider）、structure（細節件）、material（顏色／貼圖）、physics（質量／hinge／servo／pour／collect 校準）、polish（常數推導、dispose、metadata）。

---

### Task 1: 契約 forge 側——pour 擴充＋collect（validate_spec TDD）＋grimoire

**Files:**
- Modify: `forge/validate_spec.py`（`_check_pour` 改寫；`_check_rupture` 之前加 `_is_num`；`_check_pour` 之後加 `_check_collect`；bodies 迴圈呼叫）
- Modify: `forge/tests/test_validate_spec.py`（`test_pour_missing_field` 之後加 9 個測試）
- Modify: `grimoire/spec.md`（pour 節補欄位、rupture／pour 之後加 collect 節）、`grimoire/physics.md`（傾倒節補寫、restOffset 節之後加收納節）

**Interfaces:**
- Produces: spec 欄位 `pour = { tiltThreshold?, grains, grainMass, ratePerSecond, direction?: [x,y,z], exitSpeed?, gate?: { body, minAngle } }`（無 tiltThreshold 時 gate 必填）；
  `collect = { interior: { size: [w,h,d], offset: [x,y,z] }, maxItemMass }`。

- [x] **Step 1: 寫失敗測試**

在 `forge/tests/test_validate_spec.py` 的 `test_pour_missing_field` 之後加入：

```python
    def test_pour_without_tilt_requires_gate(self):
        pour = {k: v for k, v in self.POUR_OK.items() if k not in ("tiltThreshold", "gate")}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "gate" in e for e in errors))
        pour = {k: v for k, v in self.POUR_OK.items() if k != "tiltThreshold"}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=True)
        self.assertEqual(errors, [])

    def test_pour_direction_unit_vector(self):
        for bad in ([0, 0, 2], [1, 0], "up", [0, 0, True]):
            pour = dict(self.POUR_OK, direction=bad)
            errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
            self.assertTrue(any("pour" in e and "direction" in e for e in errors), bad)
        pour = dict(self.POUR_OK, direction=[0, 0, 1])
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=True)
        self.assertEqual(errors, [])

    def test_pour_exit_speed_positive(self):
        for bad in (0, -1, "fast"):
            pour = dict(self.POUR_OK, exitSpeed=bad)
            errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
            self.assertTrue(any("pour" in e and "exitSpeed" in e for e in errors), bad)

    def test_pour_spray_shape_passes(self):
        pour = {"grains": 60, "grainMass": 0.002, "ratePerSecond": 30, "direction": [0, 0, 1],
                "exitSpeed": 2.5, "gate": {"body": "cap", "minAngle": 0.3}}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=True)
        self.assertEqual(errors, [])

    def _with_collect(self, collect, mass=0.2):
        spec = minimal_spec()
        body = spec["physics"]["bodies"][0]
        body["mass"] = mass
        body["collect"] = collect
        return spec

    COLLECT_OK = {"interior": {"size": [0.288, 0.35, 0.188], "offset": [0, 0.005, 0]}, "maxItemMass": 0.05}

    def test_collect_valid_passes(self):
        errors, _ = validate_spec.validate(self._with_collect(dict(self.COLLECT_OK)), strict=True)
        self.assertEqual(errors, [])

    def test_collect_interior_size_three_positive(self):
        for bad in ([0.1, 0, 0.1], [0.1, 0.1], "big", [0.1, -0.1, 0.1]):
            col = {"interior": {"size": bad, "offset": [0, 0, 0]}, "maxItemMass": 0.05}
            errors, _ = validate_spec.validate(self._with_collect(col), strict=False)
            self.assertTrue(any("collect" in e and "size" in e for e in errors), bad)

    def test_collect_interior_offset_three_numbers(self):
        for bad in ([0, 0], "center", [0, "a", 0]):
            col = {"interior": {"size": [0.1, 0.1, 0.1], "offset": bad}, "maxItemMass": 0.05}
            errors, _ = validate_spec.validate(self._with_collect(col), strict=False)
            self.assertTrue(any("collect" in e and "offset" in e for e in errors), bad)

    def test_collect_max_item_mass_positive(self):
        for bad in (0, -0.1, "light"):
            col = dict(self.COLLECT_OK, maxItemMass=bad)
            errors, _ = validate_spec.validate(self._with_collect(col), strict=False)
            self.assertTrue(any("collect" in e and "maxItemMass" in e for e in errors), bad)

    def test_collect_max_item_mass_below_body_mass(self):
        col = dict(self.COLLECT_OK, maxItemMass=0.5)  # body mass 0.2
        errors, _ = validate_spec.validate(self._with_collect(col), strict=False)
        self.assertTrue(any("collect" in e and "maxItemMass" in e for e in errors))
        errors, _ = validate_spec.validate(self._with_collect({"interior": "box", "maxItemMass": 0.05}), strict=False)
        self.assertTrue(any("collect" in e and "interior" in e for e in errors))
```

- [x] **Step 2: 跑測試確認失敗**

```bash
cd <repo> && python3 -m unittest forge.tests.test_validate_spec -v 2>&1 | tail -25
```
Expected：`test_pour_without_tilt_requires_gate`（第一段 tilt 缺就報 tiltThreshold 錯而非 gate 錯→FAIL）、`test_pour_direction_unit_vector`、`test_pour_exit_speed_positive`、`test_pour_spray_shape_passes`、五個 `test_collect_*` FAIL；其餘 OK。

- [x] **Step 3: 實作驗證**

`forge/validate_spec.py`：在 `_check_rupture` 之前加

```python
def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)
```

把 `_check_pour` 整個換成：

```python
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
    for key in _POUR_POSITIVE:
        v = pour.get(key)
        if not _is_num(v) or v <= 0:
            errors.append(f"body {bid} pour.{key} 必須為正數")
    grains = pour.get("grains")
    if not isinstance(grains, int) or isinstance(grains, bool) or grains <= 0:
        errors.append(f"body {bid} pour.grains 必須為正整數")
    mass, gm = body.get("mass"), pour.get("grainMass")
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
```

bodies 迴圈裡 `_check_pour(...)` 之後加一行 `_check_collect(bid, b, errors)`。

- [x] **Step 4: 跑測試確認通過**

```bash
cd <repo> && python3 -m unittest discover -s forge/tests -t . -p 'test_*.py' 2>&1 | tail -3 && python3 forge/validate_spec.py viewer/models/absorbent-powder-shaker/spec.json --strict
```
Expected：`Ran 121 tests … OK`（112＋9）；粉罐 spec 仍 `OK`。

- [x] **Step 5: grimoire 文件**

`grimoire/spec.md` pour 節：`tiltThreshold` 那行改成
「`tiltThreshold`（rad，**選填**）：body 局部 +y 與世界 +y 的夾角達此值才倒；(0, π)。缺省 = 不看傾角（噴瓶），此時 `gate` 必填。」
並在 `ratePerSecond` 行之後加：
「- `direction`（選填，預設 [0, 1, 0]）：body 局部單位向量，內容物初速方向（噴瓶用噴嘴 +z）。
- `exitSpeed`（選填，m/s，預設 0.3）：內容物離開容器的初速。生成點由 factory 決定（頸口或噴嘴）。」

pour 節之後、actuation 節之前加：

```markdown
## collect（M12 容器 body）

廢棄物袋類物件封袋時把掉進來的東西收進袋身——契約是**反向的質量轉移**。在 `physics.bodies[]` 上選填：

```json
{ "id": "bag", "components": ["bag", "bag-bottom", "wall-front", "wall-back", "wall-left", "wall-right"], "mass": 0.20,
  "collect": { "interior": { "size": [0.288, 0.35, 0.188], "offset": [0, 0.005, 0] }, "maxItemMass": 0.05 } }
```

- `interior.size`（m，三正數）／`interior.offset`（三數）：body 局部框的收納區（開口容器的內腔）。
- `maxItemMass`（kg）：只收質量 ≤ 此值的外來 dynamic body；必須小於 `mass`。

factory 契約：掛 actuator `collect:<bodyId>`（kind `"collect"`，min 0、max 1，`set(1)` 觸發、冪等、可重複收新掉進來的
東西；`set(0)` 無事）。觸發時凡**不屬本模型、dynamic、0 < 質量 ≤ maxItemMass、質心在 interior 世界框內**的 body 連 mesh
一起 `dispose()`，本 body 質量加上收進的總質量。gate：`viewer/scripts/collect_test.ts`。
```

`grimoire/physics.md` 傾倒節（M11 pour）第一個項目之後加：
「- 無 `tiltThreshold`（噴瓶）：只看 gate 角與存量。`direction` 用 `Vector3.TransformNormal(dir, node.getWorldMatrix())` 轉世界；初速 = 容器速度 + dir × `exitSpeed`；生成點 = pivot 局部偏移（噴嘴）同法轉世界。」

restOffset 節之後加：

```markdown
## 收納＝反向的質量轉移（M12 collect）

- 掃描：`(scene.getPhysicsEngine() as PhysicsEngineV2).getBodies()` 取全場 body；**先複製陣列**再迭代（dispose 會從原陣列移除）。
  排除本模型的 body（`Set(Object.values(bodies))`）、`isDisposed`、非 `PhysicsMotionType.DYNAMIC`、質量 0 或 > `maxItemMass`。
- 判定：`Vector3.TransformCoordinates(b.transformNode.absolutePosition, Matrix.Invert(pivot.getWorldMatrix()))` 減 `interior.offset`，
  三軸絕對值皆 ≤ size/2 即在內。
- 收走：`body.dispose(); body.transformNode.dispose()`。Babylon `PhysicsBody.dispose()` 有 `_isDisposed` 守衛、`isDisposed` getter：
  擁有者模型（粉罐、噴瓶）之後 `dispose()` 對同一 body 再呼叫不會炸。**所有讀 `bodies` 的消費者要跳過 `isDisposed`**
  （playground HUD／topple／scene_test 計數）。不用「隱藏＋改 static」——Havok static body 的質量回報不可靠。
- 質量：`setMassProperties({ mass: 原質量 + Σ 收進, centerOfMass })`（質心要重給）。
- 碰撞群組陷阱：粉罐顆粒與噴瓶液滴 `collide = ~2`，會穿過所有 `membership 2` 的模型件。無活動件的容器類模型（袋子、鏟刮板）
  用 `membership 8 / collide ~0`，生成物才會落進去、推得動。
- 封袋視覺只做一次（口緣 tube `scaling.set(0.3, 1, 0.3)`＋打結 mesh `setEnabled(true)`），之後 set(1) 仍可收新掉進來的東西。
```

- [x] **Step 6: Commit**

```bash
cd <repo> && git add forge/validate_spec.py forge/tests/test_validate_spec.py grimoire/spec.md grimoire/physics.md && git commit -m "M12 契約 forge 側：pour 加 direction／exitSpeed、tiltThreshold 選填（無則 gate 必填）；新增 collect（interior／maxItemMass）；validate_spec TDD 9 測試、grimoire 兩檔

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 2: 契約 viewer 側——types／harness／actuation_test／pour_test 切換／collect_test

**Files:**
- Modify: `viewer/src/types.ts`（`Actuator.kind`、註解）
- Modify: `viewer/src/harness.ts:130`
- Modify: `viewer/scripts/actuation_test.ts`（SpecPour／SpecCollect、collectDecls、coverage、runCollect）
- Modify: `viewer/scripts/pour_test.ts`（`lying` 依 tiltThreshold）
- Create: `viewer/scripts/collect_test.ts`

**Interfaces:**
- Consumes: Task 1 的 spec 欄位。
- Produces: `Actuator.kind` 含 `"collect"`；gate 命令 `npx tsx scripts/collect_test.ts <model> --spec <spec.json>`；pour_test 對無 tiltThreshold 的 spec 跑直立情境。

- [x] **Step 1: types.ts**

`viewer/src/types.ts` 的 `Actuator`：

```ts
  id: string; // "drive" | "steer" | `servo:<bodyB>.<axis>` | `light:<componentId>` | `rupture:<bodyId>` | `pour:<bodyId>` | `collect:<bodyId>`
  kind: "drive" | "steer" | "servo" | "light" | "rupture" | "pour" | "collect";
```

- [x] **Step 2: harness.ts**

第 130 行條件改 `if (act.kind === "rupture" || act.kind === "pour" || act.kind === "collect") {`，註解補「M12 collect 同樣」。

- [x] **Step 3: actuation_test.ts**

介面：

```ts
interface SpecPour { tiltThreshold?: number; grains: number; grainMass: number; ratePerSecond: number; direction?: number[]; exitSpeed?: number; gate?: { body: string; minAngle: number } }
interface SpecCollect { interior: { size: number[]; offset: number[] }; maxItemMass: number }
interface SpecBody { id: string; mass: number; rupture?: SpecRupture; pour?: SpecPour; collect?: SpecCollect }
```

`pourDecls` 之後加 `const collectDecls = (spec.physics?.bodies ?? []).filter((b) => b.collect);`，「spec 無 actuation 宣告」的條件加 `&& !collectDecls.length`。

coverage 迴圈（pour 之後）：

```ts
  for (const b of collectDecls) {
    push(`coverage:collect:${b.id}`, byId.has(`collect:${b.id}`),
      byId.has(`collect:${b.id}`) ? "有 collect actuator" : "spec 宣告 collect 但無 actuator");
  }
  // ---- collect（M12）：無物時觸發不改質量、冪等（有物收納由 collect_test 驗）----
  const runCollect = (): void => {
    for (const b of collectDecls) {
      const act = byId.get(`collect:${b.id}`);
      const body = model.bodies[b.id];
      if (!act || !body) continue;
      act.set(1); step(2);
      const m1 = body.getMassProperties().mass ?? NaN;
      act.set(1); step(2);
      const m2 = body.getMassProperties().mass ?? NaN;
      push(`collect:${b.id}`, Math.abs(m1 - b.mass) < 1e-5 && Math.abs(m2 - b.mass) < 1e-5,
        `無物觸發兩次質量 ${m1}/${m2}（期望 ${b.mass}）`);
    }
  };
```

最後一行改：`if (ruptureDecls.length || pourDecls.length || collectDecls.length) { step(T(SETTLE_STEPS)); runRupture(); runPour(); runCollect(); }`。

- [x] **Step 4: pour_test.ts 切換**

`SpecPour.tiltThreshold` 改選填（`tiltThreshold?: number`）。檔頭註解補「無 tiltThreshold 的 spec（噴瓶）：A′／B′ 直立、gate 閉／開；C′ 不開 gate 直立 120 步無顆粒」。

迴圈開頭加 `const lying = pour.tiltThreshold !== undefined;`，三處 `spawn(name, true)` 改 `spawn(name, lying)`，情境 C 的 `spawn(name, false)` 不動；C 的 `openGate(model, spec, decl);` 改 `if (lying) openGate(model, spec, decl);`。detail 文字：A 改 `${lying ? "蓋閉側躺" : "gate 閉直立"}`，C 改 `${lying ? "直立蓋開" : "直立 gate 閉"}`。

- [x] **Step 5: 新檔 `viewer/scripts/collect_test.ts`**

```ts
// 收納 gate（M12 collect）：spec 有 collect 的 body 必須 (1) 自 interior 上方 0.30 m 丟 8 顆測試球（d 0.012、0.005 kg）
// ＋袋外 2 顆，300 步後 8 顆質心皆在 interior 世界框內、全部有限；(2) collect:<id> set(1) → 8 顆 mesh／body dispose、
// 質量 = mass + 8×0.005（1e-5）、袋外 2 顆不動；(3) 再 set(1) 質量不變；(4) 模型 dispose 後場景只剩地面與袋外 2 顆。
// 用法: npx tsx scripts/collect_test.ts <model-name> --spec <spec.json> [--out result.json]
import {
  Matrix,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  Quaternion,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";

const LAND_STEPS = 120;
const DROP_STEPS = 300;
const DROP_HEIGHT = 0.30;
const N_IN = 8, N_OUT = 2;
const BALL_D = 0.012, BALL_MASS = 0.005, BALL_DAMPING = 2.0;
const SCATTER = 0.05;
const OUT_X = 0.5;

interface SpecCollect { interior: { size: number[]; offset: number[] }; maxItemMass: number }
interface SpecBody { id: string; mass: number; collect?: SpecCollect }
interface Spec { physics?: { bodies?: SpecBody[] } }
interface Check { id: string; ok: boolean; detail: string }

function makeBall(scene: Scene, name: string, pos: Vector3): PhysicsBody {
  const m = MeshBuilder.CreateSphere(name, { diameter: BALL_D, segments: 6 }, scene);
  m.position.copyFrom(pos);
  const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
  const s = new PhysicsShapeSphere(Vector3.Zero(), BALL_D / 2, scene);
  s.material = { friction: 0.6, restitution: 0.05 };
  b.shape = s;
  b.setMassProperties({ mass: BALL_MASS });
  b.setLinearDamping(BALL_DAMPING); b.setAngularDamping(BALL_DAMPING);
  return b;
}

/** interior 世界框：中心與「點是否在內」判定（body 局部框 → 世界）。 */
function interiorOf(body: PhysicsBody, c: SpecCollect): { center: Vector3; inside(p: Vector3): boolean } {
  const node = body.transformNode;
  node.computeWorldMatrix(true);
  const wm = node.getWorldMatrix();
  const inv = Matrix.Invert(wm);
  const off = Vector3.FromArray(c.interior.offset);
  const half = Vector3.FromArray(c.interior.size).scale(0.5);
  return {
    center: Vector3.TransformCoordinates(off, wm),
    inside(p: Vector3): boolean {
      const l = Vector3.TransformCoordinates(p, inv).subtract(off);
      return Math.abs(l.x) <= half.x && Math.abs(l.y) <= half.y && Math.abs(l.z) <= half.z;
    },
  };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath) {
    console.error(`用法: collect_test.ts <model-name> --spec <spec.json> [--out result.json]；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const decls = (spec.physics?.bodies ?? []).filter((b) => b.collect);
  if (!decls.length) {
    console.log(JSON.stringify({ model: name, checks: [], pass: true, note: "spec 無 collect 宣告" }));
    return 0;
  }
  const checks: Check[] = [];
  const push = (id: string, ok: boolean, detail: string): void => { checks.push({ id, ok, detail }); };

  for (const decl of decls) {
    const ctx = await createHeadlessScene();
    const { scene, step } = ctx;
    const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
    const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
    const gShape = new PhysicsShapeBox(new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), scene);
    gShape.material = { friction: 0.7, restitution: 0.2 };
    gBody.shape = gShape;
    const factory = (await registry[name]()).default;
    const model = factory(scene, { physics: true });
    step(LAND_STEPS);
    const body = model.bodies[decl.id];
    const box = interiorOf(body, decl.collect!);
    const inBalls: PhysicsBody[] = [];
    for (let i = 0; i < N_IN; i++) {
      const a = (i / N_IN) * Math.PI * 2;
      inBalls.push(makeBall(scene, `test-in-${i}`, box.center.add(new Vector3(Math.cos(a) * SCATTER, DROP_HEIGHT, Math.sin(a) * SCATTER * 0.6))));
    }
    const outBalls = [
      makeBall(scene, "test-out-0", box.center.add(new Vector3(OUT_X, 0.1, 0))),
      makeBall(scene, "test-out-1", box.center.add(new Vector3(-OUT_X, 0.1, 0))),
    ];
    step(DROP_STEPS);
    const insideN = inBalls.filter((b) => box.inside(b.transformNode.absolutePosition)).length;
    const finite = [...inBalls, ...outBalls, ...Object.values(model.bodies)].every((b) => {
      const p = b.transformNode.absolutePosition; return [p.x, p.y, p.z].every(Number.isFinite);
    });
    push(`contain:${decl.id}`, insideN === N_IN && finite, `袋內 ${insideN}/${N_IN}、有限 ${finite}`);

    const act = model.actuators?.find((a) => a.id === `collect:${decl.id}`);
    if (!act) {
      push(`collect:${decl.id}:actuator`, false, "無 collect actuator");
    } else {
      act.set(1); step(2);
      const mass = body.getMassProperties().mass ?? NaN;
      const expected = decl.mass + N_IN * BALL_MASS;
      const gone = inBalls.filter((b) => b.isDisposed && b.transformNode.isDisposed()).length;
      const kept = outBalls.filter((b) => !b.isDisposed).length;
      push(`collect:${decl.id}:collected`, gone === N_IN && kept === N_OUT && Math.abs(mass - expected) < 1e-5,
        `收走 ${gone}/${N_IN}、袋外保留 ${kept}/${N_OUT}、質量 ${mass}（期望 ${expected}）`);
      act.set(1); step(2);
      const mass2 = body.getMassProperties().mass ?? NaN;
      push(`collect:${decl.id}:idempotent`, Math.abs(mass2 - expected) < 1e-5, `再觸發質量 ${mass2}`);
    }
    model.dispose();
    const left = scene.meshes.map((m) => m.name).sort();
    push(`collect:${decl.id}:dispose`, left.length === 1 + N_OUT && left.every((n) => n === "ground" || n.startsWith("test-out-")),
      `dispose 後場景 mesh：${left.join(",")}`);
    ctx.dispose();
  }
  const pass = checks.length > 0 && checks.every((c) => c.ok);
  const json = JSON.stringify({ model: name, checks, pass }, null, 2);
  console.log(json);
  if (outPath) writeFileSync(outPath, json);
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(2); });
```

- [x] **Step 6: tsc 與既有 gate 不退化**

```bash
cd <repo>/viewer && npx tsc --noEmit && npx tsx scripts/pour_test.ts absorbent-powder-shaker --spec models/absorbent-powder-shaker/spec.json | tail -3 && npx tsx scripts/actuation_test.ts absorbent-powder-shaker --spec models/absorbent-powder-shaker/spec.json | tail -3 && npx tsx scripts/collect_test.ts absorbent-powder-shaker --spec models/absorbent-powder-shaker/spec.json
```
Expected：tsc 無錯；pour_test 粉罐 `"pass": true`；actuation_test pass；collect_test 印 `spec 無 collect 宣告` pass。

- [x] **Step 7: Commit**

```bash
cd <repo> && git add viewer/src/types.ts viewer/src/harness.ts viewer/scripts/actuation_test.ts viewer/scripts/pour_test.ts viewer/scripts/collect_test.ts && git commit -m "M12 契約 viewer 側：Actuator kind collect、harness 按鈕、actuation_test collect 覆蓋；pour_test 依 tiltThreshold 切換直立情境；新 gate collect_test.ts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 3: `disinfectant-spray` 消毒劑扳機噴瓶（六步五 pass，pour 直立情境轉綠）

**Files:**
- Create: `viewer/models/disinfectant-spray/spec.json`、`viewer/models/disinfectant-spray/createDisinfectantSprayModel.ts`
- Modify: `viewer/src/registry.ts`（加 `"disinfectant-spray": () => import("../models/disinfectant-spray/createDisinfectantSprayModel")`）

**Interfaces:**
- Consumes: `createHinge(scene, a, b, { pivotA, pivotB, axis, limits })`、`makeHingeServo(joint, bodyB, lo, hi, maxForce, label)`、`relativeRotation`／`hingeAngle`（`viewer/src/hinge.ts`）。
- Produces: actuators `servo:trigger.x`（0–0.5）、`pour:bottle`；bodies `bottle`、`trigger`、`grain-<i>`（液滴）。

- [x] **Step 1: 初始化與參考圖**

```bash
cd <repo> && python3 forge/next_pass.py init --model disinfectant-spray --force && mkdir -p .img2babylon/disinfectant-spray && python3 forge/tomato.py gen --seed 1201 --out .img2babylon/disinfectant-spray/hero.png --prompt "a 500 ml pale blue plastic trigger spray bottle of hospital surface disinfectant, white trigger sprayer head on top with the nozzle pointing to the right and a white trigger lever hanging under it, white label with blue print reading DISINFECTANT, standing upright, three-quarter view, centered, plain light gray background, soft studio lighting, product photo"
```
agent vision 讀圖校對比例（噴頭長度、扳機位置）；記 job_id／prompt。

- [x] **Step 2: 寫 spec**

`viewer/models/disinfectant-spray/spec.json`（`tomatoJobId` 填 Step 1 的 job_id）：

```json
{
  "targetName": "disinfectant-spray",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/disinfectant-spray/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "500 ml pale blue trigger spray bottle: lathe body 0.09 dia x 0.16 tall, white sprayer head 0.05 x 0.06 x 0.10 on top (y 0.16-0.22) with the nozzle at +z, white trigger 0.015 x 0.055 x 0.012 hanging from a hinge at the head's front-bottom (y 0.17, z 0.067). Rest = upright, trigger released (hinge angle 0). Positive rotation about [1,0,0] pulls the trigger toward the bottle (-z) up to 0.5 rad; at >= 0.3 rad it sprays 60 droplets along +z at 2.5 m/s (mass transfer 0.55 -> 0.43 kg).",
    "complexity": "medium"
  },
  "componentTree": [
    { "id": "bottle", "name": "pale blue bottle body (lathe)", "level": "macro", "primitive": "lathe",
      "dimensions": { "w": 0.09, "h": 0.16, "d": 0.09, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, 0.08, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "bottle-blue",
      "collider": { "type": "cylinder", "size": [0.09, 0.16, 0.09], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "head", "name": "white sprayer head", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.05, "h": 0.06, "d": 0.10, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.11, 0.01], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bottle", "attachment": { "type": "fixed", "socket": "bottle:neck" }, "material": "head-white",
      "collider": { "type": "box", "size": [0.05, 0.06, 0.10], "offset": [0, 0, 0], "confidence": 0.85 } },
    { "id": "nozzle", "name": "dark nozzle tip at the front of the head", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.014, "h": 0.012, "d": 0.014, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0.13, 0.062], "rotation": [1.5708, 0, 0], "scale": [1, 1, 1] },
      "parent": "bottle", "attachment": { "type": "fixed", "socket": "head:front" }, "material": "nozzle-dark" },
    { "id": "trigger-axle", "name": "hinge axle under the head front", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.006, "h": 0.024, "d": 0.006, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0.09, 0.067], "rotation": [0, 0, 1.5708], "scale": [1, 1, 1] },
      "parent": "bottle", "attachment": { "type": "fixed", "socket": "head:front-bottom" }, "material": "nozzle-dark" },
    { "id": "label-band", "name": "front label (ribbon band)", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.091, "h": 0.08, "d": 0.091, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, -0.01, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bottle", "attachment": { "type": "fixed", "socket": "bottle:front" }, "material": "label-print" },
    { "id": "trigger", "name": "white trigger lever", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.015, "h": 0.055, "d": 0.012, "units": "m", "confidence": 0.7 },
      "transform": { "position": [0, 0.1425, 0.067], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "head",
      "attachment": { "type": "hinge", "socket": "head:front-bottom", "hinge": { "pivot": [0, 0.0275, 0], "axis": [1, 0, 0], "limits": [0, 0.5] } },
      "material": "head-white",
      "collider": { "type": "box", "size": [0.015, 0.055, 0.012], "offset": [0, 0, 0], "confidence": 0.85 } }
  ],
  "materials": [
    { "id": "bottle-blue", "kind": "procedural", "baseColor": [0.72, 0.84, 0.94], "roughness": 0.45 },
    { "id": "head-white", "kind": "procedural", "baseColor": [0.95, 0.95, 0.94], "roughness": 0.5 },
    { "id": "nozzle-dark", "kind": "procedural", "baseColor": [0.25, 0.25, 0.27], "roughness": 0.6 },
    { "id": "label-print", "kind": "procedural", "baseColor": [0.98, 0.98, 0.97], "roughness": 0.6 },
    { "id": "mist-blue", "kind": "procedural", "baseColor": [0.70, 0.85, 1.0], "roughness": 0.2 }
  ],
  "physics": {
    "bodies": [
      { "id": "bottle", "components": ["bottle", "head", "nozzle", "trigger-axle", "label-band"], "mass": 0.55, "friction": 0.5, "restitution": 0.1,
        "centerOfMass": [0, -0.02, 0],
        "pour": { "grains": 60, "grainMass": 0.002, "ratePerSecond": 30, "direction": [0, 0, 1], "exitSpeed": 2.5,
                  "gate": { "body": "trigger", "minAngle": 0.3 } } },
      { "id": "trigger", "components": ["trigger"], "mass": 0.01, "friction": 0.5, "restitution": 0.1, "centerOfMass": [0, 0, 0] }
    ],
    "constraints": [
      { "type": "hinge", "bodyA": "bottle", "bodyB": "trigger", "pivotA": [0, 0.09, 0.067], "pivotB": [0, 0.0275, 0],
        "axis": [1, 0, 0], "limits": [0, 0.5], "actuation": { "type": "servo", "maxForce": 0.05 } }
    ]
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

Run: `python3 forge/validate_spec.py viewer/models/disinfectant-spray/spec.json --strict` → `OK`。

- [x] **Step 3: 寫 factory**

`viewer/models/disinfectant-spray/createDisinfectantSprayModel.ts`：

```ts
// disinfectant-spray — 消毒劑扳機噴瓶：lathe 瓶身＋噴頭＋扳機 hinge servo（出廠回位）＋pour（無傾角條件、沿噴嘴 +z）。
// 對應 spec: viewer/models/disinfectant-spray/spec.json；契約見 grimoire/physics.md「傾倒＝節流的質量轉移」
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShape,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsShapeCylinder,
  PhysicsShapeSphere,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";
import { createHinge, hingeAngle, makeHingeServo, relativeRotation } from "../../src/hinge";

// ---- spec 尺寸（絕對高度以地面為 0）----
const BOTTLE_R = 0.045, BOTTLE_H = 0.16, BOTTLE_Y = BOTTLE_H / 2;
const HEAD = { w: 0.05, h: 0.06, d: 0.10 }, HEAD_Y = 0.19, HEAD_Z = 0.01;
const NOZZLE_Y = 0.21, NOZZLE_Z = HEAD_Z + HEAD.d / 2; // 噴嘴在噴頭前端（+z）
const TRIGGER = { w: 0.015, h: 0.055, d: 0.012 };
const HINGE_Y = 0.17, HINGE_Z = 0.067; // 扳機樞軸：噴頭前面之前（扳機 z 0.061–0.073 不與噴頭 collider 重疊）
const TRIGGER_Y = HINGE_Y - TRIGGER.h / 2; // 0.1425
const TRIGGER_LIMITS: [number, number] = [0, 0.5];
const SERVO_FORCE = 0.05;
const MASS = 0.55, TRIGGER_MASS = 0.01, FRICTION = 0.5, RESTITUTION = 0.1;
const BOTTLE_COM = new Vector3(0, -0.02, 0);
// 鏡射 spec physics.bodies[bottle].pour（兩處必須一致）；無 tiltThreshold = 不看傾角
const POUR = { grains: 60, grainMass: 0.002, ratePerSecond: 30, direction: new Vector3(0, 0, 1), exitSpeed: 2.5, gate: { body: "trigger", minAngle: 0.3 } };
const SPAWN_OFFSET = new Vector3(0, NOZZLE_Y - BOTTLE_Y, NOZZLE_Z + 0.010); // bottle pivot → 噴嘴口外
const DROP_D = 0.006, DROP_DAMPING = 2.0, DROP_SCATTER = 0.004;
const GROUP = 2, DROP_GROUP = 4;
const TESS = 40;
const LABEL_ARC_RAD = 1.3, LABEL_H = 0.08, LABEL_N = 12;
const SEED = 20260906;
const FIXED_DT = 1 / 60;

const TRIGGER_HINGE = {
  pivotA: [0, HINGE_Y - BOTTLE_Y, HINGE_Z] as [number, number, number],
  pivotB: [0, HINGE_Y - TRIGGER_Y, 0] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: TRIGGER_LIMITS,
};

/** mulberry32：小而確定性的 PRNG。 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.25, 0.25, 0.25); m.specularPower = specPower;
  if (alpha < 1) m.alpha = alpha;
  return m;
}

/** 瓶身：底→身→肩→頸口（lathe，x 半徑、y 相對 bottle pivot）。 */
function bottleProfile(): Vector3[] {
  const b = -BOTTLE_Y, t = BOTTLE_Y;
  return [
    new Vector3(0, b, 0), new Vector3(BOTTLE_R - 0.005, b, 0), new Vector3(BOTTLE_R, b + 0.006, 0),
    new Vector3(BOTTLE_R, t - 0.035, 0), new Vector3(BOTTLE_R - 0.012, t - 0.012, 0), new Vector3(0.022, t - 0.004, 0),
    new Vector3(0.022, t, 0), new Vector3(0, t, 0),
  ];
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 384;
  const tex = new DynamicTexture("spray-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // 正面看的 ribbon 帶：垂直翻轉即正讀（M11 粉罐同法）
  c.fillStyle = "#f9f9f6"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#1f5fa8"; c.textAlign = "center";
  c.font = "bold 78px Helvetica, Arial, sans-serif"; c.fillText("DISINFECTANT", w / 2, 120);
  c.fillStyle = "#1c1c1c";
  c.font = "46px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("消毒劑", w / 2, 195);
  c.font = "30px Helvetica, Arial, sans-serif";
  c.fillText("含氯 5000 ppm", w / 2, 250);
  c.fillText("噴灑後靜置 10 分鐘", w / 2, 295);
  c.fillText("500 mL", w / 2, 340);
  c.fillStyle = "#1f5fa8"; c.fillRect(60, 356, w - 120, 6);
  tex.update(false);
  return tex;
}

export default function createDisinfectantSprayModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("disinfectant-spray", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  const blue = mat(scene, "bottle-blue", [0.72, 0.84, 0.94], 48);
  blue.emissiveColor = new Color3(0.10, 0.12, 0.14);
  blue.backFaceCulling = false;
  const white = mat(scene, "head-white", [0.95, 0.95, 0.94], 40);
  white.emissiveColor = new Color3(0.14, 0.14, 0.14);
  const dark = mat(scene, "nozzle-dark", [0.25, 0.25, 0.27], 30);
  const label = mat(scene, "label-print", [0.98, 0.98, 0.97], 24);
  label.backFaceCulling = false;
  const mist = mat(scene, "mist-blue", [0.70, 0.85, 1.0], 16, 0.8);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) label.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [blue, white, dark, label, mist];
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- bottle（瓶身、噴頭、噴嘴、軸、標籤）----
  const bottlePivot = pivot("bottle", root, new Vector3(0, BOTTLE_Y, 0));
  attach("bottle", MeshBuilder.CreateLathe("bottle", { shape: bottleProfile(), tessellation: TESS, closed: true }, scene), bottlePivot, blue);
  const headPivot = pivot("head", bottlePivot, new Vector3(0, HEAD_Y - BOTTLE_Y, HEAD_Z));
  attach("head", MeshBuilder.CreateBox("head", { width: HEAD.w, height: HEAD.h, depth: HEAD.d }, scene), headPivot, white);
  const nozzle = MeshBuilder.CreateCylinder("nozzle", { height: 0.012, diameter: 0.014, tessellation: 16 }, scene);
  nozzle.rotation.x = Math.PI / 2;
  attach("nozzle", nozzle, pivot("nozzle", bottlePivot, new Vector3(0, NOZZLE_Y - BOTTLE_Y, NOZZLE_Z + 0.002)), dark);
  const axle = MeshBuilder.CreateCylinder("trigger-axle", { height: 0.024, diameter: 0.006, tessellation: 12 }, scene);
  axle.rotation.z = Math.PI / 2;
  attach("trigger-axle", axle, pivot("trigger-axle", bottlePivot, new Vector3(0, HINGE_Y - BOTTLE_Y, HINGE_Z)), dark);
  const arcPts = (y: number): Vector3[] => Array.from({ length: LABEL_N + 1 }, (_, i) => {
    const th = -Math.PI / 2 - LABEL_ARC_RAD / 2 + (i / LABEL_N) * LABEL_ARC_RAD; // 弧心正對 −z
    return new Vector3(Math.cos(th) * (BOTTLE_R + 0.0005), y, Math.sin(th) * (BOTTLE_R + 0.0005));
  });
  const band = MeshBuilder.CreateRibbon("label-band", { pathArray: [arcPts(-LABEL_H / 2), arcPts(LABEL_H / 2)], sideOrientation: Mesh.DOUBLESIDE }, scene);
  attach("label-band", band, pivot("label-band", bottlePivot, new Vector3(0, -0.01, 0)), label);

  // ---- trigger ----
  const triggerPivot = pivot("trigger", root, new Vector3(0, TRIGGER_Y, HINGE_Z));
  attach("trigger", MeshBuilder.CreateBox("trigger", { width: TRIGGER.w, height: TRIGGER.h, depth: TRIGGER.d }, scene), triggerPivot, white);

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  const spawned: Mesh[] = [];
  const observers: (() => void)[] = [];

  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const makeBody = (id: string, node: TransformNode, shapes: { shape: PhysicsShape; rel: Vector3 }[], mass: number, com: Vector3): PhysicsBody => {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      for (const { shape, rel } of shapes) {
        shape.material = { friction: FRICTION, restitution: RESTITUTION };
        shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~GROUP;
        container.addChild(shape, rel, Quaternion.Identity());
      }
      body.shape = container;
      body.setMassProperties({ mass, centerOfMass: com });
      bodies[id] = body;
      return body;
    };
    bottlePivot.computeWorldMatrix(true); headPivot.computeWorldMatrix(true);
    const headRel = headPivot.absolutePosition.subtract(bottlePivot.absolutePosition);
    const bottleBody = makeBody("bottle", bottlePivot, [
      { shape: new PhysicsShapeCylinder(new Vector3(0, -BOTTLE_Y, 0), new Vector3(0, BOTTLE_Y, 0), BOTTLE_R, scene), rel: Vector3.Zero() },
      { shape: new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(HEAD.w, HEAD.h, HEAD.d), scene), rel: headRel },
    ], MASS, BOTTLE_COM);
    const triggerBody = makeBody("trigger", triggerPivot, [
      { shape: new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(TRIGGER.w, TRIGGER.h, TRIGGER.d), scene), rel: Vector3.Zero() },
    ], TRIGGER_MASS, Vector3.Zero());

    const hinge = createHinge(scene, bottleBody, triggerBody, TRIGGER_HINGE);
    constraints.push(hinge);
    const servo = makeHingeServo(hinge, "trigger", TRIGGER_LIMITS[0], TRIGGER_LIMITS[1], SERVO_FORCE, "扳機");
    actuators.push(servo);
    servo.set(0); // 出廠即回位彈簧（M10 踏板慣例）：0.01 kg 扳機否則數步就垂到限位

    // ---- pour：無傾角條件，扳機角 ≥ minAngle 時沿噴嘴 +z 節流噴出 ----
    const bind = relativeRotation(bottleBody, triggerBody); // 綁定姿勢：任何物理步之前
    const groundY = 0;
    let poured = 0, accum = 0;
    const spawnDrop = (): void => {
      if (poured >= POUR.grains) return;
      const i = poured; poured += 1;
      bottlePivot.computeWorldMatrix(true);
      const wm = bottlePivot.getWorldMatrix();
      const dir = Vector3.TransformNormal(POUR.direction, wm).normalize();
      const p = bottlePivot.absolutePosition.add(Vector3.TransformNormal(SPAWN_OFFSET, wm));
      p.addInPlace(new Vector3((rng() - 0.5) * DROP_SCATTER, (rng() - 0.5) * DROP_SCATTER, 0));
      if (p.y < groundY + DROP_D) p.y = groundY + DROP_D;
      const d = MeshBuilder.CreateSphere(`grain-${i}`, { diameter: DROP_D, segments: 6 }, scene);
      d.position.copyFrom(p); d.material = mist; d.isPickable = false;
      meshes[`grain-${i}`] = d; spawned.push(d);
      const db = new PhysicsBody(d, PhysicsMotionType.DYNAMIC, false, scene);
      const ds = new PhysicsShapeSphere(Vector3.Zero(), DROP_D / 2, scene);
      ds.material = { friction: 0.3, restitution: 0.05 };
      ds.filterMembershipMask = DROP_GROUP; ds.filterCollideMask = ~GROUP; // 互撞、撞地，不撞瓶與扳機
      db.shape = ds;
      db.setMassProperties({ mass: POUR.grainMass });
      db.setLinearDamping(DROP_DAMPING); db.setAngularDamping(DROP_DAMPING);
      db.setLinearVelocity(bottleBody.getLinearVelocity().add(dir.scale(POUR.exitSpeed)));
      bodies[`grain-${i}`] = db;
      bottleBody.setMassProperties({ mass: MASS - poured * POUR.grainMass, centerOfMass: BOTTLE_COM });
    };
    const after = scene.onAfterPhysicsObservable.add(() => {
      if (poured >= POUR.grains) return;
      const angle = Math.abs(hingeAngle(bottleBody, triggerBody, bind));
      if (angle < POUR.gate.minAngle) { accum = 0; return; }
      accum += POUR.ratePerSecond * FIXED_DT;
      while (accum >= 1 && poured < POUR.grains) { accum -= 1; spawnDrop(); }
    });
    observers.push(() => scene.onAfterPhysicsObservable.remove(after));
    actuators.push({
      id: "pour:bottle", kind: "pour", label: "噴灑", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) while (poured < POUR.grains) spawnDrop(); },
    });
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints, actuators,
    dispose(): void {
      observers.forEach((off) => off());
      constraints.forEach((c) => c.dispose());
      Object.values(bodies).forEach((b) => b.dispose());
      spawned.forEach((m) => m.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
```

`viewer/src/registry.ts` 在 `"ppe-set"` 之後加 `"disinfectant-spray": () => import("../models/disinfectant-spray/createDisinfectantSprayModel"),`。

- [x] **Step 4: headless gate（含 pour 直立情境）**

```bash
cd <repo>/viewer && npx tsc --noEmit \
 && npx tsx scripts/runtime_export.ts disinfectant-spray --spec models/disinfectant-spray/spec.json --out ../.img2babylon/disinfectant-spray/runtime.json \
 && python3 ../forge/check_colliders.py ../.img2babylon/disinfectant-spray/runtime.json \
 && npx tsx scripts/physics_test.ts disinfectant-spray --spec models/disinfectant-spray/spec.json | tail -4 \
 && npx tsx scripts/physics_test.ts disinfectant-spray --spec models/disinfectant-spray/spec.json --nudge trigger | tail -4 \
 && npx tsx scripts/actuation_test.ts disinfectant-spray --spec models/disinfectant-spray/spec.json | tail -8 \
 && npx tsx scripts/pour_test.ts disinfectant-spray --spec models/disinfectant-spray/spec.json
```
Expected：check_colliders OK（bottle 密度 ≈ 417、trigger ≈ 1010；bottle×head 齊平不重疊）；physics_test 兩次 pass；actuation_test `coverage:servo:trigger`、`servo:trigger.x`、`coverage:pour:bottle`、`pour:bottle` ok；pour_test A（gate 閉直立無液滴）、B（gate 開直立 60 顆、0.43 kg、靜止）、C 全 ok。
若 B 液滴數不足：印 `angle`（暫時 console.log）確認扳機 servo 到 0.5；壓不下去把 `SERVO_FORCE` 調 0.1（spec 同步）。若 settle 紅：`exitSpeed` 改 2.0（spec 同步）。若 physics_test 落地翻倒：`BOTTLE_COM.y` 改 −0.03（spec 同步）。

- [x] **Step 5: 視覺 gate（五 pass 檢查點）**

依「共用流程片段 A／B／C」，相機 `{ alpha: -0.9, beta: 1.15, radius: 0.7, target: [0, 0.12, 0] }`。另截一張噴灑中（harness 滑桿 `servo:trigger.x` 拉到 0.45 後 0.5 s 截圖，存 `disinfectant-spray-spray.png`）與碰撞線框。
material pass 檢查 ribbon 標籤：文字鏡像則在 `makeLabelTexture` 加 `c.translate(w, 0); c.scale(-1, 1)`。每 pass 追加 reviewHistory、`next_pass.py done`。

- [x] **Step 6: Commit**

```bash
cd <repo> && git add viewer/models/disinfectant-spray viewer/src/registry.ts && git commit -m "M12 disinfectant-spray：消毒劑扳機噴瓶（扳機 servo 出廠回位＋pour 無傾角沿噴嘴 +z）；strict spec／check_colliders／physics_test／actuation_test／pour_test 綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 4: `cytotoxic-waste-bag` 細胞毒性廢棄物袋（六步五 pass，collect gate 轉綠）

**Files:**
- Create: `viewer/models/cytotoxic-waste-bag/spec.json`、`viewer/models/cytotoxic-waste-bag/createCytotoxicWasteBagModel.ts`
- Modify: `viewer/src/registry.ts`

**Interfaces:**
- Consumes: Task 1 `collect` 欄位、Task 2 `collect_test.ts`、`PhysicsEngineV2.getBodies()`（`@babylonjs/core`）。
- Produces: actuator `collect:bag`；body `bag`；mesh `bag-knot`（封袋後顯示）、`bag`（口緣 tube，封袋後 scaling 0.3）。

- [x] **Step 1: 初始化與參考圖**

```bash
cd <repo> && python3 forge/next_pass.py init --model cytotoxic-waste-bag --force && mkdir -p .img2babylon/cytotoxic-waste-bag && python3 forge/tomato.py gen --seed 1202 --out .img2babylon/cytotoxic-waste-bag/hero.png --prompt "a bright yellow plastic cytotoxic waste bag standing open and upright with a rectangular box-shaped self-standing bottom, 30 cm wide 36 cm tall 20 cm deep, black biohazard symbol and black text CYTOTOXIC WASTE printed on the front, slightly crinkled rim, three-quarter view, centered, plain light gray background, soft studio lighting, product photo"
```
agent vision 讀圖校對比例；記 job_id／prompt。

- [x] **Step 2: 寫 spec**

```json
{
  "targetName": "cytotoxic-waste-bag",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/cytotoxic-waste-bag/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "bright yellow self-standing open waste bag 0.30 wide (x) x 0.36 tall (y) x 0.20 deep (z), walls 0.006 thick, bottom 0.010, open top with a darker crinkled rim; black CYTOTOXIC WASTE label with biohazard symbol on the front (-z). Single rigid body with five colliders (bottom + four walls, flush, no overlap) forming a hollow container. Rest = upright. collect: sealing the bag swallows any small dynamic body inside the interior 0.288 x 0.35 x 0.188 (mass transfer into the bag).",
    "complexity": "medium"
  },
  "componentTree": [
    { "id": "bag", "name": "crinkled rim tube around the open top", "level": "meso", "primitive": "tube",
      "dimensions": { "w": 0.30, "h": 0.012, "d": 0.20, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.18, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "bag-dark" },
    { "id": "bag-bottom", "name": "flat bottom", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.30, "h": 0.010, "d": 0.20, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, -0.175, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:bottom" }, "material": "bag-yellow",
      "collider": { "type": "box", "size": [0.30, 0.010, 0.20], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "wall-front", "name": "front wall (-z, printed)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.30, "h": 0.35, "d": 0.006, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, 0.005, -0.097], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:front" }, "material": "bag-yellow",
      "collider": { "type": "box", "size": [0.30, 0.35, 0.006], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "wall-back", "name": "back wall (+z)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.30, "h": 0.35, "d": 0.006, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, 0.005, 0.097], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:back" }, "material": "bag-yellow",
      "collider": { "type": "box", "size": [0.30, 0.35, 0.006], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "wall-left", "name": "left wall (-x)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.006, "h": 0.35, "d": 0.188, "units": "m", "confidence": 0.85 },
      "transform": { "position": [-0.147, 0.005, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:left" }, "material": "bag-yellow",
      "collider": { "type": "box", "size": [0.006, 0.35, 0.188], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "wall-right", "name": "right wall (+x)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.006, "h": 0.35, "d": 0.188, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0.147, 0.005, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:right" }, "material": "bag-yellow",
      "collider": { "type": "box", "size": [0.006, 0.35, 0.188], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "bag-label", "name": "black CYTOTOXIC WASTE print with biohazard symbol", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.24, "h": 0.20, "d": 0.001, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.02, -0.1006], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "wall-front:outside" }, "material": "print-black" },
    { "id": "bag-liner", "name": "darker inner floor", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.286, "h": 0.002, "d": 0.186, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, -0.169, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:inside" }, "material": "bag-dark" },
    { "id": "bag-knot", "name": "gathered knot shown after sealing", "level": "micro", "primitive": "sphere",
      "dimensions": { "w": 0.05, "h": 0.05, "d": 0.05, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0.205, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:top" }, "material": "bag-dark" }
  ],
  "materials": [
    { "id": "bag-yellow", "kind": "procedural", "baseColor": [1.0, 0.85, 0.10], "roughness": 0.6 },
    { "id": "bag-dark", "kind": "procedural", "baseColor": [0.75, 0.60, 0.05], "roughness": 0.7 },
    { "id": "print-black", "kind": "procedural", "baseColor": [0.08, 0.08, 0.08], "roughness": 0.8 }
  ],
  "physics": {
    "bodies": [
      { "id": "bag", "components": ["bag", "bag-bottom", "wall-front", "wall-back", "wall-left", "wall-right", "bag-label", "bag-liner", "bag-knot"],
        "mass": 0.20, "friction": 0.7, "restitution": 0.1, "centerOfMass": [0, -0.08, 0],
        "collect": { "interior": { "size": [0.288, 0.35, 0.188], "offset": [0, 0.005, 0] }, "maxItemMass": 0.05 } }
    ],
    "constraints": []
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

Run: `python3 forge/validate_spec.py viewer/models/cytotoxic-waste-bag/spec.json --strict` → `OK`。

- [x] **Step 3: 寫 factory**

`viewer/models/cytotoxic-waste-bag/createCytotoxicWasteBagModel.ts`：

```ts
// cytotoxic-waste-bag — 細胞毒性廢棄物袋：一 body 五 collider（底＋四薄壁）的開口中空容器＋collect（反向的質量轉移：封袋）。
// 對應 spec: viewer/models/cytotoxic-waste-bag/spec.json；契約見 grimoire/physics.md「收納＝反向的質量轉移」
import {
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  PhysicsBody,
  PhysicsEngineV2,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";

// ---- spec 尺寸 ----
const W = 0.30, H = 0.36, D = 0.20, WALL = 0.006, BOTTOM = 0.010;
const PIVOT_Y = H / 2; // 袋子幾何中心離地 0.18
const WALL_H = H - BOTTOM; // 0.35
const WALL_Y = BOTTOM / 2; // 四壁中心相對 pivot +0.005（下緣貼底面上緣）
const RIM_Y = H / 2 - 0.005; // 口緣 tube 相對 pivot
const MASS = 0.20, FRICTION = 0.7, RESTITUTION = 0.1;
const BAG_COM = new Vector3(0, -0.08, 0);
// 鏡射 spec physics.bodies[bag].collect（兩處必須一致）
const COLLECT = { interior: { size: new Vector3(W - 2 * WALL, WALL_H, D - 2 * WALL), offset: new Vector3(0, WALL_Y, 0) }, maxItemMass: 0.05 };
// 無活動件的容器：membership 8 / collide ~0——粉罐顆粒、噴瓶液滴（collide ~2）才會落進來（grimoire/physics.md collect 節）
const GROUP = 8;
const SEED = 20260907;

interface ColDef { component: string; size: [number, number, number]; pos: [number, number, number] }
const COLLIDERS: ColDef[] = [
  { component: "bag-bottom", size: [W, BOTTOM, D], pos: [0, -(H / 2 - BOTTOM / 2), 0] },
  { component: "wall-front", size: [W, WALL_H, WALL], pos: [0, WALL_Y, -(D / 2 - WALL / 2)] },
  { component: "wall-back", size: [W, WALL_H, WALL], pos: [0, WALL_Y, D / 2 - WALL / 2] },
  { component: "wall-left", size: [WALL, WALL_H, D - 2 * WALL], pos: [-(W / 2 - WALL / 2), WALL_Y, 0] },
  { component: "wall-right", size: [WALL, WALL_H, D - 2 * WALL], pos: [W / 2 - WALL / 2, WALL_Y, 0] },
];

/** mulberry32：小而確定性的 PRNG。 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.15, 0.15, 0.15); m.specularPower = specPower;
  return m;
}

/** 生物危害符號：三個圓環＋中心圓（畫布座標，r 為外徑）。 */
function drawBiohazard(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  c.strokeStyle = "#111"; c.fillStyle = "#111"; c.lineWidth = r * 0.16;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    c.beginPath(); c.arc(cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42, r * 0.5, 0, Math.PI * 2); c.stroke();
  }
  c.beginPath(); c.arc(cx, cy, r * 0.18, 0, Math.PI * 2); c.fill();
  c.lineWidth = r * 0.08;
  c.beginPath(); c.arc(cx, cy, r * 0.32, 0, Math.PI * 2); c.stroke();
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 428;
  const tex = new DynamicTexture("wbag-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // 正面 plane：垂直翻轉
  c.fillStyle = "#ffd91a"; c.fillRect(0, 0, w, h); // 與袋身同色，只有印字可見
  c.fillStyle = "#111"; c.fillRect(0, 0, w, 34); // 黑色警示帶
  drawBiohazard(c, w / 2, 150, 90);
  c.fillStyle = "#111"; c.textAlign = "center";
  c.font = "bold 66px Helvetica, Arial, sans-serif"; c.fillText("CYTOTOXIC WASTE", w / 2, 300);
  c.font = "44px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("細胞毒性廢棄物", w / 2, 360);
  c.font = "26px Helvetica, Arial, sans-serif"; c.fillText("INCINERATE ONLY  焚化處理", w / 2, 405);
  tex.update(false);
  return tex;
}

export default function createCytotoxicWasteBagModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("cytotoxic-waste-bag", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  const yellow = mat(scene, "bag-yellow", [1.0, 0.85, 0.10], 24);
  yellow.emissiveColor = new Color3(0.18, 0.15, 0.02);
  yellow.backFaceCulling = false; // 內壁可見
  const dark = mat(scene, "bag-dark", [0.75, 0.60, 0.05], 20);
  const print = mat(scene, "print-black", [1.0, 0.85, 0.10], 12);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) print.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [yellow, dark, print];
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- bag pivot＋口緣 tube（root component）----
  const bagPivot = pivot("bag", root, new Vector3(0, PIVOT_Y, 0));
  const rimPath = [
    new Vector3(-W / 2, RIM_Y, -D / 2), new Vector3(W / 2, RIM_Y, -D / 2), new Vector3(W / 2, RIM_Y, D / 2),
    new Vector3(-W / 2, RIM_Y, D / 2), new Vector3(-W / 2, RIM_Y, -D / 2),
  ];
  // 皺褶：每段中點沿法向抖 ±0.004（seed）
  const crinkled: Vector3[] = [];
  for (let i = 0; i < rimPath.length - 1; i++) {
    const a = rimPath[i], b = rimPath[i + 1];
    crinkled.push(a);
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const p = Vector3.Lerp(a, b, t);
      p.y += (rng() - 0.5) * 0.008;
      crinkled.push(p);
    }
  }
  crinkled.push(rimPath[rimPath.length - 1]);
  const rim = attach("bag", MeshBuilder.CreateTube("bag", { path: crinkled, radius: 0.006, tessellation: 10, cap: Mesh.NO_CAP }, scene), bagPivot, dark);

  // ---- 底與四壁（各自 pivot node，供 collider 對位）----
  for (const col of COLLIDERS) {
    const p = pivot(col.component, bagPivot, Vector3.FromArray(col.pos));
    attach(col.component, MeshBuilder.CreateBox(col.component, { width: col.size[0], height: col.size[1], depth: col.size[2] }, scene), p, yellow);
  }
  // ---- 印字、內底、打結 ----
  const labelPlane = MeshBuilder.CreatePlane("bag-label", { width: 0.24, height: 0.20 }, scene);
  attach("bag-label", labelPlane, pivot("bag-label", bagPivot, new Vector3(0, 0.02, -(D / 2 + 0.0006))), print);
  attach("bag-liner", MeshBuilder.CreateBox("bag-liner", { width: W - 2 * WALL - 0.002, height: 0.002, depth: D - 2 * WALL - 0.002 }, scene),
    pivot("bag-liner", bagPivot, new Vector3(0, -(H / 2 - BOTTOM) + 0.001, 0)), dark);
  const knot = attach("bag-knot", MeshBuilder.CreateSphere("bag-knot", { diameter: 0.05, segments: 10 }, scene),
    pivot("bag-knot", bagPivot, new Vector3(0, RIM_Y + 0.03, 0)), dark);
  const neck = MeshBuilder.CreateCylinder("bag-knot-neck", { diameterTop: 0.012, diameterBottom: 0.07, height: 0.04, tessellation: 12 }, scene);
  neck.parent = nodes["bag-knot"]; neck.position.y = -0.03; neck.material = dark;
  knot.setEnabled(false); // 封袋後才顯示（setEnabled 對子節點 neck 一併生效）

  // ---- 物理：一 body 五 collider＋collect ----
  const bodies: Record<string, PhysicsBody> = {};
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    bagPivot.computeWorldMatrix(true);
    const body = new PhysicsBody(bagPivot, PhysicsMotionType.DYNAMIC, false, scene);
    const container = new PhysicsShapeContainer(scene);
    for (const col of COLLIDERS) {
      const node = nodes[col.component]; node.computeWorldMatrix(true);
      const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), Vector3.FromArray(col.size), scene);
      shape.material = { friction: FRICTION, restitution: RESTITUTION };
      shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~0;
      container.addChild(shape, node.absolutePosition.subtract(bagPivot.absolutePosition), Quaternion.Identity());
    }
    body.shape = container;
    body.setMassProperties({ mass: MASS, centerOfMass: BAG_COM });
    bodies.bag = body;

    let collected = 0, sealed = false;
    const half = COLLECT.interior.size.scale(0.5);
    actuators.push({
      id: "collect:bag", kind: "collect", label: "封袋", min: 0, max: 1,
      set(value: number): void {
        if (value <= 0.5) return;
        const engine = scene.getPhysicsEngine() as PhysicsEngineV2 | null;
        if (!engine) return;
        bagPivot.computeWorldMatrix(true);
        const inv = Matrix.Invert(bagPivot.getWorldMatrix());
        const mine = new Set(Object.values(bodies));
        let gained = 0;
        for (const b of [...engine.getBodies()]) { // 複製：dispose 會改原陣列
          if (mine.has(b) || b.isDisposed || b.getMotionType() !== PhysicsMotionType.DYNAMIC) continue;
          const m = b.getMassProperties().mass ?? 0;
          if (m <= 0 || m > COLLECT.maxItemMass) continue;
          const l = Vector3.TransformCoordinates(b.transformNode.absolutePosition, inv).subtract(COLLECT.interior.offset);
          if (Math.abs(l.x) > half.x || Math.abs(l.y) > half.y || Math.abs(l.z) > half.z) continue;
          const node = b.transformNode;
          b.dispose(); node.dispose();
          gained += m;
        }
        if (gained > 0) {
          collected += gained;
          body.setMassProperties({ mass: MASS + collected, centerOfMass: BAG_COM });
        }
        if (!sealed) { sealed = true; knot.setEnabled(true); rim.scaling.set(0.3, 1, 0.3); }
      },
    });
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints: [], actuators,
    dispose(): void {
      Object.values(bodies).forEach((b) => b.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
```

`viewer/src/registry.ts` 加 `"cytotoxic-waste-bag": () => import("../models/cytotoxic-waste-bag/createCytotoxicWasteBagModel"),`。

- [x] **Step 4: headless gate（含 collect gate）**

```bash
cd <repo>/viewer && npx tsc --noEmit \
 && npx tsx scripts/runtime_export.ts cytotoxic-waste-bag --spec models/cytotoxic-waste-bag/spec.json --out ../.img2babylon/cytotoxic-waste-bag/runtime.json \
 && python3 ../forge/check_colliders.py ../.img2babylon/cytotoxic-waste-bag/runtime.json \
 && npx tsx scripts/physics_test.ts cytotoxic-waste-bag --spec models/cytotoxic-waste-bag/spec.json | tail -4 \
 && npx tsx scripts/actuation_test.ts cytotoxic-waste-bag --spec models/cytotoxic-waste-bag/spec.json | tail -5 \
 && npx tsx scripts/collect_test.ts cytotoxic-waste-bag --spec models/cytotoxic-waste-bag/spec.json
```
Expected：check_colliders OK（密度 ≈ 75；五 collider 兩兩重疊 0%）；physics_test pass；actuation_test `coverage:collect:bag`、`collect:bag` ok；collect_test `contain`（8/8）、`collected`（質量 0.24）、`idempotent`、`dispose` 全 ok。
若 `contain` 不足 8：印球的最終位置——若在袋外附近，是落到口緣 tube 上彈開（tube 無 collider，不可能）或穿壁（把 collect_test `DROP_HEIGHT` 改 0.20）；若在袋內但判「外」，檢查 `interior.offset` 與 `WALL_Y` 一致。若 physics_test 落地翻倒：`BAG_COM.y` 改 −0.12。

- [x] **Step 5: 視覺 gate（五 pass 檢查點）**

相機 `{ alpha: -0.9, beta: 1.15, radius: 1.0, target: [0, 0.18, 0] }`；另截封袋後（harness 按「封袋」）`cytotoxic-waste-bag-sealed.png` 與碰撞線框（五片薄壁）。Divine Eye 對黃袋高對比預期 pass。每 pass 追加 reviewHistory、`next_pass.py done`。

- [x] **Step 6: Commit**

```bash
cd <repo> && git add viewer/models/cytotoxic-waste-bag viewer/src/registry.ts && git commit -m "M12 cytotoxic-waste-bag：開口自立廢棄物袋（一 body 五 collider＋collect 封袋質量轉移，membership 8）；strict spec／check_colliders／physics_test／actuation_test／collect_test 綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 5: `scoop-and-scraper` 小鏟＋推板（兩自由 body）

**Files:**
- Create: `viewer/models/scoop-and-scraper/spec.json`、`viewer/models/scoop-and-scraper/createScoopAndScraperModel.ts`
- Modify: `viewer/src/registry.ts`

**Interfaces:**
- Produces: bodies `scoop`、`scraper`；無 actuator、無 constraint。

- [x] **Step 1: 初始化與參考圖**

```bash
cd <repo> && python3 forge/next_pass.py init --model scoop-and-scraper --force && mkdir -p .img2babylon/scoop-and-scraper && python3 forge/tomato.py gen --seed 1203 --out .img2babylon/scoop-and-scraper/hero.png --prompt "a purple hard plastic chemical spill kit scoop shaped like a small dustpan with low side walls and a short rear handle, and a purple flat scraper push board with a low foot and a small grip block, lying side by side on a light gray floor, seen from an above-front three-quarter view, centered, plain light gray background, soft studio lighting, product photo"
```
agent vision 讀圖校對比例；記 job_id／prompt。

- [x] **Step 2: 寫 spec**

```json
{
  "targetName": "scoop-and-scraper",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/scoop-and-scraper/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "two purple free rigid bodies lying on the floor: a dustpan-style scoop (base plate 0.16 x 0.0025 x 0.14 with a 2.5 mm front lip at +z, back wall 0.06 tall, side walls 0.05 tall, rear handle 0.03 x 0.03 x 0.10 protruding at -z) at x -0.12 z 0.02 rotY 0.2, and an L-shaped scraper push board (upright blade 0.15 x 0.06 x 0.004, rear foot 0.15 x 0.004 x 0.04, grip block 0.05 x 0.02 x 0.03 on top) at x 0.14 z -0.05 rotY -0.4. No constraints.",
    "complexity": "medium"
  },
  "componentTree": [
    { "id": "scoop", "name": "scoop base plate (thin front lip)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.16, "h": 0.0025, "d": 0.14, "units": "m", "confidence": 0.8 },
      "transform": { "position": [-0.12, 0, 0.02], "rotation": [0, 0.2, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "tool-purple",
      "collider": { "type": "box", "size": [0.16, 0.0025, 0.14], "offset": [0, 0.00125, 0], "confidence": 0.9 } },
    { "id": "scoop-back", "name": "scoop back wall", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.16, "h": 0.06, "d": 0.004, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.0325, -0.068], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "scoop", "attachment": { "type": "fixed", "socket": "scoop:back" }, "material": "tool-purple",
      "collider": { "type": "box", "size": [0.16, 0.06, 0.004], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "scoop-side-l", "name": "scoop left side wall", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.004, "h": 0.05, "d": 0.136, "units": "m", "confidence": 0.8 },
      "transform": { "position": [-0.078, 0.0275, 0.002], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "scoop", "attachment": { "type": "fixed", "socket": "scoop:left" }, "material": "tool-purple",
      "collider": { "type": "box", "size": [0.004, 0.05, 0.136], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "scoop-side-r", "name": "scoop right side wall", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.004, "h": 0.05, "d": 0.136, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0.078, 0.0275, 0.002], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "scoop", "attachment": { "type": "fixed", "socket": "scoop:right" }, "material": "tool-purple",
      "collider": { "type": "box", "size": [0.004, 0.05, 0.136], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "scoop-handle", "name": "scoop rear handle", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.03, "h": 0.03, "d": 0.10, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.060, -0.120], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "scoop", "attachment": { "type": "fixed", "socket": "scoop-back:top" }, "material": "tool-purple",
      "collider": { "type": "box", "size": [0.03, 0.03, 0.10], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "scoop-lip", "name": "bevelled front lip (visual wedge)", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.16, "h": 0.002, "d": 0.02, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0.0012, 0.079], "rotation": [-0.12, 0, 0], "scale": [1, 1, 1] },
      "parent": "scoop", "attachment": { "type": "fixed", "socket": "scoop:front" }, "material": "tool-purple" },
    { "id": "scoop-print", "name": "SCOOP print on the handle top", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.026, "h": 0.001, "d": 0.08, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0.0756, -0.120], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "scoop", "attachment": { "type": "fixed", "socket": "scoop-handle:top" }, "material": "print-white" },
    { "id": "scraper", "name": "scraper upright blade", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.15, "h": 0.06, "d": 0.004, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0.14, 0, -0.05], "rotation": [0, -0.4, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "tool-purple",
      "collider": { "type": "box", "size": [0.15, 0.06, 0.004], "offset": [0, 0.03, 0], "confidence": 0.9 } },
    { "id": "scraper-foot", "name": "scraper rear foot", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.15, "h": 0.004, "d": 0.04, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.002, -0.022], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "scraper", "attachment": { "type": "fixed", "socket": "scraper:bottom-back" }, "material": "tool-purple",
      "collider": { "type": "box", "size": [0.15, 0.004, 0.04], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "scraper-grip", "name": "scraper grip block", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.05, "h": 0.02, "d": 0.03, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.07, -0.013], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "scraper", "attachment": { "type": "fixed", "socket": "scraper:top" }, "material": "tool-purple",
      "collider": { "type": "box", "size": [0.05, 0.02, 0.03], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "scraper-print", "name": "SCRAPER print on the blade back", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.10, "h": 0.03, "d": 0.001, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0.03, -0.0026], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "scraper", "attachment": { "type": "fixed", "socket": "scraper:back" }, "material": "print-white" }
  ],
  "materials": [
    { "id": "tool-purple", "kind": "procedural", "baseColor": [0.42, 0.16, 0.72], "roughness": 0.45 },
    { "id": "print-white", "kind": "procedural", "baseColor": [0.97, 0.97, 0.96], "roughness": 0.6 }
  ],
  "physics": {
    "bodies": [
      { "id": "scoop", "components": ["scoop", "scoop-back", "scoop-side-l", "scoop-side-r", "scoop-handle", "scoop-lip", "scoop-print"],
        "mass": 0.08, "friction": 0.6, "restitution": 0.1, "centerOfMass": [0, 0.01, -0.02] },
      { "id": "scraper", "components": ["scraper", "scraper-foot", "scraper-grip", "scraper-print"],
        "mass": 0.05, "friction": 0.6, "restitution": 0.1, "centerOfMass": [0, 0.02, -0.01] }
    ],
    "constraints": []
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

Run: `python3 forge/validate_spec.py viewer/models/scoop-and-scraper/spec.json --strict` → `OK`。

- [x] **Step 3: 寫 factory**

`viewer/models/scoop-and-scraper/createScoopAndScraperModel.ts`：

```ts
// scoop-and-scraper — 化療潑灑處理小鏟（畚斗式）＋推板（L 形）：兩個自由剛體、無約束。
// 對應 spec: viewer/models/scoop-and-scraper/spec.json
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { BuiltModel, ModelOptions } from "../../src/types";

// ---- spec 尺寸／位置（pivot 在各自底面中心）----
const SCOOP_POS = new Vector3(-0.12, 0, 0.02), SCOOP_ROT_Y = 0.2, SCOOP_MASS = 0.08, SCOOP_COM = new Vector3(0, 0.01, -0.02);
const SCRAPER_POS = new Vector3(0.14, 0, -0.05), SCRAPER_ROT_Y = -0.4, SCRAPER_MASS = 0.05, SCRAPER_COM = new Vector3(0, 0.02, -0.01);
const FRICTION = 0.6, RESTITUTION = 0.1;
// 無活動件：membership 8 / collide ~0——粉罐顆粒（collide ~2）才推得動、進得了鏟（grimoire/physics.md collect 節）
const GROUP = 8;

interface Part { component: string; size: [number, number, number]; pos: [number, number, number]; collider: boolean; rotX?: number }
const SCOOP_PARTS: Part[] = [
  { component: "scoop", size: [0.16, 0.0025, 0.14], pos: [0, 0.00125, 0], collider: true },
  { component: "scoop-back", size: [0.16, 0.06, 0.004], pos: [0, 0.0325, -0.068], collider: true },
  { component: "scoop-side-l", size: [0.004, 0.05, 0.136], pos: [-0.078, 0.0275, 0.002], collider: true },
  { component: "scoop-side-r", size: [0.004, 0.05, 0.136], pos: [0.078, 0.0275, 0.002], collider: true },
  { component: "scoop-handle", size: [0.03, 0.03, 0.10], pos: [0, 0.060, -0.120], collider: true },
  { component: "scoop-lip", size: [0.16, 0.002, 0.02], pos: [0, 0.0012, 0.079], collider: false, rotX: -0.12 },
];
const SCRAPER_PARTS: Part[] = [
  { component: "scraper", size: [0.15, 0.06, 0.004], pos: [0, 0.03, 0], collider: true },
  { component: "scraper-foot", size: [0.15, 0.004, 0.04], pos: [0, 0.002, -0.022], collider: true },
  { component: "scraper-grip", size: [0.05, 0.02, 0.03], pos: [0, 0.07, -0.013], collider: true },
];

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.2, 0.2, 0.2); m.specularPower = specPower;
  return m;
}

/** 白字印刷（正面／朝上 plane 皆先垂直翻轉；朝上 plane 自 −z 正面看即正讀）。 */
function printTexture(scene: Scene, id: string, w: number, h: number, text: string): DynamicTexture {
  const tex = new DynamicTexture(id, { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1);
  c.fillStyle = "#6b29b8"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#f7f7f5"; c.textAlign = "center"; c.textBaseline = "middle";
  c.font = `bold ${Math.floor(h * 0.6)}px Helvetica, Arial, sans-serif`; c.fillText(text, w / 2, h / 2);
  tex.update(false);
  return tex;
}

export default function createScoopAndScraperModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("scoop-and-scraper", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  const purple = mat(scene, "tool-purple", [0.42, 0.16, 0.72], 40);
  purple.emissiveColor = new Color3(0.08, 0.02, 0.14);
  const scoopPrint = mat(scene, "print-white-scoop", [0.97, 0.97, 0.96], 24);
  const scraperPrint = mat(scene, "print-white-scraper", [0.97, 0.97, 0.96], 24);
  const disposables: { dispose(): void }[] = [purple, scoopPrint, scraperPrint];
  if (canPaint) {
    const t1 = printTexture(scene, "scoop-print-tex", 256, 96, "SCOOP"); scoopPrint.diffuseTexture = t1; disposables.push(t1);
    const t2 = printTexture(scene, "scraper-print-tex", 384, 96, "SCRAPER"); scraperPrint.diffuseTexture = t2; disposables.push(t2);
  }

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3, rotY = 0): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; p.rotation.y = rotY; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };
  /** 一組零件：root component 的 pivot 是 body node，其餘零件各自 pivot（供 collider 對位）。 */
  const buildParts = (rootId: string, rootPos: Vector3, rotY: number, parts: Part[]): TransformNode => {
    const rootPivot = pivot(rootId, root, rootPos, rotY);
    for (const part of parts) {
      const parent = part.component === rootId ? rootPivot : pivot(part.component, rootPivot, Vector3.FromArray(part.pos));
      const box = MeshBuilder.CreateBox(part.component, { width: part.size[0], height: part.size[1], depth: part.size[2] }, scene);
      if (part.component === rootId) box.position = Vector3.FromArray(part.pos); // root 的 mesh 相對 pivot 偏移 = collider offset
      if (part.rotX) box.rotation.x = part.rotX;
      attach(part.component, box, parent, purple);
    }
    return rootPivot;
  };

  const scoopPivot = buildParts("scoop", SCOOP_POS, SCOOP_ROT_Y, SCOOP_PARTS);
  const scoopLabel = MeshBuilder.CreatePlane("scoop-print", { width: 0.026, height: 0.08 }, scene);
  scoopLabel.rotation.x = Math.PI / 2; // 朝上（自 −z 看正讀：垂直翻轉已在畫布內）
  attach("scoop-print", scoopLabel, pivot("scoop-print", scoopPivot, new Vector3(0, 0.0756, -0.120)), scoopPrint);

  const scraperPivot = buildParts("scraper", SCRAPER_POS, SCRAPER_ROT_Y, SCRAPER_PARTS);
  const scraperLabel = MeshBuilder.CreatePlane("scraper-print", { width: 0.10, height: 0.03 }, scene);
  attach("scraper-print", scraperLabel, pivot("scraper-print", scraperPivot, new Vector3(0, 0.03, -0.0026)), scraperPrint);

  // ---- 物理：兩個自由 body，各自多 collider ----
  const bodies: Record<string, PhysicsBody> = {};
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const make = (id: string, rootPivot: TransformNode, parts: Part[], mass: number, com: Vector3): void => {
      rootPivot.computeWorldMatrix(true);
      const body = new PhysicsBody(rootPivot, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      for (const part of parts) {
        if (!part.collider) continue;
        const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), Vector3.FromArray(part.size), scene);
        shape.material = { friction: FRICTION, restitution: RESTITUTION };
        shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~0;
        container.addChild(shape, Vector3.FromArray(part.pos), Quaternion.Identity()); // 零件 pos 即相對 body pivot 的偏移（root 用 collider offset）
      }
      body.shape = container;
      body.setMassProperties({ mass, centerOfMass: com });
      bodies[id] = body;
    };
    make("scoop", scoopPivot, SCOOP_PARTS, SCOOP_MASS, SCOOP_COM);
    make("scraper", scraperPivot, SCRAPER_PARTS, SCRAPER_MASS, SCRAPER_COM);
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints: [], actuators: [],
    dispose(): void {
      Object.values(bodies).forEach((b) => b.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
```

`viewer/src/registry.ts` 加 `"scoop-and-scraper": () => import("../models/scoop-and-scraper/createScoopAndScraperModel"),`。

- [x] **Step 4: headless gate**

```bash
cd <repo>/viewer && npx tsc --noEmit \
 && npx tsx scripts/runtime_export.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json --out ../.img2babylon/scoop-and-scraper/runtime.json \
 && python3 ../forge/check_colliders.py ../.img2babylon/scoop-and-scraper/runtime.json \
 && npx tsx scripts/physics_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | tail -4 \
 && npx tsx scripts/actuation_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json
```
Expected：check_colliders OK（scoop ≈ 335、scraper ≈ 556；相鄰 collider 齊平）；physics_test pass；actuation_test `spec 無 actuation 宣告` pass。
runtime_export 用 spec collider offset＋factory node 世界矩陣算 collider AABB、用 mesh 世界 AABB 比對：root 零件（`scoop`、`scraper`）的 mesh 相對 pivot 偏移必須等於 spec collider offset（`[0,0.00125,0]`、`[0,0.03,0]`），否則報「collider AABB 未包住 mesh AABB」。

- [x] **Step 5: 視覺 gate（五 pass 檢查點）**

相機 `{ alpha: -0.9, beta: 1.0, radius: 0.7, target: [0, 0.03, 0] }`；碰撞線框一張。Divine Eye 多物件構圖預期 reject（M11 已知系統性原因）→ 目視判定、reviewHistory 註明。每 pass 追加 reviewHistory、`next_pass.py done`。

- [x] **Step 6: Commit**

```bash
cd <repo> && git add viewer/models/scoop-and-scraper viewer/src/registry.ts && git commit -m "M12 scoop-and-scraper：小鏟（畚斗式、2.5 mm 前緣）＋推板（L 形）兩自由 body，membership 8；strict spec／check_colliders／physics_test 綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 6: Playground 十件＋UI＋scene_test＋重部署

**Files:**
- Modify: `../playground/src/scene.ts`（SCENE 加三項；`totalMass` 跳過 disposed）
- Modify: `../playground/src/ui.ts`（STEPS 文字、topple／toss 過濾、新卡片）
- Modify: `../playground/scripts/scene_test.ts`（新斷言、respawn 總數 21）
- Modify: `../playground/README.md`（十件清單）

**Interfaces:**
- Consumes: Task 3–5 的 actuator id `servo:trigger.x`、`collect:bag`；body id `bottle`、`bag`、`scoop`、`scraper`。

- [x] **Step 1: scene.ts**

`SCENE` 末尾加：

```ts
  { model: "disinfectant-spray", label: "消毒劑噴瓶", position: [-0.55, 0, -0.85], rotationY: 0.3 },
  { model: "scoop-and-scraper", label: "鏟刮板", position: [0.85, 0, -0.55], rotationY: 0.4 },
  { model: "cytotoxic-waste-bag", label: "廢棄物袋", position: [1.35, 0, -0.2], rotationY: -0.6 },
```

`totalMass` 改：

```ts
export function totalMass(model: BuiltModel): number {
  return Object.values(model.bodies).reduce((s, b) => s + (b.isDisposed ? 0 : (b.getMassProperties().mass ?? 0)), 0);
}
```

- [x] **Step 2: ui.ts**

`STEPS`：

```ts
const STEPS = ["隔離現場、示警（警示立牌）", "穿戴防護裝備（防護裝備組）", "打開潑灑處理包", "吸附、清除、消毒（吸附粉罐、吸附墊、鏟刮板、消毒劑噴瓶）", "收集廢棄物、投入細胞毒性廢棄物桶（廢棄物袋、廢棄物桶）"];
```

`topple` 第一行過濾改 `.filter((b) => !b.isDisposed && !/^(droplet|grain)-/.test(b.transformNode.name))`；`toss` 迴圈開頭加 `if (b.isDisposed) continue;`；`dropFrom` 的 `bodies` 改 `Object.values(p.model.bodies).filter((b) => !b.isDisposed)`。

卡片（`absorbent-pad` 區塊之後）：

```ts
    if (p.entry.model === "disinfectant-spray") {
      btn("噴灑", () => {
        const t = act(p.model, "servo:trigger.x"); t?.set(0.45);
        setTimeout(() => act(p.model, "servo:trigger.x")?.set(0), 1000);
      });
    }
    if (p.entry.model === "cytotoxic-waste-bag") {
      btn("封袋", () => act(p.model, "collect:bag")?.set(1));
    }
```

- [x] **Step 3: scene_test.ts**

檔頭註解補「噴瓶噴灑、袋子收納＋封袋、鏟刮板兩 body」。`ppe` 之後加：

```ts
  const spray = placed.find((p) => p.entry.model === "disinfectant-spray")!;
  const wbag = placed.find((p) => p.entry.model === "cytotoxic-waste-bag")!;
  const tools = placed.find((p) => p.entry.model === "scoop-and-scraper")!;
```

`ppe:bodies` 之後加：

```ts
  // 噴瓶：壓扳機 150 步 → 60 顆液滴、質量 0.43
  spray.model.actuators?.find((a) => a.id === "servo:trigger.x")?.set(0.45);
  step(150);
  const sprayMass = spray.model.bodies["bottle"].getMassProperties().mass ?? NaN;
  const dropsN = Object.keys(spray.model.bodies).filter((k) => k.startsWith("grain-")).length;
  push("spray:spray", dropsN === 60 && Math.abs(sprayMass - 0.43) < 1e-5, `液滴 ${dropsN}、質量 ${sprayMass}`);

  // 廢棄物袋：自 interior 上方丟 8 顆測試球（d 0.012、0.005 kg）→ 300 步全在內 → 封袋質量 0.24
  // interior（鏡射 spec）：size [0.288, 0.35, 0.188]、offset [0, 0.005, 0]
  const wbagBody = wbag.model.bodies["bag"];
  wbagBody.transformNode.computeWorldMatrix(true);
  const wbagWm = wbagBody.transformNode.getWorldMatrix();
  const wbagInv = Matrix.Invert(wbagWm);
  const interiorOff = new Vector3(0, 0.005, 0), interiorHalf = new Vector3(0.144, 0.175, 0.094);
  const interiorCenter = Vector3.TransformCoordinates(interiorOff, wbagWm);
  const balls: PhysicsBody[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = MeshBuilder.CreateSphere(`test-ball-${i}`, { diameter: 0.012, segments: 6 }, scene);
    m.position = interiorCenter.add(new Vector3(Math.cos(a) * 0.05, 0.30, Math.sin(a) * 0.03));
    const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
    const s = new PhysicsShapeSphere(Vector3.Zero(), 0.006, scene); s.material = { friction: 0.6, restitution: 0.05 }; b.shape = s;
    b.setMassProperties({ mass: 0.005 }); b.setLinearDamping(2.0); b.setAngularDamping(2.0);
    balls.push(b);
  }
  step(300);
  const insideN = balls.filter((b) => {
    const l = Vector3.TransformCoordinates(b.transformNode.absolutePosition, wbagInv).subtract(interiorOff);
    return Math.abs(l.x) <= interiorHalf.x && Math.abs(l.y) <= interiorHalf.y && Math.abs(l.z) <= interiorHalf.z;
  }).length;
  push("wbag:contain", insideN === 8, `袋內 ${insideN}/8`);
  wbag.model.actuators?.find((a) => a.id === "collect:bag")?.set(1);
  step(2);
  const wbagMass = wbagBody.getMassProperties().mass ?? NaN;
  push("wbag:collect", Math.abs(wbagMass - 0.24) < 1e-5 && balls.every((b) => b.isDisposed), `封袋後質量 ${wbagMass}、球全收 ${balls.every((b) => b.isDisposed)}`);

  push("tools:bodies", Object.keys(tools.model.bodies).length === 2, `鏟刮板 body ${Object.keys(tools.model.bodies).length}`);
```

import 行加 `PhysicsShapeSphere`。`respawn:all` 改期望 21：`total === 21`、detail `期望 21：2+1+3+2+2+2+4+2+1+2`。

- [x] **Step 4: README**

`../playground/README.md` 物件清單加三行：消毒劑噴瓶（噴灑）、鏟刮板（推顆粒進鏟）、廢棄物袋（封袋收納）。

- [x] **Step 5: 跑 typecheck、gate、重部署**

```bash
cd <playground> && npx tsc --noEmit -p . && npm run scene-test 2>&1 | tail -50 && npm run serve 2>&1 | tail -4
```
Expected：scene_test `"pass": true`（24 項：18＋settle×3＋spray＋wbag×2＋tools）；serve 印 tailnet 200。
若 `settle:disinfectant-spray` 紅（扳機出廠回位微動）：閾值仍 0.02 m/s，servo 到位後應靜止；若持續抖動，`SERVO_FORCE` 降 0.03。

- [x] **Step 6: 瀏覽器目視**

playwright 開 `https://<internal-host>/?v=4`，等 `__PLAYGROUND_READY__`，截 overview；按「噴灑」（噴瓶）等 1.5 s 截圖；按「封袋」（廢棄物袋）截圖；檔案 `mv` 到 `.img2babylon/shots/playground3-{overview,spray,seal}.png`，Read 目視：十件都在、噴霧落地成扇形、袋口打結。

- [x] **Step 7: Commit（playground）**

```bash
cd <playground> && git add -A && git commit -m "playground：M12 十件（消毒劑噴瓶／鏟刮板／廢棄物袋）、新卡片（噴灑／封袋）、isDisposed 過濾、scene_test 新斷言；重部署

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 7: ROADMAP／任務卡／next-steps／handoff／結案

**Files:**
- Modify: `ROADMAP.md`（M12 節，放 M11 之後、Parked 之前）
- Create: `tasks/0024-chemo-spill-set-3.md`
- Modify: `docs/next-steps.md`（第三批已做，抬高抓取列 UX 項，補新候選）
- Modify: `.remember/remember.md`

- [x] **Step 1: ROADMAP M12 節**

```markdown
## M12：化療潑灑處理套件第三批（2026-09-05 核准開工）

設計文件 `docs/superpowers/specs/2026-09-05-chemo-spill-set-3-design.md`、計畫 `docs/superpowers/plans/2026-09-05-chemo-spill-set-3.md`。
契約：`pour` 加 `direction`／`exitSpeed`、`tiltThreshold` 選填（無則 gate 必填；噴瓶）；新增 `collect`（反向的質量轉移：封袋收走
interior 內的外來小 body；`collect_test.ts` gate）。三新模型＋playground 十件。

- [x] 0024 pour 擴充＋collect 契約＋`disinfectant-spray`／`cytotoxic-waste-bag`／`scoop-and-scraper`＋playground。
      結果：<各模型 Divine Eye 與修正次數、gate 狀態、陷阱——結案時填>
```

- [x] **Step 2: 任務卡**

`tasks/0024-chemo-spill-set-3.md` 依 0023 格式：model／status／脈絡（使用者 2026-09-05 三問三答：擴充 pour、開口容器＋collect、兩 body）／分工／驗收／notes（修正次數、教訓：membership 8 容器規則、collect dispose 守衛）。

- [x] **Step 3: next-steps 與 handoff、Commit**

`docs/next-steps.md`：候選 1 改為「第四批（若還要）：噴霧×水漬互動、廢棄物袋投入廢棄物桶（袋子 0.20 kg > 桶口尺寸關係）」；UX 項加「抓取抬高（shift 拖曳沿垂直面）——M12 已知限制：顆粒進袋只能靠推板→小鏟→拖到袋邊」。
`.remember/remember.md`：State M12 結案 commit；Next 等使用者；Context 本批新陷阱。

```bash
cd <repo> && git add ROADMAP.md tasks/0024-chemo-spill-set-3.md docs/next-steps.md docs/superpowers/plans/2026-09-05-chemo-spill-set-3.md && git commit -m "M12 結案：ROADMAP M12／tasks/0024／next-steps；三新模型＋pour 擴充＋collect 契約＋playground 十件全 gate 綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

## 自我檢查（寫完計畫後）

1. **Spec 覆蓋**：§3.1 噴瓶 → Task 3；§3.2 袋子 → Task 4；§3.3 鏟刮板 → Task 5；§4.1 pour 擴充 → Task 1（validate＋grimoire）＋Task 2（actuation_test／pour_test）；§4.2 collect → Task 1＋Task 2（types／harness／collect_test）＋Task 4（factory）；§5 playground → Task 6；§6 commit 粒度 → 各 Task Step 6／7；§7 風險 → 各 Task Step 4 的「若…」分支。
2. **佔位掃描**：`<job_id>`／`<Step 1 的 prompt>` 是執行期才有的值；ROADMAP「結案時填」在 Task 7 結案時填入。無其他 TBD。
3. **型別一致**：`Actuator.kind "collect"`（Task 2）↔ factory `kind: "collect"`（Task 4）↔ harness 條件；`collect:bag` id 在 Task 2 gate、Task 4 factory、Task 6 playground 一致；`servo:trigger.x` 由 `makeHingeServo(hinge, "trigger", …)` 產生，Task 3／6 一致；`SpecPour.tiltThreshold?` 在 actuation_test／pour_test 一致；`PhysicsEngineV2` 自 `@babylonjs/core` 匯出（已驗 `Physics/v2/index.d.ts`）。
