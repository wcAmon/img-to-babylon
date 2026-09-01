// toy-racer — 玩具跑車：車身 1 剛體 + 4 輪各自剛體，4 個自由旋轉 hinge（limits:"free"）。
// 推一把會物理滾動前進、輪胎因摩擦力自轉。尺寸全部烘進幾何參數（公尺）。
// 對應 spec: viewer/models/toy-racer/spec.json
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsShapeCylinder,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  Vector4,
} from "@babylonjs/core";
import type { Actuator, BuiltModel, ModelOptions } from "../../src/types";

// ---- spec 尺寸（單位：公尺）----
const CHASSIS_W = 0.052;
const CHASSIS_H = 0.024;
const CHASSIS_D = 0.118;
const CHASSIS_Y = 0.024; // 下緣 0.012、上緣 0.036

const CABIN_W = 0.038;
const CABIN_H = 0.014;
const CABIN_D = 0.05;
const CABIN_Y = 0.041; // 0.034–0.048，與 chassis 頂只疊 2mm（collider 重疊 <25%）
const CABIN_Z = -0.006;

const WHEEL_R = 0.014; // 輪半徑
const WHEEL_W = 0.012; // 胎寬（沿 X）
const AXLE_Y = 0.014; // 軸高 = 輪半徑（貼地）
const AXLE_X = 0.027; // 左右軸距一半
const AXLE_Z = 0.032; // 前後軸距一半

const HUB_DIA = 0.016;
const HUB_H = 0.003;
const HUB_OFFSET_X = 0.0065; // 相對輪心、朝外側

const SPOILER_W = 0.04;
const SPOILER_H = 0.003;
const SPOILER_D = 0.012;
const SPOILER_Y = 0.047;
const SPOILER_Z = -0.053;

// ---- 物理（鏡射 spec.physics，權威是 spec.constraints）----
const CHASSIS_MASS = 0.2;
const CHASSIS_FRICTION = 0.3;
const CHASSIS_RESTITUTION = 0.3;
const CHASSIS_COM: [number, number, number] = [0, -0.008, 0]; // 重心壓低防翻
const WHEEL_MASS = 0.018;
const WHEEL_FRICTION = 0.9; // 高摩擦：咬地滾動不打滑
const WHEEL_RESTITUTION = 0.2;

interface WheelDef { id: string; tire: string; hub: string; x: number; z: number }
const WHEEL_DEFS: WheelDef[] = [
  { id: "wheel-fl", tire: "tire-fl", hub: "hub-fl", x: -AXLE_X, z: AXLE_Z },
  { id: "wheel-fr", tire: "tire-fr", hub: "hub-fr", x: AXLE_X, z: AXLE_Z },
  { id: "wheel-rl", tire: "tire-rl", hub: "hub-rl", x: -AXLE_X, z: -AXLE_Z },
  { id: "wheel-rr", tire: "tire-rr", hub: "hub-rr", x: AXLE_X, z: -AXLE_Z },
];

// ---- M4 actuation（鏡射 spec 的 actuation 宣告）----
const KNUCKLE_W = 0.012;
const KNUCKLE_H = 0.014;
const STEER_LIMIT = 0.45; // rad：steer hinge 限位
const STEER_RANGE = 0.4; // rad：steer actuator 可命令範圍
const STEER_FORCE = 0.5; // N·m：要扛得住輪胎接地扭轉摩擦，0.05 只轉得到 0.06 rad
const DRIVE_SPEED = 25; // rad/s：drive 馬達滿速
const DRIVE_FORCE = 0.02; // N·m

const TESS = 32;
const SPOKE_COUNT = 5;

/** 車身塗裝：左半純紅（側面/底面）、右半紅底雙白條（頂/前/後——條紋沿車長延伸）。 */
function makeBodyTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture("body-red-striped", { width: size, height: size }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = "#d81a10";
  ctx.fillRect(0, 0, size, size);
  // 右半（u 0.5–1）：置中雙白條，各佔右半寬的 10%，間距 6%
  const half = size / 2;
  const stripeW = half * 0.1;
  const gap = half * 0.06;
  const cx = half + half / 2;
  ctx.fillStyle = "#f4f2ee";
  ctx.fillRect(cx - gap / 2 - stripeW, 0, stripeW, size);
  ctx.fillRect(cx + gap / 2, 0, stripeW, size);
  tex.update(false);
  return tex;
}

const PLAIN_UV = new Vector4(0, 0, 0.5, 1); // 左半：純紅
const STRIPE_UV = new Vector4(0.5, 0, 1, 1); // 右半：雙白條

/** box 六面 UV：頂/前/後貼條紋、側/底貼純色。 */
function stripedFaceUV(): Vector4[] {
  const uv = [PLAIN_UV, PLAIN_UV, PLAIN_UV, PLAIN_UV, PLAIN_UV, PLAIN_UV];
  uv[0] = STRIPE_UV; // +z 前
  uv[1] = STRIPE_UV; // -z 後
  uv[4] = STRIPE_UV; // +y 頂
  return uv;
}

function plainFaceUV(): Vector4[] {
  return [PLAIN_UV, PLAIN_UV, PLAIN_UV, PLAIN_UV, PLAIN_UV, PLAIN_UV];
}

export default function createToyRacerModel(
  scene: Scene,
  opts: ModelOptions = {},
): BuiltModel {
  const root = new TransformNode("toy-racer", scene);

  // ---- 材質（對應 spec.materials）----
  // headless（NullEngine）無 canvas：DynamicTexture 不可用，條紋退化為純紅。
  const canPaint = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const bodyTex = canPaint ? makeBodyTexture(scene) : null;
  const bodyStriped = new StandardMaterial("body-red-striped", scene);
  if (bodyTex) {
    bodyStriped.diffuseTexture = bodyTex;
  } else {
    bodyStriped.diffuseColor = new Color3(0.85, 0.08, 0.06);
  }
  bodyStriped.specularColor = new Color3(0.55, 0.5, 0.5);
  bodyStriped.specularPower = 96; // roughness ~0.15：亮面塑膠

  const bodyRed = new StandardMaterial("body-red", scene);
  bodyRed.diffuseColor = new Color3(0.85, 0.08, 0.06);
  bodyRed.specularColor = new Color3(0.55, 0.5, 0.5);
  bodyRed.specularPower = 96;

  const tireMat = new StandardMaterial("tire-rubber", scene);
  tireMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
  tireMat.specularColor = new Color3(0.03, 0.03, 0.03);
  tireMat.specularPower = 8; // roughness ~0.9

  const hubMat = new StandardMaterial("hub-gray", scene);
  hubMat.diffuseColor = new Color3(0.55, 0.57, 0.6);
  hubMat.specularColor = new Color3(0.2, 0.2, 0.2);
  hubMat.specularPower = 32;

  const glassMat = new StandardMaterial("glass-tint", scene);
  glassMat.diffuseColor = new Color3(0.15, 0.17, 0.2);
  glassMat.specularColor = new Color3(0.6, 0.6, 0.65);
  glassMat.specularPower = 128;
  glassMat.alpha = 0.7;

  const lightMat = new StandardMaterial("headlight-silver", scene);
  lightMat.diffuseColor = new Color3(0.9, 0.92, 0.95);
  lightMat.emissiveColor = new Color3(0.25, 0.26, 0.28);
  lightMat.specularPower = 96;

  const disposables: { dispose(): void }[] =
    [bodyStriped, bodyRed, tireMat, hubMat, glassMat, lightMat];
  if (bodyTex) disposables.push(bodyTex);

  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};

  const pivot = (id: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const p = new TransformNode(`${id}__pivot`, scene);
    p.parent = parent;
    p.position = pos;
    nodes[id] = p;
    return p;
  };
  const attach = (id: string, mesh: Mesh, parent: TransformNode, mat: StandardMaterial): Mesh => {
    mesh.parent = parent;
    mesh.material = mat;
    meshes[id] = mesh;
    return mesh;
  };

  // ---- chassis（macro）：上車身 + 前下鼻 + 後下尾 + 側裙，合併為單一 mesh ----
  // 下層留出輪窩（z ±0.018–±0.046 之間無下層方塊），輪胎視覺上嵌進車體。
  const chassisPivot = pivot("chassis", root, new Vector3(0, CHASSIS_Y, 0));
  const upper = MeshBuilder.CreateBox("chassis-upper", {
    width: CHASSIS_W, height: 0.014, depth: CHASSIS_D, faceUV: stripedFaceUV(), wrap: true,
  }, scene);
  upper.position.y = 0.005; // 世界 0.022–0.036
  const noseLow = MeshBuilder.CreateBox("chassis-nose", {
    width: CHASSIS_W, height: 0.01, depth: 0.0125, faceUV: plainFaceUV(), wrap: true,
  }, scene);
  noseLow.position.set(0, -0.007, 0.05275); // 世界 0.012–0.022，z 0.0465–0.059
  const tailLow = MeshBuilder.CreateBox("chassis-tail", {
    width: CHASSIS_W, height: 0.01, depth: 0.0125, faceUV: plainFaceUV(), wrap: true,
  }, scene);
  tailLow.position.set(0, -0.007, -0.05275);
  const skirt = MeshBuilder.CreateBox("chassis-skirt", {
    width: CHASSIS_W, height: 0.01, depth: 0.036, faceUV: plainFaceUV(), wrap: true,
  }, scene);
  skirt.position.set(0, -0.007, 0); // 前後輪窩之間
  const chassisMesh = Mesh.MergeMeshes([upper, noseLow, tailLow, skirt], true, true) ?? upper;
  chassisMesh.name = "chassis";
  attach("chassis", chassisMesh, chassisPivot, bodyStriped);

  // ---- cabin（macro）：泡泡座艙 ----
  const cabinPivot = pivot("cabin", chassisPivot, new Vector3(0, CABIN_Y - CHASSIS_Y, CABIN_Z));
  attach("cabin", MeshBuilder.CreateBox("cabin", {
    width: CABIN_W, height: CABIN_H, depth: CABIN_D, faceUV: stripedFaceUV(), wrap: true,
  }, scene), cabinPivot, bodyStriped);

  // ---- windshield（meso）：前擋風玻璃（傾斜薄片）----
  const windshieldPivot = pivot(
    "windshield", cabinPivot, new Vector3(0, 0.039 - CABIN_Y, 0.02 - CABIN_Z),
  );
  windshieldPivot.rotation.x = -0.45;
  attach("windshield", MeshBuilder.CreateBox("windshield", {
    width: 0.034, height: 0.012, depth: 0.002,
  }, scene), windshieldPivot, glassMat);

  // ---- spoiler（meso）＋支柱（micro）----
  const spoilerPivot = pivot(
    "spoiler", chassisPivot, new Vector3(0, SPOILER_Y - CHASSIS_Y, SPOILER_Z),
  );
  attach("spoiler", MeshBuilder.CreateBox("spoiler", {
    width: SPOILER_W, height: SPOILER_H, depth: SPOILER_D,
  }, scene), spoilerPivot, bodyRed);
  const strutsPivot = pivot(
    "spoiler-struts", spoilerPivot, new Vector3(0, 0.0405 - SPOILER_Y, 0),
  );
  const strutL = MeshBuilder.CreateBox("strut-l", { width: 0.004, height: 0.011, depth: 0.006 }, scene);
  strutL.position.x = -0.012;
  const strutR = MeshBuilder.CreateBox("strut-r", { width: 0.004, height: 0.011, depth: 0.006 }, scene);
  strutR.position.x = 0.012;
  const struts = Mesh.MergeMeshes([strutL, strutR], true, true) ?? strutL;
  struts.name = "spoiler-struts";
  attach("spoiler-struts", struts, strutsPivot, bodyRed);

  // ---- headlights（micro）：壓扁球嵌在鼻端 ----
  const lightMats: Record<string, StandardMaterial> = {};
  for (const [id, sx] of [["headlight-l", -1], ["headlight-r", 1]] as [string, number][]) {
    const p = pivot(id, chassisPivot, new Vector3(sx * 0.015, 0.028 - CHASSIS_Y, 0.058));
    const mat = lightMat.clone(`headlight-silver-${id}`);
    lightMats[id] = mat;
    disposables.push(mat);
    attach(id, MeshBuilder.CreateSphere(id, {
      diameterX: 0.009, diameterY: 0.006, diameterZ: 0.004, segments: 12,
    }, scene), p, mat);
  }

  // ---- 輪：胎（macro cylinder）＋轂（micro，五輻，朝外側）----
  // spec 契約：旋轉寫在元件 transform（pivot）上——pivot 繞 Z 轉 90° 把圓柱軸 Y 帶到
  // 世界 X，mesh 本身不轉（runtime_export 用 pivot 世界矩陣轉 collider AABB）。
  for (const w of WHEEL_DEFS) {
    const tirePivot = pivot(w.tire, root, new Vector3(w.x, AXLE_Y, w.z));
    tirePivot.rotation.z = Math.PI / 2;
    const tire = MeshBuilder.CreateCylinder(w.tire, {
      height: WHEEL_W, diameter: WHEEL_R * 2, tessellation: TESS,
    }, scene);
    attach(w.tire, tire, tirePivot, tireMat);

    const outward = Math.sign(w.x); // 轂朝車外側；世界 ±X = 輪局部 ∓Y
    const hubPivot = pivot(w.hub, tirePivot, new Vector3(0, -outward * HUB_OFFSET_X, 0));
    const disc = MeshBuilder.CreateCylinder("hub-disc", {
      height: HUB_H, diameter: HUB_DIA, tessellation: TESS,
    }, scene);
    const spokes: Mesh[] = [disc];
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const spoke = MeshBuilder.CreateBox(`spoke-${i}`, {
        width: 0.003, height: HUB_H, depth: 0.011,
      }, scene);
      const a = (i / SPOKE_COUNT) * Math.PI * 2;
      spoke.position.set(Math.sin(a) * 0.0075, 0, Math.cos(a) * 0.0075);
      spoke.rotation.y = a;
      spokes.push(spoke);
    }
    const hub = Mesh.MergeMeshes(spokes, true, true) ?? disc;
    hub.name = w.hub;
    attach(w.hub, hub, hubPivot, hubMat);
  }

  // ---- 轉向節（micro，藏在前輪胎圓柱內）----
  for (const [id, x] of [["knuckle-fl", -AXLE_X], ["knuckle-fr", AXLE_X]] as [string, number][]) {
    const p = pivot(id, root, new Vector3(x, AXLE_Y, AXLE_Z));
    attach(id, MeshBuilder.CreateBox(id, {
      width: KNUCKLE_W, height: KNUCKLE_H, depth: KNUCKLE_W,
    }, scene), p, hubMat);
  }

  // ---- 物理：7 個 PhysicsBody + 2 個轉向 hinge + 4 個自由旋轉 hinge ----
  // 車零件同一碰撞過濾群組、群組內不互撞：前輪與 chassis 已無直接 constraint
  // 可停用碰撞，但輪柱與車身箱 collider 本來就互相穿插，靠 filter 才不會自煞。
  const CAR_GROUP = 1 << 3;
  const CAR_COLLIDE_MASK = 0xffffffff & ~CAR_GROUP;
  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    // chassis 剛體：chassis / cabin / spoiler 三個 box collider
    const chassisRoot = nodes["chassis"];
    chassisRoot.computeWorldMatrix(true);
    const chassisBody = new PhysicsBody(chassisRoot, PhysicsMotionType.DYNAMIC, false, scene);
    const container = new PhysicsShapeContainer(scene);
    const boxColliders: { component: string; size: [number, number, number] }[] = [
      { component: "chassis", size: [CHASSIS_W, CHASSIS_H, CHASSIS_D] },
      { component: "cabin", size: [CABIN_W, CABIN_H, CABIN_D] },
      { component: "spoiler", size: [SPOILER_W, SPOILER_H, SPOILER_D] },
    ];
    for (const col of boxColliders) {
      const node = nodes[col.component];
      node.computeWorldMatrix(true);
      const shape = new PhysicsShapeBox(
        Vector3.Zero(), Quaternion.Identity(), Vector3.FromArray(col.size), scene,
      );
      shape.material = { friction: CHASSIS_FRICTION, restitution: CHASSIS_RESTITUTION };
      shape.filterMembershipMask = CAR_GROUP;
      shape.filterCollideMask = CAR_COLLIDE_MASK;
      const rel = node.absolutePosition.subtract(chassisRoot.absolutePosition);
      container.addChild(shape, rel, Quaternion.Identity());
    }
    chassisBody.shape = container;
    chassisBody.setMassProperties({
      mass: CHASSIS_MASS,
      centerOfMass: Vector3.FromArray(CHASSIS_COM),
    });
    bodies["chassis"] = chassisBody;

    // 輪剛體：pivot 已繞 Z 轉 90°，局部 Y 即世界 X → cylinder 沿局部 Y
    for (const w of WHEEL_DEFS) {
      const tirePivot = nodes[w.tire];
      tirePivot.computeWorldMatrix(true);
      const body = new PhysicsBody(tirePivot, PhysicsMotionType.DYNAMIC, false, scene);
      const shape = new PhysicsShapeCylinder(
        new Vector3(0, -WHEEL_W / 2, 0), new Vector3(0, WHEEL_W / 2, 0), WHEEL_R, scene,
      );
      shape.material = { friction: WHEEL_FRICTION, restitution: WHEEL_RESTITUTION };
      shape.filterMembershipMask = CAR_GROUP;
      shape.filterCollideMask = CAR_COLLIDE_MASK;
      body.shape = shape;
      body.setMassProperties({ mass: WHEEL_MASS, centerOfMass: Vector3.Zero() });
      bodies[w.id] = body;
    }

    // 轉向節剛體：前輪與車身之間的中介（垂直 steer hinge 掛車身、輪軸掛轉向節）
    for (const [kid, x] of [["knuckle-fl", -AXLE_X], ["knuckle-fr", AXLE_X]] as [string, number][]) {
      const kp = nodes[kid];
      kp.computeWorldMatrix(true);
      const body = new PhysicsBody(kp, PhysicsMotionType.DYNAMIC, false, scene);
      const shape = new PhysicsShapeBox(
        Vector3.Zero(), Quaternion.Identity(), new Vector3(KNUCKLE_W, KNUCKLE_H, KNUCKLE_W), scene,
      );
      shape.material = { friction: CHASSIS_FRICTION, restitution: 0.2 };
      shape.filterMembershipMask = CAR_GROUP;
      shape.filterCollideMask = CAR_COLLIDE_MASK;
      body.shape = shape;
      body.setMassProperties({ mass: 0.004, centerOfMass: Vector3.Zero() });
      bodies[kid] = body;
      void x;
    }

    // steer hinge：chassis→轉向節，垂直軸，限位 ±STEER_LIMIT，POSITION 馬達（惰性啟動）
    const steerHinges: Physics6DoFConstraint[] = [];
    for (const [kid, x] of [["knuckle-fl", -AXLE_X], ["knuckle-fr", AXLE_X]] as [string, number][]) {
      const hinge = new Physics6DoFConstraint(
        {
          pivotA: new Vector3(x, AXLE_Y - CHASSIS_Y, AXLE_Z),
          pivotB: Vector3.Zero(),
          axisA: new Vector3(0, 1, 0),
          axisB: new Vector3(0, 1, 0),
          perpAxisA: new Vector3(1, 0, 0),
          perpAxisB: new Vector3(1, 0, 0),
        },
        [
          { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: -STEER_LIMIT, maxLimit: STEER_LIMIT },
          { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
        ],
        scene,
      );
      bodies["chassis"].addConstraint(bodies[kid], hinge);
      hinge.isCollisionsEnabled = false;
      // steer 出廠即置中（回正彈簧）：自由甩動的前軸會犁地、毀掉自由滾動
      hinge.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
      hinge.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, STEER_FORCE);
      hinge.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0);
      constraints.push(hinge);
      steerHinges.push(hinge);
    }

    // 自由旋轉 hinge：鎖三線軸＋ANGULAR_Y/Z，ANGULAR_X 不列 → 放開（grimoire/physics.md）
    // 輪的局部座標系繞 Z 轉了 90°：世界 X 軸 = 輪局部 -Y、世界 Y = 輪局部 +X。
    // 前輪掛轉向節（pivotA 即節心）、後輪掛車身。
    const driveHinges: Physics6DoFConstraint[] = [];
    for (const w of WHEEL_DEFS) {
      const front = w.z > 0;
      const parentBody = front ? bodies[`knuckle-${w.id.slice(-2)}`] : bodies["chassis"];
      const hinge = new Physics6DoFConstraint(
        {
          pivotA: front ? Vector3.Zero() : new Vector3(w.x, AXLE_Y - CHASSIS_Y, w.z),
          pivotB: Vector3.Zero(), // 輪心
          axisA: new Vector3(1, 0, 0),
          axisB: new Vector3(0, -1, 0),
          perpAxisA: new Vector3(0, 1, 0),
          perpAxisB: new Vector3(1, 0, 0),
        },
        [
          { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
          // ANGULAR_X 不設 limit → 自由旋轉
        ],
        scene,
      );
      parentBody.addConstraint(bodies[w.id], hinge);
      hinge.isCollisionsEnabled = false; // 輪與車身靠約束對位，不互相碰撞
      constraints.push(hinge);
      if (!front) driveHinges.push(hinge);
    }

    // ---- actuators（惰性啟動：第一次 set 前不影響物理）----
    let driveArmed = false;
    actuators.push({
      id: "drive", kind: "drive", label: "油門", min: -1, max: 1,
      set(value: number): void {
        const v = Math.max(-1, Math.min(1, value));
        for (const h of driveHinges) {
          if (!driveArmed) {
            h.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.VELOCITY);
            h.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, DRIVE_FORCE);
          }
          h.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, v * DRIVE_SPEED);
        }
        driveArmed = true;
      },
    });
    actuators.push({
      id: "steer", kind: "steer", label: "轉向", min: -STEER_RANGE, max: STEER_RANGE,
      set(value: number): void {
        const v = Math.max(-STEER_RANGE, Math.min(STEER_RANGE, value));
        for (const h of steerHinges) {
          h.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, v);
        }
      },
    });
  }

  // 車燈 actuator（無關物理，headless 也可用）
  for (const id of ["headlight-l", "headlight-r"]) {
    const mat = lightMats[id];
    actuators.push({
      id: `light:${id}`, kind: "light", label: id === "headlight-l" ? "左車燈" : "右車燈",
      min: 0, max: 1,
      set(value: number): void {
        mat.emissiveColor = value > 0.5
          ? Color3.FromHexString("#ffefa8")
          : Color3.FromHexString("#141410");
      },
    });
  }

  const built: BuiltModel = {
    root,
    nodes,
    meshes,
    bodies,
    constraints,
    actuators,
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
