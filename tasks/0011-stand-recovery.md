# 0011 站立恢復：從癱姿站起（gate 鏡射 playground 真實路徑）
model: action-figure        status: blocked
症狀: 0010 站穩了 gate，但監工 playground 目視（吊空→站立→放下）人偶仍躺平。
     根因（headless 已證）：StandController.enable() 只把 servo 鎖到出廠角 0，
     不重置身體位置/朝向——playground 重載後人偶早已癱在地上，enable 只是
     鎖住癱姿（對癱姿鎖 400 步 head y 恆 0.015）。gate 原本測「出廠姿勢瞬間
     enable」這條使用者按不到的路徑，故綠得虛。
     修法：StandController.enable() 要能「從癱姿恢復站立」——建構時快照各 body
     初始 local transform（位置+旋轉四元數），enable 時：
     1. 重置全 body 到出廠姿勢（沿用 MotionSuspension 同款：disablePreStep=false
        開 2-step 同步窗，copyFrom 初始 transform、setLinear/AngularVelocity 歸零、
        再 disablePreStep=true）；
     2. root 位置設到「腳底貼地」（出廠 root y=0 即腳底≈地面，用出廠原位即可）；
     3. 鎖 servo set(0)。
     disable 照舊放馬達。參考 viewer/src/motionSuspension.ts 的 2-step 窗機制
     （已驗證能讓 Havok 吃到 transform 重置）。
驗收: 1. cd viewer && npx tsc --noEmit
     2. node --import tsx scripts/stand_test.ts 全綠（監工已改為鏡射路徑並確認紅：
        生成→step 200 癱→enable 從癱姿站起 600 步頭高 ≥ 80%/up>0.9/disable 再癱/
        對照照舊癱。斷言與門檻勿改）
     3. physics/actuation/motion(walk timeline)/suspension/face 全 gate 照舊綠
     4. check_colliders OK（動 collider 才需重出 runtime）
notes:
  - 實作：BuiltModel 新增可選 factoryPose；action-figure 在模型建立、尚未 physics step
    時保存 root 與各 body 的 local position / rotationQuaternion。StandController 即使
    在人偶已癱後才建構，也會使用這份出廠快照。
  - 實作：StandController.enable() 比照 MotionSuspension 開啟 2-step pre-step 同步
    窗，還原 root/body 出廠 transform、清除線／角速度；第二個 physics step 後恢復
    disablePreStep=true 並 servo set(0)。disable() 會取消未完成同步窗、恢復
    disablePreStep=true 並 release servo；未使用 STATIC 錨或永久硬移。
  - 驗證（2026-09-02，headless 均用 node --import tsx）：
    - `cd viewer && npx tsc --noEmit`：PASS（exit 0）。
    - `scripts/stand_test.ts`：PASS（癱後恢復站立／放掉再癱／對照照舊癱）。
    - `scripts/physics_test.ts action-figure --spec models/action-figure/spec.json`：
      `pass: true`。
    - `scripts/actuation_test.ts action-figure --spec models/action-figure/spec.json`：
      `pass: true`。
    - `scripts/motion_test.ts action-figure --spec models/action-figure/spec.json
      --timeline ../.img2babylon/motion/walk-timeline.json`：`pass: true`（0.35 rad
      tolerance 未改，所有 track 通過）。
    - `scripts/motion_suspension_test.ts`：`motion suspension tests: pass`。
    - `scripts/face_test.ts`：PASS。
    - `python3 forge/check_colliders.py .img2babylon/action-figure/runtime.json`：OK；
      collider 未修改，未重出 runtime。

## round 2（監工驗收紅，2026-09-02）
r1 headless 綠但 playground 目視紅。監工瀏覽器＋headless 交叉 probe 證據：
  - playground 首次按站立（重載後）：站穩 0.081 ≥ 6 秒 ✓。
  - playground 開→關→再開循環：6/6 輪「站到 0.081 峰值後 3 秒內倒回 0.015」✗。
  - headless 重現（同款循環 probe）：teleport 每輪都成功（前 6 步軌跡幾乎同），
    但收斂分歧——cycle1,2,5,6 站、cycle3,4 倒；差異只在第 4 位小數（0.0832 vs
    0.0833）。結論：**站立姿勢只是臨界穩定**，癱堆微差就決定站或倒。
  - 已排除：zeroServos 預武裝（headless+browser 都不影響）、地面材質
    friction 0.7/restitution 0.2（不影響）、timestep（瀏覽器同為 60Hz）、
    HMR stale（factoryPose 已載入）。
任務：把站立從臨界穩定改成穩健穩定。gate 已強化為六輪 enable/disable 循環
（scripts/stand_test.ts，現況紅：cycle6 倒）。方向提示（自行取捨、可並用）：
  - enable 的同步窗內多穩幾步（多步清速度／延長貼地窗），讓接觸完全落定再放手；
  - 站立期間提高各 body angular/linear damping（肌肉張力，disable 時還原）；
  - 檢討 servo 對稱性／腳踝武裝順序；
  - 不夠再考慮 spec 腳掌加寬（要同步 spec.json＋視覺，並跑 face/物理全 gate）。
紅線照舊：不得改 gate/門檻；不得 STATIC 錨、凍結 body、永久 disablePreStep 硬移；
站立必須仍是 opt-in 可逆（disable 後要能再癱）。

notes（round 2，2026-09-02）：
  - 結果：未找到可通過六輪 gate 的穩健站立修正；依任務允許，提交失敗證據。
    所有實驗均逐項測試後撤除，最終生產碼與 collider 回到本輪進場狀態；未修改
    `scripts/*_test.ts`、斷言或門檻，未留下 probe，未使用錨定／凍結／永久硬移。
  - 實驗 1（可逆 body damping）：enable 時 linear=0.3、angular=0.8，disable 還原
    每個 body 原值；`stand_test` 由基線 cycle6 倒惡化為 cycle2 倒，撤除。
  - 實驗 2（延長同步落定）：2-step 改為 8-step，且同步窗內每步清線／角速度；
    `stand_test` cycle4 倒，證明延長 teleport 落定不充分，撤除。
  - 實驗 3（提高 servo holding force）：新增暫時 muscle-tone 路徑，站立最大力由
    0.02 提到 0.08 N·m、disable release 並還原；仍 cycle6 倒，撤除。
  - 實驗 4（真實接觸支撐面）：視覺與 collider 同步測過 boot 寬 0.016→0.022 m，
    cycle1 倒（兩腳橫向 collider 干涉）；再測 boot 深 0.028→0.036 m，亦 cycle1
    倒；兩者均撤除，最終仍為進場的 0.016 × 0.028 m，故不需重出 runtime。
  - 實驗 5（同步後才加 damping）：避免 damping 妨礙落地，只在 2-step 結束、servo
    鎖定後設 angular=0.8，disable 還原；cycle3 倒，撤除。
  - 最終驗證（headless 均用 `node --import tsx`）：
    - `cd viewer && npx tsc --noEmit`：PASS（exit 0）。
    - `scripts/stand_test.ts`：FAIL（exit 1）；cycle6 頭高 0.0150，小於 80% 門檻
      0.0704。這是本輪唯一未綠 gate，也是原始紅色基線。
    - `scripts/physics_test.ts action-figure --spec models/action-figure/spec.json`：
      `pass: true`（exit 0）。
    - `scripts/actuation_test.ts action-figure --spec models/action-figure/spec.json`：
      `pass: true`（exit 0）。
    - `scripts/motion_test.ts action-figure --spec models/action-figure/spec.json
      --timeline ../.img2babylon/motion/walk-timeline.json`：`pass: true`（exit 0）。
    - `scripts/motion_suspension_test.ts`：`motion suspension tests: pass`（exit 0）。
    - `scripts/face_test.ts`：PASS（exit 0）。
    - collider 尺寸最終未變更，條件式 runtime export/check_colliders 不適用。

## round 3（監工 probe 找到方向，2026-09-02）
r2 五實驗合法失敗。監工後續 probe 證據（掃描 boot 幾何，各 12 輪循環）：
  - 倒下方向雙向都有（torso z 收在 ±0.06~0.07）；現行 BOOT_Z=0.004 使 collider
    z 範圍 [-0.010,+0.018]——腳跟 10mm、腳尖 18mm 不對稱。
  - BOOT_Z=0.004/D=0.028：8/12。BOOT_Z=0.001：6/12。BOOT_Z=0.002/D=0.032：4/12。
  - **BOOT_Z=0.000/D=0.028（boot 置中腳踝軸，前後邊界對稱 ±14mm）：12/12，
    加測 24/24 全站**（地面 friction 0.7/restitution 0.2，同 playground）。
  - 另發現 gate 地面原本沒設材質（Havok 預設），收斂行為與 playground 不同
    （同 BOOT_Z=0 下 24 輪前 6 輪全倒）。監工已把 scripts/stand_test.ts 地面
    材質改為鏡射 harness（friction 0.7/restitution 0.2），現況 gate 紅（cycle3）。
任務（小而明確）：
  1. viewer/models/action-figure/createActionFigureModel.ts：BOOT_Z 0.004 → 0.000
     （視覺 mesh 與 collider child offset 共用此常數，會一起動）。
  2. viewer/models/action-figure/spec.json：boot-l/boot-r 的 position z 同步為
     boot 置中值（檢查 spec 內 boot 宣告的座標語意後對齊，勿造成 spec↔factory 漂移）。
  3. collider offset 變了：重出 runtime（scripts/runtime_export.ts action-figure）
     並跑 python3 forge/check_colliders.py .img2babylon/action-figure/runtime.json。
  4. 全 gate：tsc / stand_test（六輪）/ physics / actuation / motion(walk) /
     suspension / face 全綠，結果寫進 notes。
紅線同 round 2。

notes（round 3，2026-09-02）：
  - 實作：`createActionFigureModel.ts` 的 `BOOT_Z` 由 0.004 改為 0.000；視覺 boot
    與 collider child offset 共用此常數。`spec.json` 的 `boot-l`／`boot-r`
    `transform.position[2]` 同步為 0.000，維持 boot 置中小腿／腳踝軸，未更動 gate、
    斷言、門檻或 status。
  - runtime：`scripts/runtime_export.ts action-figure --spec
    models/action-figure/spec.json --out ../.img2babylon/action-figure/runtime.json`
    重出成功（23 meshes、10 bodies）；`python3 forge/check_colliders.py
    .img2babylon/action-figure/runtime.json`：OK（exit 0）。僅給 model name 的短命令
    在目前 CLI 會要求必填 `--spec`／`--out`（exit 2），故依 SKILL.md 使用完整形式。
  - 驗證：`cd viewer && npx tsc --noEmit`：PASS（exit 0）。
  - 六輪 gate：`node --import tsx scripts/stand_test.ts`：FAIL（exit 1），cycle5
    站立頭高 0.0150，小於門檻 0.0704。依紅線以臨時唯讀 probe 收集完整六輪後已刪除：
    - cycle1：standing=0.0809、upY=1.000、finite=true、constraints=true、released=0.0150。
    - cycle2：standing=0.0809、upY=1.000、finite=true、constraints=true、released=0.0150。
    - cycle3：standing=0.0809、upY=1.000、finite=true、constraints=true、released=0.0150。
    - cycle4：standing=0.0809、upY=1.000、finite=true、constraints=true、released=0.0150。
    - cycle5：standing=0.0150、upY=0.016、finite=true、constraints=true、released=0.0150。
    - cycle6：standing=0.0150、upY=0.066、finite=true、constraints=true、released=0.0150。
    （factory=0.0880、站立門檻=0.0704、release 門檻=0.0528。）
  - 停手：因六輪 gate 仍紅，依任務紅線未再跑 physics／actuation／motion／
    suspension／face／strict validation，也未自行放寬或再做修正；未 git add／commit。

監工結案（2026-09-02，三輪用滿 → blocked with evidence）：
  - r1 恢復機制（factoryPose＋2-step 同步窗）本身正確，保留。
  - r2 五實驗＋r3 BOOT_Z 置中證明：被動站立在本模型是臨界穩定，Havok
    POSITION 馬達剛性不可調（先前已證不吃 maxForce/SetAxisStiffness），
    幾何優化只能移動混沌景觀、不能消除。
  - 監工後續 probe 找到出路：主動平衡回饋（lean 0.8 + drift 30，髖 +u 膝 −u）
    跨四癱等待家族 108/108 全站 → 開 0012 接手。
  - r3 的 BOOT_Z=0.000（含 spec 同步、runtime 重出）保留在工作樹，隨 0012 一併提交。
