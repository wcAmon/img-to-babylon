import assert from 'node:assert/strict';
import { NullEngine, Scene, Mesh, PBRMaterial, RawTexture } from '@babylonjs/core';
import { createPipelineModel } from '../src/pipeline/runtime';
import { boxGeometry } from '../src/pipeline/primitives';
import { applyMorphSet } from '../src/pipeline/morphs';
import { adaptPipelineModel } from '../src/pipelineAdapter';
const engine=new NullEngine(),scene=new Scene(engine),shared=new PBRMaterial('host shared',scene),texture=RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,scene),host=new Mesh('host mesh',scene);host.material=shared;shared.albedoTexture=texture;
const counts=()=>({meshes:scene.meshes.length,nodes:scene.transformNodes.length,materials:scene.materials.length,textures:scene.textures.length,skeletons:scene.skeletons.length,morphs:scene.morphTargetManagers.length,geometries:scene.geometries.length});
const baseline=counts();
const component={id:'beam',name:'beam',level:'macro',primitive:'box',material:'surface',transform:{position:[0,.5,0],rotation:[0,0,0]},_babylon:{scale:[.2,1,.2],subdivision:0,decimate:null,dense:true},vertexPaint:{baseColor:'#334455',regions:[]}};
const payload={spec:{targetName:'ownership fixture',materials:[{id:'surface',baseColor:'#334455',displacement:{amplitude:.01}},{id:'unused',baseColor:'#ffffff',textureless:{declared:true}}]},components:[component],standProud:[],repetitions:[],segments:{},bones:[{id:'beam',component:'beam',jointPos:[0,0,0],tipPos:[0,1,0],envelope:.3}]};
for(let i=0;i<6;i++){
 const root=createPipelineModel(scene,payload,{beam:()=>boxGeometry()}, {textureSize:256});const resources=root.metadata.ownedResources,mesh=root.metadata.sculptRuntime.meshes.beam;
 assert(resources.materials.size>=3,'track base, unused and dense/paint allocations');assert(resources.textures.size>=10,'track all maps, including superseded variants');assert.equal(resources.skeletons.size,1);
 const beforeInvalidMorph=counts();assert.throws(()=>applyMorphSet(mesh,{vertexCount:mesh.getTotalVertices(),morphTargetsRelative:true,targets:[{name:'invalid',deltas:[]}]}),/Invalid morph/);assert.deepEqual(counts(),beforeInvalidMorph);
 const n=mesh.getTotalVertices();applyMorphSet(mesh,{vertexCount:n,morphTargetsRelative:true,targets:[{name:'zero test',deltas:Array.from({length:n},()=>[0,0,0])}]});assert.equal(resources.morphManagers.size,1);
 // A caller-owned material/texture assigned after construction must survive disposal.
 if(i%2) (mesh.material as PBRMaterial).albedoTexture=texture; else mesh.material=shared;
 if(i%2){const model=adaptPipelineModel(scene,root);model.dispose();model.dispose();}
 else {root.dispose(false,false);root.dispose(false,false);}
 assert(resources.disposed);assert.equal(resources.materials.size+resources.textures.size+resources.skeletons.size+resources.morphManagers.size,0);assert.deepEqual(counts(),baseline);assert.equal(shared.albedoTexture,texture);assert(scene.materials.includes(shared));assert(scene.textures.includes(texture));
}
const broken={...payload,components:[{...component,material:'missing'}]};assert.throws(()=>createPipelineModel(scene,broken,{beam:()=>boxGeometry()},{textureSize:256}),/Missing material/);assert.deepEqual(counts(),baseline,'failed construction cleans only its own allocations');
for(const components of [[{...component,material:'missing'},{...component,id:'pending'}],[{...component,parent:'missing'},{...component,id:'pending'}]]) {
 assert.throws(()=>createPipelineModel(scene,{...payload,components},{beam:()=>boxGeometry(),pending:()=>boxGeometry()},{textureSize:256}),/Missing/);
 assert.deepEqual(counts(),baseline,'not-yet-linked pivots are disposed on failure');
}
for(const rep of [{id:'bad',parent:'missing'},{id:'bad',material:'missing'}]) {
 assert.throws(()=>createPipelineModel(scene,{...payload,repetitions:[rep]},{beam:()=>boxGeometry(),'repetition:bad':()=>boxGeometry()},{textureSize:256}),/Missing repetition/);
 assert.deepEqual(counts(),baseline,'repetition preflight creates no orphan mesh');
}
scene.dispose();engine.dispose();console.log(JSON.stringify({status:'PASS',cycles:6,checks:['unused and superseded materials/maps','skeletons','morph managers','shared resources survive','idempotent disposal','exception cleanup']}));
