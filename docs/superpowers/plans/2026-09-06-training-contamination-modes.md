# M18 訓練續（手部污染／教學測驗模式／桶口與提示）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 訓練場景加上手部污染狀態機（交叉污染記錯、換手套歸零）、教學／測驗兩模式（高亮＋提示 vs 靜音只評分）、桶口足跡重疊判定與情境提示。

**Architecture:** 判定全在純邏輯 `flow.ts`（污染、模式、桶口），情境提示抽成純函式 `hints.ts`，快照 `snapshot.ts` 多給袋 AABB／斗內數／活 clump 數；
呈現差異（HighlightLayer、toast 靜音、面板隱藏）只在 `main.ts`／`ui.ts` 依 `flow.mode` 切換。headless `training_test.ts` 以手工快照覆蓋全部判定。

**Tech Stack:** TypeScript strict、Babylon.js 8（HighlightLayer）、Havok headless（既有黃金路徑）、tsx、playwright／Chrome 瀏覽器演示。

**Spec:** `docs/superpowers/specs/2026-09-06-training-contamination-modes-design.md`

## Global Constraints

- 只改 `../playground`（`src/training/*`、`scripts/training_test.ts`、`README.md`）；img-to-babylon 只動 ROADMAP／tasks／next-steps／.remember。`src/chemo.ts` 不改。
- flow 判定、記錯、分數在 teach／quiz **完全相同**；模式只存在 flow 上、差異只在呈現層。
- 常數：`CLEAN_MODELS = {"spill-warning-sign","chemo-spill-kit","ppe-set"}`；`BIN_MOUTH_R` 維持 0.15（語意＝桶口半徑）；新 `BIN_RIM_TOL = 0.05`。
- 新錯誤 id `cross-contamination`，文案「手部已污染卻接觸乾淨物件」。交叉污染**邊緣觸發**（被抓 `model/bodyKey` 換了才判、repeat）。
- `changeGloves()` 回 boolean、不發事件；`hands` 事件只在 tick 內狀態改變時送。
- `FlowSnapshot.bagPos` 移除，改 `bagBox: {min,max} | null`；新增 `scoopHeld`、`liveClumps`。
- 每 task 一 commit；commit 結尾兩行 trailer：
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 與 `Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6`。
- `../playground` 是另一個 git repo（另一 session 同時在做跑酷）：commit 前 `git status`，只 add 自己改的檔。
- Bash cwd 每次呼叫重置到 img-to-babylon 根；playground 命令一律 `cd ../playground && …`。
- gate：`cd ../playground && npm run typecheck && npm run training-test && npm run scene-test && npm run parkour-test`。
- 部署只跑 `cd ../player-garden && bash scripts/serve.sh`。dev server：`cd ../playground && npm run dev -- --port 5175 --strictPort`（背景），結束 `pkill -f "vite.*5175"`。

---

### Task 1: 手部污染狀態機（flow.ts）＋ 5 個快照測試

**Files:**
- Modify: `../playground/src/training/flow.ts`
- Test: `../playground/scripts/training_test.ts`（純快照區，`train:doff-gate` 之後插入）

**Interfaces:**
- Produces: `type Hands = "clean" | "contaminated"`；`FlowState.hands: Hands`、`FlowState.gloveChanges: number`、`FlowState.changeGloves(): boolean`；
  `ErrorId` 加 `"cross-contamination"`；`FlowEvent` 加 `{ kind: "hands"; state: Hands }`；`export const CLEAN_MODELS: ReadonlySet<string>`。

- [x] **Step 1: 寫失敗測試**（插在 `push("train:doff-gate", …)` 那個區塊之後）

```ts
  // M18 手部污染
  const grabModel = (model: string, bodyKey: string): FlowSnapshot["grabbed"] => ({ model, bodyKey, position: new Vector3(0.2, 0.9, -1.2) });
  {
    const f = createFlow(); f.start();
    const ev = f.tick(base({ grabbed: grabModel("absorbent-powder-shaker", "bottle") }));
    f.tick(base());
    push("train:hands-contaminate", f.hands === "contaminated" && ev.some((e) => e.kind === "hands" && e.state === "contaminated"),
      `hands ${f.hands}、事件 ${ev.map((e) => e.kind).join()}`);
  }
  {
    const f = createFlow(); f.start();
    f.tick(base({ grabbed: grabModel("absorbent-powder-shaker", "bottle") })); f.tick(base());
    for (let i = 0; i < 60; i++) f.tick(base({ grabbed: grabModel("spill-warning-sign", "panel-back") }));
    const n1 = f.errors.filter((e) => e.id === "cross-contamination").length;
    f.tick(base()); f.tick(base({ grabbed: grabModel("spill-warning-sign", "panel-back") }));
    const n2 = f.errors.filter((e) => e.id === "cross-contamination").length;
    f.tick(base()); f.tick(base({ grabbed: grabModel("cytotoxic-waste-bag", "bag") }));
    const n3 = f.errors.filter((e) => e.id === "cross-contamination").length;
    push("train:cross-contamination", n1 === 1 && n2 === 2 && n3 === 2, `同次抓 60 步 ${n1}、放手再抓 ${n2}、抓廢棄物袋 ${n3}`);
  }
  {
    const f = createFlow(); f.start();
    f.tick(base({ grabbed: grabModel("spill-warning-sign", "panel-back") }));
    const n0 = f.errors.length;
    f.tick(base({ grabbed: grabModel("absorbent-powder-shaker", "bottle") }));
    f.tick(base({ grabbed: grabModel("spill-warning-sign", "panel-back") }));
    push("train:cross-order", n0 === 0 && f.errors.map((e) => e.id).join() === "cross-contamination", `乾淨先抓 ${n0}、之後 ${f.errors.map((e) => e.id).join()}`);
  }
  {
    const f = createFlow(); f.start();
    const before = f.changeGloves();
    f.tick(base({ grabbed: grabPpe("gown-pack") })); f.tick(base({ grabbed: grabPpe("goggles") })); f.tick(base({ grabbed: grabPpe("glove-box") }));
    f.tick(base({ grabbed: grabModel("absorbent-powder-shaker", "bottle") })); f.tick(base());
    const dirty = f.hands;
    const changed = f.changeGloves();
    const clean = f.hands;
    f.tick(base({ grabbed: grabModel("absorbent-powder-shaker", "bottle") }));
    push("train:glove-change", !before && dirty === "contaminated" && changed && clean === "clean" && f.gloveChanges === 1 && f.hands === "contaminated",
      `無手套 ${before}、污染 ${dirty}、換 ${changed} → ${clean}、次數 ${f.gloveChanges}、再抓 ${f.hands}`);
  }
  {
    const f = createFlow(); f.start();
    f.tick(base({ grabbed: grabModel("cytotoxic-waste-bag", "bag") }));
    f.tick(base({ binLidAngle: 1.3, bagBox: { min: new Vector3(3.9, 0.5, 2.9), max: new Vector3(4.2, 0.85, 3.1) }, sealedClumps: 3 }));
    const dirty = f.hands, doffed = f.doff();
    push("train:doff-clears-hands", dirty === "contaminated" && doffed && f.hands === "clean", `污染 ${dirty}、doff ${doffed}、之後 ${f.hands}`);
  }
```

同時把 `base()` 改成新快照欄位（Task 3 才實作 snapshot，但型別先改才能編譯）：

```ts
    kitLidAngle: 0, puddle: null, sealedClumps: 0, binLidAngle: 0, binTop: new Vector3(4, 0.45, 3), bagBox: null, scoopHeld: 0, liveClumps: 0, grabbed: null, dt: 1 / 60, ...over,
```
並把 `train:unsealed-dispose` 的 `bagPos: new Vector3(4.05, 0.5, 3.0)` 改為 `bagBox: { min: new Vector3(3.9, 0.5, 2.9), max: new Vector3(4.2, 0.85, 3.1) }`。

- [x] **Step 2: 跑測試確認失敗**

Run: `cd ../playground && npm run typecheck`
Expected: 型別錯誤（`hands`、`changeGloves`、`bagBox` 不存在）。

- [x] **Step 3: 實作 flow.ts**

型別區：
```ts
export type ErrorId = "no-ppe-contact" | "stepped-in-spill" | "no-sign" | "gloves-not-last" | "wipe-before-disinfect" | "unsealed-dispose" | "cross-contamination";
export type Hands = "clean" | "contaminated";
export type FlowEvent =
  | { kind: "step"; id: StepId }
  | { kind: "error"; id: ErrorId }
  | { kind: "wear"; item: PpeItem; bodyKey: string }
  | { kind: "hands"; state: Hands }
  | { kind: "dispose-bag" };
```
`FlowSnapshot`：`bagPos` 行改為
```ts
  bagBox: { min: Vector3; max: Vector3 } | null;      // 廢棄物袋 body 世界 AABB（已 dispose 則 null）
  scoopHeld: number;                                  // 鏟斗內 held-<n> 數
  liveClumps: number;                                 // 鏟子倒出、尚未被收走的 clump-<i> 數
```
`FlowState` 加：
```ts
  readonly hands: Hands; readonly gloveChanges: number;
  /** 前提：started、未結束、已穿手套；手部歸 clean。不是步驟、不計分。 */
  changeGloves(): boolean;
```
常數／文案：
```ts
export const BIN_RIM_TOL = 0.05;
  "unsealed-dispose": "廢棄物袋未封袋就投入桶", "cross-contamination": "手部已污染卻接觸乾淨物件",
export const CLEAN_MODELS: ReadonlySet<string> = new Set(["spill-warning-sign", "chemo-spill-kit", "ppe-set"]);
```
`createFlow` 內：
```ts
  let hands: Hands = "clean", gloveChanges = 0, lastGrab = "";
  // init(): 
    hands = "clean"; gloveChanges = 0; lastGrab = "";
  // getters:
    get hands() { return hands; }, get gloveChanges() { return gloveChanges; },
    changeGloves(): boolean {
      if (!started || finished || !worn.has("gloves")) return false;
      hands = "clean"; gloveChanges += 1; return true;
    },
    doff(): boolean {
      if (!started || finished || !steps.dispose) return false;
      steps.doff = true; finished = true; hands = "clean"; return true;
    },
```
`tick` 內、在「未穿齊就接觸潑灑物件」之後加：
```ts
      // 手部污染：抓過潑灑物件就污染；污染手抓乾淨物件記交叉污染（被抓 body 換了才判一次）
      if (s.grabbed && CONTAMINATED_MODELS.has(s.grabbed.model) && hands !== "contaminated") { hands = "contaminated"; ev.push({ kind: "hands", state: hands }); }
      const grabKey = s.grabbed ? `${s.grabbed.model}/${s.grabbed.bodyKey}` : "";
      if (grabKey !== lastGrab && s.grabbed && hands === "contaminated" && CLEAN_MODELS.has(s.grabbed.model)) err(ev, "cross-contamination", true);
      lastGrab = grabKey;
```
入桶判定暫時改讀 `bagBox`（Task 3 再換重疊規則，這裡先讓型別過）：
```ts
      if (s.bagBox && !steps.dispose && s.binLidAngle > BIN_OPEN && distXZ(s.bagBox.min.add(s.bagBox.max).scale(0.5), s.binTop) <= BIN_MOUTH_R && s.bagBox.max.y >= s.binTop.y - BIN_RIM_TOL) {
```

- [x] **Step 4: 讓 snapshot.ts／main.ts 過型別**（最小改動；Task 3 再補真正的 scoopHeld／liveClumps）

`snapshot.ts` 的 `bagPos: pos(...)` 改為：
```ts
        bagBox: box(findPlaced(ps, "cytotoxic-waste-bag"), "bag"), scoopHeld: 0, liveClumps: 0,
```
並在 `pos` 旁加：
```ts
  const box = (p: Placed | undefined, key: string): FlowSnapshot["bagBox"] => {
    const b = p?.model.bodies[key];
    if (!b || b.isDisposed) return null;
    b.transformNode.computeWorldMatrix(true);
    const { min, max } = b.transformNode.getHierarchyBoundingVectors(true);
    return { min, max };
  };
```

- [x] **Step 5: 跑測試確認通過**

Run: `cd ../playground && npm run typecheck && npm run training-test 2>&1 | grep -E '"id"|"ok"' | paste - - | grep -c true`
Expected: typecheck 零錯；19 項全 true（14 既有＋5 新）。

- [x] **Step 6: Commit**

```bash
cd ../playground && git status --short && git add src/training/flow.ts src/training/snapshot.ts scripts/training_test.ts && git commit -m "M18 訓練：手部污染狀態機（抓潑灑物件即污染、污染手抓乾淨物件記 cross-contamination 邊緣觸發、changeGloves 歸零、doff 清）；快照 bagPos→bagBox；training_test +5

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 2: 模式（teach／quiz）＋ maxDisinfected 公開

**Files:**
- Modify: `../playground/src/training/flow.ts`
- Test: `../playground/scripts/training_test.ts`

**Interfaces:**
- Produces: `export type TrainingMode = "teach" | "quiz"`；`FlowState.mode: TrainingMode`；`FlowState.start(mode?: TrainingMode)`；`FlowState.maxDisinfected: number`。

- [x] **Step 1: 寫失敗測試**（接在 Task 1 測試後）

```ts
  {
    const seq = (f: ReturnType<typeof createFlow>): string => {
      f.tick(base({ grabbed: grabModel("absorbent-powder-shaker", "bottle") })); f.tick(base());
      f.tick(base({ grabbed: grabModel("spill-warning-sign", "panel-back") }));
      f.tick(base({ puddle: { remaining: 1, disinfected: 0.3, wiped: false } }));
      f.tick(base({ puddle: { remaining: 0.5, disinfected: 0.3, wiped: true } }));
      return `${Object.values(f.steps).filter(Boolean).length}/${f.errors.map((e) => e.id).join("+")}/${f.score}/${f.maxDisinfected}`;
    };
    const t = createFlow(); t.start(); const q = createFlow(); q.start("quiz");
    const a = seq(t), b = seq(q);
    push("train:mode", t.mode === "teach" && q.mode === "quiz" && a === b && q.maxDisinfected === 0.3, `teach ${a}、quiz ${b}`);
  }
```

- [x] **Step 2: 確認失敗**

Run: `cd ../playground && npm run typecheck`
Expected: `mode`／`maxDisinfected` 不存在、`start` 不收參數。

- [x] **Step 3: 實作**

```ts
export type TrainingMode = "teach" | "quiz";
// FlowState:
  readonly mode: TrainingMode; readonly maxDisinfected: number;
  start(mode?: TrainingMode): void;
// createFlow:
  let mode: TrainingMode = "teach";
    get mode() { return mode; }, get maxDisinfected() { return maxDisinfected; },
    start(m: TrainingMode = "teach"): void { if (!started) { started = true; mode = m; } },
```
`reset()` 不重設 mode（保留上次選擇）。

- [x] **Step 4: 確認通過**

Run: `cd ../playground && npm run typecheck && npm run training-test 2>&1 | grep -c '"ok": true'`
Expected: 20。

- [x] **Step 5: Commit**

```bash
cd ../playground && git add src/training/flow.ts scripts/training_test.ts && git commit -m "M18 訓練：flow 保存 teach／quiz 模式（判定與分數不分模式）、公開 maxDisinfected；training_test +1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 3: 桶口足跡重疊判定＋快照 scoopHeld／liveClumps

**Files:**
- Modify: `../playground/src/training/flow.ts`、`../playground/src/training/snapshot.ts`
- Test: `../playground/scripts/training_test.ts`

**Interfaces:**
- Produces: `export function rectCircleOverlap(min: Vector3, max: Vector3, c: Vector3, r: number): boolean`（flow.ts）；snapshot 真正填 `scoopHeld`／`liveClumps`。

- [x] **Step 1: 寫失敗測試**（接在 train:mode 後）

```ts
  {
    const bagAt = (cx: number, cz: number, y0: number): FlowSnapshot["bagBox"] => ({ min: new Vector3(cx - 0.15, y0, cz - 0.10), max: new Vector3(cx + 0.15, y0 + 0.35, cz + 0.10) });
    const run = (bagBox: FlowSnapshot["bagBox"], sealedClumps: number): string => {
      const f = createFlow(); f.start();
      const ev = f.tick(base({ binLidAngle: 1.3, bagBox, sealedClumps }));
      return ev.some((e) => e.kind === "dispose-bag") ? "dispose" : f.errors.some((e) => e.id === "unsealed-dispose") ? "unsealed" : "none";
    };
    const off = run(bagAt(4.2, 3.0, 0.5), 3);       // 袋心偏到桶緣，足跡仍與桶口重疊
    const floor = run(bagAt(4.2, 3.0, 0), 3);        // 地上、足跡重疊但頂 0.35 < 0.40
    const beside = run(bagAt(4.5, 3.0, 0.5), 3);     // 懸在桶旁，最近點距 0.35
    const unsealed = run(bagAt(4.0, 3.0, 0.5), 0);
    push("train:bin-overlap", off === "dispose" && floor === "none" && beside === "none" && unsealed === "unsealed", `偏 0.2 ${off}、地上 ${floor}、旁邊 ${beside}、未封 ${unsealed}`);
  }
```

- [x] **Step 2: 確認失敗**

Run: `cd ../playground && npm run training-test 2>&1 | grep -A1 'train:bin-overlap'`
Expected: `"ok": false`（偏 0.2 用袋心距離判為 none）。

- [x] **Step 3: 實作 flow.ts 重疊規則**

```ts
/** 水平矩形（AABB 的 xz）與圓是否相交：圓心夾到矩形最近點，距離 ≤ r。 */
export function rectCircleOverlap(min: Vector3, max: Vector3, c: Vector3, r: number): boolean {
  const px = Math.min(Math.max(c.x, min.x), max.x), pz = Math.min(Math.max(c.z, min.z), max.z);
  return Math.hypot(px - c.x, pz - c.z) <= r;
}
```
tick 入桶：
```ts
      // 入桶：袋足跡與桶口圓盤重疊、袋任一部分在桶緣高度以上、蓋開
      if (s.bagBox && !steps.dispose && s.binLidAngle > BIN_OPEN && rectCircleOverlap(s.bagBox.min, s.bagBox.max, s.binTop, BIN_MOUTH_R) && s.bagBox.max.y >= s.binTop.y - BIN_RIM_TOL) {
```

- [x] **Step 4: snapshot.ts 填 scoopHeld／liveClumps**

```ts
      const scoop = findPlaced(ps, "scoop-and-scraper");
      const scoopHeld = scoop ? Object.entries(scoop.model.meshes).filter(([k, m]) => k.startsWith("held-") && !m.isDisposed()).length : 0;
      const liveClumps = scoop ? Object.entries(scoop.model.bodies).filter(([k, b]) => k.startsWith("clump-") && !b.isDisposed).length : 0;
      // return 內
        bagBox: box(findPlaced(ps, "cytotoxic-waste-bag"), "bag"), scoopHeld, liveClumps,
```

- [x] **Step 5: 黃金路徑加 hands 斷言**：`train:golden` 條件加 `&& flow.hands === "clean"`，detail 加 `、hands ${flow.hands}`。

- [x] **Step 6: 確認通過**

Run: `cd ../playground && npm run typecheck && npm run training-test 2>&1 | grep -c '"ok": true'`
Expected: 21（golden 仍 100 分且 hands clean——黃金路徑用 fakeGrab 抓 PPE 才有 grabbed，沒抓污染物件）。

- [x] **Step 7: Commit**

```bash
cd ../playground && git add src/training/flow.ts src/training/snapshot.ts scripts/training_test.ts && git commit -m "M18 訓練：入桶改袋足跡與桶口圓盤重疊＋袋頂高過桶緣（BIN_RIM_TOL 0.05）；快照 scoopHeld／liveClumps；training_test +1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 4: 情境提示 `hints.ts`（純函式）＋ 3 個測試

**Files:**
- Create: `../playground/src/training/hints.ts`
- Test: `../playground/scripts/training_test.ts`

**Interfaces:**
- Consumes: `FlowState`（steps、worn、hands、maxDisinfected、started、finished）、`FlowSnapshot`、`SIGN_DIST`、`CLEAN_MODELS`（flow.ts）。
- Produces: `export interface Hint { text: string; targets: string[] }`、`export function hintFor(flow: FlowState, s: FlowSnapshot): Hint | null`。

- [x] **Step 1: 寫失敗測試**（接在 train:bin-overlap 後；檔頭 import 加 `import { hintFor } from "../src/training/hints";`）

```ts
  {
    const f = createFlow();
    const idle = hintFor(f, base());
    f.start();
    const h = (over: Partial<FlowSnapshot>): { text: string; targets: string } => { const r = hintFor(f, base(over)); return r ? { text: r.text, targets: r.targets.join(",") } : { text: "", targets: "" }; };
    const out: string[] = [];
    const expect = (label: string, got: { text: string; targets: string }, word: string, target: string): void => { if (!got.text.includes(word) || !got.targets.includes(target)) out.push(`${label}: ${got.text} [${got.targets}]`); };
    expect("sign-far", h({}), "1.5 m", "spill-warning-sign");
    expect("sign-fold", h({ signPos: new Vector3(-0.5, 0, 0), signAngle: 1.0 }), "展開", "spill-warning-sign");
    f.tick(base({ signPos: new Vector3(-0.5, 0, 0), signAngle: 0 }));
    expect("ppe", h({}), "隔離衣", "ppe-set");
    f.tick(base({ grabbed: grabPpe("gown-pack") })); f.tick(base({ grabbed: grabPpe("goggles") })); f.tick(base({ grabbed: grabPpe("glove-box") }));
    expect("kit", h({}), "開蓋", "chemo-spill-kit");
    f.tick(base({ kitLidAngle: 1.5 }));
    expect("absorb", h({}), "粉", "absorbent-powder-shaker");
    f.tick(base({ puddle: { remaining: 0.5, disinfected: 0.1, wiped: false } }));
    expect("spray", h({ puddle: { remaining: 0.5, disinfected: 0.1, wiped: false } }), "扳機", "disinfectant-spray");
    f.tick(base({ puddle: { remaining: 0.5, disinfected: 0.8, wiped: false } }));
    expect("pad", h({}), "吸附墊", "absorbent-pad");
    f.tick(base({ puddle: { remaining: 0.5, disinfected: 0.8, wiped: true } }));
    expect("sweep", h({}), "貼地", "scoop-and-scraper");
    expect("pour", h({ scoopHeld: 3 }), "斗內 3 顆", "cytotoxic-waste-bag");
    expect("seal", h({ liveClumps: 3 }), "封袋", "cytotoxic-waste-bag");
    expect("bin", h({ sealedClumps: 3 }), "桶口", "cytotoxic-waste-bin");
    f.tick(base({ binLidAngle: 1.3, bagBox: { min: new Vector3(3.9, 0.5, 2.9), max: new Vector3(4.2, 0.85, 3.1) }, sealedClumps: 3 }));
    expect("doff", h({}), "脫除", "cytotoxic-waste-bin");
    f.doff();
    const done = hintFor(f, base());
    push("train:hint-steps", out.length === 0, out.join(" | ") || "全部分支命中");
    push("train:hint-idle", idle === null && done === null, `未開始 ${idle === null}、結束 ${done === null}`);
  }
  {
    const f = createFlow(); f.start();
    f.tick(base({ signPos: new Vector3(-0.5, 0, 0), signAngle: 0 }));
    f.tick(base({ grabbed: grabPpe("gown-pack") })); f.tick(base({ grabbed: grabPpe("goggles") })); f.tick(base({ grabbed: grabPpe("glove-box") }));
    f.tick(base({ grabbed: grabModel("absorbent-powder-shaker", "bottle") })); f.tick(base());
    const r = hintFor(f, base());
    push("train:hint-contaminated", !!r && r.text.startsWith("手已污染") && r.targets.includes("chemo-spill-kit"), r ? `${r.text} [${r.targets.join()}]` : "null");
  }
```

- [x] **Step 2: 確認失敗**

Run: `cd ../playground && npm run typecheck`
Expected: 找不到模組 `../src/training/hints`。

- [x] **Step 3: 實作 hints.ts**

```ts
// 教學模式情境提示：純函式，吃 flow 狀態＋快照回下一步文字與該高亮的模型名。無 DOM、無 Babylon 副作用。
import { CLEAN_MODELS, SIGN_DIST, STEP_ORDER, type FlowSnapshot, type FlowState } from "./flow";

export interface Hint { text: string; targets: string[] }

const SIGN_OPEN = 0.15, DISINFECT_MIN = 0.5; // 同 flow.ts 私有常數

function distXZ(ax: number, az: number, bx: number, bz: number): number { return Math.hypot(ax - bx, az - bz); }

export function hintFor(flow: FlowState, s: FlowSnapshot): Hint | null {
  if (!flow.started || flow.finished) return null;
  const next = STEP_ORDER.find((id) => !flow.steps[id]);
  if (!next) return null;
  let h: Hint;
  switch (next) {
    case "sign": {
      const near = !!s.signPos && distXZ(s.signPos.x, s.signPos.z, s.spillSite.x, s.spillSite.z) <= SIGN_DIST;
      h = near && Math.abs(s.signAngle) >= SIGN_OPEN
        ? { text: "立牌到位了，按「展開」把它立起來", targets: ["spill-warning-sign"] }
        : { text: "把警示立牌搬到潑灑點 1.5 m 內", targets: ["spill-warning-sign"] };
      break;
    }
    case "ppe": {
      const text = !flow.worn.has("gown") ? "把隔離衣包拖到人偶身上" : !flow.worn.has("goggles") ? "把護目鏡拖到人偶身上" : "最後把手套拖到人偶身上";
      h = { text, targets: ["ppe-set"] }; break;
    }
    case "kit": h = { text: "走到處理包旁按「開蓋」", targets: ["chemo-spill-kit"] }; break;
    case "absorb": h = { text: "抓起吸附粉罐，開蓋後 Q 後仰把粉倒在水漬上", targets: ["absorbent-powder-shaker"] }; break;
    case "disinfect-wipe":
      h = flow.maxDisinfected < DISINFECT_MIN
        ? { text: `抓起噴瓶對水漬按「扳機」噴消毒劑（已 ${Math.round(flow.maxDisinfected * 100)}%）`, targets: ["disinfectant-spray"] }
        : { text: "攤開吸附墊，拖到水漬上擦乾", targets: ["absorbent-pad"] };
      break;
    case "dispose":
      if (s.scoopHeld > 0) h = { text: `斗內 ${s.scoopHeld} 顆：抬到袋口上方 0.5 m，按 E 前傾倒進袋`, targets: ["scoop-and-scraper", "cytotoxic-waste-bag"] };
      else if (s.sealedClumps > 0) h = { text: "按「開蓋」打開桶，把袋提高到桶口上方", targets: ["cytotoxic-waste-bin", "cytotoxic-waste-bag"] };
      else if (s.liveClumps > 0) h = { text: "顆粒在袋裡了，走到袋旁按「封袋」", targets: ["cytotoxic-waste-bag"] };
      else h = { text: "鏟子貼地掃過凝固顆粒就會收進斗", targets: ["scoop-and-scraper"] };
      break;
    case "doff": h = { text: "走到廢棄物桶旁按「脫除防護裝備」", targets: ["cytotoxic-waste-bin"] }; break;
  }
  if (flow.hands === "contaminated" && h.targets.some((t) => CLEAN_MODELS.has(t))) {
    h = { text: `手已污染：先到處理包旁換手套。${h.text}`, targets: [...new Set(["chemo-spill-kit", ...h.targets])] };
  }
  return h;
}
```
（`switch` 覆蓋全部 `StepId`，TS strict 下 `h` 一定被賦值；若 tsc 抱怨「使用前未賦值」，把 `let h: Hint` 改為 `let h: Hint = { text: "", targets: [] }`。）

- [x] **Step 4: 確認通過**

Run: `cd ../playground && npm run typecheck && npm run training-test 2>&1 | grep -c '"ok": true'`
Expected: 24。

- [x] **Step 5: Commit**

```bash
cd ../playground && git add src/training/hints.ts scripts/training_test.ts && git commit -m "M18 訓練：hints.ts 情境提示純函式（七步分支、dispose 四分支、污染前置句）；training_test +3（24 項）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 5: 呈現層——模式切換、高亮、手部狀態、換手套、靜音

**Files:**
- Modify: `../playground/src/training/player.ts`、`ui.ts`、`main.ts`、`style.css`

**Interfaces:**
- Consumes: `flow.mode`、`flow.hands`、`flow.changeGloves()`、`hintFor()`。
- Produces: `Player.setHandsContaminated(v: boolean)`；`TrainingUiDeps` 加 `initialMode: TrainingMode`、`onStart(mode: TrainingMode)`、`onGloveChange()`、`hint: () => Hint | null`；`TrainingUi` 加 `mode(): TrainingMode`。

- [x] **Step 1: player.ts 手套髒色**

```ts
const GLOVE_DIRTY = new Color3(0.45, 0.2, 0.3);
// interface Player 加：
  setHandsContaminated(v: boolean): void;
// createPlayer 內：
  const gloveDirtyMat = new StandardMaterial("ppe-glove-dirty", scene); gloveDirtyMat.diffuseColor = GLOVE_DIRTY;
  let glovesOn = false, dirty = false;
  // wear:
      else if (item === "gloves") { glovesOn = true; recolor(GLOVE_PARTS, dirty ? gloveDirtyMat : gloveMat); }
  // undressAll 末尾：
      glovesOn = false; dirty = false;
  // 新方法：
    setHandsContaminated(v) { dirty = v; if (glovesOn) recolor(GLOVE_PARTS, dirty ? gloveDirtyMat : gloveMat); },
```

- [x] **Step 2: ui.ts**

deps／回傳型別：
```ts
import { ERROR_LABELS, STEP_LABELS, STEP_ORDER, type FlowState, type TrainingMode } from "./flow";
import type { Hint } from "./hints";
export interface TrainingUiDeps {
  flow: FlowState; inter: InteractionState;
  placed: () => Placed[]; playerPos: () => Vector3;
  initialMode: TrainingMode; hint: () => Hint | null;
  onStart(mode: TrainingMode): void; onReset(): void; onDoff(): void; onGloveChange(): void;
}
export interface TrainingUi { toast(text: string, bad?: boolean): void; refresh(): void; mode(): TrainingMode }
```
innerHTML：`t-nav` 前面加模式群組、面板加手部列：
```html
    <nav class="t-nav"><span class="t-mode" id="t-mode"><button data-mode="teach">教學</button><button data-mode="quiz">測驗</button></span><button class="accent" id="t-start">開始訓練</button>…
  <aside class="t-panel"><div class="t-hands" id="t-hands">手部：乾淨</div><h2>流程</h2>…
```
事件：
```ts
  let mode: TrainingMode = d.initialMode;
  const modeBtns = Array.from(el("t-mode").querySelectorAll<HTMLButtonElement>("button"));
  const paintMode = (): void => { modeBtns.forEach((b) => b.classList.toggle("on", b.dataset.mode === mode)); };
  modeBtns.forEach((b) => { b.onclick = () => { mode = b.dataset.mode as TrainingMode; paintMode(); }; });
  paintMode();
  el<HTMLButtonElement>("t-start").onclick = () => { d.onStart(mode); };
```
refresh 內改寫（quiz 靜音／隱藏）：
```ts
    const teach = !f.started || f.mode === "teach";
    el("t-mode").hidden = f.started;
    el("t-steps").innerHTML = STEP_ORDER.map((s, i) => `<div class="t-step ${f.steps[s] ? "done" : teach && s === next ? "active" : ""}">…`).join("");
    const reveal = teach || f.finished;
    el("t-errors").innerHTML = !reveal ? `<div class="t-err" style="color:#a8bbc7">測驗中：結束後揭露</div>`
      : f.errors.length ? f.errors.map(…).join("") : `<div class="t-err" style="color:#7fa99a">尚無</div>`;
    const hint = d.hint();
    el("t-hint").textContent = !f.started ? "選擇模式後按「開始訓練」：點滴袋會掉落破裂。" : f.finished ? "訓練完成。可重新開始。"
      : f.mode === "quiz" ? "測驗中：依流程處理" : hint ? `下一步：${hint.text}` : "";
    const hands = el("t-hands"); hands.textContent = f.hands === "contaminated" ? "手部：污染" : "手部：乾淨"; hands.classList.toggle("dirty", f.hands === "contaminated");
```
附近物件區：換手套按鈕（在 doff 按鈕之前）：
```ts
    const kit = findPlaced(ps, "chemo-spill-kit");
    const nearKit = !!kit && (() => { const q = at(kit); return Math.hypot(q.x - me.x, q.z - me.z) <= NEAR; })();
    const showGlove = f.started && !f.finished && nearKit && f.steps.kit && f.worn.has("gloves");
    const key = near.map((p) => p.entry.model).join(",") + (showDoff ? "|doff" : "") + (showGlove ? `|glove-${f.hands}` : "") + (f.finished ? "|done" : "");
    …
      if (showGlove) {
        const lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = "處理包備品"; box.appendChild(lbl);
        const b = document.createElement("button"); b.textContent = f.hands === "contaminated" ? "換手套（手部污染）" : "換手套"; b.onclick = () => d.onGloveChange(); box.appendChild(b);
      }
      if (!near.length && !showDoff && !showGlove) box.innerHTML = …
      el("t-summary").innerHTML = f.finished
        ? (f.mode === "quiz" ? `<div class="t-summary">完成 ${fmt(f.elapsed)}｜錯誤 ${f.errors.length}<br><b>${f.score}</b> 分</div>`
                             : `<div class="t-summary">完成 ${fmt(f.elapsed)}｜錯誤 ${f.errors.length}｜換手套 ${f.gloveChanges} 次<br>教學模式不計分</div>`)
        : "";
```
（`nearKey` 比對現已包含 hands，finished 時 summary 在 key 變動時重建——`|done` 已在 key 內。）回傳 `{ toast, refresh, mode: () => mode }`。

- [x] **Step 3: style.css**

```css
.t-mode{display:inline-flex;border:1px solid #55717a77;border-radius:9px;overflow:hidden}.t-mode button{border:0;border-radius:0;background:#17313dde}.t-mode button.on{background:#69e6c6;color:#143139}
.t-hands{font-size:12px;color:#7fa99a;padding:4px 8px;border:1px solid #69e6c655;border-radius:6px;margin-bottom:10px}.t-hands.dirty{color:#ffd3d3;background:#4a1f26;border-color:#f08a8a88}
```

- [x] **Step 4: main.ts**

```ts
import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HavokPlugin, HemisphericLight, HighlightLayer, Mesh, Scene, Vector3 } from "@babylonjs/core";
import { createFlow, ERROR_LABELS, REACH, type FlowState, type TrainingMode } from "./flow";
import { hintFor, type Hint } from "./hints";
…
  const initialMode: TrainingMode = new URLSearchParams(location.search).get("mode") === "quiz" ? "quiz" : "teach";
  let lastHint: Hint | null = null;
  const start = (mode: TrainingMode): void => {
    if (flow.started) return;
    flow.start(mode); releaseBag(placed); ruptureCountdown = RUPTURE_DELAY_STEPS; ui.toast(mode === "quiz" ? "測驗開始：點滴袋掉落！" : "點滴袋掉落！依流程處理");
  };
  // reset 內加：player.setHandsContaminated(false); lastHint = null;
  const ui = installTrainingUi({
    flow, inter, placed: () => placed, playerPos: () => player.position, initialMode, hint: () => lastHint,
    onStart: start, onReset: reset,
    onDoff: () => { if (flow.doff()) { player.undressAll(); ui.toast(flow.mode === "quiz" ? `測驗完成：${flow.score} 分` : "訓練完成（教學模式不計分）"); } },
    onGloveChange: () => { if (flow.changeGloves()) { player.setHandsContaminated(false); ui.toast("已換手套，手部乾淨"); } },
  });
  // 高亮：教學模式下一步目標模型的全部 mesh；targets 或模型實例變了才重建
  const hl = new HighlightLayer("t-hl", scene); hl.innerGlow = false; hl.blurHorizontalSize = 0.6; hl.blurVerticalSize = 0.6;
  let hlKey = "";
  const HL_SKIP = /^(grain|droplet|clump|held|puddle)/;
  const paintHighlight = (): void => {
    const targets = flow.mode === "teach" ? (lastHint?.targets ?? []) : [];
    const key = targets.map((t) => `${t}:${findPlaced(placed, t)?.model.root.uniqueId ?? -1}`).join(",");
    if (key === hlKey) return;
    hlKey = key; hl.removeAllMeshes();
    for (const t of targets) {
      const p = findPlaced(placed, t); if (!p) continue;
      for (const [k, m] of Object.entries(p.model.meshes)) if (!HL_SKIP.test(k) && !m.isDisposed() && m instanceof Mesh) hl.addMesh(m, new Color3(0.4, 0.95, 0.85));
    }
  };
```
事件迴圈：
```ts
    const loud = flow.mode === "teach";
    for (const e of flow.tick(snap.snapshot(1 / 60))) {
      if (e.kind === "wear") { …同前… }
      else if (e.kind === "dispose-bag") { …同前… }
      else if (e.kind === "hands") player.setHandsContaminated(e.state === "contaminated");
      else if (e.kind === "step") { if (loud) ui.toast("✓ 步驟完成"); }
      else if (e.kind === "error") { if (loud) ui.toast(`記錯：${ERROR_LABELS[e.id]}`, true); }
    }
    lastHint = flow.mode === "teach" ? hintFor(flow, snap.snapshot(1 / 60)) : null;
  // render observer：
  scene.onAfterRenderObservable.add(() => { if (++frames % 6 === 0) { ui.refresh(); paintHighlight(); } });
```
（`snap.snapshot` 一步呼叫兩次成本可接受；若想省，把 tick 用的快照存到變數重用：`const s = snap.snapshot(1 / 60); for (const e of flow.tick(s)) …; lastHint = … hintFor(flow, s)`——採此寫法。）
`window.__TRAINING__.start` 型別改 `start(mode?: TrainingMode): void`，實作 `start: (m = initialMode) => start(m)`。

- [x] **Step 5: 全套 gate**

Run: `cd ../playground && npm run typecheck && npm run training-test 2>&1 | grep -c '"ok": true' && npm run scene-test 2>&1 | tail -3 && npm run parkour-test 2>&1 | tail -3`
Expected: typecheck 零錯、24、scene-test pass、parkour-test pass。

- [x] **Step 6: Commit**

```bash
cd ../playground && git status --short && git add src/training/player.ts src/training/ui.ts src/training/main.ts src/training/style.css && git commit -m "M18 訓練呈現層：教學／測驗切換（?mode=quiz）、教學 HighlightLayer 目標高亮＋情境提示、測驗記錯靜音／錯誤區結束揭露、手部狀態列與手套髒色、處理包旁換手套按鈕

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 6: 瀏覽器驗證（教學高亮、測驗靜音、桶口偏移）＋ README

**Files:**
- Modify: `../playground/README.md`
- Evidence: `.img2babylon/shots/playground8-teach.png`、`playground8-quiz.png`

- [x] **Step 1: 起 dev server**

Run（背景）: `cd ../playground && npm run dev -- --port 5175 --strictPort`

- [x] **Step 2: 教學模式**：開 `http://localhost:5175/?scene=training`，按「開始訓練」（預設教學），等 3 s，截圖：立牌有青色外框、提示列「下一步：把警示立牌搬到潑灑點 1.5 m 內」。
  用 `window.__TRAINING__.flow.mode === "teach"` 與 `document.getElementById("t-hint").textContent` 佐證。存 `playground8-teach.png`。

- [x] **Step 3: 測驗模式**：開 `?scene=training&mode=quiz`，確認「測驗」鈕 `on`；按開始。用 API 佈置到 kit 步之後（同 training_test 黃金路徑 1–3：`moveModel` 立牌、PPE 三件 teleport 到玩家旁並以 `__PLAYGROUND_GRAB__`／或直接把 flow 抓取快照走完、`act(kit, "servo:lid.x").set(1.6)`）。
  真人：走到處理包旁（W），拖曳粉罐（污染）放下，再拖曳處理包蓋→ 期望：無 toast、`t-errors` 顯示「測驗中：結束後揭露」、`flow.errors` 含 `cross-contamination`、手部列紅「手部：污染」、人偶前臂變暗紫紅。
  附近物件出現「換手套（手部污染）」→ 按下 → 手部列變綠、toast「已換手套，手部乾淨」。
  之後 API 補完 4–6（同黃金路徑），走到桶旁按「脫除防護裝備」→ 總評「錯誤 1｜90 分」且錯誤區列出「手部已污染卻接觸乾淨物件」。截圖 `playground8-quiz.png`。

- [x] **Step 4: 桶口偏移**：任一模式，袋封好後真人提袋、開桶蓋，把袋心對到桶口中心偏 x 約 0.2 m 懸停（袋底高過桶緣）→ 期望 dispose 觸發、toast「廢棄物袋已投入桶」。記錄實際偏移量（`bagBox` 中心 − `binTop`）於 tasks/0030 notes。

- [x] **Step 5: 停 dev server**：`pkill -f "vite.*5175"`；截圖搬到 `.img2babylon/shots/`。

- [x] **Step 6: README 訓練段**：在「鏟刮板是接觸收納」段後加：

```md
- **教學／測驗模式**（M18）：開始前選「教學」（下一步目標物件青色高亮＋情境提示、記錯即時提示、不計分）或「測驗」（無高亮無提示、記錯不提示、錯誤與分數結束才揭露）；`?mode=quiz` 預設測驗。判定與分數兩模式相同。
- **手部污染**：抓過潑灑物件（點滴袋、粉罐、吸附墊、鏟刮板、噴瓶、廢棄物袋）手就污染（面板手部列變紅、手套變暗）；污染手再抓立牌、處理包、防護裝備組記「手部已污染卻接觸乾淨物件」（每次抓一筆）。
  處理包開著且穿了手套時，走到處理包旁按「換手套」歸零（不計分）；脫除也歸零。
- **入桶**：袋子的水平足跡與桶口圓（半徑 0.15）重疊、袋任一部分高過桶緣 5 cm 內、桶蓋開 → 入桶；不必把袋心對正。
- gate：`npm run training-test`（24 項）。
```
把「gate：`npm run training-test`（13 項…）」那行的 13 改為 24。

- [x] **Step 7: Commit**

```bash
cd ../playground && git add README.md && git commit -m "M18 README：教學／測驗模式、手部污染與換手套、桶口足跡判定；training-test 24 項

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

---

### Task 7: 部署、結案文件、記憶、handoff

**Files:**
- Modify: `ROADMAP.md`（M18 段插在 M17 之後、Parked 之前）、`docs/next-steps.md`
- Create: `tasks/0030-training-contamination-modes.md`
- Modify: `docs/superpowers/plans/2026-09-06-training-contamination-modes.md`（勾選）、`.remember/remember.md`
- Memory: `~/.claude/projects/-Users-wake-Desktop-local-three-img-to-babylon/memory/img2babylon-m18-lessons.md`＋`MEMORY.md` 一行

- [x] **Step 1: 部署**

Run: `cd ../player-garden && bash scripts/serve.sh && curl -s -o /dev/null -w '%{http_code}\n' https://<internal-host>/playground/`
Expected: 200；`grep -l "cross-contamination" ~/.local/share/player-garden/www/playground/assets/*.js` 有命中。

- [x] **Step 2: ROADMAP.md M18 段**

```md
## M18：訓練續——手部污染、教學／測驗模式、桶口與提示（2026-09-06 核准開工、同日結案）

設計文件 `docs/superpowers/specs/2026-09-06-training-contamination-modes-design.md`、計畫 `docs/superpowers/plans/2026-09-06-training-contamination-modes.md`。只改 `../playground`。

- [x] 0030 flow：手部污染（抓潑灑物件即污染、污染手抓立牌／處理包／PPE 記 `cross-contamination`，被抓 body 換了才記一次；處理包旁「換手套」歸零、脫除歸零）；
      `start(mode)` 保存 teach／quiz（判定與分數不分模式）；入桶改袋 AABB 足跡與桶口圓盤重疊＋袋頂高過桶緣 −0.05；快照 `bagBox`／`scoopHeld`／`liveClumps`。
      `hints.ts` 純函式情境提示（七步、dispose 四分支、污染前置句）。呈現層：教學 HighlightLayer 高亮＋提示＋即時記錯，測驗靜音、錯誤區結束揭露、分數只在測驗顯示；手部狀態列、手套髒色。
      training_test 24 項；scene-test／parkour-test 不變；瀏覽器：教學高亮截圖、測驗模式真人抓粉罐再抓處理包不 toast、換手套歸零、結束揭露 90 分；桶口偏 0.2 m 入桶。部署 player-garden。
```

- [x] **Step 3: tasks/0030**（依 0029 格式：標題、model 行、脈絡、分工、驗收、notes；notes 記瀏覧器實測數字與任何修正）。

- [x] **Step 4: docs/next-steps.md**：狀態行加 M18；候選 1「訓練續」改為剩餘項（膠囊撞飛小物件／觸控／物件層污染傳播／教學強制順序）；執行提醒加「flow 判定不分模式，模式差異只在 main／ui」「入桶看袋 AABB 足跡重疊，不是袋心」。

- [x] **Step 5: 勾選計畫全部 `- [ ]` → `- [x]`；commit img-to-babylon**

```bash
git add ROADMAP.md tasks/0030-training-contamination-modes.md docs/next-steps.md docs/superpowers/plans/2026-09-06-training-contamination-modes.md && git commit -m "M18 結案：ROADMAP／tasks 0030／next-steps；計畫全勾

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EgnRwhWUgpgrWcD8oVB9q6"
```

- [x] **Step 6: 記憶與 handoff**：寫 `img2babylon-m18-lessons.md`（只記非顯而易見的教訓：瀏覽器實測發現的問題與修法）＋ MEMORY.md 一行；更新 `.remember/remember.md`（State：M18 結案 commit；Next：等使用者選；Context：新陷阱）。

- [x] **Step 7: 兩 repo `git status` 乾淨、dev server 已停，向使用者結案回報**。
