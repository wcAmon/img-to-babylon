# 下一步（2026-09-05 M13 結案後）

狀態：M10（三物件＋playground）、M11（四物件＋pour 契約＋桶耳把）、M12（三物件＋pour 擴充＋collect 契約）、
M13（playground 抓取抬高＋傾斜，粉罐→鏟→袋→封袋全流程實測）皆結案，十件已上線 https://monkeyday.tail8e3f79.ts.net/ 。
ROADMAP M13、tasks/0025、設計文件 `superpowers/specs/2026-09-05-playground-grab-lift-design.md`、計畫 `superpowers/plans/2026-09-05-playground-grab-lift.md`。

## 候選（等使用者選，依價值排序）

1. **跨模型互動**：粉罐顆粒落在點滴袋水漬上 → 水漬縮小／顆粒變色（凝固）；噴瓶液滴落在水漬上 → 水漬變色（消毒）。
   純 playground 邏輯（水漬 × 生成物查詢），契約側不動；設計時決定要不要進 grimoire。
2. **第四批物件（若還要）**：廢棄物袋投入廢棄物桶（袋 0.30×0.36 vs 桶口 0.30——尺寸關係要先定）、
   潑灑處理紀錄表／筆（純視覺）、洗眼瓶（pour 沿 +y 上噴、gate 為瓶蓋）。
3. **Divine Eye 工具側改善**（ROADMAP Parked 候選）：白主體配淺灰地板遮罩退化（shaker）、多物件構圖只量最大連通塊（ppe／鏟刮板 30% 在外）、
   相機取景差造成 bbox IoU 偏低（噴瓶 0.53）→ 允許 `--multi` 聯集 bbox、或先以參考圖主體 bbox 正規化縮放再比。改動前先用 M10–M12 全部 hero 做回歸表。
4. **抓取 UX 續**：觸控（雙指上下＝高度、旋轉手勢＝傾斜）；抓取中 HUD 顯示被抓物與高度；推板把地上顆粒推進鏟的實測。
5. **小修**：立牌收合後倒平時兩板可再「展開」翻起 → playground「展開」前先歸位；playground README（十件說明＋M13 操作）與另一 session 的跑酷段落一併 commit。

## 執行提醒

- 每個新模型：`next_pass.py init --force` 一次只屬一個模型，兩模型命令不可並行。
- hinge 角 0 必須是出廠姿勢；pivot 旋轉的兩 body 用 `createHinge(..., { restOffset })`。
- 曲面文字用 `CreateRibbon`；朝上 plane 文字方向依觀看方位翻轉；平鋪 DynamicTexture 設 WRAP；貼在牆面的印字用透明底（hasAlpha）只印字。
- check_colliders 同 body collider 重疊以 AABB 計，相鄰 collider 齊平不重疊；旋轉 collider 以 Quaternion 加進 container，AABB 自動算。
- 生成物 `collide ~2`：容器類模型（無活動件）用 `membership 8 / collide ~0`。
- Babylon 四元數：`R.multiply(cur)` 是世界軸旋轉、`cur.multiply(R)` 是局部軸（同 TransformNode.rotate）；速度伺服抓球體容器要 P＋I 姿態控制、搬運前後仰。
- 截圖：viewer dev server 5173、playground 5175（背景執行要用 run_in_background，否則 Bash 結束就被收掉）；換模型用 `?v=N#model=…` 強制重載；
  playwright `browser_evaluate` 的 `filename` 結果落在 repo 根，解碼後搬 `.img2babylon/shots/`。
- python 批次替換：任一 assert 失敗整檔不寫，先核對每條樣式再跑；Bash 的 cwd 每次呼叫都重設回 img-to-babylon，跨 repo 命令要明確 cd。
- 改 playground 後 `cd ../playground && npm run scene-test && npm run serve` 重部署；commit 前看 `git status`，只 add 自己的檔，別把別的 session 的改動掃進來。
