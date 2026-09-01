# 0001 前輪靜態轉向不可見
model: toy-racer        status: dispatched
症狀: playground 靜止時拉轉向滑桿，前輪視覺上幾乎不轉（實測 0.06 rad，目標 0.4）。
     技術背景：Havok 靜摩擦是硬約束、馬達是軟彈簧，力開到 1e6 也推不動
     （grimoire/physics.md「靜止接觸是硬黏著」陷阱；行進中轉向正常）。
驗收: cd viewer && npx tsx scripts/actuation_test.ts toy-racer --spec models/toy-racer/spec.json
     其中 steer-static:knuckle-fl / knuckle-fr 兩項須 OK（靜止拉滿 1 秒實測角 ≥ 0.5×0.4 rad），
     且該命令整體 pass 與既有 gate 全綠：
     - python3 forge/validate_spec.py viewer/models/toy-racer/spec.json --strict
     - cd viewer && npx tsc --noEmit
     - npx tsx scripts/physics_test.ts toy-racer --spec models/toy-racer/spec.json --roll chassis
     - npx tsx scripts/runtime_export.ts toy-racer --spec models/toy-racer/spec.json --out ../.img2babylon/toy-racer/runtime.json && python3 ../forge/check_colliders.py ../.img2babylon/toy-racer/runtime.json
notes:
- 2026-09-01 依監工核准方案實作探針；未找到能同時通過靜態轉向與既有行進轉向 gate
  的前輪接觸設定，因此未留下 spec/factory 行為變更，status 保持 dispatched。
- RED 基線（前後輪 cylinder、摩擦 0.9）：steer-static 左/右 = 0.059/0.061 rad，
  兩項 FAIL；其餘 actuation 項目通過，整體 pass=false。
- 前輪單變因摩擦（後輪固定 0.9，幾何固定 cylinder 12 mm）：
  - 0.50：steer-static = 0.059/0.061，兩項 FAIL。
  - 0.35：steer-static = 0.162/0.158，兩項 FAIL。
  - 0.30：steer-static = 0.213/0.221，兩項 OK；但行進 yaw 在 +0.4/-0.4
    命令下為 -1.522/+1.425 rad（皆反號），整體 FAIL。故摩擦值無可用交集。
- 前輪接觸幾何探針（摩擦恢復 0.9；後輪維持 cylinder 12 mm）：
  - sphere（r=14 mm）：steer-static = 0.405/0.404，兩項 OK；但行進 yaw
    +0.4/-0.4 = -0.955/+0.930 rad（皆反號），整體 FAIL。球形接觸沒有輪胎方向性。
  - cylinder 2 mm：steer-static = 0.147/0.342（左 FAIL、右 OK）；行進 +yaw=0.029
    未達 0.03，負向兩輪角亦未達門檻，整體 FAIL。
  - cylinder 1 mm：steer-static = 0.112/0.308（左 FAIL、右 OK）；行進兩方向亦有
    輪角或 yaw 未達門檻，整體 FAIL。窄胎面呈現不穩定左右不對稱。
- 五項驗收結果：第 1 項 actuation gate 未綠（上述數據），所以不宣稱完成；依「做不到
  門檻就把探針數據寫進 notes 收工」停止。第 2–5 項未作完成驗收，因候選方案已在
  第 1 項淘汰。此 sandbox 的 `npx tsx` 會因 Unix socket `listen EPERM` 無法啟動，
  探針以等價的 `node --import tsx scripts/actuation_test.ts ...` 執行；未修改任何測試。

- 第三輪（2026-09-01 21:23 派工，監工方向：橫向主銷偏距 scrub radius——steer 軸沿 x
  偏離輪心 d∈{4,6,8}mm，轉向變滾動繞開硬黏著；pivotA/pivotB 左右鏡射、摩擦不動）：
  codex exec 卡死 33 分鐘無輸出（CPU 0%），監工砍掉。**方向未被否證，待重派**。
  重派 prompt 可原樣重用（本卡上方監工註記）。
