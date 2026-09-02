# 0012 站立主動平衡回饋：StandController 每步微調髖/膝 servo 目標
model: action-figure        status: done
脈絡: 0011 三輪證明被動站立臨界穩定（Havok POSITION 馬達剛性不可調）。
     監工 probe 已驗證主動回饋方案跨四個癱等待家族（150/300/450 步 × 24~36 輪）
     108/108 全站。本卡是落地輪：方向與增益已定，勿重新發明。
配方（監工 probe 驗證過的精確規格）:
  - 站立期間（enable 後）掛 scene.onAfterPhysicsObservable 觀察者：
    - 前 5 步 skip（等 2-step 同步窗結束＋落定）；
    - 每步：torso up = TransformNormal(Up, torso worldMatrix).normalize()；
      lean = up.z；drift = torso.absolutePosition.z；
      u = 0.8 * lean + 30 * drift；
    - 髖 servo（servo:thigh-l.x / servo:thigh-r.x）set(clamp(u, min, max))；
      膝 servo（servo:calf-l.x / servo:calf-r.x）set(clamp(-u, min, max))。
  - disable() 移除觀察者（先移觀察者再 release servo）。
  - 泛用性：StandController 不得寫死 action-figure 的 servo id——BuiltModel
    加可選 balance 欄位（由 factory 提供，形如
    { leanGain, driftGain, pitchServos: [{ id, sign }] }），StandController
    有 balance 才啟用回饋，沒有則維持純鎖姿。action-figure factory 填入
    上述四個 servo（髖 sign +1、膝 sign -1）與增益。
驗收（全部跑、結果寫進 notes）:
  1. cd viewer && npx tsc --noEmit
  2. node --import tsx scripts/stand_test.ts（六輪循環全綠）
  3. node --import tsx scripts/physics_test.ts action-figure --spec models/action-figure/spec.json
  4. node --import tsx scripts/actuation_test.ts action-figure --spec models/action-figure/spec.json
  5. node --import tsx scripts/motion_test.ts action-figure --spec models/action-figure/spec.json --timeline ../.img2babylon/motion/walk-timeline.json
  6. node --import tsx scripts/motion_suspension_test.ts
  7. node --import tsx scripts/face_test.ts
紅線: 不得改 gate/斷言/門檻；不得 STATIC 錨、凍結 body、永久 disablePreStep；
     不得動增益數值（0.8 / 30 是監工驗證值，跑紅了寫數據停手，不得自行調參）；
     不得 git add/commit；臨時 probe 用完刪；notes 寫卡、status 不動。
notes:
  - 2026-09-02 落地完成：BuiltModel 新增可選 balance；StandController 僅在有
    balance 時掛 onAfterPhysicsObservable，前 5 步 skip，依 torso up.z / absolutePosition.z
    計算 u，逐 servo 依 sign 與自身 min/max 夾限；disable 先移除回饋 observer 再 release。
  - action-figure factory：thigh-l.x / thigh-r.x sign +1，calf-l.x / calf-r.x
    sign -1；leanGain 0.8、driftGain 30（未調參）。
  - 驗收 1 `cd viewer && npx tsc --noEmit`：PASS（exit 0）。
  - 驗收 2 `node --import tsx scripts/stand_test.ts`：PASS（六輪癱後恢復站立、
    放掉再癱、對照照舊癱）。
  - 驗收 3 `node --import tsx scripts/physics_test.ts action-figure --spec models/action-figure/spec.json`：
    PASS（`pass: true`，10 bodies finite，9 constraints 全部 ok）。
  - 驗收 4 `node --import tsx scripts/actuation_test.ts action-figure --spec models/action-figure/spec.json`：
    PASS（全部 coverage / servo checks ok，`pass: true`）。
  - 驗收 5 `node --import tsx scripts/motion_test.ts action-figure --spec models/action-figure/spec.json --timeline ../.img2babylon/motion/walk-timeline.json`：
    PASS（finite，constraints 9→9 stable，全部 tracks pass，`pass: true`）。
  - 驗收 6 `node --import tsx scripts/motion_suspension_test.ts`：PASS。
  - 驗收 7 `node --import tsx scripts/face_test.ts`：PASS（六件五官立體、對稱、掛頭下）。
  - TDD contract probe 先確認缺少 `BuiltModel.balance` 時 strict 編譯如預期失敗，
    實作後 probe 與 typecheck 轉綠；一次性 probe 已刪除。未改 gate/斷言/門檻，
    未使用 STATIC 錨、凍結 body 或永久 disablePreStep；未 git add/commit。
  - Codex r1（2026-09-02）：依配方落地 balance observer／BuiltModel.balance／
    factory 增益設定，7 條驗收全綠（詳上方 Codex 回報）。
監工驗收（2026-09-02）：
  - 獨立重跑：tsc、六輪 stand gate、physics/actuation/motion(walk)/suspension/
    face、forge 98 tests、validate_spec --strict、check_colliders 全綠。
  - playground 首輪實測仍 ~50% 倒 → 抓到最後一層根因：main.ts HavokPlugin(true)
    用真實 frame dt 餵 Havok（有抖動），headless 是 HavokPlugin(false) 固定 1/60。
    臨界系統對 dt 抖動敏感，整個 M7「headless 綠、playground 紅」皆源於此。
    監工修正 main.ts → HavokPlugin(false)（與 gate 同一物理積分模式，60fps 下
    牆鐘行為不變）。
  - 修正後 playground 真按鈕 10 輪循環 10/10 全站穩（final 0.0809 ≥ 0.0704），
    放掉全數再癱（0.0150）。影片 .img2babylon/shots/stand-cycles.webm、
    截圖 stand-final.png。status → done。
