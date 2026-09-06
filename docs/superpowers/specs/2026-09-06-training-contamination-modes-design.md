# M18 設計：訓練續——手部污染、教學／測驗模式、桶口判定與情境提示（2026-09-06）

狀態：使用者核准設計（範圍＝污染狀態機＋教學／測驗模式＋桶口放寬與面板提示；語意＝手部污染＋換手套歸零；模式＝教學高亮提示、測驗靜音只評分；
桶口＝袋足跡與桶口圓盤重疊；架構＝方案 A 狀態機內建＋提示獨立模組；成功標準＝headless gate ＋ 瀏覽器測驗模式走一遍）。
前作：M16 `2026-09-06-playground-training-scene-design.md`（訓練場景、七步狀態機、評分）、M17 `2026-09-06-scoop-contact-collect-design.md`（第六步真人走通）。

## 1. 目標與範圍

M16／M17 之後，訓練場景七步都能由真人走完，但教材面還缺三件事：
1. **交叉污染**沒有判定——碰過潑灑物件的手再去碰立牌、處理包、防護裝備桌上的東西，現實中是重大錯誤，場景裡不記錯。
2. **沒有教學與測驗之分**——初學者看不到下一步該碰哪件物件，熟手又得不到「不給提示」的測驗。
3. **桶口判定太緊**——`BIN_MOUTH_R` 0.15 要袋心對到桶口中心 ±0.15，對 0.30 m 寬的袋子幾乎要正中；面板也沒有「斗內幾顆、該抬高再倒」這類情境提示。

範圍：只改 `../playground`（`src/training/`、`scripts/training_test.ts`、README）；契約側 img-to-babylon 只更新 ROADMAP／tasks／next-steps。
不做（YAGNI）：物件層污染傳播（污染手碰過的立牌再污染別人）、教學模式強制順序阻擋、觸控、膠囊撞飛小物件。

成功標準：
- `npm run training-test` 新案例（§7）全綠，既有案例（含黃金路徑 100 分、`train:bin-top-lid`）不變；`scene-test`、`parkour-test`、`typecheck` 不變。
- 瀏覽器真實輸入：教學模式看得到目標高亮與情境提示；測驗模式抓粉罐後再抓立牌不 toast、面板錯誤區隱藏、結束總評才列出交叉污染。
- 部署到 player-garden。

## 2. 手部污染狀態機（`src/training/flow.ts`）

### 2.1 狀態
- `hands: "clean" | "contaminated"`（唯讀公開），`gloveChanges: number`（累計換手套次數，統計用、不計分）。
- `reset()` 歸 `clean`／0。

### 2.2 污染來源
`grabbed.model ∈ CONTAMINATED_MODELS`（現有六件：點滴袋、粉罐、吸附墊、鏟刮板、噴瓶、廢棄物袋）→ `hands = contaminated`。
不論是否穿齊 PPE 都污染；未穿齊另記既有 `no-ppe-contact`。踏入水漬不污染手（那是腳）。

### 2.3 新錯誤 `cross-contamination`
文案「手部已污染卻接觸乾淨物件」。條件：`hands === contaminated` 且 `grabbed.model ∈ CLEAN_MODELS`，
`CLEAN_MODELS = {"spill-warning-sign", "chemo-spill-kit", "ppe-set"}`。廢棄物袋、廢棄物桶屬廢棄物流，不算乾淨物件。
觸發方式：**邊緣觸發**——flow 記住上一步的 `grabbed.bodyKey`＋`model`，只在「被抓 body 換了」的那一步判一次（`err(..., repeat=true)`）；
同一次抓著不重複、放手再抓同一件再記一次。順序：先評估本步是否污染（2.2），再評估交叉污染——所以先抓乾淨物件再抓污染物件的同一步不會誤記。

### 2.4 `changeGloves(): boolean`
前提 `started && !finished && worn.has("gloves")`；成立則 `hands = clean`、`gloveChanges += 1`、回 true；不成立回 false。與 `doff()` 同型：回 boolean、不發事件，
副作用（toast、手套顏色）由 main 依回傳值處理。不是步驟、不加不扣分。
`doff()` 成功時也把 `hands` 歸 clean。

### 2.5 事件
`FlowEvent` 新增 `{ kind: "hands"; state: "clean" | "contaminated" }`，狀態改變那一步送出（含 changeGloves／doff 造成的 clean——這兩個是方法呼叫，
由 main 在呼叫後自行讀 `flow.hands` 更新視覺，不經事件）。

## 3. 教學／測驗模式

### 3.1 flow
`export type TrainingMode = "teach" | "quiz"`；`start(mode: TrainingMode = "teach")`，`flow.mode` 唯讀（未開始時為上次設定或預設 teach）。
**判定、記錯、分數在兩模式完全相同**——flow 只保存模式，不依模式分支；差異全在呈現層。

### 3.2 呈現差異（`main.ts`／`ui.ts`）
| | 教學 teach | 測驗 quiz |
|---|---|---|
| 目標高亮 | 下一步 targets 的模型 mesh 加 `HighlightLayer`（青色） | 無 |
| 提示列 `#t-hint` | `hintFor()` 情境提示 | 「測驗中：依流程處理」 |
| 記錯 | 即時紅 toast | 不 toast |
| 步驟完成 | toast「✓ 步驟完成」 | 不 toast（打勾仍顯示） |
| 面板錯誤紀錄 | 即時列出 | 顯示「結束後揭露」，結束才列出 |
| 總評 | 錯誤清單＋「教學模式不計分」 | 錯誤清單＋分數 |
| 步驟清單 | 打勾＋下一步 active | 打勾（不標 active） |

### 3.3 選擇模式
開始前面板兩顆切換鈕「教學」「測驗」（`.t-mode` 群組，選中加 `on`）；URL `?mode=quiz` 預設測驗（`main.ts` 讀 `URLSearchParams`）。
按「開始訓練」帶目前模式呼叫 `flow.start(mode)`；開始後切換鈕隱藏。重新開始回到選擇狀態並保留上次模式。

## 4. 情境提示（新 `src/training/hints.ts`，純函式）

```ts
export interface Hint { text: string; targets: string[] }   // targets＝模型名（SceneEntry.model），給高亮用
export function hintFor(flow: FlowState, s: FlowSnapshot): Hint | null;   // 未開始／已結束回 null
```

依 `STEP_ORDER` 第一個未完成步驟：

| 下一步 | 分支 | text | targets |
|---|---|---|---|
| sign | `signPos` 距 `spillSite` > SIGN_DIST | 把警示立牌搬到潑灑點 1.5 m 內 | spill-warning-sign |
| sign | 已近但 `|signAngle| ≥ SIGN_OPEN` | 立牌到位了，按「展開」 | spill-warning-sign |
| ppe | 缺 gown ／ goggles ／ gloves（依序） | 把隔離衣包拖到人偶身上 ／ 把護目鏡拖到人偶身上 ／ 最後把手套拖到人偶身上 | ppe-set |
| kit | — | 走到處理包旁按「開蓋」 | chemo-spill-kit |
| absorb | — | 抓起吸附粉罐，開蓋後 Q 後仰把粉倒在水漬上 | absorbent-powder-shaker |
| disinfect-wipe | `maxDisinfected < DISINFECT_MIN` | 抓起噴瓶對水漬按「扳機」噴消毒劑（已 xx%） | disinfectant-spray |
| disinfect-wipe | 否則 | 攤開吸附墊，拖到水漬上擦乾 | absorbent-pad |
| dispose | `scoopHeld === 0 && liveClumps === 0 && sealedClumps === 0` | 鏟子貼地掃過凝固顆粒就會收進斗 | scoop-and-scraper |
| dispose | `scoopHeld > 0` | 斗內 n 顆：抬到袋口上方 0.5 m，按 E 前傾倒進袋 | scoop-and-scraper, cytotoxic-waste-bag |
| dispose | `scoopHeld === 0 && liveClumps > 0` | 顆粒在袋裡了，走到袋旁按「封袋」 | cytotoxic-waste-bag |
| dispose | `sealedClumps > 0` | 按「開蓋」打開桶，把袋提高到桶口上方 | cytotoxic-waste-bin, cytotoxic-waste-bag |
| doff | — | 走到廢棄物桶旁按「脫除防護裝備」 | cytotoxic-waste-bin |

前置句：`flow.hands === "contaminated"` 且 targets 與 `CLEAN_MODELS` 有交集 → text 前加「手已污染：先到處理包旁換手套。」，targets 加 `chemo-spill-kit`。
flow 需公開 `maxDisinfected`（現為閉包內部變數）。

## 5. 快照與桶口判定（`snapshot.ts`／`flow.ts`）

### 5.1 `FlowSnapshot` 變更
- `bagPos: Vector3 | null` → **`bagBox: { min: Vector3; max: Vector3 } | null`**（袋 body `transformNode.getHierarchyBoundingVectors(true)`；dispose 後 null）。
- 新增 `scoopHeld: number`：scoop-and-scraper 模型 `meshes` 中鍵以 `held-` 開頭且未 dispose 的數量。
- 新增 `liveClumps: number`：scoop 模型 `bodies` 中鍵以 `clump-` 開頭且未 dispose 的數量。

### 5.2 入桶判定
```
binLidAngle > BIN_OPEN
&& rectCircleOverlap(bagBox.min.xz, bagBox.max.xz, binTop.xz, BIN_MOUTH_R)   // 圓心夾到矩形最近點，距離 ≤ r
&& bagBox.max.y >= binTop.y - BIN_RIM_TOL                                     // BIN_RIM_TOL = 0.05
```
`BIN_MOUTH_R` 維持 0.15（＝桶口實際半徑，bin w 0.3），語意從「袋心容許偏差」改為「桶口半徑」。
- 袋 0.30×0.20 提在桶上方、袋心偏到桶緣（0.15）仍有重疊 → 入桶。
- 袋放地上靠著桶：頂 0.35 < 桶緣 0.45 − 0.05 → 不入桶。
- 袋懸在桶旁但完全在桶口外（最近點距 > 0.15）→ 不入桶。
- 袋往下穿過桶口時，`max.y` 通過桶緣的那幾步一定成立 → 手放開讓袋掉進桶也算。
`sealedClumps > 0` → dispose 步＋`dispose-bag` 事件；否則 `unsealed-dispose`（既有）。

### 5.3 換手套按鈕
`ui.ts` 「附近物件」區：處理包在 NEAR 1.5 m 內、`flow.steps.kit`、`flow.worn.has("gloves")`、`started && !finished` → 加「換手套」按鈕 → `onGloveChange()`
→ main 呼叫 `flow.changeGloves()`，成功 toast「已換手套，手部乾淨」並更新手套顏色。
`nearKey` 要納入 `flow.hands`，讓按鈕集合隨狀態重建。

### 5.4 手部狀態視覺
- 面板頂部新增狀態列 `#t-hands`：「手部：乾淨」（綠）／「手部：污染」（紅底）。
- `player.setHandsContaminated(bool)`：手套材質色 `GLOVE`（紫）↔ `GLOVE_DIRTY`（暗紫紅 0.45,0.2,0.3）；未穿手套時不顯示（前臂還是原色）。

## 6. 檔案

```
../playground/src/training/flow.ts       hands／gloveChanges／changeGloves／cross-contamination／mode／maxDisinfected 公開／bagBox 入桶
../playground/src/training/hints.ts      新：hintFor
../playground/src/training/snapshot.ts   bagBox、scoopHeld、liveClumps
../playground/src/training/player.ts     setHandsContaminated
../playground/src/training/ui.ts         模式切換鈕、手部狀態列、換手套按鈕、依模式隱藏錯誤區／提示／總評
../playground/src/training/main.ts       ?mode、HighlightLayer 高亮 targets、依模式 toast、glove-change
../playground/src/training/style.css     .t-mode、.t-hands、高亮無需 CSS
../playground/scripts/training_test.ts   §7 新案例、bagBox 取代 bagPos
../playground/README.md                  訓練段：模式、污染、換手套、桶口
img-to-babylon: ROADMAP.md（M18）、tasks/0030-training-contamination-modes.md、docs/next-steps.md、.remember/remember.md
```

## 7. 測試（`training_test.ts`，純快照，不需 Havok 除既有黃金路徑）

| id | 內容 |
|---|---|
| train:hands-contaminate | 抓粉罐一步 → `hands === contaminated`、事件 `hands`；再 tick 無 grabbed 仍污染 |
| train:cross-contamination | 污染後抓立牌 → 一筆錯；同一 body 連 tick 60 步仍一筆；放手（null）再抓立牌 → 兩筆；抓廢棄物袋不記 |
| train:cross-order | 乾淨手同一步抓立牌 → 無錯；下一步抓粉罐再下一步抓立牌 → 一筆 |
| train:glove-change | 未穿手套 `changeGloves()` false；穿齊後污染→ true、hands clean、gloveChanges 1；再抓粉罐又污染 |
| train:doff-clears-hands | dispose 完成後污染手 doff → clean |
| train:mode | `start("quiz")` → mode quiz；同一串快照在 teach／quiz 兩個 flow 的 steps／errors／score 相同 |
| train:hint-steps | 每個未完成步驟 `hintFor` 非 null 且 targets 非空；sign 兩分支、disinfect 兩分支、dispose 四分支文字含關鍵詞（「展開」「扳機」「封袋」「桶口」「斗內 3 顆」） |
| train:hint-contaminated | 污染手＋下一步 kit → text 以「手已污染」開頭、targets 含 chemo-spill-kit |
| train:hint-idle | 未開始／結束回 null |
| train:bin-overlap | 袋心偏 (0.2, 0) 提在桶上 → dispose；袋在地上靠桶（max.y 0.35）→ 不；袋懸桶旁最近點距 0.2 → 不；袋心正對但 sealed 0 → unsealed-dispose |
| train:golden | 既有黃金路徑改讀 bagBox，仍七步 100 分、hands 最後 clean |

既有 14 項保留（`train:dispose` 改用 bagBox）。預計 24 項。

## 8. 瀏覽器驗證

dev server 5175；`?scene=training&mode=quiz`。
1. 教學：開始 → 截圖立牌高亮＋提示列「把警示立牌搬到潑灑點 1.5 m 內」→ `playground8-teach.png`。
2. 測驗：API 佈置到 kit 步之後（穿齊 PPE），真人抓粉罐（污染）、再抓處理包蓋或立牌 → 期望無 toast、錯誤區「結束後揭露」；走到處理包旁按「換手套」→ 手部狀態列變綠；
   之後 API 補完流程到 doff → 總評列出「手部已污染卻接觸乾淨物件」＋分數 90 → `playground8-quiz.png`。
3. 桶口：真人提袋偏 0.2 m 懸到桶口 → dispose。

## 9. 風險

- `HighlightLayer` 對多 mesh 模型要逐 mesh `addMesh`；歸位換新 `BuiltModel` 後要重加——每次 targets 或 placed 實例變動時清掉重建（以 targets 字串＋model 參照為鍵）。
- `getHierarchyBoundingVectors` 每步呼叫兩次（袋、桶）成本可接受（M16 已對桶這麼做）。
- 邊緣觸發用 `bodyKey+model` 字串比對；grab 換手（放手再抓）中間至少一步 `grabbed === null`，符合放手再抓再記一次的語意。
