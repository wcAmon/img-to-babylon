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

## M5：kimodo.cpp 動作燒錄（2026-09-01 調查完成，待 M4 地基）

NVIDIA Kimodo 文字轉動作（C++/GGML，CPU 可跑，核心 Apache-2.0；用 SOMA 30 關節
模型可商用，避開僅限研究的 SMPL-X）。路徑：kimodo 離線生成骨骼 GLB →
`forge/retarget.py`（stdlib 解析 GLB，30 關節映射到公仔 9 關節、投影 joint axis、
夾 angular 限位）→ 關節角度時間線 JSON → viewer 伺服馬達播放（物理驅動）。
M4 的 servo 馬達與 playground 正是此項的前置工程。

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
