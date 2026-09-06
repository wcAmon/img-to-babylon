// 傾倒 gate（M11 pour）：spec 有 pour 的 body 必須 (A) 蓋閉、側躺 300 步不倒——顆粒 0、質量不變；
// (B) 蓋開（gate servo 上限）、側躺 → 300 步內顆粒數 = grains、質量 = mass − grains×grainMass，
// 再 300 步顆粒全靜止且全部有限；(C) 直立、蓋開 120 步不倒；手動 pour:<id> set(1) 兩次只倒一輪；
// dispose 後場景無 grain mesh。無 tiltThreshold 的 spec（噴瓶，M12）：A′／B′ 直立、gate 閉／開；C′ 不開 gate、直立 120 步無顆粒。
// 用法: npx tsx scripts/pour_test.ts <model-name> --spec <spec.json> [--out result.json]
import {
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
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

interface SpecPour { source?: "declared" | "collected"; tiltThreshold?: number; grains?: number; grainMass?: number; ratePerSecond: number; gate?: { body: string; minAngle: number } }
interface SpecCollect { interior: { size: number[]; offset: number[] }; maxItemMass: number }
interface SpecBody { id: string; mass: number; pour?: SpecPour; collect?: SpecCollect }
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

function emitted(model: BuiltModel): PhysicsBody[] {
  return Object.entries(model.bodies).filter(([k]) => k.startsWith("clump-")).map(([, b]) => b);
}
const PRE_N = 6, PRE_D = 0.010, PRE_MASS = 0.003;
/** collected 分支：自內腔中心上方 0.2 m 丟 PRE_N 顆球讓接觸收納吃掉（回傳斗內 held 數）。 */
function preload(model: BuiltModel, decl: SpecBody, step: (n: number) => void): number {
  const body = model.bodies[decl.id]; const node = body.transformNode; node.computeWorldMatrix(true);
  const center = Vector3.TransformCoordinates(Vector3.FromArray(decl.collect!.interior.offset), node.getWorldMatrix());
  for (let i = 0; i < PRE_N; i++) {
    const a = (i / PRE_N) * Math.PI * 2;
    const m = MeshBuilder.CreateSphere(`pre-${i}`, { diameter: PRE_D, segments: 6 }, node.getScene());
    m.position = center.add(new Vector3(Math.cos(a) * 0.03, 0.2, Math.sin(a) * 0.03));
    const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, node.getScene());
    const s = new PhysicsShapeSphere(Vector3.Zero(), PRE_D / 2, node.getScene()); s.material = { friction: 0.8, restitution: 0.05 }; b.shape = s;
    b.setMassProperties({ mass: PRE_MASS }); b.setLinearDamping(2.0); b.setAngularDamping(2.0);
  }
  step(200);
  return Object.keys(model.meshes).filter((k) => k.startsWith("held-")).length;
}
/** 懸空鎖姿態：每步速度歸零（重力每步只漂 ½·g·dt²），把 body 以 pitch（繞世界 x）掛在 +y 高度。 */
function hoist(model: BuiltModel, decl: SpecBody, pitch: number, y: number, step: (n: number) => void): () => void {
  const body = model.bodies[decl.id]; const node = body.transformNode;
  node.computeWorldMatrix(true);
  body.disablePreStep = false;
  node.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), pitch).multiply(node.absoluteRotationQuaternion.clone());
  node.position.y += y;
  step(2); body.disablePreStep = true;
  const obs = node.getScene().onBeforePhysicsObservable.add(() => { body.setLinearVelocity(Vector3.Zero()); body.setAngularVelocity(Vector3.Zero()); });
  return () => { node.getScene().onBeforePhysicsObservable.remove(obs); };
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
    if (pour.source === "collected") {
      // M17：倒出收進來的東西。(A) 裝 6 顆直立不倒 (B) 前傾 1.2 rad 倒出 6 顆、質量回基準 (C) 空斗 set(1) 無事、dispose 乾淨
      const base = decl.mass;
      {
        const { ctx, model } = await spawn(name, false);
        ctx.step(LAND_STEPS);
        const heldN = preload(model, decl, ctx.step);
        ctx.step(120);
        const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
        push(`A:${decl.id}:upright-held`, heldN === PRE_N && emitted(model).length === 0 && Math.abs(mass - (base + PRE_N * PRE_MASS)) < 1e-5,
          `held ${heldN}/${PRE_N}、直立 120 步 clump ${emitted(model).length}、質量 ${mass}（期望 ${base + PRE_N * PRE_MASS}）`);
        ctx.dispose();
      }
      {
        const { ctx, model } = await spawn(name, false);
        ctx.step(LAND_STEPS);
        preload(model, decl, ctx.step);
        const release = hoist(model, decl, -1.2, 0.5, ctx.step);
        const node = model.bodies[decl.id].transformNode; node.computeWorldMatrix(true);
        const tilt = Math.acos(Math.max(-1, Math.min(1, node.getDirection(Vector3.Up()).y)));
        ctx.step(POUR_STEPS);
        release();
        const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
        const heldLeft = Object.keys(model.meshes).filter((k) => k.startsWith("held-")).length;
        push(`B:${decl.id}:poured`, emitted(model).length === PRE_N && heldLeft === 0 && Math.abs(mass - base) < 1e-5 && allFinite(model),
          `傾角 ${tilt.toFixed(2)}、clump ${emitted(model).length}（期望 ${PRE_N}）、held 剩 ${heldLeft}、質量 ${mass}（期望 ${base}）、有限 ${allFinite(model)}`);
        ctx.dispose();
      }
      {
        const { ctx, model } = await spawn(name, false);
        ctx.step(60);
        const act = model.actuators?.find((a) => a.id === `pour:${decl.id}`);
        if (!act) push(`C:${decl.id}:actuator`, false, "無 pour actuator");
        else {
          act.set(1); ctx.step(5); act.set(1); ctx.step(5);
          const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
          push(`C:${decl.id}:empty-noop`, emitted(model).length === 0 && Math.abs(mass - base) < 1e-5, `空斗 set(1) 兩次：clump ${emitted(model).length}、質量 ${mass}`);
        }
        model.dispose();
        push(`C:${decl.id}:dispose`, !ctx.scene.meshes.some((m) => m.name.startsWith("clump-") || m.name.startsWith("held-")), "dispose 後場景無 clump／held mesh");
        ctx.dispose();
      }
      continue;
    }
    const emptied = decl.mass - pour.grains! * pour.grainMass!;
    const lying = pour.tiltThreshold !== undefined; // 有傾角條件才側躺；噴瓶直立
    // (A) 蓋閉側躺不倒（無傾角條件：gate 閉直立不倒）
    {
      const { ctx, model } = await spawn(name, lying);
      ctx.step(LAND_STEPS + POUR_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      push(`A:${decl.id}:closed`, grains(model).length === 0 && Math.abs(mass - decl.mass) < 1e-5,
        `${lying ? "蓋閉側躺" : "gate 閉直立"}：顆粒 ${grains(model).length}、質量 ${mass}（期望 ${decl.mass}）`);
      ctx.dispose();
    }
    // (B) 蓋開側躺倒空（無傾角條件：gate 開直立倒空）
    {
      const { ctx, model } = await spawn(name, lying);
      ctx.step(LAND_STEPS);
      push(`B:${decl.id}:gate`, openGate(model, spec, decl), "gate servo 可命令到上限");
      ctx.step(POUR_STEPS);
      const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
      const gs = grains(model);
      push(`B:${decl.id}:poured`, gs.length === pour.grains! && Math.abs(mass - emptied) < 1e-5,
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
      if (lying) openGate(model, spec, decl);
      ctx.step(120);
      push(`C:${decl.id}:upright`, grains(model).length === 0, `${lying ? "直立蓋開" : "直立 gate 閉"}：顆粒 ${grains(model).length}`);
      const act = model.actuators?.find((a) => a.id === `pour:${decl.id}`);
      if (!act) {
        push(`C:${decl.id}:actuator`, false, "無 pour actuator");
      } else {
        act.set(1); ctx.step(5); act.set(1); ctx.step(5);
        const mass = model.bodies[decl.id].getMassProperties().mass ?? NaN;
        push(`C:${decl.id}:idempotent`, grains(model).length === pour.grains! && Math.abs(mass - emptied) < 1e-5,
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
