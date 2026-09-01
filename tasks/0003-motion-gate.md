# 0003 motion gate + playground 動作播放
model: action-figure        status: done
症狀: 0002 產出的 timeline JSON 還沒有任何播放與驗證能力——需要 motion gate
     證明「時間線餵給伺服馬達後，物理實角真的追蹤目標」，以及 playground 播放 UI。
驗收: 1. python3 forge/tests/make_fixture_glb.py /tmp/mini_walk.glb &&
        python3 forge/retarget.py /tmp/mini_walk.glb --spec viewer/models/action-figure/spec.json --out /tmp/timeline.json &&
        cd viewer && npx tsx scripts/motion_test.ts action-figure --spec models/action-figure/spec.json --timeline /tmp/timeline.json
        整體 pass=true（吊空播放；逐幀追蹤斷言見下）
     2. cd viewer && npx tsc --noEmit
     3. 既有 gate 全綠：actuation_test 兩模型、physics_test --roll / --ragdoll
     4. playground（人工目視，監工做）：面板可載入 timeline JSON、播放/停止
gate 準則（監工定，Codex 不得放寬）:
     - 吊空同 servo gate（anchor STATIC、lift 0.3）；先 120 steps settle
     - fps→物理步（60Hz）換算逐幀把 track 值餵 servo actuator set()
     - 每幀結束量 XZY 實角：|實角-目標| ≤ 0.35 rad 需在 ≥90% 取樣幀成立
       （前 30 步豁免暖機）
     - 全程無 NaN、constraint 不裂；timeline model/tracks 鍵驗證不合直接 FAIL
notes:
  - 實作 `viewer/scripts/motion_test.ts`：依 spec 產生合法 servo id 集合並先驗 timeline
    model / fps / frames / track id / 等長有限數值；不合輸出 `pass:false` JSON 並 exit 1。
    headless 場景採 action gate 同款 lift 0.3m、STATIC anchor、120 steps settle，播放以
    60/fps 誤差累積取整；前 30 個播放物理步豁免。lift、settle、播放各物理步皆檢查
    body position/quaternion finite 與 constraint 數不變，幀尾沿用 XZY 分解量實角。
  - 指定 fixture 驗收（sandbox 依指示以 `node --import tsx` 代 `npx tsx`）：motion
    `pass=true`，20fps / 21 frames / 63 physics steps；19 軌各 11 個暖機後取樣，
    19/19 軌命中率 100%（門檻 90%，容差 0.35rad），finite=true，constraints 9→9。
  - 追蹤誤差分佈：各軌 p90 範圍 2.99e-17～0.1101rad；全軌最差單點為
    `servo:upper-arm-l.x` 0.1289rad，仍低於 0.35rad。JSON 每軌另含 min/p50/p90/max、
    samples、withinTolerance、ratio，便於監工查分佈。
  - playground actuator panel 沿用 `.actuator-row` / `.reset`：新增「載入動作」file
    input、狀態/錯誤文字與「播放/停止」。載入時驗 model 與 factory servo track id；
    render observable 依 fps 累積 delta、逐幀 set（掉幀會依序補幀），停止、播完、重設
    均對全部 servo `set(0)` 並同步滑桿歸零；壞 JSON/契約錯誤只顯示、不炸 scene。
  - 新增共用 `motionTimeline.ts` 與契約/時鐘測試；最終 fresh verification：timeline
    tests pass、`npx tsc --noEmit` pass、Vite build pass。既有 gates 皆 pass：
    actuation action-figure、actuation toy-racer、physics toy-racer `--roll chassis`、
    physics action-figure `--ragdoll`。（Vite 僅有既存 large-chunk warning。）
- 監工目視（2026-09-01 23:19）：真實 kimodo walk 時間線在 playground 地面播放，
  四肢確有動作但公仔立即癱倒（伺服 0.02 N·m 撐不住站立，M4 doctrine 預期內）。
  gate 吊空全綠。缺口：playground 需要「吊空播放」開關才能目視動作 → 第二輪。
- 第二輪：playground motion 區塊新增 `.reset` 樣式「吊空：開／關」toggle；切換前一律
  停止播放並歸零 servo。共用 `MotionSuspension` 從 `model.bodies` 依 runtime mass 選最大
  body 當 anchor，不硬編 body id；開啟時相對載入原位 lift 0.3m 並設 STATIC，關閉及
  scene dispose 時恢復 DYNAMIC 與原位置，重複開啟不累加高度。新增 controller 測試覆蓋
  最大質量選擇、lift、關閉與 dispose 還原；fresh `node --import tsx` 測試及
  `npx tsc --noEmit` 均通過。status 保持 dispatched。
- 監工目視第二輪（2026-09-01 23:24）：吊空開啟後軀幹 mesh 升空但四肢癱在原地
  （.img2babylon/shots/figure-walk-hang-a.png）——只動了 transformNode，物理 body
  沒同步（Babylon disablePreStep 陷阱），motion_suspension_test 只斷言 motionType
  所以沒抓到。→ 第三輪。
- 第三輪：`MotionSuspension` 改為比照 `motion_test.ts`，切換時對模型所有 body 暫時
  設 `disablePreStep=false`，移動 root 後經兩個 physics step 再恢復，開啟同步完成後才將
  最大質量 anchor 設 STATIC；關閉則先恢復 DYNAMIC，再以相同機制同步回載入原位。
  `motion_suspension_test` 改用 action-figure + Havok + 實體地面：先確認舊實作會以 head
  距 anchor 0.269m 紅燈，再驗開啟 60 步後 anchor y>0.15、每個非 anchor body 距離
  <0.11m，關閉 120 步後 anchor 為 DYNAMIC 且最高 body y 低於吊空 anchor y。fresh
  `npx tsc --noEmit && node --import tsx scripts/motion_suspension_test.ts` exit 0；status 不動。
- 監工診斷第三輪（2026-09-01 23:31，__IMG2BABYLON_DEBUG__ 活體數據）：吊空機制
  本身正確（root+0.3、全 body 同步、torso STATIC 其餘 DYNAMIC 連體）。真因：
  ragdoll 公仔出生後本來就站不住（toggle 前所有 body y≈0.01 已癱地），吊空只是
  冷凍癱姿。headless gate 綠是因為出生瞬間就吊。→ 第四輪：吊空先回復出廠姿勢。
- 第四輪：`MotionSuspension` 建構時逐 body 保存 transformNode 初始局部 position 與
  rotationQuaternion；enable 的 `disablePreStep=false` 同步窗口內先抬 root，再逐 body
  還原出廠 transform 並清零 linear/angular velocity，兩步同步完成後才把 anchor 設為
  STATIC。disable 維持原路徑，不回復出廠姿勢。`motion_suspension_test` 先記錄出廠
  相對位置，再自由落體 180 步並注入確定性速度/局部位移擾動；驗 enable 即時局部
  transform 還原、步進後 anchor 在空中，且每個 body 相對 anchor 偏差 <0.1m，並保留
  disable 後自然落地斷言。TDD 舊碼先於 torso 局部位置斷言紅燈；fresh
  `npx tsc --noEmit && node --import tsx scripts/motion_suspension_test.ts` exit 0。status 不動。
- 監工終驗（2026-09-01 23:37）：四輪完成。fixture gate 綠、真實 kimodo walk 時間線
  （--rebase first-frame 後）gate 綠、tsc/迴歸全綠；playground 目視——癱倒後開吊空
  回復出廠站姿懸空，播放 walk 抓到中格（.img2babylon/shots/walk-mid-1.png：
  calf-l.x 0.65 左膝彎、thigh-r.x -0.73 右腿後擺）。卡標 done。
