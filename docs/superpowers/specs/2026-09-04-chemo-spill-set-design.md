# 化療潑灑處理套件（M10）＋ Playground 展示環境 設計文件

日期：2026-09-04　狀態：使用者核准（2026-09-04）　路徑：architectural

## 1. 目標

用 img2babylon 既有六步流程，產出化療藥物潑灑（cytotoxic spill）處理流程的三個關鍵物件，
每件都能在 3D 環境中展示、打開、傾倒翻滾、有重量；另建一個獨立的 3D 展示環境
`local_three/playground`，經 tailnet MagicDNS 對外存取。

三個物件（第一批，使用者 2026-09-04 選定）：

| 模型 id | 物件 | 主要行為 |
|---|---|---|
| `chemo-spill-kit` | 化療潑灑處理包（硬殼提箱） | 打開（蓋 hinge＋servo）、翻倒時蓋子自由甩開、有重量 |
| `chemo-iv-bag` | 化療藥物點滴袋（潑灑源） | 摔落／撞擊超過門檻**破裂**：質量轉移＋水漬擴散＋液滴飛濺 |
| `cytotoxic-waste-bin` | 細胞毒性廢棄物桶（腳踏掀蓋） | 踩踏板、掀蓋（兩支 servo）、推倒、有重量 |

不做：警示立牌、防護裝備、吸附墊等其他物件（留後批）；點滴袋的剛體撕裂（見 §4 取捨）。

## 2. 不變的前提

- 走 SKILL.md 六步：tomato 生圖 → spec → `validate_spec --strict` → factory 五 pass →
  每 pass 三層物理 gate ＋ 視覺 gate → `next_pass.py done`。鐵律不變（程式建模、證據落地、
  物理一等公民、修正上限、尺寸烘進幾何、決定性、constraints 是物理權威）。
- 物理尺度 S=1。三件物件尺寸 0.1–0.5 m、質量 0.5–3 kg，遠高於 Havok 數值地板（0015a 的
  ×10 是 9 cm／85 g 人偶的特例），不啟用 physicsScale。
- 密度 gate 50–3000 kg/m³（check_colliders）：所有 body 預估密度已核對（§3 表）。
- 分工：Claude 全做（使用者選定），不派 Codex。

## 3. 三個模型

### 3.1 `chemo-spill-kit` 化療潑灑處理包

外觀：硬殼手提箱 0.40 × 0.21 × 0.30 m（箱體 0.16 高、蓋 0.05 高）。紫色箱體、黃色警示帶，
蓋面 DynamicTexture 標籤「CYTOTOXIC SPILL KIT 化療潑灑處理包」＋程序化生物危害符號。
蓋上提把、箱前兩個扣鎖為固定視覺件。打開後可見內容物（固定於箱體的視覺件）：吸附墊疊、
手套盒、廢棄物袋捲、護目鏡。

| body | 幾何 | 質量 | 密度 |
|---|---|---|---|
| `case` | box 0.40×0.16×0.30，質心偏低 | 1.8 kg | 94 |
| `lid` | box 0.40×0.05×0.30 | 0.5 kg | 83 |

約束：`hinge` case→lid，軸 x、樞軸在箱體後上緣（依 pill-bottle 左手系教訓，樞軸放 +z 側使
正角＝掀開；實作時以 physics_test `--nudge lid` 驗證方向），limits [0, 1.75]（約 100°），
`actuation: servo`（maxForce 5，量級：0.5 kg 蓋、0.15 m 力臂 ≈ 0.74 N·m）。servo 惰性啟動，
未命令前為自由鉸鏈。actuator id `servo:lid.x`。

### 3.2 `chemo-iv-bag` 化療點滴袋（可破裂）

外觀：500 mL 軟袋 0.12 × 0.19 × 0.035 m，霧面透明 PVC 袋身（alpha）透出淡黃藥液（袋內
獨立液體視覺件，約六成高），頂端吊孔、底端兩支輸液口（紫色蓋），正面標籤「CYTOTOXIC 化療藥物」。

| body | 幾何 | 質量 | 密度 |
|---|---|---|---|
| `bag` | box 0.12×0.19×0.035（圓角純視覺） | 0.55 kg | 689 |

單一剛體；破裂後質量 0.04 kg、collider 換 0.12×0.19×0.008（密度 220）。

**破裂契約（新增，見 §4）**：spec `physics.bodies[].rupture`：

```json
"rupture": { "impulseThreshold": 2.0, "emptiedMass": 0.04, "puddleRadius": 0.30, "droplets": 12 }
```

- 偵測：`body.setCollisionCallbackEnabled(true)`，碰撞事件 `impulse` 超過門檻即破裂（一次性）。
  門檻 2.0 N·s 對應 0.55 kg 自約 0.7 m 以上落下；輕放（0.2 m）不破。Havok 回報衝量逐接觸點，
  數值在 rupture gate 校準，spec 門檻允許在 physics pass 調整。
- 破裂動作（factory 內建，一次且冪等）：
  1. `bag` 質量改 `emptiedMass`，shape 換塌扁薄盒；袋視覺換塌扁袋幾何（另建，非 scaling），
     液體視覺件隱藏。
  2. 在接觸點的地面高度（factory `opts.groundY`，預設 0）生成水漬圓盤 mesh（`meshes["puddle"]`），
     1.5 s 內半徑 0 → `puddleRadius`，半透明淡黃；純視覺、無 body。
  3. 生成 `droplets` 顆液滴：直徑 0.012 m 的 dynamic 球，質量 0.005 kg、摩擦 0.05、回彈 0.1，
     自接觸點以徑向初速噴出後滾散靜止。液滴 body 記入 `model.bodies["droplet-<i>"]`。
- 手動觸發：actuator `rupture:bag`（kind `"rupture"`，min 0、max 1，`set(1)` 觸發，冪等）。
- `dispose()` 連同水漬、液滴一併釋放（playground「歸位」＝ dispose ＋重建）。

### 3.3 `cytotoxic-waste-bin` 細胞毒性廢棄物桶

外觀：腳踏桶 0.30 直徑 × 0.45 高（lathe 微錐），紫色桶身、黃色圓頂蓋、前下方踏板，桶身
DynamicTexture 標籤「CYTOTOXIC WASTE 細胞毒性廢棄物」＋符號，桶內紫色垃圾袋內襯（視覺）。

| body | 幾何 | 質量 | 密度 |
|---|---|---|---|
| `bin` | cylinder r 0.15 h 0.45，質心低 | 3.0 kg | 94 |
| `lid` | cylinder 0.31 直徑 × 0.06 | 0.35 kg | 77 |
| `pedal` | box 0.10×0.02×0.12 | 0.15 kg | 625 |

約束（皆 hinge、軸 x、`actuation: servo`）：

| 約束 | 樞軸 | limits | maxForce | actuator |
|---|---|---|---|---|
| bin→lid | 桶口後緣 | [0, 1.5]（約 85°） | 3 | `servo:lid.x` |
| bin→pedal | 桶底前緣 | [−0.3, 0] | 3 | `servo:pedal.x` |

踏板與蓋之間**不做物理連桿**：spec 只宣告兩支獨立 servo，playground「踩踏板」按鈕同時命令
踏板 −0.3 與蓋 1.5。

## 4. 契約擴充：rupture

只擴不換：

- `grimoire/spec.md` 新節「rupture（可破裂 body）」；`grimoire/physics.md` 新節「破裂＝質量轉移」
  （偵測、動作、dispose 責任、gate 校準法）。
- `forge/validate_spec.py`：`rupture` 選填；`impulseThreshold`／`emptiedMass`／`puddleRadius` 正數，
  `emptiedMass < mass`，`droplets` 非負整數。stdlib TDD。
- `viewer/src/types.ts`：`Actuator.kind` 加 `"rupture"`；harness 面板對 `rupture` 以按鈕呈現
  （同 light 的兩態，不生滑桿）。actuation_test coverage：宣告 rupture 的 body 必須掛
  `rupture:<bodyId>` actuator，觸發後質量須降到 emptiedMass。
- 新 gate `viewer/scripts/rupture_test.ts`：
  1. 自 1.5 m 落下 → 破裂：質量 = emptiedMass、`meshes["puddle"]` 存在且半徑收斂到 puddleRadius、
     液滴數正確、所有 body 無 NaN、液滴 300 步後靜止（速度 < 0.02 m/s）。
  2. 自 0.2 m 落下 → 不破（質量不變、無 puddle）。
  3. 手動 `rupture:bag` set(1) 兩次 → 只破一次（液滴數不加倍）。
- ROADMAP 開 M10 節；`tasks/0022-chemo-spill-set.md` 卡片。

取捨：兩剛體＋「會斷的約束」做撕裂——Babylon 的 Havok 插件沒有可靠的約束斷裂 API，且真實
點滴袋破裂的重點是液體離開袋子，袋身不分家。採質量轉移方案。

## 5. Playground（`local_three/playground/`，獨立 Vite 專案）

### 5.1 結構

```
playground/
  package.json          vite / typescript / tsx（devDeps）；無 runtime deps
  vite.config.ts        alias 指向 ../img-to-babylon/viewer/src 與其 node_modules（同 image-to-physics）；
                        base "/"、server.port 5175、preview.port 4173、fs.allow 兩 root、optimizeDeps 排除 havok
  index.html            canvas ＋側欄容器
  src/main.ts           engine／scene／固定步長 Havok／相機／燈光／地板；依 scene.ts 生成模型；掛 UI 與抓取
  src/scene.ts          擺放清單：[{ model, position, rotationY }] ×3
  src/ui.ts             側欄：流程步驟文字、每物件一張卡、全域按鈕
  src/grab.ts           滑鼠／觸控抓取拖曳
  src/hud.ts            左上：FPS、物件數、總質量
  scripts/scene_test.ts headless gate
  scripts/serve.sh      build ＋ tailscale serve
  launchd/com.example.playground.plist  常駐 vite preview
```

### 5.2 場景與互動

- 地板：4 × 4 m 病房地磚（DynamicTexture 格線），STATIC box，摩擦 0.7。淡色背景。
- 三物件由 img2babylon `registry` 動態載入，spawn 位置取自 `scene.ts`；每物件記錄
  出廠位置供「歸位」（dispose ＋ factory 重建）。
- 側欄物件卡：名稱、質量（讀 bodies 質量總和，kg 一位小數）、按鈕：
  - 處理包：打開／關閉（`servo:lid.x` 1.6／0）、推倒、拋起、歸位
  - 點滴袋：摔落（抬到 1.5 m 放手）、破裂（`rupture:bag`）、拋起、歸位
  - 廢棄物桶：踩踏板（pedal −0.3 ＋ lid 1.5）／放開、掀蓋／關蓋、推倒、拋起、歸位
  - 全域：丟球、碰撞線框（PhysicsViewer）、全部歸位
- 「推倒」：在物件最高點施水平衝量 `mass × 1.5` N·s（方向朝相機右側），保證重物也倒。
- 抓取拖曳（`grab.ts`）：pointer down 以 scene.pick 取 body → 記錄抓取高度平面 → move 時把游標射線
  與該平面交點當目標，`setLinearVelocity((target − pos) × 8)`，上限 3 m/s；重物同速度上限但
  加速慢（質量不改，靠 Havok 自然）；放開即停止覆寫。觸控同一路徑（ArcRotateCamera 觸控
  縮放旋轉沿用，抓到物件時暫停相機控制）。
- 流程文字（純靜態，側欄頂）：隔離現場 → 穿戴防護 → 打開處理包 → 吸附清除 → 投入廢棄物桶。

### 5.3 對外

- `npm run build` → `dist/`；`vite preview --host 127.0.0.1 --port 4173 --strictPort` 常駐（launchd
  `KeepAlive`、`RunAtLoad`，log 至 `~/Library/Logs/playground.log`）。
- `tailscale serve --bg http://127.0.0.1:4173` 掛根路徑，取代目前指向無人聽的 8788 之殘留設定
  （使用者 2026-09-04 決定改掛根）。網址 `https://<internal-host>/`。
- `scripts/serve.sh`：build → 重載 launchd → 設 tailscale serve → curl 驗證 200。

### 5.4 驗證

- `npx tsc --noEmit`。
- `scripts/scene_test.ts`（headless，用 img2babylon `createHeadlessScene`）：生成三模型 → 300 步
  全部落地靜止（body y 在地板上、速度 < 0.02）、無 NaN；命令 `servo:lid.x` 1.6 後 180 步蓋角 ≥ 1.2；
  廢棄物桶踏板 −0.3、蓋 1.5 後到位；點滴袋抬 1.5 m 放手 → 破裂、液滴數正確；歸位重建後 body 數還原。
- playwright 截圖（`.img2babylon/shots/playground-*.png`）目視：三物件、側欄、打開狀態各一。
- tailnet：`curl -s -o /dev/null -w '%{http_code}' https://<internal-host>/` = 200，
  且 `index.html` 內容含 playground 標題。

## 6. 執行順序與 commit 粒度

1. rupture 契約（grimoire＋validate_spec TDD＋types＋harness 面板＋rupture_test 紅）——1 commit。
2. `chemo-spill-kit` 六步五 pass——1 commit。
3. `chemo-iv-bag` 六步五 pass（rupture gate 轉綠）——1 commit。
4. `cytotoxic-waste-bin` 六步五 pass——1 commit。
5. playground（專案、UI、抓取、scene_test、截圖）——1 commit（playground 自己 `git init`，
   img-to-babylon 只記 ROADMAP 指標）。
6. 對外（launchd＋tailscale serve＋驗證）——playground 1 commit；ROADMAP 結案。

每個模型的 `.img2babylon/state.json` 一次只屬一個模型，換模型 `next_pass.py init --force`。

## 7. 風險

- Havok 碰撞衝量的數值語意（逐接觸點、是否含回彈）未驗證 → rupture gate 先做校準探針，門檻
  可能改；紅線：輕放不破、1.5 m 必破，兩者都要成立。
- 蓋子 hinge 方向（左手系）——每個 hinge 都以 `--nudge` 驗證正角＝掀開。
- 液滴數量對效能：12 顆小球對 Havok 無壓力；歸位必 dispose 乾淨，避免累積。
- playground 的別名載入方式與 image-to-physics 相同，已驗證可行；`vite preview` 對 wasm MIME 正確。
