import {
  ArcRotateCamera,
  DirectionalLight,
  Engine,
  HavokPlugin,
  HemisphericLight,
  Scene,
  ShadowGenerator,
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
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, useExactSrgbConversions: true });
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera(
    "cam", Math.PI / 3, Math.PI / 3, 1.0, new Vector3(0, 0.1, 0), scene,
  );
  camera.wheelDeltaPercentage = 0.01;
  camera.minZ = 0.01;
  camera.attachControl(canvas, true);
  const light = new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);

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
    physics: params.has('physics') ? params.get("physics") !== "0" : undefined,
    physicsScale,
  });
  camera.radius *= model.physicsScale;
  camera.setTarget(camera.getTarget().scale(model.physicsScale));

  const { installHarness } = await import("./harness");
  const { installCapture } = await import("./capture");
  installCapture(scene, camera, model);
  installHarness(scene, model, name);
  if (model.root.metadata?.sculptSpec) {
    light.direction.set(-.4, .9, 1);
    light.intensity = .65;
    light.groundColor.set(.40, .43, .48);
    const key = new DirectionalLight('sculpt-key', new Vector3(.45, -1, -.85), scene);
    key.position.set(-3,6,4); key.intensity=.8;
    const shadows = new ShadowGenerator(2048,key);
    shadows.useBlurExponentialShadowMap=true; shadows.blurKernel=24;
    shadows.setDarkness(.65);
    Object.values(model.meshes).forEach(mesh=>shadows.addShadowCaster(mesh));
    const ground=scene.getMeshByName('ground'); if(ground) ground.receiveShadows=true;
    // Match the uniform lit floor so the horizon does not contaminate silhouette comparison.
    scene.clearColor.set(240/255,244/255,1,1);
    camera.setTarget(new Vector3(0, .9, 0).scale(model.physicsScale));
    camera.radius = 2.65 * model.physicsScale;
    camera.alpha = 1.22;
    camera.beta = 1.48;
  }
  const { installSculptInspector } = await import('./sculpt/inspector');
  installSculptInspector(model, camera);
  if (params.get('wire') === '1') window.__IMG2BABYLON_CAPTURE__?.togglePhysicsViewer(true);
  if (params.get('shot') === '1') document.querySelectorAll('.harness-bar, .actuator-panel, .sculpt-panel').forEach(el => (el as HTMLElement).style.display = 'none');

  engine.runRenderLoop(() => scene.render());
  if ([...params.keys()].some(key => key.startsWith('review'))) {
    try {
      await scene.whenReadyAsync();
      const { applyReviewRoute } = await import('./reviewRoute');
      await applyReviewRoute(params, window.__IMG2BABYLON_CAPTURE__!, scene);
    } catch (error) { banner(`檢視流程失敗：${String(error)}`); }
  }
  window.addEventListener("resize", () => engine.resize());
}

void boot();
