// ppe-set — 化療防護裝備組：手套盒／隔離衣包／護目鏡／單隻手套四個自由剛體，無約束。
// 對應 spec: viewer/models/ppe-set/spec.json
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

// ---- spec 尺寸／位置 ----
const GLOVE_BOX = { w: 0.24, h: 0.09, d: 0.13, pos: new Vector3(-0.22, 0.045, 0.10), rotY: 0.15, mass: 0.35 };
const GOWN = { w: 0.34, h: 0.04, d: 0.28, pos: new Vector3(0.12, 0.02, 0.05), rotY: -0.08, mass: 0.25 };
const GOGGLES = {
  frame: { w: 0.16, h: 0.05, d: 0.035 }, // 外廓（框條放在頂緣）
  collider: { w: 0.17, h: 0.06, d: 0.09, offset: new Vector3(0, 0, 0.02) },
  pos: new Vector3(0.02, 0.03, -0.20), rotY: 0.05, mass: 0.06,
};
const GLOVE = { w: 0.11, h: 0.008, d: 0.23, pos: new Vector3(-0.24, 0.004, -0.16), rotY: -0.3, mass: 0.015 };
const FRICTION = 0.6, RESTITUTION = 0.1;

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.2, 0.2, 0.2); m.specularPower = specPower;
  if (alpha < 1) m.alpha = alpha;
  return m;
}

/** 文字標籤：front=正面 plane（垂直翻轉）、top=朝上 plane 自 −z 正面觀看（垂直翻轉）。 */
function textLabel(scene: Scene, id: string, w: number, h: number, lines: [string, string][], bg: string, fg: string): DynamicTexture {
  const tex = new DynamicTexture(id, { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1);
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = fg; c.textAlign = "center";
  let y = h * 0.42;
  for (const [font, text] of lines) { c.font = font; c.fillText(text, w / 2, y); y += h * 0.36; }
  tex.update(false);
  return tex;
}

function slotTexture(scene: Scene): DynamicTexture {
  const w = 256, h = 128;
  const tex = new DynamicTexture("glove-slot-tex", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#6b38b8"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#3a2a1c"; c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.4, h * 0.3, 0, 0, Math.PI * 2); c.fill(); // 開口（露出紙盒內側）
  c.fillStyle = "#8d7a5f"; c.beginPath(); c.ellipse(w / 2, h / 2 + 8, w * 0.36, h * 0.2, 0, 0, Math.PI * 2); c.fill();
  tex.update(false);
  return tex;
}

export default function createPpeSetModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("ppe-set", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  const purple = mat(scene, "box-purple", [0.42, 0.22, 0.72], 12);
  purple.emissiveColor = new Color3(0.08, 0.03, 0.14);
  const slot = mat(scene, "slot-print", [0.42, 0.22, 0.72], 12);
  slot.emissiveColor = new Color3(0.08, 0.03, 0.14);
  const gloveLabel = mat(scene, "glove-label-mat", [0.97, 0.97, 0.95], 16);
  const film = mat(scene, "pack-film", [0.82, 0.90, 0.97], 64, 0.8);
  film.backFaceCulling = false;
  const gown = mat(scene, "gown-blue", [0.45, 0.72, 0.92], 8);
  gown.emissiveColor = new Color3(0.08, 0.14, 0.20);
  const trim = mat(scene, "gown-trim", [0.30, 0.55, 0.80], 8);
  const gownLabel = mat(scene, "gown-label-mat", [0.97, 0.97, 0.95], 16);
  const frame = mat(scene, "frame-gray", [0.55, 0.58, 0.62], 32);
  const lens = mat(scene, "lens-clear", [0.85, 0.92, 0.98], 128, 0.35);
  const strap = mat(scene, "strap-black", [0.10, 0.10, 0.11], 8);
  const glovePurple = mat(scene, "glove-purple", [0.48, 0.38, 0.85], 20);
  glovePurple.emissiveColor = new Color3(0.10, 0.06, 0.20);
  const disposables: { dispose(): void }[] = [purple, slot, gloveLabel, film, gown, trim, gownLabel, frame, lens, strap, glovePurple];
  if (canPaint) {
    const t1 = slotTexture(scene); slot.diffuseTexture = t1; disposables.push(t1);
    const t2 = textLabel(scene, "glove-label-tex", 512, 160,
      [["bold 54px Helvetica, Arial, sans-serif", "NITRILE GLOVES"], ["40px 'PingFang TC', 'Noto Sans CJK TC', sans-serif", "化療防護手套  100 pcs"]], "#f7f7f4", "#3a1b52");
    gloveLabel.diffuseTexture = t2; disposables.push(t2);
    const t3 = textLabel(scene, "gown-label-tex", 512, 256,
      [["bold 54px Helvetica, Arial, sans-serif", "ISOLATION GOWN"], ["40px 'PingFang TC', 'Noto Sans CJK TC', sans-serif", "隔離衣  防水  單次使用"]], "#f7f7f4", "#1c3f6e");
    gownLabel.diffuseTexture = t3; disposables.push(t3);
  }

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3, rotY = 0): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; p.rotation.y = rotY; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- glove-box ----
  const glovePivot = pivot("glove-box", root, GLOVE_BOX.pos, GLOVE_BOX.rotY);
  attach("glove-box", MeshBuilder.CreateBox("glove-box", { width: GLOVE_BOX.w, height: GLOVE_BOX.h, depth: GLOVE_BOX.d }, scene), glovePivot, purple);
  const slotPlane = MeshBuilder.CreatePlane("glove-slot", { width: 0.12, height: 0.06 }, scene);
  slotPlane.rotation.x = Math.PI / 2;
  attach("glove-slot", slotPlane, pivot("glove-slot", glovePivot, new Vector3(0, GLOVE_BOX.h / 2 + 0.0005, 0)), slot);
  attach("glove-label", MeshBuilder.CreatePlane("glove-label", { width: 0.16, height: 0.05 }, scene),
    pivot("glove-label", glovePivot, new Vector3(0, 0, -(GLOVE_BOX.d / 2 + 0.0005))), gloveLabel);

  // ---- gown-pack ----
  const gownPivot = pivot("gown-pack", root, GOWN.pos, GOWN.rotY);
  attach("gown-pack", MeshBuilder.CreateBox("gown-pack", { width: GOWN.w, height: GOWN.h, depth: GOWN.d }, scene), gownPivot, film);
  attach("gown-fold", MeshBuilder.CreateBox("gown-fold", { width: 0.32, height: 0.03, depth: 0.26 }, scene),
    pivot("gown-fold", gownPivot, Vector3.Zero()), gown);
  attach("gown-collar", MeshBuilder.CreateTorus("gown-collar", { diameter: 0.10, thickness: 0.008, tessellation: 32 }, scene),
    pivot("gown-collar", gownPivot, new Vector3(0, 0.016, 0.06)), trim);
  const gownLabelPlane = MeshBuilder.CreatePlane("gown-label", { width: 0.12, height: 0.06 }, scene);
  gownLabelPlane.rotation.x = Math.PI / 2;
  attach("gown-label", gownLabelPlane, pivot("gown-label", gownPivot, new Vector3(0.08, GOWN.h / 2 + 0.0005, -0.08)), gownLabel);

  // ---- goggles ----
  const gogglesPivot = pivot("goggles", root, GOGGLES.pos, GOGGLES.rotY);
  // 框：上緣一條灰框（薄），鏡片為大片透明弧面盒在前，彈性帶 torus 放在後方（自上方看只露側面兩弧）
  attach("goggles", MeshBuilder.CreateBox("goggles", { width: GOGGLES.frame.w, height: 0.012, depth: 0.028 }, scene),
    gogglesPivot, frame).position.y = GOGGLES.frame.h / 2 - 0.006;
  const lensMesh = attach("goggles-lens", MeshBuilder.CreateBox("goggles-lens", { width: 0.155, height: 0.042, depth: 0.03 }, scene),
    pivot("goggles-lens", gogglesPivot, new Vector3(0, -0.003, -0.004)), lens);
  lensMesh.hasVertexAlpha = false;
  attach("goggles-strap", MeshBuilder.CreateTorus("goggles-strap", { diameter: 0.13, thickness: 0.008, tessellation: 32 }, scene),
    pivot("goggles-strap", gogglesPivot, new Vector3(0, 0, 0.055)), strap);

  // ---- glove（掌＋四指＋拇指，全為同一 body 的視覺件；collider 只用掌面 box）----
  const glovePivot2 = pivot("glove", root, GLOVE.pos, GLOVE.rotY);
  attach("glove", MeshBuilder.CreateBox("glove", { width: GLOVE.w, height: GLOVE.h, depth: GLOVE.d }, scene), glovePivot2, glovePurple);
  // 指縫：在掌面上方 0.0005 畫四道深紫細線（視覺）
  for (let i = 0; i < 3; i++) {
    const gap = MeshBuilder.CreateBox(`glove-gap-${i}`, { width: 0.004, height: 0.0012, depth: 0.09 }, scene);
    gap.parent = glovePivot2; gap.position.set(-0.033 + i * 0.033, GLOVE.h / 2, 0.07); gap.material = strap;
  }
  const thumb = MeshBuilder.CreateBox("glove-thumb", { width: 0.035, height: GLOVE.h, depth: 0.085 }, scene);
  thumb.parent = glovePivot2; thumb.position.set(0.062, 0, 0.02); thumb.rotation.y = -0.6; thumb.material = glovePurple;

  // ---- 物理：四個自由 body ----
  const bodies: Record<string, PhysicsBody> = {};
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const make = (id: string, node: TransformNode, size: Vector3, offset: Vector3, mass: number, com: Vector3, friction = FRICTION, restitution = RESTITUTION): void => {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), size, scene);
      shape.material = { friction, restitution };
      container.addChild(shape, offset, Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({ mass, centerOfMass: com });
      bodies[id] = body;
    };
    make("glove-box", glovePivot, new Vector3(GLOVE_BOX.w, GLOVE_BOX.h, GLOVE_BOX.d), Vector3.Zero(), GLOVE_BOX.mass, Vector3.Zero());
    make("gown-pack", gownPivot, new Vector3(GOWN.w, GOWN.h, GOWN.d), Vector3.Zero(), GOWN.mass, Vector3.Zero());
    make("goggles", gogglesPivot, new Vector3(GOGGLES.collider.w, GOGGLES.collider.h, GOGGLES.collider.d), GOGGLES.collider.offset, GOGGLES.mass, GOGGLES.collider.offset.clone());
    make("glove", glovePivot2, new Vector3(GLOVE.w, GLOVE.h, GLOVE.d), Vector3.Zero(), GLOVE.mass, Vector3.Zero(), 0.7, 0.05);
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
