// pill-bottle — 揀蓋式藥罐。尺寸全部烘進幾何參數（公尺），不用 scaling 承載尺寸。
// 對應 spec: viewer/models/pill-bottle/spec.json
import {
  Color3,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsConstraintAxis,
  PhysicsMotionType,
  PhysicsShapeContainer,
  PhysicsShapeCylinder,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { BuiltModel, ModelOptions } from "../../src/types";

// ---- spec 尺寸（單位：公尺）----
const BODY_DIA = 0.052;
const BODY_H = 0.054;
const NECK_DIA = 0.044;
const NECK_H = 0.008;
const COLLAR_DIA = 0.047;
const COLLAR_H = 0.022;
const CAP_DIA = 0.045;
const CAP_H = 0.01;

// ---- 世界（root 座標系）定位 ----
const BODY_Y = BODY_H / 2; // 0.027
const NECK_Y = BODY_H + NECK_H / 2; // 0.058
const COLLAR_Y = BODY_H + NECK_H + COLLAR_H / 2; // 0.073
const CAP_Y = BODY_H + NECK_H + COLLAR_H + CAP_H / 2; // 0.089
const HINGE_Y = BODY_H + NECK_H + COLLAR_H; // 0.084：蓋環頂面＝鉸鏈高度

// ---- 物理（鏡射 spec.physics，權威是 spec.constraints）----
interface ColliderDef { component: string; size: [number, number, number]; offset: [number, number, number] }
interface BodyDef {
  id: string;
  rootComponent: string;
  colliders: ColliderDef[];
  mass: number;
  friction: number;
  restitution: number;
  centerOfMass: [number, number, number];
}
const BODY_DEFS: BodyDef[] = [
  {
    id: "body",
    rootComponent: "body",
    colliders: [
      { component: "body", size: [0.052, 0.054, 0.052], offset: [0, 0, 0] },
      { component: "collar", size: [0.048, 0.028, 0.048], offset: [0, -0.005, 0] },
    ],
    mass: 0.04,
    friction: 0.5,
    restitution: 0.25,
    centerOfMass: [0, -0.01, 0],
  },
  {
    id: "cap",
    rootComponent: "cap",
    colliders: [{ component: "cap", size: [0.045, 0.01, 0.045], offset: [0, 0, 0] }],
    mass: 0.008,
    friction: 0.5,
    restitution: 0.25,
    centerOfMass: [0, 0, 0],
  },
];
const HINGE = {
  bodyA: "body",
  bodyB: "cap",
  pivotA: [0, HINGE_Y - BODY_Y, 0.023] as [number, number, number],
  pivotB: [0, HINGE_Y - CAP_Y, 0.023] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number],
  limits: [0, 1.92] as [number, number],
};

const TESS = 48;
const RIB_COUNT = 28;
const PILL_COUNT = 4;
const SEED = 20260831; // 決定性：所有程序化擺放都由此 seed 決定

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

/** 瓶身外輪廓（lathe profile，x = 半徑、y = 相對 body pivot 的高度）。 */
function bodyProfile(): Vector3[] {
  const r = BODY_DIA / 2; // 0.026
  const rNeck = NECK_DIA / 2; // 0.022
  const b = -BODY_H / 2;
  const t = BODY_H / 2;
  return [
    new Vector3(0, b, 0),
    new Vector3(r - 0.005, b, 0),
    new Vector3(r - 0.0015, b + 0.0012, 0),
    new Vector3(r, b + 0.004, 0), // 底部倒角
    new Vector3(r, t - 0.016, 0), // 直筒身
    new Vector3(r - 0.0008, t - 0.011, 0),
    new Vector3(r - 0.0035, t - 0.0055, 0), // 肩線
    new Vector3(rNeck + 0.0015, t - 0.0018, 0),
    new Vector3(rNeck, t, 0), // 收到瓶口
  ];
}

export default function createPillBottleModel(
  scene: Scene,
  opts: ModelOptions = {},
): BuiltModel {
  const root = new TransformNode("pill-bottle", scene);
  const rng = makeRng(SEED);

  // ---- 材質（對應 spec.materials）----
  // 半透明琥珀塑膠：關閉背面剔除，讓遠側瓶壁與藥錠透出來。
  const amber = new StandardMaterial("amber-plastic", scene);
  amber.diffuseColor = new Color3(0.74, 0.42, 0.11);
  amber.specularColor = new Color3(0.42, 0.34, 0.26);
  amber.specularPower = 72; // roughness 0.30
  amber.emissiveColor = new Color3(0.1, 0.05, 0.01);
  amber.alpha = 0.62;
  amber.backFaceCulling = false;

  const capMat = new StandardMaterial("cap-plastic", scene);
  capMat.diffuseColor = new Color3(0.93, 0.93, 0.91);
  capMat.specularColor = new Color3(0.16, 0.16, 0.16);
  capMat.specularPower = 40; // roughness 0.45

  const pillMat = new StandardMaterial("pill-cream", scene);
  pillMat.diffuseColor = new Color3(0.95, 0.9, 0.66);
  pillMat.specularColor = new Color3(0.08, 0.08, 0.07);
  pillMat.specularPower = 18; // roughness 0.65

  const matOf: Record<string, StandardMaterial> = {
    body: amber,
    neck: amber,
    collar: capMat,
    "collar-ribs": capMat,
    cap: capMat,
    "cap-tab": capMat,
    "hinge-tab": capMat,
    pills: pillMat,
  };
  const disposables: { dispose(): void }[] = [amber, capMat, pillMat];

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
    mesh.material = matOf[id] ?? capMat;
    meshes[id] = mesh;
    return mesh;
  };

  // body（含 neck / collar 等視覺子件）與 cap 是兩個獨立剛體 → 兩者都掛在 root 底下。
  const bodyPivot = pivot("body", root, new Vector3(0, BODY_Y, 0));
  const capPivot = pivot("cap", root, new Vector3(0, CAP_Y, 0));

  // --- 瓶身：lathe（底部倒角 + 直筒 + 肩線 + 瓶口）---
  attach("body", MeshBuilder.CreateLathe(
    "body", { shape: bodyProfile(), tessellation: TESS, closed: true }, scene,
  ), bodyPivot);

  // --- 瓶頸：圓柱 + 頸環（thread bead）---
  const neckPivot = pivot("neck", bodyPivot, new Vector3(0, NECK_Y - BODY_Y, 0));
  const neckCore = MeshBuilder.CreateCylinder(
    "neck-core", { height: NECK_H, diameter: NECK_DIA, tessellation: TESS }, scene,
  );
  const neckBead = MeshBuilder.CreateCylinder(
    "neck-bead",
    { height: 0.0035, diameter: NECK_DIA + 0.002, tessellation: TESS },
    scene,
  );
  neckBead.position.y = NECK_H / 2 - 0.0035;
  const neck = Mesh.MergeMeshes([neckCore, neckBead], true, true) ?? neckCore;
  neck.name = "neck";
  attach("neck", neck, neckPivot);

  // --- 蓋環（白色壓蓋）：本體 + 上緣唇口 ---
  const collarPivot = pivot("collar", bodyPivot, new Vector3(0, COLLAR_Y - BODY_Y, 0));
  const collarCore = MeshBuilder.CreateCylinder(
    "collar-core",
    { height: COLLAR_H, diameterTop: COLLAR_DIA - 0.001, diameterBottom: COLLAR_DIA, tessellation: TESS },
    scene,
  );
  // 上緣唇口：與蓋環頂面齊平（不可高出，否則會侵入 cap 的 collider 區間）。
  const collarLip = MeshBuilder.CreateCylinder(
    "collar-lip", { height: 0.003, diameter: COLLAR_DIA - 0.0035, tessellation: TESS }, scene,
  );
  collarLip.position.y = COLLAR_H / 2 - 0.0015;
  const collar = Mesh.MergeMeshes([collarCore, collarLip], true, true) ?? collarCore;
  collar.name = "collar";
  attach("collar", collar, collarPivot);

  // --- 蓋環滾花：一圈細長薄片（micro）---
  const ribPivot = pivot("collar-ribs", collarPivot, new Vector3(0, -0.001, 0));
  const ribs: Mesh[] = [];
  for (let i = 0; i < RIB_COUNT; i++) {
    const a = (i / RIB_COUNT) * Math.PI * 2;
    const rib = MeshBuilder.CreateBox(
      `rib-${i}`, { width: 0.0022, height: 0.016, depth: 0.0022 }, scene,
    );
    rib.position.set(Math.cos(a) * (COLLAR_DIA / 2 - 0.0004), 0, Math.sin(a) * (COLLAR_DIA / 2 - 0.0004));
    rib.rotation.y = -a;
    ribs.push(rib);
  }
  const ribMesh = Mesh.MergeMeshes(ribs, true, true) ?? ribs[0];
  ribMesh.name = "collar-ribs";
  attach("collar-ribs", ribMesh, ribPivot);

  // --- 藥錠：seed 決定位置，合併成單一 mesh（micro）---
  const pillPivot = pivot("pills", bodyPivot, new Vector3(0, 0.008 - BODY_Y, 0));
  const pills: Mesh[] = [];
  for (let i = 0; i < PILL_COUNT; i++) {
    const p = MeshBuilder.CreateCapsule(
      `pill-${i}`,
      { radius: 0.0042, height: 0.0108, tessellation: 14, subdivisions: 2 },
      scene,
    );
    const ang = (i / PILL_COUNT) * Math.PI * 2 + rng() * 0.9;
    const rad = 0.007 + rng() * 0.006;
    p.position.set(Math.cos(ang) * rad, (rng() - 0.5) * 0.001, Math.sin(ang) * rad);
    p.rotation.set(Math.PI / 2, rng() * Math.PI * 2, 0); // 平躺
    pills.push(p);
  }
  const pillMesh = Mesh.MergeMeshes(pills, true, true) ?? pills[0];
  pillMesh.name = "pills";
  attach("pills", pillMesh, pillPivot);

  // --- 掀蓋：微收口圓柱 ---
  attach("cap", MeshBuilder.CreateCylinder(
    "cap",
    { height: CAP_H, diameterBottom: CAP_DIA, diameterTop: CAP_DIA - 0.002, tessellation: TESS },
    scene,
  ), capPivot);

  // --- 開合側拇指扣片（micro，位於 -z）---
  const tabPivot = pivot("cap-tab", capPivot, new Vector3(0, -0.0005, -0.0215));
  attach("cap-tab", MeshBuilder.CreateBox(
    "cap-tab", { width: 0.016, height: 0.005, depth: 0.004 }, scene,
  ), tabPivot);

  // --- 鉸鏈節（micro，位於 +z）：中心即 hinge pivot，開合時原地旋轉。
  // Babylon 為左手系：pivot 放 +z 側，ANGULAR_X 的正向（0→1.92）才是「掀開」而非「壓下」。---
  const hingePivot = pivot("hinge-tab", capPivot, new Vector3(0, HINGE_Y - CAP_Y, 0.0235));
  attach("hinge-tab", MeshBuilder.CreateBox(
    "hinge-tab", { width: 0.014, height: 0.006, depth: 0.005 }, scene,
  ), hingePivot);

  // ---- 物理：每個 spec body 一個 PhysicsBody + ShapeContainer ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const def of BODY_DEFS) {
      const rootPivot = nodes[def.rootComponent];
      rootPivot.computeWorldMatrix(true);
      const body = new PhysicsBody(rootPivot, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      for (const col of def.colliders) {
        const node = nodes[col.component];
        node.computeWorldMatrix(true);
        const half = col.size[1] / 2;
        const shape = new PhysicsShapeCylinder(
          new Vector3(0, -half, 0), new Vector3(0, half, 0), col.size[0] / 2, scene,
        );
        shape.material = { friction: def.friction, restitution: def.restitution };
        // 子形狀位置 = 元件 pivot 相對 body root pivot 的位移 + collider.offset
        const rel = node.absolutePosition
          .subtract(rootPivot.absolutePosition)
          .add(Vector3.FromArray(col.offset));
        container.addChild(shape, rel, Quaternion.Identity());
      }
      body.shape = container;
      body.setMassProperties({
        mass: def.mass,
        centerOfMass: Vector3.FromArray(def.centerOfMass),
      });
      bodies[def.id] = body;
    }

    // 掀蓋鉸鏈：6DoF 鎖五軸，只留 ANGULAR_X 的 0–1.92 弧度
    const perp = new Vector3(0, 1, 0);
    const hinge = new Physics6DoFConstraint(
      {
        pivotA: Vector3.FromArray(HINGE.pivotA),
        pivotB: Vector3.FromArray(HINGE.pivotB),
        axisA: Vector3.FromArray(HINGE.axis),
        axisB: Vector3.FromArray(HINGE.axis),
        perpAxisA: perp,
        perpAxisB: perp,
      },
      [
        { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
        {
          axis: PhysicsConstraintAxis.ANGULAR_X,
          minLimit: HINGE.limits[0],
          maxLimit: HINGE.limits[1],
        },
      ],
      scene,
    );
    bodies[HINGE.bodyA].addConstraint(bodies[HINGE.bodyB], hinge);
    hinge.isCollisionsEnabled = false; // 蓋與瓶身靠約束對位，不互相碰撞
    constraints.push(hinge);
  }

  const built: BuiltModel = {
    physicsScale: 1,
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
