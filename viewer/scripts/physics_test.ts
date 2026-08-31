// 動態物理 gate：模型從 0.3m 落下，模擬 5 秒，必須靜止、不穿地、不爆炸。
// 有 --spec 時另外檢查 physics.constraints：模擬結束後兩端 pivot 的世界座標距離
// 必須 ≤ 5mm，抓「約束被落地衝擊扯開但整體看起來仍靜止」的漏洞。
// --roll <bodyId>（需 --spec、spec 需有 limits:"free" 的 hinge）：落地靜止後對該
// body 施水平推力，斷言 (1) 沿推力方向位移 ≥ 0.1m 且側偏 < 前進的一半、
// (2) 每個自由 hinge 的輪角速度 × 輪半徑 ≈ 車速（滾動不打滑）、(3) constraint 不裂。
// 用法: npx tsx scripts/physics_test.ts <model-name> [--spec <spec.json>] [--nudge <bodyId>] [--roll <bodyId>] [--out result.json]
import {
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  Vector3,
} from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";

const SETTLE_SPEED = 0.01; // m/s
const FLOOR_EPS = -0.01;
const CONSTRAINT_TOLERANCE = 0.005; // m，跟 spec 的 5mm 容差同一把尺

const ROLL_PUSH_SPEED = 1.2; // m/s：推力換算的初速
const ROLL_MEASURE_STEPS = 60; // 推力後 1 秒量測滾動關係（尚未被摩擦耗盡）
const ROLL_COAST_STEPS = 120; // 再滑行 2 秒量位移與 constraint
const MIN_ROLL_DISTANCE = 0.1; // m：沿推力方向最小位移
const ROLL_SLIP_TOLERANCE = 0.25; // |ω·r − v| / v：滾動不打滑的容差
const MIN_MEASURE_SPEED = 0.05; // m/s：量測時車體至少要在動

interface SpecConstraint {
  type?: string;
  bodyA: string;
  bodyB: string;
  pivotA: number[];
  pivotB: number[];
  axis?: number[];
  limits?: number[] | "free";
}
interface SpecCollider { type: string; size: number[] }
interface SpecComponent { id: string; collider?: SpecCollider }
interface SpecBody { id: string; components?: string[] }
interface Spec {
  componentTree?: SpecComponent[];
  physics?: { bodies?: SpecBody[]; constraints?: SpecConstraint[] };
}

interface ConstraintResult {
  bodyA: string;
  bodyB: string;
  separation: number | null;
  ok: boolean;
  message?: string;
}

function checkConstraints(
  constraints: SpecConstraint[], bodies: Record<string, PhysicsBody>,
): ConstraintResult[] {
  return constraints.map((con) => {
    const a = bodies[con.bodyA];
    const b = bodies[con.bodyB];
    if (!a || !b) {
      const missing = !a ? con.bodyA : con.bodyB;
      return {
        bodyA: con.bodyA,
        bodyB: con.bodyB,
        separation: null,
        ok: false,
        message: `找不到 body「${missing}」（不在 model.bodies 裡）`,
      };
    }
    a.transformNode.computeWorldMatrix(true);
    b.transformNode.computeWorldMatrix(true);
    const worldA = Vector3.TransformCoordinates(
      Vector3.FromArray(con.pivotA), a.transformNode.getWorldMatrix(),
    );
    const worldB = Vector3.TransformCoordinates(
      Vector3.FromArray(con.pivotB), b.transformNode.getWorldMatrix(),
    );
    const separation = Number(Vector3.Distance(worldA, worldB).toFixed(5));
    return {
      bodyA: con.bodyA,
      bodyB: con.bodyB,
      separation,
      ok: separation <= CONSTRAINT_TOLERANCE,
    };
  });
}

interface WheelResult {
  wheel: string;
  radius: number;
  omega: number;
  slip: number | null;
  ok: boolean;
}

interface RollResult {
  pushed: string;
  forward: number;
  lateral: number;
  speedAtMeasure: number;
  wheels: WheelResult[];
  constraints: ConstraintResult[];
  pass: boolean;
  message?: string;
}

/** 從 spec 找 body 轄下第一個 cylinder collider 的半徑（size[0] / 2）。 */
function wheelRadius(spec: Spec, bodyId: string): number | null {
  const body = spec.physics?.bodies?.find((b) => b.id === bodyId);
  if (!body) return null;
  const comps = spec.componentTree ?? [];
  for (const cid of body.components ?? []) {
    const col = comps.find((c) => c.id === cid)?.collider;
    if (col?.type === "cylinder" && Number.isFinite(col.size?.[0])) {
      return col.size[0] / 2;
    }
  }
  return null;
}

function runRollPhase(
  spec: Spec,
  bodies: Record<string, PhysicsBody>,
  step: (n: number) => void,
  rollBodyId: string,
): RollResult {
  const fail = (message: string): RollResult => ({
    pushed: rollBodyId, forward: 0, lateral: 0, speedAtMeasure: 0,
    wheels: [], constraints: [], pass: false, message,
  });
  const chassis = bodies[rollBodyId];
  if (!chassis) return fail(`找不到 body「${rollBodyId}」`);
  const allCons = spec.physics?.constraints ?? [];
  const freeHinges = allCons.filter(
    (c) => c.type === "hinge" && c.limits === "free" && c.axis,
  );
  if (freeHinges.length === 0) {
    return fail("spec 無 limits:\"free\" 的 hinge constraint，--roll 無意義");
  }

  chassis.transformNode.computeWorldMatrix(true);
  const axisWorld = Vector3.TransformNormal(
    Vector3.FromArray(freeHinges[0].axis!), chassis.transformNode.getWorldMatrix(),
  ).normalize();
  const dir = Vector3.Cross(axisWorld, Vector3.Up());
  if (dir.length() < 1e-3) return fail("hinge axis 接近垂直，推不出水平行進方向");
  dir.normalize();

  const totalMass = Object.values(bodies).reduce(
    (sum, b) => sum + (b.getMassProperties().mass ?? 0), 0,
  );
  const start = chassis.transformNode.absolutePosition.clone();
  chassis.applyImpulse(
    dir.scale(totalMass * ROLL_PUSH_SPEED), chassis.transformNode.absolutePosition,
  );

  step(ROLL_MEASURE_STEPS);
  const vel = chassis.getLinearVelocity();
  const speedAtMeasure = new Vector3(vel.x, 0, vel.z).length();
  chassis.transformNode.computeWorldMatrix(true);
  const axisNow = Vector3.TransformNormal(
    Vector3.FromArray(freeHinges[0].axis!), chassis.transformNode.getWorldMatrix(),
  ).normalize();
  const wheels: WheelResult[] = freeHinges.map((con) => {
    const wheel = bodies[con.bodyB];
    const radius = wheelRadius(spec, con.bodyB);
    if (!wheel || radius === null) {
      return { wheel: con.bodyB, radius: radius ?? 0, omega: 0, slip: null, ok: false };
    }
    const omega = Math.abs(Vector3.Dot(wheel.getAngularVelocity(), axisNow));
    const slip = speedAtMeasure > 1e-6
      ? Math.abs(omega * radius - speedAtMeasure) / speedAtMeasure
      : null;
    return {
      wheel: con.bodyB,
      radius,
      omega: Number(omega.toFixed(4)),
      slip: slip === null ? null : Number(slip.toFixed(4)),
      ok: slip !== null && slip <= ROLL_SLIP_TOLERANCE,
    };
  });

  step(ROLL_COAST_STEPS);
  const disp = chassis.transformNode.absolutePosition.subtract(start);
  const forward = Vector3.Dot(disp, dir);
  const lateralVec = disp.subtract(dir.scale(forward));
  const lateral = new Vector3(lateralVec.x, 0, lateralVec.z).length();
  const constraints = checkConstraints(
    allCons.filter((c) => c.pivotA && c.pivotB), bodies,
  );
  const pass = forward >= MIN_ROLL_DISTANCE
    && lateral <= Math.max(forward * 0.5, 0.05)
    && speedAtMeasure >= MIN_MEASURE_SPEED
    && wheels.every((w) => w.ok)
    && constraints.every((c) => c.ok);
  return {
    pushed: rollBodyId,
    forward: Number(forward.toFixed(4)),
    lateral: Number(lateral.toFixed(4)),
    speedAtMeasure: Number(speedAtMeasure.toFixed(4)),
    wheels,
    constraints,
    pass,
  };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const nudgeIdx = argv.indexOf("--nudge");
  const nudgeBody = nudgeIdx >= 0 ? argv[nudgeIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const rollIdx = argv.indexOf("--roll");
  const rollBody = rollIdx >= 0 ? argv[rollIdx + 1] : null;
  if (!name || !(name in registry)) {
    console.error(
      `用法: physics_test.ts <model-name> [--spec <spec.json>] [--nudge <bodyId>] [--roll <bodyId>] [--out result.json]；`
      + `已知: ${Object.keys(registry).join(", ")}`,
    );
    return 2;
  }
  if (rollBody && !specPath) {
    console.error("--roll 需要 --spec（輪半徑與自由 hinge 從 spec 讀）");
    return 2;
  }
  const spec: Spec = specPath
    ? (JSON.parse(readFileSync(specPath, "utf8")) as Spec)
    : {};
  const specConstraints: SpecConstraint[] = spec.physics?.constraints ?? [];

  const ctx = await createHeadlessScene();
  const { scene, step } = ctx;

  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
  const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const gShape = new PhysicsShapeBox(
    new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), scene,
  );
  gShape.material = { friction: 0.7, restitution: 0.2 };
  gBody.shape = gShape;

  const factory = (await registry[name]()).default;
  const model = factory(scene, { physics: true });

  // 抬高 0.3m 再讓物理接管
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = false; });
  model.root.position.y += 0.3;
  step(2);
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = true; });

  step(60); // 1 秒：自由落體 + 落地
  if (nudgeBody && model.bodies[nudgeBody]) {
    const b = model.bodies[nudgeBody];
    const mass = b.getMassProperties().mass ?? 0.1;
    b.applyImpulse(new Vector3(0, mass * 1.0, 0), b.transformNode.absolutePosition);
  }
  step(240); // 再 4 秒

  const bodies = Object.entries(model.bodies).map(([id, b]) => {
    const v = b.getLinearVelocity();
    const p = b.transformNode.absolutePosition;
    return {
      id,
      speed: Number(v.length().toFixed(5)),
      y: Number(p.y.toFixed(5)),
      finite: [p.x, p.y, p.z].every(Number.isFinite),
    };
  });
  const constraints = checkConstraints(specConstraints, model.bodies);
  const settlePass = bodies.length > 0 && bodies.every(
    (r) => r.speed < SETTLE_SPEED && r.y > FLOOR_EPS && r.finite,
  ) && constraints.every((c) => c.ok);

  const roll = rollBody
    ? runRollPhase(spec, model.bodies, step, rollBody)
    : null;

  const pass = settlePass && (roll === null || roll.pass);
  const result = { model: name, nudged: nudgeBody, pass, bodies, constraints, roll };
  console.log(JSON.stringify(result, null, 2));
  if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));
  ctx.dispose();
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code));
