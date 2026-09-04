// cytotoxic-waste-bin — 細胞毒性廢棄物腳踏桶：錐形開頂桶身（lathe 殼）＋圓頂蓋 hinge servo＋踏板 hinge servo。
// 踏板與蓋不做物理連桿（設計文件 §3.3）；playground 同時命令兩支 servo。
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
  PhysicsShapeCylinder,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";
import { createHinge, makeHingeServo } from "../../src/hinge";

const BIN_R_TOP = 0.15, BIN_R_BOT = 0.13, BIN_H = 0.45, WALL = 0.006;
const LID_R = 0.155, LID_H = 0.06;
const PEDAL_W = 0.09, PEDAL_H = 0.015, PEDAL_D = 0.08;
const BIN_Y = BIN_H / 2; // 0.225
const LID_Y = BIN_H + LID_H / 2; // 0.48
const LID_HINGE_Y = BIN_H, LID_HINGE_Z = LID_R; // +z 後緣
// 踏板樞軸在桶身 cylinder collider（r 0.15 全高）邊緣外：collider 重疊時 hinge 的 isCollisionsEnabled=false 擋不住
const PEDAL_HINGE_Z = -BIN_R_TOP; // -0.15
const PEDAL_Y = 0.03, PEDAL_Z = PEDAL_HINGE_Z - PEDAL_D / 2; // -0.19
const LID_LIMITS: [number, number] = [0, 1.5];
const PEDAL_LIMITS: [number, number] = [-0.3, 0];
const SERVO_FORCE = 3;
const GROUP = 2; // 整桶零件同群組、不互撞（grimoire/physics.md 碰撞過濾）
const TESS = 48;

interface BodyDef {
  id: string; rootComponent: string; mass: number; friction: number; restitution: number;
  centerOfMass: [number, number, number];
  colliders: { component: string; kind: "box" | "cylinder"; size: [number, number, number]; offset: [number, number, number] }[];
}
const BODY_DEFS: BodyDef[] = [
  { id: "bin", rootComponent: "bin", mass: 3.0, friction: 0.6, restitution: 0.15, centerOfMass: [0, -0.15, 0],
    colliders: [{ component: "bin", kind: "cylinder", size: [0.30, BIN_H, 0.30], offset: [0, 0, 0] }] },
  { id: "lid", rootComponent: "lid", mass: 0.35, friction: 0.6, restitution: 0.15, centerOfMass: [0, 0, 0],
    colliders: [{ component: "lid", kind: "cylinder", size: [0.31, LID_H, 0.31], offset: [0, 0, 0] }] },
  { id: "pedal", rootComponent: "pedal", mass: 0.15, friction: 0.6, restitution: 0.15, centerOfMass: [0, 0, 0],
    colliders: [{ component: "pedal", kind: "box", size: [PEDAL_W, PEDAL_H, PEDAL_D], offset: [0, 0, 0] }] },
];
const LID_HINGE = {
  pivotA: [0, LID_HINGE_Y - BIN_Y, LID_HINGE_Z] as [number, number, number],
  pivotB: [0, LID_HINGE_Y - LID_Y, LID_HINGE_Z] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: LID_LIMITS,
};
const PEDAL_HINGE = {
  pivotA: [0, PEDAL_Y - BIN_Y, PEDAL_HINGE_Z] as [number, number, number],
  pivotB: [0, 0, PEDAL_D / 2] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: PEDAL_LIMITS,
};

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.15, 0.15, 0.15); m.specularPower = specPower;
  if (alpha < 1) { m.alpha = alpha; m.backFaceCulling = false; }
  return m;
}

/** 桶身殼：外壁上錐→下錐→底→內壁回到口緣（lathe profile，x 半徑、y 相對 bin pivot）。 */
function binProfile(): Vector3[] {
  const b = -BIN_H / 2, t = BIN_H / 2;
  return [
    new Vector3(0, b, 0),
    new Vector3(BIN_R_BOT, b, 0),
    new Vector3(BIN_R_TOP, t - 0.01, 0),
    new Vector3(BIN_R_TOP + 0.004, t, 0), // 口緣外翻
    new Vector3(BIN_R_TOP - WALL, t, 0),
    new Vector3(BIN_R_BOT - WALL, b + WALL, 0),
    new Vector3(0, b + WALL, 0),
  ];
}

/** 圓頂蓋：邊緣裙＋淺弧頂（y 相對 lid pivot）。 */
function lidProfile(): Vector3[] {
  const b = -LID_H / 2;
  const pts: Vector3[] = [new Vector3(0, b, 0), new Vector3(LID_R, b, 0), new Vector3(LID_R, b + 0.02, 0)];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new Vector3(LID_R * Math.cos(a), b + 0.02 + (LID_H - 0.02) * Math.sin(a), 0));
  }
  return pts;
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 352;
  const tex = new DynamicTexture("bin-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // plane 上的 DynamicTexture v 方向相反：畫布內上下翻轉（同 spill-kit 蓋標籤）
  c.fillStyle = "#f5f4ef"; c.fillRect(0, 0, w, h);
  c.strokeStyle = "#5a2a80"; c.lineWidth = 10; c.strokeRect(12, 12, w - 24, h - 24);
  c.fillStyle = "#1c1c1c"; c.textAlign = "center";
  c.font = "bold 78px Helvetica, Arial, sans-serif"; c.fillText("CYTOTOXIC", w / 2, 120);
  c.font = "bold 70px Helvetica, Arial, sans-serif"; c.fillText("WASTE", w / 2, 205);
  c.font = "48px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("細胞毒性廢棄物", w / 2, 290);
  tex.update(false);
  return tex;
}

export default function createCytotoxicWasteBinModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("cytotoxic-waste-bin", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  const purple = mat(scene, "bin-purple", [0.50, 0.26, 0.68], 32);
  purple.emissiveColor = new Color3(0.06, 0.02, 0.09);
  purple.backFaceCulling = false; // lathe 殼內壁可見
  const yellow = mat(scene, "lid-yellow", [0.95, 0.80, 0.15], 40);
  yellow.backFaceCulling = false;
  const liner = mat(scene, "liner-purple", [0.50, 0.28, 0.62], 12, 0.9);
  const label = mat(scene, "label-print", [0.96, 0.96, 0.94], 20);
  const black = mat(scene, "pedal-black", [0.12, 0.12, 0.13], 24);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) label.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [purple, yellow, liner, label, black];
  if (labelTex) disposables.push(labelTex);
  const matOf: Record<string, StandardMaterial> = {
    bin: purple, "bag-liner": liner, "bin-label": label, lid: yellow, "lid-handle": yellow, "lid-knob": black,
    pedal: black, "pedal-arm": black,
  };

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode): Mesh => {
    mesh.parent = parent; mesh.material = matOf[id]; meshes[id] = mesh; return mesh;
  };

  // ---- bin ----
  const binPivot = pivot("bin", root, new Vector3(0, BIN_Y, 0));
  attach("bin", MeshBuilder.CreateLathe("bin", { shape: binProfile(), tessellation: TESS, closed: true }, scene), binPivot);
  attach("bag-liner", MeshBuilder.CreateCylinder("bag-liner", { height: 0.40, diameterTop: 0.27, diameterBottom: 0.24, tessellation: TESS }, scene),
    pivot("bag-liner", binPivot, new Vector3(0, -0.02, 0)));
  // 標籤：無旋轉 plane，正面朝 -z（box 前面 UV 會把文字上下顛倒）
  attach("bin-label", MeshBuilder.CreatePlane("bin-label", { width: 0.16, height: 0.11 }, scene),
    pivot("bin-label", binPivot, new Vector3(0, 0.04, -0.147)));

  // ---- lid ----
  const lidPivot = pivot("lid", root, new Vector3(0, LID_Y, 0));
  attach("lid", MeshBuilder.CreateLathe("lid", { shape: lidProfile(), tessellation: TESS, closed: true }, scene), lidPivot);
  attach("lid-handle", MeshBuilder.CreateBox("lid-handle", { width: 0.08, height: 0.02, depth: 0.03 }, scene),
    pivot("lid-handle", lidPivot, new Vector3(0, 0.04, 0)));
  attach("lid-knob", MeshBuilder.CreateBox("lid-knob", { width: 0.06, height: 0.02, depth: 0.03 }, scene),
    pivot("lid-knob", lidPivot, new Vector3(0, -0.02, LID_HINGE_Z)));

  // ---- pedal ----
  const pedalPivot = pivot("pedal", root, new Vector3(0, PEDAL_Y, PEDAL_Z));
  attach("pedal", MeshBuilder.CreateBox("pedal", { width: PEDAL_W, height: PEDAL_H, depth: PEDAL_D }, scene), pedalPivot);
  attach("pedal-arm", MeshBuilder.CreateBox("pedal-arm", { width: 0.03, height: 0.015, depth: 0.03 }, scene),
    pivot("pedal-arm", pedalPivot, new Vector3(0, 0, 0.05)));

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
        const shape = col.kind === "box"
          ? new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), Vector3.FromArray(col.size), scene)
          : new PhysicsShapeCylinder(new Vector3(0, -col.size[1] / 2, 0), new Vector3(0, col.size[1] / 2, 0), col.size[0] / 2, scene);
        shape.material = { friction: def.friction, restitution: def.restitution };
        shape.filterMembershipMask = GROUP;
        shape.filterCollideMask = ~GROUP;
        const rel = node.absolutePosition.subtract(rootPivot.absolutePosition).add(Vector3.FromArray(col.offset));
        container.addChild(shape, rel, Quaternion.Identity());
      }
      body.shape = container;
      body.setMassProperties({ mass: def.mass, centerOfMass: Vector3.FromArray(def.centerOfMass) });
      bodies[def.id] = body;
    }
    const lidHinge = createHinge(scene, bodies["bin"], bodies["lid"], LID_HINGE);
    const pedalHinge = createHinge(scene, bodies["bin"], bodies["pedal"], PEDAL_HINGE);
    constraints.push(lidHinge, pedalHinge);
    actuators.push(makeHingeServo(lidHinge, "lid", LID_LIMITS[0], LID_LIMITS[1], SERVO_FORCE, "蓋子"));
    const pedalServo = makeHingeServo(pedalHinge, "pedal", PEDAL_LIMITS[0], PEDAL_LIMITS[1], SERVO_FORCE, "踏板");
    actuators.push(pedalServo);
    // 出廠即回位（steer 慣例的例外）：真踏板桶有回位彈簧；否則 0.08 m 小踏板在重力下 3 步就垂到下限、尖端觸地，「踩」看不出變化
    pedalServo.set(0);
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
