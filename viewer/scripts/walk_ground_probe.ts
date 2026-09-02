/**
 * 0013 地面走路 spike 量測探針（監工寫，量測協定與指標勿改）。
 * 目的：站穩後不吊空、在地面播 walk timeline，量「走了多遠、幾步倒」。
 * 不是 pass/fail gate——exit 0 印 JSON 數據（協定錯誤才 exit 2），判準寫在任務卡。
 *
 * 協定（鏡射 stand_test：地面材質、癱後恢復、servo 預武裝）：
 *   生成 → step <collapse> 癱 → 預武裝全 servo → StandController.enable() → step 360 站穩
 *   → 依 variant 走 <cycles> 個 timeline 循環（每幀依 frameStepCounts 走固定 60Hz 步）：
 *     hold   ：對照組。維持站立、不餵 timeline，走同樣步數（量純站立的漂移）。
 *     raw    ：純播放。stand.disable() 放掉平衡與姿勢鎖，逐幀 servo.set(track)。
 *     assist ：前饋＋回饋。站立保持啟用，逐幀 stand.setPoseTarget(id, track)——
 *              balance servo 的回饋 u 疊在 timeline 值上，其餘 servo 直接 set。
 *   每個物理步後量頭高/軀幹 up.y/軀幹位置；頭高 < 出廠 60% 視為跌倒並提前結束。
 *
 * 用法：node --import tsx scripts/walk_ground_probe.ts --variant hold|raw|assist
 *         --timeline <timeline.json> [--collapse 200] [--cycles 3] [--out result.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Quaternion, Vector3 } from "@babylonjs/core";
import { createHeadlessScene } from "../src/headless";
import { frameStepCounts, validateMotionTimeline } from "../src/motionTimeline";
import { StandController } from "../src/standController";
import createActionFigureModel from "../models/action-figure/createActionFigureModel";

const STAND_STEPS = 360;
const FALL_RATIO = 0.6;
const VARIANTS = ["hold", "raw", "assist"] as const;
type Variant = (typeof VARIANTS)[number];

const argv = process.argv.slice(2);
const arg = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] ?? null : null;
};
const variant = arg("--variant") as Variant | null;
const timelinePath = arg("--timeline");
const collapseSteps = Number(arg("--collapse") ?? 200);
const cycles = Number(arg("--cycles") ?? 3);
const outPath = arg("--out");
if (!variant || !VARIANTS.includes(variant) || !timelinePath
  || !Number.isInteger(collapseSteps) || collapseSteps < 0 || !Number.isInteger(cycles) || cycles < 1) {
  console.error("用法: walk_ground_probe.ts --variant hold|raw|assist --timeline <json> [--collapse N] [--cycles N] [--out file]");
  process.exit(2);
}

const ctx = await createHeadlessScene();
try {
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, ctx.scene);
  const groundBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, ctx.scene);
  const shape = new PhysicsShapeBox(
    new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), ctx.scene,
  );
  shape.material = { friction: 0.7, restitution: 0.2 };
  groundBody.shape = shape;

  const model = createActionFigureModel(ctx.scene, { physics: true });
  const servos = new Map((model.actuators ?? []).filter((a) => a.kind === "servo").map((a) => [a.id, a]));
  const timeline = validateMotionTimeline(
    JSON.parse(readFileSync(timelinePath, "utf8")) as unknown, "action-figure", new Set(servos.keys()),
  );
  const head = model.bodies.head.transformNode;
  const torso = model.bodies.torso.transformNode;
  const headY = (): number => { head.computeWorldMatrix(true); return head.absolutePosition.y; };
  const torsoUpY = (): number => {
    torso.computeWorldMatrix(true);
    return Vector3.TransformNormal(Vector3.Up(), torso.getWorldMatrix()).normalize().y;
  };
  const torsoPos = (): { x: number; z: number } => {
    torso.computeWorldMatrix(true);
    return { x: torso.absolutePosition.x, z: torso.absolutePosition.z };
  };
  const finiteBodies = (): boolean => Object.values(model.bodies).every((b) => {
    b.transformNode.computeWorldMatrix(true);
    const p = b.transformNode.absolutePosition;
    return Number.isFinite(p.x + p.y + p.z);
  });

  const factoryHeadY = headY();
  const constraintCount = model.constraints.length;
  ctx.step(collapseSteps);
  const collapsedHeadY = headY();
  for (const act of servos.values()) act.set(0);
  const stand = new StandController(model);
  stand.enable();
  ctx.step(STAND_STEPS);
  const standingHeadY = headY();
  const standing = standingHeadY >= factoryHeadY * 0.8 && torsoUpY() > 0.9;

  const start = torsoPos();
  const stepsByFrame = frameStepCounts(timeline.fps, timeline.frames);
  const fallY = factoryHeadY * FALL_RATIO;
  const applyFrame = (frame: number): void => {
    if (variant === "hold") return;
    for (const [id, track] of Object.entries(timeline.tracks)) {
      if (variant === "assist") stand.setPoseTarget(id, track[frame]);
      else servos.get(id)?.set(track[frame]);
    }
  };
  if (variant === "raw") stand.disable();

  let stepsWalked = 0;
  let minHeadY = standingHeadY;
  let minUpY = torsoUpY();
  let fall: { step: number; cycle: number; frame: number } | null = null;
  const perCycle: Array<{ cycle: number; dx: number; dz: number; minHeadY: number; minUpY: number }> = [];
  outer: for (let cycle = 1; cycle <= cycles; cycle++) {
    const cycleStart = torsoPos();
    let cycleMinHeadY = Infinity;
    let cycleMinUpY = Infinity;
    for (let frame = 0; frame < timeline.frames; frame++) {
      applyFrame(frame);
      for (let i = 0; i < stepsByFrame[frame]; i++) {
        ctx.step(1);
        stepsWalked++;
        const hy = headY();
        const uy = torsoUpY();
        minHeadY = Math.min(minHeadY, hy);
        minUpY = Math.min(minUpY, uy);
        cycleMinHeadY = Math.min(cycleMinHeadY, hy);
        cycleMinUpY = Math.min(cycleMinUpY, uy);
        if (hy < fallY) {
          fall = { step: stepsWalked, cycle, frame };
          const p = torsoPos();
          perCycle.push({ cycle, dx: p.x - cycleStart.x, dz: p.z - cycleStart.z, minHeadY: cycleMinHeadY, minUpY: cycleMinUpY });
          break outer;
        }
      }
    }
    const p = torsoPos();
    perCycle.push({ cycle, dx: p.x - cycleStart.x, dz: p.z - cycleStart.z, minHeadY: cycleMinHeadY, minUpY: cycleMinUpY });
  }
  const end = torsoPos();
  const result = {
    variant,
    timeline: { path: timelinePath, fps: timeline.fps, frames: timeline.frames },
    collapseSteps,
    cyclesRequested: cycles,
    cyclesCompleted: fall ? fall.cycle - 1 : cycles,
    factoryHeadY,
    collapsedHeadY,
    standingHeadY,
    standing,
    stepsWalked,
    fell: fall !== null,
    fall,
    displacement: { dx: end.x - start.x, dz: end.z - start.z, dist: Math.hypot(end.x - start.x, end.z - start.z) },
    minHeadY,
    minUpY,
    perCycle,
    finite: finiteBodies(),
    constraintsStable: model.constraints.length === constraintCount,
  };
  const json = JSON.stringify(result, null, 2);
  console.log(json);
  if (outPath) writeFileSync(outPath, json);
} finally {
  ctx.dispose();
}
