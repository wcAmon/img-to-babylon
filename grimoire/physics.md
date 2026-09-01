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

- **質量分配**：軀幹最重，四肢遞減（玩具公仔參考：軀幹 ~0.05 kg、頭 ~0.02 kg、
  大腿/上臂 ~0.01 kg、小腿/前臂 ~0.008 kg）。全身質量別差超過一個數量級太多，
  否則 solver 抖動。
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
- **關節角量測必須用 XZY 順序分解**：Havok 逐軸角限位的執行語意沒有公開文件，
  倒立擺探針（重力持續壓限位）實測：XZY Tait-Bryan 萃取與其最接近（鎖死軸殘餘
  ≤0.05 rad），而 Babylon `toEulerAngles()`（YXZ）在兩軸同時大角度時串擾可達
  0.19 rad，會誤報限位違規。`physics_test.ts` 的 `eulerXZY` 是準則實作。
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
