# 0018 套件入口：viewer 可被姊妹專案 image-to-physics import
model: viewer（不涉單一模型）        status: done
脈絡: 物理行為（M7／M8 的 StandController、balance/scale/stand/single_leg/walk 腳本）
     移交到姊妹 repo `../image-to-physics`（設計文件在該 repo docs/superpowers/specs/）。
     img2babylon 只保留契約：spec／factory／actuator／retarget／吊空 motion gate。
     本卡讓 viewer 成為可 import 的套件；搬家由 image-to-physics 那邊的卡負責，本卡不刪任何檔。
要做:
  1. 新增 `viewer/src/index.ts`：具名匯出 `types.ts` 全部型別、`createHeadlessScene`
     與 `HeadlessContext`、`registry`、`capture.ts` 公開函式、`motionTimeline.ts` 全部、
     `motionSuspension.ts` 公開類別／函式。不搬檔、不改既有模組內容。
  2. `viewer/package.json`：`name` 改 `img2babylon-viewer`；加 `"exports": { ".": "./src/index.ts" }`
     與 `"types": "./src/index.ts"`；`@babylonjs/core`、`@babylonjs/havok` 另列
     `peerDependencies`（dependencies 保留，img2babylon 單獨仍可跑）。
  3. `ROADMAP.md` 0017 條目改為 tombstone：「移交 image-to-physics（M2 下半身）」，原文
     縮成一行保留脈絡；M8 標題下加一行「物理行為自 2026-09-03 起在姊妹 repo 進行」。
  4. `CLAUDE.md` 加一條：viewer 是套件入口（`src/index.ts`），姊妹專案 image-to-physics
     以路徑別名或 file: 連結本 checkout；契約歸本 repo，控制層歸物理 repo。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit（exit 0）
  2. node --import tsx -e 'import("./src/index.ts").then(m=>console.log(Object.keys(m).sort().join(",")))'
     （列出匯出名；至少含 createHeadlessScene、registry、validateMotionTimeline、frameStepCounts、MotionTimelinePlayer）
  3. 既有 gate 全綠：physics_test action-figure --spec、actuation_test、motion_test、
     motion_suspension_test、face_test、stand_test、balance_test、scale_test 10；
     forge unittest 98；npm run build（vite build 仍成功）
紅線: 不得改 gate／門檻；不得搬移或刪除任何檔；spec 不動；不得 git add/commit；
     臨時檔用完刪；notes 寫卡、status 不動；用 node --import tsx（不是 npx tsx）。
notes:
  - 2026-09-03 驗收：`cd viewer && npx tsc --noEmit` exit 0（無輸出）。
  - 套件入口：`node --import tsx -e 'import("./src/index.ts").then(m=>console.log(Object.keys(m).sort().join(",")))'`
    exit 0；原文：`MotionSuspension,MotionTimelinePlayer,createHeadlessScene,frameStepCounts,installCapture,registry,validateMotionTimeline`。
  - `physics_test.ts action-figure --spec models/action-figure/spec.json` exit 0；原文要點：
    `"pass": true`，12 bodies 全部 `"finite": true`，11 constraints 全部 `"ok": true`。
  - `actuation_test.ts action-figure --spec models/action-figure/spec.json` exit 0；原文要點：
    coverage 含 boot-l／boot-r，全部 checks `"ok": true`，總 `"pass": true`。
  - `motion_test.ts action-figure --spec models/action-figure/spec.json --timeline ../.img2babylon/motion/walk-timeline.json`
    exit 0；原文要點：`"fps": 20`、`"frames": 60`、`"finite": true`、constraints
    before/after 11 且 `"stable": true`、全部 tracks `"pass": true`、總 `"pass": true`。
  - `motion_suspension_test.ts` exit 0；原文：`motion suspension tests: pass`。
  - `face_test.ts` exit 0；原文：`face_test: PASS（六件五官立體、對稱、掛頭下）`。
  - `stand_test.ts` exit 0；原文：`stand_test: PASS（癱後恢復站立/放掉再癱/對照照舊癱）`。
  - `balance_test.ts` exit 0；原文：`balance_test: PASS（24 景抗推站回來／質心目標追蹤／放掉再癱）`。
  - `scale_test.ts 10` exit 0；原文：`scale_test: PASS（S=10：六輪站立／24 景抗推／踝側傾移質心／doctrine）`。
  - `python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'` exit 0；原文：
    `Ran 98 tests in 1.147s`、`OK`。
  - `cd viewer && npm run build` exit 0；原文要點：`✓ 2185 modules transformed.`、
    `✓ built in 3.66s`（Vite 保留既有 chunk size warning）。
