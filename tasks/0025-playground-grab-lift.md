# 0025 playground 抓取抬高＋傾斜（M13）
model: （無新模型；../playground src/grabController.ts、src/grab.ts、src/ui.ts、index.html、scripts/scene_test.ts）    status: done（2026-09-05）
脈絡: 使用者 2026-09-05 選 docs/next-steps.md 第 1 項「抓取抬高 UX」；操作方式選「Shift 垂直面＋滾輪＋Q/E 傾斜」。
     設計文件 docs/superpowers/specs/2026-09-05-playground-grab-lift-design.md；計畫 docs/superpowers/plans/2026-09-05-playground-grab-lift.md。
分工: Claude 全做。
驗收: playground `npm run typecheck` 綠；`npm run scene-test` 28/28（既有 25＋grab:lift／grab:tilt／grab:carry-pour）；
     tailnet https://monkeyday.tail8e3f79.ts.net/ 200、新提示樣式上線；playwright 以 `__PLAYGROUND_GRAB__` 演完整流程：
     粉罐開蓋→抓起搬到鏟斗上方傾倒 40 顆入斗 39 →鏟後仰→抬 0.5 m→搬到袋上→前傾 2.0 rad→38 顆落袋→鏟歸位→封袋質量 0.20→0.314、38 顆 dispose。
     證據 .img2babylon/shots/playground4-{scoop,pour,sealed}.png。
notes:
  - 控制器每 physics step 覆寫線速度（GAIN 8、夾 3 m/s、加 −g·dt 前饋）與角速度（P 30＋I 60、I 夾 3、夾 6 rad/s）；手點用 body-local 偏移，修掉「body 原點跳到點選點」。
  - 四元數：`err = target.multiply(Inverse(cur))`、`tilt = RotationAxis(axis, dθ).multiply(targetRot)`（世界軸）。初版順序寫反，grab:tilt 收斂到 π 才發現。
  - 判準修正：原擬「步後速度 < 0.05」不成立——斗內載重每步接觸衝量留 ≈ 0.5·g·dt 殘速；改最後 30 步手點誤差最大值 ≤ 3 cm。
  - 測試與 demo 三個教訓：目標插值滑動（跳 0.5 m 會 3 m/s 起步踢飛）；P 姿態伺服穩態誤差讓球滾出前唇（加 I）；先後仰再抬（先抬再後仰 40 顆剩 8）。
  - 未做：觸控（無 Shift／滾輪／鍵盤）；推板把地上顆粒推進鏟的人手操作未做 headless 斷言（demo 改以粉罐直接倒進斗，同樣是完整流程）。
  - playground 工作區另有未提交的人偶跑酷改動（main.ts 拆場景切換、chemo.ts、parkour/），本任務只 commit 上列五檔；README 加操作說明留在工作區未提交。
  - 部署 `npm run serve` 連同另一 session 的 parkour 場景一起上線（與 M12 相同）。
