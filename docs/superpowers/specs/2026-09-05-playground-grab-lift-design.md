# M13 設計：playground 抓取抬高＋傾斜（2026-09-05）

狀態：使用者核准設計方向（速度伺服控制器＋控制器分檔＋scene_test 三項＋不動 chemo.ts）。
候選來源：`docs/next-steps.md` 第 1 項。前作：M12 `2026-09-05-chemo-spill-set-3-design.md`。

## 1. 目標與範圍

M12 已知限制：playground 抓取只在水平面拖曳，顆粒要進廢棄物袋只能「推板→小鏟→拖到袋邊」，
小鏟既抬不起也倒不出。本里程碑讓被抓物件能**抬高**與**傾斜**，並以「鏟起→搬到袋上→倒入→封袋」證明可用。

- 只改 `../playground`；契約側（img-to-babylon viewer／forge／grimoire）不動。
- 桌機操作（觸控無 Shift／滾輪／鍵盤，本次不涵蓋）：

| 輸入 | 行為 |
| --- | --- |
| 拖曳 | 手點沿**水平面**（通過當前目標點、法向 +y）移動 |
| Shift＋拖曳 | 手點沿**面向相機的垂直面**（通過當前目標點、法向＝相機前向的水平投影）移動；滑鼠上下＝高度 |
| 滾輪 | 目標高度 ±0.05 m／格（`deltaY` 取號），夾在 0～2.5 m |
| Q／E | 目標姿態繞**相機右軸**旋轉，1.5 rad/s，按住持續；放手後姿態由物理接管、不回彈 |

- 修掉現行瑕疵：目前 `target = pickedPoint`、驅動量是 body 原點，一抓 body 原點就跳去點選點（桶高 0.5 m 很明顯）。
  改為記錄手點的 body-local 偏移，驅動的是手點。

## 2. 做法選擇

1. **速度伺服（採用）**：每個 physics step `setLinearVelocity` 追手點目標、`setAngularVelocity` 追目標姿態。
   延續現行做法，無新約束、與 Havok 相容、放手時保留速度可自然拋出。
2. kinematic「手」body＋6DoF 約束：手感較軟，但輕物件上會抖、放手要拆約束，多一層狀態。不採。
3. 抓取期間改 ANIMATED 直接搬 transform：穿過袋壁與靜物。不採。

## 3. 控制器 `src/grabController.ts`（純物理、headless 可測）

```ts
export interface GrabController {
  readonly active: boolean;
  readonly body: PhysicsBody | null;
  begin(body: PhysicsBody, point: Vector3): void; // point＝世界座標手點；已 active 則先 end()
  moveTo(point: Vector3): void;                    // 設手點目標（世界座標）
  lift(dy: number): void;                          // target.y = clamp(target.y + dy, 0, 2.5)
  tilt(axis: Vector3, dTheta: number): void;       // targetRot = targetRot.multiply(Quaternion.RotationAxis(axis, dTheta))
  end(): void;                                     // 保留當前速度
  target(): Vector3;                               // 目前目標點副本（輸入層重建平面用）
  handError(): number;                             // |target − 手點世界座標|，測試用
  rotError(): number;                              // 目標姿態與當前姿態夾角（rad），測試用
}
export function createGrabController(scene: Scene): GrabController;
```

- `begin`：`localOffset = TransformCoordinates(point, Invert(body.transformNode.getWorldMatrix()))`；
  `target = point.clone()`；`targetRot = body.transformNode.absoluteRotationQuaternion.clone()`。
- 每步（`scene.onBeforePhysicsObservable`）：
  - 手點世界座標 `hand = TransformCoordinates(localOffset, worldMatrix)`；
    `v = (target − hand) × GAIN(8)`，長度夾 MAX_SPEED（3 m/s）；`setLinearVelocity(v)`。
  - 姿態誤差 `err = Inverse(cur).multiply(targetRot)`（Babylon 列向量慣例：先 cur 再 err，err 為世界軸旋轉）；
    取最短路徑（w < 0 整體取負）→ 軸角 e；`ω = e × ANG_GAIN(30) + I`，`I += e × ANG_KI(60) × dt`（I 夾 3 rad/s，begin 歸零），
    ω 長度夾 MAX_ANG（6 rad/s）；`setAngularVelocity(ω)`。angle < 1e-4 時 e = 0。
    実測定案：Babylon 慣例同 `TransformNode.rotate`——`R.multiply(cur)` 是世界軸旋轉，所以 `err = target.multiply(Inverse(cur))`、
    `tilt` 為 `RotationAxis(axis, dθ).multiply(targetRot)`（初版寫反時 `grab:tilt` 收斂到 π）。
    純 P（增益 6）對「載重在手點前方」的恆定力矩留 0.07 rad 穩態誤差、增益 30 仍留 0.01–0.03 rad，球體沿斗底滾出——故加積分項。
- 線速度加重力前饋 −g·dt（`engine.gravity × getTimeStep()`），否則每步設的速度被一步重力吃掉、懸停下垂 ≈ 1 cm。
- 多 body 模型（處理包、廢棄物桶、立牌、吸附墊）抓其中一個 body，其餘靠既有 hinge 跟隨；不控制未抓的 body。
- 被抓 body 若 `isDisposed`（例如抓取中被封袋收走）→ 該步自動 `end()`。

## 4. 輸入層 `src/grab.ts`

`installGrab(scene, camera, canvas, placed)` **檔名、簽名與匯出名稱不變**（控制器另拆新檔，避免 re-export 造成循環匯入），
所以 `src/chemo.ts`（另一 session 未追蹤的新檔）**零改動**。內部：

- POINTERDOWN：`scene.pick` → `bodyOf`（沿 parent 鏈找 body）→ `controller.begin(body, pickedPoint)`；`camera.detachControl()`。
- POINTERMOVE：依 `event.shiftKey` 以**當前目標點**重建水平或垂直平面，射線交點 → `moveTo`（切模式不跳）。
- POINTERWHEEL（抓取中）：`lift(−sign(deltaY) × 0.05)`。相機已 detach，滾輪不會同時縮放。
- keydown／keyup（window）追蹤 `q`／`e`（不分大小寫）；`onBeforeRenderObservable` 每幀
  `tilt(cameraRight, dir × 1.5 × dt)`，`cameraRight = Cross(Up, camera.getTarget() − camera.position)` 正規化。
- POINTERUP：`end()`；`camera.attachControl(canvas, true)`。
- 回傳 `GrabController`，`chemo.ts` 不接也無妨；控制器另掛 `window.__PLAYGROUND_GRAB__`（`grab.ts` 的 `declare global`
  可選欄位；不能擴充 `__PLAYGROUND__`——其型別宣告在 chemo.ts 且該檔會整個重新賦值）供截圖腳本驅動。

## 5. 面板提示（`src/ui.ts`、`index.html`）

面板標題下加一行 `.hint`：「抓取：拖曳移動｜Shift 拖曳＝上下｜滾輪＝高度｜Q／E＝傾斜」。CSS 加 `.panel .hint`（灰字、小號）。

## 6. headless gate（`scripts/scene_test.ts` 新增 3 項）

位置：`wbag:collect` 之後、`bag:rupture` 之前（袋內先前測試球已收走，袋質量 0.24）。

1. 前置：8 顆測試球（d 0.012、0.005 kg、阻尼 2，同 wbag 規格）自小鏟斗內上方 0.15 m 落入（鏟局部座標
   環徑 0.03、中心 (0, 0.15, −0.03)），200 步。
2. `controller.begin(scoop, hand)`，`hand` ＝ 鏟局部 (0, 0.02, −0.06)（靠後緣，開口在 +z 前緣）的世界座標；
   目標以 `glide(to, steps)` 逐步線性插值（模擬連續拖曳；一次跳 0.5 m 會以 3 m/s 起步把球踢飛）：抬 0.5 m 走 90 步、停 60 步，
   再取 30 步 → **`grab:lift`**：最後 30 步 `handError()` 最大值 ≤ 0.03。
   （原擬「步後速度 < 0.05」不成立：斗內球 0.04 kg 壓 0.08 kg 鏟，每步接觸衝量留下 ≈ 0.5·g·dt ≈ 0.07 m/s 殘速，是負載不是失控。）
3. 傾斜軸＝鏟局部 +x 的世界方向；符號用 `TransformNormal` 判定：把鏟前向 f（局部 +z 世界方向）繞軸轉 +0.2 rad，
   若 y 分量下降則取 +，否則取 −。搬運前先**後仰** 0.35 rad（5 × 0.07、各 5 步，再停 60 步）讓後牆托住球——
   球體在任何水平加速下都相對斗滾動，端平搬會從開口滾出。
4. `glide(袋 interior 中心 + (0, 0.45, 0) − frontH × 0.05, 120)`（frontH＝鏟前向水平投影），停 60 步；
   分 20 次 `tilt(axis, sign × 0.1)`、每次 5 步（淨前傾 1.65 rad）；再 60 步 → **`grab:tilt`**：`rotError() < 0.1` 且 `handError() ≤ 0.03`。
5. 300 步讓球落袋；把鏟搬回原位上方（`tilt(axis, −sign × 1.65)`、`glide(原手點 + (0, 0.3, 0), 120)`）→ `end()`、60 步。
6. 計袋內球數 n（interior 半尺寸 (0.144, 0.175, 0.094)）；`collect:bag` set(1)、2 步 →
   **`grab:carry-pour`**：`n ≥ 6` 且 `|袋質量 − (0.24 + n × 0.005)| < 1e-5` 且袋內球全 `isDisposed`。

「粉罐倒出→推板把顆粒推進鏟」屬人手操作，不做 headless 斷言（門檻無法穩定），只在 §7 手動示範。
既有 25 項不動；`respawn:all` 期望 21 不變（測試球不是模型 body）。

## 7. 證據與文件

- playwright：`npm run dev`（5175）→ `__PLAYGROUND_GRAB__` 演流程，截 `.img2babylon/shots/playground4-{scoop,pour,sealed}.png`；
  另盡力用推板把粉罐顆粒推進鏟斗示範完整流程，不成功則如實回報。
- ROADMAP M13、`tasks/0025-playground-grab-lift.md`、`docs/next-steps.md` 更新。
- playground README 補操作說明但**不提交**（該檔已含另一 session 未提交的跑酷段落）；只 commit
  `src/grabController.ts`、`src/grab.ts`、`src/ui.ts`、`index.html`、`scripts/scene_test.ts`。
- `npm run typecheck && npm run scene-test && npm run serve` 重部署（會連同另一 session 未提交的 parkour 場景一起上線，與 M12 相同）。

## 8. 風險

- 姿態伺服下被抓 body 卡進袋壁會硬推：3 m/s／6 rad/s 上限限制衝擊；不加額外碰撞處理。
- 球在傾斜途中彈出斗外：門檻 6/8。
- 四元數乘法順序寫反：`grab:tilt` 發散即翻轉順序，計畫內含此檢查點。
- 另一 session 同時改 playground：commit 前 `git status` 逐檔確認，只加上列五檔。
