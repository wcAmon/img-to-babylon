# Scripts 速查

（工作目錄：repo 根；viewer 命令需先 cd viewer）

| 命令 | 用途 |
|---|---|
| `python3 forge/next_pass.py init --model <name>` | 初始化狀態機 |
| `python3 forge/next_pass.py status` | 當前 pass 與修正次數 |
| `python3 forge/next_pass.py done` | 完成當前 pass |
| `python3 forge/next_pass.py correction` | 登記一次修正（exit 3 = 上限） |
| `python3 forge/tomato.py gen --prompt "..." --seed N --out p.png` | 生參考圖 |
| `python3 forge/tomato.py edit --image a.png --prompt "..." --out b.png` | 指令式修圖 |
| `python3 forge/tomato.py views --image hero.png --out-dir d/` | 補側/背視角 |
| `python3 forge/new_spec.py --name <name> --out viewer/models/<name>` | spec 模板 |
| `python3 forge/validate_spec.py <spec> --strict` | spec gate（exit 2 = 未過） |
| `python3 forge/check_colliders.py <runtime.json>` | 靜態物理 gate |
| `python3 forge/compare.py ref.png render.png --out sheet.png` | 並排對照表 |
| `npx tsc --noEmit` | typecheck |
| `npx tsx scripts/runtime_export.ts <name> --spec models/<name>/spec.json --out out.json` | 匯出 AABB |
| `npx tsx scripts/physics_test.ts <name> --spec models/<name>/spec.json [--nudge <bodyId>]` | 動態物理 gate（有 hinge 時 `--spec` 才會查約束是否被扯開） |
| `npm run dev` | 開 viewer（http://localhost:5173/#model=<name>&physics=1） |
| `python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'` | forge 全測試 |
