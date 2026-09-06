# M17 設計：鏟刮板接觸收納（collect contact ＋ pour collected）（2026-09-06）

狀態：使用者核准設計方向（結案標準＝契約 gate ＋ 訓練第六步真人走通；方案＝接觸即收，不走純幾何、不做手動按鈕）。
前作：M12 `2026-09-05-chemo-spill-set-3-design.md`（pour 擴充、collect 契約）、M13 `2026-09-05-playground-grab-lift-design.md`（鏟起倒進袋用傳送球）、
M16 `2026-09-06-playground-training-scene-design.md` §12（第六步顆粒入袋靠 API 的誠實紀錄）。

## 1. 目標與範圍

M16 訓練場景七步中，唯一還靠 `__PLAYGROUND_GRAB__.begin` API 完成的是第六步「凝固顆粒鏟入廢棄物袋」：鏟刮板貼地掃過顆粒 0 顆入斗。
本里程碑讓玩家用鏟刮板**真的**把地上的顆粒收進斗、走到袋邊前傾倒進袋、封袋計數，全程走瀏覽器真實輸入層。

範圍：契約側（forge 驗證器＋grimoire）擴充兩個既有欄位的選填鍵；鏟刮板 spec／factory 實作；三支 viewer gate；playground 封袋計數與 scene_test；
文件與部署。不改 collider、不改顆粒、不改訓練狀態機。

## 2. 為什麼不是純幾何：探針實測

丟棄式探針（headless Havok，鏟姿態鎖定貼地、速度伺服前推 0.5 m，7 顆 10 mm／3 g／摩擦 0.8／阻尼 2.0 的顆粒排在鏟前，三車道 4 cm 間距）：

| 變體 | 0.1 m/s | 0.25 m/s | 0.5 m/s |
|---|---|---|---|
| 現況 2.5 mm box 底板 | 0 | 3 | 4 |
| 楔形 convex hull 前唇（4 cm 長、刀鋒） | 0 | 0–1 | 2 |
| 階梯前唇（5 階 0.5 mm 薄 box、run 6–10 mm） | 0 | 0 | 0 |
| 薄唇 box 1.0／1.5 mm 突出 1.5 cm | – | 0 | 0 |
| 整塊底板改 1.0／1.5／2.0 mm | 0 | 4 | 4 |
| 顆粒摩擦拉到 2.0 | – | 4 | – |
| 推板把顆粒推向靜置的鏟口（0.1／0.25／0.5） | 0 | 0（顆粒從兩側擠出） | 0 |

判別實驗：
- 單獨一顆顆粒（放 0.12 或 0.36 m 處）**永遠爬不上**現況 2.5 mm 唇；7 顆時永遠是「前面還有顆粒」的前 3 顆爬上、第 4 顆跳到 6.8 mm 掉回、其餘只被推走。
  把爬進斗的顆粒即時移除或凍結、把顆粒整批後移 16 cm、單車道、加大間距、settle 5 或 300 步、每步喚醒——結論全部相同，所以與斗內載重、睡眠、位置無關，是顆粒鏈互擠。
- 唇高 h 與球半徑 r 的靜力估計：唇邊接觸法線仰角 φ 滿足 sin φ = (r − h)/r；要抬起需推力 > mg／tan φ。h = 2.5 mm、r = 5 mm → φ = 30°、需 1.73 mg，
  而地面摩擦只能提供 0.8 mg（μ = 0.8）→ 穩態推不上，只有衝擊或互擠才偶爾跳上。要靠純幾何得 h < 1.1 mm 或斜面 < 39°，而 Havok 對 < 2 mm 的碰撞體直接失效（M8 教訓：cm 以下是數值地板；
  楔形 hull／薄 box 結果比現況更差）。

結論：在 physicsScale 1 的化療場景，剛體幾何無法穩定達到「掃 7 顆 ≥ 5 顆入斗」。改用契約層的**接觸收納**：唇比顆粒薄，碰到就進去——與 M12 collect「反向質量轉移」同一語意，只是觸發改為接觸。

## 3. 契約擴充（forge `validate_spec.py`＋grimoire `spec.md`／`physics.md`）

兩個既有欄位各加一個選填鍵；未填＝現行行為，M12 袋子與粉罐 spec 零改動。

### 3.1 `collect.trigger`

```json
"collect": { "trigger": "contact", "interior": { "size": [0.152, 0.07, 0.146], "offset": [0, 0.015, 0.007] }, "maxItemMass": 0.005 }
```

- `trigger`：`"manual"`（預設；set(1) 才收）| `"contact"`：每個物理步掃描，凡**不屬本模型、dynamic、0 < 質量 ≤ maxItemMass、質心在 interior 世界框內**的 body 立刻收走。
- 兩種 trigger 都必須掛 `collect:<bodyId>` actuator（contact 下 set(1) 是手動補收，冪等）。
- 驗證：`trigger` 若出現必須是兩值之一。

### 3.2 `pour.source`

```json
"pour": { "source": "collected", "tiltThreshold": 1.0, "ratePerSecond": 20, "direction": [0, 0, 1], "exitSpeed": 0.2 }
```

- `source`：`"declared"`（預設；倒預宣告的 `grains × grainMass`）| `"collected"`：倒出的是本 body collect 收進來的東西，**逐顆歸還原質量與原半徑**，本 body 質量同步減回。
- `source: "collected"` 時：`grains`／`grainMass` **不得出現**；同一 body **必須有 `collect`**；`ratePerSecond` 必填正數；`tiltThreshold`／`gate`／`direction`／`exitSpeed` 規則與 M11／M12 相同
  （無 tiltThreshold 仍必須有 gate）。
- 倒出的 body 命名 `bodies["clump-<i>"]`／`meshes["clump-<i>"]`，i 自 0 單調遞增、不重用（與粉罐／噴瓶的 `grain-<i>` 區分；消費者可靠前綴辨識來源）。
- 驗證錯誤訊息：`body {id} pour.source 必須是 declared 或 collected`、`body {id} pour.source collected 時不得有 grains／grainMass`、
  `body {id} pour.source collected 需要同 body 的 collect`。

### 3.3 factory 契約補充（grimoire/physics.md）

- contact 掃描在 `scene.onAfterPhysicsObservable`，與 M12 相同：先複製 `getBodies()` 陣列、排除本模型 body、`isDisposed`、非 DYNAMIC、質量不合。
- 收走一顆記 `{ mass, radius, color }`：radius 取 mesh `getBoundingInfo().boundingSphere.radiusWorld`（無 mesh 用 5 mm）、color 取 StandardMaterial diffuse（無則預設）。
  `body.dispose(); transformNode.dispose()`；本 body `setMassProperties({ mass: base + Σ, centerOfMass })`。
- 斗內顯示：factory 自有材質 `held-item`（顏色複製第一顆收進物；歸位重建不會踩到別人 dispose 的材質），mesh `held-<n>` 依序排格，容量滿即停收（鏟刮板 120）。
- source collected 的倒出：每倒一顆 pop 一筆記錄，在 factory 決定的出口點生成半徑＝記錄半徑的球、質量＝記錄質量、初速＝body 速度 + direction × exitSpeed；本 body 質量減回；`held-<n>` 最後一顆 dispose。
  節流、tilt／gate 判定與 declared 相同；`pour:<id>` set(1) 立即倒完剩餘（空斗無事）。
- 消費者提醒：所有讀 `bodies` 的地方跳過 `isDisposed`（M12 既有規則）；被 contact 收走的粉罐顆粒在粉罐 `bodies["grain-<i>"]` 仍有鍵但 isDisposed。

## 4. 鏟刮板 spec／factory（`viewer/models/scoop-and-scraper/`）

scoop body 加：

```json
"collect": { "trigger": "contact", "interior": { "size": [0.152, 0.07, 0.146], "offset": [0, 0.015, 0.007] }, "maxItemMass": 0.005 },
"pour": { "source": "collected", "tiltThreshold": 1.0, "ratePerSecond": 20, "direction": [0, 0, 1], "exitSpeed": 0.2 }
```

- 內腔：x ±0.076（側牆內側）、z −0.066（後牆內側）～ +0.080（**唇前 1 cm**）、y −0.02 ～ +0.05（鏟底離地 ≤ 2 cm 都算貼地；抓取 lift 夾 y ≥ 0 時手點貼地即滿足）。
- maxItemMass 0.005：粉罐顆粒 3 g、噴瓶液滴 2 g 都收；M13 測試球 5 g 剛好收。scraper body 不加 collect／pour。
- 排格：12 mm 間距、12（x）× 10（z）格，從後牆往前、由左到右填；y = 0.0025 + radius。滿 120 顆停收。
- 倒出點：唇中心局部 (0, 0.01, 0.07)，方向局部 +z（唇朝向），exitSpeed 0.2。tiltThreshold 1.0：前傾（鏟口向下）或側傾都算，與 pour 契約「局部 +y 對世界 +y 夾角」一致。
- factory 內 `COLLECT`／`POUR` 常數鏡射 spec（兩處必須一致，同粉罐做法）；actuators：`collect:scoop`（label 鏟起）、`pour:scoop`（label 傾倒）。
- collider、mesh、材質、質量、質心皆不變；check_colliders／Divine Eye 不重跑。reviewHistory 加一筆 pass `physics`：接觸收納＋倒出，附 gate 結果。

## 5. viewer gate（`viewer/scripts/`）

- `collect_test.ts`：讀 `collect.trigger`；contact 分支——丟 8 顆進內腔上方 0.30 m、袋外 2 顆，**不呼叫 set(1)**，300 步後 8 顆 isDisposed、質量 = mass + 8×0.005（1e-5）、
  `meshes` 中 `held-` 8 顆、袋外 2 顆不動；再 set(1) 質量不變；模型 dispose 後場景只剩 ground 與袋外 2 顆。manual 分支維持原樣。
- `pour_test.ts`：讀 `pour.source`；collected 分支——先以接觸收 6 顆（自內腔上方丟）；(A) 直立 120 步 `clump-` 0、質量 = mass + 6×0.005；(B) 繞局部 x 前傾 1.2 rad 靜置 → 300 步內 `clump-` 6 顆、
  質量回 mass（1e-5）、全部有限；(C) 空斗 set(1) 無事、`clump-` 仍 6；dispose 後無 `clump-`／`held-` mesh。declared 分支維持原樣（含噴瓶 A′／B′／C′）。
- 新 `sweep_test.ts <model> --spec`（通用：任何 body 有 `collect.trigger: "contact"`）：7 顆 10 mm／3 g／摩擦 0.8／阻尼 2.0 球放在內腔前緣前方地面 5～29 cm 三車道；body 姿態鎖定、
  貼地沿 `pour.direction`（無則局部 +z）以 0.25 m/s 推 0.5 m，停 60 步 → **收進 ≥ 5**（預期 7）、body 位置有限、質量 = mass + n×0.003。無 contact 的 spec 印「略過」PASS。
- 既有：`physics_test`、`actuation_test`（無宣告略過）照跑；`npx tsc --noEmit`。SKILL.md 第 5 步驗證命令列加 `sweep_test.ts`。

## 6. playground（`../playground`）

- `src/interactions.ts`：每步 `liveBodies(tools, "clump-")` 中尚未登記者 push 進 `clumps`（並設 clump 材質），封袋規則 E 因此能計到鏟子倒出的顆粒。
  簡化：凡鏟子收過再倒出的都算凝固顆粒（不追溯收進去前是否吸過液），寫進 README。
- 近物按鈕：`modelButtons` 對 pour kind 已產「傾倒」、collect kind 產「封袋」——後者文案對鏟子不對，改為依 actuator `label`（鏟起／傾倒）；袋子 label 仍是封袋。
- `scripts/scene_test.ts` M13 段：傳送進斗的 8 顆球會被接觸收走——改斷言「斗內 held 8、scoop 質量 +0.04」，抬高後前傾 → `clump-` 落袋 ≥ 6、封袋質量對；
  新增 `sweep:clumps`：7 顆凝固顆粒排在地面，鏟貼地掃過 → 收進 ≥ 5。
- `scripts/training_test.ts` golden 不改（它直接把 clump 放進袋）。訓練狀態機、UI、world 不改。
- README 已知限制段改寫：接觸收納語意、液滴也會被收。

## 7. 檔案

| 檔 | 動作 |
|---|---|
| `forge/validate_spec.py`、`forge/tests/test_validate_spec.py` | trigger／source 驗證＋TDD |
| `grimoire/spec.md`、`grimoire/physics.md` | pour／collect 節補 source／trigger、factory 契約 |
| `viewer/models/scoop-and-scraper/{spec.json,createScoopAndScraperModel.ts}` | collect contact＋pour collected |
| `viewer/scripts/{collect_test,pour_test}.ts`、新 `viewer/scripts/sweep_test.ts` | gate 分支＋新 gate |
| `SKILL.md` | 驗證命令加 sweep_test |
| `../playground/src/interactions.ts`、`src/actions.ts`、`scripts/scene_test.ts`、`README.md` | 封袋計數、按鈕文案、gate、文件 |
| `ROADMAP.md`、`tasks/0029-scoop-contact-collect.md`、`docs/next-steps.md` | 結案 |

## 8. 驗證與結案

- forge：`python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'`。
- viewer：`npx tsc --noEmit`；`physics_test`／`actuation_test`／`collect_test`／`pour_test`／`sweep_test` 對 scoop-and-scraper；`collect_test` 對 cytotoxic-waste-bag、`pour_test` 對粉罐與噴瓶回歸。
- playground：`npm run typecheck && npm run scene-test && npm run parkour-test && npm run training-test`。
- 部署：`cd ../player-garden && bash scripts/serve.sh`；`curl` 200。
- 瀏覽器真實輸入層第六步：抓鏟（驗 `G.body` 是 scoop）→ 滾輪壓到底貼地 → 拖過凝固顆粒（面板顯示斗內 n）→ 抬高走到袋邊 → Q/E 前傾 → 顆粒落袋 → 封袋 → 入桶；不呼叫任何 `__` API。
  截圖 `.img2babylon/shots/playground7-{sweep,pour}.png`。
- 丟棄式探針 `viewer/scripts/_m17_probe.ts` 刪除（數據已在 §2）。

## 9. 風險

- 內腔含唇前 1 cm 地面區：鏟子放在顆粒堆旁不動也會收走貼著唇的顆粒——可接受（唇比顆粒薄）。
- 玩家拖鏟時手點在握把頂、斗可能鼻子朝上懸空 > 2 cm：內腔下探 2 cm 加上抓取 lift 夾 y ≥ 0 可壓到底；若仍不夠，playground 側再加「抓鏟自動放平」（同噴瓶 aimNozzle），列為備援不先做。
- 倒出點在唇中心：前傾 1.0 rad 時唇在最低處，顆粒自唇落下；側傾也會倒（契約用 +y 夾角），與現實一致。
- 粉罐 40 顆全在斗內時 scoop 質量 0.08 + 0.12 = 0.20 kg，抓取伺服 GAIN 足夠（M13 載重 0.04 kg 測過；plan 內 gate 驗 0.12 kg）。

## 10. 実測補記（2026-09-06 結案）

- gate：forge 127 測試綠；collect_test contact 8/8（質量 0.12）；pour_test 裝 6 倒 6、質量回 0.08、**新增 A2 後仰 1.2 rad 不倒**；sweep_test 掃 7 收 7（推進 0.374 m）；actuation_test 加 source collected 空斗分支。
  playground scene_test 35（sweep:contact 7/7；carry-pour 收 15 倒 15 全落袋、封袋計 15）、training_test 14（新 train:bin-top-lid）。
- **契約修正**：`pour.source: "collected"` 且有 `direction` 時，出口方向世界 y < 0 才倒。原因：瀏覽器 Q 後仰讓 up 向量夾角到 1 rad 也觸發，顆粒從朝上的唇噴出又掉回斗面（落點 bag 局部 y 0.27）。§3.2／§3.3 與 grimoire 已補。
- 瀏覽器真實輸入層第六步全鏈通過（pointer／wheel／keyboard 合成事件，無 `__` API）：pick 握把 → 壓地七趟掃收 7 → 抬著走 5 m（最大傾角 0.4）→ 唇對袋心、E 前傾 0.85 再對準再倒 → 7/7 落袋 → 放旁邊、封袋 → pick 袋、抬高、踩踏板 → 平移到桶口 → 懸停即 dispose。
  截圖 `.img2babylon/shots/playground7-{sweep,pour,bin}.png`。前五步以 API 佈置（粉罐傳送到潑灑點 set(1)），本里程碑不驗，記錯 2／80 分。
- 實作期間偏離：§6「近物按鈕依 actuator label」改為 actions.ts 加 `scoop-and-scraper` case「傾倒」（modelButtons 本來就是逐模型 switch）。§9 備援「抓鏟自動放平」未做（不需要：壓地時位置伺服把斗壓平）。
- 陷阱：改 camera.alpha 後第一個 pointermove 跳點會把斗內 13 顆全灑（漸進游標解決）；前傾前唇離袋心 ≥ 0.6 m 否則撞袋壁卡 0.73 rad；前傾 0.85 後鏟繞手點轉、唇甩開要重新對準；
  袋平移時底要高過桶緣（否則撞歪桶、binTop 跑到 (4.19, 0.56, 3.03)）；對準要補償 (參考點 − 手點)。一次性未解釋：鏟子從袋正上方放手砸到袋後封袋 30 幀內 dispose 提早為 true（未重現）。
