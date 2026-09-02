/**
 * scale gate（M8 task 0015a）：物理尺度 ×S 的世界裡，人偶行為必須符合物理（不再混沌）。
 * 用法：node --import tsx scripts/scale_test.ts [S=10]
 * 斷言（監工定，勿改；所有步數 ×√S、衝量 ×S^3.5 依 Froude 相似律換算）：
 *   A. 六輪站立循環（鏡射 stand_test）：生成→癱 200√S 步→預武裝→enable→360√S 步
 *      頭高 ≥ 出廠 80%、up>0.9；disable 300√S 步後 < 60%。
 *   B. 抗推：4 方向 × base 衝量 {0.002, 0.003}·S^3.5 N·s × 癱家族 {150,300,450}√S
 *      = 24 景，站穩後推 torso，300√S 步後頭高 ≥ 80%、up>0.9、質心投影回雙腳支撐面
 *      （|dx| ≤ 0.017S、|dz| ≤ 0.014S）。校準（監工探針 2026-09-03）：同尺寸剛體方塊
 *      ×10 依相似律 base 0.008 仍站；v1 平衡在 S=10 四方向 0.003 全站、−z 0.004 倒
 *      （膝單向限位的結構不對稱，屬控制器極限→0015）。三家族結果逐位相同＝不再混沌。
 *   C. 重心轉移原語（0016 前置）：站穩後用 servo 做平行四邊形——兩踝側傾
 *      servo:boot-*.y = +0.1、兩髖外展 servo:thigh-*.y = −0.1，300√S 步 ramp、300√S 步
 *      hold——必須仍站著、質心橫移 ≥ 0.003·S m（S=10 → 30 mm；監工實測 45–59 mm，
 *      幾何預測 h·sin 0.1 ≈ 0.045S）。C 強制 v1 路徑（v2 質心回饋會抵消開迴路位移）。0014 教訓：joint frame 對 axis x 的 y = 世界 z
 *      （側傾／外展）、z = 世界 −y（扭轉）——踝側傾是 .y 軸。
 *   doctrine：不啟用站立照舊癱。
 * 0015 教訓：×1 尺度（9 cm／85 g）低於 Havok 數值尺度地板——剛體方塊 0.002 N·s 即倒，
 * 比解析門檻低 8 倍；×10 才符合物理。本 gate 是「換尺度就不混沌」的可機器驗證版本。
 */
import assert from "node:assert/strict";
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Quaternion, Vector3 } from "@babylonjs/core";
import { createHeadlessScene } from "../src/headless";
import { StandController } from "../src/standController";
import createActionFigureModel from "../models/action-figure/createActionFigureModel";

type Ctx = Awaited<ReturnType<typeof createHeadlessScene>>;
type Model = ReturnType<typeof createActionFigureModel>;

const S = Number(process.argv[2] ?? 10);
assert.ok(Number.isFinite(S) && S >= 1, "S 必須 ≥ 1");
const T = (steps: number): number => Math.round(steps * Math.sqrt(S));
const J = (base: number): number => base * S ** 3.5;

const addGround = (ctx: Ctx): void => {
  const size = 10 * S;
  const ground = MeshBuilder.CreateGround("ground", { width: size, height: size }, ctx.scene);
  const groundBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, ctx.scene);
  const shape = new PhysicsShapeBox(
    new Vector3(0, -0.05 * S, 0), Quaternion.Identity(), new Vector3(size, 0.1 * S, size), ctx.scene,
  );
  shape.material = { friction: 0.7, restitution: 0.2 };
  groundBody.shape = shape;
};
const build = (ctx: Ctx): Model => createActionFigureModel(ctx.scene, { physics: true, physicsScale: S });
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
const standUp = (ctx: Ctx, m: Model, collapse: number): StandController => {
  ctx.step(T(collapse));
  for (const act of m.actuators ?? []) if (act.kind === "servo") act.set(0);
  const stand = new StandController(m);
  stand.enable();
  ctx.step(T(360));
  return stand;
};

// ---- A. 六輪站立循環 ----
{
  const ctx = await createHeadlessScene();
  try {
    addGround(ctx);
    const model = build(ctx);
    const factoryHeadY = headY(model);
    assert.ok(Math.abs(factoryHeadY - 0.088 * S) < 0.002 * S, `A: 出廠頭高應為 0.088·S（${factoryHeadY.toFixed(4)}）`);
    ctx.step(T(200));
    assert.ok(headY(model) < factoryHeadY * 0.5, "A 前置：站立前必須已癱");
    for (const act of model.actuators ?? []) if (act.kind === "servo") act.set(0);
    const stand = new StandController(model);
    for (let cycle = 1; cycle <= 6; cycle++) {
      stand.enable();
      ctx.step(T(360));
      const y = headY(model);
      assert.ok(y >= factoryHeadY * 0.8, `A cycle${cycle}: 頭高 ${y.toFixed(4)} < ${(factoryHeadY * 0.8).toFixed(4)}`);
      assert.ok(torsoUpY(model) > 0.9, `A cycle${cycle}: 軀幹必須朝上`);
      stand.disable();
      ctx.step(T(300));
      assert.ok(headY(model) < factoryHeadY * 0.6, `A cycle${cycle}: disable 後必須再癱`);
    }
  } finally {
    ctx.dispose();
  }
}

// ---- B. 抗推 24 景 ----
const DIRS: Array<[string, Vector3]> = [
  ["+z", new Vector3(0, 0, 1)], ["-z", new Vector3(0, 0, -1)],
  ["+x", new Vector3(1, 0, 0)], ["-x", new Vector3(-1, 0, 0)],
];
for (const collapse of [150, 300, 450]) {
  for (const [dirName, dir] of DIRS) {
    for (const base of [0.002, 0.003]) {
      const tag = `B [collapse ${collapse} / push ${dirName} base ${base} → ${J(base).toFixed(3)} N·s]`;
      const ctx = await createHeadlessScene();
      try {
        addGround(ctx);
        const model = build(ctx);
        const factoryHeadY = headY(model);
        standUp(ctx, model, collapse);
        assert.ok(headY(model) >= factoryHeadY * 0.8, `${tag} 前置：推之前必須站穩（${headY(model).toFixed(4)}）`);
        const torso = model.bodies.torso;
        torso.transformNode.computeWorldMatrix(true);
        torso.applyImpulse(dir.scale(J(base)), torso.transformNode.absolutePosition);
        ctx.step(T(300));
        const y = headY(model);
        assert.ok(y >= factoryHeadY * 0.8, `${tag} 被推後必須站回來：頭高 ${y.toFixed(4)} < ${(factoryHeadY * 0.8).toFixed(4)}`);
        assert.ok(torsoUpY(model) > 0.9, `${tag} 軀幹必須朝上`);
        const { dx, dz } = comOffset(model);
        assert.ok(Math.abs(dx) <= 0.017 * S && Math.abs(dz) <= 0.014 * S, `${tag} 質心必須回支撐面：dx ${dx.toFixed(4)} dz ${dz.toFixed(4)}`);
      } finally {
        ctx.dispose();
      }
    }
  }
}

// ---- C. 重心轉移原語：踝側傾＋髖外展平行四邊形（servo 驅動）----
{
  const ctx = await createHeadlessScene();
  try {
    addGround(ctx);
    const model = build(ctx);
    // C 量的是開迴路幾何原語：v2 的質心回饋會把質心拉回中心（那是 balance_test B 的事），
    // 這裡強制走 v1 路徑（去掉 v2 欄位），只留俯仰鎖姿。
    if (model.balance) { delete model.balance.supportBodyIds; delete model.balance.pitch; delete model.balance.roll; }
    const factoryHeadY = headY(model);
    const stand = standUp(ctx, model, 300);
    assert.ok(headY(model) >= factoryHeadY * 0.8, "C 前置：必須站穩");
    const before = comOffset(model);
    const a = 0.1;
    const ramp = T(300);
    const targets: Array<[string, number]> = [
      ["servo:boot-l.y", a], ["servo:boot-r.y", a], ["servo:thigh-l.y", -a], ["servo:thigh-r.y", -a],
    ];
    for (let s = 1; s <= ramp + T(300); s++) {
      const f = Math.min(1, s / ramp);
      for (const [id, v] of targets) stand.setPoseTarget(id, v * f);
      ctx.step(1);
    }
    const after = comOffset(model);
    assert.ok(headY(model) >= factoryHeadY * 0.8, `C: 重心轉移後必須仍站著（頭高 ${headY(model).toFixed(4)}）`);
    const shift = Math.abs(after.dx - before.dx);
    assert.ok(shift >= 0.003 * S, `C: 質心橫移 ${shift.toFixed(4)} < ${(0.003 * S).toFixed(4)}（平行四邊形移不動質心）`);
  } finally {
    ctx.dispose();
  }
}

// ---- doctrine ----
{
  const ctx = await createHeadlessScene();
  try {
    addGround(ctx);
    const control = build(ctx);
    const factoryHeadY = headY(control);
    ctx.step(T(300));
    assert.ok(headY(control) < factoryHeadY * 0.5, "doctrine: 不啟用站立必須照舊癱");
  } finally {
    ctx.dispose();
  }
}

console.log(`scale_test: PASS（S=${S}：六輪站立／24 景抗推／踝側傾移質心／doctrine）`);
