# img2babylon Roadmap

方向：沿著**同一套 constraint 契約的難度階梯**前進——每個里程碑只擴充契約，
不換架構。物理始終是一等公民：每一級的產出都必須能丟擲、堆疊、翻倒，
且三層物理 gate（靜態 AABB / headless Havok / PhysicsViewer 目視）全綠。

參考座標：`reference/img2threejs`（Three.js 版原作，無物理引擎）。本專案的
差異化能力是 Havok 真實物理——原作的「輪子會轉」只能靠動畫，我們的輪子
被推一把會真的滾。

## 已完成

| 里程碑 | 內容 | 憑證 |
|---|---|---|
| v0.1 pipeline 骨架 | forge 六件套（tomato / new_spec / validate_spec / next_pass / check_colliders / compare）、viewer + headless 驗證、grimoire 契約六件套、SKILL.md 路由器、雙 host symlink | 設計文件 §1–§10 |
| 驗收一：pill-bottle | 揀蓋藥罐——2 body + 1 個**有限角度 hinge**（ANGULAR_X 限制 [0, 1.92]） | `8fb23b1` |
| 驗收二：codex-crate | Codex CLI 端到端冒煙，證明 agent-agnostic | `7f8aa9d` |

## M1（2026-09-01 完成）：玩具跑車 `toy-racer` — 自由旋轉 hinge

第一台輪胎可**物理自由滾動**的車：5 body（車身 ×1 + 輪 ×4）+ 4 個無限制
旋轉 hinge。推一把會滾動前進，輪子因摩擦力自轉。

契約擴充（車子需要什麼就擴什麼，不多做）：

- [x] `grimoire/spec.md` / `grimoire/physics.md`：hinge `limits` 支援 `"free"`
      （角軸完全放開）；車輪質量/摩擦/軸向契約
- [x] `forge/validate_spec.py`：接受 `limits: "free"`（格式驗證＋attachment 漂移檢查）
- [x] `viewer/scripts/physics_test.ts --roll`：滾動驗證——推力後前進 3.08m、
      側偏 0.5cm、四輪 slip ≈ 2%（ω·r ≈ v，滾動不打滑）、constraint 不裂
- [x] `toy-racer` 走 SKILL.md 六步完成，三層 gate 全綠（stylized 玩具方盒風）

玩具風格是刻意選擇：圓潤誇張的比例繞過擬真曲面建模，正如 M2 用公仔風格
繞過蒙皮。

## M2（2026-09-01 完成）：玩具公仔 `action-figure` — ragdoll

人形的物理對應物不是蒙皮動畫，而是 ragdoll。約 10 剛體（頭/軀幹/上臂×2/
前臂×2/大腿×2/小腿×2）+ 約 9 個**帶人體關節限位的多軸 constraint**：
肘/膝單軸 hinge（約 0–140°）、肩/髖三軸錐形限位、脖子小範圍三軸。
丟出去要像玩偶一樣癱倒——不炸開、四肢不反折。

需要的契約擴充：

- [x] 多軸限位 constraint：`type:"joint"` + `angular` 逐軸 `[lo,hi]`/`"free"`/`"locked"`
      （validate_spec TDD 13 測試；grimoire spec/physics 契約；canonical perp frame）
- [x] character spec 分支：頂層 `proportions`（head_unit × total_heads ± tolerance）
      比例 gate 進 validate_spec
- [x] `physics_test.ts --ragdoll`：傾斜落下後關節角全部在限位 ±0.15 內（XZY 分解，
      經倒立擺探針校準——見 physics.md 陷阱）、最終身高 < 站高 60%（真癱倒）、
      constraint 不裂、無 NaN
- [x] review 清單加 chirality 檢查；`action-figure` 走 SKILL.md 六步五 pass 全過，
      三層 gate 全綠、0 修正（10 剛體、9 關節：脖/肩×2/肘×2/髖×2/膝×2）

公仔風格 = 宣告「所有零件都不跨關節」（img2threejs 九層本體論的 L3
單骨硬件）：硬殼頭髮、貼片五官，一刀砍掉蒙皮/SDF 工程，保留完整關節物理。

## M3（遠期，需獨立設計文件走 architectural 路徑）

- **有機蒙皮角色**：Babylon 無內建 marching cubes——SDF 平滑融合軀體與
  geodesic skinning（參考 `reference/img2threejs/forge/stage5_rig/`）都是
  大工程，等 M1/M2 暴露真實需求再排。
- **Divine Eye 確定性審查移植**（2026-09-01 完成）：`forge/divine_eye.py`——
  bbox 對齊 silhouette IoU 硬 gate＋六軟訊號集成（aspect/對稱 parity/pHash/SSIM/
  edge/tonal），陰影剔除＋遮罩閉合，門檻以 M1/M2 語料校準（好壞完美分離）。
  review gate 第 6 步接線：REJECT 直接修正、不花 agent vision。
- ~~可駕駛車（馬達 hinge）~~：拆解後併入 M4/M5——img2babylon 只交付
  「附馬達接口的模型」，可玩的駕駛體驗留給未來的遊戲製作 skill 消費。

## M4：可動物件契約 + Actuator Playground（2026-09-01 完成）

「遊戲可用」的標準不是模型看起來像，而是可動件真的可動、可審查、可修改。

- [x] spec 契約新增 `actuation` 宣告（constraint 上：drive / steer / servo；
      component 上：light=材質 emissive 兩態）；validate_spec 檢查格式與對應
- [x] factory 契約：模型出廠掛標準 `actuators` 介面
      （`drive(speed)`、`steer(angle)`、`servo(joint, angle)`、`light(on)`）
- [x] 新 gate `viewer/scripts/actuation_test.ts`（可動物件審查）：逐一驅動宣告的
      可動件並斷言可量測回應——drive 令車前進、steer 令航向偏、servo 令關節到
      目標角、light 令 emissive 變；宣告了但動不了 = FAIL
- [x] Actuator Playground：viewer 側欄面板讀 `actuators` 自動生成 UI（滑桿/開關/
      預設姿勢鈕），動作怪異可即時看出是哪個關節限位/軸向不對，回頭改 spec 重載
- [x] 示範：toy-racer 加 drive+steer（轉向節 body）＋車燈；action-figure 九關節 19 軸伺服。
      陷阱記錄：Havok 靜摩擦=硬約束馬達推不動（steer 行進中測、servo 吊空測）、
      間接相連零件穿插要碰撞過濾群組（physics.md）

## M5：kimodo.cpp 動作燒錄（2026-09-01 完成）

NVIDIA Kimodo 文字轉動作（C++/GGML，CPU 可跑，核心 Apache-2.0；用 SOMA 30 關節
模型可商用，避開僅限研究的 SMPL-X）。路徑：kimodo 離線生成骨骼 GLB →
`forge/retarget.py`（stdlib 解析 GLB，30 關節映射到公仔 9 關節、投影 joint axis、
夾 angular 限位）→ 關節角度時間線 JSON → viewer 伺服馬達播放（物理驅動）。
M4 的 servo 馬達與 playground 正是此項的前置工程。

執行計畫（2026-09-01 核准，harness-first：0002/0003 派 Codex、0004 監工自做）：

- [x] 0002 `forge/retarget.py`（stdlib，TDD）：GLB animation 解析（JSON chunk＋
      binary accessors，旋轉四元數時間線）→ SOMA 30→公仔 9 關節映射表 →
      每幀相對旋轉 XZY 分解投影到 spec 關節軸、夾 angular 限位 → timeline JSON
      `{model, fps, frames, tracks: {"servo:<body>.<axis>": [rad,…]}}`。
      測試用合成迷你 GLB fixtures，不依賴 kimodo。
- [x] 0003 `viewer/scripts/motion_test.ts` motion gate（吊空逐幀餵 timeline 給
      servo actuators，斷言追蹤容差/無 NaN/constraint 不裂）＋ playground
      「載入動作/播放/停止」面板。
- [x] 0004 kimodo.cpp 端到端：本機 clone/build＋SOMA 權重，生成真動作 →
      retarget → motion gate → playground 目視。輸出格式若非 GLB，只在
      retarget.py 加輸入 parser，核心不動。

## M6：人臉優化（2026-09-02 完成）

hero.png 的臉（粗黑眉、亮黑圓眼＋眼神光、微笑）目前是畫在 0.002 薄盒上的
DynamicTexture——側面看是平的。M6 把五官換成真 3D 幾何，並給 Divine Eye 加
顯微鏡（區域裁切審查），讓臉部有確定性驗收訊號。

執行計畫（harness-first：0006/0007 派 Codex 可並行、0008 監工自做）：

- [x] 0006 五官立體化：平面貼圖臉換成 headPivot 下的 3D 視覺子件
      （眼=亮黑半球＋眼神光、眉=深棕扁盒微傾、嘴=torus 弧、鼻=小膚色凸起）。
      純視覺零物理變動：不加 body、不動 spec constraints、質量不變。
      gate：`viewer/scripts/face_test.ts`（監工先寫紅）＋既有 gate 全綠。
- [x] 0007 Divine Eye 顯微鏡：`forge/divine_eye.py` 加 `--region x,y,w,h`
      （相對前景 bbox 的分數矩形），ref/render 同矩形裁切後跑同一套訊號，
      JSON 輸出加 region 欄位。stdlib TDD、合成 PNG fixtures；
      `grimoire/review.md` 接線顯微鏡 pass。
- [x] 0008 監工驗收：playwright 近拍正/側面截圖，hero.png 臉區 vs render
      臉區跑顯微鏡，目視＋數據雙確認，證據落 `.img2babylon/shots/`。

## M7：站立平衡（2026-09-02 核准開工）

doctrine「ragdoll 出生即癱」的反擊：19 軸伺服鎖出廠姿勢當肌肉張力，
胖靴低重心理論上站得住。終極目標：不吊空在地上播 kimodo 走路。

執行計畫（harness-first：0009 派 Codex、0010 監工 spike）：

- [x] 0009 剛性站立：opt-in 站立模式（StandController＋playground「站立」開關），
      全伺服軸命令回出廠角撐住。可調 spec 馬達力道，既有 gate 全綠、
      motion gate 容差不准放寬。gate：`stand_test.ts`（監工先寫紅）——
      地面生成＋站立 600 步，頭高 ≥ 出廠 80%、軀幹 up 內積 > 0.9、
      無 NaN、constraint 不裂。
- [x] 0010 站立穩健化：0009 綠是場景歷史巧合（新鮮場景 50–75 步前倒；
      POSITION 馬達剛性不吃 maxForce、髖屈服 0.28 rad、重心越靴前緣）。
      修法：BOOT_D 0.024→0.028（視覺＋collider 同步）。
- [x] 0011 站立恢復：enable() 從癱姿恢復（factoryPose 快照＋2-step 同步窗）。
      三輪後以證據作結（blocked）：被動站立本質臨界穩定——Havok POSITION
      馬達剛性不可調，幾何/調參/damping 五實驗全倒；癱堆第 4 位小數差異
      決定站或倒。附帶收穫：BOOT_Z 置中 0.000、gate 地面鏡射 playground
      材質、gate 強化為六輪 enable/disable 循環（現紅，0012 接手）。
- [x] 0012 站立主動平衡回饋：StandController 站立期間每步依軀幹前傾
      （up.z）與 z 漂移微調髖/膝 servo 目標（u = 0.8·lean + 30·drift，
      髖 +u 膝 −u，夾限位）。監工 probe 跨四癱等待家族 108/108 全站。
      驗收：六輪 stand gate 全綠＋playground 真按鈕 10/10 循環全站。
      附帶根因：main.ts HavokPlugin(true) 變動 dt ≠ headless 固定 1/60，
      已對齊為固定步長——M7 全部「headless 綠 playground 紅」的最後解答。
- [x] 0013 地面走路實驗（spike，tombstone）：站穩後不吊空播 walk timeline。
      30 格矩陣（hold/raw/assist/半幅/只餵下半身 × 20fps/5fps × 三癱家族）
      0 格達標——所有走路變體第一循環後仰倒（frame 7–13），與播放速度、
      初始癱姿無關。機制：右腳離地單腳站 16mm 靴時髖馬達剛性不可調
      （0010）＋回饋只控俯仰不控側傾（0012）。結論：Havok POSITION 馬達
      ＋空中 timeline 無法地面走路。量測儀器 walk_ground_probe.ts 與
      StandController.setPoseTarget 前饋掛鉤保留。
      **路線探勘（2026-09-03 監工探針，證據見卡片）**：換致動器不是解——
      POSITION／VELOCITY-PD 都能追到單腳目標角卻同樣倒；顯式力矩 PD 在此
      尺度數值不可行。真正瓶頸是運動學：無踝關節 ⇒ 兩腳踩地時質心橫移為
      零（恆在左靴外 1mm）⇒ 單腳支撐不可能 ⇒ 含擺動相的步態不可能。
      **路線待議（使用者決定）**：(a) M7 止於站立，走路封存（建議）；
      (b′) M8 雙足：靴子獨立 body＋2 軸踝關節（俯仰／側傾 servo）＋質心-支撐
      面平衡控制（roll+pitch）＋重心轉移步態——契約階梯合法擴充，但屬完整
      biped 控制，工程量與風險皆高；(c′) 不抬腳的拖步（shuffle）步態——
      雙腳恆著地靠摩擦交替滑動，物理上可行但觀感差、摩擦敏感。

## M8：雙足——踝關節＋質心平衡＋重心轉移步態（2026-09-03 核准開工）

物理行為自 2026-09-03 起在姊妹 repo 進行。

0013 證明：走不了不是馬達也不是控制器，是**運動學**——靴子焊在小腿上，
兩腳踩地時質心橫移為零（恆在左靴外 1mm），單腳支撐幾何上不可能。M8 把
腳踝裝回去，平衡從「別前傾」升級為「質心投影落在支撐面內」，再做重心轉移
步態。純契約擴充：spec bodies/constraints/actuation 加項，doctrine 不變
（不啟用就癱、STATIC 錨禁用、gate 量 physics body）。

生死關在 0016：單腳站做不出來就 M8 tombstone、不往下燒。

執行計畫（harness-first：每卡監工先寫紅 gate／探針，派 Codex，獨立驗收）：

- [x] 0014 踝關節契約：spec 拆 boot-l/r 為獨立 body（質量自 calf 分出，
      calf+boot 總質量不變 5g），calf→boot 新增 `joint`：axis [1,0,0]、
      angular x（俯仰）≈[-0.5,0.5]、z（側傾）≈[-0.3,0.3]、y locked、
      actuation servo（maxForce 同 0.02）；踝軸高度約地面上 6mm、左右對稱、
      BOOT_Z 仍 0。factory 鏡射（BODY_DEFS/CONSTRAINT_DEFS、靴 collider 移到
      boot body、視覺 pivot 重掛）。retarget 不必映射踝（timeline 軌道是
      servo 子集）。紅燈現成：actuation_test coverage 自動要求 boot servo、
      physics_test 從 spec 數 constraint。驗收：tsc、physics/actuation/motion/
      suspension/face、validate_spec --strict、重出 runtime.json＋check_colliders、
      Divine Eye 全身輪廓不變（靴子幾何不動）、**stand_test 六輪照舊綠**——
      踝 servo 鎖 0 撐平腳掌；站不住則允許把踝 servo 加進 balance.pitchServos
      （sign 依證據），增益 0.8/30 不動；三輪仍紅 → blocked 帶證據交 0015。
      結果（2026-09-03）：一輪綠。calf/boot 4g/1g、踝俯仰 servo 入平衡 sign +1；
      改前後同相機 0 像素差、playground 真按鈕 3/3 站穩、23 servo 契約
      （retarget 測試同步更新）。
- [!] **2026-09-03 尺度根因（0015 探勘）**：同尺寸剛體方塊 ×1 在 0.002 N·s
      就倒、×10 依相似律要到 0.016 才倒（正對解析估算）——9 cm／85 g 人偶低於
      Havok 數值尺度地板，M7/M8 全部混沌皆源於此。剛體雕像抗推門檻＝v1，
      0015 gate 兩級力道物理上不可達（監工校準錯誤，已記卡片）。
      **路線提案（待使用者核准）**：插入 0015a「物理尺度 ×10」——factory 加
      `physicsScale`（長度 ×S、質量 ×S³、伺服力矩 ×S⁴、衝量／增益依相似律），
      spec 仍寫玩具尺寸，viewer 世界 ×10、相機同步；spike 先驗證站立不再混沌、
      抗推達解析門檻、踝能移質心；過了才回 0015。舊 gate 全部在 S=10 重跑。
- [x] 0015a 物理尺度 ×10（2026-09-03 核准；r1 中場 8e08eda：physicsScale 落地、
      scale_test 10／stand_test 10 全綠；監工修正 0014 契約錯誤——joint frame 的
      y 才是側傾／外展、z 是扭轉，踝 angular 改 y:[-0.3,0.3] z:locked；S=10 平行
      四邊形重心轉移實測 45–59 mm；r2 切契約：action-figure 預設 S=10，全 gate
      依相似律換算）。**結案**：全 gate 在 S=10 綠、playground 站立 3/3＋挨球不倒、
      外觀與 S=1 像素一致（3/921600）。契約：物理世界＝spec 尺寸 ×10。：factory `opts.physicsScale`（S，預設 1）
      ——長度 ×S、質量 ×S³、伺服力矩 ×S⁴、driftGain ÷S；spec 仍玩具尺寸；
      main/harness/capture 依 model.physicsScale 放大地面／相機／擾動道具，
      `#scale=10` 開啟。gate `scale_test.ts`（監工寫）在 S=10：六輪站立、
      抗推 4 方向 × base{0.002,0.004}×S^3.5 × 三癱家族全站回、踝側傾限位鎖
      0.1 rad 能把質心橫移 ≥ 20 mm 且站住。S=1 舊 gate 照舊綠。
      過了才回 0015（gate 力道在 S=10 依剛體雕像門檻重校）。
- [x] 0015 質心-支撐面平衡控制器（2026-09-03 結案）：v2＝質心投影 vs 支撐面中心，
      俯仰／側傾 PID＋前饋（K_roll 0.50S、K_pitch 0.11S）＋移動中漏積分；setBalanceTarget
      可命令質心。gate A {0.002,0.003}×4 方向×3 家族 24 景全綠（全方向贏過剛體雕像；
      −z 0.004 為未 gate 延伸目標）；gate B 橫移 ±0.004S／回中／前移 +0.0015S 全綠。
      已知限制：後向俯仰閉迴路無權威（軟 POSITION 踝黏滑）——需剛硬 servo，另開卡。
      Codex 三輪＋監工接手收尾（使用者核准）。（StandBalance v2）：每步算質量加權質心投影
      相對支撐面中心（由 boot body 位置算，雙腳＝兩靴聯集中心、單腳＝該靴），
      俯仰誤差（z）與側傾誤差（x）各一組 PD；踝 servo 主控（俯仰 x、側傾 z）、
      髖 servo 輔助（沿用 0012 髖/膝項）。增益由 Codex 依證據調，但 gate 編入
      跨家族驗證：監工先寫 `balance_test.ts`——站穩後施前/後/左/右四方向
      × 兩級衝量擾動 × 三癱家族，N 步內頭高回 ≥80%、質心回支撐面內；
      六輪 stand_test 照舊綠。模型無 balance v2 欄位則退回 v1 行為。
- [x] 0016 單腳站 spike（生死關，2026-09-03 **通過**）：setSupportBodies 支撐面切換
      （世界目標守恆）；質心壓到左靴中心 → 慢抬右腿（髖 −0.45／膝 0.6、ramp 2700
      base 步）三癱家族全站、右靴離地 35 mm、質心在左靴內。機制發現：軟 POSITION
      馬達在腳被釘住時存彈簧能、脫離即甩腿（黏滑），慢 ramp 可避；快步態需剛硬
      servo（另開卡）。原計畫協定：質心推到左靴→抬右腿→hold 300 步；判準三癱家族
      不倒、質心在左靴內、右靴離地。
- [—] 0017 移交 image-to-physics（M2 下半身）：原重心轉移步態、walk gate 與 playground 走路控制由姊妹 repo 承接。
- [x] 0019 質量契約（2026-09-03 核准、結案 dffc640）：腿鏈 thigh 0.005／calf 0.008／boot 0.005（質量比 ≤ ~10:1）。
      姊妹 repo 探勘：Havok POSITION 馬達本身剛體，M7–M8「軟 servo／黏滑／後向無權威」真根因是
      關節兩側質量比（倒單擺 85 kg 撐 1 kg 底座必翻、5 kg 起剛體）。幾何／限位不動；站立類 gate 若紅
      roll P/D/I 與 feedforward.roll.maxOutput ×2。新總質量 0.106 kg，解除 0014 的 calf+boot 固定 5 g 舊約束。
- [x] 0018 套件入口（2026-09-03）：`viewer/src/index.ts`＋package exports／peerDependencies；
      姊妹 repo 以 tsconfig paths 指向本 checkout，link_probe 驗證單一 @babylonjs/core。

## M9：duck-bot 鴨型長腿雙足機器人（姊妹 repo M3 題材的契約側，2026-09-04 核准開工）

image-to-physics 目標改向：遙控雙足機器人（鴨子型態、腳很長；走／轉／跑／跳）。本 repo 只出題材
與契約：圖片（tomato）→ spec → factory → 三層 gate；控制律與站立／抗推 gate 在姊妹 repo。
設計文件 `../image-to-physics/docs/superpowers/specs/2026-09-04-duck-bot-biped-design.md`。

- [x] 0020 duck-bot（2026-09-04 開卡、同日結案：五 pass、strict spec／collider／ragdoll／12 軸 actuation 全綠；Divine Eye 因腿長比例刻意偏離 reject、監工目視通過）：7 剛體（body 含頭一體、thigh／shank／foot ×2）、10 關節 12 軸伺服
      （髖 x/y/z、膝 x、踝 x/y，servo id `servo:thigh-l.x` 慣例）；比例與質量為硬約束（腿長 ≈ 軀幹高 ×1.8、
      腳 0.024×0.007×0.040；質量 body 0.060／thigh 0.012／shank 0.012／foot 0.015，關節質量比 ≤ 10:1；
      姊妹 repo 倒單擺探針：0.40 長大腳讓單擺在腳 0.010–0.020 kg·S³ 都撐直——腳的支撐長度比質量關鍵）；
      factory `balance` 照抄 action-figure 換 id。Codex 六步到 headless gate，監工做視覺 gate 與 rig_test。
- [x] 0021 ragdoll gate 限位分解順序（2026-09-04 監工自做、結案 7c3fb88）：Havok 逐軸**限位**語意＝x swing-twist 扭轉角、
      y asin(−g02)、z atan2(g01,g00)，與逐軸**馬達**的 XZY 不同；舊 gate 用馬達順序查限位，鎖死軸讀出 0.12–0.24 rad
      幻影角（duck-bot 踝三輪紅、action-figure 0019 後靴邊緣紅）。修正後 duck-bot ragdoll 綠；action-figure 肩露出
      真實的負載超限 0.45／0.63 rad——**使用者 2026-09-04 決定接受為已知限制**（門檻與肩限位不動，人偶
      `--ragdoll` 自此預期紅在肩；duck-bot 綠）。證據：姊妹 repo joint_order_probe 釘死七組＋肩三組。

## M10：化療潑灑處理套件＋Playground（2026-09-04 核准開工、同日結案）

設計文件 `docs/superpowers/specs/2026-09-04-chemo-spill-set-design.md`、計畫 `docs/superpowers/plans/2026-09-04-chemo-spill-set.md`。
三個題材物件走六步五 pass；契約只擴 `rupture`（質量轉移：袋子排空、水漬、液滴；偵測用單步動量變化
m·|Δv|，不用碰撞回呼）。展示環境是獨立專案 `../playground`（別名吃本 checkout，自己的 git），
`tailscale serve` 掛根路徑 `https://monkeyday.tail8e3f79.ts.net/`。

- [x] 0022 rupture 契約（validate_spec TDD、Actuator kind `rupture`、harness 按鈕、`src/hinge.ts` 共用 hinge／servo
      助手、actuation_test 覆蓋、`rupture_test.ts` gate）＋三模型＋playground＋tailnet。結果：
      `chemo-spill-kit`（2 body、servo 蓋；Divine Eye reject IoU 0.47——取景與 100° 開蓋透視差，監工目視通過，3 修正）、
      `chemo-iv-bag`（單 body 0.55 kg；rupture 門檻 2.0 N·s：0.3 m／0.2 m 不破、1.5 m 必破；液滴需阻尼 2.0 否則
      理想球永滾；Divine Eye pass 0.42／IoU 0.69，2 修正）、`cytotoxic-waste-bin`（3 body、蓋＋踏板 servo；Divine Eye
      pass 0.45／IoU 0.72，2 修正＋結案後補正：踏板 collider 與桶身 cylinder 重疊時 hinge 的 isCollisionsEnabled=false
      擋不住→樞軸移出＋碰撞過濾群組；0.08 m 小踏板重力 3 步垂到下限→servo 出廠回位）。全部 headless gate 綠。
      playground：三模型、側欄（打開／踩踏板／摔落／破裂／推倒／拋起／歸位／丟球／線框）、抓取拖曳、HUD、
      `scene_test.ts` 綠；對外走 launchd 常駐系統 python3 http.server（dist 複製到 `~/.local/share/playground`）＋
      tailscale serve。陷阱：macOS TCC 擋 launchd 起的 node 讀 ~/Desktop（卡在權限提示永不監聽）；macOS 版 Tailscale
      不支援 serve 直接提供檔案路徑；plane 上 DynamicTexture 要在畫布內翻轉（build.md）。

## M11：化療潑灑處理套件第二批（2026-09-05 核准開工、同日結案）

設計文件 `docs/superpowers/specs/2026-09-05-chemo-spill-set-2-design.md`、計畫 `docs/superpowers/plans/2026-09-05-chemo-spill-set-2.md`。
契約只擴 `pour`（節流的質量轉移：傾角≥門檻∧蓋門角≥門檻∧有存量 → 每秒 N 顆；`pour_test.ts` gate）；
`createHinge` 加選填 `restOffset`（兩 body 局部框架出廠即相差 θ 時讓 hinge 角 0 = 出廠姿勢，工具鏈假設如此）；
harness 背景色改與地板同色（Divine Eye 天際帶陷阱）。四新模型＋桶耳把補正＋playground 七件。

- [x] 0023 pour 契約（validate_spec TDD 8 測試、Actuator kind `pour`、harness 按鈕、hinge.ts `relativeRotation`／`hingeAngle`、
      actuation_test 覆蓋、`pour_test.ts`）＋四模型＋桶耳把＋playground。結果：
      `absorbent-powder-shaker`（2 body、蓋 servo＋pour 40 顆×0.003 kg／20 顆·s⁻¹；pour_test A/B/C 7 項綠；Divine Eye reject——白瓶配淺灰
      背景遮罩失效，目視通過；2 修正：ribbon 標籤帶取代 arc cylinder、比例對齊參考圖）、
      `spill-warning-sign`（2 body 梯形 ExtrudeShape 板、頂端 hinge servo 下限撐 A 形；actuation_test 初紅→ restOffset；Divine Eye 硬門檻過
      IoU 0.83 low-confidence 0.349；0 修正）、`absorbent-pad`（2 body hinge servo 攤開 3.1；Divine Eye reject IoU 0.60 軟包 vs 硬板，目視通過；
      2 修正）、`ppe-set`（4 自由 body 含單隻手套；Divine Eye reject 多物件構圖固有，目視通過；1 修正）、
      `cytotoxic-waste-bin` 耳把（桶口下緣、collider 落在桶身 AABB 外＋接橋；Divine Eye pass 0.37／IoU 0.72；1 修正）。
      playground：七件、地板 6 m、新卡片、scene_test 18 項綠、tailnet 重部署實測收合／傾倒／攤開。
      陷阱：arc cylinder 側面 UV 軸向不可預期（改 ribbon）；DynamicTexture 預設 CLAMP 平鋪全變邊線色（地板）；朝上 plane 的正讀方向取決於
      觀看方位（iv-bag 水平翻轉 vs pad 垂直翻轉）；check_colliders 同 body collider 重疊以 AABB 計，耳把不能嵌進桶身 collider；
      state.json 一次只屬一個模型——兩模型的 next_pass 命令不可並行。

## M12：化療潑灑處理套件第三批（2026-09-05 核准開工、同日結案）

設計文件 `docs/superpowers/specs/2026-09-05-chemo-spill-set-3-design.md`、計畫 `docs/superpowers/plans/2026-09-05-chemo-spill-set-3.md`。
契約：`pour` 加 `direction`／`exitSpeed`、`tiltThreshold` 改選填（無則 gate 必填；噴瓶只看扳機角）；新增 `collect`（反向的質量轉移：
封袋掃 `PhysicsEngineV2.getBodies()`，收走 interior 內不屬本模型、質量 ≤ maxItemMass 的 dynamic body 連 mesh dispose、質量轉入袋身；
`collect_test.ts` gate）。三新模型＋playground 十件。

- [x] 0024 pour 擴充＋collect 契約（validate_spec TDD 9 測試、Actuator kind `collect`、harness 按鈕、actuation_test 覆蓋、pour_test 依 tiltThreshold
      切換直立情境、`collect_test.ts`）＋三模型＋playground。結果：
      `disinfectant-spray`（2 body、扳機 servo 出廠回位＋pour 60 顆×0.002 kg／30 顆·s⁻¹ 沿 +z 2.5 m/s；pour_test A′/B′/C′ 綠；Divine Eye reject
      只剩 bbox IoU 0.53——參考圖瓶身佈滿畫面、含陰影，目視通過；2 修正：噴頭拆後塊＋前鼻、依參考圖量測重設比例＋標籤改 −x 側面）、
      `cytotoxic-waste-bag`（1 body 五 collider 中空容器、collect；Divine Eye pass 0.48／IoU 0.90；0 修正，參考圖重生 1 次——第一張偏成封口手提袋）、
      `scoop-and-scraper`（2 自由 body：畚斗＋斜立握把（旋轉 collider）、平板推板 8 mm；Divine Eye pass 0.47；0 修正）。全部 headless gate 綠。
      playground：十件、新卡片（噴灑／封袋）、`isDisposed` 過濾、scene_test 25 項綠、tailnet 重部署實測噴灑（21→51 剛體、總重不變）／封袋。
      陷阱：生成物 `collide ~2` 會穿過所有 `membership 2` 的模型件——無活動件的容器類模型改 `membership 8 / collide ~0`；標籤 plane 底色與
      牆面材質受光不同會成一塊異色斑——改透明底（DynamicTexture hasAlpha＋useAlphaFromDiffuseTexture）只印字；ExtrudeShape 梯形牆
      shape 在 xy、沿 z 擠出後 rotation.y = π/2 讓 x→z（x′ = z、z′ = −x）；tomato 提示要明說「開口朝上、看得見內部」否則生成封口袋；
      python 批次替換腳本任一 assert 失敗就整檔不寫——spec 已改、TS 未改會造成 check_colliders 紅，重跑前先核對每條樣式。

## Parked（自設計文件 §11 移入，不分先後）

- **本地模型駕駛**：Codex CLI `model_providers` 指向 tomato `/v1`
  （gemma-4-26b-a4b 已具 vision + tool calling），`codex --profile local`
  跑同一份 SKILL.md；零新程式碼，僅 `~/.codex/config.toml` 設定。
- **Headless 截圖備援**：`viewer/scripts/capture_playwright.mjs`（opt-in），
  讓沒有 browser tool 的 harness 也能產生落地截圖。本機環境限制（Chrome
  擴充未連線、Firefox headless 無 WebGL）落地後即可補齊視覺 gate。
- **spec↔factory 交叉檢查**：factory 的物理常數目前手動鏡像 spec；可加
  工具直接從 spec 常數比對 factory 匯出的實際幾何。附帶邊角：
  runtime_export 對「body 的 components[0] 無 collider 且無 node」會產生
  NaN 質心（現有 spec 皆不可達，pre-existing）。
- **pipeline 摩擦點隨做隨記**：每個里程碑執行中發現的摩擦點記到本節，
  不當場擴 scope。
