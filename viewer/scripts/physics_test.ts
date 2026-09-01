// 動態物理 gate：模型從 0.3m 落下，模擬 5 秒，必須靜止、不穿地、不爆炸。
// 有 --spec 時另外檢查 physics.constraints：模擬結束後兩端 pivot 的世界座標距離
// 必須 ≤ 5mm，抓「約束被落地衝擊扯開但整體看起來仍靜止」的漏洞。
// --roll <bodyId>（需 --spec、spec 需有 limits:"free" 的 hinge）：落地靜止後對該
// body 施水平推力，斷言 (1) 沿推力方向位移 ≥ 0.1m 且側偏 < 前進的一半、
// (2) 每個自由 hinge 的輪角速度 × 輪半徑 ≈ 車速（滾動不打滑）、(3) constraint 不裂。
// --ragdoll（需 --spec）：出生時傾斜 0.3 rad 再落下，斷言 (1) 落地後每個 hinge/joint
// 的實測關節角在限位內（±ε）、(2) 最終身高 < 站高 60%（真的癱倒，不是立正卡死）、
// (3) constraint 不裂（含在 settle 檢查）。
// 用法: npx tsx scripts/physics_test.ts <model-name> [--spec <spec.json>] [--nudge <bodyId>] [--roll <bodyId>] [--ragdoll] [--out result.json]
import {
  Matrix,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  TransformNode,
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

const RAGDOLL_TILT = 0.3; // rad：出生傾斜——膝/肘是單向 hinge，直挺挺落地可能站住
const RAGDOLL_EXTRA_STEPS = 180; // ragdoll 癱倒比剛體落地慢，多給 3 秒
const RAGDOLL_ANGLE_EPS = 0.15; // rad：關節角限位的 solver 餘裕
const RAGDOLL_COLLAPSE_RATIO = 0.6; // 最終身高 / 站高 必須低於此值

type AngularLimit = number[] | "free" | "locked";

interface SpecConstraint {
  type?: string;
  bodyA: string;
  bodyB: string;
  pivotA: number[];
  pivotB: number[];
  axis?: number[];
  limits?: number[] | "free";
  angular?: Partial<Record<"x" | "y" | "z", AngularLimit>>;
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

interface JointAngleResult {
  bodyA: string;
  bodyB: string;
  type: string;
  angles: Partial<Record<"x" | "y" | "z", number>>;
  ok: boolean;
}

interface RagdollResult {
  standHeight: number;
  finalHeight: number;
  collapsed: boolean;
  joints: JointAngleResult[];
  pass: boolean;
}

/** grimoire/physics.md 的 canonical perp 規則：factory 與 gate 用同一條，frame 才一致。 */
function jointFrame(axis: Vector3): Matrix {
  const x = axis.normalizeToNew();
  const up = Math.abs(Vector3.Dot(x, Vector3.Up())) > 0.99
    ? new Vector3(1, 0, 0) : Vector3.Up();
  const y = Vector3.Cross(x, up).normalize();
  const z = Vector3.Cross(x, y).normalize();
  const m = Matrix.Identity();
  Matrix.FromValuesToRef(
    x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1, m,
  );
  return m; // 列＝frame 基底（Babylon row-vector 慣例：v_frame × M = v_bodyA）
}

/** XZY 順序的 Tait-Bryan 萃取——經倒立擺探針實測，與 Havok 6DoF 逐軸限位的
 * 執行語意最接近（鎖死軸殘餘 ≤0.05 rad；Babylon toEulerAngles 串擾達 0.19）。 */
function eulerXZY(m: Matrix): Vector3 {
  const v = m.getRotationMatrix().m;
  const g = (r: number, c: number): number => v[r * 4 + c];
  const clamp = (x: number): number => Math.max(-1, Math.min(1, x));
  return new Vector3(
    Math.atan2(g(1, 2), g(1, 1)),
    Math.atan2(g(2, 0), g(0, 0)),
    Math.asin(clamp(-g(1, 0))),
  );
}

function worldRotation(b: PhysicsBody): Matrix {
  b.transformNode.computeWorldMatrix(true);
  return b.transformNode.getWorldMatrix().getRotationMatrix();
}

/** bodyB 相對 bodyA 的旋轉（A 局部座標，row-vector：Rb × Ra⁻¹）。 */
function relativeRotation(a: PhysicsBody, b: PhysicsBody): Matrix {
  return worldRotation(b).multiply(Matrix.Invert(worldRotation(a)));
}

function bindPoses(
  constraints: SpecConstraint[], bodies: Record<string, PhysicsBody>,
): Map<SpecConstraint, Matrix> {
  const map = new Map<SpecConstraint, Matrix>();
  for (const con of constraints) {
    const a = bodies[con.bodyA];
    const b = bodies[con.bodyB];
    if (a && b && con.axis) map.set(con, relativeRotation(a, b));
  }
  return map;
}

function angleWithin(v: AngularLimit | undefined, angle: number): boolean {
  if (v === "free") return true;
  if (v === undefined || v === "locked") return Math.abs(angle) <= RAGDOLL_ANGLE_EPS;
  return angle >= v[0] - RAGDOLL_ANGLE_EPS && angle <= v[1] + RAGDOLL_ANGLE_EPS;
}

/** 落地後逐 constraint 量關節角（相對綁定姿勢，constraint frame 的 Euler 近似）。 */
function measureJoints(
  binds: Map<SpecConstraint, Matrix>, bodies: Record<string, PhysicsBody>,
): JointAngleResult[] {
  const results: JointAngleResult[] = [];
  for (const [con, bind] of binds) {
    const a = bodies[con.bodyA];
    const b = bodies[con.bodyB];
    const frame = jointFrame(Vector3.FromArray(con.axis!));
    const delta = Matrix.Invert(bind).multiply(relativeRotation(a, b));
    const inFrame = frame.multiply(delta).multiply(Matrix.Invert(frame));
    const e = eulerXZY(inFrame);
    if (con.type === "hinge") {
      const ok = con.limits === "free" || angleWithin(con.limits, e.x);
      results.push({
        bodyA: con.bodyA, bodyB: con.bodyB, type: "hinge",
        angles: { x: Number(e.x.toFixed(4)) }, ok,
      });
    } else {
      const ang = con.angular ?? {};
      const ok = angleWithin(ang.x, e.x) && angleWithin(ang.y, e.y)
        && angleWithin(ang.z, e.z);
      results.push({
        bodyA: con.bodyA, bodyB: con.bodyB, type: "joint",
        angles: {
          x: Number(e.x.toFixed(4)),
          y: Number(e.y.toFixed(4)),
          z: Number(e.z.toFixed(4)),
        },
        ok,
      });
    }
  }
  return results;
}

function hierarchyHeight(root: TransformNode): number {
  root.computeWorldMatrix(true);
  const { min, max } = root.getHierarchyBoundingVectors(true);
  return max.y - min.y;
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
  const ragdoll = argv.includes("--ragdoll");
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
  if (ragdoll && !specPath) {
    console.error("--ragdoll 需要 --spec（關節限位從 spec 讀）");
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

  const standHeight = ragdoll ? hierarchyHeight(model.root) : 0;
  const binds = ragdoll
    ? bindPoses(specConstraints, model.bodies)
    : new Map<SpecConstraint, Matrix>();

  // 抬高 0.3m 再讓物理接管；ragdoll 另加出生傾斜（直挺挺落地可能站住）
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = false; });
  model.root.position.y += 0.3;
  if (ragdoll) model.root.rotation.z += RAGDOLL_TILT;
  step(2);
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = true; });

  step(60); // 1 秒：自由落體 + 落地
  if (ragdoll) step(RAGDOLL_EXTRA_STEPS); // 癱倒需要時間
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

  let ragdollResult: RagdollResult | null = null;
  if (ragdoll) {
    const joints = measureJoints(binds, model.bodies);
    const finalHeight = hierarchyHeight(model.root);
    const collapsed = finalHeight < standHeight * RAGDOLL_COLLAPSE_RATIO;
    ragdollResult = {
      standHeight: Number(standHeight.toFixed(4)),
      finalHeight: Number(finalHeight.toFixed(4)),
      collapsed,
      joints,
      pass: collapsed && joints.length > 0 && joints.every((j) => j.ok),
    };
  }

  const pass = settlePass && (roll === null || roll.pass)
    && (ragdollResult === null || ragdollResult.pass);
  const result = {
    model: name, nudged: nudgeBody, pass, bodies, constraints, roll,
    ragdoll: ragdollResult,
  };
  console.log(JSON.stringify(result, null, 2));
  if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));
  ctx.dispose();
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code));
