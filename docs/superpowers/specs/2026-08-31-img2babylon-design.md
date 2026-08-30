# img2babylon — 設計文件

日期：2026-08-31
狀態：已與使用者確認方向（方案 A、精簡核心版、tomato 為主、物理模擬互動、揀蓋式藥罐驗收）

## 1. 目標與定位

讓 agent（Claude Code 或 Codex CLI）從一張參考圖出發，**以程式碼**產生 Babylon.js
程序化 3D 模型，且模型帶有**真實可用的物理碰撞**（Havok rigid body：質量、摩擦、
複合碰撞形狀），可被丟擲、堆疊、翻倒。

與 reference（`reference/img2threejs`）的關鍵差異：

| | img2threejs (reference) | img2babylon (本專案) |
|---|---|---|
| 渲染引擎 | Three.js | Babylon.js |
| collider | 僅 metadata（JSON 描述，不實例化） | 一等公民：真實 Havok `PhysicsAggregate` / `PhysicsShapeContainer` |
| 物理驗證 | 無 | 靜態 gate + headless 動態模擬 + PhysicsViewer 目視 |
| 圖片來源 | 使用者提供 | **tomato-image 為主**（文字→生圖→建模），使用者圖片為降級路徑 |
| 規模 | ~90 個 Python 模組 | 精簡核心 ~8 個工具 |

不做（YAGNI，明確排除）：角色骨架/rigging、頭髮系統、CS2 武器軌、likeness 投影、
GLB 軌、BM25 spec 檢索、材質參考管線。只做 `object` 類主體。

## 2. 完整流程

```
文字描述 ──► forge/tomato.py 生參考圖（可 edit 補側視/背視圖）
                │            （tomato 不可達 → 降級為使用者提供圖片）
                ▼
        agent vision 看圖 ──► 填寫 BabylonSculptSpec（componentTree + physics）
                ▼
        forge/validate_spec.py ──► 嚴格品質 gate（擋淺 spec 於產碼之前）
                ▼
        forge/next_pass.py 鎖定 pass 順序：
        blockout → structure → material → physics → polish
        agent 依 grimoire 契約親自撰寫 TypeScript factory（方案 A）
                ▼
        viewer（Vite + Babylon + Havok）渲染
        ├─ forge/check_colliders.py     靜態物理 gate（純數學）
        ├─ viewer/scripts/physics_test.mjs  headless 動態模擬（NullEngine）
        └─ agent browser tool 截圖 ──► forge/compare.py 對照表 ──► 目視 review
                ▼
        自我修正迴圈（每 pass ≤3 次、全程 ≤6 次）──► 完成
```

## 3. 目錄結構（專案根 = `/home/wake/projects/img2three`）

```
SKILL.md                  # agent-agnostic 路由器；唯一總是載入的文件
CLAUDE.md                 # 極薄 host 入口（指向 SKILL.md）＋ symlink 規則
AGENTS.md                 # Codex 入口（同上，極薄）
grimoire/
  intake.md               # 圖片分析契約 + tomato 生圖/補視角流程與降級規則
  spec.md                 # BabylonSculptSpec 撰寫指南（含完整範例）
  build.md                # Babylon 幾何模式：MeshBuilder、CSG2、程序化材質、pass 契約
  physics.md              # Havok 契約：collider 型式、質量/密度、複合形狀、constraint
  review.md               # review gate、截圖規則、自我修正動作與上限
  scripts.md              # 工具速查表（每支腳本的旗標與範例）
forge/                    # 純 Python 3.10+ stdlib，零第三方依賴
  tomato.py               # tomato-image 客戶端：generate / edit / 多視角；503 退避
  new_spec.py             # 產生 spec 模板（藥罐等級的預填範例）
  validate_spec.py        # schema 驗證 + --strict 品質 gate
  next_pass.py            # pass 狀態機；讀寫 .img2babylon/state.json
  check_colliders.py      # 靜態物理 gate（讀 viewer 匯出的 runtime JSON）
  compare.py              # 參考圖×渲染圖並排對照表（stdlib PNG 讀寫）
  tests/                  # stdlib unittest
viewer/                   # in-repo Vite + TypeScript + Babylon.js + Havok
  package.json
  src/main.ts             # 場景 host；載入 registry 選定模型
  src/capture.ts          # window.__IMG2BABYLON_CAPTURE__：setCamera/screenshot/
                          #   togglePhysicsViewer；runtime_export.ts（headless 匯出）供 gate 用 JSON
  src/harness.ts          # 物理沙盒：地面、落下、丟球、堆疊、滑鼠抓取
  src/registry.ts         # 模型註冊表
  models/<name>/create<Name>Model.ts   # 生成產物
  scripts/physics_test.ts # headless（tsx 執行）：NullEngine + Havok WASM 模擬 5 秒，輸出判定 JSON
docs/superpowers/specs/   # 設計文件（本檔）
.img2babylon/             # 執行期狀態（state.json、截圖、比對表；gitignored）
```

`reference/` 保持原樣且 gitignored——它是外部 checkout，僅供參考。

## 4. BabylonSculptSpec（schema v1）

單一 JSON 檔 `models/<name>/spec.json`。頂層必填：
`targetName`、`sourceImages`、`coordinateFrame`、`silhouette`、`componentTree`、
`materials`、`physics`、`buildPasses`、`reviewHistory`。

`sourceImages[]`：`{ role: hero|side|rear, path, origin: tomato|user, tomatoJobId?, prompt? }`。

`componentTree[]`（遞迴，經 `parent`）：

```jsonc
{
  "id": "cap", "name": "flip-top cap", "level": "macro",   // macro|meso|micro
  "primitive": "cylinder",   // box|sphere|cylinder|capsule|torus|tube|extrude|lathe|csg
  "dimensions": { "w": 0.05, "h": 0.02, "d": 0.05, "units": "m", "confidence": 0.8 },
  "transform": { "position": [0, 0.11, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
  "parent": "body",
  "attachment": { "type": "hinge|fixed|detachable|none", "socket": "body:rim-back",
                  "hinge": { "pivot": [0, 0, -0.024], "axis": [1, 0, 0],
                             "limits": [0, 1.92] } },   // 弧度
  "material": "amber-plastic",
  "collider": {                       // macro 元件必填；meso/micro 可省略
    "type": "box|sphere|capsule|cylinder|convex",
    "size": [0.05, 0.02, 0.05], "offset": [0, 0, 0], "confidence": 0.8
  }
}
```

`physics`（組件層級）：

```jsonc
{
  "bodies": [                          // 每個獨立剛體一條；藥罐 = body + cap 兩條
    { "id": "body", "components": ["body", "label", "thread"],
      "mass": 0.04, "friction": 0.5, "restitution": 0.3, "centerOfMass": [0, -0.01, 0] },
    { "id": "cap", "components": ["cap"], "mass": 0.008, "friction": 0.5, "restitution": 0.3 }
  ],
  "constraints": [
    { "type": "hinge", "bodyA": "body", "bodyB": "cap",
      "pivotA": [0, 0.10, -0.024], "pivotB": [0, -0.01, -0.024],
      "axis": [1, 0, 0], "limits": [0, 1.92] }
  ]
}
```

權威歸屬：`attachment` 只描述視覺階層與對位（建模用）；**物理行為一律以
`physics.constraints` 為權威**。`validate_spec.py` 檢查兩者一致（同 axis、pivot 差
≤ 5 mm），不一致即擋下，避免視覺鉸鏈與物理鉸鏈漂移。

嚴格品質 gate（`validate_spec.py --strict`）的擋件規則：
- 每個 `physics.bodies[].components` 中的 macro 元件都要有 `collider`；
- 每個元件恰屬於一個 body（不可遺漏、不可重複）；
- 複雜度啟發式：componentTree 只有一個節點但 silhouette 標記為 complex → 擋下；
- `constraints` 引用的 body id 必須存在；hinge 必有 axis 與 limits。

## 5. 產出物合約（factory 介面）

```ts
export function createPillBottleModel(scene: Scene, opts?: { physics?: boolean }): {
  root: TransformNode;                      // 視覺根節點
  nodes: Record<string, TransformNode>;     // 每元件一個 pivot node
  meshes: Record<string, Mesh>;
  bodies: Record<string, PhysicsBody>;      // physics: true 時，每 body 一個
                                            // （V2 API：PhysicsBody + PhysicsShapeContainer 複合形狀）
  constraints: Physics6DoFConstraint[];     // hinge 以 6DoF 鎖五軸 + 單角軸 limit 實作
  dispose(): void;
};
```

規則（grimoire/build.md + physics.md 契約）：
- 每個 macro/meso 元件一個 pivot `TransformNode`（`<id>__pivot`），visual mesh 是其子節點；
- collider 形狀由 spec 的 `collider` 生成 `PhysicsShape`，同 body 多元件 → `PhysicsShapeContainer` 複合；
- runtime JSON（供靜態 gate）由 headless 腳本以 NullEngine 匯出，瀏覽器僅負責視覺截圖；
- 尺寸烘進幾何參數，不用 `scaling` 承載尺寸（避免 collider 與 mesh 不同步）；
- 程序化材質（`DynamicTexture` 畫標籤等），禁止外部貼圖資產；
- 決定性：所有雜訊帶 seed；
- metadata：`root.metadata.sculptRuntime = { nodes, meshes, bodies, constraints }`。

## 6. 物理驗證三層 gate

1. **靜態（check_colliders.py）**：headless 腳本 `runtime_export.ts` 把每 mesh 的世界 AABB、
   每 collider 的世界 AABB、質量與 body 對應輸出成 JSON；Python 驗證
   (a) collider AABB ⊇ mesh AABB（容差 ±10%）、(b) 兄弟 collider 重疊體積
   ≤ embed 容差、(c) 密度落在 50–3000 kg/m³ 合理帶、(d) 每 body 質心在其 collider 聯集內。
2. **動態（physics_test.mjs）**：NullEngine + Havok，無渲染。情境：模型從 0.3 m
   落到地面，模擬 5 秒。判定：最終線速度 < 0.01 m/s（會靜止）、y > 0（沒穿地）、
   位置有限（沒爆炸）；hinge 案例額外做「開蓋後放手」檢查蓋子停在 limit 範圍內。
   輸出 JSON 判定，可進 CI。
3. **目視**：`togglePhysicsViewer(true)` 顯示 Havok 線框 → agent browser tool 截圖 →
   確認 collider 貼合視覺外形。與參考圖比對用 `compare.py` 並排表，一次一張。

## 7. Codex CLI 整合

- SKILL.md 全文 agent-agnostic：凡涉能力處寫「agent vision」「agent browser tool」，
  不指名 host 專屬工具；Claude Code 用 claude-in-chrome，Codex 用其瀏覽器工具或
  使用者提供的截圖。
- 單一 checkout、雙 symlink（沿用 reference 的 CLAUDE.md 規則，嚴禁複製兩份）：
  `~/.claude/skills/img2babylon → /home/wake/projects/img2three`
  `~/.codex/skills/img2babylon  → /home/wake/projects/img2three`
- `AGENTS.md` 供 Codex 讀取，內容與 CLAUDE.md 同樣極薄：指向 SKILL.md。
- 驗收：`codex exec` 跑端到端冒煙任務（見 §9 驗收二），證明 Codex 能駕駛整條 pipeline。

## 8. 錯誤處理

- tomato 503 → 讀 `Retry-After` 退避重試（≤3 次）；仍失敗或不可達 → 明確告知並降級
  為使用者提供圖片。
- Havok WASM 載入失敗 → viewer 顯性報錯 banner，`physics_test.mjs` 以非零碼結束。
- 修正迴圈：動作限 `continue|refine-spec|refine-code|request-input|stop`；
  每 pass ≤3 次、全程 ≤6 次；狀態記在 `.img2babylon/state.json`。
- 截圖必須落地成檔並用 agent vision 讀回，行內預覽不算證據（沿用 reference 鐵律）。

## 9. 測試與驗收

- forge：`python3 -m unittest discover -s forge/tests`（validate/check_colliders/tomato
  的離線邏輯，樣本 JSON 驅動）。
- viewer：`tsc --noEmit` typecheck；`physics_test.mjs` 兼作煙霧測試。
- **驗收一（Claude Code）**：揀蓋式藥罐——tomato 生參考圖 → 建模 → 三層物理 gate 全綠
  → 瓶身可丟擲落地靜止、蓋子可沿 hinge 開合且受 limit 約束。
- **驗收二（Codex CLI）**：`codex exec` 以同一 SKILL.md 完成一個簡單物件（如木箱）
  端到端，證明 agent-agnostic 成立。

## 10. 實作順序（供 writing-plans 參考）

viewer 骨架（含 capture/harness/physics_test）→ forge 工具 → grimoire 契約 →
SKILL.md 路由器 → symlink → 驗收一（藥罐）→ 驗收二（codex exec）。

## 11. Roadmap（日後，不在本次範圍）

- **本地模型駕駛**：Codex CLI `model_providers` 指向 tomato `/v1`
  （gemma-4-26b-a4b 已具 vision + tool calling），`codex --profile local` 即可跑同一份
  SKILL.md；零新程式碼，僅 `~/.codex/config.toml` 設定。
- **Headless 截圖備援**：`viewer/scripts/capture_playwright.mjs`（opt-in），讓沒有
  browser tool 的 harness 也能產生落地截圖，仿 reference 的
  `capture_threejs_playwright.py`。
