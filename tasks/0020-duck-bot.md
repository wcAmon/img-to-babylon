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

  Codex（2026-09-04，headless 執行，依三輪紅線停手）：
  - pass 狀態：`init --model duck-bot --force` exit 0；blockout、structure、material 已各跑驗證並 `done`，共完成
    **3/5 passes**；目前停在 physics（`correctionsThisPass: 2`, `totalCorrections: 2`），未執行 physics `done`、polish
    或瀏覽器第 5d 步，status 未改。
  - spec gate：模板初始 RED 為 `FAIL: strict: macro 元件 main 缺少 material`（exit 2）；完成 spec 後
    `python3 forge/validate_spec.py viewer/models/duck-bot/spec.json --strict` 原文 `OK`（exit 0）。7 bodies、6 個
    `type:"joint"` constraints、12 個非 locked 軸，質量總和 0.138 kg；尺寸、質量、angular limits、servo id 均照卡。
  - TypeScript：blockout／structure／material／physics 每輪 `cd viewer && npx tsc --noEmit` 均 exit 0、無輸出。
  - runtime/collider：指定的 `npx tsx scripts/runtime_export.ts ...` 在腳本執行前被沙盒拒絕 Unix socket，系統 TMP 與
    `/tmp` 兩次皆 exit 1，原文核心為 `Error: listen EPERM: operation not permitted .../tsx-501/*.pipe`；為區分模型問題，
    等價 loader 診斷 `node --import tsx scripts/runtime_export.ts duck-bot ...` exit 0，原文
    `{"out":"../.img2babylon/duck-bot/runtime.json","meshes":15,"bodies":7}`；其後
    `python3 forge/check_colliders.py .img2babylon/duck-bot/runtime.json` 原文 `OK`（exit 0）。指定 npx gate 因沙盒
    launcher 尚未取得 exit 0，不能列為正式通過。
  - collider 密度（runtime mass ÷ spec collider volume；kg/m³）：

    | body id | mass kg | collider volume m³ | density kg/m³ | gate [50,3000] |
    |---|---:|---:|---:|---|
    | body | 0.060 | 0.000113097 | 530.5（卡片四捨五入 531） | in range |
    | thigh-l / thigh-r | 0.012 each | 0.000007920 each | 1515.2（卡片 1515） | in range |
    | shank-l / shank-r | 0.012 each | 0.000005500 each | 2181.8（卡片 2182） | in range |
    | foot-l / foot-r | 0.015 each | 0.000006720 each | 2232.1（卡片 2232） | in range |

  - actuation：最終 `node --import tsx scripts/actuation_test.ts duck-bot --spec models/duck-bot/spec.json` exit 0，
    JSON `"pass": true`；coverage 原文為 thigh-l `3 軸`、thigh-r `3 軸`、shank-l `1 軸`、shank-r `1 軸`、
    foot-l `2 軸`、foot-r `2 軸`，合計 12 軸全 `ok:true`。實測方向／數值如下（+X 依本 repo 左手座標，
    `+Y→+Z`；髖 x 負＝前屈、膝 x 正＝屈）：

    | servo id | 命令→實測 rad | 實際方向 |
    |---|---:|---|
    | servo:thigh-l.x | −0.960→−0.950 | −X，左髖前屈（腿往 +Z） |
    | servo:thigh-l.y | +0.300→+0.316 | +Y，左腿正向扭轉 |
    | servo:thigh-l.z | +0.480→+0.480 | +Z，左腿下端往 +X（外展） |
    | servo:thigh-r.x | −0.960→−0.920 | −X，右髖前屈（腿往 +Z） |
    | servo:thigh-r.y | +0.300→+0.278 | +Y，右腿正向扭轉 |
    | servo:thigh-r.z | +0.480→+0.480 | +Z，右腿下端往 +X（內收） |
    | servo:shank-l.x | +1.200→+1.193 | +X，左膝屈（腳往 −Z） |
    | servo:shank-r.x | +1.200→+1.192 | +X，右膝屈（腳往 −Z） |
    | servo:foot-l.x | +0.360→+0.360 | +X，左腳趾往 −Y（蹠屈） |
    | servo:foot-l.y | +0.240→+0.240 | +Y，左腳趾往 +X（外轉） |
    | servo:foot-r.x | +0.360→+0.360 | +X，右腳趾往 −Y（蹠屈） |
    | servo:foot-r.y | +0.240→+0.240 | +Y，右腳趾往 +X（內轉） |

  - actuation 根因與判斷：第一次 physics 實作後兩個 foot.x 都 `量測 -0.240 vs 目標 0.360`。腳中心依硬約束
    前移 +0.010 z，未 armed 時重力令腳懸垂到 x≈+0.600；gate 以該姿勢取 bind，馬達回 +0.360 因而量到
    0.360−0.600=−0.240。保留尺寸、質量、pivot、限位與 servo id，只把兩腳 `centerOfMass` 設為
    `[0,0,-0.01]`（踝的 z 投影）後，foot.x/y 與其餘 10 軸全通過。
  - ragdoll 三輪 RED，故停手：第 1 輪是 TDD 基線（factory 尚無 bodies，6 條皆 `找不到 body`，exit 1）；第 2 輪
    加入 physics 後 collapsed/finite/constraint separation 均通過，但 foot-r locked-z `-0.2091` 超過 ±0.15；
    第 3 輪在上述 foot COM z 修正後仍 exit 1、JSON `"pass": false`，原文要點：standHeight 1.815、
    finalHeight 0.9292（<60%，`collapsed:true`）、7 bodies 全 `finite:true`、6 constraints 全 `ok:true`
    （最大 separation 0.00220 < 0.005×physicsScale），但 foot-l z `-0.2397`、foot-r z `-0.1693` 使兩踝
    `ok:false`。另以第二次 correction 試把 COM y 也移到踝 pivot，z 為 `-0.2412/-0.1886`，未改善，已回復該
    無效實驗。機制判斷：長前伸腳在落地碰撞時對多軸踝產生 roll impulse，Havok 6DoF locked-z 柔性超過 gate
    0.15 rad；不是 NaN、constraint 裂開、collapse 失敗或 servo coverage 問題。依「同一 gate 三輪紅」紅線不做
    第四個 physics 修正。
  - 因上述停手條件，收尾的 forge unittest 與 action-figure physics/actuation 回歸 gate **未跑**，不可宣稱全卡驗收
    或 headless gate 完成；現況是可編譯、strict spec／collider 診斷／12 軸 actuation 已綠，ragdoll 與指定 npx
    runtime launcher 未綠。
