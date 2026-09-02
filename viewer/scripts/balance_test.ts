/**
 * balance gate（M8 task 0015）：質心-支撐面平衡——站穩後被推，要能站回來。
 * 斷言（監工定，勿改）：
 *   場景矩陣：推力方向 {+z 前, -z 後, +x 左, -x 右} × 衝量 {0.002, 0.004} N·s
 *   × 癱等待家族 {150, 300, 450} 步 = 24 個獨立新場景。每景：
 *     生成 → step 癱 → 預武裝 servo（鏡射按鈕）→ StandController.enable() → step 360
 *     → 前置：頭高 ≥ 出廠 80%（站穩才推）
 *     → 對 torso 質心施衝量 → step 300 →
 *     A. 頭高 ≥ 出廠 80%、軀幹 up·Y > 0.9（站回來）
 *     B. 質心投影落在支撐面內：相對兩靴中心 |dx| ≤ 0.017、|dz| ≤ 0.014
 *        （靴 16×28mm、腳距 18mm → 雙腳支撐面 ±17mm × ±14mm）
 *     C. 全 body 座標有限、constraint 數量不變
 *   doctrine：最後一景 disable() 後 300 步頭高 < 出廠 60%（放掉再癱）。
 * 校準依據（監工探針 2026-09-03）：0012 v1 平衡四方向撐 0.001 N·s，0.002 在 ±z/-x
 * 倒；剛體翻倒門檻約 0.2 m/s，0.004 N·s 僅給 85g 人偶 0.047 m/s——物理上可回復，
 * 倒的是控制器。兩級力道都在可回復範圍內，gate 紅是誠實紅。
 */
import assert from "node:assert/strict";
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Quaternion, Vector3 } from "@babylonjs/core";
import { createHeadlessScene } from "../src/headless";
import { StandController } from "../src/standController";
import createActionFigureModel from "../models/action-figure/createActionFigureModel";

type Ctx = Awaited<ReturnType<typeof createHeadlessScene>>;
type Model = ReturnType<typeof createActionFigureModel>;

const DIRS: Array<[string, Vector3]> = [
  ["+z", new Vector3(0, 0, 1)], ["-z", new Vector3(0, 0, -1)],
  ["+x", new Vector3(1, 0, 0)], ["-x", new Vector3(-1, 0, 0)],
];
const IMPULSES = [0.002, 0.004];
const COLLAPSE_FAMILIES = [150, 300, 450];
const SUPPORT_HALF_X = 0.017;
const SUPPORT_HALF_Z = 0.014;

const addGround = (ctx: Ctx, scale: number): void => {
  const ground = MeshBuilder.CreateGround("ground", { width: 10 * scale, height: 10 * scale }, ctx.scene);
  const groundBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, ctx.scene);
  const shape = new PhysicsShapeBox(
    new Vector3(0, -0.05 * scale, 0), Quaternion.Identity(), new Vector3(10 * scale, 0.1 * scale, 10 * scale), ctx.scene,
  );
  shape.material = { friction: 0.7, restitution: 0.2 }; // 鏡射 harness 地面
  groundBody.shape = shape;
};
const headY = (m: Model): number => {
  m.bodies.head.transformNode.computeWorldMatrix(true);
  return m.bodies.head.transformNode.absolutePosition.y;
};
const torsoUpY = (m: Model): number => {
  const n = m.bodies.torso.transformNode;
  n.computeWorldMatrix(true);
  return Vector3.TransformNormal(Vector3.Up(), n.getWorldMatrix()).normalize().y;
};
const comOffset = (m: Model): { dx: number; dz: number } => {
  const com = Vector3.Zero();
  let mass = 0;
  for (const b of Object.values(m.bodies)) {
    const mb = b.getMassProperties().mass ?? 0;
    b.transformNode.computeWorldMatrix(true);
    com.addInPlace(b.transformNode.absolutePosition.scale(mb));
    mass += mb;
  }
  com.scaleInPlace(1 / mass);
  const l = m.bodies["boot-l"].transformNode.absolutePosition;
  const r = m.bodies["boot-r"].transformNode.absolutePosition;
  return { dx: com.x - (l.x + r.x) / 2, dz: com.z - (l.z + r.z) / 2 };
};

for (const collapse of COLLAPSE_FAMILIES) {
  for (const [dirName, dir] of DIRS) {
    for (const impulse of IMPULSES) {
      const tag = `[collapse ${collapse} / push ${dirName} ${impulse} N·s]`;
      const ctx = await createHeadlessScene();
      try {
        const model = createActionFigureModel(ctx.scene, { physics: true });
        const scale = model.physicsScale;
        const T = (steps: number): number => Math.round(steps * Math.sqrt(scale));
        addGround(ctx, scale);
        const factoryHeadY = headY(model);
        const constraintCount = model.constraints.length;
        ctx.step(T(collapse));
        assert.ok(headY(model) < factoryHeadY * 0.5, `${tag} 前置：站立前必須已癱`);
        for (const act of model.actuators ?? []) if (act.kind === "servo") act.set(0);
        const stand = new StandController(model);
        stand.enable();
        ctx.step(T(360));
        assert.ok(headY(model) >= factoryHeadY * 0.8, `${tag} 前置：推之前必須站穩（${headY(model).toFixed(4)}）`);

        const torso = model.bodies.torso;
        torso.transformNode.computeWorldMatrix(true);
        torso.applyImpulse(dir.scale(impulse * scale ** 3.5), torso.transformNode.absolutePosition);
        ctx.step(T(300));

        const y = headY(model);
        assert.ok(
          y >= factoryHeadY * 0.8,
          `${tag} 被推後 5 秒必須站回來：頭高 ${y.toFixed(4)} < ${(factoryHeadY * 0.8).toFixed(4)}`,
        );
        const up = torsoUpY(model);
        assert.ok(up > 0.9, `${tag} 軀幹必須朝上（up·Y ${up.toFixed(3)} <= 0.9）`);
        const { dx, dz } = comOffset(model);
        assert.ok(
          Math.abs(dx) <= SUPPORT_HALF_X * scale && Math.abs(dz) <= SUPPORT_HALF_Z * scale,
          `${tag} 質心投影必須回到支撐面內：dx ${dx.toFixed(4)} / dz ${dz.toFixed(4)}`,
        );
        for (const [id, body] of Object.entries(model.bodies)) {
          const p = body.transformNode.absolutePosition;
          assert.ok(Number.isFinite(p.x + p.y + p.z), `${tag} ${id} 座標必須有限`);
        }
        assert.equal(model.constraints.length, constraintCount, `${tag} constraint 數量不得改變`);
      } finally {
        ctx.dispose();
      }
    }
  }
}

// ---- doctrine（獨立新場景）：被推站回來後 disable() 要再癱 ----
{
  const ctx = await createHeadlessScene();
  try {
    const model = createActionFigureModel(ctx.scene, { physics: true });
    const scale = model.physicsScale;
    const T = (steps: number): number => Math.round(steps * Math.sqrt(scale));
    addGround(ctx, scale);
    const factoryHeadY = headY(model);
    ctx.step(T(300));
    for (const act of model.actuators ?? []) if (act.kind === "servo") act.set(0);
    const stand = new StandController(model);
    stand.enable();
    ctx.step(T(360));
    const torso = model.bodies.torso;
    torso.transformNode.computeWorldMatrix(true);
    torso.applyImpulse(new Vector3(0, 0, 0.002 * scale ** 3.5), torso.transformNode.absolutePosition);
    ctx.step(T(300));
    stand.disable();
    ctx.step(T(300));
    const y = headY(model);
    assert.ok(y < factoryHeadY * 0.6, `disable 後必須再癱（頭高 ${y.toFixed(4)}）`);
  } finally {
    ctx.dispose();
  }
}

console.log("balance_test: PASS（四方向×兩級衝量×三癱家族站回來、質心回支撐面、放掉再癱）");
