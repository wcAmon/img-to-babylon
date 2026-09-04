// duck-bot — 鴨型長腿雙足機器人。
// 尺寸全部烘進幾何參數（公尺），不用 scaling 承載尺寸。
import {
  Color3,
  Mesh,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
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

// ---- spec 尺寸與綁定姿勢（單位：公尺）----
const BODY_DIA = 0.06;
const BODY_Y = 0.147;
const HEAD_W = 0.042;
const HEAD_H = 0.02;
const HEAD_D = 0.038;
const LEG_X = 0.018;
const THIGH_W = 0.012;
const THIGH_H = 0.055;
const THIGH_D = 0.012;
const THIGH_Y = 0.0895;
const SHANK_W = 0.01;
const SHANK_H = 0.055;
const SHANK_D = 0.01;
const SHANK_Y = 0.0345;
const FOOT_W = 0.024;
const FOOT_H = 0.007;
const FOOT_D = 0.04;
const FOOT_Y = 0.0035;
const FOOT_Z = 0.01;
const TESS = 24;

type Vec = [number, number, number];
type Angular = Partial<Record<"x" | "y" | "z", [number, number] | "locked">>;
interface BodyDef {
  id: string;
  kind: "box" | "sphere";
  size: Vec;
  mass: number;
  friction: number;
  restitution: number;
  centerOfMass?: Vec;
}
interface ConstraintDef {
  bodyA: string;
  bodyB: string;
  pivotA: Vec;
  pivotB: Vec;
  axis: Vec;
  angular: Angular;
}

const SERVO_FORCE = 0.02;
const BODY_DEFS: BodyDef[] = [
  { id: "body", kind: "sphere", size: [BODY_DIA, BODY_DIA, BODY_DIA], mass: 0.06, friction: 0.6, restitution: 0.2 },
  { id: "thigh-l", kind: "box", size: [THIGH_W, THIGH_H, THIGH_D], mass: 0.012, friction: 0.6, restitution: 0.2 },
  { id: "thigh-r", kind: "box", size: [THIGH_W, THIGH_H, THIGH_D], mass: 0.012, friction: 0.6, restitution: 0.2 },
  { id: "shank-l", kind: "box", size: [SHANK_W, SHANK_H, SHANK_D], mass: 0.012, friction: 0.6, restitution: 0.2 },
  { id: "shank-r", kind: "box", size: [SHANK_W, SHANK_H, SHANK_D], mass: 0.012, friction: 0.6, restitution: 0.2 },
  { id: "foot-l", kind: "box", size: [FOOT_W, FOOT_H, FOOT_D], mass: 0.015, friction: 0.8, restitution: 0.2, centerOfMass: [0, 0, -0.01] },
  { id: "foot-r", kind: "box", size: [FOOT_W, FOOT_H, FOOT_D], mass: 0.015, friction: 0.8, restitution: 0.2, centerOfMass: [0, 0, -0.01] },
];
const CONSTRAINT_DEFS: ConstraintDef[] = [];
for (const [side, sx] of [["l", 1], ["r", -1]] as const) {
  CONSTRAINT_DEFS.push(
    {
      bodyA: "body", bodyB: `thigh-${side}`,
      pivotA: [sx * LEG_X, -0.03, 0], pivotB: [0, 0.0275, 0], axis: [1, 0, 0],
      angular: { x: [-1.6, 0.8], y: [-0.5, 0.5], z: [-0.8, 0.8] },
    },
    {
      bodyA: `thigh-${side}`, bodyB: `shank-${side}`,
      pivotA: [0, -0.0275, 0], pivotB: [0, 0.0275, 0], axis: [1, 0, 0],
      angular: { x: [0, 2.0], y: "locked", z: "locked" },
    },
    {
      bodyA: `shank-${side}`, bodyB: `foot-${side}`,
      pivotA: [0, -0.0275, 0], pivotB: [0, 0.0035, -0.01], axis: [1, 0, 0],
      angular: { x: [-0.6, 0.6], y: [-0.4, 0.4], z: "locked" },
    },
  );
}

function canonicalPerp(axis: Vector3): Vector3 {
  const up = Math.abs(Vector3.Dot(axis, Vector3.Up())) > 0.99
    ? new Vector3(1, 0, 0) : Vector3.Up();
  return Vector3.Cross(axis, up).normalize();
}

export default function createDuckBotModel(
  scene: Scene,
  opts: ModelOptions = {},
): BuiltModel {
  const physicsScale = opts.physicsScale ?? 10;
  const L = (value: number): number => value * physicsScale;
  const V = (value: Vec): Vector3 => new Vector3(
    value[0] * physicsScale, value[1] * physicsScale, value[2] * physicsScale,
  );
  const massScale = physicsScale ** 3;
  const servoForce = SERVO_FORCE * physicsScale ** 4;
  const root = new TransformNode("duck-bot", scene);

  const yellow = new StandardMaterial("duck-yellow", scene);
  yellow.diffuseColor = new Color3(1.0, 0.72, 0.08);
  yellow.specularColor = new Color3(0.18, 0.14, 0.04);
  yellow.specularPower = 40;
  const yellowDark = new StandardMaterial("duck-yellow-dark", scene);
  yellowDark.diffuseColor = new Color3(0.96, 0.58, 0.04);
  yellowDark.specularColor = new Color3(0.14, 0.09, 0.03);
  yellowDark.specularPower = 32;
  const orange = new StandardMaterial("beak-orange", scene);
  orange.diffuseColor = new Color3(1.0, 0.31, 0.04);
  orange.specularColor = new Color3(0.28, 0.12, 0.04);
  orange.specularPower = 54;
  const orangeDark = new StandardMaterial("beak-orange-dark", scene);
  orangeDark.diffuseColor = new Color3(0.9, 0.16, 0.025);
  orangeDark.specularColor = new Color3(0.2, 0.07, 0.025);
  orangeDark.specularPower = 46;
  const black = new StandardMaterial("eye-black", scene);
  black.diffuseColor = new Color3(0.012, 0.01, 0.008);
  black.specularColor = new Color3(0.95, 0.95, 0.95);
  black.specularPower = 192;
  const chrome = new StandardMaterial("chrome", scene);
  chrome.diffuseColor = new Color3(0.72, 0.76, 0.8);
  chrome.specularColor = new Color3(0.98, 0.98, 1.0);
  chrome.specularPower = 192;
  const matOf: Record<string, StandardMaterial> = {
    body: yellow, head: yellow, tuft: yellow,
    "wing-l": yellowDark, "wing-r": yellowDark,
    "beak-upper": orange, "beak-lower": orangeDark,
    "eye-l": black, "eye-r": black,
    "thigh-l": chrome, "thigh-r": chrome,
    "shank-l": chrome, "shank-r": chrome,
    "foot-l": orange, "foot-r": orange,
  };
  const disposables: { dispose(): void }[] = [
    yellow, yellowDark, orange, orangeDark, black, chrome,
  ];
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
    mesh.material = matOf[id] ?? chrome;
    meshes[id] = mesh;
    return mesh;
  };

  const bodyPivot = pivot("body", root, new Vector3(0, L(BODY_Y), 0));
  attach("body", MeshBuilder.CreateSphere(
    "body", { diameter: L(BODY_DIA), segments: TESS }, scene,
  ), bodyPivot);

  const headPivot = pivot("head", bodyPivot, new Vector3(0, L(0.02), L(0.001)));
  attach("head", MeshBuilder.CreateSphere(
    "head", {
      diameterX: L(HEAD_W), diameterY: L(HEAD_H), diameterZ: L(HEAD_D), segments: TESS,
    }, scene,
  ), headPivot);

  const tuftPivot = pivot("tuft", bodyPivot, new Vector3(0, L(0.032), L(-0.002)));
  attach("tuft", MeshBuilder.CreateSphere(
    "tuft", { diameterX: L(0.012), diameterY: L(0.005), diameterZ: L(0.01), segments: 16 }, scene,
  ), tuftPivot);

  for (const [id, y, w, h, d] of [
    ["beak-upper", 0.017, 0.034, 0.008, 0.025],
    ["beak-lower", 0.013, 0.03, 0.006, 0.021],
  ] as const) {
    const p = pivot(id, bodyPivot, new Vector3(0, L(y), L(0.026)));
    attach(id, MeshBuilder.CreateSphere(
      id, { diameterX: L(w), diameterY: L(h), diameterZ: L(d), segments: TESS }, scene,
    ), p);
  }

  for (const [side, sx] of [["l", 1], ["r", -1]] as const) {
    const wingId = `wing-${side}`;
    const wingPivot = pivot(wingId, bodyPivot, new Vector3(L(sx * 0.029), L(-0.002), L(0.002)));
    wingPivot.rotation.z = sx * -0.22;
    attach(wingId, MeshBuilder.CreateSphere(
      wingId, { diameterX: L(0.01), diameterY: L(0.032), diameterZ: L(0.025), segments: TESS }, scene,
    ), wingPivot);

    const eyeId = `eye-${side}`;
    const eyePivot = pivot(eyeId, bodyPivot, new Vector3(L(sx * 0.011), L(0.023), L(0.026)));
    attach(eyeId, MeshBuilder.CreateSphere(
      eyeId, { diameterX: L(0.006), diameterY: L(0.008), diameterZ: L(0.004), segments: 16 }, scene,
    ), eyePivot);

    const thighPivot = pivot(
      `thigh-${side}`, root, new Vector3(L(sx * LEG_X), L(THIGH_Y), 0),
    );
    attach(`thigh-${side}`, MeshBuilder.CreateBox(
      `thigh-${side}`, { width: L(THIGH_W), height: L(THIGH_H), depth: L(THIGH_D) }, scene,
    ), thighPivot);
    const hipRing = MeshBuilder.CreateCylinder(
      `hip-ring-${side}`, { height: L(0.014), diameter: L(0.016), tessellation: TESS }, scene,
    );
    hipRing.parent = thighPivot;
    hipRing.material = chrome;
    hipRing.position.y = L(THIGH_H / 2);
    hipRing.rotation.z = Math.PI / 2;

    const shankPivot = pivot(
      `shank-${side}`, root, new Vector3(L(sx * LEG_X), L(SHANK_Y), 0),
    );
    attach(`shank-${side}`, MeshBuilder.CreateBox(
      `shank-${side}`, { width: L(SHANK_W), height: L(SHANK_H), depth: L(SHANK_D) }, scene,
    ), shankPivot);
    const kneeRing = MeshBuilder.CreateCylinder(
      `knee-ring-${side}`, { height: L(0.014), diameter: L(0.015), tessellation: TESS }, scene,
    );
    kneeRing.parent = shankPivot;
    kneeRing.material = chrome;
    kneeRing.position.y = L(SHANK_H / 2);
    kneeRing.rotation.z = Math.PI / 2;

    const ankleRing = MeshBuilder.CreateCylinder(
      `ankle-ring-${side}`, { height: L(0.012), diameter: L(0.013), tessellation: TESS }, scene,
    );
    ankleRing.parent = shankPivot;
    ankleRing.material = chrome;
    ankleRing.position.y = L(-SHANK_H / 2);
    ankleRing.rotation.z = Math.PI / 2;

    const footPivot = pivot(
      `foot-${side}`, root, new Vector3(L(sx * LEG_X), L(FOOT_Y), L(FOOT_Z)),
    );
    const heel = MeshBuilder.CreateBox(
      `foot-${side}-heel`, { width: L(FOOT_W), height: L(FOOT_H), depth: L(0.022) }, scene,
    );
    heel.position.z = L(-0.009);
    const toes = [-0.008, 0, 0.008].map((x, i) => {
      const toe = MeshBuilder.CreateSphere(
        `foot-${side}-toe-${i}`, {
          diameterX: L(0.008), diameterY: L(0.006), diameterZ: L(0.018), segments: 16,
        }, scene,
      );
      toe.position.set(L(x), 0, L(0.011));
      return toe;
    });
    const footMesh = Mesh.MergeMeshes([heel, ...toes], true, true) ?? heel;
    footMesh.name = `foot-${side}`;
    attach(`foot-${side}`, footMesh, footPivot);
  }

  const bodies: Record<string, PhysicsBody> = {};
  const constraints: Physics6DoFConstraint[] = [];
  const actuators: Actuator[] = [];
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    for (const def of BODY_DEFS) {
      const p = nodes[def.id];
      p.computeWorldMatrix(true);
      const body = new PhysicsBody(p, PhysicsMotionType.DYNAMIC, false, scene);
      const container = new PhysicsShapeContainer(scene);
      const shape = def.kind === "sphere"
        ? new PhysicsShapeSphere(Vector3.Zero(), L(def.size[0]) / 2, scene)
        : new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), V(def.size), scene);
      shape.material = { friction: def.friction, restitution: def.restitution };
      container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
      body.shape = container;
      body.setMassProperties({
        mass: def.mass * massScale,
        centerOfMass: def.centerOfMass ? V(def.centerOfMass) : undefined,
      });
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
      for (const k of ["x", "y", "z"] as const) {
        const limit = def.angular[k] ?? "locked";
        axes.push(limit === "locked"
          ? { axis: ANG[k], minLimit: 0, maxLimit: 0 }
          : { axis: ANG[k], minLimit: limit[0], maxLimit: limit[1] });
      }
      const joint = new Physics6DoFConstraint(
        {
          pivotA: V(def.pivotA), pivotB: V(def.pivotB),
          axisA: axis, axisB: axis, perpAxisA: perp, perpAxisB: perp,
        },
        axes,
        scene,
      );
      bodies[def.bodyA].addConstraint(bodies[def.bodyB], joint);
      joint.isCollisionsEnabled = false;
      constraints.push(joint);

      for (const k of ["x", "y", "z"] as const) {
        const limit = def.angular[k];
        if (!Array.isArray(limit)) continue;
        const [lo, hi] = limit;
        let armed = false;
        actuators.push({
          id: `servo:${def.bodyB}.${k}`,
          kind: "servo",
          label: `${def.bodyB}.${k}`,
          min: lo,
          max: hi,
          set(value: number): void {
            const target = Math.max(lo, Math.min(hi, value));
            if (!armed) {
              joint.setAxisMotorType(ANG[k], PhysicsConstraintMotorType.POSITION);
              joint.setAxisMotorMaxForce(ANG[k], servoForce);
              armed = true;
            }
            joint.setAxisMotorTarget(ANG[k], target);
          },
          release(): void {
            joint.setAxisMotorMaxForce(ANG[k], 0);
            joint.setAxisMotorType(ANG[k], PhysicsConstraintMotorType.NONE);
            armed = false;
          },
        });
      }
    }
  }
  const built: BuiltModel = {
    physicsScale,
    root,
    nodes,
    meshes,
    bodies,
    constraints,
    actuators,
    balance: {
      leanGain: 0.8,
      driftGain: (physicsScale === 1 ? 30 : 60) / physicsScale,
      pitchServos: [
        { id: "servo:thigh-l.x", sign: 1 },
        { id: "servo:thigh-r.x", sign: 1 },
        { id: "servo:shank-l.x", sign: -1 },
        { id: "servo:shank-r.x", sign: -1 },
        { id: "servo:foot-l.x", sign: 1 },
        { id: "servo:foot-r.x", sign: 1 },
      ],
      supportBodyIds: ["foot-l", "foot-r"],
      pitch: {
        proportionalGain: 20 / physicsScale,
        derivativeGain: 1.5 / physicsScale,
        integralGain: 2 / physicsScale,
        integralMaxOutput: 0.15,
        integralLeakSeconds: 0.5,
        leanGain: 0.4,
        servos: [
          { id: "servo:foot-l.x", sign: 1 },
          { id: "servo:foot-r.x", sign: 1 },
          { id: "servo:thigh-l.x", sign: 0.35 },
          { id: "servo:thigh-r.x", sign: 0.35 },
          { id: "servo:shank-l.x", sign: -0.25 },
          { id: "servo:shank-r.x", sign: -0.25 },
        ],
        negativeErrorServos: [
          { id: "servo:foot-l.x", sign: 1 },
          { id: "servo:foot-r.x", sign: 1 },
          { id: "servo:thigh-l.x", sign: 2 },
          { id: "servo:thigh-r.x", sign: 2 },
        ],
      },
      roll: {
        proportionalGain: 40 / physicsScale,
        derivativeGain: 3 / physicsScale,
        integralGain: 4 / physicsScale,
        integralMaxOutput: 0.15,
        integralLeakSeconds: 0.5,
        leanGain: -0.4,
        servos: [
          { id: "servo:foot-l.y", sign: -1 },
          { id: "servo:foot-r.y", sign: -1 },
          { id: "servo:thigh-l.y", sign: 1 },
          { id: "servo:thigh-r.y", sign: 1 },
        ],
      },
      feedforward: {
        pitch: {
          gain: 0.11 * physicsScale,
          maxOutput: 0.2,
          servos: [
            { id: "servo:foot-l.x", sign: -1 },
            { id: "servo:foot-r.x", sign: -1 },
            { id: "servo:thigh-l.x", sign: 1 },
            { id: "servo:thigh-r.x", sign: 1 },
          ],
        },
        roll: {
          gain: 0.5 * physicsScale,
          maxOutput: 0.4,
          servos: [
            { id: "servo:foot-l.y", sign: 1 },
            { id: "servo:foot-r.y", sign: 1 },
            { id: "servo:thigh-l.y", sign: -1 },
            { id: "servo:thigh-r.y", sign: -1 },
          ],
        },
      },
    },
    factoryPose: {
      rootPosition: root.position.clone(),
      bodies: Object.fromEntries(Object.entries(bodies).map(([id, body]) => [id, {
        position: body.transformNode.position.clone(),
        rotationQuaternion: body.transformNode.rotationQuaternion?.clone() ?? null,
      }])),
    },
    dispose(): void {
      constraints.forEach((constraint) => constraint.dispose());
      Object.values(bodies).forEach((body) => body.dispose());
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
  return built;
}
