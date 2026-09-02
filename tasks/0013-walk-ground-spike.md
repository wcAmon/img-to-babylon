# 0013 地面走路實驗（spike）：站穩後不吊空播 walk timeline，量位移／跌倒
model: action-figure        status: done (tombstone)
脈絡: M7 站立已成（0012：StandController 主動平衡回饋 u = 0.8·lean + 30·drift，
     髖 +u／膝 −u，夾限位）。本卡是 spike——產出是「數據＋建議」，不是要留的功能。
     問題：站穩後在地面播 kimodo walk timeline，人偶能不能走？走多遠？幾步倒？
     已知衝突：0012 的平衡 observer 每個物理步都 set() 髖/膝四個 servo，timeline
     播放也 set 同四個 servo——直接疊播會被回饋蓋掉。故要比較兩種接法。
     監工基線（2026-09-03，probe 已跑，信這份）：
       - hold（只站不走，540 步）：不倒，位移 0，head 0.0809 恆定。
       - raw（放掉平衡純播放）：walk-timeline 20fps 第 36 步倒（cycle1 frame11）、
         walk-slow 5fps 第 92 步倒（cycle1 frame7）；兩者 dz ≈ −0.039（往 −z＝後仰倒），
         minUpY 0.40～0.47。與播放速度無關——timeline 前幾幀的姿勢本身（髖 x 到
         −0.8 rad）就把重心甩出支撐面。
量測儀器: `viewer/scripts/walk_ground_probe.ts`（監工寫；協定／指標／常數勿改）。
     用法：node --import tsx scripts/walk_ground_probe.ts --variant hold|raw|assist
           --timeline <json> [--collapse N] [--cycles N] [--out file]
     stdout 混有 Babylon banner，取 JSON 用 `sed -n '/^{/,$p'`。
需要落地的 API（assist 變體引用，目前 tsc 紅）:
     StandController.setPoseTarget(id: string, value: number): void
       - 站立期間（enabled）：id 屬 balance.pitchServos → 存為該 servo 的基準目標，
         observer 每步 set(clamp(base + sign·u, min, max))；不屬 → 直接 servo.set(value)。
       - 未站立：等同 servo.set(value)。
       - enable() 時清空基準（站立姿勢基準仍是 0）；disable() 亦清空。
       - 站立本身行為不得改變：stand_test 六輪 gate 照舊綠、增益 0.8/30 不動。
實驗矩陣（全部跑，數據寫進 notes，每格記 fell / fall.step / cycle / dz / minHeadY）:
     variant ∈ {hold, raw, assist} × timeline ∈ {walk-timeline.json, walk-slow.json}
     × collapse ∈ {150, 300, 450}，--cycles 3。
     for v in hold raw assist; do for t in walk-timeline walk-slow; do for c in 150 300 450; do
       node --import tsx scripts/walk_ground_probe.ts --variant $v \
         --timeline ../.img2babylon/motion/$t.json --collapse $c --cycles 3 \
         | sed -n '/^{/,$p' > ../.img2babylon/probes/0013-$v-$t-$c.json; done; done; done
     （先 mkdir -p ../.img2babylon/probes；.img2babylon 已 gitignore）
成功判準（監工定，勿改）:
     某一 variant×timeline 組合在三個 collapse 家族**全部**：fell=false（3 循環）且
     |displacement.dz| ≥ 0.01。達標 → spike 成功，卡 notes 寫明哪組。
     全部不達標 → 「證明做不到」也是合格產出：把矩陣數據＋你觀察到的倒下機制
     （哪幀、哪個關節、往哪倒）寫進 notes，停手。
允許的探索（assist 矩陣跑完仍全倒時，最多再加 2 個變體）:
     可在 probe 的 VARIANTS 陣列與 applyFrame／raw-disable 分支加新 variant 名稱
     （例：只餵下半身軌道、timeline 幅度 ×0.5、走路期間另一組增益）——但 probe
     其他部分（STAND_STEPS、FALL_RATIO、量測、輸出欄位）一字不動；每個新變體
     的定義與矩陣數據都要寫進 notes。走路期間若用不同增益，必須是獨立的
     walk-mode 參數，站立模式的 0.8/30 不得動。
驗收（全部跑、結果寫進 notes）:
  1. cd viewer && npx tsc --noEmit
  2. node --import tsx scripts/stand_test.ts（六輪循環全綠——setPoseTarget 不得改變站立）
  3. node --import tsx scripts/physics_test.ts action-figure --spec models/action-figure/spec.json
  4. node --import tsx scripts/actuation_test.ts action-figure --spec models/action-figure/spec.json
  5. node --import tsx scripts/motion_test.ts action-figure --spec models/action-figure/spec.json --timeline ../.img2babylon/motion/walk-timeline.json
  6. node --import tsx scripts/motion_suspension_test.ts
  7. node --import tsx scripts/face_test.ts
  8. 上述 18 格矩陣（＋允許的額外變體）全部跑完，數據表寫進 notes。
紅線: 不得改 gate／斷言／門檻；不得改 probe 量測協定與判準；不得 STATIC 錨、
     凍結 body、永久 disablePreStep、改 timeline 檔案；站立增益 0.8/30 不動；
     不得 git add/commit；臨時探針用完刪；notes 寫卡、status 不動；
     用 node --import tsx（不是 npx tsx）。
notes:
2026-09-03 Codex 實作／實驗結果：

- `StandController.setPoseTarget(id, value)` 已落地。active 時，`balance.pitchServos`
  的目標存成 pose baseline，balance observer 每物理步送出
  `clamp(base + sign*u, min, max)`；非 balance servo 與 inactive 狀態直接 `set()`；
  `enable()`／`disable()` 都清空 baseline。站立增益維持 `leanGain=0.8`、
  `driftGain=30`，站立的零姿勢行為未變。
- 額外探索（用滿允許的 2 個變體）：`assist-half`＝所有 timeline 軌道乘 0.5 後
  經 `setPoseTarget`；`assist-lower-half`＝只餵 thigh/calf 軌道且乘 0.5，其餘保持
  站立零姿勢。未改 STAND_STEPS、FALL_RATIO、量測或輸出欄位。

矩陣（`cycles=3`；`-` 表示未跌倒）：

| variant | timeline | collapse | fell | fall.step | cycle | frame | dz | minHeadY |
|---|---|---:|:---:|---:|---:|---:|---:|---:|
| hold | walk-timeline | 150 | false | - | - | - | 0 | 0.080872 |
| hold | walk-timeline | 300 | false | - | - | - | 0 | 0.080872 |
| hold | walk-timeline | 450 | false | - | - | - | 0 | 0.080872 |
| hold | walk-slow | 150 | false | - | - | - | 0 | 0.080872 |
| hold | walk-slow | 300 | false | - | - | - | 0 | 0.080872 |
| hold | walk-slow | 450 | false | - | - | - | 0 | 0.080872 |
| raw | walk-timeline | 150 | true | 36 | 1 | 11 | -0.039177 | 0.045926 |
| raw | walk-timeline | 300 | true | 36 | 1 | 11 | -0.039123 | 0.046485 |
| raw | walk-timeline | 450 | true | 36 | 1 | 11 | -0.039123 | 0.046485 |
| raw | walk-slow | 150 | true | 92 | 1 | 7 | -0.038252 | 0.045540 |
| raw | walk-slow | 300 | true | 92 | 1 | 7 | -0.038466 | 0.045155 |
| raw | walk-slow | 450 | true | 92 | 1 | 7 | -0.038466 | 0.045155 |
| assist | walk-timeline | 150 | true | 35 | 1 | 11 | -0.030439 | 0.049523 |
| assist | walk-timeline | 300 | true | 35 | 1 | 11 | -0.030625 | 0.049060 |
| assist | walk-timeline | 450 | true | 35 | 1 | 11 | -0.030625 | 0.049060 |
| assist | walk-slow | 150 | true | 89 | 1 | 7 | -0.030432 | 0.052512 |
| assist | walk-slow | 300 | true | 90 | 1 | 7 | -0.033456 | 0.042610 |
| assist | walk-slow | 450 | true | 90 | 1 | 7 | -0.033456 | 0.042610 |
| assist-half | walk-timeline | 150 | true | 40 | 1 | 13 | -0.033456 | 0.049615 |
| assist-half | walk-timeline | 300 | true | 40 | 1 | 13 | -0.033688 | 0.048935 |
| assist-half | walk-timeline | 450 | true | 40 | 1 | 13 | -0.033688 | 0.048935 |
| assist-half | walk-slow | 150 | true | 102 | 1 | 8 | -0.033331 | 0.045700 |
| assist-half | walk-slow | 300 | true | 102 | 1 | 8 | -0.032936 | 0.046645 |
| assist-half | walk-slow | 450 | true | 102 | 1 | 8 | -0.032936 | 0.046645 |
| assist-lower-half | walk-timeline | 150 | true | 40 | 1 | 13 | -0.034113 | 0.047713 |
| assist-lower-half | walk-timeline | 300 | true | 40 | 1 | 13 | -0.034036 | 0.048629 |
| assist-lower-half | walk-timeline | 450 | true | 40 | 1 | 13 | -0.034036 | 0.048629 |
| assist-lower-half | walk-slow | 150 | true | 101 | 1 | 8 | -0.031540 | 0.052134 |
| assist-lower-half | walk-slow | 300 | true | 101 | 1 | 8 | -0.031583 | 0.052017 |
| assist-lower-half | walk-slow | 450 | true | 101 | 1 | 8 | -0.031583 | 0.052017 |

判定／機制：沒有任何 variant×timeline 在三個 collapse 家族同時滿足「3 循環不倒
且 `|dz| >= 0.01`」，故本 spike 證明既有 kimodo timeline 不能直接作為地面步態。
hold 全部穩定但 `dz=0`；其餘全部 cycle 1 後仰（`dz<0`）。原幅 timeline 的
`servo:thigh-r.x` 在 frame 11 已到約 `-0.607 rad`（frame 13 約 `-0.738 rad`），
同時右膝大幅屈曲（frame 11 約 `+0.787 rad`），單側支撐面／重心被甩向 -z；
assist 改善倒下時的軀幹朝上程度卻未阻止頭高跌破門檻。半幅及只餵下半身均只把
20fps 跌倒延到 frame 13、5fps 延到 frame 8。三個 collapse 結果近乎相同，排除
初始癱姿家族是主因。建議下一張卡製作地面專用步態：先做小幅重心轉移與雙腳接觸
相位，再逐步加入抬腿，而非再調播放速度或直接縮放現有空中動作。

驗收實際輸出（完成矩陣與探索後）：

1. `npx tsc --noEmit`：exit 0。
2. `node --import tsx scripts/stand_test.ts`：exit 0，`stand_test: PASS`，六輪癱後
   恢復站立／disable 再癱／獨立對照照舊癱全綠。
3. `physics_test.ts action-figure`：exit 0，`pass: true`；10 bodies 有限、9 constraints
   全部 `ok: true`。
4. `actuation_test.ts action-figure`：exit 0，全部 coverage／servo checks `ok: true`，
   `pass: true`。
5. `motion_test.ts action-figure ...walk-timeline.json`：exit 0；20fps、60 frames、
   180 physics steps，finite、9 constraints stable、全部 tracks pass，總 `pass: true`。
6. `motion_suspension_test.ts`：exit 0，`motion suspension tests: pass`。
7. `face_test.ts`：exit 0，`PASS（六件五官立體、對稱、掛頭下）`。
8. 固定 18 格與允許的額外 12 格皆 exit 0；逐格 JSON 保存於
   `.img2babylon/probes/0013-<variant>-<timeline>-<collapse>.json`。

監工驗收（2026-09-03）：
  - diff 審查：standController 只加 poseTargets 基準疊加與 setPoseTarget，增益 0.8/30
    未動、無 STATIC/凍結/永久 disablePreStep；probe 只加兩個 variant 分支，量測與判準未動。
  - 獨立重跑：tsc、六輪 stand gate、physics/actuation/motion(walk)/suspension/face、
    forge 98 unittest、validate_spec --strict、check_colliders 全綠。
  - 獨立重跑 30 格矩陣（.img2babylon/probes/verify/），逐格與 Codex 表一致，0 格達標。
  - 機制補充：人偶面朝 +z（眼/鼻 pivot z≈+0.015），dz<0 是往後仰倒。倒下幀
    frame 7–11 右髖 −0.21→−0.61 rad、右膝 +0.44→+0.79 rad ＝ 右腳離地、單腳站
    16mm 寬左靴。0010 已證髖 POSITION 馬達剛性不可調（純站立即屈服 0.28 rad），
    單腳期負載加倍；0012 回饋只控俯仰不控側傾。結構性失敗，非調參可救。
  - 判定：spike 完成，結論「現有致動器模型（Havok POSITION 馬達）＋空中 timeline
    無法地面走路」。setPoseTarget 保留為未來步態卡的前饋掛鉤（10 行、gate 全綠）；
    walk_ground_probe.ts 保留為量測儀器。路線與使用者議：見 ROADMAP 0013。

監工路線探勘（2026-09-03，使用者選 (b) 後的可行性探針，用完已刪）：
  - 三種驅動比較（出廠姿勢直接站 300 步）：POSITION 站穩、髖 4e-5 rad（無負載時
    不屈服）；VELOCITY 馬達＋PD（target ω = kp·(θ*−θ)）kp 5/20 站穩、髖誤差 1e-3，
    kp 60 自激振盪第 62 步倒，符號反向即發散；顯式 applyAngularImpulse PD 兩符號
    ×六個 kp 全在第 5–23 步倒——肢段慣量 I≈4e-7，60Hz 顯式 PD 穩定上限
    kp<I/dt²≈1.5e-3，撐腿需 ~5e-3，同尺度不可能既穩又硬。
  - 決定性：單腳姿勢（thigh-r.x −0.6／calf-r.x +0.8）POSITION 追到 −0.627／0.802、
    VELOCITY-PD 追到 −0.633／0.775——關節都撐得住、都追到了，仍在第 18–27 步倒。
    ⇒ 致動器剛性不是瓶頸，(b) 路線前提不成立。
  - 質心追蹤：質心 x 從第 1 步起就在左小腿外 9mm（兩腳中間；左靴半寬 8mm）。
    ramp 240–300 步慢抬腿、髖側擺 z/y ±0.1～0.3、站立髖前傾偏置 ±0.15～0.6 共
    20 組：dx 全程恆 −0.009 直到倒下——兩腳踩地時髖側擺移不動質心；「只側擺不抬
    腿」ramp 完也在第 313 步被甩倒。⇒ 無踝關節 ⇒ 質心無法橫移到單靴上 ⇒ 單腳支撐
    在運動學上不可能 ⇒ 任何含擺動相的步態都不可能，與控制器無關。
  - 修正後的路線（見 ROADMAP 0013）。
