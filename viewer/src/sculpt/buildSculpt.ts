import { Color3, Mesh, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { BuiltModel, ModelOptions } from '../types';
import type { SculptSpec } from './types';
import { createGeometry } from './geometry';
import { attachSculptPhysics } from './physics';

export function buildSculpt(scene: Scene, spec: SculptSpec, opts: ModelOptions = {}): BuiltModel {
  const scale = opts.physicsScale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('physicsScale must be positive');
  const root = new TransformNode(spec.targetName, scene);
  const nodes: Record<string, TransformNode> = {};
  const meshes: Record<string, Mesh> = {};
  const materials = Object.fromEntries(spec.materials.map(def => {
    const mat = new StandardMaterial(def.id, scene);
    mat.diffuseColor = ['blockout', 'structure'].includes(spec.buildStage) ? new Color3(.48, .49, .52) : Color3.FromArray(def.baseColor);
    mat.specularColor = new Color3(.05, .05, .05);
    mat.specularPower = 24;
    return [def.id, mat];
  }));
  for (const c of spec.componentTree) nodes[c.id] = new TransformNode(`${c.id}__pivot`, scene);
  for (const c of spec.componentTree) {
    const pivot = nodes[c.id];
    pivot.parent = c.parent ? nodes[c.parent] : root;
    pivot.position = Vector3.FromArray(c.transform.position).scale(scale);
    pivot.rotation = Vector3.FromArray(c.transform.rotation);
    const mesh = createGeometry(c, scene, scale);
    mesh.parent = pivot; mesh.material = materials[c.material];
    mesh.metadata = { componentId: c.id, group: c.group, label: c.name };
    meshes[c.id] = mesh;
  }
  let disposePhysics = () => {};
  const model: BuiltModel = {
    physicsScale: scale, root, nodes, meshes, bodies: {}, constraints: [],
    dispose() { disposePhysics(); root.dispose(false); Object.values(materials).forEach(m => m.dispose()); },
  };
  if (opts.physics === true && ['physics','polish'].includes(spec.buildStage) && scene.getPhysicsEngine()) disposePhysics = attachSculptPhysics(scene, spec, model);
  root.metadata = { sculptRuntime: { nodes, meshes, bodies: model.bodies, constraints: model.constraints }, sculptSpec: spec };
  return model;
}
