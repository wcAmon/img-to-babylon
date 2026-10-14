# Blender 修整能力（兩專案皆保留）

img-to-babylon 持續擁有 Blender 表面修整、法線修復、UV/貼圖烘焙、表面局部顏色插補及渲染工具。相同實作也保留於獨立 character-studio，沒有指向該專案的 Python import 或執行依賴。

工具位於 pipeline/scripts/。`yui_*.py` 名稱保留以便重現既有實驗；人物遮罩、比例和投影相機屬 yui 校準，不能直接套到其他物件。製作新物件時複製腳本成該物件的專用版本，先校準單位、座標與遮罩，再輸出獨立候選。

- yui_trellis_refine_blender.py：GLB → 表面/法線修復；參數 input.glb output.glb，--orientation-only 或 --shell-repair。即使 orientation-only 仍含輕度平滑，並非完全不改幾何。
- yui_r8_surface.py：Blender 表面平滑；輸入 blend、輸出 GLB。先檢查實際模型選取與遮罩。
- yui_r8_unfold.py：UV 展開。
- yui_r8_texture.py、yui_r9_texture.py、yui_r10_texture.py：依原校準圖投影/烘焙；輸入 blend、輸出 GLB、正面圖、三視圖。
- yui_skin_inpaint.py：保留幾何與 UV 的區域顏色插補；輸入 blend、輸出 GLB，內含 yui 臉頰/頸部遮罩。
- yui_render_blender.py：blend 多角度渲染。
- render_repair.py：GLB 多角度渲染，現有相機為人物高度。
- materialize.py、repair_yui_skin.py：靜態單 mesh GLB 的修整紀錄重播與表面色彩修復，需 numpy/Pillow/scipy；不是 forge stdlib 工具。

例如：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python pipeline/scripts/yui_trellis_refine_blender.py -- /absolute/input.glb /absolute/candidate.glb --shell-repair
```

每次保留原始來源、分離輸出、記錄雜湊與參數，先看素模再看材質，檢查多角度。不可因能輸出 GLB 就宣稱品質通過。角色資產及具體 yui 歷史移至 ../character-studio/，本專案保留 Agent 看圖到程序化 Babylon/Havok 物件流程。
