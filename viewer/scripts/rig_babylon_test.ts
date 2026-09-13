/** Headless numerical gate. Usage: tsx rig_babylon_test.ts emitted.ts result.json */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { NullEngine, FreeCamera, Scene, VertexBuffer, Bone, Skeleton, Matrix, Vector3 } from '@babylonjs/core';

async function main() {
  const [entry, output] = process.argv.slice(2);
  assert(entry && output, 'expected emitted.ts and result.json');
  const mod = await import(pathToFileURL(resolve(entry)).href);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  assert.throws(() => mod.createRigMilestone0(scene), /rightHandedSystem|RightHandedSystem/);
  scene.useRightHandedSystem = true;
  new FreeCamera('gate-camera', new Vector3(0, 0, -5), scene);
  const { mesh, skeleton, bones, meta } = mod.createRigMilestone0(scene);
  assert(skeleton instanceof Skeleton);
  const ids: string[] = mod.BONE_IDS;
  const parents: Record<string, string | null> = mod.PARENT;
  const positions = Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)) as number[];
  const indices = Array.from(mesh.getIndices()) as number[];
  const skinIndices = Array.from(mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)) as number[];
  const skinWeights = Array.from(mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)) as number[];
  const localMatrices: number[][] = [], inverseMatrices: number[][] = [];
  for (const [i, id] of ids.entries()) {
    assert(bones[id] instanceof Bone);
    assert.equal(bones[id].getIndex(), i);
    assert.equal(bones[id].getParent()?.name ?? null, parents[id]);
    localMatrices.push(Array.from(bones[id].getLocalMatrix().m));
    inverseMatrices.push(Array.from(bones[id].getAbsoluteInverseBindMatrix().m));
    const identity = bones[id].getAbsoluteMatrix().multiply(bones[id].getAbsoluteInverseBindMatrix());
    identity.m.forEach((v: number, k: number) => assert(Math.abs(v - (k % 5 === 0 ? 1 : 0)) < 1e-6));
  }
  const edges = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k], b = indices[i + (k + 1) % 3];
      const key = `${Math.min(a, b)},${Math.max(a, b)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert([...edges.values()].every(n => n === 2), 'capsule must be closed and manifold');
  let maxWeightError = 0;
  for (let i = 0; i < skinWeights.length; i += 4) {
    maxWeightError = Math.max(maxWeightError, Math.abs(skinWeights.slice(i, i + 4).reduce((a, b) => a + b, 0) - 1));
  }
  assert(maxWeightError < 1e-6);
  // Public scene frame advance avoids applySkeleton's same-frame short circuit.
  const deform = () => {
    scene.render();
    skeleton.prepare(true);
    mesh.applySkeleton(skeleton);
    return Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)) as number[];
  };
  const bind = deform();
  const maxError = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  const bindError = maxError(bind, positions);
  assert(bindError < 2e-6, `bind drift ${bindError}`);
  const poses = [];
  for (const rotatedId of ids) {
    for (const id of ids) bones[id].returnToRest();
    bones[rotatedId].setRotationMatrix(Matrix.RotationZ(Math.PI / 2));
    const actual = deform();
    const pivot: number[] = mod.JOINT_POS[rotatedId];
    const follows = (id: string): boolean => id === rotatedId || (parents[id] !== null && follows(parents[id]!));
    let moved = 0, blended = 0, maxAnalyticError = 0;
    for (let v = 0; v < positions.length / 3; v++) {
      const p = positions.slice(v * 3, v * 3 + 3);
      let influence = 0;
      for (let s = 0; s < 4; s++) if (follows(ids[skinIndices[v * 4 + s]])) influence += skinWeights[v * 4 + s];
      // Independent closed-form 90-degree Z rotation, including descendants.
      const rotated = [pivot[0] - (p[1] - pivot[1]), pivot[1] + (p[0] - pivot[0]), p[2]];
      const expected = p.map((value, k) => value + influence * (rotated[k] - value));
      const got = actual.slice(v * 3, v * 3 + 3);
      maxAnalyticError = Math.max(maxAnalyticError, maxError(got, expected));
      const distance = Vector3.Distance(Vector3.FromArray(p), Vector3.FromArray(got));
      if (influence > 1e-5 && Math.hypot(p[0] - pivot[0], p[1] - pivot[1]) > 1e-5) {
        assert(distance > 1e-7, 'influenced off-axis vertex did not move');
        moved++;
      }
      if (influence > 1e-4 && influence < 0.9999) blended++;
    }
    assert(maxAnalyticError < 3e-6, `pose ${rotatedId} error ${maxAnalyticError}`);
    poses.push({ id: rotatedId, moved, blended, maxAnalyticError, positions: actual });
  }
  assert(poses.some(p => p.moved > 0), 'no geometry moved');
  for (const id of ids) bones[id].returnToRest();
  const resetError = maxError(deform(), positions);
  assert(resetError < 2e-6, `reset drift ${resetError}`);
  writeFileSync(output, JSON.stringify({ ids, parents, meta, positions, indices, skinIndices, skinWeights,
    localMatrices, inverseMatrices, maxWeightError, bindError, resetError, poses }));
  scene.dispose(); engine.dispose();
  console.log(JSON.stringify({ vertices: positions.length / 3, maxWeightError, bindError, resetError,
    poses: poses.map(({ positions: _, ...pose }) => pose) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
