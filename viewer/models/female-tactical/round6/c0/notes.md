# R6 c0 準備期筆記

- 2026-09-14 12:00 使用者提供上半身三視圖（2172×724 RGBA）。切圖 → tomato 延伸 → 漂移 gate（IoU 0.98 通過、像素差 13.5/255 未過）→ 圖表。
- 2026-09-14 14:45 使用者改提供全身三視圖（1672×941 RGB 灰底）並指示舊圖不用。上述延伸路線證據移至 `superseded-bust-route/`。
- 2026-09-14 14:54 使用者目視核准新切圖（`figure-sheet.png`），同意以 spec §3 參數送 Tripo 與 Rodin。
- 2026-09-14 15:07 `fal_generate.py` 付費執行完成，兩端點各一次：
  - Rodin（`fal-ai/hyper3d/rodin`）：request `01a09eb6-072f-7fd2-a385-c82044e45ed4`，第一次即成功，
    data URI 輸入直接可用，耗時 ~2m19s，`model.glb` 13,792,764 bytes（`glTF` 開頭），本次回應無
    `textures` 陣列（材質已烘進 mesh）。
  - Tripo（`tripo3d/tripo/v2.5/multiview-to-3d`）：**不是** 413/422 尺寸問題——實際錯誤是
    `422 file_download_error`：該端點的 `*_image_url` 欄位不接受 `data:` URI，要求可直接下載的
    https URL（同一組圖片對 Rodin 完全正常）。修法：新增 `upload_to_fal_storage()`，先用 fal 的
    `https://rest.alpha.fal.ai/storage/upload/initiate`（回傳 `{file_url, upload_url}`）+
    `PUT` 把三張圖傳到 fal 自己的 CDN，再把 `file_url` 換入送給 Tripo 的 payload；`build_payload`／
    `input_hash`／`provenance.parameters` 仍保持 data URI 不變（只有 tripo 的「送出」payload 換
    URL）。第三次付費嘗試成功：request `01a09ebb-2b58-7a72-9cd7-59908216380a`，耗時 ~3m3s
    （不含上傳約 ~3m10s 含上傳），`model.glb` 5,419,244 bytes（`glTF` 開頭），`preview.png`
    112,121 bytes（實際內容為 PNG，即使來源 URL 副檔名是 `.webp`）。前兩次嘗試（純 data URI）
    因驗證失敗未寫入 `provenance.json`，因此去重機制沒有擋下重試，也沒有額外真正計費的生成運算
    （fal 對輸入驗證失敗的請求不會跑 GPU）。未縮圖、未動 `views/half/`——這次的 422 與畫面尺寸
    無關，是 URL scheme 不支援。


## Plan A 結案

- 選定端點：`tripo`（`.img2babylon/female-tactical/generative/tripo/model.glb`，sha256
  `11df0be6fe8949ee7db05555408d73e218d52af7716cf9c3cface34e3483a142`）。使用者 16:14
  「兩個都留 你先用tripo 走後續流程」；Rodin GLB 保留為備選（T-pose），詳見
  `selected.json`、`candidates.json`。
- 下一步：計畫 B——從選定 GLB 開始切零件、減面、貼圖與 nativeVertexData 匯入，
  在 viewer 顯示（spec §4、§5）。
