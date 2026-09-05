# 0023 化療潑灑處理套件第二批（M11）
model: absorbent-powder-shaker / spill-warning-sign / absorbent-pad / ppe-set / cytotoxic-waste-bin（耳把補正）    status: done（2026-09-05）
脈絡: 使用者 2026-09-05 四項全選（警示立牌、吸附粉罐、吸附墊、PPE、桶耳把）；粉罐做物理傾倒（pour 契約）、PPE 一模型多 body。
     設計文件 docs/superpowers/specs/2026-09-05-chemo-spill-set-2-design.md；計畫 docs/superpowers/plans/2026-09-05-chemo-spill-set-2.md。
分工: Claude 全做。
驗收: 每模型 strict spec／check_colliders／physics_test（含 --nudge）／actuation_test／（粉罐）pour_test 全綠；
     Divine Eye：sign 硬門檻過（IoU 0.83）、bin pass、shaker／pad／ppe reject 目視通過（原因見 ROADMAP M11）；
     playground tsc＋scene_test 18 項綠、tailnet curl 200、playwright 線上實測七件＋收合／傾倒／攤開。
notes:
  - pour：傾角用 node.getDirection(Up) 的 acos(up.y)，蓋門角用 hingeAngle（綁定在任何物理步前取）；顆粒與罐身不對稱碰撞過濾（顆粒 4/~2、罐 2/~2）。
  - restOffset：actuation_test 以吊空綁定為 0、目標取限位 0.6 倍 → hinge 角 0 必須是出廠姿勢；立牌兩板 pivot 各帶 ±0.28 時 B 側 perp 預轉 2·LEAN。
  - 修正次數：shaker 2、sign 0、pad 2、ppe 1、bin 補正 1。
  - Divine Eye 三種系統性 reject：天際帶（已改背景同色）、白主體配淺灰地板遮罩退化、多物件構圖只量最大連通塊。
  - 陷阱：arc cylinder UV、DynamicTexture CLAMP、朝上 plane 翻轉方向依觀看方位、check_colliders AABB 重疊、state.json 不可並行。
