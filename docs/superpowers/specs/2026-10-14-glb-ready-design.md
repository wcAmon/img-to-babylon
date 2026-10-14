# img-to-babylon 公開化、GLB 交付與 Blender 經驗整合 設計文件（glb-ready）

日期：2026-10-14　狀態：草稿，待使用者審閱　路徑：architectural

這是三個子計畫中的 A。B（Nomen Land 網站 skill `assets/img-to-babylon` 與 `make skills-sync`）與 C（大廳、個人房間、shelf）在 livesoup repo 另立 spec。順序 A → C → B（使用者 2026-10-14 核准）。

## 1. 目標

讓任何人的 agent 讀到 `https://github.com/wcAmon/img-to-babylon` 之後，能把一個 3D 模型做成「遊戲收得進去的 GLB」，而不只是 Babylon 程序化模組。具體要做到：

- repo 轉為公開，沒有密鑰、沒有內網位址、根目錄有授權。
- 新目錄 `glb-ready/`：一支 skill、一組 Blender 與純 Python 腳本、一份教訓紀錄。這是 agent 目標為 GLB 時唯一要讀的入口。
- viewer 能把任何已註冊的程序化模型匯出成 GLB（`npm run export-glb`）。
- 累積在 character-studio、vr_robot、vr_chemo_spill 與本 repo 的 Blender 經驗，去掉物件專屬的校準，整理成可重用的腳本與有出處的教訓。

成功標準：

1. 一個全新的 Claude Code session，在空目錄只讀 `glb-ready/SKILL.md`，能把 object-studio 的 `timber-lodge.glb`（22,494 面）減到 20,000 面以下、通過 `glb_audit.py` 與 Nomen Land 的 `nomen-glb check`，外觀無明顯缺損。
2. `npm run export-glb -- sample-crate out.glb` 產出的 GLB 通過 `glb_audit.py`，面數與 viewer 內一致，尺寸是公尺。
3. `triage-standing-animated.glb`（1 個 clip、1 個 skin）經 `glb_audit.py` 回報 clip 名稱與骨架，`render_review.py` 以 rest pose 渲染而不是跳躍姿勢。
4. 匿名 `git ls-remote https://github.com/wcAmon/img-to-babylon` 成功；全 repo 歷史的密鑰掃描為零。

不在範圍：

- 修改 `pipeline/`（Apache-2.0 上游移植，原樣保留）。
- 角色臉部的 retopology、投影貼圖、ARKit 52 等 character-studio 的流程；本 spec 只收「做成 GLB」會用到的部分。
- 把 Havok 物理、致動器或 motionTimeline 寫進 GLB（GLB 沒有這些概念；見 §7 教訓）。
- Blender MCP 的流程。產線紀錄全部用 CLI 背景模式完成，MCP 只在 `lessons.md` 留一段環境說明。
- 發佈到 npm 或 PyPI。

## 2. 現況（2026-10-14 盤點）

- GitHub `wcAmon/img-to-babylon` 私有，origin/main 停在 2026-09-03（`dffc640`）。本機 checkout（`~/Desktop/local_three/object-studio/infrastructure/img2babylon`）領先 94 個 commit，工作區 487 個變更：462 個是 `viewer/models/female-tactical/` 的刪除，其餘是 13 支 `pipeline/scripts/yui_*.py`、`grimoire/blender_refinement.md` 未追蹤，和幾份 yui 文件的刪除。
- 版控裡沒有 `.env`；`.gitignore` 已排除 `.env*`。密鑰樣式掃描（當前樹）為零。`configs/*.env` 只有路徑欄位。
- 內網字樣：`<internal-host>` 主機名在 19 個檔案（README、ROADMAP、歷史 plan/spec、`forge/tomato.py` 的預設 BASE）；`<home-path>` 絕對路徑在 8 個檔案（含 `pipeline/NATIVE-COMMANDS.md`）。
- 測試基準線：`python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'` 134 個測試、3 個 error（`test_model_report.ReportTest` 讀不到 female-tactical 的 spec.json）；`viewer` 的 `tsc --noEmit` 失敗（`scripts/female_native_inspection_test.ts` 引用已刪的模型）。
- viewer：`@babylonjs/core` 8.56.2、`loaders` 8.56.2、`havok` 1.3.14；沒有 `@babylonjs/serializers`，沒有 GLB 匯出。`src/headless.ts` 的 `createHeadlessScene()` 以 NullEngine 加 Havok 建場景，`registry.ts` 以 id 註冊 `ModelFactory`，`BuiltModel` 有 `root`、`meshes`、`physicsScale`、`factoryPose`。
- 授權：只有 `pipeline/LICENSE`（Apache-2.0）。根目錄無授權檔。
- Blender 5.1.2 在 `/Applications/Blender.app/Contents/MacOS/Blender`（`/opt/homebrew/bin/blender` 是同一個）。產線腳本都以 `-b --factory-startup --python-exit-code 1 --python X.py -- args` 執行；數值運算只用 Blender 內建的 numpy。
- 可重用的來源腳本（去重後）：`character-studio/scripts/reduce_web_mesh.py`、`web_asset_audit.py`、`prepare_bust.py`、`repack_bust_uv.py`、`render_bust.py`、`render_head_review.py`、`validate_mixamo_retarget.py`、`guava-bot/scripts/retarget.py`、本 repo `pipeline/scripts/yui_trellis_refine_blender.py`、`yui_r8_unfold.py`，以及 `vr_robot/apps/tmuh-minimentor/scripts/optimize-environment.py`、`remesh.py`、`verify-assets.py`（vr_chemo_spill 那份逐位元相同）。

## 3. 目錄結構

```
glb-ready/
  SKILL.md               入口（§4）
  lessons.md             有出處的教訓（§7）
  profiles/
    nomen-land.json      預算檔（§5.1），預設
    hero-bust.json       沿用 web_asset_audit 的既有 preset
    mobile-bust.json
    crowd.json
  scripts/
    glb_audit.py         純 Python stdlib，不需 Blender
    repair_shell.py      Blender
    reduce_mesh.py       Blender
    bake_atlas.py        Blender
    shrink_textures.py   Blender
    render_review.py     Blender
    retarget_clips.py    Blender
    validate_retarget.py 純 Python stdlib
  tests/
    test_glb_audit.py            unittest，合成 GLB
    test_validate_retarget.py
    test_blender_scripts.py      找不到 Blender 時 skip
    fixtures/                    由測試程式產生，不提交二進位
viewer/scripts/export_glb.ts     §6
```

命名：腳本一律 snake_case、動詞開頭；沒有任何檔名或參數帶 yui、lisa、marry、guava。`pipeline/scripts/yui_*.py` 不加入版控（character-studio 已有同一份），`grimoire/blender_refinement.md` 改寫成兩行指標指向 `glb-ready/`。

## 4. `glb-ready/SKILL.md`

英文，與 Nomen Land 的 skill 樹一致。frontmatter：

```
---
name: glb-ready
description: Turn a procedural Babylon model, a text-to-3D mesh or a messy GLB/FBX into a game-ready GLB within a triangle and texture budget, with clean normals, metres, Y-up, and animation clips preserved.
version: 1.0.0
---
```

內文分七節，長度控制在一次讀完（約 250 行）。細節放 `lessons.md` 與腳本的 `--help`。

### 4.1 契約（Contract）

交付的 GLB 必須：

| 項目 | 預設（profile `nomen-land`） |
|---|---|
| 三角形 | ≤ 20,000，以 GLB index count ÷ 3 計算，含每個 scene node 的實例 |
| 貼圖 | ≤ 8 張，每張邊長 ≤ 2048，PNG 或 JPEG，全部內嵌（bufferView），無外部 URI |
| 檔案 | ≤ 20 MB |
| 節點 | ≤ 500 |
| 單位與軸 | 公尺、glTF Y-up、正面朝 +Z；物件底部在 y = 0、XZ 置中於原點 |
| 幾何 | 有 NORMAL；有貼圖時有 TEXCOORD_0；法線長度誤差 < 1e-6；沒有 NaN；沒有零面積三角形 |
| 壓縮 | 不用 Draco、Meshopt、KTX2 |
| 動畫 | 保留為具名 clip；骨架 JOINTS 不超過 64；權重和為 1（容差 1e-5） |
| 材質 | 單一 PBR metallic-roughness；不依賴 KHR_materials_* 以外的擴充 |

最後一道門是目標網站自己的檢查器。Nomen Land 是 `nomen-glb check`（`{Origin}/skills/assets/glb-prep`）；`glb_audit.py` 檢查的是它不管的事（落地、法線、骨架、clip、壓縮）。

### 4.2 分流（Which path）

| 輸入 | 路徑 |
|---|---|
| 本 repo 的程序化模型（registry 有 id） | `npm run export-glb` → `glb_audit.py` |
| Trellis、Tripo、Rodin、Hunyuan 等 text/image-to-3D 的網格 | `repair_shell.py` → `reduce_mesh.py` → （貼圖不合格時）`bake_atlas.py` 或 `shrink_textures.py` → `render_review.py` → `glb_audit.py` |
| 別人給的 GLB、FBX、OBJ，沒有骨架 | 以 Blender 匯入後走同上，從 `reduce_mesh.py` 起 |
| 已綁骨或有 morph 的模型 | 只允許 `shrink_textures.py`、`retarget_clips.py`、`render_review.py`、`glb_audit.py`。**不減面**；要減面就回到綁骨前的素模 |
| 面數本來就在預算內 | 記錄數字，跳過減面；仍跑 `glb_audit.py` |

### 4.3 順序（Order of operations）

素模 → 減面或 retopo → UV → 烘焙 → 綁骨 → morph → 動畫。每一步只能往後，往前就得重做後面所有步驟。減面之後舊的 UV 與貼圖作廢（`--keep-uv` 只適用於比例溫和的道具，見 §5.3）。

### 4.4 定案的數字（Settled numbers）

| 事項 | 值 | 來源 |
|---|---|---|
| 三角形計算 | GLB index count ÷ 3，遍歷實例；不是 Blender polygon | web-game-asset-workflow、guava-bot README、vr-robot-triage spec |
| 烘焙邊距 | 16 px（0 會開縫） | yui R8、R9 |
| 骨架權重 | 保留最多 8 個影響（JOINTS_0/1、WEIGHTS_0/1）；砍到 4 會出現不連續 | kimodo |
| 封殼厚度 | 模型高度 × 0.004 到 0.006 | yui R7、prepare_bust |
| voxel 尺寸 | 模型高度 × 0.0015（素模）到 0.0028（含封殼修復）；道具 0.008 到 0.01 m | yui R7、prepare_bust、VR remesh |
| 去階梯平滑 | factor 0.25 × 2 次（輕）到 0.55 × 5 次（重） | yui_trellis_refine、prepare_bust |
| smart UV | angle limit 66°、island margin 0.015、area weight 0、correct aspect | yui R8、prepare_bust |
| 高模烘低模 | Cycles 8 samples、cage extrusion 0.025 到 0.035、max ray 0.06 到 0.08、margin 4 | VR remesh |
| 保護區誤差 | 雙向 BVH 表面誤差 ≤ 0.001 m | reduce_web_mesh |
| 重定向誤差 | 序列化 GLB 重算 FK，≤ 0.1° | kimodo-mixamo-retarget |
| 預算參考 | crowd 5k / 1024；mobile-bust 12k / 2048；hero-bust 25k / 2048；Nomen Land 20k / 2048 × 8 | web-game-asset-workflow、Nomen Land |

### 4.5 不要再犯（Do not repeat）

1. 對 Trellis 原始網格直接 voxel remesh，或反覆 remesh。先修朝向、輕平滑、封殼，再 remesh 一次。
2. 沿法線縮放或過度平滑臉部：產生頭皮尖刺與五官變軟。
3. 對有薄片的網格做全域 solidify 或 voxel：薄片會消失。
4. 對已綁骨或有 morph 的資產做 decimate。
5. 減面之後沿用舊 UV 或舊貼圖。
6. 烘焙邊距 0。
7. 把三視圖拼貼當成三台校準過的相機。
8. 在已縮放到公尺的輸出上做投影；投影要用原始尺度的 `.blend`。
9. 對已經是 Y-up 的輸出再套一次 Blender 的軸補償。
10. 重定向時把來源旋轉乘上目標的 A-pose 基底；要替換 bind local quaternion。
11. 權重砍到前 4 個。
12. 把 Blender 的 polygon 數當三角形數。
13. 把 Blender 渲染當最終驗收；最終驗收在目標引擎（Babylon）裡看。
14. 殘留的 `custom_normal` 屬性不刪就減面或烘焙：會出現黑斑。
15. 對動畫模型烘入世界變換並拆掉父子關係。

### 4.6 驗收（Review）

1. 素模先看，再看貼圖版。視角：前、左、右、後、四分之三、俯視；兩側都看，一側會藏住補丁。
2. 同一相機比較素模、有光、無光（emission）三張，分辨是幾何、光照還是底色的問題。
3. `glb_audit.py` 全綠，再跑目標網站的檢查器。
4. 在 Babylon 裡載入一次（本 repo viewer 的 `#reviewGLB=` 路由，或目標網站）。數字過了不代表好看。
5. 保留原始檔與每個候選，輸出到新目錄，報告檔記雜湊與參數。

### 4.7 環境（Environment）

- Blender 5.x，背景模式：`blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/<script>.py -- <args>`。macOS 的二進位在 `/Applications/Blender.app/Contents/MacOS/Blender`。
- 腳本只用 Blender 內建的 Python 與 numpy。沒有 scipy、沒有 Pillow。
- `glb_audit.py` 與 `validate_retarget.py` 用系統 `python3`（3.10+，stdlib）。
- `export-glb` 需要 `cd viewer && npm install`（Node 18+）。
- Blender MCP（ahujasid `mcp-for-blender`）可用但非必要；見 `lessons.md`。

## 5. 腳本

### 5.1 共同慣例

- 參數在 `--` 之後：`<in> <out> [flags]`。輸出存在時失敗，除非 `--force`。
- 每支 Blender 腳本開頭檢查 `bpy.app.background`，否則以結束碼 2 退出，避免動到使用者開著的場景。
- 每次成功寫 `<out>.report.json`：`{"script", "version", "blender", "args", "input": {"path", "sha256", "triangles"}, "output": {"path", "sha256", "triangles"}, "params": {...}, "warnings": []}`。
- 結束碼：0 成功；1 目標達不到（例如減面到不了 target、稽核不過）；2 用法錯誤或輸入不支援。stderr 一行說明原因與下一步。
- 三角形數一律從匯出的 GLB 重讀計算，不信 Blender 的面數。
- profile 是 JSON：`{"maxTriangles", "maxBytes", "maxTextures", "maxTextureSize", "maxNodes", "maxJoints", "requireGrounded": true, "forbidExtensions": ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"]}`。`profiles/nomen-land.json` 的值是 §4.1 的表。

### 5.2 `glb_audit.py <glb> [--profile nomen-land|path.json] [--json]`

純 stdlib。解析 GLB 容器與 JSON chunk，不解碼整張貼圖。

檢查並回報：三角形（依 mode 與 indices accessor，遍歷 scene nodes 的實例，沒有 indices 時以 POSITION count 計）、頂點、mesh 與 primitive 數、節點數、材質數、貼圖張數與尺寸（PNG、JPEG、WebP 檔頭）、影像是否全部內嵌、檔案大小、extensionsUsed 與 extensionsRequired、skins（joint 數、inverseBindMatrices 存在）、animations（名稱、channel 數、時長）、morph targets 數、NORMAL 與 TEXCOORD_0 存在、法線長度抽樣、NaN 或 Inf、零面積三角形數（抽樣上限 50,000 個）、包圍盒（accessor min/max 經 node 矩陣）與尺寸、落地（min y 與 0 的差）、XZ 置中偏差、尺度可疑（最高邊 > 50 m 或 < 0.05 m）。

結論三選一：`ok`、`fix`（貼圖、節點、大小、落地、法線、壓縮等不過）、`reduce`（三角形超過）。`problems` 列每一項不過的原因與數字，`warnings` 列可疑但不擋的事。`--json` 輸出完整結構。結束碼 0 ok、1 不過、2 讀不了。

來源：`web_asset_audit.py`（預算與內嵌檢查）、`verify-assets.py`（權重與動畫）、`reduce_web_mesh.py` 的 GLB 讀取器。

### 5.3 `reduce_mesh.py -- in.glb out.glb --target 20000 [--keep-uv | --rebuild-surface] [--protect x0,y0,z0,x1,y1,z1 --max-protected-error 0.001] [--min-part-faces 12]`

拒絕含 skin、morph、animation 的輸入（結束碼 2，訊息指向 §4.2）。

- `--keep-uv`（預設）：不 weld；每個 mesh 套 TRIANGULATE 與 DECIMATE（`COLLAPSE`、`use_collapse_triangulate`），ratio = target ÷ 現有，最多 8 輪，每輪 `ratio *= target / measured * 0.999`；保留材質、UV 與貼圖；多 mesh 時 ratio 以全體總數算一次，不在迴圈內重算。適用於比例溫和（保留 ≥ 30%）的道具。保留比例低於 30% 時印警告建議 `--rebuild-surface`。
- `--rebuild-surface`：`parent_clear(KEEP_TRANSFORM)`、`transform_apply`、`join`；刪 `custom_normal`；weld 1e-6；移除少於 `--min-part-faces` 面的孤島；decimate 同上；輸出灰模、無 UV、無材質，`report.json` 標 `"requiresNewUV": true, "requiresNewTexture": true`。
- `--protect`：glTF Y-up 公尺座標的盒子；盒內頂點加入保護群組（`vertex_group_factor` 1000、invert），匯出後重讀 GLB 以 BVH 量雙向表面誤差，超過 `--max-protected-error` 時結束碼 1。盒子只碰到點或邊時結束碼 2。
- 匯出：`export_format='GLB'`、`use_selection=True`、`export_yup=True`、`export_normals=True`、`export_materials='EXPORT'`（keep-uv）或 `'NONE'`（rebuild）、`export_skins=False`、`export_morph=False`、`export_animations=False`、`export_extras=False`、`export_cameras=False`、`export_lights=False`。

來源：`reduce_web_mesh.py`、VR `optimize-environment.py`。

### 5.4 `repair_shell.py -- in.glb out.glb [--orientation-only | --shell-repair] [--voxel-k 0.0025] [--shell-k 0.006] [--smooth 0.25x2]`

給 Trellis 類原始網格用，產出仍是高面數，之後接 `reduce_mesh.py`。

- 匯入；刪 `custom_normal`；`recalc_face_normals`；`calc_volume(signed)` 為負時翻面；只保留最大連通塊。
- `--shell-repair`：SOLIDIFY（厚度 = 高度 × `--shell-k`，offset 0）→ voxel remesh（尺寸 = 高度 × `--voxel-k`，`use_remesh_preserve_volume`）→ SMOOTH（`--smooth` 的 factor × iterations）。
- `--orientation-only`：不 remesh，但仍做一次輕平滑（factor 0.25 × 2），`report.json` 註明幾何有變。
- 有 COLOR_0 時以 KDTree 最近頂點重採樣保留頂點色；匯出 `export_vertex_color='MATERIAL'`。
- 不縮放、不置中；尺度留給 `reduce_mesh.py` 之後的 `bake_atlas.py` 或人工決定。報告記輸入與輸出的高度、面數、邊界邊數、非流形邊數。

來源：`yui_trellis_refine_blender.py`、`prepare_bust.py`、`seal_lisa_gray.py` 的通用部分。

### 5.5 `bake_atlas.py -- in.glb out.glb [--size 2048] [--source vertex-color|material|high=<other.glb>] [--margin 16] [--angle 66 --island-margin 0.015] [--height <m>] [--ground]`

- smart UV project（§4.4 參數）；只有一個 UV 層，刪多餘的層。
- `--source vertex-color`：COLOR_0 經 Emission 烘到 `--size` 平方的影像（Cycles CPU、1 sample、`use_clear`），然後刪色彩屬性。
- `--source material`：既有材質（含既有貼圖）經 Emission 重烘到新 UV。
- `--source high=<glb>`：高模到低模，`use_selected_to_active`、DIFFUSE 只開 color pass、8 samples、cage extrusion 0.03、max ray 0.08。
- 影像 `pack()`；輸出單一 Principled BSDF，baseColor 一張 PNG；`--size` 上限 2048，超過回結束碼 2。
- `--height`：把模型等比縮放到該高度（公尺）；`--ground`：XZ 置中、min y 貼 0；兩者在最後一步做，並 `transform_apply`。
- sRGB 與 linear：頂點色寫入前轉線性（教訓 §7）。

來源：`prepare_bust.py`、`repack_bust_uv.py`、VR `remesh.py`。

### 5.6 `shrink_textures.py -- in.glb out.glb [--max 2048] [--jpeg-quality 82] [--max-textures 8]`

不動幾何、不動 UV、不動骨架與動畫（這是唯一允許在已綁骨模型上跑的貼圖工具）。每張超過 `--max` 的影像 `scale()` 到上限（保留長寬比）、`pack()`；外部 URI 的影像載入後內嵌；貼圖張數仍超過 `--max-textures` 時結束碼 1 並列出每張的用途。匯出時 `export_image_format='AUTO'`（有 alpha 留 PNG，否則 JPEG 以 `--jpeg-quality`），`export_animations=True`、`export_skins=True`、`export_morph=True`、`export_animation_mode='ACTIONS'`。

### 5.7 `render_review.py -- in.glb outdir [--views front,back,left,right,three-quarter,top] [--gray] [--unlit] [--size 1024]`

- 要求 `outdir` 不存在。Cycles 16 samples、`cycles.seed=0`、正交相機、`to_track_quat('-Z','Y')`、兩盞 AREA 燈、灰色世界、`view_transform='Standard'`；正交範圍 = max(高, 寬) × 1.15；燈光能量隨範圍平方縮放。
- 載入後：清除所有動畫、骨架 `matrix_basis` 設為 identity、shape key 全部歸零；隱藏 `hide_render` 的物件不列入邊界。
- `--gray` 用統一灰材質；`--unlit` 用 Emission 顯示底色。
- 寫 `cameras.json`（每個視角的位置、方向、正交範圍）與 `manifest.json`（輸入雜湊、每張圖的雜湊）。
- 文件寫明：這是診斷圖，不是驗收。

來源：`render_bust.py`、`render_head_review.py`、`render_repair.py`。

### 5.8 `retarget_clips.py -- base.glb source.fbx|source.glb outdir [--in-place] [--ground-clearance 0.002]` 與 `validate_retarget.py base.glb out/*.glb [--max-fk-deg 0.1]`

只支援 Mixamo 命名的骨架（`mixamorig:*`）與 Mixamo 或 SOMA 格式的來源；其他骨架結束碼 2。文件開頭就寫這個限制。

- 網格與 skin 不改：處理前後比對 skin 簽章（頂點、群組、權重、面、UV 的 SHA-256），不同就失敗。
- 每個骨段 shortest-arc 修正；替換 bind local quaternion，不乘目標 A-pose 基底；兩段頸每幀合併；四元數符號連續；root 位移以腿長比例縮放；`--in-place` 只鎖水平位移；`--ground-clearance` 以 depsgraph 評估後只抬 root。
- 輸出 `bind.glb`（無動畫）與 `clips.glb`（所有 action，`export_animation_mode='ACTIONS'`、`export_force_sampling`、`export_all_influences=True`）。
- `validate_retarget.py`：序列化的 attributes、inverseBindMatrices、joint 名稱與 `base.glb` 相同；JOINTS < 65；權重和 1（1e-5）；以 GLB 重算 FK 與來源比對 ≤ `--max-fk-deg`；clip 數與名稱列出。

來源：`guava-bot/scripts/retarget.py`、`retarget_mixamo.py`、`mixamo_retarget_math.py`、`validate_mixamo_retarget.py`。

## 6. viewer `export-glb`

- `viewer/package.json` 加 devDependency `@babylonjs/serializers@8.56.2`（與 core 同版）、script `"export-glb": "tsx scripts/export_glb.ts"`。
- 用法：`npm run export-glb -- <model-id> <out.glb> [--pose factory|settled] [--settle-frames 120] [--name <glb-scene-name>]`。
- 流程：`createHeadlessScene()`（沿用 Havok，factory 需要物理世界才能建 body）→ `registry[id]()` → `factory(scene)` → `--pose settled` 時 `step(--settle-frames)` 讓物件落定，預設 `factory` 不步進 → 以 `physicsScale` 的倒數把 `root` 等比縮回 spec 尺度（公尺）→ 計算 root 下所有 mesh 的世界包圍盒，平移使 XZ 置中、min y = 0 → `GLTF2Export.GLBAsync(scene, name, { shouldExportNode: n => n === root || n.isDescendantOf(root) 且不是物理除錯、utility layer 或名稱以 `__debug` 開頭的節點, exportWithoutWaitingForScene: true })` → 寫檔 → 印一行摘要（三角形、尺寸、檔案大小）。完整稽核交給 `glb_audit.py`，不在 TS 重寫。
- 物理、致動器、motionTimeline 不匯出；輸出是靜態姿勢。文件寫明。
- 匯出後用 `@babylonjs/loaders` 重新載入到另一個 NullEngine 場景，比對三角形數與包圍盒尺寸（容差 1e-4 m），不同就結束碼 1。
- 測試 `viewer/scripts/export_glb_test.ts`：`sample-crate` 匯出後重載，三角形數相同、尺寸等於 spec 的尺寸、min y 在 1e-4 內為 0；`action-figure`（`physicsScale` 10）匯出後高度是 spec 高度，不是 10 倍。

## 7. `glb-ready/lessons.md`

英文，每條教訓一段：發生在哪個專案與回合、試過什麼、什麼失敗、什麼成功、定下的數字；引用中文原文時保留原文。來源寫專案名與檔名，不寫絕對路徑。分節：

1. 環境與執行方式（CLI 背景模式、`--python-exit-code 1`、Blender 內建 numpy、`.venv` 不假設存在；MCP 的安裝與為什麼產線沒用它）。
2. 網格清理與減面（Trellis 原始網格的數字：604k 面、9,041 邊界邊、139,875 反向邊；R7 四次嘗試的結果；薄片與全域封殼；Pixal3D 的兩種結果；減面在 UV 之前；decimate 做不出眼皮嘴唇環線）。
3. 法線與朝向（`custom_normal` 黑斑；`--orientation-only` 仍會平滑；glTF 與 Blender 的軸對應 `(x, y, z) → (x, −z, y)`；fal 系列輸出置中不落地、Tripo 轉 90°、Rodin 轉 180°；Mixamo FBX 的公分與 T-pose 要求）。
4. UV 與貼圖（頂點色不出貨；邊距 16；投影失敗的三個案例與修法；轉盤三視圖不是相機；Guava/Pixal 的 metallic-roughness 通道配置與 doubleSided；減面後貼圖作廢；sRGB 與線性）。
5. 骨架、動畫、重定向（雙 A-pose；clavicle 與 shoulder 的命名陷阱；8 個影響；inverseBind 列主序；四元數符號；下顎與眼睛通道；root 落地不是 IK；渲染前重置姿勢；Blender 髮型 GLB 動輒 450k 面不是遊戲資產）。
6. 匯出與來回（Babylon 匯出會展開 sparse morph 使檔案變大的三個數字；重載鬼影是 runtime 沒釋放；表情混合規則不在 GLB 裡；比對解碼後的陣列不是 accessor 索引；Draco、Meshopt、KTX2 不用；新檔名避免快取）。
7. 驗收習慣（素模先看；三張同相機比較；數字檢查清單；Blender 渲染只是診斷；保留每個候選與雜湊）。
8. 不要再犯清單（與 SKILL.md §4.5 同一份，這裡附出處）。

## 8. 根目錄文件

- `SKILL.md`（路由）在「必守契約」之後加一節「交付物是 GLB 時」：一句話說明 `glb-ready/SKILL.md` 是入口，程序化模型用 `export-glb`，外來網格用 Blender 腳本；版本號升到 1.6.0。
- `README.md`：開頭一段英文摘要（repo 做什麼、三個入口：`SKILL.md`、`glb-ready/`、`viewer/`），其餘保留中文；拿掉 Player Garden 與內網網址；加「Nomen Land 的 agent 從 `{Origin}/skills/assets/img-to-babylon` 進來」一句（B 完成後填網址）。
- `grimoire/blender_refinement.md` 改為指標：Blender 工具已整理到 `glb-ready/`，yui 專屬腳本在 character-studio。
- `AGENTS.md`、`CLAUDE.md`：加 `glb-ready` 的驗證指令；移除 `viewer/src/sculpt/inspector.ts` 未提交修改的那一行（該修改在本計畫一併提交或捨棄，由使用者決定）。
- `.env.example`：`FAL_API_KEY=`、`IMG2BABYLON_TOMATO_BASE=`，各附一行說明。

## 9. 公開前整理

依序執行，每步可驗證：

1. **基準線修復**：`forge/tests/test_model_report.py` 改讀 `viewer/models/sample-crate/spec.json`（或 `action-figure`）；刪除 `viewer/scripts/female_native_inspection_test.ts`。`python3 -m unittest` 134 全綠、`tsc --noEmit` 綠。
2. **提交工作區**：female-tactical 刪除、yui 文件刪除、`registry.ts` 與 `inspector.ts` 的修改（使用者決定留或捨）、`AGENTS.md`、`README.md`。`pipeline/scripts/yui_*.py` 與 `blender_refinement.md` 不加入；加進 `.gitignore`（`pipeline/scripts/yui_*.py`、`pipeline/scripts/materialize.py`、`pipeline/scripts/render_repair.py`、`pipeline/scripts/repair_yui_skin.py`）。
3. **內網與路徑**：所有追蹤檔案中的 `*<internal-host>` 主機名替換為 `<internal-host>`（19 個檔案）；`forge/tomato.py` 的 `BASE` 預設改為空字串，未設定 `IMG2BABYLON_TOMATO_BASE` 時以明確錯誤退出，`grimoire/intake.md` 說明 tomato 是選配的內部生圖服務，任何生圖工具或使用者提供的圖都可以；`<home-path>` 在 `pipeline/NATIVE-COMMANDS.md` 改為 `$REPO`，歷史 plan 與 migration 文件中的改為 `<repo>`（8 個檔案）。
4. **授權**：根目錄 `LICENSE` Apache-2.0（與 `pipeline/` 一致）、`NOTICE` 註明 `pipeline/` 源自 img2threejs（Apache-2.0）並列出 `pipeline/LICENSE`。
5. **全歷史密鑰掃描**：`git log -p --all | grep -E` 常見樣式（`sk-`、`fal_`、`ghp_`、`AKIA`、32 位元十六進位對、`BEGIN PRIVATE KEY`）；有 `gitleaks` 時一併跑 `gitleaks git`。任何命中都先停下來給使用者看，不自行改寫歷史。
6. **glb-ready 與 export-glb 實作**（§3 到 §7），測試全綠。
7. **推送**：`git push origin main`（94 個既有 commit 加本計畫的 commit）。推送前由使用者確認。
8. **轉公開**：`gh repo edit wcAmon/img-to-babylon --visibility public --accept-visibility-change-consequences`，由使用者確認後執行；之後匿名 `git ls-remote` 驗證，記下 HEAD 的 sha 給 B 釘住。
9. **記錄**：本文件末尾加「發佈紀錄」：日期、sha、掃描結果。

## 10. 測試

- `glb-ready/tests/test_glb_audit.py`（stdlib unittest）：測試程式自己組 GLB（寫 JSON chunk 與 BIN chunk 的小工具）：單一立方體 12 面 → ok；同一 mesh 兩個 node 實例 → 24 面；外部 `uri` 影像 → fix；3000 px 的 PNG 檔頭 → fix；20,001 面 → reduce；有 skin 與 1 個 animation → 報告列出名稱、joint 數；`extensionsRequired` 含 Draco → fix；min y = 0.3 → fix（`requireGrounded`）；NaN 法線 → fix；`--json` 結構欄位齊全；結束碼 0/1/2。
- `glb-ready/tests/test_validate_retarget.py`：合成兩個只差一個 joint 名稱的 GLB → 失敗；相同 → 成功；權重和 0.9 → 失敗。
- `glb-ready/tests/test_blender_scripts.py`：找不到 Blender 時 `skipTest`。有時：以 Blender 產生 20 細分的 UV 球 GLB（約 1,600 面）與 60 細分版（約 14,000 面）作 fixture；`reduce_mesh.py --target 1000 --keep-uv` → 重讀面數 ≤ 1000 且 ≥ 900、UV 仍在、report.json 齊全、再跑一次沒 `--force` 失敗；`--rebuild-surface` → 無 UV、`requiresNewUV` true；`--protect` 盒子只碰到邊 → 結束碼 2；`repair_shell.py --shell-repair` 對翻面的球 → 體積為正、單一連通塊；`bake_atlas.py --source vertex-color --size 512 --height 1 --ground` → 一張 512 影像內嵌、高度 1.0、min y 0；`shrink_textures.py --max 256` 對 1024 貼圖的立方體 → 256；`render_review.py` → 六張圖與 manifest。背景模式守衛（`bpy.app.background` 為假時結束碼 2）無法在測試裡自動化，由實作時手動驗證一次並記在 report 慣例的說明裡。
- `viewer/scripts/export_glb_test.ts`：§6。
- 既有：`python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'`、`cd viewer && npx tsc --noEmit`。

## 11. 使用者驗收

1. §1 成功標準 1：新 session 只讀 `glb-ready/SKILL.md` 處理 `timber-lodge.glb`，結果上傳到 Nomen Land（C 完成前先用現有的 `create_upload`），在世界裡看外觀。
2. 成功標準 2 與 3 在本機執行並附報告檔。
3. 使用者在 GitHub 頁面確認 README、LICENSE、沒有內網字樣，然後下令轉公開。

## 12. 與 B 的接點

B 會用到：

- 釘住的 commit sha（§9.8）。
- `glb-ready/SKILL.md` 的內文（嵌入 Nomen Land 的 `assets/img-to-babylon/SKILL.md` 下半段），raw 網址 `https://raw.githubusercontent.com/wcAmon/img-to-babylon/<sha>/glb-ready/SKILL.md`。
- clone 指令：`git clone --depth 1 https://github.com/wcAmon/img-to-babylon && cd img-to-babylon && git checkout <sha>`。
- `glb-ready/SKILL.md` §4.1 最後一句（最後一道門是目標網站的檢查器）是 B 的頁面接上 `nomen-glb check` 的位置。
