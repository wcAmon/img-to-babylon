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
          const supports = v2.supportBodyIds!.flatMap((id) => {
            const body = this.bodiesById[id];
            if (!body) return [];
            body.transformNode.computeWorldMatrix(true);
            return [body.transformNode.absolutePosition];
          });
          if (supports.length === 0) return;
          const support = supports.reduce((sum, p) => sum.addInPlace(p), Vector3.Zero())
            .scaleInPlace(1 / supports.length);
          const error = {
            x: com.x - (support.x + this.balanceTarget.x),
            z: com.z - (support.z + this.balanceTarget.z),
          };
          const dt = 1 / 60;
          const velocity = previousError
            ? { x: (error.x - previousError.x) / dt, z: (error.z - previousError.z) / dt }
            : { x: 0, z: 0 };
          previousError = error;
          const pitchU = this.axisOutput(v2.pitch!, error.z, velocity.z, up.z);
          const rollU = this.axisOutput(v2.roll!, error.x, velocity.x, up.x);
          const commands = new Map<string, number>();
          for (const [axis, errorValue, u] of [
            [v2.pitch!, error.z, pitchU], [v2.roll!, error.x, rollU],
          ] as const) {
            const servoMix = errorValue < 0 && axis.negativeErrorServos
              ? axis.negativeErrorServos
              : axis.servos;
            servoMix.forEach(({ id, sign }) => commands.set(id, (commands.get(id) ?? 0) + sign * u));
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

  private axisOutput(axis: StandBalanceAxis, error: number, velocity: number, lean: number): number {
    return axis.proportionalGain * error
      + axis.derivativeGain * velocity
      + (axis.leanGain ?? 0) * lean;
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
