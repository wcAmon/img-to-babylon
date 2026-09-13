import assert from 'node:assert/strict';
import { MeshBuilder, TransformNode, PBRMaterial, PhysicsShapeContainer, Vector3 } from '@babylonjs/core';
import { createHeadlessScene } from '../src/headless';
import { adaptPipelineModel } from '../src/pipelineAdapter';
import type { SculptSpec } from '../src/sculpt/types';
const ctx=await createHeadlessScene();
void ctx.scene.defaultMaterial; // Shared lazy scene fallback is not owned by an imported model.
const baseline={meshes:ctx.scene.meshes.length,nodes:ctx.scene.transformNodes.length,materials:ctx.scene.materials.length};
const root=new TransformNode('native',ctx.scene), pivot=new TransformNode('body',ctx.scene);pivot.parent=root;pivot.position.y=1;
const mesh=MeshBuilder.CreateBox('native-box',{},ctx.scene);mesh.parent=pivot;mesh.material=new PBRMaterial('native-pbr',ctx.scene);
const ownedMaterial=mesh.material;root.onDisposeObservable.addOnce(()=>ownedMaterial.dispose());
root.metadata={sculptRuntime:{nodes:{body:pivot},meshes:{body:mesh}}};
const spec={targetName:'native',buildStage:'physics',componentTree:[{id:'body',name:'body',level:'macro',group:'body',parent:null,dimensions:{w:1,h:1,d:1},transform:{position:[0,1,0],rotation:[0,0,0],scale:[1,1,1]},material:'native-pbr',geometry:{kind:'box'},collider:{type:'box',size:[1,1,1],offset:[0,0,0]}}],materials:[],physics:{bodies:[{id:'body',components:['body'],mass:5,friction:.5,restitution:0}],constraints:[]}} as SculptSpec;
const model=adaptPipelineModel(ctx.scene,root,{physics:true,physicsSpec:spec});
assert.equal(model.bodies.body.getMassProperties().mass,5);
assert.equal((model.bodies.body.shape as PhysicsShapeContainer).getNumChildren(),1);
assert.equal(root.metadata.sculptRuntime.bodies,model.bodies);
model.dispose();
model.dispose(); // Idempotent; does not destroy external/shared resources through live material slots.
assert.equal(ctx.scene.meshes.length,baseline.meshes);assert.equal(ctx.scene.transformNodes.length,baseline.nodes);assert.equal(ctx.scene.materials.length,baseline.materials);
ctx.dispose();console.log('PASS native pipeline -> viewer -> actual Havok shape/mass/disposal');
