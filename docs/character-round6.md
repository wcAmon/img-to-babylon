# 女性角色 yui 第 6 輪：generative-assist

設計：`docs/superpowers/specs/2026-09-14-yui-generative-assist-design.md`。本輪分三個計畫：A 參考圖與生成（本頁 A 段）、B GLB 匯入與貼圖、C 骨架動作與輕量物理。

## A. 參考圖前處理與基底 mesh 生成

- 參考圖：`reference/female_reference.png`，使用者提供的**全身**左／正／右三視圖，1672×941 RGB、灰色漸層背景（2026-09-14 14:45 取代舊的上半身 RGBA 圖）。切圖用逐列邊緣中位背景色遮罩（門檻 22，只掃前 85% 列避開地面陰影），欄範圍 244–448／663–977／1212–1417，`views.json` 的 `maskMode` 為 `color`。
- 全身延伸與臉部漂移 gate：**本輪未使用**。舊上半身路線（tomato 延伸＋漂移 gate，pass=false：headIoU 0.98、meanAbsDiff 13.5–13.7 > 6）證據保留在 `round6/c0/superseded-bust-route/`；`extend_views.py`、`face_drift_gate.py` 及其測試保留為工具。
- 使用者目視關卡：`round6/c0/figure-sheet.png`（三張全身切圖），使用者 14:54 同意，見 `figure-review.json`、`notes.md`。
- 付費生成（`pipeline/integrations/mesh3d/fal_generate.py`，seed 913）：Rodin `fal-ai/hyper3d/rodin` request `01a09eb6-072f-7fd2-a385-c82044e45ed4`（model.glb 13.8 MB，材質內嵌）；Tripo `tripo3d/tripo/v2.5/multiview-to-3d` request `01a09ebb-2b58-7a72-9cd7-59908216380a`（model.glb 5.4 MB＋preview.png）。Tripo 拒收 data URI，三張切圖改經 fal storage 上傳（未驗證的不可猜測 URL）；Tripo 另有兩次失敗嘗試（422 驗證錯誤，未產生輸出），是否計費待使用者查 fal 後台。來源紀錄 `round6/c0/provenance/{tripo,rodin}.json`。
- 候選比較：`round6/c0/candidates-sheet.png`、`candidates.json`。Tripo：1 mesh、1 material、0 個獨立貼圖檔（材質已烘進 GLB），bounds.size `[0.2018, 1.0001, 0.3763]`（公尺），triangleCount: not reported by probe。Rodin：1 mesh、1 material、0 個獨立貼圖檔，bounds.size `[1.1449, 1.9004, 0.4478]`（公尺），triangleCount: not reported by probe。viewer 以 Y-180° 節點包裹 GLB 參考且不落地校正；兩候選記錄的 azimuth offset（Tripo 90°、Rodin 180°）正是計畫 B 需要用來換算 GLB 前方朝向的依據。
- 選定：`round6/c0/selected.json`——端點 `tripo`（`.img2babylon/female-tactical/generative/tripo/model.glb`，sha256 `11df0be6fe8949ee7db05555408d73e218d52af7716cf9c3cface34e3483a142`），使用者 16:14「兩個都留 你先用tripo 走後續流程」；理由為 Tripo 臉部與衣著細節較佳。Rodin GLB（`.img2babylon/female-tactical/generative/rodin/model.glb`）保留為備選（T-pose），`alternates[0].keep = true`。
- 修正次數：本段不計修正，第 6 輪仍為 0/6。

## B、C 交接點

- 計畫 B 從 `.img2babylon/female-tactical/generative/selected.json` 指向的 GLB 開始（spec §4、§5）：切零件、減面、貼圖、nativeVertexData、viewer 顯示。
- 計畫 C 從計畫 B 的 15 個零件 mesh 開始（spec §6、§7）：SOMA 30 骨、權重、kimodo 動畫重定向、11 個 ANIMATED 剛體。
- 兩者各自另寫 `docs/superpowers/plans/2026-09-14-yui-r6b-*.md`、`...-r6c-*.md`，在計畫 A 完成後由本 session 以 writing-plans 產生。
