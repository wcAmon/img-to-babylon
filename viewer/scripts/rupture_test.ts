// 破裂 gate（M10 rupture）：spec 有 rupture 的 body 必須 (A) 自 1.5m 落下破裂——質量降到
// emptiedMass、meshes.puddle 出現且半徑收斂到 puddleRadius、液滴數正確且 300 步後靜止、
// 全部有限；(B) 自 0.2m 落下不破；(C) 手動 rupture:<id> 觸發兩次只破一次，dispose 乾淨。
// 用法: npx tsx scripts/rupture_test.ts <model-name> --spec <spec.json> [--out result.json]
import {
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  Vector3,
} from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene, type HeadlessContext } from "../src/headless";
import { registry } from "../src/registry";
import type { BuiltModel } from "../src/types";

const HIGH_DROP = 1.5; // m：必破
const LOW_DROP = 0.2; // m：不破
const FALL_STEPS = 120; // 2 秒：落地
const PUDDLE_STEPS = 120; // 水漬長到全徑（90 幀）再多給
const SETTLE_STEPS = 300;
const SETTLE_SPEED = 0.02;
const RADIUS_TOL = 0.02; // m

interface SpecRupture { impulseThreshold: number; emptiedMass: number; puddleRadius: number; droplets: number }
interface SpecBody { id: string; mass: number; rupture?: SpecRupture }
interface Spec { physics?: { bodies?: SpecBody[] } }
interface Check { id: string; ok: boolean; detail: string }

async function spawn(name: string, dropHeight: number): Promise<{ ctx: HeadlessContext; model: BuiltModel }> {
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
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = false; });
  model.root.position.y += dropHeight;
  step(2);
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = true; });
  return { ctx, model };
}

function droplets(model: BuiltModel): PhysicsBody[] {
  return Object.entries(model.bodies).filter(([k]) => k.startsWith("droplet-")).map(([, b]) => b);
}

function puddleRadius(model: BuiltModel): number | null {
  const p = model.meshes["puddle"];
  if (!p) return null;
  p.computeWorldMatrix(true);
  p.refreshBoundingInfo({});
  const bb = p.getBoundingInfo().boundingBox;
  return (bb.maximumWorld.x - bb.minimumWorld.x) / 2;
}

function allFinite(model: BuiltModel): boolean {
  return Object.values(model.bodies).every((b) => {
    const p = b.transformNode.absolutePosition;
    return [p.x, p.y, p.z].every(Number.isFinite);
  });
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath) {
    console.error(`用法: rupture_test.ts <model-name> --spec <spec.json> [--out result.json]；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const decls = (spec.physics?.bodies ?? []).filter((b) => b.rupture);
  if (!decls.length) {
    console.log(JSON.stringify({ model: name, checks: [], pass: true, note: "spec 無 rupture 宣告" }));
    return 0;
  }
  const checks: Check[] = [];
  const push = (id: string, ok: boolean, detail: string): void => { checks.push({ id, ok, detail }); };

  for (const decl of decls) {
    const rup = decl.rupture!;
    // (A) 高落必破
    {
      const { ctx, model } = await spawn(name, HIGH_DROP);
      ctx.step(FALL_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      push(`A:${decl.id}:mass`, Math.abs(mass - rup.emptiedMass) < 1e-6, `落 ${HIGH_DROP}m 後質量 ${mass}（期望 ${rup.emptiedMass}）`);
      ctx.step(PUDDLE_STEPS);
      const r = puddleRadius(model);
      push(`A:${decl.id}:puddle`, r !== null && Math.abs(r - rup.puddleRadius) <= RADIUS_TOL, `水漬半徑 ${r}（期望 ${rup.puddleRadius}）`);
      const ds = droplets(model);
      push(`A:${decl.id}:droplets`, ds.length === rup.droplets, `液滴 ${ds.length}（期望 ${rup.droplets}）`);
      ctx.step(SETTLE_STEPS);
      const maxSpeed = Math.max(0, ...ds.map((d) => d.getLinearVelocity().length()));
      push(`A:${decl.id}:settle`, maxSpeed < SETTLE_SPEED && allFinite(model), `液滴最大速度 ${maxSpeed.toFixed(4)}，有限 ${allFinite(model)}`);
      ctx.dispose();
    }
    // (B) 低落不破
    {
      const { ctx, model } = await spawn(name, LOW_DROP);
      ctx.step(FALL_STEPS + SETTLE_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      push(`B:${decl.id}:intact`, Math.abs(mass - decl.mass) < 1e-6 && !model.meshes["puddle"] && droplets(model).length === 0,
        `落 ${LOW_DROP}m 後質量 ${mass}（期望 ${decl.mass}）、puddle=${!!model.meshes["puddle"]}`);
      ctx.dispose();
    }
    // (C) 手動觸發冪等＋dispose 乾淨
    {
      const { ctx, model } = await spawn(name, 0);
      ctx.step(60);
      const act = model.actuators?.find((a) => a.id === `rupture:${decl.id}`);
      if (!act) {
        push(`C:${decl.id}:actuator`, false, "無 rupture actuator");
      } else {
        act.set(1); ctx.step(5); act.set(1); ctx.step(5);
        const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
        push(`C:${decl.id}:idempotent`, Math.abs(mass - rup.emptiedMass) < 1e-6 && droplets(model).length === rup.droplets,
          `質量 ${mass}、液滴 ${droplets(model).length}（期望 ${rup.droplets}）`);
      }
      model.dispose();
      push(`C:${decl.id}:dispose`, !ctx.scene.meshes.some((m) => m.name === "puddle" || m.name.startsWith("droplet-")),
        "dispose 後場景無 puddle／droplet mesh");
      ctx.dispose();
    }
  }
  const pass = checks.length > 0 && checks.every((c) => c.ok);
  const json = JSON.stringify({ model: name, checks, pass }, null, 2);
  console.log(json);
  if (outPath) writeFileSync(outPath, json);
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(2); });
