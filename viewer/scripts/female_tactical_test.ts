import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PhysicsShapeContainer, VertexBuffer } from '@babylonjs/core';
import { createHeadlessScene } from '../src/headless';
import { registry } from '../src/registry';
import { SculptInspection } from '../src/sculpt/inspection';

assert.ok(registry['female-tactical'], 'Female character must be registered');
const ctx = await createHeadlessScene();
const spec = JSON.parse(readFileSync(new URL('../models/female-tactical/spec.json', import.meta.url), 'utf8'));
const factory = (await registry['female-tactical']()).default;
const before = { meshes: ctx.scene.meshes.length, materials: ctx.scene.materials.length, nodes: ctx.scene.transformNodes.length };
const a = factory(ctx.scene, { physics: false });
const b = factory(ctx.scene, { physics: false });
const inspection = new SculptInspection(a, spec);
const originalPositions = Object.fromEntries(Object.entries(a.meshes).map(([id,m])=>[id,m.position.asArray()]));
inspection.isolate('hair');
assert.ok(a.meshes['hair-cap'].isVisible);
assert.equal(a.meshes.torso.isVisible, false);
inspection.explode(1);
assert.notDeepEqual(a.meshes['hair-cap'].position.asArray(), originalPositions['hair-cap']);
inspection.reset();
for (const [id,mesh] of Object.entries(a.meshes)) {
  assert.equal(mesh.isVisible, true);
  assert.deepEqual(mesh.position.asArray(), originalPositions[id], 'Reset restores exact authored position');
}
for (const c of spec.componentTree) {
  assert.ok(a.nodes[c.id], `Stable node missing: ${c.id}`);
  assert.ok(a.meshes[c.id], `Stable mesh missing: ${c.id}`);
  assert.equal(a.meshes[c.id].getChildren().length, 0, 'Meshes are leaves');
  assert.deepEqual(a.nodes[c.id].scaling.asArray(), [1, 1, 1]);
  assert.deepEqual(a.meshes[c.id].getVerticesData(VertexBuffer.PositionKind), b.meshes[c.id].getVerticesData(VertexBuffer.PositionKind), 'Deterministic geometry');
  assert.ok(a.meshes[c.id].getVerticesData(VertexBuffer.PositionKind)?.every(Number.isFinite));
}
a.nodes.head.position.x += .1;
assert.notEqual(a.nodes.head.position.x, b.nodes.head.position.x, 'Instances must be independent');
a.dispose();
b.dispose();
assert.equal(ctx.scene.meshes.length, before.meshes, 'Dispose releases meshes');
assert.equal(ctx.scene.materials.length, before.materials, 'Dispose releases materials');
assert.equal(ctx.scene.transformNodes.length, before.nodes, 'Dispose releases nodes');
const physical=factory(ctx.scene,{physics:true});
assert.equal(Object.keys(physical.bodies).length,spec.physics.bodies.length);
for(const def of spec.physics.bodies) {
  const body=physical.bodies[def.id];
  assert.equal(body.getMassProperties().mass,def.mass,'Actual Havok mass equals spec');
  assert.ok(body.shape instanceof PhysicsShapeContainer);
  const expected=spec.componentTree.filter((c:any)=>def.components.includes(c.id)&&c.collider).length;
  assert.equal((body.shape as PhysicsShapeContainer).getNumChildren(),expected,'Actual compound shapes equal authored colliders');
}
const inspectionPhysics=new SculptInspection(physical,spec);
const physicalHead=physical.meshes.head.position.clone();
inspectionPhysics.explode(1);
assert.deepEqual(physical.meshes.head.position.asArray(),physicalHead.asArray(),'Explode cannot detach physics visuals');
physical.dispose();
assert.equal(ctx.scene.meshes.length,before.meshes);
assert.equal(ctx.scene.materials.length,before.materials);
assert.equal(ctx.scene.transformNodes.length,before.nodes);
ctx.dispose();
console.log('PASS: stable component IDs, leaf meshes, unit scale, deterministic geometry, independent instances, complete disposal');
