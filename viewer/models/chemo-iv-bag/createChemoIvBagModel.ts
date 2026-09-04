// chemo-iv-bag — 化療點滴袋（平躺、單剛體、可破裂＝質量轉移）。尺寸烘進幾何（公尺）。
// 對應 spec: viewer/models/chemo-iv-bag/spec.json；契約見 grimoire/physics.md「破裂＝質量轉移」
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PhysicsBody,
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

// ---- spec 尺寸 ----
const BAG_W = 0.14, BAG_H = 0.035, BAG_D = 0.19;
const BAG_Y = BAG_H / 2;
const FLAT_H = 0.010; // 破裂後塌扁厚度
const MASS = 0.55, FRICTION = 0.5, RESTITUTION = 0.1;
// 鏡射 spec physics.bodies[bag].rupture（兩處必須一致）
const RUPTURE = { impulseThreshold: 2.0, emptiedMass: 0.04, puddleRadius: 0.30, droplets: 12 };
const PUDDLE_GROW_FRAMES = 90; // 1.5 s @ 60 fps（幀數，headless／viewer 一致）
const DROPLET_D = 0.012, DROPLET_MASS = 0.005, DROPLET_DAMPING = 2.0;
const SEED = 20260904;

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

function makeLabelTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 352;
  const tex = new DynamicTexture("bag-label", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(w, 0); c.scale(-1, 1); // 朝上 plane 由上方看時 u 方向與文字相反：畫布內水平翻轉
  c.fillStyle = "#f8f8f4"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#1c1c1c"; c.textAlign = "center";
  c.font = "bold 92px Helvetica, Arial, sans-serif"; c.fillText("CYTOTOXIC", w / 2, 150);
  c.font = "46px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("化療藥物  請勿觸碰", w / 2, 240);
  c.font = "34px Helvetica, Arial, sans-serif"; c.fillText("500 mL   Lot 26-0904", w / 2, 310);
  tex.update(false);
  return tex;
}

export default function createChemoIvBagModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("chemo-iv-bag", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const rng = makeRng(SEED);

  // ---- 材質 ----
  const film = new StandardMaterial("bag-film", scene);
  film.diffuseColor = new Color3(0.85, 0.88, 0.90); film.specularColor = new Color3(0.5, 0.5, 0.5);
  film.specularPower = 64; film.alpha = 0.45; film.backFaceCulling = false;
  const liquid = new StandardMaterial("liquid-yellow", scene);
  liquid.diffuseColor = new Color3(0.93, 0.85, 0.45); liquid.specularColor = new Color3(0.3, 0.3, 0.2);
  liquid.specularPower = 96; // 不透明：與半透明袋膜同時透明會出現排序破面
  const labelMat = new StandardMaterial("label-white", scene);
  labelMat.diffuseColor = new Color3(0.97, 0.97, 0.95); labelMat.specularColor = new Color3(0.1, 0.1, 0.1);
  const labelTex = canPaint ? makeLabelTexture(scene) : null;
  if (labelTex) labelMat.diffuseTexture = labelTex;
  const port = new StandardMaterial("port-purple", scene);
  port.diffuseColor = new Color3(0.45, 0.20, 0.60); port.specularColor = new Color3(0.2, 0.2, 0.2); port.specularPower = 40;
  const puddleMat = new StandardMaterial("puddle", scene);
  puddleMat.diffuseColor = new Color3(0.90, 0.82, 0.40); puddleMat.specularColor = new Color3(0.4, 0.4, 0.3);
  puddleMat.specularPower = 128; puddleMat.alpha = 0.55;
  const disposables: { dispose(): void }[] = [film, liquid, labelMat, port, puddleMat];
  if (labelTex) disposables.push(labelTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- 幾何 ----
  const bagPivot = pivot("bag", root, new Vector3(0, BAG_Y, 0));
  const bagMesh = attach("bag", MeshBuilder.CreateBox("bag", { width: BAG_W, height: BAG_H, depth: BAG_D }, scene), bagPivot, film);
  const liquidMesh = attach("liquid", MeshBuilder.CreateBox("liquid", { width: 0.13, height: 0.028, depth: 0.16 }, scene),
    pivot("liquid", bagPivot, new Vector3(0, -0.002, 0.005)), liquid);
  // 標籤：朝上的 plane（box 頂面 UV 會鏡像文字）
  const labelPlane = MeshBuilder.CreatePlane("label", { width: 0.09, height: 0.06 }, scene);
  labelPlane.rotation.x = Math.PI / 2;
  attach("label", labelPlane, pivot("label", bagPivot, new Vector3(0, 0.0185, -0.005)), labelMat);
  // 輸液口：主口大紫蓋（-x 側）、小側口
  const portA = pivot("port-a", bagPivot, new Vector3(-0.04, 0, 0.115));
  portA.rotation.x = Math.PI / 2;
  attach("port-a", MeshBuilder.CreateCylinder("port-a", { height: 0.04, diameter: 0.024, tessellation: 20 }, scene), portA, port);
  const portB = pivot("port-b", bagPivot, new Vector3(0.05, 0, 0.11));
  portB.rotation.x = Math.PI / 2;
  attach("port-b", MeshBuilder.CreateCylinder("port-b", { height: 0.03, diameter: 0.012, tessellation: 16 }, scene), portB, port);
  const eye = pivot("hang-eye", bagPivot, new Vector3(0, 0, -0.105));
  eye.rotation.x = Math.PI / 2; // 環面平躺
  attach("hang-eye", MeshBuilder.CreateTorus("hang-eye", { diameter: 0.016, thickness: 0.004, tessellation: 20 }, scene), eye, film);
  // 塌扁袋（破裂後才顯示；不是 spec 元件，不進 meshes）
  const flatMesh = MeshBuilder.CreateBox("bag-flat", { width: BAG_W, height: FLAT_H, depth: BAG_D }, scene);
  flatMesh.parent = bagPivot; flatMesh.material = film; flatMesh.isVisible = false;

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const actuators: Actuator[] = [];
  const spawned: Mesh[] = [];
  const observers: (() => void)[] = [];
  let ruptured = false;

  if (opts.physics !== false && scene.getPhysicsEngine()) {
    bagPivot.computeWorldMatrix(true);
    const body = new PhysicsBody(bagPivot, PhysicsMotionType.DYNAMIC, false, scene);
    const container = new PhysicsShapeContainer(scene);
    const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(BAG_W, BAG_H, BAG_D), scene);
    shape.material = { friction: FRICTION, restitution: RESTITUTION };
    container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
    body.shape = container;
    body.setMassProperties({ mass: MASS, centerOfMass: new Vector3(0, -0.005, 0) });
    bodies["bag"] = body;

    const groundY = 0;
    const rupture = (): void => {
      if (ruptured) return;
      ruptured = true;
      // 1. 質量轉移＋塌扁 collider
      body.setMassProperties({ mass: RUPTURE.emptiedMass, centerOfMass: Vector3.Zero() });
      const flat = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(BAG_W, FLAT_H, BAG_D), scene);
      flat.material = { friction: FRICTION, restitution: RESTITUTION };
      const old = body.shape; body.shape = flat; old?.dispose();
      bagMesh.isVisible = false; liquidMesh.isVisible = false; flatMesh.isVisible = true;
      // 2. 水漬（世界座標、純視覺；幀數驅動長大）
      const p = bagPivot.absolutePosition;
      const puddle = MeshBuilder.CreateDisc("puddle", { radius: RUPTURE.puddleRadius, tessellation: 48 }, scene);
      puddle.rotation.x = Math.PI / 2; puddle.position.set(p.x, groundY + 0.002, p.z);
      puddle.material = puddleMat; puddle.isPickable = false; puddle.scaling.setAll(0.01);
      meshes["puddle"] = puddle; spawned.push(puddle);
      let frame = 0;
      const grow = scene.onBeforeRenderObservable.add(() => {
        frame += 1;
        const s = Math.min(1, frame / PUDDLE_GROW_FRAMES);
        puddle.scaling.setAll(Math.max(s, 0.01));
        if (s >= 1) scene.onBeforeRenderObservable.remove(grow);
      });
      observers.push(() => scene.onBeforeRenderObservable.remove(grow));
      // 3. 液滴
      for (let i = 0; i < RUPTURE.droplets; i++) {
        const a = (i / RUPTURE.droplets) * Math.PI * 2 + rng() * 0.4;
        const r = 0.09 + rng() * 0.03;
        const d = MeshBuilder.CreateSphere(`droplet-${i}`, { diameter: DROPLET_D, segments: 8 }, scene);
        d.position.set(p.x + Math.cos(a) * r, groundY + 0.02, p.z + Math.sin(a) * r);
        d.material = liquid; spawned.push(d);
        const db = new PhysicsBody(d, PhysicsMotionType.DYNAMIC, false, scene);
        const ds = new PhysicsShapeSphere(Vector3.Zero(), DROPLET_D / 2, scene);
        ds.material = { friction: 0.05, restitution: 0.1 };
        db.shape = ds;
        db.setMassProperties({ mass: DROPLET_MASS });
        // 理想球在地面會一直滾（Havok 無滾動阻力）：以阻尼模擬液滴黏滯，約 2–3 秒內靜止
        db.setLinearDamping(DROPLET_DAMPING);
        db.setAngularDamping(DROPLET_DAMPING);
        const speed = 0.6 + rng() * 0.6;
        db.setLinearVelocity(new Vector3(Math.cos(a) * speed, 0.5, Math.sin(a) * speed));
        bodies[`droplet-${i}`] = db;
      }
    };

    // 偵測：單步動量變化 m·|Δv|（見 grimoire/physics.md）
    let v0 = Vector3.Zero();
    const before = scene.onBeforePhysicsObservable.add(() => { v0 = body.getLinearVelocity().clone(); });
    const after = scene.onAfterPhysicsObservable.add(() => {
      if (ruptured) return;
      const dv = body.getLinearVelocity().subtract(v0).length();
      if (MASS * dv >= RUPTURE.impulseThreshold) rupture();
    });
    observers.push(() => { scene.onBeforePhysicsObservable.remove(before); scene.onAfterPhysicsObservable.remove(after); });

    actuators.push({
      id: "rupture:bag", kind: "rupture", label: "破裂", min: 0, max: 1,
      set(value: number): void { if (value > 0.5) rupture(); },
    });
  }

  const built: BuiltModel = {
    physicsScale: 1, root, nodes, meshes, bodies, constraints: [], actuators,
    dispose(): void {
      observers.forEach((off) => off());
      Object.values(bodies).forEach((b) => b.dispose());
      spawned.forEach((m) => m.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  root.metadata = { sculptRuntime: { nodes: built.nodes, meshes: built.meshes, bodies: built.bodies, constraints: built.constraints } };
  return built;
}
