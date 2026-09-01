# 0001 前輪靜態轉向不可見
model: toy-racer        status: blocked
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

- 第三輪重派（2026-09-01）：依核准方案掃描橫向主銷偏距；「內偏」為左輪 s=+1、
  右輪 s=-1（轉軸向車體中心偏），「外偏」極性相反。摩擦、質量與 collider 幾何
  均保持基線。各組 actuation gate 的 steer-static 左/右角與行進 yaw（命令 +0.4/-0.4）如下：
  - d=0.004 m，內偏：static=0.081/0.048 rad；yaw=+0.082/-0.166 rad；整體 FAIL。
  - d=0.004 m，外偏：static=0.046/0.070 rad；yaw=+0.061/-0.100 rad；整體 FAIL。
  - d=0.006 m，內偏：static=0.085/0.030 rad；yaw=+0.083/-0.211 rad；整體 FAIL
    （負向行進右輪角 -0.094 rad 亦未達 0.1 rad 門檻）。
  - d=0.006 m，外偏：static=0.037/0.044 rad；yaw=+0.058/-0.100 rad；整體 FAIL
    （負向行進左輪角 -0.086 rad 亦未達 0.1 rad 門檻）。
  - d=0.008 m，內偏：static=0.097/0.046 rad；yaw=+0.102/+0.760 rad；整體 FAIL
    （負向 yaw 反號）。
  - d=0.008 m，外偏：static=0.046/0.055 rad；yaw=+0.050/+0.036 rad；整體 FAIL
    （負向 yaw 反號，負向兩輪角 -0.085/-0.095 rad 亦未達門檻）。
- 結論：六組都未通過 steer-static 左右各 ≥0.2 rad，因此不存在同時滿足靜態轉向與
  行進同號 yaw ≥0.03 rad 的候選；依任務約定未留下 spec/factory 行為變更，status 不動。
- 恢復基線後驗收：actuation gate 仍僅 steer-static 左/右 0.059/0.061 rad FAIL、整體
  pass=false；strict spec、TypeScript、physics roll、runtime export/collider gate 均通過。

- 監工結論（2026-09-01，三輪用盡 → blocked / request-input）：三條獨立路線
  （摩擦交集、接觸幾何、scrub radius）皆被數據否證。根因是引擎級的：Havok
  靜摩擦為硬約束、6DoF 馬達為軟彈簧，靜止承載輪無論力多大都扭不動
  （physics.md 陷阱）。現實對照：真車靜止打方向盤也極重（動力方向盤因此存在）。
  待使用者裁決驗收標準：(a) 刪 steer-static 斷言、以既綠的行進轉向為契約，
  或 (b) 降門檻為「機構有反應」弱斷言（如 ≥0.05 rad），或 (c) 另闢引擎級方案。
