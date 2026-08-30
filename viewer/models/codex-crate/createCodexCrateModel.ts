import {
  Color3,
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

const WIDTH = 0.8;
const HEIGHT = 0.62;
const DEPTH = 0.6;

export default function createCodexCrateModel(
  scene: Scene, opts: ModelOptions = {},
): BuiltModel {
  const root = new TransformNode("codex-crate", scene);
  const pivot = new TransformNode("crate__pivot", scene);
  pivot.parent = root;
  pivot.position.y = HEIGHT / 2;

  const woodMaterial = (name: string): StandardMaterial => {
    // Fixed seed plus a stable string hash gives deterministic board variation.
    let hash = 314159;
    for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
    const variation = ((hash % 1000) / 999 - 0.5) * 0.12;
    const material = new StandardMaterial(`${name}-warm-wood`, scene);
    material.diffuseColor = new Color3(
      0.48 + variation,
      0.25 + variation * 0.55,
      0.10 + variation * 0.3,
    );
    material.specularColor = new Color3(0.035, 0.025, 0.018);
    material.specularPower = 12;
    return material;
  };

  const meshes: Record<string, Mesh> = {};
  const addBoard = (
    name: string, width: number, height: number, depth: number,
    x: number, y: number, z: number,
  ): void => {
    const board = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    board.parent = pivot;
    board.position.set(x, y, z);
    board.material = woodMaterial(name);
    meshes[name] = board;
  };

  // Bottom deck and four feet keep the full assembly inside the spec envelope.
  addBoard("bottom", 0.72, 0.05, 0.52, 0, -0.245, 0);
  for (const x of [-0.36, 0.36]) {
    for (const z of [-0.26, 0.26]) {
      addBoard(`foot-${x}-${z}`, 0.08, 0.04, 0.08, x, -0.29, z);
    }
  }

  // Uprights define the corners of the open crate.
  for (const x of [-0.365, 0.365]) {
    for (const z of [-0.265, 0.265]) {
      addBoard(`post-${x}-${z}`, 0.07, 0.54, 0.07, x, 0.02, z);
    }
  }

  // Three separated slats on every wall preserve the characteristic gaps.
  const slatYs = [-0.15, 0.04, 0.23];
  slatYs.forEach((y, i) => {
    addBoard(`front-slat-${i}`, 0.66, 0.13, 0.035, 0, y, 0.2825);
    addBoard(`rear-slat-${i}`, 0.66, 0.13, 0.035, 0, y, -0.2825);
    addBoard(`left-slat-${i}`, 0.035, 0.13, 0.46, -0.3825, y, 0);
    addBoard(`right-slat-${i}`, 0.035, 0.13, 0.46, 0.3825, y, 0);
  });

  const bodies: Record<string, PhysicsBody> = {};
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const body = new PhysicsBody(pivot, PhysicsMotionType.DYNAMIC, false, scene);
    const container = new PhysicsShapeContainer(scene);
    const shape = new PhysicsShapeBox(
      Vector3.Zero(), Quaternion.Identity(),
      new Vector3(WIDTH, HEIGHT, DEPTH), scene,
    );
    shape.material = { friction: 0.72, restitution: 0.08 };
    container.addChild(shape, Vector3.Zero(), Quaternion.Identity());
    body.shape = container;
    body.setMassProperties({
      mass: 18,
      centerOfMass: new Vector3(0, -0.04, 0),
    });
    bodies.crate = body;
  }

  const built: BuiltModel = {
    root,
    nodes: { crate: pivot },
    meshes,
    bodies,
    constraints: [],
    dispose(): void {
      Object.values(bodies).forEach((body) => body.dispose());
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
