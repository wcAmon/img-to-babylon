import { Matrix, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeContainer, Quaternion, Scene, Vector3 } from '@babylonjs/core';
import type { BuiltModel } from '../types';
import type { SculptSpec } from './types';

/** Compound sculpture physics: component IDs and transforms come directly from the authored spec. */
export function attachSculptPhysics(scene: Scene, spec: SculptSpec, model: BuiltModel): () => void {
  if (spec.physics.constraints.length) throw new Error('Articulated specs require a joint builder; rigid sculpture cannot ignore constraints');
  const shapes: (PhysicsShapeBox | PhysicsShapeContainer)[] = [];
  for (const def of spec.physics.bodies) {
    const pivot = model.nodes[def.id];
    if (!pivot) throw new Error(`Missing body pivot: ${def.id}`);
    // Body root is independent; all other member pivots follow it while retaining world-space rest pose.
    pivot.computeWorldMatrix(true);
    const inverse = Matrix.Invert(pivot.getWorldMatrix());
    const components = spec.componentTree.filter(c => def.components.includes(c.id));
    for (const c of components) if (c.id !== def.id && !c.parent) {
      const node=model.nodes[c.id]; node.computeWorldMatrix(true);
      const world=node.getWorldMatrix().clone();
      node.parent=pivot;
      const position=new Vector3(), rotation=new Quaternion(), scale=new Vector3();
      world.multiply(inverse).decompose(scale,rotation,position);
      node.position.copyFrom(position); node.rotationQuaternion=rotation;
    }
    const container = new PhysicsShapeContainer(scene); shapes.push(container);
    for (const c of components) {
      if (!c.collider) continue;
      if (c.collider.type !== 'box') throw new Error(`Unsupported sculpture collider: ${c.collider.type}`);
      const node = model.nodes[c.id]; node.computeWorldMatrix(true);
      const relative = node.getWorldMatrix().multiply(inverse);
      const rotation=new Quaternion(); relative.decompose(undefined, rotation);
      const pos=Vector3.TransformCoordinates(Vector3.FromArray(c.collider.offset).scale(model.physicsScale),relative);
      const shape=new PhysicsShapeBox(Vector3.Zero(),Quaternion.Identity(),Vector3.FromArray(c.collider.size).scale(model.physicsScale),scene);
      shape.material={friction:def.friction,restitution:def.restitution};
      shapes.push(shape); container.addChild(shape,pos,rotation);
    }
    const body = new PhysicsBody(pivot, PhysicsMotionType.DYNAMIC, false, scene);
    body.shape=container;
    body.setMassProperties({mass:def.mass * model.physicsScale ** 3,centerOfMass:Vector3.FromArray(def.centerOfMass ?? [0,0,0]).scale(model.physicsScale)});
    body.setLinearDamping(.2); body.setAngularDamping(.2);
    model.bodies[def.id]=body;
  }
  return () => { Object.values(model.bodies).forEach(b=>b.dispose()); shapes.reverse().forEach(s=>s.dispose()); };
}
