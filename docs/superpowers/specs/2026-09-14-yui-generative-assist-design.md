# yui 第 6 輪設計：generativeAssist 寫實頭身、貼圖、SOMA 骨架與輕量物理（2026-09-14）

狀態：使用者核准設計方向（2026-09-14 對話）。範圍＝以 fal.ai 影像轉 3D 生成基底 mesh 重建 yui 的頭臉與衣著、接受貼圖資產、
綁 kimodo.cpp SOMA 30 關節骨架、輕量剛體碰撞不穿模；不做站立／奔跑物理、不做 ragdoll。
前作：`docs/yui.md`（命名）、`docs/character-round5.md`（第 5 輪純程序化頭臉，IoU 0.61 未過門檻）。
契約：`pipeline/docs/UPGRADE_PLAN.md` 5.9（generativeAssist 為明確 opt-in）、`SKILL.md` 必守契約 1／2／9。

## 1. 目標與範圍

第 5 輪證明純 loft 加高斯 relief 的臉部上限是風格化卡通臉，鼻部修正已振盪。使用者提供寫實三視圖
（`viewer/models/female-tactical/reference/female_reference.png`，2172×724，上半身：左側、正面、右側），
要求 yui 接近寫實、頭與衣著一起換（黑外套紅立領、高馬尾），並要能用 kimodo.cpp 產生的動作驅動。

本輪交付：
1. **生成路線**：`pipeline/integrations/mesh3d/fal_generate.py` 以 fal.ai 佇列 API 呼叫 Tripo v2.5 multiview 與 Hyper3D Rodin，各一次，帶完整來源紀錄。
2. **匯入路線**：`pipeline/forge/stage3_build/import_generative_mesh.py` 把選定 GLB 切成零件、減面、寫入 canonical-spec 的 `nativeVertexData`，標 `meshSource: generative-assist`。
3. **貼圖**：沿用 viewer 既有 `referencePbr.maps` 貼圖通道，貼圖 PNG 以明確標記的非程序化資產放在模型目錄。
4. **骨架**：Babylon `Skeleton` 30 根骨，名稱、階層、T-pose 對齊 kimodo SOMA；`nativeVertexData` 新增 `jointIndices`／`jointWeights`；viewer 能載入 kimodo 匯出的動畫 GLB 依骨名重定向播放。
5. **輕量物理**：主要骨段各一個 ANIMATED 剛體跟隨骨骼，碰撞盒不重疊、不穿模；不做 dynamic 站立。
6. **驗收**：既有 strict／typecheck／physics gate 加上本輪新 gate（§9），多角度截圖對照三視圖。

不做（YAGNI）：ragdoll 與 hinge 限位、角色控制器、手指逐指碰撞、髮絲物理、Kimodo 77 關節擴展、Draco 壓縮 GLB 支援、
把 fal 生成當作其他模型的預設路線。

成功標準：
- `python3 -m unittest discover -s pipeline/forge/tests` 與 `forge/tests` 全綠；`cd viewer && npx tsc --noEmit` 零錯；`npm run build` 成功。
- 瀏覽器 `#model=female-tactical` 顯示生成版 yui，臉部近照與三視圖同鏡位對照，使用者目視核准；`&motion=walk` 播放 kimodo 走路動畫不撕裂、不掉件。
- `&physics=1` 動畫中碰撞線框跟著骨段走；`check_colliders.py` 重疊比例 0、與地面接觸無穿透。
- 每個修正有 `round6/cN/` 證據；本輪修正 ≤ 6 次。

## 2. 參考圖前處理（tomato，本機免費）

`forge/tomato.py edit` 只能維持來源尺寸，輸出長邊上限 2048。流程：

1. `pipeline/forge/stage1_intake/split_views.py`（新，stdlib）：把三視圖依白底連通塊切成 `left.png`、`front.png`、`right.png`，
   記錄各裁切框到 `reference/views.json`。
2. 全身延伸：對三張各跑一次 tomato edit，提示固定為英文、明說「extend the canvas downward to show the full body standing, black tactical cargo trousers,
   black combat boots, arms slightly away from the body in a relaxed A-pose, keep the face, hair and jacket pixel-identical, plain white background」。
   seed 固定寫進 views.json。
3. **臉部漂移 gate**（`pipeline/forge/stage1_intake/face_drift_gate.py`，新）：以 `extract_landmarks.py` 在原圖與延伸圖各取臉部框，
   裁切後用 `forge/divine_eye.py` 的遮罩 IoU 與 `color_metrics` 的色差比對。門檻：IoU ≥ 0.92 且平均色差 ≤ 6/255；任一視角失敗即判定漂移。
4. 分岔：
   - 通過 → 全身三視圖送 §3，產出完整人偶。
   - 失敗 → 胸像方案：只送原始三視圖，生成頭、髮、外套、背心；褲、靴、手沿用 yui 現有程序化零件改黑色戰術配色，腰帶遮接縫。
     骨架與物理仍照 §6／§7 做，下半身零件以既有 ID 綁骨。

兩條分岔的下游介面相同：`generative/selected.glb` 加 `generative/parts.json`（§4）。

## 3. fal.ai 生成（`pipeline/integrations/mesh3d/fal_generate.py`）

- 純 stdlib `urllib`；金鑰只從 `.env` 的 `FAL_API_KEY` 或環境變數讀取，任何輸出、日誌、JSON、例外訊息都不得含金鑰（測試以假金鑰斷言不外洩）。
- 圖片不經公開上傳：fal 佇列 API 的 image url 欄位接受 base64 data URI，三張視圖各轉 data URI 直接放進 payload。
- 端點（已用 openapi 逐一確認存在）：

| 端點 | 參數 | 輸出 |
|---|---|---|
| `tripo3d/tripo/v2.5/multiview-to-3d` | front／left／right／back（back 缺省略）、`texture: HD`、`pbr: true`、`face_limit: 120000`、`orientation: align_image`、`auto_size: true`、seed | `pbr_model` GLB 含貼圖 |
| `fal-ai/hyper3d/rodin` | `input_image_urls` 三張、`condition_mode: concat`、`quality: high`、`material: PBR`、`TAPose: true`、`geometry_file_format: glb`、seed | `model_mesh` GLB＋`textures[]` PNG |

- 佇列流程：submit → 輪詢 status（間隔 5 s、上限 15 分鐘）→ 取 result → 下載到 `.img2babylon/female-tactical/generative/<endpoint>/`。
- `provenance.json`：端點、完整參數（不含金鑰）、request_id、seed、輸入圖 SHA-256、輸出檔 SHA-256 與大小、時間、fal 回報費用若有。
- 費用控制：CLI 需 `--confirm-paid`，沒有旗標只印 dry-run payload；同一輸入雜湊已有輸出時拒絕重跑，除非 `--force`。
- 選型：兩份結果各以 §5 的匯入路線做一次乾跑（不寫 spec），輸出 `candidates.json`（三角形數、材質數、貼圖解析度、AABB、與三視圖輪廓 IoU）與並排截圖，
  由使用者挑選；選定寫進 `generative/selected.json`。

## 4. GLB 匯入與分區（`pipeline/forge/stage3_build/import_generative_mesh.py`）

- 讀取：stdlib 解析 GLB（沿用 `probe_glb.py` 的 chunk／accessor walk），支援 POSITION／NORMAL／TEXCOORD_0／indices 與內嵌 PNG 貼圖；Draco 壓縮直接報錯。
- 座標：glTF 為右手 Y-up 公尺，與 `nativeVertexData` 契約一致；以 Hips 高度或 `auto_size` 結果校正到 yui 現有身高（頭頂 1.69 m），縮放烘進頂點。
- 分區（不用節點名稱，遵循 `label_glb_nodes.py` 的原則）：以正規化高度帶加左右／前後半空間切成零件：
  `head`、`hair`（頭帶內以顏色與法線背向判定）、`torso`（含外套與背心）、`upper-arm-l/r`、`forearm-l/r`、`hand-l/r`、`pelvis`、`thigh-l/r`、`calf-l/r`、`boot-l/r`。
  切割沿三角形邊界，切口以零件重疊 5 mm 遮縫；每個零件為獨立 mesh 以保留隔離、展開與檢查介面。
- 零件 ID：群組級 15 個沿用舊 ID；125 → 15 的對應表寫進 `iteration.json.partIdMap`，舊 optimizationPath 的 `edit` 入口改指向 `generative/parts.json`。
- 減面：`stage3_build/decimate.py` QEM，目標全身 ≤ 60,000 三角形，臉部零件保留比例較高（head 20k、其餘按面積分配）；減面前後 Chamfer 距離記錄，臉部 ≤ 1.0 mm。
- 貼圖：從 GLB 抽出 albedo／normal／roughness PNG 到 `viewer/models/female-tactical/generative/textures/`，UV 隨頂點一起寫入 `nativeVertexData.uvs`；
  同一材質零件共用一張圖。material 以 `referencePbr.maps.{albedo,normal,roughness}.path` 指向檔案，`usable: true`、`confidence: 1`（viewer 現有 `createSculptMaterial` 已讀這個欄位）。
- 標記：canonical-spec 與 spec.json 新增 `meshSource: "generative-assist"`、`generativeProvenance`（指向 provenance.json 與 SHA-256）；
  預覽頁標題列顯示「generative-assist」；`validate_spec.py --strict` 新規則：`meshSource` 為 generative-assist 時必須有 provenance 與貼圖檔存在。
- 產出：更新 `canonical-spec.json`、`spec.json`，重新產生 `createNativeFemaleTactical.ts`（`generate_babylon_factory.py` 既有路線），`PARTS.md` 重產。

## 5. viewer 貼圖與運行

- `createSculptMaterial` 已支援 `referencePbr.maps`；本輪只補：模型目錄相對路徑解析（Vite 以 `new URL(path, import.meta.url)`）、
  法線貼圖 `invertNormalMapX/Y` 依 glTF 約定設定、貼圖失敗時拋錯而非靜默退回單色。
- `nativeImport.ts` 契約版本升到 2：允許 `uvs` 必填於貼圖材質、允許 `jointIndices`（每頂點 4 個整數）與 `jointWeights`（每頂點 4 個浮點，和為 1）。無骨架的舊模型仍走版本 1。
- 檢查介面 inspector 顯示 `meshSource` 與零件對應表；隔離／展開功能對 15 個零件照舊。

## 6. 骨架與 kimodo 動作

### 6.1 目標骨架
kimodo.cpp SOMA RP v1.1 匯出的 `walk.glb` 定義了 30 個關節（已解析）：
`Hips, Spine1, Spine2, Chest, Neck1, Neck2, Head, Jaw, LeftEye, RightEye, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftHandThumbEnd, LeftHandMiddleEnd,
RightShoulder, RightArm, RightForeArm, RightHand, RightHandThumbEnd, RightHandMiddleEnd, LeftLeg, LeftShin, LeftFoot, LeftToeBase, RightLeg, RightShin, RightFoot, RightToeBase`。
靜止姿勢為 T-pose（手臂沿 ±X），Y-up 公尺，Hips 0.988 m，動畫 30 fps，通道為每關節 rotation 加 Hips translation。

### 6.2 yui 骨架（`pipeline/forge/stage5_rig/fit_soma_rig.py`，新）
- 名稱與父子關係逐一等於 SOMA；骨長依 yui 生成 mesh 的地標擬合（Hips 高度、肩寬、臂長、腿長來自零件 AABB），未量到的關節（Jaw、Eye、指尖）按 SOMA 比例縮放。
- 綁定姿勢：若生成 mesh 是 T-pose（Rodin `TAPose`）直接綁；若是 A-pose 或垂臂（Tripo），先以 SOMA 的 walk 第 0 幀等效旋轉把骨架擺到 mesh 姿勢再綁，
  綁定矩陣以 Babylon 由父鏈推導（沿用 `emit_babylon_rig.py` 的做法），並記錄 `bindPose: "a-pose"`。
- 權重：先用零件對應（零件 → 主骨）給硬權重，零件切口 5 cm 內以 `geodesic_skinning.py` 混合兩骨；每頂點最多 4 骨、和為 1。純 Python 處理 6 萬頂點需量時間，
  超過 5 分鐘則退回歐氏距離加零件遮罩並在 provenance 記錄。
- 產出 `rig.json`（RigSpec 格式，30 骨）與 `nativeVertexData.jointIndices/jointWeights`；`validate_rig_payload.py` 加 SOMA 名稱完整性檢查。

### 6.3 viewer 播放（`viewer/src/pipeline/motion.ts`，新）
- `#motion=<name>` 從 `viewer/models/female-tactical/motions/<name>.glb` 載入 kimodo 匯出的骨架 GLB（`LoadAssetContainerAsync`，已在 capture-reference.ts 用過），
  只取 animationGroups，依骨名重定向到 yui 的 `Skeleton`：局部旋轉直接複製（同名同階層同靜止方向），Hips 平移乘以身高比。載入後丟棄來源 mesh。
- 提供 `window.__IMG2BABYLON_CAPTURE__.setMotion(name, frame)` 讓 gate 定格截圖。
- 動作檔是 kimodo 產物，不是模型資產；`motions/` 目錄 gitignore，`walk.glb` 從 `reference/kimodo.cpp/out-walk/` 複製並記 SHA-256。

## 7. 輕量物理（`viewer/src/sculpt/physics.ts` 新模式 `skinned-animated`）

- spec `physics.mode: "skinned-animated"`；`bodies[]` 每項綁一根骨：Hips、Chest、Head、Left/RightArm、Left/RightForeArm、Left/RightLeg、Left/RightShin 共 11 個。
- 每個 body 一個 `PhysicsShapeBox`（尺寸由對應零件 AABB 在綁定姿勢下量測，寫進 spec `collider`），`PhysicsMotionType.ANIMATED`，每幀 `onBeforePhysicsObservable`
  把骨的世界矩陣寫進 body 的 transform node。質量以 55 kg 按零件體積比分配，僅供推力計算。
- 不做：dynamic 站立、關節約束、跌倒。角色由動畫驅動，物件（既有 playground 物件）碰到 yui 會被推開而不會穿過。
- gate：`scripts/physics_test.ts` 新分支——播放 walk 60 幀，每幀讀 11 個 body 的 AABB，斷言相鄰骨段重疊 ≤ 10%、非相鄰為 0、腳底最低點 ≥ −5 mm；`check_colliders.py` 讀新 runtime 輸出照舊。

## 8. 檔案清單

新增：
- `pipeline/forge/stage1_intake/split_views.py`、`face_drift_gate.py`
- `pipeline/integrations/mesh3d/fal_generate.py`
- `pipeline/forge/stage3_build/import_generative_mesh.py`
- `pipeline/forge/stage5_rig/fit_soma_rig.py`
- `viewer/src/pipeline/motion.ts`、`viewer/models/female-tactical/generative/`（parts.json、selected.json、textures/）、`round6/`
- 測試：`pipeline/forge/tests/test_fal_generate.py`（假伺服器、金鑰不外洩、dry-run、去重）、`test_split_views.py`、`test_face_drift_gate.py`、
  `test_import_generative_mesh.py`（小型合成 GLB fixture：兩個立方體加貼圖）、`test_fit_soma_rig.py`（30 骨名稱、階層、權重和）、
  `viewer/scripts/motion_test.ts`（重定向後骨數 30、第 0 幀與 kimodo 一致）、`physics_test.ts` 新分支。

修改：
- `pipeline/forge/stage2_spec/validate_sculpt_spec.py`（meshSource 規則）、`stage3_build/generate_babylon_factory.py`（joint 屬性透傳）、`stage5_rig/validate_rig_payload.py`
- `viewer/src/pipeline/nativeImport.ts`（契約 v2）、`materials.ts`（路徑解析、法線約定）、`sculpt/physics.ts`（skinned-animated）、`sculpt/inspector.ts`、`main`（`#motion`）
- `viewer/models/female-tactical/{spec.json, canonical-spec.json, createNativeFemaleTactical.ts, iteration.json, PARTS.md, README.md}`
- `.gitignore`（`viewer/models/*/motions/`、`.img2babylon/`已有）、`docs/yui.md`（第 6 輪連結）、`docs/character-round6.md`（新）

## 9. 驗收與修正次數

- 開輪：`python3.11 pipeline/forge/babylon.py round --state .img2babylon/female-tactical/pipeline/workflow.json --model-dir viewer/models/female-tactical --reason "R6 generative-assist head/body, textures, SOMA rig, light physics"`，先快照第 5 輪來源。
- 每次修正 `round6/cN/`：author.py、rebuild.sh、changes.json、strict.json、visibility.json、physics.json、11 個固定視角 PNG 與臉部近照對照三視圖；
  修正計數由 workflow 管理，第 7 次拒絕。
- 相似度：Divine Eye 對三視圖正面與左右側各算一次輪廓 IoU，目標 ≥ 0.85（第 5 輪 0.61）；臉部近照由使用者目視核准，不以測試數代替。
- 誠實邊界：背面沒有參考，生成模型的背面屬推測，`iteration.json.reference.backViewConfidence` 維持 low；貼圖是生成物而非照片投影，記為 `textureSource: generated`。

## 10. 風險與對策

- tomato 全身延伸改動臉部 → §2 漂移 gate 自動退回胸像方案。
- 生成 mesh 分區切錯（髮與外套黏連）→ 分區參數在 `parts.json` 可手調，dry-run 產出分區著色截圖供檢查。
- Tripo 垂臂姿勢使腋下與軀幹黏連、權重難分 → 優先選 Rodin T-pose 結果；若選 Tripo，分區前先以骨段平面切開腋下。
- 純 Python 減面與 geodesic 在 6 萬頂點的耗時 → 記錄時間；超時退回策略已寫在 §4／§6.2，並在 provenance 標明。
- fal 費用 → `--confirm-paid` 與雜湊去重；本輪預算兩次生成。
