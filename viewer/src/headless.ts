import { FreeCamera, HavokPlugin, NullEngine, Scene, Vector3 } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export interface HeadlessContext {
  scene: Scene;
  step: (frames: number) => void;
  dispose: () => void;
}

export async function createHeadlessScene(): Promise<HeadlessContext> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("cam", new Vector3(0, 1, -2), scene);

  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm");
  // readFileSync 回傳 Buffer（Uint8Array 子類），與 @types/emscripten 的
  // wasmBinary?: ArrayBuffer 型別不完全相容，故此處明確切出對應的 ArrayBuffer 區段。
  const wasmFile = readFileSync(wasmPath);
  const wasmBinary = wasmFile.buffer.slice(
    wasmFile.byteOffset, wasmFile.byteOffset + wasmFile.byteLength,
  ) as ArrayBuffer;
  const havok = await HavokPhysics({ wasmBinary });
  // useDeltaForWorldStep=false：固定 1/60 步長，決定性模擬
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(false, havok));

  return {
    scene,
    step: (frames: number): void => {
      for (let i = 0; i < frames; i++) scene.render();
    },
    dispose: (): void => {
      scene.dispose();
      engine.dispose();
    },
  };
}
