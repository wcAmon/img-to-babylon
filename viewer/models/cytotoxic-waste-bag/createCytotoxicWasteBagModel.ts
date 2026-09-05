// cytotoxic-waste-bag — 細胞毒性廢棄物袋：一 body 五 collider（底＋四薄壁）的開口中空容器＋collect（反向的質量轉移：封袋）。
// 對應 spec: viewer/models/cytotoxic-waste-bag/spec.json；契約見 grimoire/physics.md「收納＝反向的質量轉移」
import {
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  PhysicsBody,
  PhysicsEngineV2,
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

// ---- spec 尺寸 ----
const W = 0.30, H = 0.36, D = 0.20, WALL = 0.006, BOTTOM = 0.010;
const PIVOT_Y = H / 2; // 袋子幾何中心離地 0.18
const WALL_H = H - BOTTOM; // 0.35
const WALL_Y = BOTTOM / 2; // 四壁中心相對 pivot +0.005（下緣貼底面上緣）
const RIM_Y = H / 2 - 0.005; // 口緣 tube 相對 pivot
const HANDLE = { w: 0.07, h: 0.06, x: 0.105, y: 0.21 }; // 提耳：口緣上方，前後各一片
const LABEL = { w: 0.26, h: 0.30, y: -0.01 };
const MASS = 0.20, FRICTION = 0.7, RESTITUTION = 0.1;
const BAG_COM = new Vector3(0, -0.08, 0);
// 鏡射 spec physics.bodies[bag].collect（兩處必須一致）
const COLLECT = { interior: { size: new Vector3(W - 2 * WALL, WALL_H, D - 2 * WALL), offset: new Vector3(0, WALL_Y, 0) }, maxItemMass: 0.05 };
// 無活動件的容器：membership 8 / collide ~0——粉罐顆粒、噴瓶液滴（collide ~2）才會落進來（grimoire/physics.md collect 節）
const GROUP = 8;
const SEED = 20260907;

interface ColDef { component: string; size: [number, number, number]; pos: [number, number, number] }
const COLLIDERS: ColDef[] = [
  { component: "bag-bottom", size: [W, BOTTOM, D], pos: [0, -(H / 2 - BOTTOM / 2), 0] },
  { component: "wall-front", size: [W, WALL_H, WALL], pos: [0, WALL_Y, -(D / 2 - WALL / 2)] },
  { component: "wall-back", size: [W, WALL_H, WALL], pos: [0, WALL_Y, D / 2 - WALL / 2] },
  { component: "wall-left", size: [WALL, WALL_H, D - 2 * WALL], pos: [-(W / 2 - WALL / 2), WALL_Y, 0] },
  { component: "wall-right", size: [WALL, WALL_H, D - 2 * WALL], pos: [W / 2 - WALL / 2, WALL_Y, 0] },
];

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
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.15, 0.15, 0.15); m.specularPower = specPower;
  return m;
}

/** 生物危害符號：三個粗環（相互重疊）→ 中央鏤空 → 三道徑向缺口 → 中心小環（畫布座標，r 為外徑；底色透明）。 */
function drawBiohazard(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  c.strokeStyle = "#111"; c.fillStyle = "#111";
  c.lineWidth = r * 0.24;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    c.beginPath(); c.arc(cx + Math.cos(a) * r * 0.36, cy + Math.sin(a) * r * 0.36, r * 0.52, 0, Math.PI * 2); c.stroke();
  }
  c.save();
  c.globalCompositeOperation = "destination-out"; // 鏤空
  c.beginPath(); c.arc(cx, cy, r * 0.30, 0, Math.PI * 2); c.fill();
  c.lineWidth = r * 0.07;
  for (let k = 0; k < 3; k++) { // 三道徑向缺口（環與環之間）
    const a = -Math.PI / 2 + Math.PI / 3 + (k * 2 * Math.PI) / 3;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
  }
  c.restore();
  c.lineWidth = r * 0.06;
  c.beginPath(); c.arc(cx, cy, r * 0.20, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(cx, cy, r * 0.08, 0, Math.PI * 2); c.fill();
}

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 590; // 0.26 × 0.30 → 近 1:1.15
  const tex = new DynamicTexture("wbag-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // 正面 plane：垂直翻轉
  c.clearRect(0, 0, w, h); // 透明底：只印黑字，袋身顏色由牆面透出（避免標籤成一塊異色斑）
  drawBiohazard(c, w / 2, 250, 150);
  c.fillStyle = "#111"; c.textAlign = "center";
  c.font = "bold 50px Helvetica, Arial, sans-serif"; c.fillText("CYTOTOXIC WASTE", w / 2, 500);
  c.font = "32px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("細胞毒性廢棄物", w / 2, 552);
  tex.update(false);
  tex.hasAlpha = true;
  return tex;
}

export default function createCytotoxicWasteBagModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("cytotoxic-waste-bag", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  const yellow = mat(scene, "bag-yellow", [1.0, 0.85, 0.10], 24);
  yellow.emissiveColor = new Color3(0.34, 0.28, 0.03); // 參考圖亮黃：半球光下純 diffuse 偏橄欖，補自發光（material pass）
  yellow.backFaceCulling = false; // 內壁可見
  const dark = mat(scene, "bag-dark", [0.75, 0.60, 0.05], 20);
  const print = mat(scene, "print-black", [0.08, 0.08, 0.08], 12);
  print.useAlphaFromDiffuseTexture = true; // 透明底標籤
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) print.diffuseTexture = labelTex;
  const disposables: { dispose(): void }[] = [yellow, dark, print];
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- bag pivot＋口緣 tube（root component）----
  const bagPivot = pivot("bag", root, new Vector3(0, PIVOT_Y, 0));
  const rimPath = [
    new Vector3(-W / 2, RIM_Y, -D / 2), new Vector3(W / 2, RIM_Y, -D / 2), new Vector3(W / 2, RIM_Y, D / 2),
    new Vector3(-W / 2, RIM_Y, D / 2), new Vector3(-W / 2, RIM_Y, -D / 2),
  ];
  const crinkled: Vector3[] = []; // 皺褶：每段插 5 點、高度抖 ±0.004（seed）
  for (let i = 0; i < rimPath.length - 1; i++) {
    const a = rimPath[i], b = rimPath[i + 1];
    crinkled.push(a);
    for (let k = 1; k < 6; k++) {
      const p = Vector3.Lerp(a, b, k / 6);
      p.y += (rng() - 0.5) * 0.008;
      crinkled.push(p);
    }
  }
  crinkled.push(rimPath[rimPath.length - 1]);
  const rim = attach("bag", MeshBuilder.CreateTube("bag", { path: crinkled, radius: 0.006, tessellation: 10, cap: Mesh.NO_CAP }, scene), bagPivot, dark);

  // ---- 底與四壁（各自 pivot node，供 collider 對位）----
  for (const col of COLLIDERS) {
    const p = pivot(col.component, bagPivot, Vector3.FromArray(col.pos));
    attach(col.component, MeshBuilder.CreateBox(col.component, { width: col.size[0], height: col.size[1], depth: col.size[2] }, scene), p, yellow);
  }
  // ---- 印字、內底、提耳、打結 ----
  attach("bag-label", MeshBuilder.CreatePlane("bag-label", { width: LABEL.w, height: LABEL.h }, scene),
    pivot("bag-label", bagPivot, new Vector3(0, LABEL.y, -(D / 2 + 0.0006))), print);
  attach("bag-liner", MeshBuilder.CreateBox("bag-liner", { width: W - 2 * WALL - 0.002, height: 0.002, depth: D - 2 * WALL - 0.002 }, scene),
    pivot("bag-liner", bagPivot, new Vector3(0, -(H / 2 - BOTTOM) + 0.001, 0)), dark);
  for (const side of [-1, 1] as const) {
    const id = side < 0 ? "handle-l" : "handle-r";
    const hp = pivot(id, bagPivot, new Vector3(side * HANDLE.x, HANDLE.y, 0));
    attach(id, MeshBuilder.CreateBox(id, { width: HANDLE.w, height: HANDLE.h, depth: WALL }, scene), hp, yellow).position.z = -(D / 2 - WALL / 2);
    const back = MeshBuilder.CreateBox(`${id}-back`, { width: HANDLE.w, height: HANDLE.h, depth: WALL }, scene);
    back.parent = hp; back.position.z = D / 2 - WALL / 2; back.material = yellow;
  }
  const knot = attach("bag-knot", MeshBuilder.CreateSphere("bag-knot", { diameter: 0.05, segments: 10 }, scene),
    pivot("bag-knot", bagPivot, new Vector3(0, RIM_Y + 0.03, 0)), dark);
  const neck = MeshBuilder.CreateCylinder("bag-knot-neck", { diameterTop: 0.012, diameterBottom: 0.07, height: 0.04, tessellation: 12 }, scene);
  neck.parent = nodes["bag-knot"]; neck.position.y = -0.03; neck.material = dark;
  knot.setEnabled(false); // 封袋後才顯示（setEnabled 對子節點 neck 一併生效）

  // ---- 物理：一 body 五 collider＋collect ----
  const bodies: Record<string, PhysicsBody> = {};
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    bagPivot.computeWorldMatrix(true);
    const body = new PhysicsBody(bagPivot, PhysicsMotionType.DYNAMIC, false, scene);
    const container = new PhysicsShapeContainer(scene);
    for (const col of COLLIDERS) {
      const node = nodes[col.component]; node.computeWorldMatrix(true);
      const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), Vector3.FromArray(col.size), scene);
      shape.material = { friction: FRICTION, restitution: RESTITUTION };
      shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~0;
      container.addChild(shape, node.absolutePosition.subtract(bagPivot.absolutePosition), Quaternion.Identity());
    }
    body.shape = container;
    body.setMassProperties({ mass: MASS, centerOfMass: BAG_COM });
    bodies.bag = body;

    let collected = 0, sealed = false;
    const half = COLLECT.interior.size.scale(0.5);
    actuators.push({
      id: "collect:bag", kind: "collect", label: "封袋", min: 0, max: 1,
      set(value: number): void {
        if (value <= 0.5) return;
        const engine = scene.getPhysicsEngine() as PhysicsEngineV2 | null;
        if (!engine) return;
        bagPivot.computeWorldMatrix(true);
        const inv = Matrix.Invert(bagPivot.getWorldMatrix());
        const mine = new Set(Object.values(bodies));
        let gained = 0;
        for (const b of [...engine.getBodies()]) { // 複製：dispose 會改原陣列
          if (mine.has(b) || b.isDisposed || b.getMotionType() !== PhysicsMotionType.DYNAMIC) continue;
          const m = b.getMassProperties().mass ?? 0;
          if (m <= 0 || m > COLLECT.maxItemMass) continue;
          const l = Vector3.TransformCoordinates(b.transformNode.absolutePosition, inv).subtract(COLLECT.interior.offset);
          if (Math.abs(l.x) > half.x || Math.abs(l.y) > half.y || Math.abs(l.z) > half.z) continue;
          const node = b.transformNode;
          b.dispose(); node.dispose();
          gained += m;
        }
        if (gained > 0) {
          collected += gained;
          body.setMassProperties({ mass: MASS + collected, centerOfMass: BAG_COM });
        }
        if (!sealed) { sealed = true; knot.setEnabled(true); rim.scaling.set(0.3, 1, 0.3); }
      },
    });
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints: [], actuators,
    dispose(): void {
      Object.values(bodies).forEach((b) => b.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
