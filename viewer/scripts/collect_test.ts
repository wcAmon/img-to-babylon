// 收納 gate（M12 collect）：spec 有 collect 的 body 必須 (1) 自 interior 上方 0.30 m 丟 8 顆測試球（d 0.012、0.005 kg）
// ＋袋外 2 顆，300 步後 8 顆質心皆在 interior 世界框內、全部有限；(2) collect:<id> set(1) → 8 顆 mesh／body dispose、
// 質量 = mass + 8×0.005（1e-5）、袋外 2 顆不動；(3) 再 set(1) 質量不變；(4) 模型 dispose 後場景只剩地面與袋外 2 顆。
// 用法: npx tsx scripts/collect_test.ts <model-name> --spec <spec.json> [--out result.json]
import {
  Matrix,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  Quaternion,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";

const LAND_STEPS = 120;
const DROP_STEPS = 300;
const DROP_HEIGHT = 0.30;
const N_IN = 8, N_OUT = 2;
const BALL_D = 0.012, BALL_MASS = 0.005, BALL_DAMPING = 2.0;
const SCATTER = 0.05;
const OUT_X = 0.5;

interface SpecCollect { trigger?: "manual" | "contact"; interior: { size: number[]; offset: number[] }; maxItemMass: number }
interface SpecBody { id: string; mass: number; collect?: SpecCollect }
interface Spec { physics?: { bodies?: SpecBody[] } }
interface Check { id: string; ok: boolean; detail: string }

function makeBall(scene: Scene, name: string, pos: Vector3): PhysicsBody {
  const m = MeshBuilder.CreateSphere(name, { diameter: BALL_D, segments: 6 }, scene);
  m.position.copyFrom(pos);
  const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
  const s = new PhysicsShapeSphere(Vector3.Zero(), BALL_D / 2, scene);
  s.material = { friction: 0.6, restitution: 0.05 };
  b.shape = s;
  b.setMassProperties({ mass: BALL_MASS });
  b.setLinearDamping(BALL_DAMPING); b.setAngularDamping(BALL_DAMPING);
  return b;
}

/** interior 世界框：中心與「點是否在內」判定（body 局部框 → 世界）。 */
function interiorOf(body: PhysicsBody, c: SpecCollect): { center: Vector3; inside(p: Vector3): boolean } {
  const node = body.transformNode;
  node.computeWorldMatrix(true);
  const wm = node.getWorldMatrix();
  const inv = Matrix.Invert(wm);
  const off = Vector3.FromArray(c.interior.offset);
  const half = Vector3.FromArray(c.interior.size).scale(0.5);
  return {
    center: Vector3.TransformCoordinates(off, wm),
    inside(p: Vector3): boolean {
      const l = Vector3.TransformCoordinates(p, inv).subtract(off);
      return Math.abs(l.x) <= half.x && Math.abs(l.y) <= half.y && Math.abs(l.z) <= half.z;
    },
  };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath) {
    console.error(`用法: collect_test.ts <model-name> --spec <spec.json> [--out result.json]；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const decls = (spec.physics?.bodies ?? []).filter((b) => b.collect);
  if (!decls.length) {
    console.log(JSON.stringify({ model: name, checks: [], pass: true, note: "spec 無 collect 宣告" }));
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
    gShape.material = { friction: 0.7, restitution: 0.2 };
    gBody.shape = gShape;
    const factory = (await registry[name]()).default;
    const model = factory(scene, { physics: true });
    step(LAND_STEPS);
    const body = model.bodies[decl.id];
    const box = interiorOf(body, decl.collect!);
    const inBalls: PhysicsBody[] = [];
    for (let i = 0; i < N_IN; i++) {
      const a = (i / N_IN) * Math.PI * 2;
      inBalls.push(makeBall(scene, `test-in-${i}`, box.center.add(new Vector3(Math.cos(a) * SCATTER, DROP_HEIGHT, Math.sin(a) * SCATTER * 0.6))));
    }
    const outBalls = [
      makeBall(scene, "test-out-0", box.center.add(new Vector3(OUT_X, 0.1, 0))),
      makeBall(scene, "test-out-1", box.center.add(new Vector3(-OUT_X, 0.1, 0))),
    ];
    step(DROP_STEPS);
    const finite = [...inBalls, ...outBalls, ...Object.values(model.bodies)].every((b) => {
      if (b.isDisposed) return true;
      const p = b.transformNode.absolutePosition; return [p.x, p.y, p.z].every(Number.isFinite);
    });
    if (decl.collect!.trigger === "contact") {
      // M17 接觸收納：不按 set(1) 就已收走，斗內 held-<n> 顯示、質量已加
      const gone0 = inBalls.filter((b) => b.isDisposed && b.transformNode.isDisposed()).length;
      const heldN = Object.keys(model.meshes).filter((k) => k.startsWith("held-")).length;
      const kept0 = outBalls.filter((b) => !b.isDisposed).length;
      const mass0 = body.getMassProperties().mass ?? NaN;
      const expected0 = decl.mass + N_IN * BALL_MASS;
      push(`contact:${decl.id}`, gone0 === N_IN && heldN === N_IN && kept0 === N_OUT && Math.abs(mass0 - expected0) < 1e-5 && finite,
        `接觸收走 ${gone0}/${N_IN}、held ${heldN}、袋外保留 ${kept0}/${N_OUT}、質量 ${mass0}（期望 ${expected0}）、有限 ${finite}`);
    } else {
      const insideN = inBalls.filter((b) => box.inside(b.transformNode.absolutePosition)).length;
      push(`contain:${decl.id}`, insideN === N_IN && finite, `袋內 ${insideN}/${N_IN}、有限 ${finite}`);
    }

    const act = model.actuators?.find((a) => a.id === `collect:${decl.id}`);
    if (!act) {
      push(`collect:${decl.id}:actuator`, false, "無 collect actuator");
    } else {
      act.set(1); step(2);
      const mass = body.getMassProperties().mass ?? NaN;
      const expected = decl.mass + N_IN * BALL_MASS;
      const gone = inBalls.filter((b) => b.isDisposed && b.transformNode.isDisposed()).length;
      const kept = outBalls.filter((b) => !b.isDisposed).length;
      push(`collect:${decl.id}:collected`, gone === N_IN && kept === N_OUT && Math.abs(mass - expected) < 1e-5,
        `收走 ${gone}/${N_IN}、袋外保留 ${kept}/${N_OUT}、質量 ${mass}（期望 ${expected}）`);
      act.set(1); step(2);
      const mass2 = body.getMassProperties().mass ?? NaN;
      push(`collect:${decl.id}:idempotent`, Math.abs(mass2 - expected) < 1e-5, `再觸發質量 ${mass2}`);
    }
    model.dispose();
    const left = scene.meshes.map((m) => m.name).sort();
    push(`collect:${decl.id}:dispose`, left.length === 1 + N_OUT && left.every((n) => n === "ground" || n.startsWith("test-out-")),
      `dispose 後場景 mesh：${left.join(",")}`);
    ctx.dispose();
  }
  const pass = checks.length > 0 && checks.every((c) => c.ok);
  const json = JSON.stringify({ model: name, checks, pass }, null, 2);
  console.log(json);
  if (outPath) writeFileSync(outPath, json);
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(2); });
