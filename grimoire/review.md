# Review：gate、截圖、評分、修正

## 每 pass 驗證順序（快到慢，前面失敗就不必跑後面）

1. `cd viewer && npx tsc --noEmit`
2. `python3 forge/validate_spec.py viewer/models/<name>/spec.json --strict`（spec 改過才需要）
3. `npx tsx scripts/runtime_export.ts <name> --spec models/<name>/spec.json --out ../.img2babylon/<name>/runtime.json`
   → `python3 forge/check_colliders.py .img2babylon/<name>/runtime.json`
4. `npx tsx scripts/physics_test.ts <name> --spec models/<name>/spec.json`；有 hinge 時再跑一次加 `--nudge <capBodyId>`
5. 視覺截圖（agent browser tool；先 `cd viewer && npm run dev`）：
   - hero：`http://localhost:5173/#model=<name>`，存 `.img2babylon/shots/<name>-hero.png`
   - 碰撞線框：按「碰撞線框」鈕後再截，存 `<name>-collider.png`
   - 每張都要存檔後用 agent vision 讀回。
6. `python3 forge/compare.py .img2babylon/<name>/hero.png .img2babylon/shots/<name>-hero.png --out .img2babylon/<name>/sheet.png`
   → agent vision 只看這張表評分。

PhysicsBody 要到 physics pass 才會建立（見 `build.md` 的 pass 契約），所以第 3、4 步
（runtime_export + check_colliders、physics_test）只在 physics pass 及其後（physics、
polish）執行；blockout/structure/material pass 只跑第 1、2、5、6 步。

## 評分（記入 spec 的 reviewHistory）

`{"pass": "<pass>", "likeness": 0-10, "colliderFit": 0-10, "action": "<動作>", "notes": "..."}`
- likeness ≥ 7 且 colliderFit ≥ 8 → 該 pass 通過（`next_pass.py done`）。
- colliderFit 看碰撞線框截圖：線框是否貼合視覺外形、有無明顯突出/縮水。

## 動作（唯一合法集合）

| 動作 | 時機 |
|---|---|
| continue | 通過，進下一 pass |
| refine-code | 幾何/材質/物理程式碼問題 |
| refine-spec | 尺寸、拆件、collider 定義本身錯 → 改 spec 後重跑 validate |
| request-input | 修正上限到（correction exit 3）或需要使用者決策 |
| stop | 使用者叫停或已完成 |

每次 refine-* 前先 `python3 forge/next_pass.py correction`；exit 3 → 一律 request-input。
