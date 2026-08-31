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

## M2（下一步）：玩具公仔 `action-figure` — ragdoll

人形的物理對應物不是蒙皮動畫，而是 ragdoll。約 10 剛體（頭/軀幹/上臂×2/
前臂×2/大腿×2/小腿×2）+ 約 9 個**帶人體關節限位的多軸 constraint**：
肘/膝單軸 hinge（約 0–140°）、肩/髖三軸錐形限位、脖子小範圍三軸。
丟出去要像玩偶一樣癱倒——不炸開、四肢不反折。

需要的契約擴充：

- 多軸限位 constraint（M1 只需單軸自由；此處要逐軸 limits）
- character spec 分支：頭身比（head-unit）契約 + 比例 gate 進 validate_spec
- physics_test 加 ragdoll 斷言：落地後各關節角度在限位內、無 NaN、身體不散
- 目視 review 清單加 chirality（左右手性）檢查

公仔風格 = 宣告「所有零件都不跨關節」（img2threejs 九層本體論的 L3
單骨硬件）：硬殼頭髮、貼片五官，一刀砍掉蒙皮/SDF 工程，保留完整關節物理。

## M3（遠期，需獨立設計文件走 architectural 路徑）

- **有機蒙皮角色**：Babylon 無內建 marching cubes——SDF 平滑融合軀體與
  geodesic skinning（參考 `reference/img2threejs/forge/stage5_rig/`）都是
  大工程，等 M1/M2 暴露真實需求再排。
- **Divine Eye 確定性審查移植**：IoU/比例/對稱/pHash/SSIM 等腳本化訊號
  （參考原作 v1.3），把 agent vision 只花在腳本判斷不了的地方。
- **可駕駛車（馬達 hinge）**：在 M1 自由滾動之上加 constraint motor 與
  viewer 鍵盤輸入。

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
