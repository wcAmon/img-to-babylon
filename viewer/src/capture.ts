import {
  ArcRotateCamera,
  PhysicsViewer,
  Scene,
  Tools,
  Vector3,
} from "@babylonjs/core";
import type { BuiltModel } from "./types";

export interface CameraSpec {
  alpha: number;
  beta: number;
  radius: number;
  target?: [number, number, number];
}

export interface CaptureApi {
  setCamera(spec: CameraSpec): void;
  screenshot(): Promise<string>; // base64 data URL, 1280x720
  togglePhysicsViewer(on: boolean): void;
}

declare global {
  interface Window {
    __IMG2BABYLON_CAPTURE__?: CaptureApi;
    __IMG2BABYLON_READY__?: boolean;
  }
}

export function installCapture(
  scene: Scene, camera: ArcRotateCamera, model: BuiltModel,
): void {
  const scale = model.physicsScale;
  let viewer: PhysicsViewer | null = null;
  // 監工除錯出口：playground 活體診斷用（截圖 gate 不依賴它）
  (window as unknown as Record<string, unknown>).__IMG2BABYLON_DEBUG__ = { scene, model };
  window.__IMG2BABYLON_CAPTURE__ = {
    setCamera(spec: CameraSpec): void {
      camera.alpha = spec.alpha;
      camera.beta = spec.beta;
      camera.radius = spec.radius * scale;
      if (spec.target) camera.setTarget(Vector3.FromArray(spec.target).scale(scale));
    },
    async screenshot(): Promise<string> {
      return Tools.CreateScreenshotUsingRenderTargetAsync(
        scene.getEngine(), camera, { width: 1280, height: 720 },
      );
    },
    togglePhysicsViewer(on: boolean): void {
      if (on && !viewer) {
        viewer = new PhysicsViewer(scene);
        Object.values(model.bodies).forEach((b) => viewer?.showBody(b));
      } else if (!on && viewer) {
        viewer.dispose();
        viewer = null;
      }
    },
  };
  window.__IMG2BABYLON_READY__ = true;
}
