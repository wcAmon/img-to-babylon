# 0026 playground 跨模型互動（M14）
model: （無新模型；../playground src/interactions.ts、src/ui.ts、index.html、scripts/scene_test.ts）    status: done（2026-09-05）
脈絡: 使用者 2026-09-05 選 docs/next-steps.md 第 1 項「跨模型互動」；核准三條規則（顆粒×水漬、顆粒×液滴、噴霧×水漬）、grimoire 不動。
     設計文件 docs/superpowers/specs/2026-09-05-playground-cross-model-interactions-design.md；計畫 docs/superpowers/plans/2026-09-05-playground-cross-model-interactions.md。
分工: Claude 全做。
驗收: playground `npm run typecheck` 綠；`npm run scene-test` 31/31（既有 28＋interact:absorb／absorb-droplet／disinfect）；
     tailnet https://monkeyday.tail8e3f79.ts.net/ 200、`.card .status` 樣式上線；playwright 實測：摔落→破裂→抓粉罐開蓋傾倒 40 顆全凝固、水漬 35%；
     抓噴瓶下壓噴灑 60 滴全吸收、消毒 100%、水漬色 (0.72, 0.82, 0.86)。證據 .img2babylon/shots/playground5-{absorb,disinfect}.png。
notes:
  - 判定用原始足跡（radius0 × maxScale），可見縮放另算；`boundingBox.extendSize` 是未縮放局部半徑，`extendSizeWorld` 會跟著縮不能用。
  - 「落地」以中心高度判定（顆粒 ≤ 0.012、噴霧 ≤ 0.010）：疊在袋上、顆粒上都不算。gate 佈點：顆粒三環 r 0.05／0.09／0.13；噴霧兩環 r 0.11／0.15 錯開半角步、避開中央塌扁的袋（0.14×0.19）。
  - 液滴 dispose 走 collect 同路徑（body＋transformNode），模型之後 dispose 有守衛；面板總重不變（質量早在噴出時轉移）。
  - 掛載點在 `installUi`（chemo.ts 是另一 session 未追蹤檔，不可動）；另一 session 提交後可搬。
  - 瀏覽器實測噴瓶要抓起並繞水平右軸下壓約 0.5 rad 才噴得到地面水漬（噴口水平 +z）；用 `__PLAYGROUND_GRAB__` 演示可行，人手操作靠 Q／E。
  - 只 commit 上列四檔；README 加一句留在工作區未提交（含另一 session 段落）；`npm run serve` 連同 parkour 場景上線。
