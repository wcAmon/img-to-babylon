# 女性戰術角色：原生流程第 4 輪

已先完成本機 img2threejs 可用流程／核心的 Babylon 移植（`d6638a2`），再由 Codex CLI 接入同一個 `female-tactical` 角色。第 4 輪完成 6 次修正，累計 21 次；依使用者每輪上限停止，沒有新增第 7 次或自動開新輪。

角色維持 125 個零件 ID，現在為 29,776 三角形。修改涵蓋連續頭臉、依臉面定位的眉眼嘴唇、頭皮附著髮束與馬尾、寬站姿與腿身比例、貼合背心的裝備，以及靴型／交叉鞋帶。配方、編譯器、修正歷史、失敗圖片和逐項優化路徑都保存；仍為單一 55 kg Havok 複合剛體，尚未綁動畫骨架。

**外觀尚未驗收。** 固定視角輪廓 IoU 為 0.6103（門檻 0.85），比例／尺度診斷也未通過。臉部表情、服裝自然感與仿真度仍低於參考；背面是單圖推定。完整組件穿插驗收仍未通過，頭部自交抽樣另有 2 個未定點，鞋底與近似碰撞盒約差 1 mm。這些沒有被工程測試或人工評語改成通過。

- [參考圖與最終渲染對照](../viewer/models/female-tactical/evidence/round4-final/reference-comparison.png)
- [全身](../viewer/models/female-tactical/evidence/round4-final/round4-c6-hero.png)／[頭臉](../viewer/models/female-tactical/evidence/round4-final/round4-c6-face-plus.png)
- [完整圖片、來源雜湊與診斷紀錄](../viewer/models/female-tactical/evidence/round4-final/review.json)
- [持續迭代與優化路徑](../viewer/models/female-tactical/iteration.json)
- [CLI 交接與重建指令](../viewer/models/female-tactical/round4/c6/HANDOFF.md)
- [CLI 執行來源](migration/codex-cli-execution.json)

最終驗證：移植 Python 套件 1,130 項完成（38 項沿用原專案的可選依賴／runtime 略過），既有流程 134 項通過；TypeScript、建置、Havok 與原生零件隔離／展開還原／重建不變性檢查通過。11 個 585×1024 真實 WebGL2 視角與 alpha／normal 原始 PNG 已讀回，沒有瀏覽器錯誤，9 個凍結來源雜湊一致。所有角色材質無貼圖，故實際 beauty 圖也是移除貼圖後的證據，沒有合成替代圖片。

另在獨立暫存副本執行重建腳本，所有執行用零件、頂點、變換與材質資料雜湊一致；[重建證據](../viewer/models/female-tactical/evidence/round4-final/rebuild-check.json)。生成器去重使原生數據只寫入一次；以 c4 固定模型測得 TypeScript 16.3 MB → 4.2 MB。c6 生成檔約 5.2 MB，這不是 GPU 記憶體測量。

測試須從 `pipeline/` 執行 `python3.11 -m unittest discover -s forge/tests`；從倉庫根目錄直接指定 `pipeline/forge/tests` 會誤載入保留的舊 `forge` 同名套件。此次誤用目錄的失敗紀錄已保留，按文件目錄重跑通過。
