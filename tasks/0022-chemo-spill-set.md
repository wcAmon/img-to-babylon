# 0022 化療潑灑處理套件（M10）
model: chemo-spill-kit / chemo-iv-bag / cytotoxic-waste-bin    status: done（2026-09-04）
脈絡: 使用者 2026-09-04 指定題材與三物件；點滴袋潑灑＝破裂（質量轉移）；playground 掛 tailnet 根路徑。
     設計文件 docs/superpowers/specs/2026-09-04-chemo-spill-set-design.md；計畫 docs/superpowers/plans/2026-09-04-chemo-spill-set.md。
分工: Claude 全做。
驗收: 每模型 strict spec／check_colliders／physics_test（含 --nudge）／actuation_test／（iv-bag）rupture_test 全綠；
     Divine Eye：kit reject（監工目視通過）、bag pass、bin pass；playground tsc＋scene_test 綠、tailnet curl 200、
     playwright 在 https://monkeyday.tail8e3f79.ts.net/ 實測三模型＋破裂。
notes:
  - rupture 門檻 2.0 N·s：0.55 kg 自 0.3 m（physics_test）與 0.2 m 不破、1.5 m 必破，未調整。Havok 質量存 float32，gate 容差 1e-5。
  - 液滴：理想球在地面永滾（無滾動阻力），線性／角阻尼 2.0 才能 300 步內靜止。
  - 修正次數：kit 3（blockout 額度用完）、bag 2、bin 2＋結案後補正 1（playground scene_test 揭露踏板問題）。
  - 教訓：hinge 兩端 collider 重疊時 isCollisionsEnabled=false 擋不住（要碰撞過濾群組或幾何不重疊）；
    小輕零件重力下數步就到限位，綁定零點要在物理步之前量或用 servo 出廠鎖位；
    plane DynamicTexture 需畫布內翻轉；macOS TCC／launchd／Tailscale serve 限制見 ROADMAP M10。
