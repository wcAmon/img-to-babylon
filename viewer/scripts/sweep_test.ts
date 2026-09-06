// 掃收 gate（M17 collect trigger contact）：spec 有 collect.trigger contact 的 body 必須能貼地掃過地面顆粒把它們收進來——
// 7 顆 d 0.010／0.003 kg／摩擦 0.8／阻尼 2.0 的球排在內腔前緣前方 5～29 cm 三車道，body 姿態鎖定、貼地沿 pour.direction（無則局部 +z）
// 以 0.25 m/s 推 0.5 m、停 60 步 → 收進 ≥ 5、質量 = mass + n×0.003、位置有限。無 contact 宣告印略過 PASS。
// 用法: npx tsx scripts/sweep_test.ts <model-name> --spec <spec.json> [--out result.json]
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeSphere, Quaternion, Scene, Vector3 } from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";

const LAND_STEPS = 120, SETTLE_STEPS = 60, STOP_STEPS = 60;
const N = 7, BALL_D = 0.010, BALL_MASS = 0.003, BALL_DAMPING = 2.0;
const SPEED = 0.25, SWEEP = 0.5, LEAD = 0.05, GAP = 0.04, LANE = 0.04;
const MIN_COLLECTED = 5;

interface SpecCollect { trigger?: string; interior: { size: number[]; offset: number[] }; maxItemMass: number }
interface SpecBody { id: string; mass: number; collect?: SpecCollect; pour?: { direction?: number[] } }
interface Spec { physics?: { bodies?: SpecBody[] } }
interface Check { id: string; ok: boolean; detail: string }

function makeBall(scene: Scene, name: string, pos: Vector3): PhysicsBody {
  const m = MeshBuilder.CreateSphere(name, { diameter: BALL_D, segments: 6 }, scene);
  m.position.copyFrom(pos);
  const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
  const s = new PhysicsShapeSphere(Vector3.Zero(), BALL_D / 2, scene);
  s.material = { friction: 0.8, restitution: 0.05 };
  b.shape = s; b.setMassProperties({ mass: BALL_MASS });
  b.setLinearDamping(BALL_DAMPING); b.setAngularDamping(BALL_DAMPING);
  return b;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath) {
    console.error(`用法: sweep_test.ts <model-name> --spec <spec.json> [--out result.json]；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const decls = (spec.physics?.bodies ?? []).filter((b) => b.collect?.trigger === "contact");
  if (!decls.length) {
    console.log(JSON.stringify({ model: name, checks: [], pass: true, note: "spec 無 collect.trigger contact 宣告" }));
    return 0;
  }
  const checks: Check[] = [];
  const push = (id: string, ok: boolean, detail: string): void => { checks.push({ id, ok, detail }); };

  for (const decl of decls) {
    const ctx = await createHeadlessScene();
    const { scene, step } = ctx;
    const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
    const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
    const gShape = new PhysicsShapeBox(new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), scene);
    gShape.material = { friction: 0.6, restitution: 0.1 };
    gBody.shape = gShape;
    const factory = (await registry[name]()).default;
    const model = factory(scene, { physics: true });
    step(LAND_STEPS);
    const body = model.bodies[decl.id];
    const node = body.transformNode;
    node.computeWorldMatrix(true);
    const dirLocal = Vector3.FromArray(decl.pour?.direction ?? [0, 0, 1]).normalize();
    const front = Vector3.TransformNormal(dirLocal, node.getWorldMatrix()).normalize();
    const right = Vector3.Cross(Vector3.Up(), front).normalize();
    const c = decl.collect!.interior;
    const frontEdge = c.offset[2] + c.size[2] / 2; // 內腔前緣（沿局部 +z）
    const balls: PhysicsBody[] = [];
    for (let i = 0; i < N; i++) {
      const p = node.absolutePosition.add(front.scale(frontEdge + LEAD + i * GAP)).add(right.scale(((i % 3) - 1) * LANE));
      p.y = BALL_D / 2;
      balls.push(makeBall(scene, `sweep-${i}`, p));
    }
    step(SETTLE_STEPS);
    const start = node.absolutePosition.clone();
    const obs = scene.onBeforePhysicsObservable.add(() => {
      const v = body.getLinearVelocity();
      body.setLinearVelocity(new Vector3(front.x * SPEED, Math.min(v.y, 0), front.z * SPEED));
      body.setAngularVelocity(Vector3.Zero());
    });
    step(Math.round(SWEEP / SPEED * 60));
    scene.onBeforePhysicsObservable.remove(obs);
    body.setLinearVelocity(Vector3.Zero());
    step(STOP_STEPS);
    node.computeWorldMatrix(true);
    const collected = balls.filter((b) => b.isDisposed && b.transformNode.isDisposed()).length;
    const heldN = Object.keys(model.meshes).filter((k) => k.startsWith("held-")).length;
    const mass = body.getMassProperties().mass ?? NaN;
    const moved = Vector3.Distance(node.absolutePosition, start);
    const p = node.absolutePosition;
    const finite = [p.x, p.y, p.z].every(Number.isFinite);
    push(`sweep:${decl.id}`, collected >= MIN_COLLECTED && heldN === collected && Math.abs(mass - (decl.mass + collected * BALL_MASS)) < 1e-5 && finite,
      `收進 ${collected}/${N}（≥ ${MIN_COLLECTED}）、held ${heldN}、質量 ${mass}（期望 ${decl.mass + collected * BALL_MASS}）、推進 ${moved.toFixed(3)} m、有限 ${finite}`);
    model.dispose();
    ctx.dispose();
  }
  const pass = checks.length > 0 && checks.every((c) => c.ok);
  const json = JSON.stringify({ model: name, checks, pass }, null, 2);
  console.log(json);
  if (outPath) writeFileSync(outPath, json);
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(2); });
