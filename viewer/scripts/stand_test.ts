/**
 * stand gate（M7 task 0009/0010）：剛性站立——伺服鎖出廠姿勢，不吊空在地上站住。
 * 斷言（監工定，勿改）：
 *   場景一（使用者路徑：playground 重載後人偶已癱，才按站立，且會反覆開關）：
 *     A. 生成→step 200 癱→預武裝 servo（鏡射按鈕 zeroServos）→六輪
 *        enable/disable 循環：每輪 enable 360 步後頭高 ≥ 出廠 80%、軀幹
 *        up>0.9、全 body 座標有限、constraint 數量不變。
 *     B. 每輪 disable() 後再 300 步：頭高 < 出廠 60%（馬達真的放掉，可逆）。
 *   場景二（doctrine 保護，獨立新場景）：
 *     C. 不啟用站立時 ragdoll 照舊出生即癱（300 步後頭高 < 出廠 50%）。
 * 0009/0010 教訓：gate 必須鏡射使用者真實路徑（癱後恢復），不得測「出廠姿勢
 * 瞬間 enable」這條使用者按不到的路徑，也不得依賴場景歷史。
 */
import assert from "node:assert/strict";
import { MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Quaternion, Vector3 } from "@babylonjs/core";
import { createHeadlessScene } from "../src/headless";
import { StandController } from "../src/standController";
import createActionFigureModel from "../models/action-figure/createActionFigureModel";

type Ctx = Awaited<ReturnType<typeof createHeadlessScene>>;

const addGround = (ctx: Ctx): void => {
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, ctx.scene);
  const groundBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, ctx.scene);
  const shape = new PhysicsShapeBox(
    new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), ctx.scene,
  );
  // 鏡射 harness.ts 的 playground 地面材質（0011 r2 教訓：gate 地面沒設材質
  // ＝Havok 預設值，站立收斂行為與 playground 不同，gate 環境失真）。
  shape.material = { friction: 0.7, restitution: 0.2 };
  groundBody.shape = shape;
};
const headY = (m: ReturnType<typeof createActionFigureModel>): number => {
  m.bodies.head.transformNode.computeWorldMatrix(true);
  return m.bodies.head.transformNode.absolutePosition.y;
};

// ---- 場景一：癱後恢復站立（使用者路徑：playground 重載後人偶已癱）----
{
  const ctx = await createHeadlessScene();
  try {
    addGround(ctx);
    const model = createActionFigureModel(ctx.scene, { physics: true });
    const factoryHeadY = headY(model);
    const constraintCount = model.constraints.length;
    // 先讓 ragdoll 出生即癱（鏡射 playground：使用者按站立時人偶早已癱在地上）
    ctx.step(200);
    assert.ok(
      headY(model) < factoryHeadY * 0.5,
      "前置：站立前必須已癱（鏡射 playground 真實路徑）",
    );
    // 鏡射 harness 站立按鈕路徑：onclick 先 stopPlayback()→zeroServos()，
    // 在癱姿預先武裝全部 servo 才 enable()。0011 r1 gate 只測「未武裝」路徑。
    for (const act of model.actuators ?? []) {
      if (act.kind === "servo") act.set(0);
    }
    const stand = new StandController(model);
    // 0011 r1 教訓：站立不能只在單一軌跡上成立。playground 開→關→再開循環
    // 每次癱出的堆姿微差（第 4 位小數）就決定站或倒——臨界穩定不算站立。
    // 六輪 enable/disable 循環全部都要站穩、放掉都要再癱。
    for (let cycle = 1; cycle <= 6; cycle++) {
      stand.enable(); // 必須從癱姿恢復站立：重置出廠姿勢＋貼地＋清速度＋鎖 servo
      assert.ok(stand.active, `cycle${cycle}: enable 後 active 必須為 true`);
      ctx.step(360);

      const standingY = headY(model);
      assert.ok(
        standingY >= factoryHeadY * 0.8,
        `cycle${cycle}: 癱後恢復站立 6 秒後頭高必須 ≥ 出廠 80%（${standingY.toFixed(4)} < ${(factoryHeadY * 0.8).toFixed(4)}）`,
      );
      const torsoNode = model.bodies.torso.transformNode;
      torsoNode.computeWorldMatrix(true);
      const up = Vector3.TransformNormal(Vector3.Up(), torsoNode.getWorldMatrix()).normalize();
      assert.ok(up.y > 0.9, `cycle${cycle}: 軀幹必須朝上（up·Y ${up.y.toFixed(3)} <= 0.9）`);
      for (const [id, body] of Object.entries(model.bodies)) {
        const p = body.transformNode.absolutePosition;
        assert.ok(Number.isFinite(p.x + p.y + p.z), `cycle${cycle}: ${id} 座標必須有限`);
      }
      assert.equal(model.constraints.length, constraintCount, `cycle${cycle}: constraint 數量不得改變`);

      stand.disable();
      assert.ok(!stand.active, `cycle${cycle}: disable 後 active 必須為 false`);
      ctx.step(300);
      const releasedY = headY(model);
      assert.ok(
        releasedY < factoryHeadY * 0.6,
        `cycle${cycle}: disable 後必須再癱（頭高 ${releasedY.toFixed(4)} >= ${(factoryHeadY * 0.6).toFixed(4)}）`,
      );
    }
  } finally {
    ctx.dispose();
  }
}

// ---- 場景二：doctrine 保護（獨立新場景）----
{
  const ctx = await createHeadlessScene();
  try {
    addGround(ctx);
    const control = createActionFigureModel(ctx.scene, { physics: true });
    const factoryHeadY = headY(control);
    ctx.step(300);
    const collapsedY = headY(control);
    assert.ok(
      collapsedY < factoryHeadY * 0.5,
      `對照組必須照舊癱（頭高 ${collapsedY.toFixed(4)} >= ${(factoryHeadY * 0.5).toFixed(4)}）`,
    );
  } finally {
    ctx.dispose();
  }
}

console.log("stand_test: PASS（癱後恢復站立/放掉再癱/對照照舊癱）");
