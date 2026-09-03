# 0016 單腳站 spike（M8 生死關）：質心壓到左靴上方，抬右腿撐 5 秒
model: action-figure        status: done（spike 成功）
脈絡: M8 第三卡（ROADMAP）。0015 已給：v2 質心平衡（setBalanceTarget 橫移 ±0.004S 到位）、
     踝側傾＋髖外展平行四邊形（開迴路 0.1 rad → 0.045–0.059S）。0013 證明沒有重心轉移時
     一抬腿就倒；本卡驗證有了重心轉移能不能單腳站。
     幾何（base·S）：左靴中心 x=+0.009（LEG_X）、靴半寬 0.008、半深 0.014；質心要從兩腳
     中間橫移 ~0.009S 到左靴中心。0015 gate B 只驗到 ±0.004S；本卡要推到 0.009S。
     已知限制：後向俯仰閉迴路無權威（0015 notes）；抬腿時右腿質量前移會讓質心前偏，
     這方向（前）有權威。
需要落地的 API（探針引用，目前 tsc 紅）:
     StandController.setSupportBodies(ids: string[]): void
       - v2 支撐面參考改為指定 body 的 absolutePosition 平均（單腳＝該靴）；
         setBalanceTarget 的目標仍相對此參考。enable() 時重設為 balance.supportBodyIds。
       - 切換當下不得讓指令跳變：參考點從兩靴中心跳到左靴中心（Δx≈0.009S）會讓誤差瞬間
         變號——實作要在切換時把前饋／積分狀態對應平移（或用 ramp 過渡），寫清做法。
量測儀器: `viewer/scripts/single_leg_probe.ts`（監工寫；協定／指標勿改）。
     用法：node --import tsx scripts/single_leg_probe.ts [--collapse 300] [--shift 0.009]
           [--lift-hip -0.6] [--lift-knee 0.8] [--out file]；JSON 用 `sed -n '/^{/,$p'`。
     階段：shift-ramp → shift-hold → switch-hold → lift-ramp → hold；每階段記頭高／up／
     質心相對左靴／右靴離地。
成功判準（監工定，勿改）:
     collapse ∈ {150, 300, 450} 三家族，預設參數（shift 0.009、hip −0.6、knee 0.8）全部：
     fell=false、final.standing、final.comInsideLeftBoot、final.rightBootClear（≥0.002S）。
     達標 → spike 成功，0017 開步態。
     不達標 → 允許的探索（每個都寫數據）：shift 0.007～0.011、lift-hip −0.3～−0.6、
     lift-knee 0.4～0.8、lift ramp 較慢（探針參數外的改動要寫進 notes 並說明）；
     v2 增益／前饋可調（0015 gate 不得因此變紅）。三輪仍不達標 → 寫清倒下階段與機制
     （質心軌跡、哪個 servo 飽和、右靴何時離地），停手 → M8 tombstone 由監工與使用者議。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit
  2. for c in 150 300 450; do node --import tsx scripts/single_leg_probe.ts --collapse $c | sed -n '/^{/,$p'; done（三家族 JSON 摘要進 notes）
  3. node --import tsx scripts/balance_test.ts；scripts/scale_test.ts 10；scripts/stand_test.ts（全綠）
  4. physics／actuation／motion(walk)／suspension／face 全綠；forge unittest 98
  5. 監工另做：playground 目視（若成功，錄影證據）。
紅線: 不得改探針協定／指標／判準；不得改 gate；不得 STATIC 錨、凍結 body、永久
     disablePreStep；spec 幾何／質量／限位不動；v1 退回路徑增益不動；不得 git add/commit；
     臨時探針用完刪；notes 寫卡、status 不動；用 node --import tsx（不是 npx tsx）。
notes:
  2026-09-03 Codex 實作與三輪 spike（依卡片上限停手，status 保持 open）：
  - RED：`npx tsc --noEmit` exit 2，唯一診斷為
    `single_leg_probe.ts(93,9): error TS2339: Property 'setSupportBodies' does not exist on type 'StandController'.`
  - 落地 `StandController.setSupportBodies(ids)`：enable 時恢復 `balance.supportBodyIds`；切換時
    量舊／新支撐 body absolutePosition 平均，將 local balanceTarget 平移
    `oldSupport-newSupport`，故世界目標、PID error、微分及積分狀態連續。前饋改以
    `local target + current support - default support` 計算，同一世界目標在切換前後輸出不跳。
    無效或空 ids 採 fail-closed、不改目前支撐。tsc 隨後 exit 0。
  - r1 預設（shift 0.009、hip -0.6、knee 0.8）：collapse 150/300/450 三家族輸出完全一致。
    各階段 `(headYEnd, comRelL[dx,dz], bootRLift)`：shift-ramp
    `(0.868289,[-0.034430,0.000099],0.000621)`；shift-hold
    `(0.865648,[-0.018673,0.000117],0.001796)`；switch-hold
    `(0.864035,[-0.010575,0.000069],0.002136)`；lift-ramp
    `(0.150001,[-0.140869,-0.107833],0.393198)`；hold
    `(0.156513,[-0.079969,-0.128984],0.404481)`。三家族皆 `fellAt=lift-ramp step 762`；
    final 四布林依序 standing/comInsideLeftBoot/rightBootClear，加 fell：
    `false/true/true, fell=true`（故未達標）。
  - r2 隔離抬腿力矩（shift 0.009、hip -0.3、knee 0.4）：三家族仍完全一致。shift-ramp、
    shift-hold、switch-hold 同 r1；lift-ramp
    `(0.859888,[0.000895,-0.006830],0.002189)`；hold
    `(0.859576,[0.000543,-0.003802],0.002191)`。`fellAt=null`；final
    `standing=true/comInsideLeftBoot=true/rightBootClear=false, fell=false`；站住但右靴僅抬
    0.00219，低於門檻 0.002S=0.020。
  - r3 控制假說：單腳模式暫時只把 balance offset 送支撐側（probe 協定未改），預設參數
    三家族一致。shift-ramp/shift-hold 同 r1；switch-hold
    `(0.866094,[-0.011517,-0.000041],0.001775)`；lift-ramp
    `(0.150000,[0.042367,-0.158922],0.183956)`；hold
    `(0.150000,[0.008303,-0.125798],0.174152)`。三家族皆 `fellAt=lift-ramp step 769`；final
    `standing=false/comInsideLeftBoot=true/rightBootClear=true, fell=true`。此實驗未改善，已回退，
    未留在產品碼。
  - 三輪結論：切換本身穩定，倒下皆發生在 lift-ramp；完整抬腿時右靴離地，但 COM 的 z
    從 switch-hold 約 0 漂到 -0.108（r1）或 -0.159（r3），頭高落到地板 0.150，符合
    0015 已知「後向俯仰閉迴路幾乎無權威」機制。較小姿態可站但無足夠 clearance；三輪
    已用完，依卡片停手，M8 spike 未成功，留監工／使用者議 tombstone。
  - 最終驗收：tsc exit 0；balance_test：`PASS（24 景抗推站回來／質心目標追蹤／放掉再癱）`；
    scale_test 10：`PASS（S=10：六輪站立／24 景抗推／踝側傾移質心／doctrine）`；
    stand_test：`PASS（癱後恢復站立/放掉再癱/對照照舊癱）`。physics exit 0（12 bodies
    finite、11 constraints ok）；actuation `pass:true`；motion(walk) `pass:true`；
    suspension `motion suspension tests: pass`；face `PASS（六件五官立體、對稱、掛頭下）`；
    forge `Ran 98 tests`、`OK`。未改任何 gate/probe/spec/status，未用禁用手法，未
    git add/commit，無臨時 probe 留存。
  - 最終工作樹重跑預設三家族，輸出與 r1 完全一致（皆 lift-ramp step 762 倒下）。
    `git diff --stat`：`2 files changed, 84 insertions(+), 11 deletions(-)`；
    `git status --short`：`M tasks/0016-single-leg-spike.md`、`M viewer/src/standController.ts`。

監工驗收／探索（2026-09-03）：
  - diff 審過：setSupportBodies 以世界目標守恆平移 local target（PID／積分／前饋連續），
    enable 重設預設支撐；無禁用手法。全 gate 獨立重跑綠。
  - Codex 三輪數據顯示雙態：小抬腿（−0.3/0.4）站住但右靴只離地 2 mm；全抬腿（−0.6/0.8）
    右靴瞬間飛到 0.39 m、質心後甩倒——軟 POSITION 馬達在腳被地面釘住時把目標落差存成
    彈簧能，脫離接觸即整腿甩出（黏滑，同 0015 後向俯仰機制）。
  - 監工探索（卡片允許「lift ramp 較慢」；探針加 `--lift-ramp`，協定預設 300 不變）：
    ramp 300/900/1800/2700 × 角度掃描——慢 ramp 出現中間態：
      −0.45/0.6 ramp 1800：站、離地 17 mm；ramp 2700：站、離地 35 mm、質心 (0.009,0.004)。
      −0.5/0.65 ramp 2700：23 mm；−0.55/0.7 ramp 2700：25 mm；ramp 1800 仍彈飛。
      −0.45/0.75 ramp 1800：往前倒（膝先過頭）；−0.3/0.8：彈飛。
  - **三家族驗證**（collapse 150/300/450，逐位相同）：
      hip −0.45／knee 0.6／ramp 2700：fell=false、standing、comInsideLeftBoot、
      rightBootClear（0.035 ≥ 0.020）、up 0.981 → **達標**。
      hip −0.55／knee 0.7／ramp 2700：全達標（0.025）。JSON 於 .img2babylon/probes/0016/。
  - 判定：**M8 生死關通過**，單腳站成立。建議 0017 的抬腿參數：髖 −0.45／膝 0.6、抬腿
    ramp ≥ 2700 base 步（S=10 下 142 s 牆鐘——步態會很慢；要快就得剛硬 servo 消黏滑，
    另開卡）。status → done。
