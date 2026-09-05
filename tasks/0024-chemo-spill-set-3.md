# 0024 化療潑灑處理套件第三批（M12）
model: disinfectant-spray / cytotoxic-waste-bag / scoop-and-scraper    status: done（2026-09-05）
脈絡: 使用者 2026-09-05 選「第三批物件」，三問三答：噴霧擴充 pour（不另立契約）、袋子做開口容器＋collect 契約、鏟刮板做兩自由 body。
     設計文件 docs/superpowers/specs/2026-09-05-chemo-spill-set-3-design.md；計畫 docs/superpowers/plans/2026-09-05-chemo-spill-set-3.md。
分工: Claude 全做。
驗收: 每模型 strict spec／check_colliders／physics_test（噴瓶含 --nudge trigger）／actuation_test／（噴瓶）pour_test／（袋）collect_test 全綠；
     forge 121 測試 OK；Divine Eye：袋 pass 0.48、鏟刮板 pass 0.47、噴瓶 reject 只剩 bbox IoU 0.53 目視通過；
     playground tsc＋scene_test 25 項綠、tailnet 200、playwright 線上實測十件＋噴灑／封袋。
notes:
  - pour 擴充：無 tiltThreshold 只看 gate 角；direction 用 TransformNormal 轉世界；生成點由 factory 定（噴嘴）。pour_test 以 tiltThreshold 有無切換側躺／直立。
  - collect：掃 getBodies() 複本、排除本模型／isDisposed／非 dynamic／質量超限、interior 局部框判定、dispose 外來 body 連 mesh；擁有者 dispose 走守衛；消費者過濾 isDisposed。
  - 碰撞群組：生成物 collide ~2 穿過 membership 2 的所有模型件 → 容器類（袋、鏟刮板）用 membership 8 / collide ~0。
  - 修正次數：spray 2、bag 0（參考圖重生 1）、tools 0。
  - 陷阱：標籤透明底避免異色斑；ExtrudeShape 梯形牆方向；tomato 提示「開口朝上」；批次替換 assert 失敗整檔不寫。
  - playground 工作區另有未提交的人偶跑酷改動（非本任務），本任務只 commit scene.ts／ui.ts／scene_test.ts；README 的十件說明留在工作區未提交。
