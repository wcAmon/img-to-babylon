# M15 設計：playground 互動續——吸附墊擦拭、封袋計數、噴瓶自動下壓（2026-09-06）

狀態：使用者核准設計方向（四項：吸附墊擦拭讓水漬消失、消毒 100% 不淡出、凝固顆粒封袋計數、噴瓶抓起自動下壓 0.35 rad；scene_test +3）。
候選來源：`docs/next-steps.md` 第 2 項。前作：M14 `2026-09-05-playground-cross-model-interactions-design.md`。

## 1. 目標與範圍

M14 之後水漬吸附、消毒都有結果，但殘漬永遠留在地上、封袋不知道收了幾顆凝固顆粒、噴瓶要靠 Q／E 瞄地面才噴得到。
本里程碑把清理流程收尾：**消毒 → 吸附墊擦乾（水漬消失）→ 鏟凝固顆粒入袋封袋（顯示顆數）**，並讓噴瓶一抓起就朝下。

- 只改 `../playground`；契約側不動。依賴名稱：吸附墊 `bodies["half-a"]`／`["half-b"]`（spec 尺寸 0.20×0.015×0.25）、噴瓶 `bodies["bottle"]`（噴口局部 +z）、
  廢棄物袋 `collect:bag`（`set(1)` 內同步 dispose 袋內 body，可重複呼叫）。

| # | 項目 | 規則／行為 |
| --- | --- | --- |
| D | 吸附墊擦拭 | 任一半片**平放**（body 局部 +y 的世界向量 y ≥ 0.9、中心 y ≤ 0.04）且水漬中心轉進該半片局部座標後 \|x\| ≤ 0.10、\|z\| ≤ 0.125 → 每步 alpha −1/60，到 0 時 `puddle.setEnabled(false)`、`wiped = true`。條件消失不回復；不要求先吸附或消毒。 |
| — | 消毒 100% | **不淡出**（保留淡藍灰 alpha 0.25），由 D 讓它消失——否則吸附墊沒有目標，也不符「消毒後要擦乾」。 |
| E | 封袋計數 | `sealClumps(collect: () => void): number`：呼叫前記下仍存活的凝固顆粒，執行 `collect()`，回傳其中變成 `isDisposed` 的顆數並累計 `sealedClumps`。粉罐歸位把顆粒全 dispose 不會被計到（只在 collect 呼叫瞬間比對）。 |
| F | 噴瓶自動下壓 | `aimNozzle(ctl, placed, body)`：被抓 body 所屬 `entry.model === "disinfectant-spray"` 時，取 `bodies.bottle` 的噴口方向 d（局部 +z 世界向量），俯角 `pitch = asin(d.y)`，`ctl.tilt(Cross(Up, d 水平投影), pitch + 0.35)` → 新俯角 −0.35 rad（M14 實測：繞此軸轉 +0.5 噴口 y −0.49）。Q／E 仍可再調。 |

## 2. 做法選擇

- D 用「半片足跡蓋住水漬中心」而非面積重疊：水漬殘漬半徑 0.105（0.30×0.35）小於半片 0.20×0.25，中心判定夠用；重疊面積要多邊形裁切，不值。
- E 放在 interactions（它擁有凝固顆粒清單），以回呼包 collect 而不是監聽 dispose：dispose 沒有事件，且粉罐歸位也會 dispose。
- F 放在 grab.ts 的純函式（無 DOM）而不是 grabController：是噴瓶專屬行為，不屬通用控制器；輸入層 POINTERDOWN 呼叫一次。

## 3. 模組變動

`src/interactions.ts`：
```ts
export interface InteractionState {
  readonly puddle: { remaining: number; disinfected: number; wiped: boolean } | null;
  readonly absorbedGrains: number; readonly absorbedDroplets: number; readonly sprayAbsorbed: number;
  readonly sealedClumps: number;
  sealClumps(collect: () => void): number;
}
```
- 凝固顆粒改 `clumps: PhysicsBody[]`（加入時 push；讀時過濾 `isDisposed`）＋原 WeakSet 查重。
- 規則 D：每步遍歷 `absorbent-pad` 的 `half-a`／`half-b`（未 dispose）：`node.computeWorldMatrix(true)`；`up = node.getDirection(Up)`；
  `local = TransformCoordinates(puddleCenter, Invert(worldMatrix))`；命中即 `wiping = true`。`wiping` 時 alpha 每步 −1/60（覆蓋消毒的 alpha 內插），≤ 0 → `setEnabled(false)`、`wiped = true`；
  水漬 mesh 換實例時 `wiping`／`wiped` 歸零。消毒的 alpha 內插只在 `!wiping` 時寫。
- `sealClumps`：`const live = clumps.filter(g => !g.isDisposed); collect(); const n = live.filter(g => g.isDisposed).length; sealedClumps += n; return n;`。

`src/grab.ts`：
```ts
export const AIM_PITCH = -0.35;
export function aimNozzle(ctl: GrabController, placed: Placed[], body: PhysicsBody): void; // 非噴瓶 no-op
```
POINTERDOWN：`ctl.begin(body, pick.pickedPoint); aimNozzle(ctl, placed(), body);`。

`src/ui.ts`：封袋按鈕 → `inter.sealClumps(() => act(p.model, "collect:bag")?.set(1))`；廢棄物袋卡片加 `div.status`「已封入凝固顆粒 N」（N > 0 才顯示）；
點滴袋狀態：`wiped` → 「水漬已擦拭」，否則沿用「水漬 %｜消毒 %」。提示補「墊子蓋水漬＝擦乾」。`index.html` 不動（`.card .status` 已有）。

## 4. headless gate（`scripts/scene_test.ts` +3 → 34 項）

接在 `interact:disinfect` 之後、`bag.respawn()` 之前：

1. **`grab:aim-nozzle`**（先做，噴瓶此時空著）：`grab.begin(spray.bottle, 其 absolutePosition)`；`aimNozzle(grab, placed, spray.bottle)`；step 90 →
   噴口方向 `bottle.transformNode.getDirection(0,0,1)` 的 y ∈ [−0.45, −0.25]；`grab.end()`；step 60。
2. **`interact:seal-count`**：取 10 顆存活凝固顆粒（`material.name === "clump"`），teleport 到廢棄物袋 interior 中心上方 0.10 m（環 r 0.03），step 150；
   `n = inter.sealClumps(() => collect.set(1))` → `n ≥ 8` 且 `inter.sealedClumps === n`。
3. **`interact:wipe`**：吸附墊已攤開（`pad:unfold`）；`delta = 水漬中心 − half-a 中心`（xz），`pad.model.root.position += (delta.x, 0.03, delta.z)`（兩 body disablePreStep 兩步）；
   step 150 → `inter.puddle?.wiped === true` 且 `!puddle.isEnabled()`。

後續 `bag:respawn`／`respawn:all` 不受影響（mesh 數斷言方向 ≤；body 總數 21 不變）。

## 5. 證據與文件

- playwright：破裂→撒粉→抓噴瓶（自動下壓）噴灑→攤開吸附墊拖到水漬上→水漬消失→凝固顆粒鏟入袋封袋顯示計數；截 `.img2babylon/shots/playground5-{wipe,sealed}.png`。
- ROADMAP M15、`tasks/0027-playground-interactions-2.md`、`docs/next-steps.md`；README 一句不提交；只 commit
  `src/interactions.ts`、`src/grab.ts`、`src/ui.ts`、`scripts/scene_test.ts`（index.html 若無改動不列）。
- `npm run typecheck && npm run scene-test && npm run serve` 重部署。

## 6. 風險

- 吸附墊 membership 2 與顆粒（collide ~2）互不碰撞：墊子蓋過去顆粒不被推開；擦拭只管水漬，顆粒仍要鏟。
- 墊子壓在塌扁袋（高 0.010）邊緣會微傾：up.y 門檻 0.9（≈ 26°）留餘裕。
- 自動下壓在抓到扳機 body 時同樣生效（讀 `bodies.bottle` 方向、tilt 作用於被抓 body，兩者 hinge 相連）。
