// absorbent-pad — 對摺吸附墊：兩半沿 +z 邊 hinge servo（0 = 對摺、π = 攤開）。
// 對應 spec: viewer/models/absorbent-pad/spec.json
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";
import { createHinge, makeHingeServo } from "../../src/hinge";

// ---- spec 尺寸 ----
const HALF_W = 0.20, HALF_T = 0.015, HALF_D = 0.25; // 參考圖摺疊厚約 3 cm
const FACE_W = 0.18, FACE_D = 0.23; // 白色吸附面（留藍色邊框）
const A_Y = HALF_T / 2, B_Y = HALF_T * 1.5; // 0.0075 / 0.0225
const LIMITS: [number, number] = [0, 3.1];
const SERVO_FORCE = 0.5;
const MASS = 0.05, FRICTION = 0.8, RESTITUTION = 0.05;
const GROUP = 2;
const SEED = 20260905;
const HINGE = {
  pivotA: [0, HALF_T / 2, HALF_D / 2] as [number, number, number],
  pivotB: [0, -HALF_T / 2, HALF_D / 2] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: LIMITS,
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

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.1, 0.1, 0.1); m.specularPower = specPower;
  return m;
}

/** 壓紋：菱形格線＋seed 微擾的細小凹點；圖案對稱，不受 plane 方向翻轉影響。 */
function makeQuiltTexture(scene: Scene, rng: () => number): DynamicTexture {
  const w = 512, h = 640;
  const tex = new DynamicTexture("pad-quilt", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#f6f6f1"; c.fillRect(0, 0, w, h);
  c.strokeStyle = "#dfdfd8"; c.lineWidth = 3;
  const step = 96;
  for (let k = -h; k < w + h; k += step) {
    c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke();
    c.beginPath(); c.moveTo(k, h); c.lineTo(k + h, 0); c.stroke();
  }
  c.fillStyle = "#e6e6df";
  for (let i = 0; i < 260; i++) {
    c.beginPath(); c.arc(rng() * w, rng() * h, 1.5 + rng() * 1.5, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = "#d2d2ca"; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12); // 壓邊
  tex.update(false);
  return tex;
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 320;
  const tex = new DynamicTexture("pad-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // 朝上 plane、自 −z 正面觀看：垂直翻轉才正讀（iv-bag 的水平翻轉對應自 +x 側觀看）
  c.fillStyle = "#fbfbf8"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#1c3f6e"; c.textAlign = "center";
  c.font = "bold 62px Helvetica, Arial, sans-serif"; c.fillText("ABSORBENT PAD", w / 2, 110);
  c.font = "50px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("化療吸附墊  40×50 cm", w / 2, 200);
  c.font = "30px Helvetica, Arial, sans-serif"; c.fillText("white face down on spill · 吸附面朝下覆蓋", w / 2, 265);
  tex.update(false);
  return tex;
}

export default function createAbsorbentPadModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("absorbent-pad", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  const blue = mat(scene, "backing-blue", [0.10, 0.42, 0.85], 48);
  blue.specularColor = new Color3(0.35, 0.35, 0.35); // 塑膠膜微亮
  blue.emissiveColor = new Color3(0.02, 0.08, 0.18);
  const white = mat(scene, "absorbent-white", [0.97, 0.97, 0.95], 4);
  white.emissiveColor = new Color3(0.15, 0.15, 0.14);
  const labelMat = mat(scene, "label-white", [0.98, 0.98, 0.97], 16);
  const quilt = canPaint ? makeQuiltTexture(scene, rng) : null;
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (quilt) white.diffuseTexture = quilt;
  if (labelTex) labelMat.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [blue, white, labelMat];
  if (quilt) disposables.push(quilt);
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- half-a（下）：白面朝上 ----
  const aPivot = pivot("half-a", root, new Vector3(0, A_Y, 0));
  attach("half-a", MeshBuilder.CreateBox("half-a", { width: HALF_W, height: HALF_T, depth: HALF_D }, scene), aPivot, blue);
  // 開口邊露出的白色吸附層（夾在兩半之間的薄片，摺疊時從側面看是白線）
  // 比藍盒外凸 2 mm（−z 開口邊 4 mm、+z 摺邊不凸）才看得到
  attach("seam-white", MeshBuilder.CreateBox("seam-white", { width: HALF_W + 0.004, height: 0.003, depth: HALF_D + 0.002 }, scene),
    pivot("seam-white", aPivot, new Vector3(0, HALF_T / 2, -0.002)), white);
  const faceA = MeshBuilder.CreatePlane("face-a", { width: FACE_W, height: FACE_D }, scene);
  faceA.rotation.x = Math.PI / 2; // 朝上
  attach("face-a", faceA, pivot("face-a", aPivot, new Vector3(0, HALF_T / 2 + 0.0005, 0)), white);

  // ---- half-b（上）：白面朝下（攤開後翻成朝上）----
  const bPivot = pivot("half-b", root, new Vector3(0, B_Y, 0));
  attach("half-b", MeshBuilder.CreateBox("half-b", { width: HALF_W, height: HALF_T, depth: HALF_D }, scene), bPivot, blue);
  const faceB = MeshBuilder.CreatePlane("face-b", { width: FACE_W, height: FACE_D }, scene);
  faceB.rotation.x = -Math.PI / 2; // 朝下
  attach("face-b", faceB, pivot("face-b", bPivot, new Vector3(0, -(HALF_T / 2 + 0.0005), 0)), white);
  const label = MeshBuilder.CreatePlane("pad-label", { width: 0.10, height: 0.06 }, scene);
  label.rotation.x = Math.PI / 2;
  attach("pad-label", label, pivot("pad-label", bPivot, new Vector3(0, HALF_T / 2 + 0.0005, -0.02)), labelMat);

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const [id, node] of [["half-a", aPivot], ["half-b", bPivot]] as [string, TransformNode][]) {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(HALF_W, HALF_T, HALF_D), scene);
      shape.material = { friction: FRICTION, restitution: RESTITUTION };
      shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~GROUP; // 摺疊時面貼面不互撞
      container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({ mass: MASS, centerOfMass: Vector3.Zero() });
      bodies[id] = body;
    }
    const hinge = createHinge(scene, bodies["half-a"], bodies["half-b"], HINGE);
    constraints.push(hinge);
    actuators.push(makeHingeServo(hinge, "half-b", LIMITS[0], LIMITS[1], SERVO_FORCE, "上半片"));
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints, actuators,
    dispose(): void {
      constraints.forEach((c) => c.dispose());
      Object.values(bodies).forEach((b) => b.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
