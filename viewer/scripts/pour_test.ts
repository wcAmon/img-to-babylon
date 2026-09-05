// 傾倒 gate（M11 pour）：spec 有 pour 的 body 必須 (A) 蓋閉、側躺 300 步不倒——顆粒 0、質量不變；
// (B) 蓋開（gate servo 上限）、側躺 → 300 步內顆粒數 = grains、質量 = mass − grains×grainMass，
// 再 300 步顆粒全靜止且全部有限；(C) 直立、蓋開 120 步不倒；手動 pour:<id> set(1) 兩次只倒一輪；
// dispose 後場景無 grain mesh。
// 用法: npx tsx scripts/pour_test.ts <model-name> --spec <spec.json> [--out result.json]
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

const LAND_STEPS = 120;
const POUR_STEPS = 300;
const SETTLE_STEPS = 300;
const SETTLE_SPEED = 0.02;
const LYING_LIFT = 0.06; // m：側躺時 root 抬高，讓半徑 0.04 的罐身不從地下出生

interface SpecPour { tiltThreshold: number; grains: number; grainMass: number; ratePerSecond: number; gate?: { body: string; minAngle: number } }
interface SpecBody { id: string; mass: number; pour?: SpecPour }
interface SpecConstraint { type: string; bodyA: string; bodyB: string; limits?: number[] | "free" }
interface Spec { physics?: { bodies?: SpecBody[]; constraints?: SpecConstraint[] } }
interface Check { id: string; ok: boolean; detail: string }

async function spawn(name: string, lying: boolean): Promise<{ ctx: HeadlessContext; model: BuiltModel }> {
  const ctx = await createHeadlessScene();
  const { scene, step } = ctx;
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
  const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const gShape = new PhysicsShapeBox(new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), scene);
  gShape.material = { friction: 0.7, restitution: 0.2 };
  gBody.shape = gShape;
  const factory = (await registry[name]()).default;
  const model = factory(scene, { physics: true });
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = false; });
  if (lying) { model.root.rotation.z = Math.PI / 2; model.root.position.y += LYING_LIFT; }
  step(2);
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = true; });
  return { ctx, model };
}

function grains(model: BuiltModel): PhysicsBody[] {
  return Object.entries(model.bodies).filter(([k]) => k.startsWith("grain-")).map(([, b]) => b);
}

function allFinite(model: BuiltModel): boolean {
  return Object.values(model.bodies).every((b) => {
    const p = b.transformNode.absolutePosition;
    return [p.x, p.y, p.z].every(Number.isFinite);
  });
}

function openGate(model: BuiltModel, spec: Spec, decl: SpecBody): boolean {
  const gate = decl.pour?.gate;
  if (!gate) return true;
  const con = (spec.physics?.constraints ?? []).find((c) => c.type === "hinge" && c.bodyA === decl.id && c.bodyB === gate.body);
  const act = model.actuators?.find((a) => a.id === `servo:${gate.body}.x`);
  if (!con || !Array.isArray(con.limits) || !act) return false;
  act.set(con.limits[1]);
  return true;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath) {
    console.error(`用法: pour_test.ts <model-name> --spec <spec.json> [--out result.json]；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const decls = (spec.physics?.bodies ?? []).filter((b) => b.pour);
  if (!decls.length) {
    console.log(JSON.stringify({ model: name, checks: [], pass: true, note: "spec 無 pour 宣告" }));
    return 0;
  }
  const checks: Check[] = [];
  const push = (id: string, ok: boolean, detail: string): void => { checks.push({ id, ok, detail }); };

  for (const decl of decls) {
    const pour = decl.pour!;
    const emptied = decl.mass - pour.grains * pour.grainMass;
    // (A) 蓋閉側躺不倒
    {
      const { ctx, model } = await spawn(name, true);
      ctx.step(LAND_STEPS + POUR_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      push(`A:${decl.id}:closed`, grains(model).length === 0 && Math.abs(mass - decl.mass) < 1e-5,
        `蓋閉側躺：顆粒 ${grains(model).length}、質量 ${mass}（期望 ${decl.mass}）`);
      ctx.dispose();
    }
    // (B) 蓋開側躺倒空
    {
      const { ctx, model } = await spawn(name, true);
      ctx.step(LAND_STEPS);
      push(`B:${decl.id}:gate`, openGate(model, spec, decl), "gate servo 可命令到上限");
      ctx.step(POUR_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      const gs = grains(model);
      push(`B:${decl.id}:poured`, gs.length === pour.grains && Math.abs(mass - emptied) < 1e-5,
        `顆粒 ${gs.length}（期望 ${pour.grains}）、質量 ${mass}（期望 ${emptied}）`);
      ctx.step(SETTLE_STEPS);
      const maxSpeed = Math.max(0, ...gs.map((g) => g.getLinearVelocity().length()));
      push(`B:${decl.id}:settle`, maxSpeed < SETTLE_SPEED && allFinite(model), `顆粒最大速度 ${maxSpeed.toFixed(4)}，有限 ${allFinite(model)}`);
      ctx.dispose();
    }
    // (C) 直立蓋開不倒；手動冪等；dispose 乾淨
    {
      const { ctx, model } = await spawn(name, false);
      ctx.step(60);
      openGate(model, spec, decl);
      ctx.step(120);
      push(`C:${decl.id}:upright`, grains(model).length === 0, `直立蓋開：顆粒 ${grains(model).length}`);
      const act = model.actuators?.find((a) => a.id === `pour:${decl.id}`);
      if (!act) {
        push(`C:${decl.id}:actuator`, false, "無 pour actuator");
      } else {
        act.set(1); ctx.step(5); act.set(1); ctx.step(5);
        const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
        push(`C:${decl.id}:idempotent`, grains(model).length === pour.grains && Math.abs(mass - emptied) < 1e-5,
          `手動兩次：顆粒 ${grains(model).length}（期望 ${pour.grains}）、質量 ${mass}`);
      }
      model.dispose();
      push(`C:${decl.id}:dispose`, !ctx.scene.meshes.some((m) => m.name.startsWith("grain-")), "dispose 後場景無 grain mesh");
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
