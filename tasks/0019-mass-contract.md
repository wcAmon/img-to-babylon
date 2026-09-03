# 0019 質量契約：action-figure 腿鏈質量比 ≤ ~10:1（靴 0.005／小腿 0.008／大腿 0.005）
model: action-figure        status: done（2026-09-03）
脈絡: 姊妹 repo image-to-physics P0005 探勘（2026-09-03）：Havok POSITION 馬達本身是剛體（單擺
     24.5 N·m 只偏 0.002 rad）；M7／M8／M1 所有「軟 servo、黏滑、後向無權威、抬腿彈飛」的真根因是
     **關節兩側質量比**——倒單擺 85 kg 撐 1 kg 底座必翻、5 kg 起剛體。現行 base 質量：torso 0.04、
     head 0.018、arm 0.003×4、thigh 0.0025、calf 0.004、boot 0.001 ⇒ 踝 85:1、髖 40:2.5。
     人偶 runtime 覆寫驗證（軟 servo）：靴 ≥0.005 回收後向質心權威；腿鏈 0.01/0.008/0.005 ＋側傾
     增益 ×2 回收快速單腳站（ramp 300 三家族）。純數值契約改動，幾何／限位／外觀不動。
要做:
  1. `viewer/models/action-figure/spec.json`：thigh-l/r mass 0.0025→**0.005**、calf-l/r 0.004→0.008、
     boot-l/r 0.001→0.005（總質量 0.085→0.106；0014「calf+boot 5 g」約束解除，改記本卡理由）。
     **r2 修訂理由**：thigh 0.01 密度 5732 超 collider gate 3000（上限 ≈0.0052），且 ragdoll 3000 步不癱
     （重腳娃娃，違反 doctrine）；thigh 0.005 密度合格、150 步即癱（頭高 0.17）。質量比 torso:thigh 8:1、
     thigh:calf 5:8、calf:boot 8:5。
  1b. factory `balance.roll` 的 proportionalGain／derivativeGain／integralGain 與 `feedforward.roll.maxOutput`
     各 ×2（姊妹 repo mass_ratio_probe：新質量下側傾增益不變則單腳站抬腿彈飛，×2 三癱家族達標；
     pitch 軸與其他增益不動）。
  2. factory `BODY_DEFS` 鏡射同值；`grimoire/spec.md`／`physics.md` 加「質量比 ≤ ~10:1」契約條
     （倒單擺證據一句）；ROADMAP 記 0019。
  3. forge 測試若斷言質量（validate_spec／retarget fixtures）同步；`runtime_export`／
     `check_colliders` 重出。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit；validate_spec --strict
  2. physics_test action-figure --spec、actuation_test、motion_test（walk）、motion_suspension_test、
     face_test 全綠；forge unittest 全綠
  3. stand_test、balance_test、scale_test 10 全綠（含 1b 的 roll ×2）；三輪仍紅 → blocked 帶證據。
  4. Divine Eye 全身輪廓不變（質量不影響幾何）；runtime.json 重出；check_colliders 密度全在 [50,3000]。
  5. 監工另做：image-to-physics 更新依賴 commit，authority_test A–D 與既有 gate 重跑。
紅線: 不得改幾何／限位／collider；不得改 gate 門檻；不得 git add/commit；臨時檔用完刪；
     notes 寫卡、status 不動；用 node --import tsx（不是 npx tsx）。
notes:
  - 2026-09-03 r2 實作：spec 與 factory `BODY_DEFS` 鏡射 thigh-l/r 0.005、calf-l/r
    0.008、boot-l/r 0.005；總質量測試為 0.106。factory `balance.roll` 的 P/D/I 由
    `20/1.5/2` 改為 `40/3/4`（皆除以 physicsScale），`feedforward.roll.maxOutput`
    由 0.2 改為 0.4；pitch 與其他增益不動。幾何／限位／collider 與 gate／門檻／判準均未動。
  - 文件同步：`grimoire/spec.md`、`grimoire/physics.md` 與 ROADMAP 記錄腿鏈
    0.005/0.008/0.005、總質量 0.106、相鄰有效質量比約 10:1 與倒單擺證據，並解除
    0014 calf+boot 固定 5 g 舊約束。
  - TDD RED→GREEN：`test_action_figure_leg_chain_mass_contract` 改為 r2 契約後先見原文
    `AssertionError: 0.01 != 0.005`、`FAILED (failures=1)`（exit 1）；同步實作後原文
    `Ran 1 test in 0.000s`、`OK`（exit 0）。
  - 驗收 1：`npx tsc --noEmit` 無輸出、exit 0；strict validate 原文 `OK`、exit 0。
  - 驗收 2 physics：總 `pass: true`，12 bodies 全 `finite: true`，11 constraints 全
    `ok: true`；actuation 的 coverage 與 23 軸量測全 `ok: true`、總 `pass: true`。
    motion（walk）原文 `fps: 20`、`frames: 60`、`physicsSteps: 180`、constraints
    before/after 11 且 `stable: true`、19 tracks 全 `pass: true`、總 `pass: true`；
    suspension 原文 `motion suspension tests: pass`；face 原文
    `face_test: PASS（六件五官立體、對稱、掛頭下）`。
  - 驗收 2 forge：根目錄執行原文 `Ran 99 tests in 1.155s`、`OK`（exit 0）。
  - 驗收 3：stand 原文 `stand_test: PASS（癱後恢復站立/放掉再癱/對照照舊癱）`；
    balance 原文 `balance_test: PASS（24 景抗推站回來／質心目標追蹤／放掉再癱）`；
    scale 10 原文 `scale_test: PASS（S=10：六輪站立／24 景抗推／踝側傾移質心／doctrine）`；
    三者均 exit 0，r2 無需三輪停手。
  - 驗收 4 runtime 原文
    `{"out":"../.img2babylon/action-figure/runtime.json","meshes":23,"bodies":12}`，已重出；
    `check_colliders` 原文 `OK`（exit 0），密度 gate [50,3000] 全綠。Divine Eye 以既有
    同相機 M8 pre/render 全身圖重跑：`verdict: pass`、`fidelity: 1.0`、
    `silhouetteIoU: 1.0`、`hardGateFailures: []`（兩邊同有 18.1% 分離前景未量測 warning）。
  - 紅線複核：status 未動；未 git add/commit；未改 gate／門檻／幾何／限位／collider；
    未建立臨時檔；所有 TS 驗收腳本均以 `node --import tsx` 執行。
