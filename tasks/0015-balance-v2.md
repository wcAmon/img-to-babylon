# 0015 質心-支撐面平衡控制器（StandBalance v2）：被推要站回來
model: action-figure        status: open
脈絡: M8 第二卡。0014 裝了踝關節（servo:boot-{l,r}.{x,z}，x 俯仰 ±0.5、z 側傾 ±0.3）。
     0012 v1 平衡只看軀幹前傾（u = 0.8·lean + 30·drift，髖/膝/踝俯仰 servo 同一個 u），
     不看側傾、不看質心。監工探針（2026-09-03）：v1 四方向只撐得住 0.001 N·s 衝量，
     0.002 在 ±z／-x 倒（-x 甚至 0.001 就倒）。物理上剛體翻倒門檻約 0.2 m/s，0.004 N·s
     只給 85g 人偶 0.047 m/s——可回復範圍，倒的是控制器。
     0016 單腳站需要側傾控制與「質心壓到單靴上」，本卡先把雙腳的質心平衡做紮實。
目標（設計，細節由你依證據定）:
  - BuiltModel.balance 升級為 v2（型別加可選欄位，舊 v1 欄位保留；StandController 無
    v2 欄位時退回 v1 行為，0012 gate 語意不變）：
      支撐面：由 balance 指定的 support body id（action-figure：boot-l、boot-r）
      的 absolutePosition 算中心（雙腳＝平均）；質心＝全 body 質量加權 absolutePosition。
      誤差 e_z（俯仰）= com.z − support.z、e_x（側傾）= com.x − support.x，各配 PD
      （速度項用質心速度或有限差分），也可保留 v1 的 lean 項當阻尼/前饋。
      執行器：俯仰 → 踝 x 主控（sign 依證據）＋髖 x／膝 x 輔助；側傾 → 踝 z 主控
      ＋髖 z 輔助。每步 set(clamp(base + Σ sign·u_axis))，與 0013 的 setPoseTarget
      基準疊加相容。
  - 增益由你調（v2 增益不受 0012「0.8/30 紅線」限制，但 v1 退回路徑的 0.8/30 不動），
    調參必須跨家族：gate 已編入 4 方向 × 2 衝量 × 3 癱家族 = 24 景，單景綠不算數。
  - 站立六輪 gate（stand_test）與 playground 站立按鈕行為不得退化。
量測儀器／紅燈: `viewer/scripts/balance_test.ts`（監工寫；斷言／衝量／家族／支撐面尺寸勿改）。
     現況：第一景 `[collapse 150 / push +z 0.002]` 即倒（頭高 0.0150 < 0.0704）。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit
  2. node --import tsx scripts/balance_test.ts（24 景全綠＋doctrine）
  3. node --import tsx scripts/stand_test.ts（六輪全綠）
  4. node --import tsx scripts/physics_test.ts action-figure --spec models/action-figure/spec.json
  5. node --import tsx scripts/actuation_test.ts action-figure --spec models/action-figure/spec.json
  6. node --import tsx scripts/motion_test.ts action-figure --spec models/action-figure/spec.json --timeline ../.img2babylon/motion/walk-timeline.json
  7. node --import tsx scripts/motion_suspension_test.ts
  8. node --import tsx scripts/face_test.ts
  9. python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'
  10. 監工另做：playground 真按鈕站立循環＋丟球/拋起擾動目視。
允許的探索: 增益、PD 結構、哪些 servo 參與、是否加質心速度項、是否用踝 z 側傾——
     全部可調，但每個嘗試的數據（哪幾景過／哪幾景倒、倒向）寫進 notes；三輪仍紅
     → 寫清哪個方向×力道×家族倒、倒的機制，停手（status 不動）。
紅線: 不得改 gate／斷言／門檻／衝量／家族；不得 STATIC 錨、凍結 body、永久
     disablePreStep；不得改 spec 幾何／質量／限位；v1 退回路徑 0.8/30 不動；
     不得 git add/commit；臨時探針用完刪；notes 寫卡、status 不動；
     用 node --import tsx（不是 npx tsx）。
notes:
