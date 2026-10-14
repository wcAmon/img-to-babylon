# img2babylon — Agent 看圖製作 3D 物件

先讀 `SKILL.md`（路由與鐵律）。交付物是 GLB 時改讀 `glb-ready/SKILL.md`。文件中「agent vision」＝你的圖片閱讀能力；「agent browser tool」＝你的瀏覽器工具，沒有就請使用者提供截圖。

- forge/、glb-ready/scripts/glb_audit.py、validate_retarget.py 只准 Python stdlib；glb-ready 的其他腳本只在 Blender 背景模式執行。
- 驗證：`python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'`、`python3 -m unittest discover -s glb-ready/tests -t . -p 'test_*.py'`（找不到 Blender 時 Blender 測試會 skip）、`cd viewer && npx tsc --noEmit && npx tsx scripts/export_glb_test.ts`。
- 角色工作室（character-studio）是獨立專案；不要在此重建角色流程。
