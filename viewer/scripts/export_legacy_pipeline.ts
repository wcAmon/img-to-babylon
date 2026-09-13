/** Export actual legacy createGeometry meshes, or verify a canonical import bridge.
 * node --import tsx scripts/export_legacy_pipeline.ts source.json output.json [--verify canonical.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { NullEngine, Scene, Matrix, Mesh, TransformNode, Vector3, Quaternion, VertexData, VertexBuffer } from '@babylonjs/core';
import { createGeometry } from '../src/sculpt/geometry';
import type { SculptSpec, SculptComponent } from '../src/sculpt/types';

const EXT = 'babylon-sculpt-v1';
const rh = (a: number[]) => a.map((v, i) => i % 3 === 2 ? -v : v);
const arr = (v: ArrayLike<number> | null) => v ? Array.from(v) : [];
function dataOf(mesh: Mesh) {
  return { positions: arr(mesh.getVerticesData(VertexBuffer.PositionKind)),
    normals: arr(mesh.getVerticesData(VertexBuffer.NormalKind)),
    uvs: arr(mesh.getVerticesData(VertexBuffer.UVKind)), indices: arr(mesh.getIndices()) };
}
function nodesFor(spec: SculptSpec, scene: Scene) {
  const nodes = new Map<string, TransformNode>();
  for (const c of spec.componentTree) {
    assert(!nodes.has(c.id), 'duplicate component');
    assert(['box','ellipsoid','loft','patch'].includes(c.geometry.kind), 'unsupported geometry; no fallback');
    nodes.set(c.id,new TransformNode(c.id,scene));
  }
  for (const c of spec.componentTree) {
    let parent = c.parent;
    const seen = new Set([c.id]);
    while (parent !== null) {
      assert(nodes.has(parent),'missing parent'); assert(!seen.has(parent),'cycle'); seen.add(parent);
      parent=spec.componentTree.find(n=>n.id===parent)!.parent;
    }
    const n=nodes.get(c.id)!;
    n.parent=c.parent===null?null:nodes.get(c.parent)!;
    n.position=Vector3.FromArray(c.transform.position);
    n.rotation=Vector3.FromArray(c.transform.rotation);
    // Exact buildSculpt semantics: authored scale and extra pivot fields are ignored.
  }
  return nodes;
}
function nativeData(c:SculptComponent, scene:Scene) {
  const mesh=createGeometry(c,scene,1), source=dataOf(mesh);
  const positions=rh(source.positions),normals=rh(source.normals),indices=[...source.indices];
  const windingFlippedTriangles:number[]=[];
  // Canonical RH CCW must agree with preserved physical normals. Babylon LH
  // ComputeNormals is negative-cross: LH→CCW and det(H)=-1 cancel for its meshes.
  // Normalize any oppositely authored triangles explicitly and record the swap.
  for(let i=0;i<indices.length;i+=3) {
    const [a,b,d]=indices.slice(i,i+3);
    const va=Vector3.FromArray(positions,a*3),vb=Vector3.FromArray(positions,b*3),vc=Vector3.FromArray(positions,d*3);
    const cross=Vector3.Cross(vb.subtract(va),vc.subtract(va));
    const normal=Vector3.FromArray(normals,a*3).add(Vector3.FromArray(normals,b*3)).add(Vector3.FromArray(normals,d*3));
    if(Vector3.Dot(cross,normal)<0) {
      [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];windingFlippedTriangles.push(i/3);
    }
  }
  mesh.dispose();
  return {version:1,coordinateSystem:{handedness:'right',up:'Y',units:'m'},space:'component-local',
    dimensionsBaked:true,transformBaked:false,winding:'CCW-normal-consistent',
    positions,normals,uvs:source.uvs,indices,windingFlippedTriangles,
    provenance:{builder:'viewer/src/sculpt/geometry.ts:createGeometry',physicsScale:1,
      normalConversion:'H*n; normalize triangle winding against normals',uvConversion:'unchanged; absent channel is []'}};
}
function compare(a:number[],b:number[], label:string, tolerance=2e-6) {
  assert.equal(a.length,b.length,label+' length');
  let error=0;
  for(let i=0;i<a.length;i++){ assert(Number.isFinite(a[i])&&Number.isFinite(b[i]),label+' finite');error=Math.max(error,Math.abs(a[i]-b[i])); }
  assert(error<tolerance,`${label}: ${error}`); return error;
}
function verify(spec:SculptSpec, canonical:any, sourceScene:Scene, engine:NullEngine) {
  assert.deepEqual(canonical.extensions[EXT].source,spec,'lossless source');
  const scene=new Scene(engine);scene.useRightHandedSystem=true;
  const sourceNodes=nodesFor(spec,sourceScene);
  const nodes=new Map<string,TransformNode>();
  assert.deepEqual(canonical.componentTree.map((c:any)=>c.id),spec.componentTree.map(c=>c.id));
  for(const c of canonical.componentTree) nodes.set(c.id,new TransformNode(c.id,scene));
  for(const c of canonical.componentTree) {
    const n=nodes.get(c.id)!; n.parent=c.parent===null?null:nodes.get(c.parent)!;
    n.position=Vector3.FromArray(c.transform.position);
    n.rotationQuaternion=Quaternion.FromArray(c.extensions[EXT].nativeTransform.rotationQuaternion);
    n.scaling=Vector3.FromArray(c.transform.scale);
    compare(arr(Matrix.Compose(n.scaling,n.rotationQuaternion,n.position).m),c.extensions[EXT].nativeTransform.localMatrix,'Python local matrix');
  }
  let maxLocalError=0,maxWorldError=0,maxMatrixError=0,totalVertices=0,totalTriangles=0;
  for(const c of canonical.componentTree) {
    const original=spec.componentTree.find(v=>v.id===c.id)!;
    assert.deepEqual(c.extensions[EXT].source,original);
    const source=createGeometry(original,sourceScene,1);source.parent=sourceNodes.get(c.id)!;
    source.computeWorldMatrix(true);
    const src=dataOf(source), d=c.geometryDescriptor.nativeVertexData;
    assert(d,'native data required for runtime verification');
    const vd=new VertexData();vd.positions=d.positions;vd.normals=d.normals;vd.uvs=d.uvs.length?d.uvs:null;vd.indices=d.indices;
    const mesh=new Mesh(c.id,scene);vd.applyToMesh(mesh);mesh.parent=nodes.get(c.id)!;mesh.computeWorldMatrix(true);
    const got=dataOf(mesh);
    maxLocalError=Math.max(maxLocalError,compare(got.positions,rh(src.positions),'local vertices'));
    compare(got.normals,rh(src.normals),'reflected normals');compare(got.uvs,src.uvs,'UV roundtrip');
    const restored=[...got.indices];
    for(const t of d.windingFlippedTriangles) [restored[t*3+1],restored[t*3+2]]=[restored[t*3+2],restored[t*3+1]];
    assert.deepEqual(restored,src.indices,'triangle roundtrip');
    const signs=[1,1,-1,1],world=arr(source.getWorldMatrix().m);
    const expectedWorld=world.map((v,i)=>v*signs[i%4]*signs[Math.floor(i/4)]);
    maxMatrixError=Math.max(maxMatrixError,compare(arr(mesh.getWorldMatrix().m),expectedWorld,'H world H'));
    // Check independently reconstructed local matrix against the Python adapter.
    compare(arr(nodes.get(c.id)!.getWorldMatrix().m),expectedWorld,'pivot hierarchy');
    for(let i=0;i<got.positions.length;i+=3) {
      const a=Vector3.TransformCoordinates(Vector3.FromArray(src.positions,i),source.getWorldMatrix());
      const b=Vector3.TransformCoordinates(Vector3.FromArray(got.positions,i),mesh.getWorldMatrix());
      maxWorldError=Math.max(maxWorldError,compare(b.asArray(),[a.x,a.y,-a.z],'world vertex'));
    }
    // Triangle geometric normals must agree with the reflected shading normals.
    for(let i=0;i<got.indices.length;i+=3) {
      const [a,b,c]=got.indices.slice(i,i+3);
      const va=Vector3.FromArray(got.positions,a*3),vb=Vector3.FromArray(got.positions,b*3),vc=Vector3.FromArray(got.positions,c*3);
      const n=Vector3.FromArray(got.normals,a*3).add(Vector3.FromArray(got.normals,b*3)).add(Vector3.FromArray(got.normals,c*3));
      assert(Vector3.Dot(Vector3.Cross(vb.subtract(va),vc.subtract(va)),n)>=-1e-10,'winding/normal mismatch');
    }
    totalVertices+=got.positions.length/3;totalTriangles+=got.indices.length/3;
    mesh.dispose();source.dispose();
  }
  scene.dispose();
  return {passed:true,components:spec.componentTree.length,totalVertices,totalTriangles,maxLocalError,maxWorldError,maxMatrixError,
    evidenceBoundary:'procedural import and numeric roundtrip only; no intake, material rendering, physics or visual acceptance'};
}
function main() {
  const [input,output,flag,canonicalFile]=process.argv.slice(2);
  assert(input&&output,'expected source.json output.json [--verify canonical.json]');
  assert(flag===undefined || (flag==='--verify'&&canonicalFile),'invalid arguments');
  assert.notEqual(resolve(input),resolve(output),'must not overwrite source');
  if(canonicalFile)assert.notEqual(resolve(canonicalFile),resolve(output),'must not overwrite canonical input');
  const source=JSON.parse(readFileSync(input,'utf8'));
  assert([1,'1'].includes(source.schemaVersion));assert.equal(source.coordinateFrame.units,'m');
  assert(['left','LH',undefined].includes(source.coordinateFrame.handedness),'source must be LH');
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    // Check hierarchy even for export-only callers, before baking any meshes.
    nodesFor(source,scene);
    const result=flag==='--verify'?verify(source,JSON.parse(readFileSync(canonicalFile,'utf8')),scene,engine):
      {format:'legacy-procedural-export',version:1,source,
       provenance:{geometrySha256:createHash('sha256').update(readFileSync(new URL('../src/sculpt/geometry.ts',import.meta.url))).digest('hex'),
         sourceSha256:createHash('sha256').update(readFileSync(input)).digest('hex'),engine:'Babylon NullEngine'},
       components:source.componentTree.map((c:SculptComponent)=>({id:c.id,nativeVertexData:nativeData(c,scene)}))};
    writeFileSync(output,JSON.stringify(result));
    console.log(flag==='--verify'?JSON.stringify(result):`Exported ${source.componentTree.length} procedural components`);
  } finally {scene.dispose();engine.dispose();}
}
try {main();} catch(error) {console.error(error);process.exitCode=1;}
