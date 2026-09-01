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
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
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
  const factory = (await load()).default;
  const model = factory(scene, { physics: params.get("physics") !== "0" });

  const { installHarness } = await import("./harness");
  const { installCapture } = await import("./capture");
  installCapture(scene, camera, model);
  installHarness(scene, model, name);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

void boot();
