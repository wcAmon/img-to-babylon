// 動態物理 gate：模型從 0.3m 落下，模擬 5 秒，必須靜止、不穿地、不爆炸。
// 有 --spec 時另外檢查 physics.constraints：模擬結束後兩端 pivot 的世界座標距離
// 必須 ≤ 5mm，抓「約束被落地衝擊扯開但整體看起來仍靜止」的漏洞。
// 用法: npx tsx scripts/physics_test.ts <model-name> [--spec <spec.json>] [--nudge <bodyId>] [--out result.json]
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

interface SpecConstraint { bodyA: string; bodyB: string; pivotA: number[]; pivotB: number[] }
interface Spec { physics?: { constraints?: SpecConstraint[] } }

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

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const nudgeIdx = argv.indexOf("--nudge");
  const nudgeBody = nudgeIdx >= 0 ? argv[nudgeIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  if (!name || !(name in registry)) {
    console.error(
      `用法: physics_test.ts <model-name> [--spec <spec.json>] [--nudge <bodyId>] [--out result.json]；`
      + `已知: ${Object.keys(registry).join(", ")}`,
    );
    return 2;
  }
  const specConstraints: SpecConstraint[] = specPath
    ? (JSON.parse(readFileSync(specPath, "utf8")) as Spec).physics?.constraints ?? []
    : [];

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
  const pass = bodies.length > 0 && bodies.every(
    (r) => r.speed < SETTLE_SPEED && r.y > FLOOR_EPS && r.finite,
  ) && constraints.every((c) => c.ok);
  const result = { model: name, nudged: nudgeBody, pass, bodies, constraints };
  console.log(JSON.stringify(result, null, 2));
  if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));
  ctx.dispose();
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code));
