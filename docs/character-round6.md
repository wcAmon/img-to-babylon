# 女性角色 yui 第 6 輪：generative-assist

設計：`docs/superpowers/specs/2026-09-14-yui-generative-assist-design.md`。本輪分三個計畫：A 參考圖與生成（本頁 A 段）、B GLB 匯入與貼圖、C 骨架動作與輕量物理。

## A. 參考圖前處理與基底 mesh 生成

- 參考圖：`reference/female_reference.png`，使用者提供的**全身**左／正／右三視圖，1672×941 RGB、灰色漸層背景（2026-09-14 14:45 取代舊的上半身 RGBA 圖）。切圖用逐列邊緣中位背景色遮罩（門檻 22，只掃前 85% 列避開地面陰影），欄範圍 244–448／663–978／1210–1417，`views.json` 的 `maskMode` 為 `color`。
- 全身延伸與臉部漂移 gate：**本輪未使用**。舊上半身路線（tomato 延伸＋漂移 gate，pass=false：headIoU 0.98、meanAbsDiff 13.5–13.7 > 6）證據保留在 `round6/c0/superseded-bust-route/`；`extend_views.py`、`face_drift_gate.py` 及其測試保留為工具。
- 使用者目視關卡：`round6/c0/figure-sheet.png`（三張全身切圖），使用者 14:54 同意，見 `figure-review.json`、`notes.md`。
- 付費生成（`pipeline/integrations/mesh3d/fal_generate.py`，seed 913）：Rodin `fal-ai/hyper3d/rodin` request `01a09eb6-072f-7fd2-a385-c82044e45ed4`（model.glb 13.8 MB，材質內嵌）；Tripo `tripo3d/tripo/v2.5/multiview-to-3d` request `01a09ebb-2b58-7a72-9cd7-59908216380a`（model.glb 5.4 MB＋preview.png）。Tripo 拒收 data URI，三張切圖改經 fal storage 上傳（未驗證的不可猜測 URL）；Tripo 另有兩次失敗嘗試（422 驗證錯誤，未產生輸出），是否計費待使用者查 fal 後台。來源紀錄 `round6/c0/provenance/{tripo,rodin}.json`。
- 候選比較：`round6/c0/candidates-sheet.png`、`candidates.json`（`pipeline/integrations/mesh3d/candidates.py` 重新生成，改用 `probe_glb.parse_glb`／`_buffer_view_bytes` 直讀 accessors／images，貼圖尺寸以 stdlib 解 PNG IHDR／JPEG SOF 標記）。Tripo：1 mesh、1 material、3 張內嵌 4096×4096 JPEG（Color／ORM／NormalGL，材質已烘進 GLB），mesh-local bounds.size `[0.2018, 1.0001, 0.3763]`（公尺），120,564 三角形（69,691 頂點），套用 root node 變換後世界高度 1.75 m。Rodin：1 mesh、1 material、3 張內嵌 2048×2048 PNG，mesh-local bounds.size `[1.1449, 1.9004, 0.4478]`（公尺），93,163 三角形，世界高度 1.90 m（root node 為 identity，無額外縮放）。`candidates.json` 現在同時提供 `bounds`（mesh-local）與 `worldBounds`（`space: "world-untransformed-by-viewer"`，含 `size`／`center`）＋ `nodeScale`。viewer 以 Y-180° 節點包裹 GLB 參考且不落地校正；兩候選記錄的 azimuth offset（Tripo 90°、Rodin 180°）正是計畫 B 需要用來換算 GLB 前方朝向的依據——`viewerAzimuthOffsetDegrees` 的基準是 `round5/c4/capture-handoff.json` 紀錄的 viewer azimuth（front=0°、left=270°），套在 `capture-reference.ts` 既有的 Y-180° 包裹之後，用來補償每個候選 GLB 自身前方軸與這個慣例的差異；實際擷取角度以 `candidates.json` 每個候選的 `captureCamera`（front／left／face 三組完整 CameraSpec）為準，不要只用 offset 反推。
- 選定：`round6/c0/selected.json`——端點 `tripo`（`.img2babylon/female-tactical/generative/tripo/model.glb`，sha256 `11df0be6fe8949ee7db05555408d73e218d52af7716cf9c3cface34e3483a142`），使用者 16:14「兩個都留 你先用tripo 走後續流程」；理由為 Tripo 臉部與衣著細節較佳。Rodin GLB（`.img2babylon/female-tactical/generative/rodin/model.glb`）保留為備選（T-pose），`alternates[0].keep = true`。
- 修正次數：本段不計修正，第 6 輪仍為 0/6。

## B、C 交接點

- 計畫 B 從已提交的 `viewer/models/female-tactical/round6/c0/selected.json` 開始（spec §4、§5）：切零件、減面、貼圖、nativeVertexData、viewer 顯示。該檔案指向 `.img2babylon/female-tactical/generative/tripo/model.glb`（gitignored），並帶 `handoff` 欄位（`bindPose`、`partitionNote`、`textures`、`triangleCount`、`committedCopy`）。全新 clone 需先重建 `viewer/public/generative` symlink 才能讓 viewer 讀到該 GLB：`ln -s ../../.img2babylon/female-tactical/generative viewer/public/generative`。
- 計畫 C 從計畫 B 的 15 個零件 mesh 開始（spec §6、§7）：SOMA 30 骨、權重、kimodo 動畫重定向、11 個 ANIMATED 剛體。
- 兩者各自另寫 `docs/superpowers/plans/2026-09-14-yui-r6b-*.md`、`...-r6c-*.md`，在計畫 A 完成後由本 session 以 writing-plans 產生。
- 另見 design spec 的 2026-09-14 16:30 修訂（計畫 A 最終審查後）：選定候選的實際貼圖格式（Tripo 3 張內嵌 4096×4096 JPEG，非原假設的 PNG；ORM 為 glTF 標準 `metallicRoughnessTexture` 打包）、三角形數與世界尺度換算（頭頂校正須用世界空間高度，不可用 mesh-local bounds）、以及 Tripo 為 A-pose 綁定姿勢（計畫 C 分區前需先依 spec §10 沿骨段平面切開腋下）。
