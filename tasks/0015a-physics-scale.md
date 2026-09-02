# 0015a 物理尺度 ×10：人偶在 Havok 的數值尺度地板之上模擬
model: action-figure        status: open
脈絡: 0015 探勘（監工，2026-09-03）證明 9 cm／85 g 的人偶低於 Havok 數值尺度地板：
     - 同尺寸剛體方塊 ×1 被 0.002 N·s 推倒（解析門檻約 0.016，低 8 倍）；×10 方塊
       （0.34×0.88×0.28 m、85 kg）依 Froude 相似律衝量 ×10^3.5，base 0.008 仍站、
       0.016 才倒——正對解析估算。
     - M7「POSITION 馬達剛性不可調」「站立混沌」、M8「踝推不動」「1 g 靴子彈飛」
       皆為尺度症狀。
     本卡：模型加 `physicsScale`，世界 ×S 模擬；spec 仍寫玩具尺寸（Divine Eye／輪廓
     gate 不動）。相似律：長度 ×S、質量 ×S³、力矩 ×S⁴、時間 ×√S、衝量 ×S^3.5、
     單位 1/m 的增益 ÷S。
要做的事:
     1. factory：`ModelOptions.physicsScale?: number`（預設 1）。所有長度常數（頭身
        四肢靴子、pivot、LEG_X 等）在建模時 ×S，質量 ×S³，SERVO_FORCE ×S⁴；
        factoryPose、balance 設定隨之：leanGain 不變、driftGain ÷S（v1）；v2 的
        proportionalGain（單位 rad/m）÷S、derivativeGain（rad·s/m）÷S。
        BuiltModel 加 `physicsScale: number`（回傳實際 S）。
        S=1 時行為與現在**位元級相同**（所有既有 gate 照舊綠）。
     2. viewer：main.ts 讀 hash `scale`（預設 1）傳入 factory；harness/capture 依
        model.physicsScale 放大：地面尺寸／厚度、相機 radius 與 target、丟球／堆疊
        道具尺寸與質量（×S³）與衝量（×S^3.5）、拋起衝量、MotionSuspension lift ×S。
        `#model=action-figure&scale=10` 開啟。
     3. StandController：dt 用物理固定步長（1/60）而非 engine.getDeltaTime()
        （0015 bug）；controlledServoIds 只含目前模式實際驅動的 servo（0015 bug）。
     4. 跑 scale_test.ts S=10。A（六輪站立）、C（踝側傾鎖限位移質心）預期直接過；
        B（抗推 24 景）若紅，允許在 S=10 調 v1 增益（leanGain／driftGain·S）並記數據，
        S=1 的 0.8/30 不動（兩組值都寫進 factory，依 S 選）。
量測儀器／紅燈: `viewer/scripts/scale_test.ts`（監工寫；斷言／換算／門檻勿改）。
     現況：tsc 紅（`physicsScale` 不在 ModelOptions）。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit
  2. node --import tsx scripts/scale_test.ts 10（A/B/C/doctrine 全綠）
  3. S=1 既有 gate 照舊：stand_test、physics_test、actuation_test、motion_test（walk）、
     motion_suspension_test、face_test、walk_ground_probe（hold 變體站穩即可）
  4. node --import tsx scripts/runtime_export.ts action-figure --spec models/action-figure/spec.json --out ../.img2babylon/action-figure/runtime.json && cd .. && python3 forge/check_colliders.py .img2babylon/action-figure/runtime.json（S=1 輸出不變）
  5. python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'
  6. 監工另做：playground `#scale=10` 目視站立＋丟球，與 `scale=1` 外觀一致（相機同步）。
紅線: 不得改 gate／斷言／換算；S=1 行為不得改變（既有 gate 全綠且 stand 六輪照舊）；
     不得 STATIC 錨、凍結 body、永久 disablePreStep；spec 不動；balance_test.ts 不動
     （它在 S=1 仍紅是已知，0015 處理）；不得 git add/commit；臨時探針用完刪；
     notes 寫卡、status 不動；用 node --import tsx（不是 npx tsx）。
notes:
