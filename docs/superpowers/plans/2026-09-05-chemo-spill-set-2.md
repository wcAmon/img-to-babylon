# 化療潑灑處理套件第二批（M11）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 img2babylon 六步流程產出四個新物件（A 字警示立牌／可傾倒吸附粉罐／對摺吸附墊／防護裝備組），替廢棄物桶補側耳把，playground 擴到七件並重部署。

**Architecture:** 先擴 `pour` 契約（validate_spec TDD、types、harness、`hinge.ts` 加角度量測助手、actuation_test、`pour_test.ts`），再依序做四個 factory（全部用 `viewer/src/hinge.ts` 的 hinge／servo 助手與碰撞過濾群組），補正桶耳把，最後 playground 加場景項、卡片、scene_test 斷言並 `npm run serve` 重部署。

**Tech Stack:** Python 3.10+ stdlib（forge）、TypeScript strict、Babylon.js 8 + Havok、Vite 6、tsx、playwright MCP（截圖）、tomato-image（生參考圖）、Tailscale serve、launchd。

**Spec:** `docs/superpowers/specs/2026-09-05-chemo-spill-set-2-design.md`

## Global Constraints

- forge/ 只准 Python 3.10+ stdlib，零第三方依賴。
- viewer/ TypeScript strict；只能程式碼建模（primitives / CSG / DynamicTexture），禁止外部 mesh 或貼圖。
- 單位公尺、尺寸烘進幾何參數、程序化雜訊帶 seed、`physics.constraints` 是物理權威。
- 物理尺度 S=1（`physicsScale: 1`）。factory 出廠 body 密度 50–3000 kg/m³。
- 每個模型走 `next_pass.py` 五 pass；每 pass 第 4 次、全程第 6 次修正會被擋（exit 3 = 停下問使用者）。
- `.img2babylon/` 是 gitignored 執行期狀態；state.json 一次只屬一個模型（換模型 `init --force`）。
- 截圖先存 `.img2babylon/shots/` 再讀回；一次只看一張對照表。
- Havok 質量 float32：gate 容差 1e-5。生成的小球加線性／角阻尼 2.0。
- 同模型相鄰活動件：`shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~GROUP`。
- plane 上 DynamicTexture：正面／朝下的 plane 畫布垂直翻轉 `c.translate(0, h); c.scale(1, -1)`；朝上的 plane 水平翻轉 `c.translate(w, 0); c.scale(-1, 1)`。
- commit 訊息尾端固定加：
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 與
  `Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6`。
- bash 每次呼叫 cwd 重設為 repo 根；用絕對路徑或在同一命令內 `cd`。zsh 下 `echo =====` 會被當 `=` 展開，分隔符用 `'---'`。
- playground 對外網址 `https://monkeyday.tail8e3f79.ts.net/`。

---

## 檔案地圖

| 路徑 | 責任 |
|---|---|
| `forge/validate_spec.py` | 新增 `_check_pour` |
| `forge/tests/test_validate_spec.py` | pour 測試（`_with_pour` 助手） |
| `grimoire/spec.md`、`grimoire/physics.md` | pour 契約文件 |
| `viewer/src/types.ts` | `Actuator.kind` 加 `"pour"` |
| `viewer/src/harness.ts` | 面板對 pour 用按鈕（同 rupture） |
| `viewer/src/hinge.ts` | 加 `relativeRotation()`／`hingeAngle()` 量測助手 |
| `viewer/scripts/actuation_test.ts` | pour coverage 與觸發檢查 |
| `viewer/scripts/pour_test.ts`（新） | 傾倒 gate（蓋閉不倒／蓋開側躺倒空／直立不倒＋手動冪等＋dispose） |
| `viewer/models/absorbent-powder-shaker/{spec.json,createAbsorbentPowderShakerModel.ts}` | 粉罐 |
| `viewer/models/spill-warning-sign/{spec.json,createSpillWarningSignModel.ts}` | 立牌 |
| `viewer/models/absorbent-pad/{spec.json,createAbsorbentPadModel.ts}` | 吸附墊 |
| `viewer/models/ppe-set/{spec.json,createPpeSetModel.ts}` | 防護裝備組 |
| `viewer/models/cytotoxic-waste-bin/{spec.json,createCytotoxicWasteBinModel.ts}` | 加耳把 |
| `viewer/src/registry.ts` | 註冊四個新模型 |
| `../playground/src/{scene.ts,ui.ts,main.ts}`、`../playground/scripts/scene_test.ts` | 七件場景 |
| `ROADMAP.md`、`tasks/0023-chemo-spill-set-2.md`、`.remember/remember.md` | 結案 |

## 共用流程片段（各模型任務引用）

**A. 視覺 gate 截圖（playwright MCP）**：viewer dev server 在 5173（`cd viewer && nohup npm run dev -- --port 5173 > /dev/null 2>&1 &`，已在跑就略過）。
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
`python3 <scratchpad>/decode.py .img2babylon/shots/<name>-hero.json hero=.img2babylon/shots/<name>-hero.png`
（decode.py：讀 JSON、取 key、base64 解碼寫檔；若 scratchpad 已清空就重建這 6 行）。
碰撞線框：snapshot 找「碰撞線框」按鈕 `browser_click`，用 `browser_take_screenshot` 視口截圖（render-target 照不到 utility layer），檔案落在 repo 根，`mv` 進 `.img2babylon/shots/<name>-collider.png`。

**B. 對照與預審**：
```bash
python3 forge/compare.py .img2babylon/<name>/hero.png .img2babylon/shots/<name>-hero.png --out .img2babylon/<name>/sheet.png
python3 forge/divine_eye.py --reference .img2babylon/<name>/hero.png --render .img2babylon/shots/<name>-hero.png --json
```
Read `sheet.png` 目視評分（likeness／colliderFit 1–10）。REJECT → 先修（`next_pass.py correction`）；exit 3 停下問使用者。

**C. pass 節奏**：`python3 forge/next_pass.py status` 看當前 pass → 做完該 pass 內容 → 跑 headless gate＋視覺 gate → 在 spec `reviewHistory` 追加一筆 `{pass, likeness, colliderFit, eye:{verdict,fidelity,iou}, action:"continue", notes}` → `python3 forge/next_pass.py done`。五 pass：blockout（主幾何＋collider）、structure（細節件）、material（顏色／貼圖）、physics（質量／hinge／servo／pour 校準）、polish（常數推導、dispose、metadata）。

---

### Task 1: pour 契約——validate_spec（TDD）＋ grimoire

**Files:**
- Modify: `forge/validate_spec.py`（`_check_rupture` 之後加 `_check_pour`，bodies 迴圈呼叫）
- Modify: `forge/tests/test_validate_spec.py`
- Modify: `grimoire/spec.md`（rupture 節之後）、`grimoire/physics.md`（破裂節之後）

**Interfaces:**
- Produces: spec 欄位 `physics.bodies[].pour = { tiltThreshold, grains, grainMass, ratePerSecond, gate?: { body, minAngle } }`。

- [x] **Step 1: 寫失敗測試**

在 `forge/tests/test_validate_spec.py` 的 `test_rupture_missing_field` 之後加入：

```python
    def _with_pour(self, pour, mass=1.0):
        """sample-crate 加一個 hinge 蓋（cap）當 pour 的 gate，再掛 pour。"""
        spec = minimal_spec()
        spec["componentTree"].append({
            "id": "cap", "name": "cap", "level": "macro", "primitive": "cylinder",
            "dimensions": {"w": 0.1, "h": 0.02, "d": 0.1, "units": "m", "confidence": 0.8},
            "transform": {"position": [0, 0.3, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "parent": spec["componentTree"][0]["id"],
            "attachment": {"type": "hinge", "socket": "crate:top",
                           "hinge": {"pivot": [0, -0.01, 0.05], "axis": [1, 0, 0], "limits": [0, 1.9]}},
            "material": spec["componentTree"][0]["material"],
            "collider": {"type": "cylinder", "size": [0.1, 0.02, 0.1], "offset": [0, 0, 0], "confidence": 0.8}})
        body = spec["physics"]["bodies"][0]
        body["mass"] = mass
        spec["physics"]["bodies"].append({"id": "cap", "components": ["cap"], "mass": 0.03})
        spec["physics"]["constraints"] = [{
            "type": "hinge", "bodyA": body["id"], "bodyB": "cap",
            "pivotA": [0, 0.25, 0.05], "pivotB": [0, -0.01, 0.05],
            "axis": [1, 0, 0], "limits": [0, 1.9]}]
        body["pour"] = pour
        return spec

    POUR_OK = {"tiltThreshold": 1.2, "grains": 40, "grainMass": 0.003, "ratePerSecond": 20,
               "gate": {"body": "cap", "minAngle": 1.0}}

    def test_pour_valid_passes(self):
        errors, _ = validate_spec.validate(self._with_pour(dict(self.POUR_OK)), strict=True)
        self.assertEqual(errors, [])

    def test_pour_without_gate_passes(self):
        pour = {k: v for k, v in self.POUR_OK.items() if k != "gate"}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=True)
        self.assertEqual(errors, [])

    def test_pour_tilt_in_open_interval(self):
        for bad in (0, 3.2):
            pour = dict(self.POUR_OK, tiltThreshold=bad)
            errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
            self.assertTrue(any("pour" in e and "tiltThreshold" in e for e in errors), bad)

    def test_pour_grains_positive_int(self):
        for bad in (0, 2.5, -3):
            pour = dict(self.POUR_OK, grains=bad)
            errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
            self.assertTrue(any("pour" in e and "grains" in e for e in errors), bad)

    def test_pour_total_grain_mass_below_body_mass(self):
        pour = dict(self.POUR_OK, grainMass=0.1)  # 40 × 0.1 = 4 ≥ 1.0
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "grainMass" in e for e in errors))

    def test_pour_gate_body_must_be_hinged_to_this_body(self):
        pour = dict(self.POUR_OK, gate={"body": "nope", "minAngle": 1.0})
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "gate.body" in e for e in errors))

    def test_pour_gate_min_angle_within_hinge_limits(self):
        pour = dict(self.POUR_OK, gate={"body": "cap", "minAngle": 3.0})
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "minAngle" in e for e in errors))

    def test_pour_missing_field(self):
        pour = {k: v for k, v in self.POUR_OK.items() if k != "ratePerSecond"}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "ratePerSecond" in e for e in errors))
```

- [x] **Step 2: 跑測試確認失敗**

Run: `python3 -m unittest forge.tests.test_validate_spec -k pour -v`
Expected: `test_pour_tilt_in_open_interval` 等 6 個 FAIL（validator 尚未認得 pour，不產生任何含 "pour" 的錯誤）；`test_pour_valid_passes`／`test_pour_without_gate_passes` 可能已 PASS（未知欄位被忽略）。

- [x] **Step 3: 實作驗證**

`forge/validate_spec.py`，在 `_check_rupture` 之後加：

```python
_POUR_POSITIVE = ("grainMass", "ratePerSecond")


def _check_pour(bid, body, constraints, errors):
    """可傾倒 body：節流的質量轉移契約（M11 設計文件 §3.2／§4）。"""
    pour = body.get("pour")
    if pour is None:
        return
    if not isinstance(pour, dict):
        errors.append(f"body {bid} pour 必須是物件")
        return
    tilt = pour.get("tiltThreshold")
    if (not isinstance(tilt, (int, float)) or isinstance(tilt, bool)
            or not 0 < tilt < math.pi):
        errors.append(f"body {bid} pour.tiltThreshold 必須在 (0, π) 內")
    for key in _POUR_POSITIVE:
        v = pour.get(key)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or v <= 0:
            errors.append(f"body {bid} pour.{key} 必須為正數")
    grains = pour.get("grains")
    if not isinstance(grains, int) or isinstance(grains, bool) or grains <= 0:
        errors.append(f"body {bid} pour.grains 必須為正整數")
    mass, gm = body.get("mass"), pour.get("grainMass")
    if (isinstance(grains, int) and not isinstance(grains, bool)
            and isinstance(mass, (int, float)) and isinstance(gm, (int, float))
            and not isinstance(gm, bool) and grains * gm >= mass):
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
    if (not isinstance(ang, (int, float)) or isinstance(ang, bool)
            or not isinstance(limits, list) or not (limits[0] <= ang <= limits[1])):
        errors.append(f"body {bid} pour.gate.minAngle {ang!r} 必須落在 hinge limits {limits!r} 內")
```

檔頭 `import math`（若尚無）。bodies 迴圈裡 `_check_rupture(bid, b, errors)` 之後加
`_check_pour(bid, b, spec["physics"].get("constraints", []), errors)`。

- [x] **Step 4: 跑測試確認通過**

Run: `python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'`
Expected: 全部 OK（104 + 8）。

- [x] **Step 5: grimoire 文件**

`grimoire/spec.md` 在「rupture（M10 可破裂 body）」節之後加：

```markdown
## pour（M11 可傾倒 body）

粉罐類物件傾倒時容器不變、內容物離開——契約仍是**質量轉移**，但是**節流**的：傾角夠大、
蓋子夠開、還有存量時每秒倒出固定顆數。在 `physics.bodies[]` 上選填：

```json
{ "id": "bottle", "components": ["bottle", "powder-face", "label-band"], "mass": 0.45,
  "pour": { "tiltThreshold": 1.2, "grains": 40, "grainMass": 0.003, "ratePerSecond": 20,
            "gate": { "body": "cap", "minAngle": 1.0 } } }
```

- `tiltThreshold`（rad）：body 局部 +y 與世界 +y 的夾角達此值才倒；(0, π)。
- `grains`：總顆數（正整數）；`grainMass`（kg）：每顆質量；`grains × grainMass < mass`。
- `ratePerSecond`：倒出速率（顆／秒），正數。
- `gate`（選填）：`body` 必須是掛在本 body 上（bodyA = 本 body）的 hinge 之 bodyB；hinge 角
  ≥ `minAngle`（須在該 hinge limits 內）才倒。

factory 契約：掛 actuator `pour:<bodyId>`（kind `"pour"`，min 0、max 1，`set(1)` 立即倒出全部剩餘、
冪等；`set(0)` 無事）；每倒一顆 `bodies[<bodyId>]` 質量減 `grainMass`，顆粒為 `bodies["grain-<i>"]`
／`meshes["grain-<i>"]`。gate：`viewer/scripts/pour_test.ts`。
```

`grimoire/physics.md` 在「破裂＝質量轉移（M10 rupture）」節之後加：

```markdown
## 傾倒＝節流的質量轉移（M11 pour）

- 傾角：`node.getDirection(Vector3.Up())` 取 body 局部 +y 的世界向量，`acos(up.y)` 即傾角，每個
  物理步在 `onAfterPhysicsObservable` 量。蓋門：蓋 hinge 角用 `hinge.ts` 的 `hingeAngle(a, b, bind)`，
  `bind` 在**任何物理步之前**取（`relativeRotation`）。
- 節流：條件成立時每步累積 `ratePerSecond / 60`，累積滿 1 顆就生成；條件中斷時累積歸零。
- 生成點：pivot + up × (容器半高 + 0.015)，再加 seed 決定的 ±0.01 m 散佈（手動一次全倒時同點
  生成會互相彈開）；若低於 `groundY + 直徑` 則抬到該高度。初速 = 容器速度 + up × 0.3 m/s。
- 顆粒：sphere 直徑 0.010、摩擦 0.8、回彈 0.05、線性／角阻尼 2.0（理想球永滾）。碰撞過濾：
  顆粒 `membership = GRAIN_GROUP(4)`、`collide = ~GROUP(2)`；容器與蓋 `membership = GROUP`、
  `collide = ~GROUP`——顆粒互撞、撞地，不撞容器（避免卡在頸口），Havok 兩側 mask 都要成立才碰。
- 每顆 `setMassProperties({ mass: mass − poured × grainMass, centerOfMass })`（質心要重給，否則歸零）。
- `dispose()` 連顆粒、觀察者一併釋放。
- 校準法：側躺 90° 必倒（門檻 1.2 rad ≈ 69°）；直立 0° 不倒；蓋閉不倒。physics_test 自 0.3 m
  落下若翻倒且蓋彈開會倒粉——質心壓低（COM y −0.02）讓罐子落地站穩。
```

- [x] **Step 6: Commit**

```bash
git add forge/validate_spec.py forge/tests/test_validate_spec.py grimoire/spec.md grimoire/physics.md
git commit -m "M11 pour 契約：validate_spec _check_pour（TDD 8 測試）＋ grimoire spec/physics 兩節

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 2: pour 契約——types／harness／hinge 量測助手／actuation_test／pour_test

**Files:**
- Modify: `viewer/src/types.ts`（kind 聯集）
- Modify: `viewer/src/harness.ts:126`（`act.kind === "rupture"` → 含 `"pour"`）
- Modify: `viewer/src/hinge.ts`（加 `relativeRotation`／`hingeAngle`）
- Modify: `viewer/scripts/actuation_test.ts`
- Create: `viewer/scripts/pour_test.ts`

**Interfaces:**
- Produces: `Actuator.kind` 含 `"pour"`；`hingeAngle(a: PhysicsBody, b: PhysicsBody, bind: Matrix): number`、`relativeRotation(a, b): Matrix`（export 自 `viewer/src/hinge.ts`）；gate `npx tsx scripts/pour_test.ts <model> --spec <spec.json>`。

- [x] **Step 1: types.ts**

```ts
  id: string; // "drive" | "steer" | `servo:<bodyB>.<axis>` | `light:<componentId>` | `rupture:<bodyId>` | `pour:<bodyId>`
  kind: "drive" | "steer" | "servo" | "light" | "rupture" | "pour";
```

- [x] **Step 2: harness.ts**

把 `if (act.kind === "rupture") {` 改成 `if (act.kind === "rupture" || act.kind === "pour") {`，註解補「M11 pour 同樣一次性按鈕」。

- [x] **Step 3: hinge.ts 加量測助手**

檔頭 import 加 `Matrix`。檔尾加：

```ts
/** B 相對 A 的旋轉矩陣（世界旋轉相除）。綁定姿勢要在任何物理步之前取。 */
export function relativeRotation(a: PhysicsBody, b: PhysicsBody): Matrix {
  a.transformNode.computeWorldMatrix(true);
  b.transformNode.computeWorldMatrix(true);
  return b.transformNode.getWorldMatrix().getRotationMatrix()
    .multiply(Matrix.Invert(a.transformNode.getWorldMatrix().getRotationMatrix()));
}

/** 單軸（x）hinge 角，相對綁定姿勢 bind：所有 Euler 順序在單軸下重合，取 x 分量。 */
export function hingeAngle(a: PhysicsBody, b: PhysicsBody, bind: Matrix): number {
  const m = Matrix.Invert(bind).multiply(relativeRotation(a, b)).m;
  return Math.atan2(m[6], m[5]);
}
```

- [x] **Step 4: actuation_test.ts 加 pour**

型別：

```ts
interface SpecPour { tiltThreshold: number; grains: number; grainMass: number; ratePerSecond: number; gate?: { body: string; minAngle: number } }
interface SpecBody { id: string; mass: number; rupture?: SpecRupture; pour?: SpecPour }
```

`ruptureDecls` 之後加 `const pourDecls = (spec.physics?.bodies ?? []).filter((b) => b.pour);`，early-return 條件加 `&& !pourDecls.length`。coverage 迴圈之後加：

```ts
  for (const b of pourDecls) {
    push(`coverage:pour:${b.id}`, byId.has(`pour:${b.id}`),
      byId.has(`pour:${b.id}`) ? "有 pour actuator" : "spec 宣告 pour 但無 actuator");
  }
  // ---- pour（M11）：手動全倒——會改質量、生顆粒，排在所有其他檢查之後 ----
  const grainCount = (): number => Object.keys(model.bodies).filter((k) => k.startsWith("grain-")).length;
  const runPour = (): void => {
    for (const b of pourDecls) {
      const act = byId.get(`pour:${b.id}`);
      const body = model.bodies[b.id];
      const pour = b.pour!;
      if (!act || !body) continue;
      act.set(1);
      step(5);
      const mass = body.getMassProperties().mass ?? NaN;
      const grainsA = grainCount();
      act.set(1);
      step(5);
      const grainsB = grainCount();
      const expected = b.mass - pour.grains * pour.grainMass;
      push(`pour:${b.id}`,
        Math.abs(mass - expected) < 1e-5 && grainsA === pour.grains && grainsB === pour.grains,
        `質量 ${mass} vs ${expected}；顆粒 ${grainsA}/${grainsB}（期望 ${pour.grains}，冪等）`);
    }
  };
```

檔尾 `if (ruptureDecls.length) { step(T(SETTLE_STEPS)); runRupture(); }` 改為
`if (ruptureDecls.length || pourDecls.length) { step(T(SETTLE_STEPS)); runRupture(); runPour(); }`。

- [x] **Step 5: 新檔 `viewer/scripts/pour_test.ts`**

```ts
// 傾倒 gate（M11 pour）：spec 有 pour 的 body 必須 (A) 蓋閉、側躺 300 步不倒——顆粒 0、質量不變；
// (B) 蓋開（gate servo 上限）、側躺 → 300 步內顆粒數 = grains、質量 = mass − grains×grainMass，
// 再 300 步顆粒全靜止且全部有限；(C) 直立、蓋開 120 步不倒；手動 pour:<id> set(1) 兩次只倒一輪；
// dispose 後場景無 grain mesh。
// 用法: npx tsx scripts/pour_test.ts <model-name> --spec <spec.json> [--out result.json]
import {
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  Vector3,
} from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene, type HeadlessContext } from "../src/headless";
import { registry } from "../src/registry";
import type { BuiltModel } from "../src/types";

const LAND_STEPS = 120;
const POUR_STEPS = 300;
const SETTLE_STEPS = 300;
const SETTLE_SPEED = 0.02;
const LYING_LIFT = 0.06; // m：側躺時 root 抬高，讓半徑 0.04 的罐身不從地下出生

interface SpecPour { tiltThreshold: number; grains: number; grainMass: number; ratePerSecond: number; gate?: { body: string; minAngle: number } }
interface SpecBody { id: string; mass: number; pour?: SpecPour }
interface SpecConstraint { type: string; bodyA: string; bodyB: string; limits?: number[] | "free" }
interface Spec { physics?: { bodies?: SpecBody[]; constraints?: SpecConstraint[] } }
interface Check { id: string; ok: boolean; detail: string }

async function spawn(name: string, lying: boolean): Promise<{ ctx: HeadlessContext; model: BuiltModel }> {
  const ctx = await createHeadlessScene();
  const { scene, step } = ctx;
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
  const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const gShape = new PhysicsShapeBox(new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), scene);
  gShape.material = { friction: 0.7, restitution: 0.2 };
  gBody.shape = gShape;
  const factory = (await registry[name]()).default;
  const model = factory(scene, { physics: true });
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = false; });
  if (lying) { model.root.rotation.z = Math.PI / 2; model.root.position.y += LYING_LIFT; }
  step(2);
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = true; });
  return { ctx, model };
}

function grains(model: BuiltModel): PhysicsBody[] {
  return Object.entries(model.bodies).filter(([k]) => k.startsWith("grain-")).map(([, b]) => b);
}

function allFinite(model: BuiltModel): boolean {
  return Object.values(model.bodies).every((b) => {
    const p = b.transformNode.absolutePosition;
    return [p.x, p.y, p.z].every(Number.isFinite);
  });
}

function openGate(model: BuiltModel, spec: Spec, decl: SpecBody): boolean {
  const gate = decl.pour?.gate;
  if (!gate) return true;
  const con = (spec.physics?.constraints ?? []).find((c) => c.type === "hinge" && c.bodyA === decl.id && c.bodyB === gate.body);
  const act = model.actuators?.find((a) => a.id === `servo:${gate.body}.x`);
  if (!con || !Array.isArray(con.limits) || !act) return false;
  act.set(con.limits[1]);
  return true;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath) {
    console.error(`用法: pour_test.ts <model-name> --spec <spec.json> [--out result.json]；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const decls = (spec.physics?.bodies ?? []).filter((b) => b.pour);
  if (!decls.length) {
    console.log(JSON.stringify({ model: name, checks: [], pass: true, note: "spec 無 pour 宣告" }));
    return 0;
  }
  const checks: Check[] = [];
  const push = (id: string, ok: boolean, detail: string): void => { checks.push({ id, ok, detail }); };

  for (const decl of decls) {
    const pour = decl.pour!;
    const emptied = decl.mass - pour.grains * pour.grainMass;
    // (A) 蓋閉側躺不倒
    {
      const { ctx, model } = await spawn(name, true);
      ctx.step(LAND_STEPS + POUR_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      push(`A:${decl.id}:closed`, grains(model).length === 0 && Math.abs(mass - decl.mass) < 1e-5,
        `蓋閉側躺：顆粒 ${grains(model).length}、質量 ${mass}（期望 ${decl.mass}）`);
      ctx.dispose();
    }
    // (B) 蓋開側躺倒空
    {
      const { ctx, model } = await spawn(name, true);
      ctx.step(LAND_STEPS);
      push(`B:${decl.id}:gate`, openGate(model, spec, decl), "gate servo 可命令到上限");
      ctx.step(POUR_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      const gs = grains(model);
      push(`B:${decl.id}:poured`, gs.length === pour.grains && Math.abs(mass - emptied) < 1e-5,
        `顆粒 ${gs.length}（期望 ${pour.grains}）、質量 ${mass}（期望 ${emptied}）`);
      ctx.step(SETTLE_STEPS);
      const maxSpeed = Math.max(0, ...gs.map((g) => g.getLinearVelocity().length()));
      push(`B:${decl.id}:settle`, maxSpeed < SETTLE_SPEED && allFinite(model), `顆粒最大速度 ${maxSpeed.toFixed(4)}，有限 ${allFinite(model)}`);
      ctx.dispose();
    }
    // (C) 直立蓋開不倒；手動冪等；dispose 乾淨
    {
      const { ctx, model } = await spawn(name, false);
      ctx.step(60);
      openGate(model, spec, decl);
      ctx.step(120);
      push(`C:${decl.id}:upright`, grains(model).length === 0, `直立蓋開：顆粒 ${grains(model).length}`);
      const act = model.actuators?.find((a) => a.id === `pour:${decl.id}`);
      if (!act) {
        push(`C:${decl.id}:actuator`, false, "無 pour actuator");
      } else {
        act.set(1); ctx.step(5); act.set(1); ctx.step(5);
        const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
        push(`C:${decl.id}:idempotent`, grains(model).length === pour.grains && Math.abs(mass - emptied) < 1e-5,
          `手動兩次：顆粒 ${grains(model).length}（期望 ${pour.grains}）、質量 ${mass}`);
      }
      model.dispose();
      push(`C:${decl.id}:dispose`, !ctx.scene.meshes.some((m) => m.name.startsWith("grain-")), "dispose 後場景無 grain mesh");
      ctx.dispose();
    }
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
cd /Users/wake/Desktop/local_three/img-to-babylon/viewer && npx tsc --noEmit \
 && npx tsx scripts/pour_test.ts chemo-iv-bag --spec models/chemo-iv-bag/spec.json \
 && npx tsx scripts/actuation_test.ts chemo-iv-bag --spec models/chemo-iv-bag/spec.json | tail -3 \
 && npx tsx scripts/rupture_test.ts chemo-iv-bag --spec models/chemo-iv-bag/spec.json | tail -3
```
Expected: tsc 無錯；pour_test 印 `spec 無 pour 宣告`；actuation／rupture `"pass": true`。

- [x] **Step 7: Commit**

```bash
git add viewer/src/types.ts viewer/src/harness.ts viewer/src/hinge.ts viewer/scripts/actuation_test.ts viewer/scripts/pour_test.ts
git commit -m "M11 pour 契約：Actuator kind pour、harness 按鈕、hinge.ts 角度量測助手、actuation_test 覆蓋、pour_test gate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 3: `absorbent-powder-shaker` 吸附粉罐（六步五 pass，pour gate 轉綠）

**Files:**
- Create: `viewer/models/absorbent-powder-shaker/spec.json`
- Create: `viewer/models/absorbent-powder-shaker/createAbsorbentPowderShakerModel.ts`
- Modify: `viewer/src/registry.ts`

**Interfaces:**
- Consumes: `createHinge`／`makeHingeServo`／`relativeRotation`／`hingeAngle`（`viewer/src/hinge.ts`）。
- Produces: registry `"absorbent-powder-shaker"`；bodies `bottle`、`cap`；actuators `servo:cap.x`（[0, 1.9]）、`pour:bottle`；顆粒 `bodies["grain-0..39"]`。

- [x] **Step 1: 初始化與參考圖**

```bash
python3 forge/next_pass.py init --model absorbent-powder-shaker --force
mkdir -p .img2babylon/absorbent-powder-shaker
python3 forge/tomato.py gen --seed 1105 --out .img2babylon/absorbent-powder-shaker/hero.png --prompt "a small white HDPE shaker bottle of chemical spill absorbent solidifier powder, 8 cm diameter 16 cm tall cylinder with a purple flip-top cap hinged at the back, a white label with purple print reading ABSORBENT, standing upright, three-quarter view, centered, plain light gray background, soft studio lighting, product photo"
```
agent vision 讀圖校對比例（蓋厚、標籤位置）；記 job_id／prompt。

- [x] **Step 2: 寫 spec**

```json
{
  "targetName": "absorbent-powder-shaker",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/absorbent-powder-shaker/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "white cylindrical shaker bottle 0.08 dia x 0.16 tall with a purple flip-top cap 0.084 dia x 0.02 hinged on the back (+z) rim, white label with purple ABSORBENT print on the front (-z). Rest = upright, cap closed. Cap opens with positive rotation about [1,0,0] up to 1.9. Tilted past 1.2 rad with the cap open it pours 40 grains (mass transfer 0.45 -> 0.33 kg).",
    "complexity": "medium"
  },
  "componentTree": [
    { "id": "bottle", "name": "white bottle body (lathe, open neck)", "level": "macro", "primitive": "lathe",
      "dimensions": { "w": 0.08, "h": 0.16, "d": 0.08, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, 0.08, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "bottle-white",
      "collider": { "type": "cylinder", "size": [0.08, 0.16, 0.08], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "powder-face", "name": "powder surface visible in the neck", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.05, "h": 0.002, "d": 0.05, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0.061, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bottle", "attachment": { "type": "fixed", "socket": "bottle:inside" }, "material": "powder-gray" },
    { "id": "label-band", "name": "front label (partial cylinder band)", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.081, "h": 0.09, "d": 0.081, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, -0.01, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bottle", "attachment": { "type": "fixed", "socket": "bottle:front" }, "material": "label-print" },
    { "id": "cap", "name": "purple flip-top cap", "level": "macro", "primitive": "lathe",
      "dimensions": { "w": 0.084, "h": 0.02, "d": 0.084, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.17, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bottle",
      "attachment": { "type": "hinge", "socket": "bottle:neck-back", "hinge": { "pivot": [0, -0.01, 0.042], "axis": [1, 0, 0], "limits": [0, 1.9] } },
      "material": "cap-purple",
      "collider": { "type": "cylinder", "size": [0.084, 0.02, 0.084], "offset": [0, 0, 0], "confidence": 0.85 } },
    { "id": "cap-tab", "name": "thumb tab at the front of the cap", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.02, "h": 0.006, "d": 0.012, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, -0.004, -0.046], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "cap", "attachment": { "type": "fixed", "socket": "cap:front" }, "material": "cap-purple" },
    { "id": "cap-knuckle", "name": "hinge knuckle at the back of the cap", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.03, "h": 0.012, "d": 0.012, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, -0.008, 0.042], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "cap", "attachment": { "type": "fixed", "socket": "cap:back" }, "material": "cap-purple" }
  ],
  "materials": [
    { "id": "bottle-white", "kind": "procedural", "baseColor": [0.94, 0.94, 0.92], "roughness": 0.45 },
    { "id": "powder-gray", "kind": "procedural", "baseColor": [0.86, 0.86, 0.84], "roughness": 0.95 },
    { "id": "label-print", "kind": "procedural", "baseColor": [0.98, 0.98, 0.97], "roughness": 0.6 },
    { "id": "cap-purple", "kind": "procedural", "baseColor": [0.45, 0.20, 0.60], "roughness": 0.4 }
  ],
  "physics": {
    "bodies": [
      { "id": "bottle", "components": ["bottle", "powder-face", "label-band"], "mass": 0.45, "friction": 0.5, "restitution": 0.1,
        "centerOfMass": [0, -0.02, 0],
        "pour": { "tiltThreshold": 1.2, "grains": 40, "grainMass": 0.003, "ratePerSecond": 20, "gate": { "body": "cap", "minAngle": 1.0 } } },
      { "id": "cap", "components": ["cap", "cap-tab", "cap-knuckle"], "mass": 0.03, "friction": 0.5, "restitution": 0.1, "centerOfMass": [0, 0, 0] }
    ],
    "constraints": [
      { "type": "hinge", "bodyA": "bottle", "bodyB": "cap", "pivotA": [0, 0.08, 0.042], "pivotB": [0, -0.01, 0.042],
        "axis": [1, 0, 0], "limits": [0, 1.9], "actuation": { "type": "servo", "maxForce": 0.5 } }
    ]
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

Run: `python3 forge/validate_spec.py viewer/models/absorbent-powder-shaker/spec.json --strict` → `OK`。

- [x] **Step 3: 寫 factory**

`viewer/models/absorbent-powder-shaker/createAbsorbentPowderShakerModel.ts`：

```ts
// absorbent-powder-shaker — 吸附凝固粉罐：lathe 罐身＋掀蓋 hinge servo＋pour（節流的質量轉移）。
// 對應 spec: viewer/models/absorbent-powder-shaker/spec.json；契約見 grimoire/physics.md「傾倒＝節流的質量轉移」
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsMotionType,
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

// ---- spec 尺寸 ----
const BOTTLE_R = 0.04, BOTTLE_H = 0.16, BOTTLE_Y = BOTTLE_H / 2;
const NECK_R = 0.03, POWDER_Y = 0.061; // 頸口半徑、粉面高（相對 bottle pivot −0.019）
const CAP_R = 0.042, CAP_H = 0.02, CAP_Y = BOTTLE_H + CAP_H / 2; // 0.17
const HINGE_Y = BOTTLE_H, HINGE_Z = CAP_R; // 頸口後緣（+z）
const CAP_LIMITS: [number, number] = [0, 1.9];
const SERVO_FORCE = 0.5;
const MASS = 0.45, CAP_MASS = 0.03, FRICTION = 0.5, RESTITUTION = 0.1;
const BOTTLE_COM = new Vector3(0, -0.02, 0);
// 鏡射 spec physics.bodies[bottle].pour（兩處必須一致）
const POUR = { tiltThreshold: 1.2, grains: 40, grainMass: 0.003, ratePerSecond: 20, gate: { body: "cap", minAngle: 1.0 } };
const GRAIN_D = 0.010, GRAIN_DAMPING = 2.0, GRAIN_EXIT_SPEED = 0.3, GRAIN_SCATTER = 0.02;
const SPOUT_OFFSET = BOTTLE_H / 2 + 0.015; // 自 bottle pivot 沿局部 +y 到生成點
const GROUP = 2, GRAIN_GROUP = 4;
const TESS = 40;
const SEED = 20260905;
const FIXED_DT = 1 / 60;

const CAP_HINGE = {
  pivotA: [0, HINGE_Y - BOTTLE_Y, HINGE_Z] as [number, number, number],
  pivotB: [0, HINGE_Y - CAP_Y, HINGE_Z] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: CAP_LIMITS,
};

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

/** 罐身：外壁上到頸口、內壁下到粉面（lathe，x 半徑、y 相對 bottle pivot）。 */
function bottleProfile(): Vector3[] {
  const b = -BOTTLE_H / 2, t = BOTTLE_H / 2;
  return [
    new Vector3(0, b, 0), new Vector3(BOTTLE_R - 0.003, b, 0), new Vector3(BOTTLE_R, b + 0.004, 0),
    new Vector3(BOTTLE_R, t - 0.03, 0), new Vector3(BOTTLE_R - 0.005, t - 0.014, 0), new Vector3(NECK_R, t - 0.006, 0),
    new Vector3(NECK_R, t, 0), new Vector3(NECK_R - 0.004, t, 0), new Vector3(NECK_R - 0.004, POWDER_Y - BOTTLE_Y - 0.001, 0),
    new Vector3(0, POWDER_Y - BOTTLE_Y - 0.001, 0),
  ];
}

function capProfile(): Vector3[] {
  const b = -CAP_H / 2, t = CAP_H / 2;
  return [new Vector3(0, b, 0), new Vector3(CAP_R, b, 0), new Vector3(CAP_R, t - 0.004, 0), new Vector3(CAP_R - 0.004, t, 0), new Vector3(0, t, 0)];
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 384;
  const tex = new DynamicTexture("shaker-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // 正面看的圓弧帶：先垂直翻轉（material pass 目視若鏡像再加水平翻轉）
  c.fillStyle = "#f9f9f6"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#5a2a80"; c.fillRect(0, 0, w, 84);
  c.fillStyle = "#ffffff"; c.textAlign = "center";
  c.font = "bold 56px Helvetica, Arial, sans-serif"; c.fillText("ABSORBENT", w / 2, 62);
  c.fillStyle = "#1c1c1c";
  c.font = "44px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("吸附凝固粉", w / 2, 150);
  c.font = "26px Helvetica, Arial, sans-serif";
  c.fillText("1. 開蓋傾倒覆蓋液面", w / 2, 215);
  c.fillText("2. 靜置 1 分鐘凝固", w / 2, 255);
  c.fillText("3. 鏟入細胞毒性廢棄物桶", w / 2, 295);
  c.fillStyle = "#5a2a80"; c.fillRect(40, 330, w - 80, 6);
  tex.update(false);
  return tex;
}

export default function createAbsorbentPowderShakerModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("absorbent-powder-shaker", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  const white = mat(scene, "bottle-white", [0.94, 0.94, 0.92], 48);
  white.backFaceCulling = false; // lathe 內壁可見
  const powder = mat(scene, "powder-gray", [0.86, 0.86, 0.84], 4);
  const label = mat(scene, "label-print", [0.98, 0.98, 0.97], 24);
  label.backFaceCulling = false;
  const purple = mat(scene, "cap-purple", [0.45, 0.20, 0.60], 40);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) label.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [white, powder, label, purple];
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- bottle ----
  const bottlePivot = pivot("bottle", root, new Vector3(0, BOTTLE_Y, 0));
  attach("bottle", MeshBuilder.CreateLathe("bottle", { shape: bottleProfile(), tessellation: TESS, closed: true }, scene), bottlePivot, white);
  attach("powder-face", MeshBuilder.CreateCylinder("powder-face", { height: 0.002, diameter: (NECK_R - 0.004) * 2, tessellation: TESS }, scene),
    pivot("powder-face", bottlePivot, new Vector3(0, POWDER_Y - BOTTLE_Y, 0)), powder);
  // 標籤：貼在罐身正面（−z）的 30% 圓弧帶；arc 起點在 +x，rotation.y 把弧心轉到 −z
  const band = MeshBuilder.CreateCylinder("label-band", { height: 0.09, diameter: (BOTTLE_R + 0.0005) * 2, tessellation: 24, arc: 0.3, cap: Mesh.NO_CAP }, scene);
  band.rotation.y = Math.PI / 2 + Math.PI * 0.3; // 弧中心朝 −z（material pass 目視校正）
  attach("label-band", band, pivot("label-band", bottlePivot, new Vector3(0, -0.01, 0)), label);

  // ---- cap ----
  const capPivot = pivot("cap", root, new Vector3(0, CAP_Y, 0));
  attach("cap", MeshBuilder.CreateLathe("cap", { shape: capProfile(), tessellation: TESS, closed: true }, scene), capPivot, purple);
  attach("cap-tab", MeshBuilder.CreateBox("cap-tab", { width: 0.02, height: 0.006, depth: 0.012 }, scene),
    pivot("cap-tab", capPivot, new Vector3(0, -0.004, -(CAP_R + 0.004))), purple);
  attach("cap-knuckle", MeshBuilder.CreateBox("cap-knuckle", { width: 0.03, height: 0.012, depth: 0.012 }, scene),
    pivot("cap-knuckle", capPivot, new Vector3(0, -0.008, HINGE_Z)), purple);

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  const spawned: Mesh[] = [];
  const observers: (() => void)[] = [];

  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const makeBody = (id: string, node: TransformNode, shape: PhysicsShapeCylinder | PhysicsShapeBox, mass: number, com: Vector3): PhysicsBody => {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      shape.material = { friction: FRICTION, restitution: RESTITUTION };
      shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~GROUP;
      container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({ mass, centerOfMass: com });
      bodies[id] = body;
      return body;
    };
    const bottleBody = makeBody("bottle", bottlePivot,
      new PhysicsShapeCylinder(new Vector3(0, -BOTTLE_H / 2, 0), new Vector3(0, BOTTLE_H / 2, 0), BOTTLE_R, scene), MASS, BOTTLE_COM);
    const capBody = makeBody("cap", capPivot,
      new PhysicsShapeCylinder(new Vector3(0, -CAP_H / 2, 0), new Vector3(0, CAP_H / 2, 0), CAP_R, scene), CAP_MASS, Vector3.Zero());

    const capHinge = createHinge(scene, bottleBody, capBody, CAP_HINGE);
    constraints.push(capHinge);
    actuators.push(makeHingeServo(capHinge, "cap", CAP_LIMITS[0], CAP_LIMITS[1], SERVO_FORCE, "蓋子"));

    // ---- pour：節流的質量轉移 ----
    const capBind = relativeRotation(bottleBody, capBody); // 綁定姿勢：任何物理步之前
    const groundY = 0;
    let poured = 0, accum = 0;
    const spawnGrain = (): void => {
      if (poured >= POUR.grains) return;
      const i = poured; poured += 1;
      bottlePivot.computeWorldMatrix(true);
      const up = bottlePivot.getDirection(Vector3.Up());
      const p = bottlePivot.absolutePosition.add(up.scale(SPOUT_OFFSET));
      p.addInPlace(new Vector3((rng() - 0.5) * GRAIN_SCATTER, 0, (rng() - 0.5) * GRAIN_SCATTER));
      if (p.y < groundY + GRAIN_D) p.y = groundY + GRAIN_D;
      const g = MeshBuilder.CreateSphere(`grain-${i}`, { diameter: GRAIN_D, segments: 6 }, scene);
      g.position.copyFrom(p); g.material = powder; g.isPickable = false;
      meshes[`grain-${i}`] = g; spawned.push(g);
      const gb = new PhysicsBody(g, PhysicsMotionType.DYNAMIC, false, scene);
      const gs = new PhysicsShapeSphere(Vector3.Zero(), GRAIN_D / 2, scene);
      gs.material = { friction: 0.8, restitution: 0.05 };
      gs.filterMembershipMask = GRAIN_GROUP; gs.filterCollideMask = ~GROUP; // 互撞、撞地，不撞罐與蓋
      gb.shape = gs;
      gb.setMassProperties({ mass: POUR.grainMass });
      gb.setLinearDamping(GRAIN_DAMPING); gb.setAngularDamping(GRAIN_DAMPING);
      gb.setLinearVelocity(bottleBody.getLinearVelocity().add(up.scale(GRAIN_EXIT_SPEED)));
      bodies[`grain-${i}`] = gb;
      bottleBody.setMassProperties({ mass: MASS - poured * POUR.grainMass, centerOfMass: BOTTLE_COM });
    };
    const after = scene.onAfterPhysicsObservable.add(() => {
      if (poured >= POUR.grains) return;
      bottlePivot.computeWorldMatrix(true);
      const up = bottlePivot.getDirection(Vector3.Up());
      const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
      const capAngle = Math.abs(hingeAngle(bottleBody, capBody, capBind));
      if (tilt < POUR.tiltThreshold || capAngle < POUR.gate.minAngle) { accum = 0; return; }
      accum += POUR.ratePerSecond * FIXED_DT;
      while (accum >= 1 && poured < POUR.grains) { accum -= 1; spawnGrain(); }
    });
    observers.push(() => scene.onAfterPhysicsObservable.remove(after));
    actuators.push({
      id: "pour:bottle", kind: "pour", label: "傾倒", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) while (poured < POUR.grains) spawnGrain(); },
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

`viewer/src/registry.ts` 加：

```ts
  // M11 化療潑灑處理套件第二批
  "absorbent-powder-shaker": () => import("../models/absorbent-powder-shaker/createAbsorbentPowderShakerModel"),
```

- [x] **Step 4: headless gate（含 pour gate）**

```bash
cd /Users/wake/Desktop/local_three/img-to-babylon/viewer && npx tsc --noEmit \
 && npx tsx scripts/runtime_export.ts absorbent-powder-shaker --spec models/absorbent-powder-shaker/spec.json --out ../.img2babylon/absorbent-powder-shaker/runtime.json \
 && python3 ../forge/check_colliders.py ../.img2babylon/absorbent-powder-shaker/runtime.json \
 && npx tsx scripts/physics_test.ts absorbent-powder-shaker --spec models/absorbent-powder-shaker/spec.json | tail -4 \
 && npx tsx scripts/physics_test.ts absorbent-powder-shaker --spec models/absorbent-powder-shaker/spec.json --nudge cap | tail -4 \
 && npx tsx scripts/actuation_test.ts absorbent-powder-shaker --spec models/absorbent-powder-shaker/spec.json | tail -6 \
 && npx tsx scripts/pour_test.ts absorbent-powder-shaker --spec models/absorbent-powder-shaker/spec.json
```
Expected：check_colliders OK；physics_test 兩次 pass；actuation_test `coverage:servo:cap`、`servo:cap.x`、`coverage:pour:bottle`、`pour:bottle` 全 ok；pour_test A／B／C 全 ok。
若 B 顆粒數不足：印出 tilt／capAngle（暫時 console.log）判斷是傾角量法還是蓋門角符號；若 settle 失敗提高阻尼到 3.0。若 physics_test 落地翻倒，降低 COM 到 −0.03。

- [x] **Step 5: 視覺 gate（五 pass 檢查點）**

依「共用流程片段 A／B／C」，相機 `{ alpha: -0.9, beta: 1.15, radius: 0.55, target: [0, 0.09, 0] }`。另截一張蓋開（harness 滑桿 `servo:cap.x` 拉到 1.6）與一張側躺倒粉（harness 無法傾倒——用 playwright evaluate 對 `bottle` body 施 `applyImpulse(new Vector3(0,0,0.5), 頂點)` 後等 2 s 截圖，存 `<name>-poured.png`）。
material pass 檢查標籤：弧帶文字若左右鏡像，在 `makeLabelTexture` 加 `c.translate(w, 0); c.scale(-1, 1)`；若弧帶不在正面，調 `band.rotation.y`。每 pass 追加 reviewHistory、`next_pass.py done`。

- [x] **Step 6: Commit**

```bash
git add viewer/models/absorbent-powder-shaker viewer/src/registry.ts
git commit -m "M11 absorbent-powder-shaker：吸附粉罐（掀蓋 servo＋pour 節流質量轉移）；strict spec／check_colliders／physics_test／actuation_test／pour_test 綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 4: `spill-warning-sign` A 字警示立牌

**Files:**
- Create: `viewer/models/spill-warning-sign/spec.json`
- Create: `viewer/models/spill-warning-sign/createSpillWarningSignModel.ts`
- Modify: `viewer/src/registry.ts`

**Interfaces:**
- Produces: registry `"spill-warning-sign"`；bodies `panel-front`（−z 側）、`panel-back`（+z 側）；actuator `servo:panel-back.x`，limits [−0.61, 0]，出廠角 −0.56（展開）、0 = 併攏。

幾何常數（板 0.30×0.60×0.015、傾 0.28 rad）：`TOP_Y = 0.60·cos0.28 + 0.0075·sin0.28 = 0.5787`；板中心 `CY = TOP_Y − 0.30·cos0.28 + 0.0075·sin0.28 = 0.2925`、`CZ = 0.30·sin0.28 + 0.0075·cos0.28 = 0.0901`。前板 pivot (0, CY, −CZ) rotation.x = +0.28（頂在 +z 側、底在 −z）；後板 (0, CY, +CZ) rotation.x = −0.28。hinge 在兩板局部座標都是頂端內側邊：pivotA (0, 0.30, +0.0075)、pivotB (0, 0.30, −0.0075)。

- [x] **Step 1: 初始化與參考圖**

```bash
python3 forge/next_pass.py init --model spill-warning-sign --force
mkdir -p .img2babylon/spill-warning-sign
python3 forge/tomato.py gen --seed 1106 --out .img2babylon/spill-warning-sign/hero.png --prompt "a yellow A-frame floor warning sign 60 cm tall standing open on a hospital floor, two hinged plastic panels with black text CAUTION CHEMO SPILL and a biohazard symbol, black hinge cap on top, three-quarter view, centered, plain light gray background, soft studio lighting, product photo"
```

- [x] **Step 2: 寫 spec**

```json
{
  "targetName": "spill-warning-sign",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/spill-warning-sign/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "yellow A-frame warning sign: two 0.30 x 0.60 x 0.015 panels hinged along the top edge, each leaning 0.28 rad from vertical (feet 0.33 apart, hinge 0.58 high), black hinge cap, printed CAUTION / CHEMO SPILL / biohazard on both outer faces. Rest = open A (hinge angle -0.56); hinge angle 0 = panels folded together. Limits [-0.61, 0]: the lower limit is what holds the A shape up.",
    "complexity": "medium"
  },
  "componentTree": [
    { "id": "panel-front", "name": "front panel (-z side)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.30, "h": 0.60, "d": 0.015, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, 0.2925, -0.0901], "rotation": [0.28, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "sign-yellow",
      "collider": { "type": "box", "size": [0.30, 0.60, 0.015], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "print-front", "name": "printed face on the front panel", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.28, "h": 0.50, "d": 0.001, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0, -0.008], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "panel-front", "attachment": { "type": "fixed", "socket": "panel-front:outer" }, "material": "print" },
    { "id": "hinge-cap", "name": "black hinge cap along the top edge", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.31, "h": 0.024, "d": 0.024, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0.30, 0.0075], "rotation": [0, 0, 1.5708], "scale": [1, 1, 1] },
      "parent": "panel-front", "attachment": { "type": "fixed", "socket": "panel-front:top" }, "material": "hinge-black" },
    { "id": "panel-back", "name": "back panel (+z side)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.30, "h": 0.60, "d": 0.015, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, 0.2925, 0.0901], "rotation": [-0.28, 0, 0], "scale": [1, 1, 1] },
      "parent": "panel-front",
      "attachment": { "type": "hinge", "socket": "panel-front:top", "hinge": { "pivot": [0, 0.30, -0.0075], "axis": [1, 0, 0], "limits": [-0.61, 0] } },
      "material": "sign-yellow",
      "collider": { "type": "box", "size": [0.30, 0.60, 0.015], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "print-back", "name": "printed face on the back panel", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.28, "h": 0.50, "d": 0.001, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0, 0.008], "rotation": [0, 3.1416, 0], "scale": [1, 1, 1] },
      "parent": "panel-back", "attachment": { "type": "fixed", "socket": "panel-back:outer" }, "material": "print" }
  ],
  "materials": [
    { "id": "sign-yellow", "kind": "procedural", "baseColor": [0.95, 0.76, 0.12], "roughness": 0.5 },
    { "id": "print", "kind": "procedural", "baseColor": [0.95, 0.76, 0.12], "roughness": 0.6 },
    { "id": "hinge-black", "kind": "procedural", "baseColor": [0.12, 0.12, 0.13], "roughness": 0.5 }
  ],
  "physics": {
    "bodies": [
      { "id": "panel-front", "components": ["panel-front", "print-front", "hinge-cap"], "mass": 0.6, "friction": 0.6, "restitution": 0.1, "centerOfMass": [0, 0, 0] },
      { "id": "panel-back", "components": ["panel-back", "print-back"], "mass": 0.6, "friction": 0.6, "restitution": 0.1, "centerOfMass": [0, 0, 0] }
    ],
    "constraints": [
      { "type": "hinge", "bodyA": "panel-front", "bodyB": "panel-back", "pivotA": [0, 0.30, 0.0075], "pivotB": [0, 0.30, -0.0075],
        "axis": [1, 0, 0], "limits": [-0.61, 0], "actuation": { "type": "servo", "maxForce": 4 } }
    ]
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

Run: `python3 forge/validate_spec.py viewer/models/spill-warning-sign/spec.json --strict` → `OK`（若 `_stack_height` 之類的高度檢查對傾斜板抱怨，依錯誤訊息調整 dimensions 說明，不改幾何）。

- [x] **Step 3: 寫 factory**

`viewer/models/spill-warning-sign/createSpillWarningSignModel.ts`：

```ts
// spill-warning-sign — A 字警示立牌：兩板頂端 hinge servo；板 pivot 各帶 ±LEAN，hinge 角 0 = 併攏、−2·LEAN = 展開。
// 對應 spec: viewer/models/spill-warning-sign/spec.json
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
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
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";
import { createHinge, makeHingeServo } from "../../src/hinge";

// ---- spec 尺寸 ----
const PANEL_W = 0.30, PANEL_H = 0.60, PANEL_T = 0.015, LEAN = 0.28;
const COS = Math.cos(LEAN), SIN = Math.sin(LEAN);
const TOP_Y = PANEL_H * COS + (PANEL_T / 2) * SIN; // 樞軸高：外側底角剛好觸地
const CY = TOP_Y - (PANEL_H / 2) * COS + (PANEL_T / 2) * SIN; // 板中心高 0.2925
const CZ = (PANEL_H / 2) * SIN + (PANEL_T / 2) * COS; // 板中心離中線 0.0901
const LIMITS: [number, number] = [-0.61, 0]; // 0 = 併攏；−2·LEAN = 出廠展開；下限撐住 A 形
const SERVO_FORCE = 4;
const MASS = 0.6, FRICTION = 0.6, RESTITUTION = 0.1;
const GROUP = 2;
const HINGE = {
  pivotA: [0, PANEL_H / 2, PANEL_T / 2] as [number, number, number],
  pivotB: [0, PANEL_H / 2, -PANEL_T / 2] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: LIMITS,
};

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.2, 0.2, 0.2); m.specularPower = specPower;
  return m;
}

function biohazard(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  c.strokeStyle = "#1c1c1c"; c.lineWidth = r * 0.18; c.fillStyle = "#1c1c1c";
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    c.beginPath(); c.arc(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.5, 0, Math.PI * 2); c.stroke();
  }
  c.beginPath(); c.arc(cx, cy, r * 0.22, 0, Math.PI * 2); c.stroke();
}

function makePrintTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 896;
  const tex = new DynamicTexture("sign-print", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // 正面 plane：畫布垂直翻轉
  c.fillStyle = "#f2c21f"; c.fillRect(0, 0, w, h);
  c.strokeStyle = "#1c1c1c"; c.lineWidth = 14; c.strokeRect(24, 24, w - 48, h - 48);
  c.fillStyle = "#1c1c1c"; c.textAlign = "center";
  c.font = "bold 110px Helvetica, Arial, sans-serif"; c.fillText("CAUTION", w / 2, 150);
  c.font = "bold 72px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("化療藥物潑灑", w / 2, 250);
  biohazard(c, w / 2, 470, 150);
  c.font = "bold 64px Helvetica, Arial, sans-serif"; c.fillText("CHEMO SPILL", w / 2, 700);
  c.font = "bold 60px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("請勿靠近", w / 2, 790);
  c.font = "36px Helvetica, Arial, sans-serif"; c.fillText("KEEP OUT", w / 2, 840);
  tex.update(false);
  return tex;
}

export default function createSpillWarningSignModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("spill-warning-sign", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  const yellow = mat(scene, "sign-yellow", [0.95, 0.76, 0.12], 24);
  const print = mat(scene, "print", [0.95, 0.76, 0.12], 16);
  const black = mat(scene, "hinge-black", [0.12, 0.12, 0.13], 32);
  const printTex = canPaint ? makePrintTexture(scene) : null;
  if (printTex) { print.diffuseTexture = printTex; print.diffuseColor = Color3.White(); }
  const disposables: { dispose(): void }[] = [yellow, print, black];
  if (printTex) disposables.push(printTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3, rotX = 0): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; p.rotation.x = rotX; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- 前板（−z 側，頂在樞軸、底在 −z）----
  const frontPivot = pivot("panel-front", root, new Vector3(0, CY, -CZ), LEAN);
  attach("panel-front", MeshBuilder.CreateBox("panel-front", { width: PANEL_W, height: PANEL_H, depth: PANEL_T }, scene), frontPivot, yellow);
  attach("print-front", MeshBuilder.CreatePlane("print-front", { width: 0.28, height: 0.50 }, scene),
    pivot("print-front", frontPivot, new Vector3(0, 0, -(PANEL_T / 2 + 0.0005))), print); // 無旋轉 plane 朝 −z（外側）
  const capNode = pivot("hinge-cap", frontPivot, new Vector3(0, PANEL_H / 2, PANEL_T / 2));
  const capMesh = MeshBuilder.CreateCylinder("hinge-cap", { height: PANEL_W + 0.01, diameter: 0.024, tessellation: 24 }, scene);
  capMesh.rotation.z = Math.PI / 2;
  attach("hinge-cap", capMesh, capNode, black);

  // ---- 後板（+z 側）----
  const backPivot = pivot("panel-back", root, new Vector3(0, CY, CZ), -LEAN);
  attach("panel-back", MeshBuilder.CreateBox("panel-back", { width: PANEL_W, height: PANEL_H, depth: PANEL_T }, scene), backPivot, yellow);
  const printBack = MeshBuilder.CreatePlane("print-back", { width: 0.28, height: 0.50 }, scene);
  printBack.rotation.y = Math.PI; // 朝 +z（外側）；整體繞 y 轉 π 是剛體運動，貼圖方向與前板相同
  attach("print-back", printBack, pivot("print-back", backPivot, new Vector3(0, 0, PANEL_T / 2 + 0.0005)), print);

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const [id, node] of [["panel-front", frontPivot], ["panel-back", backPivot]] as [string, TransformNode][]) {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(PANEL_W, PANEL_H, PANEL_T), scene);
      shape.material = { friction: FRICTION, restitution: RESTITUTION };
      shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~GROUP;
      container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({ mass: MASS, centerOfMass: Vector3.Zero() });
      bodies[id] = body;
    }
    const hinge = createHinge(scene, bodies["panel-front"], bodies["panel-back"], HINGE);
    constraints.push(hinge);
    actuators.push(makeHingeServo(hinge, "panel-back", LIMITS[0], LIMITS[1], SERVO_FORCE, "後板"));
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints, actuators,
    dispose(): void {
      constraints.forEach((c) => c.dispose());
      Object.values(bodies).forEach((b) => b.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
```

registry 加 `"spill-warning-sign": () => import("../models/spill-warning-sign/createSpillWarningSignModel"),`。

- [x] **Step 4: headless gate**

```bash
cd /Users/wake/Desktop/local_three/img-to-babylon/viewer && npx tsc --noEmit \
 && npx tsx scripts/runtime_export.ts spill-warning-sign --spec models/spill-warning-sign/spec.json --out ../.img2babylon/spill-warning-sign/runtime.json \
 && python3 ../forge/check_colliders.py ../.img2babylon/spill-warning-sign/runtime.json \
 && npx tsx scripts/physics_test.ts spill-warning-sign --spec models/spill-warning-sign/spec.json | tail -4 \
 && npx tsx scripts/physics_test.ts spill-warning-sign --spec models/spill-warning-sign/spec.json --nudge panel-back | tail -4 \
 && npx tsx scripts/actuation_test.ts spill-warning-sign --spec models/spill-warning-sign/spec.json | tail -6
```
另寫一段暫時性 tsx 探針（scratchpad，不入 repo）：落地 300 步後印兩板 pivot 的世界 y、hinge 角（`hingeAngle` 用出廠 bind 應接近 0、絕對角由 Havok 讀不到就以兩板 up 向量夾角 ≈ 0.56 判斷）、頂端高 ≥ 0.55。若 A 形塌成併攏（角趨近 0），代表方向反了：把 LIMITS 改 [0, 0.61]、servo 的展開值改 0.56，spec 同步。

- [x] **Step 5: 視覺 gate（五 pass 檢查點）**

相機 `{ alpha: -0.8, beta: 1.2, radius: 1.3, target: [0, 0.3, 0] }`。另截收合狀態（harness 滑桿 `servo:panel-back.x` 拉到 0）。

- [x] **Step 6: Commit**

```bash
git add viewer/models/spill-warning-sign viewer/src/registry.ts
git commit -m "M11 spill-warning-sign：A 字警示立牌（頂端 hinge servo，下限撐住 A 形）；全 gate 綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 5: `absorbent-pad` 吸附墊（對摺）

**Files:**
- Create: `viewer/models/absorbent-pad/spec.json`
- Create: `viewer/models/absorbent-pad/createAbsorbentPadModel.ts`
- Modify: `viewer/src/registry.ts`

**Interfaces:**
- Produces: registry `"absorbent-pad"`；bodies `half-a`（下）、`half-b`（上）；actuator `servo:half-b.x`，limits [0, 3.1]；0 = 對摺、3.1 = 攤開。

- [x] **Step 1: 初始化與參考圖**

```bash
python3 forge/next_pass.py init --model absorbent-pad --force
mkdir -p .img2babylon/absorbent-pad
python3 forge/tomato.py gen --seed 1107 --out .img2babylon/absorbent-pad/hero.png --prompt "a folded white chemotherapy spill absorbent pad with a blue plastic backing, folded once in half into a 20 by 25 cm rectangle 2.5 cm thick, lying on a table, quilted white absorbent surface visible at the fold, small label in the corner, three-quarter view from above, centered, plain light gray background, soft studio lighting, product photo"
```

- [x] **Step 2: 寫 spec**

```json
{
  "targetName": "absorbent-pad",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/absorbent-pad/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "absorbent pad folded in half: two 0.20 x 0.012 x 0.25 halves stacked (half-b on top of half-a), joined along the +z edge; white quilted absorbent faces inside, blue backing outside. Rest = folded (hinge angle 0). half-b unfolds over the +z edge with positive rotation about [1,0,0] up to 3.1 and lies flat beyond +z.",
    "complexity": "simple"
  },
  "componentTree": [
    { "id": "half-a", "name": "bottom half (blue backing down, white face up)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.20, "h": 0.012, "d": 0.25, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, 0.006, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "backing-blue",
      "collider": { "type": "box", "size": [0.20, 0.012, 0.25], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "face-a", "name": "quilted white face of half-a (top)", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.19, "h": 0.001, "d": 0.24, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.0065, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "half-a", "attachment": { "type": "fixed", "socket": "half-a:top" }, "material": "absorbent-white" },
    { "id": "half-b", "name": "top half (white face down, blue backing up)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.20, "h": 0.012, "d": 0.25, "units": "m", "confidence": 0.85 },
      "transform": { "position": [0, 0.018, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "half-a",
      "attachment": { "type": "hinge", "socket": "half-a:+z-edge", "hinge": { "pivot": [0, -0.006, 0.125], "axis": [1, 0, 0], "limits": [0, 3.1] } },
      "material": "backing-blue",
      "collider": { "type": "box", "size": [0.20, 0.012, 0.25], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "face-b", "name": "quilted white face of half-b (bottom)", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.19, "h": 0.001, "d": 0.24, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, -0.0065, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "half-b", "attachment": { "type": "fixed", "socket": "half-b:bottom" }, "material": "absorbent-white" },
    { "id": "pad-label", "name": "small corner label on the blue backing", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.06, "h": 0.001, "d": 0.03, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0.05, 0.0065, -0.08], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "half-b", "attachment": { "type": "fixed", "socket": "half-b:top" }, "material": "label-white" }
  ],
  "materials": [
    { "id": "backing-blue", "kind": "procedural", "baseColor": [0.18, 0.43, 0.71], "roughness": 0.5 },
    { "id": "absorbent-white", "kind": "procedural", "baseColor": [0.96, 0.96, 0.94], "roughness": 0.95 },
    { "id": "label-white", "kind": "procedural", "baseColor": [0.98, 0.98, 0.97], "roughness": 0.6 }
  ],
  "physics": {
    "bodies": [
      { "id": "half-a", "components": ["half-a", "face-a"], "mass": 0.05, "friction": 0.8, "restitution": 0.05, "centerOfMass": [0, 0, 0] },
      { "id": "half-b", "components": ["half-b", "face-b", "pad-label"], "mass": 0.05, "friction": 0.8, "restitution": 0.05, "centerOfMass": [0, 0, 0] }
    ],
    "constraints": [
      { "type": "hinge", "bodyA": "half-a", "bodyB": "half-b", "pivotA": [0, 0.006, 0.125], "pivotB": [0, -0.006, 0.125],
        "axis": [1, 0, 0], "limits": [0, 3.1], "actuation": { "type": "servo", "maxForce": 0.5 } }
    ]
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

Run: `python3 forge/validate_spec.py viewer/models/absorbent-pad/spec.json --strict` → `OK`。

- [x] **Step 3: 寫 factory**

`viewer/models/absorbent-pad/createAbsorbentPadModel.ts`：

```ts
// absorbent-pad — 對摺吸附墊：兩半沿 +z 邊 hinge servo（0 = 對摺、π = 攤開）。
// 對應 spec: viewer/models/absorbent-pad/spec.json
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
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
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";
import { createHinge, makeHingeServo } from "../../src/hinge";

// ---- spec 尺寸 ----
const HALF_W = 0.20, HALF_T = 0.012, HALF_D = 0.25;
const A_Y = HALF_T / 2, B_Y = HALF_T * 1.5; // 0.006 / 0.018
const LIMITS: [number, number] = [0, 3.1];
const SERVO_FORCE = 0.5;
const MASS = 0.05, FRICTION = 0.8, RESTITUTION = 0.05;
const GROUP = 2;
const SEED = 20260905;
const HINGE = {
  pivotA: [0, HALF_T / 2, HALF_D / 2] as [number, number, number],
  pivotB: [0, -HALF_T / 2, HALF_D / 2] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: LIMITS,
};

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
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.1, 0.1, 0.1); m.specularPower = specPower;
  return m;
}

/** 壓紋點陣：點對稱，不受 plane 方向翻轉影響。 */
function makeQuiltTexture(scene: Scene, rng: () => number): DynamicTexture {
  const w = 512, h = 640;
  const tex = new DynamicTexture("pad-quilt", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#f4f4ef"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#dcdcd4";
  for (let y = 24; y < h; y += 40) for (let x = 24; x < w; x += 40) {
    const r = 5 + rng() * 2;
    c.beginPath(); c.arc(x + (rng() - 0.5) * 3, y + (rng() - 0.5) * 3, r, 0, Math.PI * 2); c.fill();
  }
  tex.update(false);
  return tex;
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 256, h = 128;
  const tex = new DynamicTexture("pad-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(w, 0); c.scale(-1, 1); // 朝上 plane：水平翻轉
  c.fillStyle = "#fbfbf8"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#1c3f6e"; c.textAlign = "center";
  c.font = "bold 34px Helvetica, Arial, sans-serif"; c.fillText("ABSORBENT PAD", w / 2, 48);
  c.font = "30px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("吸附墊 40×50", w / 2, 96);
  tex.update(false);
  return tex;
}

export default function createAbsorbentPadModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("absorbent-pad", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  const blue = mat(scene, "backing-blue", [0.18, 0.43, 0.71], 32);
  const white = mat(scene, "absorbent-white", [0.96, 0.96, 0.94], 4);
  const labelMat = mat(scene, "label-white", [0.98, 0.98, 0.97], 16);
  const quilt = canPaint ? makeQuiltTexture(scene, rng) : null;
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (quilt) white.diffuseTexture = quilt;
  if (labelTex) labelMat.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [blue, white, labelMat];
  if (quilt) disposables.push(quilt);
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- half-a（下）：白面朝上 ----
  const aPivot = pivot("half-a", root, new Vector3(0, A_Y, 0));
  attach("half-a", MeshBuilder.CreateBox("half-a", { width: HALF_W, height: HALF_T, depth: HALF_D }, scene), aPivot, blue);
  const faceA = MeshBuilder.CreatePlane("face-a", { width: 0.19, height: 0.24 }, scene);
  faceA.rotation.x = Math.PI / 2; // 朝上
  attach("face-a", faceA, pivot("face-a", aPivot, new Vector3(0, HALF_T / 2 + 0.0005, 0)), white);

  // ---- half-b（上）：白面朝下（攤開後翻成朝上）----
  const bPivot = pivot("half-b", root, new Vector3(0, B_Y, 0));
  attach("half-b", MeshBuilder.CreateBox("half-b", { width: HALF_W, height: HALF_T, depth: HALF_D }, scene), bPivot, blue);
  const faceB = MeshBuilder.CreatePlane("face-b", { width: 0.19, height: 0.24 }, scene);
  faceB.rotation.x = -Math.PI / 2; // 朝下
  attach("face-b", faceB, pivot("face-b", bPivot, new Vector3(0, -(HALF_T / 2 + 0.0005), 0)), white);
  const label = MeshBuilder.CreatePlane("pad-label", { width: 0.06, height: 0.03 }, scene);
  label.rotation.x = Math.PI / 2;
  attach("pad-label", label, pivot("pad-label", bPivot, new Vector3(0.05, HALF_T / 2 + 0.0005, -0.08)), labelMat);

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const [id, node] of [["half-a", aPivot], ["half-b", bPivot]] as [string, TransformNode][]) {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(HALF_W, HALF_T, HALF_D), scene);
      shape.material = { friction: FRICTION, restitution: RESTITUTION };
      shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~GROUP; // 摺疊時面貼面不互撞
      container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({ mass: MASS, centerOfMass: Vector3.Zero() });
      bodies[id] = body;
    }
    const hinge = createHinge(scene, bodies["half-a"], bodies["half-b"], HINGE);
    constraints.push(hinge);
    actuators.push(makeHingeServo(hinge, "half-b", LIMITS[0], LIMITS[1], SERVO_FORCE, "上半片"));
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints, actuators,
    dispose(): void {
      constraints.forEach((c) => c.dispose());
      Object.values(bodies).forEach((b) => b.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
```

registry 加 `"absorbent-pad": () => import("../models/absorbent-pad/createAbsorbentPadModel"),`。

- [x] **Step 4: headless gate**

```bash
cd /Users/wake/Desktop/local_three/img-to-babylon/viewer && npx tsc --noEmit \
 && npx tsx scripts/runtime_export.ts absorbent-pad --spec models/absorbent-pad/spec.json --out ../.img2babylon/absorbent-pad/runtime.json \
 && python3 ../forge/check_colliders.py ../.img2babylon/absorbent-pad/runtime.json \
 && npx tsx scripts/physics_test.ts absorbent-pad --spec models/absorbent-pad/spec.json | tail -4 \
 && npx tsx scripts/physics_test.ts absorbent-pad --spec models/absorbent-pad/spec.json --nudge half-b | tail -4 \
 && npx tsx scripts/actuation_test.ts absorbent-pad --spec models/absorbent-pad/spec.json | tail -6
```
actuation_test 的 servo 檢查到位角若因 servo 太強彈飛而失敗，SERVO_FORCE 降到 0.2（spec 同步）。

- [x] **Step 5: 視覺 gate（五 pass 檢查點）**

相機 `{ alpha: -0.9, beta: 1.0, radius: 0.6, target: [0, 0.02, 0.05] }`。另截攤開狀態（滑桿 3.1）確認白面朝上。

- [x] **Step 6: Commit**

```bash
git add viewer/models/absorbent-pad viewer/src/registry.ts
git commit -m "M11 absorbent-pad：對摺吸附墊（摺邊 hinge servo 攤開／摺起）；全 gate 綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 6: `ppe-set` 防護裝備組（三自由 body）

**Files:**
- Create: `viewer/models/ppe-set/spec.json`
- Create: `viewer/models/ppe-set/createPpeSetModel.ts`
- Modify: `viewer/src/registry.ts`

**Interfaces:**
- Produces: registry `"ppe-set"`；bodies `glove-box`、`gown-pack`、`goggles`；無 actuator、`constraints: []`。

- [x] **Step 1: 初始化與參考圖**

```bash
python3 forge/next_pass.py init --model ppe-set --force
mkdir -p .img2babylon/ppe-set
python3 forge/tomato.py gen --seed 1108 --out .img2babylon/ppe-set/hero.png --prompt "chemotherapy personal protective equipment set laid out on a table: a purple cardboard box of nitrile gloves with an oval dispensing slot on top, a sealed pale blue plastic pack containing a folded blue isolation gown, and a pair of clear safety goggles with dark gray frame and elastic strap, three-quarter view from above, centered, plain light gray background, soft studio lighting, product photo"
```

- [x] **Step 2: 寫 spec**

```json
{
  "targetName": "ppe-set",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/ppe-set/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "three free rigid bodies lying on the floor: a purple nitrile glove box 0.24 x 0.09 x 0.13 at x=-0.20, a pale blue sealed gown pack 0.30 x 0.04 x 0.22 at x=+0.15 z=+0.06, and clear goggles with dark frame and strap 0.17 x 0.06 x 0.09 at x=+0.16 z=-0.16. No constraints.",
    "complexity": "medium"
  },
  "componentTree": [
    { "id": "glove-box", "name": "purple nitrile glove dispenser box", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.24, "h": 0.09, "d": 0.13, "units": "m", "confidence": 0.85 },
      "transform": { "position": [-0.20, 0.045, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "box-purple",
      "collider": { "type": "box", "size": [0.24, 0.09, 0.13], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "glove-slot", "name": "oval dispensing slot on top", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.12, "h": 0.001, "d": 0.06, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.0455, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "glove-box", "attachment": { "type": "fixed", "socket": "glove-box:top" }, "material": "slot-print" },
    { "id": "glove-label", "name": "front label NITRILE GLOVES", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.20, "h": 0.06, "d": 0.001, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.005, -0.0655], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "glove-box", "attachment": { "type": "fixed", "socket": "glove-box:front" }, "material": "label-print" },
    { "id": "gown-pack", "name": "sealed translucent gown pack", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.30, "h": 0.04, "d": 0.22, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0.15, 0.02, 0.06], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "pack-film",
      "collider": { "type": "box", "size": [0.30, 0.04, 0.22], "offset": [0, 0, 0], "confidence": 0.9 } },
    { "id": "gown-fold", "name": "folded blue gown inside", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.28, "h": 0.03, "d": 0.20, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "gown-pack", "attachment": { "type": "fixed", "socket": "gown-pack:inside" }, "material": "gown-blue" },
    { "id": "gown-label", "name": "top label ISOLATION GOWN", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.14, "h": 0.001, "d": 0.07, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.0205, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "gown-pack", "attachment": { "type": "fixed", "socket": "gown-pack:top" }, "material": "label-print" },
    { "id": "goggles", "name": "goggles frame", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.16, "h": 0.05, "d": 0.035, "units": "m", "confidence": 0.7 },
      "transform": { "position": [0.16, 0.03, -0.16], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "frame-gray",
      "collider": { "type": "box", "size": [0.17, 0.06, 0.09], "offset": [0, 0, 0.02], "confidence": 0.8 } },
    { "id": "goggles-lens", "name": "clear lens", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.15, "h": 0.038, "d": 0.008, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.002, -0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "goggles", "attachment": { "type": "fixed", "socket": "goggles:front" }, "material": "lens-clear" },
    { "id": "goggles-strap", "name": "elastic strap ring", "level": "micro", "primitive": "torus",
      "dimensions": { "w": 0.16, "h": 0.008, "d": 0.16, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0, 0.04], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "goggles", "attachment": { "type": "fixed", "socket": "goggles:back" }, "material": "strap-black" }
  ],
  "materials": [
    { "id": "box-purple", "kind": "procedural", "baseColor": [0.48, 0.24, 0.66], "roughness": 0.7 },
    { "id": "slot-print", "kind": "procedural", "baseColor": [0.48, 0.24, 0.66], "roughness": 0.7 },
    { "id": "label-print", "kind": "procedural", "baseColor": [0.97, 0.97, 0.95], "roughness": 0.6 },
    { "id": "pack-film", "kind": "procedural", "baseColor": [0.80, 0.88, 0.95], "roughness": 0.3, "alpha": 0.85 },
    { "id": "gown-blue", "kind": "procedural", "baseColor": [0.25, 0.50, 0.78], "roughness": 0.8 },
    { "id": "frame-gray", "kind": "procedural", "baseColor": [0.22, 0.23, 0.25], "roughness": 0.5 },
    { "id": "lens-clear", "kind": "procedural", "baseColor": [0.85, 0.92, 0.98], "roughness": 0.1, "alpha": 0.35 },
    { "id": "strap-black", "kind": "procedural", "baseColor": [0.10, 0.10, 0.11], "roughness": 0.8 }
  ],
  "physics": {
    "bodies": [
      { "id": "glove-box", "components": ["glove-box", "glove-slot", "glove-label"], "mass": 0.35, "friction": 0.6, "restitution": 0.1, "centerOfMass": [0, 0, 0] },
      { "id": "gown-pack", "components": ["gown-pack", "gown-fold", "gown-label"], "mass": 0.25, "friction": 0.6, "restitution": 0.1, "centerOfMass": [0, 0, 0] },
      { "id": "goggles", "components": ["goggles", "goggles-lens", "goggles-strap"], "mass": 0.06, "friction": 0.6, "restitution": 0.1, "centerOfMass": [0, 0, 0.02] }
    ],
    "constraints": []
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

Run: `python3 forge/validate_spec.py viewer/models/ppe-set/spec.json --strict` → `OK`。密度：手套盒 125、隔離衣包 95、護目鏡 0.06/(0.17·0.06·0.09)=65。

- [x] **Step 3: 寫 factory**

`viewer/models/ppe-set/createPpeSetModel.ts`：

```ts
// ppe-set — 化療防護裝備組：手套盒／隔離衣包／護目鏡三個自由剛體，無約束。
// 對應 spec: viewer/models/ppe-set/spec.json
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

// ---- spec 尺寸 ----
const GLOVE = { w: 0.24, h: 0.09, d: 0.13, pos: new Vector3(-0.20, 0.045, 0), mass: 0.35 };
const GOWN = { w: 0.30, h: 0.04, d: 0.22, pos: new Vector3(0.15, 0.02, 0.06), mass: 0.25 };
const GOGGLES = { frame: { w: 0.16, h: 0.05, d: 0.035 }, collider: { w: 0.17, h: 0.06, d: 0.09, offset: new Vector3(0, 0, 0.02) }, pos: new Vector3(0.16, 0.03, -0.16), mass: 0.06 };
const FRICTION = 0.6, RESTITUTION = 0.1;

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.2, 0.2, 0.2); m.specularPower = specPower;
  if (alpha < 1) m.alpha = alpha;
  return m;
}

/** 正面 plane 用的文字標籤（畫布垂直翻轉）。 */
function frontLabel(scene: Scene, id: string, w: number, h: number, lines: [string, string][], bg: string, fg: string): DynamicTexture {
  const tex = new DynamicTexture(id, { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1);
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = fg; c.textAlign = "center";
  let y = h * 0.42;
  for (const [font, text] of lines) { c.font = font; c.fillText(text, w / 2, y); y += h * 0.36; }
  tex.update(false);
  return tex;
}

/** 朝上 plane 用的標籤（畫布水平翻轉）。 */
function topLabel(scene: Scene, id: string, w: number, h: number, lines: [string, string][], bg: string, fg: string): DynamicTexture {
  const tex = new DynamicTexture(id, { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(w, 0); c.scale(-1, 1);
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = fg; c.textAlign = "center";
  let y = h * 0.42;
  for (const [font, text] of lines) { c.font = font; c.fillText(text, w / 2, y); y += h * 0.36; }
  tex.update(false);
  return tex;
}

function slotTexture(scene: Scene): DynamicTexture {
  const w = 256, h = 128;
  const tex = new DynamicTexture("glove-slot-tex", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#7a3da8"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#1a1020"; c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.4, h * 0.3, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#e8e4f0"; c.beginPath(); c.ellipse(w / 2, h / 2 + 6, w * 0.3, h * 0.14, 0, 0, Math.PI * 2); c.fill(); // 露出的手套
  tex.update(false);
  return tex;
}

export default function createPpeSetModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("ppe-set", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  const purple = mat(scene, "box-purple", [0.48, 0.24, 0.66], 12);
  const slot = mat(scene, "slot-print", [0.48, 0.24, 0.66], 12);
  const gloveLabel = mat(scene, "glove-label-mat", [0.97, 0.97, 0.95], 16);
  const film = mat(scene, "pack-film", [0.80, 0.88, 0.95], 64, 0.85);
  film.backFaceCulling = false;
  const gown = mat(scene, "gown-blue", [0.25, 0.50, 0.78], 8);
  const gownLabel = mat(scene, "gown-label-mat", [0.97, 0.97, 0.95], 16);
  const frame = mat(scene, "frame-gray", [0.22, 0.23, 0.25], 32);
  const lens = mat(scene, "lens-clear", [0.85, 0.92, 0.98], 128, 0.35);
  const strap = mat(scene, "strap-black", [0.10, 0.10, 0.11], 8);
  const disposables: { dispose(): void }[] = [purple, slot, gloveLabel, film, gown, gownLabel, frame, lens, strap];
  if (canPaint) {
    const t1 = slotTexture(scene); slot.diffuseTexture = t1; disposables.push(t1);
    const t2 = frontLabel(scene, "glove-label-tex", 512, 160,
      [["bold 54px Helvetica, Arial, sans-serif", "NITRILE GLOVES"], ["40px 'PingFang TC', 'Noto Sans CJK TC', sans-serif", "化療防護手套  100 pcs"]], "#f7f7f4", "#3a1b52");
    gloveLabel.diffuseTexture = t2; disposables.push(t2);
    const t3 = topLabel(scene, "gown-label-tex", 512, 256,
      [["bold 54px Helvetica, Arial, sans-serif", "ISOLATION GOWN"], ["40px 'PingFang TC', 'Noto Sans CJK TC', sans-serif", "隔離衣  防水  單次使用"]], "#f7f7f4", "#1c3f6e");
    gownLabel.diffuseTexture = t3; disposables.push(t3);
  }

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- glove-box ----
  const glovePivot = pivot("glove-box", root, GLOVE.pos);
  attach("glove-box", MeshBuilder.CreateBox("glove-box", { width: GLOVE.w, height: GLOVE.h, depth: GLOVE.d }, scene), glovePivot, purple);
  const slotPlane = MeshBuilder.CreatePlane("glove-slot", { width: 0.12, height: 0.06 }, scene);
  slotPlane.rotation.x = Math.PI / 2;
  attach("glove-slot", slotPlane, pivot("glove-slot", glovePivot, new Vector3(0, GLOVE.h / 2 + 0.0005, 0)), slot);
  attach("glove-label", MeshBuilder.CreatePlane("glove-label", { width: 0.20, height: 0.06 }, scene),
    pivot("glove-label", glovePivot, new Vector3(0, 0.005, -(GLOVE.d / 2 + 0.0005))), gloveLabel);

  // ---- gown-pack ----
  const gownPivot = pivot("gown-pack", root, GOWN.pos);
  attach("gown-pack", MeshBuilder.CreateBox("gown-pack", { width: GOWN.w, height: GOWN.h, depth: GOWN.d }, scene), gownPivot, film);
  attach("gown-fold", MeshBuilder.CreateBox("gown-fold", { width: 0.28, height: 0.03, depth: 0.20 }, scene),
    pivot("gown-fold", gownPivot, Vector3.Zero()), gown);
  const gownLabelPlane = MeshBuilder.CreatePlane("gown-label", { width: 0.14, height: 0.07 }, scene);
  gownLabelPlane.rotation.x = Math.PI / 2;
  attach("gown-label", gownLabelPlane, pivot("gown-label", gownPivot, new Vector3(0, GOWN.h / 2 + 0.0005, 0)), gownLabel);

  // ---- goggles ----
  const gogglesPivot = pivot("goggles", root, GOGGLES.pos);
  attach("goggles", MeshBuilder.CreateBox("goggles", { width: GOGGLES.frame.w, height: GOGGLES.frame.h, depth: GOGGLES.frame.d }, scene), gogglesPivot, frame);
  attach("goggles-lens", MeshBuilder.CreateBox("goggles-lens", { width: 0.15, height: 0.038, depth: 0.008 }, scene),
    pivot("goggles-lens", gogglesPivot, new Vector3(0, 0.002, -0.02)), lens);
  attach("goggles-strap", MeshBuilder.CreateTorus("goggles-strap", { diameter: 0.16, thickness: 0.008, tessellation: 32 }, scene),
    pivot("goggles-strap", gogglesPivot, new Vector3(0, 0, 0.04)), strap);

  // ---- 物理：三個自由 body ----
  const bodies: Record<string, PhysicsBody> = {};
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const make = (id: string, node: TransformNode, size: Vector3, offset: Vector3, mass: number, com: Vector3): void => {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), size, scene);
      shape.material = { friction: FRICTION, restitution: RESTITUTION };
      container.addChild(shape, offset, Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({ mass, centerOfMass: com });
      bodies[id] = body;
    };
    make("glove-box", glovePivot, new Vector3(GLOVE.w, GLOVE.h, GLOVE.d), Vector3.Zero(), GLOVE.mass, Vector3.Zero());
    make("gown-pack", gownPivot, new Vector3(GOWN.w, GOWN.h, GOWN.d), Vector3.Zero(), GOWN.mass, Vector3.Zero());
    make("goggles", gogglesPivot, new Vector3(GOGGLES.collider.w, GOGGLES.collider.h, GOGGLES.collider.d), GOGGLES.collider.offset, GOGGLES.mass, GOGGLES.collider.offset.clone());
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

registry 加 `"ppe-set": () => import("../models/ppe-set/createPpeSetModel"),`。

- [x] **Step 4: headless gate**

```bash
cd /Users/wake/Desktop/local_three/img-to-babylon/viewer && npx tsc --noEmit \
 && npx tsx scripts/runtime_export.ts ppe-set --spec models/ppe-set/spec.json --out ../.img2babylon/ppe-set/runtime.json \
 && python3 ../forge/check_colliders.py ../.img2babylon/ppe-set/runtime.json \
 && npx tsx scripts/physics_test.ts ppe-set --spec models/ppe-set/spec.json | tail -4 \
 && npx tsx scripts/actuation_test.ts ppe-set --spec models/ppe-set/spec.json
```
Expected：check_colliders OK（護目鏡 collider 含 torus 外徑 0.168 在 ±10% 內）；physics_test pass；actuation_test `spec 無 actuation 宣告`。

- [x] **Step 5: 視覺 gate（五 pass 檢查點）**

相機 `{ alpha: -1.0, beta: 1.05, radius: 0.9, target: [0, 0.03, -0.03] }`。

- [x] **Step 6: Commit**

```bash
git add viewer/models/ppe-set viewer/src/registry.ts
git commit -m "M11 ppe-set：防護裝備組（手套盒／隔離衣包／護目鏡三自由 body）；全 gate 綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 7: `cytotoxic-waste-bin` 補正——側耳把

**Files:**
- Modify: `viewer/models/cytotoxic-waste-bin/spec.json`（componentTree 加 4 件、bin body components、reviewHistory）
- Modify: `viewer/models/cytotoxic-waste-bin/createCytotoxicWasteBinModel.ts`（BODY_DEFS.bin.colliders、幾何、matOf）

- [x] **Step 1: spec**

componentTree 在 `bin-label` 之後加（`transform.position` 相對 bin pivot；耳把 collider 完全在桶身 cylinder AABB x ≤ 0.15 之外）：

```json
    { "id": "handle-l", "name": "left side carry handle", "level": "meso", "primitive": "box",
      "dimensions": { "w": 0.03, "h": 0.035, "d": 0.10, "units": "m", "confidence": 0.6 },
      "transform": { "position": [-0.166, 0.075, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bin", "attachment": { "type": "fixed", "socket": "bin:left" }, "material": "pedal-black",
      "collider": { "type": "box", "size": [0.03, 0.035, 0.10], "offset": [0, 0, 0], "confidence": 0.8 } },
    { "id": "handle-l-stub", "name": "left handle bridge into the wall", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.014, "h": 0.02, "d": 0.06, "units": "m", "confidence": 0.5 },
      "transform": { "position": [-0.147, 0.075, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bin", "attachment": { "type": "fixed", "socket": "bin:left" }, "material": "pedal-black" },
    { "id": "handle-r", "name": "right side carry handle", "level": "meso", "primitive": "box",
      "dimensions": { "w": 0.03, "h": 0.035, "d": 0.10, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0.166, 0.075, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bin", "attachment": { "type": "fixed", "socket": "bin:right" }, "material": "pedal-black",
      "collider": { "type": "box", "size": [0.03, 0.035, 0.10], "offset": [0, 0, 0], "confidence": 0.8 } },
    { "id": "handle-r-stub", "name": "right handle bridge into the wall", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.014, "h": 0.02, "d": 0.06, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0.147, 0.075, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bin", "attachment": { "type": "fixed", "socket": "bin:right" }, "material": "pedal-black" }
```

`physics.bodies[bin].components` 改 `["bin", "bag-liner", "bin-label", "handle-l", "handle-l-stub", "handle-r", "handle-r-stub"]`。
Run strict validate → OK。

- [x] **Step 2: factory**

常數區加 `const HANDLE_X = 0.166, HANDLE_Y = 0.075, HANDLE = { w: 0.03, h: 0.035, d: 0.10 }, STUB_X = 0.147;`。
`BODY_DEFS[0].colliders` 改：

```ts
    colliders: [
      { component: "bin", kind: "cylinder", size: [0.30, BIN_H, 0.30], offset: [0, 0, 0] },
      { component: "handle-l", kind: "box", size: [HANDLE.w, HANDLE.h, HANDLE.d], offset: [0, 0, 0] },
      { component: "handle-r", kind: "box", size: [HANDLE.w, HANDLE.h, HANDLE.d], offset: [0, 0, 0] },
    ] },
```

`matOf` 加 `"handle-l": black, "handle-l-stub": black, "handle-r": black, "handle-r-stub": black`。bin 幾何段（`bin-label` 之後）加：

```ts
  for (const side of [-1, 1] as const) {
    const s = side < 0 ? "l" : "r";
    attach(`handle-${s}`, MeshBuilder.CreateBox(`handle-${s}`, { width: HANDLE.w, height: HANDLE.h, depth: HANDLE.d }, scene),
      pivot(`handle-${s}`, binPivot, new Vector3(side * HANDLE_X, HANDLE_Y, 0)));
    attach(`handle-${s}-stub`, MeshBuilder.CreateBox(`handle-${s}-stub`, { width: 0.014, height: 0.02, depth: 0.06 }, scene),
      pivot(`handle-${s}-stub`, binPivot, new Vector3(side * STUB_X, HANDLE_Y, 0)));
  }
```

- [x] **Step 3: 全 gate 重跑**

```bash
python3 forge/next_pass.py init --model cytotoxic-waste-bin --force
cd /Users/wake/Desktop/local_three/img-to-babylon/viewer && npx tsc --noEmit \
 && npx tsx scripts/runtime_export.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json --out ../.img2babylon/cytotoxic-waste-bin/runtime.json \
 && python3 ../forge/check_colliders.py ../.img2babylon/cytotoxic-waste-bin/runtime.json \
 && npx tsx scripts/physics_test.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json | tail -3 \
 && npx tsx scripts/physics_test.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json --nudge lid | tail -3 \
 && npx tsx scripts/physics_test.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json --nudge pedal | tail -3 \
 && npx tsx scripts/actuation_test.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json | tail -4
```
check_colliders 若報耳把與桶身重疊 > 25%：把 HANDLE_X 加大到 0.17（spec 同步）。

- [x] **Step 4: 視覺 gate（單 pass）**

重截 hero（相機 `{ alpha: -0.9, beta: 1.15, radius: 1.2, target: [0, 0.25, 0] }`）＋collider，compare，divine_eye；reviewHistory 追加：

```json
    { "pass": "polish", "likeness": 8, "colliderFit": 9, "eye": { "verdict": "<實測>", "fidelity": 0, "iou": 0 },
      "action": "continue", "notes": "M11 結案後補正：兩側耳把（box 0.03×0.035×0.10 於 x=±0.166、y 0.30 離地）＋無 collider 接橋；耳把 collider 落在桶身 cylinder AABB 之外以過 check_colliders 重疊規則。全 gate 重跑綠；Divine Eye <實測>。不佔 M10 修正額度。" }
```
（`fidelity`／`iou` 填 divine_eye 實測值。）跑 `python3 forge/next_pass.py done` 到 polish 完成。

- [x] **Step 5: Commit**

```bash
git add viewer/models/cytotoxic-waste-bin
git commit -m "M11 cytotoxic-waste-bin 補正：兩側耳把併入 bin body（collider 落在桶身 AABB 外）；全 gate 重跑綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 8: Playground 七件＋UI＋scene_test＋重部署

**Files:**
- Modify: `../playground/src/scene.ts`（SCENE 七件）
- Modify: `../playground/src/main.ts`（地板 6 m、相機 radius 3.8）
- Modify: `../playground/src/ui.ts`（新卡片、生成物過濾、步驗文字）
- Modify: `../playground/scripts/scene_test.ts`
- Modify: `../playground/README.md`（物件清單）

- [x] **Step 1: scene.ts**

```ts
export const SCENE: SceneEntry[] = [
  { model: "chemo-spill-kit", label: "化療潑灑處理包", position: [-0.9, 0, 0.3], rotationY: 0.4 },
  { model: "chemo-iv-bag", label: "化療點滴袋", position: [-0.1, 0, -0.45], rotationY: -0.3 },
  { model: "cytotoxic-waste-bin", label: "細胞毒性廢棄物桶", position: [1.1, 0, 0.4], rotationY: -0.5 },
  { model: "spill-warning-sign", label: "警示立牌", position: [-0.3, 0, 1.0], rotationY: 0.6 },
  { model: "absorbent-powder-shaker", label: "吸附粉罐", position: [0.35, 0, -0.4], rotationY: 0 },
  { model: "absorbent-pad", label: "吸附墊", position: [0.5, 0, 0.15], rotationY: -0.2 },
  { model: "ppe-set", label: "防護裝備組", position: [-1.3, 0, -0.7], rotationY: 0.2 },
];
```

- [x] **Step 2: main.ts**

`makeFloor`：`const size = 6;`、`tex.uScale = 6; tex.vScale = 6;`。相機：`new ArcRotateCamera("cam", -1.1, 1.05, 3.8, new Vector3(0, 0.25, 0), scene)`。

- [x] **Step 3: ui.ts**

`topple` 的過濾改 `!/^(droplet|grain)-/.test(b.transformNode.name)`。STEPS 改：

```ts
const STEPS = ["隔離現場、示警（警示立牌）", "穿戴防護裝備（防護裝備組）", "打開潑灑處理包", "吸附、清除、消毒（吸附粉罐、吸附墊）", "投入細胞毒性廢棄物桶"];
```

卡片段在 `chemo-iv-bag` 區塊之後加：

```ts
    if (p.entry.model === "spill-warning-sign") {
      btn("展開", () => act(p.model, "servo:panel-back.x")?.set(-0.56));
      btn("收合", () => act(p.model, "servo:panel-back.x")?.set(0));
    }
    if (p.entry.model === "absorbent-powder-shaker") {
      btn("開蓋", () => act(p.model, "servo:cap.x")?.set(1.6));
      btn("關蓋", () => act(p.model, "servo:cap.x")?.set(0));
      btn("傾倒", () => { act(p.model, "servo:cap.x")?.set(1.9); setTimeout(() => topple(camera, p), 400); });
    }
    if (p.entry.model === "absorbent-pad") {
      btn("攤開", () => act(p.model, "servo:half-b.x")?.set(3.1));
      btn("摺起", () => act(p.model, "servo:half-b.x")?.set(0));
    }
```

「推倒」條件改為 `if (!["chemo-iv-bag", "absorbent-pad"].includes(p.entry.model))`（吸附墊太薄推倒無意義）。

- [x] **Step 4: scene_test.ts**

地板 `width: 6, height: 6`、shape `new Vector3(6, 0.1, 6)`。`step(3)` 前取四個 bind；`kitBind` 等之後加：

```ts
  const sign = placed.find((p) => p.entry.model === "spill-warning-sign")!;
  const shaker = placed.find((p) => p.entry.model === "absorbent-powder-shaker")!;
  const pad = placed.find((p) => p.entry.model === "absorbent-pad")!;
  const ppe = placed.find((p) => p.entry.model === "ppe-set")!;
  const signBind = relRot(sign.model.bodies["panel-front"], sign.model.bodies["panel-back"]);
  const padBind = relRot(pad.model.bodies["half-a"], pad.model.bodies["half-b"]);
```

（`settle` 迴圈已涵蓋七件。）`bin:pedal` 之後加：

```ts
  // 立牌：落地後仍是 A 形（頂端高、兩腳觸地），收合到 0 後角度回到 ≥ −0.15（出廠 −0.56 → 0 相對 bind 為 +0.56）
  sign.model.root.computeWorldMatrix(true);
  const signTop = sign.model.nodes["hinge-cap"].absolutePosition.y;
  const feet = ["panel-front", "panel-back"].map((k) => sign.model.bodies[k].transformNode.absolutePosition.y);
  push("sign:standing", signTop >= 0.55 && feet.every((y) => y > 0.25 && y < 0.32), `頂 ${signTop.toFixed(3)}、板心 ${feet.map((y) => y.toFixed(3)).join("/")}`);
  sign.model.actuators?.find((a) => a.id === "servo:panel-back.x")?.set(0);
  step(180);
  const signFold = hingeAngle(sign.model.bodies["panel-front"], sign.model.bodies["panel-back"], signBind);
  push("sign:fold", signFold >= 0.4, `收合相對角 ${signFold.toFixed(3)}（≥ 0.4）`);

  // 吸附墊：攤開
  pad.model.actuators?.find((a) => a.id === "servo:half-b.x")?.set(3.1);
  step(180);
  const padAngle = hingeAngle(pad.model.bodies["half-a"], pad.model.bodies["half-b"], padBind);
  push("pad:unfold", padAngle >= 2.8 || padAngle <= -2.8, `攤開角 ${padAngle.toFixed(3)}（|θ| ≥ 2.8）`);

  // 粉罐：開蓋＋側躺 → 倒空
  shaker.model.actuators?.find((a) => a.id === "servo:cap.x")?.set(1.9);
  step(60);
  {
    const bs = Object.values(shaker.model.bodies);
    bs.forEach((b) => { b.disablePreStep = false; b.setLinearVelocity(Vector3.Zero()); b.setAngularVelocity(Vector3.Zero()); });
    shaker.model.root.rotation.z = Math.PI / 2; shaker.model.root.position.y += 0.06;
    step(2);
    bs.forEach((b) => { b.disablePreStep = true; });
  }
  step(300);
  const shakerMass = shaker.model.bodies["bottle"].getMassProperties().mass ?? NaN;
  const grainsN = Object.keys(shaker.model.bodies).filter((k) => k.startsWith("grain-")).length;
  push("shaker:pour", grainsN === 40 && Math.abs(shakerMass - 0.33) < 1e-5, `顆粒 ${grainsN}、質量 ${shakerMass}`);

  push("ppe:bodies", Object.keys(ppe.model.bodies).length === 3, `ppe body ${Object.keys(ppe.model.bodies).length}`);
```

`bag:respawn` 之後加全部歸位檢查：

```ts
  const meshesBefore = scene.meshes.length;
  await Promise.all(placed.map((p) => p.respawn()));
  step(120);
  const total = placed.reduce((n, p) => n + Object.keys(p.model.bodies).length, 0);
  push("respawn:all", total === 15 && scene.meshes.length <= meshesBefore, `body 總數 ${total}（期望 15：2+1+3+2+2+2+3）、mesh ${scene.meshes.length}（之前 ${meshesBefore}）`);
```

`hingeAngle`／`relRot` 改從 `img2babylon-viewer/hinge` import（`relativeRotation as relRot`），刪掉本地副本（需確認 `viewer/src/index.ts` 或別名允許 `img2babylon-viewer/hinge` 路徑；若不行就保留本地副本）。

- [x] **Step 5: 跑 typecheck、gate、重部署**

```bash
cd /Users/wake/Desktop/local_three/playground && npx tsc --noEmit -p . && npm run scene-test 2>&1 | tail -40 && npm run serve 2>&1 | tail -4
```
Expected：scene_test `"pass": true`；serve 印 tailnet 200 與 wasm MIME。

- [x] **Step 6: 瀏覽器目視**

playwright 開 `https://monkeyday.tail8e3f79.ts.net/?v=3`，等 `__PLAYGROUND_READY__`，截 overview；按「收合」（立牌）、「傾倒」（粉罐）、「攤開」（吸附墊）各等 2 s 截圖；檔案 `mv` 到 `.img2babylon/shots/playground2-{overview,fold,pour,unfold}.png`，Read 目視：七件都在、無穿地、顆粒落地成堆。

- [x] **Step 7: Commit（playground）**

```bash
cd /Users/wake/Desktop/local_three/playground && git add -A && git commit -m "playground：M11 七件（警示立牌／吸附粉罐／吸附墊／防護裝備組）、地板 6 m、新卡片、scene_test 新斷言；重部署

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 9: ROADMAP／任務卡／handoff／結案

**Files:**
- Modify: `ROADMAP.md`（M11 節，放 M10 之後、Parked 之前）
- Create: `tasks/0023-chemo-spill-set-2.md`
- Modify: `.remember/remember.md`

- [x] **Step 1: ROADMAP M11 節**

```markdown
## M11：化療潑灑處理套件第二批（2026-09-05 核准開工）

設計文件 `docs/superpowers/specs/2026-09-05-chemo-spill-set-2-design.md`、計畫 `docs/superpowers/plans/2026-09-05-chemo-spill-set-2.md`。
契約只擴 `pour`（節流的質量轉移：傾角＋蓋門＋速率；`pour_test.ts` gate）。四新模型＋桶耳把補正＋playground 七件。

- [x] 0023 pour 契約＋`spill-warning-sign`／`absorbent-powder-shaker`／`absorbent-pad`／`ppe-set`＋`cytotoxic-waste-bin` 耳把＋playground。
      結果：<各模型 Divine Eye 與修正次數、gate 狀態、陷阱——結案時填>
```

- [x] **Step 2: 任務卡**

`tasks/0023-chemo-spill-set-2.md` 依 0022 格式：model／status／脈絡／分工／驗收／notes（修正次數、教訓）。

- [x] **Step 3: handoff 與 Commit**

更新 `.remember/remember.md`（State：M11 結案 commit；Next：等使用者；Context：本批新陷阱）。

```bash
git add ROADMAP.md tasks/0023-chemo-spill-set-2.md
git commit -m "M11 結案：ROADMAP M11／tasks/0023；四新模型＋pour 契約＋桶耳把＋playground 七件全 gate 綠

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

## 自我檢查（寫完計畫後）

- 規格覆蓋：§3.1 立牌 → Task 4；§3.2 粉罐＋§4 pour → Task 1–3；§3.3 吸附墊 → Task 5；§3.4 PPE → Task 6；§5 耳把 → Task 7；§6 playground → Task 8；§7 順序與 commit 粒度 → 各 task Step 6／7；ROADMAP／tasks → Task 9。
- 型別一致：`hingeAngle(a, b, bind)`／`relativeRotation(a, b)` 在 Task 2 定義、Task 3／8 使用；actuator id `servo:cap.x`／`servo:panel-back.x`／`servo:half-b.x`／`pour:bottle` 在 spec、factory、ui、scene_test 一致；立牌 limits [−0.61, 0]、展開 −0.56、收合 0 三處一致。
- 風險回應：立牌方向若反（Task 4 Step 4 探針）改 LIMITS 符號並同步三處；耳把重疊超標加大 HANDLE_X；粉罐 physics_test 翻倒降 COM；吸附墊 servo 彈飛降 maxForce。
