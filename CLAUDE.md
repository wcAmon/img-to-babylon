# img2babylon

本 repo 是 `img2babylon` skill 的正典來源。入口與全部規則在 `SKILL.md`——先讀它。

Host 入口 symlink（單一 checkout，嚴禁複製兩份導致漂移）：

```text
~/.claude/skills/img2babylon -> 本 checkout
~/.codex/skills/img2babylon  -> 本 checkout
```

- forge/ 只准 Python 3.10+ stdlib，零第三方依賴。
- viewer/ TypeScript strict；驗證命令見 SKILL.md 第 5 步。
- `reference/` 是外部參考 checkout（img2threejs），唯讀、不納版控。
- 全套驗證：`python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'`
  ＋ `cd viewer && npx tsc --noEmit && npx tsx scripts/physics_test.ts <model> --spec models/<model>/spec.json`。
- 本機瀏覽器 gate 受限：Chrome 擴充未連線、Firefox headless 無 WebGL——視覺驗證用
  headless 匯出替代，實機目視請使用者開 `npm run dev`。
- `.img2babylon/`（gitignored）是執行期狀態；state.json 一次只屬於一個模型，
  換模型用 `next_pass.py init --model <name> --force`。
