// chemo-spill-kit — 化療潑灑處理包：開頂硬殼托盤＋開底深殼鉸鏈蓋（servo）。尺寸烘進幾何（公尺）。
// 對應 spec: viewer/models/chemo-spill-kit/spec.json
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
const CASE_W = 0.40, CASE_H = 0.13, CASE_D = 0.30;
const LID_H = 0.09;
const WALL = 0.008;
const CASE_Y = CASE_H / 2; // 0.065
const LID_Y = CASE_H + LID_H / 2; // 0.175
const HINGE_Y = CASE_H; // 0.13
const HINGE_Z = CASE_D / 2; // +z 後緣（左手系：正角掀起 -z 前緣）
const LIMITS: [number, number] = [0, 1.75];
const SERVO_FORCE = 5;

interface BodyDef {
  id: string; rootComponent: string; mass: number; friction: number; restitution: number;
  centerOfMass: [number, number, number];
  colliders: { component: string; size: [number, number, number]; offset: [number, number, number] }[];
}
const BODY_DEFS: BodyDef[] = [
  { id: "case", rootComponent: "case", mass: 1.8, friction: 0.6, restitution: 0.15, centerOfMass: [0, -0.03, 0],
    colliders: [{ component: "case", size: [CASE_W, CASE_H, CASE_D], offset: [0, 0, 0] }] },
  { id: "lid", rootComponent: "lid", mass: 0.65, friction: 0.6, restitution: 0.15, centerOfMass: [0, 0.01, 0],
    colliders: [{ component: "lid", size: [CASE_W, LID_H, CASE_D], offset: [0, 0, 0] }] },
];
const HINGE = {
  pivotA: [0, HINGE_Y - CASE_Y, HINGE_Z] as [number, number, number],
  pivotB: [0, HINGE_Y - LID_Y, HINGE_Z] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number],
  limits: LIMITS,
};

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb);
  m.specularColor = new Color3(0.15, 0.15, 0.15);
  m.specularPower = specPower;
  if (alpha < 1) { m.alpha = alpha; m.backFaceCulling = false; }
  return m;
}

/** 蓋內標籤：白底、紫框、黑字 CYTOTOXIC SPILL KIT／化療潑灑處理包。 */
function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 768, h = 448;
  const tex = new DynamicTexture("kit-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // 朝下 plane 的 v 方向與文字相反：畫布內上下翻轉
  c.fillStyle = "#f5f4ef"; c.fillRect(0, 0, w, h);
  c.strokeStyle = "#5a2a80"; c.lineWidth = 14; c.strokeRect(20, 20, w - 40, h - 40);
  c.fillStyle = "#1c1c1c";
  c.textAlign = "center";
  c.font = "bold 104px Helvetica, Arial, sans-serif"; c.fillText("CYTOTOXIC", w / 2, 160);
  c.font = "bold 96px Helvetica, Arial, sans-serif"; c.fillText("SPILL KIT", w / 2, 270);
  c.font = "60px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("化療潑灑處理包", w / 2, 380);
  tex.update(false);
  return tex;
}

/** 黃黑斜紋警示帶。 */
function makeHazardTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 64;
  const tex = new DynamicTexture("kit-hazard", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#f2c81e"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#1a1a1a";
  for (let x = -h; x < w + h; x += 64) {
    c.beginPath(); c.moveTo(x, h); c.lineTo(x + h, 0); c.lineTo(x + h + 28, 0); c.lineTo(x + 28, h); c.closePath(); c.fill();
  }
  tex.update(false);
  return tex;
}

export default function createChemoSpillKitModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("chemo-spill-kit", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  // ---- 材質（對應 spec.materials）----
  const purple = mat(scene, "purple-shell", [0.48, 0.24, 0.66], 32);
  purple.emissiveColor = new Color3(0.06, 0.02, 0.09);
  purple.backFaceCulling = false; // 開頂托盤／開底蓋殼內壁可見
  const yellow = mat(scene, "warning-yellow", [0.95, 0.78, 0.12], 28);
  const gray = mat(scene, "latch-gray", [0.55, 0.57, 0.60], 48);
  const padWhite = mat(scene, "pad-white", [0.92, 0.92, 0.90], 8);
  const gloveBlue = mat(scene, "glove-blue", [0.20, 0.45, 0.85], 16);
  const bagPurple = mat(scene, "bag-purple", [0.50, 0.25, 0.62], 24);
  const goggle = mat(scene, "goggle-clear", [0.70, 0.85, 0.90], 96, 0.6);
  const label = mat(scene, "label-print", [0.96, 0.96, 0.94], 20);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  const hazardTex = canPaint ? makeHazardTexture(scene) : null;
  if (labelTex) label.diffuseTexture = labelTex;
  if (hazardTex) yellow.diffuseTexture = hazardTex;
  const disposables: { dispose(): void }[] = [purple, yellow, gray, padWhite, gloveBlue, bagPurple, goggle, label];
  if (labelTex) disposables.push(labelTex);
  if (hazardTex) disposables.push(hazardTex);
  const matOf: Record<string, StandardMaterial> = {
    case: purple, "case-band": yellow, "pad-stack": padWhite, "glove-box": gloveBlue, "bag-roll": bagPurple,
    goggles: goggle, lid: purple, "lid-label": label, "latch-l": gray, "latch-r": gray, handle: gray, "case-handle": gray, "lid-pad-l": padWhite, "lid-pad-r": padWhite,
  };

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode): Mesh => {
    mesh.parent = parent; mesh.material = matOf[id]; meshes[id] = mesh; return mesh;
  };
  const box = (name: string, w: number, h: number, d: number): Mesh =>
    MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);

  /** 開口殼：底（或頂）＋四壁合併；openTop=true 為托盤、false 為蓋殼。 */
  const shell = (name: string, w: number, h: number, d: number, openTop: boolean): Mesh => {
    const plate = box(`${name}-plate`, w, WALL, d);
    plate.position.y = openTop ? -h / 2 + WALL / 2 : h / 2 - WALL / 2;
    const wf = box(`${name}-wall-f`, w, h, WALL); wf.position.z = -d / 2 + WALL / 2;
    const wb = box(`${name}-wall-b`, w, h, WALL); wb.position.z = d / 2 - WALL / 2;
    const wl = box(`${name}-wall-l`, WALL, h, d); wl.position.x = -w / 2 + WALL / 2;
    const wr = box(`${name}-wall-r`, WALL, h, d); wr.position.x = w / 2 - WALL / 2;
    const m = Mesh.MergeMeshes([plate, wf, wb, wl, wr], true, true) ?? plate;
    m.name = name;
    return m;
  };

  // ---- case（開頂托盤）----
  const casePivot = pivot("case", root, new Vector3(0, CASE_Y, 0));
  attach("case", shell("case", CASE_W, CASE_H, CASE_D, true), casePivot);
  attach("case-band", box("case-band", CASE_W, 0.025, 0.004), pivot("case-band", casePivot, new Vector3(0, 0.05, -0.152)));
  // 內容物（固定視覺件；蓋開才看得到）
  attach("pad-stack", box("pad-stack", 0.20, 0.07, 0.12), pivot("pad-stack", casePivot, new Vector3(-0.08, -0.02, 0.02)));
  attach("glove-box", box("glove-box", 0.12, 0.09, 0.09), pivot("glove-box", casePivot, new Vector3(0.10, -0.01, -0.06)));
  const rollPivot = pivot("bag-roll", casePivot, new Vector3(0.10, -0.02, 0.09));
  rollPivot.rotation.z = Math.PI / 2; // 橫躺沿 x
  attach("bag-roll", MeshBuilder.CreateCylinder("bag-roll", { height: 0.18, diameter: 0.05, tessellation: 24 }, scene), rollPivot);
  attach("goggles", box("goggles", 0.14, 0.03, 0.05), pivot("goggles", casePivot, new Vector3(-0.08, 0.02, 0)));

  // ---- lid（開底深殼）----
  const lidPivot = pivot("lid", root, new Vector3(0, LID_Y, 0));
  attach("lid", shell("lid", CASE_W, LID_H, CASE_D, false), lidPivot);
  // 標籤：朝下的 plane（rotation.x = -π/2 讓法線指 -y、文字頂朝 -z；蓋掀開後文字正立面向前方）
  const labelPlane = MeshBuilder.CreatePlane("lid-label", { width: 0.24, height: 0.14 }, scene);
  labelPlane.rotation.x = -Math.PI / 2;
  attach("lid-label", labelPlane, pivot("lid-label", lidPivot, new Vector3(0, LID_H / 2 - WALL - 0.001, -0.01)));
  attach("lid-pad-l", box("lid-pad-l", 0.09, 0.012, 0.20), pivot("lid-pad-l", lidPivot, new Vector3(-0.135, LID_H / 2 - WALL - 0.006, 0)));
  attach("lid-pad-r", box("lid-pad-r", 0.09, 0.012, 0.20), pivot("lid-pad-r", lidPivot, new Vector3(0.135, LID_H / 2 - WALL - 0.006, 0)));
  attach("latch-l", box("latch-l", 0.04, 0.05, 0.012), pivot("latch-l", lidPivot, new Vector3(-0.12, -0.03, -0.153)));
  attach("latch-r", box("latch-r", 0.04, 0.05, 0.012), pivot("latch-r", lidPivot, new Vector3(0.12, -0.03, -0.153)));
  // 提把：橫樑＋兩立柱合併
  const beam = box("handle-beam", 0.14, 0.015, 0.03); beam.position.y = 0.015;
  const postL = box("handle-post-l", 0.015, 0.045, 0.03); postL.position.x = -0.0625;
  const postR = box("handle-post-r", 0.015, 0.045, 0.03); postR.position.x = 0.0625;
  const handle = Mesh.MergeMeshes([beam, postL, postR], true, true) ?? beam;
  handle.name = "handle";
  attach("handle", handle, pivot("handle", lidPivot, new Vector3(0, LID_H / 2 + 0.0225, -0.09)));
  attach("case-handle", box("case-handle", 0.14, 0.03, 0.02), pivot("case-handle", casePivot, new Vector3(0, 0, -0.16)));

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const def of BODY_DEFS) {
      const rootPivot = nodes[def.rootComponent];
      rootPivot.computeWorldMatrix(true);
      const body = new PhysicsBody(rootPivot, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      for (const col of def.colliders) {
        const node = nodes[col.component];
        node.computeWorldMatrix(true);
        const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), Vector3.FromArray(col.size), scene);
        shape.material = { friction: def.friction, restitution: def.restitution };
        const rel = node.absolutePosition.subtract(rootPivot.absolutePosition).add(Vector3.FromArray(col.offset));
        container.addChild(shape, rel, Quaternion.Identity());
      }
      body.shape = container;
      body.setMassProperties({ mass: def.mass, centerOfMass: Vector3.FromArray(def.centerOfMass) });
      bodies[def.id] = body;
    }
    const hinge = createHinge(scene, bodies["case"], bodies["lid"], HINGE);
    constraints.push(hinge);
    actuators.push(makeHingeServo(hinge, "lid", LIMITS[0], LIMITS[1], SERVO_FORCE, "蓋子"));
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
