import {
  ArcRotateCamera,
  Color3,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import type { BuiltModel } from "./types";

export function installHarness(scene: Scene, model: BuiltModel): void {
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
  const gMat = new StandardMaterial("ground-mat", scene);
  gMat.diffuseColor = new Color3(0.82, 0.83, 0.86);
  gMat.specularColor = Color3.Black();
  ground.material = gMat;

  const physics = scene.getPhysicsEngine();
  if (physics) {
    const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
    const gShape = new PhysicsShapeBox(
      new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), scene,
    );
    gShape.material = { friction: 0.7, restitution: 0.2 };
    gBody.shape = gShape;
  }

  const bar = document.createElement("div");
  bar.className = "harness-bar";
  document.body.appendChild(bar);
  const btn = (label: string, fn: () => void): void => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = fn;
    bar.appendChild(b);
  };

  btn("拋起", () => {
    Object.values(model.bodies).forEach((b) => {
      const mass = b.getMassProperties().mass ?? 1;
      b.applyImpulse(
        new Vector3((Math.random() - 0.5) * mass, mass * 3.2, (Math.random() - 0.5) * mass),
        b.transformNode.absolutePosition,
      );
    });
  });

  btn("丟球", () => {
    const cam = scene.activeCamera as ArcRotateCamera;
    const dir = cam.getTarget().subtract(cam.position).normalize();
    const ball = MeshBuilder.CreateSphere(`ball-${performance.now()}`, { diameter: 0.06 }, scene);
    ball.position = cam.position.add(dir.scale(0.2));
    const mat = new StandardMaterial("ball-mat", scene);
    mat.diffuseColor = new Color3(0.85, 0.3, 0.25);
    ball.material = mat;
    const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, scene);
    const shape = new PhysicsShapeSphere(Vector3.Zero(), 0.03, scene);
    shape.material = { friction: 0.4, restitution: 0.6 };
    body.shape = shape;
    body.setMassProperties({ mass: 0.2 });
    body.applyImpulse(dir.scale(1.2), ball.position);
  });

  btn("堆疊", () => {
    for (let i = 0; i < 3; i++) {
      const box = MeshBuilder.CreateBox(`stack-${performance.now()}-${i}`, { size: 0.1 }, scene);
      box.position = new Vector3(0.02 * i, 0.8 + 0.15 * i, 0.02 * i);
      const body = new PhysicsBody(box, PhysicsMotionType.DYNAMIC, false, scene);
      const shape = new PhysicsShapeBox(
        Vector3.Zero(), Quaternion.Identity(), new Vector3(0.1, 0.1, 0.1), scene,
      );
      shape.material = { friction: 0.6, restitution: 0.3 };
      body.shape = shape;
      body.setMassProperties({ mass: 0.5 });
    }
  });

  let wireOn = false;
  btn("碰撞線框", () => {
    wireOn = !wireOn;
    window.__IMG2BABYLON_CAPTURE__?.togglePhysicsViewer(wireOn);
  });

  installActuatorPanel(model);
}

/** M4 Actuator Playground：讀 model.actuators 自動生成側欄——滑桿即 set()，
 * 動作怪異可即時看出是哪個關節限位/軸向不對，回頭改 spec 重載。 */
function installActuatorPanel(model: BuiltModel): void {
  const acts = model.actuators ?? [];
  if (!acts.length) return;
  const panel = document.createElement("div");
  panel.className = "actuator-panel";
  const h = document.createElement("h3");
  h.textContent = "可動物件";
  panel.appendChild(h);
  const sliders: { input: HTMLInputElement; val: HTMLSpanElement }[] = [];
  for (const act of acts) {
    const row = document.createElement("div");
    row.className = "actuator-row";
    const label = document.createElement("label");
    label.textContent = act.label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(act.min);
    input.max = String(act.max);
    input.step = String((act.max - act.min) / 100 || 1);
    input.value = "0";
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = "0.00";
    input.oninput = () => {
      const v = Number(input.value);
      act.set(v);
      val.textContent = v.toFixed(2);
    };
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(val);
    panel.appendChild(row);
    sliders.push({ input, val });
  }
  const reset = document.createElement("button");
  reset.className = "reset";
  reset.textContent = "全部歸零";
  reset.onclick = () => {
    acts.forEach((a, i) => {
      a.set(0);
      sliders[i].input.value = "0";
      sliders[i].val.textContent = "0.00";
    });
  };
  panel.appendChild(reset);
  document.body.appendChild(panel);
}
