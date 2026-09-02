# 0009 剛性站立：伺服鎖出廠姿勢在地上站住
model: action-figure        status: dispatched
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
