# 0015 質心-支撐面平衡控制器（StandBalance v2）：被推要站回來
model: action-figure        status: blocked（三輪上限；只剩 gate B 末格積分 windup，待使用者裁決）
脈絡: M8 第二卡。0014 裝了踝關節（servo:boot-{l,r}.{x,z}，x 俯仰 ±0.5、z 側傾 ±0.3）。
     0012 v1 平衡只看軀幹前傾（u = 0.8·lean + 30·drift，髖/膝/踝俯仰 servo 同一個 u），
     不看側傾、不看質心。監工探針（2026-09-03）：v1 四方向只撐得住 0.001 N·s 衝量，
     0.002 在 ±z／-x 倒（-x 甚至 0.001 就倒）。物理上剛體翻倒門檻約 0.2 m/s，0.004 N·s
     只給 85g 人偶 0.047 m/s——可回復範圍，倒的是控制器。
     0016 單腳站需要側傾控制與「質心壓到單靴上」，本卡先把雙腳的質心平衡做紮實。
目標（設計，細節由你依證據定）:
  - BuiltModel.balance 升級為 v2（型別加可選欄位，舊 v1 欄位保留；StandController 無
    v2 欄位時退回 v1 行為，0012 gate 語意不變）：
      支撐面：由 balance 指定的 support body id（action-figure：boot-l、boot-r）
      的 absolutePosition 算中心（雙腳＝平均）；質心＝全 body 質量加權 absolutePosition。
      誤差 e_z（俯仰）= com.z − support.z、e_x（側傾）= com.x − support.x，各配 PD
      （速度項用質心速度或有限差分），也可保留 v1 的 lean 項當阻尼/前饋。
      執行器：俯仰 → 踝 x 主控（sign 依證據）＋髖 x／膝 x 輔助；側傾 → 踝 z 主控
      ＋髖 z 輔助。每步 set(clamp(base + Σ sign·u_axis))，與 0013 的 setPoseTarget
      基準疊加相容。
  - 增益由你調（v2 增益不受 0012「0.8/30 紅線」限制，但 v1 退回路徑的 0.8/30 不動），
    調參必須跨家族：gate 已編入 4 方向 × 2 衝量 × 3 癱家族 = 24 景，單景綠不算數。
  - 站立六輪 gate（stand_test）與 playground 站立按鈕行為不得退化。
量測儀器／紅燈: `viewer/scripts/balance_test.ts`（監工寫；斷言／衝量／家族／支撐面尺寸勿改）。
     現況：第一景 `[collapse 150 / push +z 0.002]` 即倒（頭高 0.0150 < 0.0704）。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit
  2. node --import tsx scripts/balance_test.ts（24 景全綠＋doctrine）
  3. node --import tsx scripts/stand_test.ts（六輪全綠）
  4. node --import tsx scripts/physics_test.ts action-figure --spec models/action-figure/spec.json
  5. node --import tsx scripts/actuation_test.ts action-figure --spec models/action-figure/spec.json
  6. node --import tsx scripts/motion_test.ts action-figure --spec models/action-figure/spec.json --timeline ../.img2babylon/motion/walk-timeline.json
  7. node --import tsx scripts/motion_suspension_test.ts
  8. node --import tsx scripts/face_test.ts
  9. python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'
  10. 監工另做：playground 真按鈕站立循環＋丟球/拋起擾動目視。
允許的探索: 增益、PD 結構、哪些 servo 參與、是否加質心速度項、是否用踝 z 側傾——
     全部可調，但每個嘗試的數據（哪幾景過／哪幾景倒、倒向）寫進 notes；三輪仍紅
     → 寫清哪個方向×力道×家族倒、倒的機制，停手（status 不動）。
紅線: 不得改 gate／斷言／門檻／衝量／家族；不得 STATIC 錨、凍結 body、永久
     disablePreStep；不得改 spec 幾何／質量／限位；v1 退回路徑 0.8/30 不動；
     不得 git add/commit；臨時探針用完刪；notes 寫卡、status 不動；
     用 node --import tsx（不是 npx tsx）。
notes:
  2026-09-03 Codex 三輪探索（依卡片上限停手，status 保持 open）：
  - RED 基線：`node --import tsx scripts/balance_test.ts` 在第一景
    `[collapse 150 / push +z 0.002 N·s]` 失敗，原文要點為
    `頭高 0.0150 < 0.0704`。
  - 已落地 v2 結構：`StandBalance` 保留 v1 的 leanGain/driftGain/pitchServos，新增
    可選 supportBodyIds、pitch/roll PD 軸設定；StandController 只有三個 v2 欄位齊全
    才走質量加權 COM、雙靴 absolutePosition 平均支撐中心、有限差分速度與兩軸 servo
    疊加，否則仍走原封不動的 v1 `0.8*lean + 30*drift`。setPoseTarget 對 v2 servo
    仍只更新基準，控制步每次 clamp(base + offset)。
  - 臨時軌跡探針（已刪）根因證據：v1 的 +z 0.002 推後，約 0.67 秒時 e_z 僅
    +0.0013 m，但無側傾回授的 e_x 已到 -0.0086 m；再 0.17 秒 e_x=-0.0311 m，
    隨後側前翻。倒下後 ankle-x/thigh-x 飽和 +0.5，已來不及回復。
  - 調參第 1 輪（Kp=20、Kd=1.5；roll actuator 初始 sign -）：完整 gate 在首景
    即停，0/24；+z 0.002 後 e_x 由 -0.0008 加速至 -0.0265 m，roll 命令反向，
    head=0.0150，證明側傾 sign 錯。
  - 調參第 2 輪（Kp=50、Kd=6；roll sign 翻正）：完整 gate 在首景推前前置即停，
    0/24；未濾波 D 項把接觸噪聲放大，約 settle 120 step servo 飽和並自激側倒，
    原文要點 `前置：推之前必須站穩（0.0150）`。
  - 調參第 3 輪（回復靜態穩定的 Kp=20、Kd=1.5，保留正確 roll sign）：完整 gate
    仍在首景停，0/24；推後 0.33 秒 e_x=-0.0174 m、ankle-z=-0.3 飽和，0.5 秒
    e_z=+0.0390 m、ankle-x=+0.5 飽和，形成耦合側前翻；原文仍為
    `頭高 0.0150 < 0.0704`。
  - 第 3 輪固定參數另跑不帶斷言的 24 景診斷矩陣（臨時 probe 已刪）：3 個 collapse
    家族結果完全一致，每家族只有 `+x 0.002` 通過，合計 3/24；其餘 21/24 倒。
    +z 兩級為側前翻（終值 dx -0.0285/-0.0205，dz +0.0411/+0.0455）；-z 兩級
    為後翻（dz -0.0495）；+x 0.004 為左前翻（dx +0.0377、dz +0.0331）；-x
    兩級為右側/右前翻（dx -0.0492/-0.0448，dz +0.0140/+0.0224）。所有倒地
    head=0.0150、upY=0.109–0.138；三家族推前均 head=0.0804，故恢復站立本身未退化。
  - 驗收 1 `npx tsc --noEmit`：PASS（exit 0，無診斷）。驗收 2 balance_test：FAIL
    （如第 3 輪原文，未達 24 景＋doctrine，因此本卡未完成）。
  - 驗收 3 stand_test：PASS，原文
    `stand_test: PASS（癱後恢復站立/放掉再癱/對照照舊癱）`。
  - 驗收 4 physics_test：PASS（`pass:true`，12 bodies finite，11 constraints 全 ok）。
    驗收 5 actuation_test：PASS（23 servo coverage/checks 全 ok，`pass:true`）。
  - 驗收 6 motion_test：PASS（finite=true，60 frames，constraints 11→11 stable，
    19 tracks 全 pass）。驗收 7 motion_suspension_test：`motion suspension tests: pass`。
    驗收 8 face_test：`PASS（六件五官立體、對稱、掛頭下）`。
  - 驗收 9 forge unittest：`Ran 98 tests in 1.515s`、`OK`。
  - 未改 gate/斷言/門檻/衝量/家族，未改 spec，未用 STATIC 錨、凍結 body 或永久
    disablePreStep，未 git add/commit。臨時 probe 均已刪除。寫 notes 前
    `git diff --stat`：3 files changed, 100 insertions(+), 3 deletions(-)；
    `git status --short`：僅 factory、standController.ts、types.ts 三個未 staged 修改。

監工驗收／探勘（2026-09-03，Codex 三輪後）：
  - Codex v2 骨架保留（types/StandController/factory 設定），全 gate 綠、balance_test 仍紅
    （3/24）。兩個 bug 記下待修：(a) `controlledServoIds` 把 v2 roll/pitch 的 servo id
    一併納入，v1 模式下 setPoseTarget 對 boot.z 等會被吞掉（沒有路徑套用基準）；
    (b) D 項 dt 用 `engine.getDeltaTime()`——headless 為 0 被 floor 到 1/240，速度項比
    真實 1/60 放大 4 倍，且與 playground 行為分歧（M7 同型陷阱），應改用物理固定步長。
  - **gate 校準錯誤（監工責任）**：全關節限位硬鎖 [0,0] 的「剛體雕像」也只有 3/24，
    門檻 0.001–0.0015 N·s 與 v1 完全相同；跟人偶同尺寸同質量的單一剛體方塊在 +z
    0.002 N·s 就倒。0.002/0.004 兩級在此引擎尺度下任何不跨步控制器都不可能達成。
    applyImpulse 單位驗證正確（0.04 kg → 0.0449 m/s）。
  - 踝關節作為執行器目前是空的：v1 下命令踝俯仰 −0.15、（修 bug 後等效）側傾 ±0.2，
    質心位移精確為 0、靴子平貼——POSITION 馬達在全身負載下推不動關節；限位硬鎖踝
    側傾 ±0.1 則靴子（1 g）直接離地彈飛、人偶倒。
  - **總根因＝物理尺度**：方塊 ×10（0.34×0.88×0.28 m、85 kg），Froude 相似律衝量
    ×10^3.5：base 0.001–0.008 全站、0.016 才倒——正對解析估算（Δv≈0.19 m/s 翻倒）；
    ×1 尺度 0.002 即倒，低於物理門檻 8 倍。9 cm／85 g／1 g 靴子低於 Havok 的數值尺度
    地板（接觸 slop、solver 容差為絕對量），M7「馬達剛性不可調」「站立混沌」與 M8
    「踝無效」「靴子彈飛」皆為尺度症狀。
  - 判定：本卡 blocked。路線提案見 ROADMAP M8（物理尺度 ×10 契約）。

第二輪（2026-09-03，0015a 後重開；物理契約已是 S=10，所有數字以 base 表示、gate 自動 ×S）:
  校準（監工探針，S=10）：剛體雕像 +z 撐 0.003／−z 0.003 即倒／±x 撐 0.006；v1 +z 0.004、
  −z 0.003、±x 0.008；v2（解鎖後）與 v1 相當。gate A 的 {0.002, 0.004} 唯一紅格是 −z 0.004。
  gate B 新增質心目標追蹤（setBalanceTarget），目前 tsc 紅（方法不存在）。
  要做的事:
     1. StandController 解鎖 v2 於 S>1（r1 的 physicsScale===1 條件移除；v2 增益 factory
        已 ÷S）。v1 仍為無 v2 欄位模型的退回路徑。
     2. `setBalanceTarget(target: {x: number; z: number}): void`：v2 的質心誤差改為
        e = com − (support + target)；enable/disable 清零。與 setPoseTarget 基準疊加相容。
     3. −z 0.004：後推的非對稱策略——質心在支撐面後方時，髖前彎（thigh.x 往前）＋踝
        蹠屈把質心拉回前方，不是蹲（膝單向限位 [0,2.44] 只會把髖往後送）。可用
        依 e_z 正負選不同 servo 權重／增益（v2 設定加 backward/forward 兩組），或加
        e_z 的非線性項；一切由證據決定，數據寫 notes。
     4. gate B 的橫移 ±0.004S 靠踝 y／髖 y 平行四邊形（開迴路 0.1 rad 即 0.0045–0.0059S），
        前後 ±0.0015S 靠踝 x（開迴路 0.1 rad 得 0.0009–0.0019S）——v2 roll/pitch 軸的
        servo 與 sign 依此校準。
  驗收（第二輪）:
     1. cd viewer && npx tsc --noEmit
     2. node --import tsx scripts/balance_test.ts（A 24 景＋B 追蹤＋doctrine 全綠）
     3. node --import tsx scripts/scale_test.ts 10；node --import tsx scripts/stand_test.ts
     4. physics／actuation／motion(walk)／suspension／face 全綠；walk_ground_probe hold 站穩
     5. python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'
     6. 監工另做：playground 站立＋丟球。
  紅線（第二輪）: 不得改 balance_test／scale_test／stand_test 斷言與換算；不得 STATIC 錨、
     凍結 body、永久 disablePreStep；spec 幾何／質量／限位不動；v1 退回路徑增益不動；
     不得 git add/commit；探針用完刪；notes 寫卡、status 不動；用 node --import tsx。
     三輪仍紅 → 寫清哪格倒、機制，停手。

Codex r2（2026-09-03，依第二輪三輪上限停手，status 保持 open）：
  - RED：`npx tsc --noEmit` 原文為 `Property 'setBalanceTarget' does not exist on type
    'StandController'`（balance_test.ts:144、158）。已實作 setBalanceTarget，v2 誤差改為
    `com - (support + target)`，enable/disable 皆清零；移除 `physicsScale===1` 限制，S=10
    會走 v2，無完整 v2 欄位仍走原 v1。另加入可選 negativeErrorServos，controlled servo
    id 同步涵蓋非對稱組，setPoseTarget 仍作為每步 offset 疊加前的 base。
  - 第 1 輪完整 balance gate：前三格依序通過，首紅為
    `[collapse 150 / push -z 0.004 N·s]`，原文 `頭高 0.1500 < 0.7040`。臨時探針顯示
    推後 step 16/48/64 的 dz 為 -0.0274/-0.0854/-0.1625 m，up.z 為
    -0.0415/-0.1360/-0.2700；踝與髖同為負命令，step 64 踝已 -0.4941，step 96
    後翻落地。機制是髖權重太小且膝單向彎曲不能救後倒。
  - 第 2 輪完整 balance gate：負 e_z 改成踝負、髖正、移除膝；roll 依 scale C 校準為
    踝／髖反號平行四邊形。仍首紅同格，原文 `頭高 0.1500 < 0.7040`。探針證明髖正向
    是錯向：step 16 up.z 已 -0.1294（第 1 輪 -0.0415），step 64 踝／髖各飽和
    -0.5/+0.5，step 96 後翻落地。
  - 第 3 輪完整 balance gate：負 e_z 改回能減慢後傾的髖負向、移除膝、髖權重提高至
    踝的 2 倍。仍首紅同格，原文 `頭高 0.1592 < 0.7040`；前三格仍先通過，僅略延緩
    後翻，未達 gate，故未進到 B 追蹤斷言。依上限停止，不再調參。
  - 驗收 1 tsc：PASS（exit 0，無診斷）。驗收 2 balance_test：FAIL（第 3 輪原文如上，
    A 未全綠，B/doctrine 未執行）。驗收 3 scale_test S=10：FAIL 於 C，原文
    `質心橫移 0.0236 < 0.0300（平行四邊形移不動質心）`；stand_test：PASS，原文
    `stand_test: PASS（癱後恢復站立/放掉再癱/對照照舊癱）`。
  - physics_test：PASS（`pass:true`，12 bodies finite，11 constraints 全 ok）。
    actuation_test：PASS（servo coverage/checks 全 ok，`pass:true`）。motion_test walk：PASS
    （finite=true，60 frames，180 physicsSteps，constraints 11→11 stable，19 tracks 全 pass）。
    motion_suspension_test：`motion suspension tests: pass`。face_test：
    `face_test: PASS（六件五官立體、對稱、掛頭下）`。
  - walk_ground_probe hold：PASS 型數據（exit 0）：standing=true、3/3 cycles、fell=false、
    minHeadY=0.87237、minUpY=0.9999998、finite=true、constraintsStable=true。
    forge unittest：`Ran 98 tests in 1.219s`、`OK`。
  - 未改 balance/scale/stand gate、斷言、換算、spec；未用 STATIC 錨、凍結 body 或永久
    disablePreStep；未 git add/commit。臨時 `tmp_balance_probe.ts` 已刪。寫 notes 前
    `git diff --stat`：3 files changed, 37 insertions(+), 9 deletions(-)；
    `git status --short`：僅 factory、standController.ts、types.ts 三個未 staged 修改。

監工中場（2026-09-03，r2 後）：
  - r2 diff 審過：v2 於 S>1 解鎖、setBalanceTarget、negativeErrorServos 非對稱混合、roll 依
    平行四邊形反號（boot.y −1／thigh.y +1）。無禁用手法。
  - −z 0.004 三輪紅：雕像 −z 0.003 即倒、v1/v2 撐 0.003——控制器已超越被動極限。監工重校
    gate A 為 {0.002, 0.003}（契約＝全方向贏過剛體雕像），0.004 記為未 gate 延伸目標。
    重校後 A 24 景全綠。
  - scale_test C 因 v2 側傾回饋抵消開迴路位移而紅（23.6<30 mm）：C 量的是幾何原語，監工
    改為強制 v1 路徑 → 綠。
  - gate B 首次跑到：質心往正確方向但只到目標 43–48%——x 目標 ±0.040 實際 +0.0174／−0.0191；
    z 目標 ±0.015 實際 +0.0057／−0.0040。純 P 在重力負載下的穩態誤差；增益是為抗擾調的。
第三輪（gate B：質心目標追蹤）:
  配方（監工定方向，數值由你依證據定）:
     1. 前饋＋回饋：對每個軸，指令 = FF(target) + PD(error)。FF 用開迴路增益：
        roll：踝 y ＝ +a、髖 y ＝ −a 的平行四邊形，K_roll ≈ 0.45–0.59 m/rad（S=10；
        scale_test C 實測 a=0.1 → 45–59 mm）→ a_ff = target.x / K_roll（夾 ±0.2，0.2 以上會倒）。
        pitch：踝 x ±0.1 開迴路得 9–19 mm（K_pitch ≈ 0.09–0.19 m/rad，弱）；可加髖 x 同向
        前饋提高 K_pitch。用臨時探針在 S=10 量 K（含 sign），寫進 factory 的 balance 設定
        （新增可選 feedforward 欄位，例如 {rollGain, pitchGain, rollServos, pitchServos}）。
     2. 回饋維持現有 PD，必要時加積分項（限幅）消殘差；目標 ramp 期間穩定、hold 期收斂到
        |誤差| ≤ 0.001S。
     3. 不得為了 B 犧牲 A：每輪都跑完整 balance_test（A 24 景＋B＋doctrine）。
  驗收（第三輪）: 同第二輪 1–5（balance_test 全綠為主），scale_test 10、stand_test 綠。
  紅線: 同第二輪；gate 不動。上限三輪，仍紅寫證據停手。

Codex r3（2026-09-03，依第三輪三輪上限停手，status 保持 open）：
  - RED 基線：重校後 A 24 景先全綠，B 首格 `target (0.0400, 0.0000)` 仍紅；原文
    `實際 (0.0174, -0.0010)，誤差 > 0.0100`。根因與監工中場一致：純 P 在重力負載下
    有穩態誤差。
  - S=10 開迴路探針（已刪）：roll 踝 y = +a／髖 y = −a 在 a=±0.05、±0.10 時
    Kx=0.41–0.58 m/rad，a=±0.15 會倒；pitch 單踝 x 的 Kz 含 sign 為
    −0.070 至 −0.153 m/rad。踝 x／髖 x 反號組在 a=−0.15…+0.15 都站立，
    Kz 含 sign為 −0.083 至 −0.134 m/rad，故選 roll gain=0.50S、pitch gain=0.11S，
    輸出限幅 ±0.2；pitch FF 符號反轉，roll 使用踝正／髖負平行四邊形。
  - 已落地可選 `balance.feedforward.{pitch,roll}`（gain、maxOutput、servo mix），v2 每步
    命令為 FF(target)+PID(error)+lean，仍與 setPoseTarget base 疊加；前饋 servo id 納入
    controlledServoIds。StandBalanceAxis 新增可選 integralGain/integralMaxOutput，enable
    建立新積分狀態、disable/cancel 後不保留，anti-windup 依最大輸出夾積分。v1 無 v2 欄位
    路徑與 0.8/30 語意未改。
  - 第 1 輪完整 balance gate：A 24 景仍全綠；FF 單獨把 B 首格 x 從 0.0174 提到
    0.0198，但仍紅，原文 `實際 (0.0198, -0.0009)，誤差 > 0.0100`。機制是 FF 與
    現有誤差回饋抵消，閉迴路仍停在負載平衡點。
  - 第 2 輪完整 balance gate：加入 roll/pitch Ki=2/S、I 輸出限幅 0.15；A 24 景仍全綠，
    B 前三目標通過，閉迴路探針終值依序為 (+0.0356,+0.0000)、(−0.0328,−0.0002)、
    (−0.0048,+0.0172)。首紅移到末格 `target (0.0000, -0.0150)`，原文
    `實際 (0.0050, -0.0283)，誤差 > 0.0100`；負 z 過衝。
  - 第 3 輪完整 balance gate：僅將 pitch Ki 減半為 1/S；A 24 景仍全綠，但末格變成
    `實際 (0.0014, 0.0113)，誤差 > 0.0100`，表示前一正 z 段的積分記憶無法在 ramp/hold
    內解除，而非單純 Ki 過大。依上限停止，回復證據較佳的第 2 輪 Ki=2/S；剩餘機制是
    目標跨零／反向時的積分 windup，未再嘗試第四輪（可後續研究目標變向時積分 reset 或
    back-calculation anti-windup）。
  - 驗收 1 tsc：PASS（exit 0，無診斷）。驗收 2 balance_test：FAIL；A 24 景全綠、B
    前三目標通過，末格原文 `B target (0.0000, -0.0150) 質心必須到位：實際
    (0.0050, -0.0283)，誤差 > 0.0100`，故 B 未全綠且 doctrine 未執行。
  - 驗收 3 scale_test S=10：`scale_test: PASS（S=10：六輪站立／24 景抗推／踝側傾移質心／doctrine）`；
    stand_test：`stand_test: PASS（癱後恢復站立/放掉再癱/對照照舊癱）`。
  - physics_test：PASS（`pass:true`，12 bodies finite，11 constraints 全 ok）。
    actuation_test：PASS（servo coverage/checks 全 ok，`pass:true`）。motion_test walk：PASS
    （finite=true，60 frames，180 physicsSteps，constraints 11→11 stable，19 tracks 全 pass）。
    motion_suspension_test：`motion suspension tests: pass`。face_test：
    `face_test: PASS（六件五官立體、對稱、掛頭下）`。
  - walk_ground_probe hold：exit 0，standing=true、3/3 cycles、fell=false、
    minHeadY=0.8723805、minUpY=0.9999992、finite=true、constraintsStable=true。
    forge unittest：`Ran 98 tests in 1.155s`、`OK`。
  - 未改 balance/scale/stand gate、斷言、換算或 spec；未用 STATIC 錨、凍結 body 或永久
    disablePreStep；未 git add/commit。臨時 `tmp_balance_ff_probe.ts` 已刪。寫 notes 前
    `git diff --stat`：3 files changed, 71 insertions(+), 3 deletions(-)；
    `git status --short`：僅 factory、standController.ts、types.ts 三個未 staged 修改。

監工驗收（2026-09-03，r3 後）：
  - 獨立重跑：tsc、balance_test A 24/24 綠、B 前三目標綠、末格 `(0, −0.015)` 紅
    （實際 (0.0050, −0.0283)：目標由 +z 反向到 −z 時積分記憶未清）；scale_test 10、stand、
    physics、actuation、motion、suspension、face、forge 98 全綠。
  - diff 審過：feedforward 欄位（roll gain 0.50S、pitch 0.11S、限幅 ±0.2）、限幅積分
    （Ki 2/S、I 限幅 0.15）、v1 未動、無禁用手法。
  - 判定：三輪上限到（r1 骨架、r2 解鎖＋A 重校、r3 前饋＋積分），剩餘單一機制＝目標
    反向時的積分 windup，修法教科書級（目標變向時積分歸零／back-calculation anti-windup）。
    依 dispatch.md 標 blocked、request-input：建議加派一輪範圍鎖定為 anti-windup 的 r4。
