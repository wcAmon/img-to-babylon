# M13 playground 抓取抬高＋傾斜 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** playground 被抓物件可抬高、傾斜、保持姿態，並以 headless gate 證明「鏟起→搬到袋上→倒入→封袋」可行。

**Architecture:** 新檔 `src/grabController.ts` 是純物理速度伺服（手點追目標、姿態追四元數，無 DOM，headless 可測）；
原 `src/grab.ts` 保留 `installGrab` 檔名／簽名，只做 pointer／wheel／鍵盤→控制器的輸入層，`src/chemo.ts` 零改動。
`scripts/scene_test.ts` 加三項斷言。

**Tech Stack:** Babylon.js 8（Havok）、TypeScript strict、tsx headless（`createHeadlessScene`）、vite dev 5175。

**Spec:** `docs/superpowers/specs/2026-09-05-playground-grab-lift-design.md`

## Global Constraints

- 只改 `../playground`；契約側不動。
- playground 工作區有另一 session 未提交的檔（main.ts、chemo.ts、parkour/、README 等）——**只 `git add` 本計畫列出的五檔**：
  `src/grabController.ts`、`src/grab.ts`、`src/ui.ts`、`index.html`、`scripts/scene_test.ts`。README 改但不提交。
- 常數：GAIN 8、MAX_SPEED 3 m/s、ANG_GAIN 6、MAX_ANG 6 rad/s、高度夾 0～2.5 m、滾輪 0.05 m／格、Q/E 1.5 rad/s。
- 既有 scene_test 25 項不得變動；`respawn:all` 仍期望 21。
- 每個 task 結尾 `npm run typecheck && npm run scene-test` 綠再 commit；commit 訊息尾註 Co-Authored-By／Claude-Session。

---

### Task 1: 控制器 `grabController.ts` ＋ `grab:lift`

**Files:**
- Create: `../playground/src/grabController.ts`
- Modify: `../playground/scripts/scene_test.ts`（`tools:bodies` 之後、`bag:rupture` 之前插入）

**Interfaces:**
- Produces: `createGrabController(scene): GrabController`，介面同 spec §3（含 `target()`）。

- [x] **Step 1: 寫失敗測試** — 在 scene_test.ts 頂部 import 加 `import { createGrabController } from "../src/grabController";`，
  並在 `push("tools:bodies", ...)` 之後插入：

```ts
  // M13 抓取：測試球落入鏟斗 → 抓鏟抬高（grab:lift）
  const grab = createGrabController(scene);
  const scoop = tools.model.bodies["scoop"];
  const scoopWorld = (): Matrix => { scoop.transformNode.computeWorldMatrix(true); return scoop.transformNode.getWorldMatrix(); };
  const scoopBalls: PhysicsBody[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = MeshBuilder.CreateSphere(`scoop-ball-${i}`, { diameter: 0.012, segments: 6 }, scene);
    m.position = Vector3.TransformCoordinates(new Vector3(Math.cos(a) * 0.03, 0.15, -0.03 + Math.sin(a) * 0.03), scoopWorld());
    const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
    const s = new PhysicsShapeSphere(Vector3.Zero(), 0.006, scene); s.material = { friction: 0.6, restitution: 0.05 }; b.shape = s;
    b.setMassProperties({ mass: 0.005 }); b.setLinearDamping(2.0); b.setAngularDamping(2.0);
    scoopBalls.push(b);
  }
  step(200);
  const inScoop0 = scoopBalls.filter((b) => {
    const l = Vector3.TransformCoordinates(b.transformNode.absolutePosition, Matrix.Invert(scoopWorld()));
    return Math.abs(l.x) <= 0.08 && l.y > 0 && l.y < 0.06 && Math.abs(l.z) <= 0.07;
  }).length;
  const hand0 = Vector3.TransformCoordinates(new Vector3(0, 0.02, -0.06), scoopWorld());
  grab.begin(scoop, hand0);
  grab.moveTo(hand0.add(new Vector3(0, 0.5, 0)));
  step(120);
  const liftErr = grab.handError(), liftV = scoop.getLinearVelocity().length();
  push("grab:lift", liftErr <= 0.03 && liftV < 0.05, `手點誤差 ${liftErr.toFixed(3)}（≤ 0.03）、速度 ${liftV.toFixed(3)}、斗內球 ${inScoop0}/8`);
```

- [x] **Step 2: 跑測試確認失敗** — `cd ../playground && npm run scene-test`；期望：tsx 找不到 `../src/grabController` 而 exit 2。

- [x] **Step 3: 實作 `src/grabController.ts`**

```ts
// 抓取控制器：速度伺服。手點（body-local 偏移）追目標點、姿態追目標四元數。純物理、無 DOM，headless 可測。
// 重力每步只作用一次就被覆寫，穩態下垂 ≈ g·dt/GAIN ≈ 2 cm。
import { Matrix, PhysicsBody, Quaternion, Scene, Vector3 } from "@babylonjs/core";

const GAIN = 8, MAX_SPEED = 3;    // 線速度 m/s
const ANG_GAIN = 6, MAX_ANG = 6;  // 角速度 rad/s
const MIN_Y = 0, MAX_Y = 2.5;

export interface GrabController {
  readonly active: boolean;
  readonly body: PhysicsBody | null;
  begin(body: PhysicsBody, point: Vector3): void; // point＝世界座標手點；已 active 則先 end()
  moveTo(point: Vector3): void;
  lift(dy: number): void;
  tilt(axis: Vector3, dTheta: number): void;       // 繞世界軸 axis 轉目標姿態
  end(): void;                                     // 保留當前速度
  target(): Vector3;
  handError(): number;
  rotError(): number;
}

/** 最短路徑軸角向量（axis × angle）。 */
function axisAngle(q: Quaternion): Vector3 {
  const s = q.w < 0 ? -1 : 1;
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  if (angle < 1e-4) return Vector3.Zero();
  const k = (s * angle) / Math.sin(angle / 2);
  return new Vector3(q.x * k, q.y * k, q.z * k);
}

export function createGrabController(scene: Scene): GrabController {
  let body: PhysicsBody | null = null;
  let localOffset = Vector3.Zero();
  let target = Vector3.Zero();
  let targetRot = Quaternion.Identity();

  const world = (b: PhysicsBody): Matrix => { b.transformNode.computeWorldMatrix(true); return b.transformNode.getWorldMatrix(); };
  const hand = (b: PhysicsBody): Vector3 => Vector3.TransformCoordinates(localOffset, world(b));
  // Babylon 列向量慣例：cur.multiply(err) = target → err = Inverse(cur).multiply(target)，err 為世界軸旋轉
  const rotErr = (b: PhysicsBody): Quaternion => { world(b); return Quaternion.Inverse(b.transformNode.absoluteRotationQuaternion).multiply(targetRot); };

  const ctl: GrabController = {
    get active() { return body !== null; },
    get body() { return body; },
    begin(b, point) {
      if (body) ctl.end();
      body = b;
      localOffset = Vector3.TransformCoordinates(point, Matrix.Invert(world(b)));
      target = point.clone();
      targetRot = b.transformNode.absoluteRotationQuaternion.clone();
    },
    moveTo(point) { target = point.clone(); },
    lift(dy) { target.y = Math.min(MAX_Y, Math.max(MIN_Y, target.y + dy)); },
    tilt(axis, dTheta) { targetRot = targetRot.multiply(Quaternion.RotationAxis(axis.normalizeToNew(), dTheta)); targetRot.normalize(); },
    end() { body = null; },
    target() { return target.clone(); },
    handError() { return body ? target.subtract(hand(body)).length() : 0; },
    rotError() { return body ? axisAngle(rotErr(body)).length() : 0; },
  };

  scene.onBeforePhysicsObservable.add(() => {
    if (!body) return;
    if (body.isDisposed) { body = null; return; } // 抓取中被 collect 收走
    const v = target.subtract(hand(body)).scaleInPlace(GAIN);
    if (v.length() > MAX_SPEED) v.normalize().scaleInPlace(MAX_SPEED);
    body.setLinearVelocity(v);
    const w = axisAngle(rotErr(body)).scaleInPlace(ANG_GAIN);
    if (w.length() > MAX_ANG) w.normalize().scaleInPlace(MAX_ANG);
    body.setAngularVelocity(w);
  });
  return ctl;
}
```

- [x] **Step 4: 跑測試確認通過** — `npm run typecheck && npm run scene-test`；期望 26 項全 ok，`grab:lift` detail 手點誤差 ≤ 0.03。
  若誤差 > 0.03：先看 detail 的速度——速度大表示姿態伺服振盪（四元數順序反了，見 Task 2 Step 3），不是增益問題。

- [x] **Step 5: Commit**

```bash
cd ../playground && git add src/grabController.ts scripts/scene_test.ts && git commit -m "playground M13：抓取控制器 grabController（手點速度伺服＋姿態伺服）；scene_test grab:lift"
```

### Task 2: `grab:tilt` ＋ `grab:carry-pour`

**Files:**
- Modify: `../playground/scripts/scene_test.ts`（緊接 Task 1 區塊之後）

**Interfaces:**
- Consumes: Task 1 的 `grab`、`scoop`、`scoopWorld`、`scoopBalls`、`hand0`；既有 `wbag`、`wbagBody`、`interiorOff`、`interiorHalf`。

- [x] **Step 1: 寫失敗測試** — 在 `push("grab:lift", ...)` 之後插入：

```ts
  // 搬到袋 interior 上方，繞鏟局部 +x 世界方向傾斜；符號由 TransformNormal 判定（前緣 +z 要往下）
  wbagBody.transformNode.computeWorldMatrix(true);
  const wbagWm2 = wbagBody.transformNode.getWorldMatrix();
  const frontH = Vector3.TransformNormal(new Vector3(0, 0, 1), scoopWorld()); frontH.y = 0; frontH.normalize();
  const pourAt = Vector3.TransformCoordinates(interiorOff, wbagWm2).add(new Vector3(0, 0.45, 0)).subtract(frontH.scale(0.05));
  grab.moveTo(pourAt);
  step(120);
  const axis = Vector3.TransformNormal(new Vector3(1, 0, 0), scoopWorld()).normalize();
  const front = Vector3.TransformNormal(new Vector3(0, 0, 1), scoopWorld()).normalize();
  const probe = front.applyRotationQuaternion(Quaternion.RotationAxis(axis, 0.2));
  const sign = probe.y < front.y ? 1 : -1;
  for (let i = 0; i < 16; i++) { grab.tilt(axis, sign * 0.1); step(5); }
  step(60);
  const rotErr = grab.rotError(), tiltHandErr = grab.handError();
  push("grab:tilt", rotErr < 0.1 && tiltHandErr <= 0.03, `姿態誤差 ${rotErr.toFixed(3)}（< 0.1）、手點誤差 ${tiltHandErr.toFixed(3)}（≤ 0.03）`);
  step(300);
  grab.tilt(axis, -sign * 1.6);
  grab.moveTo(hand0.add(new Vector3(0, 0.3, 0)));
  step(120);
  grab.end();
  step(60);
  wbagBody.transformNode.computeWorldMatrix(true);
  const wbagInv2 = Matrix.Invert(wbagBody.transformNode.getWorldMatrix());
  const inBag = scoopBalls.filter((b) => {
    const l = Vector3.TransformCoordinates(b.transformNode.absolutePosition, wbagInv2).subtract(interiorOff);
    return Math.abs(l.x) <= interiorHalf.x && Math.abs(l.y) <= interiorHalf.y && Math.abs(l.z) <= interiorHalf.z;
  });
  const n = inBag.length;
  wbag.model.actuators?.find((a) => a.id === "collect:bag")?.set(1);
  step(2);
  const wbagMass2 = wbagBody.getMassProperties().mass ?? NaN;
  push("grab:carry-pour", n >= 6 && Math.abs(wbagMass2 - (0.24 + n * 0.005)) < 1e-5 && inBag.every((b) => b.isDisposed),
    `袋內 ${n}/8（≥ 6）、封袋後質量 ${wbagMass2}（期望 ${(0.24 + n * 0.005).toFixed(3)}）`);
```

- [x] **Step 2: 跑測試** — `npm run scene-test`；期望 28 項。可能結果：
  - `grab:tilt` 姿態誤差不收斂（≈ 3 或振盪）→ 四元數順序反了，Step 3。
  - `grab:carry-pour` 袋內 < 6 → Step 4 調整。
- [x] **Step 3: 若 rotErr 發散** — `grabController.ts` 的 `rotErr` 改為 `targetRot.multiply(Quaternion.Inverse(q))`，
  `tilt` 改為 `Quaternion.RotationAxis(axis, dTheta).multiply(targetRot)`；重跑。只翻一次，兩者一起翻。
- [x] **Step 4: 若袋內 < 6** — 依序試：`pourAt` 的 `frontH.scale(0.05)` 改 0.08／0.02；高度 0.45 改 0.35；每次重跑記錄 n。
  三次內未達 6/8 停下回報，不再調。
- [x] **Step 5: `npm run typecheck && npm run scene-test` 綠 → Commit**

```bash
git add src/grabController.ts scripts/scene_test.ts && git commit -m "playground M13：scene_test grab:tilt／grab:carry-pour（鏟起→袋上傾倒→封袋 6/8 以上）"
```

### Task 3: 輸入層 `grab.ts` ＋ 面板提示

**Files:**
- Modify: `../playground/src/grab.ts`（整檔改寫，`installGrab` 簽名不變、回傳型別改 `GrabController`）
- Modify: `../playground/src/ui.ts`（`panel.appendChild(h);` 之後）
- Modify: `../playground/index.html`（`.panel ol` 樣式之後）

- [x] **Step 1: 改寫 `src/grab.ts`**

```ts
// 抓取輸入層：pick → body → GrabController（純物理部分在 grabController.ts）。
// 拖曳＝水平面；Shift 拖曳＝面向相機的垂直面（滑鼠上下＝高度）；滾輪＝高度 ±5 cm；Q／E＝繞相機右軸傾斜 1.5 rad/s。
import {
  AbstractMesh, ArcRotateCamera, Node, PhysicsBody, Plane, PointerEventTypes, Scene, Vector3,
} from "@babylonjs/core";
import type { Placed } from "./scene";
import { createGrabController, type GrabController } from "./grabController";

const WHEEL_STEP = 0.05, TILT_RATE = 1.5;

declare global {
  interface Window { __PLAYGROUND_GRAB__?: GrabController }
}

function bodyOf(mesh: AbstractMesh, placed: Placed[]): PhysicsBody | null {
  const byNode = new Map<Node, PhysicsBody>();
  for (const p of placed) for (const b of Object.values(p.model.bodies)) if (!b.isDisposed) byNode.set(b.transformNode, b);
  let n: Node | null = mesh;
  while (n) {
    const b = byNode.get(n);
    if (b) return b;
    n = n.parent;
  }
  return null;
}

function cameraForwardHorizontal(camera: ArcRotateCamera): Vector3 {
  const f = camera.getTarget().subtract(camera.position); f.y = 0;
  return f.length() < 1e-6 ? new Vector3(0, 0, 1) : f.normalize();
}
function cameraRight(camera: ArcRotateCamera): Vector3 {
  return Vector3.Cross(Vector3.Up(), camera.getTarget().subtract(camera.position)).normalize();
}

export function installGrab(scene: Scene, camera: ArcRotateCamera, canvas: HTMLCanvasElement, placed: () => Placed[]): GrabController {
  const ctl = createGrabController(scene);
  let tiltDir = 0;

  // 以當前目標點重建平面：切換 Shift 模式時目標不跳
  const project = (vertical: boolean): Vector3 | null => {
    const plane = Plane.FromPositionAndNormal(ctl.target(), vertical ? cameraForwardHorizontal(camera) : Vector3.Up());
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const t = ray.intersectsPlane(plane);
    return t === null ? null : ray.origin.add(ray.direction.scale(t));
  };

  scene.onPointerObservable.add((info) => {
    if (info.type === PointerEventTypes.POINTERDOWN) {
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m.isPickable && m.isVisible);
      const body = pick?.pickedMesh ? bodyOf(pick.pickedMesh, placed()) : null;
      if (!body || !pick?.pickedPoint) return;
      ctl.begin(body, pick.pickedPoint);
      camera.detachControl();
    } else if (info.type === PointerEventTypes.POINTERMOVE && ctl.active) {
      const p = project((info.event as PointerEvent).shiftKey);
      if (p) ctl.moveTo(p);
    } else if (info.type === PointerEventTypes.POINTERWHEEL && ctl.active) {
      const dy = (info.event as WheelEvent).deltaY;
      if (dy) ctl.lift(dy > 0 ? -WHEEL_STEP : WHEEL_STEP);
    } else if (info.type === PointerEventTypes.POINTERUP && ctl.active) {
      ctl.end();
      camera.attachControl(canvas, true);
    }
  });

  const onKey = (e: KeyboardEvent, down: boolean): void => {
    const k = e.key.toLowerCase();
    if (k === "q") tiltDir = down ? 1 : tiltDir === 1 ? 0 : tiltDir;
    else if (k === "e") tiltDir = down ? -1 : tiltDir === -1 ? 0 : tiltDir;
  };
  window.addEventListener("keydown", (e) => onKey(e, true));
  window.addEventListener("keyup", (e) => onKey(e, false));
  scene.onBeforeRenderObservable.add(() => {
    if (!ctl.active || !tiltDir) return;
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05);
    ctl.tilt(cameraRight(camera), tiltDir * TILT_RATE * dt);
  });

  window.__PLAYGROUND_GRAB__ = ctl;
  return ctl;
}
```

- [x] **Step 2: ui.ts 加提示** — `panel.appendChild(h);` 之後插入：

```ts
  const hint = document.createElement("div"); hint.className = "hint";
  hint.textContent = "抓取：拖曳移動｜Shift 拖曳＝上下｜滾輪＝高度｜Q／E＝傾斜"; panel.appendChild(hint);
```

- [x] **Step 3: index.html 加樣式** — `.panel ol { ... }` 之後加：
  `    .panel .hint { color: #a3adab; font-size: 11px; margin: -2px 0 8px; }`
- [x] **Step 4: `npm run typecheck && npm run scene-test`** 綠（chemo.ts 仍以 `installGrab(scene, camera, canvas, () => placed)` 呼叫，回傳值忽略）。
- [x] **Step 5: Commit**

```bash
git add src/grab.ts src/ui.ts index.html && git commit -m "playground M13：抓取輸入層（Shift 垂直面／滾輪高度／Q-E 傾斜）、面板操作提示；chemo.ts 零改動"
```

### Task 4: 瀏覽器證據 ＋ README ＋ 重部署

**Files:**
- Modify: `../playground/README.md`（不提交）
- Evidence: `.img2babylon/shots/playground4-{scoop,pour,sealed}.png`

- [x] **Step 1: 起 dev** — `cd ../playground && (npm run dev &)`，等 5175 回應。
- [x] **Step 2: playwright** — `browser_navigate http://localhost:5175/?v=1`，等 `window.__PLAYGROUND_READY__`；`browser_evaluate` 用
  `__PLAYGROUND__`（scene／placed／capture）與 `__PLAYGROUND_GRAB__` 重演 Task 2 流程（同座標、以 `requestAnimationFrame` 計步或
  `await new Promise(r => setTimeout(r, ms))`），三個時點 `capture.setCamera` 兩次＋`screenshot` → base64 JSON 落 repo 根 →
  scratchpad `decode.py` → `.img2babylon/shots/playground4-{scoop,pour,sealed}.png`。用 Read 看圖確認鏟在袋上、球落袋、封袋後結。
- [x] **Step 3: 完整流程盡力示範** — 粉罐「傾倒」→ 用 `__PLAYGROUND_GRAB__` 抓推板把顆粒推向鏟斗 → 抓鏟抬高搬到袋上傾斜 → 封袋；
  成功截 `playground4-flow.png`，不成功如實記錄於 tasks/0025。
- [x] **Step 4: README** — 「滑鼠／觸控可直接抓取拖曳」句後加「；Shift 拖曳上下、滾輪調高度、Q／E 傾斜（桌機）」。不 commit。
- [x] **Step 5: 重部署** — `npm run serve`；`curl -sI https://<internal-host>/ | head -1` 200。

### Task 5: 結案文件（img-to-babylon）

**Files:**
- Modify: `ROADMAP.md`（M12 之後加 M13）
- Create: `tasks/0025-playground-grab-lift.md`
- Modify: `docs/next-steps.md`（移除第 1 項、狀態行加 M13）
- Modify: 本計畫（全部勾選）

- [x] **Step 1: ROADMAP M13** — 節名「## M13：playground 抓取抬高＋傾斜（2026-09-05 核准開工、同日結案）」，列：範圍、控制器／輸入層、
  scene_test 28 項、證據路徑、教訓（四元數順序以測試定案、`__PLAYGROUND__` 不可擴充）。
- [x] **Step 2: tasks/0025** — 依 0024 格式：目標、做了什麼、驗證輸出（scene_test 28/28、typecheck）、證據、未做（觸控）、commit 清單。
- [x] **Step 3: next-steps** — 刪第 1 項並重新編號；狀態行加「M13（抓取抬高＋傾斜）」；執行提醒加「playground 工作區另一 session 檔案：只 add 自己的檔」。
- [x] **Step 4: Commit**

```bash
git add ROADMAP.md tasks/0025-playground-grab-lift.md docs/next-steps.md docs/superpowers/plans/2026-09-05-playground-grab-lift.md && git commit -m "M13 結案：ROADMAP／tasks 0025／next-steps；計畫全勾"
```
