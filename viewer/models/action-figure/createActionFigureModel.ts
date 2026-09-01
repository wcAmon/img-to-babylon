// action-figure — 玩具公仔 ragdoll：10 剛體 + 9 個限位關節（脖/肩/肘/髖/膝）。
// 尺寸全部烘進幾何參數（公尺），不用 scaling 承載尺寸。
// 對應 spec: viewer/models/action-figure/spec.json
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeCapsule,
  PhysicsShapeContainer,
  PhysicsShapeSphere,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { BuiltModel, ModelOptions } from "../../src/types";

// ---- spec 尺寸（單位：公尺；transform.position = 視覺中心）----
const TORSO_W = 0.036;
const TORSO_H = 0.03;
const TORSO_D = 0.022;
const TORSO_Y = 0.057;

const HEAD_DIA = 0.03;
const HEAD_Y = 0.088;
const HAIR_DX = 0.032;
const HAIR_DY = 0.014;
const HAIR_Y = 0.097;
const FACE_W = 0.02;
const FACE_H = 0.012;
const FACE_Z = 0.0145;
const EAR_DIA = 0.006;
const EAR_X = 0.0145;

const ARM_DIA = 0.013;
const UPPER_ARM_H = 0.02;
const FOREARM_H = 0.018;
const ARM_X = 0.0255;
const UPPER_ARM_Y = 0.058;
const FOREARM_Y = 0.038;
const HAND_DIA = 0.014;
const HAND_Y = 0.027;

const THIGH_DIA = 0.014;
const THIGH_H = 0.016;
const LEG_X = 0.009;
const THIGH_Y = 0.033;
const CALF_DIA = 0.015;
const CALF_H = 0.024;
const CALF_Y = 0.012;
const BOOT_W = 0.016;
const BOOT_H = 0.01;
const BOOT_D = 0.024;
const BOOT_Y = 0.005;
const BOOT_Z = 0.004;

const TESS = 24;

// ---- 物理（鏡射 spec.physics，權威是 spec.constraints）----
type Vec = [number, number, number];
type Angular = Partial<Record<"x" | "y" | "z", [number, number] | "free" | "locked">>;

interface ShapeDef {
  kind: "box" | "sphere" | "capsule";
  size: Vec; // box: w/h/d；sphere: 直徑；capsule: 直徑/總高/直徑（沿局部 Y）
}
interface BodyDef {
  id: string;
  shape: ShapeDef;
  mass: number;
  friction: number;
  restitution: number;
}
interface ConstraintDef {
  type: "hinge" | "joint";
  bodyA: string;
  bodyB: string;
  pivotA: Vec;
  pivotB: Vec;
  axis: Vec;
  limits?: [number, number]; // hinge
  angular?: Angular; // joint
}

const FRICTION = 0.6;
const RESTITUTION = 0.2;

function bodyDef(id: string, shape: ShapeDef, mass: number): BodyDef {
  return { id, shape, mass, friction: FRICTION, restitution: RESTITUTION };
}

const BODY_DEFS: BodyDef[] = [
  bodyDef("torso", { kind: "box", size: [TORSO_W, TORSO_H, TORSO_D] }, 0.04),
  bodyDef("head", { kind: "sphere", size: [HEAD_DIA, HEAD_DIA, HEAD_DIA] }, 0.018),
];
const CONSTRAINT_DEFS: ConstraintDef[] = [
  {
    type: "joint", bodyA: "torso", bodyB: "head",
    pivotA: [0, 0.015, 0], pivotB: [0, -0.016, 0], axis: [1, 0, 0],
    angular: { x: [-0.6, 0.6], y: [-0.6, 0.6], z: [-0.6, 0.6] },
  },
];
for (const [side, sx] of [["l", 1], ["r", -1]] as const) {
  BODY_DEFS.push(
    bodyDef(`upper-arm-${side}`,
      { kind: "capsule", size: [ARM_DIA, UPPER_ARM_H, ARM_DIA] }, 0.003),
    bodyDef(`forearm-${side}`,
      { kind: "capsule", size: [ARM_DIA, FOREARM_H, ARM_DIA] }, 0.003),
    bodyDef(`thigh-${side}`,
      { kind: "capsule", size: [THIGH_DIA, THIGH_H, THIGH_DIA] }, 0.0025),
    bodyDef(`calf-${side}`,
      { kind: "capsule", size: [CALF_DIA, CALF_H, CALF_DIA] }, 0.005),
  );
  CONSTRAINT_DEFS.push(
    {
      type: "joint", bodyA: "torso", bodyB: `upper-arm-${side}`,
      pivotA: [sx * ARM_X, 0.011, 0], pivotB: [0, 0.01, 0], axis: [1, 0, 0],
      angular: {
        x: [-1.6, 1.6],
        y: side === "l" ? [-0.3, 1.6] : [-1.6, 0.3],
        z: [-0.8, 0.8],
      },
    },
    {
      type: "hinge", bodyA: `upper-arm-${side}`, bodyB: `forearm-${side}`,
      pivotA: [0, -0.0105, 0], pivotB: [0, 0.0095, 0], axis: [1, 0, 0],
      limits: [-2.44, 0],
    },
    {
      type: "joint", bodyA: "torso", bodyB: `thigh-${side}`,
      pivotA: [sx * LEG_X, -0.015, 0], pivotB: [0, 0.009, 0], axis: [1, 0, 0],
      angular: {
        x: [-2.0, 0.5],
        y: side === "l" ? [-0.2, 0.8] : [-0.8, 0.2],
        z: [-0.5, 0.5],
      },
    },
    {
      type: "hinge", bodyA: `thigh-${side}`, bodyB: `calf-${side}`,
      pivotA: [0, -0.0085, 0], pivotB: [0, 0.0125, 0], axis: [1, 0, 0],
      limits: [0, 2.44],
    },
  );
}

/** grimoire/physics.md canonical perp 規則（與 physics_test 的 jointFrame 同一條）。 */
function canonicalPerp(axis: Vector3): Vector3 {
  const up = Math.abs(Vector3.Dot(axis, Vector3.Up())) > 0.99
    ? new Vector3(1, 0, 0) : Vector3.Up();
  return Vector3.Cross(axis, up).normalize();
}

/** 玩具公仔臉：眉、眼、微笑（DynamicTexture）。headless 無 canvas 時回傳 null。 */
function paintFace(scene: Scene): DynamicTexture | null {
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  if (!canPaint) return null;
  const tex = new DynamicTexture("face-tex", { width: 256, height: 160 }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = "#f2c29e"; // 膚色底
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = "#3a2416"; // 眉毛
  ctx.fillRect(34, 22, 74, 16);
  ctx.fillRect(148, 22, 74, 16);
  ctx.fillStyle = "#1c1c1c"; // 眼睛
  ctx.beginPath();
  ctx.arc(72, 76, 24, 0, Math.PI * 2);
  ctx.arc(184, 76, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff"; // 眼神光
  ctx.beginPath();
  ctx.arc(81, 67, 8, 0, Math.PI * 2);
  ctx.arc(193, 67, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b0543a"; // 微笑
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(128, 112, 34, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  tex.update();
  return tex;
}

export default function createActionFigureModel(
  scene: Scene,
  opts: ModelOptions = {},
): BuiltModel {
  const root = new TransformNode("action-figure", scene);

  // ---- 材質（對應 spec.materials）----
  const blue = new StandardMaterial("plastic-blue", scene);
  blue.diffuseColor = new Color3(0.12, 0.38, 0.85);
  blue.specularColor = new Color3(0.5, 0.5, 0.55);
  blue.specularPower = 96; // 亮面射出塑膠

  const red = new StandardMaterial("plastic-red", scene);
  red.diffuseColor = new Color3(0.78, 0.09, 0.07);
  red.specularColor = new Color3(0.5, 0.42, 0.42);
  red.specularPower = 96;

  const flesh = new StandardMaterial("flesh", scene);
  flesh.diffuseColor = new Color3(0.95, 0.76, 0.62);
  flesh.specularColor = new Color3(0.12, 0.1, 0.09);
  flesh.specularPower = 24; // roughness 0.5

  const hairMat = new StandardMaterial("hair-brown", scene);
  hairMat.diffuseColor = new Color3(0.38, 0.22, 0.11);
  hairMat.specularColor = new Color3(0.22, 0.16, 0.1);
  hairMat.specularPower = 32; // roughness 0.4

  const faceMat = new StandardMaterial("face-print", scene);
  const faceTex = paintFace(scene);
  if (faceTex) {
    faceMat.diffuseTexture = faceTex;
  } else {
    faceMat.diffuseColor = new Color3(0.95, 0.76, 0.62);
  }
  faceMat.specularColor = new Color3(0.08, 0.08, 0.08);

  const matOf: Record<string, StandardMaterial> = {
    torso: blue,
    head: flesh,
    hair: hairMat,
    face: faceMat,
    "ear-l": flesh,
    "ear-r": flesh,
  };
  const disposables: { dispose(): void }[] = [blue, red, flesh, hairMat, faceMat];
  if (faceTex) disposables.push(faceTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};

  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene);
    p.parent = parent;
    p.position = pos;
    nodes[id] = p;
    return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode): Mesh => {
    mesh.parent = parent;
    mesh.material = matOf[id] ?? red;
    meshes[id] = mesh;
    return mesh;
  };

  // ---- 軀幹（剛體 root）：胸段略窄 + 腹段全寬，收出玩具式腰身 ----
  const torsoPivot = pivot("torso", root, new Vector3(0, TORSO_Y, 0));
  const chest = MeshBuilder.CreateBox(
    "torso-chest", { width: TORSO_W - 0.004, height: 0.012, depth: TORSO_D - 0.002 }, scene,
  );
  chest.position.y = TORSO_H / 2 - 0.006;
  const belly = MeshBuilder.CreateBox(
    "torso-belly", { width: TORSO_W, height: 0.02, depth: TORSO_D }, scene,
  );
  belly.position.y = -TORSO_H / 2 + 0.01;
  const torsoMesh = Mesh.MergeMeshes([chest, belly], true, true) ?? belly;
  torsoMesh.name = "torso";
  attach("torso", torsoMesh, torsoPivot);

  // ---- 頭（剛體 root）＋髮/臉/耳（視覺子件）----
  const headPivot = pivot("head", root, new Vector3(0, HEAD_Y, 0));
  attach("head", MeshBuilder.CreateSphere(
    "head", { diameter: HEAD_DIA, segments: TESS }, scene,
  ), headPivot);

  const hairPivot = pivot("hair", headPivot, new Vector3(0, HAIR_Y - HEAD_Y, 0));
  const hairCap = MeshBuilder.CreateSphere(
    "hair-cap",
    { diameterX: HAIR_DX, diameterY: HAIR_DY, diameterZ: HAIR_DX, segments: TESS },
    scene,
  );
  const hairFringe = MeshBuilder.CreateSphere(
    "hair-fringe",
    { diameterX: 0.026, diameterY: 0.008, diameterZ: 0.012, segments: TESS },
    scene,
  );
  hairFringe.position.set(0, -0.003, 0.0105); // 相對 hair pivot：前額
  const hairMesh = Mesh.MergeMeshes([hairCap, hairFringe], true, true) ?? hairCap;
  hairMesh.name = "hair";
  attach("hair", hairMesh, hairPivot);

  const facePivot = pivot("face", headPivot, new Vector3(0, 0, FACE_Z));
  attach("face", MeshBuilder.CreateBox(
    "face", { width: FACE_W, height: FACE_H, depth: 0.002 }, scene,
  ), facePivot);

  for (const [id, sx] of [["ear-l", 1], ["ear-r", -1]] as const) {
    const earPivot = pivot(id, headPivot, new Vector3(sx * EAR_X, 0, 0));
    attach(id, MeshBuilder.CreateSphere(
      id, { diameter: EAR_DIA, segments: 12 }, scene,
    ), earPivot);
  }

  // ---- 四肢（各自為剛體 root；手/靴是視覺子件）----
  for (const [side, sx] of [["l", 1], ["r", -1]] as const) {
    const upperArmPivot = pivot(
      `upper-arm-${side}`, root, new Vector3(sx * ARM_X, UPPER_ARM_Y, 0),
    );
    attach(`upper-arm-${side}`, MeshBuilder.CreateCapsule(
      `upper-arm-${side}`,
      { radius: ARM_DIA / 2, height: UPPER_ARM_H, tessellation: TESS, subdivisions: 2 },
      scene,
    ), upperArmPivot);

    const forearmPivot = pivot(
      `forearm-${side}`, root, new Vector3(sx * ARM_X, FOREARM_Y, 0),
    );
    attach(`forearm-${side}`, MeshBuilder.CreateCapsule(
      `forearm-${side}`,
      { radius: ARM_DIA / 2, height: FOREARM_H, tessellation: TESS, subdivisions: 2 },
      scene,
    ), forearmPivot);

    const handPivot = pivot(
      `hand-${side}`, forearmPivot, new Vector3(0, HAND_Y - FOREARM_Y, 0),
    );
    const handMesh = MeshBuilder.CreateTorus(
      `hand-${side}`,
      { diameter: HAND_DIA - 0.004, thickness: 0.005, tessellation: 20 },
      scene,
    );
    handMesh.rotation.x = Math.PI / 2; // 洞朝前（+Z）——玩具 C 型抓握手
    attach(`hand-${side}`, handMesh, handPivot);

    const thighPivot = pivot(
      `thigh-${side}`, root, new Vector3(sx * LEG_X, THIGH_Y, 0),
    );
    attach(`thigh-${side}`, MeshBuilder.CreateCapsule(
      `thigh-${side}`,
      { radius: THIGH_DIA / 2, height: THIGH_H, tessellation: TESS, subdivisions: 2 },
      scene,
    ), thighPivot);

    const calfPivot = pivot(
      `calf-${side}`, root, new Vector3(sx * LEG_X, CALF_Y, 0),
    );
    attach(`calf-${side}`, MeshBuilder.CreateCapsule(
      `calf-${side}`,
      { radius: CALF_DIA / 2, height: CALF_H, tessellation: TESS, subdivisions: 2 },
      scene,
    ), calfPivot);

    const bootPivot = pivot(
      `boot-${side}`, calfPivot, new Vector3(0, BOOT_Y - CALF_Y, BOOT_Z),
    );
    attach(`boot-${side}`, MeshBuilder.CreateBox(
      `boot-${side}`, { width: BOOT_W, height: BOOT_H, depth: BOOT_D }, scene,
    ), bootPivot);
  }

  // ---- 物理：每個 spec body 一個 PhysicsBody；關節 6DoF 逐軸限位 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const def of BODY_DEFS) {
      const p = nodes[def.id];
      p.computeWorldMatrix(true);
      const body = new PhysicsBody(p, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      const [w, h] = def.shape.size;
      let shape;
      if (def.shape.kind === "box") {
        shape = new PhysicsShapeBox(
          Vector3.Zero(), Quaternion.Identity(),
          Vector3.FromArray(def.shape.size), scene,
        );
      } else if (def.shape.kind === "sphere") {
        shape = new PhysicsShapeSphere(Vector3.Zero(), w / 2, scene);
      } else {
        const half = h / 2 - w / 2; // capsule 圓柱段半長（總高含端球）
        shape = new PhysicsShapeCapsule(
          new Vector3(0, -half, 0), new Vector3(0, half, 0), w / 2, scene,
        );
      }
      shape.material = { friction: def.friction, restitution: def.restitution };
      container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({ mass: def.mass });
      bodies[def.id] = body;
    }

    const ANG = {
      x: PhysicsConstraintAxis.ANGULAR_X,
      y: PhysicsConstraintAxis.ANGULAR_Y,
      z: PhysicsConstraintAxis.ANGULAR_Z,
    } as const;
    for (const def of CONSTRAINT_DEFS) {
      const axis = Vector3.FromArray(def.axis);
      const perp = canonicalPerp(axis);
      const axes = [
        { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
      ];
      if (def.type === "hinge") {
        axes.push(
          { axis: ANG.y, minLimit: 0, maxLimit: 0 },
          { axis: ANG.z, minLimit: 0, maxLimit: 0 },
          { axis: ANG.x, minLimit: def.limits![0], maxLimit: def.limits![1] },
        );
      } else {
        for (const k of ["x", "y", "z"] as const) {
          const v = def.angular?.[k] ?? "locked";
          if (v === "free") continue;
          if (v === "locked") axes.push({ axis: ANG[k], minLimit: 0, maxLimit: 0 });
          else axes.push({ axis: ANG[k], minLimit: v[0], maxLimit: v[1] });
        }
      }
      const joint = new Physics6DoFConstraint(
        {
          pivotA: Vector3.FromArray(def.pivotA),
          pivotB: Vector3.FromArray(def.pivotB),
          axisA: axis,
          axisB: axis,
          perpAxisA: perp,
          perpAxisB: perp,
        },
        axes,
        scene,
      );
      bodies[def.bodyA].addConstraint(bodies[def.bodyB], joint);
      joint.isCollisionsEnabled = false; // 相鄰肢段靠限位對位，不互相碰撞
      constraints.push(joint);
    }
  }

  const built: BuiltModel = {
    root,
    nodes,
    meshes,
    bodies,
    constraints,
    dispose(): void {
      constraints.forEach((c) => c.dispose());
      Object.values(bodies).forEach((b) => b.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = {
    sculptRuntime: {
      nodes: built.nodes,
      meshes: built.meshes,
      bodies: built.bodies,
      constraints: built.constraints,
    },
  };
  return built;
}
