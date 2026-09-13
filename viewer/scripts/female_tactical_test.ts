import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PhysicsShapeContainer, VertexBuffer } from '@babylonjs/core';
import { createHeadlessScene } from '../src/headless';
import { registry } from '../src/registry';
import { SculptInspection } from '../src/sculpt/inspection';
import { createGeometry, triangulateOutline } from '../src/sculpt/geometry';

// A concave L must retain its empty notch, in either input winding.
for(const outline of [[[0,0],[2,0],[2,1],[1,1],[1,2],[0,2]],[[0,2],[1,2],[1,1],[2,1],[2,0],[0,0]]]) {
  const indices=triangulateOutline(outline);
  let area=0;
  assert.equal(indices.length,12);
  for(let i=0;i<indices.length;i+=3) {
    const [a,b,c]=indices.slice(i,i+3).map(j=>outline[j]);
    const signed=((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
    assert.ok(signed<0,'Patch winding faces outward in Babylon');area-=signed;
    assert.ok((a[0]+b[0]+c[0])/3<=1||(a[1]+b[1]+c[1])/3<=1,'No triangle fills the notch');
  }
  assert.equal(area,3);
}

assert.ok(registry['female-tactical'], 'Female character must be registered');
const ctx = await createHeadlessScene();
const spec = JSON.parse(readFileSync(new URL('../models/female-tactical/spec.json', import.meta.url), 'utf8'));
const headRecipe=structuredClone(spec.componentTree.find((c:any)=>c.id==='head'));
const detailedHead=createGeometry(headRecipe,ctx.scene,1);
delete headRecipe.geometry.relief;
const plainHead=createGeometry(headRecipe,ctx.scene,1);
const detailed=detailedHead.getVerticesData(VertexBuffer.PositionKind)!;
const plain=plainHead.getVerticesData(VertexBuffer.PositionKind)!;
let raised=0;
for(let i=0;i<plain.length;i+=3) {
  assert.equal(detailed[i],plain[i]);assert.equal(detailed[i+1],plain[i+1]);
  if(plain[i+2]<0) assert.equal(detailed[i+2],plain[i+2],'Face relief cannot deform rear skull');
  if(detailed[i+2]>plain[i+2]+.001) raised++;
}
assert.ok(raised>0,'Facial relief must affect the actual mesh');
detailedHead.dispose();plainHead.dispose();
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
