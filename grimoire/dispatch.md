# Dispatch：任務卡與 Codex 派工監督迴圈

重點是 harness 不是物件：模型問題不直接動手修，走「任務卡 → 派工 → 獨立驗收」。

## 任務卡（tasks/NNNN-slug.md）

```markdown
# NNNN 一句話症狀
model: <model-name>        status: open | dispatched | done | blocked
症狀: 使用者視角的問題描述＋已知的技術背景（引 grimoire 相關陷阱）
驗收: 可機器執行的命令與斷言（gate 為準——先把驗收斷言寫進 gate 讓它變紅，
     Codex 的工作就是讓它變綠）
notes: 各輪派工的結果摘要（誰、何時、改了什麼、gate 輸出要點）
```

## 監督迴圈

1. **寫卡**：症狀＋可機器驗收的標準。驗收斷言先寫進對應 gate（紅燈先亮）。
2. **派工**：`codex exec --cd <repo> --sandbox workspace-write "<prompt>"`。
   prompt 必含：任務卡全文、驗收命令、約束（不准改 gate 斷言與門檻、不准視覺
   作弊——gate 量的是 physics body、既有 gate 全綠、不准 commit）。
3. **獨立驗收**：不信 Codex 的自我回報，自己重跑驗收命令＋全套迴歸
   （forge tests、tsc、physics_test 各模型、actuation_test、check_colliders）。
4. **收尾**：綠 → 卡標 done、記 notes、commit（訊息註明 dispatched-to-codex）；
   紅 → 把 gate 輸出**原文**回饋重派。上限 3 輪，仍紅 → 卡標 blocked ＋
   request-input（或經使用者同意後接手）。
5. 「證明做不到」也是合格產出：Codex 帶證據（探針數據）回報 → 記入卡片
   notes → 與使用者討論改驗收標準或改路線。

## 前置（一次性）

`~/.codex/skills/img2babylon` symlink 指向本 checkout（與 CLAUDE.md 的宣告一致），
Codex 才讀得到同一份 SKILL.md／grimoire。
