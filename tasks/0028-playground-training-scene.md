# 0028 playground 訓練場景（M16）
model: （無新模型；../playground src/training/*、src/actions.ts、src/hinge.ts、src/grab.ts、src/interactions.ts、src/parkour/controller.ts、src/ui.ts、src/main.ts、scripts/training_test.ts）    status: done（2026-09-06）
脈絡: 使用者 2026-09-06 問「重新審視化療潑灑 3D 教學環境還缺什麼」後決定「正式設計場景、把流程帶進來、物件距離拉開讓 player 跑站」。
     釐清：走近＋滑鼠抓取；順序檢核記錯不阻擋；PPE 拿到身上就算穿；新 ?scene=training 保留沙盒；由本 session 連同提交另一 session 未追蹤檔。
     設計文件 docs/superpowers/specs/2026-09-06-playground-training-scene-design.md；計畫 docs/superpowers/plans/2026-09-06-playground-training-scene.md。
分工: Claude 全做。
驗收: playground `npm run typecheck` 綠；`npm run training-test` 13/13（reach、wear、gloves-first、no-ppe-contact、stepped-in-spill、wipe-before-disinfect、unsealed-dispose、doff-gate、
     layout、bag-drop、s17-figure、player、golden）；`scene-test` 34/34、`parkour-test` PASS 不變。
     部署改 `../player-garden/scripts/serve.sh` 統包 → https://monkeyday.tail8e3f79.ts.net/playground/ 200、bundle 含「化療潑灑處理訓練」。
     瀏覽器（playwright 合成鍵盤／pointer／wheel 走真實輸入層）演完七步：立牌搬到 (−1.11, 0)、PPE 三件依序穿上、開處理包、粉罐 40 顆 32 顆進足跡（水漬 0.35）、
     噴 31 滴 30 滴吸收（消毒 100%）、墊蓋上擦掉、封袋 2 顆、袋投桶 dispose、脫除 → 7/7、0 錯、100 分（.img2babylon/shots/playground6-{room,ppe,absorb,wipe,done}.png）。
notes:
  - 入袋的顆粒**不是**用鏟子鏟的：鏟刮板沿走廊貼地掃過 7 顆仍 0 顆入斗（鏟底碰撞盒離地 ~4 mm、前唇無斜角，直徑 12 mm 顆粒被推走或從底下鑽過），
    顆粒 mesh `isPickable=false` 也不能直接抓。演示用 `__PLAYGROUND_GRAB__.begin(clump)` API 放 3 顆入袋（同一套物理，只繞過 pick）。模型側修正列 next-steps。
  - ArcRotateCamera 的 `target =` 是 setter（rebuildAnglesAndRadius）：相機原地不動只轉頭、radius 漲到上限、程式設 alpha 每幀被覆寫。跟隨鏡頭用 `Vector3.LerpToRef(camera.target, …, camera.target)`。
  - 抓粉罐從上方 pick 會抓到瓶蓋 pivot；抓取後要驗 `G.body` 是 bottle。鏟子放手常側躺，抓起後相機朝 ±z 用 Q／E 可滾正（Q／E 繞相機右軸）。
  - `lift` 把手點夾在 y ≥ 0：等 y < 0 的迴圈會卡死（演示腳本踩到，另一個 evaluate 換掉 helper 讓它 throw 才脫困）。
  - 測試 teleport 子節點 body 要 `setAbsolutePosition`（PPE、廢棄物袋是 root 子節點；顆粒／液滴是 root 層級才能直接設 position）。
  - 快照的 hinge 讀取器必須在任何 servo 命令前建（記綁定姿勢）；以 BuiltModel 為鍵快取，歸位換新模型自動重綁。
  - 玩家膠囊會撞飛小物件（吸附墊被撞到西牆邊）；strength 30 不夠，列 next-steps。
