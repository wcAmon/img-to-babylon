# 0010 站立穩健化：新鮮場景也要站得住
model: action-figure        status: dispatched
症狀: 0009 的 stand gate 綠是場景歷史巧合——監工 spike 發現同一套站立在
     新鮮場景 50–75 步就前倒。監工探針數據（已驗證，信這份）：
     - 倒下機制：關節先屈服再整體前傾。頭高 0.088→0.081（沉降）→0.0765，
       torso up.z 指數放大 0.024→0.057→0.078→0.133→0.408（s10→s50），
       calf up.y 全程 ≈1.0（小腿直立不動）。
     - torso z 爬到 0.0147 ≈ 靴前緣 z=0.016 時重心越過支撐面前緣 → 翻倒。
     - **SERVO_FORCE 0.02 vs 0.5 軌跡位元級相同**：Havok POSITION 馬達
       的保持剛性不吃 maxForce（軟彈簧），髖屈服 ~0.28 rad 與 motion gate
       容差 0.35 rad 同量級——伺服系統從未被證明能撐更緊。
     - runtime 對 constraint setAxisMotorMaxForce 覆寫也無效果。
     修法方向（自行按證據選，探針先行）：
     a. 找 Havok/Babylon 馬達剛性 API（spring stiffness/damping、
        setAxisMotor* 系列或 HavokPlugin 底層 HP_Constraint_*）站立時調高；
     b. 站立目標姿勢補償：不是全 0，而是微蹲/後傾的穩定姿勢（重心落
        支撐面中央），目標角自選；
     c. 幾何：靴子加大加深（componentTree/視覺/collider 三處同步），
        注意 Divine Eye 全身輪廓 IoU hard gate 0.65 別踩線。
     可組合。條件：站立穩健性不得依賴場景歷史；動作播放（motion gate）
     與 doctrine（不啟用就癱、disable 再癱）不得受影響。
驗收: 1. cd viewer && npx tsc --noEmit
     2. node --import tsx scripts/stand_test.ts 全綠（監工已強化為新鮮場景版並
        確認紅：新鮮場景站立 600 步頭高 ≥ 80%/up>0.9/disable 再癱/對照照舊癱。
        斷言與門檻勿改）
     3. physics/actuation/motion(walk timeline)/suspension/face 全 gate 照舊綠
     4. python3 forge/check_colliders.py .img2babylon/action-figure/runtime.json OK
        （若動了 collider 要先重出 runtime.json）
notes:
  - 0009 遺留：StandController/release()/playground toggle 已落地可用，
    本卡只修穩健性。
