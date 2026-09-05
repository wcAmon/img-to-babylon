# 化療潑灑處理套件第三批（M12）設計文件

日期：2026-09-05　狀態：使用者核准設計（2026-09-05）　路徑：architectural
前作：`2026-09-04-chemo-spill-set-design.md`（M10）、`2026-09-05-chemo-spill-set-2-design.md`（M11）

## 1. 目標

補齊流程第 4 步「消毒」與「清除」、第 5 步「收集廢棄物」的三類物件；契約只擴不換：
`pour` 加三個選填欄位讓噴瓶沿用，新增 `collect`（容器收納＝反向的質量轉移）。
playground 擴到十件並重部署。

| 模型 id | 物件 | 流程步驟 | 主要行為 |
|---|---|---|---|
| `disinfectant-spray` | 消毒劑扳機噴瓶 500 ml | 4 消毒 | 扳機 hinge＋servo（出廠回位）；`pour`（無傾角條件、方向 +z、初速 2.5）：扳機壓下時沿噴嘴每秒 30 顆液滴，共 60 顆 |
| `cytotoxic-waste-bag` | 開口自立黃色細胞毒性廢棄物袋 | 5 收集廢棄物 | 一 body 五 collider 的中空容器，東西掉進去留住；**新契約 `collect`**：封袋時袋內外來小 body 收進袋身、質量轉入 |
| `scoop-and-scraper` | 小鏟＋推板 | 4 清除 | 兩個自由 body、無約束（同 ppe-set 模式）；小鏟前緣 2.5 mm 薄底板讓 10 mm 顆粒推得上去；推板 L 形抓取拖曳不翻 |

不做：噴霧液滴與水漬／顆粒的互動；袋子軟體變形；playground 抓取抬高（列入 docs/next-steps.md UX 項）。
使用者 2026-09-05 決定：噴霧擴充 `pour` 而不另立契約；袋子做開口容器＋`collect`；鏟刮板做兩 body。

## 2. 不變的前提

- SKILL.md 六步、五 pass、修正上限（每 pass 3、全程 6）、三層物理 gate、Divine Eye＋目視。
- 物理尺度 S=1；最小零件扳機 0.01 kg（同 M10 踏板量級，servo 出廠回位）。
- 密度 gate 50–3000 kg/m³ 對 factory 出廠 body 成立（§3 各表已核）；執行期生成的液滴不在 runtime_export 內。
- M10／M11 教訓照用：相鄰活動件同碰撞過濾群組；hinge 兩端幾何不重疊；小輕零件綁定零點在任何物理步前量；
  生成小球線性／角阻尼 2.0；Havok 質量 float32 容差 1e-5；hinge 角 0 = 出廠姿勢；曲面文字用 ribbon；
  同 body collider 重疊以 AABB 計、相鄰件齊平不重疊；`.img2babylon/state.json` 一次只屬一個模型。
- 每個 hinge 正角方向以 `physics_test --nudge <bodyB>` 實測為準；spec、factory、playground 三處同步。
- 分工：Claude 全做，直接在 main 上以模型為單位 commit。

## 3. 三個新模型

### 3.1 `disinfectant-spray` 消毒劑扳機噴瓶

外觀：半透明藍白 HDPE 瓶身 0.09 直徑 × 0.16 高（lathe：底、身、肩、頸），頂端白色噴頭 0.05 × 0.06 × 0.10
（y 0.16–0.22，噴嘴在 +z 前端），噴頭下方前側垂掛白色扳機；瓶身 ribbon 標籤「DISINFECTANT 消毒劑
含氯 5000 ppm」。bottle pivot 在瓶身中心（y 0.08）。

| body | 幾何（collider） | 質量 | 密度 |
|---|---|---|---|
| `bottle` | cylinder r 0.045 h 0.16 ＋ box 0.05×0.06×0.10（噴頭，y +0.11、z +0.01 相對 pivot；兩 collider 上下齊平） | 0.55 kg | 417 |
| `trigger` | box 0.015×0.055×0.012 | 0.01 kg | 1010 |

約束：`hinge` bottle→trigger，軸 x，樞軸在噴頭前下緣（世界 y 0.17、z 0.055），扳機自樞軸垂掛；
limits [0, 0.5]，正角 = 扳機下端朝 −z（往瓶身）壓（左手系：(0,−1,0) 繞 +x 正轉得 z′ = −sinθ），
`actuation: servo`（maxForce 0.05）。扳機 0.01 kg 會在數步內被重力甩到限位（M10 踏板教訓），factory 出廠即
`servo:trigger.x` set(0) 當回位彈簧。actuator `servo:trigger.x`。

`pour`（擴充後，§4.1）：

```json
"pour": { "grains": 60, "grainMass": 0.002, "ratePerSecond": 30,
          "direction": [0, 0, 1], "exitSpeed": 2.5,
          "gate": { "body": "trigger", "minAngle": 0.3 } }
```

- 無 `tiltThreshold`：只看扳機角 ≥ 0.3 rad 且有存量；每步累積 30/60，滿 1 顆在噴嘴（pivot + (0, 0.13, 0.06)）
  生成直徑 0.006 的淡藍半透明液滴，初速 = 瓶速 + 局部 +z × 2.5 m/s，摩擦 0.3、回彈 0.05、阻尼 2.0
  （速度 e^{−2t} 衰減，落點約 1 m 外）。液滴同罐身碰撞過濾群組（不撞瓶與扳機）。
- 每顆 `bottle` 質量減 0.002，噴完 = 0.43 kg。actuator `pour:bottle` set(1) 立即全噴（不看扳機）。

playground「噴灑」= `servo:trigger.x` set(0.45)，1 秒後 set(0)（30 顆／次，兩次噴完）。

### 3.2 `cytotoxic-waste-bag` 細胞毒性廢棄物袋

外觀：亮黃色（1.0, 0.85, 0.1）自立開口袋 0.30 (x) × 0.36 (y) × 0.20 (z)，壁厚 0.006、底 0.010；前面印
「CYTOTOXIC WASTE 細胞毒性廢棄物」＋程序化生物危害符號＋黑色警示帶；口緣一圈深黃 ribbon 皺褶；內面深黃。
pivot 在袋子幾何中心（y 0.18）。

| body | collider（相對 pivot） | 質量 | 密度 |
|---|---|---|---|
| `bag` | 底 box 0.30×0.010×0.20 @ y −0.175；前後壁 box 0.30×0.35×0.006 @ z ±0.097、y +0.005；左右壁 box 0.006×0.35×0.188 @ x ±0.147、y +0.005 | 0.20 kg | 75 |

五個 collider 兩兩齊平：左右壁 z 範圍 ±0.094 貼前後壁內面（0.097 − 0.003）、四壁 y 下緣 −0.170 貼底面上緣。
`centerOfMass` y −0.08（內容物在底部；落地站穩）。摩擦 0.7。無約束、無 hinge。

`collect`（新契約，§4.2）：

```json
"collect": { "interior": { "size": [0.288, 0.35, 0.188], "offset": [0, 0.005, 0] }, "maxItemMass": 0.05 }
```

封袋視覺：`collect:bag` set(1) 後口緣 ribbon 縮成打結束口（scaling 0.3）＋頂端一顆結（sphere ＋短圓錐），
只做一次。

### 3.3 `scoop-and-scraper` 小鏟＋推板

一個模型、兩個自由 body、`physics.constraints: []`；紫色硬塑膠（同處理包配色）＋白色印字
「SCOOP」「SCRAPER」。出廠平放互不接觸：scoop @ (−0.12, 0, 0.02) rotY 0.2、scraper @ (0.14, 0, −0.05) rotY −0.4。

| body | collider（相對各自 pivot，pivot 在底面中心） | 質量 | 密度 |
|---|---|---|---|
| `scoop` | 底板 0.16×0.0025×0.14 @ y 0.00125；後壁 0.16×0.06×0.004 @ z −0.068、y 0.0325；左右壁 0.004×0.05×0.136 @ x ±0.078、y 0.0275；握把 0.03×0.03×0.10 @ z −0.120、y 0.060 | 0.08 kg | 335 |
| `scraper` | 刀面 0.15×0.06×0.004 @ y 0.03；底腳 0.15×0.004×0.04 @ y 0.002、z −0.022；握塊 0.05×0.02×0.03 @ y 0.07、z −0.013 | 0.05 kg | 556 |

小鏟：底板前緣 2.5 mm（10 mm 顆粒的接觸法線仰角 ≈ 37°，橫推即上）；前緣斜角只做視覺（無 collider 的薄楔）。
四壁與底板、握把與後壁齊平不重疊。推板：直立刀面＋後底腳成 L 形，重心低；playground 抓取用速度追游標
（不施力矩）故不翻。摩擦 0.6。無 actuation：physics_test 只驗落地靜止、無 NaN；actuation_test 略過。

## 4. 契約擴充

### 4.1 `pour` 擴充（只擴不換，粉罐 spec 不動）

- `tiltThreshold` 改**選填**：缺省 = 不看傾角，只看 gate 與存量；此時 **`gate` 必填**（否則出廠即永倒）。
- 新增選填 `direction`（body 局部單位向量，長度 1 ± 1e-6，預設 [0, 1, 0]）：液滴初速方向。
- 新增選填 `exitSpeed`（m/s，正數，預設 0.3）。
- 生成點由 factory 決定（頸口或噴嘴），契約不規定。
- `grimoire/spec.md` pour 節、`grimoire/physics.md` 傾倒節補寫；`forge/validate_spec.py` `_check_pour`
  加：direction 三元數字且長度 ≈ 1、exitSpeed 正數、無 tiltThreshold 時 gate 必填（stdlib TDD 4 個測試）。
- `viewer/scripts/pour_test.ts` 依有無 `tiltThreshold` 切換情境：有 → 現行 A/B/C（側躺）；
  無 → A′ gate 閉、直立 300 步無顆粒、質量不變；B′ gate 開（servo 上限）、直立 300 步內顆粒 = grains、
  質量 = mass − grains×grainMass，再 300 步全靜止且有限；C′ 手動 `pour:<id>` set(1) 兩次只倒一輪、dispose 乾淨。
- `actuation_test` 的 pour 覆蓋與觸發檢查不變。

### 4.2 `collect`（新）：容器收納＝反向的質量轉移

`physics.bodies[]` 上選填：

```json
{ "id": "bag", "mass": 0.20,
  "collect": { "interior": { "size": [0.288, 0.35, 0.188], "offset": [0, 0.005, 0] }, "maxItemMass": 0.05 } }
```

- `interior.size` 三正數（m）、`interior.offset` 三數：body 局部框的收納區。`maxItemMass` 正數且 < `mass`。
- factory 契約：掛 actuator `collect:<bodyId>`（kind `"collect"`，min 0、max 1，`set(1)` 觸發、冪等、可重複
  收新掉進來的東西；`set(0)` 無事）。觸發時掃 `scene.getPhysicsEngine().getBodies()`，凡 **dynamic、不屬本模型、
  0 < 質量 ≤ maxItemMass、質心在 interior 世界框內**者：其 `transformNode` mesh 與 body 皆 `dispose()`，
  袋身 `setMassProperties({ mass: 目前質量 + Σ 收進質量, centerOfMass })`。
- 已驗 Babylon `PhysicsBody.dispose()` 有 `_isDisposed` 守衛且有 `isDisposed` getter：擁有者模型（粉罐、噴瓶）
  之後 `dispose()` 對已收走的 body 再呼叫不會炸；playground `totalMass`／`topple` 過濾跳過 `isDisposed` 的 body。
- `grimoire/spec.md` 新節「collect（M12 容器 body）」、`grimoire/physics.md` 新節「收納＝反向質量轉移」
  （掃描法、interior 世界框判定、外來 body 的 dispose 與擁有者守衛、封袋視覺）。
- `forge/validate_spec.py` `_check_collect`（stdlib TDD 5 個測試）。
- `viewer/src/types.ts` `Actuator.kind` 加 `"collect"`；`harness.ts` 對 collect 與 pour／rupture 同樣用按鈕。
- `actuation_test`：coverage `coverage:collect:<id>`；觸發檢查：無物時 set(1) 質量不變、再 set(1) 不變。
- 新 gate `viewer/scripts/collect_test.ts`：自 interior 世界框中心上方 0.30 m 丟 8 顆測試球（d 0.012、0.005 kg，
  ±0.05 m 散佈）＋袋外 2 顆 → 300 步後 8 顆質心皆在 interior 內、全部有限；`collect:<id>` set(1) → 8 顆 mesh／body
  dispose、質量 = mass + 0.04（1e-5）、袋外 2 顆不動；再 set(1) 不變；模型 dispose 後場景只剩地面與袋外 2 顆。
- ROADMAP 開 M12 節；`tasks/0024-chemo-spill-set-3.md` 卡片。

取捨：收走的外來 body 直接 dispose 而不是隱藏／改 static——Havok static body 的質量回報不可靠，dispose 的守衛
已驗；擁有者模型的 `bodies` 記錄留下已 dispose 的項目是可接受的（所有消費者以 `isDisposed` 過濾）。

## 5. Playground 擴充（`../playground`）

- `scene.ts` 十件（既有七件位置不動）：

  | 模型 | 位置 | rotY | 動線 |
  |---|---|---|---|
  | disinfectant-spray | (−0.55, 0, −0.85) | 0.3 | 靠點滴袋 |
  | scoop-and-scraper | (0.85, 0, −0.55) | 0.4 | 靠粉罐 |
  | cytotoxic-waste-bag | (1.35, 0, −0.2) | −0.6 | 靠廢棄物桶 |

- `ui.ts` 新卡片：噴瓶「噴灑（set 0.45，1 s 後 set 0）／推倒／拋起／歸位」；廢棄物袋「封袋／推倒／拋起／歸位」；
  鏟刮板「推倒／拋起／歸位」。`totalMass`／`topple` 跳過 `isDisposed` body。流程步驟文字補對應物件。
- `scene_test.ts` 新斷言：十件落地靜止；噴瓶 `servo:trigger.x` set(0.45) 150 步 → 顆粒 60、質量 0.43（1e-5）；
  袋子 headless 丟 8 顆測試球 300 步全在內、`collect:bag` → 質量 0.24；鏟刮板 2 body；全部歸位後 body 數還原（21）。
- 已知限制：playground 抓取只在水平面拖曳，顆粒進袋只能靠推板→小鏟→拖到袋邊；「倒進袋子」由 headless gate 保證。
- `npm run serve` 重部署；playwright 在 tailnet 網址截 overview、噴灑、封袋三張存 `.img2babylon/shots/playground3-*.png`。

## 6. 執行順序與 commit 粒度

1. 契約：pour 擴充＋collect（grimoire 兩檔、validate_spec TDD、types、harness、actuation_test、pour_test 切換、
   collect_test 紅）——1 commit。
2. `disinfectant-spray` 六步五 pass（pour_test 無傾角情境轉綠）——1 commit。
3. `cytotoxic-waste-bag` 六步五 pass（collect_test 轉綠）——1 commit。
4. `scoop-and-scraper` 六步五 pass——1 commit。
5. playground 十件＋UI＋scene_test＋重部署＋截圖——playground 1 commit；本 repo ROADMAP／tasks／next-steps 結案 1 commit。

## 7. 風險

- **扳機小輕零件**：0.01 kg 數步到限位 → servo 出廠回位；maxForce 0.05 若壓不下去（gate B′ 紅）調到 0.1。
- **液滴飛太遠／不靜止**：阻尼 2.0 下落點 ≈ 1 m，測試地面 10 m；若 300 步未靜止改 exitSpeed 2.0。
- **袋子五薄壁**：0.006 薄盒 Havok 穩定（M10 0.010 已驗）；測試球 0.012 直徑不會穿壁（Havok 連續碰撞夠）；
  若掉落 0.3 m 有穿透，把測試球初高改 0.20。
- **小鏟顆粒推不上**：2.5 mm 前緣理論可上；若 playground 實測卡住，底板改 0.002 並加無 collider 楔形視覺。
- **收走外來 body 的擁有者**：所有讀 `bodies` 的消費者（playground HUD、topple、scene_test 計數）要過濾
  `isDisposed`；respawn 用 `dispose()` 走守衛。
- **修正額度**：三個新模型各 6 次全程上限；Divine Eye 對黃袋（高對比）預期 pass、對紫色鏟刮板多物件構圖預期
  reject（M11 已知系統性原因）→ 目視判定並誠實記錄。
