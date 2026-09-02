# 0014 踝關節契約：靴子拆成獨立 body，小腿→靴子 2 軸伺服 joint
model: action-figure        status: open
脈絡: M8 第一卡（ROADMAP M8）。0013 證明走不了是運動學——靴子焊在小腿上，兩腳
     踩地時質心橫移為零，單腳支撐幾何上不可能。本卡把腳踝裝回去。
     **spec.json 已由監工改好（權威，勿改）**：
       - physics.bodies：calf-l/r components 只剩 calf（mass 0.003）；新增 boot-l/r
         body（components [boot-*]，mass 0.002，friction 0.6，restitution 0.2）。
         calf+boot 總質量仍 0.005。
       - physics.constraints：每側新增 `{type:"joint", bodyA:"calf-*", bodyB:"boot-*",
         pivotA:[0,-0.006,0], pivotB:[0,0.001,0], axis:[1,0,0],
         angular:{x:[-0.5,0.5], y:"locked", z:[-0.3,0.3]}, actuation:{type:"servo",
         maxForce:0.02}}`（踝軸離地 6mm：calf pivot y=0.012、boot pivot y=0.005）。
       - componentTree boot-*：level macro、attachment joint（socket calf-*:ankle、
         pivot [0,0.001,0]）、collider box [0.016,0.01,0.028]。
     現況（監工已跑，紅燈誠實）：
       - physics_test：`找不到 body「boot-l」（不在 model.bodies 裡）`（r 同）
       - actuation_test：`coverage:servo:boot-l  spec 宣告 servo 但無對應 actuator`（r 同）
       - motion_test、stand_test、face_test、validate_spec --strict、runtime_export
         （12 bodies）＋check_colliders 目前綠。
要做的事（factory 鏡射 spec，viewer/models/action-figure/createActionFigureModel.ts）:
     1. BODY_DEFS：calf-* 質量 0.005→0.003；新增 boot-* body（box 0.016×0.01×0.028，
        mass 0.002）。靴子 collider 從 calf 的 PhysicsShapeContainer 移到 boot body
        自己的 shape（calf 只剩 capsule）。
     2. CONSTRAINT_DEFS：每側新增 calf-*→boot-* joint，pivot/axis/angular 與 spec
        一字不差（y "locked" 要真的鎖死，factory 既有 Angular 型別已支援）。
        constraint 順序：緊接在同側 thigh→calf hinge 之後（physics_test 依 spec
        順序對照）。
     3. 視覺：boot-* 的 pivot 從 calfPivot 底下改掛到自己的 body pivot（root 下、
        world 位置 [±LEG_X, BOOT_Y, BOOT_Z] 不變）；踝關節在出廠姿勢角度 0，
        外觀與現在完全相同（Divine Eye 輪廓 gate 不得變）。
     4. servo actuator 由既有迴圈自動生成 servo:boot-*.x / servo:boot-*.z（y locked
        不生成）。19 servo → 23 servo。
     5. factoryPose 快照與 StandController 自動涵蓋新 body／servo（它們讀
        model.bodies / actuators），不必特別處理；MotionSuspension 亦同。
     6. 站立：踝 servo 隨其他 servo 一起 set(0) 撐平腳掌。若 stand_test 六輪紅
        （靴子鬆了站不住），允許把 servo:boot-l.x / servo:boot-r.x 加進
        factory 的 balance.pitchServos（sign 依你的探針證據，寫進 notes），
        leanGain 0.8 / driftGain 30 **不得動**；也可微調 boot mass 分配
        （總 0.005 不變）但要同步改 spec 與卡片 notes。三輪仍紅 → 寫證據停手
        （status 不動，監工會標 blocked 交 0015）。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit
  2. node --import tsx scripts/physics_test.ts action-figure --spec models/action-figure/spec.json（12 bodies、11 constraints 全 ok）
  3. node --import tsx scripts/actuation_test.ts action-figure --spec models/action-figure/spec.json（coverage 含 boot-l/boot-r，servo 檢查全 ok）
  4. node --import tsx scripts/motion_test.ts action-figure --spec models/action-figure/spec.json --timeline ../.img2babylon/motion/walk-timeline.json
  5. node --import tsx scripts/stand_test.ts（六輪全綠）
  6. node --import tsx scripts/motion_suspension_test.ts
  7. node --import tsx scripts/face_test.ts
  8. node --import tsx scripts/runtime_export.ts action-figure --spec models/action-figure/spec.json --out ../.img2babylon/action-figure/runtime.json && cd .. && python3 forge/check_colliders.py .img2babylon/action-figure/runtime.json
  9. python3 forge/validate_spec.py viewer/models/action-figure/spec.json --strict
  10. python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'
  11. 監工另做：playground 目視＋Divine Eye 全身輪廓（靴子外觀不變）。
紅線: 不得改 gate／斷言／門檻；spec.json 除了「boot mass 分配」外不得改；不得
     STATIC 錨、凍結 body、永久 disablePreStep；站立增益 0.8/30 不動；BOOT_*
     幾何常數不動；不得 git add/commit；臨時探針用完刪；notes 寫卡、status 不動；
     用 node --import tsx（不是 npx tsx）。
notes:
