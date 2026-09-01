import assert from "node:assert/strict";
import {
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  Vector3,
} from "@babylonjs/core";
import { createHeadlessScene } from "../src/headless";
import { MotionSuspension } from "../src/motionSuspension";
import createActionFigureModel from "../models/action-figure/createActionFigureModel";

const ctx = await createHeadlessScene();
try {
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, ctx.scene);
  const groundBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, ctx.scene);
  groundBody.shape = new PhysicsShapeBox(
    new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), ctx.scene,
  );

  const model = createActionFigureModel(ctx.scene, { physics: true });
  const suspension = new MotionSuspension(ctx.scene, model.root, model.bodies, 0.3);
  const anchor = suspension.anchor as PhysicsBody;
  const bodyPosition = (body: PhysicsBody): Vector3 => {
    body.transformNode.computeWorldMatrix(true);
    return body.transformNode.absolutePosition.clone();
  };

  const factoryAnchorPosition = bodyPosition(anchor);
  const factoryLocalPositions = new Map(
    Object.entries(model.bodies).map(([id, body]) => [id, body.transformNode.position.clone()]),
  );
  const factoryOffsets = new Map(
    Object.entries(model.bodies).map(([id, body]) => [
      id,
      bodyPosition(body).subtract(factoryAnchorPosition),
    ]),
  );

  Object.values(model.bodies).forEach((body, index) => {
    const direction = index % 2 === 0 ? 1 : -1;
    body.setAngularVelocity(new Vector3(6 * direction, 3, -4 * direction));
  });
  ctx.step(180);
  Object.values(model.bodies).forEach((body, index) => {
    const direction = index % 2 === 0 ? 1 : -1;
    body.setLinearVelocity(new Vector3(3 * direction, 2, -2 * direction));
    body.setAngularVelocity(new Vector3(8 * direction, -5, 6 * direction));
  });
  Object.values(model.bodies).forEach((body) => { body.disablePreStep = false; });
  anchor.transformNode.position.addInPlace(new Vector3(0.5, 0.3, -0.4));
  ctx.step(1);
  Object.values(model.bodies).forEach((body) => { body.disablePreStep = true; });

  suspension.enable();
  for (const [id, body] of Object.entries(model.bodies)) {
    const factoryPosition = factoryLocalPositions.get(id);
    assert.ok(factoryPosition, `${id} 必須有出廠局部位置`);
    assert.ok(
      body.transformNode.position.equalsWithEpsilon(factoryPosition, 1e-6),
      `${id} enable 時必須先還原出廠局部位置`,
    );
  }
  ctx.step(4);
  const suspendedAnchor = bodyPosition(anchor);
  assert.equal(anchor.getMotionType(), PhysicsMotionType.STATIC, "吊空 anchor 必須是 STATIC");
  assert.ok(suspendedAnchor.y > 0.15, `anchor 物理位置應在空中，實際 y=${suspendedAnchor.y}`);

  for (const [id, body] of Object.entries(model.bodies)) {
    const actualOffset = bodyPosition(body).subtract(suspendedAnchor);
    const factoryOffset = factoryOffsets.get(id);
    assert.ok(factoryOffset, `${id} 必須有出廠相對位置`);
    const deviation = Vector3.Distance(actualOffset, factoryOffset);
    assert.ok(deviation < 0.1, `${id} 必須回復出廠姿勢，相對位置偏差=${deviation}`);
  }

  suspension.disable();
  ctx.step(120);
  assert.equal(anchor.getMotionType(), PhysicsMotionType.DYNAMIC, "關閉後 anchor 必須回 DYNAMIC");
  const highestBodyY = Math.max(...Object.values(model.bodies).map((body) => bodyPosition(body).y));
  assert.ok(
    highestBodyY < suspendedAnchor.y,
    `關閉後整體應落回地面，最高 y=${highestBodyY}，吊空 anchor y=${suspendedAnchor.y}`,
  );

  suspension.dispose();
  model.dispose();
  console.log("motion suspension tests: pass");
} finally {
  ctx.dispose();
}
