// disinfectant-spray — 消毒劑扳機噴瓶：lathe 瓶身＋噴頭＋扳機 hinge servo（出廠回位）＋pour（無傾角條件、沿噴嘴 +z）。
// 對應 spec: viewer/models/disinfectant-spray/spec.json；契約見 grimoire/physics.md「傾倒＝節流的質量轉移」
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShape,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsShapeCylinder,
  PhysicsShapeSphere,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";
import { createHinge, hingeAngle, makeHingeServo, relativeRotation } from "../../src/hinge";

// ---- spec 尺寸（絕對高度以地面為 0；參考圖量測：藍瓶身 0.18、噴頭後高前低 0.06×0.11）----
const BOTTLE_R = 0.045, BOTTLE_H = 0.19, BOTTLE_Y = BOTTLE_H / 2;
const COLLAR_R = 0.018, COLLAR_H = 0.02, COLLAR_Y = BOTTLE_H + COLLAR_H / 2; // 白色頸圈 0.19–0.21
const HEAD = { w: 0.05, h: 0.045, d: 0.045 }, HEAD_Y = 0.2325, HEAD_Z = -0.0125; // 噴頭後塊 0.21–0.255、z −0.035..0.01
const HEAD_COLLIDER = { d: 0.09, dz: 0.0225 }; // 單一 collider 涵蓋後塊＋鼻（z −0.035..0.055）
const NOSE = { w: 0.05, h: 0.023, d: 0.045 }, NOSE_Y = 0.2435, NOSE_Z = 0.0325; // 前鼻（上半，噴嘴端）0.232–0.255、z 0.01..0.055
const NOZZLE_Y = NOSE_Y, NOZZLE_Z = NOSE_Z + NOSE.d / 2; // 噴嘴在鼻尖（+z）
const TRIGGER = { w: 0.015, h: 0.046, d: 0.012 };
const HINGE_Y = 0.231, HINGE_Z = 0.046; // 扳機樞軸：鼻下（扳機 y ≤ 0.231 在鼻底 0.232 之下、z 0.040–0.052 在頸圈外）
const TRIGGER_Y = HINGE_Y - TRIGGER.h / 2; // 0.208
const TRIGGER_LIMITS: [number, number] = [0, 0.5];
const SERVO_FORCE = 0.05;
const MASS = 0.55, TRIGGER_MASS = 0.01, FRICTION = 0.5, RESTITUTION = 0.1;
const BOTTLE_COM = new Vector3(0, -0.02, 0);
// 鏡射 spec physics.bodies[bottle].pour（兩處必須一致）；無 tiltThreshold = 不看傾角
const POUR = { grains: 60, grainMass: 0.002, ratePerSecond: 30, direction: new Vector3(0, 0, 1), exitSpeed: 2.5, gate: { body: "trigger", minAngle: 0.3 } };
const SPAWN_OFFSET = new Vector3(0, NOZZLE_Y - BOTTLE_Y, NOZZLE_Z + 0.012); // bottle pivot → 噴嘴口外
const DROP_D = 0.006, DROP_DAMPING = 2.0, DROP_SCATTER = 0.004;
const GROUP = 2, DROP_GROUP = 4;
const TESS = 40;
const LABEL_ARC_RAD = 1.3, LABEL_H = 0.085, LABEL_N = 12, LABEL_CENTER = Math.PI; // 標籤在 −x 側（參考圖：標籤面與噴嘴軸垂直）
const SEED = 20260906;
const FIXED_DT = 1 / 60;

const TRIGGER_HINGE = {
  pivotA: [0, HINGE_Y - BOTTLE_Y, HINGE_Z] as [number, number, number],
  pivotB: [0, HINGE_Y - TRIGGER_Y, 0] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: TRIGGER_LIMITS,
};

/** mulberry32：小而確定性的 PRNG。 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.25, 0.25, 0.25); m.specularPower = specPower;
  if (alpha < 1) m.alpha = alpha;
  return m;
}

/** 瓶身：底→直身（到 0.12）→肩→握腰→頸口（lathe，x 半徑、y 相對 bottle pivot）。 */
function bottleProfile(): Vector3[] {
  const b = -BOTTLE_Y, t = BOTTLE_Y;
  return [
    new Vector3(0, b, 0), new Vector3(BOTTLE_R - 0.006, b, 0), new Vector3(BOTTLE_R, b + 0.008, 0),
    new Vector3(BOTTLE_R, b + 0.12, 0), new Vector3(0.038, b + 0.145, 0), new Vector3(0.033, b + 0.16, 0),
    new Vector3(0.033, b + 0.172, 0), new Vector3(0.026, b + 0.185, 0), // 握腰
    new Vector3(COLLAR_R + 0.003, t, 0), new Vector3(0, t, 0),
  ];
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 384;
  const tex = new DynamicTexture("spray-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // 正面看的 ribbon 帶：垂直翻轉即正讀（M11 粉罐同法）
  c.fillStyle = "#f9f9f6"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#1f3fa8"; c.textAlign = "center";
  c.font = "bold 78px Helvetica, Arial, sans-serif"; c.fillText("DISINFECTANT", w / 2, 120);
  c.fillStyle = "#1c1c1c";
  c.font = "46px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("消毒劑", w / 2, 195);
  c.font = "30px Helvetica, Arial, sans-serif";
  c.fillText("含氯 5000 ppm", w / 2, 250);
  c.fillText("噴灑後靜置 10 分鐘", w / 2, 295);
  c.fillText("500 mL", w / 2, 340);
  c.fillStyle = "#1f3fa8"; c.fillRect(60, 356, w - 120, 6);
  tex.update(false);
  return tex;
}

export default function createDisinfectantSprayModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("disinfectant-spray", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  const blue = mat(scene, "bottle-blue", [0.55, 0.78, 0.95], 48);
  blue.emissiveColor = new Color3(0.14, 0.22, 0.30); // HDPE 淺藍：半球光下偏灰藍，補自發光貼近參考圖的亮天藍（material pass）
  blue.backFaceCulling = false;
  const white = mat(scene, "head-white", [0.95, 0.95, 0.94], 40);
  white.emissiveColor = new Color3(0.14, 0.14, 0.14);
  const dark = mat(scene, "nozzle-dark", [0.25, 0.25, 0.27], 30);
  const label = mat(scene, "label-print", [0.98, 0.98, 0.97], 24);
  label.backFaceCulling = false;
  label.emissiveColor = new Color3(0.30, 0.30, 0.30); // 白標籤在 −x 側背光，補自發光
  const mist = mat(scene, "mist-blue", [0.70, 0.85, 1.0], 16, 0.8);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) label.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [blue, white, dark, label, mist];
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- bottle（瓶身、頸圈、噴頭、噴嘴、軸、標籤）----
  const bottlePivot = pivot("bottle", root, new Vector3(0, BOTTLE_Y, 0));
  attach("bottle", MeshBuilder.CreateLathe("bottle", { shape: bottleProfile(), tessellation: TESS, closed: true }, scene), bottlePivot, blue);
  attach("collar", MeshBuilder.CreateCylinder("collar", { height: COLLAR_H, diameter: COLLAR_R * 2, tessellation: TESS }, scene),
    pivot("collar", bottlePivot, new Vector3(0, COLLAR_Y - BOTTLE_Y, 0)), white);
  const headPivot = pivot("head", bottlePivot, new Vector3(0, HEAD_Y - BOTTLE_Y, HEAD_Z));
  attach("head", MeshBuilder.CreateBox("head", { width: HEAD.w, height: HEAD.h, depth: HEAD.d }, scene), headPivot, white);
  attach("nose", MeshBuilder.CreateBox("nose", { width: NOSE.w, height: NOSE.h, depth: NOSE.d }, scene),
    pivot("nose", bottlePivot, new Vector3(0, NOSE_Y - BOTTLE_Y, NOSE_Z)), white);
  const nozzle = MeshBuilder.CreateCylinder("nozzle", { height: 0.012, diameter: 0.014, tessellation: 16 }, scene);
  nozzle.rotation.x = Math.PI / 2;
  attach("nozzle", nozzle, pivot("nozzle", bottlePivot, new Vector3(0, NOZZLE_Y - BOTTLE_Y, NOZZLE_Z + 0.002)), dark);
  const axle = MeshBuilder.CreateCylinder("trigger-axle", { height: 0.024, diameter: 0.006, tessellation: 12 }, scene);
  axle.rotation.z = Math.PI / 2;
  attach("trigger-axle", axle, pivot("trigger-axle", bottlePivot, new Vector3(0, HINGE_Y - BOTTLE_Y, HINGE_Z)), dark);
  const arcPts = (y: number): Vector3[] => Array.from({ length: LABEL_N + 1 }, (_, i) => {
    const th = LABEL_CENTER - LABEL_ARC_RAD / 2 + (i / LABEL_N) * LABEL_ARC_RAD; // 弧心正對 −x
    return new Vector3(Math.cos(th) * (BOTTLE_R + 0.0005), y, Math.sin(th) * (BOTTLE_R + 0.0005));
  });
  const band = MeshBuilder.CreateRibbon("label-band", { pathArray: [arcPts(-LABEL_H / 2), arcPts(LABEL_H / 2)], sideOrientation: Mesh.DOUBLESIDE }, scene);
  attach("label-band", band, pivot("label-band", bottlePivot, new Vector3(0, -0.035, 0)), label);

  // ---- trigger ----
  const triggerPivot = pivot("trigger", root, new Vector3(0, TRIGGER_Y, HINGE_Z));
  attach("trigger", MeshBuilder.CreateBox("trigger", { width: TRIGGER.w, height: TRIGGER.h, depth: TRIGGER.d }, scene), triggerPivot, white);

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  const spawned: Mesh[] = [];
  const observers: (() => void)[] = [];

  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const makeBody = (id: string, node: TransformNode, shapes: { shape: PhysicsShape; rel: Vector3 }[], mass: number, com: Vector3): PhysicsBody => {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      for (const { shape, rel } of shapes) {
        shape.material = { friction: FRICTION, restitution: RESTITUTION };
        shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~GROUP;
        container.addChild(shape, rel, Quaternion.Identity());
      }
      body.shape = container;
      body.setMassProperties({ mass, centerOfMass: com });
      bodies[id] = body;
      return body;
    };
    bottlePivot.computeWorldMatrix(true); headPivot.computeWorldMatrix(true);
    const headRel = headPivot.absolutePosition.subtract(bottlePivot.absolutePosition);
    const bottleBody = makeBody("bottle", bottlePivot, [
      { shape: new PhysicsShapeCylinder(new Vector3(0, -BOTTLE_Y, 0), new Vector3(0, BOTTLE_Y, 0), BOTTLE_R, scene), rel: Vector3.Zero() },
      { shape: new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(HEAD.w, HEAD.h, HEAD_COLLIDER.d), scene), rel: headRel.add(new Vector3(0, 0, HEAD_COLLIDER.dz)) },
    ], MASS, BOTTLE_COM);
    const triggerBody = makeBody("trigger", triggerPivot, [
      { shape: new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(TRIGGER.w, TRIGGER.h, TRIGGER.d), scene), rel: Vector3.Zero() },
    ], TRIGGER_MASS, Vector3.Zero());

    const hinge = createHinge(scene, bottleBody, triggerBody, TRIGGER_HINGE);
    constraints.push(hinge);
    const servo = makeHingeServo(hinge, "trigger", TRIGGER_LIMITS[0], TRIGGER_LIMITS[1], SERVO_FORCE, "扳機");
    actuators.push(servo);
    servo.set(0); // 出廠即回位彈簧（M10 踏板慣例）：0.01 kg 扳機否則數步就垂到限位

    // ---- pour：無傾角條件，扳機角 ≥ minAngle 時沿噴嘴 +z 節流噴出 ----
    const bind = relativeRotation(bottleBody, triggerBody); // 綁定姿勢：任何物理步之前
    const groundY = 0;
    let poured = 0, accum = 0;
    const spawnDrop = (): void => {
      if (poured >= POUR.grains) return;
      const i = poured; poured += 1;
      bottlePivot.computeWorldMatrix(true);
      const wm = bottlePivot.getWorldMatrix();
      const dir = Vector3.TransformNormal(POUR.direction, wm).normalize();
      const p = bottlePivot.absolutePosition.add(Vector3.TransformNormal(SPAWN_OFFSET, wm));
      p.addInPlace(new Vector3((rng() - 0.5) * DROP_SCATTER, (rng() - 0.5) * DROP_SCATTER, 0));
      if (p.y < groundY + DROP_D) p.y = groundY + DROP_D;
      const d = MeshBuilder.CreateSphere(`grain-${i}`, { diameter: DROP_D, segments: 6 }, scene);
      d.position.copyFrom(p); d.material = mist; d.isPickable = false;
      meshes[`grain-${i}`] = d; spawned.push(d);
      const db = new PhysicsBody(d, PhysicsMotionType.DYNAMIC, false, scene);
      const ds = new PhysicsShapeSphere(Vector3.Zero(), DROP_D / 2, scene);
      ds.material = { friction: 0.3, restitution: 0.05 };
      ds.filterMembershipMask = DROP_GROUP; ds.filterCollideMask = ~GROUP; // 互撞、撞地，不撞瓶與扳機
      db.shape = ds;
      db.setMassProperties({ mass: POUR.grainMass });
      db.setLinearDamping(DROP_DAMPING); db.setAngularDamping(DROP_DAMPING);
      db.setLinearVelocity(bottleBody.getLinearVelocity().add(dir.scale(POUR.exitSpeed)));
      bodies[`grain-${i}`] = db;
      bottleBody.setMassProperties({ mass: MASS - poured * POUR.grainMass, centerOfMass: BOTTLE_COM });
    };
    const after = scene.onAfterPhysicsObservable.add(() => {
      if (poured >= POUR.grains) return;
      const angle = Math.abs(hingeAngle(bottleBody, triggerBody, bind));
      if (angle < POUR.gate.minAngle) { accum = 0; return; }
      accum += POUR.ratePerSecond * FIXED_DT;
      while (accum >= 1 && poured < POUR.grains) { accum -= 1; spawnDrop(); }
    });
    observers.push(() => scene.onAfterPhysicsObservable.remove(after));
    actuators.push({
      id: "pour:bottle", kind: "pour", label: "噴灑", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) while (poured < POUR.grains) spawnDrop(); },
    });
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints, actuators,
    dispose(): void {
      observers.forEach((off) => off());
      constraints.forEach((c) => c.dispose());
      Object.values(bodies).forEach((b) => b.dispose());
      spawned.forEach((m) => m.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
