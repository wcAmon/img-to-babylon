# 0009 剛性站立：伺服鎖出廠姿勢在地上站住
model: action-figure        status: done
症狀: doctrine「ragdoll 出生即癱」——19 軸伺服是惰性 POSITION 馬達（第一次
     set 前不影響物理），沒人下令就沒有肌肉張力。M7 要 opt-in 站立模式：
     全伺服軸命令回出廠角（0 rad）撐住，不吊空站在地上。
     交付：
     1. viewer/src/standController.ts：`StandController` 類
        （constructor(model: BuiltModel)、enable()、disable()、get active）。
        enable = 對 model.actuators 全部 kind==="servo" 的軸 set(0)；
        disable = 放掉馬達（軸 motor 關掉/力歸零，做法自選），身體要能再癱。
     2. playground（harness.ts）加「站立：開/關」toggle（預設關）。
     3. SERVO_FORCE 0.02 N·m 若撐不住允許調（createActionFigureModel.ts 常數
        或 spec 若有宣告處），但既有 gate 全綠是硬條件：motion gate 容差
        0.35 rad/90% 勿放寬、actuation/physics/suspension/face 全照舊。
     4. 若站不住（震盪、傾倒），帶探針數據回報寫進 notes（頭高曲線、
        傾倒方向、試過的力道值）——證明做不到也是合格產出。
驗收: 1. cd viewer && npx tsc --noEmit
     2. node --import tsx scripts/stand_test.ts 全綠（監工已寫紅；斷言勿改：
        對照組照舊癱 / 站立 600 步頭高 ≥ 80% 且軀幹 up>0.9 / disable 再癱）
     3. node --import tsx scripts/physics_test.ts action-figure --spec models/action-figure/spec.json 照舊綠
     4. node --import tsx scripts/actuation_test.ts action-figure --spec models/action-figure/spec.json 照舊綠
     5. node --import tsx scripts/motion_test.ts action-figure --spec models/action-figure/spec.json --timeline ../.img2babylon/motion/walk-timeline.json 照舊綠
     6. node --import tsx scripts/motion_suspension_test.ts、face_test.ts 照舊綠
notes:
  - 已新增 `StandController`：enable 對 19 支 servo 全部 `set(0)`；disable 透過
    actuator 的可選 `release()` 將軸 motor force 歸零、motor type 設為 NONE，並
    重設惰性 armed 狀態。playground 已加預設關閉的「站立：開/關」toggle。
  - 最終 `SERVO_FORCE` 維持原值 0.02 N·m。曾以單變量試 0.2 N·m，既定
    stand gate 結果完全相同（600 步 head.y 均為 0.0150 m），故已還原；另試
    dispose 次序與 constraint disable/enable 清 warm-start，結果亦不變，均未保留。
  - 站立探針：單獨建立模型時，head.y 曲線為 step 0: 0.0880、25: 0.0809，
    之後到 600 均 0.0809 m，torso up 約 (-0.007, 1.000, 0.000)，可穩站。
    但監工 gate 的「先讓對照組癱倒並 dispose、再同場建立站立組」序列中，
    head.y 為 step 0: 0.0880、25: 0.0812、50: 0.0601、75: 0.0175、
    100–600: 0.0150 m；向 -X/+Z 傾倒，step 75 torso up 約
    (-0.722, 0.054, 0.690)，最終約 (-0.777, 0.099, 0.621)。dispose 後 Havok
    body 數由 11 降為 1（只剩 ground），排除殘留 collider。
  - 結論：19 軸只涵蓋脖、肩、肘、髖、膝，沒有腳踝/足部剛體與對地 servo；
    全軸鎖 0 只能維持內部出廠姿勢，無法對整具公仔繞地面接觸點的傾倒提供外部
    回正力矩。禁止 STATIC 錨、凍結 body、硬移 transform 的條件下，此 gate 序列
    無法穩健達成；未採用視覺/運動學作弊。
  - 2026-09-02 gate：`npx tsc --noEmit` PASS；`physics_test` PASS（10 bodies、
    9 constraints）；`actuation_test` PASS（19 servo）；`motion_test` PASS
    （19/19 tracks、各 50/50 samples 在 0.35 rad 內、constraints 9→9）；
    `motion_suspension_test` PASS；`face_test` PASS。`stand_test` FAIL 於站立組
    head.y 0.0150 < 0.0704 m；對照組斷言已先通過，測試與門檻均未修改。
  - 監工複查（2026-09-02 10:02）：Codex「無踝伺服」結論不成立——單獨能站證明
    內部剛性足夠。真根因：spec 契約 calf body components 含 boot，但 factory
    每 body 只建單一 shape，**boot 碰撞體從未存在**，公仔踩在兩顆 capsule
    圓端上站立（邊際穩定，求解器噪音決定倒不倒）。此即 Parked
    「spec↔factory 手動鏡像漂移」的實例。開第三輪：補 boot box child shape
    進 calf container（offset (0, -0.007, 0.004)、盒 [0.016, 0.01, 0.024]，
    與視覺件一致），給出平底支撐面。
  - 第二輪修正（2026-09-02 10:02）：在 `calf-l`、`calf-r` 的既有
    `PhysicsShapeContainer` 各補一個 boot `PhysicsShapeBox` child；尺寸
    `[0.016, 0.01, 0.024]`、相對 calf pivot offset `(0, -0.007, 0.004)`，
    material 沿用各 body 的 friction 0.6 / restitution 0.2，mass 仍為 0.005 kg。
    未改 spec、servo force、transform、stand_test 斷言或任何 gate。
  - 本輪 red→green：修正前 `stand_test` FAIL（head.y 0.0150 < 0.0704）；補入
    boot child shapes 後 PASS（對照癱／站立穩／放掉再癱）。
  - 2026-09-02 10:02 全套 gate（headless 均用 `node --import tsx`）：
    `npx tsc --noEmit` PASS；`stand_test` PASS；`physics_test` PASS（10 bodies、
    9 constraints、pass true）；`actuation_test` PASS（19 servo axes、pass true）；
    `motion_test` PASS（19/19 tracks 各 50/50 samples 在 0.35 rad 內、constraints
    9→9、pass true）；`motion_suspension_test` PASS；`face_test` PASS。
  - 監工驗收（2026-09-02 10:03）：tsc、stand_test（對照癱/站立穩/放掉再癱）、
    physics/actuation/motion/suspension/face 全綠；runtime.json 重出後
    check_colliders OK；forge 98 tests OK。boot child shape 與視覺件一致。
    卡標 done。
