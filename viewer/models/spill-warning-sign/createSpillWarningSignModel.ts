// spill-warning-sign — A 字警示立牌：兩片梯形板頂端 hinge servo；板 pivot 各帶 ±LEAN，hinge 以 restOffset=2·LEAN 讓角 0 = 出廠展開、+0.56 = 併攏。
// 對應 spec: viewer/models/spill-warning-sign/spec.json
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
const PANEL_W = 0.30, PANEL_TOP_W = 0.19, PANEL_H = 0.60, PANEL_T = 0.015, LEAN = 0.28;
const COS = Math.cos(LEAN), SIN = Math.sin(LEAN);
const TOP_Y = PANEL_H * COS + (PANEL_T / 2) * SIN; // 樞軸高：外側底角剛好觸地
const CY = TOP_Y - (PANEL_H / 2) * COS + (PANEL_T / 2) * SIN; // 板中心高 0.2925
const CZ = (PANEL_H / 2) * SIN + (PANEL_T / 2) * COS; // 板中心離中線 0.0901
const LIMITS: [number, number] = [-0.05, 2 * LEAN]; // 0 = 出廠展開（restOffset）；+2·LEAN = 併攏；下限 −0.05 撐住 A 形
const SERVO_FORCE = 4;
const MASS = 0.6, FRICTION = 0.6, RESTITUTION = 0.1;
const GROUP = 2;
const PRINT_W_BOT = 0.27, PRINT_W_TOP = 0.165, PRINT_H = 0.52, PRINT_CY = -0.01; // 印字梯形（板局部）
const HINGE = {
  pivotA: [0, PANEL_H / 2, PANEL_T / 2] as [number, number, number],
  pivotB: [0, PANEL_H / 2, -PANEL_T / 2] as [number, number, number],
  axis: [1, 0, 0] as [number, number, number], limits: LIMITS,
  restOffset: 2 * LEAN, // 兩板局部框架相差 2·LEAN：預轉讓出廠姿勢讀 0
};

function mat(scene: Scene, id: string, rgb: [number, number, number], specPower: number): StandardMaterial {
  const m = new StandardMaterial(id, scene);
  m.diffuseColor = new Color3(...rgb); m.specularColor = new Color3(0.2, 0.2, 0.2); m.specularPower = specPower;
  return m;
}

/** 梯形板：ExtrudeShape 把 xy 平面的梯形沿 z 擠出 PANEL_T（凸形，cap 用扇形三角化即可）。 */
function trapezoidPanel(name: string, scene: Scene): Mesh {
  const hb = PANEL_W / 2, ht = PANEL_TOP_W / 2, hh = PANEL_H / 2;
  const shape = [new Vector3(-hb, -hh, 0), new Vector3(hb, -hh, 0), new Vector3(ht, hh, 0), new Vector3(-ht, hh, 0)];
  const path = [new Vector3(0, 0, -PANEL_T / 2), new Vector3(0, 0, PANEL_T / 2)];
  return MeshBuilder.ExtrudeShape(name, { shape, path, cap: Mesh.CAP_ALL, closeShape: true, sideOrientation: Mesh.DOUBLESIDE }, scene);
}

/** 印字面：ribbon 兩條路徑（底邊、頂邊）成梯形，u 沿邊、v 沿高——文字方向可預期。 */
function printFace(name: string, scene: Scene): Mesh {
  const bot = [new Vector3(-PRINT_W_BOT / 2, PRINT_CY - PRINT_H / 2, 0), new Vector3(PRINT_W_BOT / 2, PRINT_CY - PRINT_H / 2, 0)];
  const top = [new Vector3(-PRINT_W_TOP / 2, PRINT_CY + PRINT_H / 2, 0), new Vector3(PRINT_W_TOP / 2, PRINT_CY + PRINT_H / 2, 0)];
  return MeshBuilder.CreateRibbon(name, { pathArray: [bot, top], sideOrientation: Mesh.DOUBLESIDE }, scene);
}

function biohazard(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  c.strokeStyle = "#1c1c1c"; c.lineWidth = r * 0.2;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    c.beginPath(); c.arc(cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42, r * 0.5, 0, Math.PI * 2); c.stroke();
  }
  c.beginPath(); c.arc(cx, cy, r * 0.2, 0, Math.PI * 2); c.stroke();
}

function makePrintTexture(scene: Scene): DynamicTexture {
  const w = 512, h = 1024;
  const tex = new DynamicTexture("sign-print", { width: w, height: h }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.translate(0, h); c.scale(1, -1); // ribbon／正面 plane：畫布垂直翻轉
  c.fillStyle = "#f7c414"; c.fillRect(0, 0, w, h);
  // 頂端提把孔（視覺）
  c.fillStyle = "#c9a010"; c.fillRect(150, 40, 212, 90);
  c.fillStyle = "#1c1c1c"; c.textAlign = "center";
  c.font = "bold 104px Helvetica, Arial, sans-serif"; c.fillText("CAUTION", w / 2, 250);
  c.font = "bold 66px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("化療藥物潑灑", w / 2, 340);
  biohazard(c, w / 2, 560, 150);
  c.font = "bold 78px Helvetica, Arial, sans-serif"; c.fillText("CHEMO SPILL", w / 2, 810);
  c.font = "bold 60px 'PingFang TC', 'Noto Sans CJK TC', sans-serif"; c.fillText("請勿靠近", w / 2, 900);
  c.font = "34px Helvetica, Arial, sans-serif"; c.fillText("KEEP OUT", w / 2, 960);
  tex.update(false);
  return tex;
}

export default function createSpillWarningSignModel(scene: Scene, opts: ModelOptions = {}): BuiltModel {
  const root = new TransformNode("spill-warning-sign", scene);
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

  // 安全黃：半球光下純 diffuse 偏橄欖，補較強自發光才接近參考圖的亮黃（material pass）
  const yellow = mat(scene, "sign-yellow", [1.0, 0.82, 0.12], 24);
  yellow.emissiveColor = new Color3(0.30, 0.22, 0.02);
  const print = mat(scene, "print", [1.0, 0.82, 0.12], 16);
  const printTex = canPaint ? makePrintTexture(scene) : null;
  if (printTex) { print.diffuseTexture = printTex; print.diffuseColor = Color3.White(); print.emissiveColor = new Color3(0.28, 0.22, 0.06); }
  const disposables: { dispose(): void }[] = [yellow, print];
  if (printTex) disposables.push(printTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const pivot = (id: string, parent: TransformNode, pos: Vector3, rotX = 0): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene); p.parent = parent; p.position = pos; p.rotation.x = rotX; nodes[id] = p; return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, m: StandardMaterial): Mesh => {
    mesh.parent = parent; mesh.material = m; meshes[id] = mesh; return mesh;
  };

  // ---- 前板（−z 側，頂在樞軸、底在 −z）----
  const frontPivot = pivot("panel-front", root, new Vector3(0, CY, -CZ), LEAN);
  attach("panel-front", trapezoidPanel("panel-front", scene), frontPivot, yellow);
  attach("print-front", printFace("print-front", scene),
    pivot("print-front", frontPivot, new Vector3(0, 0, -(PANEL_T / 2 + 0.0005))), print); // 無旋轉：朝 −z（外側）
  const capNode = pivot("hinge-cap", frontPivot, new Vector3(0, PANEL_H / 2, PANEL_T / 2));
  const capMesh = MeshBuilder.CreateCylinder("hinge-cap", { height: PANEL_TOP_W + 0.01, diameter: 0.024, tessellation: 24 }, scene);
  capMesh.rotation.z = Math.PI / 2;
  attach("hinge-cap", capMesh, capNode, yellow);

  // ---- 後板（+z 側）----
  const backPivot = pivot("panel-back", root, new Vector3(0, CY, CZ), -LEAN);
  attach("panel-back", trapezoidPanel("panel-back", scene), backPivot, yellow);
  const printBack = printFace("print-back", scene);
  printBack.rotation.y = Math.PI; // 朝 +z（外側）；整體繞 y 轉 π 是剛體運動，貼圖方向與前板相同
  attach("print-back", printBack, pivot("print-back", backPivot, new Vector3(0, 0, PANEL_T / 2 + 0.0005)), print);

  // ---- 物理 ----
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const [id, node] of [["panel-front", frontPivot], ["panel-back", backPivot]] as [string, TransformNode][]) {
      node.computeWorldMatrix(true);
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(PANEL_W, PANEL_H, PANEL_T), scene);
      shape.material = { friction: FRICTION, restitution: RESTITUTION };
      shape.filterMembershipMask = GROUP; shape.filterCollideMask = ~GROUP;
      container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({ mass: MASS, centerOfMass: Vector3.Zero() });
      bodies[id] = body;
    }
    const hinge = createHinge(scene, bodies["panel-front"], bodies["panel-back"], HINGE);
    constraints.push(hinge);
    actuators.push(makeHingeServo(hinge, "panel-back", LIMITS[0], LIMITS[1], SERVO_FORCE, "後板"));
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
