/**
 * balance gate（M8 task 0015，S=10 重校版）：質心-支撐面平衡——被推站回來＋質心可命令。
 * 所有量依 model.physicsScale 換算（長度 ×S、步數 ×√S、衝量 ×S^3.5）；下列數字為 base（S=1 基準）。
 * 斷言（監工定，勿改）：
 *   A. 抗推矩陣：方向 {+z 前, -z 後, +x 左, -x 右} × base 衝量 {0.002, 0.003} × 癱家族
 *      {150, 300, 450} = 24 景。每景：生成→癱→預武裝→enable→360 步→推 torso→300 步→
 *      頭高 ≥ 出廠 80%、up>0.9、質心投影回雙腳支撐面（|dx| ≤ 0.017S、|dz| ≤ 0.014S）、
 *      座標有限、constraint 不變。
 *      校準（監工探針 2026-09-03，S=10）：剛體雕像 +z 撐 0.003／−z 0.003 即倒／±x 撐 0.006；
 *      v1 主動平衡 +z 撐 0.004、−z 撐 0.003、±x 撐 0.008——已全方向贏過雕像。
 *      契約＝全方向贏過剛體雕像：0.003 四方向全站。−z 0.004 經 0015 r2 三輪非對稱策略仍
 *      紅（監工 2026-09-03 重校降回 0.003，記為未 gate 的延伸目標；雕像 −z 0.003 即倒，
 *      控制器已超越被動極限）。
 *   B. 質心目標追蹤（0016 重心轉移前置）：站穩後 stand.setBalanceTarget({x, z})（質心投影
 *      相對雙腳支撐面中心的目標偏移，世界單位），目標依序 x=+0.004S、x=−0.004S、x=0（橫向
 *      回中）、z=+0.0015S，各 ramp 300 步＋hold 300 步後：仍站著、|質心−目標| ≤ 0.001S。
 *      校準：踝 y +0.1／髖 y −0.1 開迴路即得橫移 0.0045–0.0059S；踝 x ±0.1 得前後
 *      0.0009–0.0019S。**已知限制（監工 2026-09-03 接手實測）**：後向俯仰（從前傾回中或
 *      z<0）在閉迴路下幾乎無權威——踝指令爬到 +0.21 rad 質心不動，再一次鬆脫崩塌（軟
 *      POSITION 踝在前傾負載下的黏滑），屬致動器層問題，故 B 不含 z<0 與前傾後回中；
 *      0016 只需橫移＋保持。
 *   doctrine：被推站回來後 disable() 再癱。
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
const IMPULSES = [0.002, 0.003];
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

// ---- B. 質心目標追蹤（0016 重心轉移前置）----
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
    assert.ok(headY(model) >= factoryHeadY * 0.8, "B 前置：必須站穩");
    const tol = 0.001 * scale;
    const targets: Array<{ x: number; z: number }> = [
      { x: 0.004 * scale, z: 0 }, { x: -0.004 * scale, z: 0 }, { x: 0, z: 0 },
      { x: 0, z: 0.0015 * scale },
    ];
    let from = { x: 0, z: 0 };
    for (const target of targets) {
      const ramp = T(300);
      for (let s = 1; s <= ramp + T(300); s++) {
        const f = Math.min(1, s / ramp);
        stand.setBalanceTarget({ x: from.x + (target.x - from.x) * f, z: from.z + (target.z - from.z) * f });
        ctx.step(1);
      }
      from = target;
      const tag = `B target (${target.x.toFixed(4)}, ${target.z.toFixed(4)})`;
      assert.ok(headY(model) >= factoryHeadY * 0.8, `${tag} 追蹤中必須仍站著（頭高 ${headY(model).toFixed(4)}）`);
      const { dx, dz } = comOffset(model);
      assert.ok(
        Math.hypot(dx - target.x, dz - target.z) <= tol,
        `${tag} 質心必須到位：實際 (${dx.toFixed(4)}, ${dz.toFixed(4)})，誤差 > ${tol.toFixed(4)}`,
      );
    }
  } finally {
    ctx.dispose();
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

console.log("balance_test: PASS（24 景抗推站回來／質心目標追蹤／放掉再癱）");
