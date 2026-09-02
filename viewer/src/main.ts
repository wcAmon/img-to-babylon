import {
  ArcRotateCamera,
  Engine,
  HavokPlugin,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { registry } from "./registry";

function banner(msg: string): void {
  const div = document.createElement("div");
  div.className = "error-banner";
  div.textContent = msg;
  document.body.appendChild(div);
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("app") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera(
    "cam", Math.PI / 3, Math.PI / 3, 1.0, new Vector3(0, 0.1, 0), scene,
  );
  camera.wheelDeltaPercentage = 0.01;
  camera.minZ = 0.01;
  camera.attachControl(canvas, true);
  new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);

  try {
    const havok = await HavokPhysics();
    // useDeltaForWorldStep=false：固定 1/60 步長，與 headless gate（src/headless.ts）
    // 同一物理積分模式。0012 教訓：true 時用真實 frame dt 餵 Havok，抖動讓
    // 臨界系統（站立平衡）在 playground 與 gate 行為分歧（headless 108/108、
    // playground ~50%）。60fps 下牆鐘行為不變。
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(false, havok));
  } catch (err) {
    banner(`Havok 載入失敗：${String(err)}`);
    throw err;
  }

  const params = new URLSearchParams(location.hash.replace(/^#\/?/, ""));
  const name = params.get("model") ?? "sample-crate";
  const load = registry[name];
  if (!load) {
    banner(`未知模型：${name}（registry 無此項）`);
    return;
  }
  const scaleParam = params.get("scale");
  const requestedScale = scaleParam === null ? undefined : Number(scaleParam);
  const physicsScale = requestedScale !== undefined && Number.isFinite(requestedScale) && requestedScale > 0
    ? requestedScale : undefined;
  const factory = (await load()).default;
  const model = factory(scene, {
    physics: params.get("physics") !== "0",
    physicsScale,
  });
  camera.radius *= model.physicsScale;
  camera.setTarget(camera.getTarget().scale(model.physicsScale));

  const { installHarness } = await import("./harness");
  const { installCapture } = await import("./capture");
  installCapture(scene, camera, model);
  installHarness(scene, model, name);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

void boot();
