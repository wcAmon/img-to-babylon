/** Executable numeric regression; optional output directory supplies Python gate fixtures. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Bone,Matrix,Mesh,MeshBuilder,MorphTarget,MorphTargetManager,NullEngine,Scene,Skeleton,Vector3,VertexBuffer,VertexData} from '@babylonjs/core';
import {exportMeshes} from './export_pipeline_mesh';
const near=(a:number[],b:number[])=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<2e-5,`${a} != ${b}`));};
let checks=0;
for(const sourceRH of [false,true]){
 const engine=new NullEngine();engine.getCaps().instancedArrays=true;const scene=new Scene(engine);scene.useRightHandedSystem=sourceRH;
 const m=new Mesh('colored',scene);const d=new VertexData();
 d.positions=[0,0,0,1,-1,0,1,0,-1];d.normals=Array(3).fill([1/Math.sqrt(3),1/Math.sqrt(3),1/Math.sqrt(3)]).flat();d.indices=[0,1,2];d.colors=[1,.2,.3,.4,.5,.6,.7,.8,.9,1,.1,.2];d.uvs=[0,0,1,0,1,1];d.applyToMesh(m);
 m.scaling.set(2,3,4);m.position.set(5,6,7);
 const instance=m.createInstance('copy');instance.position.set(-5,2,3);instance.scaling.set(-2,3,4);
 for(const target of ['right','left'] as const){const sign=sourceRH===(target==='right')?1:-1;
  const result=exportMeshes({colored:m},{handedness:target,include:'^colored$'});assert.equal(result.meshes.length,2);
  near(result.meshes[0].positions,[5,6,7*sign,7,3,7*sign,7,6,3*sign]);
  near(result.meshes[1].positions,[-5,2,3*sign,-7,-1,3*sign,-7,2,-sign]);
  const n=new Vector3(.5,1/3,.25).normalize();near(result.meshes[0].normals[0],[n.x,n.y,n.z*sign]);
  near(result.meshes[0].colors!,[1,.2,.3,.5,.6,.7,.9,1,.1]);near(result.meshes[0].colorAlpha!,[.4,.8,.2]);near(result.meshes[0].uvs,[0,0,1,0,1,1]);
  for(const r of result.meshes){const [a,b,c]=r.indices.map(i=>Vector3.FromArray(r.positions,i*3));const dot=Vector3.Dot(Vector3.Cross(b.subtract(a),c.subtract(a)),Vector3.FromArray(r.normals[0]));assert.ok(target==='right'?dot>0:dot<0);}
  checks++;
 }
 // Local hierarchy and thin transforms: local instance translation is scaled by base world.
 const parent=new Mesh('parent',scene);parent.position.set(10,20,30);m.parent=parent;
 m.thinInstanceAdd(Matrix.Translation(1,2,3));m.thinInstanceAdd(Matrix.Translation(-1,0,0));
 const thin=exportMeshes({colored:m},{handedness:sourceRH?'right':'left'});near(thin.meshes[0].vertices[0],[17,32,49]);near(thin.meshes[1].vertices[0],[13,26,37]);assert.equal(thin.meshes.length,3);
 parent.rotation.z=Math.PI/2;const rotated=exportMeshes({colored:m},{handedness:sourceRH?'right':'left'});near(rotated.meshes[0].vertices[0],[-2,27,49]);
 assert.throws(()=>exportMeshes({colored:m},{include:'^absent$'}));checks++;
 scene.dispose();engine.dispose();
}
{
 const engine=new NullEngine();engine.getCaps().instancedArrays=true;const scene=new Scene(engine);scene.useRightHandedSystem=true;
 const mesh=new Mesh('posed',scene);const d=new VertexData();d.positions=[0,0,0,1,0,0,0,1,0];d.normals=[0,0,1,0,0,1,0,0,1];d.indices=[0,1,2];d.matricesIndices=Array(3).fill([0,1,0,0]).flat();d.matricesWeights=Array(3).fill([.25,.75,0,0]).flat();d.applyToMesh(mesh);
 const manager=new MorphTargetManager(scene);const morph=new MorphTarget('shift',.5,scene);morph.setPositions([2,0,0,3,0,0,2,1,0]);manager.addTarget(morph);mesh.morphTargetManager=manager;
 const skeleton=new Skeleton('rig','rig',scene);const bone=new Bone('root',skeleton,null,Matrix.Identity());new Bone('stationary',skeleton,null,Matrix.Identity());mesh.skeleton=skeleton;bone.setRotationMatrix(Matrix.RotationX(Math.PI/2));
 const posed=exportMeshes({posed:mesh}).meshes[0];near(posed.positions,[1,0,0,2,0,0,1,.75,.25]);near(posed.normals[0],new Vector3(0,-.25,.75).normalize().asArray());near(Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!),d.positions);checks++;
 scene.dispose();engine.dispose();
}
if(process.argv[2]){
 const dir=resolve(process.argv[2]);mkdirSync(dir,{recursive:true});const engine=new NullEngine();engine.getCaps().instancedArrays=true;const scene=new Scene(engine);
 const a=MeshBuilder.CreateBox('a',{size:2},scene),b=MeshBuilder.CreateBox('b',{size:2},scene);b.position.x=.7;
 for(const m of [a,b])m.setVerticesData(VertexBuffer.ColorKind,Array(m.getTotalVertices()).fill([.2,.4,.6,1]).flat());
 writeFileSync(`${dir}/overlap.json`,JSON.stringify(exportMeshes({a,b})));
 b.position.x=5;writeFileSync(`${dir}/clean.json`,JSON.stringify(exportMeshes({a,b})));
 const open=new Mesh('open',scene);const d=new VertexData();d.positions=[0,0,0,1,0,0,0,1,0];d.normals=[0,0,1,0,0,1,0,0,1];d.indices=[0,1,2];d.applyToMesh(open);writeFileSync(`${dir}/open.json`,JSON.stringify(exportMeshes({open})));
 scene.dispose();engine.dispose();
}
console.log(JSON.stringify({passed:true,numericalCases:checks}));
