import type { Observer, PhysicsBody, Scene, TransformNode } from "@babylonjs/core";
import { Quaternion, Vector3 } from "@babylonjs/core";
import type { Actuator, BuiltModel, StandBalanceAxis } from "./types";

interface InitialTransform {
  position: Vector3;
  rotationQuaternion: Quaternion | null;
}

/** Opt-in muscle tone for servo-driven ragdolls. */
export class StandController {
  private readonly servos: Actuator[];
  private readonly scene: Scene;
  private readonly root: TransformNode;
  private readonly rootPosition: Vector3;
  private readonly bodies: PhysicsBody[];
  private readonly bodiesById: BuiltModel["bodies"];
  private readonly balance: BuiltModel["balance"];
  private readonly torso: PhysicsBody | undefined;
  private readonly balanceServos: Array<{ servo: Actuator; sign: number }>;
  private readonly controlledServoIds: Set<string>;
  private readonly servoById: Map<string, Actuator>;
  private readonly poseTargets = new Map<string, number>();
  private balanceTarget = { x: 0, z: 0 };
  private supportBodyIds: string[] = [];
  private defaultSupportPosition: { x: number; z: number } | null = null;
  private readonly leanGain: number;
  private readonly driftGain: number;
  private readonly useV2: boolean;
  private readonly initialTransforms = new Map<PhysicsBody, InitialTransform>();
  private syncObserver: Observer<Scene> | null = null;
  private balanceObserver: Observer<Scene> | null = null;
  private enabled = false;

  constructor(model: BuiltModel) {
    this.servos = (model.actuators ?? []).filter((actuator) => actuator.kind === "servo");
    this.scene = model.root.getScene();
    this.root = model.root;
    this.rootPosition = model.factoryPose?.rootPosition.clone() ?? model.root.position.clone();
    this.bodies = Object.values(model.bodies);
    this.bodiesById = model.bodies;
    this.balance = model.balance;
    this.supportBodyIds = [...(model.balance?.supportBodyIds ?? [])];
    this.torso = model.bodies.torso;
    this.servoById = new Map(this.servos.map((servo) => [servo.id, servo]));
    this.balanceServos = (model.balance?.pitchServos ?? []).flatMap(({ id, sign }) => {
      const servo = this.servoById.get(id);
      return servo ? [{ servo, sign }] : [];
    });
    const usesV2 = Boolean(
      model.balance?.supportBodyIds?.length && model.balance.pitch && model.balance.roll,
    );
    this.useV2 = usesV2;
    this.controlledServoIds = new Set(usesV2
      ? [
          ...(model.balance?.pitch?.servos ?? []).map(({ id }) => id),
          ...(model.balance?.pitch?.negativeErrorServos ?? []).map(({ id }) => id),
          ...(model.balance?.roll?.servos ?? []).map(({ id }) => id),
          ...(model.balance?.roll?.negativeErrorServos ?? []).map(({ id }) => id),
          ...(model.balance?.feedforward?.pitch?.servos ?? []).map(({ id }) => id),
          ...(model.balance?.feedforward?.roll?.servos ?? []).map(({ id }) => id),
        ]
      : this.balanceServos.map(({ servo }) => servo.id));
    this.leanGain = model.balance?.leanGain ?? 0;
    this.driftGain = model.balance?.driftGain ?? 0;
    Object.entries(model.bodies).forEach(([id, body]) => {
      const factoryTransform = model.factoryPose?.bodies[id];
      this.initialTransforms.set(body, {
        position: factoryTransform?.position.clone() ?? body.transformNode.position.clone(),
        rotationQuaternion: factoryTransform
          ? factoryTransform.rotationQuaternion?.clone() ?? null
          : body.transformNode.rotationQuaternion?.clone() ?? null,
      });
    });
  }

  get active(): boolean {
    return this.enabled;
  }

  enable(): void {
    this.poseTargets.clear();
    this.balanceTarget = { x: 0, z: 0 };
    this.supportBodyIds = [...(this.balance?.supportBodyIds ?? [])];
    this.defaultSupportPosition = null;
    this.cancelSync();
    this.cancelBalance();
    this.bodies.forEach((body) => { body.disablePreStep = false; });
    this.root.position.copyFrom(this.rootPosition);
    this.bodies.forEach((body) => {
      const initial = this.initialTransforms.get(body);
      if (!initial) return;
      body.transformNode.position.copyFrom(initial.position);
      if (initial.rotationQuaternion) {
        body.transformNode.rotationQuaternion ??= Quaternion.Identity();
        body.transformNode.rotationQuaternion.copyFrom(initial.rotationQuaternion);
      } else {
        body.transformNode.rotationQuaternion = null;
      }
      body.setLinearVelocity(Vector3.Zero());
      body.setAngularVelocity(Vector3.Zero());
    });
    let steps = 0;
    this.syncObserver = this.scene.onAfterPhysicsObservable.add(() => {
      steps++;
      if (steps < 2) return;
      this.bodies.forEach((body) => { body.disablePreStep = true; });
      this.cancelSync();
      this.servos.forEach((servo) => servo.set(0));
    });
    const v2 = this.useV2 ? this.balance : null;
    if (this.torso && (this.balanceServos.length > 0 || v2)) {
      let steps = 0;
      let previousError: { x: number; z: number } | null = null;
      let previousTarget = { x: this.balanceTarget.x, z: this.balanceTarget.z };
      const integral = { x: 0, z: 0 };
      this.balanceObserver = this.scene.onAfterPhysicsObservable.add(() => {
        steps++;
        if (steps <= 5) return;
        this.torso!.transformNode.computeWorldMatrix(true);
        const up = Vector3.TransformNormal(
          Vector3.Up(), this.torso!.transformNode.getWorldMatrix(),
        ).normalize();
        if (v2) {
          const com = Vector3.Zero();
          let totalMass = 0;
          this.bodies.forEach((body) => {
            const mass = body.getMassProperties().mass ?? 0;
            body.transformNode.computeWorldMatrix(true);
            com.addInPlace(body.transformNode.absolutePosition.scale(mass));
            totalMass += mass;
          });
          if (totalMass <= 0) return;
          com.scaleInPlace(1 / totalMass);
          const support = this.supportPosition(this.supportBodyIds);
          if (!support) return;
          this.defaultSupportPosition ??= { x: support.x, z: support.z };
          const error = {
            x: com.x - (support.x + this.balanceTarget.x),
            z: com.z - (support.z + this.balanceTarget.z),
          };
          const dt = 1 / 60;
          const velocity = previousError
            ? { x: (error.x - previousError.x) / dt, z: (error.z - previousError.z) / dt }
            : { x: 0, z: 0 };
          previousError = error;
          // 目標移動中（ramp）積分只會累積追蹤落後，反向時變過衝記憶 → 移動中漏、靜止時全力積分。
          const moving = {
            x: Math.abs(this.balanceTarget.x - previousTarget.x) > 1e-9,
            z: Math.abs(this.balanceTarget.z - previousTarget.z) > 1e-9,
          };
          previousTarget = { x: this.balanceTarget.x, z: this.balanceTarget.z };
          integral.x = this.nextIntegral(v2.roll!, integral.x, error.x, dt, moving.x);
          integral.z = this.nextIntegral(v2.pitch!, integral.z, error.z, dt, moving.z);
          const pitchU = this.axisOutput(v2.pitch!, error.z, velocity.z, integral.z, up.z);
          const rollU = this.axisOutput(v2.roll!, error.x, velocity.x, integral.x, up.x);
          const commands = new Map<string, number>();
          for (const [axis, errorValue, u] of [
            [v2.pitch!, error.z, pitchU], [v2.roll!, error.x, rollU],
          ] as const) {
            const servoMix = errorValue < 0 && axis.negativeErrorServos
              ? axis.negativeErrorServos
              : axis.servos;
            servoMix.forEach(({ id, sign }) => commands.set(id, (commands.get(id) ?? 0) + sign * u));
          }
          for (const [axis, target] of [
            [v2.feedforward?.pitch, this.balanceTarget.z + support.z - this.defaultSupportPosition.z],
            [v2.feedforward?.roll, this.balanceTarget.x + support.x - this.defaultSupportPosition.x],
          ] as const) {
            if (!axis || axis.gain === 0) continue;
            const output = Math.max(-axis.maxOutput, Math.min(axis.maxOutput, target / axis.gain));
            axis.servos.forEach(({ id, sign }) => {
              commands.set(id, (commands.get(id) ?? 0) + sign * output);
            });
          }
          commands.forEach((offset, id) => {
            const servo = this.servoById.get(id);
            if (!servo) return;
            const base = this.poseTargets.get(id) ?? 0;
            servo.set(Math.max(servo.min, Math.min(servo.max, base + offset)));
          });
          return;
        }
        const lean = up.z;
        const drift = this.torso!.transformNode.absolutePosition.z;
        const u = this.leanGain * lean + this.driftGain * drift;
        this.balanceServos.forEach(({ servo, sign }) => {
          const base = this.poseTargets.get(servo.id) ?? 0;
          servo.set(Math.max(servo.min, Math.min(servo.max, base + sign * u)));
        });
      });
    }
    this.enabled = true;
  }

  disable(): void {
    this.poseTargets.clear();
    this.balanceTarget = { x: 0, z: 0 };
    this.cancelBalance();
    this.cancelSync();
    this.bodies.forEach((body) => { body.disablePreStep = true; });
    this.servos.forEach((servo) => servo.release?.());
    this.enabled = false;
  }

  setPoseTarget(id: string, value: number): void {
    const servo = this.servoById.get(id);
    if (!servo) return;
    if (this.enabled && this.controlledServoIds.has(id)) {
      this.poseTargets.set(id, value);
      return;
    }
    servo.set(value);
  }

  setBalanceTarget(target: { x: number; z: number }): void {
    if (!this.useV2) return;
    this.balanceTarget = { x: target.x, z: target.z };
  }

  /** Change the v2 support reference without changing the current world-space target.
   * Translating the local target by oldSupport-newSupport keeps PID error (and therefore
   * derivative/integral state) continuous. Feedforward is evaluated relative to the
   * default support center, so its command is continuous across the same translation. */
  setSupportBodies(ids: string[]): void {
    if (!this.useV2) return;
    const nextIds = ids.filter((id) => Boolean(this.bodiesById[id]));
    if (nextIds.length === 0) return;
    const previousSupport = this.supportPosition(this.supportBodyIds);
    const nextSupport = this.supportPosition(nextIds);
    if (!previousSupport || !nextSupport) return;
    this.balanceTarget = {
      x: this.balanceTarget.x + previousSupport.x - nextSupport.x,
      z: this.balanceTarget.z + previousSupport.z - nextSupport.z,
    };
    this.supportBodyIds = [...nextIds];
  }

  private axisOutput(
    axis: StandBalanceAxis, error: number, velocity: number, integral: number, lean: number,
  ): number {
    return axis.proportionalGain * error
      + axis.derivativeGain * velocity
      + (axis.integralGain ?? 0) * integral
      + (axis.leanGain ?? 0) * lean;
  }

  private supportPosition(ids: string[]): Vector3 | null {
    const supports = ids.flatMap((id) => {
      const body = this.bodiesById[id];
      if (!body) return [];
      body.transformNode.computeWorldMatrix(true);
      return [body.transformNode.absolutePosition];
    });
    if (supports.length === 0) return null;
    return supports.reduce((sum, position) => sum.addInPlace(position), Vector3.Zero())
      .scaleInPlace(1 / supports.length);
  }

  /** 限幅積分；目標移動中改為漏積分（時間常數 integralLeakSeconds）：ramp 期間累積的
   *  追蹤落後在反向時會變過衝記憶（0015 r3 末格 −0.015 → −0.028），誤差過零硬歸零則
   *  指令跳變而倒，全程漏又消不掉 hold 殘差——故只在目標移動時衰減。 */
  private nextIntegral(axis: StandBalanceAxis, value: number, error: number, dt: number, targetMoving: boolean): number {
    const gain = axis.integralGain ?? 0;
    const maxOutput = axis.integralMaxOutput ?? 0;
    if (gain === 0 || maxOutput <= 0) return 0;
    const limit = maxOutput / Math.abs(gain);
    const tau = axis.integralLeakSeconds ?? 0;
    const leak = targetMoving && tau > 0 ? value / tau : 0;
    return Math.max(-limit, Math.min(limit, value + (error - leak) * dt));
  }

  private cancelSync(): void {
    if (!this.syncObserver) return;
    this.scene.onAfterPhysicsObservable.remove(this.syncObserver);
    this.syncObserver = null;
  }

  private cancelBalance(): void {
    if (!this.balanceObserver) return;
    this.scene.onAfterPhysicsObservable.remove(this.balanceObserver);
    this.balanceObserver = null;
  }
}
