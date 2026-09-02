import {
  Color3,
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

const SIZE = 0.3;
const MASS = 2.0;

export default function createSampleCrateModel(
  scene: Scene, opts: ModelOptions = {},
): BuiltModel {
  const root = new TransformNode("sample-crate", scene);
  const pivot = new TransformNode("crate__pivot", scene);
  pivot.parent = root;
  pivot.position.y = SIZE / 2 + 0.001;

  const mesh = MeshBuilder.CreateBox("crate", { size: SIZE }, scene);
  mesh.parent = pivot;
  const mat = new StandardMaterial("pine-wood", scene);
  mat.diffuseColor = new Color3(0.55, 0.36, 0.17);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  mesh.material = mat;

  const bodies: Record<string, PhysicsBody> = {};
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const body = new PhysicsBody(pivot, PhysicsMotionType.DYNAMIC, false, scene);
    const container = new PhysicsShapeContainer(scene);
    const box = new PhysicsShapeBox(
      Vector3.Zero(), Quaternion.Identity(), new Vector3(SIZE, SIZE, SIZE), scene,
    );
    box.material = { friction: 0.6, restitution: 0.2 };
    container.addChild(box, Vector3.Zero(), Quaternion.Identity());
    body.shape = container;
    body.setMassProperties({ mass: MASS, centerOfMass: Vector3.Zero() });
    bodies.crate = body;
  }

  const built: BuiltModel = {
    physicsScale: 1,
    root,
    nodes: { crate: pivot },
    meshes: { crate: mesh },
    bodies,
    constraints: [],
    dispose(): void {
      Object.values(bodies).forEach((b) => b.dispose());
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
