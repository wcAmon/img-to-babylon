# img2babylon — Agent 看圖製作 3D 物件

先讀 SKILL.md、pipeline/PORTING.md、pipeline/SKILL.md。agent vision 是圖片閱讀能力，agent browser tool 是瀏覽器工具。

本專案集中於 agent see image → 3D object production，保留 Babylon/Havok、程序化建模與 Blender 表面/材質修整能力。Blender 使用說明見 grimoire/blender_refinement.md。forge/ 與 pipeline/forge/ 只准 Python stdlib；Blender/第三方修整工具留在 pipeline/scripts/。

Character Studio 已獨立至 ../../../character-studio/。角色模型、前後端、Trellis2 → Blender 修整歷史在該專案管理；不要在此重建角色工作室。舊 yui 模型及 artifact 路徑暫留唯讀相容連結，不能視為本專案擁有的資產。

需要將本專案產出的新角色交接工作室：python3 ../../../character-studio/server/finalize_model.py --id <stable-id> --name <display-name> --glb <absolute-final-glb>。同角色精修走 proposal，不覆寫基底。

保留使用者 viewer/src/sculpt/inspector.ts 的未提交修改。
