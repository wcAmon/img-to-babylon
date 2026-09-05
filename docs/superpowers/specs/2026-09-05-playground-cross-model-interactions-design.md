# M14 設計：playground 跨模型互動——吸附粉×水漬、消毒噴霧×水漬（2026-09-05）

狀態：使用者核准設計方向（三條規則、`interactions.ts` 由 `installUi` 掛載、點滴袋卡片顯示狀態、scene_test +3 用真顆粒／真液滴、grimoire 不動）。
実測定案（同日）：scene_test 31/31；瀏覽器撒粉 40 顆全凝固、水漬 35%，噴灑 60 滴全吸收、消毒 100%。gate 佈點修正見 §5 末。
候選來源：`docs/next-steps.md` 第 1 項。前作：M13 `2026-09-05-playground-grab-lift-design.md`。

## 1. 目標與範圍

十件物件各自可動，但彼此無關：粉罐倒在水漬上什麼都不發生、噴瓶噴在水漬上也一樣。本里程碑讓流程卡第 4 步
「吸附、清除、消毒」在 playground 裡看得見結果：**撒粉→水漬縮小、顆粒凝固 → 鏟起（M13）→ 噴消毒→水漬變色**。

- 只改 `../playground`；契約側（viewer／forge／grimoire）不動。playground 依賴的名稱都已是 grimoire/spec.md 寫定的契約：
  rupture 的 `meshes["puddle"]`、`bodies["droplet-<i>"]`；pour 的 `bodies["grain-<i>"]`／`meshes["grain-<i>"]`。
- 粉罐顆粒與噴瓶液滴的 body key **都叫** `grain-<i>`，只能靠所屬模型（`placed.entry.model`）分辨，不能靠名字。
- 三條規則（每個物理步做幾何檢查，無碰撞回呼、無新約束）：

| # | 觸發 | 條件 | 效果 |
| --- | --- | --- | --- |
| A | 粉罐顆粒 × 水漬 | 顆粒中心 y ≤ 0.012（靜置 0.005）且落在水漬**足跡**內 | 顆粒換成凝固材質 `clump`；水漬可見半徑比例 `rScale = max(0.35, 1 − 0.65 × 吸附數／30)`（30 顆縮到殘漬 0.35，不消失） |
| B | 粉罐顆粒 × 點滴袋液滴 | 未凝固顆粒與液滴中心距 ≤ 0.015（半徑和 0.011 + 0.004） | 液滴 dispose（body＋transformNode，同 collect 作法）；顆粒凝固；不影響水漬大小 |
| C | 噴瓶液滴 × 水漬 | 液滴中心 y ≤ 0.010（靜置 0.003）且落在水漬足跡內 | 液滴 dispose；消毒度 `disinfected = min(1, 吸收數／20)`；水漬材質 diffuse 由黃 (0.90, 0.82, 0.40) 線性內插到淡藍灰 (0.72, 0.82, 0.86)、alpha 0.55 → 0.25 |

- **足跡**＝破裂時長滿的原始水漬範圍（`puddleRadius` × 長大進度上限），**不隨 A 縮小**：可見水漬縮了，地面仍是濕的，
  粉倒在原範圍任何位置都吸得到、消毒也是對整個潑灑面。若用縮小後的半徑判定，使用者在一點倒粉、水漬邊緣退過該點後就再也吸不到。
- 凝固顆粒維持 DYNAMIC（只換材質），仍可被鏟進袋、被封袋收走；不加阻尼、不改質量。
- 噴瓶液滴被水漬吸收後 dispose：質量早在噴出時轉移，面板總重不變，語意同 collect。

## 2. 做法選擇

1. **每步幾何掃描（採用）**：顆粒最多 40、噴霧 60、液滴 12，每步 ≤ 40×12 次距離比較，可忽略；headless 可測；不碰 Havok 碰撞事件。
2. Havok 碰撞回呼（`setCollisionCallbackEnabled`＋觸發體）：水漬是純視覺 mesh 無 body，得另建觸發 body；回呼在 Havok 內部節流，對 6 mm 液滴不可靠。不採。
3. 把互動寫進模型契約（新 actuator kind）：互動是兩個模型之間的規則，不屬任一模型；契約側不動。不採。

## 3. 模組 `src/interactions.ts`（無 DOM、headless 可跑）

```ts
export interface InteractionState {
  readonly puddle: { remaining: number; disinfected: number } | null; // remaining = 可見半徑比例 rScale；無水漬為 null
  readonly absorbedGrains: number;   // 規則 A 累計（規則 B 凝固的顆粒不計）
  readonly absorbedDroplets: number; // 規則 B 累計
  readonly sprayAbsorbed: number;    // 規則 C 累計
}
export function installInteractions(scene: Scene, placed: () => Placed[]): InteractionState;
```

單一 `scene.onAfterPhysicsObservable`（跟在物理步後、模型的 grow 觀察者之前）：

- 每步從 `placed()` 取 **當前** `p.model`（歸位會換模型）：點滴袋 `chemo-iv-bag`、粉罐 `absorbent-powder-shaker`、噴瓶 `disinfectant-spray`。
- 水漬：`puddle = bag.model.meshes["puddle"]`；mesh 實例與上次不同（新破裂或歸位後再破裂）→ 重置計數與 `maxScale`。
  `maxScale = max(maxScale, puddle.scaling.x)`（長大期間讀到的是模型上一幀寫的值）；
  `radius0 = puddle.getBoundingInfo().boundingBox.extendSize.x`（未縮放的圓盤半徑）；足跡半徑 `radius0 × maxScale`；中心 `puddle.absolutePosition` 的 (x, z)。
  每步 `puddle.scaling.setAll(maxScale × rScale)`——長大的 90 幀內模型的 grow 觀察者跑在後面會覆寫（它是破裂時才加的），
  長完後我的值持續生效；顆粒真正落到水漬上都在 1.5 s 之後，不衝突。
- 規則 A／B：遍歷粉罐 `bodies` 中 key `grain-` 開頭、未 `isDisposed`、不在 `absorbed: WeakSet<PhysicsBody>` 的 body；
  凝固＝`mesh.material = clumpMat`（`StandardMaterial("clump")`，diffuse (0.80, 0.74, 0.50)，每個 scene 建一次）＋加入 WeakSet。
  規則 B 對每顆未凝固顆粒掃點滴袋 `droplet-` body（未 dispose），命中即 `body.dispose(); body.transformNode.dispose()`。
- 規則 C：遍歷噴瓶 `bodies` 中 `grain-` body；命中即 dispose，`bag.model.meshes.puddle.material`（StandardMaterial）
  的 `diffuseColor`／`alpha` 依 `disinfected` 內插寫入（該材質只給這片水漬用，模型 dispose 會一併釋放；歸位重建）。
- 消費者（HUD／topple／scene_test）本來就過濾 `isDisposed`（M12）。

## 4. 掛載與顯示（`src/ui.ts`）

`src/chemo.ts` 是另一 session 未追蹤的檔，不可動；`installUi(scene, camera, placed, capture)` 手上已有 scene 與 placed，
且需要狀態來顯示，所以在 `installUi` 內 `const inter = installInteractions(scene, () => placed)`。
點滴袋卡片質量行下加 `div.status`：有水漬時顯示「水漬 62%｜消毒 40%」（`remaining`／`disinfected` 取整數百分比），無水漬留空；
沿用既有 500 ms interval。`index.html` 加 `.card .status`（小號灰字）。另一 session 之後若提交 chemo.ts，掛載點可搬過去，一行事。

## 5. headless gate（`scripts/scene_test.ts` 新增 3 項 → 31 項）

`installInteractions(scene, () => placed)` 於 spawnAll 之後掛上（全程有效，前 28 項不受影響：破裂前 `puddle` 為 null、
顆粒與液滴在各自原位互不相干）。新斷言接在 `bag:rupture` 之後、`bag.respawn()` 之前（此時水漬已長滿 240 幀）：

1. **`interact:absorb`**：粉罐先前倒出的 40 顆真顆粒（躺在粉罐旁）以 disablePreStep 兩步規則搬到水漬上方：
   前 36 顆放三環（r 0.05／0.09／0.13、每環 12 顆、y 0.05，間距 ≥ 0.026 不疊），後 4 顆放在點滴袋液滴 0～3 的正上方 0.03 m
   （液滴初速 0.6–1.2 m/s、阻尼 2，多半已滾到足跡外——規則 B 不需要在水漬內）。step 2 解除搬運、step 180 →
   `absorbedGrains ≥ 30`、`puddle.scaling.x ≤ 0.36`、材質名為 `clump` 的顆粒 mesh ≥ 30。
2. **`interact:absorb-droplet`**：液滴 0～3 中 `isDisposed` ≥ 3。
3. **`interact:disinfect`**：噴瓶先前噴出的 60 滴取前 24 滴搬到水漬上方（r 0.03～0.12 兩環、y 0.05），step 2、step 120 →
   dispose ≥ 20、`disinfected === 1`、水漬材質 diffuse 與 (0.72, 0.82, 0.86) 各分量差 < 0.01。

後續 `bag:respawn`／`respawn:all` 的 mesh 數斷言是「≤ 之前」，dispose 只會讓數字更小；`respawn:all` 期望 21 不變。

実測修正：噴霧兩環改 r 0.11／0.15、全部錯開半個角步（π/12）。原擬內環 r 0.03 落在水漬中央**塌扁的空袋**（0.14×0.19、FLAT_H 0.010）頂上，
中心 y 0.012 > 0.010 不算落地；與顆粒三環同角度的外環會停在凝固顆粒頂上（y 0.013）。結果 `interact:absorb` 36 顆吸附、縮放 0.350、凝固 40；
`interact:absorb-droplet` 3/4；`interact:disinfect` 24/24、消毒度 1、顏色 (0.72, 0.82, 0.86)。

## 6. 證據與文件

- playwright：`npm run dev`（5175、`run_in_background`）→ 摔落、破裂 → `__PLAYGROUND_GRAB__` 抓粉罐到水漬上、開蓋、傾倒
  → 截 `.img2babylon/shots/playground5-absorb.png`；抓噴瓶、Q／E 壓低噴口對水漬噴灑 → `playground5-disinfect.png`。
  噴口是水平 +z，站在地上噴不到地面水漬，實測靠抓取＋傾斜；太難操作則如實回報，不在本輪加自動下壓。
- ROADMAP M14、`tasks/0026-playground-cross-model-interactions.md`、`docs/next-steps.md` 更新。
- playground README 補一句互動說明但**不提交**（該檔含另一 session 未提交段落）；只 commit
  `src/interactions.ts`、`src/ui.ts`、`index.html`、`scripts/scene_test.ts`。
- `npm run typecheck && npm run scene-test && npm run serve` 重部署（連同另一 session 未提交的 parkour 場景一起上線，與 M12／M13 相同）。

## 7. 風險

- 顆粒堆疊：第二層中心 y = 0.015 > 0.012 不算吸附，只有貼地那層吸——符合直覺，測試環距避免堆疊。
- 液滴 dispose 與模型自己的 `spawned.forEach(dispose)`／`bodies` dispose 重複：Babylon `PhysicsBody.dispose` 有 `_isDisposed` 守衛、
  mesh dispose 冪等，M12 collect 已驗證同一路徑。
- 水漬長大期間顆粒就到：可見縮放會被 grow 覆寫 90 幀，之後正確；不做額外同步。
- 另一 session 同時改 playground：commit 前 `git status` 逐檔確認，只加上列四檔。
