# 0029 鏟刮板接觸收納（M17）
model: scoop-and-scraper（spec collect trigger contact＋pour source collected）；forge validate_spec；grimoire spec.md／physics.md；viewer scripts collect_test／pour_test／actuation_test／新 sweep_test；../playground src/interactions.ts、src/actions.ts、scripts/scene_test.ts、scripts/training_test.ts、README    status: done（2026-09-06）
脈絡: M16 結案後使用者選「鏟刮板鏟得起顆粒（契約側）」；結案標準選「契約 gate＋訓練第六步真人走通」；方案選「接觸即收」（探針證明純幾何在 Havok 尺度做不到）。
     設計文件 docs/superpowers/specs/2026-09-06-scoop-contact-collect-design.md；計畫 docs/superpowers/plans/2026-09-06-scoop-contact-collect.md。
分工: Claude 全做。
驗收: forge unittest 127 綠；viewer tsc＋physics／actuation／collect（contact 8/8）／pour（裝 6 倒 6、後仰不倒）／sweep（掃 7 收 7）gate 綠；袋子 collect_test、粉罐／噴瓶 pour_test、四模型 actuation_test 回歸綠。
     playground typecheck／scene-test 35／parkour-test／training-test 14 綠。player-garden 部署 200。
     瀏覽器真實輸入層第六步全鏈：pick 鏟握把 → 滾輪壓地 → 七趟拖掃收 7 顆 → 抬起按 W 走 5 m 到袋邊（最大傾角 0.4、不灑）→ 唇對袋心、E 前傾 → 7/7 落袋 → 鏟放旁邊 → 按「封袋」→ pick 袋前壁 → 抬高、按「踩踏板」→ 平移到桶口上方 → 懸停即 dispose、袋消失。
     （.img2babylon/shots/playground7-{sweep,pour,bin}.png；前五步用 API 佈置：粉罐傳送到潑灑點上方 set(1) 全倒；PPE／立牌／處理包／消毒未做，記錯 2、80 分——本里程碑只驗第六步。）
notes:
  - 探針結論見 spec §2：單顆永不進、前 3 顆靠顆粒鏈互擠；唇高 2.5 mm 對 r 5 mm 需 1.73 mg 推力 > 地面摩擦 0.8 mg；< 2 mm collider 在 Havok 失效。
  - 倒出條件除 tilt ≥ 1.0 還要出口方向世界 y < 0：Q 後仰唇朝上到 1 rad 也觸發，顆粒從朝上的唇噴出又掉回斗面（落點 bag 局部 y 0.27 就是斗面）。已改 factory＋pour_test A2。
  - 第一趟搬運 13 顆全灑：改 camera.alpha 後第一個 pointermove 目標跳 1 m、伺服猛拉。游標從目前目標投影漸進滑到中央後，空鏟走路最大傾角 0.06、載重 0.16–0.4。
  - E 是鼻子朝下但唇離袋緣只 3 cm 時斗撞袋壁卡 0.73 rad；抬到唇離袋心 ≥ 0.6 m 再傾就順。前傾到 0.85 後要重新把唇對到袋心（鏟繞手點旋轉會把唇甩開），對準精度 2 mm → 7/7。
  - 袋子平移時底（袋心 −0.175）要高過桶緣 0.45，否則撞歪桶（binTop 跟著跑到 (4.19, 0.56, 3.03)）；對準桶口要補償 (袋心 − 手點) 偏移；抬到袋心 ≥ binTop+0.45 再平移，懸到桶口即 dispose。
  - 一次性未解釋觀察（第一輪、後來未重現）：鏟子從袋子正上方放手砸到袋後，按封袋 30 幀內 dispose 提早為 true。之後放手前先移到旁邊，六輪都正常。
  - training_test 新增 train:bin-top-lid 證明 binTop 不隨蓋開合漂移（曾懷疑是 M16 bug，實為袋撞桶）。
  - `T.reset()` 不會把被 API 移走的物件放回原位；乾淨重跑要 reload。
