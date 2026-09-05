# 下一步（2026-09-06 M16 結案後）

狀態：M10–M12（十件物件＋pour／collect 契約）、M13（抓取抬高＋傾斜）、M14／M15（跨模型互動）、M16（訓練場景：玩家走站＋七步流程檢核評分）皆結案。
上線 https://monkeyday.tail8e3f79.ts.net/playground/ （player-garden 統包，首頁預設訓練場景；`?scene=chemo` 沙盒、`?scene=parkour` 跑酷）。
ROADMAP M16、tasks/0028、設計文件 `superpowers/specs/2026-09-06-playground-training-scene-design.md`（§12 実測補記）。

## 候選（等使用者選，依價值排序）

1. **鏟刮板真的鏟得起顆粒（契約側）**：目前鏟底碰撞盒離地約 4 mm、前唇無斜角，直徑 12 mm 的凝固顆粒被推著走或從底下鑽過；顆粒 `isPickable=false` 也不能直接抓。
   選項：(a) 鏟斗 collider 底面貼地＋前唇做斜面（ExtrudeShape 梯形）；(b) 顆粒改可 pick（playground 側 `installGrab` 允許抓 grain）；(c) 兩者都做。
   這是訓練第六步唯一還靠 API 的地方，做完七步才算真人可完整走通。gate：真物理沿走廊掃 ≥ 5 顆入斗。
2. **訓練續**：污染狀態機（污染的手碰非廢棄物物件記錯、脫手套歸零）；教學／測驗模式（提示高亮 vs 無提示計分）；膠囊撞飛小物件（strength 30 仍把吸附墊撞到牆邊
   → 物件 membership 與膠囊不碰、或走路時對小物件降速）；觸控（虛擬搖桿＋抓取）。
3. **第四批物件**：N95／呼吸防護口罩、鞋套（PPE 補齊＋穿脫順序考點）、破裂藥瓶＋玻璃碎片＋尖銳物盒（第二種潑灑源、鏟刮板非替代用途）、洗眼瓶、紀錄表。
4. **Divine Eye 工具側改善**（Parked）：白主體淺灰地板遮罩退化、多物件構圖只量最大連通塊、相機取景差 IoU 偏低 → `--multi` 聯集 bbox 或正規化縮放。先用 M10–M12 全部 hero 做回歸表。
5. **小修**：立牌收合倒平後可再翻起；`installInteractions` 掛載點從沙盒 ui.ts 搬到 chemo.ts（現已在版控，可改）；訓練面板 toast 記錯文案用 ERROR_LABELS（已做）；
   跑酷段鏡頭同樣用 `target =` setter（相機原地不動只轉頭），要不要改跟隨由另一 session 決定。

## 執行提醒

- 每個新模型：`next_pass.py init --force` 一次只屬一個模型，兩模型命令不可並行。
- hinge 角 0 必須是出廠姿勢；pivot 旋轉的兩 body 用 `createHinge(..., { restOffset })`。
- 曲面文字用 `CreateRibbon`；朝上 plane 文字方向依觀看方位翻轉；平鋪 DynamicTexture 設 WRAP；貼在牆面的印字用透明底只印字。
- check_colliders 同 body collider 重疊以 AABB 計；旋轉 collider 以 Quaternion 加進 container。
- 生成物 `collide ~2`：容器類模型用 `membership 8 / collide ~0`。粉罐與噴瓶的生成物 key 都是 `grain-<i>`，playground 靠 `entry.model` 分辨。
- Babylon 四元數：`R.multiply(cur)` 是世界軸旋轉；速度伺服抓球體容器要 P＋I 姿態控制、搬運前後仰。
- **ArcRotateCamera `target =` 是 setter**：從目前位置重算 alpha／beta／radius，相機不會跟著走、程式設的 alpha 每幀被覆寫；跟隨鏡頭用 `Vector3.LerpToRef(camera.target, …, camera.target)` 就地改。
- 互動判定用原始足跡；「落地」用中心高度，疊在別的物件上不算。訓練快照的 hinge 讀取器要在任何 servo 命令前建（記綁定姿勢）。
- 瀏覽器演真實輸入層：合成 `pointermove` 帶 `button: -1`；抓低處物件先滾輪抬高；`lift` 夾 y ≥ 0（等 y < 0 會卡死）；從上方 pick 粉罐會抓到蓋子，抓後驗 `G.body`；
  子節點 body 的測試 teleport 用 `setAbsolutePosition`。長 evaluate 迴圈一律設上限，卡住時用另一個 evaluate 換掉 helper 讓它 throw。
- 部署：`cd ../player-garden && bash scripts/serve.sh`（playground 以 `--base=/playground/` build 到 `dist-sub/`）；playground 自己的 `npm run serve` 已退役。
- 截圖：viewer dev server 5173、playground 5175（背景 run_in_background；結束 `pkill -f "vite.*5175"`）；playwright 截圖落在 img-to-babylon 根，搬 `.img2babylon/shots/`。
- 改 playground 後 `npm run typecheck && npm run scene-test && npm run parkour-test && npm run training-test`；commit 前看 `git status`，只 add 自己的檔。
