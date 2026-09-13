/** Headless test helpers. Never imported by the viewer runtime. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {ArcRotateCamera,Matrix,MeshBuilder,NullEngine,PBRMaterial,RawTexture,Scene,ShaderMaterial,Vector3,Viewport} from '@babylonjs/core';
import {SOURCE_TONE_GLSL,agxLinear,sourceToneLinear,composeSourceTonePixel} from './capture-tonemapping';
import {applyCaptureCamera} from './capture-camera';
import {convertSolverCamera} from './capture-solver';
import {createPassController,expandCaptureInstances,sourceViewNormalMatrix} from './capture-passes';
import {tinyCaptureGLB} from './capture-fixture';
import {createReferenceController} from './capture-reference';
import {resolveCaptureRoughness,evaluateCaptureRoughness} from './capture-material';
export async function runCaptureOracleTests(){
 const close=(a:number,b:number,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
 const root=new URL('../../',import.meta.url);
 const official=readFileSync(new URL('.img2babylon/cli/three-oracle/node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js',root),'utf8').split('`')[1];
 assert.equal(SOURCE_TONE_GLSL,official,'portable GLSL differs from pinned MIT oracle');
 const mat=(name:string)=>{const body=official.match(new RegExp('const mat3 '+name+' = mat3\\(([\\s\\S]*?)\\);'))![1];return [...body.matchAll(/vec3\(\s*([^)]*)\)/g)].flatMap(m=>m[1].split(',').map(v=>Number(v.replace(/\s/g,''))));};
 const mul=(m:number[],v:number[])=>[0,1,2].map(r=>v.reduce((s,n,c)=>s+n*m[c*3+r],0));
 const contrastBody=official.match(/vec3 agxDefaultContrastApprox[\s\S]*?return ([\s\S]*?);/)![1];
 const contrast=new Function('x',`const x2=x*x,x4=x2*x2;return ${contrastBody};`) as (x:number)=>number;
 const min=Number(official.match(/AgxMinEv = ([^;]+)/)![1].replace(/\s/g,'')),max=Number(official.match(/AgxMaxEv = ([^;]+)/)![1].replace(/\s/g,''));
 for(const input of [[0,0,0],[.18,.18,.18],[1,.1,.01],[64,4,2],[-1,.5,8],[1e-9,1000,.8]] as [number,number,number][])for(const exposure of [.1,1,3.5]){
  let c=mul(mat('LINEAR_SRGB_TO_LINEAR_REC2020'),input.map(x=>x*exposure));c=mul(mat('AgXInsetMatrix'),c).map(x=>contrast(Math.max(0,Math.min(1,(Math.log2(Math.max(x,1e-10))-min)/(max-min)))));
  c=mul(mat('AgXOutsetMatrix'),c).map(x=>Math.max(0,x)**2.2);c=mul(mat('LINEAR_REC2020_TO_LINEAR_SRGB'),c).map(x=>Math.max(0,Math.min(1,x)));
  agxLinear(input,exposure).forEach((x,i)=>close(x,c[i],1e-12));
 }
 // ACES/Neutral scalar math is evaluated independently using source matrices and expressions.
 for(const input of [[0,0,0],[.18,.18,.18],[1,.1,.01],[64,4,2]] as [number,number,number][])for(const exposure of [.1,1,3.5]){
  let aces=mul(mat('ACESInputMat'),input.map(x=>x*exposure/.6));
  aces=aces.map(v=>(v*(v+.0245786)-.000090537)/(v*(.983729*v+.432951)+.238081));
  aces=mul(mat('ACESOutputMat'),aces).map(v=>Math.max(0,Math.min(1,v)));
  sourceToneLinear('ACESFilmicToneMapping',input,exposure).forEach((x,i)=>close(x,aces[i],1e-12));
  const neutralFunction=official.match(/vec3 NeutralToneMapping\( vec3 color \) \{([\s\S]*?)\n\}/)![1];
  assert.ok(neutralFunction.includes('color *= toneMappingExposure'));
  const c=input.map(v=>v*exposure),small=Math.min(...c),offset=small<.08?small-6.25*small**2:.04;
  let reference=c.map(v=>v-offset),peak=Math.max(...reference);
  if(peak>=.76){const newPeak=1-.24**2/(peak+.24-.76),g=1-1/(.15*(peak-newPeak)+1);reference=reference.map(v=>(v*newPeak/peak)*(1-g)+newPeak*g);}
  sourceToneLinear('NeutralToneMapping',input,exposure).forEach((x,i)=>close(x,reference[i],1e-12));
 }
 const declared:[number,number,number,number]=[238/255,242/255,1,1];
 for(const mode of ['AgXToneMapping','ACESFilmicToneMapping','NeutralToneMapping','NoToneMapping']){
  assert.deepEqual(composeSourceTonePixel([0,0,0,0],declared,mode,4),declared,'solid #eef2ff must bypass tone/exposure/transfer');
  assert.deepEqual(composeSourceTonePixel([0,0,0,0],[0,0,0,0],mode,4),[0,0,0,0]);
  const opaque=composeSourceTonePixel([.2,.1,.05,1],declared,mode,1);
  const half=composeSourceTonePixel([.1,.05,.025,.5],declared,mode,1);
  half.slice(0,3).forEach((v,i)=>close(v,(opaque[i]+declared[i])/2,1e-12));close(half[3],1);
 }
 const solver={imageWidth:640,imageHeight:480,fit:{cameraParameters:{position:[.2,.4,4],yawDegrees:17,pitchDegrees:-11,rollDegrees:23,fovDegrees:47}}};
 const landmarks=[[0,0,0],[.7,.5,.2],[-.3,.9,-.4]];
 const python=`import json\nfrom forge.stage1_intake.camera_fitting_math import project_landmark\nfrom forge.stage1_intake.camera_fitting_types import CameraParameters\nc=CameraParameters(640,480,47,17,-11,23,(.2,.4,4))\nprint(json.dumps([project_landmark(p,c) for p in ${JSON.stringify(landmarks)}]))`;
 const oracle=JSON.parse(execFileSync('/opt/homebrew/bin/python3.11',['-c',python],{cwd:new URL('pipeline/',root),encoding:'utf8'}));
 for(const rh of [false,true]){
  const engine=new NullEngine({renderWidth:640,renderHeight:480,textureSize:256,deterministicLockstep:false,lockstepMaxSteps:4});engine.getCaps().instancedArrays=true; // Permit CPU instance buffers in NullEngine; no GPU instancing claim.
  const scene=new Scene(engine);scene.useRightHandedSystem=rh;
  const camera=new ArcRotateCamera('oracle',0,1,4,Vector3.Zero(),scene);
  applyCaptureCamera(camera,convertSolverCamera({referenceCamera:solver}));
  landmarks.forEach((p,i)=>{const world=new Vector3(p[0],p[1],rh?p[2]:-p[2]);const actual=Vector3.Project(world,Matrix.Identity(),camera.getTransformationMatrix(),new Viewport(0,0,640,480));close(actual.x,oracle[i][0],1e-3);close(actual.y,oracle[i][1],1e-3);});
  const reference=createReferenceController(scene,()=>[],1);
  await reference.switch({kind:'glb',data:tinyCaptureGLB()});const triangle=reference.meshes()[0];triangle.computeWorldMatrix(true);
  const posed=triangle.getPositionData(true,true)!;
  for(let i=0;i<posed.length;i+=3){const actual=Vector3.TransformCoordinates(new Vector3(posed[i],posed[i+1],posed[i+2]),triangle.getWorldMatrix());close(actual.x,posed[i]);close(actual.y,posed[i+1]);close(actual.z,rh?posed[i+2]:-posed[i+2]);}
  const expectedWorld=new Vector3(.3,.1,0),actualWorld=Vector3.TransformCoordinates(Vector3.FromArray(Array.from(posed),0),triangle.getWorldMatrix());
  const projected=Vector3.Project(actualWorld,Matrix.Identity(),camera.getTransformationMatrix(),new Viewport(0,0,640,480));
  const sourceProjection=Vector3.Project(expectedWorld,Matrix.Identity(),camera.getTransformationMatrix(),new Viewport(0,0,640,480));close(projected.x,sourceProjection.x,1e-3);close(projected.y,sourceProjection.y,1e-3);
  const normal=Vector3.TransformNormal(new Vector3(0,0,1),sourceViewNormalMatrix(triangle.getWorldMatrix(),camera.getViewMatrix(),rh)).normalize();
  const yaw=17*Math.PI/180,pitch=-11*Math.PI/180,roll=23*Math.PI/180;
  const sourceNormal=[-Math.cos(roll)*Math.sin(yaw)*Math.cos(pitch)-Math.sin(roll)*Math.sin(pitch),-Math.sin(roll)*Math.sin(yaw)*Math.cos(pitch)+Math.cos(roll)*Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
  normal.asArray().forEach((n,i)=>close((n+1)/2,(sourceNormal[i]+1)/2));assert.ok(normal.z>0,'source front normal must encode blue high');
  reference.dispose();
  const descriptor={...solver,fit:undefined,position:{hint:[.2,.4,4]},fovDegrees:{value:47},orientation:{yawDegrees:{value:17},pitchDegrees:{value:-11},rollDegrees:{value:23}}};
  assert.deepEqual(convertSolverCamera(descriptor),convertSolverCamera(solver));
  applyCaptureCamera(camera,{coordinateFrame:'source-rh',azimuthDegrees:35,elevationDegrees:10,target:[1,2,3],distance:4});close(camera.target.z,rh?3:-3);
  applyCaptureCamera(camera,{alpha:.2,beta:1,radius:4,target:[1,2,3]});close(camera.target.z,3);
  const mesh=MeshBuilder.CreateBox('instances',{},scene);mesh.position.x=4;mesh.metadata={capture:{regionId:'body',idColor:[255,0,0],materialId:1}};
  mesh.thinInstanceAdd([Matrix.Translation(1,0,0),Matrix.Translation(0,2,0)]);const worlds=expandCaptureInstances(mesh);assert.equal(worlds.length,2);close(worlds[0].getTranslation().x,5);
  const pass=createPassController(scene,()=>[mesh]);pass.setPass('normal');const shots=scene.meshes.filter(m=>m.name.startsWith('capture-normal'));assert.equal(shots.length,2);close(shots[0].getWorldMatrix().getTranslation().x,5);pass.setPass('beauty');
  mesh.thinInstanceSetBuffer('matrix',null);const instance=mesh.createInstance('regular');instance.position.x=9;assert.equal(expandCaptureInstances(mesh).length,2);pass.setPass('depth');assert.equal(scene.meshes.filter(m=>m.name.startsWith('capture-depth')).length,2);pass.setPass('beauty');
  const pbr=new PBRMaterial('maps',scene);pbr.metallic=0;pbr.roughness=.6;mesh.material=pbr;
  const texture=RawTexture.CreateRGBATexture(new Uint8Array([64,128,255,255]),1,1,scene,false,false);pbr.microSurfaceTexture=texture;
  assert.equal(resolveCaptureRoughness(pbr)[0].channel,'r');assert.equal(resolveCaptureRoughness(pbr)[0].operation,'multiply-roughness');
  pbr.metadata={captureRoughness:{texture,channel:'g',operation:'multiply-roughness'}};assert.equal(resolveCaptureRoughness(pbr)[0].channel,'g');
  pass.setPass('roughness-material-id');assert.ok(scene.meshes.filter(m=>m.name.startsWith('capture-roughness')).every(m=>m.material?.getActiveTextures().includes(texture)));pass.setPass('beauty');
  const {convertMaterial}=await import('./pipeline/objectConversion');
  const converted=convertMaterial({roughness:.6,metalness:0,roughnessMap:{image:{data:new Uint8Array([64,128,255,255]),width:1,height:1},channel:1,repeat:{x:2,y:3},offset:{x:.2,y:.3}}},scene);
  const bindings=resolveCaptureRoughness(converted);assert.equal(bindings.length,1);assert.equal(bindings[0].channel,'g');assert.equal(bindings[0].texture.coordinatesIndex,1);close(evaluateCaptureRoughness(.6,bindings,[[64/255,128/255,1,1]]),.6*128/255);
  mesh.material=converted;pass.setPass('roughness-material-id');
  const diagnostic=scene.meshes.find(m=>m.name.startsWith('capture-roughness'))!.material as ShaderMaterial;
  assert.ok((diagnostic.shaderPath as {fragmentSource:string}).fragmentSource.includes('roughness*=texture2D(roughSampler0,vRoughUV0).g'));
  assert.ok(diagnostic.getActiveTextures().includes(bindings[0].texture));pass.setPass('beauty');
  scene.dispose();engine.dispose();
 }
 console.log('PASS: source AgX/ACES/Neutral numeric samples, exact solid/alpha background, GLB H_Z world pose and source-view normals, Python solver landmark projections in RH/LH with roll, instance expansion, per-pixel roughness bindings');
}
