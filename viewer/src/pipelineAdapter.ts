import { Scene, TransformNode } from '@babylonjs/core';
import type { BuiltModel } from './types';
import type { SculptSpec } from './sculpt/types';
import { attachSculptPhysics } from './sculpt/physics';

/** Bridge the native pipeline's scene graph to the existing viewer/Havok model contract. */
export function adaptPipelineModel(scene: Scene, root: TransformNode, options: {
  physics?: boolean;
  physicsSpec?: SculptSpec;
  inspectorSpec?: SculptSpec;
  iteration?: unknown;
} = {}): BuiltModel {
  const runtime = root.metadata?.sculptRuntime;
  if (!runtime?.nodes || !runtime?.meshes) throw new Error('Native pipeline runtime is missing nodes or meshes');
  let disposed=false;
  const model: BuiltModel = {
    physicsScale: 1, root, nodes: runtime.nodes, meshes: runtime.meshes, bodies: {}, constraints: [],
    // The factory owns original resources. A host may put shared materials into live slots.
    dispose() { if(disposed)return;disposed=true;disposePhysics();root.dispose(false); },
  };
  let disposePhysics = () => {};
  if (options.inspectorSpec) root.metadata.sculptSpec = options.inspectorSpec;
  if (options.iteration) root.metadata.iteration = options.iteration;
  if (options.physics) {
    if (!options.physicsSpec) throw new Error('Physics requires an explicit authoritative Havok spec; collider metadata alone is insufficient');
    if (scene.useRightHandedSystem) throw new Error('Legacy Havok recipes require an explicit LH host scene');
    if (!scene.getPhysicsEngine()) throw new Error('Havok scene must be enabled before native physics binding');
    disposePhysics = attachSculptPhysics(scene, options.physicsSpec, model);
  }
  runtime.bodies=model.bodies; runtime.constraints=model.constraints;
  return model;
}
