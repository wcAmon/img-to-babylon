# img2babylon

本 repo 是 `img2babylon` skill 的正典來源。入口與全部規則在 `SKILL.md`——先讀它。

Host 入口 symlink（單一 checkout，嚴禁複製兩份導致漂移）：

```text
~/.claude/skills/img2babylon -> 本 checkout
~/.codex/skills/img2babylon  -> 本 checkout
```

- forge/ 只准 Python 3.10+ stdlib，零第三方依賴。
- viewer/ TypeScript strict；驗證命令見 SKILL.md 第 5 步。
- viewer 是套件入口（`src/index.ts`）；姊妹專案 image-to-physics 以路徑別名或
  `file:` 連結本 checkout。契約歸本 repo，控制層歸物理 repo。
- `reference/` 是外部參考 checkout（img2threejs），唯讀、不納版控。
- 全套驗證：`python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'`
  ＋ `cd viewer && npx tsc --noEmit && npx tsx scripts/physics_test.ts <model> --spec models/<model>/spec.json`。
- 本機瀏覽器 gate：Chrome 擴充未連線、Firefox headless 無 WebGL，但 **playwright MCP
  的 chromium 可渲染 WebGL**——`browser_navigate` 開 `http://localhost:5173/#model=<name>`
  後用 `browser_evaluate` 呼叫 `window.__IMG2BABYLON_CAPTURE__`（setCamera + screenshot
  回傳 base64，存進 `.img2babylon/shots/`）。注意：頁面載入後第一次 setCamera 常不生效，
  同一次 evaluate 內先 setCamera、等 400ms、再 setCamera 一次後截圖。PhysicsViewer
  線框走 utility layer，render-target 截圖照不到——改用 playwright 視口截圖。
  另：`togglePhysicsViewer()` 從 `browser_evaluate` 呼叫常不生效，改用 snapshot 找
  「碰撞線框」按鈕 `browser_click`；改 hash 參數（如 `physics=0`）不會觸發 reload，
  要 `location.reload()` 後等 ~900ms。
- **物理尺度（M8 0015a）**：action-figure 的物理世界＝spec 尺寸 ×10（`physicsScale`，
  9 cm 玩具尺度低於 Havok 數值地板，站立／抗推全是混沌）。hash `#scale=1` 可開玩具世界
  但物理不保證。`__IMG2BABYLON_CAPTURE__.setCamera` 收 **spec 座標**（radius/target 內部
  乘 physicsScale），截圖與 S=1 像素一致；gate script 的絕對量依相似律換算（長度 ×S、
  時間 ×√S、衝量 ×S^3.5），比率型門檻不動。
- `.img2babylon/`（gitignored）是執行期狀態；state.json 一次只屬於一個模型，
  換模型用 `next_pass.py init --model <name> --force`。
