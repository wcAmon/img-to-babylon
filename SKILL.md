---
name: img2babylon
description: 從一張參考圖（或文字描述經 tomato-image 生圖）以程式碼重建 Babylon.js 程序化 3D 模型，附真實 Havok 物理碰撞（複合形狀、質量、hinge 約束），可丟擲、堆疊、翻倒。
version: 0.1.0
---

# img2babylon

Agent-agnostic：可在 Claude Code 或 Codex 下執行。文中「agent vision」指 host 的圖片
閱讀能力；「agent browser tool」指 host 的瀏覽器工具（或使用者提供的截圖）。

工作目錄：本 repo 根目錄。viewer 的 npm 命令在 `viewer/` 下執行。

## 鐵律

1. 只能用程式碼建模（primitives / CSG / DynamicTexture），禁止外部 mesh 或貼圖資產。
2. 證據落地：每張截圖先存檔到 `.img2babylon/shots/`，再用 agent vision 讀回；
   行內預覽不是證據。
3. 一次只看一張並排對照表（`forge/compare.py` 產生）。
4. 物理是一等公民：spec 的 `physics` 區塊不可省略；三層物理 gate 全綠才算完成。
5. 修正上限：每 pass 3 次、全程 6 次（`forge/next_pass.py correction` 會擋，exit 3 = 停）。
6. 尺寸烘進幾何建構參數，不用 `scaling` 承載尺寸。
7. 決定性：所有程序化雜訊帶 seed；單位一律公尺。
8. 物理權威是 `physics.constraints`；`attachment` 只描述視覺對位。

## 順序（Order of Operations）

0. 初始化：`python3 forge/next_pass.py init --model <name>`
1. 取得參考圖（讀 `grimoire/intake.md`）：
   文字描述 → `python3 forge/tomato.py gen --prompt "..." --seed N --out .img2babylon/<name>/hero.png`；
   需要側/背視角 → `forge/tomato.py views`。tomato 不可達 → 降級為使用者提供圖片。
2. agent vision 分析參考圖，依 `grimoire/spec.md` 撰寫 `viewer/models/<name>/spec.json`
   （模板：`python3 forge/new_spec.py --name <name> --out viewer/models/<name>`）。
3. Gate：`python3 forge/validate_spec.py viewer/models/<name>/spec.json --strict`
   全綠才可產碼；未過 → 修 spec，不准先寫程式。
4. 依 `grimoire/build.md` 與 `grimoire/physics.md` 撰寫
   `viewer/models/<name>/create<Name>Model.ts` 並在 `viewer/src/registry.ts` 註冊。
   一次只完成 `next_pass.py status` 顯示的當前 pass；每 pass 結束跑第 5 步後
   `python3 forge/next_pass.py done`。
5. 每 pass 的驗證（讀 `grimoire/review.md`）：
   a. `cd viewer && npx tsc --noEmit`
   b. `npx tsx scripts/runtime_export.ts <name> --spec models/<name>/spec.json --out ../.img2babylon/<name>/runtime.json`
      → `python3 forge/check_colliders.py .img2babylon/<name>/runtime.json`
   c. `npx tsx scripts/physics_test.ts <name>`（有 hinge 時加 `--nudge <bodyId>`）
   d. agent browser tool 開 `http://localhost:5173/#model=<name>` 截圖（hero、
      碰撞線框各一）→ `forge/compare.py` 產對照表 → agent vision 目視評分。
   e. 未過 → `python3 forge/next_pass.py correction`（exit 3 = 停下來問使用者），
      依 review.md 選動作：continue | refine-spec | refine-code | request-input | stop。
6. polish pass 完成且三層物理 gate 全綠 → 收尾（commit、告知使用者）。

## 檔案地圖

| 路徑 | 用途 |
|---|---|
| `grimoire/intake.md` | 參考圖取得與分析契約 |
| `grimoire/spec.md` | BabylonSculptSpec v1 撰寫指南（含完整藥罐範例） |
| `grimoire/build.md` | Babylon 幾何模式與 pass 契約 |
| `grimoire/physics.md` | Havok collider / 質量 / hinge 契約 |
| `grimoire/review.md` | review gate、評分、修正動作 |
| `grimoire/scripts.md` | 全部工具命令速查 |
| `forge/*.py` | 確定性工具（tomato / new_spec / validate_spec / next_pass / check_colliders / compare） |
| `viewer/` | Vite + Babylon + Havok viewer 與 headless 腳本 |
