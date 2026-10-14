# M16 playground 訓練場景 実作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `../playground` 新增 `?scene=training`：玩家操控人偶在 10×10 m 病房走五個站點，依七步流程處理化療潑灑，面板打勾、記錯、評分。

**Architecture:** 重用跑酷段的膠囊控制器與人偶 FK 姿勢當玩家；抓取層加「伸手範圍」；流程檢核是純邏輯狀態機（`flow.ts`）每物理步吃一份快照（`snapshot.ts` 從 Placed／InteractionState／hinge 角組出），回傳事件給 `main.ts` 執行副作用（穿 PPE dispose、袋入桶 dispose）與 UI toast。物件操作按鈕抽成 `actions.ts` 供沙盒與訓練面板共用。

**Tech Stack:** TypeScript strict、Babylon.js 8 + Havok（`PhysicsCharacterController`）、Vite、tsx headless gate（NullEngine＋Havok）。

**Spec:** `docs/superpowers/specs/2026-09-06-playground-training-scene-design.md`

## Global Constraints

- 只改 `../playground`；img-to-babylon viewer／forge／grimoire 不動。
- 首頁預設進 training；`?scene=chemo`（沙盒）、`?scene=parkour` 行為不變；`scene-test` 34 項、`parkour-test` 必須維持綠。
- `src/chemo.ts` 在 Task 0 進版控後**零改動**。
- 抓取半徑 1.2 m；PPE 穿上距離 0.45 m；踏入足跡判定半徑＝足跡 + 0.25；人偶 `physicsScale 17`；膠囊高 1.65／半徑 0.25／strength 30。
- 分數 = `max(0, 100 − 10 × errors.length)`。
- 每個 commit 訊息結尾：
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
  ```
- Bash 的 cwd 每次呼叫重設回 img-to-babylon；playground 命令一律 `cd ../playground && …`。dev server 用 `run_in_background`。
- 部署：**已改由 `../player-garden/scripts/serve.sh` 統包**（playground 以 `--base=/playground/` build 到 `dist-sub/`），
  網址 https://<internal-host>/playground/ ；playground 自己的 `scripts/serve.sh` 與 `com.example.playground` 已退役，**不要再跑 `npm run serve`**。

---

### Task 0: 前置——驗證並整批提交另一 session 的未追蹤檔

**Files:**
- Commit（不改內容）：`src/chemo.ts`、`src/parkour/*`、`public/parkour/*`、`scripts/generate_parkour.py`、`scripts/prepare_parkour.py`、`scripts/parkour_test.ts`、`docs/**`、`.gitignore`、`package.json`、`tsconfig.json`、`README.md`、`src/main.ts`

- [x] **Step 1: 逐檔確認狀態**

Run: `cd ../playground && git status --short`
Expected: 只有上列檔案（M／??）。若多出其他檔，停下回報使用者。

- [x] **Step 2: 三個 gate 全綠**

Run: `cd ../playground && npm run typecheck && npm run scene-test | tail -3 && npm run parkour-test`
Expected: typecheck 無輸出；scene-test 輸出 `"pass": true`；parkour-test 印 `parkour_test PASS: …`。任一失敗停下回報（不是我的程式，不要修）。

- [x] **Step 3: 提交**

```bash
cd ../playground && git add -A && git status --short | grep -v '^[AM] ' ; git commit -m "$(cat <<'EOF'
playground：收錄另一 session 的人偶跑酷場景（?scene=parkour）、原場景搬至 chemo.ts、player-garden 部署說明

typecheck／scene-test 34／parkour-test 全綠後整批提交，供訓練場景重用膠囊控制器與人偶姿勢。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)" && git status --short | wc -l
```
Expected: 最後印 `0`。

---

### Task 1: `ParkourController` 膠囊選項

**Files:**
- Modify: `../playground/src/parkour/controller.ts`
- Test: `../playground/scripts/parkour_test.ts`（不改，預設值不變須仍綠）

**Interfaces:**
- Produces: `new ParkourController(scene, spawn, opts?: ControllerOptions)`，`ControllerOptions = { capsuleHeight?: number; capsuleRadius?: number; strength?: number }`，預設 1.06／0.19／70；`feet` 語意不變（腳底）。

- [x] **Step 1: 改建構子**

把
```ts
  constructor(scene:Scene,spawn:Vector3) {
    this.checkpoint=spawn.clone();
    this.capsule=new PhysicsCharacterController(spawn.add(new Vector3(0,0.53,0)),{capsuleHeight:1.06,capsuleRadius:0.19},scene);
    this.capsule.keepDistance=0.015;this.capsule.keepContactTolerance=0.04;
    this.capsule.characterMass=12;this.capsule.characterStrength=70;
```
改為
```ts
  readonly halfHeight:number;
  constructor(scene:Scene,spawn:Vector3,opts:ControllerOptions={}) {
    const h=opts.capsuleHeight??1.06,r=opts.capsuleRadius??0.19;
    this.halfHeight=h/2;
    this.checkpoint=spawn.clone();
    this.capsule=new PhysicsCharacterController(spawn.add(new Vector3(0,this.halfHeight,0)),{capsuleHeight:h,capsuleRadius:r},scene);
    this.capsule.keepDistance=0.015;this.capsule.keepContactTolerance=0.04;
    this.capsule.characterMass=12;this.capsule.characterStrength=opts.strength??70;
```
並在 `export interface MoveInput` 之後加
```ts
export interface ControllerOptions { capsuleHeight?:number; capsuleRadius?:number; strength?:number }
```
`reset()` 內 `new Vector3(0,0.53,0)` → `new Vector3(0,this.halfHeight,0)`；`tick()` 內 `.y-=0.53` → `.y-=this.halfHeight`。全檔不得再出現 `0.53`。

- [x] **Step 2: 驗證**

Run: `cd ../playground && grep -c "0\.53" src/parkour/controller.ts; npm run typecheck && npm run parkour-test`
Expected: `0`、typecheck 無輸出、`parkour_test PASS`。

- [x] **Step 3: Commit**

```bash
cd ../playground && git add src/parkour/controller.ts && git commit -m "$(cat <<'EOF'
playground M16：ParkourController 膠囊尺寸／推力改建構子選項（預設不變，訓練場景用 1.65／0.25／30）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

---

### Task 2: `hinge.ts` 共用 hinge 角＋`InteractionState.spill`

**Files:**
- Create: `../playground/src/hinge.ts`
- Modify: `../playground/scripts/scene_test.ts`（刪本地 `relRot`／`hingeAngle`，改 import）
- Modify: `../playground/src/interactions.ts`

**Interfaces:**
- Produces: `relRot(a, b): Matrix`、`hingeAngle(a, b, bind): number`、`class HingeReader { constructor(a: PhysicsBody, b: PhysicsBody); angle(): number }`；
  `InteractionState.spill: { center: Vector3; radius: number } | null`。

- [x] **Step 1: 建 `src/hinge.ts`**

```ts
// 單軸 hinge 角讀取：以綁定時的相對旋轉為零點，取 x 軸分量（scene_test 同款，抽出供訓練快照用）。
import { Matrix, PhysicsBody } from "@babylonjs/core";

export function relRot(a: PhysicsBody, b: PhysicsBody): Matrix {
  a.transformNode.computeWorldMatrix(true); b.transformNode.computeWorldMatrix(true);
  return b.transformNode.getWorldMatrix().getRotationMatrix().multiply(Matrix.Invert(a.transformNode.getWorldMatrix().getRotationMatrix()));
}

export function hingeAngle(a: PhysicsBody, b: PhysicsBody, bind: Matrix): number {
  const m = Matrix.Invert(bind).multiply(relRot(a, b)).m;
  return Math.atan2(m[6], m[5]);
}

/** 建構時記住綁定姿勢（要在模型 spawn 後、物理尚未讓 hinge 偏離時建）。 */
export class HingeReader {
  private readonly bind: Matrix;
  constructor(private readonly a: PhysicsBody, private readonly b: PhysicsBody) { this.bind = relRot(a, b); }
  angle(): number { return this.a.isDisposed || this.b.isDisposed ? 0 : hingeAngle(this.a, this.b, this.bind); }
}
```

- [x] **Step 2: scene_test 改用**

刪掉 `scripts/scene_test.ts` 內 `function relRot…` 與 `function hingeAngle…` 兩個定義（含註解），在 import 區加
`import { hingeAngle, relRot } from "../src/hinge";`。`Matrix` 若不再使用則從 `@babylonjs/core` import 移除（typecheck 會告知）。

- [x] **Step 3: interactions.ts 加 getter**

在 `installInteractions` 回傳物件內、`get puddle()` 旁加：
```ts
    get spill() {
      if (!puddle || puddle.isDisposed() || wiped) return null;
      return { center: puddle.absolutePosition.clone(), radius: puddle.getBoundingInfo().boundingBox.extendSize.x * maxScale };
    },
```
`InteractionState` 介面加 `readonly spill: { center: Vector3; radius: number } | null;`（註解：原始足跡，擦拭後為 null）。

- [x] **Step 4: 驗證**

Run: `cd ../playground && npm run typecheck && npm run scene-test | grep -c '"ok": true'`
Expected: `34`。

- [x] **Step 5: Commit**

```bash
cd ../playground && git add src/hinge.ts src/interactions.ts scripts/scene_test.ts && git commit -m "$(cat <<'EOF'
playground M16：hinge.ts 共用 hinge 角讀取（scene_test 改 import）；InteractionState.spill 曝光足跡中心／半徑（擦拭後 null）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

---

### Task 3: `grab.ts` 伸手範圍（GrabOptions）＋ training_test 骨架

**Files:**
- Modify: `../playground/src/grab.ts`
- Create: `../playground/scripts/training_test.ts`
- Modify: `../playground/package.json`（加 script）

**Interfaces:**
- Produces: `withinReach(point, origin, radius): boolean`、`clampToReach(point, origin, radius): Vector3`（純函式，水平距離）；
  `installGrab(scene, camera, canvas, placed, opts: GrabOptions = {})`，`GrabOptions = { reach?: () => { origin: Vector3; radius: number }; onReject?: (reason: "too-far") => void; onBegin?: (body: PhysicsBody, placed: Placed | undefined) => void }`。
- training_test 骨架：`Check`／`push`／`step`，最後印 `{ checks, pass }` JSON，exit code 0/1。

- [x] **Step 1: 寫失敗測試（骨架＋train:reach）**

`scripts/training_test.ts`：
```ts
// playground 訓練場景 headless gate：伸手範圍、流程狀態機、佈局、人偶 ×17、黃金路徑。
// 用法: node --import tsx scripts/training_test.ts
import { Vector3 } from "@babylonjs/core";
import { withinReach, clampToReach } from "../src/grab";

interface Check { id: string; ok: boolean; detail: string }
const checks: Check[] = [];
const push = (id: string, ok: boolean, detail: string): void => { checks.push({ id, ok, detail }); };

async function main(): Promise<number> {
  // 伸手範圍：水平距離判定，y 不算
  const origin = new Vector3(0, 0, -4.5);
  const far = new Vector3(3.5, 0.1, -3), near = new Vector3(0.9, 0.1, -3.9), high = new Vector3(0.5, 2.0, -4.5);
  const clamped = clampToReach(far, origin, 1.2);
  push("train:reach", !withinReach(far, origin, 1.2) && withinReach(near, origin, 1.2) && withinReach(high, origin, 1.2)
    && Math.abs(Math.hypot(clamped.x - origin.x, clamped.z - origin.z) - 1.2) < 1e-6 && clamped.y === far.y,
    `遠 ${withinReach(far, origin, 1.2)}、近 ${withinReach(near, origin, 1.2)}、高 ${withinReach(high, origin, 1.2)}、夾後距 ${Math.hypot(clamped.x - origin.x, clamped.z - origin.z).toFixed(3)}`);

  const pass = checks.every((c) => c.ok);
  console.log(JSON.stringify({ checks, pass }, null, 2));
  return pass ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(2); });
```
package.json scripts 加 `"training-test": "node --import tsx scripts/training_test.ts"`（放在 `parkour-test` 之後）。

- [x] **Step 2: 確認失敗**

Run: `cd ../playground && npm run training-test`
Expected: exit 2，錯誤含 `withinReach` 不存在（`does not provide an export named`）。

- [x] **Step 3: 實作 grab.ts**

在 `export const AIM_PITCH` 之後加：
```ts
export interface GrabOptions {
  /** 每次呼叫取最新伸手原點（玩家腳底）與半徑；不給＝無限制（沙盒）。 */
  reach?: () => { origin: Vector3; radius: number };
  onReject?: (reason: "too-far") => void;
  onBegin?: (body: PhysicsBody, placed: Placed | undefined) => void;
}

/** 水平距離是否在半徑內（y 不算：手可以伸高）。 */
export function withinReach(point: Vector3, origin: Vector3, radius: number): boolean {
  const dx = point.x - origin.x, dz = point.z - origin.z;
  return dx * dx + dz * dz <= radius * radius;
}

/** 把目標點夾進以 origin 為中心的水平圓，y 保留。 */
export function clampToReach(point: Vector3, origin: Vector3, radius: number): Vector3 {
  const dx = point.x - origin.x, dz = point.z - origin.z, d = Math.hypot(dx, dz);
  if (d <= radius) return point;
  const k = radius / d;
  return new Vector3(origin.x + dx * k, point.y, origin.z + dz * k);
}
```
`installGrab` 簽名改 `(scene, camera, canvas, placed: () => Placed[], opts: GrabOptions = {})`；POINTERDOWN 分支改為：
```ts
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m.isPickable && m.isVisible);
      const body = pick?.pickedMesh ? bodyOf(pick.pickedMesh, placed()) : null;
      if (!body || !pick?.pickedPoint) return;
      const reach = opts.reach?.();
      if (reach && !withinReach(pick.pickedPoint, reach.origin, reach.radius)) { opts.onReject?.("too-far"); return; }
      ctl.begin(body, pick.pickedPoint);
      aimNozzle(ctl, placed(), body);
      opts.onBegin?.(body, placed().find((q) => Object.values(q.model.bodies).includes(body)));
      camera.detachControl();
```
POINTERMOVE 分支改為：
```ts
      let p = project((info.event as PointerEvent).shiftKey);
      const reach = opts.reach?.();
      if (p && reach) p = clampToReach(p, reach.origin, reach.radius);
      if (p) ctl.moveTo(p);
```

- [x] **Step 4: 驗證**

Run: `cd ../playground && npm run typecheck && npm run training-test | grep -c '"ok": true' && npm run scene-test | grep -c '"ok": true'`
Expected: `1`、`34`。

- [x] **Step 5: Commit**

```bash
cd ../playground && git add src/grab.ts scripts/training_test.ts package.json && git commit -m "$(cat <<'EOF'
playground M16：grab.ts GrabOptions（reach 伸手範圍：超距拒抓、拖曳夾進半徑；onBegin／onReject）；training_test 骨架 train:reach

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

---

### Task 4: `actions.ts` 抽出物件操作按鈕

**Files:**
- Create: `../playground/src/actions.ts`
- Modify: `../playground/src/ui.ts`

**Interfaces:**
- Produces: `act(model, id): Actuator | undefined`、`interface ButtonSpec { label: string; run(): void }`、`modelButtons(p: Placed, inter: InteractionState): ButtonSpec[]`
  （只含 servo／collect 類：打開／關閉、踩踏板／放開、展開／收合、開蓋／關蓋、攤開／摺起、噴灑、封袋）。

- [x] **Step 1: 建 `src/actions.ts`**

```ts
// 物件操作按鈕（servo／collect 類），沙盒面板與訓練面板共用。摔落／破裂／推倒／拋起／歸位等沙盒專用留在 ui.ts。
import type { Actuator } from "img2babylon-viewer/types";
import type { Placed } from "./scene";
import type { InteractionState } from "./interactions";

export interface ButtonSpec { label: string; run(): void }

export function act(model: Placed["model"], id: string): Actuator | undefined {
  return model.actuators?.find((a) => a.id === id);
}

export function modelButtons(p: Placed, inter: InteractionState): ButtonSpec[] {
  const out: ButtonSpec[] = [];
  const add = (label: string, run: () => void): void => { out.push({ label, run }); };
  // 每次點擊都讀 p.model（歸位後會換成新模型）
  switch (p.entry.model) {
    case "chemo-spill-kit":
      add("打開", () => act(p.model, "servo:lid.x")?.set(1.6));
      add("關閉", () => act(p.model, "servo:lid.x")?.set(0));
      break;
    case "cytotoxic-waste-bin":
      add("踩踏板", () => { act(p.model, "servo:pedal.x")?.set(-0.3); act(p.model, "servo:lid.x")?.set(1.5); });
      add("放開", () => { act(p.model, "servo:pedal.x")?.set(0); act(p.model, "servo:lid.x")?.set(0); });
      break;
    case "spill-warning-sign":
      add("展開", () => act(p.model, "servo:panel-back.x")?.set(0));
      add("收合", () => act(p.model, "servo:panel-back.x")?.set(0.56));
      break;
    case "absorbent-powder-shaker":
      add("開蓋", () => act(p.model, "servo:cap.x")?.set(1.6));
      add("關蓋", () => act(p.model, "servo:cap.x")?.set(0));
      break;
    case "absorbent-pad":
      add("攤開", () => act(p.model, "servo:half-b.x")?.set(3.1));
      add("摺起", () => act(p.model, "servo:half-b.x")?.set(0));
      break;
    case "disinfectant-spray":
      add("噴灑", () => {
        act(p.model, "servo:trigger.x")?.set(0.45);
        setTimeout(() => act(p.model, "servo:trigger.x")?.set(0), 1000);
      });
      break;
    case "cytotoxic-waste-bag":
      add("封袋", () => { inter.sealClumps(() => act(p.model, "collect:bag")?.set(1)); });
      break;
  }
  return out;
}
```

- [x] **Step 2: ui.ts 改用**

- 刪 ui.ts 內的 `function act(...)`，改 `import { act, modelButtons } from "./actions";`。
- 卡片按鈕區：把 `if (p.entry.model === "chemo-spill-kit") {…}` 到 `if (p.entry.model === "cytotoxic-waste-bag") {…}` 那一整串改為：
```ts
    for (const s of modelButtons(p, inter)) btn(s.label, s.run);
    if (p.entry.model === "chemo-iv-bag") {
      btn("摔落", () => dropFrom(scene, p, 1.5));
      btn("破裂", () => act(p.model, "rupture:bag")?.set(1));
    }
    if (p.entry.model === "absorbent-powder-shaker") {
      btn("傾倒", () => { act(p.model, "servo:cap.x")?.set(1.9); setTimeout(() => topple(camera, p), 400); });
    }
```
其後的 推倒／拋起／歸位 三行不動。

- [x] **Step 3: 驗證**

Run: `cd ../playground && npm run typecheck && npm run scene-test | grep -c '"ok": true'`
Expected: `34`。再起 dev server（`run_in_background`：`cd ../playground && npm run dev -- --port 5175 --strictPort`），playwright 開 `http://localhost:5175/?scene=chemo`，snapshot 確認粉罐卡片按鈕順序「開蓋 關蓋 傾倒 推倒 拋起 歸位」、點滴袋「摔落 破裂 拋起 歸位」。

- [x] **Step 4: Commit**

```bash
cd ../playground && git add src/actions.ts src/ui.ts && git commit -m "$(cat <<'EOF'
playground M16：actions.ts 抽出 servo／collect 操作按鈕（modelButtons），沙盒 ui.ts 改用、輸出不變

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

---

### Task 5: `training/flow.ts` 流程狀態機（純邏輯）＋六項測試

**Files:**
- Create: `../playground/src/training/flow.ts`
- Modify: `../playground/scripts/training_test.ts`

**Interfaces:**
- Produces（供 Task 8／9）：
  ```ts
  export type PpeItem = "gown" | "goggles" | "gloves";
  export type StepId = "sign" | "ppe" | "kit" | "absorb" | "disinfect-wipe" | "dispose" | "doff";
  export type ErrorId = "no-ppe-contact" | "stepped-in-spill" | "no-sign" | "gloves-not-last" | "wipe-before-disinfect" | "unsealed-dispose";
  export type FlowEvent = { kind: "step"; id: StepId } | { kind: "error"; id: ErrorId } | { kind: "wear"; item: PpeItem; bodyKey: string } | { kind: "dispose-bag" };
  export interface FlowSnapshot { player: Vector3; spillSite: Vector3; spill: { center: Vector3; radius: number } | null; signPos: Vector3 | null; signAngle: number;
    kitLidAngle: number; puddle: { remaining: number; disinfected: number; wiped: boolean } | null; sealedClumps: number; binLidAngle: number; binTop: Vector3;
    bagPos: Vector3 | null; grabbed: { model: string; bodyKey: string; position: Vector3 } | null; dt: number }
  export interface FlowState { readonly started; readonly finished; readonly elapsed; readonly steps: Record<StepId, boolean>; readonly errors: { id: ErrorId; at: number }[];
    readonly worn: ReadonlySet<PpeItem>; readonly score: number; start(): void; doff(): boolean; reset(): void; tick(s: FlowSnapshot): FlowEvent[] }
  export function createFlow(): FlowState;
  export const STEP_ORDER: StepId[]; export const STEP_LABELS: Record<StepId, string>; export const ERROR_LABELS: Record<ErrorId, string>;
  export const CONTAMINATED_MODELS: ReadonlySet<string>; export function ppeItemOf(bodyKey: string): PpeItem | undefined;
  export const REACH = 1.2, WEAR_DIST = 0.45, STEP_IN_PAD = 0.25, SIGN_DIST = 1.5, BIN_MOUTH_R = 0.15;
  ```

- [x] **Step 1: 寫失敗測試**

training_test.ts 加 import `import { createFlow, type FlowSnapshot } from "../src/training/flow";`，在 `train:reach` 之後加：
```ts
  // 流程狀態機：純邏輯，用手工快照
  const base = (over: Partial<FlowSnapshot> = {}): FlowSnapshot => ({
    player: new Vector3(0, 0, -1.2), spillSite: new Vector3(0, 0, 0), spill: null, signPos: null, signAngle: 0,
    kitLidAngle: 0, puddle: null, sealedClumps: 0, binLidAngle: 0, binTop: new Vector3(4, 0.45, 3), bagPos: null, grabbed: null, dt: 1 / 60, ...over,
  });
  const grabPpe = (bodyKey: string): FlowSnapshot["grabbed"] => ({ model: "ppe-set", bodyKey, position: new Vector3(0.2, 0.9, -1.2) });
  {
    const f = createFlow(); f.start();
    const ev = [f.tick(base({ grabbed: grabPpe("gown-pack") })), f.tick(base({ grabbed: grabPpe("goggles") })), f.tick(base({ grabbed: grabPpe("glove-box") }))].flat();
    const wears = ev.filter((e) => e.kind === "wear").map((e) => (e as { item: string }).item).join(",");
    push("train:wear", wears === "gown,goggles,gloves" && f.steps.ppe && f.errors.length === 0 && f.worn.size === 3,
      `穿 ${wears}、ppe 步 ${f.steps.ppe}、錯 ${f.errors.length}`);
  }
  {
    const f = createFlow(); f.start();
    f.tick(base({ grabbed: grabPpe("glove") })); f.tick(base({ grabbed: grabPpe("gown-pack") })); f.tick(base({ grabbed: grabPpe("goggles") }));
    push("train:gloves-first", f.steps.ppe && f.errors.map((e) => e.id).join() === "gloves-not-last" && f.score === 90,
      `錯 ${f.errors.map((e) => e.id).join()}、分 ${f.score}`);
  }
  {
    const f = createFlow(); f.start();
    for (let i = 0; i < 60; i++) f.tick(base({ grabbed: { model: "absorbent-powder-shaker", bodyKey: "bottle", position: new Vector3(3, 0.1, -2.4) } }));
    push("train:no-ppe-contact", f.errors.length === 1 && f.errors[0].id === "no-ppe-contact", `錯 ${f.errors.map((e) => e.id).join()}`);
  }
  {
    const f = createFlow(); f.start();
    const spill = { center: new Vector3(0, 0, 0), radius: 0.3 };
    const at = (z: number): FlowSnapshot => base({ spill, player: new Vector3(0, 0, z) });
    [-1.2, -0.4, -0.4, -1.2, -0.5, -1.2].forEach((z) => f.tick(at(z)));
    push("train:stepped-in-spill", f.errors.filter((e) => e.id === "stepped-in-spill").length === 2, `踏入次數 ${f.errors.filter((e) => e.id === "stepped-in-spill").length}`);
  }
  {
    const f = createFlow(); f.start();
    f.tick(base({ puddle: { remaining: 1, disinfected: 0.2, wiped: false } }));
    f.tick(base({ puddle: { remaining: 1, disinfected: 0.2, wiped: true } }));
    push("train:wipe-before-disinfect", f.steps["disinfect-wipe"] && f.errors.some((e) => e.id === "wipe-before-disinfect"), `步 ${f.steps["disinfect-wipe"]}、錯 ${f.errors.map((e) => e.id).join()}`);
  }
  {
    const f = createFlow(); f.start();
    const s = base({ binLidAngle: 1.3, bagPos: new Vector3(4.05, 0.5, 3.0), sealedClumps: 0 });
    const ev1 = f.tick(s);
    const ev2 = f.tick({ ...s, sealedClumps: 3 });
    const ok = !ev1.some((e) => e.kind === "dispose-bag") && f.errors.some((e) => e.id === "unsealed-dispose") && ev2.some((e) => e.kind === "dispose-bag") && f.steps.dispose;
    push("train:unsealed-dispose", ok, `未封袋事件 ${ev1.map((e) => e.kind).join()}、封後 ${ev2.map((e) => e.kind).join()}、dispose 步 ${f.steps.dispose}`);
    push("train:doff-gate", !f.finished && f.doff() && f.finished && f.steps.doff, `finished ${f.finished}`);
  }
```

- [x] **Step 2: 確認失敗**

Run: `cd ../playground && npm run training-test`
Expected: exit 2，`Cannot find module '../src/training/flow'`。

- [x] **Step 3: 實作 `src/training/flow.ts`**

```ts
// 訓練流程狀態機：純邏輯、每物理步吃一份快照、回傳事件。不碰 Babylon body（副作用交給 main.ts）。
import { Vector3 } from "@babylonjs/core";

export type PpeItem = "gown" | "goggles" | "gloves";
export type StepId = "sign" | "ppe" | "kit" | "absorb" | "disinfect-wipe" | "dispose" | "doff";
export type ErrorId = "no-ppe-contact" | "stepped-in-spill" | "no-sign" | "gloves-not-last" | "wipe-before-disinfect" | "unsealed-dispose";
export type FlowEvent =
  | { kind: "step"; id: StepId }
  | { kind: "error"; id: ErrorId }
  | { kind: "wear"; item: PpeItem; bodyKey: string }
  | { kind: "dispose-bag" };

export interface FlowSnapshot {
  player: Vector3;                                    // 玩家腳底
  spillSite: Vector3;                                 // 潑灑點（固定）
  spill: { center: Vector3; radius: number } | null;  // 現存污染足跡（擦拭後 null）
  signPos: Vector3 | null; signAngle: number;         // 立牌位置、panel-back hinge 角（0＝展開）
  kitLidAngle: number;
  puddle: { remaining: number; disinfected: number; wiped: boolean } | null;
  sealedClumps: number;
  binLidAngle: number; binTop: Vector3;               // 桶蓋角、桶口中心（rim 高）
  bagPos: Vector3 | null;                             // 廢棄物袋 body 位置（已 dispose 則 null）
  grabbed: { model: string; bodyKey: string; position: Vector3 } | null;
  dt: number;
}

export interface FlowState {
  readonly started: boolean; readonly finished: boolean; readonly elapsed: number;
  readonly steps: Record<StepId, boolean>;
  readonly errors: { id: ErrorId; at: number }[];
  readonly worn: ReadonlySet<PpeItem>;
  readonly score: number;
  start(): void;
  /** 前提：dispose 步已完成；成功回 true 並 finished。 */
  doff(): boolean;
  reset(): void;
  tick(s: FlowSnapshot): FlowEvent[];
}

export const REACH = 1.2, WEAR_DIST = 0.45, STEP_IN_PAD = 0.25, SIGN_DIST = 1.5, BIN_MOUTH_R = 0.15;
const ABSORB_DONE = 0.6, DISINFECT_MIN = 0.5, SIGN_OPEN = 0.15, KIT_OPEN = 1.2, BIN_OPEN = 1.0;

export const STEP_ORDER: StepId[] = ["sign", "ppe", "kit", "absorb", "disinfect-wipe", "dispose", "doff"];
export const STEP_LABELS: Record<StepId, string> = {
  sign: "隔離現場：把警示立牌搬到潑灑點旁", ppe: "穿戴防護裝備（隔離衣、護目鏡，最後手套）", kit: "打開潑灑處理包",
  absorb: "撒吸附粉吸收水漬", "disinfect-wipe": "噴消毒劑後用吸附墊擦乾", dispose: "凝固顆粒鏟入廢棄物袋、封袋、投入廢棄物桶", doff: "脫除防護裝備",
};
export const ERROR_LABELS: Record<ErrorId, string> = {
  "no-ppe-contact": "未穿齊防護裝備就接觸潑灑物件", "stepped-in-spill": "未穿齊防護裝備踏入污染區", "no-sign": "未先擺放警示立牌就開始清理",
  "gloves-not-last": "手套應最後穿", "wipe-before-disinfect": "未充分消毒就擦拭", "unsealed-dispose": "廢棄物袋未封袋就投入桶",
};
export const CONTAMINATED_MODELS: ReadonlySet<string> = new Set([
  "chemo-iv-bag", "absorbent-powder-shaker", "absorbent-pad", "scoop-and-scraper", "disinfectant-spray", "cytotoxic-waste-bag",
]);
const PPE_BODY_ITEM: Record<string, PpeItem> = { "gown-pack": "gown", goggles: "goggles", "glove-box": "gloves", glove: "gloves" };
export function ppeItemOf(bodyKey: string): PpeItem | undefined { return PPE_BODY_ITEM[bodyKey]; }

function distXZ(a: Vector3, b: Vector3): number { return Math.hypot(a.x - b.x, a.z - b.z); }

export function createFlow(): FlowState {
  let started = false, finished = false, elapsed = 0;
  let steps: Record<StepId, boolean>;
  let errors: { id: ErrorId; at: number }[];
  let worn: Set<PpeItem>;
  let once: Set<ErrorId>;
  let wasInside = false, maxDisinfected = 0;

  const init = (): void => {
    started = false; finished = false; elapsed = 0;
    steps = { sign: false, ppe: false, kit: false, absorb: false, "disinfect-wipe": false, dispose: false, doff: false };
    errors = []; worn = new Set(); once = new Set(); wasInside = false; maxDisinfected = 0;
  };
  init();

  const err = (ev: FlowEvent[], id: ErrorId, repeat = false): void => {
    if (!repeat) { if (once.has(id)) return; once.add(id); }
    errors.push({ id, at: elapsed }); ev.push({ kind: "error", id });
  };
  const done = (ev: FlowEvent[], id: StepId): void => {
    if (steps[id]) return;
    steps[id] = true; ev.push({ kind: "step", id });
  };

  return {
    get started() { return started; }, get finished() { return finished; }, get elapsed() { return elapsed; },
    get steps() { return steps; }, get errors() { return errors; }, get worn() { return worn; },
    get score() { return Math.max(0, 100 - 10 * errors.length); },
    start(): void { if (!started) started = true; },
    reset(): void { init(); },
    doff(): boolean {
      if (!started || finished || !steps.dispose) return false;
      steps.doff = true; finished = true; return true;
    },
    tick(s: FlowSnapshot): FlowEvent[] {
      const ev: FlowEvent[] = [];
      if (!started || finished) return ev;
      elapsed += s.dt;

      // 穿 PPE：被抓的 PPE 件拿到玩家身旁
      if (s.grabbed?.model === "ppe-set") {
        const item = ppeItemOf(s.grabbed.bodyKey);
        if (item && !worn.has(item) && distXZ(s.grabbed.position, s.player) <= WEAR_DIST) {
          if (item === "gloves" && !(worn.has("gown") && worn.has("goggles"))) err(ev, "gloves-not-last");
          worn.add(item); ev.push({ kind: "wear", item, bodyKey: s.grabbed.bodyKey });
          if (worn.size === 3) done(ev, "ppe");
        }
      }
      const protectedNow = worn.size === 3;

      // 未穿齊就接觸潑灑物件
      if (!protectedNow && s.grabbed && CONTAMINATED_MODELS.has(s.grabbed.model)) err(ev, "no-ppe-contact");

      // 踏入污染區（每次進入記一次）
      const inside = !!s.spill && !protectedNow && distXZ(s.player, s.spill.center) <= s.spill.radius + STEP_IN_PAD;
      if (inside && !wasInside) err(ev, "stepped-in-spill", true);
      wasInside = inside;

      // 示警：立牌到潑灑點旁且展開
      if (s.signPos && distXZ(s.signPos, s.spillSite) <= SIGN_DIST && Math.abs(s.signAngle) < SIGN_OPEN) done(ev, "sign");
      if (s.kitLidAngle > KIT_OPEN) done(ev, "kit");

      if (s.puddle) {
        if (s.puddle.remaining < 1 && !steps.sign) err(ev, "no-sign");
        if (s.puddle.remaining <= ABSORB_DONE) done(ev, "absorb");
        maxDisinfected = Math.max(maxDisinfected, s.puddle.disinfected);
        if (s.puddle.wiped && !steps["disinfect-wipe"]) {
          if (maxDisinfected < DISINFECT_MIN) err(ev, "wipe-before-disinfect");
          done(ev, "disinfect-wipe"); // 擦掉就沒得再消毒，步驟結束、錯誤已記
        }
      }

      // 入桶：袋進桶口柱且蓋開
      if (s.bagPos && !steps.dispose && s.binLidAngle > BIN_OPEN && distXZ(s.bagPos, s.binTop) <= BIN_MOUTH_R && s.bagPos.y >= s.binTop.y) {
        if (s.sealedClumps > 0) { done(ev, "dispose"); ev.push({ kind: "dispose-bag" }); }
        else err(ev, "unsealed-dispose");
      }
      return ev;
    },
  };
}
```

- [x] **Step 4: 驗證**

Run: `cd ../playground && npm run typecheck && npm run training-test | grep -c '"ok": true'`
Expected: `8`（reach＋wear＋gloves-first＋no-ppe-contact＋stepped-in-spill＋wipe-before-disinfect＋unsealed-dispose＋doff-gate）。若哪項 false，讀 detail 修 flow.ts，不改測試期望。

- [x] **Step 5: Commit**

```bash
cd ../playground && git add src/training/flow.ts scripts/training_test.ts && git commit -m "$(cat <<'EOF'
playground M16：training/flow.ts 流程狀態機（七步完成條件、六種記錯、PPE 穿戴順序、入桶事件、評分）；training_test +7 → 8 項

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

---

### Task 6: `training/world.ts` 房間與五站佈局＋佈局／掛袋測試

**Files:**
- Create: `../playground/src/training/world.ts`
- Modify: `../playground/scripts/training_test.ts`

**Interfaces:**
- Produces: `ROOM_SIZE = 10`、`SPILL_SITE: Vector3`、`PLAYER_SPAWN: Vector3`、`BAG_HANG_Y = 1.4`、`TRAINING_SCENE: SceneEntry[]`、
  `createRoom(scene): void`（地板＋四牆＋點滴架＋PPE 桌，全 STATIC，`isPickable=false`）、`holdBag(placed): void`、`releaseBag(placed): void`、
  `findPlaced(placed, model): Placed | undefined`。

- [x] **Step 1: 寫失敗測試**

training_test.ts 加 import：
```ts
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Quaternion } from "@babylonjs/core";
import { createHeadlessScene } from "img2babylon-viewer";
import { spawnAll } from "../src/scene";
import { installInteractions } from "../src/interactions";
import { BAG_HANG_Y, createRoom, findPlaced, holdBag, releaseBag, TRAINING_SCENE } from "../src/training/world";
```
在 `train:doff-gate` 之後、`const pass` 之前加：
```ts
  // 真物理：房間＋佈局
  const ctx = await createHeadlessScene();
  const { scene, step } = ctx;
  createRoom(scene);
  const placed = await spawnAll(scene, TRAINING_SCENE);
  holdBag(placed);
  const inter = installInteractions(scene, () => placed);
  step(300);
  {
    const bag = findPlaced(placed, "chemo-iv-bag")!;
    const bagY = bag.model.bodies.bag.transformNode.absolutePosition.y;
    const ppe = findPlaced(placed, "ppe-set")!;
    const ppeYs = Object.values(ppe.model.bodies).map((b) => b.transformNode.absolutePosition.y);
    const bad: string[] = [];
    for (const p of placed) {
      if (p.entry.model === "chemo-iv-bag") continue;
      for (const [k, b] of Object.entries(p.model.bodies)) {
        const pos = b.transformNode.absolutePosition;
        if (b.getLinearVelocity().length() >= 0.05 || pos.y < -0.01 || Math.abs(pos.x) > 5 || Math.abs(pos.z) > 5) bad.push(`${p.entry.model}.${k}`);
      }
    }
    const st = (m: string): Vector3 => Vector3.FromArray(findPlaced(placed, m)!.entry.position);
    const pairs: [string, string][] = [["spill-warning-sign", "ppe-set"], ["ppe-set", "chemo-spill-kit"], ["chemo-spill-kit", "cytotoxic-waste-bin"], ["spill-warning-sign", "cytotoxic-waste-bin"]];
    const minPair = Math.min(...pairs.map(([a, b]) => Math.hypot(st(a).x - st(b).x, st(a).z - st(b).z)));
    push("train:layout", bad.length === 0 && Math.abs(bagY - BAG_HANG_Y) < 0.05 && ppeYs.every((y) => y > 0.74) && minPair >= 2.5,
      `未靜止／出界 ${bad.join(",") || "無"}、袋高 ${bagY.toFixed(3)}、PPE 桌面 ${ppeYs.map((y) => y.toFixed(2)).join("/")}、站距 ≥ ${minPair.toFixed(2)}`);

    releaseBag(placed);
    step(150);
    const landedY = bag.model.bodies.bag.transformNode.absolutePosition.y;
    bag.model.actuators?.find((a) => a.id === "rupture:bag")?.set(1);
    step(120);
    const sp = inter.spill;
    push("train:bag-drop", landedY < 0.06 && !!sp && sp.radius >= 0.2 && Math.hypot(sp.center.x, sp.center.z) < 0.3,
      `落地 y ${landedY.toFixed(3)}、足跡 ${sp ? `r ${sp.radius.toFixed(3)} @ (${sp.center.x.toFixed(2)}, ${sp.center.z.toFixed(2)})` : "無"}`);
  }
```
並把結尾改成先 `ctx.dispose();` 再算 `pass`。

- [x] **Step 2: 確認失敗**

Run: `cd ../playground && npm run training-test`
Expected: exit 2，`Cannot find module '../src/training/world'`。

- [x] **Step 3: 實作 `src/training/world.ts`**

```ts
// 訓練場景：10×10 m 病房、五站佈局、點滴架、PPE 桌。靜物全部 STATIC、isPickable=false（抓取只認模型 body）。
import {
  Color3, DynamicTexture, Mesh, MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeCylinder, Quaternion, Scene,
  StandardMaterial, Texture, Vector3,
} from "@babylonjs/core";
import type { Placed, SceneEntry } from "../scene";

export const ROOM_SIZE = 10, WALL_H = 0.8, WALL_T = 0.1;
export const SPILL_SITE = new Vector3(0, 0, 0);
export const PLAYER_SPAWN = new Vector3(0, 0, -4.5);
export const BAG_HANG_Y = 1.4;
export const TABLE_CENTER = new Vector3(-4, 0.375, -3), TABLE_SIZE = new Vector3(1.0, 0.75, 0.6);

/** 五站：潑灑點 (0,0)、A 立牌 (−3.5,3)、B 防護 (−4,−3) 桌上、C 處理包 (3.5,−3) 四工具環繞、D 廢棄物 (4,3)。 */
export const TRAINING_SCENE: SceneEntry[] = [
  { model: "chemo-iv-bag", label: "化療點滴袋", position: [0, BAG_HANG_Y, 0], rotationY: 0 },
  { model: "spill-warning-sign", label: "警示立牌", position: [-3.5, 0, 3], rotationY: 0 },
  { model: "ppe-set", label: "防護裝備組", position: [-4, 0.76, -3], rotationY: 0 },
  { model: "chemo-spill-kit", label: "化療潑灑處理包", position: [3.5, 0, -3], rotationY: 0 },
  { model: "absorbent-powder-shaker", label: "吸附粉罐", position: [3.0, 0, -2.4], rotationY: 0 },
  { model: "absorbent-pad", label: "吸附墊", position: [4.0, 0, -2.4], rotationY: 0 },
  { model: "scoop-and-scraper", label: "鏟刮板", position: [3.0, 0, -3.6], rotationY: 0 },
  { model: "disinfectant-spray", label: "消毒劑噴瓶", position: [4.0, 0, -3.6], rotationY: 0 },
  { model: "cytotoxic-waste-bin", label: "細胞毒性廢棄物桶", position: [4.0, 0, 3.0], rotationY: -0.5 },
  { model: "cytotoxic-waste-bag", label: "廢棄物袋", position: [3.4, 0, 3.0], rotationY: 0 },
];

export function findPlaced(placed: Placed[], model: string): Placed | undefined {
  return placed.find((p) => p.entry.model === model);
}

function staticBox(scene: Scene, name: string, center: Vector3, size: Vector3, mat: StandardMaterial, friction = 0.7): Mesh {
  const m = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
  m.position.copyFrom(center); m.material = mat; m.isPickable = false;
  const body = new PhysicsBody(m, PhysicsMotionType.STATIC, false, scene);
  const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), size, scene);
  shape.material = { friction, restitution: 0.2 }; body.shape = shape;
  return m;
}

/** 地磚：1 m 粗格＋10 cm 細格（DynamicTexture 預設 CLAMP，uScale>1 一定要改 WRAP）。 */
function floorMaterial(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial("t-floor-mat", scene);
  const N = 1024;
  const tex = new DynamicTexture("t-floor-tex", { width: N, height: N }, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#dfe4e2"; c.fillRect(0, 0, N, N);
  c.strokeStyle = "#a3adab"; c.lineWidth = 3;
  for (let i = 1; i < 10; i++) {
    const p = (i * N) / 10;
    c.beginPath(); c.moveTo(p, 0); c.lineTo(p, N); c.stroke();
    c.beginPath(); c.moveTo(0, p); c.lineTo(N, p); c.stroke();
  }
  c.strokeStyle = "#4f5a58"; c.lineWidth = 14; c.strokeRect(0, 0, N, N);
  tex.update(false); tex.uScale = ROOM_SIZE; tex.vScale = ROOM_SIZE;
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; tex.anisotropicFilteringLevel = 16;
  mat.diffuseTexture = tex; mat.specularColor = new Color3(0.05, 0.05, 0.05);
  return mat;
}

export function createRoom(scene: Scene): void {
  const wallMat = new StandardMaterial("t-wall-mat", scene); wallMat.diffuseColor = new Color3(0.82, 0.86, 0.88);
  const steel = new StandardMaterial("t-steel-mat", scene); steel.diffuseColor = new Color3(0.75, 0.77, 0.80);
  const tableMat = new StandardMaterial("t-table-mat", scene); tableMat.diffuseColor = new Color3(0.86, 0.84, 0.78);

  // 地板（DynamicTexture 在 NullEngine 也能建：getContext 是 2D canvas 模擬，headless 只需碰撞）
  const ground = MeshBuilder.CreateGround("t-floor", { width: ROOM_SIZE, height: ROOM_SIZE }, scene);
  ground.material = floorMaterial(scene); ground.isPickable = false;
  const gb = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const gs = new PhysicsShapeBox(new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(ROOM_SIZE, 0.1, ROOM_SIZE), scene);
  gs.material = { friction: 0.7, restitution: 0.2 }; gb.shape = gs;

  // 四面矮牆
  const h = ROOM_SIZE / 2;
  staticBox(scene, "t-wall-n", new Vector3(0, WALL_H / 2, h + WALL_T / 2), new Vector3(ROOM_SIZE + 2 * WALL_T, WALL_H, WALL_T), wallMat);
  staticBox(scene, "t-wall-s", new Vector3(0, WALL_H / 2, -h - WALL_T / 2), new Vector3(ROOM_SIZE + 2 * WALL_T, WALL_H, WALL_T), wallMat);
  staticBox(scene, "t-wall-e", new Vector3(h + WALL_T / 2, WALL_H / 2, 0), new Vector3(WALL_T, WALL_H, ROOM_SIZE), wallMat);
  staticBox(scene, "t-wall-w", new Vector3(-h - WALL_T / 2, WALL_H / 2, 0), new Vector3(WALL_T, WALL_H, ROOM_SIZE), wallMat);

  // 點滴架：立柱在潑灑點旁 +x 0.3、掛臂伸回袋子上方
  const pole = MeshBuilder.CreateCylinder("t-iv-pole", { diameter: 0.04, height: 1.8 }, scene);
  pole.position.set(0.3, 0.9, 0); pole.material = steel; pole.isPickable = false;
  const pb = new PhysicsBody(pole, PhysicsMotionType.STATIC, false, scene);
  pb.shape = new PhysicsShapeCylinder(new Vector3(0, -0.9, 0), new Vector3(0, 0.9, 0), 0.02, scene);
  const base = MeshBuilder.CreateCylinder("t-iv-base", { diameter: 0.5, height: 0.03 }, scene);
  base.position.set(0.3, 0.015, 0); base.material = steel; base.isPickable = false;
  const arm = MeshBuilder.CreateBox("t-iv-arm", { width: 0.34, height: 0.02, depth: 0.02 }, scene);
  arm.position.set(0.13, 1.6, 0); arm.material = steel; arm.isPickable = false;

  // PPE 桌
  staticBox(scene, "t-table", TABLE_CENTER, TABLE_SIZE, tableMat);
}

/** 開始前把點滴袋掛住（STATIC）；setMotionType 往返質量不變（実測 0.55）。 */
export function holdBag(placed: Placed[]): void {
  findPlaced(placed, "chemo-iv-bag")?.model.bodies.bag?.setMotionType(PhysicsMotionType.STATIC);
}
export function releaseBag(placed: Placed[]): void {
  findPlaced(placed, "chemo-iv-bag")?.model.bodies.bag?.setMotionType(PhysicsMotionType.DYNAMIC);
}
```

- [x] **Step 4: 驗證**

Run: `cd ../playground && npm run typecheck && npm run training-test | grep -c '"ok": true'`
Expected: `10`。若 `train:layout` 報某物件出界或未靜止，印該物件座標（不要猜）再調 `TRAINING_SCENE` 的位置。若 DynamicTexture 在 NullEngine 拋錯，`floorMaterial` 包 try／catch 回純色材質。

- [x] **Step 5: Commit**

```bash
cd ../playground && git add src/training/world.ts scripts/training_test.ts && git commit -m "$(cat <<'EOF'
playground M16：training/world.ts 病房 10×10、五站佈局、點滴架、PPE 桌、掛袋（STATIC 往返）；training_test +2 → 10 項

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

---

### Task 7: `training/player.ts` 玩家（膠囊＋人偶 ×17）＋ S=17 測試

**Files:**
- Create: `../playground/src/training/player.ts`
- Modify: `../playground/scripts/training_test.ts`

**Interfaces:**
- Consumes: `ParkourController(scene, spawn, { capsuleHeight, capsuleRadius, strength })`（Task 1）、`FigurePose`／`sampleClip`／`Clip`（`src/parkour/figure.ts`）。
- Produces:
  ```ts
  export const FIGURE_SCALE = 17;
  export interface Player { readonly position: Vector3; readonly chest: Vector3; setKeys(keys: ReadonlySet<string>): void; tick(dt: number, cameraForward: Vector3): void;
    wear(item: PpeItem): void; undressAll(): void; teleport(p: Vector3): void; dispose(): void }
  export function createPlayer(scene: Scene, model: BuiltModel, run: Clip, spawn: Vector3): Player;
  ```

- [x] **Step 1: 寫失敗測試**

training_test.ts 加 import：
```ts
import { readFileSync } from "node:fs";
import { registry } from "img2babylon-viewer/registry";
import { FigurePose, sampleClip, validateClip } from "../src/parkour/figure";
import { createPlayer, FIGURE_SCALE } from "../src/training/player";
```
在 `train:bag-drop` 區塊之後加：
```ts
  // 人偶 ×17：FK 接點誤差與腳底貼地；createPlayer 能建、能傳送、能穿脫
  {
    const factory = (await registry["action-figure"]()).default;
    const fig = factory(scene, { physics: false, physicsScale: FIGURE_SCALE });
    const run = validateClip(JSON.parse(readFileSync(new URL("../public/parkour/run-pose.json", import.meta.url), "utf8")));
    const pose = new FigurePose(fig);
    let maxErr = 0;
    for (let i = 0; i < 60; i++) { pose.apply(sampleClip(run, i / 60, true), 1 / 60, 0.05, 0, true); maxErr = Math.max(maxErr, pose.maxJointError()); }
    const lowBoot = Math.min(...["boot-l", "boot-r"].map((k) => fig.nodes[k].position.y));
    const headY = fig.nodes.head.position.y;
    push("train:s17-figure", maxErr < 1e-6 && lowBoot > -0.05 && lowBoot < 0.12 && headY > 1.2 && headY < 1.8,
      `接點誤差 ${maxErr.toExponential(2)}、最低靴 y ${lowBoot.toFixed(3)}、頭 y ${headY.toFixed(3)}`);
    const player = createPlayer(scene, fig, run, new Vector3(0, 0, -4.5));
    for (let i = 0; i < 60; i++) { player.tick(1 / 60, new Vector3(0, 0, 1)); step(1); }
    const standY = player.position.y;
    player.setKeys(new Set(["KeyW", "ShiftLeft"]));
    for (let i = 0; i < 90; i++) { player.tick(1 / 60, new Vector3(0, 0, 1)); step(1); }
    player.setKeys(new Set());
    const moved = player.position.z + 4.5;
    player.teleport(new Vector3(2, 0, 2));
    for (let i = 0; i < 30; i++) { player.tick(1 / 60, new Vector3(0, 0, 1)); step(1); }
    const tp = player.position;
    const torsoMat0 = fig.meshes.torso.material;
    player.wear("gown"); const gownOn = fig.meshes.torso.material !== torsoMat0;
    player.undressAll(); const gownOff = fig.meshes.torso.material === torsoMat0;
    push("train:player", Math.abs(standY) < 0.12 && moved > 2.5 && moved < 5.3 && Math.hypot(tp.x - 2, tp.z - 2) < 0.1 && gownOn && gownOff,
      `站 y ${standY.toFixed(3)}、跑 1.5 s 位移 ${moved.toFixed(2)}、傳送後 (${tp.x.toFixed(2)}, ${tp.z.toFixed(2)})、換色 ${gownOn}/${gownOff}`);
    player.dispose();
  }
```

- [x] **Step 2: 確認失敗**

Run: `cd ../playground && npm run training-test`
Expected: exit 2，`Cannot find module '../src/training/player'`。

- [x] **Step 3: 實作 `src/training/player.ts`**

```ts
// 訓練玩家：跑酷膠囊控制器（不跳）＋ action-figure ×17 FK 姿勢；PPE 穿脫只換色。
import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import type { Material } from "@babylonjs/core";
import type { BuiltModel } from "img2babylon-viewer/types";
import { ParkourController } from "../parkour/controller";
import { FigurePose, sampleClip, type Clip } from "../parkour/figure";
import type { PpeItem } from "./flow";

export const FIGURE_SCALE = 17;
const CAPSULE_H = 1.65, CAPSULE_R = 0.25, STRENGTH = 30;
const GOWN = new Color3(0.35, 0.55, 0.85), GLOVE = new Color3(0.55, 0.35, 0.75), BAND = new Color3(0.2, 0.2, 0.22);
const GOWN_PARTS = ["torso", "upper-arm-l", "upper-arm-r"], GLOVE_PARTS = ["forearm-l", "forearm-r"];

export interface Player {
  readonly position: Vector3;   // 腳底
  readonly chest: Vector3;      // 腳底 + 1.1 m
  setKeys(keys: ReadonlySet<string>): void;
  tick(dt: number, cameraForward: Vector3): void;
  wear(item: PpeItem): void;
  undressAll(): void;
  teleport(p: Vector3): void;
  dispose(): void;
}

export function createPlayer(scene: Scene, model: BuiltModel, run: Clip, spawn: Vector3): Player {
  const ctl = new ParkourController(scene, spawn, { capsuleHeight: CAPSULE_H, capsuleRadius: CAPSULE_R, strength: STRENGTH });
  const pose = new FigurePose(model);
  let keys: ReadonlySet<string> = new Set();
  let phase = 0;
  const original = new Map<string, Material | null>();
  const gownMat = new StandardMaterial("ppe-gown", scene); gownMat.diffuseColor = GOWN;
  const gloveMat = new StandardMaterial("ppe-glove", scene); gloveMat.diffuseColor = GLOVE;
  let band: Mesh | null = null;

  const recolor = (ids: string[], mat: Material): void => {
    for (const id of ids) {
      const m = model.meshes[id]; if (!m) continue;
      if (!original.has(id)) original.set(id, m.material);
      m.material = mat;
    }
  };
  model.root.position.copyFrom(spawn);

  return {
    get position() { return ctl.feet; },
    get chest() { return ctl.feet.add(new Vector3(0, 1.1, 0)); },
    setKeys(k) { keys = k; },
    tick(dt, cameraForward) {
      const f = new Vector3(cameraForward.x, 0, cameraForward.z);
      if (f.length() < 1e-6) f.set(0, 0, 1); f.normalize();
      const right = new Vector3(f.z, 0, -f.x);
      const dir = f.scale(Number(keys.has("KeyW")) - Number(keys.has("KeyS"))).add(right.scale(Number(keys.has("KeyD")) - Number(keys.has("KeyA"))));
      ctl.setInput({ x: dir.x, z: dir.z, run: keys.has("ShiftLeft") || keys.has("ShiftRight"), jump: false });
      ctl.tick(dt);
      phase += (dt * Math.max(0.15, ctl.speed)) / 1.45;
      let target: Record<string, number> = {};
      if (ctl.speed > 0.08) {
        target = sampleClip(run, phase, true);
        const w = Math.min(1, ctl.speed / 0.8);
        for (const k in target) target[k] *= w;
      }
      pose.apply(target, dt, Math.min(0.14, ctl.speed * 0.035), 0, true);
      model.root.position.copyFrom(ctl.feet); model.root.rotation.y = ctl.yaw;
    },
    wear(item) {
      if (item === "gown") recolor(GOWN_PARTS, gownMat);
      else if (item === "gloves") recolor(GLOVE_PARTS, gloveMat);
      else if (!band) {
        const S = model.physicsScale;
        band = MeshBuilder.CreateBox("ppe-goggles", { width: 0.03 * S, height: 0.006 * S, depth: 0.03 * S }, scene);
        const bm = new StandardMaterial("ppe-goggles-mat", scene); bm.diffuseColor = BAND; band.material = bm; band.isPickable = false;
        band.parent = model.nodes.head; band.position.set(0, 0.004 * S, 0);
      }
    },
    undressAll() {
      for (const [id, mat] of original) { const m = model.meshes[id]; if (m) m.material = mat; }
      original.clear();
      if (band) { band.dispose(); band = null; }
    },
    teleport(p) { ctl.reset(p); ctl.checkpoint = p.clone(); model.root.position.copyFrom(p); },
    dispose() { ctl.dispose(); if (band) band.dispose(); },
  };
}
```

- [x] **Step 4: 驗證**

Run: `cd ../playground && npm run typecheck && npm run training-test | grep -c '"ok": true'`
Expected: `12`。`train:s17-figure` 若頭高不在 1.2–1.8 或接點誤差大 → FigurePose 有尺度假設，讀 `src/parkour/figure.ts` 找硬編碼常數（此檔已在版控，可改），修好後 `parkour-test` 也要綠。護目鏡帶位置（0.004 S）在 Task 9 瀏覽器看，不合再調。

- [x] **Step 5: Commit**

```bash
cd ../playground && git add src/training/player.ts scripts/training_test.ts && git commit -m "$(cat <<'EOF'
playground M16：training/player.ts（膠囊 1.65／0.25／30 不跳＋人偶 ×17 跑步姿勢、PPE 換色／護目鏡帶）；training_test +2 → 12 項

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

---

### Task 8: `training/snapshot.ts` 快照組裝＋黃金路徑測試

**Files:**
- Create: `../playground/src/training/snapshot.ts`
- Modify: `../playground/scripts/training_test.ts`

**Interfaces:**
- Consumes: `HingeReader`（Task 2）、`InteractionState.spill`（Task 2）、`FlowSnapshot`（Task 5）、`findPlaced`／`SPILL_SITE`（Task 6）。
- Produces:
  ```ts
  export interface Snapshotter { snapshot(dt: number): FlowSnapshot }
  export function createSnapshotter(placed: () => Placed[], inter: InteractionState, playerPos: () => Vector3, grabbed: () => PhysicsBody | null): Snapshotter;
  export function grabbedInfo(placed: Placed[], body: PhysicsBody | null): FlowSnapshot["grabbed"];
  export function disposeBody(b: PhysicsBody): void;   // b.dispose(); transformNode.dispose()
  export function moveModel(scene: Scene, p: Placed, delta: Vector3, step: (n: number) => void): void; // 多 body 整體搬移（disablePreStep 兩步）
  ```

- [x] **Step 1: 寫失敗測試（黃金路徑）**

training_test.ts 加 import：
```ts
import { createSnapshotter, disposeBody, moveModel } from "../src/training/snapshot";
import { act } from "../src/actions";
```
在 `train:player` 區塊之後加（此時場景中袋已破裂、足跡存在）：
```ts
  // 黃金路徑：七步全過、零錯、100 分。玩家假位置在足跡外；抓取用假 body。
  {
    const flow = createFlow();
    let fakePlayer = new Vector3(0, 0, -1.2);
    let fakeGrab: PhysicsBody | null = null;
    const snap = createSnapshotter(() => placed, inter, () => fakePlayer, () => fakeGrab);
    const tick = (n = 1): ReturnType<typeof flow.tick> => { const ev = []; for (let i = 0; i < n; i++) { step(1); ev.push(...flow.tick(snap.snapshot(1 / 60))); } return ev; };
    const teleport = (bs: PhysicsBody[], at: (i: number) => Vector3): void => {
      bs.forEach((b, i) => { b.disablePreStep = false; b.setLinearVelocity(Vector3.Zero()); b.setAngularVelocity(Vector3.Zero()); b.transformNode.position.copyFrom(at(i)); });
      step(2); bs.forEach((b) => { b.disablePreStep = true; });
    };
    flow.start();
    const sign = findPlaced(placed, "spill-warning-sign")!, ppe = findPlaced(placed, "ppe-set")!, kit = findPlaced(placed, "chemo-spill-kit")!;
    const shaker = findPlaced(placed, "absorbent-powder-shaker")!, spray = findPlaced(placed, "disinfectant-spray")!, pad = findPlaced(placed, "absorbent-pad")!;
    const wbag = findPlaced(placed, "cytotoxic-waste-bag")!, bin = findPlaced(placed, "cytotoxic-waste-bin")!;
    const pc = inter.spill!.center.clone();

    // 1 示警：立牌整體搬到潑灑點 −x 1.0
    sign.model.bodies["panel-back"].transformNode.computeWorldMatrix(true);
    const sp = sign.model.bodies["panel-back"].transformNode.absolutePosition;
    moveModel(scene, sign, new Vector3(pc.x - 1.0 - sp.x, 0, pc.z - sp.z), step);
    tick(60);
    // 2 PPE：依序拿到玩家旁
    for (const key of ["gown-pack", "goggles", "glove-box"]) {
      const b = ppe.model.bodies[key];
      teleport([b], () => fakePlayer.add(new Vector3(0.2, 0.9, 0)));
      fakeGrab = b;
      const ev = tick(1);
      for (const e of ev) if (e.kind === "wear") disposeBody(b);
      fakeGrab = null;
    }
    // 3 開處理包
    act(kit.model, "servo:lid.x")?.set(1.6); tick(180);
    // 4 撒粉：粉罐開蓋側躺倒空，顆粒搬到足跡三環（M14 佈點）
    act(shaker.model, "servo:cap.x")?.set(1.9); tick(60);
    moveModel(scene, shaker, new Vector3(0, 0.06, 0), step);
    { const bs = Object.values(shaker.model.bodies); bs.forEach((b) => { b.disablePreStep = false; }); shaker.model.root.rotation.z = Math.PI / 2; step(2); bs.forEach((b) => { b.disablePreStep = true; }); }
    tick(300);
    const grains = Object.entries(shaker.model.bodies).filter(([k, b]) => k.startsWith("grain-") && !b.isDisposed).map(([, b]) => b).slice(0, 36);
    teleport(grains, (i) => { const ring = Math.floor(i / 12), a = ((i % 12) / 12) * Math.PI * 2, r = [0.05, 0.09, 0.13][ring]; return new Vector3(pc.x + Math.cos(a) * r, 0.05, pc.z + Math.sin(a) * r); });
    tick(120);
    // 5 消毒＋擦拭：噴 60 滴後 24 滴搬到足跡，墊攤開後蓋上
    act(spray.model, "servo:trigger.x")?.set(0.45); tick(90); act(spray.model, "servo:trigger.x")?.set(0);
    const mist = Object.entries(spray.model.bodies).filter(([k, b]) => k.startsWith("grain-") && !b.isDisposed).map(([, b]) => b).slice(0, 24);
    teleport(mist, (i) => { const a = (i / 12) * Math.PI * 2 + Math.PI / 12, r = i < 12 ? 0.15 : 0.11; return new Vector3(pc.x + Math.cos(a) * r, 0.05, pc.z + Math.sin(a) * r); });
    tick(120);
    const disinfectedMax = inter.puddle?.disinfected ?? 0;
    act(pad.model, "servo:half-b.x")?.set(3.1); tick(120);
    pad.model.bodies["half-a"].transformNode.computeWorldMatrix(true);
    const ha = pad.model.bodies["half-a"].transformNode.absolutePosition;
    moveModel(scene, pad, new Vector3(pc.x - ha.x, 0.03, pc.z - ha.z), step);
    tick(150);
    // 6 封袋入桶：凝固顆粒搬進袋、封袋、桶蓋開、袋搬到桶口
    const clumps = grains.filter((b) => !b.isDisposed).slice(0, 10);
    wbag.model.bodies.bag.transformNode.computeWorldMatrix(true);
    const wc = wbag.model.bodies.bag.transformNode.absolutePosition.clone();
    teleport(clumps, (i) => { const a = (i / 10) * Math.PI * 2; return new Vector3(wc.x + Math.cos(a) * 0.03, wc.y + 0.10, wc.z + Math.sin(a) * 0.03); });
    tick(150);
    const sealed = inter.sealClumps(() => act(wbag.model, "collect:bag")?.set(1));
    act(bin.model, "servo:pedal.x")?.set(-0.3); act(bin.model, "servo:lid.x")?.set(1.5); tick(180);
    const s0 = snap.snapshot(1 / 60);
    teleport([wbag.model.bodies.bag], () => s0.binTop.add(new Vector3(0, 0.05, 0)));
    const ev6 = tick(2);
    if (ev6.some((e) => e.kind === "dispose-bag")) disposeBody(wbag.model.bodies.bag);
    // 7 脫除
    const doffed = flow.doff();
    const allSteps = Object.values(flow.steps).every(Boolean);
    push("train:golden", allSteps && doffed && flow.finished && flow.errors.length === 0 && flow.score === 100,
      `步 ${JSON.stringify(flow.steps)}、錯 ${flow.errors.map((e) => e.id).join() || "無"}、分 ${flow.score}、消毒 ${disinfectedMax.toFixed(2)}、封 ${sealed}、袋 disposed ${wbag.model.bodies.bag.isDisposed}`);
  }
```

- [x] **Step 2: 確認失敗**

Run: `cd ../playground && npm run training-test`
Expected: exit 2，`Cannot find module '../src/training/snapshot'`。

- [x] **Step 3: 實作 `src/training/snapshot.ts`**

```ts
// 從 Placed／InteractionState／hinge 角組出 FlowSnapshot；hinge 讀取器以 BuiltModel 為鍵快取（歸位換新模型自動重綁）。
import { PhysicsBody, Scene, Vector3 } from "@babylonjs/core";
import type { BuiltModel } from "img2babylon-viewer/types";
import type { Placed } from "../scene";
import type { InteractionState } from "../interactions";
import { HingeReader } from "../hinge";
import type { FlowSnapshot } from "./flow";
import { findPlaced, SPILL_SITE } from "./world";

export interface Snapshotter { snapshot(dt: number): FlowSnapshot }

export function disposeBody(b: PhysicsBody): void {
  if (b.isDisposed) return;
  const n = b.transformNode; b.dispose(); n.dispose();
}

/** 多 body 模型整體搬移：disablePreStep 兩步規則（M15）。 */
export function moveModel(scene: Scene, p: Placed, delta: Vector3, step: (n: number) => void): void {
  const bs = Object.values(p.model.bodies).filter((b) => !b.isDisposed);
  bs.forEach((b) => { b.disablePreStep = false; b.setLinearVelocity(Vector3.Zero()); b.setAngularVelocity(Vector3.Zero()); });
  p.model.root.position.addInPlace(delta);
  step(2);
  bs.forEach((b) => { b.disablePreStep = true; });
  void scene;
}

export function grabbedInfo(placed: Placed[], body: PhysicsBody | null): FlowSnapshot["grabbed"] {
  if (!body || body.isDisposed) return null;
  for (const p of placed) {
    const key = Object.keys(p.model.bodies).find((k) => p.model.bodies[k] === body);
    if (key) { body.transformNode.computeWorldMatrix(true); return { model: p.entry.model, bodyKey: key, position: body.transformNode.absolutePosition.clone() }; }
  }
  return null;
}

export function createSnapshotter(placed: () => Placed[], inter: InteractionState, playerPos: () => Vector3, grabbed: () => PhysicsBody | null): Snapshotter {
  const readers = new WeakMap<BuiltModel, HingeReader>();
  const hinge = (p: Placed | undefined, a: string, b: string): number => {
    if (!p) return 0;
    const ba = p.model.bodies[a], bb = p.model.bodies[b];
    if (!ba || !bb || ba.isDisposed || bb.isDisposed) return 0;
    let r = readers.get(p.model);
    if (!r) { r = new HingeReader(ba, bb); readers.set(p.model, r); }
    return r.angle();
  };
  const pos = (p: Placed | undefined, key: string): Vector3 | null => {
    const b = p?.model.bodies[key];
    if (!b || b.isDisposed) return null;
    b.transformNode.computeWorldMatrix(true);
    return b.transformNode.absolutePosition.clone();
  };
  /** 先建讀取器（spawn 後、hinge 未偏離前呼叫一次）。 */
  const prime = (): void => {
    const ps = placed();
    hinge(findPlaced(ps, "chemo-spill-kit"), "case", "lid");
    hinge(findPlaced(ps, "cytotoxic-waste-bin"), "bin", "lid");
    hinge(findPlaced(ps, "spill-warning-sign"), "panel-front", "panel-back");
  };
  prime();

  return {
    snapshot(dt) {
      const ps = placed();
      const bin = findPlaced(ps, "cytotoxic-waste-bin");
      let binTop = new Vector3(0, 0.45, 0);
      const binBody = bin?.model.bodies.bin;
      if (binBody && !binBody.isDisposed) {
        binBody.transformNode.computeWorldMatrix(true);
        const { min, max } = binBody.transformNode.getHierarchyBoundingVectors(true);
        binTop = new Vector3((min.x + max.x) / 2, max.y, (min.z + max.z) / 2);
      }
      const puddle = inter.puddle;
      return {
        player: playerPos().clone(), spillSite: SPILL_SITE, spill: inter.spill,
        signPos: pos(findPlaced(ps, "spill-warning-sign"), "panel-back"), signAngle: hinge(findPlaced(ps, "spill-warning-sign"), "panel-front", "panel-back"),
        kitLidAngle: hinge(findPlaced(ps, "chemo-spill-kit"), "case", "lid"),
        puddle: puddle ? { remaining: puddle.remaining, disinfected: puddle.disinfected, wiped: puddle.wiped } : null,
        sealedClumps: inter.sealedClumps,
        binLidAngle: hinge(bin, "bin", "lid"), binTop,
        bagPos: pos(findPlaced(ps, "cytotoxic-waste-bag"), "bag"),
        grabbed: grabbedInfo(ps, grabbed()), dt,
      };
    },
  };
}
```
注意：`createSnapshotter` 必須在 spawn 後、任何 servo 命令前建（`prime()` 記綁定姿勢）；main.ts 與測試都照此順序。
測試裡 Task 6 已對袋 `rupture`，但 kit／bin／sign 的 hinge 尚未動過，順序符合。

- [x] **Step 4: 驗證**

Run: `cd ../playground && npm run typecheck && npm run training-test | grep -c '"ok": true'; cd ../playground && npm run training-test | grep -A2 '"train:golden"'`
Expected: `13`；golden detail 七步 true、錯「無」、分 100。失敗時**先印座標**（`inter.puddle`、`inter.spill`、袋位置與 `binTop`、`sealed`），再調測試佈點；流程規則本身不改。
常見：`no-sign` 誤記＝立牌 hinge 角非 0（搬移撞到）→ 搬到 −x 1.0 還撞就改 1.2；`dispose` 未觸發＝`binTop.y` 取到 lid（lid 是另一 body，`getHierarchyBoundingVectors` 只算 bin 子樹，理論不會）。

- [x] **Step 5: Commit**

```bash
cd ../playground && git add src/training/snapshot.ts scripts/training_test.ts && git commit -m "$(cat <<'EOF'
playground M16：training/snapshot.ts（hinge 角／桶口／袋位／抓取資訊組快照、moveModel、disposeBody）；training_test 黃金路徑七步 100 分 → 13 項

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

---

### Task 9: `training/ui.ts`＋`style.css`＋`training/main.ts`＋路由

**Files:**
- Create: `../playground/src/training/ui.ts`、`../playground/src/training/style.css`、`../playground/src/training/main.ts`
- Modify: `../playground/src/main.ts`

**Interfaces:**
- Consumes: 全部前述模組。
- Produces: `bootTraining(): Promise<void>`；`window.__TRAINING__ = { scene, placed, flow, player, grab, start(), reset() }`、`__TRAINING_READY__`。
  `installTrainingUi(deps): TrainingUi`，`TrainingUi = { toast(text): void; refresh(): void }`。

- [x] **Step 1: `src/training/style.css`**

```css
body.training{background:#13202b;color:#ecf2ef;font:14px/1.5 system-ui,-apple-system,'PingFang TC',sans-serif}
.t-ui{position:fixed;inset:0;pointer-events:none;z-index:10}.t-ui button,.t-ui a{pointer-events:auto}
.t-top{position:absolute;top:22px;left:28px;right:28px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.t-title{font-size:22px;font-weight:650;margin:0}.t-sub{font-size:12px;color:#a8bbc7}.t-timer{font-size:22px;font-variant-numeric:tabular-nums;color:#8cf2d4}
.t-nav{display:flex;gap:8px}.t-nav a,.t-nav button{color:#dce9eb;background:#17313dde;border:1px solid #55717a77;padding:9px 13px;border-radius:9px;text-decoration:none;font-size:12px;cursor:pointer}
.t-nav .accent{color:#69e6c6;border-color:#69e6c6aa}
.t-hint{position:absolute;left:28px;top:100px;max-width:300px;color:#eac07f;font-size:13px}
.t-panel{position:absolute;right:28px;top:96px;width:280px;max-height:calc(100% - 200px);overflow-y:auto;padding:14px 16px;background:#102736d9;border:1px solid #63808a44;border-radius:12px;pointer-events:auto}
.t-panel h2{font-size:11px;letter-spacing:1px;color:#a8bbc7;margin:0 0 8px}.t-panel h2+h2{margin-top:12px}
.t-step{display:flex;gap:10px;align-items:flex-start;color:#708c9d;font-size:12px;padding:5px 0}.t-step i{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border:1px solid #4e6a78;border-radius:50%;font-size:10px;font-style:normal}
.t-step.active{color:#d9f5ec}.t-step.active i{border-color:#69e6c6;color:#69e6c6}.t-step.done{color:#9fb5c2}.t-step.done i{background:#69e6c6;color:#143139;border-color:#69e6c6}
.t-err{color:#f0a8a8;font-size:12px;padding:2px 0}.t-err small{color:#b58a8a;margin-right:6px;font-variant-numeric:tabular-nums}
.t-near{display:flex;flex-wrap:wrap;gap:4px}.t-near .lbl{width:100%;color:#a8bbc7;font-size:11px;margin-top:4px}
.t-near button,.t-summary button{padding:5px 9px;border:0;border-radius:6px;background:#3b4252;color:#eceff4;font:12px/1 system-ui;cursor:pointer}.t-near button:hover{background:#4c566a}
.t-summary{margin-top:10px;padding:10px;border:1px solid #69e6c655;border-radius:9px;background:#173d45}.t-summary b{font-size:26px;color:#8cf2d4}
.t-toast{position:absolute;left:50%;top:20%;transform:translateX(-50%);padding:11px 18px;background:#173d45ee;color:#c6ffdf;border:1px solid #6de7c655;border-radius:10px;opacity:0;transition:opacity .2s;text-align:center;max-width:70%}
.t-toast.show{opacity:1}.t-toast.bad{color:#ffd3d3;border-color:#f08a8a88;background:#4a1f26ee}
.t-keys{position:absolute;bottom:22px;left:28px;display:flex;gap:12px;padding:12px 16px;border:1px solid #63808a55;background:#0e2636e8;border-radius:12px;flex-wrap:wrap}
.t-key{font-size:11px;color:#a8bbc7;white-space:nowrap}.t-key b{display:inline-block;color:#f1f5f1;border:1px solid #69818f77;border-radius:4px;padding:2px 6px;margin-right:5px;font-weight:500}
#app:focus{outline:none}
```

- [x] **Step 2: `src/training/ui.ts`**

```ts
// 訓練面板：計時、七步清單、錯誤紀錄、附近物件按鈕、脫除按鈕、總評、toast。DOM 只在這裡。
import { Vector3 } from "@babylonjs/core";
import type { Placed } from "../scene";
import type { InteractionState } from "../interactions";
import { modelButtons } from "../actions";
import { ERROR_LABELS, STEP_LABELS, STEP_ORDER, type FlowState } from "./flow";
import { findPlaced } from "./world";
import "./style.css";

const NEAR = 1.5;

export interface TrainingUiDeps {
  flow: FlowState; inter: InteractionState;
  placed: () => Placed[]; playerPos: () => Vector3;
  onStart(): void; onReset(): void; onDoff(): void;
}
export interface TrainingUi { toast(text: string, bad?: boolean): void; refresh(): void }

const fmt = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function installTrainingUi(d: TrainingUiDeps): TrainingUi {
  document.body.classList.add("training");
  const ui = document.createElement("div"); ui.className = "t-ui";
  ui.innerHTML = `
  <div class="t-top"><div><h1 class="t-title">化療潑灑處理訓練</h1><div class="t-sub">走到站點、拖曳物件；七步依序完成</div></div>
    <div class="t-timer" id="t-timer">00:00.0</div>
    <nav class="t-nav"><button class="accent" id="t-start">開始訓練</button><button id="t-reset">重新開始</button><a href="?scene=chemo">物件沙盒 ↗</a><a href="?scene=parkour">人偶跑酷 ↗</a></nav></div>
  <div class="t-hint" id="t-hint">按「開始訓練」：點滴袋會掉落破裂。</div>
  <aside class="t-panel"><h2>流程</h2><div id="t-steps"></div><h2>錯誤紀錄</h2><div id="t-errors"></div><h2>附近物件（1.5 m 內）</h2><div class="t-near" id="t-near"></div><div id="t-summary"></div></aside>
  <div class="t-toast" id="t-toast" role="status"></div>
  <div class="t-keys"><div class="t-key"><b>W A S D</b>移動</div><div class="t-key"><b>SHIFT</b>跑</div><div class="t-key"><b>拖曳物件</b>抓取（1.2 m 內）</div><div class="t-key"><b>SHIFT 拖曳</b>上下</div><div class="t-key"><b>滾輪</b>高度</div><div class="t-key"><b>Q E</b>傾斜</div><div class="t-key"><b>拖曳空白處</b>鏡頭</div></div>`;
  document.body.appendChild(ui);
  const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  el<HTMLButtonElement>("t-start").onclick = () => { d.onStart(); };
  el<HTMLButtonElement>("t-reset").onclick = () => { d.onReset(); };

  let toastTimer = 0;
  const toast = (text: string, bad = false): void => {
    const t = el("t-toast"); t.textContent = text; t.className = `t-toast show${bad ? " bad" : ""}`;
    window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove("show"), 2600);
  };

  // 附近物件按鈕：只在集合變動時重建，避免每次 refresh 重建 DOM 吃掉點擊
  let nearKey = "";
  const refresh = (): void => {
    const f = d.flow;
    el("t-timer").textContent = fmt(f.elapsed);
    el<HTMLButtonElement>("t-start").hidden = f.started;
    const next = STEP_ORDER.find((s) => !f.steps[s]);
    el("t-steps").innerHTML = STEP_ORDER.map((s, i) => `<div class="t-step ${f.steps[s] ? "done" : s === next ? "active" : ""}"><i>${f.steps[s] ? "✓" : i + 1}</i><span>${STEP_LABELS[s]}</span></div>`).join("");
    el("t-errors").innerHTML = f.errors.length ? f.errors.map((e) => `<div class="t-err"><small>${fmt(e.at)}</small>${ERROR_LABELS[e.id]}</div>`).join("") : `<div class="t-err" style="color:#7fa99a">尚無</div>`;
    el("t-hint").textContent = !f.started ? "按「開始訓練」：點滴袋會掉落破裂。" : f.finished ? "訓練完成。可重新開始。" : next ? `下一步：${STEP_LABELS[next]}` : "";

    const ps = d.placed(), me = d.playerPos();
    const near = ps.filter((p) => { const q = Vector3.FromArray(p.entry.position); return Math.hypot(q.x - me.x, q.z - me.z) <= NEAR; });
    const bin = findPlaced(ps, "cytotoxic-waste-bin");
    const nearBin = !!bin && Math.hypot(bin.entry.position[0] - me.x, bin.entry.position[2] - me.z) <= NEAR;
    const showDoff = f.started && !f.finished && nearBin && f.worn.size === 3 && f.steps.dispose;
    const key = near.map((p) => p.entry.model).join(",") + (showDoff ? "|doff" : "") + (f.finished ? "|done" : "");
    if (key !== nearKey) {
      nearKey = key;
      const box = el("t-near"); box.innerHTML = "";
      for (const p of near) {
        const specs = modelButtons(p, d.inter);
        if (!specs.length) continue;
        const lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = p.entry.label; box.appendChild(lbl);
        for (const s of specs) { const b = document.createElement("button"); b.textContent = s.label; b.onclick = () => s.run(); box.appendChild(b); }
      }
      if (showDoff) { const lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = "防護裝備"; box.appendChild(lbl); const b = document.createElement("button"); b.textContent = "脫除防護裝備"; b.onclick = () => d.onDoff(); box.appendChild(b); }
      if (!near.length && !showDoff) box.innerHTML = `<div class="lbl">走近站點的物件會出現操作按鈕</div>`;
      el("t-summary").innerHTML = f.finished ? `<div class="t-summary">完成 ${fmt(f.elapsed)}｜錯誤 ${f.errors.length}<br><b>${f.score}</b> 分</div>` : "";
    }
  };
  return { toast, refresh };
}
```

- [x] **Step 3: `src/training/main.ts`**

```ts
// 訓練場景入口：房間、十件物件、玩家、跟隨鏡頭、抓取（伸手範圍）、互動、流程快照→事件→副作用、UI。
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HavokPlugin, HemisphericLight, PhysicsBody, Scene, Vector3,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { registry } from "img2babylon-viewer/registry";
import { spawnAll, type Placed } from "../scene";
import { installGrab } from "../grab";
import { installInteractions } from "../interactions";
import { act } from "../actions";
import { validateClip } from "../parkour/figure";
import { createFlow, REACH, type FlowState } from "./flow";
import { createPlayer, FIGURE_SCALE, type Player } from "./player";
import { createSnapshotter, disposeBody } from "./snapshot";
import { createRoom, findPlaced, holdBag, PLAYER_SPAWN, releaseBag, TRAINING_SCENE } from "./world";
import { installTrainingUi } from "./ui";
import type { GrabController } from "../grabController";

declare global {
  interface Window {
    __TRAINING__?: { scene: Scene; placed: Placed[]; flow: FlowState; player: Player; grab: GrabController; start(): void; reset(): void };
    __TRAINING_READY__?: boolean;
  }
}

const RUPTURE_DELAY_STEPS = 60;

export async function bootTraining(): Promise<void> {
  document.title = "化療潑灑處理訓練 · Playground";
  const canvas = document.getElementById("app") as HTMLCanvasElement; canvas.tabIndex = 0;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.80, 0.84, 0.87, 1);
  const havok = await HavokPhysics();
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(false, havok));
  const hemi = new HemisphericLight("sky", new Vector3(0.1, 1, 0.2), scene); hemi.intensity = 0.9;
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene); sun.intensity = 0.9; sun.diffuse = new Color3(1, 0.96, 0.9);

  const camera = new ArcRotateCamera("follow", -Math.PI / 2, 1.05, 4.5, PLAYER_SPAWN.add(new Vector3(0, 1.1, 0)), scene);
  camera.minZ = 0.05; camera.lowerRadiusLimit = 2.5; camera.upperRadiusLimit = 7; camera.lowerBetaLimit = 0.55; camera.upperBetaLimit = 1.42;
  camera.wheelDeltaPercentage = 0.015; camera.panningSensibility = 0;
  camera.attachControl(canvas, true); camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

  createRoom(scene);
  const placed = await spawnAll(scene, TRAINING_SCENE);
  holdBag(placed);
  const inter = installInteractions(scene, () => placed);

  const factory = (await registry["action-figure"]()).default;
  const fig = factory(scene, { physics: false, physicsScale: FIGURE_SCALE });
  fig.root.getChildMeshes().forEach((m) => { m.isPickable = false; });
  const res = await fetch(`${import.meta.env.BASE_URL}parkour/run-pose.json`);
  if (!res.ok) throw new Error("無法載入 run-pose.json");
  const run = validateClip(await res.json());
  const player = createPlayer(scene, fig, run, PLAYER_SPAWN);

  const flow = createFlow();
  let grabbedBody: PhysicsBody | null = null;
  const grab = installGrab(scene, camera, canvas, () => placed, {
    reach: () => ({ origin: player.position, radius: REACH }),
    onReject: () => ui.toast("太遠了，走近一點再抓", true),
    onBegin: (body) => { grabbedBody = body; },
  });
  const snap = createSnapshotter(() => placed, inter, () => player.position, () => (grab.active ? grab.body : null));

  // 開始／重置
  let ruptureCountdown = -1;
  const start = (): void => {
    if (flow.started) return;
    flow.start(); releaseBag(placed); ruptureCountdown = RUPTURE_DELAY_STEPS + 45; ui.toast("點滴袋掉落！依流程處理");
  };
  const reset = (): void => {
    void Promise.all(placed.map((p) => p.respawn())).then(() => { holdBag(placed); });
    flow.reset(); player.undressAll(); player.teleport(PLAYER_SPAWN); ruptureCountdown = -1; grab.end(); ui.toast("已重新開始");
  };
  const ui = installTrainingUi({
    flow, inter, placed: () => placed, playerPos: () => player.position,
    onStart: start, onReset: reset,
    onDoff: () => { if (flow.doff()) { player.undressAll(); ui.toast(`訓練完成：${flow.score} 分`); } },
  });

  // 鍵盤（WASD／Shift；Q／E 由 grab.ts 自己聽）
  const keys = new Set<string>();
  const codes = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"]);
  window.addEventListener("keydown", (e) => { if (codes.has(e.code)) { keys.add(e.code); if (e.code.startsWith("Key")) e.preventDefault(); } });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  scene.onBeforePhysicsObservable.add(() => {
    const dt = 1 / 60;
    player.setKeys(keys);
    player.tick(dt, camera.getTarget().subtract(camera.position));
    camera.target = Vector3.Lerp(camera.target, player.chest, 1 - Math.exp(-12 * dt));
  });
  scene.onAfterPhysicsObservable.add(() => {
    if (ruptureCountdown > 0 && --ruptureCountdown === 0) act(findPlaced(placed, "chemo-iv-bag")!.model, "rupture:bag")?.set(1);
    void grabbedBody;
    for (const e of flow.tick(snap.snapshot(1 / 60))) {
      if (e.kind === "wear") {
        const ppe = findPlaced(placed, "ppe-set");
        const b = ppe?.model.bodies[e.bodyKey];
        if (grab.active && grab.body === b) grab.end();
        if (b) disposeBody(b);
        player.wear(e.item); ui.toast(`穿上${{ gown: "隔離衣", goggles: "護目鏡", gloves: "手套" }[e.item]}`);
      } else if (e.kind === "dispose-bag") {
        const bag = findPlaced(placed, "cytotoxic-waste-bag")?.model.bodies.bag;
        if (grab.active && grab.body === bag) grab.end();
        if (bag) disposeBody(bag);
        ui.toast("廢棄物袋已投入桶");
      } else if (e.kind === "step") ui.toast("✓ 步驟完成");
      else if (e.kind === "error") ui.toast(`記錯：${e.id}`, true);
    }
  });
  let frames = 0;
  scene.onAfterRenderObservable.add(() => { if (++frames % 6 === 0) ui.refresh(); });

  window.__TRAINING__ = { scene, placed, flow, player, grab, start, reset };
  window.__TRAINING_READY__ = true;
  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}
```
（`ui.toast` 的 error 文案改用 `ERROR_LABELS[e.id]`：從 `./flow` 多 import `ERROR_LABELS`，寫 `` ui.toast(`記錯：${ERROR_LABELS[e.id]}`, true) ``。）

- [x] **Step 4: 路由 `src/main.ts`**

```ts
const mode=new URLSearchParams(location.search).get('scene');
async function boot():Promise<void>{
 if(mode==='parkour')await (await import('./parkour/main')).bootParkour();
 else if(mode==='chemo'){
  const link=document.createElement('a');link.href='?scene=parkour';link.textContent='人偶跑酷 ↗';
  Object.assign(link.style,{position:'fixed',bottom:'18px',left:'18px',zIndex:'12',padding:'10px 16px',borderRadius:'8px',background:'#173e46',color:'#8cf2d4',textDecoration:'none'});
  document.body.appendChild(link);
  const link2=document.createElement('a');link2.href='?scene=training';link2.textContent='潑灑訓練 ↗';
  Object.assign(link2.style,{position:'fixed',bottom:'18px',left:'140px',zIndex:'12',padding:'10px 16px',borderRadius:'8px',background:'#173e46',color:'#8cf2d4',textDecoration:'none'});
  document.body.appendChild(link2);await import('./chemo');
 }
 else await (await import('./training/main')).bootTraining();
}
void boot().catch(error=>{console.error(error);const notice=document.createElement('div');notice.className='error-banner';notice.textContent=`載入失敗：${String(error)}。請重新整理頁面。`;document.body.appendChild(notice);});
export {};
```
跑酷面板的「物件實驗場 ↗」連結指 `?scene=chemo`，不動。

- [x] **Step 5: typecheck＋三 gate**

Run: `cd ../playground && npm run typecheck && npm run scene-test | grep -c '"ok": true' && npm run training-test | grep -c '"ok": true' && npm run parkour-test`
Expected: 無型別錯、`34`、`13`、PASS。

- [x] **Step 6: 瀏覽器冒煙（playwright）**

dev server（`run_in_background`）：`cd ../playground && npm run dev -- --port 5175 --strictPort`。
`browser_navigate` `http://localhost:5175/`，`browser_evaluate` 等 `window.__TRAINING_READY__`；截視口 → 看到房間、人偶（約 1.65 m，比桶高）、五站分散、面板七步。
用 `browser_evaluate` 派 `KeyboardEvent('keydown',{code:'KeyW'})` 到 window 1.5 s 後 keyup → `__TRAINING__.player.position.z` 增加 ≥ 2。
按「開始訓練」（`browser_click`）→ 2 s 後 `__TRAINING__.flow.started === true` 且 `__PLAYGROUND_GRAB__` 存在。
檢查護目鏡帶／隔離衣換色：evaluate `__TRAINING__.player.wear('gown'); wear('goggles')` 後截圖看人偶；帶子位置不對就調 `player.ts` 的 `0.004 * S`。
console 無紅字（`browser_console_messages`）。

- [x] **Step 7: Commit**

```bash
cd ../playground && git add src/training/ui.ts src/training/style.css src/training/main.ts src/main.ts src/training/player.ts && git commit -m "$(cat <<'EOF'
playground M16：訓練場景入口 training/main.ts（房間、玩家、跟隨鏡頭、伸手抓取、流程事件→穿 PPE／入桶 dispose）、面板 ui.ts＋style.css；首頁預設 training，chemo／parkour 互連

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

---

### Task 10: 瀏覽器演七步、README、部署、結案文件

**Files:**
- Modify: `../playground/README.md`
- Modify（img-to-babylon）：`ROADMAP.md`、`docs/next-steps.md`、`docs/superpowers/specs/2026-09-06-playground-training-scene-design.md`（実測補記）
- Create（img-to-babylon）：`tasks/0028-playground-training-scene.md`
- Memory：`~/.claude/projects/<project-slug>/memory/img2babylon-m16-lessons.md`＋`MEMORY.md` 一行；更新 `playground-tailnet-deploy.md`（部署改 player-garden）；`.remember/remember.md`。

- [x] **Step 1: playwright 真實輸入層演完整七步**

腳本以 `browser_evaluate` 執行，全部走真實輸入層：
- 走位：`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}))`／`keyup`，方向靠先拖曳空白處轉鏡頭（`canvas.dispatchEvent(PointerEvent)`，pointermove **`button: -1`**）。
  或簡化：`__TRAINING__.player.teleport(...)` 走到各站（傳送是測試 API，截圖說明時註明）。
- 抓取：`Vector3.Project` 算 client 座標 → pointerdown／pointermove(button −1)／pointerup；低處物件先 WheelEvent 抬 +0.20 m。
- 順序：開始 → 立牌拖到潑灑點旁 → PPE 三件拖到人偶身上（gown、goggles、glove-box）→ 到站 C 按「打開」→ 拖粉罐到水漬上方、Q／E 傾倒 → 拖噴瓶噴灑 → 拖墊攤開蓋上 → 鏟凝固顆粒入袋、封袋 → 踩踏板、袋拖到桶口 → 脫除。
- 截 `.img2babylon/shots/playground6-{room,ppe,absorb,done}.png`（`filename` 結果落在 img-to-babylon 根，解碼後搬）。
- 記下實際分數與錯誤清單；演出時犯的錯**照實寫**進 tasks／spec 補記。若某步真人操作無法完成（例如鏟顆粒進袋太難），如實回報並保留 headless 黃金路徑為證據。

- [x] **Step 2: README**

`../playground/README.md` 第一段之後加一節：
```markdown
## 化療潑灑處理訓練（2026-09-06，預設場景）

`npm run dev` 後開 **http://localhost:5175/**（`?scene=training`）。10×10 m 病房，五個站點：潑灑點（點滴架）、警示立牌、防護裝備桌、處理包＋工具、廢棄物桶＋袋。

- WASD 移動、Shift 跑；拖曳物件抓取（只能抓 1.2 m 內）、Shift 拖曳上下、滾輪高度、Q／E 傾斜；拖曳空白處轉鏡頭。
- 「開始訓練」：點滴袋掉落破裂。七步：立牌到潑灑點旁 → 穿隔離衣、護目鏡、手套（拖到人偶身上）→ 開處理包 → 撒粉 → 噴消毒後墊擦乾 → 鏟顆粒入袋、封袋、投桶 → 脫除。
- 順序不阻擋但記錯：未穿齊就接觸潑灑物件或踏入水漬、未擺立牌就清理、手套沒最後穿、未消毒就擦、未封袋就投桶。分數 = 100 − 10 × 錯誤數。
- gate：`npm run training-test`（13 項：伸手範圍、流程狀態機、佈局、人偶 ×17、黃金路徑 100 分）。
```
把「gate：`npx tsc --noEmit && npm run scene-test`」一行改為 `npx tsc --noEmit && npm run scene-test && npm run parkour-test && npm run training-test`。

- [x] **Step 3: 部署（player-garden 統包）**

Run: `cd ../player-garden && bash scripts/serve.sh 2>&1 | tail -5`
Expected: 無錯；`curl -s https://<internal-host>/playground/ | grep -c '<canvas id="app">'` → `1`；
`ls ~/.local/share/player-garden/www/playground/assets/*.js | head -1 | xargs grep -c '化療潑灑處理訓練'` → `1`。
若 player-garden 工作區有別人未提交的改動，不動它，只跑腳本。

- [x] **Step 4: playground commit**

```bash
cd ../playground && git add README.md && git commit -m "$(cat <<'EOF'
playground M16：README 訓練場景說明（操作、七步、記錯、training-test）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)" && git status --short | wc -l
```
Expected: `0`（若另一 session 又有新檔，列出並回報，不要掃進）。

- [x] **Step 5: img-to-babylon 結案文件**

- `ROADMAP.md`：M15 之後加 M16 條目（訓練場景、13 項 gate、playground commit hash、上線網址）。
- `tasks/0028-playground-training-scene.md`：仿 0027 格式——目標、做法、実測（gate 數字、瀏覽器分數與錯誤）、遺留（觸控、跳躍、脫除順序、鏟顆粒手感）。
- spec 末尾加「## 12. 実測補記」：黃金路徑數值（消毒 %、封袋數）、瀏覗演出分數、設計偏離（`grabbed` 改 `{model, bodyKey, position}` 純資料；擦拭過早仍完成步但記錯）。
- `docs/next-steps.md` 重寫：狀態改 M16 結案；候選：第四批物件（口罩／鞋套、破裂藥瓶＋尖銳物盒、洗眼瓶、紀錄表）、訓練續（污染狀態機：污染手碰非廢棄物物件記錯；教學／測驗模式；觸控）、Divine Eye 工具側、小修（立牌翻起、鏟顆粒手感、`installInteractions` 掛載點搬離 ui.ts）；執行提醒補三條：部署改 player-garden 統包、快照要在 servo 命令前建（hinge 綁定）、setMotionType 往返掛物。
- Commit：
```bash
git add ROADMAP.md tasks/0028-playground-training-scene.md docs/next-steps.md docs/superpowers/specs/2026-09-06-playground-training-scene-design.md docs/superpowers/plans/2026-09-06-playground-training-scene.md && git commit -m "$(cat <<'EOF'
M16 結案：playground 訓練場景（玩家走站＋七步流程檢核）——ROADMAP、tasks/0028、next-steps、spec 実測補記、計畫勾選

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6
EOF
)"
```

- [x] **Step 6: memory 與 handoff**

- 新 `img2babylon-m16-lessons.md`（type project）：實作時真正踩到的坑（不要預寫；例如 hinge 綁定時機、膠囊推物、DynamicTexture headless、跟隨鏡頭與抓取 detach 互動）＋ How to apply；MEMORY.md 加一行。
- 更新 `playground-tailnet-deploy.md`：部署改 `../player-garden/scripts/serve.sh`，playground 在 `/playground/` 子路徑，`com.example.playground` 已退役。
- `.remember/remember.md`：State（M16 結案、commit hash）、Next（等使用者選 next-steps）、Context（三條最重要陷阱）。

---

## Self-Review

- **Spec 覆蓋**：§1 前置提交→Task 0；§2 佈局／房間／點滴架／桌→Task 6；§3 玩家（×17、膠囊選項、不跳、跟隨鏡頭、換色）→Task 1／7／9；§4 伸手範圍→Task 3；§5 PPE 穿脫→Task 5（判定）＋Task 9（dispose／換色／脫除按鈕）；§6 流程七步六錯評分＋`spill` getter→Task 5／2；§7 UI（含附近物件按鈕、actions.ts 抽出）→Task 4／9；§8 檔案→各 Task；§9 gate 十項→Task 3／5／6／7／8 共 13 項（spec 的 `train:reach` 用純函式而非 begin 拒抓：拒抓在輸入層，headless 不模擬 pointer；`train:wear`／`gloves-first`／`no-ppe-contact`／`stepped-in-spill`／`wipe-before-disinfect`／`unsealed-dispose` 純快照；`train:golden`／`train:layout`／`train:s17-figure` 真物理；多出 `train:doff-gate`、`train:bag-drop`、`train:player`）；§10 證據／文件／部署→Task 10（部署改 player-garden，spec §10 寫的 `npm run serve` 已過時，補記時修正）；§11 風險：膠囊推物在 Task 9 瀏覽器冒煙觀察，未做 headless 斷言（spec 說「計畫內含 headless 檢查」→ 改為冒煙觀察，補記說明）。
- **偏離 spec**：`FlowSnapshot.grabbed` 從 `{model, body}` 改 `{model, bodyKey, position}` 讓 flow 零 Babylon body 依賴；`bagSealed` 不進快照，flow 直接看 `sealedClumps > 0`；擦拭過早仍完成 `disinfect-wipe` 步（否則流程卡死）。三者寫進 spec §12 補記。
- **型別一致**：`createFlow()` 回 `FlowState`；`FlowEvent.wear` 帶 `bodyKey`（Task 5 定義、Task 8／9 使用）；`createSnapshotter(placed, inter, playerPos, grabbed)` 四參數在 Task 8 定義、Task 9 同序呼叫；`installGrab` 第五參數 `GrabOptions`（Task 3）在 Task 9 用 `reach`／`onReject`／`onBegin`；`Player.teleport`／`wear`／`undressAll`／`chest`（Task 7）在 Task 9／測試使用；`modelButtons(p, inter)`（Task 4）在 Task 9 ui 使用；`ParkourController` 第三參數（Task 1）在 Task 7 使用。
- **佈點風險**：golden 的顆粒三環沿用 M14 已驗證座標；噴霧 24 滴沿用 M14；袋在潑灑點落下位置可能偏離 (0,0) 幾公分，全部以 `inter.spill.center` 為基準，不用常數。
