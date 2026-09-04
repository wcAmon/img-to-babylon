# 0020 duck-bot：鴨型長腿雙足機器人（姊妹 repo image-to-physics M3 題材，契約側）
model: duck-bot        status: in-progress（2026-09-04 開卡）
脈絡: image-to-physics 目標改向（使用者 2026-09-04）：遙控雙足機器人——鴨子型態、腳很長，之後要走、轉、跑、跳。
     設計文件 `../image-to-physics/docs/superpowers/specs/2026-09-04-duck-bot-biped-design.md` §3。
     本卡只做題材與契約：圖片 → spec → factory → 三層 gate；控制律與站立／抗推 gate 在姊妹 repo（P0009）。
     質量契約由監工用倒單擺探針算定（姊妹 repo P0008 notes）：**長腿把重力力矩拉到 84 N·m，但 0.40 長的大腳
     讓單擺在腳 0.010–0.020 kg·S³ 都撐得直——腳的支撐長度比腳質量關鍵**。本卡的比例與質量是硬約束，圖片
     只決定外觀（顏色、嘴、翅膀、眼睛）；Divine Eye 相似度可以低，物理優先。
參考圖: 監工已用 tomato 生成並挑選 `.img2babylon/duck-bot/hero.png`（prompt／seed 記 notes）；Codex 沙盒無網路，
     不必再生圖；需要側／背視角時跳過（用 hero 一張），不得呼叫 tomato。
身體計畫（硬約束，spec 依圖只微調外觀）:
  剛體 7：`body`（軀幹含頭、嘴、翅膀、眼睛一體，視覺子件多個，collider 球＋小件可省）、`thigh-l/r`、`shank-l/r`、
  `foot-l/r`。座標 up y、forward z、單位 m，spec 尺度（factory physicsScale 10 沿用 action-figure 作法）。
  | body | 幾何（spec 公尺） | mass kg | 密度 kg/m³ |
  |---|---|---|---|
  | body | 球 r 0.03（中心 y ≈ 0.147），頭／嘴／翅為視覺子件 | 0.060 | 531 |
  | thigh-l/r | 盒 0.012×0.055×0.012，x = ±0.018 | 0.012 | 1515 |
  | shank-l/r | 盒 0.010×0.055×0.010 | 0.012 | 2182 |
  | foot-l/r | 盒 0.024（寬）×0.007（高）×0.040（長），腳中心比踝前移 +0.010 z（腳趾朝前） | 0.015 | 2232 |
  總質量 0.138。關節質量比：踝（總−腳）/腳 = 8.2、膝 4.1、髖 2.5（全部 ≤ 10:1）。出廠站姿：腿伸直、腳底貼 y=0，
  腿長 0.11（大腿＋小腿）≈ 軀幹高 0.06 的 1.8 倍；兩腳中心 x = ±0.018。
  關節 10（`type:"joint"`，全部 `actuation: {type:"servo", maxForce: 0.02}`，共 12 軸伺服；axis [1,0,0]，
  正負號慣例同 action-figure：x 負＝髖前屈、膝 x 正＝屈）：
  | 關節 | bodyA→bodyB | angular |
  |---|---|---|
  | hip-l/r | body→thigh | x [−1.6, 0.8]、y [−0.5, 0.5]、z [−0.8, 0.8]（z＝轉向，M4 要用） |
  | knee-l/r | thigh→shank | x [0, 2.0]、y locked、z locked |
  | ankle-l/r | shank→foot | x [−0.6, 0.6]、y [−0.4, 0.4]、z locked |
  servo id 慣例同 action-figure（`servo:<bodyB>.<axis>`）：`servo:thigh-l.x/.y/.z`、`servo:shank-l.x`、
  `servo:foot-l.x/.y`（姊妹 repo `rigs/bipedRig.ts` 的 duckBotRig 已照此命名，不可改）。
  factory `balance` 區塊照抄 action-figure（增益值一樣，id 換名：supportBodyIds `["foot-l","foot-r"]`；pitch
  servos foot.x／thigh.x／shank.x；roll servos foot.y／thigh.y；feedforward 同構），`factoryPose` 照出。
  `proportions`：head_component 用 body 的視覺頭子件 `head`（head_unit ≈ 0.02、total_heads ≈ 9、tolerance 0.3）。
要做（SKILL.md 六步，從第 0 步 init 開始；`next_pass.py init --model duck-bot --force`）:
  1. spec `viewer/models/duck-bot/spec.json`（`forge/new_spec.py` 模板起）→ `validate_spec --strict` 綠。
  2. factory `viewer/models/duck-bot/createDuckBotModel.ts`＋`viewer/src/registry.ts` 註冊 `"duck-bot"`；
     `physicsScale` 預設 10、`L()`／massScale／servoForce 換算與 action-figure 同構；`balance`、`factoryPose`、
     `actuators` 同介面。
  3. 每 pass：tsc、runtime_export → check_colliders（密度 [50,3000]）、physics_test --ragdoll（傾斜落下：關節角在
     限位內、身高 < 站高 60%、constraint 不裂、無 NaN）、actuation_test（12 軸 coverage 全 ok，量各軸實際轉
     什麼——0014 教訓）。瀏覽器截圖／Divine Eye 由監工做（Codex 無瀏覽器工具），Codex 跑完 headless gate 即停。
  4. `grimoire` 若需新契約條（例：多視覺子件合一 body）才動，否則不動；ROADMAP 記 0020 由監工寫。
驗收（全部跑、結果原文要點寫進 notes）:
  1. cd viewer && npx tsc --noEmit；validate_spec --strict 原文 OK
  2. check_colliders OK；physics_test duck-bot --spec 全 pass；actuation_test duck-bot 12 軸全 ok
  3. forge unittest 全綠；既有模型 gate 不受影響（action-figure physics_test／actuation_test 仍綠）
  4. 監工：playwright 截圖 hero／碰撞線框 → compare → Divine Eye；姊妹 repo rig_test 對 duck-bot 綠、記依賴 commit。
紅線: 不得改身體計畫的質量／尺寸比例／關節軸數與限位／servo id（外觀子件自由）；不得改 gate 門檻；不得動既有
     模型；不得 git add/commit；不得呼叫 tomato；臨時檔用完刪；notes 寫卡、status 不動；用 node --import tsx。
     三輪紅 → 寫清機制停手。
notes:
  監工（2026-09-04）參考圖：tomato 五個 seed，前三個（20260904–06，16:9 prompt「very long thin mechanical bird legs」）
  腿都太短；改 9:16 直式構圖＋「extremely long stilt-like legs, legs are twice as tall as the round duck body」
  （seed 20260907／20260908）才長。選 **20260907** 為 `.img2babylon/duck-bot/hero.png`。Prompt 原文：
  `cute toy robot duck standing on extremely long stilt-like mechanical bird legs, legs are twice as tall as the round duck body, thin chrome legs with visible knee joints, huge flat orange webbed feet, small round body with tiny fused head and orange beak, full body from head to feet, tall vertical composition, matte plastic toy, soft studio lighting, plain light gray background, no text`
  （`--aspect 9:16 --seed 20260907`）。圖中大腿短、小腿長；spec 依身體計畫仍取大腿＝小腿 0.055（硬約束），外觀
  鉻銀腿、橘色蹼腳、黃色球身＋球頭＋橘嘴＋翅膀貼片。
