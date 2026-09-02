# 0013 地面走路實驗（spike）：站穩後不吊空播 walk timeline，量位移／跌倒
model: action-figure        status: open
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
