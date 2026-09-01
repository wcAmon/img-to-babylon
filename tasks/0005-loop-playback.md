# 0005 playground 動作循環播放
model: action-figure        status: done
症狀: 使用者要求：playground 播放動作要能重複循環（walk 原速 3 秒一下就播完，
     想持續觀察步態）。
驗收: 1. cd viewer && npx tsc --noEmit
     2. node --import tsx scripts/motion_timeline_test.ts 全綠（含新增循環行為測試）
     3. node --import tsx scripts/motion_suspension_test.ts 照舊綠（不准動它）
     4. 監工 playground 目視：循環開時播完自動從頭再播、不歸零不停；循環關時
        維持現行為（播完歸零停止）
notes:
  - MotionTimelinePlayer 新增可設定 loop；循環跨尾端時回到第 0 幀並保留 elapsed 餘量，關閉時維持播完停止。
  - playground 新增預設開啟的「循環：開/關」toggle；停止按鈕仍可隨時停止並歸零。
  - 驗收通過：tsc --noEmit、motion_timeline_test.ts（含 loop 開/關）、motion_suspension_test.ts。
- 監工驗收（2026-09-01 23:53）：tsc/timeline/suspension 測試綠；playground 目視
  原速 walk-timeline 播 8 秒仍在播（3 秒 clip 循環中）。卡標 done。
- 附帶事故：派工期間使用者開著 playground，vite HMR 推送半成品導致「選擇檔案」
  失效——陷阱記入 dispatch.md。
