import { resolveCaptureRoughness } from './capture-material';
import { Color4, Material, Matrix, Mesh, MultiMaterial, PBRMaterial, Scene, ShaderMaterial, StandardMaterial, Vector3, VertexBuffer, VertexData } from '@babylonjs/core';
/** Babylon thin matrices are local, while regular instance getWorldMatrix is absolute. */
export function expandCaptureInstances(source:Mesh):Matrix[] {
  source.computeWorldMatrix(true);
  if(source.hasThinInstances)return source.isVisible?source.thinInstanceGetWorldMatrices().slice(0,source.thinInstanceCount).map(m=>m.multiply(source.getWorldMatrix())):[];
  return [...(source.isVisible?[source.getWorldMatrix().clone()]:[]),...source.instances.filter(i=>i.isEnabled()&&i.isVisible).map(i=>i.computeWorldMatrix(true).clone())];
}
/** Convert native view coordinates back to the source RH view normal convention. */
export function sourceViewNormalMatrix(world:Matrix,view:Matrix,rightHanded:boolean):Matrix {
  const normal=Matrix.Transpose(world.multiply(view).invert());
  return rightHanded?normal:normal.multiply(Matrix.Scaling(1,1,-1));
}
export const CAPTURE_PASSES = ['beauty', 'alpha-silhouette', 'semantic-id', 'depth', 'normal', 'roughness-material-id'] as const;
export type PassId = typeof CAPTURE_PASSES[number];
/** R=perceptual roughness; G/B=big-endian unsigned 16-bit stable region/material ID. */
export function packMaterialId(roughness: number, id: number): [number,number,number] {
  if (!Number.isFinite(roughness) || roughness < 0 || roughness > 1 || !Number.isInteger(id) || id < 1 || id > 65535) throw new Error('invalid roughness/material ID');
  return [roughness, (id >> 8)/255, (id & 255)/255];
}
export function createPassController(scene: Scene, subjectMeshes: () => Mesh[]) {
  let restore: (() => void) | undefined;
  let current: PassId = 'beauty';
  function beauty() { restore?.(); restore = undefined; current = 'beauty'; }
  return {
    get current() { return current; }, dispose: beauty,
    setPass(passId: string) {
      beauty();
      if (!(CAPTURE_PASSES as readonly string[]).includes(passId)) throw new Error(`unknown capture pass: ${passId}`);
      if (passId === 'beauty') return;
      const originals = subjectMeshes().filter(m => m.isEnabled() && (m.isVisible||m.instances.some(i=>i.isEnabled()&&i.isVisible)) && m.getTotalVertices() > 0);
      if (!originals.length) throw new Error('diagnostic capture has no ready subject meshes');
      const placements=new Map(originals.map(m=>[m,expandCaptureInstances(m)]));
      const visible = scene.meshes.map(m => [m, m.isVisible] as const);
      const clear = scene.clearColor.clone(), post = scene.postProcessesEnabled, fog = scene.fogEnabled;
      const particles = scene.particlesEnabled, sprites = scene.spritesEnabled;
      const layers=scene.layers.map(l=>[l,l.isEnabled] as const);
      const effects = scene.effectLayers.map(e => [e,e.isEnabled] as const);
      const snapshots: Mesh[] = [], materials: Material[] = [];
      restore = () => {
        snapshots.forEach(m => m.dispose()); materials.forEach(m => m.dispose());
        visible.forEach(([m,v]) => { if (!m.isDisposed()) m.isVisible=v; });
        scene.clearColor.copyFrom(clear); scene.postProcessesEnabled=post; scene.fogEnabled=fog;
        scene.particlesEnabled=particles; scene.spritesEnabled=sprites;
        effects.forEach(([e,v])=>{e.isEnabled=v;});layers.forEach(([l,v])=>{l.isEnabled=v;});
      };
      try {
        scene.clearColor=new Color4(0,0,0,0); scene.postProcessesEnabled=false; scene.fogEnabled=false;
        scene.particlesEnabled=false; scene.spritesEnabled=false; effects.forEach(([e])=>{e.isEnabled=false;});layers.forEach(([l])=>{l.isEnabled=false;});
        visible.forEach(([m])=>{m.isVisible=false;});
        for (const source of originals) {
          source.computeWorldMatrix(true); source.skeleton?.prepare();
          const positions=source.getPositionData(true,true), normals=source.getNormalsData(true,true);
          if (!positions || !normals) throw new Error(`diagnostic positions/normals unavailable: ${source.name}`);

          const groups = source.material instanceof MultiMaterial ? source.subMeshes.map(s=>({material:s.getMaterial(),start:s.indexStart,count:s.indexCount})) : [{material:source.material,start:0,count:source.getTotalIndices()}];
          for(const [instanceIndex,world] of placements.get(source)!.entries()){
          for (const [groupIndex,group] of groups.entries()) {
            const original=group.material;
            const meta=original?.metadata?.capture ?? source.metadata?.capture ?? source.metadata?.gltf?.extras?.capture;
            if ((passId==='semantic-id' || passId==='roughness-material-id') && (!meta?.regionId || !Array.isArray(meta.idColor) || meta.idColor.length!==3 || !meta.idColor.every((n:number)=>Number.isInteger(n)&&n>=0&&n<=255))) throw new Error(`semantic pass requires explicit capture.regionId/idColor: ${source.name}`);
            const pbr=original instanceof PBRMaterial ? original : undefined;
            const standard=original instanceof StandardMaterial ? original : undefined;
            const roughness=pbr ? pbr.roughness ?? 1-pbr.microSurface : standard ? Math.sqrt(2/(standard.specularPower+2)) : 1;
            const packed=passId==='roughness-material-id' ? packMaterialId(roughness,meta.materialId) : [1,0,0];
            const roughBindings=pbr?resolveCaptureRoughness(pbr):[];
            const cutout=original?.needAlphaTestingForMesh(source) ?? false;
            const blended=original?.needAlphaBlendingForMesh(source) ?? false;
            const alphaTexture=(cutout||pbr?.useAlphaFromAlbedoTexture||standard?.useAlphaFromDiffuseTexture)?pbr?.albedoTexture??standard?.diffuseTexture:undefined;
            const opacityTexture=pbr?.opacityTexture??standard?.opacityTexture;
            const alpha=((cutout||blended)?original?.alpha??1:1)*source.visibility;
            const snapshot=new Mesh(`capture-${passId}-${source.name}-${groupIndex}-${instanceIndex}`,scene); snapshots.push(snapshot);
            const data=new VertexData(); data.positions=Array.from(positions); data.normals=Array.from(normals);
            data.indices=Array.from(source.getIndices() ?? []).slice(group.start,group.start+group.count);
            data.uvs=Array.from(source.getVerticesData(VertexBuffer.UVKind) ?? new Float32Array(positions.length/3*2));
            data.uvs2=Array.from(source.getVerticesData(VertexBuffer.UV2Kind) ?? data.uvs);
            data.colors=Array.from(source.getVerticesData(VertexBuffer.ColorKind)??new Float32Array(positions.length/3*4).fill(1));
            data.applyToMesh(snapshot); snapshot.freezeWorldMatrix(world.clone());
            const material=new ShaderMaterial(`capture-${passId}-${source.uniqueId}`,scene,{
              vertexSource:`precision highp float; attribute vec3 position; attribute vec3 normal; attribute vec2 uv; attribute vec2 uv2; attribute vec4 color;
                uniform mat4 world; uniform mat4 view; uniform mat4 normalMatrix; uniform mat4 worldViewProjection;
                ${roughBindings.map((_,i)=>`uniform mat4 roughMatrix${i};uniform float roughUV${i};varying vec2 vRoughUV${i};`).join('')}
                uniform mat4 roughMatrix; uniform mat4 alphaMatrix; uniform mat4 opacityMatrix; uniform float roughUV; uniform float alphaUV; uniform float opacityUV; uniform float vertexAlpha;
                varying vec3 vNormal; varying float vDepth; varying vec2 vRoughUV; varying vec2 vAlphaUV; varying vec2 vOpacityUV; varying float vAlpha;
                void main(){vNormal=normalize(mat3(normalMatrix)*normal);vDepth=abs((view*world*vec4(position,1.)).z);
                ${roughBindings.map((_,i)=>`vRoughUV${i}=(roughMatrix${i}*vec4(mix(uv,uv2,roughUV${i}),1.,0.)).xy;`).join('')}vAlphaUV=(alphaMatrix*vec4(mix(uv,uv2,alphaUV),1.,0.)).xy;
                vOpacityUV=(opacityMatrix*vec4(mix(uv,uv2,opacityUV),1.,0.)).xy;vAlpha=mix(1.,color.a,vertexAlpha);gl_Position=worldViewProjection*vec4(position,1.);}`,
              fragmentSource:`precision highp float; varying vec3 vNormal; varying float vDepth; varying vec2 vRoughUV; varying vec2 vAlphaUV; varying vec2 vOpacityUV; varying float vAlpha;
                uniform vec3 idColor; uniform vec3 packed; uniform float nearPlane; uniform float farPlane;
                ${roughBindings.map((_,i)=>`varying vec2 vRoughUV${i};uniform sampler2D roughSampler${i};`).join('')}
                uniform sampler2D roughSampler; uniform sampler2D alphaSampler; uniform sampler2D opacitySampler; uniform float alpha; uniform float cutoff;
                void main(){float coverage=alpha*vAlpha; ${alphaTexture?'coverage*=texture2D(alphaSampler,vAlphaUV).a;':''}
                ${opacityTexture?`coverage*= ${opacityTexture.getAlphaFromRGB?'dot(texture2D(opacitySampler,vOpacityUV).rgb,vec3(.3,.59,.11))':'texture2D(opacitySampler,vOpacityUV).a'};`:''}
                if(coverage<cutoff) discard; float roughness=packed.r;
                ${roughBindings.map((binding,i)=>binding.operation==='multiply-roughness'?`roughness*=texture2D(roughSampler${i},vRoughUV${i}).${binding.channel};`:`roughness=1.-(1.-roughness)*texture2D(roughSampler${i},vRoughUV${i}).${binding.channel};`).join('')}
                gl_FragColor=vec4(${passId==='normal'?'normalize(vNormal)*.5+.5':passId==='depth'?'vec3(clamp((vDepth-nearPlane)/(farPlane-nearPlane),0.,1.))':passId==='semantic-id'?'idColor':passId==='roughness-material-id'?'vec3(roughness,packed.gb)':'vec3(1.)'},${passId==='alpha-silhouette'?'coverage':'1.'});}`,
            },{attributes:['position','normal','uv','uv2','color'],needAlphaBlending:passId==='alpha-silhouette'&&(original?.needAlphaBlendingForMesh(source)??false),uniforms:[...roughBindings.flatMap((_,i)=>[`roughMatrix${i}`,`roughUV${i}`]),'world','view','worldViewProjection','normalMatrix','idColor','packed','nearPlane','farPlane','roughMatrix','alphaMatrix','roughUV','alphaUV','opacityMatrix','opacityUV','vertexAlpha','alpha','cutoff'],samplers:[...roughBindings.map((_,i)=>`roughSampler${i}`),'roughSampler','alphaSampler','opacitySampler']});
            materials.push(material); snapshot.material=material;
            material.backFaceCulling=original?.backFaceCulling??true;
            material.sideOrientation=source.overrideMaterialSideOrientation??original?.sideOrientation??Material.CounterClockWiseSideOrientation;
            material.setMatrix('normalMatrix',sourceViewNormalMatrix(world,scene.activeCamera!.getViewMatrix(),scene.useRightHandedSystem));
            material.setVector3('idColor',Vector3.FromArray(meta?.idColor??[255,255,255]).scale(1/255));
            material.setVector3('packed',Vector3.FromArray(packed));
            material.setFloat('nearPlane',scene.activeCamera!.minZ); material.setFloat('farPlane',scene.activeCamera!.maxZ);
            material.setFloat('vertexAlpha',source.useVertexColors&&source.hasVertexAlpha?1:0);
            material.setFloat('alpha',alpha); material.setFloat('cutoff',cutout ? pbr?.alphaCutOff??.4 : .001);
            roughBindings.forEach((b,i)=>{material.setMatrix(`roughMatrix${i}`,b.texture.getTextureMatrix());material.setFloat(`roughUV${i}`,b.texture.coordinatesIndex);material.setTexture(`roughSampler${i}`,b.texture);});
            material.setMatrix('alphaMatrix',alphaTexture?.getTextureMatrix()??Matrix.Identity());material.setFloat('alphaUV',alphaTexture?.coordinatesIndex??0);
            material.setMatrix('opacityMatrix',opacityTexture?.getTextureMatrix()??Matrix.Identity());material.setFloat('opacityUV',opacityTexture?.coordinatesIndex??0);if(opacityTexture)material.setTexture('opacitySampler',opacityTexture);
            if(alphaTexture) material.setTexture('alphaSampler',alphaTexture);
          }
        }
        }
        current=passId as PassId;
      } catch(error) { beauty(); throw error; }
    },
  };
}
