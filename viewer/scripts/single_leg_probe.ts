/**
 * 0016 單腳站 spike 量測探針（監工寫，協定與指標勿改）。M8 生死關。
 * 目的：站穩 → 質心壓到左靴上方 → 支撐面切成左靴 → 抬右腿 → 撐住。
 * 不是 pass/fail gate——exit 0 印 JSON（協定錯誤才 exit 2），判準寫在任務卡。
 *
 * 協定（所有步數 ×√S，長度以 base·S）：
 *   生成 → step <collapse> 癱 → 預武裝 → StandController.enable() → 360 步站穩
 *   → 階段 shift：setBalanceTarget({x: <shift>·S, z: 0}) ramp 300 步 + hold 150 步
 *     （<shift> 預設 0.009＝左靴中心 LEG_X；左靴半寬 0.008S）
 *   → 階段 switch：setSupportBodies(["boot-l"])（支撐面參考改為左靴；質心目標歸零＝左靴正上方）
 *     + hold 150 步
 *   → 階段 lift：setPoseTarget(thigh-r.x → <lift-hip>、calf-r.x → <lift-knee>) ramp 300 步
 *   → 階段 hold：300 步
 *   每個物理步量頭高（< 出廠 60% 視為跌倒並記錄階段）、軀幹 up.y、質心相對左靴偏移、
 *   右靴離地高度（boot-r.y − 出廠 boot y）。
 *
 * 用法：node --import tsx scripts/single_leg_probe.ts [--collapse 300] [--shift 0.009]
 *         [--lift-hip -0.6] [--lift-knee 0.8] [--out file]
 */
import { writeFileSync } from "node:fs";
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Quaternion, Vector3 } from "@babylonjs/core";
import { createHeadlessScene } from "../src/headless";
import { StandController } from "../src/standController";
import createActionFigureModel from "../models/action-figure/createActionFigureModel";

const argv = process.argv.slice(2);
const arg = (flag: string, dflt: string): string => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] ?? dflt : dflt; };
const collapse = Number(arg("--collapse", "300"));
const shiftBase = Number(arg("--shift", "0.009"));
const liftHip = Number(arg("--lift-hip", "-0.6"));
const liftKnee = Number(arg("--lift-knee", "0.8"));
const outPath = argv.includes("--out") ? arg("--out", "") : null;
if (![collapse, shiftBase, liftHip, liftKnee].every(Number.isFinite)) {
  console.error("用法: single_leg_probe.ts [--collapse N] [--shift base] [--lift-hip rad] [--lift-knee rad] [--out file]");
  process.exit(2);
}

const ctx = await createHeadlessScene();
try {
  const model = createActionFigureModel(ctx.scene, { physics: true });
  const S = model.physicsScale;
  const T = (n: number): number => Math.round(n * Math.sqrt(S));
  const size = 10 * S;
  const ground = MeshBuilder.CreateGround("ground", { width: size, height: size }, ctx.scene);
  const gb = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, ctx.scene);
  const gs = new PhysicsShapeBox(new Vector3(0, -0.05 * S, 0), Quaternion.Identity(), new Vector3(size, 0.1 * S, size), ctx.scene);
  gs.material = { friction: 0.7, restitution: 0.2 };
  gb.shape = gs;

  const head = model.bodies.head.transformNode;
  const torso = model.bodies.torso.transformNode;
  const bootL = model.bodies["boot-l"].transformNode;
  const bootR = model.bodies["boot-r"].transformNode;
  const headY = (): number => { head.computeWorldMatrix(true); return head.absolutePosition.y; };
  const upY = (): number => { torso.computeWorldMatrix(true); return Vector3.TransformNormal(Vector3.Up(), torso.getWorldMatrix()).normalize().y; };
  const comRelL = (): { dx: number; dz: number } => {
    const c = Vector3.Zero(); let mm = 0;
    for (const b of Object.values(model.bodies)) { const m = b.getMassProperties().mass ?? 0; b.transformNode.computeWorldMatrix(true); c.addInPlace(b.transformNode.absolutePosition.scale(m)); mm += m; }
    c.scaleInPlace(1 / mm);
    bootL.computeWorldMatrix(true);
    return { dx: c.x - bootL.absolutePosition.x, dz: c.z - bootL.absolutePosition.z };
  };
  bootR.computeWorldMatrix(true);
  const factoryBootRY = bootR.absolutePosition.y;
  const bootRLift = (): number => { bootR.computeWorldMatrix(true); return bootR.absolutePosition.y - factoryBootRY; };
  const factoryHeadY = headY();
  const fallY = factoryHeadY * 0.6;

  ctx.step(T(collapse));
  for (const a of model.actuators ?? []) if (a.kind === "servo") a.set(0);
  const stand = new StandController(model);
  stand.enable();
  ctx.step(T(360));
  const standingHeadY = headY();

  type Phase = { name: string; steps: number; headYEnd: number; minHeadY: number; upYEnd: number; comRelL: { dx: number; dz: number }; bootRLift: number; fell: boolean };
  const phases: Phase[] = [];
  let fellAt: { phase: string; step: number } | null = null;
  const run = (name: string, steps: number, each?: (f: number) => void): void => {
    let minY = Infinity;
    for (let s = 1; s <= steps; s++) {
      each?.(Math.min(1, s / steps));
      ctx.step(1);
      const y = headY();
      minY = Math.min(minY, y);
      if (!fellAt && y < fallY) fellAt = { phase: name, step: s };
    }
    phases.push({ name, steps, headYEnd: headY(), minHeadY: minY, upYEnd: upY(), comRelL: comRelL(), bootRLift: bootRLift(), fell: fellAt?.phase === name });
  };
  const shift = shiftBase * S;
  run("shift-ramp", T(300), (f) => stand.setBalanceTarget({ x: shift * f, z: 0 }));
  run("shift-hold", T(150));
  stand.setSupportBodies(["boot-l"]);
  stand.setBalanceTarget({ x: 0, z: 0 });
  run("switch-hold", T(150));
  run("lift-ramp", T(300), (f) => { stand.setPoseTarget("servo:thigh-r.x", liftHip * f); stand.setPoseTarget("servo:calf-r.x", liftKnee * f); });
  run("hold", T(300));

  const last = phases[phases.length - 1];
  const result = {
    physicsScale: S,
    collapse, shiftBase, liftHip, liftKnee,
    factoryHeadY, standingHeadY,
    standingBeforeShift: standingHeadY >= factoryHeadY * 0.8,
    phases,
    fell: fellAt !== null,
    fellAt,
    final: {
      headY: last.headYEnd, upY: last.upYEnd, comRelL: last.comRelL, bootRLift: last.bootRLift,
      standing: last.headYEnd >= factoryHeadY * 0.8 && last.upYEnd > 0.9,
      comInsideLeftBoot: Math.abs(last.comRelL.dx) <= 0.008 * S && Math.abs(last.comRelL.dz) <= 0.014 * S,
      rightBootClear: last.bootRLift >= 0.002 * S,
    },
    finite: Object.values(model.bodies).every((b) => { const p = b.transformNode.absolutePosition; return Number.isFinite(p.x + p.y + p.z); }),
  };
  const json = JSON.stringify(result, null, 2);
  console.log(json);
  if (outPath) writeFileSync(outPath, json);
} finally {
  ctx.dispose();
}
