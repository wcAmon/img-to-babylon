// 可動物件審查 gate（M4）：spec 宣告的每個 actuation 都必須 (a) 有對應 actuator、
// (b) 驅動後有可量測回應——drive 令車前進 ≥ 0.15m、steer 令轉向角到目標 ±0.15、
// servo 令關節角到目標 ±0.35（重力垂墜與 solver 柔性餘裕）、light 令 emissive 切換。
// 宣告了但動不了 = FAIL。關節角量測沿用 physics_test 的 XZY 分解（grimoire/physics.md）。
// 用法: npx tsx scripts/actuation_test.ts <model-name> --spec <spec.json> [--out result.json]
import {
  Color3,
  Matrix,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";
import type { Actuator } from "../src/types";

const SETTLE_STEPS = 120;
const DRIVE_STEPS = 240; // 4 秒滿油門
const DRIVE_MIN_DIST = 0.15; // m
const STATIC_STEER_STEPS = 60; // 靜態轉向觀察窗（1 秒）
const STATIC_STEER_RATIO = 0.5; // 靜止時實測轉向角至少要到目標的這個比例（task 0001）
const STEER_STEPS = 150; // 行進中轉向觀察窗（2.5 秒）
const STEER_MIN_RATIO = 0.25; // 行進中實測轉向角至少要到目標的這個比例
const STEER_MIN_YAW = 0.03; // rad：觀察窗內車身 yaw 至少要偏這麼多（真的在畫弧）
const SERVO_STEPS = 90;
const SERVO_TOL = 0.35; // rad：重力垂墜 + solver 柔性
const LIGHT_COLOR_TOL = 0.02;
// 靜止時輪胎接地是硬黏著（Havok 靜摩擦=硬約束，馬達=軟彈簧，力再大推不動；
// 見 grimoire/physics.md 陷阱），所以 steer 必須行進中測、servo 必須吊空測。

type AxisKey = "x" | "y" | "z";

interface SpecActuation {
  type: string;
  targetSpeed?: number;
  maxForce?: number;
  range?: [number, number];
  emissive?: { on: string; off: string };
}
interface SpecConstraint {
  type?: string;
  bodyA: string;
  bodyB: string;
  axis?: number[];
  limits?: number[] | "free";
  angular?: Partial<Record<AxisKey, number[] | "free" | "locked">>;
  actuation?: SpecActuation;
}
interface SpecComponent { id: string; actuation?: SpecActuation }
interface SpecRupture { impulseThreshold: number; emptiedMass: number; puddleRadius: number; droplets: number }
interface SpecPour { source?: "declared" | "collected"; tiltThreshold?: number; grains?: number; grainMass?: number; ratePerSecond: number; direction?: number[]; exitSpeed?: number; gate?: { body: string; minAngle: number } }
interface SpecCollect { interior: { size: number[]; offset: number[] }; maxItemMass: number }
interface SpecBody { id: string; mass: number; rupture?: SpecRupture; pour?: SpecPour; collect?: SpecCollect }
interface Spec {
  componentTree?: SpecComponent[];
  physics?: { bodies?: SpecBody[]; constraints?: SpecConstraint[] };
}

interface CheckResult { id: string; ok: boolean; detail: string }

// ---- 關節角量測（與 physics_test.ts 同一套，見 grimoire/physics.md 陷阱）----
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
  return m;
}

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

function relativeRotation(a: PhysicsBody, b: PhysicsBody): Matrix {
  return worldRotation(b).multiply(Matrix.Invert(worldRotation(a)));
}

function measureAngles(
  a: PhysicsBody, b: PhysicsBody, axis: Vector3, bind: Matrix,
): Vector3 {
  const frame = jointFrame(axis);
  const delta = Matrix.Invert(bind).multiply(relativeRotation(a, b));
  const inFrame = frame.multiply(delta).multiply(Matrix.Invert(frame));
  return eulerXZY(inFrame);
}

function horizontal(p: Vector3): Vector3 {
  return new Vector3(p.x, 0, p.z);
}

/** 世界前向量在水平面的方位角。 */
function worldYaw(b: PhysicsBody): number {
  const m = worldRotation(b).m;
  return Math.atan2(m[2], m[0]);
}

/** 錨 body：spec constraints 裡從未當過 bodyB 的 body（torso / chassis）。 */
function anchorBodyId(cons: SpecConstraint[]): string | null {
  const asB = new Set(cons.map((c) => c.bodyB));
  const asA = cons.map((c) => c.bodyA).filter((a) => !asB.has(a));
  return asA[0] ?? null;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath) {
    console.error(`用法: actuation_test.ts <model-name> --spec <spec.json> [--out result.json]；`
      + `已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const cons = spec.physics?.constraints ?? [];
  const driveDecls = cons.filter((c) => c.actuation?.type === "drive");
  const steerDecls = cons.filter((c) => c.actuation?.type === "steer");
  const servoDecls = cons.filter((c) => c.actuation?.type === "servo");
  const lightDecls = (spec.componentTree ?? []).filter((c) => c.actuation?.type === "light");
  const ruptureDecls = (spec.physics?.bodies ?? []).filter((b) => b.rupture);
  const pourDecls = (spec.physics?.bodies ?? []).filter((b) => b.pour);
  const collectDecls = (spec.physics?.bodies ?? []).filter((b) => b.collect);
  if (!driveDecls.length && !steerDecls.length && !servoDecls.length && !lightDecls.length
      && !ruptureDecls.length && !pourDecls.length && !collectDecls.length) {
    console.log(JSON.stringify({ model: name, checks: [], pass: true,
      note: "spec 無 actuation 宣告" }));
    return 0;
  }

  const ctx = await createHeadlessScene();
  const { scene, step } = ctx;
  const factory = (await registry[name]()).default;
  const model = factory(scene, { physics: true });
  const scale = model.physicsScale;
  const T = (steps: number): number => Math.round(steps * Math.sqrt(scale));
  const ground = MeshBuilder.CreateGround("ground", { width: 10 * scale, height: 10 * scale }, scene);
  const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const gShape = new PhysicsShapeBox(
    new Vector3(0, -0.05 * scale, 0), Quaternion.Identity(), new Vector3(10 * scale, 0.1 * scale, 10 * scale), scene,
  );
  gShape.material = { friction: 0.7, restitution: 0.2 };
  gBody.shape = gShape;

  const acts: Actuator[] = model.actuators ?? [];
  const byId = new Map(acts.map((a) => [a.id, a]));
  const checks: CheckResult[] = [];
  const push = (id: string, ok: boolean, detail: string): void => {
    checks.push({ id, ok, detail });
  };

  // ---- 覆蓋：每個宣告都要有 actuator ----
  const drive = acts.find((a) => a.kind === "drive") ?? null;
  const steer = acts.find((a) => a.kind === "steer") ?? null;
  if (driveDecls.length) push("coverage:drive", !!drive, drive ? "有 drive actuator" : "spec 宣告 drive 但無 actuator");
  if (steerDecls.length) push("coverage:steer", !!steer, steer ? "有 steer actuator" : "spec 宣告 steer 但無 actuator");
  for (const d of servoDecls) {
    const mine = acts.filter((a) => a.id.startsWith(`servo:${d.bodyB}.`));
    push(`coverage:servo:${d.bodyB}`, mine.length > 0,
      mine.length ? `${mine.length} 軸` : "spec 宣告 servo 但無對應 actuator");
  }
  for (const c of lightDecls) {
    push(`coverage:light:${c.id}`, byId.has(`light:${c.id}`),
      byId.has(`light:${c.id}`) ? "有 light actuator" : "spec 宣告 light 但無 actuator");
  }

  for (const b of ruptureDecls) {
    push(`coverage:rupture:${b.id}`, byId.has(`rupture:${b.id}`),
      byId.has(`rupture:${b.id}`) ? "有 rupture actuator" : "spec 宣告 rupture 但無 actuator");
  }
  for (const b of pourDecls) {
    push(`coverage:pour:${b.id}`, byId.has(`pour:${b.id}`),
      byId.has(`pour:${b.id}`) ? "有 pour actuator" : "spec 宣告 pour 但無 actuator");
  }
  for (const b of collectDecls) {
    push(`coverage:collect:${b.id}`, byId.has(`collect:${b.id}`),
      byId.has(`collect:${b.id}`) ? "有 collect actuator" : "spec 宣告 collect 但無 actuator");
  }
  // ---- collect（M12）：無物時觸發不改質量、冪等（有物收納由 collect_test 驗）----
  const runCollect = (): void => {
    for (const b of collectDecls) {
      const act = byId.get(`collect:${b.id}`);
      const body = model.bodies[b.id];
      if (!act || !body) continue;
      act.set(1); step(2);
      const m1 = body.getMassProperties().mass ?? NaN;
      act.set(1); step(2);
      const m2 = body.getMassProperties().mass ?? NaN;
      push(`collect:${b.id}`, Math.abs(m1 - b.mass) < 1e-5 && Math.abs(m2 - b.mass) < 1e-5,
        `無物觸發兩次質量 ${m1}/${m2}（期望 ${b.mass}）`);
    }
  };
  // ---- pour（M11）：手動全倒——會改質量、生顆粒，排在所有其他檢查之後 ----
  const grainCount = (): number => Object.keys(model.bodies).filter((k) => k.startsWith("grain-")).length;
  const runPour = (): void => {
    for (const b of pourDecls) {
      const act = byId.get(`pour:${b.id}`);
      const body = model.bodies[b.id];
      const pour = b.pour!;
      if (!act || !body) continue;
      act.set(1);
      step(5);
      const mass = body.getMassProperties().mass ?? NaN;
      const grainsA = grainCount();
      act.set(1);
      step(5);
      const grainsB = grainCount();
      if (pour.source === "collected") {
        // M17：倒的是收進來的東西——空斗 set(1) 無事（有物倒出由 pour_test collected 分支驗）
        const clumps = Object.keys(model.bodies).filter((k) => k.startsWith("clump-")).length;
        push(`pour:${b.id}`, Math.abs(mass - b.mass) < 1e-5 && clumps === 0,
          `source collected 空斗：質量 ${mass} vs ${b.mass}；clump ${clumps}（期望 0）`);
        continue;
      }
      const expected = b.mass - pour.grains! * pour.grainMass!;
      push(`pour:${b.id}`,
        Math.abs(mass - expected) < 1e-5 && grainsA === pour.grains && grainsB === pour.grains,
        `質量 ${mass} vs ${expected}；顆粒 ${grainsA}/${grainsB}（期望 ${pour.grains}，冪等）`);
    }
  };
  // ---- rupture（M10）：就地觸發——會改質量、生液滴，所以排在所有其他檢查之後 ----
  const runRupture = (): void => {
    for (const b of ruptureDecls) {
      const act = byId.get(`rupture:${b.id}`);
      const body = model.bodies[b.id];
      const rup = b.rupture!;
      if (!act || !body) continue;
      act.set(1);
      step(5);
      const mass = body.getMassProperties().mass ?? NaN;
      const dropletsA = Object.keys(model.bodies).filter((k) => k.startsWith("droplet-")).length;
      act.set(1);
      step(5);
      const dropletsB = Object.keys(model.bodies).filter((k) => k.startsWith("droplet-")).length;
      push(`rupture:${b.id}`,
        Math.abs(mass - rup.emptiedMass) < 1e-5 && dropletsA === rup.droplets && dropletsB === rup.droplets,
        `質量 ${mass} vs ${rup.emptiedMass}；液滴 ${dropletsA}/${dropletsB}（期望 ${rup.droplets}，冪等）`);
    }
  };

  // ---- light：headless 直接驗 emissive ----
  for (const c of lightDecls) {
    const act = byId.get(`light:${c.id}`);
    const mesh = model.meshes[c.id];
    const em = c.actuation?.emissive;
    if (!act || !mesh || !em) continue;
    const readEm = (): Color3 => (mesh.material as StandardMaterial).emissiveColor;
    act.set(1);
    const onOk = Color3.FromHexString(em.on).subtract(readEm()).asArray()
      .every((v) => Math.abs(v) < LIGHT_COLOR_TOL);
    act.set(0);
    const offOk = Color3.FromHexString(em.off).subtract(readEm()).asArray()
      .every((v) => Math.abs(v) < LIGHT_COLOR_TOL);
    push(`light:${c.id}`, onOk && offOk,
      `on=${onOk} off=${offOk}`);
  }

  // ---- servo：吊空測（錨 body 定住、四肢自由——M5 動作燒錄的使用姿態）----
  if (servoDecls.length) {
    const anchorId = anchorBodyId(cons);
    const anchor = anchorId ? model.bodies[anchorId] : null;
    if (!anchor) {
      push("servo:anchor", false, "找不到錨 body（無從吊空）");
    } else {
      Object.values(model.bodies).forEach((b) => { b.disablePreStep = false; });
      model.root.position.y += 0.3 * scale;
      step(2);
      Object.values(model.bodies).forEach((b) => { b.disablePreStep = true; });
      anchor.setMotionType(PhysicsMotionType.STATIC);
      step(T(60));
      const binds = new Map<SpecConstraint, Matrix>();
      for (const c of servoDecls) {
        const a = model.bodies[c.bodyA];
        const b = model.bodies[c.bodyB];
        if (a && b && c.axis) binds.set(c, relativeRotation(a, b));
      }
      for (const d of servoDecls) {
        const a = model.bodies[d.bodyA];
        const b = model.bodies[d.bodyB];
        const bind = binds.get(d);
        if (!a || !b || !bind || !d.axis) continue;
        const mine = acts.filter((x) => x.id.startsWith(`servo:${d.bodyB}.`));
        for (const act of mine) {
          const axisKey = act.id.slice(-1) as AxisKey;
          const target = 0.6 * (Math.abs(act.min) > Math.abs(act.max) ? act.min : act.max);
          act.set(target);
          step(T(SERVO_STEPS));
          const angle = measureAngles(a, b, Vector3.FromArray(d.axis), bind)[axisKey];
          push(`servo:${d.bodyB}.${axisKey}`, Math.abs(angle - target) <= SERVO_TOL,
            `量測 ${angle.toFixed(3)} vs 目標 ${target.toFixed(3)}`);
          act.set(0);
          step(T(30));
        }
      }
      anchor.setMotionType(PhysicsMotionType.DYNAMIC);
    }
  }

  if (driveDecls.length || steerDecls.length) step(T(SETTLE_STEPS)); // 就地落定

  // ---- steer：行進中測（靜止輪胎硬黏著轉不動）——斷言轉向角展開且車身真的畫弧 ----
  if (steer && steerDecls.length && drive) {
    const chassis = model.bodies[steerDecls[0].bodyA];
    const binds = new Map<SpecConstraint, Matrix>();
    for (const c of steerDecls) {
      const a = model.bodies[c.bodyA];
      const b = model.bodies[c.bodyB];
      if (a && b && c.axis) binds.set(c, relativeRotation(a, b));
    }
    // 靜態轉向（task 0001）：玩家靜止時拉滿方向，前輪必須看得見地轉
    steer.set(steer.max);
    step(T(STATIC_STEER_STEPS));
    for (const d of steerDecls) {
      const a = model.bodies[d.bodyA];
      const b = model.bodies[d.bodyB];
      const bind = binds.get(d);
      if (!a || !b || !bind || !d.axis) continue;
      const angle = measureAngles(a, b, Vector3.FromArray(d.axis), bind).x;
      push(`steer-static:${d.bodyB}`,
        angle * steer.max > 0 && Math.abs(angle) >= STATIC_STEER_RATIO * Math.abs(steer.max),
        `量測 ${angle.toFixed(3)} vs 目標 ${steer.max.toFixed(3)}（門檻 ${STATIC_STEER_RATIO}×）`);
    }
    steer.set(0);
    step(T(30));
    drive.set(0.5);
    step(T(30));
    for (const target of [steer.max, steer.min]) {
      steer.set(target);
      const yaw0 = worldYaw(chassis);
      step(T(STEER_STEPS));
      const yawDelta = worldYaw(chassis) - yaw0;
      for (const d of steerDecls) {
        const a = model.bodies[d.bodyA];
        const b = model.bodies[d.bodyB];
        const bind = binds.get(d);
        if (!a || !b || !bind || !d.axis) continue;
        const angle = measureAngles(a, b, Vector3.FromArray(d.axis), bind).x;
        const angleOk = angle * target > 0 && Math.abs(angle) >= STEER_MIN_RATIO * Math.abs(target);
        push(`steer:${d.bodyB}@${target.toFixed(2)}`, angleOk,
          `量測 ${angle.toFixed(3)} vs 目標 ${target.toFixed(3)}（門檻 ${STEER_MIN_RATIO}×）`);
      }
      const yawOk = yawDelta * target > 0 && Math.abs(yawDelta) >= STEER_MIN_YAW;
      push(`steer:yaw@${target.toFixed(2)}`, yawOk,
        `車身 yaw 偏 ${yawDelta.toFixed(3)}（需同號且 ≥ ${STEER_MIN_YAW}）`);
    }
    steer.set(0);
    drive.set(0);
    step(T(30));
  }

  // ---- drive：滿油門 4 秒，量水平位移（放最後——車會開走）----
  if (drive && driveDecls.length) {
    const chassis = model.bodies[driveDecls[0].bodyA];
    const start = horizontal(chassis.transformNode.absolutePosition.clone());
    drive.set(1);
    step(T(DRIVE_STEPS));
    drive.set(0);
    const dist = Vector3.Distance(
      start, horizontal(chassis.transformNode.absolutePosition),
    );
    push("drive", dist >= DRIVE_MIN_DIST * scale, `位移 ${dist.toFixed(3)}m（門檻 ${DRIVE_MIN_DIST * scale}）`);
  }

  if (ruptureDecls.length || pourDecls.length || collectDecls.length) { step(T(SETTLE_STEPS)); runRupture(); runPour(); runCollect(); }

  const pass = checks.length > 0 && checks.every((c) => c.ok);
  const result = { model: name, checks, pass };
  const json = JSON.stringify(result, null, 2);
  console.log(json);
  if (outPath) writeFileSync(outPath, json);
  ctx.dispose();
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(2);
});
