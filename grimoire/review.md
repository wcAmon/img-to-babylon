# Review：gate、截圖、評分、修正

## 每 pass 驗證順序（快到慢，前面失敗就不必跑後面）

1. `cd viewer && npx tsc --noEmit`
2. `python3 forge/validate_spec.py viewer/models/<name>/spec.json --strict`（spec 改過才需要）
3. `npx tsx scripts/runtime_export.ts <name> --spec models/<name>/spec.json --out ../.img2babylon/<name>/runtime.json`
   → `python3 forge/check_colliders.py .img2babylon/<name>/runtime.json`
4. `npx tsx scripts/physics_test.ts <name> --spec models/<name>/spec.json`；有 hinge 時再跑一次加 `--nudge <capBodyId>`
   → spec 有 actuation 宣告時再跑 `npx tsx scripts/actuation_test.ts <name> --spec models/<name>/spec.json`
   （可動物件審查：宣告了但動不了 = FAIL；動作怪異先開 viewer 的可動物件面板目視）
5. 視覺截圖（agent browser tool；先 `cd viewer && npm run dev`）：
   - hero：`http://localhost:5173/#model=<name>`，存 `.img2babylon/shots/<name>-hero.png`
   - 碰撞線框：按「碰撞線框」鈕後再截，存 `<name>-collider.png`
   - 每張都要存檔後用 agent vision 讀回。
6. `python3 forge/compare.py .img2babylon/<name>/hero.png .img2babylon/shots/<name>-hero.png --out .img2babylon/<name>/sheet.png`
   → 先跑 Divine Eye（確定性、零 token）：
   `python3 forge/divine_eye.py --reference .img2babylon/<name>/hero.png --render .img2babylon/shots/<name>-hero.png --json`
   - **REJECT（硬失敗或 fidelity 未達標）→ 直接進修正流程，不花 agent vision**；
     依 hardGateFailures / 最低分訊號判斷 refine-code 還是 refine-spec。
   - PASS / LOW-CONFIDENCE → agent vision 看對照表評分（likeness 質感仍是 vision 的事）。
   - 把 `verdict`、`fidelity`、`signals.silhouetteIoU` 記進該 pass reviewHistory 的
     `eye` 欄位（如 `"eye": {"verdict": "pass", "fidelity": 0.45, "iou": 0.68}`）。

### 顯微鏡（區域審查）

需要單獨審查局部時，加 `--region x,y,w,h`；四個值是 0..1 分數，分別相對
reference 與 render 各自的前景 bbox，工具會在定位 bbox 後、計算訊號前裁切：

`python3 forge/divine_eye.py --reference ref.png --render render.png --region 0.2,0.0,0.6,0.4 --json`

臉區慣例先取 bbox 上段（例如上例）；實際 `x,y,w,h` 由 0008 監工驗收時依角色取景校準。
JSON 的 `region` 欄位會回報本次收到的四個分數。省略 `--region` 即維持全身審查。

PhysicsBody 要到 physics pass 才會建立（見 `build.md` 的 pass 契約），所以第 3、4 步
（runtime_export + check_colliders、physics_test）只在 physics pass 及其後（physics、
polish）執行；blockout/structure/material pass 只跑第 1、2、5、6 步。

## 評分（記入 spec 的 reviewHistory）

`{"pass": "<pass>", "likeness": 0-10, "colliderFit": 0-10, "eye": {...}, "action": "<動作>", "notes": "..."}`
- likeness ≥ 7 且 colliderFit ≥ 8 → 該 pass 通過（`next_pass.py done`）。
- colliderFit 看碰撞線框截圖：線框是否貼合視覺外形、有無明顯突出/縮水。
- **角色模型加 chirality 檢查**：左右成對零件（臂、腿、耳）必須互為**鏡像**而非
  平移複製——看 hero 圖確認不對稱特徵（髮旋、標誌、扣件）方向正確、左右手拇指
  朝身體內側。鏡像錯誤記 refine-code。

## 動作（唯一合法集合）

| 動作 | 時機 |
|---|---|
| continue | 通過，進下一 pass |
| refine-code | 幾何/材質/物理程式碼問題 |
| refine-spec | 尺寸、拆件、collider 定義本身錯 → 改 spec 後重跑 validate |
| request-input | 修正上限到（correction exit 3）或需要使用者決策 |
| stop | 使用者叫停或已完成 |

每次 refine-* 前先 `python3 forge/next_pass.py correction`；exit 3 → 一律 request-input。

## 陷阱：viewer 天際帶（M11）

viewer 地板 10 m 有限，預設 clearColor 是深藍：只要相機仰角不夠低，地板外的深色天際帶就入鏡，Divine Eye
把它當前景（bbox 拉成寬帶、IoU 0.1–0.3、aspectRatioDelta 大）。M10 處理包、M11 立牌都因此被 reject。
harness 已把 `scene.clearColor` 設成與受光地板同色（0.79/0.80/0.84）；截圖仍宜取主體填滿畫面、避免地平線。
白色主體配淺灰地板時 Divine Eye 遮罩也會退化（前景不在主連通塊）——這種 reject 依目視判定並在 reviewHistory 註明。

