# Physics：Havok 契約（一等公民）

## Body：每個 spec `physics.bodies[]` 一個 PhysicsBody

```ts
const body = new PhysicsBody(bodyRootPivot, PhysicsMotionType.DYNAMIC, false, scene);
const container = new PhysicsShapeContainer(scene);
for (每個帶 collider 的元件) {
  const shape = makeShape(collider, scene);       // 見下表
  shape.material = { friction, restitution };      // 取自 spec body
  // 子形狀位置 = 元件 pivot 相對 body root pivot 的位移 + collider.offset
  container.addChild(shape, relativePosition, relativeRotationQuaternion);
}
body.shape = container;
body.setMassProperties({ mass, centerOfMass: Vector3.FromArray(spec.centerOfMass) });
```

| collider.type | Babylon 類別 | 參數對應（size = [sx, sy, sz]） |
|---|---|---|
| box | `PhysicsShapeBox(center, rotation, extents, scene)` | extents = size |
| sphere | `PhysicsShapeSphere(center, radius, scene)` | radius = sx / 2 |
| cylinder | `PhysicsShapeCylinder(pointA, pointB, radius, scene)` | A/B = ±sy/2 沿 Y，radius = sx/2 |
| capsule | `PhysicsShapeCapsule(pointA, pointB, radius, scene)` | 同上，radius = sx/2 |
| convex | `PhysicsShapeConvexHull(mesh, scene)` | 直接包 visual mesh |

無 collider 的 meso/micro 元件不受靜態 gate 檢查，突出的裝飾件要靠視覺 review 把關——
若裝飾件明顯超出主體，考慮升為 macro 並給 collider。

## Hinge（揀蓋）：6DoF 鎖五軸 + 單角軸 limit

```ts
import { Physics6DoFConstraint, PhysicsConstraintAxis } from "@babylonjs/core";
const hinge = new Physics6DoFConstraint(
  {
    pivotA: Vector3.FromArray(con.pivotA),   // body 局部
    pivotB: Vector3.FromArray(con.pivotB),   // cap 局部
    axisA: Vector3.FromArray(con.axis),
    axisB: Vector3.FromArray(con.axis),
    perpAxisA: 任一與 axis 垂直的單位向量,
    perpAxisB: 同 perpAxisA,
  },
  [
    { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.ANGULAR_X,
      minLimit: con.limits[0], maxLimit: con.limits[1] },
  ],
  scene,
);
bodies[con.bodyA].addConstraint(bodies[con.bodyB], hinge);
constraints.push(hinge);
```

### 左手系鉸鏈方向

Babylon.js 是左手座標系；`Matrix.RotationX(θ)` 正向旋轉把 +Y 帶向 +Z，因此 ANGULAR_X
正向 limits（如 `[0, 1.92]`）會把「位於鉸軸 +Y 側的蓋子」往 +Z 方向掀開。揀蓋要向外開：
鉸鏈 pivot 必須放在瓶口 **+z 側**邊緣（不是 −z），否則正向旋轉會把蓋子壓進瓶身、落地
衝擊會扯裂 constraint。

藥罐例子：pivot 世界座標 `(0, 0.084, +0.023)`、蓋子中心 `(0, 0.089, 0)`——鉸軸放在
+z 側邊緣，蓋子中心在鉸軸的 −z 側，`limits [0, 1.92]` 才會是「0 = 闔上、1.92 = 掀開」。

## 自由旋轉 hinge（車輪）：鎖五軸、旋轉軸完全放開

spec 寫法：constraint 的 `limits` 用字串 `"free"`（不是省略、不是 `[null, null]`）。
程式碼與揀蓋 hinge 唯一的差別：**ANGULAR_X 那條 limit 整個不列**——6DoF 不給某軸
limit 就是放開該軸：

```ts
const wheelHinge = new Physics6DoFConstraint(
  {
    pivotA: Vector3.FromArray(con.pivotA),   // 車身局部：輪軸心位置
    pivotB: Vector3.FromArray(con.pivotB),   // 輪局部：通常 [0, 0, 0]（輪心）
    axisA: Vector3.FromArray(con.axis),      // 車輪轉軸，如 [1, 0, 0]（X 軸橫貫車身）
    axisB: Vector3.FromArray(con.axis),
    perpAxisA: 任一與 axis 垂直的單位向量,
    perpAxisB: 同 perpAxisA,
  },
  [
    { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
    // ANGULAR_X 不列 → 自由旋轉
  ],
  scene,
);
```

### 車輪契約

- **collider**：cylinder（軸向沿輪的旋轉軸）。注意 PhysicsShapeCylinder 的 A/B 點
  沿 **Y** 軸——輪面朝 X 時，visual mesh 與 collider 都要繞 Z 轉 90°，或用
  相對旋轉四元數把子形狀轉正。
- **摩擦**：輪胎要高摩擦（0.8–1.0）才咬得住地滾動而不打滑；車身低摩擦（~0.3）。
- **質量分配**：車身重、輪輕（玩具車參考：車身 ~0.2 kg、每輪 ~0.02 kg），
  `centerOfMass` 壓低（負 Y），推一把才不會翻。
- **對稱**：四輪 pivotA 必須左右/前後對稱，否則直線推力會跑偏。
- **驗證**：`physics_test.ts --roll <bodyId>` 施水平推力，斷言車體位移、
  輪角速度 ≈ 線速度 ÷ 輪半徑（滾動不打滑）、constraint 不裂。

## 多軸限位 joint（ragdoll 關節）：逐軸 limits

spec 寫法見 `spec.md` 的 `type: "joint"`。程式碼與 hinge 同一套 6DoF，差別是
**三條角軸逐一對應 `angular` 的 x/y/z**：`[lo, hi]` → 列出該軸 limit；`"locked"`
（或省略）→ `minLimit: 0, maxLimit: 0`；`"free"` → 該軸整條不列：

```ts
const axes = [
  { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
  { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
  { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
];
const ANG = { x: PhysicsConstraintAxis.ANGULAR_X,
              y: PhysicsConstraintAxis.ANGULAR_Y,
              z: PhysicsConstraintAxis.ANGULAR_Z };
for (const k of ["x", "y", "z"] as const) {
  const v = con.angular?.[k] ?? "locked";
  if (v === "free") continue;                       // 不列 = 放開
  if (v === "locked") axes.push({ axis: ANG[k], minLimit: 0, maxLimit: 0 });
  else axes.push({ axis: ANG[k], minLimit: v[0], maxLimit: v[1] });
}
```

frame 的 `axisA/axisB` 對應 angular.x 的軸、`perpAxisA/perpAxisB` 對應 angular.y。
兩個 body 在**綁定姿勢**（spec transform 擺好的樣子）下角度視為 0——limits 是
相對綁定姿勢的偏轉量。

### ragdoll 契約（玩具公仔）

- 人體關節參考值（弧度，綁定姿勢 = T-pose 或立正）：

  | 關節 | type | 限位 |
  |---|---|---|
  | 肘 / 膝 | hinge | `[0, 2.44]`（0–140°，單向彎） |
  | 肩 / 髖 | joint | 主擺 x `[-0.5, 3.0]` / 側擺 z `[-0.3, 1.6]` / 扭轉 y `[-0.8, 0.8]` |
  | 脖子 | joint | 三軸各約 `[-0.6, 0.6]` |

- **質量分配**：軀幹最重（玩具公仔參考：軀幹 ~0.04 kg、頭 ~0.018 kg、
  大腿 ~0.005 kg、小腿 ~0.008 kg、靴 ~0.005 kg）。全身質量別差超過一個數量級太多，
  否則 solver 抖動。
- **關節兩側質量比**：相鄰 body 的有效質量比應控制在約 `10:1` 以內，且 spec 與
  factory 必須鏡射同值。倒單擺探針中 85 kg 上身撐在 1 kg 底座必翻，底座提高到
  5 kg 才恢復剛體權威；比例過大會讓 POSITION 馬達呈現黏滑或失去權威。
- **collider 間隙**：相鄰肢段的 collider 在關節處**不要重疊**（留 1–2mm 縫），
  或把 constraint 的 `isCollisionsEnabled` 設 false，否則自碰撞會把關節撐爆。
- **驗證**：`physics_test.ts --ragdoll` 從高處丟下，斷言無 NaN、constraint 不裂、
  各限位軸實測角度在 `[lo−ε, hi+ε]` 內、最終姿態高度 < 站高 60%（真的癱倒）。

## 質量與密度速查（gate 檢查 50–3000 kg/m³）

| 材質 | 密度 kg/m³ | 例 |
|---|---|---|
| 發泡/空心塑膠件 | 100–400 | 藥罐瓶身（大半是空氣）→ 用有效密度 |
| 實心塑膠 | 900–1200 | 蓋子 |
| 木 | 400–800 | 木箱 |
| 玻璃/陶瓷 | 2200–2700 | 玻璃罐 |

藥罐參考值：瓶身 0.04 kg、蓋 0.008 kg。

## 陷阱

- 建 body 後再搬 transform：先 `body.disablePreStep = false` → 下一幀後設回 true。
- **關節角量測：限位與馬達是兩種 Euler 順序**（0021，2026-09-04）。Havok 6DoF 逐軸
  **馬達**的語意是 XZY（`eulerXZY`：髖三馬達命令 (−0.6, 0.3, 0) 讀值精確），逐軸**限位**
  不是任何單一 Euler 順序：x（主軸）＝swing-twist 扭轉角、y = asin(−g02)、z = atan2(g01, g00)
  （`eulerLimits`：純限位釘死七組含 y 1.2／z 1.2 大角，誤差 ≤ 0.073；XZY 在同資料 y 誤差
  0.76、z 0.84）。單軸時所有順序重合（0014 倒立擺校準
  分不出來）；兩軸同時大角度用錯順序會在鎖死軸讀出 0.12–0.24 rad 幻影角（踝 x 0.56／
  y 0.33 鎖 z → XZY 讀 z −0.17）。ragdoll 限位檢查用 `eulerLimits`，actuation／motion
  類馬達 gate 用 `eulerXZY`；Babylon `toEulerAngles()`（YXZ）兩者都不是。證據：姊妹 repo
  `physics/scripts/joint_order_probe.ts`。
- 持續受載下限位有 ~0.05 rad 的 solver 柔性（瞬時衝擊可暫態超越 ~0.16），
  斷言一律帶 ε（`RAGDOLL_ANGLE_EPS = 0.15`）。
- `PhysicsShapeContainer` 的子形狀位置是相對 body 的 transform node，不是世界座標。
- constraint 加在兩個 body 之間（`bodyA.addConstraint(bodyB, c)`），不是 mesh。
- 蓋子質量遠小於瓶身時，把 hinge 兩端 pivot 算準（差 1cm 就會震盪）。


## 馬達（M4 actuation）

6DoF constraint 逐軸馬達：`setAxisMotorType(ANGULAR_X, VELOCITY|POSITION)` →
`setAxisMotorMaxForce` → `setAxisMotorTarget`。drive 用 VELOCITY（目標 rad/s）、
steer/servo 用 POSITION（目標 rad）。惰性啟動鐵律：drive/servo 在第一次命令前
不得設 motor type（VELOCITY 目標 0 會鎖死自由滾動、POSITION 會撐住 ragdoll）；
steer 例外——出廠即置中（回正彈簧），自由甩動的前軸會犁地毀掉滾動。

### 陷阱：靜止接觸是硬黏著，馬達推不動

Havok 靜摩擦以硬約束求解、馬達是軟彈簧——靜止輪胎接地時 steer 馬達力開到 1e6
角度也只到 ~0.06 rad（力無關、子步無關，經探針實證）。滾動中接觸點有速度、
進入動摩擦才轉得動（賽車遊戲用 raycast vehicle 就是繞開這個）。因此
actuation gate 的 steer 必須「行進中測」（斷言轉向角展開＋車身 yaw 同號偏轉）、
servo 必須「吊空測」（錨 body 設 STATIC、四肢自由）。

### 陷阱：零件穿插的碰撞過濾

多 body 模型中沒有直接 constraint 的零件對（如經轉向節間接相連的前輪與車身）
`isCollisionsEnabled=false` 管不到；collider 若穿插會互撞自煞。整車零件設同一
`filterMembershipMask` 群組、`filterCollideMask` 排除自群組（toy-racer 加了之後
滾動距離 0.36m → 3.0m——M1 時輪/車身穿插摩擦一直在偷偷耗能）。

## 破裂＝質量轉移（M10 rupture）

- 偵測用**動量變化**，不用 Havok 碰撞回呼：`onBeforePhysicsObservable` 記 v₀、
  `onAfterPhysicsObservable` 算 `m·|v₁ − v₀|`。碰撞回呼的 impulse 是逐接觸點，平落四角
  各分四分之一，門檻不可靠；Δv 是整體真相且 headless／viewer 一致。重力每步貢獻
  m·g/60（0.55 kg 為 0.09 N·s），遠低於門檻。
- 破裂動作一次且冪等：`setMassProperties({mass: emptiedMass})`、`body.shape` 換塌扁薄盒
  （舊 shape dispose）、袋視覺換塌扁 mesh（另建幾何，非 scaling）、生成水漬 disc
  （以幀數 90 幀長到全徑；動畫期間用 scaling，終態 scaling=1 且半徑烘進幾何）、
  噴 N 顆液滴球（seed 決定方向）。
- `dispose()` 必須連水漬、液滴、觀察者一起釋放；playground「歸位」＝ dispose ＋重建。
- 校準法：0.55 kg 自 0.3 m 落下 Δv ≈ 2.7 m/s → 1.5 N·s（physics_test 預設落高，不可破）；
  自 1.5 m 落下 ≈ 3 N·s 以上（必破）。門檻 2.0 落在中間。

## 傾倒＝節流的質量轉移（M11 pour）

- 傾角：`node.getDirection(Vector3.Up())` 取 body 局部 +y 的世界向量，`acos(up.y)` 即傾角，每個
  物理步在 `onAfterPhysicsObservable` 量。蓋門：蓋 hinge 角用 `hinge.ts` 的 `hingeAngle(a, b, bind)`，
  `bind` 在**任何物理步之前**取（`relativeRotation`）。
- 無 `tiltThreshold`（噴瓶）：只看 gate 角與存量。`direction` 用 `Vector3.TransformNormal(dir, node.getWorldMatrix())` 轉世界；
  初速 = 容器速度 + dir × `exitSpeed`；生成點 = pivot 局部偏移（噴嘴）同法轉世界。
- 節流：條件成立時每步累積 `ratePerSecond / 60`，累積滿 1 顆就生成；條件中斷時累積歸零。
- 生成點：pivot + up × (容器半高 + 0.015)，再加 seed 決定的 ±0.01 m 散佈（手動一次全倒時同點
  生成會互相彈開）；若低於 `groundY + 直徑` 則抬到該高度。初速 = 容器速度 + up × 0.3 m/s。
- 顆粒：sphere 直徑 0.010、摩擦 0.8、回彈 0.05、線性／角阻尼 2.0（理想球永滾）。碰撞過濾：
  顆粒 `membership = GRAIN_GROUP(4)`、`collide = ~GROUP(2)`；容器與蓋 `membership = GROUP`、
  `collide = ~GROUP`——顆粒互撞、撞地，不撞容器（避免卡在頸口），Havok 兩側 mask 都要成立才碰。
- 每顆 `setMassProperties({ mass: mass − poured × grainMass, centerOfMass })`（質心要重給，否則歸零）。
- `dispose()` 連顆粒、觀察者一併釋放。
- 校準法：側躺 90° 必倒（門檻 1.2 rad ≈ 69°）；直立 0° 不倒；蓋閉不倒。physics_test 自 0.3 m
  落下若翻倒且蓋彈開會倒粉——質心壓低（COM y −0.02）讓罐子落地站穩。

## hinge 零點 = 出廠姿勢（M11 restOffset）

工具鏈（actuation_test 吊空後取綁定為 0、目標取限位 0.6 倍；scene_test 相對綁定量角）假設 hinge 角 0 ≈
出廠姿勢。若兩 body 的 pivot node 在出廠時就繞 axis 相差 θ（如 A 字牌兩板 rotation.x = ±LEAN），
`createHinge(..., { restOffset: θ })` 會把 B 側 perp 軸預轉 θ，讓出廠姿勢讀 0，limits 也以出廠為 0 寫。
不要反過來把 spec limits 寫成「併攏 = 0、出廠 = −θ」——gate 會紅。

## 收納＝反向的質量轉移（M12 collect）

- 掃描：`(scene.getPhysicsEngine() as PhysicsEngineV2).getBodies()` 取全場 body；**先複製陣列**再迭代（dispose 會從原陣列移除）。
  排除本模型的 body（`Set(Object.values(bodies))`）、`isDisposed`、非 `PhysicsMotionType.DYNAMIC`、質量 0 或 > `maxItemMass`。
- 判定：`Vector3.TransformCoordinates(b.transformNode.absolutePosition, Matrix.Invert(pivot.getWorldMatrix()))` 減 `interior.offset`，
  三軸絕對值皆 ≤ size/2 即在內。
- 收走：`body.dispose(); body.transformNode.dispose()`。Babylon `PhysicsBody.dispose()` 有 `_isDisposed` 守衛、`isDisposed` getter：
  擁有者模型（粉罐、噴瓶）之後 `dispose()` 對同一 body 再呼叫不會炸。**所有讀 `bodies` 的消費者要跳過 `isDisposed`**
  （playground HUD／topple／scene_test 計數）。不用「隱藏＋改 static」——Havok static body 的質量回報不可靠。
- 質量：`setMassProperties({ mass: 原質量 + Σ 收進, centerOfMass })`（質心要重給）。
- 碰撞群組陷阱：粉罐顆粒與噴瓶液滴 `collide = ~2`，會穿過所有 `membership 2` 的模型件。無活動件的容器類模型（袋子、鏟刮板）
  用 `membership 8 / collide ~0`，生成物才會落進去、推得動。
- 封袋視覺只做一次（口緣 tube `scaling.set(0.3, 1, 0.3)`＋打結 mesh `setEnabled(true)`），之後 set(1) 仍可收新掉進來的東西。

### 接觸收納與倒回（M17 鏟刮板）

- `collect.trigger: "contact"`：掃描邏輯同上，掛在 `scene.onAfterPhysicsObservable` 每步跑；容量滿即停收（鏟刮板 120）。
- 收走一顆記 `{ mass, radius, color }`：radius 取 mesh `getBoundingInfo().boundingSphere.radiusWorld`（非 mesh 用 5 mm）、color 取 StandardMaterial diffuse。
  斗內顯示用 factory **自有**材質 `held-item`（顏色複製第一顆），mesh `held-<n>` 掛在 body pivot 下排格——不要借用被收物的材質（歸位重建會 dispose 它）。
- `pour.source: "collected"`：tilt／gate／節流判定同 declared，再加「`direction` 世界向量 y < 0」（出口朝下）；每倒一顆 pop 一筆記錄，在出口點生成同半徑同質量的球 `clump-<i>`（membership 4／collide ~2，同粉罐顆粒），
  初速 = body 速度 + direction × exitSpeed，body 質量減回，`held-<n>` 最後一顆 dispose。`pour:<id>` set(1) 倒完剩餘、空斗無事。
- 接觸收納排除本模型**所有** body，包含自己倒出的 `clump-`（出口點在內腔裡，否則倒出瞬間被收回）；沒倒進袋的 clump 只能由袋子收。
- 為什麼不是剛體托起：10 mm 球對 2.5 mm 唇需 1.73 mg 推力而地面摩擦只給 0.8 mg；< 2 mm 的 collider（楔形 hull、薄 box 階梯）在 Havok 直接失效。數據見 M17 設計文件 §2。
