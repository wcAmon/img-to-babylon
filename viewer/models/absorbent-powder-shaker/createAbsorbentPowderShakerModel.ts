// absorbent-powder-shaker — 吸附凝固粉罐：lathe 肩頸瓶身＋蓋 hinge servo＋pour（節流的質量轉移）。
// 對應 spec: viewer/models/absorbent-powder-shaker/spec.json；契約見 grimoire/physics.md「傾倒＝節流的質量轉移」
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsMotionType,
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

// ---- spec 尺寸 ----
const BOTTLE_R = 0.04, BOTTLE_H = 0.12, BOTTLE_Y = BOTTLE_H / 2; // 瓶身到頸口（參考圖量測：身 0.10＋肩頸 0.02）
const SHOULDER_Y = 0.098, NECK_R = 0.024; // 肩起點高（絕對）、頸半徑
const POWDER_Y = 0.0975; // 粉面高（絕對）
const CAP_R = 0.028, CAP_H = 0.037, CAP_Y = BOTTLE_H + CAP_H / 2; // 0.1385
const HINGE_Y = BOTTLE_H, HINGE_Z = CAP_R; // 頸口後緣（+z）
const CAP_LIMITS: [number, number] = [0, 1.9];
const SERVO_FORCE = 0.5;
const MASS = 0.45, CAP_MASS = 0.03, FRICTION = 0.5, RESTITUTION = 0.1;
const BOTTLE_COM = new Vector3(0, -0.02, 0);
// 鏡射 spec physics.bodies[bottle].pour（兩處必須一致）
const POUR = { tiltThreshold: 1.2, grains: 40, grainMass: 0.003, ratePerSecond: 20, gate: { body: "cap", minAngle: 1.0 } };
const GRAIN_D = 0.010, GRAIN_DAMPING = 2.0, GRAIN_EXIT_SPEED = 0.3, GRAIN_SCATTER = 0.02;
const SPOUT_OFFSET = BOTTLE_H / 2 + 0.015; // 自 bottle pivot 沿局部 +y 到生成點
const GROUP = 2, GRAIN_GROUP = 4;
const TESS = 40;
const LABEL_ARC_RAD = 1.25, LABEL_H = 0.07, LABEL_N = 12; // 標籤弧寬（rad）、高、分段
const SEED = 20260905;
const FIXED_DT = 1 / 60;

const CAP_HINGE = {
  pivotA: [0, HINGE_Y - BOTTLE_Y, HINGE_Z] as [number, number, number],
  pivotB: [0, HINGE_Y - CAP_Y, HINGE_Z] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: CAP_LIMITS,
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

/** 瓶身：外壁（底→身→肩→頸口）、內壁下到粉面（lathe，x 半徑、y 相對 bottle pivot）。 */
function bottleProfile(): Vector3[] {
  const b = -BOTTLE_Y, t = BOTTLE_Y, sh = SHOULDER_Y - BOTTLE_Y, pf = POWDER_Y - BOTTLE_Y;
  return [
    new Vector3(0, b, 0), new Vector3(BOTTLE_R - 0.004, b, 0), new Vector3(BOTTLE_R, b + 0.005, 0),
    new Vector3(BOTTLE_R, sh, 0), new Vector3(BOTTLE_R - 0.007, sh + 0.011, 0), new Vector3(NECK_R, sh + 0.017, 0),
    new Vector3(NECK_R, t, 0), new Vector3(NECK_R - 0.004, t, 0), new Vector3(NECK_R - 0.004, pf - 0.001, 0),
    new Vector3(0, pf - 0.001, 0),
  ];
}

function capProfile(): Vector3[] {
  const b = -CAP_H / 2, t = CAP_H / 2;
  return [new Vector3(0, b, 0), new Vector3(CAP_R, b, 0), new Vector3(CAP_R, t - 0.005, 0), new Vector3(CAP_R - 0.005, t, 0), new Vector3(0, t, 0)];
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 384;
  const tex = new DynamicTexture("shaker-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // 正面看的圓弧帶：先垂直翻轉（material pass 目視若鏡像再加水平翻轉）
  c.fillStyle = "#f9f9f6"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#4b1e8c"; c.textAlign = "center";
  c.font = "bold 84px Helvetica, Arial, sans-serif"; c.fillText("ABSORBENT", w / 2, 120);
  c.fillStyle = "#1c1c1c";
  c.font = "46px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("吸附凝固粉", w / 2, 195);
  c.font = "26px Helvetica, Arial, sans-serif";
  c.fillText("1. 開蓋傾倒覆蓋液面", w / 2, 250);
  c.fillText("2. 靜置 1 分鐘凝固", w / 2, 290);
  c.fillText("3. 鏟入細胞毒性廢棄物桶", w / 2, 330);
  c.fillStyle = "#4b1e8c"; c.fillRect(60, 352, w - 120, 6);
  tex.update(false);
  return tex;
}

export default function createAbsorbentPowderShakerModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("absorbent-powder-shaker", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  const white = mat(scene, "bottle-white", [0.94, 0.94, 0.92], 48);
  white.emissiveColor = new Color3(0.16, 0.16, 0.15); // HDPE 白：半球光下純 diffuse 偏灰，補一點自發光（material pass）
  white.backFaceCulling = false; // lathe 內壁可見
  const powder = mat(scene, "powder-gray", [0.86, 0.86, 0.84], 4);
  const label = mat(scene, "label-print", [0.98, 0.98, 0.97], 24);
  label.backFaceCulling = false;
  const purple = mat(scene, "cap-purple", [0.42, 0.16, 0.72], 40);
  purple.emissiveColor = new Color3(0.08, 0.02, 0.14);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) label.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [white, powder, label, purple];
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- bottle ----
  const bottlePivot = pivot("bottle", root, new Vector3(0, BOTTLE_Y, 0));
  attach("bottle", MeshBuilder.CreateLathe("bottle", { shape: bottleProfile(), tessellation: TESS, closed: true }, scene), bottlePivot, white);
  attach("powder-face", MeshBuilder.CreateCylinder("powder-face", { height: 0.002, diameter: (NECK_R - 0.004) * 2, tessellation: TESS }, scene),
    pivot("powder-face", bottlePivot, new Vector3(0, POWDER_Y - BOTTLE_Y, 0)), powder);
  // 標籤：貼在瓶身正面（−z）的圓弧帶。用 ribbon（底弧＋頂弧兩條路徑）而非 arc cylinder——
  // cylinder 側面在 arc 模式的 UV 軸向不可預期（M11 實測四種畫布變換皆直排）；ribbon 的 u 沿路徑、v 跨路徑。
  const arcPts = (y: number): Vector3[] => Array.from({ length: LABEL_N + 1 }, (_, i) => {
    const th = -Math.PI / 2 - LABEL_ARC_RAD / 2 + (i / LABEL_N) * LABEL_ARC_RAD; // 自 −x 側掃到 +x 側，弧心正對 −z
    return new Vector3(Math.cos(th) * (BOTTLE_R + 0.0005), y, Math.sin(th) * (BOTTLE_R + 0.0005));
  });
  const band = MeshBuilder.CreateRibbon("label-band", { pathArray: [arcPts(-LABEL_H / 2), arcPts(LABEL_H / 2)], sideOrientation: Mesh.DOUBLESIDE }, scene);
  attach("label-band", band, pivot("label-band", bottlePivot, new Vector3(0, -0.008, 0)), label);

  // ---- cap ----
  const capPivot = pivot("cap", root, new Vector3(0, CAP_Y, 0));
  attach("cap", MeshBuilder.CreateLathe("cap", { shape: capProfile(), tessellation: TESS, closed: true }, scene), capPivot, purple);
  attach("cap-tab", MeshBuilder.CreateBox("cap-tab", { width: 0.02, height: 0.006, depth: 0.012 }, scene),
    pivot("cap-tab", capPivot, new Vector3(0, -0.013, -(CAP_R + 0.004))), purple);
  attach("cap-knuckle", MeshBuilder.CreateBox("cap-knuckle", { width: 0.03, height: 0.012, depth: 0.012 }, scene),
    pivot("cap-knuckle", capPivot, new Vector3(0, -0.015, HINGE_Z)), purple);

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  const spawned: Mesh[] = [];
  const observers: (() => void)[] = [];

  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const makeBody = (id: string, node: TransformNode, shape: PhysicsShapeCylinder, mass: number, com: Vector3): PhysicsBody => {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      shape.material = { friction: FRICTION, restitution: RESTITUTION };
      shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~GROUP;
      container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({ mass, centerOfMass: com });
      bodies[id] = body;
      return body;
    };
    const bottleBody = makeBody("bottle", bottlePivot,
      new PhysicsShapeCylinder(new Vector3(0, -BOTTLE_Y, 0), new Vector3(0, BOTTLE_Y, 0), BOTTLE_R, scene), MASS, BOTTLE_COM);
    const capBody = makeBody("cap", capPivot,
      new PhysicsShapeCylinder(new Vector3(0, -CAP_H / 2, 0), new Vector3(0, CAP_H / 2, 0), CAP_R, scene), CAP_MASS, Vector3.Zero());

    const capHinge = createHinge(scene, bottleBody, capBody, CAP_HINGE);
    constraints.push(capHinge);
    actuators.push(makeHingeServo(capHinge, "cap", CAP_LIMITS[0], CAP_LIMITS[1], SERVO_FORCE, "蓋子"));

    // ---- pour：節流的質量轉移 ----
    const capBind = relativeRotation(bottleBody, capBody); // 綁定姿勢：任何物理步之前
    const groundY = 0;
    let poured = 0, accum = 0;
    const spawnGrain = (): void => {
      if (poured >= POUR.grains) return;
      const i = poured; poured += 1;
      bottlePivot.computeWorldMatrix(true);
      const up = bottlePivot.getDirection(Vector3.Up());
      const p = bottlePivot.absolutePosition.add(up.scale(SPOUT_OFFSET));
      p.addInPlace(new Vector3((rng() - 0.5) * GRAIN_SCATTER, 0, (rng() - 0.5) * GRAIN_SCATTER));
      if (p.y < groundY + GRAIN_D) p.y = groundY + GRAIN_D;
      const g = MeshBuilder.CreateSphere(`grain-${i}`, { diameter: GRAIN_D, segments: 6 }, scene);
      g.position.copyFrom(p); g.material = powder; g.isPickable = false;
      meshes[`grain-${i}`] = g; spawned.push(g);
      const gb = new PhysicsBody(g, PhysicsMotionType.DYNAMIC, false, scene);
      const gs = new PhysicsShapeSphere(Vector3.Zero(), GRAIN_D / 2, scene);
      gs.material = { friction: 0.8, restitution: 0.05 };
      gs.filterMembershipMask = GRAIN_GROUP; gs.filterCollideMask = ~GROUP; // 互撞、撞地，不撞罐與蓋
      gb.shape = gs;
      gb.setMassProperties({ mass: POUR.grainMass });
      gb.setLinearDamping(GRAIN_DAMPING); gb.setAngularDamping(GRAIN_DAMPING);
      gb.setLinearVelocity(bottleBody.getLinearVelocity().add(up.scale(GRAIN_EXIT_SPEED)));
      bodies[`grain-${i}`] = gb;
      bottleBody.setMassProperties({ mass: MASS - poured * POUR.grainMass, centerOfMass: BOTTLE_COM });
    };
    const after = scene.onAfterPhysicsObservable.add(() => {
      if (poured >= POUR.grains) return;
      bottlePivot.computeWorldMatrix(true);
      const up = bottlePivot.getDirection(Vector3.Up());
      const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
      const capAngle = Math.abs(hingeAngle(bottleBody, capBody, capBind));
      if (tilt < POUR.tiltThreshold || capAngle < POUR.gate.minAngle) { accum = 0; return; }
      accum += POUR.ratePerSecond * FIXED_DT;
      while (accum >= 1 && poured < POUR.grains) { accum -= 1; spawnGrain(); }
    });
    observers.push(() => scene.onAfterPhysicsObservable.remove(after));
    actuators.push({
      id: "pour:bottle", kind: "pour", label: "傾倒", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) while (poured < POUR.grains) spawnGrain(); },
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
