---
name: img2babylon
description: 從參考圖經完整量測、角色與物件分解、程序化 Babylon 建模、材質、頭髮、骨架及視覺驗收流程重建模型，並整合真實 Havok 物理。
version: 1.6.0
---

# img2babylon — 完整流程入口

先讀 `pipeline/PORTING.md`，再讀 `pipeline/SKILL.md`。後者保留原始 image-to-threejs 的完整流程與細部路由；前者是 Babylon 執行與物件轉換的權威。移植完成度與驗證紀錄見 `docs/migration/port-status.md`，不得把來源搬入或工具測試通過宣稱為完整渲染等價。

## 使用者已核准的範圍

2026-09-14：完整移植原始流程，包括此前精簡核心排除的角色解剖、頭髮、likeness／投影、材質參考、骨架與各驗收路徑。引擎相關物件必須實際轉換；僅改名稱或保留未被消費的 metadata 不算實作。完成移植驗證後，由 Codex CLI 接入同一流程精修 female-tactical 頭臉與全身。

## 必守契約

1. 程序化重建為預設；原始 reference projection 必須 de-light、記錄來源與相機。外部神經 mesh／素材／服務維持原流程的 opt-in 與授權界線。
2. 每輪最多 6 次修正，第 7 次不得執行；累計與各 pass 次數只作歷史。新輪先保存 source/runtime/state 快照；不得自動換輪規避上限。
3. 完整流程使用 `python3.11 pipeline/forge/babylon.py` 的 init/next/mark/round；每次開始、續作及修正前讀 next。完成步驟必須有存在且非空的證據檔，跳過必須附理由。
4. 先適用性與品質契約，再量測、spec、strict validation、逐 pass 產碼。角色必須走 anatomy/landmarks、頭部構形、頭皮綁定髮型與局部五官 gate。
5. 每張瀏覽器截圖先保存到 `.img2babylon/shots/`，再讀回；與原參考圖校準相機後比較。前後版比較只能證明變化，不能代替參考相似度。
6. 單位公尺；尺寸烘入幾何；種子固定；左右須鏡像。座標 handedness、winding、法線、相機、骨骼 inverse binds 必須一起轉換並以數值測試驗證。
7. Babylon PBR 必須實際使用 authored 參數。Three.js Group/BufferGeometry/userData/Skeleton 等依 native port 轉為實際 Babylon 物件。
8. 物理完成仍需 spec 權威 + 真實 Havok shape/constraint + 靜態/動態/線框 gate。視覺骨架不等於 ragdoll。
9. 保留模型 ID、穩定零件 ID、優化入口、歷史失敗審查。不得用測試數量代替外觀驗收，未實作或可選依賴缺失要明確報告。

## 交付物是 GLB 時

目標是「遊戲收得進去的 GLB」而不是 Babylon 程序化模組時，入口是 `glb-ready/SKILL.md`（英文，約 250 行，一次讀完）。本 repo 的程序化模型用 `cd viewer && npm run export-glb -- <id> out.glb`；外來網格（Trellis、Tripo、Rodin、別人給的 GLB/FBX）走 `glb-ready/scripts/` 的 Blender 背景腳本；最後一律跑 `python3 glb-ready/scripts/glb_audit.py out.glb`，再跑目標網站自己的檢查器（Nomen Land 是 `nomen-glb check`）。已綁骨的模型不減面。

## 完整流程常用命令（repo root）

```sh
python3.11 pipeline/forge/babylon.py init --state /absolute/workflow.json --reference /absolute/reference.png --spec /absolute/sculpt-spec.json --profile character
python3.11 pipeline/forge/babylon.py next --state /absolute/workflow.json
python3.11 pipeline/forge/babylon.py mark image-analysis --state /absolute/workflow.json --evidence /absolute/analysis.md
python3.11 pipeline/forge/stage3_build/generate_babylon_factory.py /absolute/sculpt-spec.json --out /absolute/createModel.ts --pass-id blockout
```

## 相容舊模型

原 `forge/`、`grimoire/`、viewer 現有模型保留，供 BabylonSculptSpec v1 與 Havok 工具使用。完整 character track 不得只用舊 `next_pass.py done` 略過新 gate。舊模型須明確轉成 canonical ObjectSculptSpec，不能直接改 schema 名稱。旧工具速查 `grimoire/scripts.md`；完整領域流程在 `pipeline/grimoire/`。

forge 與 pipeline/forge 只用 Python stdlib；完整管線用 Python 3.11+。viewer 依現有 package lock。來源參考 checkout 唯讀，pipeline/ 保留 Apache-2.0 授權與固定內容雜湊。
