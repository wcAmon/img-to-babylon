# 化療潑灑處理套件第二批（M11）設計文件

日期：2026-09-05　狀態：使用者核准設計（2026-09-05）　路徑：architectural
前作：`docs/superpowers/specs/2026-09-04-chemo-spill-set-design.md`（M10，三物件＋playground）

## 1. 目標

延續 M10 的六步流程，補齊化療潑灑處理流程尚缺的四類物件，並替廢棄物桶補上參考圖有、
模型沒有的兩側耳把；playground 擴到七件物件並重部署。

| 模型 id | 物件 | 流程步驟 | 主要行為 |
|---|---|---|---|
| `spill-warning-sign` | A 字警示立牌 | 1 隔離現場、示警 | 頂端 hinge＋servo：展開成 A 形自立／收合併攏；可推倒、拋起 |
| `absorbent-powder-shaker` | 吸附粉罐（凝固粉） | 4 吸附 | 掀蓋 hinge＋servo；**新契約 `pour`**：蓋開且傾斜超過門檻時顆粒持續倒出（質量逐顆轉移），扶正即停 |
| `absorbent-pad` | 吸附墊（對摺） | 4 吸附 | 摺邊 hinge＋servo：攤開／摺起；只用既有 hinge 契約 |
| `ppe-set` | 防護裝備組 | 2 穿戴防護 | 護目鏡、手套盒、隔離衣包三個自由 body，無約束；展示、拋起、有重量 |
| `cytotoxic-waste-bin`（補正） | 桶側耳把 | — | 兩個耳把併入 `bin` body；重跑全 gate，reviewHistory 記結案後補正 |

不做：吸附墊與點滴袋水漬的吸收互動（跨模型耦合）；粉罐顆粒與水漬的凝固互動；PPE 穿戴。
使用者 2026-09-05 決定：粉罐做物理傾倒（不只按鈕）；PPE 一個模型三 body（不拆三模型）。

## 2. 不變的前提

- SKILL.md 六步、五 pass、修正上限（每 pass 3、全程 6）、三層物理 gate、Divine Eye＋目視。
- 物理尺度 S=1（最小零件：粉罐蓋 0.03 kg、吸附墊半片 0.05 kg，與 M10 液滴 0.005 kg 同量級，可行）。
- 密度 gate 50–3000 kg/m³ 對 factory 出廠的 body 成立（§3 表已核）；執行期生成的顆粒不在
  runtime_export 內，與 M10 液滴同例。
- M10 教訓照用：相鄰活動件同碰撞過濾群組（`filterMembershipMask = G; filterCollideMask = ~G`）、
  hinge 兩端幾何不重疊、小輕零件的綁定零點在任何物理步前量、生成的小球加線性／角阻尼 2.0、
  Havok 質量 float32 容差 1e-5、plane 上 DynamicTexture 畫布內翻轉。
- 每個 hinge 的正角方向以 `physics_test --nudge <bodyB>` 實測為準；spec、factory、playground 三處同步。
- 分工：Claude 全做。

## 3. 四個新模型

### 3.1 `spill-warning-sign` A 字警示立牌

外觀：兩片 0.30 × 0.60 × 0.015 m 黃色板，頂端以鉸鏈相連成 A 形，出廠即展開（每片自鉛垂
各傾 0.28 rad，腳距約 0.33 m）。兩面 DynamicTexture：「CAUTION 化療藥物潑灑」「CHEMO SPILL
請勿靠近」＋程序化生物危害符號；頂端一條黑色鉸鏈罩（固定於前板）。

| body | 幾何 | 質量 | 密度 |
|---|---|---|---|
| `panel-front` | box 0.30×0.60×0.015 | 0.6 kg | 222 |
| `panel-back` | box 0.30×0.60×0.015 | 0.6 kg | 222 |

約束：`hinge` panel-front→panel-back，軸 x，樞軸在兩板頂端接縫（板厚各半分在樞軸兩側，
收合時兩板相鄰不重疊）。兩板的 pivot node 各自帶 rotation.x = ±0.28，因此 hinge 角 0 = 兩板
**同向（併攏）**、出廠展開時角 = −0.56；**limits [−0.61, 0]**：正向收合到併攏、負向只留 0.05 餘裕
——下限就是 A 形自立的「撐帶」，重力想把兩腳撐開時由限位擋住（正角 = 抬起 −z 側的左手系規則：
後板底在 +z，正轉往 −z 靠攏 = 收合）。`actuation: servo`（maxForce 4；0.6 kg、0.3 m 力臂 ≈ 1.8 N·m
上限，收合只需其半）。actuator `servo:panel-back.x`；playground「展開」= set(−0.56)、「收合」= set(0)。
方向以 `--nudge panel-back` 與 scene_test 實測確認。

站立驗證：physics_test 落地後 300 步兩板底邊皆在地面 0.03 m 內、頂端高度 ≥ 0.55 m。
推倒後兩板在限位內甩動、平躺；不會自己站回來。

### 3.2 `absorbent-powder-shaker` 吸附粉罐（可傾倒）

外觀：白色 HDPE 罐 0.08 直徑 × 0.16 高（lathe：圓柱身、肩、短頸），紫色掀蓋 0.084 直徑 × 0.02
高，後緣（+z）鉸鏈；罐身標籤「ABSORBENT 吸附凝固粉」＋用法三行小字；頸口內可見淡灰粉面
（視覺 disc）。

| body | 幾何 | 質量 | 密度 |
|---|---|---|---|
| `bottle` | cylinder r 0.04 h 0.16 | 0.45 kg | 560 |
| `cap` | cylinder r 0.042 h 0.02 | 0.03 kg | 270 |

約束：`hinge` bottle→cap，軸 x，樞軸在頸口後緣，limits [0, 1.9]，`actuation: servo`
（maxForce 0.5）。蓋子出廠閉合（角 0 = 下限），重力自然保持閉合；actuator `servo:cap.x`。

**傾倒契約（新，§4）**：`physics.bodies[bottle].pour`：

```json
"pour": { "tiltThreshold": 1.2, "grains": 40, "grainMass": 0.003, "ratePerSecond": 20,
          "gate": { "body": "cap", "minAngle": 1.0 } }
```

- 條件：罐身局部 +y 與世界 +y 夾角 ≥ `tiltThreshold`（1.2 rad ≈ 69°；側躺 90° 必倒）**且**
  蓋子 hinge 角 ≥ `gate.minAngle` **且**尚有顆粒。三者同時成立時每步累積 `ratePerSecond/60`，
  累積滿 1 顆就在頸口外 0.015 m 處生成一顆（若低於地面則抬到地面上方一顆半徑）。
- 顆粒：直徑 0.010 m 的 dynamic 球，質量 `grainMass`，摩擦 0.8、回彈 0.05，線性／角阻尼 2.0，
  初速 = 罐身速度 + 沿頸口方向 0.3 m/s；記入 `bodies["grain-<i>"]`、`meshes["grain-<i>"]`。
  同罐身碰撞過濾群組（不與罐身互撞，避免在頸口卡住）。
- 每生成一顆，`bottle` 質量減 `grainMass`（`setMassProperties`，質心不變）。倒空後質量
  = mass − grains·grainMass = 0.33 kg。
- 扶正（傾角 < 門檻）或關蓋即停，剩餘顆粒留在罐內（純計數）。
- 手動 actuator `pour:bottle`（kind `"pour"`，min 0、max 1）：`set(1)` 立即倒出**全部剩餘**顆粒
  （不看傾角與蓋），空罐再 set(1) 無事；`set(0)` 無事。
- `dispose()` 連顆粒、觀察者一併釋放。

playground「傾倒」按鈕 = `servo:cap.x` set(1.6) ＋ 推倒（既有 topple）；罐側躺後 2 秒倒空。

### 3.3 `absorbent-pad` 吸附墊（對摺）

外觀：兩片 0.20 × 0.012 × 0.25 m 的半片，沿 +z 邊摺疊相連；吸附面白色帶程序化壓紋點陣
（seed），背面藍色防滲膜。出廠對摺（`half-b` 疊在 `half-a` 上，吸附面朝內、藍膜朝外）。
角落一枚小標籤「ABSORBENT PAD 吸附墊 40×50」。

| body | 幾何 | 質量 | 密度 |
|---|---|---|---|
| `half-a` | box 0.20×0.012×0.25 | 0.05 kg | 83 |
| `half-b` | box 0.20×0.012×0.25 | 0.05 kg | 83 |

約束：`hinge` half-a→half-b，軸 x，樞軸在兩片 +z 邊之間（y 在兩片接面），limits [0, 3.1]，
`actuation: servo`（maxForce 0.5；0.05 kg、0.125 m 力臂 0.06 N·m，過大會把墊子彈飛）。
正角 = half-b 翻過 +z 邊攤到另一側；actuator `servo:half-b.x`；playground「攤開」= set(3.1)、
「摺起」= set(0)。兩半同碰撞過濾群組（摺疊時面貼面）。摩擦 0.8（攤開後不滑）。

### 3.4 `ppe-set` 防護裝備組

一個模型、三個自由 body、`physics.constraints: []`。出廠平放於地面互不接觸。

| body | 物件 | 幾何（collider box） | 位置 | 質量 | 密度 |
|---|---|---|---|---|---|
| `glove-box` | 化療級 nitrile 手套盒 | 0.24×0.09×0.13 | (−0.20, 0.045, 0) | 0.35 kg | 125 |
| `gown-pack` | 隔離衣密封包 | 0.30×0.04×0.22 | (0.15, 0.02, 0.06) | 0.25 kg | 95 |
| `goggles` | 護目鏡 | 0.16×0.06×0.08 | (0.16, 0.03, −0.16) | 0.06 kg | 78 |

視覺：手套盒紫色紙盒＋頂面橢圓取用口＋標籤「NITRILE GLOVES 化療防護手套」；隔離衣包淡藍
半透明膠膜盒（alpha 0.85）內見摺好的藍色衣料、標籤「ISOLATION GOWN 隔離衣 防水」；護目鏡
= 透明鏡片弧形（box 帶 alpha）＋深灰框＋後方彈性帶（細 torus 段）。摩擦 0.6。

沒有 actuation、沒有 hinge：physics_test 只驗落地靜止、無 NaN；actuation_test 因無宣告而
略過（既有行為）；check_colliders 三個 body 各一 collider。

## 4. 契約擴充：pour

只擴不換，與 `rupture` 對稱：

- `grimoire/spec.md` 新節「pour（M11 可傾倒 body）」；`grimoire/physics.md` 新節
  「傾倒＝節流的質量轉移」（傾角量法、蓋門、生成點、阻尼、dispose、校準法）。
- `forge/validate_spec.py` `_check_pour`：`tiltThreshold`（0 < x < π）、`grainMass`、`ratePerSecond`
  正數；`grains` 正整數；`grains × grainMass < mass`；`gate` 選填，有則 `gate.body` 必須是某個
  `bodyA == 本 body` 的 hinge constraint 之 `bodyB`，且 `gate.minAngle` 落在該 hinge limits 內。
  stdlib TDD（`forge/tests/test_validate_spec.py` 加 `_with_pour` 助手＋六個測試）。
- `viewer/src/types.ts`：`Actuator.kind` 加 `"pour"`；`harness.ts` 對 pour 與 rupture 同樣用按鈕。
- `viewer/scripts/actuation_test.ts`：coverage `coverage:pour:<id>`（宣告 pour 必掛 `pour:<id>`）；
  觸發檢查 `pour:<id>`：set(1) 兩次後 `grain-*` body 數 = grains、質量 = mass − grains·grainMass
  （1e-5）。排在所有其他檢查之後（會改質量）。
- 新 gate `viewer/scripts/pour_test.ts`：
  A. 蓋閉、罐側躺（root 繞 z 轉 π/2 後落地）300 步 → 無顆粒、質量不變。
  B. 蓋開（`servo:cap.x` set 上限）、側躺 → 300 步內顆粒數 = grains、質量 = mass − grains·grainMass；
     再 300 步顆粒全部靜止（速度 < 0.02）、所有 body 有限。
  C. 直立、蓋開 120 步 → 無顆粒；`pour:bottle` set(1) → 顆粒數 = grains；再 set(1) → 不變；
     `dispose()` 後場景 body 數回到只剩地面。
- ROADMAP 開 M11 節；`tasks/0023-chemo-spill-set-2.md` 卡片。

取捨：不用 Havok 粒子或 SPH——顆粒是可數剛體，與液滴同一套機制，gate 可以精確斷言數量與質量。
40 顆與 12 顆液滴同量級，對 60 fps 無壓力；playground 歸位 dispose 乾淨不累積。

## 5. `cytotoxic-waste-bin` 補正：側耳把

- spec `componentTree` 加 `handle-l`／`handle-r`（box 0.03 × 0.035 × 0.10，材質 pedal-black，
  fixed 於 bin，位置 x = ±0.166、y = +0.075（相對 bin pivot，離地 0.30）、z = 0）＋ 無 collider 的
  micro 接橋 `handle-l-stub`／`handle-r-stub`（box 0.014 × 0.02 × 0.06，x = ±0.147），全部併入
  `physics.bodies[bin].components`；質量 3.0 kg 不變。耳把 collider 完全落在桶身 cylinder collider
  的 AABB（x ≤ 0.15）之外——check_colliders 的「同 body 相鄰 collider 重疊 ≤ 25%」對 AABB 計算，
  嵌進桶壁會超標；視覺接合改由接橋負責（lathe 在該高度半徑約 0.143）。
- factory：`BODY_DEFS.bin.colliders` 加兩個 box（同 GROUP 過濾）。
- 重跑 strict spec／check_colliders／physics_test（--nudge lid、--nudge pedal）／actuation_test，
  重截 hero＋collider、compare、Divine Eye（預期 IoU 略升——參考圖有耳把）、目視；
  `reviewHistory` 追加一筆 `pass: "polish"` 補正紀錄（notes 註明 M11 結案後補正，不佔 M10 修正額度；
  本次以 `next_pass.py init --model cytotoxic-waste-bin --force` 重新初始化，只跑 polish 一 pass）。

## 6. Playground 擴充（`../playground`）

- 地板 4×4 → 6×6 m（貼圖 uScale 6，一格 1 m 不變）；相機初始 radius 3.0 → 3.8、target y 0.25。
- `scene.ts` 七件配置（單位 m、rotationY rad）：

  | 模型 | 位置 | rotY |
  |---|---|---|
  | chemo-spill-kit | (−0.9, 0, 0.3) | 0.4 |
  | chemo-iv-bag | (−0.1, 0, −0.45) | −0.3 |
  | cytotoxic-waste-bin | (1.1, 0, 0.4) | −0.5 |
  | spill-warning-sign | (−0.3, 0, 1.0) | 0.6 |
  | absorbent-powder-shaker | (0.35, 0, −0.4) | 0 |
  | absorbent-pad | (0.5, 0, 0.15) | −0.2 |
  | ppe-set | (−1.3, 0, −0.7) | 0.2 |

- `ui.ts` 新卡片：立牌「展開／收合／推倒／拋起／歸位」；粉罐「開蓋／關蓋／傾倒／拋起／歸位」
  （傾倒 = 開蓋＋推倒）；吸附墊「攤開／摺起／拋起／歸位」；防護裝備「推倒／拋起／歸位」。
  `topple` 與 HUD 的 body 過濾把 `grain-` 與 `droplet-` 同列為生成物。流程步驟文字後加括號標
  對應物件。
- `scene_test.ts` 新斷言：七件落地靜止；立牌自立（兩板底 ≤ 0.03、頂 ≥ 0.55）且 set(−0.56) 後
  180 步角 ≤ −0.4；粉罐開蓋＋側躺 300 步顆粒 = 40、質量 0.33（1e-5）；吸附墊 set(3.1) 後 180 步
  角 ≥ 2.8；ppe 三 body 落地；全部歸位後 body 數還原（顆粒清乾淨）。
- `npm run serve` 重部署；playwright 在 tailnet 網址截 overview、立牌收合、粉罐倒出三張存
  `.img2babylon/shots/playground2-*.png`。

## 7. 執行順序與 commit 粒度

1. pour 契約（grimoire 兩節＋validate_spec TDD＋types＋harness＋actuation_test＋pour_test 紅）——1 commit。
2. `absorbent-powder-shaker` 六步五 pass（pour_test 轉綠）——1 commit。
3. `spill-warning-sign` 六步五 pass——1 commit。
4. `absorbent-pad` 六步五 pass——1 commit。
5. `ppe-set` 六步五 pass——1 commit。
6. `cytotoxic-waste-bin` 側耳把補正——1 commit。
7. playground 七件＋UI＋scene_test＋重部署＋截圖——playground 1 commit；本 repo ROADMAP／tasks 結案 1 commit。

順序把新契約最先落地、最複雜的模型（粉罐）緊接著驗證契約，其餘三個模型不依賴契約。

## 8. 風險

- **傾角＋蓋門雙條件的時序**：罐子被推倒過程中蓋子可能被地面壓回去（角 < 1.0）而停倒；
  playground「傾倒」先開蓋、待 servo 到位再推。gate B 用 servo 上限 1.9 持續撐開。
- **顆粒生成點在地面下／罐內**：側躺時頸口離地約 0.04 m，生成點抬高保護；顆粒與罐身同群組不互撞。
- **A 字牌自立**：靠 hinge 上限撐住；若落地衝擊讓兩腳外滑，摩擦 0.6 與 0.05 rad 餘裕不足時把
  上限收成 0（無餘裕）——physics pass 校準。
- **吸附墊 0.012 m 薄板**：Havok 對薄盒穩定（M10 塌扁袋 0.010 已驗）；servo maxForce 0.5 若仍
  彈飛則降 0.2。
- **PPE 三 body 無約束**：physics_test／runtime_export 對多 body 無 constraint 的 spec 是否有隱含假設，
  Task 5 第一步先以 strict validate 與 headless 試跑確認，有問題就地修工具（只擴不換）。
- **修正額度**：四個新模型各 6 次全程上限；Divine Eye 對薄板（吸附墊）與 A 形（立牌）的 IoU
  可能偏低，reject 時依 review.md 走目視判定並誠實記錄。
