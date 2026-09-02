# 0010 站立穩健化：新鮮場景也要站得住
model: action-figure        status: done
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
  - 0010 實作（2026-09-02）：採方向 c，左右靴深由 0.024 m 增至 0.028 m；
    `createActionFigureModel.ts` 的同一 `BOOT_D` 同步驅動視覺 box 與 calf 複合
    collider，`spec.json` 的 boot-l/boot-r component dimensions 同步為 0.028 m。
  - 臨時探針（已刪除）：基線 s10/s25/s50/s75 頭高
    0.0823/0.0810/0.0765/0.0150 m，torso up.z 0.024/0.067/0.408/0.976。
    方向 b 的 hip x ±0.05、±0.10，以及 hip/knee (-0.10,0.10)、
    (0.10,0.10)、(-0.15,0.20)、(0.15,0.20) 均於 25–75 步倒下。
    方向 a 直接呼叫 Havok `HP_Constraint_SetAxisStiffness/SetAxisDamping`，
    參數 1/1、10/1、100/10、1000/100 的軌跡皆與基線逐位相同。
    方向 c：0.040 m 於 50 步向後倒；0.032 m 可站但 physics settle 有
    0.009–0.015 m/s 殘速；0.030 m 有最高 0.06241 m/s 殘速；0.028 m 同時
    通過 stand 與 physics（全 body speed 0，constraint 最大 separation 0.91 mm）。
  - 驗收輸出（2026-09-02，headless 均用 `node --import tsx`）：
    `validate_spec --strict` OK；`tsc --noEmit` exit 0；runtime export 23 meshes/
    10 bodies；`stand_test` PASS；`physics_test` pass=true；`actuation_test`
    pass=true；`motion_test` pass=true（各軌 withinTolerance ratio=1，容差 0.35）；
    `motion_suspension_test` pass；`face_test` PASS；`check_colliders` OK。
  - 視覺補驗限制：嘗試啟動 Vite 取得新 hero 截圖時，sandbox 對
    `127.0.0.1:5173` 回 `listen EPERM`，故未以舊 0.024 m 截圖冒充新輪廓
    Divine Eye 證據；任務卡明列的程式/物理驗收不受影響。

監工驗收（2026-09-02）：BOOT_D 0.028 修法收貨——單次新鮮場景站立 headless 綠，
playground 首按站立（重載後）實測站穩 0.081 ≥ 6 秒。循環穩健性問題移交
0011/0012 處理。status → done。
