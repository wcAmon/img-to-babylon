# 下一步（2026-09-05 M11 結案後）

狀態：M10（三物件＋playground）、M11（四物件＋pour 契約＋桶耳把）皆結案，img-to-babylon main 至 548fe8d、
playground 至 aefaa9a，七件已上線 https://monkeyday.tail8e3f79.ts.net/ 。ROADMAP M11、tasks/0023、
設計文件 `superpowers/specs/2026-09-05-chemo-spill-set-2-design.md`、計畫 `superpowers/plans/2026-09-05-chemo-spill-set-2.md`。

## 候選（等使用者選，依價值排序）

1. **第三批物件**（同六步流程，走 brainstorming → spec → plan）：
   - 消毒劑噴瓶（扳機式：hinge servo 扳機＋噴霧＝短暫液滴生成，可沿用 pour 契約加 `gate` 為扳機角）。
   - 細胞毒性廢棄物袋（軟袋近似：可裝入顆粒／液滴的開口容器，需「容器收納」偵測——新契約候選）。
   - 鏟刮板（單 body，playground 用來把顆粒推進袋子：抓取拖曳既有）。
2. **跨模型互動**：粉罐顆粒落在點滴袋水漬上 → 水漬縮小／顆粒變色（凝固）。需要 playground 層的「水漬 × 顆粒」查詢，
   契約側不動（純 playground 邏輯）；設計時決定要不要進 grimoire。
3. **Divine Eye 工具側改善**（ROADMAP Parked 候選）：
   - 白主體配淺灰地板時前景遮罩退化（shaker 42% 前景不在主連通塊）→ 遮罩改用相對地板色差或邊緣密度。
   - 多物件構圖只量最大連通塊（ppe-set 54% 在外）→ 允許 `--multi` 以全部連通塊聯集 bbox 比對。
   - 兩者都是 forge/divine_eye.py（stdlib）的量測邏輯，改動前先用 M10／M11 全部 hero 做回歸表。
4. **playground UX**：手機觸控抓取（grab.ts 目前 pointer 事件通用，但相機與抓取的手勢衝突未調）；
   側欄七張卡片在窄螢幕會遮住場景，考慮可收合。
5. **小修**：立牌收合後倒平時兩板可再「展開」在地上翻起（物理正確但觀感怪）→ 可在 playground「展開」前先歸位；
   粉罐 physics_test 若未來改門檻或 COM 要重跑 pour_test 的 A/B/C。

## 執行提醒

- 每個新模型：`next_pass.py init --force` 一次只屬一個模型，兩模型命令不可並行。
- hinge 角 0 必須是出廠姿勢；pivot 旋轉的兩 body 用 `createHinge(..., { restOffset })`。
- 曲面文字用 `CreateRibbon`；朝上 plane 文字方向依觀看方位翻轉；平鋪 DynamicTexture 設 WRAP。
- check_colliders 同 body collider 重疊以 AABB 計，附加件要落在主 collider AABB 外。
- 截圖：viewer dev server 5173 已可能在跑；hash 換模型要 `location.reload()`；capture JSON 落在 repo 根，
  用 scratchpad `decode.py` 解碼後搬 `.img2babylon/shots/`（scratchpad 換 session 會清空，6 行可重建）。
- 改 playground 後 `cd ../playground && npm run scene-test && npm run serve` 重部署。
