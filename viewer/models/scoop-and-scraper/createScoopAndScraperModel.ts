// scoop-and-scraper — 化療潑灑處理小鏟（畚斗式，斜立握把）＋推板（平板＋握塊）：兩個自由剛體、無約束。
// 對應 spec: viewer/models/scoop-and-scraper/spec.json
import {
  AbstractMesh,
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  PhysicsBody,
  type PhysicsEngineV2,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsShapeSphere,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";

// ---- spec 尺寸／位置（pivot 在各自底面中心）----
const SCOOP_POS = new Vector3(-0.12, 0, 0.02), SCOOP_ROT_Y = 3.3, SCOOP_MASS = 0.08, SCOOP_COM = new Vector3(0, 0.03, -0.04);
const SCRAPER_POS = new Vector3(0.14, 0, -0.02), SCRAPER_ROT_Y = -0.1, SCRAPER_MASS = 0.05, SCRAPER_COM = new Vector3(0, 0.01, 0.005);
const HANDLE_TILT = -0.45; // 握把自鉛垂向後（−z）傾 0.45 rad
const FRICTION = 0.6, RESTITUTION = 0.1;
// 無活動件：membership 8 / collide ~0——粉罐顆粒（collide ~2）才推得動、進得了鏟（grimoire/physics.md collect 節）
const GROUP = 8;
// 鏡射 spec physics.bodies[scoop].collect（兩處必須一致）——M17 接觸收納：內腔到唇前 1 cm、下探 2 cm
const COLLECT = { interior: { size: new Vector3(0.152, 0.07, 0.146), offset: new Vector3(0, 0.015, 0.007) }, maxItemMass: 0.005 };
const HELD_CAP = 120, HELD_PITCH = 0.012, HELD_COLS = 12;
const HELD_ORIGIN = new Vector3(-0.066, 0.0025, -0.054); // 第一格：左牆內側 −0.076 + 半格、後牆內側 −0.066 + 一格；y 加半徑
const HELD_DEFAULT_COLOR = new Color3(0.80, 0.74, 0.50);
interface Held { mass: number; radius: number; mesh: Mesh }
// 鏡射 spec physics.bodies[scoop].pour（兩處必須一致）——source collected：倒出收進來的東西
const POUR = { tiltThreshold: 1.0, ratePerSecond: 20, direction: new Vector3(0, 0, 1), exitSpeed: 0.2 };
const LIP_EXIT = new Vector3(0, 0.01, 0.07); // 唇中心（局部）
const CLUMP_GROUP = 4, CLUMP_DAMPING = 2.0, FIXED_DT = 1 / 60;

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
  const actuators: Actuator[] = [];
  const observers: (() => void)[] = [];
  const spawned: Mesh[] = []; // 倒出的 clump mesh 在場景根層級，root.dispose 收不到
  const heldMat = new StandardMaterial("held-item", scene);
  heldMat.diffuseColor = HELD_DEFAULT_COLOR.clone(); heldMat.specularColor = new Color3(0.1, 0.1, 0.1);
  disposables.push(heldMat);
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

    // ---- collect（trigger contact）：每步掃描內腔，合格 body 連 mesh 收走、斗內排格顯示、質量加上 ----
    const scoopBody = bodies.scoop;
    const held: Held[] = [];
    let heldMass = 0;
    const half = COLLECT.interior.size.scale(0.5);
    const capture = (b: PhysicsBody, m: number): void => {
      const node = b.transformNode;
      const radius = node instanceof AbstractMesh ? node.getBoundingInfo().boundingSphere.radiusWorld : 0.005;
      const mat = node instanceof AbstractMesh ? node.material : null;
      if (held.length === 0 && mat instanceof StandardMaterial) heldMat.diffuseColor.copyFrom(mat.diffuseColor);
      b.dispose(); node.dispose();
      const n = held.length;
      const ball = MeshBuilder.CreateSphere(`held-${n}`, { diameter: radius * 2, segments: 6 }, scene);
      ball.parent = scoopPivot; ball.material = heldMat; ball.isPickable = false;
      ball.position = new Vector3(HELD_ORIGIN.x + (n % HELD_COLS) * HELD_PITCH, HELD_ORIGIN.y + radius, HELD_ORIGIN.z + Math.floor(n / HELD_COLS) * HELD_PITCH);
      meshes[`held-${n}`] = ball;
      held.push({ mass: m, radius, mesh: ball }); heldMass += m;
      scoopBody.setMassProperties({ mass: SCOOP_MASS + heldMass, centerOfMass: SCOOP_COM });
    };
    const collectScan = (): void => {
      const engine = scene.getPhysicsEngine() as PhysicsEngineV2 | null;
      if (!engine || held.length >= HELD_CAP) return;
      scoopPivot.computeWorldMatrix(true);
      const inv = Matrix.Invert(scoopPivot.getWorldMatrix());
      const mine = new Set(Object.values(bodies)); // 含自己倒出的 clump-（出口在內腔裡）
      for (const b of [...engine.getBodies()]) { // 複製：dispose 會改原陣列
        if (held.length >= HELD_CAP) break;
        if (mine.has(b) || b.isDisposed || b.getMotionType() !== PhysicsMotionType.DYNAMIC) continue;
        const m = b.getMassProperties().mass ?? 0;
        if (m <= 0 || m > COLLECT.maxItemMass) continue;
        const l = Vector3.TransformCoordinates(b.transformNode.absolutePosition, inv).subtract(COLLECT.interior.offset);
        if (Math.abs(l.x) > half.x || Math.abs(l.y) > half.y || Math.abs(l.z) > half.z) continue;
        capture(b, m);
      }
    };
    const scan = scene.onAfterPhysicsObservable.add(() => { collectScan(); });
    observers.push(() => scene.onAfterPhysicsObservable.remove(scan));
    actuators.push({
      id: "collect:scoop", kind: "collect", label: "鏟起", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) collectScan(); },
    });

    // ---- pour（source collected）：前傾 ≥ 1.0 rad 以 20 顆/s 從唇中心逐顆倒回，質量還給該顆 ----
    let clumpN = 0, accum = 0;
    const emitOne = (): void => {
      const h = held.pop();
      if (!h) return;
      heldMass -= h.mass; delete meshes[h.mesh.name]; h.mesh.dispose();
      scoopPivot.computeWorldMatrix(true);
      const wm = scoopPivot.getWorldMatrix();
      const p = Vector3.TransformCoordinates(LIP_EXIT, wm);
      const dir = Vector3.TransformNormal(POUR.direction, wm).normalize();
      const i = clumpN++;
      const g = MeshBuilder.CreateSphere(`clump-${i}`, { diameter: h.radius * 2, segments: 6 }, scene);
      g.position.copyFrom(p); g.material = heldMat; g.isPickable = false;
      meshes[`clump-${i}`] = g; spawned.push(g);
      const gb = new PhysicsBody(g, PhysicsMotionType.DYNAMIC, false, scene);
      const gs = new PhysicsShapeSphere(Vector3.Zero(), h.radius, scene);
      gs.material = { friction: 0.8, restitution: 0.05 };
      gs.filterMembershipMask = CLUMP_GROUP; gs.filterCollideMask = ~2; // 同粉罐顆粒：撞地、撞袋（8）、撞鏟，不撞 membership 2 的模型件
      gb.shape = gs;
      gb.setMassProperties({ mass: h.mass });
      gb.setLinearDamping(CLUMP_DAMPING); gb.setAngularDamping(CLUMP_DAMPING);
      gb.setLinearVelocity(scoopBody.getLinearVelocity().add(dir.scale(POUR.exitSpeed)));
      bodies[`clump-${i}`] = gb;
      scoopBody.setMassProperties({ mass: SCOOP_MASS + heldMass, centerOfMass: SCOOP_COM });
    };
    const pourObs = scene.onAfterPhysicsObservable.add(() => {
      if (!held.length) { accum = 0; return; }
      scoopPivot.computeWorldMatrix(true);
      const up = scoopPivot.getDirection(Vector3.Up());
      const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
      // 出口方向要朝下才倒：往後仰（唇朝上）不算——否則顆粒從朝上的唇噴出又掉回斗（M17 瀏覽器實測）
      const exitDown = scoopPivot.getDirection(POUR.direction).y < 0;
      if (tilt < POUR.tiltThreshold || !exitDown) { accum = 0; return; }
      accum += POUR.ratePerSecond * FIXED_DT;
      while (accum >= 1 && held.length) { accum -= 1; emitOne(); }
    });
    observers.push(() => scene.onAfterPhysicsObservable.remove(pourObs));
    actuators.push({
      id: "pour:scoop", kind: "pour", label: "傾倒", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) while (held.length) emitOne(); },
    });
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints: [], actuators,
    dispose(): void {
      observers.forEach((f) => f());
      Object.values(bodies).forEach((b) => b.dispose());
      spawned.forEach((m) => { if (!m.isDisposed()) m.dispose(); });
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
