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
