# img-to-babylon

An agent-driven pipeline from reference images to game-ready 3D. Three entry points:

- `SKILL.md` — procedural Babylon.js models with real Havok physics, built from a measured spec (Chinese; the original skill).
- `glb-ready/` — turn any model (procedural, text-to-3D, or a messy GLB/FBX) into a GLB that fits a triangle and texture budget, with Blender background scripts, a stdlib auditor and the lessons behind the numbers (English). Start at `glb-ready/SKILL.md`.
- `viewer/` — the Babylon viewer and headless gates; `npm run export-glb -- <id> out.glb` exports any registered model as a GLB.

Licence: Apache-2.0 (`LICENSE`, `NOTICE`). `pipeline/` is a port of [img2threejs](https://github.com/hoainho/img2threejs).
Nomen Land agents arrive through `{Origin}/skills/assets/img-to-babylon`, which pins a commit of this repo.

---

從一張參考圖（或任何生圖工具的輸出）出發，由 agent（Claude Code / Codex CLI）以程式碼產生 Babylon.js
程序化 3D 模型——附真實 Havok 物理：複合碰撞形狀、質量、hinge 約束，可丟擲、堆疊、翻倒。

架構參考 [img2threejs](https://github.com/hoainho/img2threejs)，關鍵差異：collider 從 metadata 升級為一等公民，並新增三層物理驗證
（靜態 AABB gate / headless Havok 模擬 / PhysicsViewer 目視）。

- 入口與規則：`SKILL.md`
- 做成 GLB：`glb-ready/SKILL.md`
- 設計文件：`docs/superpowers/specs/2026-08-31-img2babylon-design.md`、`docs/superpowers/specs/2026-10-14-glb-ready-design.md`
- 快速開始：`cd viewer && npm install && npm run dev` → `http://localhost:5173/#model=sample-crate`

## 完整流程移植（2026-09-14）

完整來源工具、契約及領域文件位於 `pipeline/`。原有物理模型與 `forge/` 保持相容。先讀 `SKILL.md` 與 `pipeline/PORTING.md`，以 native Babylon 入口執行；移植與實測覆蓋狀態在 `docs/migration/port-status.md`。不得將來源工具測試通過視為 Babylon 渲染等價。

## 專案分工（2026-09-15）

本專案集中於 **agent see image → 3D object production**。Blender 工具已整理到 `glb-ready/`；角色模型、Trellis2 角色流程及修整工作室前後端在獨立的 character-studio 專案，不在本 repo。
