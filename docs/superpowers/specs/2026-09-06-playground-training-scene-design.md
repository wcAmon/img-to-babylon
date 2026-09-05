# M16 設計：playground 訓練場景（玩家走站＋流程檢核）（2026-09-06）

狀態：使用者核准設計方向（走近＋滑鼠抓取、順序檢核記錯不阻擋、PPE 拿到身上就算穿、新 `?scene=training`、
由本 session 連同提交另一 session 的未追蹤檔）。
前作：M13 `2026-09-05-playground-grab-lift-design.md`、M14 `2026-09-05-playground-cross-model-interactions-design.md`、
M15 `2026-09-06-playground-interactions-2-design.md`；跑酷段（另一 session）`../playground/docs/superpowers/specs/2026-09-05-parkour-design.md`。

## 1. 目標與範圍

M10–M15 已有十件物件、抓取抬高傾斜、跨模型互動，清理流程在沙盒可完整走完，但沒有「教學」：任何順序都能做、沒有對錯、
物件擠在 2 m 內、鏡頭自由飛。本里程碑把它變成訓練場景：

- 新增 `?scene=training`（**首頁預設**進入）；沙盒 `?scene=chemo` 與跑酷 `?scene=parkour` 保留為連結，行為不變。
- 玩家操控人偶在約 10×10 m 病房走動，物件分散成五個站點，得走過去才抓得到。
- 七步流程即時打勾、記錯、結束評分；**順序不阻擋**，跳步記一筆錯誤。
- 只改 `../playground`；契約側（img-to-babylon viewer／forge／grimoire）不動。
- 前置：另一 session 的未追蹤檔（`src/chemo.ts`、`src/parkour/`、`public/parkour/`、`scripts/{generate_parkour,prepare_parkour}.py`、
  `scripts/parkour_test.ts`、`docs/`、`.gitignore`／`package.json`／`tsconfig.json`／`README.md`／`src/main.ts` 的修改）
  由本 session 先整批提交（前提 `npm run typecheck && npm run scene-test && npm run parkour-test` 全綠），新場景才能 import 跑酷玩家。

不在範圍：觸控操作（抓取本來就要滑鼠）、跳躍、新模型、PPE 脫除順序評分、多人。

## 2. 場景佈局 `src/training/world.ts`

俯視座標（m，+z 為房間深處）；玩家出生在門口 `(0, 0, −4.5)` 面向 +z。

| 站 | 位置 | 內容 |
| --- | --- | --- |
| 潑灑點 | `(0, 0)` | 點滴架（純視覺立柱＋橫桿，STATIC），點滴袋起始掛在 1.4 m 高；「開始訓練」後掉落，落地 60 步後自動 `rupture:bag` |
| A 示警 | `(−3.5, 3)` | 警示立牌，出廠**折疊**（spawn 後 `servo:panel-back.x` set 0.56）靠牆 |
| B 防護 | `(−4, −3)` | 防護裝備組四件放在 0.75 m 高的桌面（STATIC box 1.0×0.75×0.6） |
| C 處理包 | `(3.5, −3)` | 處理包（蓋關）＋粉罐、吸附墊、鏟刮板、噴瓶排在旁邊地面 0.5 m 間距（箱高 0.13 裝不下工具，開箱是象徵步驟） |
| D 廢棄物 | `(4, 3)` | 廢棄物桶＋廢棄物袋（間距 0.6） |

- 地板 10×10 m：沿用 chemo.ts 的磁磚 DynamicTexture 做法（1 m 粗格、10 cm 細格，WRAP），摩擦 0.7。
- 四面矮牆 0.8 m 高、0.1 m 厚（STATIC），擋物件飛出；不做天花板。
- 光照：HemisphericLight＋DirectionalLight（同跑酷，不開陰影以保 fps）。
- `TRAINING_SCENE: SceneEntry[]` 餵 `spawnAll(scene, entries)`（`scene.ts` 已支援自訂清單，不改）。

## 3. 玩家 `src/training/player.ts`

重用 `src/parkour/controller.ts` 的 `ParkourController`（Havok `PhysicsCharacterController` 膠囊）與 `src/parkour/figure.ts` 的
`FigurePose`／`sampleClip`／`validateClip`，動作檔 `public/parkour/{run,jump}-pose.json`（只用 run；空中姿勢不需要）。

- action-figure `factory(scene, { physics: false, physicsScale: 17 })` → 身高 0.097 × 17 ≈ 1.65 m。
  `FigurePose` 全部尺寸由 `model.physicsScale` 讀，無硬編碼（計畫內含檢查點：S=17 下 `maxJointError() < 1e-6`）。
- 膠囊：`ParkourController` 目前把膠囊尺寸寫死（高 1.06、半徑 0.19、腳底偏移 0.53）。**改成建構子選項**
  `{ capsuleHeight, capsuleRadius, strength }`（預設值不變，跑酷行為不變）；訓練用高 1.65、半徑 0.25、`characterStrength 30`
  （跑酷 70 會把 0.45 m 桶推倒）。
- 輸入：WASD 走 1.7 m/s、Shift 跑 3.5 m/s；**不接 Space**，`jump` 永遠 false。
- 鏡頭：`ArcRotateCamera` 跟隨（target 指玩家胸口 `feet + (0, 1.1, 0)`，Lerp 12/s），半徑 2.5–7、beta 0.55–1.42，
  移除鍵盤輸入；拖曳空白處轉鏡頭、拖曳物件抓取（同 M13：pick 到 body 就 `camera.detachControl()`）。
- 對外介面：
  ```ts
  export interface Player {
    readonly position: Vector3;          // 腳底世界座標（controller.feet）
    readonly chest: Vector3;             // position + (0, 1.1, 0)
    setKeys(keys: ReadonlySet<string>): void;
    tick(dt: number, cameraForward: Vector3): void;
    wear(item: PpeItem): void;           // 換色
    undressAll(): void;                  // 恢復原色
    teleport(p: Vector3): void;          // 測試用
  }
  export type PpeItem = "gown" | "goggles" | "gloves";
  export function createPlayer(scene: Scene, spawn: Vector3, model: BuiltModel, run: Clip, opts?): Player;
  ```
  換色：`gown` → torso／upper-arm-l／upper-arm-r 的 mesh material 換成藍 `(0.35, 0.55, 0.85)`；`goggles` → head 加一條深灰帶
  （小 box 貼在 head 前、跟隨 head 節點）；`gloves` → forearm-l／forearm-r 換紫 `(0.55, 0.35, 0.75)`。原 material 記在 Map 供 `undressAll` 還原。

## 4. 抓取範圍（`src/grab.ts`，向後相容）

`installGrab(scene, camera, canvas, placed, opts?)` 新增第五個選填參數：

```ts
export interface GrabOptions {
  reach?: () => { origin: Vector3; radius: number };  // 每次呼叫取最新玩家位置
  onReject?: (reason: "too-far") => void;              // UI toast
  onBegin?: (body: PhysicsBody, placed: Placed | undefined) => void;  // 流程記錯用
}
```

- POINTERDOWN：`pickedPoint` 與 `reach().origin` 的**水平**距離 > radius → 不 `begin`，呼叫 `onReject("too-far")`。
- POINTERMOVE：`project()` 後把目標點夾進以 origin 為中心、半徑 radius 的水平圓（y 不夾）；不能隔空甩物件。
- chemo.ts 不傳 opts → 行為與 M15 完全相同；`__PLAYGROUND_GRAB__` 照掛。
- 半徑 1.2 m（玩家腳底到手點）：水漬足跡最大半徑約 0.3 m，站在足跡外 0.5 m 仍可撒粉。

## 5. PPE 穿脫 `src/training/flow.ts`（穿）＋ `ui.ts`（脫）

每個物理步（在 `flow.ts` 的 `tick` 內）：

- 被抓 body（`ctl.body`）屬於 `ppe-set` 且其 `absolutePosition` 與玩家 `position` 的水平距離 ≤ 0.45 m → **穿上**：
  `ctl.end()`、`body.dispose(); transformNode.dispose()`（同 collect 的作法，消費者已過濾 `isDisposed`）、
  `player.wear(item)`、記入 `worn`。
- 對應：`gown-pack` → gown；`goggles` → goggles；`glove-box` **或** `glove` → gloves（任一件即可，另一件穿後不再計）。
- 三件齊 → 第 2 步完成。手套不是三件中最後穿的 → 記錯 `gloves-not-last`。
- 脫除：`ui.ts` 在玩家距桶中心 ≤ 1.5 m 且三件已穿且第 6 步已完成時顯示「脫除防護裝備」按鈕；按下 → `player.undressAll()`、
  `flow.doff()` → 第 7 步完成、流程結束。

## 6. 流程檢核與計分 `src/training/flow.ts`（純邏輯、headless 可測）

```ts
export type StepId = "sign" | "ppe" | "kit" | "absorb" | "disinfect-wipe" | "dispose" | "doff";
export type ErrorId = "no-ppe-contact" | "stepped-in-spill" | "no-sign" | "gloves-not-last" | "wipe-before-disinfect" | "unsealed-dispose";
export interface FlowSnapshot {
  player: Vector3;                                   // 腳底
  spill: { center: Vector3; radius: number } | null; // InteractionState 曝光（見下）
  signPos: Vector3 | null; signAngle: number;        // panel-back 世界座標、servo 角
  kitLidAngle: number;
  puddle: InteractionState["puddle"];
  sealedClumps: number;
  binLidAngle: number; binTop: Vector3;              // 桶蓋角、桶口中心世界座標（rim y）
  bagPos: Vector3 | null; bagSealed: boolean;        // 廢棄物袋 body 位置；封過袋（sealedClumps>0 時 true）
  grabbed: { model: string; body: PhysicsBody } | null;
  dt: number;
}
export interface FlowState {
  readonly started: boolean; readonly finished: boolean; readonly elapsed: number;
  readonly steps: Record<StepId, boolean>;
  readonly errors: { id: ErrorId; at: number }[];  // at＝秒
  readonly worn: ReadonlySet<PpeItem>;
  readonly score: number;                          // 100 − 10×errors.length，下限 0
  start(): void; doff(): void; reset(): void;
  tick(s: FlowSnapshot): FlowEvent[];              // 回傳本步新事件（step 完成／error／wear／dispose）供 UI toast
}
```

完成條件：

| 步 | 條件 |
| --- | --- |
| sign | `|signPos − spill.center|_xz ≤ 1.5` 且 `signAngle < 0.15` |
| ppe | `worn.size === 3` |
| kit | `kitLidAngle > 1.2` |
| absorb | `puddle.remaining ≤ 0.6`（約 18 顆以上落在足跡） |
| disinfect-wipe | 曾達 `puddle.disinfected ≥ 0.5` **之後** `puddle.wiped` |
| dispose | `bagSealed` 且袋中心進入桶口柱：水平距 `binTop` ≤ 0.15、`y ≥ binTop.y` 且 `binLidAngle > 1.0` → flow 回傳 `dispose-bag` 事件，`main.ts` 收到後 dispose 袋 body（同 collect 作法）；步完成 |
| doff | `doff()` 被呼叫且前六步皆完成；`finished = true` |

記錯（每種只記一次，`stepped-in-spill` 每次進入足跡記一次）：

| 錯誤 | 觸發 |
| --- | --- |
| no-ppe-contact | `worn.size < 3` 時 `grabbed.model` ∈ {chemo-iv-bag, absorbent-powder-shaker, absorbent-pad, scoop-and-scraper, disinfectant-spray, cytotoxic-waste-bag} |
| stepped-in-spill | 玩家腳底進入 `spill` 足跡（半徑 + 0.25 膠囊）且 `worn.size < 3`；離開再進入再記 |
| no-sign | `absorb` 開始（`puddle.remaining < 1`）時 `steps.sign` 仍 false |
| gloves-not-last | 穿手套時 gown 或 goggles 尚未穿 |
| wipe-before-disinfect | `puddle.wiped` 變 true 時歷史最高 `disinfected < 0.5` |
| unsealed-dispose | 袋進入桶口柱但 `bagSealed` false（不 dispose、不完成 dispose 步） |

`InteractionState` 需多曝光 `readonly spill: { center: Vector3; radius: number } | null`（足跡中心與原始足跡半徑；
擦拭後污染已清除，`wiped` 為 true 時回 `null`）。`interactions.ts` 只加這個 getter。

計時：`start()` 起算到 `finished`。分數 = `max(0, 100 − 10 × errors.length)`。

## 7. UI `src/training/ui.ts`＋`src/training/style.css`

- 左上：標題「化療潑灑處理訓練」、計時 `mm:ss.s`、目前步驟提示一行（下一個未完成步的說明）。
- 右側面板：七步清單（✓ 完成／● 進行中／○ 未做）；下方「錯誤紀錄」列 `[mm:ss] 說明`；完成後換成總評卡（時間、錯誤數、分數、「重新開始」）。
- 底部按鍵說明：WASD 移動｜Shift 跑｜拖曳物件＝抓取（1.2 m 內）｜Shift 拖曳＝上下｜滾輪＝高度｜Q／E＝傾斜｜拖曳空白處＝鏡頭。
- 中央 toast（步完成、記錯、太遠）。
- 「開始訓練」（未開始時）／「重新開始」（隨時）：重新開始＝所有 `placed.respawn()`、玩家回出生點、`flow.reset()`、袋重掛回架上。
- 物件旁的操作按鈕（開蓋、噴灑、踩踏板、封袋…）：**靠近才顯示**——面板下方「附近物件」區列出距玩家 ≤ 1.5 m 的站點物件及其按鈕
  （同 ui.ts 現有各模型按鈕集合，去掉推倒／拋起／摔落／破裂／歸位）。按鈕邏輯抽成 `src/actions.ts`
  `modelButtons(p: Placed, ctx): { label: string; run(): void }[]` 讓 `ui.ts`（沙盒）與 `training/ui.ts` 共用；沙盒面板輸出不變。
- 樣式獨立 `training/style.css`（深色、與跑酷同語彙），`body.training` 作用域，不影響沙盒 index.html 內嵌樣式。

## 8. 檔案與相依

新增：`src/training/{main,world,player,flow,ui}.ts`、`src/training/style.css`、`src/actions.ts`、`scripts/training_test.ts`、
package.json `"training-test": "node --import tsx scripts/training_test.ts"`。
修改：`src/main.ts`（預設 → training、`?scene=chemo` → chemo、`?scene=parkour` → parkour；三個場景互連）、
`src/grab.ts`（GrabOptions）、`src/interactions.ts`（`spill` getter）、`src/parkour/controller.ts`（膠囊選項）、
`src/ui.ts`（改用 `actions.ts`，輸出不變）、`README.md`（三場景說明）。

依賴方向：`training/*` → `parkour/{controller,figure}`、`scene`、`grab`、`grabController`、`interactions`、`actions`；
`chemo.ts` 只在前置 commit 中進版控，之後仍零改動。

## 9. headless gate `scripts/training_test.ts`

同 scene_test 骨架（NullEngine＋Havok、`spawnAll(scene, TRAINING_SCENE)`、`installInteractions`、`createGrabController`）；
玩家用假物件 `{ position }` 直接設座標（不建膠囊——`PhysicsCharacterController` 在 NullEngine 可用但流程判定只需位置）。
物件搬移用 M15 的 `teleport`（disablePreStep 兩步）。

1. `train:layout`：五站物件皆落地靜止（30 步後 |v| < 0.05），兩兩水平距離 ≥ 2.5 m（站內物件除外）。
2. `train:reach`：`begin` 前 `reachOk(pickedPoint, origin, 1.2)` 對站 C 粉罐、玩家在門口 → false；玩家走到 1.0 m → true
   （純函式 `withinReach` 從 grab.ts 匯出）。
3. `train:wear`：flow.tick 餵 `grabbed = gown-pack`、袋位置在玩家旁 0.3 m → 回傳 `wear:gown` 事件、`worn` 含 gown；依序 goggles、gloves → `steps.ppe`、零錯。
4. `train:gloves-first`：新 flow，先手套 → `errors` 含 `gloves-not-last`。
5. `train:no-ppe-contact`：新 flow，未穿就 `grabbed = shaker` → 記錯一次；連續 60 步只記一次。
6. `train:stepped-in-spill`：spill 足跡 r 0.3，玩家踏進、出、再進 → 記 2 次。
7. `train:golden`：真物理黃金路徑——立牌 teleport 到潑灑點 1 m 並 `servo:panel-back.x` set 0；三件穿上；kit lid set 1.6；
   袋 rupture、36 顆粒落足跡（M14 佈點）；24 滴噴霧；墊子蓋上 150 步；10 顆凝固顆粒入袋 `sealClumps(collect)`；
   袋 teleport 到桶口上方 0.05、桶蓋 set 1.5 → `dispose-bag` 事件；`doff()` → `finished`、七步全 true、`errors.length === 0`、`score === 100`。
8. `train:wipe-before-disinfect`：另建 flow，餵 `puddle.wiped = true` 且 disinfected 最高 0.2 → 記錯。
9. `train:unsealed-dispose`：`bagSealed = false` 的袋進桶口柱 → 記錯、不完成 dispose 步。
10. `train:s17-figure`：action-figure `physicsScale 17`、`FigurePose.apply` 跑 run clip 60 幀 → `maxJointError() < 1e-6`、腳底 y 誤差 < 1e-3。

既有 `scene-test` 34 項、`parkour-test` 不動。

## 10. 證據與文件

- playwright：`npm run dev`（5175）→ 真實輸入層（鍵盤 WASD 用 `window.dispatchEvent(new KeyboardEvent)`、抓取用 `canvas.dispatchEvent(PointerEvent)`、
  pointermove `button: -1`、低處物件先滾輪抬高）演完整七步，截 `.img2babylon/shots/playground6-{room,ppe,absorb,done}.png`；
  回報實際分數與錯誤（若演出時犯錯照實記）。
- ROADMAP M16、`tasks/0028-playground-training-scene.md`、`docs/next-steps.md` 更新；playground README 三場景說明**這次一併提交**
  （前置 commit 已把另一 session 的 README 段落收進版控）。
- `npm run typecheck && npm run scene-test && npm run parkour-test && npm run training-test && npm run serve` 重部署。

## 11. 風險

- 膠囊撞小物件（墊、鏟、噴瓶）會踢飛：站內物件距通道 ≥ 0.5 m、strength 30；仍踢到就讓使用者重新開始（歸位）。
- `PhysicsCharacterController` 與模型 body 的碰撞群組：模型活動件 `membership 2 / collide ~2`、容器 `8 / ~0`；膠囊預設全碰，應可推物，計畫內含 headless 檢查（膠囊前進撞桶 → 桶位移 < 0.05）。
- 人偶 ×17 若 `FigurePose` 有隱含尺度假設，`train:s17-figure` 會抓到；抓到就改 figure.ts（另一 session 的檔，屆時已在版控，可改）。
- 袋 0.30 對桶口 0.30：以「進入桶口柱即入桶」規則迴避，不做袋形變。
- 另一 session 若仍在改 playground：前置 commit 前 `git status` 逐檔確認並告知使用者；之後我只 add 自己的檔。

## 12. 実測補記（2026-09-06 結案）

- gate：`training-test` 13 項（spec §9 的 10 項合併／拆分：reach 用純函式 `withinReach`／`clampToReach`；多出 doff-gate、bag-drop、player）。黃金路徑：sign 角 −0.052、
  absorb remaining 0.35（36 顆）、disinfected 1.00（24 滴）、wipe true、sealed 10、binTop (4.00, 0.45, 3.00)、袋 dispose、100 分。
- 瀏覽器真實輸入層七步：0 錯 100 分；但**第六步的顆粒入袋用了 `__PLAYGROUND_GRAB__.begin` API**——鏟刮板貼地掃過顆粒 0 顆入斗（鏟底碰撞盒離地 ~4 mm、前唇無斜角），
  顆粒 `isPickable=false` 也不能直接抓。§11「膠囊推物 headless 檢查」未做，改瀏覧觀察：膠囊確實會把吸附墊撞到牆邊。
- 設計偏離：`FlowSnapshot.grabbed` 改 `{ model, bodyKey, position }`（flow 零 Babylon body 依賴）；`bagSealed` 不進快照，flow 直接看 `sealedClumps > 0`；
  擦拭過早（消毒 < 0.5）仍完成 `disinfect-wipe` 步並記錯（否則流程卡死）；面板「附近物件」改依主 body 目前位置；§10 的 `npm run serve` 已過時，部署改 `../player-garden/scripts/serve.sh`。
- 陷阱：ArcRotateCamera `target =` setter 重算角度／半徑（跟隨要 `LerpToRef` 就地改）；`lift` 夾 y ≥ 0；子節點 body teleport 用 `setAbsolutePosition`；從上方 pick 粉罐會抓到蓋子。
