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
  let viewer: PhysicsViewer | null = null;
  window.__IMG2BABYLON_CAPTURE__ = {
    setCamera(spec: CameraSpec): void {
      camera.alpha = spec.alpha;
      camera.beta = spec.beta;
      camera.radius = spec.radius;
      if (spec.target) camera.setTarget(Vector3.FromArray(spec.target));
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
