# img2babylon

從一張參考圖（或文字描述經內網 tomato-image 生圖）出發，由 agent（Claude Code /
Codex CLI）以程式碼產生 Babylon.js 程序化 3D 模型——附真實 Havok 物理：複合碰撞
形狀、質量、hinge 約束，可丟擲、堆疊、翻倒。

架構參考 [img2threejs](https://github.com/hoainho/img2threejs)（見 `reference/`），
關鍵差異：collider 從 metadata 升級為一等公民，並新增三層物理驗證
（靜態 AABB gate / headless Havok 模擬 / PhysicsViewer 目視）。

- 入口與規則：`SKILL.md`
- 設計文件：`docs/superpowers/specs/2026-08-31-img2babylon-design.md`
- 快速開始：`cd viewer && npm install && npm run dev` →
  `http://localhost:5173/#model=sample-crate`
