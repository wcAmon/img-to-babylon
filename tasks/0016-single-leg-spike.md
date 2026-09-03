# 0016 單腳站 spike（M8 生死關）：質心壓到左靴上方，抬右腿撐 5 秒
model: action-figure        status: open
脈絡: M8 第三卡（ROADMAP）。0015 已給：v2 質心平衡（setBalanceTarget 橫移 ±0.004S 到位）、
     踝側傾＋髖外展平行四邊形（開迴路 0.1 rad → 0.045–0.059S）。0013 證明沒有重心轉移時
     一抬腿就倒；本卡驗證有了重心轉移能不能單腳站。
     幾何（base·S）：左靴中心 x=+0.009（LEG_X）、靴半寬 0.008、半深 0.014；質心要從兩腳
     中間橫移 ~0.009S 到左靴中心。0015 gate B 只驗到 ±0.004S；本卡要推到 0.009S。
     已知限制：後向俯仰閉迴路無權威（0015 notes）；抬腿時右腿質量前移會讓質心前偏，
     這方向（前）有權威。
需要落地的 API（探針引用，目前 tsc 紅）:
     StandController.setSupportBodies(ids: string[]): void
       - v2 支撐面參考改為指定 body 的 absolutePosition 平均（單腳＝該靴）；
         setBalanceTarget 的目標仍相對此參考。enable() 時重設為 balance.supportBodyIds。
       - 切換當下不得讓指令跳變：參考點從兩靴中心跳到左靴中心（Δx≈0.009S）會讓誤差瞬間
         變號——實作要在切換時把前饋／積分狀態對應平移（或用 ramp 過渡），寫清做法。
量測儀器: `viewer/scripts/single_leg_probe.ts`（監工寫；協定／指標勿改）。
     用法：node --import tsx scripts/single_leg_probe.ts [--collapse 300] [--shift 0.009]
           [--lift-hip -0.6] [--lift-knee 0.8] [--out file]；JSON 用 `sed -n '/^{/,$p'`。
     階段：shift-ramp → shift-hold → switch-hold → lift-ramp → hold；每階段記頭高／up／
     質心相對左靴／右靴離地。
成功判準（監工定，勿改）:
     collapse ∈ {150, 300, 450} 三家族，預設參數（shift 0.009、hip −0.6、knee 0.8）全部：
     fell=false、final.standing、final.comInsideLeftBoot、final.rightBootClear（≥0.002S）。
     達標 → spike 成功，0017 開步態。
     不達標 → 允許的探索（每個都寫數據）：shift 0.007～0.011、lift-hip −0.3～−0.6、
     lift-knee 0.4～0.8、lift ramp 較慢（探針參數外的改動要寫進 notes 並說明）；
     v2 增益／前饋可調（0015 gate 不得因此變紅）。三輪仍不達標 → 寫清倒下階段與機制
     （質心軌跡、哪個 servo 飽和、右靴何時離地），停手 → M8 tombstone 由監工與使用者議。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit
  2. for c in 150 300 450; do node --import tsx scripts/single_leg_probe.ts --collapse $c | sed -n '/^{/,$p'; done（三家族 JSON 摘要進 notes）
  3. node --import tsx scripts/balance_test.ts；scripts/scale_test.ts 10；scripts/stand_test.ts（全綠）
  4. physics／actuation／motion(walk)／suspension／face 全綠；forge unittest 98
  5. 監工另做：playground 目視（若成功，錄影證據）。
紅線: 不得改探針協定／指標／判準；不得改 gate；不得 STATIC 錨、凍結 body、永久
     disablePreStep；spec 幾何／質量／限位不動；v1 退回路徑增益不動；不得 git add/commit；
     臨時探針用完刪；notes 寫卡、status 不動；用 node --import tsx（不是 npx tsx）。
notes:
