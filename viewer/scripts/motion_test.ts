// 動作時間線 gate（M5）：吊空播放 timeline，證明 servo 實角確實追蹤目標。
import {
  Matrix,
  PhysicsBody,
  PhysicsMotionType,
  Vector3,
} from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { frameStepCounts, validateMotionTimeline } from "../src/motionTimeline";
import { registry } from "../src/registry";
import type { Actuator } from "../src/types";

const SETTLE_STEPS = 120;
const WARMUP_STEPS = 30;
const TRACK_TOL = 0.35;
const MIN_HIT_RATIO = 0.9;

type AxisKey = "x" | "y" | "z";

interface SpecActuation { type: string }
interface SpecConstraint {
  type?: string;
  bodyA: string;
  bodyB: string;
  axis?: number[];
  limits?: number[] | "free";
  angular?: Partial<Record<AxisKey, number[] | "free" | "locked">>;
  actuation?: SpecActuation;
}
interface Spec {
  targetName?: string;
  physics?: { constraints?: SpecConstraint[] };
}
interface TrackResult {
  id: string;
  samples: number;
  withinTolerance: number;
  ratio: number;
  tolerance: number;
  error: { min: number; p50: number; p90: number; max: number };
  pass: boolean;
}

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

function worldRotation(body: PhysicsBody): Matrix {
  body.transformNode.computeWorldMatrix(true);
  return body.transformNode.getWorldMatrix().getRotationMatrix();
}

function relativeRotation(a: PhysicsBody, b: PhysicsBody): Matrix {
  return worldRotation(b).multiply(Matrix.Invert(worldRotation(a)));
}

function measureAngles(a: PhysicsBody, b: PhysicsBody, axis: Vector3, bind: Matrix): Vector3 {
  const frame = jointFrame(axis);
  const delta = Matrix.Invert(bind).multiply(relativeRotation(a, b));
  const inFrame = frame.multiply(delta).multiply(Matrix.Invert(frame));
  return eulerXZY(inFrame);
}

function anchorBodyId(constraints: SpecConstraint[]): string | null {
  const asB = new Set(constraints.map((c) => c.bodyB));
  return constraints.map((c) => c.bodyA).find((id) => !asB.has(id)) ?? null;
}

function percentile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? sorted[0];
}

function finiteBodies(bodies: Record<string, PhysicsBody>): boolean {
  return Object.values(bodies).every((body) => {
    body.transformNode.computeWorldMatrix(true);
    const p = body.transformNode.absolutePosition;
    const q = body.transformNode.absoluteRotationQuaternion;
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite);
  });
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specIdx = argv.indexOf("--spec");
  const timelineIdx = argv.indexOf("--timeline");
  const outIdx = argv.indexOf("--out");
  const specPath = specIdx >= 0 ? argv[specIdx + 1] : null;
  const timelinePath = timelineIdx >= 0 ? argv[timelineIdx + 1] : null;
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry) || !specPath || !timelinePath) {
    console.error("用法: motion_test.ts <model> --spec <spec.json> --timeline <timeline.json> [--out result.json]");
    return 2;
  }

  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const constraints = spec.physics?.constraints ?? [];
  const servoDecls = constraints.filter((c) => c.actuation?.type === "servo");
  const declaredIds = new Set<string>();
  for (const c of servoDecls) {
    if (c.type === "hinge") declaredIds.add(`servo:${c.bodyB}.x`);
    else for (const axis of ["x", "y", "z"] as const) {
      if (c.angular?.[axis] !== undefined && c.angular[axis] !== "locked") {
        declaredIds.add(`servo:${c.bodyB}.${axis}`);
      }
    }
  }

  let timeline;
  try {
    const raw = JSON.parse(readFileSync(timelinePath, "utf8")) as unknown;
    timeline = validateMotionTimeline(raw, name, declaredIds);
  } catch (error) {
    const result = { model: name, tracks: [], pass: false, error: String(error) };
    const json = JSON.stringify(result, null, 2);
    console.log(json);
    if (outPath) writeFileSync(outPath, json);
    return 1;
  }

  const ctx = await createHeadlessScene();
  try {
    const factory = (await registry[name]()).default;
    const model = factory(ctx.scene, { physics: true });
    const actuators = new Map<string, Actuator>(
      (model.actuators ?? []).filter((a) => a.kind === "servo").map((a) => [a.id, a]),
    );
    const missing = Object.keys(timeline.tracks).filter((id) => !actuators.has(id));
    const anchorId = anchorBodyId(constraints);
    const anchor = anchorId ? model.bodies[anchorId] : null;
    if (missing.length || !anchor) {
      const error = missing.length
        ? `factory 缺少 servo actuator: ${missing.join(", ")}`
        : "找不到錨 body（無從吊空）";
      const result = { model: name, tracks: [], pass: false, error };
      const json = JSON.stringify(result, null, 2);
      console.log(json);
      if (outPath) writeFileSync(outPath, json);
      return 1;
    }

    const constraintCount = model.constraints.length;
    let finite = finiteBodies(model.bodies);
    let constraintsStable = model.constraints.length === constraintCount;
    const checkedStep = (): void => {
      ctx.step(1);
      finite &&= finiteBodies(model.bodies);
      constraintsStable &&= model.constraints.length === constraintCount;
    };

    Object.values(model.bodies).forEach((body) => { body.disablePreStep = false; });
    model.root.position.y += 0.3;
    for (let i = 0; i < 2; i++) checkedStep();
    Object.values(model.bodies).forEach((body) => { body.disablePreStep = true; });
    anchor.setMotionType(PhysicsMotionType.STATIC);
    for (let i = 0; i < SETTLE_STEPS; i++) checkedStep();

    const bindings = new Map<string, { a: PhysicsBody; b: PhysicsBody; axis: Vector3; bind: Matrix; key: AxisKey }>();
    for (const c of servoDecls) {
      const a = model.bodies[c.bodyA];
      const b = model.bodies[c.bodyB];
      if (!a || !b || !c.axis) continue;
      const bind = relativeRotation(a, b);
      for (const key of ["x", "y", "z"] as const) {
        const id = `servo:${c.bodyB}.${key}`;
        if (declaredIds.has(id)) bindings.set(id, { a, b, axis: Vector3.FromArray(c.axis), bind, key });
      }
    }

    const errors = new Map(Object.keys(timeline.tracks).map((id) => [id, [] as number[]]));
    let physicsSteps = 0;
    const stepsByFrame = frameStepCounts(timeline.fps, timeline.frames);
    for (let frame = 0; frame < timeline.frames; frame++) {
      for (const [id, track] of Object.entries(timeline.tracks)) actuators.get(id)?.set(track[frame]);
      for (let i = 0; i < stepsByFrame[frame]; i++) {
        checkedStep();
        physicsSteps++;
      }
      if (physicsSteps <= WARMUP_STEPS) continue;
      for (const [id, track] of Object.entries(timeline.tracks)) {
        const binding = bindings.get(id);
        if (!binding) {
          finite = false;
          continue;
        }
        const actual = measureAngles(binding.a, binding.b, binding.axis, binding.bind)[binding.key];
        finite &&= Number.isFinite(actual);
        errors.get(id)?.push(Math.abs(actual - track[frame]));
      }
    }

    const trackResults: TrackResult[] = Object.keys(timeline.tracks).map((id) => {
      const sorted = [...(errors.get(id) ?? [])].sort((a, b) => a - b);
      const withinTolerance = sorted.filter((error) => error <= TRACK_TOL).length;
      const ratio = sorted.length ? withinTolerance / sorted.length : 0;
      return {
        id,
        samples: sorted.length,
        withinTolerance,
        ratio,
        tolerance: TRACK_TOL,
        error: {
          min: sorted[0] ?? 0,
          p50: percentile(sorted, 0.5),
          p90: percentile(sorted, 0.9),
          max: sorted.at(-1) ?? 0,
        },
        pass: sorted.length > 0 && ratio >= MIN_HIT_RATIO,
      };
    });
    const pass = finite && constraintsStable && trackResults.length > 0
      && trackResults.every((track) => track.pass);
    const result = {
      model: name,
      fps: timeline.fps,
      frames: timeline.frames,
      physicsSteps,
      warmupSteps: WARMUP_STEPS,
      finite,
      constraints: { before: constraintCount, after: model.constraints.length, stable: constraintsStable },
      tracks: trackResults,
      pass,
    };
    const json = JSON.stringify(result, null, 2);
    console.log(json);
    if (outPath) writeFileSync(outPath, json);
    return pass ? 0 : 1;
  } finally {
    ctx.dispose();
  }
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error(error);
  process.exit(2);
});
