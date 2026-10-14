# M15 playground 互動續 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 吸附墊平放蓋住水漬讓水漬淡出消失；封袋時計算封入的凝固顆粒數；噴瓶一抓起噴口自動下壓 0.35 rad；headless gate 34 項。

**Architecture:** `src/interactions.ts` 加規則 D（擦拭）與 `sealClumps`（封袋計數），凝固顆粒改陣列保存；`src/grab.ts` 加純函式 `aimNozzle` 並在 POINTERDOWN 呼叫；
`src/ui.ts` 封袋按鈕改經 `sealClumps`、兩張卡片狀態行；`scripts/scene_test.ts` +3。`src/chemo.ts` 零改動。

**Tech Stack:** Babylon.js 8（Havok）、TypeScript strict、tsx headless、vite dev 5175。

**Spec:** `docs/superpowers/specs/2026-09-06-playground-interactions-2-design.md`

## Global Constraints

- 只改 `../playground`；契約側不動。只 `git add`：`src/interactions.ts`、`src/grab.ts`、`src/ui.ts`、`scripts/scene_test.ts`。README 改但不提交。
- 常數：PAD_HALF (0.10, 0.125)、PAD_FLAT_UP 0.9、PAD_FLAT_Y 0.04、WIPE_RATE 1/60、AIM_PITCH −0.35。
- 消毒 alpha 內插只在未擦拭時寫；擦拭中 alpha 單調下降；wiped 後足跡半徑視為 0（不再吸附／消毒）。
- 既有 31 項不得變動；`respawn:all` 仍期望 21。playground 命令一律 `cd <playground> && …`。
- 每個 task 結尾 `npm run typecheck && npm run scene-test` 綠再 commit；commit 訊息尾註 Co-Authored-By／Claude-Session。

---

### Task 1: interactions.ts 規則 D＋sealClumps ＋ scene_test 兩項

**Files:**
- Modify: `../playground/src/interactions.ts`
- Modify: `../playground/scripts/scene_test.ts`（`interact:disinfect` 之後插入）

**Interfaces:**
- Produces: `InteractionState.puddle.wiped: boolean`、`InteractionState.sealedClumps: number`、`InteractionState.sealClumps(collect: () => void): number`。

- [x] **Step 1: 先寫失敗的測試**（`push("interact:disinfect", …);` 之後插入）

```ts
  // M15：凝固顆粒入袋封袋計數（wbag 已封過一次，collect 可重複呼叫）
  const clumpsLive = pGrains.filter((g) => !g.isDisposed && (g.transformNode as Mesh).material?.name === "clump").slice(0, 10);
  wbagBody.transformNode.computeWorldMatrix(true);
  const wbagCenter3 = Vector3.TransformCoordinates(interiorOff, wbagBody.transformNode.getWorldMatrix());
  teleport(clumpsLive, (i) => { const a = (i / 10) * Math.PI * 2; return wbagCenter3.add(new Vector3(Math.cos(a) * 0.03, 0.10, Math.sin(a) * 0.03)); });
  step(150);
  const sealedN = inter.sealClumps(() => wbag.model.actuators?.find((a) => a.id === "collect:bag")?.set(1));
  push("interact:seal-count", sealedN >= 8 && inter.sealedClumps === sealedN, `封入凝固顆粒 ${sealedN}/${clumpsLive.length}（≥ 8）、累計 ${inter.sealedClumps}`);

  // M15：吸附墊（已攤開）以 root 位移把 half-a 中心搬到水漬中心上方 3 cm → 平放蓋住 → 水漬淡出消失
  {
    const halfA = pad.model.bodies["half-a"];
    halfA.transformNode.computeWorldMatrix(true);
    const ha = halfA.transformNode.absolutePosition;
    const bs = Object.values(pad.model.bodies);
    bs.forEach((b) => { b.disablePreStep = false; b.setLinearVelocity(Vector3.Zero()); b.setAngularVelocity(Vector3.Zero()); });
    pad.model.root.position.addInPlace(new Vector3(pc.x - ha.x, 0.03, pc.z - ha.z));
    step(2);
    bs.forEach((b) => { b.disablePreStep = true; });
  }
  step(150);
  push("interact:wipe", inter.puddle?.wiped === true && !puddle.isEnabled(), `擦拭 ${inter.puddle?.wiped}、水漬 enabled ${puddle.isEnabled()}`);
```

首行註解補「M15 互動續（封袋計數／擦拭／噴瓶下壓）」。

- [x] **Step 2: 跑 typecheck 確認失敗**：`sealClumps`／`wiped` 不存在 → TS 錯誤。

- [x] **Step 3: 改 interactions.ts**

import 加 `Matrix`。常數區加：
```ts
const PAD_HALF = new Vector3(0.10, 0.0075, 0.125); // 吸附墊半片 0.20×0.015×0.25
const PAD_FLAT_UP = 0.9, PAD_FLAT_Y = 0.04;         // 平放：局部 +y 的世界 y ≥ 0.9、中心 y ≤ 0.04
const WIPE_RATE = 1 / 60;                            // 擦拭 alpha 每步遞減
```
介面：
```ts
export interface InteractionState {
  /** remaining＝可見半徑比例（1 → 0.35）；disinfected 0～1；wiped＝已被吸附墊擦掉；無水漬為 null。 */
  readonly puddle: { remaining: number; disinfected: number; wiped: boolean } | null;
  readonly absorbedGrains: number;   // 規則 A（規則 B 凝固的顆粒不計）
  readonly absorbedDroplets: number; // 規則 B
  readonly sprayAbsorbed: number;    // 規則 C
  readonly sealedClumps: number;     // 規則 E 累計
  /** 規則 E：包住 collect 呼叫，回傳這次被收走的凝固顆粒數（粉罐歸位的 dispose 不會被計到）。 */
  sealClumps(collect: () => void): number;
}
```
`installInteractions` 內：
```ts
  const absorbed = new WeakSet<PhysicsBody>();
  const clumps: PhysicsBody[] = [];
  let puddle: Mesh | null = null, maxScale = 0, rScale = 1, disinfected = 0, wiping = false, wiped = false;
  let absorbedGrains = 0, absorbedDroplets = 0, sprayAbsorbed = 0, sealedClumps = 0;
  const clump = (g: PhysicsBody): void => {
    if (absorbed.has(g)) return;
    absorbed.add(g); clumps.push(g); (g.transformNode as AbstractMesh).material = clumpMat;
  };
```
觀察者內：`const pad = ps.find((p) => p.entry.model === "absorbent-pad");`；重置行加 `wiping = false; wiped = false;`；
足跡改 `const r = wiped ? 0 : puddle.getBoundingInfo().boundingBox.extendSize.x * maxScale;`。規則 C 之後加：
```ts
    // 規則 D：吸附墊半片平放蓋住水漬中心 → 開始擦拭（不回復）
    if (!wiping && !wiped) {
      for (const h of liveBodies(pad, "half-")) {
        const node = h.transformNode; node.computeWorldMatrix(true);
        if (node.getDirection(Vector3.Up()).y < PAD_FLAT_UP || node.absolutePosition.y > PAD_FLAT_Y) continue;
        const l = Vector3.TransformCoordinates(c, Matrix.Invert(node.getWorldMatrix()));
        if (Math.abs(l.x) <= PAD_HALF.x && Math.abs(l.z) <= PAD_HALF.z) { wiping = true; break; }
      }
    }
```
材質段改：
```ts
    if (mat instanceof StandardMaterial) {
      mat.diffuseColor = Color3.Lerp(PUDDLE_COLOR, CLEAN_COLOR, disinfected);
      if (wiping) {
        mat.alpha = Math.max(0, mat.alpha - WIPE_RATE);
        if (mat.alpha <= 0 && !wiped) { wiped = true; puddle.setEnabled(false); }
      } else {
        mat.alpha = PUDDLE_ALPHA + (CLEAN_ALPHA - PUDDLE_ALPHA) * disinfected;
      }
    }
```
回傳物件：
```ts
    get puddle() { return puddle ? { remaining: rScale, disinfected, wiped } : null; },
    …
    get sealedClumps() { return sealedClumps; },
    sealClumps(collect: () => void): number {
      const live = clumps.filter((g) => !g.isDisposed);
      collect();
      const n = live.filter((g) => g.isDisposed).length;
      sealedClumps += n;
      return n;
    },
```

- [x] **Step 4: 驗證** `npm run typecheck && npm run scene-test` → 33 項全綠。不足時先印 half-a 的 up.y／中心 y／局部座標，再調，不放寬門檻。
- [x] **Step 5: Commit** `git add src/interactions.ts scripts/scene_test.ts`。

---

### Task 2: grab.ts `aimNozzle` ＋ scene_test 一項

**Files:**
- Modify: `../playground/src/grab.ts`
- Modify: `../playground/scripts/scene_test.ts`（`interact:disinfect` 之後、Task 1 區塊之前插入）

- [x] **Step 1: 測試**（import 加 `import { aimNozzle } from "../src/grab";`）

```ts
  // M15：噴瓶抓起自動下壓（噴口局部 +z 俯角 → −0.35）
  const sprayBottle = spray.model.bodies.bottle;
  grab.begin(sprayBottle, sprayBottle.transformNode.absolutePosition.clone());
  aimNozzle(grab, placed, sprayBottle);
  step(90);
  sprayBottle.transformNode.computeWorldMatrix(true);
  const nozzleY = sprayBottle.transformNode.getDirection(new Vector3(0, 0, 1)).y;
  push("grab:aim-nozzle", nozzleY >= -0.45 && nozzleY <= -0.25, `噴口方向 y ${nozzleY.toFixed(3)}（[−0.45, −0.25]）`);
  grab.end();
  step(60);
```

- [x] **Step 2: typecheck 失敗**（`aimNozzle` 不存在）。
- [x] **Step 3: grab.ts**（`const WHEEL_STEP…` 之後）

```ts
export const AIM_PITCH = -0.35;

/** 噴瓶抓起自動下壓：噴口（bottle 局部 +z）俯角轉到 AIM_PITCH；非噴瓶 no-op。繞 Cross(Up, 噴口水平向) 轉 +θ 是下壓（M14 實測）。 */
export function aimNozzle(ctl: GrabController, placed: Placed[], body: PhysicsBody): void {
  const p = placed.find((q) => Object.values(q.model.bodies).includes(body));
  const bottle = p?.entry.model === "disinfectant-spray" ? p.model.bodies.bottle : undefined;
  if (!bottle || bottle.isDisposed) return;
  bottle.transformNode.computeWorldMatrix(true);
  const d = bottle.transformNode.getDirection(new Vector3(0, 0, 1));
  const h = new Vector3(d.x, 0, d.z);
  if (h.length() < 1e-6) return;
  const pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
  ctl.tilt(Vector3.Cross(Vector3.Up(), h.normalize()), pitch - AIM_PITCH);
}
```
POINTERDOWN：`ctl.begin(body, pick.pickedPoint);` 之後加 `aimNozzle(ctl, placed(), body);`。檔頭註解補「噴瓶抓起自動下壓 0.35 rad」。

- [x] **Step 4: 驗證** 34 項全綠。若 y 落在 +0.3 附近＝軸方向寫反，翻轉 θ 符號。
- [x] **Step 5: Commit** `git add src/grab.ts scripts/scene_test.ts`。

---

### Task 3: ui.ts 狀態行與封袋計數

**Files:**
- Modify: `../playground/src/ui.ts`

- [x] **Step 1**：`let puddleEl` 改為 `const statusEls = new Map<string, HTMLDivElement>();`；卡片迴圈 `massEls.push(mass);` 之後：
```ts
    if (p.entry.model === "chemo-iv-bag" || p.entry.model === "cytotoxic-waste-bag") {
      const status = document.createElement("div"); status.className = "status"; card.appendChild(status); statusEls.set(p.entry.model, status);
    }
```
封袋按鈕：`btn("封袋", () => { inter.sealClumps(() => act(p.model, "collect:bag")?.set(1)); });`。
interval：
```ts
    const bagEl = statusEls.get("chemo-iv-bag");
    if (bagEl) {
      const s = inter.puddle;
      bagEl.textContent = !s ? "" : s.wiped ? "水漬已擦拭" : `水漬 ${Math.round(s.remaining * 100)}%｜消毒 ${Math.round(s.disinfected * 100)}%`;
    }
    const wbagEl = statusEls.get("cytotoxic-waste-bag");
    if (wbagEl) wbagEl.textContent = inter.sealedClumps > 0 ? `已封入凝固顆粒 ${inter.sealedClumps}` : "";
```
提示尾加「｜墊子蓋水漬＝擦乾」。
- [x] **Step 2**：typecheck、scene-test 34 綠；`git add src/ui.ts` commit。

---

### Task 4: 瀏覽器實測、README、重部署

- [x] dev server（`run_in_background`）→ playwright：摔落→撒粉（M14 流程）→ 抓噴瓶（`__PLAYGROUND_GRAB__.begin` 後呼叫不到 `aimNozzle`，
  改以 pointer 事件不可行→ 用 `scene.onPointerObservable.notifyObservers` 太繞：直接驗「抓起後噴口 y」改在 headless；瀏覽器只演 tilt 效果）→ 噴灑 →
  吸附墊「攤開」後 `grab.begin(half-a)` 拖到水漬上放手 → `.status` 出現「水漬已擦拭」→ 截 `playground5-wipe.png`；
  凝固顆粒鏟入袋（或 teleport 10 顆進袋）→ 按「封袋」→ 袋卡片「已封入凝固顆粒 N」→ 截 `playground5-sealed.png`。
- [x] README 一句（不提交）：「消毒後把攤開的吸附墊拖到水漬上會擦乾（水漬消失）；封袋時袋卡片顯示封入的凝固顆粒數；噴瓶抓起自動朝下 0.35 rad（M15）。」
- [x] `pkill -f "vite.*5175"`；`npm run serve`；curl 200。

### Task 5: 結案文件

- [x] ROADMAP M15、`tasks/0027-playground-interactions-2.md`、`docs/next-steps.md`、spec 実測補記、本計畫全勾；commit。
- [x] memory `img2babylon-m15-lessons.md`＋MEMORY.md 一行；`.remember/remember.md`。
