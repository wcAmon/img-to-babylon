# M17 鏟刮板接觸收納 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 鏟刮板貼地掃過地面顆粒就把顆粒收進斗、前傾就逐顆倒出，讓訓練第六步不靠 API 真人走通。

**Architecture:** 契約側在 `collect` 加 `trigger: "contact"`（每物理步掃描內腔、碰到就收）、在 `pour` 加 `source: "collected"`（倒出收進來的東西、逐顆歸還質量半徑、命名 `clump-<i>`）；
鏟刮板 factory 依此實作（斗內 `held-<n>` 小球排格顯示）；三支 headless gate 驗；playground 把鏟子倒出的 `clump-` 登記為凝固顆粒讓封袋計數。

**Tech Stack:** Python 3.10 stdlib（forge）、TypeScript strict + Babylon.js 8 Havok（viewer／playground）、tsx headless gate、playwright MCP 瀏覽器演示。

**Spec:** `docs/superpowers/specs/2026-09-06-scoop-contact-collect-design.md`

## Global Constraints

- forge/ 只准 Python 3.10+ stdlib；viewer/ TypeScript strict（`npx tsc --noEmit` 零錯）。
- 舊 spec 零改動：`collect.trigger` 缺省 = `"manual"`、`pour.source` 缺省 = `"declared"`，袋子／粉罐／噴瓶行為與 gate 結果不變。
- factory 常數鏡射 spec（`COLLECT`／`POUR` 兩處必須一致）。收走的 body **連 transformNode 一起 dispose**；所有讀 `bodies` 的消費者跳過 `isDisposed`。
- 內腔：`size [0.152, 0.07, 0.146]`、`offset [0, 0.015, 0.007]`；`maxItemMass 0.005`；`tiltThreshold 1.0`、`ratePerSecond 20`、`direction [0,0,1]`、`exitSpeed 0.2`；倒出點局部 `(0, 0.01, 0.07)`；斗內容量 120、排格 12 mm 間距 12×10。
- 倒出 body 命名 `clump-<i>`（i 自 0 單調遞增、不重用）；斗內顯示 mesh `held-<n>`；actuator `collect:scoop`（label 鏟起）、`pour:scoop`（label 傾倒）。
- 接觸收納排除**本模型所有 body**（含自己倒出的 `clump-`，否則倒出瞬間會被收回）。
- 工作流：直接在 main、每 task 一 commit；commit 結尾兩行 trailer：
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 與 `Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6`。
- `../playground` 是另一個 git repo：commit 前 `git status`，只 add 自己改的檔；`src/chemo.ts` 不改。
- Bash cwd 每次呼叫重置到 img-to-babylon 根；viewer 命令都寫成 `cd viewer && …`，playground 寫成 `cd ../playground && …`。
- 部署只用 `cd ../player-garden && bash scripts/serve.sh`（playground 的 `npm run serve` 已退役、不可跑）。

---

### Task 1: 契約驗證器（`collect.trigger`、`pour.source`）＋ grimoire

**Files:**
- Modify: `forge/validate_spec.py:133-181`（`_check_pour`）、`forge/validate_spec.py:182-203`（`_check_collect`）
- Test: `forge/tests/test_validate_spec.py`（`ValidateSpecTest` 內，緊接 `test_collect_max_item_mass_below_body_mass` 之後）
- Modify: `grimoire/spec.md:276-315`、`grimoire/physics.md:247-262`

**Interfaces:**
- Produces: spec 鍵 `physics.bodies[].collect.trigger ∈ {"manual","contact"}`、`physics.bodies[].pour.source ∈ {"declared","collected"}`；Task 2–5 的 spec.json 與 gate 讀這兩個鍵。

- [x] **Step 1: 寫失敗測試**

在 `forge/tests/test_validate_spec.py` 的 `test_collect_max_item_mass_below_body_mass` 之後加：

```python
    def test_collect_trigger_values(self):
        for ok in ("manual", "contact"):
            errors, _ = validate_spec.validate(self._with_collect(dict(self.COLLECT_OK, trigger=ok)), strict=True)
            self.assertEqual(errors, [], ok)
        errors, _ = validate_spec.validate(self._with_collect(dict(self.COLLECT_OK, trigger="auto")), strict=False)
        self.assertTrue(any("collect.trigger" in e for e in errors))

    def _with_pour_collected(self, pour, collect=None, mass=0.08):
        spec = self._with_pour(pour, mass=mass)
        if collect is not None:
            spec["physics"]["bodies"][0]["collect"] = collect
        return spec

    POUR_COLLECTED_OK = {"source": "collected", "tiltThreshold": 1.0, "ratePerSecond": 20,
                         "direction": [0, 0, 1], "exitSpeed": 0.2}
    COLLECT_SCOOP = {"trigger": "contact", "interior": {"size": [0.152, 0.07, 0.146], "offset": [0, 0.015, 0.007]},
                     "maxItemMass": 0.005}

    def test_pour_source_collected_passes_with_collect(self):
        spec = self._with_pour_collected(dict(self.POUR_COLLECTED_OK), collect=dict(self.COLLECT_SCOOP))
        errors, _ = validate_spec.validate(spec, strict=True)
        self.assertEqual(errors, [])

    def test_pour_source_values(self):
        errors, _ = validate_spec.validate(self._with_pour(dict(self.POUR_OK, source="declared")), strict=True)
        self.assertEqual(errors, [])
        errors, _ = validate_spec.validate(self._with_pour(dict(self.POUR_OK, source="bucket")), strict=False)
        self.assertTrue(any("pour.source" in e for e in errors))

    def test_pour_source_collected_requires_collect(self):
        spec = self._with_pour_collected(dict(self.POUR_COLLECTED_OK))
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("pour.source" in e and "collect" in e for e in errors))

    def test_pour_source_collected_forbids_grains(self):
        for extra in ({"grains": 40}, {"grainMass": 0.003}):
            spec = self._with_pour_collected(dict(self.POUR_COLLECTED_OK, **extra), collect=dict(self.COLLECT_SCOOP))
            errors, _ = validate_spec.validate(spec, strict=False)
            self.assertTrue(any("pour.source" in e and "grains" in e for e in errors), extra)

    def test_pour_source_collected_still_needs_rate_and_tilt_or_gate(self):
        pour = {k: v for k, v in self.POUR_COLLECTED_OK.items() if k != "ratePerSecond"}
        errors, _ = validate_spec.validate(self._with_pour_collected(pour, collect=dict(self.COLLECT_SCOOP)), strict=False)
        self.assertTrue(any("ratePerSecond" in e for e in errors))
        pour = {k: v for k, v in self.POUR_COLLECTED_OK.items() if k != "tiltThreshold"}
        errors, _ = validate_spec.validate(self._with_pour_collected(pour, collect=dict(self.COLLECT_SCOOP)), strict=False)
        self.assertTrue(any("gate" in e for e in errors))
```

- [x] **Step 2: 跑測試確認失敗**

Run: `python3 -m unittest forge.tests.test_validate_spec -k trigger -k source 2>&1 | tail -5`
Expected: FAIL（`collect.trigger`／`pour.source` 尚無錯誤訊息；`grains 必須為正整數` 會讓 collected 通不過）。

- [x] **Step 3: 實作驗證器**

`forge/validate_spec.py` `_check_pour`：把 `grains`／`grainMass` 檢查改成依 `source` 分支。找到

```python
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
```

換成

```python
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
```

並刪掉 `_POUR_POSITIVE = ("grainMass", "ratePerSecond")` 這行（不再使用）。

`_check_collect`：在 `interior = col.get("interior")` 之前加

```python
    trigger = col.get("trigger", "manual")
    if trigger not in ("manual", "contact"):
        errors.append(f"body {bid} collect.trigger 必須是 manual 或 contact")
```

- [x] **Step 4: 跑全部 forge 測試**

Run: `python3 -m unittest discover -s forge/tests -t . -p 'test_*.py' 2>&1 | tail -3`
Expected: `OK`（原本的 pour／collect 測試全綠——`test_pour_missing_field` 若靠 `grainMass 必須為正數` 訊息仍成立）。

- [x] **Step 5: grimoire 補契約**

`grimoire/spec.md` pour 節（`- gate（選填）…` 那條之後）加：

```markdown
- `source`（選填，預設 `"declared"`）：`"collected"` 時倒出的是本 body `collect` 收進來的東西，逐顆歸還原質量與原半徑；
  此時 **不得**有 `grains`／`grainMass`、同 body **必須**有 `collect`；`ratePerSecond`／`tiltThreshold`／`gate`／`direction`／`exitSpeed` 規則不變。
  倒出的 body 命名 `bodies["clump-<i>"]`／`meshes["clump-<i>"]`（i 單調遞增、不重用），與 `grain-<i>` 區分。（M17）
```

collect 節（`- maxItemMass…` 那條之後）加：

```markdown
- `trigger`（選填，預設 `"manual"`）：`"contact"` 時每個物理步掃描，合格 body 質心一進 interior 就立刻收走，不需 set(1)；
  `collect:<bodyId>` actuator 仍必掛（手動補收、冪等）。gate：`viewer/scripts/collect_test.ts` contact 分支、`viewer/scripts/sweep_test.ts`。（M17）
```

`grimoire/physics.md` 收納節末尾加一小節：

```markdown
### 接觸收納與倒回（M17 鏟刮板）

- `collect.trigger: "contact"`：掃描邏輯同上，掛在 `scene.onAfterPhysicsObservable` 每步跑；容量滿即停收（鏟刮板 120）。
- 收走一顆記 `{ mass, radius, color }`：radius 取 mesh `getBoundingInfo().boundingSphere.radiusWorld`（非 mesh 用 5 mm）、color 取 StandardMaterial diffuse。
  斗內顯示用 factory **自有**材質 `held-item`（顏色複製第一顆），mesh `held-<n>` 掛在 body pivot 下排格——不要借用被收物的材質（歸位重建會 dispose 它）。
- `pour.source: "collected"`：tilt／gate／節流判定同 declared；每倒一顆 pop 一筆記錄，在出口點生成同半徑同質量的球 `clump-<i>`（membership 4／collide ~2，同粉罐顆粒），
  初速 = body 速度 + direction × exitSpeed，body 質量減回，`held-<n>` 最後一顆 dispose。`pour:<id>` set(1) 倒完剩餘、空斗無事。
- 接觸收納排除本模型**所有** body，包含自己倒出的 `clump-`（出口點在內腔裡，否則倒出瞬間被收回）；沒倒進袋的 clump 只能由袋子收。
- 為什麼不是剛體托起：10 mm 球對 2.5 mm 唇需 1.73 mg 推力而地面摩擦只給 0.8 mg；< 2 mm 的 collider（楔形 hull、薄 box 階梯）在 Havok 直接失效。數據見 M17 設計文件 §2。
```

- [x] **Step 6: Commit**

```bash
git add forge/validate_spec.py forge/tests/test_validate_spec.py grimoire/spec.md grimoire/physics.md
git commit -m "M17 契約 forge 側：collect.trigger contact／pour.source collected 驗證＋TDD 6 測試；grimoire 兩檔補接觸收納契約

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 2: 鏟刮板接觸收納（spec ＋ factory）＋ `collect_test` contact 分支

**Files:**
- Modify: `viewer/models/scoop-and-scraper/spec.json`（`physics.bodies[0]` scoop）
- Modify: `viewer/models/scoop-and-scraper/createScoopAndScraperModel.ts`
- Modify: `viewer/scripts/collect_test.ts:28-31`（型別）、`:104-110`（contain 檢查）

**Interfaces:**
- Consumes: Task 1 的 spec 鍵。
- Produces: factory 內 `held: { mass: number; radius: number; mesh: Mesh }[]`、`heldMass`、`capture(b, m)`、`collectScan()`、`meshes["held-<n>"]`、actuator `collect:scoop`；Task 3 在同一檔加 pour。

- [x] **Step 1: spec.json 加 collect**

在 `physics.bodies` 第一筆（`"id": "scoop"`）的 `"centerOfMass"` 之後加：

```json
        "collect": {
          "trigger": "contact",
          "interior": { "size": [0.152, 0.07, 0.146], "offset": [0, 0.015, 0.007] },
          "maxItemMass": 0.005
        }
```

Run: `python3 -m forge.validate_spec viewer/models/scoop-and-scraper/spec.json` → 0 錯（若 CLI 用法不同，依 `python3 -m forge.validate_spec --help`）。

- [x] **Step 2: collect_test 加 contact 分支（先寫，跑會失敗）**

`viewer/scripts/collect_test.ts` 型別改為：

```ts
interface SpecCollect { trigger?: "manual" | "contact"; interior: { size: number[]; offset: number[] }; maxItemMass: number }
```

把

```ts
    const insideN = inBalls.filter((b) => box.inside(b.transformNode.absolutePosition)).length;
    const finite = [...inBalls, ...outBalls, ...Object.values(model.bodies)].every((b) => {
      const p = b.transformNode.absolutePosition; return [p.x, p.y, p.z].every(Number.isFinite);
    });
    push(`contain:${decl.id}`, insideN === N_IN && finite, `袋內 ${insideN}/${N_IN}、有限 ${finite}`);
```

換成

```ts
    const finite = [...inBalls, ...outBalls, ...Object.values(model.bodies)].every((b) => {
      if (b.isDisposed) return true;
      const p = b.transformNode.absolutePosition; return [p.x, p.y, p.z].every(Number.isFinite);
    });
    if (decl.collect!.trigger === "contact") {
      // M17 接觸收納：不按 set(1) 就已收走，斗內 held-<n> 顯示、質量已加
      const gone0 = inBalls.filter((b) => b.isDisposed && b.transformNode.isDisposed()).length;
      const heldN = Object.keys(model.meshes).filter((k) => k.startsWith("held-")).length;
      const kept0 = outBalls.filter((b) => !b.isDisposed).length;
      const mass0 = body.getMassProperties().mass ?? NaN;
      const expected0 = decl.mass + N_IN * BALL_MASS;
      push(`contact:${decl.id}`, gone0 === N_IN && heldN === N_IN && kept0 === N_OUT && Math.abs(mass0 - expected0) < 1e-5 && finite,
        `接觸收走 ${gone0}/${N_IN}、held ${heldN}、袋外保留 ${kept0}/${N_OUT}、質量 ${mass0}（期望 ${expected0}）、有限 ${finite}`);
    } else {
      const insideN = inBalls.filter((b) => box.inside(b.transformNode.absolutePosition)).length;
      push(`contain:${decl.id}`, insideN === N_IN && finite, `袋內 ${insideN}/${N_IN}、有限 ${finite}`);
    }
```

Run: `cd viewer && npx tsx scripts/collect_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | tail -20`
Expected: `contact:scoop` false（收走 0）、`collect:scoop:actuator` false（無 actuator）。

- [x] **Step 3: factory 實作接觸收納**

`createScoopAndScraperModel.ts`：

import 加 `AbstractMesh, Matrix, PhysicsShapeSphere, StandardMaterial`（已有的不重複）與 `type PhysicsEngineV2`；type import 改 `import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";`。

常數區（`const GROUP = 8;` 之後）加：

```ts
// 鏡射 spec physics.bodies[scoop].collect（兩處必須一致）——M17 接觸收納：內腔到唇前 1 cm、下探 2 cm
const COLLECT = { interior: { size: new Vector3(0.152, 0.07, 0.146), offset: new Vector3(0, 0.015, 0.007) }, maxItemMass: 0.005 };
const HELD_CAP = 120, HELD_PITCH = 0.012, HELD_COLS = 12;
const HELD_ORIGIN = new Vector3(-0.066, 0.0025, -0.054); // 第一格：左牆內側 −0.076 + 半格、後牆內側 −0.066 + 一格；y 加半徑
const HELD_DEFAULT_COLOR = new Color3(0.80, 0.74, 0.50);
interface Held { mass: number; radius: number; mesh: Mesh }
```

`const bodies: Record<string, PhysicsBody> = {};` 改為

```ts
  const bodies: Record<string, PhysicsBody> = {};
  const actuators: Actuator[] = [];
  const observers: (() => void)[] = [];
  const heldMat = new StandardMaterial("held-item", scene);
  heldMat.diffuseColor = HELD_DEFAULT_COLOR.clone(); heldMat.specularColor = new Color3(0.1, 0.1, 0.1);
  disposables.push(heldMat);
```

在 `make("scraper", …)` 之後、`if` 區塊結束之前加：

```ts
    // ---- collect（trigger contact）：每步掃描內腔，合格 body 連 mesh 收走、斗內排格顯示、質量加上 ----
    const scoopBody = bodies.scoop;
    const held: Held[] = [];
    let heldMass = 0;
    const half = COLLECT.interior.size.scale(0.5);
    const capture = (b: PhysicsBody, m: number): void => {
      const node = b.transformNode;
      const radius = node instanceof AbstractMesh ? node.getBoundingInfo().boundingSphere.radiusWorld : 0.005;
      const mat = node instanceof AbstractMesh ? node.material : null;
      if (held.length === 0 && mat instanceof StandardMaterial) heldMat.diffuseColor.copyFrom(mat.diffuseColor);
      b.dispose(); node.dispose();
      const n = held.length;
      const ball = MeshBuilder.CreateSphere(`held-${n}`, { diameter: radius * 2, segments: 6 }, scene);
      ball.parent = scoopPivot; ball.material = heldMat; ball.isPickable = false;
      ball.position = new Vector3(HELD_ORIGIN.x + (n % HELD_COLS) * HELD_PITCH, HELD_ORIGIN.y + radius, HELD_ORIGIN.z + Math.floor(n / HELD_COLS) * HELD_PITCH);
      meshes[`held-${n}`] = ball;
      held.push({ mass: m, radius, mesh: ball }); heldMass += m;
      scoopBody.setMassProperties({ mass: SCOOP_MASS + heldMass, centerOfMass: SCOOP_COM });
    };
    const collectScan = (): void => {
      const engine = scene.getPhysicsEngine() as PhysicsEngineV2 | null;
      if (!engine || held.length >= HELD_CAP) return;
      scoopPivot.computeWorldMatrix(true);
      const inv = Matrix.Invert(scoopPivot.getWorldMatrix());
      const mine = new Set(Object.values(bodies)); // 含自己倒出的 clump-（出口在內腔裡）
      for (const b of [...engine.getBodies()]) { // 複製：dispose 會改原陣列
        if (held.length >= HELD_CAP) break;
        if (mine.has(b) || b.isDisposed || b.getMotionType() !== PhysicsMotionType.DYNAMIC) continue;
        const m = b.getMassProperties().mass ?? 0;
        if (m <= 0 || m > COLLECT.maxItemMass) continue;
        const l = Vector3.TransformCoordinates(b.transformNode.absolutePosition, inv).subtract(COLLECT.interior.offset);
        if (Math.abs(l.x) > half.x || Math.abs(l.y) > half.y || Math.abs(l.z) > half.z) continue;
        capture(b, m);
      }
    };
    const scan = scene.onAfterPhysicsObservable.add(() => { collectScan(); });
    observers.push(() => scene.onAfterPhysicsObservable.remove(scan));
    actuators.push({
      id: "collect:scoop", kind: "collect", label: "鏟起", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) collectScan(); },
    });
```

`built` 改為 `actuators,` 並在 dispose 開頭加 `observers.forEach((f) => f());`（held mesh 是 scoopPivot 子節點，`root.dispose(false, true)` 會一起收）。

- [x] **Step 4: typecheck ＋ gate**

Run: `cd viewer && npx tsc --noEmit && npx tsx scripts/collect_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep -E '"id"|"ok"|pass'`
Expected: `contact:scoop`、`collect:scoop:collected`、`collect:scoop:idempotent`、`collect:scoop:dispose` 全 true、`"pass": true`。
若 `contact` 收走 < 8：檢查球是否掉在斗外（collect_test 的 SCATTER 0.05 對內腔半寬 0.076 夠；若不夠把 makeBall 的 z 散佈 0.6 倍已在）。

- [x] **Step 5: 袋子回歸**

Run: `cd viewer && npx tsx scripts/collect_test.ts cytotoxic-waste-bag --spec models/cytotoxic-waste-bag/spec.json | grep pass`
Expected: `"pass": true`（manual 分支不變）。

- [x] **Step 6: Commit**

```bash
git add viewer/models/scoop-and-scraper/spec.json viewer/models/scoop-and-scraper/createScoopAndScraperModel.ts viewer/scripts/collect_test.ts
git commit -m "M17 鏟刮板接觸收納：spec collect trigger contact；factory 每步掃描內腔、收走連 mesh、斗內 held-<n> 排格、質量加上；collect_test contact 分支

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 3: 鏟刮板倒出（`pour.source: "collected"`）＋ `pour_test` collected 分支

**Files:**
- Modify: `viewer/models/scoop-and-scraper/spec.json`
- Modify: `viewer/models/scoop-and-scraper/createScoopAndScraperModel.ts`（Task 2 的 collect 區塊之後）
- Modify: `viewer/scripts/pour_test.ts:24-30`（型別）、`:47-49`（grains helper）、`:96-140`（主迴圈）

**Interfaces:**
- Consumes: Task 2 的 `held`、`heldMass`、`heldMat`、`scoopBody`、`scoopPivot`、`observers`、`actuators`。
- Produces: `bodies["clump-<i>"]`／`meshes["clump-<i>"]`、actuator `pour:scoop`；Task 4 sweep_test 讀 `pour.direction`、Task 5 playground 讀 `clump-` 前綴。

- [x] **Step 1: spec.json 加 pour**

scoop body 的 `"collect"` 之後加：

```json
        "pour": { "source": "collected", "tiltThreshold": 1.0, "ratePerSecond": 20, "direction": [0, 0, 1], "exitSpeed": 0.2 }
```

Run: `python3 -m forge.validate_spec viewer/models/scoop-and-scraper/spec.json` → 0 錯。

- [x] **Step 2: pour_test 加 collected 分支（先寫）**

型別：

```ts
interface SpecPour { source?: "declared" | "collected"; tiltThreshold?: number; grains?: number; grainMass?: number; ratePerSecond: number; gate?: { body: string; minAngle: number } }
interface SpecCollect { interior: { size: number[]; offset: number[] }; maxItemMass: number }
interface SpecBody { id: string; mass: number; pour?: SpecPour; collect?: SpecCollect }
```

helper 區加：

```ts
function emitted(model: BuiltModel): PhysicsBody[] {
  return Object.entries(model.bodies).filter(([k]) => k.startsWith("clump-")).map(([, b]) => b);
}
const PRE_N = 6, PRE_D = 0.010, PRE_MASS = 0.003;
/** collected 分支：自內腔中心上方 0.2 m 丟 PRE_N 顆球讓接觸收納吃掉（回傳斗內 held 數）。 */
function preload(model: BuiltModel, decl: SpecBody, step: (n: number) => void): number {
  const body = model.bodies[decl.id]; const node = body.transformNode; node.computeWorldMatrix(true);
  const center = Vector3.TransformCoordinates(Vector3.FromArray(decl.collect!.interior.offset), node.getWorldMatrix());
  for (let i = 0; i < PRE_N; i++) {
    const a = (i / PRE_N) * Math.PI * 2;
    const m = MeshBuilder.CreateSphere(`pre-${i}`, { diameter: PRE_D, segments: 6 }, node.getScene());
    m.position = center.add(new Vector3(Math.cos(a) * 0.03, 0.2, Math.sin(a) * 0.03));
    const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, node.getScene());
    const s = new PhysicsShapeSphere(Vector3.Zero(), PRE_D / 2, node.getScene()); s.material = { friction: 0.8, restitution: 0.05 }; b.shape = s;
    b.setMassProperties({ mass: PRE_MASS }); b.setLinearDamping(2.0); b.setAngularDamping(2.0);
  }
  step(200);
  return Object.keys(model.meshes).filter((k) => k.startsWith("held-")).length;
}
/** 懸空鎖姿態：每步速度歸零（重力每步只漂 ½·g·dt²），把 body 以 pitch 前傾角掛在 y 高度。 */
function hoist(model: BuiltModel, decl: SpecBody, pitch: number, y: number, step: (n: number) => void): () => void {
  const body = model.bodies[decl.id]; const node = body.transformNode;
  body.disablePreStep = false;
  node.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), pitch).multiply(node.absoluteRotationQuaternion ?? Quaternion.Identity());
  node.position.y += y;
  step(2); body.disablePreStep = true;
  const obs = node.getScene().onBeforePhysicsObservable.add(() => { body.setLinearVelocity(Vector3.Zero()); body.setAngularVelocity(Vector3.Zero()); });
  return () => node.getScene().onBeforePhysicsObservable.remove(obs);
}
```

（`PhysicsShapeSphere` 加進 import。`hoist` 的旋轉是「世界 x 軸前傾」：鏟在 spec 中 rotY 3.3 幾乎朝 −z，繞世界 x 轉 −1.2 rad 讓 +y 倒向 −z 方向即唇朝下；正負以 (B) 的 `clump-` 數驗證，錯了就換號。）

主迴圈 `for (const decl of decls) {` 開頭加分支：

```ts
    const pour = decl.pour!;
    if (pour.source === "collected") {
      // M17：倒出收進來的東西。(A) 裝 6 顆直立不倒 (B) 前傾 1.2 rad 倒出 6 顆、質量回基準 (C) 空斗 set(1) 無事、dispose 乾淨
      const base = decl.mass;
      {
        const { ctx, model } = await spawn(name, false);
        ctx.step(LAND_STEPS);
        const heldN = preload(model, decl, ctx.step);
        ctx.step(120);
        const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
        push(`A:${decl.id}:upright-held`, heldN === PRE_N && emitted(model).length === 0 && Math.abs(mass - (base + PRE_N * PRE_MASS)) < 1e-5,
          `held ${heldN}/${PRE_N}、直立 120 步 clump ${emitted(model).length}、質量 ${mass}（期望 ${base + PRE_N * PRE_MASS}）`);
        ctx.dispose();
      }
      {
        const { ctx, model } = await spawn(name, false);
        ctx.step(LAND_STEPS);
        preload(model, decl, ctx.step);
        const release = hoist(model, decl, -1.2, 0.5, ctx.step);
        ctx.step(POUR_STEPS);
        release();
        const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
        const heldLeft = Object.keys(model.meshes).filter((k) => k.startsWith("held-")).length;
        push(`B:${decl.id}:poured`, emitted(model).length === PRE_N && heldLeft === 0 && Math.abs(mass - base) < 1e-5 && allFinite(model),
          `clump ${emitted(model).length}（期望 ${PRE_N}）、held 剩 ${heldLeft}、質量 ${mass}（期望 ${base}）、有限 ${allFinite(model)}`);
        ctx.dispose();
      }
      {
        const { ctx, model } = await spawn(name, false);
        ctx.step(60);
        const act = model.actuators?.find((a) => a.id === `pour:${decl.id}`);
        if (!act) push(`C:${decl.id}:actuator`, false, "無 pour actuator");
        else {
          act.set(1); ctx.step(5); act.set(1); ctx.step(5);
          const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
          push(`C:${decl.id}:empty-noop`, emitted(model).length === 0 && Math.abs(mass - base) < 1e-5, `空斗 set(1) 兩次：clump ${emitted(model).length}、質量 ${mass}`);
        }
        model.dispose();
        push(`C:${decl.id}:dispose`, !ctx.scene.meshes.some((m) => m.name.startsWith("clump-") || m.name.startsWith("held-")), "dispose 後場景無 clump／held mesh");
        ctx.dispose();
      }
      continue;
    }
    const emptied = decl.mass - pour.grains! * pour.grainMass!;
```

（原本的 `const pour = decl.pour!; const emptied = …` 兩行被上面取代；後面 declared 分支的 `pour.grains`／`pour.grainMass` 改成 `pour.grains!`／`pour.grainMass!`。）

Run: `cd viewer && npx tsc --noEmit && npx tsx scripts/pour_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep -E '"id"|"ok"|pass'`
Expected: A 可能 true（Task 2 已收）、B false（clump 0）、C actuator false。

- [x] **Step 3: factory 實作 pour collected**

常數區加：

```ts
// 鏡射 spec physics.bodies[scoop].pour（兩處必須一致）——source collected：倒出收進來的東西
const POUR = { tiltThreshold: 1.0, ratePerSecond: 20, direction: new Vector3(0, 0, 1), exitSpeed: 0.2 };
const LIP_EXIT = new Vector3(0, 0.01, 0.07); // 唇中心（局部）
const CLUMP_GROUP = 4, CLUMP_DAMPING = 2.0, FIXED_DT = 1 / 60;
```

Task 2 的 `actuators.push({ id: "collect:scoop" … })` 之後加：

```ts
    // ---- pour（source collected）：前傾 ≥ 1.0 rad 以 20 顆/s 從唇中心逐顆倒回，質量還給該顆 ----
    const spawned: Mesh[] = [];
    let clumpN = 0, accum = 0;
    const emitOne = (): void => {
      const h = held.pop();
      if (!h) return;
      heldMass -= h.mass; delete meshes[h.mesh.name]; h.mesh.dispose();
      scoopPivot.computeWorldMatrix(true);
      const wm = scoopPivot.getWorldMatrix();
      const p = Vector3.TransformCoordinates(LIP_EXIT, wm);
      const dir = Vector3.TransformNormal(POUR.direction, wm).normalize();
      const i = clumpN++;
      const g = MeshBuilder.CreateSphere(`clump-${i}`, { diameter: h.radius * 2, segments: 6 }, scene);
      g.position.copyFrom(p); g.material = heldMat; g.isPickable = false;
      meshes[`clump-${i}`] = g; spawned.push(g);
      const gb = new PhysicsBody(g, PhysicsMotionType.DYNAMIC, false, scene);
      const gs = new PhysicsShapeSphere(Vector3.Zero(), h.radius, scene);
      gs.material = { friction: 0.8, restitution: 0.05 };
      gs.filterMembershipMask = CLUMP_GROUP; gs.filterCollideMask = ~2; // 同粉罐顆粒：撞地、撞袋（8）、撞鏟，不撞 membership 2 的模型件
      gb.shape = gs;
      gb.setMassProperties({ mass: h.mass });
      gb.setLinearDamping(CLUMP_DAMPING); gb.setAngularDamping(CLUMP_DAMPING);
      gb.setLinearVelocity(scoopBody.getLinearVelocity().add(dir.scale(POUR.exitSpeed)));
      bodies[`clump-${i}`] = gb;
      scoopBody.setMassProperties({ mass: SCOOP_MASS + heldMass, centerOfMass: SCOOP_COM });
    };
    const pourObs = scene.onAfterPhysicsObservable.add(() => {
      if (!held.length) { accum = 0; return; }
      scoopPivot.computeWorldMatrix(true);
      const up = scoopPivot.getDirection(Vector3.Up());
      const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
      if (tilt < POUR.tiltThreshold) { accum = 0; return; }
      accum += POUR.ratePerSecond * FIXED_DT;
      while (accum >= 1 && held.length) { accum -= 1; emitOne(); }
    });
    observers.push(() => scene.onAfterPhysicsObservable.remove(pourObs));
    actuators.push({
      id: "pour:scoop", kind: "pour", label: "傾倒", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) while (held.length) emitOne(); },
    });
```

dispose 加：`Object.values(bodies).forEach((b) => b.dispose());` 之後 `spawned.forEach((m) => { if (!m.isDisposed()) m.dispose(); });`（clump mesh 在場景根層級，root.dispose 收不到）。
注意 `spawned`／`emitOne` 定義在 `if (physics)` 區塊內：把 `const spawned: Mesh[] = [];` 移到區塊外（`const observers` 旁），區塊內只 push。

- [x] **Step 4: gate**

Run: `cd viewer && npx tsc --noEmit && npx tsx scripts/pour_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep -E '"id"|"ok"|pass'`
Expected: 全 true。若 B 的 clump 0：印 `tilt`（在 hoist 後讀 `node.getDirection(Up).y`）確認 ≥ 1.0，不夠就把 `hoist` 的 pitch 換號（+1.2）。

- [x] **Step 5: 回歸**

Run: `cd viewer && npx tsx scripts/pour_test.ts absorbent-powder-shaker --spec models/absorbent-powder-shaker/spec.json | grep pass && npx tsx scripts/pour_test.ts disinfectant-spray --spec models/disinfectant-spray/spec.json | grep pass && npx tsx scripts/collect_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep pass`
Expected: 三個 `"pass": true`。

- [x] **Step 6: Commit**

```bash
git add viewer/models/scoop-and-scraper/spec.json viewer/models/scoop-and-scraper/createScoopAndScraperModel.ts viewer/scripts/pour_test.ts
git commit -m "M17 鏟刮板倒出：spec pour source collected；factory 前傾 ≥1.0 rad 從唇中心逐顆倒回 clump-<i>、質量歸還；pour_test collected 分支（裝 6 倒 6）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 4: 新 gate `sweep_test.ts`＋全套 viewer 驗證＋SKILL.md／reviewHistory

**Files:**
- Create: `viewer/scripts/sweep_test.ts`
- Modify: `SKILL.md:44` 附近（第 5 步驗證命令）
- Modify: `viewer/models/scoop-and-scraper/spec.json`（`reviewHistory` 加一筆）

**Interfaces:**
- Consumes: spec `collect.trigger`、`collect.interior`、`pour.direction`；factory 的接觸收納。

- [x] **Step 1: 寫 gate**

```ts
// 掃收 gate（M17 collect trigger contact）：spec 有 collect.trigger contact 的 body 必須能貼地掃過地面顆粒把它們收進來——
// 7 顆 d 0.010／0.003 kg／摩擦 0.8／阻尼 2.0 的球排在內腔前緣前方 5～29 cm 三車道，body 姿態鎖定、貼地沿 pour.direction（無則局部 +z）
// 以 0.25 m/s 推 0.5 m、停 60 步 → 收進 ≥ 5、質量 = mass + n×0.003、位置有限。無 contact 宣告印略過 PASS。
// 用法: npx tsx scripts/sweep_test.ts <model-name> --spec <spec.json> [--out result.json]
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeSphere, Quaternion, Scene, Vector3 } from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";

const LAND_STEPS = 120, SETTLE_STEPS = 60, STOP_STEPS = 60;
const N = 7, BALL_D = 0.010, BALL_MASS = 0.003, BALL_DAMPING = 2.0;
const SPEED = 0.25, SWEEP = 0.5, LEAD = 0.05, GAP = 0.04, LANE = 0.04;
const MIN_COLLECTED = 5;

interface SpecCollect { trigger?: string; interior: { size: number[]; offset: number[] }; maxItemMass: number }
interface SpecBody { id: string; mass: number; collect?: SpecCollect; pour?: { direction?: number[] } }
interface Spec { physics?: { bodies?: SpecBody[] } }
interface Check { id: string; ok: boolean; detail: string }

function makeBall(scene: Scene, name: string, pos: Vector3): PhysicsBody {
  const m = MeshBuilder.CreateSphere(name, { diameter: BALL_D, segments: 6 }, scene);
  m.position.copyFrom(pos);
  const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
  const s = new PhysicsShapeSphere(Vector3.Zero(), BALL_D / 2, scene);
  s.material = { friction: 0.8, restitution: 0.05 };
  b.shape = s; b.setMassProperties({ mass: BALL_MASS });
  b.setLinearDamping(BALL_DAMPING); b.setAngularDamping(BALL_DAMPING);
  return b;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath) {
    console.error(`用法: sweep_test.ts <model-name> --spec <spec.json> [--out result.json]；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const decls = (spec.physics?.bodies ?? []).filter((b) => b.collect?.trigger === "contact");
  if (!decls.length) {
    console.log(JSON.stringify({ model: name, checks: [], pass: true, note: "spec 無 collect.trigger contact 宣告" }));
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
    gShape.material = { friction: 0.6, restitution: 0.1 };
    gBody.shape = gShape;
    const factory = (await registry[name]()).default;
    const model = factory(scene, { physics: true });
    step(LAND_STEPS);
    const body = model.bodies[decl.id];
    const node = body.transformNode;
    const wm = (): void => node.computeWorldMatrix(true);
    wm();
    const dirLocal = Vector3.FromArray(decl.pour?.direction ?? [0, 0, 1]).normalize();
    const front = Vector3.TransformNormal(dirLocal, node.getWorldMatrix()).normalize();
    const right = Vector3.Cross(Vector3.Up(), front).normalize();
    const c = decl.collect!.interior;
    const frontEdge = c.offset[2] + c.size[2] / 2; // 內腔前緣（沿局部 +z）
    const balls: PhysicsBody[] = [];
    for (let i = 0; i < N; i++) {
      const p = node.absolutePosition.add(front.scale(frontEdge + LEAD + i * GAP)).add(right.scale(((i % 3) - 1) * LANE));
      p.y = BALL_D / 2;
      balls.push(makeBall(scene, `sweep-${i}`, p));
    }
    step(SETTLE_STEPS);
    const start = node.absolutePosition.clone();
    const obs = scene.onBeforePhysicsObservable.add(() => {
      const v = body.getLinearVelocity();
      body.setLinearVelocity(new Vector3(front.x * SPEED, Math.min(v.y, 0), front.z * SPEED));
      body.setAngularVelocity(Vector3.Zero());
    });
    step(Math.round(SWEEP / SPEED * 60));
    scene.onBeforePhysicsObservable.remove(obs);
    body.setLinearVelocity(Vector3.Zero());
    step(STOP_STEPS);
    wm();
    const collected = balls.filter((b) => b.isDisposed && b.transformNode.isDisposed()).length;
    const heldN = Object.keys(model.meshes).filter((k) => k.startsWith("held-")).length;
    const mass = body.getMassProperties().mass ?? NaN;
    const moved = Vector3.Distance(node.absolutePosition, start);
    const p = node.absolutePosition;
    const finite = [p.x, p.y, p.z].every(Number.isFinite);
    push(`sweep:${decl.id}`, collected >= MIN_COLLECTED && heldN === collected && Math.abs(mass - (decl.mass + collected * BALL_MASS)) < 1e-5 && finite,
      `收進 ${collected}/${N}（≥ ${MIN_COLLECTED}）、held ${heldN}、質量 ${mass}（期望 ${decl.mass + collected * BALL_MASS}）、推進 ${moved.toFixed(3)} m、有限 ${finite}`);
    model.dispose();
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

- [x] **Step 2: 跑 gate**

Run: `cd viewer && npx tsc --noEmit && npx tsx scripts/sweep_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep -E 'detail|pass'`
Expected: 收進 7/7、pass true。若 < 5：確認球在內腔前方（`frontEdge` 0.08 + 0.05）、鏟真的貼地（`Math.min(v.y, 0)`）。
Run: `cd viewer && npx tsx scripts/sweep_test.ts cytotoxic-waste-bag --spec models/cytotoxic-waste-bag/spec.json` → note 略過、pass true。

- [x] **Step 3: 全套 viewer gate**

```bash
cd viewer && npx tsc --noEmit \
 && npx tsx scripts/physics_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep pass \
 && npx tsx scripts/actuation_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep -E 'pass|note' \
 && npx tsx scripts/collect_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep pass \
 && npx tsx scripts/pour_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep pass \
 && npx tsx scripts/sweep_test.ts scoop-and-scraper --spec models/scoop-and-scraper/spec.json | grep pass
```

Expected: 全 `"pass": true`。physics_test 若因質量／靜止判定變動失敗（collect 不改質量、collider 不改，應不會），記錄並修。

- [x] **Step 4: SKILL.md 與 reviewHistory**

`SKILL.md` 第 5 步驗證命令列在 physics_test 那條之後加一條（沿用該列縮排與編號風格）：

```markdown
   d. spec 有 `pour`／`collect` 時另跑 `pour_test.ts`／`collect_test.ts`；`collect.trigger: "contact"` 再跑 `sweep_test.ts`（同樣 `<name> --spec models/<name>/spec.json`）。
```

`spec.json` `reviewHistory` 末尾加：

```json
    {
      "pass": "physics",
      "likeness": 8,
      "colliderFit": 9,
      "eye": { "verdict": "pass", "fidelity": 0.467, "iou": 0.66 },
      "action": "done",
      "notes": "M17 接觸收納：scoop 加 collect trigger contact（內腔到唇前 1 cm、下探 2 cm、maxItemMass 0.005）＋ pour source collected（前傾 ≥ 1.0 rad、20 顆/s、唇中心倒出 clump-<i>）。探針證明純剛體在 Havok 尺度鏟不起 10 mm 顆粒（單顆永不進、7 顆最多 3–4）；collect_test contact 8/8、pour_test 裝 6 倒 6、sweep_test 掃 7 收 7。collider／mesh 不變，Divine Eye 不重跑。"
    }
```

- [x] **Step 5: Commit**

```bash
git add viewer/scripts/sweep_test.ts SKILL.md viewer/models/scoop-and-scraper/spec.json
git commit -m "M17 新 gate sweep_test（貼地掃 7 顆 ≥5 收進）；SKILL 第 5 步加 pour／collect／sweep gate；鏟刮板 reviewHistory 補接觸收納

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 5: playground——封袋計數納入鏟子倒出物、傾倒按鈕、scene_test、README

**Files:**
- Modify: `../playground/src/interactions.ts:52-59`（每步掃描開頭）
- Modify: `../playground/src/actions.ts`（switch 加 case）
- Modify: `../playground/scripts/scene_test.ts:137-202`（M13 段）
- Modify: `../playground/README.md:28`

**Interfaces:**
- Consumes: 鏟刮板 `bodies["clump-<i>"]`、`meshes["held-<n>"]`、actuator `pour:scoop`。
- Produces: `InteractionState.sealedClumps` 計到鏟子倒出的 clump；按鈕「傾倒」。

- [x] **Step 1: scene_test 先改（會失敗）**

把 M13 段從 `// M13 抓取：測試球落入鏟斗 → 抓鏟抬高（grab:lift）` 到 `push("grab:carry-pour", …);` 結束整段換成：

```ts
  // M17 掃收：7 顆 3 g 球排在鏟口前方地面，抓鏟貼地沿唇向前拖 0.5 m → 接觸收納 ≥ 5
  const grab = createGrabController(scene);
  const scoop = tools.model.bodies["scoop"];
  const scoopWorld = (): Matrix => { scoop.transformNode.computeWorldMatrix(true); return scoop.transformNode.getWorldMatrix(); };
  const heldN = (): number => Object.keys(tools.model.meshes).filter((k) => k.startsWith("held-")).length;
  const front0 = Vector3.TransformNormal(new Vector3(0, 0, 1), scoopWorld()).normalize();
  const right0 = Vector3.Cross(Vector3.Up(), front0).normalize();
  const sweepBalls: PhysicsBody[] = [];
  for (let i = 0; i < 7; i++) {
    const p = scoop.transformNode.absolutePosition.add(front0.scale(0.13 + i * 0.04)).add(right0.scale(((i % 3) - 1) * 0.04)); p.y = 0.005;
    const m = MeshBuilder.CreateSphere(`sweep-${i}`, { diameter: 0.010, segments: 6 }, scene); m.position = p;
    const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
    const s = new PhysicsShapeSphere(Vector3.Zero(), 0.005, scene); s.material = { friction: 0.8, restitution: 0.05 }; b.shape = s;
    b.setMassProperties({ mass: 0.003 }); b.setLinearDamping(2.0); b.setAngularDamping(2.0);
    sweepBalls.push(b);
  }
  step(60);
  const handSweep = Vector3.TransformCoordinates(new Vector3(0, 0.02, -0.06), scoopWorld());
  grab.begin(scoop, handSweep);
  // 目標插值滑動（模擬連續拖曳）：一次跳 0.5 m 會以 3 m/s 起步
  const glide = (to: Vector3, steps: number): void => { const from = grab.target(); for (let i = 1; i <= steps; i++) { grab.moveTo(Vector3.Lerp(from, to, i / steps)); step(1); } };
  glide(handSweep.add(front0.scale(0.5)), 120);
  step(60);
  const swept = sweepBalls.filter((b) => b.isDisposed).length;
  push("sweep:contact", swept >= 5 && heldN() === swept, `貼地拖 0.5 m 收進 ${swept}/7（≥ 5）、held ${heldN()}`);
  grab.end(); step(60);

  // M13 抓取：測試球落入鏟斗（接觸收納吃掉）→ 抓鏟抬高（grab:lift）→ 搬到袋上前傾（grab:tilt）→ 倒出 clump 落袋、封袋（grab:carry-pour）
  const held0 = heldN();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = MeshBuilder.CreateSphere(`scoop-ball-${i}`, { diameter: 0.012, segments: 6 }, scene);
    m.position = Vector3.TransformCoordinates(new Vector3(Math.cos(a) * 0.03, 0.15, -0.03 + Math.sin(a) * 0.03), scoopWorld());
    const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
    const s = new PhysicsShapeSphere(Vector3.Zero(), 0.006, scene); s.material = { friction: 0.6, restitution: 0.05 }; b.shape = s;
    b.setMassProperties({ mass: 0.005 }); b.setLinearDamping(2.0); b.setAngularDamping(2.0);
  }
  step(200);
  const inScoop0 = heldN() - held0;
  const hand0 = Vector3.TransformCoordinates(new Vector3(0, 0.02, -0.06), scoopWorld());
  grab.begin(scoop, hand0);
  // 傾斜軸＝鏟局部 +x 世界方向；符號由 TransformNormal 判定（前緣 +z 要往下為正）
  const axis = Vector3.TransformNormal(new Vector3(1, 0, 0), scoopWorld()).normalize();
  const front = Vector3.TransformNormal(new Vector3(0, 0, 1), scoopWorld()).normalize();
  const probe = front.applyRotationQuaternion(Quaternion.RotationAxis(axis, 0.2));
  const tiltSign = probe.y < front.y ? 1 : -1;
  step(40);
  glide(hand0.add(new Vector3(0, 0.5, 0)), 90);
  step(60);
  let liftErrMax = 0;
  for (let i = 0; i < 30; i++) { step(1); liftErrMax = Math.max(liftErrMax, grab.handError()); }
  push("grab:lift", liftErrMax <= 0.03 && inScoop0 === 8, `手點誤差最大 ${liftErrMax.toFixed(3)}（最後 30 步，≤ 0.03）、斗內收進 ${inScoop0}/8、held 共 ${heldN()}`);

  wbagBody.transformNode.computeWorldMatrix(true);
  const wbagWm2 = wbagBody.transformNode.getWorldMatrix();
  const frontH = front.clone(); frontH.y = 0; frontH.normalize();
  const pourAt = Vector3.TransformCoordinates(interiorOff, wbagWm2).add(new Vector3(0, 0.45, 0)).subtract(frontH.scale(0.05));
  glide(pourAt, 120);
  step(60);
  const wbagMassBefore = wbagBody.getMassProperties().mass ?? NaN;
  for (let i = 0; i < 20; i++) { grab.tilt(axis, tiltSign * 0.1); step(5); }
  step(60);
  const rotErr = grab.rotError(), tiltHandErr = grab.handError();
  push("grab:tilt", rotErr < 0.1 && tiltHandErr <= 0.03, `姿態誤差 ${rotErr.toFixed(3)}（< 0.1）、手點誤差 ${tiltHandErr.toFixed(3)}（≤ 0.03）`);
  step(300);
  grab.tilt(axis, -tiltSign * 1.65);
  glide(hand0.add(new Vector3(0, 0.3, 0)), 120);
  grab.end();
  step(60);
  wbagBody.transformNode.computeWorldMatrix(true);
  const wbagInv2 = Matrix.Invert(wbagBody.transformNode.getWorldMatrix());
  const clumpsOut = Object.entries(tools.model.bodies).filter(([k, b]) => k.startsWith("clump-") && !b.isDisposed).map(([, b]) => b);
  const inBag = clumpsOut.filter((b) => {
    const l = Vector3.TransformCoordinates(b.transformNode.absolutePosition, wbagInv2).subtract(interiorOff);
    return Math.abs(l.x) <= interiorHalf.x && Math.abs(l.y) <= interiorHalf.y && Math.abs(l.z) <= interiorHalf.z;
  });
  const n = inBag.length;
  const inBagMass = inBag.reduce((s, b) => s + (b.getMassProperties().mass ?? 0), 0);
  const sealedNow = inter.sealClumps(() => wbag.model.actuators?.find((a) => a.id === "collect:bag")?.set(1));
  step(2);
  const wbagMass2 = wbagBody.getMassProperties().mass ?? NaN;
  push("grab:carry-pour", clumpsOut.length === heldN() + clumpsOut.length && heldN() === 0 && n >= 6 && Math.abs(wbagMass2 - (wbagMassBefore + inBagMass)) < 1e-5
    && inBag.every((b) => b.isDisposed) && sealedNow === n,
    `倒出 clump ${clumpsOut.length}、袋內 ${n}（≥ 6）、封袋計 ${sealedNow}、封袋後質量 ${wbagMass2}（期望 ${(wbagMassBefore + inBagMass).toFixed(3)}）`);
```

（`heldN() === 0` 表示前傾 2 rad 期間全倒完；`clumpsOut.length === heldN() + clumpsOut.length` 恆真、可省，留作註解意義：倒出數 = 收進數。若 `swept` 因鏟被抓著前拖時鼻子抬起而 < 5，把 `handSweep` 的 y 改 0.0 讓伺服壓地。）

Run: `cd ../playground && npm run typecheck && npm run scene-test 2>&1 | grep -E '"id"|"ok": false|"pass"'`
Expected: `sweep:contact` 可能已 true（factory 已做）、`grab:carry-pour` false（`sealedNow` 0：interactions 還沒登記 clump）。

- [x] **Step 2: interactions 登記鏟子倒出物**

`../playground/src/interactions.ts` 每步掃描裡，`const grains = liveBodies(shaker, "grain-");` 之後加：

```ts
    // M17：鏟刮板倒出的 clump-<i> 視為凝固顆粒（封袋規則 E 才計得到）；簡化：不追溯收進去前是否吸過液
    const tools = ps.find((p) => p.entry.model === "scoop-and-scraper");
    for (const c of liveBodies(tools, "clump-")) clump(c);
```

（`clump()` 已有 `absorbed` 守衛，不會重複 push；它同時把材質換成 clumpMat。）檔頭註解第 3 行補「鏟刮板 pour source collected 的 `bodies["clump-<i>"]`」。

- [x] **Step 3: 傾倒按鈕**

`../playground/src/actions.ts` switch 加：

```ts
    case "scoop-and-scraper":
      add("傾倒", () => act(p.model, "pour:scoop")?.set(1));
      break;
```

- [x] **Step 4: gate**

Run: `cd ../playground && npm run typecheck && npm run scene-test 2>&1 | grep -E '"ok": false|"pass"' ; npm run training-test 2>&1 | grep -E '"ok": false|"pass"'; npm run parkour-test 2>&1 | tail -2`
Expected: scene-test 35 項全 true（原 34 ＋ sweep:contact）、training-test 13/13、parkour PASS。
若 `grab:lift` 的 `inScoop0` < 8：球從 0.15 m 落在斗內會被立刻收走，理論 8；少了就是彈出斗外——把落點半徑 0.03 改 0.02。

- [x] **Step 5: README**

`../playground/README.md` 第 28 行「已知限制」換成：

```markdown
- 鏟刮板是**接觸收納**（M17）：鏟底貼地（離地 ≤ 2 cm）掃過的顆粒、液滴一碰到唇就收進斗（斗內顯示小球），Q／E 前傾 ≥ 1 rad 或按「傾倒」從唇口逐顆倒出；
  純剛體在這個尺度鏟不起 10 mm 顆粒（Havok 對 < 2 mm 的碰撞體失效，見 img-to-babylon M17 設計文件 §2）。鏟子倒出的顆粒一律算凝固顆粒供封袋計數；沒倒進袋的只能由袋子收。
```

- [x] **Step 6: Commit（只 add 自己的檔）**

```bash
cd ../playground && git status --short
git add src/interactions.ts src/actions.ts scripts/scene_test.ts README.md
git commit -m "M17 鏟刮板接觸收納接入：clump- 登記為凝固顆粒供封袋計數、傾倒按鈕、scene_test 掃收＋倒袋改接觸收納語意、README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 6: 部署＋瀏覽器真實輸入層第六步走通

**Files:**
- Evidence: `.img2babylon/shots/playground7-sweep.png`、`.img2babylon/shots/playground7-pour.png`

- [x] **Step 1: 部署**

Run: `cd ../player-garden && bash scripts/serve.sh 2>&1 | tail -5 && curl -s -o /dev/null -w '%{http_code}\n' https://<internal-host>/playground/ && grep -l "held-item" ~/.local/share/player-garden/www/playground/assets/*.js | head -1`
Expected: 200、找到含 `held-item` 的 bundle。

- [x] **Step 2: 本機 dev server（截圖用）**

Run（背景）: `cd ../playground && npm run dev -- --port 5175 --strictPort`

- [x] **Step 3: playwright 走真實輸入層**

`browser_navigate http://localhost:5175/?scene=training`，等 `window.__TRAINING_READY__`。用 `browser_evaluate` 跑腳本（合成事件規則：`pointermove` 帶 `button: -1`；`WheelEvent` 給 `deltaY`；`KeyboardEvent` 在 window；`Vector3.Project` 算螢幕座標）：
1. 開始訓練；走完前五步可用 M16 的黃金路徑腳本（`__TRAINING__.flow` 事件確認 absorb、disinfect-wipe 完成）——這五步不是本 task 驗證對象，可用鍵盤走站＋已驗過的滑鼠腳本。
2. 第六步：走到工具站，從鏟身上方 pick（驗 `__PLAYGROUND_GRAB__` 抓到的 body 是 `placed[tools].model.bodies.scoop`，抓到 scraper 就放手換點）；滾輪壓到底（`lift` 夾 y ≥ 0，滾 8 次）；`pointermove` 沿地面拖過凝固顆粒堆 0.6 m（每 20 ms 一步）；
   讀 `Object.keys(tools.model.meshes).filter(held-).length` ≥ 5 → 截圖 `playground7-sweep.png`。
3. 滾輪抬 0.4 m，拖到袋上方（袋在 (3.4, 0, 3) 附近，鏟站 (3, 0, −3.6)：先放手、走過去、再抓），按住 Q 或 E（KeyboardEvent keydown 持續 1.2 s）前傾到 clump 落袋 → 截圖 `playground7-pour.png`；按「封袋」→ `__TRAINING__.flow` 出現 dispose 步驟完成、`inter.sealedClumps` ≥ 5；袋投桶、脫除。
4. 記錄七步結果、錯誤數、分數。**不呼叫任何 `__PLAYGROUND_GRAB__.begin`／teleport**；若某步做不到，照實寫進 task 檔與 spec §10。

- [x] **Step 4: 收尾**

Run: `pkill -f "vite.*5175"`；把 playwright 截圖搬到 `.img2babylon/shots/`（若落在 img-to-babylon 根）。

---

### Task 7: 結案文件、探針刪除、記憶、handoff

**Files:**
- Modify: `ROADMAP.md`（M16 節之後、Parked 之前插 M17 節）
- Create: `tasks/0029-scoop-contact-collect.md`
- Modify: `docs/next-steps.md`（重寫「候選」：移除第 1 項、其餘遞補；執行提醒加接觸收納一條）
- Modify: `docs/superpowers/specs/2026-09-06-scoop-contact-collect-design.md`（加 `## 10. 実測補記（2026-09-06 結案）`）
- Delete: `viewer/scripts/_m17_probe.ts`（未追蹤，`rm`）
- Memory: 新 `img2babylon-m17-lessons.md` ＋ `MEMORY.md` 一行；`.remember/remember.md` 更新

- [x] **Step 1: ROADMAP**

在 `## Parked` 之前插：

```markdown
## M17：鏟刮板接觸收納（2026-09-06 核准開工、同日結案）

設計文件 `docs/superpowers/specs/2026-09-06-scoop-contact-collect-design.md`、計畫 `docs/superpowers/plans/2026-09-06-scoop-contact-collect.md`。
探針證明 physicsScale 1 的剛體幾何鏟不起 10 mm 顆粒（單顆永不進、7 顆最多 3–4；楔形 hull／薄 box 階梯在 Havok 更差）→ 契約層接觸收納。

- [x] 0029 契約：`collect.trigger: "contact"`（每步掃內腔、碰到就收）、`pour.source: "collected"`（逐顆歸還質量半徑、命名 `clump-<i>`）；validate_spec TDD 6 測試、grimoire 兩檔。
      鏟刮板 spec／factory：內腔到唇前 1 cm、下探 2 cm；斗內 `held-<n>` 排格；前傾 ≥ 1.0 rad 20 顆/s 從唇中心倒出。gate：collect_test contact、pour_test collected、新 sweep_test（掃 7 收 7）。
      playground：`clump-` 登記為凝固顆粒、傾倒按鈕、scene_test 35 項。瀏覽器真實輸入層第六步：（Task 6 結果填入）。
```

- [x] **Step 2: tasks/0029**

```markdown
# 0029 鏟刮板接觸收納（M17）
model: scoop-and-scraper（spec collect trigger contact＋pour source collected）；forge validate_spec；grimoire spec.md／physics.md；viewer scripts collect_test／pour_test／新 sweep_test；../playground src/interactions.ts、src/actions.ts、scripts/scene_test.ts、README    status: done（2026-09-06）
脈絡: M16 結案後使用者選「鏟刮板鏟得起顆粒（契約側）」；結案標準選「契約 gate＋訓練第六步真人走通」；方案選「接觸即收」。
     設計文件 docs/superpowers/specs/2026-09-06-scoop-contact-collect-design.md；計畫 docs/superpowers/plans/2026-09-06-scoop-contact-collect.md。
分工: Claude 全做。
驗收: forge unittest 綠；viewer tsc＋physics／actuation／collect（contact 8/8）／pour（裝 6 倒 6）／sweep（掃 7 收 7）gate 綠；袋子 collect_test、粉罐／噴瓶 pour_test 回歸綠。
     playground typecheck／scene-test 35／parkour-test／training-test 13 綠。部署 200。瀏覽器第六步：（Task 6 結果）。
notes:
  - 探針結論見 spec §2：單顆永不進、前 3 顆靠顆粒鏈互擠；唇高 2.5 mm 對 r 5 mm 需 1.73 mg 推力 > 地面摩擦 0.8 mg；< 2 mm collider 在 Havok 失效。
  - （Task 6 實作期間發現填此處）
```

- [x] **Step 3: next-steps、spec §10、探針**

`docs/next-steps.md`：標題改「2026-09-06 M17 結案後」，狀態行加 M17；候選移除第 1 項，訓練續／第四批／Divine Eye／小修遞補為 1–4；執行提醒加：
`- 接觸收納：內腔含唇前 1 cm 地面區，鏟放在顆粒旁不動也會收；倒出的 clump 不會被同一鏟再收（排除本模型 body）。`
spec 加 `## 10. 実測補記（2026-09-06 結案）`：gate 數字、瀏覽器第六步結果、實作期間偏離（若有）。
Run: `rm viewer/scripts/_m17_probe.ts && git status --short`（應無未追蹤檔）。

- [x] **Step 4: Commit**

```bash
git add ROADMAP.md tasks/0029-scoop-contact-collect.md docs/next-steps.md docs/superpowers/specs/2026-09-06-scoop-contact-collect-design.md docs/superpowers/plans/2026-09-06-scoop-contact-collect.md
git commit -m "M17 結案：ROADMAP、tasks/0029、next-steps、spec §10 実測補記、計畫全勾

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

- [x] **Step 5: 記憶與 handoff**

寫 `~/.claude/projects/<project-slug>/memory/img2babylon-m17-lessons.md`（type project）：探針結論（單顆永不進、互擠、靜力估計、< 2 mm collider 失效）、接觸收納契約要點（排除自身 clump、held 材質自有）、gate 陷阱；`MEMORY.md` 加一行。
`.remember/remember.md`：State M17 結案 commit、Next 等使用者選（next-steps 候選）、Context 新陷阱。
