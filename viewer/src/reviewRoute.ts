import type { CaptureApi } from './capture';
import type { Scene } from '@babylonjs/core';

/** Reproducible desktop review URLs use the same API as the Python capture job. */
export async function applyReviewRoute(params: URLSearchParams, api: CaptureApi, scene: Scene): Promise<void> {
  const read = async (key: string) => {
    const url = params.get(key);
    if (!url) return undefined;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
    return response.json();
  };
  const profile = await read('reviewProfile');
  if (profile) await api.setRenderProfile(profile);
  if(params.get('reviewEnvironment')==='room') {
    const {createRoomEnvironment,createLookDevLights}=await import('./pipeline/scene');
    createLookDevLights(scene);
    await createRoomEnvironment(scene);
    scene.environmentIntensity=1;
    const ground=scene.getMeshByName('ground');if(ground)ground.receiveShadows=true;
  }
  const reference = params.get('reviewGLB');
  if (reference) await api.setReferenceMode({ kind: 'glb', url: reference });
  const camera = await read('reviewCamera');
  if (camera) api.setCamera(camera);
  if (params.has('reviewPass')) {
    api.beginCapture();
    await api.capturePass({ passId: params.get('reviewPass')!, mode: reference ? 'reference' : 'procedural' });
  }
  document.documentElement.dataset.reviewReady = 'true';
  const state = document.createElement('script'); state.id='review-state';state.type='application/json';
  const activeCamera = scene.activeCamera as any;
  state.textContent=JSON.stringify({handedness:scene.useRightHandedSystem?'right':'left',camera:{position:activeCamera.position.asArray(),target:activeCamera.target?.asArray(),up:activeCamera.upVector.asArray()},
    meshes:scene.meshes.filter(m=>m.isVisible).map(m=>({name:m.name,enabled:m.isEnabled(),vertices:m.getTotalVertices(),worldMatrix:Array.from(m.getWorldMatrix().asArray()),material:m.material?.name,side:m.material?.sideOrientation,override:(m as any).overrideMaterialSideOrientation})),
    renderer:{exactSrgb:scene.getEngine().useExactSrgbConversions,webGL:(scene.getEngine() as any).webGLVersion}});
  document.body.append(state);
  if(params.get('exportPNG')==='1') {
    const panel=document.createElement('aside');panel.className='review-export';
    panel.style.cssText='position:fixed;left:16px;bottom:16px;z-index:100;background:white;padding:10px;border-radius:8px';
    const button=document.createElement('button');button.textContent='產生檢查 PNG';
    const link=document.createElement('a');link.id='review-png';link.download=`${params.get('model')??'model'}-${params.get('reviewPass')??'beauty'}.png`;
    button.onclick=()=>{scene.render();link.href=scene.getEngine().getRenderingCanvas()!.toDataURL('image/png');link.textContent='下載原始 PNG';};
    panel.append(button,link);document.body.append(panel);
  }
}
