# 0019 質量契約：action-figure 腿鏈質量比 ≤ ~10:1（靴 0.005／小腿 0.008／大腿 0.01）
model: action-figure        status: open（2026-09-03 使用者核准）
脈絡: 姊妹 repo image-to-physics P0005 探勘（2026-09-03）：Havok POSITION 馬達本身是剛體（單擺
     24.5 N·m 只偏 0.002 rad）；M7／M8／M1 所有「軟 servo、黏滑、後向無權威、抬腿彈飛」的真根因是
     **關節兩側質量比**——倒單擺 85 kg 撐 1 kg 底座必翻、5 kg 起剛體。現行 base 質量：torso 0.04、
     head 0.018、arm 0.003×4、thigh 0.0025、calf 0.004、boot 0.001 ⇒ 踝 85:1、髖 40:2.5。
     人偶 runtime 覆寫驗證（軟 servo）：靴 ≥0.005 回收後向質心權威；腿鏈 0.01/0.008/0.005 ＋側傾
     增益 ×2 回收快速單腳站（ramp 300 三家族）。純數值契約改動，幾何／限位／外觀不動。
要做:
  1. `viewer/models/action-figure/spec.json`：thigh-l/r mass 0.0025→0.01、calf-l/r 0.004→0.008、
     boot-l/r 0.001→0.005（總質量 0.085→0.116；0014「calf+boot 5 g」約束解除，改記本卡理由）。
  2. factory `BODY_DEFS` 鏡射同值；`grimoire/spec.md`／`physics.md` 加「質量比 ≤ ~10:1」契約條
     （倒單擺證據一句）；ROADMAP 記 0019。
  3. forge 測試若斷言質量（validate_spec／retarget fixtures）同步；`runtime_export`／
     `check_colliders` 重出。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit；validate_spec --strict
  2. physics_test action-figure --spec、actuation_test、motion_test（walk）、motion_suspension_test、
     face_test 全綠；forge unittest 全綠
  3. stand_test、balance_test、scale_test 10：預期綠；若紅，允許把 balance 側傾軸（roll）P/D/I 與
     feedforward.roll.maxOutput 各 ×2（探勘證據），其他增益不動；三輪仍紅 → blocked 帶證據。
  4. Divine Eye 全身輪廓不變（質量不影響幾何）；runtime.json 重出。
  5. 監工另做：image-to-physics 更新依賴 commit，authority_test A–D 與既有 gate 重跑。
紅線: 不得改幾何／限位／collider；不得改 gate 門檻；不得 git add/commit；臨時檔用完刪；
     notes 寫卡、status 不動；用 node --import tsx（不是 npx tsx）。
notes:
