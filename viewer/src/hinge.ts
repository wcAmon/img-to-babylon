// 單軸 hinge 與其 servo 的共用助手（M10）：pill-bottle／toy-racer／action-figure 各自
// 內聯了同一段 6DoF 鎖五軸的程式碼；三個新模型改用這裡，避免第四份漂移。
import {
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  Scene,
  Vector3,
} from "@babylonjs/core";
import type { Actuator } from "./types";

export interface HingeDef {
  pivotA: [number, number, number];
  pivotB: [number, number, number];
  axis: [number, number, number];
  limits: [number, number];
}

/** grimoire/physics.md canonical perp：axis 接近 up 用 +x，否則用 up。 */
function perpOf(axis: Vector3): Vector3 {
  const x = axis.normalizeToNew();
  const up = Math.abs(Vector3.Dot(x, Vector3.Up())) > 0.99 ? new Vector3(1, 0, 0) : Vector3.Up();
  return Vector3.Cross(x, up).normalize();
}

/** 6DoF 鎖三線軸＋兩角軸，只留 ANGULAR_X 在 limits 內；蓋與本體不互撞。 */
export function createHinge(
  scene: Scene, a: PhysicsBody, b: PhysicsBody, def: HingeDef,
): Physics6DoFConstraint {
  const axis = Vector3.FromArray(def.axis);
  const perp = perpOf(axis);
  const hinge = new Physics6DoFConstraint(
    {
      pivotA: Vector3.FromArray(def.pivotA),
      pivotB: Vector3.FromArray(def.pivotB),
      axisA: axis,
      axisB: axis,
      perpAxisA: perp,
      perpAxisB: perp,
    },
    [
      { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: def.limits[0], maxLimit: def.limits[1] },
    ],
    scene,
  );
  a.addConstraint(b, hinge);
  hinge.isCollisionsEnabled = false;
  return hinge;
}

/** hinge 的 POSITION servo（惰性啟動：第一次 set 前不影響物理）。id 慣例 `servo:<bodyB>.x`。 */
export function makeHingeServo(
  joint: Physics6DoFConstraint, bodyB: string, lo: number, hi: number, maxForce: number,
  label = `${bodyB}.x`,
): Actuator {
  let armed = false;
  return {
    id: `servo:${bodyB}.x`, kind: "servo", label, min: lo, max: hi,
    set(value: number): void {
      const v = Math.max(lo, Math.min(hi, value));
      if (!armed) {
        joint.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
        joint.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, maxForce);
        armed = true;
      }
      joint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, v);
    },
    release(): void {
      joint.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 0);
      joint.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.NONE);
      armed = false;
    },
  };
}
