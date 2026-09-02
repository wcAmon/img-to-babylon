/**
 * stand gate（M7 task 0009）：剛性站立——伺服鎖出廠姿勢，不吊空在地上站住。
 * 斷言（監工定，勿改）：
 *   A. 對照組（doctrine 保護）：不啟用站立時 ragdoll 照舊出生即癱
 *      （300 步後頭高 < 出廠 50%）。
 *   B. 站立組：出生即 StandController.enable()，600 步（10 秒）後
 *      頭高 ≥ 出廠 80%、軀幹 up 與世界 up 內積 > 0.9、全 body 座標有限、
 *      constraint 數量不變。
 *   C. disable() 後再 300 步：頭高 < 出廠 60%（馬達真的放掉，opt-in 可逆）。
 */
import assert from "node:assert/strict";
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Quaternion, Vector3 } from "@babylonjs/core";
import { createHeadlessScene } from "../src/headless";
import { StandController } from "../src/standController";
import createActionFigureModel from "../models/action-figure/createActionFigureModel";

const ctx = await createHeadlessScene();
try {
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, ctx.scene);
  const groundBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, ctx.scene);
  groundBody.shape = new PhysicsShapeBox(
    new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), ctx.scene,
  );

  const headY = (m: ReturnType<typeof createActionFigureModel>): number => {
    m.bodies.head.transformNode.computeWorldMatrix(true);
    return m.bodies.head.transformNode.absolutePosition.y;
  };

  // A. 對照組：doctrine 不變，未啟用站立就照舊癱
  const control = createActionFigureModel(ctx.scene, { physics: true });
  const factoryHeadY = headY(control);
  ctx.step(300);
  const collapsedY = headY(control);
  assert.ok(
    collapsedY < factoryHeadY * 0.5,
    `對照組必須照舊癱（頭高 ${collapsedY.toFixed(4)} >= ${(factoryHeadY * 0.5).toFixed(4)}）`,
  );
  control.dispose();

  // B. 站立組：出生即啟用
  const model = createActionFigureModel(ctx.scene, { physics: true });
  const constraintCount = model.constraints.length;
  const stand = new StandController(model);
  stand.enable();
  assert.ok(stand.active, "enable 後 active 必須為 true");
  ctx.step(600);

  const standingY = headY(model);
  assert.ok(
    standingY >= factoryHeadY * 0.8,
    `站立 10 秒後頭高必須 ≥ 出廠 80%（${standingY.toFixed(4)} < ${(factoryHeadY * 0.8).toFixed(4)}）`,
  );
  const torsoNode = model.bodies.torso.transformNode;
  torsoNode.computeWorldMatrix(true);
  const up = Vector3.TransformNormal(Vector3.Up(), torsoNode.getWorldMatrix()).normalize();
  assert.ok(up.y > 0.9, `軀幹必須朝上（up·Y ${up.y.toFixed(3)} <= 0.9）`);
  for (const [id, body] of Object.entries(model.bodies)) {
    const p = body.transformNode.absolutePosition;
    assert.ok(Number.isFinite(p.x + p.y + p.z), `${id} 座標必須有限`);
  }
  assert.equal(model.constraints.length, constraintCount, "constraint 數量不得改變");

  // C. disable 可逆：馬達放掉要再癱
  stand.disable();
  assert.ok(!stand.active, "disable 後 active 必須為 false");
  ctx.step(300);
  const releasedY = headY(model);
  assert.ok(
    releasedY < factoryHeadY * 0.6,
    `disable 後必須再癱（頭高 ${releasedY.toFixed(4)} >= ${(factoryHeadY * 0.6).toFixed(4)}）`,
  );

  console.log("stand_test: PASS（對照癱/站立穩/放掉再癱）");
} finally {
  ctx.dispose();
}
