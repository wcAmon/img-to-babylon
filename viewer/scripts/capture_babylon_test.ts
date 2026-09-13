import {runCaptureOracleTests} from '../src/capture-oracle-tests';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ArcRotateCamera,Camera,Color4,Effect,MeshBuilder,NullEngine,Scene,StandardMaterial,TransformNode,Vector3} from '@babylonjs/core';
import {applyCaptureCamera} from '../src/capture-camera';
import {createPassController,CAPTURE_PASSES,packMaterialId} from '../src/capture-passes';
import {createReferenceController} from '../src/capture-reference';
import {createProfileController,validateCaptureProfile,applyRegionPalette,type RenderProfile} from '../src/capture-profile';
import {tinyCaptureGLB} from '../src/capture-fixture';
import {installCapture} from '../src/capture';
await runCaptureOracleTests();
const engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('camera',.3,.9,6,Vector3.Zero(),scene);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
for(const [az,el] of [[0,0],[35,20],[-35,-10],[90,0],[180,0]]){
 applyCaptureCamera(camera,{azimuthDegrees:az,elevationDegrees:el,distance:4,target:[1,2,3],fovDegrees:40,near:.01,far:100},2);
 const a=az*Math.PI/180,e=el*Math.PI/180,expected=[2+8*Math.cos(e)*Math.sin(a),4+8*Math.sin(e),6+8*Math.cos(e)*Math.cos(a)];
 camera.position.asArray().forEach((n,i)=>close(n,expected[i]));close(camera.fov,40*Math.PI/180);close(camera.minZ,.02);close(camera.maxZ,200);
}
applyCaptureCamera(camera,{alpha:.2,beta:1.1,radius:3,target:[4,5,6]},3);close(camera.alpha,.2);close(camera.radius,9);
applyCaptureCamera(camera,{position:[0,1,4],target:[0,1,0],projection:'orthographic',left:-2,right:2,top:3,bottom:-3},2);assert.equal(camera.mode,Camera.ORTHOGRAPHIC_CAMERA);close(camera.orthoTop!,6);
for(const spec of [{distance:-1},{fovDegrees:180},{near:5,far:2},{azimuthDegrees:0,alpha:1},{projection:'orthographic'}])assert.throws(()=>applyCaptureCamera(camera,spec));
const mesh=MeshBuilder.CreateBox('subject',{},scene),other=MeshBuilder.CreateBox('ground',{},scene),material=new StandardMaterial('original',scene);mesh.material=material;other.material=material;mesh.metadata={capture:{regionId:'body',idColor:[255,0,0],materialId:1}};
scene.clearColor=new Color4(.1,.2,.3,1);const clear=scene.clearColor.clone();
function sixPasses(subject:typeof mesh){const passes=createPassController(scene,()=>[subject]),count=scene.meshes.length,mats=scene.materials.length;
 for(const pass of CAPTURE_PASSES){passes.setPass(pass);if(pass!=='beauty'){assert.equal(subject.isVisible,false);assert.ok(scene.meshes.some(m=>m.name.startsWith(`capture-${pass}`)));scene.render();}passes.setPass('beauty');assert.equal(subject.isVisible,true);assert.ok(scene.clearColor.equals(clear));assert.equal(scene.meshes.length,count);assert.equal(scene.materials.length,mats);}passes.dispose();}
sixPasses(mesh);assert.deepEqual(packMaterialId(.35,258),[.35,1/255,2/255]);
const profile=JSON.parse(readFileSync(new URL('../../pipeline/docs/specs/render-profile.v2.example.json',import.meta.url),'utf8')) as RenderProfile;
profile.background={kind:'solid',color:'#eef2ff',alpha:1};
profile.environment={kind:'none',source:'',intensity:.7};profile.renderer.antialias=false;profile.regions=[{id:'body',idColor:[255,0,0],meshNames:['Triangle','subject']}];profile.extensions.requiredSemanticRegions=['body'];
validateCaptureProfile(profile);validateCaptureProfile({...profile,renderer:{...profile.renderer,toneMapping:'AgXToneMapping'}});
const profiles=createProfileController(scene,camera,2);
await assert.rejects(profiles.apply(profile),/useExactSrgbConversions/);
Object.defineProperty(engine,'useExactSrgbConversions',{value:true}); // NullEngine numerical harness, not a GPU conversion claim.
const exposure=scene.imageProcessingConfiguration.exposure;await profiles.apply(profile);close(camera.fov,25*Math.PI/180);
assert.deepEqual(scene.clearColor.asArray(),[0,0,0,0]);
const uniforms:Record<string,number[]|number>={};
camera._postProcesses.find(p=>p?.name.startsWith('img2babylonSourceTone183'))!.onApplyObservable.notifyObservers({setFloat:(n:string,v:number)=>{uniforms[n]=v;},setFloat4:(n:string,...v:number[])=>{uniforms[n]=v;}} as unknown as Effect);
assert.deepEqual(uniforms.sourceBackground,[238/255,242/255,1,1]);
profiles.restore();close(scene.imageProcessingConfiguration.exposure,exposure);
for(const [tone,type] of [['NoToneMapping',0],['ACESFilmicToneMapping',1],['NeutralToneMapping',2],['AgXToneMapping',0]] as const){await profiles.apply({...profile,renderer:{...profile.renderer,toneMapping:tone,toneMappingExposure:1.7}});assert.equal(scene.imageProcessingConfiguration.toneMappingType,type);close(scene.imageProcessingConfiguration.exposure,1);assert.equal(scene.imageProcessingConfiguration.applyByPostProcess,true);profiles.restore();}
await assert.rejects(profiles.apply({...profile,renderer:{...profile.renderer,antialias:true}}),/antialias/);
const ref=createReferenceController(scene,()=>[mesh],2),before=scene.meshes.length;await ref.switch({kind:'glb',data:tinyCaptureGLB(),expectedMeshCount:1});assert.equal(mesh.isVisible,false);
const imported=ref.meshes()[0];assert.ok(imported.skeleton);assert.ok(imported.morphTargetManager);const undo=applyRegionPalette(ref.meshes(),profile);
const positions=imported.getPositionData(true,true)!;close(positions[0],.3);close(positions[1],.1);
const passes=createPassController(scene,ref.meshes);passes.setPass('depth');const snapshot=scene.meshes.find(m=>m.name.startsWith('capture-depth'))!,data=snapshot.getVerticesData('position')!;close(data[0],.3);close(data[1],.1);passes.setPass('beauty');sixPasses(imported);undo();
await assert.rejects(ref.switch({kind:'glb',data:new Uint8Array([1,2,3])}));assert.equal(ref.mode,'reference');await ref.switch({kind:'procedural'});assert.equal(mesh.isVisible,true);assert.equal(scene.meshes.length,before);
await assert.rejects(ref.switch({kind:'glb',data:tinyCaptureGLB(),sha256:'0'.repeat(64)}),/hash mismatch/);
await ref.switch({kind:'glb',data:tinyCaptureGLB()});ref.dispose();assert.equal(scene.meshes.length,before);
const cancelled=createReferenceController(scene,()=>[mesh],2);const pending=cancelled.switch({kind:'glb',data:tinyCaptureGLB()});cancelled.dispose();await assert.rejects(pending,/superseded or disposed/);assert.equal(scene.meshes.length,before);
(globalThis as unknown as {window:object}).window={removeEventListener(){}};installCapture(scene,camera,{physicsScale:2,root:new TransformNode('root',scene),nodes:{},meshes:{mesh},bodies:{},constraints:[],dispose(){}});
await scene.whenReadyAsync();await new Promise(r=>setTimeout(r,200));assert.equal(window.__IMG2BABYLON_READY__,true);const api=window.__IMG2BABYLON_CAPTURE__!;api.beginCapture();assert.equal(scene.physicsEnabled,false);
await api.setRenderProfile(profile);const transition=api.setReferenceMode({kind:'glb',data:tinyCaptureGLB()});assert.equal(window.__IMG2BABYLON_READY__,false);await assert.rejects(api.capturePass({passId:'beauty'}),/transition/);await transition;for(const passId of CAPTURE_PASSES){await api.capturePass({passId,mode:'reference'});assert.equal(scene.postProcessesEnabled,passId==='beauty');}
await api.setReferenceMode({kind:'procedural'});for(const passId of CAPTURE_PASSES)await api.capturePass({passId});api.restoreRenderProfile();api.endCapture();assert.equal(scene.physicsEnabled,true);assert.ok(mesh.material===material);
scene.dispose();assert.equal(window.__IMG2BABYLON_READY__,false);engine.dispose();console.log('PASS: cameras, six passes, skinned+morph GLB deformed snapshots, switching/failure/disposal, profile and API restoration; NullEngine, no GPU pixels');
