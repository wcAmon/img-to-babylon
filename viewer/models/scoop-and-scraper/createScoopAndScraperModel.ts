// scoop-and-scraper — 化療潑灑處理小鏟（畚斗式，斜立握把）＋推板（平板＋握塊）：兩個自由剛體、無約束。
// 對應 spec: viewer/models/scoop-and-scraper/spec.json
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
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
import type { BuiltModel, ModelOptions } from "../../src/types";

// ---- spec 尺寸／位置（pivot 在各自底面中心）----
const SCOOP_POS = new Vector3(-0.12, 0, 0.02), SCOOP_ROT_Y = 3.3, SCOOP_MASS = 0.08, SCOOP_COM = new Vector3(0, 0.03, -0.04);
const SCRAPER_POS = new Vector3(0.14, 0, -0.02), SCRAPER_ROT_Y = -0.1, SCRAPER_MASS = 0.05, SCRAPER_COM = new Vector3(0, 0.01, 0.005);
const HANDLE_TILT = -0.45; // 握把自鉛垂向後（−z）傾 0.45 rad
const FRICTION = 0.6, RESTITUTION = 0.1;
// 無活動件：membership 8 / collide ~0——粉罐顆粒（collide ~2）才推得動、進得了鏟（grimoire/physics.md collect 節）
const GROUP = 8;

interface Part { component: string; size: [number, number, number]; pos: [number, number, number]; collider: boolean; rotX?: number }
const SCOOP_PARTS: Part[] = [
  { component: "scoop", size: [0.16, 0.0025, 0.14], pos: [0, 0.00125, 0], collider: true },
  { component: "scoop-back", size: [0.16, 0.06, 0.004], pos: [0, 0.0325, -0.068], collider: true },
  { component: "scoop-side-l", size: [0.004, 0.05, 0.136], pos: [-0.078, 0.0275, 0.002], collider: true },
  { component: "scoop-side-r", size: [0.004, 0.05, 0.136], pos: [0.078, 0.0275, 0.002], collider: true },
  { component: "scoop-handle", size: [0.03, 0.12, 0.03], pos: [0, 0.117, -0.092], collider: true, rotX: HANDLE_TILT },
  { component: "scoop-lip", size: [0.16, 0.002, 0.02], pos: [0, 0.0012, 0.079], collider: false, rotX: -0.12 },
];
const SCRAPER_PARTS: Part[] = [
  { component: "scraper", size: [0.16, 0.008, 0.09], pos: [0, 0.004, 0], collider: true },
  { component: "scraper-grip", size: [0.05, 0.03, 0.035], pos: [0, 0.023, 0.02], collider: true },
];

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.2, 0.2, 0.2); m.specularPower = specPower;
  return m;
}

/** 白字印刷（plane 畫布先垂直翻轉）。 */
function printTexture(scene: Scene, id: string, w: number, h: number, text: string): DynamicTexture {
  const tex = new DynamicTexture(id, { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1);
  c.fillStyle = "#6b29b8"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#f7f7f5"; c.textAlign = "center"; c.textBaseline = "middle";
  c.font = `bold ${Math.floor(h * 0.6)}px Helvetica, Arial, sans-serif`; c.fillText(text, w / 2, h / 2);
  tex.update(false);
  return tex;
}

export default function createScoopAndScraperModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("scoop-and-scraper", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  const purple = mat(scene, "tool-purple", [0.46, 0.20, 0.80], 48);
  purple.emissiveColor = new Color3(0.14, 0.05, 0.24); // 參考圖亮紫硬塑膠：補自發光（material pass）
  const scoopPrint = mat(scene, "print-white-scoop", [0.97, 0.97, 0.96], 24);
  const scraperPrint = mat(scene, "print-white-scraper", [0.97, 0.97, 0.96], 24);
  const disposables: { dispose(): void }[] = [purple, scoopPrint, scraperPrint];
  if (canPaint) {
    const t1 = printTexture(scene, "scoop-print-tex", 96, 256, "SCOOP"); scoopPrint.diffuseTexture = t1; disposables.push(t1);
    const t2 = printTexture(scene, "scraper-print-tex", 384, 96, "SCRAPER"); scraperPrint.diffuseTexture = t2; disposables.push(t2);
  }

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3, rotY = 0, rotX = 0): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; p.rotation.y = rotY; p.rotation.x = rotX; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };
  /** 一組零件：root component 的 pivot 是 body node（mesh 帶 collider offset），其餘零件各自 pivot（含 rotX，供 collider 對位）。 */
  /** 側牆：前低（0.02）後高（0.05）的梯形——shape 在 xy 平面（x = 深度、y = 高）沿 z 擠出厚度，再 rotation.y = π/2 讓 x→z（x′ = z、z′ = −x）。 */
  const taperedWall = (id: string, depth: number, thick: number, hBack: number, hFront: number): Mesh => {
    const d = depth / 2, h = -0.025; // 零件 pivot 在牆中心高 0.0275：底邊在 −0.0275，這裡以 −0.025 起算留 2.5 mm 給底板
    const shape = [new Vector3(-d, h, 0), new Vector3(d, h, 0), new Vector3(d, h + hBack, 0), new Vector3(-d, h + hFront, 0), new Vector3(-d, h, 0)];
    const m = MeshBuilder.ExtrudeShape(id, { shape, path: [new Vector3(0, 0, -thick / 2), new Vector3(0, 0, thick / 2)], cap: Mesh.CAP_ALL, sideOrientation: Mesh.DOUBLESIDE }, scene);
    m.rotation.y = Math.PI / 2; // shape x（深度）→ world −z：x = −d（前、矮）落到 +z
    return m;
  };
  const buildParts = (rootId: string, rootPos: Vector3, rotY: number, parts: Part[]): TransformNode => {
    const rootPivot = pivot(rootId, root, rootPos, rotY);
    for (const part of parts) {
      const box = part.component.startsWith("scoop-side-")
        ? taperedWall(part.component, part.size[2], part.size[0], 0.05, 0.02)
        : MeshBuilder.CreateBox(part.component, { width: part.size[0], height: part.size[1], depth: part.size[2] }, scene);
      if (part.component === rootId) {
        box.position = Vector3.FromArray(part.pos); // root 的 mesh 相對 pivot 偏移 = collider offset
        attach(part.component, box, rootPivot, purple);
      } else {
        attach(part.component, box, pivot(part.component, rootPivot, Vector3.FromArray(part.pos), 0, part.rotX ?? 0), purple);
      }
    }
    return rootPivot;
  };

  const scoopPivot = buildParts("scoop", SCOOP_POS, SCOOP_ROT_Y, SCOOP_PARTS);
  const scoopLabel = MeshBuilder.CreatePlane("scoop-print", { width: 0.026, height: 0.08 }, scene);
  attach("scoop-print", scoopLabel, pivot("scoop-print", scoopPivot, new Vector3(0, 0.117, -0.092 - 0.0155), 0, HANDLE_TILT), scoopPrint);

  const scraperPivot = buildParts("scraper", SCRAPER_POS, SCRAPER_ROT_Y, SCRAPER_PARTS);
  const knob = MeshBuilder.CreateCylinder("scraper-knob", { height: 0.03, diameter: 0.022, tessellation: 16 }, scene);
  attach("scraper-knob", knob, pivot("scraper-knob", scraperPivot, new Vector3(0, 0.053, 0.02)), purple);
  const scraperLabel = MeshBuilder.CreatePlane("scraper-print", { width: 0.10, height: 0.025 }, scene);
  scraperLabel.rotation.x = Math.PI / 2; // 朝上（自 −z 看正讀：垂直翻轉已在畫布內）
  attach("scraper-print", scraperLabel, pivot("scraper-print", scraperPivot, new Vector3(0, 0.0086, -0.025)), scraperPrint);

  // ---- 物理：兩個自由 body，各自多 collider（含旋轉的握把）----
  const bodies: Record<string, PhysicsBody> = {};
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const make = (id: string, rootPivot: TransformNode, parts: Part[], mass: number, com: Vector3): void => {
      rootPivot.computeWorldMatrix(true);
      const body = new PhysicsBody(rootPivot, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      for (const part of parts) {
        if (!part.collider) continue;
        const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), Vector3.FromArray(part.size), scene);
        shape.material = { friction: FRICTION, restitution: RESTITUTION };
        shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~0;
        const rot = part.rotX ? Quaternion.RotationAxis(new Vector3(1, 0, 0), part.rotX) : Quaternion.Identity();
        container.addChild(shape, Vector3.FromArray(part.pos), rot); // 零件 pos／rotX 即相對 body pivot 的偏移（root 用 collider offset）
      }
      body.shape = container;
      body.setMassProperties({ mass, centerOfMass: com });
      bodies[id] = body;
    };
    make("scoop", scoopPivot, SCOOP_PARTS, SCOOP_MASS, SCOOP_COM);
    make("scraper", scraperPivot, SCRAPER_PARTS, SCRAPER_MASS, SCRAPER_COM);
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints: [], actuators: [],
    dispose(): void {
      Object.values(bodies).forEach((b) => b.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
