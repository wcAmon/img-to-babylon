import { ArcRotateCamera, PhysicsViewer, Scene, Tools } from '@babylonjs/core';
import type { BuiltModel } from './types';
import { convertSolverCamera,isSolverCamera } from './capture-solver';
import { applyCaptureCamera, type CameraSpec } from './capture-camera';
import { createReferenceController, type ReferenceSpec } from './capture-reference';
import { createProfileController, applyRegionPalette, type RenderProfile } from './capture-profile';
import { createPassController, CAPTURE_PASSES } from './capture-passes';
export type { CameraSpec } from './capture-camera';

export interface CaptureApi {
  setCamera(spec: CameraSpec | Record<string,unknown>): void;
  setSolverCamera(spec: unknown): void;
  screenshot(): Promise<string>;
  togglePhysicsViewer(on: boolean): void;
  capturePass(spec: { passId: string; mode?: string }): Promise<{ ok: true; selector: string; passId: string }>;
  setReferenceMode(spec: ReferenceSpec): Promise<void>;
  setRenderProfile(profile: RenderProfile): Promise<void>;
  restoreRenderProfile(): void;
  beginCapture(): void;
  endCapture(): void;
  capabilities: { passes: readonly string[]; referenceGLB: boolean; renderProfile: boolean };
}
declare global {
  interface Window {
    __IMG2BABYLON_CAPTURE__?: CaptureApi;
    __IMG2BABYLON_READY__?: boolean;
  }
}
export function installCapture(scene: Scene, camera: ArcRotateCamera, model: BuiltModel): void {
  window.__IMG2BABYLON_READY__ = false;
  let viewer: PhysicsViewer | null = null;
  let resume: (() => void) | undefined;
  const reference = createReferenceController(scene, () => Object.values(model.meshes), model.physicsScale);
  const profiles = createProfileController(scene, camera, model.physicsScale);
  let undoPalette: (()=>void)|undefined;
  const passes = createPassController(scene, reference.meshes);
  let busy = false;
  async function transition(action:()=>Promise<void>) {
    if(busy) throw new Error('capture transition already in progress');
    busy=true;window.__IMG2BABYLON_READY__=false;passes.setPass('beauty');undoPalette?.();undoPalette=undefined;
    try {await action();}
    finally {busy=false;if(!scene.isDisposed&&window.__IMG2BABYLON_CAPTURE__===api)window.__IMG2BABYLON_READY__=true;}
  }
  (window as unknown as Record<string, unknown>).__IMG2BABYLON_DEBUG__ = { scene, model };
  const api: CaptureApi = {
    beginCapture() {
      if (resume) return;
      const physics = scene.physicsEnabled, animations = scene.animationsEnabled;
      scene.physicsEnabled = false; scene.animationsEnabled = false;
      resume = () => { scene.physicsEnabled = physics; scene.animationsEnabled = animations; };
    },
    endCapture() { passes.setPass('beauty'); undoPalette?.();undoPalette=undefined;resume?.(); resume = undefined; },
    capabilities: { passes: CAPTURE_PASSES, referenceGLB: true, renderProfile: true },
    setCamera(spec) { if(busy)throw new Error('capture transition in progress');passes.setPass('beauty');applyCaptureCamera(camera,isSolverCamera(spec)?convertSolverCamera(spec):spec as CameraSpec,model.physicsScale); },
    setSolverCamera(spec) { api.setCamera(convertSolverCamera(spec)); },
    async screenshot() {
      if(busy||!window.__IMG2BABYLON_READY__)throw new Error('capture transition in progress or scene not ready');
      return Tools.CreateScreenshotUsingRenderTargetAsync(scene.getEngine(), camera, { width: 1280, height: 720 });
    },
    togglePhysicsViewer(on) {
      if (on && !viewer) {
        viewer = new PhysicsViewer(scene);
        Object.values(model.bodies).forEach(b => viewer?.showBody(b));
      } else if (!on && viewer) { viewer.dispose(); viewer = null; }
    },
    async capturePass({ passId, mode = 'procedural' }) {
      if(busy)throw new Error('capture transition in progress');
      if(mode!==reference.mode)throw new Error(`capture mode mismatch: requested ${mode}, active ${reference.mode}`);
      if (!window.__IMG2BABYLON_READY__) throw new Error('Babylon scene is not ready');
      if (viewer) throw new Error('disable physics viewer before evidence capture');
      scene.activeCamera = camera;
      passes.setPass('beauty');
      undoPalette?.();undoPalette=undefined;
      if(profiles.profile && ['semantic-id','roughness-material-id'].includes(passId))undoPalette=applyRegionPalette(reference.meshes(),profiles.profile);
      passes.setPass(passId);
      try { await scene.whenReadyAsync(); scene.render(); }
      catch (error) { passes.setPass('beauty'); throw error; }
      return { ok: true, selector: 'canvas', passId };
    },
    async setReferenceMode(spec) { await transition(async()=>{profiles.releaseMaterials();try{await reference.switch(spec);}finally{profiles.bindMaterials(reference.meshes());}}); },
    async setRenderProfile(profile) { await transition(async()=>{await profiles.apply(profile);profiles.bindMaterials(reference.meshes());}); },
    restoreRenderProfile() { if(busy)throw new Error('capture transition in progress');passes.setPass('beauty');undoPalette?.();undoPalette=undefined;profiles.restore(); },
  };
  window.__IMG2BABYLON_CAPTURE__ = api;
  scene.executeWhenReady(() => {
    if (window.__IMG2BABYLON_CAPTURE__ === api && !busy) window.__IMG2BABYLON_READY__ = true;
  });
  scene.onDisposeObservable.addOnce(() => {
    passes.dispose();undoPalette?.();reference.dispose();profiles.dispose();resume?.();viewer?.dispose();
    if (window.__IMG2BABYLON_CAPTURE__ === api) { window.__IMG2BABYLON_READY__ = false; delete window.__IMG2BABYLON_CAPTURE__; }
  });
}
