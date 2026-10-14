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
# 每個模型獨立迭代（2026-09-13）

舊指令不變。全域位置加入 `--model NAME` 可使用獨立狀態，保留舊 `.img2babylon/state.json`：

```sh
python3 forge/next_pass.py --model <model> status
python3 forge/model_report.py viewer/models/<model> --write
```

新模型初始化：`python3 forge/next_pass.py --model NAME init --model NAME`。
受版本管理的 `viewer/models/NAME/iteration-state.json` 是本機 state 不存在時的恢復來源。
`revise --from-pass structure --reason '...'` 僅允許已完成 cycle；會先快照 model/runtime，再更新 metadata，不能繞過未完成 cycle 的修正上限。

## 每輪修正上限（使用者更新）

每輪允許 6 次修正，第 7 次 exit 3；全程與各 pass 累計僅供追蹤。新輪指令：

```sh
python3 forge/next_pass.py --model <model> iterate --reason "本輪臉部目標"
```

工具先保存 `rounds/rNNN-roundNNN/model`、共用 runtime 與 state，再開始新輪；保留未完成的 pass、失敗審查與全程計數。不可在額度耗盡時自動換輪規避上限。

## glb-ready（交付 GLB）

| 命令 | 用途 |
|---|---|
| `python3 glb-ready/scripts/glb_audit.py out.glb [--profile nomen-land] [--json]` | GLB 稽核（exit 0 ok / 1 不過 / 2 讀不了） |
| `cd viewer && npm run export-glb -- <id> out.glb [--pose settled]` | 程序化模型匯出 GLB |
| `blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/reduce_mesh.py -- in.glb out.glb --target 20000` | 減面（靜態網格） |
| 其餘腳本見 `glb-ready/SKILL.md` | repair_shell、bake_atlas、shrink_textures、render_review、retarget_clips、validate_retarget |
| `python3 -m unittest discover -s glb-ready/tests -t . -p 'test_*.py'` | glb-ready 全測試 |
