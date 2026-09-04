# 化療潑灑處理套件（M10）＋ Playground 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 img2babylon 六步流程產出三個化療潑灑處理物件（處理包／可破裂點滴袋／腳踏廢棄物桶），並建一個獨立 playground 展示環境掛到 tailnet 根路徑。

**Architecture:** 先擴 rupture 契約（validate_spec＋types＋harness＋gate），再依序做三個 factory（共用新的 `viewer/src/hinge.ts` 鉸鏈／servo 助手），最後 `local_three/playground` 以路徑別名吃本 checkout，`vite preview` 由 launchd 常駐、`tailscale serve` 反代。

**Tech Stack:** Python 3.10+ stdlib（forge）、TypeScript strict、Babylon.js 8 + Havok（`@babylonjs/havok`）、Vite 6、tsx、playwright MCP（截圖）、Tailscale serve、launchd。

**Spec:** `docs/superpowers/specs/2026-09-04-chemo-spill-set-design.md`

## Global Constraints

- forge/ 只准 Python 3.10+ stdlib，零第三方依賴。
- viewer/ TypeScript strict；只能程式碼建模（primitives / CSG / DynamicTexture），禁止外部 mesh 或貼圖。
- 單位公尺、尺寸烘進幾何參數、程序化雜訊帶 seed、`physics.constraints` 是物理權威。
- 物理尺度 S=1（`physicsScale: 1`）。密度 50–3000 kg/m³。
- 每個模型走 `next_pass.py` 五 pass；每 pass 第 4 次、全程第 6 次修正會被擋（exit 3 = 停下問使用者）。
- `.img2babylon/` 是 gitignored 執行期狀態；state.json 一次只屬一個模型。
- 截圖先存 `.img2babylon/shots/` 再讀回；一次只看一張對照表。
- commit 訊息尾端固定加：
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 與
  `Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6`。
- playground 對外網址 `https://monkeyday.tail8e3f79.ts.net/`（根路徑，取代殘留的 8788 設定）。

---

## 檔案地圖

| 路徑 | 責任 |
|---|---|
| `forge/validate_spec.py` | 新增 `rupture` 欄位驗證 |
| `forge/tests/test_validate_spec.py` | rupture 測試 |
| `grimoire/spec.md`、`grimoire/physics.md` | rupture 契約文件 |
| `viewer/src/types.ts` | `Actuator.kind` 加 `"rupture"` |
| `viewer/src/harness.ts` | 面板對 rupture 用按鈕 |
| `viewer/src/hinge.ts`（新） | `createHinge()` 6DoF 單軸 hinge ＋ `makeHingeServo()` |
| `viewer/scripts/actuation_test.ts` | rupture coverage 與觸發檢查 |
| `viewer/scripts/rupture_test.ts`（新） | 破裂 gate（1.5 m 必破／0.2 m 不破／冪等） |
| `viewer/models/chemo-spill-kit/` | spec.json ＋ createChemoSpillKitModel.ts |
| `viewer/models/chemo-iv-bag/` | spec.json ＋ createChemoIvBagModel.ts |
| `viewer/models/cytotoxic-waste-bin/` | spec.json ＋ createCytotoxicWasteBinModel.ts |
| `viewer/src/registry.ts` | 註冊三模型 |
| `../playground/`（新 git repo） | package.json、vite.config.ts、tsconfig.json、index.html、src/{main,scene,ui,grab,hud}.ts、scripts/{scene_test.ts,serve.sh} |
| `ROADMAP.md`、`tasks/0022-chemo-spill-set.md` | M10 記錄 |

---

### Task 1: rupture 契約——validate_spec（TDD）＋ grimoire

**Files:**
- Modify: `forge/validate_spec.py`（bodies 迴圈內）
- Test: `forge/tests/test_validate_spec.py`
- Modify: `grimoire/spec.md`（`## actuation` 節之前插入新節）、`grimoire/physics.md`（檔尾新節）

**Interfaces:**
- Produces: spec `physics.bodies[].rupture = { impulseThreshold, emptiedMass, puddleRadius, droplets }`，驗證錯誤訊息含「rupture」。

- [ ] **Step 1: 寫失敗測試**

在 `forge/tests/test_validate_spec.py` 的 `ValidateSpecTest` 類別內加：

```python
    def _with_rupture(self, rupture):
        spec = minimal_spec()
        spec["physics"]["bodies"][0]["rupture"] = rupture
        return spec

    def test_rupture_valid_passes(self):
        spec = self._with_rupture(
            {"impulseThreshold": 2.0, "emptiedMass": 0.04, "puddleRadius": 0.3, "droplets": 12})
        errors, _ = validate_spec.validate(spec, strict=True)
        self.assertEqual(errors, [])

    def test_rupture_threshold_must_be_positive(self):
        spec = self._with_rupture(
            {"impulseThreshold": 0, "emptiedMass": 0.04, "puddleRadius": 0.3, "droplets": 12})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "impulseThreshold" in e for e in errors))

    def test_rupture_emptied_mass_below_mass(self):
        spec = self._with_rupture(
            {"impulseThreshold": 2.0, "emptiedMass": 5.0, "puddleRadius": 0.3, "droplets": 12})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "emptiedMass" in e for e in errors))

    def test_rupture_droplets_non_negative_int(self):
        spec = self._with_rupture(
            {"impulseThreshold": 2.0, "emptiedMass": 0.04, "puddleRadius": 0.3, "droplets": -1})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "droplets" in e for e in errors))
        spec = self._with_rupture(
            {"impulseThreshold": 2.0, "emptiedMass": 0.04, "puddleRadius": 0.3, "droplets": 2.5})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "droplets" in e for e in errors))

    def test_rupture_missing_field(self):
        spec = self._with_rupture({"impulseThreshold": 2.0, "emptiedMass": 0.04})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "puddleRadius" in e for e in errors))
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/wake/Desktop/local_three/img-to-babylon && python3 -m unittest forge.tests.test_validate_spec -v 2>&1 | tail -15`
Expected: 4 個 rupture 測試 FAIL（`test_rupture_valid_passes` 會過，因為未知欄位目前被忽略）。

- [ ] **Step 3: 實作驗證**

在 `forge/validate_spec.py` 的 `_check_component_actuation` 之後加：

```python
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
```

在 `validate()` 的 bodies 迴圈裡，`if not isinstance(b.get("mass"), ...)` 那段之後加一行：

```python
        _check_rupture(bid, b, errors)
```

- [ ] **Step 4: 跑測試確認通過**

Run: `python3 -m unittest discover -s forge/tests -t . -p 'test_*.py' 2>&1 | tail -3`
Expected: `OK`

- [ ] **Step 5: grimoire 文件**

`grimoire/spec.md`：在 `## actuation（M4 可動物件契約）` 之前插入：

```markdown
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
```

`grimoire/physics.md` 檔尾加：

```markdown
## 破裂＝質量轉移（M10 rupture）

- 偵測用**動量變化**，不用 Havok 碰撞回呼：`onBeforePhysicsObservable` 記 v₀、
  `onAfterPhysicsObservable` 算 `m·|v₁ − v₀|`。碰撞回呼的 impulse 是逐接觸點，平落四角
  各分四分之一，門檻不可靠；Δv 是整體真相且 headless／viewer 一致。重力每步貢獻
  m·g/60（0.55 kg 為 0.09 N·s），遠低於門檻。
- 破裂動作一次且冪等：`setMassProperties({mass: emptiedMass})`、`body.shape` 換塌扁薄盒
  （舊 shape dispose）、袋視覺換塌扁 mesh（另建幾何，非 scaling）、生成水漬 disc
  （以幀數 90 幀長到全徑；動畫期間用 scaling，終態 scaling=1 且半徑烘進幾何）、
  噴 N 顆液滴球（seed 決定方向）。
- `dispose()` 必須連水漬、液滴、觀察者一起釋放；playground「歸位」＝ dispose ＋重建。
- 校準法：0.55 kg 自 0.3 m 落下 Δv ≈ 2.7 m/s → 1.5 N·s（physics_test 預設落高，不可破）；
  自 1.5 m 落下 ≈ 3 N·s 以上（必破）。門檻 2.0 落在中間。
```

- [ ] **Step 6: Commit**

```bash
git add forge/validate_spec.py forge/tests/test_validate_spec.py grimoire/spec.md grimoire/physics.md
git commit -m "M10 0022 rupture 契約：validate_spec 欄位驗證（TDD）＋grimoire spec/physics 文件"
```

---

### Task 2: rupture 契約——types／harness／hinge 助手／actuation_test／rupture_test（誠實紅）

**Files:**
- Modify: `viewer/src/types.ts:17`（`kind` union）
- Modify: `viewer/src/harness.ts:126-150`（面板列）
- Create: `viewer/src/hinge.ts`
- Modify: `viewer/scripts/actuation_test.ts`
- Create: `viewer/scripts/rupture_test.ts`

**Interfaces:**
- Produces: `createHinge(scene, a, b, def): Physics6DoFConstraint`；`makeHingeServo(joint, bodyB, lo, hi, maxForce): Actuator`；`Actuator.kind` 含 `"rupture"`。
- Produces: `rupture_test.ts <model> --spec <spec.json>` exit 0/1。

- [ ] **Step 1: types.ts**

把 `kind: "drive" | "steer" | "servo" | "light";` 改為

```ts
  kind: "drive" | "steer" | "servo" | "light" | "rupture";
```

並把 id 註解改為 `// "drive" | "steer" | \`servo:<bodyB>.<axis>\` | \`light:<componentId>\` | \`rupture:<bodyId>\``。

- [ ] **Step 2: harness.ts 面板——rupture 用按鈕**

在 `for (const act of acts)` 迴圈開頭（`const row = ...` 之前）加：

```ts
    if (act.kind === "rupture") {
      const b = document.createElement("button");
      b.className = "reset";
      b.textContent = act.label;
      b.onclick = () => act.set(1);
      panel.appendChild(b);
      sliders.push({ input: document.createElement("input"), val: document.createElement("span") });
      continue;
    }
```

（`sliders` 仍要對齊索引，故推入一組不掛載的假元素；`全部歸零` 會呼叫 `set(0)`，rupture 對 0 無動作。）

- [ ] **Step 3: 新檔 `viewer/src/hinge.ts`**

```ts
// 單軸 hinge 與其 servo 的共用助手（M10）：pill-bottle／toy-racer／action-figure 各自
// 內聯了同一段 6DoF 鎖五軸的程式碼；三個新模型改用這裡，避免第四份漂移。
import {
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  Scene,
  Vector3,
} from "@babylonjs/core";
import type { Actuator } from "./types";

export interface HingeDef {
  pivotA: [number, number, number];
  pivotB: [number, number, number];
  axis: [number, number, number];
  limits: [number, number];
}

/** grimoire/physics.md canonical perp：axis 接近 up 用 +x，否則用 up。 */
function perpOf(axis: Vector3): Vector3 {
  const x = axis.normalizeToNew();
  const up = Math.abs(Vector3.Dot(x, Vector3.Up())) > 0.99 ? new Vector3(1, 0, 0) : Vector3.Up();
  return Vector3.Cross(x, up).normalize();
}

/** 6DoF 鎖三線軸＋兩角軸，只留 ANGULAR_X 在 limits 內；蓋與本體不互撞。 */
export function createHinge(
  scene: Scene, a: PhysicsBody, b: PhysicsBody, def: HingeDef,
): Physics6DoFConstraint {
  const axis = Vector3.FromArray(def.axis);
  const perp = perpOf(axis);
  const hinge = new Physics6DoFConstraint(
    {
      pivotA: Vector3.FromArray(def.pivotA),
      pivotB: Vector3.FromArray(def.pivotB),
      axisA: axis,
      axisB: axis,
      perpAxisA: perp,
      perpAxisB: perp,
    },
    [
      { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: def.limits[0], maxLimit: def.limits[1] },
    ],
    scene,
  );
  a.addConstraint(b, hinge);
  hinge.isCollisionsEnabled = false;
  return hinge;
}

/** hinge 的 POSITION servo（惰性啟動：第一次 set 前不影響物理）。id 慣例 `servo:<bodyB>.x`。 */
export function makeHingeServo(
  joint: Physics6DoFConstraint, bodyB: string, lo: number, hi: number, maxForce: number,
  label = `${bodyB}.x`,
): Actuator {
  let armed = false;
  return {
    id: `servo:${bodyB}.x`, kind: "servo", label, min: lo, max: hi,
    set(value: number): void {
      const v = Math.max(lo, Math.min(hi, value));
      if (!armed) {
        joint.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
        joint.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, maxForce);
        armed = true;
      }
      joint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, v);
    },
    release(): void {
      joint.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 0);
      joint.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.NONE);
      armed = false;
    },
  };
}
```

- [ ] **Step 4: actuation_test.ts 加 rupture**

在 `interface SpecComponent` 之後加：

```ts
interface SpecRupture { impulseThreshold: number; emptiedMass: number; puddleRadius: number; droplets: number }
interface SpecBody { id: string; mass: number; rupture?: SpecRupture }
```

把 `interface Spec` 改成：

```ts
interface Spec {
  componentTree?: SpecComponent[];
  physics?: { bodies?: SpecBody[]; constraints?: SpecConstraint[] };
}
```

在 `const lightDecls = ...` 之後加：

```ts
  const ruptureDecls = (spec.physics?.bodies ?? []).filter((b) => b.rupture);
```

把「spec 無 actuation 宣告」的條件改為：

```ts
  if (!driveDecls.length && !steerDecls.length && !servoDecls.length && !lightDecls.length
      && !ruptureDecls.length) {
```

在 light coverage 迴圈之後加 coverage 與觸發檢查：

```ts
  for (const b of ruptureDecls) {
    push(`coverage:rupture:${b.id}`, byId.has(`rupture:${b.id}`),
      byId.has(`rupture:${b.id}`) ? "有 rupture actuator" : "spec 宣告 rupture 但無 actuator");
  }
  // ---- rupture：就地觸發（放最後之前——會改質量、生液滴）----
  const runRupture = (): void => {
    for (const b of ruptureDecls) {
      const act = byId.get(`rupture:${b.id}`);
      const body = model.bodies[b.id];
      const rup = b.rupture!;
      if (!act || !body) continue;
      act.set(1);
      step(5);
      const mass = body.getMassProperties().mass ?? NaN;
      const dropletsA = Object.keys(model.bodies).filter((k) => k.startsWith("droplet-")).length;
      act.set(1);
      step(5);
      const dropletsB = Object.keys(model.bodies).filter((k) => k.startsWith("droplet-")).length;
      push(`rupture:${b.id}`,
        Math.abs(mass - rup.emptiedMass) < 1e-6 && dropletsA === rup.droplets && dropletsB === rup.droplets,
        `質量 ${mass} vs ${rup.emptiedMass}；液滴 ${dropletsA}/${dropletsB}（期望 ${rup.droplets}，冪等）`);
    }
  };
```

在 `const pass = checks.length > 0 ...` 之前加：

```ts
  if (ruptureDecls.length) { step(T(SETTLE_STEPS)); runRupture(); }
```

- [ ] **Step 5: 新檔 `viewer/scripts/rupture_test.ts`**

```ts
// 破裂 gate（M10 rupture）：spec 有 rupture 的 body 必須 (A) 自 1.5m 落下破裂——質量降到
// emptiedMass、meshes.puddle 出現且半徑收斂到 puddleRadius、液滴數正確且 300 步後靜止、
// 全部有限；(B) 自 0.2m 落下不破；(C) 手動 rupture:<id> 觸發兩次只破一次。
// 用法: npx tsx scripts/rupture_test.ts <model-name> --spec <spec.json> [--out result.json]
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

const HIGH_DROP = 1.5; // m：必破
const LOW_DROP = 0.2; // m：不破
const FALL_STEPS = 120; // 2 秒：落地
const PUDDLE_STEPS = 120; // 水漬長到全徑（90 幀）再多給
const SETTLE_STEPS = 300;
const SETTLE_SPEED = 0.02;
const RADIUS_TOL = 0.02; // m

interface SpecRupture { impulseThreshold: number; emptiedMass: number; puddleRadius: number; droplets: number }
interface SpecBody { id: string; mass: number; rupture?: SpecRupture }
interface Spec { physics?: { bodies?: SpecBody[] } }
interface Check { id: string; ok: boolean; detail: string }

async function spawn(name: string, dropHeight: number): Promise<{ ctx: HeadlessContext; model: BuiltModel }> {
  const ctx = await createHeadlessScene();
  const { scene, step } = ctx;
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
  const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const gShape = new PhysicsShapeBox(
    new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), scene,
  );
  gShape.material = { friction: 0.7, restitution: 0.2 };
  gBody.shape = gShape;
  const factory = (await registry[name]()).default;
  const model = factory(scene, { physics: true });
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = false; });
  model.root.position.y += dropHeight;
  step(2);
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = true; });
  return { ctx, model };
}

function droplets(model: BuiltModel): PhysicsBody[] {
  return Object.entries(model.bodies).filter(([k]) => k.startsWith("droplet-")).map(([, b]) => b);
}

function puddleRadius(model: BuiltModel): number | null {
  const p = model.meshes["puddle"];
  if (!p) return null;
  p.computeWorldMatrix(true);
  p.refreshBoundingInfo({});
  const bb = p.getBoundingInfo().boundingBox;
  return (bb.maximumWorld.x - bb.minimumWorld.x) / 2;
}

function allFinite(model: BuiltModel): boolean {
  return Object.values(model.bodies).every((b) => {
    const p = b.transformNode.absolutePosition;
    return [p.x, p.y, p.z].every(Number.isFinite);
  });
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath) {
    console.error(`用法: rupture_test.ts <model-name> --spec <spec.json> [--out result.json]；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const decls = (spec.physics?.bodies ?? []).filter((b) => b.rupture);
  if (!decls.length) {
    console.log(JSON.stringify({ model: name, checks: [], pass: true, note: "spec 無 rupture 宣告" }));
    return 0;
  }
  const checks: Check[] = [];
  const push = (id: string, ok: boolean, detail: string): void => { checks.push({ id, ok, detail }); };

  for (const decl of decls) {
    const rup = decl.rupture!;
    // (A) 高落必破
    {
      const { ctx, model } = await spawn(name, HIGH_DROP);
      ctx.step(FALL_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      push(`A:${decl.id}:mass`, Math.abs(mass - rup.emptiedMass) < 1e-6, `落 ${HIGH_DROP}m 後質量 ${mass}（期望 ${rup.emptiedMass}）`);
      ctx.step(PUDDLE_STEPS);
      const r = puddleRadius(model);
      push(`A:${decl.id}:puddle`, r !== null && Math.abs(r - rup.puddleRadius) <= RADIUS_TOL, `水漬半徑 ${r}（期望 ${rup.puddleRadius}）`);
      const ds = droplets(model);
      push(`A:${decl.id}:droplets`, ds.length === rup.droplets, `液滴 ${ds.length}（期望 ${rup.droplets}）`);
      ctx.step(SETTLE_STEPS);
      const maxSpeed = Math.max(0, ...ds.map((d) => d.getLinearVelocity().length()));
      push(`A:${decl.id}:settle`, maxSpeed < SETTLE_SPEED && allFinite(model), `液滴最大速度 ${maxSpeed.toFixed(4)}，有限 ${allFinite(model)}`);
      ctx.dispose();
    }
    // (B) 低落不破
    {
      const { ctx, model } = await spawn(name, LOW_DROP);
      ctx.step(FALL_STEPS + SETTLE_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      push(`B:${decl.id}:intact`, Math.abs(mass - decl.mass) < 1e-6 && !model.meshes["puddle"] && droplets(model).length === 0,
        `落 ${LOW_DROP}m 後質量 ${mass}（期望 ${decl.mass}）、puddle=${!!model.meshes["puddle"]}`);
      ctx.dispose();
    }
    // (C) 手動觸發冪等
    {
      const { ctx, model } = await spawn(name, 0);
      ctx.step(60);
      const act = model.actuators?.find((a) => a.id === `rupture:${decl.id}`);
      if (!act) {
        push(`C:${decl.id}:actuator`, false, "無 rupture actuator");
      } else {
        act.set(1); ctx.step(5); act.set(1); ctx.step(5);
        const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
        push(`C:${decl.id}:idempotent`, Math.abs(mass - rup.emptiedMass) < 1e-6 && droplets(model).length === rup.droplets,
          `質量 ${mass}、液滴 ${droplets(model).length}（期望 ${rup.droplets}）`);
      }
      model.dispose();
      push(`C:${decl.id}:dispose`, !ctx.scene.meshes.some((m) => m.name === "puddle" || m.name.startsWith("droplet-")),
        "dispose 後場景無 puddle／droplet mesh");
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

- [ ] **Step 6: tsc 與既有 gate 不退化**

Run: `cd viewer && npx tsc --noEmit && npx tsx scripts/actuation_test.ts toy-racer --spec models/toy-racer/spec.json | tail -3 && npx tsx scripts/actuation_test.ts pill-bottle --spec models/pill-bottle/spec.json`
Expected: tsc 無錯；toy-racer `"pass": true`；pill-bottle 印 `spec 無 actuation 宣告`。

- [ ] **Step 7: Commit**

```bash
git add viewer/src/types.ts viewer/src/harness.ts viewer/src/hinge.ts viewer/scripts/actuation_test.ts viewer/scripts/rupture_test.ts
git commit -m "M10 0022 rupture 契約：Actuator kind rupture、harness 按鈕、hinge 助手、actuation_test 覆蓋、rupture_test gate（模型未到，紅）"
```

---

### Task 3: `chemo-spill-kit` 化療潑灑處理包（六步五 pass）

**Files:**
- Create: `viewer/models/chemo-spill-kit/spec.json`
- Create: `viewer/models/chemo-spill-kit/createChemoSpillKitModel.ts`
- Modify: `viewer/src/registry.ts`
- Runtime: `.img2babylon/chemo-spill-kit/hero.png`、`.img2babylon/shots/chemo-spill-kit-*.png`

**Interfaces:**
- Consumes: `createHinge`、`makeHingeServo`（Task 2）。
- Produces: registry `"chemo-spill-kit"`；bodies `case`、`lid`；actuator `servo:lid.x`（[0, 1.75]）。

- [ ] **Step 1: 初始化與參考圖**

```bash
cd /Users/wake/Desktop/local_three/img-to-babylon
python3 forge/next_pass.py init --model chemo-spill-kit --force
mkdir -p .img2babylon/chemo-spill-kit .img2babylon/shots
python3 forge/tomato.py gen --seed 1022 --out .img2babylon/chemo-spill-kit/hero.png --prompt "a purple hard-shell plastic chemotherapy spill kit case with a yellow warning stripe, lid hinged open about 100 degrees showing white absorbent pads, a blue glove box, a purple waste bag roll and safety goggles inside, a gray carry handle on the lid, a printed label reading CYTOTOXIC SPILL KIT, three-quarter view from the front, centered, plain light gray background, soft studio lighting, product photo"
```

用 agent vision 讀 `.img2babylon/chemo-spill-kit/hero.png`，依 `grimoire/intake.md` 六問校對尺寸與配色；把輸出 JSON 的 `job_id` 與 prompt 填進 spec `sourceImages`。若 tomato 不可達（非 200／503 耗盡）→ 停下告知使用者改提供圖片。

- [ ] **Step 2: 寫 spec**

`viewer/models/chemo-spill-kit/spec.json`（`tomatoJobId` 填 Step 1 的 job_id）：

```json
{
  "targetName": "chemo-spill-kit",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/chemo-spill-kit/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "purple hard-shell carry case 0.40 wide x 0.16 tall x 0.30 deep with a 0.05 tall lid hinged along the back (+z) top edge; yellow warning band around the case, two gray latches on the front (-z) face, gray handle on the lid top, printed CYTOTOXIC SPILL KIT label on the lid. Rest state = lid closed (hinge angle 0). Positive rotation about [1,0,0] lifts the front edge (Babylon left-handed, hinge on +z), up to 1.75 rad.",
    "complexity": "complex"
  },
  "componentTree": [
    { "id": "case", "name": "hard-shell case body (open-top tray)", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.40, "h": 0.16, "d": 0.30, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.08, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "purple-shell",
      "collider": { "type": "box", "size": [0.40, 0.16, 0.30], "offset": [0, 0, 0], "confidence": 0.85 } },
    { "id": "case-band", "name": "yellow warning band", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.404, "h": 0.03, "d": 0.304, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.02, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "case", "attachment": { "type": "fixed", "socket": "case:side" }, "material": "warning-yellow" },
    { "id": "latch-l", "name": "left front latch", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.04, "h": 0.05, "d": 0.012, "units": "m", "confidence": 0.5 },
      "transform": { "position": [-0.12, 0.06, -0.153], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "case", "attachment": { "type": "fixed", "socket": "case:front" }, "material": "latch-gray" },
    { "id": "latch-r", "name": "right front latch", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.04, "h": 0.05, "d": 0.012, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0.12, 0.06, -0.153], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "case", "attachment": { "type": "fixed", "socket": "case:front" }, "material": "latch-gray" },
    { "id": "pad-stack", "name": "absorbent pad stack", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.20, "h": 0.06, "d": 0.14, "units": "m", "confidence": 0.5 },
      "transform": { "position": [-0.08, -0.04, 0.0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "case", "attachment": { "type": "fixed", "socket": "case:floor" }, "material": "pad-white" },
    { "id": "glove-box", "name": "glove box", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.12, "h": 0.08, "d": 0.09, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0.10, -0.03, -0.06], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "case", "attachment": { "type": "fixed", "socket": "case:floor" }, "material": "glove-blue" },
    { "id": "bag-roll", "name": "waste bag roll", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.05, "h": 0.20, "d": 0.05, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0.10, -0.045, 0.09], "rotation": [0, 0, 1.5708], "scale": [1, 1, 1] },
      "parent": "case", "attachment": { "type": "fixed", "socket": "case:floor" }, "material": "bag-purple" },
    { "id": "goggles", "name": "safety goggles on the pads", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.14, "h": 0.04, "d": 0.05, "units": "m", "confidence": 0.4 },
      "transform": { "position": [-0.08, 0.01, 0.0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "case", "attachment": { "type": "fixed", "socket": "pad-stack:top" }, "material": "goggle-clear" },
    { "id": "lid", "name": "hinged lid", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.40, "h": 0.05, "d": 0.30, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.185, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "case",
      "attachment": { "type": "hinge", "socket": "case:back-top-edge",
        "hinge": { "pivot": [0, -0.025, 0.15], "axis": [1, 0, 0], "limits": [0, 1.75] } },
      "material": "purple-shell",
      "collider": { "type": "box", "size": [0.40, 0.05, 0.30], "offset": [0, 0, 0], "confidence": 0.85 } },
    { "id": "lid-label", "name": "printed label plate on lid top", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.30, "h": 0.002, "d": 0.20, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.026, -0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "lid", "attachment": { "type": "fixed", "socket": "lid:top" }, "material": "label-print" },
    { "id": "handle", "name": "carry handle on lid", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.14, "h": 0.045, "d": 0.03, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0.0475, 0.11], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "lid", "attachment": { "type": "fixed", "socket": "lid:top-back" }, "material": "latch-gray" }
  ],
  "materials": [
    { "id": "purple-shell", "kind": "procedural", "baseColor": [0.38, 0.16, 0.52], "roughness": 0.5 },
    { "id": "warning-yellow", "kind": "procedural", "baseColor": [0.95, 0.78, 0.12], "roughness": 0.55 },
    { "id": "latch-gray", "kind": "procedural", "baseColor": [0.55, 0.57, 0.60], "roughness": 0.4 },
    { "id": "pad-white", "kind": "procedural", "baseColor": [0.92, 0.92, 0.90], "roughness": 0.9 },
    { "id": "glove-blue", "kind": "procedural", "baseColor": [0.35, 0.55, 0.80], "roughness": 0.7 },
    { "id": "bag-purple", "kind": "procedural", "baseColor": [0.50, 0.25, 0.62], "roughness": 0.6 },
    { "id": "goggle-clear", "kind": "procedural", "baseColor": [0.70, 0.85, 0.90], "roughness": 0.2, "alpha": 0.6 },
    { "id": "label-print", "kind": "procedural", "baseColor": [0.96, 0.96, 0.94], "roughness": 0.7 }
  ],
  "physics": {
    "bodies": [
      { "id": "case", "components": ["case", "case-band", "latch-l", "latch-r", "pad-stack", "glove-box", "bag-roll", "goggles"],
        "mass": 1.8, "friction": 0.6, "restitution": 0.15, "centerOfMass": [0, -0.03, 0] },
      { "id": "lid", "components": ["lid", "lid-label", "handle"],
        "mass": 0.5, "friction": 0.6, "restitution": 0.15, "centerOfMass": [0, 0, 0] }
    ],
    "constraints": [
      { "type": "hinge", "bodyA": "case", "bodyB": "lid",
        "pivotA": [0, 0.08, 0.15], "pivotB": [0, -0.025, 0.15],
        "axis": [1, 0, 0], "limits": [0, 1.75],
        "actuation": { "type": "servo", "maxForce": 5 } }
    ]
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

Run: `python3 forge/validate_spec.py viewer/models/chemo-spill-kit/spec.json --strict`
Expected: `OK`。未過就修 spec，不准先寫程式。

- [ ] **Step 3: 寫 factory**

`viewer/models/chemo-spill-kit/createChemoSpillKitModel.ts`：

```ts
// chemo-spill-kit — 化療潑灑處理包：開頂硬殼提箱＋鉸鏈蓋（servo）。尺寸烘進幾何（公尺）。
// 對應 spec: viewer/models/chemo-spill-kit/spec.json
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
const CASE_W = 0.40, CASE_H = 0.16, CASE_D = 0.30;
const LID_H = 0.05;
const WALL = 0.008;
const CASE_Y = CASE_H / 2; // 0.08
const LID_Y = CASE_H + LID_H / 2; // 0.185
const HINGE_Y = CASE_H; // 0.16
const HINGE_Z = CASE_D / 2; // +z 後緣（左手系：正角掀起 -z 前緣）
const LIMITS: [number, number] = [0, 1.75];
const SERVO_FORCE = 5;

interface BodyDef {
  id: string; rootComponent: string; mass: number; friction: number; restitution: number;
  centerOfMass: [number, number, number];
  colliders: { component: string; size: [number, number, number]; offset: [number, number, number] }[];
}
const BODY_DEFS: BodyDef[] = [
  { id: "case", rootComponent: "case", mass: 1.8, friction: 0.6, restitution: 0.15, centerOfMass: [0, -0.03, 0],
    colliders: [{ component: "case", size: [CASE_W, CASE_H, CASE_D], offset: [0, 0, 0] }] },
  { id: "lid", rootComponent: "lid", mass: 0.5, friction: 0.6, restitution: 0.15, centerOfMass: [0, 0, 0],
    colliders: [{ component: "lid", size: [CASE_W, LID_H, CASE_D], offset: [0, 0, 0] }] },
];
const HINGE = {
  pivotA: [0, HINGE_Y - CASE_Y, HINGE_Z] as [number, number, number],
  pivotB: [0, HINGE_Y - LID_Y, HINGE_Z] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number],
  limits: LIMITS,
};

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb);
  m.specularColor = new Color3(0.15, 0.15, 0.15);
  m.specularPower = specPower;
  if (alpha < 1) { m.alpha = alpha; m.backFaceCulling = false; }
  return m;
}

/** 蓋面標籤：白底、紫色警示符號（三葉環）、黑字 CYTOTOXIC SPILL KIT／化療潑灑處理包。 */
function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 768, h = 512;
  const tex = new DynamicTexture("kit-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#f5f4ef"; c.fillRect(0, 0, w, h);
  c.strokeStyle = "#5a2a80"; c.lineWidth = 14; c.strokeRect(20, 20, w - 40, h - 40);
  // 警示符號：中心圓＋三個花瓣弧
  const cx = 150, cy = h / 2;
  c.strokeStyle = "#5a2a80"; c.lineWidth = 16;
  c.beginPath(); c.arc(cx, cy, 34, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    c.beginPath(); c.arc(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46, 44, a - 1.2, a + 1.2); c.stroke();
  }
  c.fillStyle = "#1c1c1c";
  c.font = "bold 88px Helvetica, Arial, sans-serif"; c.fillText("CYTOTOXIC", 270, 200);
  c.font = "bold 72px Helvetica, Arial, sans-serif"; c.fillText("SPILL KIT", 270, 290);
  c.font = "56px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("化療潑灑處理包", 270, 390);
  tex.update(false);
  return tex;
}

export default function createChemoSpillKitModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("chemo-spill-kit", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  // ---- 材質（對應 spec.materials）----
  const purple = mat(scene, "purple-shell", [0.38, 0.16, 0.52], 32);
  const yellow = mat(scene, "warning-yellow", [0.95, 0.78, 0.12], 28);
  const gray = mat(scene, "latch-gray", [0.55, 0.57, 0.60], 48);
  const padWhite = mat(scene, "pad-white", [0.92, 0.92, 0.90], 8);
  const gloveBlue = mat(scene, "glove-blue", [0.35, 0.55, 0.80], 16);
  const bagPurple = mat(scene, "bag-purple", [0.50, 0.25, 0.62], 24);
  const goggle = mat(scene, "goggle-clear", [0.70, 0.85, 0.90], 96, 0.6);
  const label = mat(scene, "label-print", [0.96, 0.96, 0.94], 20);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) label.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [purple, yellow, gray, padWhite, gloveBlue, bagPurple, goggle, label];
  if (labelTex) disposables.push(labelTex);
  const matOf: Record<string, StandardMaterial> = {
    case: purple, "case-band": yellow, "latch-l": gray, "latch-r": gray, "pad-stack": padWhite,
    "glove-box": gloveBlue, "bag-roll": bagPurple, goggles: goggle, lid: purple, "lid-label": label, handle: gray,
  };

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode): Mesh => {
    mesh.parent = parent; mesh.material = matOf[id]; meshes[id] = mesh; return mesh;
  };
  const box = (name: string, w: number, h: number, d: number): Mesh =>
    MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);

  // ---- case（開頂托盤：底＋四壁合併）----
  const casePivot = pivot("case", root, new Vector3(0, CASE_Y, 0));
  const floor = box("case-floor", CASE_W, WALL, CASE_D); floor.position.y = -CASE_H / 2 + WALL / 2;
  const wallF = box("case-wall-f", CASE_W, CASE_H, WALL); wallF.position.z = -CASE_D / 2 + WALL / 2;
  const wallB = box("case-wall-b", CASE_W, CASE_H, WALL); wallB.position.z = CASE_D / 2 - WALL / 2;
  const wallL = box("case-wall-l", WALL, CASE_H, CASE_D); wallL.position.x = -CASE_W / 2 + WALL / 2;
  const wallR = box("case-wall-r", WALL, CASE_H, CASE_D); wallR.position.x = CASE_W / 2 - WALL / 2;
  const caseMesh = Mesh.MergeMeshes([floor, wallF, wallB, wallL, wallR], true, true) ?? floor;
  caseMesh.name = "case";
  attach("case", caseMesh, casePivot);

  attach("case-band", box("case-band", CASE_W + 0.004, 0.03, CASE_D + 0.004),
    pivot("case-band", casePivot, new Vector3(0, 0.02, 0)));
  attach("latch-l", box("latch-l", 0.04, 0.05, 0.012), pivot("latch-l", casePivot, new Vector3(-0.12, 0.06, -0.153)));
  attach("latch-r", box("latch-r", 0.04, 0.05, 0.012), pivot("latch-r", casePivot, new Vector3(0.12, 0.06, -0.153)));
  // 內容物（固定視覺件；蓋開才看得到）
  attach("pad-stack", box("pad-stack", 0.20, 0.06, 0.14), pivot("pad-stack", casePivot, new Vector3(-0.08, -0.04, 0)));
  attach("glove-box", box("glove-box", 0.12, 0.08, 0.09), pivot("glove-box", casePivot, new Vector3(0.10, -0.03, -0.06)));
  const rollPivot = pivot("bag-roll", casePivot, new Vector3(0.10, -0.045, 0.09));
  rollPivot.rotation.z = Math.PI / 2; // 橫躺沿 x
  attach("bag-roll", MeshBuilder.CreateCylinder("bag-roll", { height: 0.20, diameter: 0.05, tessellation: 24 }, scene), rollPivot);
  attach("goggles", box("goggles", 0.14, 0.04, 0.05), pivot("goggles", casePivot, new Vector3(-0.08, 0.01, 0)));

  // ---- lid ----
  const lidPivot = pivot("lid", root, new Vector3(0, LID_Y, 0));
  attach("lid", box("lid", CASE_W, LID_H, CASE_D), lidPivot);
  const labelMesh = box("lid-label", 0.30, 0.002, 0.20);
  attach("lid-label", labelMesh, pivot("lid-label", lidPivot, new Vector3(0, LID_H / 2 + 0.001, -0.02)));
  // 提把：橫樑＋兩立柱合併
  const beam = box("handle-beam", 0.14, 0.015, 0.03); beam.position.y = 0.015;
  const postL = box("handle-post-l", 0.015, 0.045, 0.03); postL.position.x = -0.0625;
  const postR = box("handle-post-r", 0.015, 0.045, 0.03); postR.position.x = 0.0625;
  const handle = Mesh.MergeMeshes([beam, postL, postR], true, true) ?? beam;
  handle.name = "handle";
  attach("handle", handle, pivot("handle", lidPivot, new Vector3(0, LID_H / 2 + 0.0225, 0.11)));

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const def of BODY_DEFS) {
      const rootPivot = nodes[def.rootComponent];
      rootPivot.computeWorldMatrix(true);
      const body = new PhysicsBody(rootPivot, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      for (const col of def.colliders) {
        const node = nodes[col.component];
        node.computeWorldMatrix(true);
        const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), Vector3.FromArray(col.size), scene);
        shape.material = { friction: def.friction, restitution: def.restitution };
        const rel = node.absolutePosition.subtract(rootPivot.absolutePosition).add(Vector3.FromArray(col.offset));
        container.addChild(shape, rel, Quaternion.Identity());
      }
      body.shape = container;
      body.setMassProperties({ mass: def.mass, centerOfMass: Vector3.FromArray(def.centerOfMass) });
      bodies[def.id] = body;
    }
    const hinge = createHinge(scene, bodies["case"], bodies["lid"], HINGE);
    constraints.push(hinge);
    actuators.push(makeHingeServo(hinge, "lid", LIMITS[0], LIMITS[1], SERVO_FORCE, "蓋子"));
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

`viewer/src/registry.ts` 加：

```ts
  // M10 化療潑灑處理套件
  "chemo-spill-kit": () => import("../models/chemo-spill-kit/createChemoSpillKitModel"),
```

- [ ] **Step 4: headless gate**

```bash
cd viewer && npx tsc --noEmit
npx tsx scripts/runtime_export.ts chemo-spill-kit --spec models/chemo-spill-kit/spec.json --out ../.img2babylon/chemo-spill-kit/runtime.json && cd .. && python3 forge/check_colliders.py .img2babylon/chemo-spill-kit/runtime.json
cd viewer && npx tsx scripts/physics_test.ts chemo-spill-kit --spec models/chemo-spill-kit/spec.json | grep '"pass"' | head -1
npx tsx scripts/physics_test.ts chemo-spill-kit --spec models/chemo-spill-kit/spec.json --nudge lid | grep '"pass"' | head -1
npx tsx scripts/actuation_test.ts chemo-spill-kit --spec models/chemo-spill-kit/spec.json | tail -4
```

Expected: tsc 無錯、check_colliders `OK`、physics_test 兩次 `"pass": true`、actuation_test `"pass": true`（servo:lid.x 吊空到 0.6×1.75 ± 0.35）。
若 servo 讀值反號（蓋子往下壓）→ 鉸鏈方向錯：確認 HINGE_Z 為 +z，`--nudge lid` 後 lid 不應掉到 y < 0.16。

- [ ] **Step 5: 視覺 gate（五 pass 檢查點）**

確認 dev server（`lsof -iTCP:5173 -sTCP:LISTEN`；沒有就 `cd viewer && npm run dev &`）。playwright MCP：

1. `browser_navigate` → `http://localhost:5173/#model=chemo-spill-kit`
2. `browser_evaluate`：

```js
async () => {
  const c = window.__IMG2BABYLON_CAPTURE__;
  const cam = { alpha: -0.9, beta: 1.05, radius: 1.1, target: [0, 0.12, 0] };
  c.setCamera(cam); await new Promise(r => setTimeout(r, 400)); c.setCamera(cam);
  await new Promise(r => setTimeout(r, 120));
  return await c.screenshot();
}
```

3. 把回傳 base64 寫檔：`python3 -c "import base64,sys;open('.img2babylon/shots/chemo-spill-kit-hero.png','wb').write(base64.b64decode(sys.argv[1].split(',')[1]))" '<dataURL>'`
4. snapshot 找「碰撞線框」按 `browser_click`，再 `browser_take_screenshot` 存 `.img2babylon/shots/chemo-spill-kit-collider.png`。
5. 蓋子打開態：在可動物件面板把 `蓋子` 滑桿拉到 1.6 再截一張 `chemo-spill-kit-open.png`（hero 圖是開蓋，對照用這張）。
6. `python3 forge/compare.py .img2babylon/chemo-spill-kit/hero.png .img2babylon/shots/chemo-spill-kit-open.png --out .img2babylon/chemo-spill-kit/sheet.png`
7. `python3 forge/divine_eye.py --reference .img2babylon/chemo-spill-kit/hero.png --render .img2babylon/shots/chemo-spill-kit-open.png --json`
8. agent vision 讀 sheet.png 評 likeness／colliderFit，寫進 spec `reviewHistory`（含 `eye`），`python3 forge/next_pass.py done`。

五個 pass 各做一次上述檢查點，reviewHistory 各記一條（blockout 看輪廓比例、structure 看開頂托盤與內容物、material 看紫／黃／標籤、physics 看三層 gate、polish 看細節與 dispose）。需要修正時先 `python3 forge/next_pass.py correction`（exit 3 → 停下問使用者）。

- [ ] **Step 6: Commit**

```bash
git add viewer/models/chemo-spill-kit viewer/src/registry.ts
git commit -m "M10 0022 chemo-spill-kit：化療潑灑處理包（開頂硬殼＋servo 鉸鏈蓋），五 pass、三層 gate 全綠"
```

---

### Task 4: `chemo-iv-bag` 化療點滴袋（可破裂）

**Files:**
- Create: `viewer/models/chemo-iv-bag/spec.json`
- Create: `viewer/models/chemo-iv-bag/createChemoIvBagModel.ts`
- Modify: `viewer/src/registry.ts`

**Interfaces:**
- Produces: registry `"chemo-iv-bag"`；body `bag`；actuator `rupture:bag`；破裂後 `meshes.puddle`、`bodies["droplet-0..11"]`。
- 座標：袋子**平躺**（x 0.12 寬、y 0.035 厚、z 0.19 長），輸液口在 +z 端、吊孔在 −z 端。

- [ ] **Step 1: 初始化與參考圖**

```bash
python3 forge/next_pass.py init --model chemo-iv-bag --force
mkdir -p .img2babylon/chemo-iv-bag
python3 forge/tomato.py gen --seed 1023 --out .img2babylon/chemo-iv-bag/hero.png --prompt "a 500 ml clear PVC intravenous infusion bag lying flat on a table seen from directly above, filled with pale yellow chemotherapy drug solution, two purple-capped ports at the bottom end, a hanging eyelet at the top end, a white printed label reading CYTOTOXIC, centered, plain light gray background, soft studio lighting, product photo"
```

agent vision 讀圖校對；填 job_id／prompt。

- [ ] **Step 2: 寫 spec**

```json
{
  "targetName": "chemo-iv-bag",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/chemo-iv-bag/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "500 ml soft IV bag lying flat: 0.12 wide (x) x 0.035 thick (y) x 0.19 long (z), frosted translucent film showing pale yellow liquid, two purple-capped ports protruding at +z, a hanging eyelet at -z, white CYTOTOXIC label on the top face. Single rigid body; rupture = mass transfer (bag empties to 0.04 kg, puddle spreads, droplets scatter).",
    "complexity": "complex"
  },
  "componentTree": [
    { "id": "bag", "name": "bag film body", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.12, "h": 0.035, "d": 0.19, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.0175, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "bag-film",
      "collider": { "type": "box", "size": [0.12, 0.035, 0.19], "offset": [0, 0, 0], "confidence": 0.85 } },
    { "id": "liquid", "name": "pale yellow drug solution", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.11, "h": 0.028, "d": 0.16, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, -0.002, 0.005], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:inside" }, "material": "liquid-yellow" },
    { "id": "label", "name": "white CYTOTOXIC label", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.09, "h": 0.001, "d": 0.10, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.018, -0.01], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:top" }, "material": "label-white" },
    { "id": "port-a", "name": "left infusion port with purple cap", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.012, "h": 0.03, "d": 0.012, "units": "m", "confidence": 0.5 },
      "transform": { "position": [-0.02, 0, 0.11], "rotation": [1.5708, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:+z" }, "material": "port-purple" },
    { "id": "port-b", "name": "right infusion port with purple cap", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.012, "h": 0.03, "d": 0.012, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0.02, 0, 0.11], "rotation": [1.5708, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:+z" }, "material": "port-purple" },
    { "id": "hang-eye", "name": "hanging eyelet", "level": "micro", "primitive": "torus",
      "dimensions": { "w": 0.02, "h": 0.004, "d": 0.02, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, 0, -0.105], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bag", "attachment": { "type": "fixed", "socket": "bag:-z" }, "material": "bag-film" }
  ],
  "materials": [
    { "id": "bag-film", "kind": "procedural", "baseColor": [0.85, 0.88, 0.90], "roughness": 0.35, "alpha": 0.45 },
    { "id": "liquid-yellow", "kind": "procedural", "baseColor": [0.93, 0.85, 0.45], "roughness": 0.2, "alpha": 0.85 },
    { "id": "label-white", "kind": "procedural", "baseColor": [0.97, 0.97, 0.95], "roughness": 0.7 },
    { "id": "port-purple", "kind": "procedural", "baseColor": [0.45, 0.20, 0.60], "roughness": 0.45 }
  ],
  "physics": {
    "bodies": [
      { "id": "bag", "components": ["bag", "liquid", "label", "port-a", "port-b", "hang-eye"],
        "mass": 0.55, "friction": 0.5, "restitution": 0.1, "centerOfMass": [0, -0.005, 0],
        "rupture": { "impulseThreshold": 2.0, "emptiedMass": 0.04, "puddleRadius": 0.30, "droplets": 12 } }
    ],
    "constraints": []
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

Run: `python3 forge/validate_spec.py viewer/models/chemo-iv-bag/spec.json --strict` → `OK`。

- [ ] **Step 3: 寫 factory**

`viewer/models/chemo-iv-bag/createChemoIvBagModel.ts`：

```ts
// chemo-iv-bag — 化療點滴袋（平躺、單剛體、可破裂＝質量轉移）。尺寸烘進幾何（公尺）。
// 對應 spec: viewer/models/chemo-iv-bag/spec.json；契約見 grimoire/physics.md「破裂＝質量轉移」
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Observer,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsShapeSphere,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";

// ---- spec 尺寸 ----
const BAG_W = 0.12, BAG_H = 0.035, BAG_D = 0.19;
const BAG_Y = BAG_H / 2;
const FLAT_H = 0.010; // 破裂後塌扁厚度
const MASS = 0.55, FRICTION = 0.5, RESTITUTION = 0.1;
const RUPTURE = { impulseThreshold: 2.0, emptiedMass: 0.04, puddleRadius: 0.30, droplets: 12 };
const PUDDLE_GROW_FRAMES = 90; // 1.5 s @ 60 fps（幀數，headless／viewer 一致）
const DROPLET_D = 0.012, DROPLET_MASS = 0.005;
const SEED = 20260904;

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

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 512;
  const tex = new DynamicTexture("bag-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#f8f8f4"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#5a2a80"; c.fillRect(0, 0, w, 90);
  c.fillStyle = "#ffffff"; c.font = "bold 64px Helvetica, Arial, sans-serif"; c.fillText("CYTOTOXIC", 40, 68);
  c.fillStyle = "#1c1c1c";
  c.font = "44px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("化療藥物  請勿觸碰", 40, 170);
  c.font = "36px Helvetica, Arial, sans-serif";
  c.fillText("500 mL   Lot 26-0904", 40, 240);
  c.fillStyle = "#5a2a80";
  for (let i = 0; i < 5; i++) c.fillRect(40 + i * 60, 300, 40, 160);
  tex.update(false);
  return tex;
}

export default function createChemoIvBagModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("chemo-iv-bag", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  // ---- 材質 ----
  const film = new StandardMaterial("bag-film", scene);
  film.diffuseColor = new Color3(0.85, 0.88, 0.90); film.specularColor = new Color3(0.5, 0.5, 0.5);
  film.specularPower = 64; film.alpha = 0.45; film.backFaceCulling = false;
  const liquid = new StandardMaterial("liquid-yellow", scene);
  liquid.diffuseColor = new Color3(0.93, 0.85, 0.45); liquid.specularColor = new Color3(0.3, 0.3, 0.2);
  liquid.specularPower = 96; liquid.alpha = 0.85;
  const labelMat = new StandardMaterial("label-white", scene);
  labelMat.diffuseColor = new Color3(0.97, 0.97, 0.95); labelMat.specularColor = new Color3(0.1, 0.1, 0.1);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) labelMat.diffuseTexture = labelTex;
  const port = new StandardMaterial("port-purple", scene);
  port.diffuseColor = new Color3(0.45, 0.20, 0.60); port.specularColor = new Color3(0.2, 0.2, 0.2); port.specularPower = 40;
  const puddleMat = new StandardMaterial("puddle", scene);
  puddleMat.diffuseColor = new Color3(0.90, 0.82, 0.40); puddleMat.specularColor = new Color3(0.4, 0.4, 0.3);
  puddleMat.specularPower = 128; puddleMat.alpha = 0.55;
  const disposables: { dispose(): void }[] = [film, liquid, labelMat, port, puddleMat];
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- 幾何 ----
  const bagPivot = pivot("bag", root, new Vector3(0, BAG_Y, 0));
  const bagMesh = attach("bag", MeshBuilder.CreateBox("bag", { width: BAG_W, height: BAG_H, depth: BAG_D }, scene), bagPivot, film);
  const liquidMesh = attach("liquid", MeshBuilder.CreateBox("liquid", { width: 0.11, height: 0.028, depth: 0.16 }, scene),
    pivot("liquid", bagPivot, new Vector3(0, -0.002, 0.005)), liquid);
  attach("label", MeshBuilder.CreateBox("label", { width: 0.09, height: 0.001, depth: 0.10 }, scene),
    pivot("label", bagPivot, new Vector3(0, 0.018, -0.01)), labelMat);
  for (const [id, x] of [["port-a", -0.02], ["port-b", 0.02]] as const) {
    const p = pivot(id, bagPivot, new Vector3(x, 0, 0.11));
    p.rotation.x = Math.PI / 2; // 沿 z 伸出
    attach(id, MeshBuilder.CreateCylinder(id, { height: 0.03, diameter: 0.012, tessellation: 16 }, scene), p, port);
  }
  const eye = pivot("hang-eye", bagPivot, new Vector3(0, 0, -0.105));
  eye.rotation.x = Math.PI / 2; // 環面平躺
  attach("hang-eye", MeshBuilder.CreateTorus("hang-eye", { diameter: 0.016, thickness: 0.004, tessellation: 20 }, scene), eye, film);
  // 塌扁袋（破裂後才顯示；不是 spec 元件，不進 meshes）
  const flatMesh = MeshBuilder.CreateBox("bag-flat", { width: BAG_W, height: FLAT_H, depth: BAG_D }, scene);
  flatMesh.parent = bagPivot; flatMesh.material = film; flatMesh.isVisible = false;

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const actuators: Actuator[] = [];
  const spawned: Mesh[] = [];
  const observers: (() => void)[] = [];
  let ruptured = false;

  if (opts.physics !== false && scene.getPhysicsEngine()) {
    bagPivot.computeWorldMatrix(true);
    const body = new PhysicsBody(bagPivot, PhysicsMotionType.DYNAMIC, false, scene);
    const container = new PhysicsShapeContainer(scene);
    const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(BAG_W, BAG_H, BAG_D), scene);
    shape.material = { friction: FRICTION, restitution: RESTITUTION };
    container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
    body.shape = container;
    body.setMassProperties({ mass: MASS, centerOfMass: new Vector3(0, -0.005, 0) });
    bodies["bag"] = body;

    const groundY = 0;
    const rupture = (): void => {
      if (ruptured) return;
      ruptured = true;
      // 1. 質量轉移＋塌扁 collider
      body.setMassProperties({ mass: RUPTURE.emptiedMass, centerOfMass: Vector3.Zero() });
      const flat = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(BAG_W, FLAT_H, BAG_D), scene);
      flat.material = { friction: FRICTION, restitution: RESTITUTION };
      const old = body.shape; body.shape = flat; old?.dispose();
      bagMesh.isVisible = false; liquidMesh.isVisible = false; flatMesh.isVisible = true;
      // 2. 水漬（世界座標、純視覺；幀數驅動長大）
      const p = bagPivot.absolutePosition;
      const puddle = MeshBuilder.CreateDisc("puddle", { radius: RUPTURE.puddleRadius, tessellation: 48 }, scene);
      puddle.rotation.x = Math.PI / 2; puddle.position.set(p.x, groundY + 0.002, p.z);
      puddle.material = puddleMat; puddle.isPickable = false; puddle.scaling.setAll(0.01);
      meshes["puddle"] = puddle; spawned.push(puddle);
      let frame = 0;
      const grow = scene.onBeforeRenderObservable.add(() => {
        frame += 1;
        const s = Math.min(1, frame / PUDDLE_GROW_FRAMES);
        puddle.scaling.setAll(Math.max(s, 0.01));
        if (s >= 1) scene.onBeforeRenderObservable.remove(grow);
      });
      observers.push(() => scene.onBeforeRenderObservable.remove(grow));
      // 3. 液滴
      for (let i = 0; i < RUPTURE.droplets; i++) {
        const a = (i / RUPTURE.droplets) * Math.PI * 2 + rng() * 0.4;
        const r = 0.09 + rng() * 0.03;
        const d = MeshBuilder.CreateSphere(`droplet-${i}`, { diameter: DROPLET_D, segments: 8 }, scene);
        d.position.set(p.x + Math.cos(a) * r, groundY + 0.02, p.z + Math.sin(a) * r);
        d.material = liquid; spawned.push(d);
        const db = new PhysicsBody(d, PhysicsMotionType.DYNAMIC, false, scene);
        const ds = new PhysicsShapeSphere(Vector3.Zero(), DROPLET_D / 2, scene);
        ds.material = { friction: 0.05, restitution: 0.1 };
        db.shape = ds;
        db.setMassProperties({ mass: DROPLET_MASS });
        const speed = 0.6 + rng() * 0.6;
        db.setLinearVelocity(new Vector3(Math.cos(a) * speed, 0.5, Math.sin(a) * speed));
        bodies[`droplet-${i}`] = db;
      }
    };

    // 偵測：單步動量變化 m·|Δv|（見 grimoire/physics.md）
    let v0 = Vector3.Zero();
    const before = scene.onBeforePhysicsObservable.add(() => { v0 = body.getLinearVelocity().clone(); });
    const after = scene.onAfterPhysicsObservable.add(() => {
      if (ruptured) return;
      const dv = body.getLinearVelocity().subtract(v0).length();
      if (MASS * dv >= RUPTURE.impulseThreshold) rupture();
    });
    observers.push(() => { scene.onBeforePhysicsObservable.remove(before); scene.onAfterPhysicsObservable.remove(after); });

    actuators.push({
      id: "rupture:bag", kind: "rupture", label: "破裂", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) rupture(); },
    });
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints: [], actuators,
    dispose(): void {
      observers.forEach((off) => off());
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

registry 加：`"chemo-iv-bag": () => import("../models/chemo-iv-bag/createChemoIvBagModel"),`

- [ ] **Step 4: headless gate（含 rupture gate）**

```bash
cd viewer && npx tsc --noEmit
npx tsx scripts/runtime_export.ts chemo-iv-bag --spec models/chemo-iv-bag/spec.json --out ../.img2babylon/chemo-iv-bag/runtime.json && (cd .. && python3 forge/check_colliders.py .img2babylon/chemo-iv-bag/runtime.json)
npx tsx scripts/physics_test.ts chemo-iv-bag --spec models/chemo-iv-bag/spec.json | grep '"pass"' | head -1
npx tsx scripts/actuation_test.ts chemo-iv-bag --spec models/chemo-iv-bag/spec.json | tail -4
npx tsx scripts/rupture_test.ts chemo-iv-bag --spec models/chemo-iv-bag/spec.json
```

Expected: 全部 pass。校準規則：
- 若 (A) 未破（1.5 m 落下 m·Δv < 2.0）→ 印出實測 Δv，門檻只能降到「B 情境實測值 × 1.3」以上；改 spec 與 factory 的 `RUPTURE.impulseThreshold` 同步（兩處必須一致）。
- 若 (B) 誤破 → 門檻升，但 (A) 仍須破；兩者衝突 → 停下回報使用者（設計文件 §7 紅線）。
- 若 physics_test 誤破（0.3 m）→ 同 (B)。
- 液滴不靜止 → 液滴摩擦 0.05 → 0.15。

- [ ] **Step 5: 視覺 gate（五 pass 檢查點）**

同 Task 3 Step 5，模型名換 `chemo-iv-bag`；hero 是俯視，相機用 `{ alpha: -1.57, beta: 0.35, radius: 0.55, target: [0, 0.02, 0] }`。另截一張破裂後（面板按「破裂」等 2 秒）`chemo-iv-bag-ruptured.png` 目視水漬與液滴。每 pass 記 reviewHistory 並 `next_pass.py done`。

- [ ] **Step 6: Commit**

```bash
git add viewer/models/chemo-iv-bag viewer/src/registry.ts
git commit -m "M10 0022 chemo-iv-bag：化療點滴袋，rupture 質量轉移＋水漬＋液滴；rupture_test 綠、五 pass、三層 gate 全綠"
```

---

### Task 5: `cytotoxic-waste-bin` 細胞毒性廢棄物桶

**Files:**
- Create: `viewer/models/cytotoxic-waste-bin/spec.json`
- Create: `viewer/models/cytotoxic-waste-bin/createCytotoxicWasteBinModel.ts`
- Modify: `viewer/src/registry.ts`

**Interfaces:**
- Produces: registry `"cytotoxic-waste-bin"`；bodies `bin`、`lid`、`pedal`；actuators `servo:lid.x`（[0, 1.5]）、`servo:pedal.x`（[−0.3, 0]）。

- [ ] **Step 1: 初始化與參考圖**

```bash
python3 forge/next_pass.py init --model cytotoxic-waste-bin --force
mkdir -p .img2babylon/cytotoxic-waste-bin
python3 forge/tomato.py gen --seed 1024 --out .img2babylon/cytotoxic-waste-bin/hero.png --prompt "a purple 30 liter hospital pedal bin with a yellow domed lid, a foot pedal at the front bottom, a white printed label reading CYTOTOXIC WASTE on the front, slightly tapered cylindrical body, three-quarter view, centered, plain light gray background, soft studio lighting, product photo"
```

- [ ] **Step 2: 寫 spec**

```json
{
  "targetName": "cytotoxic-waste-bin",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": ".img2babylon/cytotoxic-waste-bin/hero.png", "origin": "tomato",
      "tomatoJobId": "<job_id>", "prompt": "<Step 1 的 prompt>" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": {
    "outline": "purple tapered cylindrical pedal bin 0.30 dia x 0.45 tall with a yellow domed lid 0.31 dia x 0.06 hinged on the back (+z) rim, a foot pedal 0.10 x 0.02 x 0.12 hinged at the front (-z) bottom, white CYTOTOXIC WASTE label on the front. Rest = lid closed, pedal level. Lid opens with positive rotation about [1,0,0] up to 1.5; pedal presses with negative rotation down to -0.3.",
    "complexity": "complex"
  },
  "componentTree": [
    { "id": "bin", "name": "tapered bin body (open top)", "level": "macro", "primitive": "lathe",
      "dimensions": { "w": 0.30, "h": 0.45, "d": 0.30, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.225, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null, "attachment": { "type": "none" }, "material": "bin-purple",
      "collider": { "type": "cylinder", "size": [0.30, 0.45, 0.30], "offset": [0, 0, 0], "confidence": 0.85 } },
    { "id": "bag-liner", "name": "purple bag liner inside", "level": "micro", "primitive": "cylinder",
      "dimensions": { "w": 0.27, "h": 0.40, "d": 0.27, "units": "m", "confidence": 0.5 },
      "transform": { "position": [0, -0.02, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bin", "attachment": { "type": "fixed", "socket": "bin:inside" }, "material": "liner-purple" },
    { "id": "bin-label", "name": "front CYTOTOXIC WASTE label", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.16, "h": 0.11, "d": 0.002, "units": "m", "confidence": 0.6 },
      "transform": { "position": [0, 0.04, -0.146], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bin", "attachment": { "type": "fixed", "socket": "bin:front" }, "material": "label-print" },
    { "id": "lid", "name": "yellow domed lid", "level": "macro", "primitive": "lathe",
      "dimensions": { "w": 0.31, "h": 0.06, "d": 0.31, "units": "m", "confidence": 0.8 },
      "transform": { "position": [0, 0.48, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bin",
      "attachment": { "type": "hinge", "socket": "bin:back-rim",
        "hinge": { "pivot": [0, -0.03, 0.155], "axis": [1, 0, 0], "limits": [0, 1.5] } },
      "material": "lid-yellow",
      "collider": { "type": "cylinder", "size": [0.31, 0.06, 0.31], "offset": [0, 0, 0], "confidence": 0.8 } },
    { "id": "lid-knob", "name": "lid hinge knuckle", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.06, "h": 0.02, "d": 0.03, "units": "m", "confidence": 0.4 },
      "transform": { "position": [0, -0.02, 0.155], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "lid", "attachment": { "type": "fixed", "socket": "lid:back" }, "material": "latch-gray" },
    { "id": "pedal", "name": "foot pedal", "level": "macro", "primitive": "box",
      "dimensions": { "w": 0.10, "h": 0.02, "d": 0.12, "units": "m", "confidence": 0.7 },
      "transform": { "position": [0, 0.05, -0.19], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "bin",
      "attachment": { "type": "hinge", "socket": "bin:front-bottom",
        "hinge": { "pivot": [0, 0, 0.06], "axis": [1, 0, 0], "limits": [-0.3, 0] } },
      "material": "latch-gray",
      "collider": { "type": "box", "size": [0.10, 0.02, 0.12], "offset": [0, 0, 0], "confidence": 0.8 } },
    { "id": "pedal-arm", "name": "pedal arm into bin base", "level": "micro", "primitive": "box",
      "dimensions": { "w": 0.03, "h": 0.02, "d": 0.04, "units": "m", "confidence": 0.4 },
      "transform": { "position": [0, 0, 0.07], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": "pedal", "attachment": { "type": "fixed", "socket": "pedal:back" }, "material": "latch-gray" }
  ],
  "materials": [
    { "id": "bin-purple", "kind": "procedural", "baseColor": [0.40, 0.18, 0.55], "roughness": 0.5 },
    { "id": "lid-yellow", "kind": "procedural", "baseColor": [0.95, 0.80, 0.15], "roughness": 0.45 },
    { "id": "liner-purple", "kind": "procedural", "baseColor": [0.50, 0.28, 0.62], "roughness": 0.7, "alpha": 0.9 },
    { "id": "label-print", "kind": "procedural", "baseColor": [0.96, 0.96, 0.94], "roughness": 0.7 },
    { "id": "latch-gray", "kind": "procedural", "baseColor": [0.45, 0.47, 0.50], "roughness": 0.4 }
  ],
  "physics": {
    "bodies": [
      { "id": "bin", "components": ["bin", "bag-liner", "bin-label"],
        "mass": 3.0, "friction": 0.6, "restitution": 0.15, "centerOfMass": [0, -0.15, 0] },
      { "id": "lid", "components": ["lid", "lid-knob"],
        "mass": 0.35, "friction": 0.6, "restitution": 0.15, "centerOfMass": [0, 0, 0] },
      { "id": "pedal", "components": ["pedal", "pedal-arm"],
        "mass": 0.15, "friction": 0.6, "restitution": 0.15, "centerOfMass": [0, 0, 0] }
    ],
    "constraints": [
      { "type": "hinge", "bodyA": "bin", "bodyB": "lid",
        "pivotA": [0, 0.225, 0.155], "pivotB": [0, -0.03, 0.155],
        "axis": [1, 0, 0], "limits": [0, 1.5],
        "actuation": { "type": "servo", "maxForce": 3 } },
      { "type": "hinge", "bodyA": "bin", "bodyB": "pedal",
        "pivotA": [0, -0.175, -0.13], "pivotB": [0, 0, 0.06],
        "axis": [1, 0, 0], "limits": [-0.3, 0],
        "actuation": { "type": "servo", "maxForce": 3 } }
    ]
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

（pedal pivotA：bin pivot 在 y 0.225，踏板樞軸世界 y 0.05、z −0.13 → bin 局部 [0, −0.175, −0.13]；pedal 局部樞軸在其 +z 端 [0, 0, 0.06]。）

Run: `python3 forge/validate_spec.py viewer/models/cytotoxic-waste-bin/spec.json --strict` → `OK`。

- [ ] **Step 3: 寫 factory**

`viewer/models/cytotoxic-waste-bin/createCytotoxicWasteBinModel.ts`：

```ts
// cytotoxic-waste-bin — 細胞毒性廢棄物腳踏桶：錐形開頂桶身（lathe 殼）＋圓頂蓋 hinge servo＋踏板 hinge servo。
// 踏板與蓋不做物理連桿（設計文件 §3.3）；playground 同時命令兩支 servo。
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
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";
import { createHinge, makeHingeServo } from "../../src/hinge";

const BIN_R_TOP = 0.15, BIN_R_BOT = 0.13, BIN_H = 0.45, WALL = 0.006;
const LID_R = 0.155, LID_H = 0.06;
const PEDAL_W = 0.10, PEDAL_H = 0.02, PEDAL_D = 0.12;
const BIN_Y = BIN_H / 2; // 0.225
const LID_Y = BIN_H + LID_H / 2; // 0.48
const LID_HINGE_Y = BIN_H, LID_HINGE_Z = LID_R; // +z 後緣
const PEDAL_Y = 0.05, PEDAL_Z = -(BIN_R_BOT + PEDAL_D / 2); // -0.19
const PEDAL_HINGE_Z = -BIN_R_BOT; // -0.13
const LID_LIMITS: [number, number] = [0, 1.5];
const PEDAL_LIMITS: [number, number] = [-0.3, 0];
const SERVO_FORCE = 3;
const TESS = 48;

interface BodyDef {
  id: string; rootComponent: string; mass: number; friction: number; restitution: number;
  centerOfMass: [number, number, number];
  colliders: { component: string; kind: "box" | "cylinder"; size: [number, number, number]; offset: [number, number, number] }[];
}
const BODY_DEFS: BodyDef[] = [
  { id: "bin", rootComponent: "bin", mass: 3.0, friction: 0.6, restitution: 0.15, centerOfMass: [0, -0.15, 0],
    colliders: [{ component: "bin", kind: "cylinder", size: [0.30, BIN_H, 0.30], offset: [0, 0, 0] }] },
  { id: "lid", rootComponent: "lid", mass: 0.35, friction: 0.6, restitution: 0.15, centerOfMass: [0, 0, 0],
    colliders: [{ component: "lid", kind: "cylinder", size: [0.31, LID_H, 0.31], offset: [0, 0, 0] }] },
  { id: "pedal", rootComponent: "pedal", mass: 0.15, friction: 0.6, restitution: 0.15, centerOfMass: [0, 0, 0],
    colliders: [{ component: "pedal", kind: "box", size: [PEDAL_W, PEDAL_H, PEDAL_D], offset: [0, 0, 0] }] },
];
const LID_HINGE = {
  pivotA: [0, LID_HINGE_Y - BIN_Y, LID_HINGE_Z] as [number, number, number],
  pivotB: [0, LID_HINGE_Y - LID_Y, LID_HINGE_Z] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: LID_LIMITS,
};
const PEDAL_HINGE = {
  pivotA: [0, PEDAL_Y - BIN_Y, PEDAL_HINGE_Z] as [number, number, number],
  pivotB: [0, 0, PEDAL_D / 2] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: PEDAL_LIMITS,
};

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.15, 0.15, 0.15); m.specularPower = specPower;
  if (alpha < 1) { m.alpha = alpha; m.backFaceCulling = false; }
  return m;
}

/** 桶身殼：外壁上錐→下錐→底→內壁回到口緣（lathe profile，x 半徑、y 相對 bin pivot）。 */
function binProfile(): Vector3[] {
  const b = -BIN_H / 2, t = BIN_H / 2;
  return [
    new Vector3(0, b, 0),
    new Vector3(BIN_R_BOT, b, 0),
    new Vector3(BIN_R_TOP, t - 0.01, 0),
    new Vector3(BIN_R_TOP + 0.004, t, 0), // 口緣外翻
    new Vector3(BIN_R_TOP - WALL, t, 0),
    new Vector3(BIN_R_BOT - WALL, b + WALL, 0),
    new Vector3(0, b + WALL, 0),
  ];
}

/** 圓頂蓋：邊緣裙＋淺弧頂（y 相對 lid pivot）。 */
function lidProfile(): Vector3[] {
  const b = -LID_H / 2;
  const pts: Vector3[] = [new Vector3(LID_R, b, 0), new Vector3(LID_R, b + 0.02, 0)];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new Vector3(LID_R * Math.cos(a), b + 0.02 + (LID_H - 0.02) * Math.sin(a), 0));
  }
  return pts;
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 352;
  const tex = new DynamicTexture("bin-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#f5f4ef"; c.fillRect(0, 0, w, h);
  c.strokeStyle = "#5a2a80"; c.lineWidth = 10; c.strokeRect(12, 12, w - 24, h - 24);
  c.fillStyle = "#1c1c1c";
  c.font = "bold 72px Helvetica, Arial, sans-serif"; c.fillText("CYTOTOXIC", 36, 110);
  c.font = "bold 64px Helvetica, Arial, sans-serif"; c.fillText("WASTE", 36, 190);
  c.font = "48px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("細胞毒性廢棄物", 36, 280);
  tex.update(false);
  return tex;
}

export default function createCytotoxicWasteBinModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("cytotoxic-waste-bin", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  const purple = mat(scene, "bin-purple", [0.40, 0.18, 0.55], 32);
  const yellow = mat(scene, "lid-yellow", [0.95, 0.80, 0.15], 40);
  const liner = mat(scene, "liner-purple", [0.50, 0.28, 0.62], 12, 0.9);
  const label = mat(scene, "label-print", [0.96, 0.96, 0.94], 20);
  const gray = mat(scene, "latch-gray", [0.45, 0.47, 0.50], 48);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) label.diffuseTexture = labelTex;
  purple.backFaceCulling = false; // lathe 殼內壁可見
  const disposables: { dispose(): void }[] = [purple, yellow, liner, label, gray];
  if (labelTex) disposables.push(labelTex);
  const matOf: Record<string, StandardMaterial> = {
    bin: purple, "bag-liner": liner, "bin-label": label, lid: yellow, "lid-knob": gray, pedal: gray, "pedal-arm": gray,
  };

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode): Mesh => {
    mesh.parent = parent; mesh.material = matOf[id]; meshes[id] = mesh; return mesh;
  };

  // ---- bin ----
  const binPivot = pivot("bin", root, new Vector3(0, BIN_Y, 0));
  attach("bin", MeshBuilder.CreateLathe("bin", { shape: binProfile(), tessellation: TESS, closed: true }, scene), binPivot);
  attach("bag-liner", MeshBuilder.CreateCylinder("bag-liner", { height: 0.40, diameterTop: 0.27, diameterBottom: 0.24, tessellation: TESS }, scene),
    pivot("bag-liner", binPivot, new Vector3(0, -0.02, 0)));
  attach("bin-label", MeshBuilder.CreateBox("bin-label", { width: 0.16, height: 0.11, depth: 0.002 }, scene),
    pivot("bin-label", binPivot, new Vector3(0, 0.04, -0.146)));

  // ---- lid ----
  const lidPivot = pivot("lid", root, new Vector3(0, LID_Y, 0));
  attach("lid", MeshBuilder.CreateLathe("lid", { shape: lidProfile(), tessellation: TESS, closed: true, cap: Mesh.CAP_ALL }, scene), lidPivot);
  attach("lid-knob", MeshBuilder.CreateBox("lid-knob", { width: 0.06, height: 0.02, depth: 0.03 }, scene),
    pivot("lid-knob", lidPivot, new Vector3(0, -0.02, LID_HINGE_Z)));

  // ---- pedal ----
  const pedalPivot = pivot("pedal", root, new Vector3(0, PEDAL_Y, PEDAL_Z));
  attach("pedal", MeshBuilder.CreateBox("pedal", { width: PEDAL_W, height: PEDAL_H, depth: PEDAL_D }, scene), pedalPivot);
  attach("pedal-arm", MeshBuilder.CreateBox("pedal-arm", { width: 0.03, height: 0.02, depth: 0.04 }, scene),
    pivot("pedal-arm", pedalPivot, new Vector3(0, 0, 0.07)));

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const def of BODY_DEFS) {
      const rootPivot = nodes[def.rootComponent];
      rootPivot.computeWorldMatrix(true);
      const body = new PhysicsBody(rootPivot, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      for (const col of def.colliders) {
        const node = nodes[col.component];
        node.computeWorldMatrix(true);
        const shape = col.kind === "box"
          ? new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), Vector3.FromArray(col.size), scene)
          : new PhysicsShapeCylinder(new Vector3(0, -col.size[1] / 2, 0), new Vector3(0, col.size[1] / 2, 0), col.size[0] / 2, scene);
        shape.material = { friction: def.friction, restitution: def.restitution };
        const rel = node.absolutePosition.subtract(rootPivot.absolutePosition).add(Vector3.FromArray(col.offset));
        container.addChild(shape, rel, Quaternion.Identity());
      }
      body.shape = container;
      body.setMassProperties({ mass: def.mass, centerOfMass: Vector3.FromArray(def.centerOfMass) });
      bodies[def.id] = body;
    }
    const lidHinge = createHinge(scene, bodies["bin"], bodies["lid"], LID_HINGE);
    const pedalHinge = createHinge(scene, bodies["bin"], bodies["pedal"], PEDAL_HINGE);
    constraints.push(lidHinge, pedalHinge);
    actuators.push(makeHingeServo(lidHinge, "lid", LID_LIMITS[0], LID_LIMITS[1], SERVO_FORCE, "蓋子"));
    actuators.push(makeHingeServo(pedalHinge, "pedal", PEDAL_LIMITS[0], PEDAL_LIMITS[1], SERVO_FORCE, "踏板"));
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

registry 加：`"cytotoxic-waste-bin": () => import("../models/cytotoxic-waste-bin/createCytotoxicWasteBinModel"),`

- [ ] **Step 4: headless gate**

```bash
cd viewer && npx tsc --noEmit
npx tsx scripts/runtime_export.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json --out ../.img2babylon/cytotoxic-waste-bin/runtime.json && (cd .. && python3 forge/check_colliders.py .img2babylon/cytotoxic-waste-bin/runtime.json)
npx tsx scripts/physics_test.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json | grep '"pass"' | head -1
npx tsx scripts/physics_test.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json --nudge lid | grep '"pass"' | head -1
npx tsx scripts/physics_test.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json --nudge pedal | grep '"pass"' | head -1
npx tsx scripts/actuation_test.ts cytotoxic-waste-bin --spec models/cytotoxic-waste-bin/spec.json | tail -6
```

Expected 全 pass。已知風險：actuation_test 吊空時錨 body 是 `bin`（從未當 bodyB），pedal servo 目標 0.6×(−0.3)=−0.18 需在 ±0.35 內。踏板若被地面擋住，吊空狀態不影響（root 抬高 0.3 m）。

- [ ] **Step 5: 視覺 gate（五 pass 檢查點）**

同 Task 3 Step 5，模型名 `cytotoxic-waste-bin`，相機 `{ alpha: -0.8, beta: 1.15, radius: 1.4, target: [0, 0.25, 0] }`；另截「踏板 −0.3＋蓋 1.5」狀態 `cytotoxic-waste-bin-open.png`。

- [ ] **Step 6: Commit**

```bash
git add viewer/models/cytotoxic-waste-bin viewer/src/registry.ts
git commit -m "M10 0022 cytotoxic-waste-bin：腳踏廢棄物桶（lathe 殼＋圓頂蓋 servo＋踏板 servo），五 pass、三層 gate 全綠"
```

---

### Task 6: Playground 專案（`local_three/playground`）

**Files:**
- Create: `../playground/package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`.gitignore`
- Create: `../playground/src/main.ts`、`src/scene.ts`、`src/ui.ts`、`src/grab.ts`、`src/hud.ts`
- Create: `../playground/scripts/scene_test.ts`

**Interfaces:**
- Consumes: `registry`（`img2babylon-viewer/registry`）、`BuiltModel`／`Actuator`（`img2babylon-viewer/types`）、`createHeadlessScene`（`img2babylon-viewer`，僅 scene_test）。
- Produces: `spawnAll(scene): Promise<Placed[]>`、`Placed = { entry: SceneEntry; model: BuiltModel; respawn(): Promise<void> }`；`window.__PLAYGROUND__ = { scene, placed, capture }`。

- [ ] **Step 1: 專案骨架**

```bash
mkdir -p /Users/wake/Desktop/local_three/playground/{src,scripts,launchd}
cd /Users/wake/Desktop/local_three/playground && git init -q
```

`package.json`：

```json
{
  "name": "chemo-spill-playground",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1 --port 4173 --strictPort",
    "typecheck": "tsc --noEmit",
    "scene-test": "node --import tsx scripts/scene_test.ts",
    "serve": "bash scripts/serve.sh"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

`vite.config.ts`：

```ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const viewerRoot = fileURLToPath(new URL("../img-to-babylon/viewer", import.meta.url));
const here = fileURLToPath(new URL(".", import.meta.url));
const v = (p: string): string => fileURLToPath(new URL(`../img-to-babylon/viewer/${p}`, import.meta.url));

export default defineConfig({
  base: "/",
  resolve: {
    alias: [
      { find: "img2babylon-viewer/registry", replacement: v("src/registry.ts") },
      { find: "img2babylon-viewer/types", replacement: v("src/types.ts") },
      { find: "img2babylon-viewer/capture", replacement: v("src/capture.ts") },
      { find: /^img2babylon-viewer$/, replacement: v("src/registry.ts") },
      { find: "@babylonjs/core", replacement: v("node_modules/@babylonjs/core") },
      { find: "@babylonjs/havok", replacement: v("node_modules/@babylonjs/havok") },
    ],
  },
  server: { port: 5175, fs: { allow: [here, viewerRoot] } },
  preview: { port: 4173 },
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
});
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true,
    "types": ["node", "vite/client"], "lib": ["ES2022", "DOM"],
    "baseUrl": ".",
    "paths": {
      "img2babylon-viewer": ["../img-to-babylon/viewer/src/index.ts"],
      "img2babylon-viewer/registry": ["../img-to-babylon/viewer/src/registry.ts"],
      "img2babylon-viewer/types": ["../img-to-babylon/viewer/src/types.ts"],
      "img2babylon-viewer/capture": ["../img-to-babylon/viewer/src/capture.ts"],
      "@babylonjs/core": ["../img-to-babylon/viewer/node_modules/@babylonjs/core"],
      "@babylonjs/core/*": ["../img-to-babylon/viewer/node_modules/@babylonjs/core/*"],
      "@babylonjs/havok": ["../img-to-babylon/viewer/node_modules/@babylonjs/havok"]
    }
  },
  "include": ["src", "scripts"]
}
```

`.gitignore`：

```
node_modules/
dist/
*.log
.DS_Store
```

`index.html`：

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>化療潑灑處理 Playground</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #1c1e24; font: 13px/1.5 system-ui, -apple-system, "PingFang TC", sans-serif; color: #eceff4; }
    #app { width: 100%; height: 100%; display: block; touch-action: none; }
    .hud { position: fixed; top: 10px; left: 10px; background: #2e3440cc; border-radius: 8px; padding: 8px 12px; z-index: 10; font-variant-numeric: tabular-nums; }
    .panel { position: fixed; top: 10px; right: 10px; width: 250px; max-height: calc(100% - 20px); overflow-y: auto; background: #2e3440cc; border-radius: 8px; padding: 10px; z-index: 10; }
    .panel h2 { margin: 0 0 6px; font-size: 15px; }
    .panel ol { margin: 0 0 10px; padding-left: 18px; color: #d8dee9; }
    .card { border-top: 1px solid #4c566a; padding: 8px 0; }
    .card h3 { margin: 0 0 4px; font-size: 13px; }
    .card .mass { color: #88c0d0; margin-bottom: 6px; }
    .card .buttons { display: flex; flex-wrap: wrap; gap: 4px; }
    button { padding: 6px 10px; border: 0; border-radius: 6px; background: #3b4252; color: #eceff4; font: 12px/1 system-ui; cursor: pointer; }
    button:hover { background: #4c566a; }
    button[aria-pressed="true"] { background: #5e81ac; }
    .global { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
    .error-banner { position: fixed; top: 0; left: 0; right: 0; padding: 10px 16px; background: #bf3131; color: #fff; z-index: 20; }
    @media (max-width: 700px) { .panel { width: 190px; font-size: 12px; } }
  </style>
</head>
<body>
  <canvas id="app"></canvas>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

Run: `cd /Users/wake/Desktop/local_three/playground && npm install 2>&1 | tail -2`
Expected: 安裝完成，無 error。

- [ ] **Step 2: `src/scene.ts`（擺放清單＋生成）**

```ts
// 擺放清單與生成／歸位。模型與 Havok 都來自 ../img-to-babylon/viewer（路徑別名）。
import { PhysicsBody, Scene, Vector3 } from "@babylonjs/core";
import { registry } from "img2babylon-viewer/registry";
import type { BuiltModel } from "img2babylon-viewer/types";

export interface SceneEntry {
  model: string;
  label: string;
  position: [number, number, number];
  rotationY: number;
}

export const SCENE: SceneEntry[] = [
  { model: "chemo-spill-kit", label: "化療潑灑處理包", position: [-0.6, 0, 0.2], rotationY: 0.4 },
  { model: "chemo-iv-bag", label: "化療點滴袋", position: [0.05, 0, -0.25], rotationY: -0.3 },
  { model: "cytotoxic-waste-bin", label: "細胞毒性廢棄物桶", position: [0.7, 0, 0.3], rotationY: -0.5 },
];

export interface Placed {
  entry: SceneEntry;
  model: BuiltModel;
  respawn(): Promise<void>;
}

/** 建 body 後再搬 transform：disablePreStep=false → 兩幀後設回 true（grimoire/physics.md 陷阱）。 */
function placeAt(scene: Scene, model: BuiltModel, entry: SceneEntry): void {
  const bodies = Object.values(model.bodies);
  bodies.forEach((b: PhysicsBody) => { b.disablePreStep = false; });
  model.root.position = Vector3.FromArray(entry.position);
  model.root.rotation.y = entry.rotationY;
  let frames = 0;
  const obs = scene.onAfterPhysicsObservable.add(() => {
    frames += 1;
    if (frames >= 2) {
      bodies.forEach((b) => { b.disablePreStep = true; });
      scene.onAfterPhysicsObservable.remove(obs);
    }
  });
}

export async function spawnOne(scene: Scene, entry: SceneEntry): Promise<Placed> {
  const factory = (await registry[entry.model]()).default;
  let model = factory(scene, { physics: true });
  placeAt(scene, model, entry);
  const placed: Placed = {
    entry,
    model,
    async respawn(): Promise<void> {
      model.dispose();
      model = factory(scene, { physics: true });
      placeAt(scene, model, entry);
      placed.model = model;
    },
  };
  return placed;
}

export async function spawnAll(scene: Scene, entries: SceneEntry[] = SCENE): Promise<Placed[]> {
  const out: Placed[] = [];
  for (const e of entries) out.push(await spawnOne(scene, e));
  return out;
}

export function totalMass(model: BuiltModel): number {
  return Object.values(model.bodies).reduce((s, b) => s + (b.getMassProperties().mass ?? 0), 0);
}
```

- [ ] **Step 3: `src/hud.ts`**

```ts
import { Engine } from "@babylonjs/core";
import type { Placed } from "./scene";
import { totalMass } from "./scene";

export function installHud(engine: Engine, placed: () => Placed[]): void {
  const div = document.createElement("div");
  div.className = "hud";
  document.body.appendChild(div);
  setInterval(() => {
    const ps = placed();
    const bodies = ps.reduce((n, p) => n + Object.keys(p.model.bodies).length, 0);
    const mass = ps.reduce((m, p) => m + totalMass(p.model), 0);
    div.textContent = `${engine.getFps().toFixed(0)} fps · 剛體 ${bodies} · 總重 ${mass.toFixed(2)} kg`;
  }, 500);
}
```

- [ ] **Step 4: `src/grab.ts`（抓取拖曳）**

```ts
// 滑鼠／觸控抓取：pick 到模型 mesh → 找它所屬的 PhysicsBody → 拖曳時以速度追游標在抓取高度平面上的投影。
// 重物質量不改，加速慢是 Havok 自然結果；速度上限 3 m/s。
import {
  AbstractMesh, ArcRotateCamera, Node, PhysicsBody, Plane, PointerEventTypes, Scene, Vector3,
} from "@babylonjs/core";
import type { Placed } from "./scene";

const GAIN = 8;
const MAX_SPEED = 3;

function bodyOf(mesh: AbstractMesh, placed: Placed[]): PhysicsBody | null {
  const byNode = new Map<Node, PhysicsBody>();
  for (const p of placed) for (const b of Object.values(p.model.bodies)) byNode.set(b.transformNode, b);
  let n: Node | null = mesh;
  while (n) {
    const b = byNode.get(n);
    if (b) return b;
    n = n.parent;
  }
  return null;
}

export function installGrab(scene: Scene, camera: ArcRotateCamera, canvas: HTMLCanvasElement, placed: () => Placed[]): void {
  let grabbed: PhysicsBody | null = null;
  let plane: Plane | null = null;
  let target: Vector3 | null = null;

  const project = (): Vector3 | null => {
    if (!plane) return null;
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const t = ray.intersectsPlane(plane);
    return t === null ? null : ray.origin.add(ray.direction.scale(t));
  };

  scene.onPointerObservable.add((info) => {
    if (info.type === PointerEventTypes.POINTERDOWN) {
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m.isPickable && m.isVisible);
      const body = pick?.pickedMesh ? bodyOf(pick.pickedMesh, placed()) : null;
      if (!body || !pick?.pickedPoint) return;
      grabbed = body;
      plane = Plane.FromPositionAndNormal(pick.pickedPoint, Vector3.Up());
      target = pick.pickedPoint.clone();
      camera.detachControl();
    } else if (info.type === PointerEventTypes.POINTERMOVE && grabbed) {
      const p = project();
      if (p) target = p;
    } else if (info.type === PointerEventTypes.POINTERUP && grabbed) {
      grabbed = null; plane = null; target = null;
      camera.attachControl(canvas, true);
    }
  });

  scene.onBeforePhysicsObservable.add(() => {
    if (!grabbed || !target) return;
    const pos = grabbed.transformNode.absolutePosition;
    const v = target.subtract(pos).scale(GAIN);
    if (v.length() > MAX_SPEED) v.normalize().scaleInPlace(MAX_SPEED);
    grabbed.setLinearVelocity(v);
    grabbed.setAngularVelocity(grabbed.getAngularVelocity().scale(0.9));
  });
}
```

- [ ] **Step 5: `src/ui.ts`（側欄）**

```ts
import {
  ArcRotateCamera, Color3, MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeSphere, Scene, StandardMaterial, Vector3,
} from "@babylonjs/core";
import type { Actuator } from "img2babylon-viewer/types";
import type { CaptureApi } from "img2babylon-viewer/capture";
import type { Placed } from "./scene";
import { totalMass } from "./scene";

const STEPS = ["隔離現場、示警", "穿戴防護裝備", "打開潑灑處理包", "吸附、清除、消毒", "投入細胞毒性廢棄物桶"];

function act(model: Placed["model"], id: string): Actuator | undefined {
  return model.actuators?.find((a) => a.id === id);
}

/** 推倒：在物件最高點施水平衝量 mass×1.5 N·s，方向朝相機右側。 */
function topple(scene: Scene, camera: ArcRotateCamera, p: Placed): void {
  const bodies = Object.values(p.model.bodies).filter((b) => !b.transformNode.name.startsWith("droplet"));
  if (!bodies.length) return;
  const main = bodies.reduce((a, b) => ((a.getMassProperties().mass ?? 0) >= (b.getMassProperties().mass ?? 0) ? a : b));
  const mass = totalMass(p.model);
  p.model.root.computeWorldMatrix(true);
  const { max } = p.model.root.getHierarchyBoundingVectors(true);
  const pos = main.transformNode.absolutePosition;
  const right = Vector3.Cross(Vector3.Up(), camera.getTarget().subtract(camera.position)).normalize();
  main.applyImpulse(right.scale(mass * 1.5), new Vector3(pos.x, max.y, pos.z));
}

function toss(p: Placed): void {
  for (const b of Object.values(p.model.bodies)) {
    const m = b.getMassProperties().mass ?? 1;
    b.applyImpulse(new Vector3((Math.random() - 0.5) * m, m * 3.2, (Math.random() - 0.5) * m), b.transformNode.absolutePosition);
  }
}

/** 摔落：抬到 1.5 m 放手（disablePreStep 兩幀規則）。 */
function dropFrom(scene: Scene, p: Placed, height: number): void {
  const bodies = Object.values(p.model.bodies);
  bodies.forEach((b) => { b.disablePreStep = false; b.setLinearVelocity(Vector3.Zero()); b.setAngularVelocity(Vector3.Zero()); });
  p.model.root.position.y += height;
  let n = 0;
  const obs = scene.onAfterPhysicsObservable.add(() => {
    if (++n >= 2) { bodies.forEach((b) => { b.disablePreStep = true; }); scene.onAfterPhysicsObservable.remove(obs); }
  });
}

function throwBall(scene: Scene, camera: ArcRotateCamera): void {
  const dir = camera.getTarget().subtract(camera.position).normalize();
  const ball = MeshBuilder.CreateSphere(`ball-${performance.now()}`, { diameter: 0.08 }, scene);
  ball.position = camera.position.add(dir.scale(0.3));
  const mat = new StandardMaterial("ball-mat", scene); mat.diffuseColor = new Color3(0.85, 0.3, 0.25); ball.material = mat;
  const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, scene);
  const shape = new PhysicsShapeSphere(Vector3.Zero(), 0.04, scene);
  shape.material = { friction: 0.4, restitution: 0.5 }; body.shape = shape;
  body.setMassProperties({ mass: 0.4 });
  body.applyImpulse(dir.scale(2.4), ball.position);
}

export function installUi(scene: Scene, camera: ArcRotateCamera, placed: Placed[], capture: CaptureApi): void {
  const panel = document.createElement("div");
  panel.className = "panel";
  const h = document.createElement("h2"); h.textContent = "化療潑灑處理流程"; panel.appendChild(h);
  const ol = document.createElement("ol");
  for (const s of STEPS) { const li = document.createElement("li"); li.textContent = s; ol.appendChild(li); }
  panel.appendChild(ol);

  const cards: { card: HTMLDivElement; refresh(): void }[] = [];
  for (const p of placed) {
    const card = document.createElement("div"); card.className = "card";
    const title = document.createElement("h3"); title.textContent = p.entry.label; card.appendChild(title);
    const mass = document.createElement("div"); mass.className = "mass"; card.appendChild(mass);
    const buttons = document.createElement("div"); buttons.className = "buttons"; card.appendChild(buttons);
    const btn = (label: string, fn: () => void): HTMLButtonElement => {
      const b = document.createElement("button"); b.textContent = label; b.onclick = fn; buttons.appendChild(b); return b;
    };
    const refresh = (): void => {
      mass.textContent = `質量 ${totalMass(p.model).toFixed(2)} kg`;
      buttons.replaceChildren();
      const m = p.model;
      if (p.entry.model === "chemo-spill-kit") {
        btn("打開", () => act(m, "servo:lid.x")?.set(1.6));
        btn("關閉", () => act(m, "servo:lid.x")?.set(0));
      }
      if (p.entry.model === "cytotoxic-waste-bin") {
        btn("踩踏板", () => { act(m, "servo:pedal.x")?.set(-0.3); act(m, "servo:lid.x")?.set(1.5); });
        btn("放開", () => { act(m, "servo:pedal.x")?.set(0); act(m, "servo:lid.x")?.set(0); });
      }
      if (p.entry.model === "chemo-iv-bag") {
        btn("摔落", () => dropFrom(scene, p, 1.5));
        btn("破裂", () => act(m, "rupture:bag")?.set(1));
      }
      if (p.entry.model !== "chemo-iv-bag") btn("推倒", () => topple(scene, camera, p));
      btn("拋起", () => toss(p));
      btn("歸位", () => { void p.respawn().then(refresh); });
    };
    refresh();
    panel.appendChild(card);
    cards.push({ card, refresh });
  }

  const global = document.createElement("div"); global.className = "global";
  const gbtn = (label: string, fn: () => void): HTMLButtonElement => {
    const b = document.createElement("button"); b.textContent = label; b.onclick = fn; global.appendChild(b); return b;
  };
  gbtn("丟球", () => throwBall(scene, camera));
  let wire = false;
  const wireBtn = gbtn("碰撞線框", () => { wire = !wire; capture.togglePhysicsViewer(wire); wireBtn.setAttribute("aria-pressed", String(wire)); });
  gbtn("全部歸位", () => { void Promise.all(placed.map((p) => p.respawn())).then(() => cards.forEach((c) => c.refresh())); });
  panel.appendChild(global);
  document.body.appendChild(panel);
  setInterval(() => cards.forEach((c) => {
    const massEl = c.card.querySelector(".mass");
    const p = placed[cards.indexOf(c)];
    if (massEl) massEl.textContent = `質量 ${totalMass(p.model).toFixed(2)} kg`;
  }), 500);
}
```

- [ ] **Step 6: `src/main.ts`**

```ts
import {
  ArcRotateCamera, Color3, Color4, DynamicTexture, Engine, HavokPlugin, HemisphericLight, MeshBuilder,
  PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsViewer, Quaternion, Scene, StandardMaterial, Tools, Vector3,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import type { CaptureApi } from "img2babylon-viewer/capture";
import { spawnAll, type Placed } from "./scene";
import { installUi } from "./ui";
import { installGrab } from "./grab";
import { installHud } from "./hud";

declare global {
  interface Window {
    __PLAYGROUND__?: { scene: Scene; placed: Placed[]; capture: CaptureApi };
    __PLAYGROUND_READY__?: boolean;
  }
}

function banner(msg: string): void {
  const div = document.createElement("div"); div.className = "error-banner"; div.textContent = msg; document.body.appendChild(div);
}

/** 4×4 m 病房地磚：DynamicTexture 格線，STATIC box，摩擦 0.7。 */
function makeFloor(scene: Scene): void {
  const size = 4;
  const ground = MeshBuilder.CreateGround("floor", { width: size, height: size }, scene);
  const mat = new StandardMaterial("floor-mat", scene);
  const tex = new DynamicTexture("floor-tex", { width: 512, height: 512 }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#cfd4d3"; c.fillRect(0, 0, 512, 512);
  c.strokeStyle = "#9aa3a2"; c.lineWidth = 3;
  for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, 512); c.stroke(); c.beginPath(); c.moveTo(0, i * 64); c.lineTo(512, i * 64); c.stroke(); }
  tex.update(false); tex.uScale = 4; tex.vScale = 4;
  mat.diffuseTexture = tex; mat.specularColor = new Color3(0.05, 0.05, 0.05);
  ground.material = mat; ground.isPickable = false;
  const body = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const shape = new PhysicsShapeBox(new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(size, 0.1, size), scene);
  shape.material = { friction: 0.7, restitution: 0.2 };
  body.shape = shape;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("app") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.86, 0.88, 0.90, 1);
  const camera = new ArcRotateCamera("cam", -1.1, 1.05, 3.0, new Vector3(0, 0.25, 0), scene);
  camera.wheelDeltaPercentage = 0.01; camera.minZ = 0.01; camera.lowerRadiusLimit = 0.5; camera.upperRadiusLimit = 8;
  camera.attachControl(canvas, true);
  new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);

  try {
    const havok = await HavokPhysics();
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(false, havok)); // 固定 1/60 步長（與 gate 一致）
  } catch (err) { banner(`Havok 載入失敗：${String(err)}`); throw err; }

  makeFloor(scene);
  const placed = await spawnAll(scene);

  let viewer: PhysicsViewer | null = null;
  const capture: CaptureApi = {
    setCamera(spec): void {
      camera.alpha = spec.alpha; camera.beta = spec.beta; camera.radius = spec.radius;
      if (spec.target) camera.setTarget(Vector3.FromArray(spec.target));
    },
    async screenshot(): Promise<string> {
      return Tools.CreateScreenshotUsingRenderTargetAsync(engine, camera, { width: 1280, height: 720 });
    },
    togglePhysicsViewer(on): void {
      if (on && !viewer) { viewer = new PhysicsViewer(scene); placed.forEach((p) => Object.values(p.model.bodies).forEach((b) => viewer?.showBody(b))); }
      else if (!on && viewer) { viewer.dispose(); viewer = null; }
    },
  };
  installUi(scene, camera, placed, capture);
  installGrab(scene, camera, canvas, () => placed);
  installHud(engine, () => placed);
  window.__PLAYGROUND__ = { scene, placed, capture };
  window.__PLAYGROUND_READY__ = true;

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

void boot();
```

- [ ] **Step 7: `scripts/scene_test.ts`（headless gate）**

```ts
// playground headless gate：三模型落地靜止、servo 命令到位、點滴袋摔落破裂、歸位重建。
// 用法: node --import tsx scripts/scene_test.ts
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Quaternion, Vector3, Matrix } from "@babylonjs/core";
import { createHeadlessScene } from "img2babylon-viewer";
import { SCENE, spawnAll } from "../src/scene";

interface Check { id: string; ok: boolean; detail: string }

/** hinge 角（相對出廠）：bodyB 相對 bodyA 的旋轉在 x 軸的分量（單軸 hinge，所有 Euler 順序重合）。 */
function hingeAngle(a: PhysicsBody, b: PhysicsBody, bind: Matrix): number {
  a.transformNode.computeWorldMatrix(true); b.transformNode.computeWorldMatrix(true);
  const rel = b.transformNode.getWorldMatrix().getRotationMatrix().multiply(Matrix.Invert(a.transformNode.getWorldMatrix().getRotationMatrix()));
  const m = Matrix.Invert(bind).multiply(rel).m;
  return Math.atan2(m[6], m[5]);
}
function bind(a: PhysicsBody, b: PhysicsBody): Matrix {
  a.transformNode.computeWorldMatrix(true); b.transformNode.computeWorldMatrix(true);
  return b.transformNode.getWorldMatrix().getRotationMatrix().multiply(Matrix.Invert(a.transformNode.getWorldMatrix().getRotationMatrix()));
}

async function main(): Promise<number> {
  const ctx = await createHeadlessScene();
  const { scene, step } = ctx;
  const ground = MeshBuilder.CreateGround("floor", { width: 4, height: 4 }, scene);
  const gb = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const gs = new PhysicsShapeBox(new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(4, 0.1, 4), scene);
  gs.material = { friction: 0.7, restitution: 0.2 }; gb.shape = gs;

  const checks: Check[] = [];
  const push = (id: string, ok: boolean, detail: string): void => { checks.push({ id, ok, detail }); };
  const placed = await spawnAll(scene, SCENE);
  const kit = placed.find((p) => p.entry.model === "chemo-spill-kit")!;
  const bag = placed.find((p) => p.entry.model === "chemo-iv-bag")!;
  const bin = placed.find((p) => p.entry.model === "cytotoxic-waste-bin")!;
  const kitBind = bind(kit.model.bodies.case, kit.model.bodies.lid);
  const lidBind = bind(bin.model.bodies.bin, bin.model.bodies.lid);
  const pedalBind = bind(bin.model.bodies.bin, bin.model.bodies.pedal);

  step(300);
  for (const p of placed) {
    const bad = Object.entries(p.model.bodies).filter(([, b]) => {
      const pos = b.transformNode.absolutePosition;
      return b.getLinearVelocity().length() >= 0.02 || pos.y < -0.01 || ![pos.x, pos.y, pos.z].every(Number.isFinite);
    }).map(([k]) => k);
    push(`settle:${p.entry.model}`, bad.length === 0, bad.length ? `未靜止／穿地：${bad.join(",")}` : "落地靜止");
  }

  kit.model.actuators?.find((a) => a.id === "servo:lid.x")?.set(1.6);
  step(180);
  const kitAngle = hingeAngle(kit.model.bodies.case, kit.model.bodies.lid, kitBind);
  push("kit:open", kitAngle >= 1.2, `蓋角 ${kitAngle.toFixed(3)}（≥ 1.2）`);

  bin.model.actuators?.find((a) => a.id === "servo:pedal.x")?.set(-0.3);
  bin.model.actuators?.find((a) => a.id === "servo:lid.x")?.set(1.5);
  step(180);
  const binLid = hingeAngle(bin.model.bodies.bin, bin.model.bodies.lid, lidBind);
  const binPedal = hingeAngle(bin.model.bodies.bin, bin.model.bodies.pedal, pedalBind);
  push("bin:lid", binLid >= 1.1, `蓋角 ${binLid.toFixed(3)}（≥ 1.1）`);
  push("bin:pedal", binPedal <= -0.15, `踏板角 ${binPedal.toFixed(3)}（≤ −0.15）`);

  const bodies = Object.values(bag.model.bodies);
  bodies.forEach((b) => { b.disablePreStep = false; });
  bag.model.root.position.y += 1.5;
  step(2);
  bodies.forEach((b) => { b.disablePreStep = true; });
  step(240);
  const bagMass = bag.model.bodies.bag.getMassProperties().mass ?? NaN;
  const drops = Object.keys(bag.model.bodies).filter((k) => k.startsWith("droplet-")).length;
  push("bag:rupture", Math.abs(bagMass - 0.04) < 1e-6 && drops === 12 && !!bag.model.meshes.puddle, `質量 ${bagMass}、液滴 ${drops}、puddle ${!!bag.model.meshes.puddle}`);

  const before = scene.meshes.length;
  await bag.respawn();
  step(120);
  const after = Object.keys(bag.model.bodies).length;
  push("bag:respawn", after === 1 && (bag.model.bodies.bag.getMassProperties().mass ?? 0) === 0.55 && scene.meshes.length <= before,
    `重建後 body ${after}、質量 ${bag.model.bodies.bag.getMassProperties().mass}、mesh ${scene.meshes.length}（之前 ${before}）`);

  const pass = checks.every((c) => c.ok);
  console.log(JSON.stringify({ checks, pass }, null, 2));
  ctx.dispose();
  return pass ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(2); });
```

- [ ] **Step 8: 跑 typecheck 與 gate**

```bash
cd /Users/wake/Desktop/local_three/playground && npx tsc --noEmit && node --import tsx scripts/scene_test.ts | tail -20
```

Expected: tsc 無錯、`"pass": true`。`createHeadlessScene` 走 `img2babylon-viewer` 根入口（tsx 依 tsconfig paths 解析）。

- [ ] **Step 9: 瀏覽器目視**

```bash
cd /Users/wake/Desktop/local_three/playground && (npm run dev > /dev/null 2>&1 &) && sleep 3 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5175/
```

playwright：`browser_navigate` → `http://localhost:5175/`，等 `window.__PLAYGROUND_READY__`；`browser_take_screenshot` 存 `.img2babylon/shots/playground-overview.png`（img-to-babylon 的 `.img2babylon/shots/`）；按「打開」「踩踏板」「摔落」各等 2 秒再截 `playground-open.png`、`playground-rupture.png`；agent vision 讀回確認三物件、側欄、水漬。

- [ ] **Step 10: Commit（playground repo）**

```bash
cd /Users/wake/Desktop/local_three/playground
git add -A
git commit -m "playground：化療潑灑處理套件展示環境（三模型、側欄互動、抓取拖曳、HUD、headless scene_test）"
```

---

### Task 7: 對外——build、launchd 常駐、tailscale serve 根路徑

**Files:**
- Create: `../playground/scripts/serve.sh`
- Runtime: `~/Library/LaunchAgents/com.wake.playground.plist`（由 serve.sh 產生）

- [ ] **Step 1: `scripts/serve.sh`**

```bash
#!/usr/bin/env bash
# build → launchd 常駐 vite preview（127.0.0.1:4173）→ tailscale serve 反代根路徑 → 驗證。
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
NODE="$(readlink -f "$(command -v node)")"          # fnm multishell 路徑會消失，寫真實路徑
VITE="$ROOT/node_modules/vite/bin/vite.js"
PLIST="$HOME/Library/LaunchAgents/com.wake.playground.plist"
LOG="$HOME/Library/Logs/playground.log"
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale

npm run build

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.wake.playground</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>$VITE</string><string>preview</string>
    <string>--host</string><string>127.0.0.1</string><string>--port</string><string>4173</string><string>--strictPort</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 2
curl -sf -o /dev/null http://127.0.0.1:4173/ && echo "preview 4173 OK"

"$TS" serve --bg http://127.0.0.1:4173
sleep 2
"$TS" serve status
code="$(curl -s -o /dev/null -w '%{http_code}' https://monkeyday.tail8e3f79.ts.net/)"
echo "tailnet https://monkeyday.tail8e3f79.ts.net/ -> $code"
[ "$code" = "200" ]
curl -s https://monkeyday.tail8e3f79.ts.net/ | grep -q "化療潑灑處理 Playground" && echo "index 內容 OK"
```

`chmod +x scripts/serve.sh`。

- [ ] **Step 2: 執行並驗證**

Run: `cd /Users/wake/Desktop/local_three/playground && npm run serve 2>&1 | tail -12`
Expected: `preview 4173 OK`、serve status 顯示 `/ proxy http://127.0.0.1:4173`、`-> 200`、`index 內容 OK`。
再從 tailnet 網址用 playwright 開一次 `https://monkeyday.tail8e3f79.ts.net/`，確認 Havok wasm 載入（無 error banner）、三物件出現，截 `playground-tailnet.png`。

若 `tailscale serve` 拒絕（HTTPS 未啟用）→ 回報使用者到 Tailscale 管理台開 HTTPS；不改用 http。

- [ ] **Step 3: Commit（playground）＋ README**

`README.md`：

```markdown
# 化療潑灑處理 Playground

依賴 `../img-to-babylon`（模型契約與 Havok）。

- 開發：`npm run dev` → http://localhost:5175/
- gate：`npx tsc --noEmit && npm run scene-test`
- 對外：`npm run serve`（build → launchd 常駐 `vite preview` 4173 → `tailscale serve` 根路徑）
  → https://monkeyday.tail8e3f79.ts.net/
- 停用：`launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.wake.playground.plist`；
  `tailscale serve reset`
```

```bash
git add -A && git commit -m "playground：serve.sh（build＋launchd 常駐 preview＋tailscale serve 根路徑）＋README"
```

---

### Task 8: ROADMAP／任務卡／結案

**Files:**
- Modify: `ROADMAP.md`（M9 節之後、Parked 之前）
- Create: `tasks/0022-chemo-spill-set.md`

- [ ] **Step 1: ROADMAP M10 節**

```markdown
## M10：化療潑灑處理套件＋Playground（2026-09-04 核准開工）

設計文件 `docs/superpowers/specs/2026-09-04-chemo-spill-set-design.md`。三個題材物件走六步五 pass，
契約只擴 `rupture`（質量轉移：袋子排空、水漬、液滴；偵測用單步動量變化，不用碰撞回呼）。
展示環境是獨立專案 `../playground`（別名吃本 checkout），`tailscale serve` 掛根路徑
`https://monkeyday.tail8e3f79.ts.net/`。

- [ ] 0022 rupture 契約＋三模型（`chemo-spill-kit`／`chemo-iv-bag`／`cytotoxic-waste-bin`）＋playground＋tailnet。
```

結案時把 `[ ]` 改 `[x]` 並附 commit hash、每個模型的 gate 結果摘要、rupture 門檻校準值。

- [ ] **Step 2: 任務卡 `tasks/0022-chemo-spill-set.md`**

```markdown
# 0022 化療潑灑處理套件（M10）
model: chemo-spill-kit / chemo-iv-bag / cytotoxic-waste-bin    status: in-progress
脈絡: 使用者 2026-09-04 指定題材與三物件；點滴袋潑灑＝破裂（質量轉移）；playground 掛 tailnet 根路徑。
     設計文件 docs/superpowers/specs/2026-09-04-chemo-spill-set-design.md；計畫 docs/superpowers/plans/2026-09-04-chemo-spill-set.md。
分工: Claude 全做。
驗收: 每模型 strict spec／check_colliders／physics_test（含 --nudge）／actuation_test／（iv-bag）rupture_test 綠；
     Divine Eye＋目視；playground tsc＋scene_test 綠、tailnet curl 200。
notes:
  - rupture 門檻校準：（填實測 Δv：0.3 m／1.5 m 落下）
  - 修正次數：（填）
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md tasks/0022-chemo-spill-set.md
git commit -m "M10 0022 結案：ROADMAP／任務卡（三模型 gate 摘要、rupture 校準值、playground 網址）"
```

---

## 自審

- **Spec 覆蓋**：§3.1 → Task 3；§3.2 與 §4 → Task 1、2、4；§3.3 → Task 5；§5.1–5.2 → Task 6；§5.3 → Task 7；§5.4 → Task 6 Step 7–9、Task 7 Step 2；§6 commit 粒度 → 各 Task 末；§7 風險 → Task 4 Step 4 校準規則、Task 3/5 鉸鏈方向檢查、Task 7 HTTPS 停下條件。
- **型別一致**：`createHinge(scene, a, b, def: HingeDef)`／`makeHingeServo(joint, bodyB, lo, hi, maxForce, label?)` 在 Task 3、5 呼叫一致；`Placed = { entry, model, respawn }` 在 scene/ui/grab/hud/scene_test 一致；`CaptureApi` 從 `img2babylon-viewer/capture` 引入，playground 的 vite alias 與 tsconfig paths 都含該路徑；rupture actuator id `rupture:bag` 在 factory／actuation_test／rupture_test／ui 一致；`meshes["puddle"]`、`bodies["droplet-<i>"]` 命名一致。
- **佔位掃描**：`<job_id>`／`<Step 1 的 prompt>` 是 tomato 執行期輸出值的代入位置，已在步驟中說明來源；任務卡 notes 的「（填）」是結案時填的量測值。
