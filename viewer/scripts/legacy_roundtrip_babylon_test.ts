/** Internal numerical fixture only: invokes the real emitter with intake validation mocked
 * in Python. Production CLI rejection is tested separately. No source/gates are edited. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NullEngine, Scene, Matrix, Vector3, StandardMaterial } from '@babylonjs/core';
import { buildSculpt } from '../src/sculpt/buildSculpt';
const canonical=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
const generated=await import(pathToFileURL(resolve(process.argv[3])).href);
const factory=Object.entries(generated).find(([k])=>/^create.+Model$/.test(k))![1] as Function;
const source=canonical.extensions['babylon-sculpt-v1'].source;
const engine=new NullEngine(),baselineScene=new Scene(engine),baseline=buildSculpt(baselineScene,source,{physics:false});
const compare=(a:ArrayLike<number>,b:ArrayLike<number>,label:string)=>{assert.equal(a.length,b.length,label);let err=0;for(let i=0;i<a.length;i++)err=Math.max(err,Math.abs(a[i]-b[i]));assert(err<2e-6,`${label}: ${err}`);return err;};
const reports=[];
for(const rightHanded of [true,false]){
 const scene=new Scene(engine);scene.useRightHandedSystem=rightHanded;
 const root=factory(scene),runtime=root.metadata.sculptRuntime;
 assert.equal(Object.keys(runtime.meshes).length,source.componentTree.length);
 assert.deepEqual(Object.keys(runtime.meshes),canonical.componentTree.map((c:any)=>c.id),'component order retained');
 let maxLocal=0,maxWorld=0,maxMatrix=0,vertices=0,triangles=0;
 for(const c of canonical.componentTree){const old=baseline.meshes[c.id],mesh=runtime.meshes[c.id];old.computeWorldMatrix(true);mesh.computeWorldMatrix(true);
  const p=old.getVerticesData('position')!,n=old.getVerticesData('normal')!,got=mesh.getVerticesData('position')!;
  const reflect=(v:ArrayLike<number>)=>Array.from(v,(x,i)=>rightHanded&&i%3===2?-x:x);
  maxLocal=Math.max(maxLocal,compare(got,reflect(p),c.id+' local'));
  compare(mesh.getVerticesData('normal'),reflect(n),c.id+' normals');
  compare(mesh.getVerticesData('uv')??[],old.getVerticesData('uv')??[],c.id+' UVs');
  const expectedIndices=c.geometryDescriptor.nativeVertexData.indices.slice();if(!rightHanded)for(let i=0;i<expectedIndices.length;i+=3)[expectedIndices[i+1],expectedIndices[i+2]]=[expectedIndices[i+2],expectedIndices[i+1]];
  assert.deepEqual(Array.from(mesh.getIndices()),expectedIndices,c.id+' exact scene winding');
  const signs=rightHanded?[1,1,-1,1]:[1,1,1,1];maxMatrix=Math.max(maxMatrix,compare(mesh.getWorldMatrix().asArray(),Array.from(old.getWorldMatrix().asArray(),(v,i)=>v*signs[i%4]*signs[Math.floor(i/4)]),c.id+' world matrix'));
  for(let i=0;i<p.length;i+=3){const a=Vector3.TransformCoordinates(Vector3.FromArray(p,i),old.getWorldMatrix()),b=Vector3.TransformCoordinates(Vector3.FromArray(got,i),mesh.getWorldMatrix());maxWorld=Math.max(maxWorld,compare(b.asArray(),[a.x,a.y,rightHanded?-a.z:a.z],c.id+' world vertex'));}
  assert.equal(mesh.material.id,c.material);assert(mesh.material instanceof StandardMaterial);assert.deepEqual(mesh.material.diffuseColor.asArray(),c.extensions['babylon-sculpt-v1'].source?canonical.materials.find((m:any)=>m.id===c.material).extensions['babylon-sculpt-v1'].baseColorRGB:[]);
  assert.equal(runtime.nodes[c.id].parent,c.parent===null?root:runtime.nodes[c.parent]);assert.deepEqual(runtime.nodes[c.id].scaling.asArray(),[1,1,1]);
  vertices+=p.length/3;triangles+=mesh.getTotalIndices()/3;
 }
 reports.push({rightHanded,components:source.componentTree.length,vertices,triangles,maxLocal,maxWorld,maxMatrix,materialIDs:canonical.materials.map((m:any)=>m.id)});
 root.dispose();assert.equal(scene.materials.length,0);assert.equal(scene.textures.length,0);assert.equal(scene.meshes.length,0);scene.dispose();
}
baseline.dispose();baselineScene.dispose();engine.dispose();console.log(JSON.stringify({status:'PASS',evidence:'internal numerical fixture, not intake/visual approval',reports}));
