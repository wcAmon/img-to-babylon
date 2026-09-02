# 0014 踝關節契約：靴子拆成獨立 body，小腿→靴子 2 軸伺服 joint
model: action-figure        status: done
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
  2026-09-03 Codex 實作：
  - factory 已鏡射踝契約：新增 boot-l/r 獨立 box body 與 calf→boot 2 軸 joint；
    y 軸以 locked 產生 0/0 limit，boot visual pivot 改掛 root 且維持
    [±LEG_X, BOOT_Y, BOOT_Z]；calf 複合 collider 已移除 boot 子 shape。
    actuator 由既有迴圈擴為 23 支，新增 servo:boot-{l,r}.{x,z}。
  - RED 基線：physics_test 報 boot-l/r「找不到 body」；actuation_test 報
    coverage:servo:boot-l/r「spec 宣告 servo 但無對應 actuator」。最小 factory
    修改後兩 gate 轉綠。
  - stand 診斷（臨時探針已刪）：原 0.003/0.002 分配在 ankle pitch 未加入、
    sign +1、sign -1 時，6 秒 headY 均約 0.0150，torsoUpY 分別約
    0.127/0.119/0.119。保持每腿 calf+boot=0.005，探針顯示 calf 0.004 +
    boot 0.001 且兩側 boot.x sign +1 時 headY=0.080395、torsoUpY=0.999965；
    同質量 sign -1 仍 headY=0.0150、torsoUpY=0.117921。故依卡片授權同步把
    factory/spec 質量改為 0.004/0.001，balance 加 servo:boot-l.x/r.x sign +1；
    leanGain 0.8、driftGain 30 未動。
  - 驗收 1：`npx tsc --noEmit` exit 0，無 TypeScript 診斷。
  - 驗收 2：physics_test exit 0，`pass:true`；12 bodies 全 finite/settled，
    11 constraints 全 `ok:true`，踝 separation l=0.00064m、r=0.00172m。
  - 驗收 3：actuation_test exit 0，`pass:true`；boot-l/r coverage 各 2 軸；
    boot-l x/z 量測 0.308/0.180 vs 0.300/0.180，boot-r x/z
    0.306/0.180 vs 0.300/0.180，全部 ok。
  - 驗收 4：motion_test exit 0，`pass:true`；finite=true、60 frames、
    constraints 11→11 stable，既有 19 timeline tracks 全 pass。
  - 驗收 5：stand_test exit 0：`PASS（癱後恢復站立/放掉再癱/對照照舊癱）`，
    六輪全綠。
  - 驗收 6：motion_suspension_test exit 0：`motion suspension tests: pass`。
  - 驗收 7：face_test exit 0：`PASS（六件五官立體、對稱、掛頭下）`。
  - 驗收 8：runtime_export exit 0：`meshes:23, bodies:12`；check_colliders：`OK`。
  - 驗收 9：validate_spec --strict：`OK`。
  - 驗收 10：forge unittest 跑 98 tests，95 pass、3 fail；三個失敗皆為
    `forge/tests/test_retarget.py` 舊硬編碼 19 軌斷言，權威 spec/retarget 實際正確
    產生 23，原文要點均為 `AssertionError: 23 != 19`：
    `test_servo_tracks_are_exactly_the_19_spec_axes`、`test_cli_writes_contract_json`、
    `test_cli_accepts_rebase_flag`。紅線禁止改 gate/斷言，且 production 若壓回 19
    會違反本卡 23-servo 契約，故未修改測試，誠實保留此紅燈交監工處理。
  - 臨時探針已刪；未 git add/commit。`git diff --stat`：3 files changed,
    57 insertions(+), 17 deletions(-)（task notes 40 行、factory 26 行變更、spec 8 行變更）。
    `git status --short`：僅 `M tasks/0014-ankle-contract.md`、
    `M viewer/models/action-figure/createActionFigureModel.ts`、
    `M viewer/models/action-figure/spec.json`；無臨時 probe，無 staged 檔。
監工驗收（2026-09-03）：
  - diff 審查：factory 只做契約鏡射（boot body、collider 搬家、calf→boot joint、視覺 pivot
    重掛）＋卡片授權範圍內的兩個彈性（calf/boot 質量 0.004/0.001、balance.pitchServos 加
    boot-l.x/boot-r.x sign +1）；增益 0.8/30、BOOT_* 常數未動，無禁用手法。spec 質量同步。
  - 獨立重跑：tsc、physics（12 bodies/11 constraints）、actuation（23 servo、boot 覆蓋）、
    motion(walk)、六輪 stand、suspension、face、runtime_export＋check_colliders、
    validate_spec --strict 全綠。
  - forge retarget 三個測試硬編碼「恰好 19 軌」是 gate 契約，監工更新為 23（加 boot-l.x/.z
    斷言、boot-l.y 不生成）→ 98/98 OK。
  - 視覺：playground physics=0 出廠姿勢同相機（alpha π/2、beta 1.5、r 0.22）拍改動前
    （stash）／改動後兩張，stdlib 像素比對 1280×720 **0 像素差異**——外觀不變硬證據
    （.img2babylon/shots/action-figure-hero-m8-pre.png / -m8.png）。Divine Eye 對 hero.png
    IoU 0.629 是本次取景未依 0008 校準，非幾何變化（render-vs-render 遮罩退化不適用）。
  - playground 真按鈕 3 輪站立循環：0.0804/0.0803/0.0804 ≥ 0.0704，放掉皆 0.015。
  - 活體：12 bodies、11 constraints、23 actuators（servo:boot-{l,r}.{x,z}），
    靴子 (±0.010, 0.005, 0)。status → done。
