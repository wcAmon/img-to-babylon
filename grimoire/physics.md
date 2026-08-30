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
- `PhysicsShapeContainer` 的子形狀位置是相對 body 的 transform node，不是世界座標。
- constraint 加在兩個 body 之間（`bodyA.addConstraint(bodyB, c)`），不是 mesh。
- 蓋子質量遠小於瓶身時，把 hinge 兩端 pivot 算準（差 1cm 就會震盪）。
