import { Vector3 } from '@babylonjs/core';
import type { BuiltModel } from '../types';
import type { SculptSpec } from './types';

/** Inspection only moves leaf visuals; it never writes the model spec or physical transforms. */
export class SculptInspection {
  private original = new Map<string, Vector3>();
  constructor(readonly model: BuiltModel, readonly spec: SculptSpec) {
    for (const [id, mesh] of Object.entries(model.meshes)) this.original.set(id, mesh.position.clone());
  }
  isolate(id: string) {
    for (const c of this.spec.componentTree) this.model.meshes[c.id].isVisible = !id || c.group === id || c.id === id;
  }
  explode(amount: number) {
    if (Object.keys(this.model.bodies).length) return;
    const offsets: Record<string, number[]> = {
      face: [0, .2, .05], hair: [0, .38, -.10], torso: [0, .04, 0],
      equipment: [0, .02, .42], arms: [.18, 0, 0], hands: [.24, -.02, 0],
      legs: [.05, -.12, 0], boots: [.14, .015, .28],
    };
    for (const c of this.spec.componentTree) {
      const off = [...(offsets[c.group] ?? [0, 0, 0])];
      if (c.id.endsWith('-r') || c.id.includes('-r-')) off[0] *= -1;
      this.model.meshes[c.id].position.copyFrom(this.original.get(c.id)!);
      this.model.meshes[c.id].position.addInPlace(Vector3.FromArray(off).scale(amount * this.model.physicsScale));
    }
  }
  reset() { this.isolate(''); this.explode(0); }
  metrics() {
    return { components: this.spec.componentTree.length, meshes: Object.keys(this.model.meshes).length,
      triangles: Object.values(this.model.meshes).reduce((n, m) => n + m.getTotalIndices() / 3, 0),
      vertices: Object.values(this.model.meshes).reduce((n, m) => n + m.getTotalVertices(), 0),
      materials: new Set(Object.values(this.model.meshes).map(m => m.material)).size,
      bodies: Object.keys(this.model.bodies).length };
  }
}
