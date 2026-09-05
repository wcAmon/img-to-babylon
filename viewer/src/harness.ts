import {
  ArcRotateCamera,
  Color3,
  Color4,
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
import {
  MotionTimelinePlayer,
  validateMotionTimeline,
} from "./motionTimeline";
import type { MotionTimeline } from "./motionTimeline";
import { MotionSuspension } from "./motionSuspension";
import { StandController } from "./standController";

export function installHarness(scene: Scene, model: BuiltModel, modelName: string): void {
  const scale = model.physicsScale;
  const massScale = scale ** 3;
  const impulseScale = scale ** 3.5;
  const ground = MeshBuilder.CreateGround("ground", { width: 10 * scale, height: 10 * scale }, scene);
  // 背景與受光地板同色：有限地板外的深色天際帶會被 Divine Eye 當成前景（M10 處理包、M11 立牌實測），
  // 截圖時主體 bbox 被拉成寬帶；同色後地平線不再入鏡。
  scene.clearColor = new Color4(0.79, 0.80, 0.84, 1);
  const gMat = new StandardMaterial("ground-mat", scene);
  gMat.diffuseColor = new Color3(0.82, 0.83, 0.86);
  gMat.specularColor = Color3.Black();
  ground.material = gMat;

  const physics = scene.getPhysicsEngine();
  if (physics) {
    const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
    const gShape = new PhysicsShapeBox(
      new Vector3(0, -0.05 * scale, 0), Quaternion.Identity(),
      new Vector3(10 * scale, 0.1 * scale, 10 * scale), scene,
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
        new Vector3(
          (Math.random() - 0.5) * mass * Math.sqrt(scale),
          mass * 3.2 * Math.sqrt(scale),
          (Math.random() - 0.5) * mass * Math.sqrt(scale),
        ),
        b.transformNode.absolutePosition,
      );
    });
  });

  btn("丟球", () => {
    const cam = scene.activeCamera as ArcRotateCamera;
    const dir = cam.getTarget().subtract(cam.position).normalize();
    const ball = MeshBuilder.CreateSphere(
      `ball-${performance.now()}`, { diameter: 0.06 * scale }, scene,
    );
    ball.position = cam.position.add(dir.scale(0.2 * scale));
    const mat = new StandardMaterial("ball-mat", scene);
    mat.diffuseColor = new Color3(0.85, 0.3, 0.25);
    ball.material = mat;
    const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, scene);
    const shape = new PhysicsShapeSphere(Vector3.Zero(), 0.03 * scale, scene);
    shape.material = { friction: 0.4, restitution: 0.6 };
    body.shape = shape;
    body.setMassProperties({ mass: 0.2 * massScale });
    body.applyImpulse(dir.scale(1.2 * impulseScale), ball.position);
  });

  btn("堆疊", () => {
    for (let i = 0; i < 3; i++) {
      const box = MeshBuilder.CreateBox(
        `stack-${performance.now()}-${i}`, { size: 0.1 * scale }, scene,
      );
      box.position = new Vector3(
        0.02 * i * scale, (0.8 + 0.15 * i) * scale, 0.02 * i * scale,
      );
      const body = new PhysicsBody(box, PhysicsMotionType.DYNAMIC, false, scene);
      const shape = new PhysicsShapeBox(
        Vector3.Zero(), Quaternion.Identity(),
        new Vector3(0.1 * scale, 0.1 * scale, 0.1 * scale), scene,
      );
      shape.material = { friction: 0.6, restitution: 0.3 };
      body.shape = shape;
      body.setMassProperties({ mass: 0.5 * massScale });
    }
  });

  let wireOn = false;
  btn("碰撞線框", () => {
    wireOn = !wireOn;
    window.__IMG2BABYLON_CAPTURE__?.togglePhysicsViewer(wireOn);
  });

  installActuatorPanel(scene, model, modelName);
}

/** M4 Actuator Playground：讀 model.actuators 自動生成側欄——滑桿即 set()，
 * 動作怪異可即時看出是哪個關節限位/軸向不對，回頭改 spec 重載。 */
function installActuatorPanel(scene: Scene, model: BuiltModel, modelName: string): void {
  const acts = model.actuators ?? [];
  if (!acts.length) return;
  const panel = document.createElement("div");
  panel.className = "actuator-panel";
  const h = document.createElement("h3");
  h.textContent = "可動物件";
  panel.appendChild(h);
  const sliders: { input: HTMLInputElement; val: HTMLSpanElement }[] = [];
  for (const act of acts) {
    if (act.kind === "rupture" || act.kind === "pour" || act.kind === "collect") {
      // M10：破裂是一次性觸發，按鈕而非滑桿（M11 pour、M12 collect 同樣）；sliders 仍推入假元素對齊索引（全部歸零會 set(0)，無動作）
      const b = document.createElement("button");
      b.className = "reset";
      b.textContent = act.label;
      b.onclick = () => act.set(1);
      panel.appendChild(b);
      sliders.push({ input: document.createElement("input"), val: document.createElement("span") });
      continue;
    }
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
  const servoActs = acts.filter((act) => act.kind === "servo");
  const servoById = new Map(servoActs.map((act) => [act.id, act]));
  const sliderById = new Map(acts.map((act, index) => [act.id, sliders[index]]));
  let timeline: MotionTimeline | null = null;
  let player: MotionTimelinePlayer | null = null;
  let loopPlayback = true;
  const suspension = new MotionSuspension(
    scene, model.root, model.bodies, 0.3 * model.physicsScale,
  );
  const stand = new StandController(model);
  // 監工除錯出口（0016）：playground 重現單腳站序列用；截圖 gate 不依賴它
  const debug = (window as unknown as Record<string, Record<string, unknown> | undefined>).__IMG2BABYLON_DEBUG__;
  if (debug) debug.stand = stand;

  const motionRow = document.createElement("div");
  motionRow.className = "actuator-row";
  const motionLabel = document.createElement("label");
  motionLabel.textContent = "載入動作";
  const motionInput = document.createElement("input");
  motionInput.type = "file";
  motionInput.accept = "application/json,.json";
  const motionStatus = document.createElement("span");
  motionStatus.className = "val";
  motionStatus.textContent = "未載入";
  motionRow.appendChild(motionLabel);
  motionRow.appendChild(motionInput);
  motionRow.appendChild(motionStatus);
  panel.appendChild(motionRow);

  const playbackButton = document.createElement("button");
  playbackButton.className = "reset";
  playbackButton.textContent = "播放";

  const zeroServos = (): void => {
    servoActs.forEach((act) => {
      act.set(0);
      const slider = sliderById.get(act.id);
      if (slider) {
        slider.input.value = "0";
        slider.val.textContent = "0.00";
      }
    });
  };
  const stopPlayback = (): void => {
    player?.stop();
    zeroServos();
    playbackButton.textContent = "播放";
  };
  const applyFrame = (frame: number): void => {
    if (!timeline) return;
    for (const [id, track] of Object.entries(timeline.tracks)) {
      const act = servoById.get(id);
      const value = track[frame];
      act?.set(value);
      const slider = sliderById.get(id);
      if (slider) {
        slider.input.value = String(value);
        slider.val.textContent = value.toFixed(2);
      }
    }
  };

  motionInput.onchange = async () => {
    stopPlayback();
    timeline = null;
    player = null;
    const file = motionInput.files?.[0];
    if (!file) {
      motionStatus.textContent = "未選檔";
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      timeline = validateMotionTimeline(parsed, modelName, new Set(servoById.keys()));
      player = new MotionTimelinePlayer(timeline);
      player.loop = loopPlayback;
      motionStatus.textContent = `${timeline.frames} 幀 @ ${timeline.fps}fps`;
    } catch (error) {
      motionStatus.textContent = `錯誤：${error instanceof Error ? error.message : String(error)}`;
    }
  };

  playbackButton.onclick = () => {
    if (player?.playing) {
      stopPlayback();
      return;
    }
    if (!player || !timeline) {
      motionStatus.textContent = "請先載入有效動作";
      return;
    }
    if (player.start(applyFrame)) playbackButton.textContent = "停止";
    else stopPlayback();
  };
  scene.onBeforeRenderObservable.add(() => {
    if (!player?.playing) return;
    const completed = player.tick(scene.getEngine().getDeltaTime() / 1000, applyFrame);
    if (completed) stopPlayback();
  });
  panel.appendChild(playbackButton);

  const loopRow = document.createElement("div");
  loopRow.className = "actuator-row";
  const loopLabel = document.createElement("label");
  loopLabel.textContent = "循環";
  const loopButton = document.createElement("button");
  loopButton.className = "reset";
  loopButton.textContent = "循環：開";
  loopButton.setAttribute("aria-pressed", "true");
  loopButton.onclick = () => {
    loopPlayback = !loopPlayback;
    if (player) player.loop = loopPlayback;
    loopButton.textContent = `循環：${loopPlayback ? "開" : "關"}`;
    loopButton.setAttribute("aria-pressed", String(loopPlayback));
  };
  loopRow.appendChild(loopLabel);
  loopRow.appendChild(loopButton);
  panel.appendChild(loopRow);

  const suspensionButton = document.createElement("button");
  suspensionButton.className = "reset";
  suspensionButton.textContent = "吊空：關";
  suspensionButton.setAttribute("aria-pressed", "false");
  suspensionButton.onclick = () => {
    stopPlayback();
    if (suspension.active) suspension.disable();
    else suspension.enable();
    suspensionButton.textContent = `吊空：${suspension.active ? "開" : "關"}`;
    suspensionButton.setAttribute("aria-pressed", String(suspension.active));
  };
  panel.appendChild(suspensionButton);

  const standButton = document.createElement("button");
  standButton.className = "reset";
  standButton.textContent = "站立：關";
  standButton.setAttribute("aria-pressed", "false");
  standButton.onclick = () => {
    stopPlayback();
    if (stand.active) stand.disable();
    else stand.enable();
    standButton.textContent = `站立：${stand.active ? "開" : "關"}`;
    standButton.setAttribute("aria-pressed", String(stand.active));
  };
  panel.appendChild(standButton);

  const reset = document.createElement("button");
  reset.className = "reset";
  reset.textContent = "全部歸零";
  reset.onclick = () => {
    stopPlayback();
    acts.forEach((a, i) => {
      a.set(0);
      sliders[i].input.value = "0";
      sliders[i].val.textContent = "0.00";
    });
  };
  panel.appendChild(reset);
  document.body.appendChild(panel);
  scene.onDisposeObservable.addOnce(() => {
    stopPlayback();
    stand.disable();
    suspension.dispose();
  });
}
