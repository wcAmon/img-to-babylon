import { ArcRotateCamera, BaseTexture, Color3, Color4, CubeTexture, EquiRectangularCubeTexture, HDRCubeTexture, HDRFiltering, ImageProcessingConfiguration, Mesh, MultiMaterial, PBRMaterial, StandardMaterial, Scene } from '@babylonjs/core';
import { applyCaptureCamera, type CameraSpec } from './capture-camera';
import { createSourceToneProcess } from './capture-tonemapping';
import { CAPTURE_PASSES } from './capture-passes';
export interface RenderProfile {
  schemaVersion: string; kind: string; authority: string;
  renderer: {backend:string;colorManagementEnabled:boolean;workingColorSpace:string;outputColorSpace:string;toneMapping:string;toneMappingExposure:number;viewport:number[];devicePixelRatio:number;antialias:boolean};
  camera: CameraSpec;
  environment: {kind:string;source:string;intensity:number;files?:string[];prefilter?:string};
  background: {kind:string;color?:string;alpha?:number};
  passes: Array<{id:string;required:boolean;colorSpace:string}>;
  regions: Array<{id:string;idColor:number[];meshNames?:string[];materialNames?:string[]}>;
  extensions: {requiredSemanticRegions:string[]};
  feedbackGroups: Array<{id:string;order:number}>;
}
const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
export function validateCaptureProfile(p: RenderProfile): void {
  if(p.schemaVersion!=='render-profile.v2'||p.kind!=='threejs-render-profile'||p.authority!=='browser-threejs') throw new Error('source render-profile.v2 identity required');
  const r=p.renderer;
  if(r.backend!=='WebGLRenderer'||r.colorManagementEnabled!==true||r.workingColorSpace!=='Linear-sRGB'||r.outputColorSpace!=='SRGBColorSpace') throw new Error('source physical Linear-sRGB / SRGBColorSpace contract required');
  if(!['NoToneMapping','ACESFilmicToneMapping','NeutralToneMapping','AgXToneMapping'].includes(r.toneMapping)) throw new Error('unsupported source tone mapping');
  if(!finite(r.toneMappingExposure)||r.toneMappingExposure<=0||!finite(r.devicePixelRatio)||r.devicePixelRatio<=0||typeof r.antialias!=='boolean'||r.viewport.length!==2||!r.viewport.every(n=>Number.isInteger(n)&&n>0)) throw new Error('invalid renderer dimensions/exposure/antialias');
  if(!['none','pmrem-hdr','pmrem-equirectangular','pmrem-cubemap'].includes(p.environment.kind)||typeof p.environment.source!=='string'||!finite(p.environment.intensity)||p.environment.intensity<0) throw new Error('invalid environment');
  if(p.environment.kind!=='none'&&!p.environment.source) throw new Error('environment source required');
  if(p.background.alpha!==undefined&&(!finite(p.background.alpha)||p.background.alpha<0||p.background.alpha>1))throw new Error('invalid background alpha');
  if(!['solid','transparent','scene'].includes(p.background.kind)) throw new Error('invalid background');
  if(p.background.kind==='solid'&&!/^#[0-9a-fA-F]{6}$/.test(p.background.color??'')) throw new Error('solid background needs #RRGGBB');
  if(p.passes.length!==6||new Set(p.passes.map(x=>x.id)).size!==6||CAPTURE_PASSES.some(id=>!p.passes.some(x=>x.id===id&&x.required===true&&x.colorSpace===(id==='beauty'?'SRGBColorSpace':'NoColorSpace')))) throw new Error('six source passes and color spaces required');
  if(!p.regions.length||p.regions.length>65535||new Set(p.regions.map(x=>x.id)).size!==p.regions.length||p.regions.some(x=>!x.id||x.idColor.length!==3||!x.idColor.every(n=>Number.isInteger(n)&&n>=0&&n<=255))) throw new Error('unique regions and RGB byte palettes required');
  if(new Set(p.regions.map(x=>x.idColor.join(','))).size!==p.regions.length) throw new Error('duplicate semantic colors');
  if(!p.extensions.requiredSemanticRegions.length||new Set(p.extensions.requiredSemanticRegions).size!==p.extensions.requiredSemanticRegions.length||p.extensions.requiredSemanticRegions.some(id=>!p.regions.some(x=>x.id===id))) throw new Error('required semantic regions missing');
  const groups=['camera','silhouette','face','clothing','accessory','materials','lighting'];
  if(p.feedbackGroups.length!==7||groups.some((id,i)=>p.feedbackGroups[i].id!==id||p.feedbackGroups[i].order!==i+1)) throw new Error('source feedback group ordering required');
  if(p.camera.projection==='perspective'&&(!finite(p.camera.fovDegrees)||p.camera.fovDegrees!<=0||p.camera.fovDegrees!>=180))throw new Error('perspective fovDegrees required');
  if(!p.camera.position||!p.camera.target||!p.camera.near||!p.camera.far) throw new Error('complete profile camera required');
}
/** Stable IDs are derived from sorted profile region IDs, identical in both modes. */
export function applyRegionPalette(meshes: Mesh[], profile: RenderProfile): () => void {
  const sorted=profile.regions.map(r=>r.id).sort();
  const saved=meshes.map(m=>[m,m.metadata] as const);
  for(const mesh of meshes) {
    const authored=mesh.metadata?.capture??mesh.metadata?.gltf?.extras?.capture;
    const candidates=profile.regions.filter(r=>r.id===authored?.regionId||r.meshNames?.includes(mesh.name)||r.materialNames?.includes(mesh.material?.name??''));
    if(candidates.length!==1) {saved.forEach(([m,v])=>{m.metadata=v;});throw new Error(`unambiguous semantic region mapping required: ${mesh.name}`);}
    const region=candidates[0];
    mesh.metadata={...mesh.metadata,capture:{...authored,regionId:region.id,idColor:region.idColor,materialId:sorted.indexOf(region.id)+1}};
  }
  return ()=>saved.forEach(([m,v])=>{if(!m.isDisposed())m.metadata=v;});
}
async function loadEnvironment(scene: Scene, e: RenderProfile['environment']): Promise<BaseTexture|null> {
  if(e.kind==='none') return null;
  let texture: BaseTexture|undefined;
  try {
    await new Promise<void>((resolve,reject)=>{
      const ok=()=>resolve(), fail=(message?:string)=>reject(new Error(`environment load failed: ${message??e.source}`));
      if(e.kind==='pmrem-hdr') texture=new HDRCubeTexture(e.source,scene,256,false,true,false,false,ok,fail);
      else if(e.kind==='pmrem-equirectangular') texture=new EquiRectangularCubeTexture(e.source,scene,256,false,true,ok,fail);
      else texture=new CubeTexture(e.source,scene,undefined,false,e.files??null,ok,fail,undefined,/\.(env|dds)(\?|$)/i.test(e.source));
    });
    if(!/\.(env|dds)(\?|$)/i.test(e.source)) await new HDRFiltering(scene.getEngine()).prefilter(texture!);
    return texture!;
  } catch(error) {texture?.dispose();throw error;}
}
export function createProfileController(scene: Scene, camera: ArcRotateCamera, scale: number) {
  let restore: (()=>void)|undefined, active: RenderProfile|undefined;
  let generation=0, disposed=false;
  const materialRestores=new Map<object,()=>void>();
  function restoreMaterials(){materialRestores.forEach(fn=>fn());materialRestores.clear();}
  function bindMaterials(meshes:Mesh[]){
    if(!active)return;
    for(const mesh of meshes){
      const materials=mesh.material instanceof MultiMaterial?mesh.material.subMaterials:[mesh.material];
      for(const material of materials){
        if(!(material instanceof PBRMaterial||material instanceof StandardMaterial)||materialRestores.has(material))continue;
        const ipc=material.imageProcessingConfiguration;
        if(material instanceof PBRMaterial){
          const reflection=material.reflectionTexture,physical=material.usePhysicalLightFalloff;
          materialRestores.set(material,()=>{material.imageProcessingConfiguration=ipc;material.reflectionTexture=reflection;material.usePhysicalLightFalloff=physical;});
          material.reflectionTexture=null;material.usePhysicalLightFalloff=true;
        }else materialRestores.set(material,()=>{material.imageProcessingConfiguration=ipc;});
        material.imageProcessingConfiguration=scene.imageProcessingConfiguration;
      }
    }
  }
  return {
    get profile(){return active;},
    bindMaterials,
    releaseMaterials:restoreMaterials,
    async apply(profile: RenderProfile) {
      validateCaptureProfile(profile);
      if(!scene.getEngine().useExactSrgbConversions)throw new Error('source render profile requires engine useExactSrgbConversions=true');
      const aa=scene.getEngine().getCreationOptions().antialias??false;
      if(aa!==profile.renderer.antialias)throw new Error('profile antialias differs from immutable engine context; create engine with requested antialias');
      // Validate camera without mutating the shared camera.
      const check=new ArcRotateCamera('capture-profile-check',camera.alpha,camera.beta,camera.radius,camera.target,scene);
      try {applyCaptureCamera(check,{...profile.camera,coordinateFrame:profile.camera.coordinateFrame??'source-rh'},scale);} finally {check.dispose();}
      const token=++generation;
      const environment=await loadEnvironment(scene,profile.environment);
      if(disposed||token!==generation){environment?.dispose();throw new Error('profile load superseded/disposed');}
      restoreMaterials();restore?.();
      const engine=scene.getEngine(), ipc=scene.imageProcessingConfiguration;
      const savedIPC=ipc.clone(), savedEnv=scene.environmentTexture, intensity=scene.environmentIntensity, clear=scene.clearColor.clone();
      const originalProcesses=camera._postProcesses.slice();
      let sourceTone:ReturnType<typeof createSourceToneProcess>|undefined;
      const post=scene.postProcessesEnabled,fog=scene.fogEnabled;
      const width=engine.getRenderWidth(),height=engine.getRenderHeight(),hardware=engine.getHardwareScalingLevel();
      const cam={up:camera.upVector.clone(),alpha:camera.alpha,beta:camera.beta,radius:camera.radius,target:camera.target.clone(),fov:camera.fov,min:camera.minZ,max:camera.maxZ,mode:camera.mode,left:camera.orthoLeft,right:camera.orthoRight,top:camera.orthoTop,bottom:camera.orthoBottom};
      restore=()=>{
        sourceTone?.dispose(camera);originalProcesses.forEach((p,i)=>{if(p)camera.attachPostProcess(p,i);});
        ipc.isEnabled=savedIPC.isEnabled;ipc.toneMappingEnabled=savedIPC.toneMappingEnabled;ipc.toneMappingType=savedIPC.toneMappingType;ipc.exposure=savedIPC.exposure;ipc.contrast=savedIPC.contrast;
        ipc.colorCurvesEnabled=savedIPC.colorCurvesEnabled;ipc.colorGradingEnabled=savedIPC.colorGradingEnabled;ipc.vignetteEnabled=savedIPC.vignetteEnabled;ipc.ditheringEnabled=savedIPC.ditheringEnabled;ipc.applyByPostProcess=savedIPC.applyByPostProcess;ipc.skipFinalColorClamp=savedIPC.skipFinalColorClamp;
        scene.postProcessesEnabled=post;scene.fogEnabled=fog;
        scene.environmentTexture=savedEnv;scene.environmentIntensity=intensity;scene.clearColor.copyFrom(clear);
        engine.setHardwareScalingLevel(hardware);engine.setSize(width,height);
        camera.upVector=cam.up;camera.setTarget(cam.target);camera.alpha=cam.alpha;camera.beta=cam.beta;camera.radius=cam.radius;camera.fov=cam.fov;camera.minZ=cam.min;camera.maxZ=cam.max;camera.mode=cam.mode;
        camera.orthoLeft=cam.left;camera.orthoRight=cam.right;camera.orthoTop=cam.top;camera.orthoBottom=cam.bottom;environment?.dispose();
      };
      try {
        const r=profile.renderer;
        ipc.colorCurvesEnabled=false;ipc.colorGradingEnabled=false;ipc.vignetteEnabled=false;ipc.ditheringEnabled=false;ipc.applyByPostProcess=false;
        scene.postProcessesEnabled=false;scene.fogEnabled=false;
        ipc.isEnabled=true;ipc.toneMappingEnabled=r.toneMapping!=='NoToneMapping';
        ipc.toneMappingType=r.toneMapping==='NeutralToneMapping'?ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL:r.toneMapping==='ACESFilmicToneMapping'?ImageProcessingConfiguration.TONEMAPPING_ACES:ImageProcessingConfiguration.TONEMAPPING_STANDARD;
        // Source shader owns exposure, tone mapping and sRGB transfer exactly once.
        originalProcesses.forEach(p=>{if(p)camera.detachPostProcess(p);});
        ipc.toneMappingEnabled=false;ipc.applyByPostProcess=true;ipc.skipFinalColorClamp=true;
        ipc.exposure=1;ipc.contrast=1;scene.postProcessesEnabled=true;

        scene.environmentTexture=environment;scene.environmentIntensity=profile.environment.intensity;
        if(profile.background.kind==='transparent')scene.clearColor=new Color4(0,0,0,0);
        if(profile.background.kind==='solid'){const c=Color3.FromHexString(profile.background.color!);scene.clearColor=new Color4(c.r,c.g,c.b,profile.background.alpha??1);}
        // Solid Color backgrounds bypass source tone mapping and output transfer.
        // Clear the radiance target transparently; composite the declared display color last.
        const background=scene.clearColor.asArray() as [number,number,number,number];
        scene.clearColor=new Color4(0,0,0,0);
        sourceTone=createSourceToneProcess(camera,r.toneMapping,r.toneMappingExposure,background);
        engine.setHardwareScalingLevel(1/r.devicePixelRatio);engine.setSize(Math.round(r.viewport[0]*r.devicePixelRatio),Math.round(r.viewport[1]*r.devicePixelRatio));
        applyCaptureCamera(camera,{...profile.camera,coordinateFrame:profile.camera.coordinateFrame??'source-rh'},scale);active=profile;
        await scene.whenReadyAsync();
      }catch(error){restore();restore=undefined;active=undefined;throw error;}
    },
    restore(){++generation;restoreMaterials();restore?.();restore=undefined;active=undefined;},
    dispose(){disposed=true;++generation;restoreMaterials();restore?.();restore=undefined;active=undefined;},
  };
}
