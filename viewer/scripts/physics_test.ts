// 動態物理 gate：模型從 0.3m 落下，模擬 5 秒，必須靜止、不穿地、不爆炸。
// 用法: npx tsx scripts/physics_test.ts <model-name> [--nudge <bodyId>] [--out result.json]
import {
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  Vector3,
} from "@babylonjs/core";
import { writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";

const SETTLE_SPEED = 0.01; // m/s
const FLOOR_EPS = -0.01;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const nudgeIdx = argv.indexOf("--nudge");
  const nudgeBody = nudgeIdx >= 0 ? argv[nudgeIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry)) {
    console.error(`用法: physics_test.ts <model-name>；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }

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
  const pass = bodies.length > 0 && bodies.every(
    (r) => r.speed < SETTLE_SPEED && r.y > FLOOR_EPS && r.finite,
  );
  const result = { model: name, nudged: nudgeBody, pass, bodies };
  console.log(JSON.stringify(result, null, 2));
  if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));
  ctx.dispose();
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code));
