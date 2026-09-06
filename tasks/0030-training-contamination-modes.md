# 0030 訓練續：手部污染、教學／測驗模式、桶口與提示（M18）
model: 無新模型；../playground src/training/{flow,hints,snapshot,player,ui,main}.ts、style.css、scripts/training_test.ts、README    status: done（2026-09-06）
脈絡: M17 結案後使用者選「訓練續」，子項選污染狀態機＋教學／測驗模式＋桶口放寬與面板提示；語意選「手部污染＋換手套歸零」；模式選「教學高亮提示、測驗靜音只評分」；
     桶口選「袋足跡與桶口圓盤重疊」；架構選 A（狀態機內建＋hints 獨立模組）；成功標準「headless gate＋瀏覽器測驗模式走一遍」。
     設計文件 docs/superpowers/specs/2026-09-06-training-contamination-modes-design.md；計畫 docs/superpowers/plans/2026-09-06-training-contamination-modes.md。
分工: Claude 全做。
驗收: playground typecheck 零錯；training-test 24 項綠（新 10：hands-contaminate／cross-contamination／cross-order／glove-change／doff-clears-hands／mode／hint-steps／hint-idle／hint-contaminated／bin-overlap；golden 加 hands clean）；
     scene-test pass、parkour-test 0 FAIL。player-garden 部署 200，bundle 含 cross-contamination。
     瀏覽器：教學模式開始後立牌 5 mesh 全在 HighlightLayer、提示列「把警示立牌搬到潑灑點 1.5 m 內」（playground8-teach.png）。
     測驗模式（?mode=quiz 預設鈕 on）：API 佈置 1–3 步後，真人 canvas pointerdown/up 抓粉罐 → hands contaminated、無 toast；再抓處理包蓋 → errors [cross-contamination]、無 toast、
     錯誤區「測驗中：結束後揭露」、手部列紅、前臂材質 ppe-glove-dirty、附近物件出現「換手套（手部污染）」（playground8-quiz.png）；按下 → hands clean、toast「已換手套，手部乾淨」、材質回 ppe-glove。
     API 補 4–6：袋 body 傳送到 binTop+(0.2, 0.05, 0) 兩幀內 dispose；按脫除 → 總評「完成 02:17.5｜錯誤 1｜90 分」、錯誤區才列出（playground8-quiz-end.png）。
notes:
  - `.t-mode{display:inline-flex}` 作者樣式蓋掉 UA 的 `[hidden]{display:none}`，開始後模式鈕仍顯示；加 `.t-mode[hidden]{display:none}`。凡是自己設 display 的元素用 hidden 屬性都要補這條。
  - HighlightLayer blur 0.6 在遠處小物件上幾乎看不見，改 1.0；高亮重建鍵含目標模型 root.uniqueId，歸位換新 BuiltModel 自動重加。
  - 瀏覽器可用 `T.player.position.constructor` 取得 Vector3 類別（Vector3.Project 投影），`await import('/src/actions.ts')` 取 act；`__TRAINING__` 沒有 inter，封袋用面板按鈕。
  - 袋 dispose 在傳送的兩幀內就觸發，傳送後讀 AABB 已是 dispose 的無限值；要量偏移得在傳送前算。
  - 結束後「附近物件」仍列出已 dispose 的廢棄物袋「封袋」鈕（既有：at() 退回生成位置）；小修候選。
