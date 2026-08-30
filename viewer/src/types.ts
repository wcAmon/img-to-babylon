import type {
  Mesh,
  Physics6DoFConstraint,
  PhysicsBody,
  Scene,
  TransformNode,
} from "@babylonjs/core";

export interface BuiltModel {
  root: TransformNode;
  nodes: Record<string, TransformNode>;
  meshes: Record<string, Mesh>;
  bodies: Record<string, PhysicsBody>;
  constraints: Physics6DoFConstraint[];
  dispose(): void;
}

export interface ModelOptions {
  physics?: boolean;
}

export type ModelFactory = (scene: Scene, opts?: ModelOptions) => BuiltModel;
