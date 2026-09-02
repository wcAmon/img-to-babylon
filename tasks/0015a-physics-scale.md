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
  2026-09-03 Codex 實作／三輪調參（scale gate 未全綠，status 保持 open）：
  - RED／S=1 基線：改動前 `stand_test` PASS（`癱後恢復站立/放掉再癱/對照照舊癱`）；
    `physics_test` exit 0、`pass:true`，12 bodies finite、11 constraints 全 ok。改動後去除
    Babylon 時戳行的兩份 payload 逐 byte `cmp` 均為 0，確認 S=1 stand/physics 輸出不變。
  - factory 已加 `ModelOptions.physicsScale?: number`（預設 1）與
    `BuiltModel.physicsScale`；action-figure 的全部 visual 幾何長度、body pivot、collider、
    constraint pivot 乘 S，質量乘 S^3，servo force 乘 S^4，v1 driftGain 與 v2 PD 距離增益
    除 S。其餘既有 factory 回報實際未縮放值 1。spec 未改。
  - viewer 已讀 `#scale=` 並傳入 factory；ground、初始／capture camera、丟球、堆疊、
    拋起及 MotionSuspension lift 已依 S、S^3、S^3.5 比例律同步。
  - StandController 的 v2 有限差分 dt 改為固定物理步長 1/60；controlledServoIds 只收目前
    模式真正驅動的 servo。S=1 保留既有 v2，S>1 走本卡允許調參的 v1 尺度路徑。
  - `scale_test.ts 10` 初輪（v2）A 通過後，在 B
    `[collapse 150 / push +z base 0.004 → 12.649 N·s]` 失敗，原文要點
    `頭高 0.1500 < 0.7040`。切到尺度 v1 後，預設 0.8／30·S 讓 +z 兩級與 -z 0.002
    通過，首敗推進到 `-z base 0.004`，同樣 `頭高 0.1500 < 0.7040`。
  - S=10 調參第 1 輪 `leanGain=1.6、driftGain·S=60`：首敗仍為
    `-z base 0.004`；第 2 輪 `4.0／120` 退化為首敗 `+z base 0.004`；第 3 輪
    `0.8／60` 首敗仍為 `-z base 0.004`。依三輪上限停止，保留第 3 組；B 未達 24 景，
    fail-fast 因此 C／doctrine 未執行，本卡未完成。
  - 驗收 1 `npx tsc --noEmit`：PASS（exit 0，無診斷）。驗收 2：FAIL，如上。
  - 驗收 3 S=1 全綠：stand PASS；physics `pass:true`；actuation 23 servo checks
    `pass:true`；walk motion 19 tracks、finite、11→11 constraints stable、`pass:true`；
    `motion suspension tests: pass`；face `PASS（六件五官立體、對稱、掛頭下）`；
    walk_ground_probe hold：`standing:true`、`fell:false`、`finite:true`、
    `constraintsStable:true`，三循環 minHeadY 0.080386、minUpY 0.999959。
  - 驗收 4 runtime export：`meshes:23,bodies:12`；`check_colliders.py`：`OK`。
    驗收 5 forge unittest：`Ran 98 tests in 1.134s`、`OK`。
  - 未改任何 gate／斷言／換算／門檻，未改 spec 或 balance_test，未用 STATIC 錨、凍結
    body 或永久 disablePreStep，未 git add/commit，無臨時探針。寫 notes 前
    `git diff --stat`：10 files changed, 118 insertions(+), 71 deletions(-)；
    `git status --short`：types、standController、main、harness、capture 與五個 model factory
    共 10 個 tracked 檔案未 staged。

監工中場（2026-09-03，Codex r1 後）：
  - r1 驗收：S=1 全 gate 位元級不變（獨立重跑綠）、forge 98 OK；S=10 A 過、B 21/24
    （只 −z base 0.004 倒，三家族逐位相同＝不再混沌）、doctrine 過；C 紅是監工 gate 用了
    未驗證的「限位鎖」機制（S=10 下完全不動關節），非實作問題。
  - **0014 契約錯誤（監工）**：factory joint frame 對 axis x：y ＝ 世界 z（側傾／外展）、
    z ＝ 世界 −y（扭轉）。0014 spec 寫 `y: locked, z: [-0.3,0.3]` 是鎖側傾放扭轉。
    已修：spec／factory 踝 angular 改 `y: [-0.3,0.3], z: locked`，v2 roll servo id 改
    boot-*.y / thigh-*.y。修後 S=10 平行四邊形（踝 y +0.1／髖 y −0.1）質心橫移 45–59 mm
    且站著（幾何預測 h·sin 0.1 ≈ 45 mm）——重心轉移原語成立。S=1 站立因此變紅
    （踝側傾放開後 9 cm 尺度又混沌）：S=1 在數值地板下，不再是契約。
  - gate 重校：scale_test B 改 base {0.002, 0.003}（v1 在 S=10 四方向 0.003 全站；
    −z 0.004 是膝單向限位的控制器極限→0015）；C 改 servo 平行四邊形 ≥ 0.003·S。
    stand_test 加可選 argv S、步數 ×√S、地面 ×S（S=1 逐位不變）。
  - 現況：`scale_test 10` 全綠、`stand_test 10` 全綠；`stand_test`（S=1）紅（預期）。
第二輪（契約切換到 S=10）:
     1. action-figure factory 預設 physicsScale = 10（opts 可覆寫；`#scale=1` 仍可開
        玩具世界但站立不保證）。BuiltModel.physicsScale 回傳實際值。
     2. 所有 script 的絕對量依 model.physicsScale 換算：motion_test／motion_suspension_test
        的 lift 0.3 → ×S、settle/warmup 步數 ×√S；physics_test／actuation_test／face_test／
        walk_ground_probe／balance_test 內任何絕對長度、步數、衝量（×S^3.5）、速度門檻
        （×√S）——先讀每個 gate 找出絕對量，逐一換算，不得放寬比率型門檻。
        walk_ground_probe 的 timeline 播放維持真實時間（人偶現在是人尺度，kimodo 步態
        速率本來就對）。
     3. harness／capture 已依 physicsScale 縮放，確認預設 S=10 時 `#model=action-figure`
        畫面與 `scale=1` 一致（相機同步）。
     4. runtime_export 在 S=10 匯出 → check_colliders OK（若其門檻有絕對量，記數據回報，
        不得改門檻）。
驗收（第二輪）:
  1. cd viewer && npx tsc --noEmit
  2. node --import tsx scripts/scale_test.ts 10
  3. node --import tsx scripts/stand_test.ts（無參數＝factory 預設 S=10，六輪綠）
  4. physics_test／actuation_test／motion_test(walk)／motion_suspension_test／face_test 全綠
  5. node --import tsx scripts/walk_ground_probe.ts --variant hold --timeline ../.img2babylon/motion/walk-timeline.json（standing true、fell false）；順便跑 raw 與 assist 記數據（不做判準，純情報）
  6. runtime_export＋check_colliders；forge unittest 98
  7. 監工另做：playground 目視站立＋丟球。
紅線（第二輪）: 不得改 scale_test／stand_test 斷言；比率型門檻不得放寬；spec 不動；
     不得 STATIC 錨、凍結 body、永久 disablePreStep；不得 git add/commit；探針用完刪；
     notes 寫卡、status 不動；用 node --import tsx。
