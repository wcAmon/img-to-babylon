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
}
