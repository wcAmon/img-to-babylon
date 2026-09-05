# M14 playground 跨模型互動 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 吸附粉顆粒落在水漬上讓水漬縮小、顆粒凝固；顆粒吸掉點滴袋液滴；消毒噴霧落在水漬上讓水漬變色——以 headless gate 與瀏覽器實測證明。

**Architecture:** 新檔 `src/interactions.ts` 是純幾何掃描（每個物理步遍歷粉罐 `grain-*`、噴瓶 `grain-*`、點滴袋 `droplet-*` 與 `meshes.puddle`，無 DOM）；
`src/ui.ts` 的 `installUi` 掛載它並在點滴袋卡片顯示狀態；`scripts/scene_test.ts` 加三項斷言用真顆粒／真液滴。`src/chemo.ts`（另一 session 未追蹤）零改動。

**Tech Stack:** Babylon.js 8（Havok）、TypeScript strict、tsx headless（`createHeadlessScene`）、vite dev 5175。

**Spec:** `docs/superpowers/specs/2026-09-05-playground-cross-model-interactions-design.md`

## Global Constraints

- 只改 `../playground`；契約側（viewer／forge／grimoire）不動。
- playground 工作區有另一 session 未提交的檔（main.ts、chemo.ts、parkour/、package.json、README 等）——**只 `git add` 本計畫列出的四檔**：
  `src/interactions.ts`、`src/ui.ts`、`index.html`、`scripts/scene_test.ts`。README 改但不提交。
- 常數：GRAIN_LAND_Y 0.012、DROP_LAND_Y 0.010、GRAIN_DROPLET_DIST 0.015、GRAINS_FULL 30、R_MIN 0.35、SPRAY_FULL 20；
  水漬色 (0.90, 0.82, 0.40)/alpha 0.55 → (0.72, 0.82, 0.86)/alpha 0.25；凝固色 (0.80, 0.74, 0.50)。
- 判定用**足跡**（`radius0 × maxScale`），不用縮小後的半徑。
- 既有 scene_test 28 項不得變動；`respawn:all` 仍期望 21。
- Bash cwd 每次呼叫重設回 img-to-babylon：playground 命令一律 `cd /Users/wake/Desktop/local_three/playground && …`。
- 每個 task 結尾 `npm run typecheck && npm run scene-test` 綠再 commit；commit 訊息尾註 Co-Authored-By／Claude-Session。

---

### Task 1: 互動模組 `interactions.ts` ＋ scene_test 三項

**Files:**
- Create: `../playground/src/interactions.ts`
- Modify: `../playground/scripts/scene_test.ts`（import 兩處、spawnAll 之後掛載、`bag:rupture` 之後插入三項）

**Interfaces:**
- Produces: `installInteractions(scene: Scene, placed: () => Placed[]): InteractionState`；
  `InteractionState { puddle: { remaining, disinfected } | null; absorbedGrains; absorbedDroplets; sprayAbsorbed }`（皆 getter，讀即時值）。

- [ ] **Step 1: 先寫失敗的測試——scene_test 加 import、掛載、三項斷言**

`scripts/scene_test.ts` 第 4–7 行 import 改為：

```ts
import { Matrix, Mesh, MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeSphere, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core";
import { createHeadlessScene } from "img2babylon-viewer";
import { SCENE, spawnAll } from "../src/scene";
import { createGrabController } from "../src/grabController";
import { installInteractions } from "../src/interactions";
```

第一行註解補「M14 互動（吸附／吸液滴／消毒）」。`const placed = await spawnAll(scene, SCENE);` 之後加：

```ts
  const inter = installInteractions(scene, () => placed);
```

在 `push("bag:rupture", …)` 之後、`const before = scene.meshes.length;` 之前插入：

```ts
  // M14 互動：真顆粒／真液滴搬到水漬上方落下（disablePreStep 兩步規則）
  const teleport = (bs: PhysicsBody[], at: (i: number) => Vector3): void => {
    bs.forEach((b, i) => {
      b.disablePreStep = false; b.setLinearVelocity(Vector3.Zero()); b.setAngularVelocity(Vector3.Zero());
      b.transformNode.position.copyFrom(at(i));
    });
    step(2);
    bs.forEach((b) => { b.disablePreStep = true; });
  };
  const puddle = bag.model.meshes.puddle;
  puddle.computeWorldMatrix(true);
  const pc = puddle.absolutePosition.clone();
  const pGrains = Object.entries(shaker.model.bodies).filter(([k, b]) => k.startsWith("grain-") && !b.isDisposed).map(([, b]) => b);
  const ivDrops = Object.entries(bag.model.bodies).filter(([k, b]) => k.startsWith("droplet-") && !b.isDisposed).map(([, b]) => b).slice(0, 4);
  const ivPos = ivDrops.map((d) => d.transformNode.absolutePosition.clone());
  // 前 36 顆三環（r 0.05／0.09／0.13、每環 12）、後 4 顆放在液滴 0–3 正上方 3 cm
  teleport(pGrains, (i) => {
    if (i >= 36 && ivPos[i - 36]) return ivPos[i - 36].add(new Vector3(0, 0.03, 0));
    const ring = i % 3, a = (Math.floor(i / 3) / 12) * Math.PI * 2, r = 0.05 + ring * 0.04;
    return new Vector3(pc.x + Math.cos(a) * r, 0.05, pc.z + Math.sin(a) * r);
  });
  step(180);
  const clumped = pGrains.filter((g) => !g.isDisposed && (g.transformNode as Mesh).material?.name === "clump").length;
  push("interact:absorb", inter.absorbedGrains >= 30 && puddle.scaling.x <= 0.36 && clumped >= 30,
    `吸附 ${inter.absorbedGrains}（≥ 30）、水漬縮放 ${puddle.scaling.x.toFixed(3)}（≤ 0.36）、凝固 ${clumped}（≥ 30）`);
  const gone = ivDrops.filter((d) => d.isDisposed).length;
  push("interact:absorb-droplet", gone >= 3, `液滴 0–3 被吸 ${gone}/${ivDrops.length}（≥ 3）`);

  const pMist = Object.entries(spray.model.bodies).filter(([k, b]) => k.startsWith("grain-") && !b.isDisposed).map(([, b]) => b).slice(0, 24);
  teleport(pMist, (i) => { const a = (i / 12) * Math.PI * 2, r = i < 12 ? 0.03 : 0.12; return new Vector3(pc.x + Math.cos(a) * r, 0.05, pc.z + Math.sin(a) * r); });
  step(120);
  const used = pMist.filter((d) => d.isDisposed).length;
  const pm = puddle.material as StandardMaterial;
  const colorOk = Math.abs(pm.diffuseColor.r - 0.72) < 0.01 && Math.abs(pm.diffuseColor.g - 0.82) < 0.01 && Math.abs(pm.diffuseColor.b - 0.86) < 0.01;
  push("interact:disinfect", used >= 20 && inter.puddle?.disinfected === 1 && colorOk,
    `噴霧吸收 ${used}/${pMist.length}（≥ 20）、消毒度 ${inter.puddle?.disinfected}、顏色 ${pm.diffuseColor.toString()}`);
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/wake/Desktop/local_three/playground && npm run typecheck`
Expected: FAIL `Cannot find module '../src/interactions'`。

- [ ] **Step 3: 寫 `src/interactions.ts`**

```ts
// 跨模型互動（M14）：吸附粉顆粒×水漬（縮小＋凝固）、顆粒×點滴袋液滴（吸掉）、消毒噴霧×水漬（變色）。
// 每個物理步一次純幾何掃描；無 DOM，headless 可跑。名稱依 grimoire/spec.md 契約：
// rupture 的 meshes["puddle"]／bodies["droplet-<i>"]、pour 的 bodies["grain-<i>"]（粉罐與噴瓶都叫 grain-，靠所屬模型分辨）。
import { AbstractMesh, Color3, Mesh, PhysicsBody, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import type { Placed } from "./scene";

const GRAIN_LAND_Y = 0.012;        // 顆粒 d 0.010 靜置中心 0.005；第二層 0.015 不算（只有貼地那層吸）
const DROP_LAND_Y = 0.010;         // 噴霧 d 0.006 靜置中心 0.003
const GRAIN_DROPLET_DIST = 0.015;  // 半徑和 0.005 + 0.006 再加 0.004 餘裕
const GRAINS_FULL = 30;            // 吸滿顆數
const R_MIN = 0.35;                // 殘漬可見半徑比例（不消失）
const SPRAY_FULL = 20;             // 消毒滿滴數
const PUDDLE_COLOR = new Color3(0.90, 0.82, 0.40), PUDDLE_ALPHA = 0.55; // 同 chemo-iv-bag puddleMat
const CLEAN_COLOR = new Color3(0.72, 0.82, 0.86), CLEAN_ALPHA = 0.25;
const CLUMP_COLOR = new Color3(0.80, 0.74, 0.50);

export interface InteractionState {
  /** remaining＝可見半徑比例（1 → 0.35）；disinfected 0～1；無水漬為 null。 */
  readonly puddle: { remaining: number; disinfected: number } | null;
  readonly absorbedGrains: number;   // 規則 A（規則 B 凝固的顆粒不計）
  readonly absorbedDroplets: number; // 規則 B
  readonly sprayAbsorbed: number;    // 規則 C
}

function liveBodies(p: Placed | undefined, prefix: string): PhysicsBody[] {
  if (!p) return [];
  return Object.entries(p.model.bodies).filter(([k, b]) => k.startsWith(prefix) && !b.isDisposed).map(([, b]) => b);
}
/** 同 collect 契約：body 連 transformNode 一起收掉；擁有者模型之後再 dispose 有守衛。 */
function remove(b: PhysicsBody): void { const n = b.transformNode; b.dispose(); n.dispose(); }
function inFootprint(p: Vector3, c: Vector3, r: number): boolean { const dx = p.x - c.x, dz = p.z - c.z; return dx * dx + dz * dz <= r * r; }

export function installInteractions(scene: Scene, placed: () => Placed[]): InteractionState {
  const clumpMat = new StandardMaterial("clump", scene);
  clumpMat.diffuseColor = CLUMP_COLOR; clumpMat.specularColor = new Color3(0.1, 0.1, 0.1);
  const absorbed = new WeakSet<PhysicsBody>();
  let puddle: Mesh | null = null, maxScale = 0, rScale = 1, disinfected = 0;
  let absorbedGrains = 0, absorbedDroplets = 0, sprayAbsorbed = 0;
  const clump = (g: PhysicsBody): void => { absorbed.add(g); (g.transformNode as AbstractMesh).material = clumpMat; };

  scene.onAfterPhysicsObservable.add(() => {
    const ps = placed();
    const bag = ps.find((p) => p.entry.model === "chemo-iv-bag");
    const shaker = ps.find((p) => p.entry.model === "absorbent-powder-shaker");
    const spray = ps.find((p) => p.entry.model === "disinfectant-spray");
    const grains = liveBodies(shaker, "grain-");

    // 規則 B：顆粒吸掉點滴袋液滴（不需水漬）
    const droplets = liveBodies(bag, "droplet-");
    for (const g of grains) {
      if (absorbed.has(g)) continue;
      const gp = g.transformNode.absolutePosition;
      for (const d of droplets) {
        if (d.isDisposed) continue;
        if (Vector3.Distance(gp, d.transformNode.absolutePosition) <= GRAIN_DROPLET_DIST) { remove(d); clump(g); absorbedDroplets += 1; break; }
      }
    }

    // 水漬：mesh 實例換了（新破裂、歸位）就重置
    const cur = bag?.model.meshes["puddle"] ?? null;
    if (cur !== puddle) { puddle = cur; maxScale = 0; rScale = 1; disinfected = 0; absorbedGrains = 0; sprayAbsorbed = 0; }
    if (!puddle || puddle.isDisposed()) { puddle = null; return; }
    puddle.computeWorldMatrix(true);
    maxScale = Math.max(maxScale, puddle.scaling.x); // 長大期間讀到模型上一幀寫的進度
    const c = puddle.absolutePosition;
    const r = puddle.getBoundingInfo().boundingBox.extendSize.x * maxScale; // 足跡：原始半徑 × 長大進度，不隨縮小

    // 規則 A：顆粒落在足跡內 → 凝固、水漬縮
    for (const g of grains) {
      if (absorbed.has(g) || g.isDisposed) continue;
      const gp = g.transformNode.absolutePosition;
      if (gp.y <= GRAIN_LAND_Y && inFootprint(gp, c, r)) { clump(g); absorbedGrains += 1; }
    }
    // 規則 C：噴霧落在足跡內 → 收掉、消毒度上升
    for (const d of liveBodies(spray, "grain-")) {
      const dp = d.transformNode.absolutePosition;
      if (dp.y <= DROP_LAND_Y && inFootprint(dp, c, r)) { remove(d); sprayAbsorbed += 1; }
    }

    rScale = Math.max(R_MIN, 1 - (1 - R_MIN) * (absorbedGrains / GRAINS_FULL));
    puddle.scaling.setAll(maxScale * rScale); // 長大的 90 幀內會被模型的 grow 觀察者覆寫，之後生效
    disinfected = Math.min(1, sprayAbsorbed / SPRAY_FULL);
    const mat = puddle.material;
    if (mat instanceof StandardMaterial) {
      mat.diffuseColor = Color3.Lerp(PUDDLE_COLOR, CLEAN_COLOR, disinfected);
      mat.alpha = PUDDLE_ALPHA + (CLEAN_ALPHA - PUDDLE_ALPHA) * disinfected;
    }
  });

  return {
    get puddle() { return puddle ? { remaining: rScale, disinfected } : null; },
    get absorbedGrains() { return absorbedGrains; },
    get absorbedDroplets() { return absorbedDroplets; },
    get sprayAbsorbed() { return sprayAbsorbed; },
  };
}
```

- [ ] **Step 4: 跑 typecheck 與 scene_test**

Run: `cd /Users/wake/Desktop/local_three/playground && npm run typecheck && npm run scene-test 2>&1 | tail -60`
Expected: 31 項全 `ok: true`；`interact:absorb` 吸附 ≥ 30、縮放 ≤ 0.36；`interact:absorb-droplet` ≥ 3；`interact:disinfect` ≥ 20、消毒度 1。
若 `interact:absorb` 不足：先印每顆最終 y 與到中心距離，分辨是「彈出足跡」還是「堆疊 y > 0.012」，再調環距，不放寬門檻。

- [ ] **Step 5: Commit（只加兩檔）**

```bash
cd /Users/wake/Desktop/local_three/playground && git status --short && git add src/interactions.ts scripts/scene_test.ts && git commit -m "playground M14：跨模型互動 interactions.ts（顆粒×水漬縮小＋凝固、顆粒×液滴、噴霧×水漬變色；足跡判定）；scene_test +3 → 31 項"
```

---

### Task 2: 掛載與卡片狀態（`ui.ts`、`index.html`）

**Files:**
- Modify: `../playground/src/ui.ts`
- Modify: `../playground/index.html`（CSS 一行）

**Interfaces:**
- Consumes: Task 1 的 `installInteractions`／`InteractionState.puddle`。

- [ ] **Step 1: ui.ts import 與掛載**

在 `import { totalMass } from "./scene";` 之後加：

```ts
import { installInteractions } from "./interactions";
```

`installUi` 開頭（`const panel = …` 之前）加：

```ts
  const inter = installInteractions(scene, () => placed); // chemo.ts 不可動，掛載點暫放這裡
```

- [ ] **Step 2: 點滴袋卡片加狀態行**

`const massEls: HTMLDivElement[] = [];` 之後加 `let puddleEl: HTMLDivElement | null = null;`。
卡片迴圈裡 `massEls.push(mass);` 之後加：

```ts
    if (p.entry.model === "chemo-iv-bag") {
      const status = document.createElement("div"); status.className = "status"; card.appendChild(status); puddleEl = status;
    }
```

檔尾 `setInterval(() => placed.forEach(…), 500);` 改為：

```ts
  setInterval(() => {
    placed.forEach((p, i) => { massEls[i].textContent = `質量 ${totalMass(p.model).toFixed(2)} kg`; });
    if (puddleEl) {
      const s = inter.puddle;
      puddleEl.textContent = s ? `水漬 ${Math.round(s.remaining * 100)}%｜消毒 ${Math.round(s.disinfected * 100)}%` : "";
    }
  }, 500);
```

面板提示改為：「抓取：拖曳移動｜Shift 拖曳＝上下｜滾輪＝高度｜Q／E＝傾斜｜撒粉吸水漬、噴霧消毒」。

- [ ] **Step 3: index.html CSS**

`.card .mass` 那行之後加：

```css
    .card .status { color: #a3adab; font-size: 11px; margin: -2px 0 6px; }
```

- [ ] **Step 4: 驗證並 commit**

Run: `cd /Users/wake/Desktop/local_three/playground && npm run typecheck && npm run scene-test 2>&1 | grep -c '"ok": true'`
Expected: 31。

```bash
cd /Users/wake/Desktop/local_three/playground && git add src/ui.ts index.html && git commit -m "playground M14：installUi 掛載互動、點滴袋卡片顯示水漬／消毒狀態、提示補撒粉／噴霧"
```

---

### Task 3: 瀏覽器實測、截圖、README、重部署

**Files:**
- Modify: `../playground/README.md`（不提交）
- Create: `.img2babylon/shots/playground5-absorb.png`、`playground5-disinfect.png`（gitignored）

- [ ] **Step 1: 起 dev server（背景）**

Bash `run_in_background: true`：`cd /Users/wake/Desktop/local_three/playground && npm run dev -- --port 5175 --strictPort`。

- [ ] **Step 2: playwright 演流程**

`browser_navigate http://localhost:5175/?v=1`；`browser_evaluate` 等 `window.__PLAYGROUND_READY__`。用 `window.__PLAYGROUND__.placed` 與
`window.__PLAYGROUND_GRAB__`（Vector3 由 `scene.activeCamera.position.constructor` 取）：

1. 點滴袋 `dropFrom` 等效：找卡片按鈕「摔落」`browser_click`，等 2 s，看 `bag.model.meshes.puddle` 存在（否則按「破裂」）。
2. 粉罐：按「開蓋」；`grab.begin(bottleBody, bottle.absolutePosition)`；`glide` 到水漬中心上方 0.25 m（用 `setInterval` 每 16 ms 插值 moveTo，1.5 s）；
   `tilt(cameraRight, …)` 累計 1.4 rad 讓傾角過 1.2；等 3 s（20 顆／秒）；抬回、`end()`。
3. 讀 `inter` 沒有全域掛載——改讀畫面：卡片 `.status` 文字（`document.querySelector(".card .status")?.textContent`）與
   `bag.model.meshes.puddle.scaling.x`；期望縮放 ≤ 0.6、凝固顆粒 ≥ 15（`shaker.model.meshes` 中 material.name === "clump"）。
   `capture.setCamera` 兩次＋`screenshot` → base64 存 `playground5-absorb.png`。
4. 噴瓶：`grab.begin(bottleBody, …)`，glide 到水漬邊 0.35 m 外、高 0.25 m；`tilt` 讓噴口（局部 +z）朝下約 0.6 rad；
   按「噴灑」（或 `act("servo:trigger.x").set(0.45)` 1 s）；等 3 s；讀 `.status` 消毒 %、`puddle.material.diffuseColor`；截 `playground5-disinfect.png`。
5. 結果如實記錄（幾顆凝固、消毒 %）；噴不到就改變高度／角度再試一次，兩次不成就記錄「需手動瞄準」不硬湊。

`filename` 結果落在 img-to-babylon 根目錄：`find /Users/wake/Desktop/local_three/img-to-babylon -maxdepth 1 -name 'phase*.json'`，解碼後 `.img2babylon/shots/`，刪 json。

- [ ] **Step 3: README 一句（不提交）**

在 M13 那句後加：「撒粉在水漬上會縮小水漬、顆粒凝固（可再鏟起）；粉會吸掉散落液滴；噴霧落在水漬上會消毒變色（M14；點滴袋卡片顯示水漬／消毒 %）。」

- [ ] **Step 4: 停 dev server、重部署**

`pkill -f "vite.*5175"`（背景任務 exit 143 屬預期），然後 `cd /Users/wake/Desktop/local_three/playground && npm run serve`；
`curl -s -o /dev/null -w '%{http_code}' https://monkeyday.tail8e3f79.ts.net/` → 200；`curl -s https://monkeyday.tail8e3f79.ts.net/ | grep -c 'card .status'` → 1。

---

### Task 4: 結案文件（img-to-babylon）

**Files:**
- Modify: `ROADMAP.md`（M13 之後、Parked 之前加 M14 段）
- Create: `tasks/0026-playground-cross-model-interactions.md`
- Modify: `docs/next-steps.md`（移除第 1 項、重排、加提醒）
- Modify: `docs/superpowers/specs/2026-09-05-playground-cross-model-interactions-design.md`（実測發現補進 §1／§5／§7）
- Modify: 本計畫（全部 `- [ ]` 打勾）

- [ ] **Step 1: ROADMAP M14 段**（格式同 M13：一個 `- [x] 0026 …` 條目，含 gate 數字、實測數字、陷阱）
- [ ] **Step 2: tasks/0026**（格式同 tasks/0025：model／status／脈絡／分工／驗收／notes）
- [ ] **Step 3: next-steps**：候選改為 第四批、Divine Eye、抓取 UX 續、小修（＋本輪新發現的候選）；提醒加「生成物 key 同名靠 entry.model 分辨」「足跡不隨縮小」。
- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md tasks/0026-playground-cross-model-interactions.md docs/next-steps.md docs/superpowers/specs/2026-09-05-playground-cross-model-interactions-design.md docs/superpowers/plans/2026-09-05-playground-cross-model-interactions.md && git commit -m "M14 結案：ROADMAP M14、tasks 0026、next-steps、spec 実測補記；計畫全勾"
```

- [ ] **Step 5: memory＋handoff**：`~/.claude/projects/-Users-wake-Desktop-local-three-img-to-babylon/memory/img2babylon-m14-lessons.md`＋MEMORY.md 一行；`.remember/remember.md` 更新。
