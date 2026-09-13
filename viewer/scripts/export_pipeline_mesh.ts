/** Reusable headless numeric export. No browser state, shader displacement or pixels. */
import { Matrix, Mesh, Vector3, VertexBuffer } from '@babylonjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ExportOptions { handedness?: 'right'|'left'; include?: string; modelId?: string }
const numbers = (v:ArrayLike<number>|null, label:string):number[] => {
  if(!v?.length)throw new Error(`${label}: missing data`);
  const out=Array.from(v);if(!out.every(Number.isFinite))throw new Error(`${label}: nonfinite data`);return out;
};
/** One global orientation conversion, never per-face repair of a defective surface. */
function baseOrientation(mesh:Mesh, indices:number[]) {
  const p=numbers(mesh.getVerticesData(VertexBuffer.PositionKind),'base positions');
  const n=numbers(mesh.getVerticesData(VertexBuffer.NormalKind),'base normals');
  let positive=0,negative=0,score=0;
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3);
    const cross=Vector3.Cross(Vector3.FromArray(p,b*3).subtract(Vector3.FromArray(p,a*3)),Vector3.FromArray(p,c*3).subtract(Vector3.FromArray(p,a*3)));
    const normal=Vector3.FromArray(n,a*3).add(Vector3.FromArray(n,b*3)).add(Vector3.FromArray(n,c*3));
    const dot=Vector3.Dot(cross,normal);if(dot>1e-14)positive++;else if(dot< -1e-14)negative++;score+=dot;
  }
  if(!positive&&!negative)throw new Error(`${mesh.name}: no nondegenerate normal/winding evidence`);
  return {sign:score>=0?1:-1,inconsistentTriangles:Math.min(positive,negative)};
}
export function exportMeshes(meshes:Record<string,Mesh>, options:ExportOptions={}) {
  const handedness=options.handedness??'right';
  if(!['right','left'].includes(handedness))throw new Error('handedness must be right or left');
  const filter=options.include===undefined?null:new RegExp(options.include);
  const excluded:{componentId:string;placementId?:string;reason:string}[]=[];
  const records=[];
  for(const [componentId,mesh] of Object.entries(meshes)) {
    if(filter&&!filter.test(componentId)){excluded.push({componentId,reason:'include-regex'});continue;}
    if(mesh.isDisposed())throw new Error(`${componentId}: disposed mesh`);
    const world=mesh.computeWorldMatrix(true);
    mesh.skeleton?.prepare(true);
    // Babylon public CPU evaluation applies morph first, then weighted bone palette.
    const positions=numbers(mesh.getPositionData(true,true),`${componentId} positions`);
    const normals=numbers(mesh.getNormalsData(true,true),`${componentId} normals`);
    if(positions.length%3||normals.length!==positions.length)throw new Error('invalid position/normal strides');
    const indices=numbers(mesh.getIndices(),`${componentId} indices`);
    if(indices.length%3||indices.some(i=>!Number.isInteger(i)||i<0||i>=positions.length/3))throw new Error('invalid triangle indices');
    const orientation=baseOrientation(mesh,indices);
    const uv=Array.from(mesh.getVerticesData(VertexBuffer.UVKind)??[]);
    if(uv.length&&uv.length!==positions.length/3*2||!uv.every(Number.isFinite))throw new Error('invalid UV channel');
    const rawColors=mesh.getVerticesData(VertexBuffer.ColorKind),stride=mesh.getVertexBuffer(VertexBuffer.ColorKind)?.getSize()??4;
    if(rawColors&&(![3,4].includes(stride)||rawColors.length!==positions.length/3*stride))throw new Error('invalid color stride');
    const packedColors=rawColors?Array.from(rawColors):null;
    const colors=packedColors?Array.from({length:positions.length/3},(_,i)=>packedColors.slice(i*stride,i*stride+3)).flat():null;
    const alpha=rawColors&&stride===4?Array.from({length:positions.length/3},(_,i)=>rawColors[i*stride+3]):null;
    if(colors&&!colors.every(Number.isFinite)||alpha&&!alpha.every(Number.isFinite))throw new Error('nonfinite colors');
    const placements:{id:string;world:Matrix}[]=[];
    if(mesh.isEnabled()&&mesh.isVisible){
      if(mesh.hasThinInstances)mesh.thinInstanceGetWorldMatrices().forEach((m,i)=>placements.push({id:`${componentId}:instance:${i}`,world:m.multiply(world)}));
      else placements.push({id:componentId,world});
    }else excluded.push({componentId,placementId:componentId,reason:'disabled-or-invisible-base'});
    for(const instance of mesh.instances){const id=`${componentId}:instance:${instance.name}`;
      if(instance.isEnabled()&&instance.isVisible)placements.push({id,world:instance.computeWorldMatrix(true)});
      else excluded.push({componentId,placementId:id,reason:'disabled-or-invisible-instance'});
    }
    const sourceHandedness=mesh.getScene().useRightHandedSystem?'right':'left';
    const reflect=sourceHandedness!==handedness;
    for(const placement of placements){
      const det=placement.world.determinant();if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw new Error(`${placement.id}: singular world transform`);
      const normalMatrix=Matrix.Transpose(Matrix.Invert(placement.world));
      const vertices:number[][]=[],worldNormals:number[][]=[];let zeroNormals=0;
      for(let i=0;i<positions.length;i+=3){
        const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),placement.world);
        const n=Vector3.TransformNormal(Vector3.FromArray(normals,i),normalMatrix);
        if(n.lengthSquared()<1e-20)zeroNormals++;else n.normalize();
        if(reflect){p.z=-p.z;n.z=-n.z;}vertices.push(p.asArray());worldNormals.push(n.asArray());
      }
      const flipped=orientation.sign*Math.sign(det)*(reflect?-1:1)!==(handedness==='right'?1:-1);
      const converted=indices.slice();if(flipped)for(let i=0;i<converted.length;i+=3)[converted[i+1],converted[i+2]]=[converted[i+2],converted[i+1]];
      const localToOutput=reflect?placement.world.multiply(Matrix.Scaling(1,1,-1)):placement.world;
      records.push({id:placement.id,name:placement.id,componentId,vertices,positions:vertices.flat(),normals:worldNormals,
        worldNormals:worldNormals.flat(),colors,colorAlpha:alpha,indices:converted,uvs:uv,materialId:mesh.material?.id??null,
        vertexCount:vertices.length,triangleCount:converted.length/3,worldMatrix:localToOutput.asArray(),
        matrixConvention:'column-major; source-local coordinates to output-world coordinates',
        sourceHandedness,windingFlipped:flipped,baseWindingInconsistentTriangles:orientation.inconsistentTriangles,zeroNormals,
        normalConvention:'Babylon current morph/skin normals; inverse-transpose instance world; normalized; output Z reflection',
        colorConvention:'raw vertex RGB (no gamma conversion, material multiplication or texture sampling); alpha separate'});
    }
  }
  if(!records.length)throw new Error('no selected visible mesh placements; no empty success');
  if(new Set(records.map(r=>r.id)).size!==records.length)throw new Error('duplicate placement IDs');
  return {schemaVersion:1,engine:'Babylon.js',modelId:options.modelId??null,
    coordinateFrame:{handedness,up:'y',units:'metres'},winding:handedness==='right'?'CCW':'CW',
    geometryStage:'current-pose-world',poseScope:'supplied in-memory pose; CLI creates registered factory default, physics=false, no animation advance',
    limitations:['No live browser state, pixels, texture colors or GPU-only displacement.','Bone normals use Babylon CPU palette semantics; no geometric surface repair.'],
    selection:{include:options.include??null,sourceComponents:Object.keys(meshes).length,exportedPlacements:records.length,excluded},meshes:records};
}
export async function main(args=process.argv.slice(2)) {
  if(args.includes('--help')){console.log('export_pipeline_mesh.ts [MODEL OUTPUT] [--model ID] --out OUTPUT [--include COMPONENT_ID_REGEX] [--handedness right|left]\nDefault model: sample-crate. Default output convention: canonical RH. Headless factory default pose only.');return;}
  const values:Record<string,string>={},positional:string[]=[];
  for(let i=0;i<args.length;i++)if(args[i].startsWith('--')){
    if(!['--model','--out','--include','--handedness'].includes(args[i])||args[i+1]===undefined)throw new Error(`invalid option ${args[i]}`);
    if(values[args[i]]!==undefined)throw new Error('duplicate option');values[args[i]]=args[++i];
  }else positional.push(args[i]);
  if(positional.length>2||(positional.length&&values['--model'])||(positional.length===2&&values['--out']))throw new Error('ambiguous positional/options');
  const id=values['--model']??positional[0]??'sample-crate',output=values['--out']??positional[1];
  if(!output)throw new Error('--out or positional OUTPUT required');
  const handedness=values['--handedness']??'right';if(handedness!=='right'&&handedness!=='left')throw new Error('handedness must be right or left');
  if(values['--include'])new RegExp(values['--include']);
  const {registry}=await import('../src/registry');if(!registry[id])throw new Error(`unknown registered model ${id}`);
  const {createHeadlessScene}=await import('../src/headless');const ctx=await createHeadlessScene();
  try{ctx.scene.getEngine().getCaps().instancedArrays=true;
    const model=(await registry[id]()).default(ctx.scene,{physics:false});try{
    const result=exportMeshes(model.meshes,{modelId:id,handedness,include:values['--include']});
    mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2));
    console.log(JSON.stringify({modelId:id,placements:result.meshes.length,handedness,output}));
  }finally{model.dispose();}}finally{ctx.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e);process.exitCode=2;});
